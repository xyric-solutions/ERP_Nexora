import { createHash } from "node:crypto";

export type ReconciliationStatementLine = {
  id: string;
  transactionDate: string;
  direction: "money_in" | "money_out";
  amount: string;
  currency: string;
  reference: string | null;
  details: string | null;
};

export type ReconciliationLedgerCandidate = {
  journalLineId: string;
  journalId: string;
  postingDate: string;
  direction: "money_in" | "money_out";
  amount: string;
  currency: string;
  reference: string | null;
  narrative: string | null;
  matched?: boolean;
  selected?: boolean;
};

export type ManualReconciliationBalances = ReconciliationBalances & {
  available_ledger_money_in: string;
  available_ledger_money_out: string;
  selected_ledger_money_in: string;
  selected_ledger_money_out: string;
  calculated_selected_balance: string;
};

export type ReconciliationMatchProposal = {
  statementLineId: string;
  journalLineId: string;
  matchType: "exact" | "suggested";
  state: "confirmed" | "proposed";
  confidenceScore: number;
  reasonCodes: string[];
};

export type ReconciliationBalances = {
  currency: string;
  opening_statement_balance: string;
  statement_money_in: string;
  statement_money_out: string;
  reconstructed_statement_balance: string;
  closing_statement_balance: string;
  ledger_balance_at_cutoff: string;
  unmatched_ledger_money_in: string;
  unmatched_ledger_money_out: string;
  adjusted_ledger_balance: string;
  difference: string;
  matched_count: number;
  unmatched_statement_count: number;
  unmatched_ledger_count: number;
  adjustment_count: number;
  available_ledger_money_in?: string;
  available_ledger_money_out?: string;
  selected_ledger_money_in?: string;
  selected_ledger_money_out?: string;
  calculated_selected_balance?: string;
};

const SCALE = 8;
const SCALE_FACTOR = 100_000_000n;
const SUGGESTION_THRESHOLD = 0.7;
const MAX_SUGGESTIONS_PER_STATEMENT = 3;
const MAX_SUGGESTIONS = 1_000;

export function normalizeMatchReference(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function buildReconciliationMatches(
  statementLines: readonly ReconciliationStatementLine[],
  ledgerCandidates: readonly ReconciliationLedgerCandidate[],
): { confirmed: ReconciliationMatchProposal[]; suggestions: ReconciliationMatchProposal[] } {
  const statements = [...statementLines].sort((left, right) => left.id.localeCompare(right.id));
  const ledgers = [...ledgerCandidates]
    .filter((candidate) => !candidate.matched)
    .sort((left, right) => left.journalLineId.localeCompare(right.journalLineId));
  const exactByStatement = new Map<string, ReconciliationLedgerCandidate[]>();
  const exactByLedger = new Map<string, ReconciliationStatementLine[]>();

  for (const statement of statements) {
    const exact = ledgers.filter((ledger) => isExact(statement, ledger));
    exactByStatement.set(statement.id, exact);
    for (const ledger of exact) {
      const current = exactByLedger.get(ledger.journalLineId) ?? [];
      current.push(statement);
      exactByLedger.set(ledger.journalLineId, current);
    }
  }

  const confirmed: ReconciliationMatchProposal[] = [];
  const confirmedStatements = new Set<string>();
  const confirmedLedgers = new Set<string>();
  for (const statement of statements) {
    const exact = exactByStatement.get(statement.id) ?? [];
    if (exact.length !== 1) continue;
    const candidate = exact[0]!;
    if ((exactByLedger.get(candidate.journalLineId) ?? []).length !== 1) continue;
    confirmed.push({
      statementLineId: statement.id,
      journalLineId: candidate.journalLineId,
      matchType: "exact",
      state: "confirmed",
      confidenceScore: 1,
      reasonCodes: ["AMOUNT_DIRECTION_EXACT", "REFERENCE_EXACT", "DATE_WITHIN_3_DAYS"],
    });
    confirmedStatements.add(statement.id);
    confirmedLedgers.add(candidate.journalLineId);
  }

  const suggestions: ReconciliationMatchProposal[] = [];
  for (const statement of statements) {
    if (confirmedStatements.has(statement.id) || suggestions.length >= MAX_SUGGESTIONS) continue;
    const scored = ledgers
      .filter((candidate) => !confirmedLedgers.has(candidate.journalLineId))
      .map((candidate) => ({ candidate, score: scoreCandidate(statement, candidate) }))
      .filter((entry) => entry.score.score >= SUGGESTION_THRESHOLD)
      .sort(
        (left, right) =>
          right.score.score - left.score.score ||
          left.candidate.journalLineId.localeCompare(right.candidate.journalLineId),
      )
      .slice(0, MAX_SUGGESTIONS_PER_STATEMENT);
    for (const entry of scored) {
      if (suggestions.length >= MAX_SUGGESTIONS) break;
      suggestions.push({
        statementLineId: statement.id,
        journalLineId: entry.candidate.journalLineId,
        matchType: "suggested",
        state: "proposed",
        confidenceScore: Number(entry.score.score.toFixed(4)),
        reasonCodes: entry.score.reasons,
      });
    }
  }
  return { confirmed, suggestions };
}

export function calculateReconciliationBalances(input: {
  currency: string;
  currencyDecimals: number;
  openingStatementBalance: string;
  closingStatementBalance: string;
  ledgerBalanceAtCutoff: string;
  statementLines: readonly ReconciliationStatementLine[];
  ledgerCandidates: readonly ReconciliationLedgerCandidate[];
  confirmedStatementLineIds: ReadonlySet<string>;
  adjustmentCount: number;
}): ReconciliationBalances {
  const opening = parseDecimal(input.openingStatementBalance);
  const closing = parseDecimal(input.closingStatementBalance);
  const ledgerBalance = parseDecimal(input.ledgerBalanceAtCutoff);
  const moneyIn = sum(input.statementLines.filter((line) => line.direction === "money_in").map((line) => line.amount));
  const moneyOut = sum(
    input.statementLines.filter((line) => line.direction === "money_out").map((line) => line.amount),
  );
  const unmatchedLedger = input.ledgerCandidates.filter((candidate) => !candidate.matched);
  const unmatchedLedgerMoneyIn = sum(
    unmatchedLedger.filter((line) => line.direction === "money_in").map((line) => line.amount),
  );
  const unmatchedLedgerMoneyOut = sum(
    unmatchedLedger.filter((line) => line.direction === "money_out").map((line) => line.amount),
  );
  const reconstructed = opening + moneyIn - moneyOut;
  const adjustedLedger = ledgerBalance - unmatchedLedgerMoneyIn + unmatchedLedgerMoneyOut;
  const difference = roundToCurrency(closing - adjustedLedger, input.currencyDecimals);
  return {
    currency: input.currency,
    opening_statement_balance: formatDecimal(opening),
    statement_money_in: formatDecimal(moneyIn),
    statement_money_out: formatDecimal(moneyOut),
    reconstructed_statement_balance: formatDecimal(reconstructed),
    closing_statement_balance: formatDecimal(closing),
    ledger_balance_at_cutoff: formatDecimal(ledgerBalance),
    unmatched_ledger_money_in: formatDecimal(unmatchedLedgerMoneyIn),
    unmatched_ledger_money_out: formatDecimal(unmatchedLedgerMoneyOut),
    adjusted_ledger_balance: formatDecimal(adjustedLedger),
    difference: formatDecimal(difference),
    matched_count: input.confirmedStatementLineIds.size,
    unmatched_statement_count: input.statementLines.filter((line) => !input.confirmedStatementLineIds.has(line.id))
      .length,
    unmatched_ledger_count: unmatchedLedger.length,
    adjustment_count: input.adjustmentCount,
  };
}

export function calculateManualReconciliationBalances(input: {
  currency: string;
  currencyDecimals: number;
  openingStatementBalance: string;
  closingStatementBalance: string;
  ledgerBalanceAtCutoff: string;
  ledgerCandidates: readonly ReconciliationLedgerCandidate[];
}): ManualReconciliationBalances {
  const opening = parseDecimal(input.openingStatementBalance);
  const closing = parseDecimal(input.closingStatementBalance);
  const ledgerBalance = parseDecimal(input.ledgerBalanceAtCutoff);
  const availableMoneyIn = sum(
    input.ledgerCandidates.filter((line) => line.direction === "money_in").map((line) => line.amount),
  );
  const availableMoneyOut = sum(
    input.ledgerCandidates.filter((line) => line.direction === "money_out").map((line) => line.amount),
  );
  const selected = input.ledgerCandidates.filter((line) => line.selected);
  const selectedMoneyIn = sum(selected.filter((line) => line.direction === "money_in").map((line) => line.amount));
  const selectedMoneyOut = sum(selected.filter((line) => line.direction === "money_out").map((line) => line.amount));
  const calculated = opening + selectedMoneyIn - selectedMoneyOut;
  const difference = roundToCurrency(closing - calculated, input.currencyDecimals);
  return {
    currency: input.currency,
    opening_statement_balance: formatDecimal(opening),
    statement_money_in: formatDecimal(selectedMoneyIn),
    statement_money_out: formatDecimal(selectedMoneyOut),
    reconstructed_statement_balance: formatDecimal(calculated),
    closing_statement_balance: formatDecimal(closing),
    ledger_balance_at_cutoff: formatDecimal(ledgerBalance),
    unmatched_ledger_money_in: formatDecimal(availableMoneyIn - selectedMoneyIn),
    unmatched_ledger_money_out: formatDecimal(availableMoneyOut - selectedMoneyOut),
    adjusted_ledger_balance: formatDecimal(calculated),
    difference: formatDecimal(difference),
    matched_count: selected.length,
    unmatched_statement_count: 0,
    unmatched_ledger_count: input.ledgerCandidates.length - selected.length,
    adjustment_count: 0,
    available_ledger_money_in: formatDecimal(availableMoneyIn),
    available_ledger_money_out: formatDecimal(availableMoneyOut),
    selected_ledger_money_in: formatDecimal(selectedMoneyIn),
    selected_ledger_money_out: formatDecimal(selectedMoneyOut),
    calculated_selected_balance: formatDecimal(calculated),
  };
}

export function ledgerPopulationHash(candidates: readonly ReconciliationLedgerCandidate[]): string {
  const canonical = [...candidates]
    .map((candidate) => ({
      journal_line_id: candidate.journalLineId,
      journal_id: candidate.journalId,
      posting_date: candidate.postingDate,
      direction: candidate.direction,
      amount: formatDecimal(parseDecimal(candidate.amount)),
      currency: candidate.currency,
      reference: candidate.reference,
      narrative: candidate.narrative,
    }))
    .sort((left, right) => left.journal_line_id.localeCompare(right.journal_line_id));
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

function isExact(statement: ReconciliationStatementLine, ledger: ReconciliationLedgerCandidate): boolean {
  const statementReference = normalizeMatchReference(statement.reference);
  return (
    statement.currency === ledger.currency &&
    statement.direction === ledger.direction &&
    parseDecimal(statement.amount) === parseDecimal(ledger.amount) &&
    statementReference.length > 0 &&
    statementReference === normalizeMatchReference(ledger.reference) &&
    dateDistance(statement.transactionDate, ledger.postingDate) <= 3
  );
}

function scoreCandidate(
  statement: ReconciliationStatementLine,
  ledger: ReconciliationLedgerCandidate,
): { score: number; reasons: string[] } {
  if (
    statement.currency !== ledger.currency ||
    statement.direction !== ledger.direction ||
    parseDecimal(statement.amount) !== parseDecimal(ledger.amount)
  ) {
    return { score: 0, reasons: [] };
  }
  let score = 0.55;
  const reasons = ["AMOUNT_DIRECTION_EXACT"];
  const distance = dateDistance(statement.transactionDate, ledger.postingDate);
  if (distance <= 3) {
    score += 0.2;
    reasons.push("DATE_WITHIN_3_DAYS");
  } else if (distance <= 7) {
    score += 0.12;
    reasons.push("DATE_WITHIN_7_DAYS");
  } else if (distance <= 30) {
    score += 0.05;
    reasons.push("DATE_WITHIN_30_DAYS");
  } else {
    return { score: 0, reasons: [] };
  }
  const statementReference = normalizeMatchReference(statement.reference);
  if (statementReference && statementReference === normalizeMatchReference(ledger.reference)) {
    score += 0.25;
    reasons.push("REFERENCE_EXACT");
  } else if (
    hasTokenOverlap(
      `${statement.reference ?? ""} ${statement.details ?? ""}`,
      `${ledger.reference ?? ""} ${ledger.narrative ?? ""}`,
    )
  ) {
    score += 0.1;
    reasons.push("TEXT_TOKEN_OVERLAP");
  }
  return { score: Math.min(1, score), reasons };
}

function hasTokenOverlap(left: string, right: string): boolean {
  const tokens = (value: string) =>
    new Set(
      value
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .split(/[^\p{L}\p{N}]+/gu)
        .filter((token) => token.length >= 3),
    );
  const leftTokens = tokens(left);
  return [...tokens(right)].some((token) => leftTokens.has(token));
}

function dateDistance(left: string, right: string): number {
  const leftTime = Date.parse(`${left}T00:00:00.000Z`);
  const rightTime = Date.parse(`${right}T00:00:00.000Z`);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.POSITIVE_INFINITY;
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

function parseDecimal(value: string): bigint {
  const match = /^(-?)(0|[1-9]\d{0,29})(?:\.(\d{1,8}))?$/u.exec(value);
  if (!match) throw new Error("Reconciliation decimal is invalid.");
  const sign = match[1] === "-" ? -1n : 1n;
  return sign * (BigInt(match[2]!) * SCALE_FACTOR + BigInt((match[3] ?? "").padEnd(SCALE, "0")));
}

function sum(values: readonly string[]): bigint {
  return values.reduce((total, value) => total + parseDecimal(value), 0n);
}

function roundToCurrency(value: bigint, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > SCALE) {
    throw new Error("Reconciliation currency precision is invalid.");
  }
  const unit = 10n ** BigInt(SCALE - decimals);
  const absolute = value < 0n ? -value : value;
  const rounded = ((absolute + unit / 2n) / unit) * unit;
  return value < 0n ? -rounded : rounded;
}

function formatDecimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString().padStart(SCALE + 1, "0");
  return `${sign}${digits.slice(0, -SCALE)}.${digits.slice(-SCALE)}`;
}
