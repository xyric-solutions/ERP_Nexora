"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BankReconciliationAdjustment,
  BankReconciliationDetail,
  BankReconciliationSetup,
  BankStatementImportDetail,
  BankStatementImportOptions,
  BankStatementImportSummary,
  BankingCompanyDirectory,
  BankingLedgerAccountDirectory,
} from "@nexora/contracts";
import type { ReconciliationRecord } from "../model/banking-reconciliation-data";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { BankingApiClient } from "../api/banking-client";
import { bankReconciliationStateLabel } from "./banking-reconciliation-register";

export interface BankingReconciliationWorkspaceProps {
  reconciliationId?: string;
  initialBankAccountId?: string;
  initialStatementImportId?: string;
  onBack: () => void;
  onOpen: (reconciliationId: string) => void;
  onImportStatement: () => void;
  /** Temporary compatibility props while the legacy fixture branch remains available for non-persisted demo IDs. */
  records?: readonly unknown[];
  onAction?: (action: string, subject?: string) => void;
  onCreate?: (record: ReconciliationRecord, submitted: boolean) => void;
}

type BusyAction =
  "create" | "manual-selection" | "match" | "decision" | "unmatch" | "adjustment" | "submit" | "approve";

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`;
  }
  return "The Bank Reconciliation request could not be completed. Check the API connection and try again.";
}

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatAmount(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

function isZeroAmount(amount: string) {
  return /^-?0(?:\.0+)?$/u.test(amount);
}

function dateBounds(statement: BankStatementImportDetail) {
  const dates = statement.lines
    .map((line) => line.transaction_date)
    .filter((value): value is string => Boolean(value))
    .sort();
  const fallback = today();
  return { start: dates[0] ?? fallback, end: dates.at(-1) ?? fallback };
}

const adjustmentLabels: Record<BankReconciliationAdjustment["kind"], string> = {
  bank_charge: "Bank charge",
  interest_earned: "Interest earned",
  unidentified_credit: "Unidentified credit",
  unidentified_debit: "Unidentified debit",
  other: "Other",
};

export function BankingReconciliationWorkspace({
  reconciliationId,
  initialBankAccountId,
  initialStatementImportId,
  onBack,
  onOpen,
  onImportStatement,
}: BankingReconciliationWorkspaceProps) {
  const { api, session, csrfToken } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const readOnly = Boolean(session?.impersonation);
  const canRead = permissions.includes("banking.reconciliation.read");
  const canCreate = permissions.includes("banking.reconciliation.create") && !readOnly;
  const canMatch = permissions.includes("banking.reconciliation.match") && !readOnly;
  const canSubmit = permissions.includes("banking.reconciliation.submit") && !readOnly;
  const canApprove = permissions.includes("banking.reconciliation.approve") && !readOnly;
  const canCreateAdjustment = permissions.includes("banking.reconciliation_adjustment.create") && !readOnly;

  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [options, setOptions] = useState<BankStatementImportOptions | null>(null);
  const [bankAccountId, setBankAccountId] = useState(initialBankAccountId ?? "");
  const [imports, setImports] = useState<BankStatementImportSummary[]>([]);
  const [statementImportId, setStatementImportId] = useState(initialStatementImportId ?? "");
  const [method, setMethod] = useState<"statement_import" | "manual_tick">(
    initialStatementImportId ? "statement_import" : "manual_tick",
  );
  const [reconciliationDate, setReconciliationDate] = useState(today());
  const [statementDate, setStatementDate] = useState(today());
  const [periodStart, setPeriodStart] = useState(today());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [statementReference, setStatementReference] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [setup, setSetup] = useState<BankReconciliationSetup | null>(null);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [detail, setDetail] = useState<BankReconciliationDetail | null>(null);
  const [nominals, setNominals] = useState<BankingLedgerAccountDirectory["items"]>([]);
  const [selectedStatementLineId, setSelectedStatementLineId] = useState("");
  const [selectedJournalLineId, setSelectedJournalLineId] = useState("");
  const [matchReason, setMatchReason] = useState("");
  const [adjustmentKind, setAdjustmentKind] = useState<BankReconciliationAdjustment["kind"]>("bank_charge");
  const [offsetNominalId, setOffsetNominalId] = useState("");
  const [adjustmentNarrative, setAdjustmentNarrative] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operationKeys = useRef(new Map<string, string>());

  function key(action: string, fingerprint: string) {
    const lookup = `${action}:${fingerprint}`;
    const existing = operationKeys.current.get(lookup);
    if (existing) return existing;
    const created = `web-bank-reconciliation-${action}-${crypto.randomUUID()}`;
    operationKeys.current.set(lookup, created);
    return created;
  }

  function applyStatement(next: BankStatementImportDetail) {
    setStatementImportId(next.id);
    setCompanyId(next.company_id);
    setBankAccountId(next.bank_account_id);
    setStatementReference(next.statement_reference);
    const bounds = dateBounds(next);
    setPeriodStart(bounds.start);
    setPeriodEnd(next.statement_ending_date ?? bounds.end);
    setStatementDate(next.statement_ending_date ?? bounds.end);
    setClosingBalance(next.statement_ending_balance ?? "");
  }

  function applyDetail(next: BankReconciliationDetail) {
    setDetail(next);
    setCompanyId(next.company_id);
    setBankAccountId(next.bank_account_id);
    setReconciliationDate(next.reconciliation_date);
    setSelectedStatementLineId((current) =>
      next.statement_lines.some((line) => line.id === current) ? current : (next.statement_lines[0]?.id ?? ""),
    );
    setSelectedJournalLineId((current) =>
      next.ledger_candidates.some((line) => line.journal_line_id === current)
        ? current
        : (next.ledger_candidates.find((line) => !line.matched && !line.reversed)?.journal_line_id ?? ""),
    );
  }

  async function loadDetail(id: string) {
    const next = await client.reconciliation(id);
    applyDetail(next);
    const directory = await client.ledgerAccounts({ companyId: next.company_id, limit: 200 });
    setNominals(directory.items);
  }

  async function loadImports(selectedCompanyId: string, selectedBankAccountId: string) {
    const directory = await client.statementImports({
      company_id: selectedCompanyId,
      bank_account_id: selectedBankAccountId,
      state: "finalized",
      limit: 100,
    });
    setImports(directory.items);
    const preferred = directory.items.find((item) => item.id === statementImportId) ?? directory.items[0];
    if (preferred) applyStatement(await client.statementImport(preferred.id));
    else {
      setStatementImportId("");
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!canRead) return;
        if (reconciliationId) {
          const next = await client.reconciliation(reconciliationId);
          if (!active) return;
          applyDetail(next);
          const directory = await client.ledgerAccounts({ companyId: next.company_id, limit: 200 });
          if (active) setNominals(directory.items);
          return;
        }
        const companyDirectory = await client.companies();
        if (!active) return;
        setCompanies(companyDirectory.items);
        if (initialStatementImportId) {
          const imported = await client.statementImport(initialStatementImportId);
          if (!active) return;
          applyStatement(imported);
          const [loadedOptions, loadedImports] = await Promise.all([
            client.statementImportOptions({ company_id: imported.company_id }),
            client.statementImports({
              company_id: imported.company_id,
              bank_account_id: imported.bank_account_id,
              state: "finalized",
              limit: 100,
            }),
          ]);
          if (active) {
            setOptions(loadedOptions);
            setImports(loadedImports.items);
          }
          return;
        }
        const initialCompanyId = companyDirectory.items[0]?.id ?? "";
        setCompanyId(initialCompanyId);
        if (!initialCompanyId) return;
        const loadedOptions = await client.statementImportOptions({ company_id: initialCompanyId });
        if (!active) return;
        setOptions(loadedOptions);
        const initialAccountId = loadedOptions.bank_accounts.some((account) => account.id === initialBankAccountId)
          ? (initialBankAccountId ?? "")
          : (loadedOptions.bank_accounts[0]?.id ?? "");
        setBankAccountId(initialAccountId);
        if (initialAccountId) await loadImports(initialCompanyId, initialAccountId);
      } catch (caught) {
        if (active) setError(errorMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // Route identity is the aggregate reload boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, client, initialBankAccountId, initialStatementImportId, reconciliationId]);

  async function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setLoading(true);
    setError("");
    try {
      const loadedOptions = await client.statementImportOptions({ company_id: nextCompanyId });
      setOptions(loadedOptions);
      const accountId = loadedOptions.bank_accounts[0]?.id ?? "";
      setBankAccountId(accountId);
      if (accountId) await loadImports(nextCompanyId, accountId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function changeBankAccount(nextBankAccountId: string) {
    setBankAccountId(nextBankAccountId);
    setLoading(true);
    setError("");
    try {
      await loadImports(companyId, nextBankAccountId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function changeStatement(nextImportId: string) {
    setLoading(true);
    setError("");
    try {
      applyStatement(await client.statementImport(nextImportId));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (
      !companyId ||
      !bankAccountId ||
      !reconciliationDate ||
      !statementDate ||
      !periodStart ||
      !periodEnd ||
      !closingBalance
    ) {
      setError("Company, Bank Account, reconciliation dates and statement ending balance are required.");
      return;
    }
    if (method === "statement_import" && !statementImportId) {
      setError("Select a finalized statement import before saving the reconciliation.");
      return;
    }
    setBusy("create");
    setError("");
    try {
      const loadedSetup = await client.reconciliationSetup({
        company_id: companyId,
        bank_account_id: bankAccountId,
        period_start: periodStart,
        period_end: periodEnd,
        statement_date: statementDate,
      });
      setSetup(loadedSetup);
      setOpeningBalance(loadedSetup.opening_statement_balance);
      const payload = {
        company_id: companyId,
        bank_account_id: bankAccountId,
        method,
        import_id: method === "statement_import" ? statementImportId : null,
        reconciliation_date: reconciliationDate,
        statement_date: statementDate,
        period_start: periodStart,
        period_end: periodEnd,
        statement_reference: statementReference.trim() || `MANUAL-${statementDate}`,
        closing_statement_balance: closingBalance,
      };
      const result = await client.createReconciliation(payload, csrfToken(), key("create", JSON.stringify(payload)));
      onOpen(result.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function setManualSelection(journalLineId: string, selected: boolean) {
    if (!detail) return;
    await mutate(
      "manual-selection",
      () =>
        client.setReconciliationManualSelection(
          detail.id,
          { journal_line_id: journalLineId, selected, expected_version: detail.version },
          csrfToken(),
          key("manual-selection", `${detail.id}:${detail.version}:${journalLineId}:${selected}`),
        ),
      selected ? "Transaction selected for reconciliation." : "Transaction returned to unreconciled items.",
    );
  }

  async function mutate(action: BusyAction, operation: () => Promise<unknown>, success: string) {
    if (!detail) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      await operation();
      await loadDetail(detail.id);
      setNotice(success);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function confirmManualMatch() {
    if (!detail || !selectedStatementLineId || !selectedJournalLineId) {
      setError("Select one statement line and one ledger line to confirm a manual match.");
      return;
    }
    await mutate(
      "match",
      () =>
        client.createReconciliationMatch(
          detail.id,
          {
            action: "confirm_manual",
            expected_version: detail.version,
            statement_line_id: selectedStatementLineId,
            journal_line_id: selectedJournalLineId,
          },
          csrfToken(),
          key("match", `${detail.id}:${detail.version}:${selectedStatementLineId}:${selectedJournalLineId}`),
        ),
      "Manual match confirmed against authoritative ledger evidence.",
    );
  }

  async function proposeMatches() {
    if (!detail) return;
    await mutate(
      "match",
      () =>
        client.createReconciliationMatch(
          detail.id,
          { action: "propose", expected_version: detail.version },
          csrfToken(),
          key("propose", `${detail.id}:${detail.version}`),
        ),
      "Deterministic match suggestions refreshed.",
    );
  }

  async function decideMatch(matchId: string, action: "confirm" | "reject") {
    if (!detail) return;
    await mutate(
      "decision",
      () =>
        client.decideReconciliationMatch(
          detail.id,
          matchId,
          {
            action,
            expected_version: detail.matches.find((match) => match.id === matchId)?.version ?? 1,
            reason: action === "reject" ? matchReason : undefined,
          },
          csrfToken(),
          key(`match-${action}`, `${matchId}:${detail.version}:${matchReason}`),
        ),
      action === "confirm" ? "Suggested match confirmed." : "Suggested match rejected.",
    );
  }

  async function unmatch(matchId: string, version: number) {
    if (!detail || !matchReason.trim()) {
      setError("Enter a reason before removing a confirmed match.");
      return;
    }
    await mutate(
      "unmatch",
      () =>
        client.unmatchReconciliation(
          detail.id,
          matchId,
          { expected_version: version, reason: matchReason.trim() },
          csrfToken(),
          key("unmatch", `${matchId}:${version}:${matchReason}`),
        ),
      "Confirmed match removed with an audit reason.",
    );
  }

  async function createAdjustment() {
    if (!detail || !selectedStatementLineId || !offsetNominalId || adjustmentNarrative.trim().length < 3) {
      setError("Select an unmatched statement line, offset nominal and a narrative of at least three characters.");
      return;
    }
    await mutate(
      "adjustment",
      () =>
        client.createReconciliationAdjustment(
          detail.id,
          {
            expected_version: detail.version,
            statement_line_id: selectedStatementLineId,
            kind: adjustmentKind,
            offset_nominal_id: offsetNominalId,
            narrative: adjustmentNarrative.trim(),
          },
          csrfToken(),
          key(
            "adjustment-create",
            `${detail.id}:${detail.version}:${selectedStatementLineId}:${adjustmentKind}:${offsetNominalId}:${adjustmentNarrative}`,
          ),
        ),
      "Bank-only adjustment draft created. It must be independently approved and explicitly posted before matching.",
    );
  }

  async function adjustmentAction(
    adjustment: BankReconciliationAdjustment,
    action: "submit" | "approve" | "reject" | "post" | "reverse",
  ) {
    if (!detail) return;
    if ((action === "reject" || action === "reverse") && adjustmentReason.trim().length < 3) {
      setError("Enter an adjustment reason of at least three characters.");
      return;
    }
    const fingerprint = `${adjustment.id}:${adjustment.version}:${action}:${adjustmentReason}`;
    const args = [detail.id, adjustment.id] as const;
    const operation =
      action === "submit"
        ? () =>
            client.submitReconciliationAdjustment(
              ...args,
              { expected_version: adjustment.version },
              csrfToken(),
              key("adjustment-submit", fingerprint),
            )
        : action === "post"
          ? () =>
              client.postReconciliationAdjustment(
                ...args,
                { expected_version: adjustment.version },
                csrfToken(),
                key("adjustment-post", fingerprint),
              )
          : action === "reverse"
            ? () =>
                client.reverseReconciliationAdjustment(
                  ...args,
                  { expected_version: adjustment.version, reason: adjustmentReason.trim() },
                  csrfToken(),
                  key("adjustment-reverse", fingerprint),
                )
            : () =>
                client.decideReconciliationAdjustment(
                  ...args,
                  {
                    action,
                    expected_version: adjustment.version,
                    reason: action === "reject" ? adjustmentReason.trim() : undefined,
                  },
                  csrfToken(),
                  key(`adjustment-${action}`, fingerprint),
                );
    await mutate("adjustment", operation, `Adjustment ${action} completed.`);
  }

  async function submit() {
    if (!detail) return;
    await mutate(
      "submit",
      () =>
        client.submitReconciliation(
          detail.id,
          { expected_version: detail.version },
          csrfToken(),
          key("submit", `${detail.id}:${detail.version}`),
        ),
      "Reconciliation submitted for independent approval.",
    );
  }

  async function decide(action: "approve" | "reject") {
    if (!detail) return;
    if (action === "reject" && matchReason.trim().length < 3) {
      setError("Enter a rejection reason of at least three characters.");
      return;
    }
    setBusy("approve");
    setError("");
    try {
      await client.decideReconciliation(
        detail.id,
        { action, expected_version: detail.version, reason: action === "reject" ? matchReason.trim() : undefined },
        csrfToken(),
        key(`decision-${action}`, `${detail.id}:${detail.version}:${matchReason}`),
      );
      if (action === "approve") onBack();
      else await loadDetail(detail.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  if (!canRead)
    return (
      <Alert variant="destructive">
        <AlertTitle>Permission required</AlertTitle>
        <AlertDescription>banking.reconciliation.read is required.</AlertDescription>
      </Alert>
    );

  if (!reconciliationId && !detail) {
    return (
      <section className="space-y-4" aria-labelledby="new-reconciliation-heading">
        <header className="border-b border-border pb-3">
          <h1 id="new-reconciliation-heading" className="text-2xl font-semibold">
            Reconciliation Balance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reconcile posted bank transactions manually or from a finalized statement import.
          </p>
        </header>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Reconciliation could not be saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Company">
            <select
              aria-label="Company"
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
              disabled={loading}
              value={companyId}
              onChange={(event) => void changeCompany(event.target.value)}
            >
              <option value="">Select company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} · {company.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bank Account">
            <select
              aria-label="Bank account"
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
              disabled={loading}
              value={bankAccountId}
              onChange={(event) => void changeBankAccount(event.target.value)}
            >
              <option value="">Select Bank Account</option>
              {options?.bank_accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} · {account.currency}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Method">
            <select
              aria-label="Reconciliation method"
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={method}
              onChange={(event) => {
                setMethod(event.target.value as typeof method);
                setSetup(null);
                setOpeningBalance("");
              }}
            >
              <option value="manual_tick">Manual Reconciliation</option>
              <option value="statement_import">Import Bank Statement</option>
            </select>
          </Field>
          {method === "statement_import" ? (
            <Field label="Finalized statement">
              <select
                aria-label="Finalized statement"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={statementImportId}
                onChange={(event) => void changeStatement(event.target.value)}
              >
                <option value="">Select finalized statement</option>
                {imports.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.statement_reference} · {item.original_filename}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Reconciliation Date">
            <Input
              aria-label="Reconciliation date"
              type="date"
              value={reconciliationDate}
              onChange={(event) => setReconciliationDate(event.target.value)}
            />
          </Field>
          <Field label="Statement Ending Date">
            <Input
              aria-label="Statement date"
              type="date"
              value={statementDate}
              onChange={(event) => setStatementDate(event.target.value)}
            />
          </Field>
          <Field label="Period start">
            <Input
              aria-label="Period start"
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
            />
          </Field>
          <Field label="Period end">
            <Input
              aria-label="Period end"
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
          </Field>
          <Field label="Statement reference">
            <Input
              aria-label="Statement reference"
              maxLength={128}
              value={statementReference}
              onChange={(event) => setStatementReference(event.target.value)}
            />
          </Field>
          <Field label="Opening Balance">
            <Input
              aria-label="Opening statement balance"
              inputMode="decimal"
              placeholder="Fetched when transactions load"
              readOnly
              value={openingBalance}
            />
          </Field>
          <Field label="Statement Ending Balance">
            <Input
              aria-label="Closing statement balance"
              inputMode="decimal"
              value={closingBalance}
              onChange={(event) => setClosingBalance(event.target.value)}
            />
          </Field>
        </div>
        {setup ? (
          <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Summary
              label="Opening Balance"
              value={formatAmount(setup.opening_statement_balance, setup.currency)}
              detail={
                setup.opening_balance_source === "last_approved_reconciliation"
                  ? "Last completed reconciliation"
                  : "Governed ledger before period"
              }
            />
            <Summary
              label="Available Receipts"
              value={formatAmount(setup.available_receipts, setup.currency)}
              detail="Posted and unreconciled"
            />
            <Summary
              label="Available Payments"
              value={formatAmount(setup.available_payments, setup.currency)}
              detail="Posted and unreconciled"
            />
            <Summary
              label="Transactions"
              value={String(setup.available_transaction_count)}
              detail="Captured by the server"
            />
          </div>
        ) : null}
        {method === "statement_import" && imports.length === 0 && !loading ? (
          <Alert>
            <AlertTitle>No finalized statement available</AlertTitle>
            <AlertDescription>
              Import and finalize a Bank Statement before creating this reconciliation.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={onImportStatement}>
              Import statement
            </Button>
          </div>
          <Button type="button" disabled={!canCreate || busy !== null || loading} onClick={() => void create()}>
            {busy === "create" ? "Loading..." : method === "manual_tick" ? "Load Transactions" : "Save reconciliation"}
          </Button>
        </div>
      </section>
    );
  }

  if (!detail)
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading reconciliation…
      </div>
    );

  const selectedStatementLine = detail.statement_lines.find((line) => line.id === selectedStatementLineId);
  const immutable = detail.state === "submitted" || detail.state === "approved";
  const matchedStatementIds = new Set(
    detail.matches.filter((match) => match.state === "confirmed").map((match) => match.statement_line_id),
  );
  const normalizedSearch = transactionSearch.trim().toLocaleLowerCase();
  const visibleLedgerCandidates = detail.ledger_candidates.filter((line) =>
    normalizedSearch
      ? [line.posting_date, line.journal_entry_number, line.reference, line.narrative, line.amount]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(normalizedSearch))
      : true,
  );

  return (
    <section className="space-y-4" aria-labelledby="reconciliation-heading">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-3">
        <div>
          <button type="button" className="text-sm text-primary hover:underline" onClick={onBack}>
            ← Reconciliations
          </button>
          <h1 id="reconciliation-heading" className="mt-1 text-2xl font-semibold">
            Bank Reconciliation
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{bankReconciliationStateLabel(detail.state)}</Badge>
            <Badge variant="outline">{detail.id}</Badge>
            <Badge variant="outline">{detail.statement_reference}</Badge>
            <Badge variant="outline">Version {detail.version}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.method === "statement_import" ? (
            <Button
              type="button"
              variant="outline"
              disabled={!canMatch || immutable || busy !== null}
              onClick={() => void proposeMatches()}
            >
              Refresh suggestions
            </Button>
          ) : null}
          {detail.state === "draft" || detail.state === "in_progress" ? (
            <Button
              type="button"
              disabled={
                !canSubmit ||
                busy !== null ||
                !isZeroAmount(detail.balances.difference) ||
                (detail.method === "statement_import" && detail.balances.unmatched_statement_count > 0)
              }
              onClick={() => void submit()}
            >
              {busy === "submit" ? "Submitting..." : "Reconcile / Submit for Approval"}
            </Button>
          ) : null}
          {detail.state === "submitted" ? (
            <Button type="button" disabled={!canApprove || busy !== null} onClick={() => void decide("approve")}>
              {busy === "approve" ? "Approving…" : "Approve & Close"}
            </Button>
          ) : null}
        </div>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Bank Reconciliation could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <AlertTitle>Reconciliation updated</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {readOnly ? (
        <Alert>
          <AlertTitle>Read-only impersonation</AlertTitle>
          <AlertDescription>
            End impersonation before changing matches, adjustments or lifecycle state.
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.self_decision_requires_override ? (
        <Alert>
          <AlertTitle>Independent approval required</AlertTitle>
          <AlertDescription>
            {detail.super_admin_override_allowed
              ? "The maker cannot approve normally. An audited Super Admin override may be used when the server policy permits it."
              : "A separate eligible approver must approve this reconciliation."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7"
        aria-label="Authoritative reconciliation balances"
      >
        <Summary
          label="Opening Balance"
          value={formatAmount(detail.balances.opening_statement_balance, detail.balances.currency)}
          detail="Previous completed period"
        />
        <Summary
          label={detail.method === "manual_tick" ? "Selected Receipts" : "Statement Receipts"}
          value={formatAmount(
            detail.method === "manual_tick"
              ? (detail.balances.selected_ledger_money_in ?? "0")
              : detail.balances.statement_money_in,
            detail.balances.currency,
          )}
          detail={
            detail.method === "manual_tick"
              ? `${formatAmount(detail.balances.available_ledger_money_in ?? "0", detail.balances.currency)} available`
              : "Imported money in"
          }
        />
        <Summary
          label={detail.method === "manual_tick" ? "Selected Payments" : "Statement Payments"}
          value={formatAmount(
            detail.method === "manual_tick"
              ? (detail.balances.selected_ledger_money_out ?? "0")
              : detail.balances.statement_money_out,
            detail.balances.currency,
          )}
          detail={
            detail.method === "manual_tick"
              ? `${formatAmount(detail.balances.available_ledger_money_out ?? "0", detail.balances.currency)} available`
              : "Imported money out"
          }
        />
        <Summary
          label="Calculated Balance"
          value={formatAmount(
            detail.method === "manual_tick"
              ? (detail.balances.calculated_selected_balance ?? detail.balances.adjusted_ledger_balance)
              : detail.balances.adjusted_ledger_balance,
            detail.balances.currency,
          )}
          detail="Opening + receipts - payments"
        />
        <Summary
          label="Statement Ending Balance"
          value={formatAmount(detail.balances.closing_statement_balance, detail.balances.currency)}
          detail="Bank closing balance"
        />
        <Summary
          label="Difference"
          value={formatAmount(detail.balances.difference, detail.balances.currency)}
          detail={isZeroAmount(detail.balances.difference) ? "Reconciles" : "Must be zero before submission"}
        />
        <Summary
          label="Status"
          value={
            detail.state === "approved"
              ? "Completed"
              : isZeroAmount(detail.balances.difference)
                ? "Balanced"
                : "Difference"
          }
          detail={`${detail.balances.matched_count} matched`}
        />
      </div>

      {detail.method === "manual_tick" ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Unreconciled Bank Transactions</h2>
              <p className="text-xs text-muted-foreground">
                Select only the posted transactions shown on the bank statement. Every change is versioned and audited.
              </p>
            </div>
            <Field label="Search">
              <Input
                aria-label="Search transactions"
                className="w-full sm:w-72"
                placeholder="Reference, voucher or details"
                value={transactionSearch}
                onChange={(event) => setTransactionSearch(event.target.value)}
              />
            </Field>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Rec</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">V. ID</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Account / Payee</th>
                  <th className="px-3 py-2 text-left font-medium">Ref. No.</th>
                  <th className="px-3 py-2 text-left font-medium">Details</th>
                  <th className="px-3 py-2 text-right font-medium">Payments</th>
                  <th className="px-3 py-2 text-right font-medium">Receipts</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleLedgerCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      No unreconciled transactions match the current search.
                    </td>
                  </tr>
                ) : (
                  visibleLedgerCandidates.map((line) => (
                    <tr key={line.journal_line_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Checkbox
                          aria-label={`Reconcile ${line.journal_entry_number}`}
                          checked={line.manual_selected}
                          disabled={immutable || !canMatch || busy !== null || line.matched || line.reversed}
                          onCheckedChange={(checked) => void setManualSelection(line.journal_line_id, checked === true)}
                        />
                      </td>
                      <td className="px-3 py-2">{line.posting_date}</td>
                      <td className="px-3 py-2 font-medium">{line.journal_entry_number}</td>
                      <td className="px-3 py-2">{line.direction === "money_in" ? "Receipt" : "Payment"}</td>
                      <td className="px-3 py-2">{detail.bank_account_name}</td>
                      <td className="px-3 py-2">{line.reference ?? "—"}</td>
                      <td className="max-w-72 px-3 py-2">{line.narrative ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.direction === "money_out" ? formatAmount(line.amount, line.currency) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.direction === "money_in" ? formatAmount(line.amount, line.currency) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={line.manual_selected ? "default" : "outline"}>
                          {line.reversed
                            ? "Reversed"
                            : line.matched
                              ? "Matched"
                              : line.manual_selected
                                ? "Selected"
                                : "Unreconciled"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className={detail.method === "statement_import" ? "grid min-w-0 gap-4 xl:grid-cols-2" : "hidden"}>
        <EvidenceTable
          title="Imported statement rows"
          columns={["Select", "Date", "Reference", "Details", "Amount", "Match"]}
        >
          {detail.statement_lines.map((line) => {
            const match = detail.matches.find(
              (item) => item.statement_line_id === line.id && item.state !== "rejected",
            );
            return (
              <tr key={line.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <input
                    aria-label={`Select statement line ${line.source_row_number}`}
                    type="radio"
                    name="statement-line"
                    checked={selectedStatementLineId === line.id}
                    onChange={() => setSelectedStatementLineId(line.id)}
                  />
                </td>
                <td className="px-3 py-2">{line.transaction_date ?? "—"}</td>
                <td className="px-3 py-2">{line.reference ?? "—"}</td>
                <td className="max-w-64 px-3 py-2">{line.details ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {line.direction === "money_out" ? "−" : "+"}
                  {line.amount ? formatAmount(line.amount, line.currency) : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={match?.state === "confirmed" ? "default" : "outline"}>
                    {match?.state ?? "unmatched"}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </EvidenceTable>
        <EvidenceTable
          title="Posted ledger candidates"
          columns={["Select", "Date", "Journal", "Narrative", "Amount", "Status"]}
        >
          {detail.ledger_candidates.map((line) => (
            <tr key={line.journal_line_id} className="border-t border-border">
              <td className="px-3 py-2">
                <input
                  aria-label={`Select ledger line ${line.journal_entry_number}`}
                  type="radio"
                  name="ledger-line"
                  disabled={line.matched || line.reversed}
                  checked={selectedJournalLineId === line.journal_line_id}
                  onChange={() => setSelectedJournalLineId(line.journal_line_id)}
                />
              </td>
              <td className="px-3 py-2">{line.posting_date}</td>
              <td className="px-3 py-2">{line.journal_entry_number}</td>
              <td className="max-w-64 px-3 py-2">{line.narrative ?? line.reference ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {line.direction === "money_out" ? "−" : "+"}
                {formatAmount(line.amount, line.currency)}
              </td>
              <td className="px-3 py-2">
                <Badge variant={line.reversed ? "destructive" : "outline"}>
                  {line.reversed ? "reversed" : line.matched ? "matched" : "available"}
                </Badge>
              </td>
            </tr>
          ))}
        </EvidenceTable>
      </div>

      {!immutable && detail.method === "statement_import" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <Button
            type="button"
            disabled={!canMatch || busy !== null || !selectedStatementLineId || !selectedJournalLineId}
            onClick={() => void confirmManualMatch()}
          >
            {busy === "match" ? "Matching…" : "Confirm manual match"}
          </Button>
          <Input
            aria-label="Match decision reason"
            className="max-w-md"
            maxLength={500}
            placeholder="Reason required for reject or unmatch"
            value={matchReason}
            onChange={(event) => setMatchReason(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            Manual matches and removals are audited; no journal is created.
          </span>
        </div>
      ) : null}

      {detail.method === "statement_import" && detail.matches.length ? (
        <section className="rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Match evidence</h2>
          <div className="divide-y divide-border">
            {detail.matches.map((match) => (
              <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <strong>
                    {match.match_type} · {match.state}
                  </strong>
                  <span className="ml-2 text-muted-foreground">
                    {Math.round(match.confidence_score * 100)}% · {match.reason_codes.join(", ") || "manual evidence"}
                  </span>
                </div>
                <div className="flex gap-2">
                  {match.state === "proposed" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canMatch || busy !== null}
                        onClick={() => void decideMatch(match.id, "confirm")}
                      >
                        Confirm
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canMatch || busy !== null || matchReason.trim().length < 3}
                        onClick={() => void decideMatch(match.id, "reject")}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {match.state === "confirmed" && !immutable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={!canMatch || busy !== null || matchReason.trim().length < 3}
                      onClick={() => void unmatch(match.id, match.version)}
                    >
                      Unmatch
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={detail.method === "statement_import" ? "rounded-lg border border-border bg-card" : "hidden"}>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Bank-only adjustments</h2>
          <p className="text-xs text-muted-foreground">
            An adjustment uses the immutable selected statement amount. Approval does not post; posting is a separate
            Finance action.
          </p>
        </div>
        {!immutable ? (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
            <select
              aria-label="Adjustment kind"
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
              value={adjustmentKind}
              onChange={(event) => setAdjustmentKind(event.target.value as BankReconciliationAdjustment["kind"])}
            >
              {Object.entries(adjustmentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Offset nominal"
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
              value={offsetNominalId}
              onChange={(event) => setOffsetNominalId(event.target.value)}
            >
              <option value="">Select offset nominal</option>
              {nominals.map((nominal) => (
                <option key={nominal.id} value={nominal.id}>
                  {nominal.code} · {nominal.name}
                </option>
              ))}
            </select>
            <Input
              aria-label="Adjustment narrative"
              maxLength={500}
              placeholder="Narrative"
              value={adjustmentNarrative}
              onChange={(event) => setAdjustmentNarrative(event.target.value)}
            />
            <div className="rounded-lg border border-border px-3 py-1 text-sm">
              <span className="block text-xs text-muted-foreground">Selected amount</span>
              <strong>
                {selectedStatementLine?.amount
                  ? formatAmount(selectedStatementLine.amount, selectedStatementLine.currency)
                  : "—"}
              </strong>
            </div>
            <Button
              type="button"
              disabled={
                !canCreateAdjustment ||
                busy !== null ||
                !selectedStatementLineId ||
                matchedStatementIds.has(selectedStatementLineId)
              }
              onClick={() => void createAdjustment()}
            >
              Create adjustment
            </Button>
          </div>
        ) : null}
        <div className="divide-y divide-border">
          {detail.adjustments.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">No governed adjustments exist.</p>
          ) : (
            detail.adjustments.map((adjustment) => (
              <AdjustmentRow
                key={adjustment.id}
                adjustment={adjustment}
                permissions={permissions}
                busy={busy !== null}
                onAction={(action) => void adjustmentAction(adjustment, action)}
              />
            ))
          )}
        </div>
        {detail.adjustments.length ? (
          <div className="border-t border-border p-4">
            <Input
              aria-label="Adjustment decision reason"
              maxLength={500}
              placeholder="Reason required for reject or reverse"
              value={adjustmentReason}
              onChange={(event) => setAdjustmentReason(event.target.value)}
            />
          </div>
        ) : null}
      </section>

      {detail.state !== "submitted" && detail.state !== "approved" ? (
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={onBack}>
            Save and Close
          </Button>
        </div>
      ) : null}

      {detail.state === "submitted" ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Input
            aria-label="Reconciliation decision reason"
            className="max-w-md"
            maxLength={500}
            placeholder="Reason required when returning"
            value={matchReason}
            onChange={(event) => setMatchReason(event.target.value)}
          />
          <Button
            type="button"
            variant="destructive"
            disabled={!canApprove || busy !== null || matchReason.trim().length < 3}
            onClick={() => void decide("reject")}
          >
            Return
          </Button>
          <Button type="button" disabled={!canApprove || busy !== null} onClick={() => void decide("approve")}>
            Approve & Close
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 text-sm">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-lg font-semibold tabular-nums">{value}</strong>
      <small className="mt-1 block text-xs text-muted-foreground">{detail}</small>
    </article>
  );
}

function EvidenceTable({ title, columns, children }: { title: string; columns: string[]; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-primary text-primary-foreground">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className={
                    column === "Amount" ? "px-3 py-2 text-right font-medium" : "px-3 py-2 text-left font-medium"
                  }
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function AdjustmentRow({
  adjustment,
  permissions,
  busy,
  onAction,
}: {
  adjustment: BankReconciliationAdjustment;
  permissions: string[];
  busy: boolean;
  onAction: (action: "submit" | "approve" | "reject" | "post" | "reverse") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div>
        <strong>
          {adjustmentLabels[adjustment.kind]} · {formatAmount(adjustment.amount, adjustment.currency)}
        </strong>
        <span className="ml-2 text-muted-foreground">
          {adjustment.offset_nominal_code} · {adjustment.offset_nominal_name}
        </span>
        <p className="mt-1 text-xs text-muted-foreground">{adjustment.narrative}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{adjustment.state}</Badge>
        {adjustment.state === "draft" ? (
          <Button
            type="button"
            size="sm"
            disabled={busy || !permissions.includes("banking.reconciliation_adjustment.submit")}
            onClick={() => onAction("submit")}
          >
            Submit
          </Button>
        ) : null}
        {adjustment.state === "submitted" ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={busy || !permissions.includes("banking.reconciliation_adjustment.approve")}
              onClick={() => onAction("approve")}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy || !permissions.includes("banking.reconciliation_adjustment.approve")}
              onClick={() => onAction("reject")}
            >
              Reject
            </Button>
          </>
        ) : null}
        {adjustment.state === "approved" ? (
          <Button
            type="button"
            size="sm"
            disabled={busy || !permissions.includes("banking.reconciliation_adjustment.post")}
            onClick={() => onAction("post")}
          >
            Post adjustment
          </Button>
        ) : null}
        {adjustment.state === "posted" ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy || !permissions.includes("banking.reconciliation_adjustment.reverse")}
            onClick={() => onAction("reverse")}
          >
            Reverse
          </Button>
        ) : null}
      </div>
    </div>
  );
}
