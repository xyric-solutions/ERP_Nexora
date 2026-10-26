"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BankStatementImportDetail,
  BankStatementImportDirectory,
  BankStatementImportOptions,
  BankStatementImportSummary,
  BankingCompanyDirectory,
} from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { BankingApiClient } from "../api/banking-client";

export interface LiveBankStatementProps {
  accountId: string;
  onAction: (action: string, subject?: string) => void;
  onOpenTransaction: (reference: string) => void;
  onReconcile?: (accountId: string, importId?: string) => void;
  onBack?: () => void;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`;
  }
  return "The Bank Statement could not be loaded. Check the API connection and try again.";
}

function formatAmount(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

export function LiveBankStatement({ accountId, onAction, onReconcile, onBack }: LiveBankStatementProps) {
  const { api, session } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("banking.statement_import.read") ?? false;
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [options, setOptions] = useState<BankStatementImportOptions | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState(accountId);
  const [imports, setImports] = useState<BankStatementImportSummary[]>([]);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [detail, setDetail] = useState<BankStatementImportDetail | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchImports(input: {
    selectedCompanyId: string;
    selectedAccountId: string;
    cursor?: string;
    append?: boolean;
    selectedDateFrom?: string;
    selectedDateTo?: string;
    selectedSearch?: string;
  }) {
    const directory: BankStatementImportDirectory = await client.statementImports({
      company_id: input.selectedCompanyId,
      bank_account_id: input.selectedAccountId,
      state: "finalized",
      statement_date_from: input.selectedDateFrom || undefined,
      statement_date_to: input.selectedDateTo || undefined,
      search: input.selectedSearch?.trim() || undefined,
      limit: 25,
      cursor: input.cursor,
    });
    setImports((current) => (input.append ? [...current, ...directory.items] : directory.items));
    setNextCursor(directory.next_cursor);
    if (!input.append) {
      const firstImportId = directory.items[0]?.id ?? "";
      setSelectedImportId(firstImportId);
      setDetail(firstImportId ? await client.statementImport(firstImportId) : null);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!canRead) return;
        const directory = await client.companies();
        if (!active) return;
        setCompanies(directory.items);
        const initialCompanyId = directory.items[0]?.id ?? "";
        setCompanyId(initialCompanyId);
        if (!initialCompanyId) return;
        const loadedOptions = await client.statementImportOptions({ company_id: initialCompanyId });
        if (!active) return;
        setOptions(loadedOptions);
        const initialAccountId = loadedOptions.bank_accounts.some((account) => account.id === accountId)
          ? accountId
          : (loadedOptions.bank_accounts[0]?.id ?? "");
        setSelectedAccountId(initialAccountId);
        if (!initialAccountId) return;
        const loadedImports = await client.statementImports({
          company_id: initialCompanyId,
          bank_account_id: initialAccountId,
          state: "finalized",
          limit: 25,
        });
        if (!active) return;
        setImports(loadedImports.items);
        setNextCursor(loadedImports.next_cursor);
        const firstImportId = loadedImports.items[0]?.id ?? "";
        setSelectedImportId(firstImportId);
        if (firstImportId) {
          const imported = await client.statementImport(firstImportId);
          if (active) setDetail(imported);
        }
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
  }, [accountId, canRead, client]);

  async function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setLoading(true);
    setError("");
    try {
      const loadedOptions = await client.statementImportOptions({ company_id: nextCompanyId });
      setOptions(loadedOptions);
      const nextAccountId = loadedOptions.bank_accounts[0]?.id ?? "";
      setSelectedAccountId(nextAccountId);
      if (nextAccountId) {
        await fetchImports({ selectedCompanyId: nextCompanyId, selectedAccountId: nextAccountId });
      } else {
        setImports([]);
        setDetail(null);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function changeAccount(nextAccountId: string) {
    setSelectedAccountId(nextAccountId);
    setLoading(true);
    setError("");
    try {
      await fetchImports({ selectedCompanyId: companyId, selectedAccountId: nextAccountId });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function changeImport(nextImportId: string) {
    setSelectedImportId(nextImportId);
    setLoading(true);
    setError("");
    try {
      setDetail(await client.statementImport(nextImportId));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function applyFilters() {
    if (!companyId || !selectedAccountId) return;
    setLoading(true);
    setError("");
    try {
      await fetchImports({
        selectedCompanyId: companyId,
        selectedAccountId,
        selectedDateFrom: dateFrom,
        selectedDateTo: dateTo,
        selectedSearch: search,
      });
      onAction("Filter", "Bank Statement");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreImports() {
    if (!companyId || !selectedAccountId || !nextCursor) return;
    setLoading(true);
    setError("");
    try {
      await fetchImports({
        selectedCompanyId: companyId,
        selectedAccountId,
        selectedDateFrom: dateFrom,
        selectedDateTo: dateTo,
        selectedSearch: search,
        cursor: nextCursor,
        append: true,
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (!canRead) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Permission required</AlertTitle>
        <AlertDescription>banking.statement_import.read is required.</AlertDescription>
      </Alert>
    );
  }

  const account = options?.bank_accounts.find((item) => item.id === selectedAccountId);
  const includedLines = detail?.lines.filter((line) => line.inclusion_state === "included") ?? [];
  const moneyIn = includedLines
    .filter((line) => line.direction === "money_in")
    .reduce((total, line) => total + Number(line.amount ?? 0), 0);
  const moneyOut = includedLines
    .filter((line) => line.direction === "money_out")
    .reduce((total, line) => total + Number(line.amount ?? 0), 0);
  const currency = account?.currency ?? detail?.lines[0]?.currency ?? "USD";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {onBack ? (
              <button className="text-primary hover:underline" type="button" onClick={onBack}>
                ← Account balances
              </button>
            ) : null}
            <span>Bank Statement</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{account?.account_name ?? "Bank Statement"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {account
              ? `${account.bank_name ?? "Bank"} · ${account.account_number_masked ?? account.reference} · ${account.currency}`
              : "Select a Bank Account to view finalized statement imports."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onAction("Export statement", account?.account_name)}>
            Export
          </Button>
          <Button
            type="button"
            disabled={!detail}
            onClick={() => {
              onAction("Reconcile", detail?.statement_reference);
              if (detail) onReconcile?.(detail.bank_account_id, detail.id);
            }}
          >
            Reconcile
          </Button>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Bank Statement could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3 xl:grid-cols-7">
        <select
          aria-label="Company"
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          value={companyId}
          onChange={(event) => void changeCompany(event.target.value)}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.code} · {company.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Bank account"
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          value={selectedAccountId}
          onChange={(event) => void changeAccount(event.target.value)}
        >
          {options?.bank_accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.account_name} · {item.currency}
            </option>
          ))}
        </select>
        <select
          aria-label="Finalized statement import"
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          value={selectedImportId}
          onChange={(event) => void changeImport(event.target.value)}
        >
          <option value="">No finalized import</option>
          {imports.map((item) => (
            <option key={item.id} value={item.id}>
              {item.statement_reference} · {item.original_filename}
            </option>
          ))}
        </select>
        <Input
          aria-label="Statement date from"
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
        />
        <Input
          aria-label="Statement date to"
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
        />
        <Input
          aria-label="Search statement imports"
          placeholder="Reference or filename"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="button" disabled={loading || !selectedAccountId} onClick={() => void applyFilters()}>
          Apply filters
        </Button>
      </section>

      {!loading && imports.length === 0 ? (
        <Alert>
          <AlertTitle>No finalized statements</AlertTitle>
          <AlertDescription>
            Upload and finalize a Bank Statement before starting reconciliation for this account.
          </AlertDescription>
        </Alert>
      ) : null}

      {detail ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Statement import totals">
            <Summary label="Statement reference" value={detail.statement_reference} detail={detail.original_filename} />
            <Summary
              label="Included rows"
              value={String(includedLines.length)}
              detail={`${detail.counts.excluded} excluded`}
            />
            <Summary
              label="Money in"
              value={formatAmount(String(moneyIn), currency)}
              detail={`${includedLines.filter((line) => line.direction === "money_in").length} row(s)`}
            />
            <Summary
              label="Money out"
              value={formatAmount(String(moneyOut), currency)}
              detail={`${includedLines.filter((line) => line.direction === "money_out").length} row(s)`}
            />
            <Summary
              label="Validation"
              value={`${detail.counts.valid} valid`}
              detail={`${detail.counts.warning} warning · ${detail.counts.duplicate} duplicate · ${detail.counts.error} error`}
            />
          </section>

          <section className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Reference</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Account</th>
                  <th className="px-3 py-2 text-left font-medium">Payment Mode</th>
                  <th className="px-3 py-2 text-left font-medium">Details</th>
                  <th className="px-3 py-2 text-right font-medium">Money in</th>
                  <th className="px-3 py-2 text-right font-medium">Money out</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      This finalized import has no statement rows.
                    </td>
                  </tr>
                ) : (
                  detail.lines.map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="px-3 py-2">{line.transaction_date ?? "—"}</td>
                      <td className="px-3 py-2">{line.reference ?? "—"}</td>
                      <td className="px-3 py-2">{line.transaction_type ?? "—"}</td>
                      <td className="px-3 py-2">{line.account_text ?? "—"}</td>
                      <td className="px-3 py-2">{line.payment_mode ?? "—"}</td>
                      <td className="max-w-72 px-3 py-2">{line.details ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.direction === "money_in" && line.amount ? formatAmount(line.amount, line.currency) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.direction === "money_out" && line.amount ? formatAmount(line.amount, line.currency) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            line.inclusion_state === "excluded" || line.validation_state === "error"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {line.inclusion_state === "excluded" ? "Excluded" : line.validation_state}
                        </Badge>
                        {line.exclusion_reason ? (
                          <span className="mt-1 block max-w-64 text-xs text-muted-foreground">
                            {line.exclusion_reason}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>
                {detail.lines.length} statement row(s) · finalized{" "}
                {detail.finalized_at ? new Date(detail.finalized_at).toLocaleString() : "—"}
              </span>
              {nextCursor ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void loadMoreImports()}
                >
                  Load more imports
                </Button>
              ) : null}
            </div>
          </section>
        </>
      ) : loading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading finalized statements…
        </div>
      ) : null}
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
