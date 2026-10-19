import { createHash } from "node:crypto";

import {
  SourceFinancePostingRepository,
  type FinanceAccountRow,
  type FinanceEventRow,
  type FinanceJournalLineRow,
  type FinanceJournalRow,
  type FinancePeriodRow,
  type FinancePostingRepository,
  type PersistedFinanceLine,
} from "./source-repository.js";
import {
  FinancePostingError,
  assertFinanceTransactionClient,
  type FinanceJsonValue,
  type FinancePostCommand,
  type FinancePostingLine,
  type FinancePostingResult,
  type FinanceReverseCommand,
  type FinanceReversalResult,
  type FinanceTransactionClient,
} from "./types.js";

const amountScale = 8;
const rateScale = 18;
const maximumJournalLines = 1_000;
const maximumEventAuditBytes = 1_048_576;
const maximumScaledAmount = 10n ** 38n - 1n;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const currencyPattern = /^[A-Z]{3}$/;

interface ParsedDecimal {
  scaled: bigint;
  fractionalDigits: number;
  canonical: string;
}

interface NormalizedLine extends PersistedFinanceLine {
  amountFractionalDigits: number;
  description: string;
  sourceMetadata: Readonly<Record<string, FinanceJsonValue>>;
}

type ResolvedPayload = Readonly<Record<string, FinanceJsonValue>> & {
  base_currency: string;
  exchange_rate_id: string | null;
  exchange_rate: string;
  period_id: string;
  posting_date: string;
  transaction_currency: string;
};

function financeError(
  status: number,
  code: ConstructorParameters<typeof FinancePostingError>[1],
  message: string,
): FinancePostingError {
  return new FinancePostingError(status, code, message);
}

function mappedFinanceError(error: unknown): FinancePostingError {
  if (error instanceof FinancePostingError) return error;
  return new FinancePostingError(
    500,
    "FINANCE_PERSISTENCE_INVARIANT",
    "The Finance posting could not be completed safely.",
    { cause: error },
  );
}

function power10(value: number): bigint {
  return 10n ** BigInt(value);
}

function formatScaled(value: bigint, scale: number): string {
  const digits = value.toString().padStart(scale + 1, "0");
  if (scale === 0) return digits;
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export function parseFinanceDecimal(
  value: string,
  options: { fractionalDigits: number; integerDigits: number; allowZero: boolean },
): ParsedDecimal {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) throw financeError(400, "FINANCE_AMOUNT_INVALID", "A Finance amount is invalid.");
  const integer = match[1]!;
  const fraction = match[2] ?? "";
  if (integer.length > options.integerDigits || fraction.length > options.fractionalDigits)
    throw financeError(400, "FINANCE_NUMERIC_OUT_OF_RANGE", "A Finance amount exceeds the supported precision.");
  const scaled = BigInt(integer) * power10(options.fractionalDigits) + BigInt(fraction.padEnd(options.fractionalDigits, "0"));
  if (!options.allowZero && scaled === 0n)
    throw financeError(400, "FINANCE_AMOUNT_INVALID", "A Finance amount must be greater than zero.");
  return { scaled, fractionalDigits: fraction.length, canonical: formatScaled(scaled, options.fractionalDigits) };
}

export function convertFinanceAmountToBase(amount: bigint, rate: bigint, baseDecimalPlaces: number): bigint {
  const divisor = power10(amountScale + rateScale - baseDecimalPlaces);
  const roundedMinorUnits = (amount * rate + divisor / 2n) / divisor;
  const scaled = roundedMinorUnits * power10(amountScale - baseDecimalPlaces);
  if (scaled > maximumScaledAmount)
    throw financeError(400, "FINANCE_NUMERIC_OUT_OF_RANGE", "A converted Finance amount exceeds the supported precision.");
  return scaled;
}

function canonicalValue(value: FinanceJsonValue): FinanceJsonValue {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value))
    throw financeError(400, "FINANCE_COMMAND_INVALID", "Finance metadata contains an invalid number.");
  return value;
}

export function hashFinanceValue(value: FinanceJsonValue): string {
  return createHash("sha256").update(JSON.stringify(canonicalValue(value)), "utf8").digest("hex");
}

function requireIdentity(value: string, label: string, maximum = 128): void {
  if (!value || value.length > maximum || !identityPattern.test(value))
    throw financeError(400, "FINANCE_COMMAND_INVALID", `${label} is invalid.`);
}

function requireDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw financeError(400, "FINANCE_COMMAND_INVALID", "The Finance posting date is invalid.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw financeError(400, "FINANCE_COMMAND_INVALID", "The Finance posting date is invalid.");
}

function normalizeDimensions(value: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw financeError(400, "FINANCE_COMMAND_INVALID", "Finance dimensions must be an object.");
  const entries = Object.entries(value);
  if (entries.length > 25)
    throw financeError(400, "FINANCE_COMMAND_INVALID", "Too many Finance dimensions were supplied.");
  for (const [key, child] of entries) {
    if (!key.trim() || key.length > 64 || !child.trim() || child.length > 128)
      throw financeError(400, "FINANCE_COMMAND_INVALID", "A Finance dimension is invalid.");
  }
  const normalized = Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 4_096)
    throw financeError(400, "FINANCE_COMMAND_INVALID", "Finance dimensions exceed the safe size limit.");
  return normalized;
}

function normalizeMetadata(
  value: Readonly<Record<string, FinanceJsonValue>> | undefined,
): Readonly<Record<string, FinanceJsonValue>> {
  const normalized = canonicalValue(value ?? {}) as Readonly<Record<string, FinanceJsonValue>>;
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 4_096)
    throw financeError(400, "FINANCE_COMMAND_INVALID", "Finance source metadata exceeds the safe size limit.");
  return normalized;
}

function normalizeLine(line: FinancePostingLine): NormalizedLine {
  requireIdentity(line.accountId, "Finance account ID");
  const debit = parseFinanceDecimal(line.debit, { fractionalDigits: amountScale, integerDigits: 30, allowZero: true });
  const credit = parseFinanceDecimal(line.credit, { fractionalDigits: amountScale, integerDigits: 30, allowZero: true });
  if ((debit.scaled > 0n) === (credit.scaled > 0n))
    throw financeError(400, "FINANCE_AMOUNT_INVALID", "Each journal line must contain exactly one positive side.");
  const description = line.description.trim();
  if (!description || description.length > 500)
    throw financeError(400, "FINANCE_COMMAND_INVALID", "A Finance line description is invalid.");
  return {
    accountId: line.accountId,
    debit: debit.canonical,
    credit: credit.canonical,
    currency: "",
    fxRate: null,
    baseDebit: "0.00000000",
    baseCredit: "0.00000000",
    dimensions: normalizeDimensions(line.dimensions),
    amountFractionalDigits: Math.max(debit.fractionalDigits, credit.fractionalDigits),
    description,
    sourceMetadata: normalizeMetadata(line.sourceMetadata),
  };
}

function requestHash(
  command: FinancePostCommand | FinanceReverseCommand,
  operation: "post" | "reverse",
  lines: readonly NormalizedLine[] | null,
): string {
  const value: FinanceJsonValue = {
    version: 1,
    operation,
    tenant_id: command.tenantId,
    company_id: command.companyId,
    actor_id: command.actorId,
    source_type: command.sourceType,
    source_id: command.sourceId,
    event_type: command.eventType,
    transaction_currency: command.transactionCurrency,
    payload: canonicalValue(command.payloadHashMaterial),
    ...(lines
      ? {
          posting_date: (command as FinancePostCommand).postingDate,
          exchange_rate_id: (command as FinancePostCommand).exchangeRateId,
          exchange_rate_value: (command as FinancePostCommand).exchangeRateValue,
          lines: lines.map((line) => ({
            account_id: line.accountId,
            debit: line.debit,
            credit: line.credit,
            dimensions: line.dimensions,
            description: line.description,
            source_metadata: line.sourceMetadata,
          })),
        }
      : {
          original_event_type: (command as FinanceReverseCommand).originalEventType,
          original_accounting_event_id: (command as FinanceReverseCommand).originalAccountingEventId,
          original_journal_id: (command as FinanceReverseCommand).originalJournalId,
        }),
  };
  return hashFinanceValue(value);
}

function internalKey(command: FinancePostCommand | FinanceReverseCommand, operation: "post" | "reverse"): string {
  return `fin:${createHash("sha256")
    .update(`${command.sourceType}\n${command.sourceId}\n${operation}\n${command.externalIdempotencyKey}`, "utf8")
    .digest("hex")}`;
}

function validateCommand(command: FinancePostCommand | FinanceReverseCommand): void {
  requireIdentity(command.tenantId, "Finance tenant ID");
  requireIdentity(command.companyId, "Finance company ID");
  requireIdentity(command.actorId, "Finance actor ID");
  requireIdentity(command.sourceType, "Finance source type");
  requireIdentity(command.sourceId, "Finance source ID");
  requireIdentity(command.eventType, "Finance event type");
  requireIdentity(command.externalIdempotencyKey, "Finance idempotency key", 255);
  if (command.auditRef !== undefined) requireIdentity(command.auditRef, "Finance audit reference");
  if (!currencyPattern.test(command.transactionCurrency))
    throw financeError(400, "FINANCE_CURRENCY_INVALID", "The Finance transaction currency is invalid.");
  normalizeMetadata(command.payloadHashMaterial);
}

function resolvePeriod(periods: readonly FinancePeriodRow[]): FinancePeriodRow {
  if (periods.length === 0)
    throw financeError(409, "FINANCE_PERIOD_UNAVAILABLE", "No Finance period covers the posting date.");
  if (periods.length !== 1)
    throw financeError(500, "FINANCE_AUTHORITY_INVALID", "Finance period authority is ambiguous.");
  const period = periods[0]!;
  if (period.status !== "open")
    throw financeError(409, "FINANCE_PERIOD_CLOSED_POST_BLOCKED", "The Finance period is not open for posting.");
  return period;
}

function validateAccounts(lines: readonly NormalizedLine[], accounts: readonly FinanceAccountRow[]): void {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  for (const line of lines) {
    const account = byId.get(line.accountId);
    if (!account)
      throw financeError(400, "FINANCE_ACCOUNT_INVALID", "A journal account is unavailable for this company.");
    if (account.status !== "active")
      throw financeError(400, "FINANCE_ACCOUNT_INACTIVE_POST_BLOCKED", "An inactive account cannot receive a posting.");
    if (account.is_header || !account.manual_posting_allowed)
      throw financeError(400, "FINANCE_ACCOUNT_NOT_POSTABLE", "A journal account is not postable.");
    if (!Array.isArray(account.required_dimensions) || !account.required_dimensions.every((item) => typeof item === "string"))
      throw financeError(500, "FINANCE_AUTHORITY_INVALID", "Finance account dimension authority is invalid.");
    for (const dimension of account.required_dimensions as string[]) {
      if (!line.dimensions[dimension]?.trim())
        throw financeError(400, "FINANCE_DIMENSION_REQUIRED", "A required accounting dimension is missing.");
    }
  }
}

function sum(lines: readonly PersistedFinanceLine[], field: "debit" | "credit" | "baseDebit" | "baseCredit"): bigint {
  return lines.reduce(
    (total, line) =>
      total + parseFinanceDecimal(line[field], { fractionalDigits: amountScale, integerDigits: 30, allowZero: true }).scaled,
    0n,
  );
}

function validateBalance(lines: readonly PersistedFinanceLine[]): void {
  const debit = sum(lines, "debit");
  const credit = sum(lines, "credit");
  const baseDebit = sum(lines, "baseDebit");
  const baseCredit = sum(lines, "baseCredit");
  if ([debit, credit, baseDebit, baseCredit].some((value) => value > maximumScaledAmount))
    throw financeError(400, "FINANCE_NUMERIC_OUT_OF_RANGE", "Finance journal totals exceed the supported precision.");
  if (debit === 0n || debit !== credit || baseDebit === 0n || baseDebit !== baseCredit)
    throw financeError(400, "FINANCE_JOURNAL_UNBALANCED", "The Finance journal is not balanced.");
}

function payloadResolved(event: FinanceEventRow): ResolvedPayload {
  if (!event.payload || Array.isArray(event.payload) || typeof event.payload !== "object")
    throw financeError(500, "FINANCE_PERSISTENCE_INVARIANT", "Stored Finance posting evidence is invalid.");
  const resolved = (event.payload as { resolved?: unknown }).resolved;
  if (!resolved || Array.isArray(resolved) || typeof resolved !== "object")
    throw financeError(500, "FINANCE_PERSISTENCE_INVARIANT", "Stored Finance resolution evidence is invalid.");
  const value = resolved as Partial<ResolvedPayload>;
  if (
    typeof value.base_currency !== "string" ||
    typeof value.exchange_rate !== "string" ||
    typeof value.period_id !== "string" ||
    typeof value.posting_date !== "string" ||
    typeof value.transaction_currency !== "string" ||
    (value.exchange_rate_id !== null && typeof value.exchange_rate_id !== "string")
  )
    throw financeError(500, "FINANCE_PERSISTENCE_INVARIANT", "Stored Finance resolution evidence is incomplete.");
  return value as ResolvedPayload;
}

function payloadOperation(event: FinanceEventRow): string | null {
  if (!event.payload || Array.isArray(event.payload) || typeof event.payload !== "object") return null;
  const operation = (event.payload as { operation?: unknown }).operation;
  return typeof operation === "string" ? operation : null;
}

function journalPostingDate(value: string): string {
  return value.slice(0, 10);
}

function validateOriginalLineEvidence(
  resolved: ResolvedPayload,
  journal: FinanceJournalRow,
  lines: readonly FinanceJournalLineRow[],
): void {
  requireDate(resolved.posting_date);
  if (journalPostingDate(journal.posting_date) !== resolved.posting_date)
    throw financeError(409, "FINANCE_ORIGINAL_POSTING_INVALID", "Original Finance posting-date evidence is inconsistent.");
  const expectedRate = parseFinanceDecimal(resolved.exchange_rate, {
    fractionalDigits: rateScale,
    integerDigits: 20,
    allowZero: false,
  });
  const isBaseCurrency = resolved.transaction_currency === resolved.base_currency;
  if (
    (isBaseCurrency && (resolved.exchange_rate_id !== null || expectedRate.scaled !== power10(rateScale))) ||
    (!isBaseCurrency && resolved.exchange_rate_id === null)
  )
    throw financeError(409, "FINANCE_ORIGINAL_POSTING_INVALID", "Original Finance exchange-rate evidence is inconsistent.");
  for (const line of lines) {
    if (line.currency !== resolved.transaction_currency)
      throw financeError(409, "FINANCE_ORIGINAL_POSTING_INVALID", "Original journal currency evidence is inconsistent.");
    if (isBaseCurrency) {
      if (line.fx_rate !== null)
        throw financeError(409, "FINANCE_ORIGINAL_POSTING_INVALID", "Original base-currency journal contains FX evidence.");
    } else {
      if (
        line.fx_rate === null ||
        parseFinanceDecimal(line.fx_rate, {
          fractionalDigits: rateScale,
          integerDigits: 20,
          allowZero: false,
        }).scaled !== expectedRate.scaled
      )
        throw financeError(409, "FINANCE_ORIGINAL_POSTING_INVALID", "Original journal FX evidence is inconsistent.");
    }
  }
}

function replayResult(
  event: FinanceEventRow,
  journal: FinanceJournalRow | null,
  command: FinancePostCommand | FinanceReverseCommand,
  hash: string,
  key: string,
): FinancePostingResult {
  if (
    event.source_type !== command.sourceType ||
    event.source_id !== command.sourceId ||
    event.event_type !== command.eventType ||
    event.idempotency_key !== key ||
    event.payload_hash !== hash
  )
    throw financeError(409, "FINANCE_IDEMPOTENCY_CONFLICT", "The Finance idempotency key was used for another request.");
  if (
    event.state !== "posted" ||
    !journal ||
    !["posted", "reversed"].includes(journal.status) ||
    !journal.period_id ||
    !journal.entry_number
  )
    throw financeError(409, "FINANCE_POSTING_IN_PROGRESS", "The Finance posting is not complete.");
  const resolved = payloadResolved(event);
  return {
    accountingEventId: event.id,
    journalId: journal.id,
    entryNumber: journal.entry_number,
    periodId: journal.period_id,
    baseCurrency: resolved.base_currency,
    transactionCurrency: resolved.transaction_currency,
    exchangeRateId: resolved.exchange_rate_id,
    exchangeRate: resolved.exchange_rate,
    replayed: true,
  };
}

export class FinancePostingService {
  constructor(private readonly repository: FinancePostingRepository = new SourceFinancePostingRepository()) {}

  async post(client: FinanceTransactionClient, command: FinancePostCommand): Promise<FinancePostingResult> {
    try {
      await assertFinanceTransactionClient(client);
      return await this.executePost(client, command);
    } catch (error) {
      throw mappedFinanceError(error);
    }
  }

  private async executePost(client: FinanceTransactionClient, command: FinancePostCommand): Promise<FinancePostingResult> {
    validateCommand(command);
    requireDate(command.postingDate);
    if (command.exchangeRateId !== null) requireIdentity(command.exchangeRateId, "Finance exchange rate ID");
    if (command.lines.length < 2 || command.lines.length > maximumJournalLines)
      throw financeError(400, "FINANCE_COMMAND_INVALID", "A Finance journal requires a bounded set of at least two lines.");
    const normalized = command.lines.map(normalizeLine);
    const auditLines: FinanceJsonValue = normalized.map((line, index) => ({
      line_number: index + 1,
      account_id: line.accountId,
      description: line.description,
      source_metadata: line.sourceMetadata,
    }));
    if (Buffer.byteLength(JSON.stringify(auditLines), "utf8") > maximumEventAuditBytes)
      throw financeError(400, "FINANCE_COMMAND_INVALID", "Finance line audit evidence exceeds the safe size limit.");
    const hash = requestHash(command, "post", normalized);
    const key = internalKey(command, "post");
    if (!(await this.repository.assertTenantContext(client, command.tenantId)))
      throw financeError(500, "FINANCE_AUTHORITY_INVALID", "Finance tenant context is unavailable.");
    await this.repository.lockSource(client, command.tenantId, command.sourceType, command.sourceId);
    const replay = await this.repository.findEventByKey(client, command.tenantId, key);
    if (replay)
      return replayResult(replay, await this.repository.findJournalByEvent(client, command.tenantId, replay.id), command, hash, key);
    if (
      await this.repository.findSourceEvent(
        client,
        command.tenantId,
        command.sourceType,
        command.sourceId,
        "post",
      )
    )
      throw financeError(409, "FINANCE_SOURCE_ALREADY_POSTED", "This Finance source has already been posted.");

    const bases = await this.repository.loadBaseCurrencies(client, command.tenantId);
    if (bases.length !== 1)
      throw financeError(500, "FINANCE_AUTHORITY_INVALID", "Exactly one active base currency is required.");
    const base = bases[0]!;
    const transaction = await this.repository.loadTransactionCurrency(
      client,
      command.tenantId,
      command.transactionCurrency,
    );
    if (!transaction)
      throw financeError(400, "FINANCE_CURRENCY_INVALID", "The transaction currency is unavailable.");
    for (const line of normalized) {
      if (line.amountFractionalDigits > transaction.decimal_places)
        throw financeError(400, "FINANCE_CURRENCY_SCALE_INVALID", "A journal amount exceeds the currency scale.");
    }
    if (transaction.code !== base.code)
      await this.repository.lockRateAuthority(client, command.tenantId, transaction.code, base.code);
    const suppliedRate = parseFinanceDecimal(command.exchangeRateValue, {
      fractionalDigits: rateScale,
      integerDigits: 20,
      allowZero: false,
    });
    const rate = transaction.code === base.code
      ? { id: null, rate: "1.000000000000000000" }
      : await this.repository.loadDirectRate(
          client,
          command.tenantId,
          transaction.code,
          base.code,
          command.postingDate,
        );
    if (!rate)
      throw financeError(400, "FINANCE_EXCHANGE_RATE_MISSING", "A direct exchange rate is unavailable for the posting date.");
    const parsedRate = parseFinanceDecimal(rate.rate, { fractionalDigits: rateScale, integerDigits: 20, allowZero: false });
    if (rate.id !== command.exchangeRateId || parsedRate.scaled !== suppliedRate.scaled)
      throw financeError(
        409,
        "FINANCE_EXCHANGE_RATE_CHANGED",
        "The stored exchange-rate snapshot no longer matches Finance authority.",
      );
    const period = resolvePeriod(
      await this.repository.loadPeriods(client, command.tenantId, command.companyId, command.postingDate),
    );
    const accountIds = [...new Set(normalized.map((line) => line.accountId))];
    validateAccounts(
      normalized,
      await this.repository.loadAccounts(client, command.tenantId, command.companyId, accountIds),
    );
    const persisted = normalized.map<PersistedFinanceLine>((line) => {
      const debit = parseFinanceDecimal(line.debit, { fractionalDigits: amountScale, integerDigits: 30, allowZero: true }).scaled;
      const credit = parseFinanceDecimal(line.credit, { fractionalDigits: amountScale, integerDigits: 30, allowZero: true }).scaled;
      return {
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        currency: transaction.code,
        fxRate: transaction.code === base.code ? null : parsedRate.canonical,
        baseDebit: formatScaled(convertFinanceAmountToBase(debit, parsedRate.scaled, base.decimal_places), amountScale),
        baseCredit: formatScaled(convertFinanceAmountToBase(credit, parsedRate.scaled, base.decimal_places), amountScale),
        dimensions: line.dimensions,
      };
    });
    validateBalance(persisted);
    const resolved: ResolvedPayload = {
      base_currency: base.code,
      exchange_rate_id: rate.id,
      exchange_rate: parsedRate.canonical,
      period_id: period.id,
      posting_date: command.postingDate,
      transaction_currency: transaction.code,
    };
    const eventId = await this.repository.insertEvent(client, {
      tenantId: command.tenantId,
      sourceType: command.sourceType,
      sourceId: command.sourceId,
      eventType: command.eventType,
      payload: { version: 1, operation: "post", request_hash: hash, resolved, audit_lines: auditLines },
      payloadHash: hash,
      idempotencyKey: key,
      compensatesEventId: null,
      auditRef: command.auditRef ?? null,
    });
    await this.repository.transitionEvent(client, command.tenantId, eventId, "received", "validated");
    const entryNumber = await this.repository.allocateEntryNumber(client, command.tenantId, command.companyId, period);
    const journalId = await this.repository.insertDraftJournal(client, {
      tenantId: command.tenantId,
      companyId: command.companyId,
      actorId: command.actorId,
      postingDate: command.postingDate,
      eventId,
      reversesJournalId: null,
    });
    await this.repository.insertJournalLines(client, command.tenantId, journalId, persisted);
    await this.repository.postJournal(client, command.tenantId, journalId, period.id, entryNumber);
    await this.repository.transitionEvent(client, command.tenantId, eventId, "validated", "posted");
    return {
      accountingEventId: eventId,
      journalId,
      entryNumber,
      periodId: period.id,
      baseCurrency: base.code,
      transactionCurrency: transaction.code,
      exchangeRateId: rate.id,
      exchangeRate: parsedRate.canonical,
      replayed: false,
    };
  }

  async reverse(client: FinanceTransactionClient, command: FinanceReverseCommand): Promise<FinanceReversalResult> {
    try {
      await assertFinanceTransactionClient(client);
      return await this.executeReverse(client, command);
    } catch (error) {
      throw mappedFinanceError(error);
    }
  }

  private async executeReverse(
    client: FinanceTransactionClient,
    command: FinanceReverseCommand,
  ): Promise<FinanceReversalResult> {
    validateCommand(command);
    requireIdentity(command.originalEventType, "Original accounting event type");
    requireIdentity(command.originalAccountingEventId, "Original accounting event ID");
    requireIdentity(command.originalJournalId, "Original journal ID");
    const hash = requestHash(command, "reverse", null);
    const key = internalKey(command, "reverse");
    if (!(await this.repository.assertTenantContext(client, command.tenantId)))
      throw financeError(500, "FINANCE_AUTHORITY_INVALID", "Finance tenant context is unavailable.");
    await this.repository.lockSource(client, command.tenantId, command.sourceType, command.sourceId);
    const replay = await this.repository.findEventByKey(client, command.tenantId, key);
    if (replay) {
      const result = replayResult(
        replay,
        await this.repository.findJournalByEvent(client, command.tenantId, replay.id),
        command,
        hash,
        key,
      );
      if (replay.compensates_event_id !== command.originalAccountingEventId)
        throw financeError(409, "FINANCE_IDEMPOTENCY_CONFLICT", "The Finance reversal key was used for another posting.");
      return { ...result, originalAccountingEventId: command.originalAccountingEventId, originalJournalId: command.originalJournalId };
    }
    if (
      await this.repository.findSourceEvent(
        client,
        command.tenantId,
        command.sourceType,
        command.sourceId,
        "reverse",
      )
    )
      throw financeError(409, "FINANCE_REVERSAL_ALREADY_EXISTS", "This Finance source already has a reversal.");
    const original = await this.repository.loadOriginalPosting(
      client,
      command.tenantId,
      command.originalAccountingEventId,
      command.originalJournalId,
    );
    if (
      !original ||
      original.event.source_type !== command.sourceType ||
      original.event.source_id !== command.sourceId ||
      original.event.event_type !== command.originalEventType ||
      payloadOperation(original.event) !== "post" ||
      original.event.state !== "posted" ||
      original.event.compensates_event_id !== null ||
      original.journal.company_id !== command.companyId ||
      original.journal.source_type !== "accounting_event" ||
      original.journal.source_id !== original.event.id ||
      original.journal.reverses_journal_id !== null ||
      original.lines.length === 0
    )
      throw financeError(409, "FINANCE_ORIGINAL_POSTING_INVALID", "The original Finance posting is unavailable for reversal.");
    if (original.journal.status === "reversed" || original.journal.reversed_by_journal_id !== null)
      throw financeError(409, "FINANCE_REVERSAL_ALREADY_EXISTS", "The original Finance journal is already reversed.");
    if (original.journal.status !== "posted")
      throw financeError(409, "FINANCE_ORIGINAL_POSTING_INVALID", "Only a posted Finance journal can be reversed.");
    const originalResolved = payloadResolved(original.event);
    if (originalResolved.transaction_currency !== command.transactionCurrency)
      throw financeError(409, "FINANCE_ORIGINAL_POSTING_INVALID", "The reversal currency does not match the original posting.");
    validateOriginalLineEvidence(originalResolved, original.journal, original.lines);
    const reversalDate = await this.repository.loadCurrentDate(client);
    requireDate(reversalDate);
    const period = resolvePeriod(
      await this.repository.loadPeriods(client, command.tenantId, command.companyId, reversalDate),
    );
    const reversedLines = original.lines.map<PersistedFinanceLine>((line) => ({
      accountId: line.account_id,
      debit: line.credit,
      credit: line.debit,
      currency: line.currency,
      fxRate: line.fx_rate,
      baseDebit: line.base_credit,
      baseCredit: line.base_debit,
      dimensions: normalizeDimensions(line.dimensions as Readonly<Record<string, string>>),
    }));
    validateBalance(reversedLines);
    const resolved: ResolvedPayload = { ...originalResolved, period_id: period.id, posting_date: reversalDate };
    const eventId = await this.repository.insertEvent(client, {
      tenantId: command.tenantId,
      sourceType: command.sourceType,
      sourceId: command.sourceId,
      eventType: command.eventType,
      payload: {
        version: 1,
        operation: "reverse",
        request_hash: hash,
        original_accounting_event_id: command.originalAccountingEventId,
        original_journal_id: command.originalJournalId,
        resolved,
      },
      payloadHash: hash,
      idempotencyKey: key,
      compensatesEventId: command.originalAccountingEventId,
      auditRef: command.auditRef ?? null,
    });
    await this.repository.transitionEvent(client, command.tenantId, eventId, "received", "validated");
    const entryNumber = await this.repository.allocateEntryNumber(client, command.tenantId, command.companyId, period);
    const journalId = await this.repository.insertDraftJournal(client, {
      tenantId: command.tenantId,
      companyId: command.companyId,
      actorId: command.actorId,
      postingDate: reversalDate,
      eventId,
      reversesJournalId: command.originalJournalId,
    });
    await this.repository.insertJournalLines(client, command.tenantId, journalId, reversedLines);
    await this.repository.postJournal(client, command.tenantId, journalId, period.id, entryNumber);
    await this.repository.markOriginalReversed(client, command.tenantId, command.originalJournalId, journalId);
    await this.repository.transitionEvent(client, command.tenantId, eventId, "validated", "posted");
    return {
      accountingEventId: eventId,
      journalId,
      entryNumber,
      periodId: period.id,
      baseCurrency: resolved.base_currency,
      transactionCurrency: resolved.transaction_currency,
      exchangeRateId: resolved.exchange_rate_id,
      exchangeRate: resolved.exchange_rate,
      replayed: false,
      originalAccountingEventId: command.originalAccountingEventId,
      originalJournalId: command.originalJournalId,
    };
  }
}
