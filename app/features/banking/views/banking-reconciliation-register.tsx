"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BankReconciliationDirectory,
  BankReconciliationState,
  BankReconciliationSummary,
  BankingCompanyDirectory,
} from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { BankingApiClient } from "../api/banking-client";

export interface BankingReconciliationRegisterProps {
  onAction?: (action: string, subject?: string) => void;
  onOpen: (recordId: string) => void;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`;
  }
  return "The reconciliation register could not be loaded. Check the API connection and try again.";
}

export function bankReconciliationStateLabel(state: BankReconciliationState) {
  switch (state) {
    case "draft":
      return "Draft";
    case "in_progress":
      return "In progress";
    case "submitted":
      return "Waiting for approval";
    case "approved":
      return "Approved";
  }
}

function methodLabel(method: BankReconciliationSummary["method"]) {
  return method === "statement_import" ? "Statement import" : "Manual tick";
}

function formatAmount(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

export function BankingReconciliationRegister({ onAction, onOpen }: BankingReconciliationRegisterProps) {
  const { api, session } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("banking.reconciliation.read") ?? false;
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [state, setState] = useState<BankReconciliationState | "">("");
  const [method, setMethod] = useState<"statement_import" | "manual_tick" | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<BankReconciliationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDirectory(input: {
    selectedCompanyId: string;
    selectedBankAccountId?: string;
    selectedState?: BankReconciliationState | "";
    selectedMethod?: "statement_import" | "manual_tick" | "";
    selectedDateFrom?: string;
    selectedDateTo?: string;
    selectedSearch?: string;
    cursor?: string;
    append?: boolean;
  }) {
    const result: BankReconciliationDirectory = await client.reconciliations({
      company_id: input.selectedCompanyId,
      bank_account_id: input.selectedBankAccountId || undefined,
      state: input.selectedState || undefined,
      method: input.selectedMethod || undefined,
      statement_date_from: input.selectedDateFrom || undefined,
      statement_date_to: input.selectedDateTo || undefined,
      search: input.selectedSearch?.trim() || undefined,
      limit: 50,
      cursor: input.cursor,
    });
    setRecords((current) => (input.append ? [...current, ...result.items] : result.items));
    setNextCursor(result.next_cursor);
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
        const loadedRecords = await client.reconciliations({ company_id: initialCompanyId, limit: 50 });
        if (!active) return;
        setRecords(loadedRecords.items);
        setNextCursor(loadedRecords.next_cursor);
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
  }, [canRead, client]);

  async function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setBankAccountId("");
    setLoading(true);
    setError("");
    try {
      await loadDirectory({ selectedCompanyId: nextCompanyId });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function applyFilters() {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      await loadDirectory({
        selectedCompanyId: companyId,
        selectedBankAccountId: bankAccountId,
        selectedState: state,
        selectedMethod: method,
        selectedDateFrom: dateFrom,
        selectedDateTo: dateTo,
        selectedSearch: search,
      });
      onAction?.("Filter", "Bank reconciliations");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!companyId || !nextCursor) return;
    setLoading(true);
    setError("");
    try {
      await loadDirectory({
        selectedCompanyId: companyId,
        selectedBankAccountId: bankAccountId,
        selectedState: state,
        selectedMethod: method,
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

  const liveRecords = records.filter((record) => record.state !== "approved");
  const bankAccounts = [
    ...new Map(
      records.map((record) => [
        record.bank_account_id,
        {
          id: record.bank_account_id,
          account_name: record.bank_account_name,
          currency: record.balances.currency,
        },
      ]),
    ).values(),
  ];
  const awaitingApproval = records.filter((record) => record.state === "submitted").length;
  const openItems = liveRecords.reduce(
    (total, record) => total + record.balances.unmatched_statement_count + record.balances.unmatched_ledger_count,
    0,
  );
  const differences = [...new Set(liveRecords.map((record) => record.balances.currency))].map((currency) => ({
    currency,
    amount: liveRecords
      .filter((record) => record.balances.currency === currency)
      .reduce((total, record) => total + Number(record.balances.difference), 0),
  }));

  if (!canRead) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Permission required</AlertTitle>
        <AlertDescription>banking.reconciliation.read is required.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Reconciliations could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Loaded reconciliation summary">
        <Summary
          label="Live reconciliations"
          value={String(liveRecords.length)}
          detail="Draft, in progress or awaiting approval"
        />
        <Summary
          label="Awaiting approval"
          value={String(awaitingApproval)}
          detail="Balanced and submitted for sign-off"
        />
        <Summary
          label="Open items"
          value={String(openItems)}
          detail="Unmatched statement and ledger lines"
          warning={openItems > 0}
        />
        <Summary
          label="Difference to explain"
          value={
            differences.length
              ? differences.map((item) => formatAmount(String(item.amount), item.currency)).join(" · ")
              : "—"
          }
          detail="Across the currently loaded live records"
          warning={differences.some((item) => item.amount !== 0)}
        />
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-3 xl:grid-cols-7">
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
            value={bankAccountId}
            onChange={(event) => setBankAccountId(event.target.value)}
          >
            <option value="">All Bank Accounts</option>
            {bankAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_name} · {account.currency}
              </option>
            ))}
          </select>
          <select
            aria-label="Reconciliation status"
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
            value={state}
            onChange={(event) => setState(event.target.value as BankReconciliationState | "")}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In progress</option>
            <option value="submitted">Waiting for approval</option>
            <option value="approved">Approved</option>
          </select>
          <select
            aria-label="Reconciliation method"
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
            value={method}
            onChange={(event) => setMethod(event.target.value as typeof method)}
          >
            <option value="">All methods</option>
            <option value="statement_import">Statement import</option>
            <option value="manual_tick">Manual tick</option>
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
          <div className="flex gap-2">
            <Input
              aria-label="Search reconciliations"
              placeholder="Reference or account"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button type="button" disabled={loading} onClick={() => void applyFilters()}>
              Search
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Reconciliation</th>
                <th className="px-3 py-2 text-left font-medium">Bank Account</th>
                <th className="px-3 py-2 text-left font-medium">Statement / Period</th>
                <th className="px-3 py-2 text-left font-medium">Method</th>
                <th className="px-3 py-2 text-right font-medium">Closing balance</th>
                <th className="px-3 py-2 text-right font-medium">Difference</th>
                <th className="px-3 py-2 text-right font-medium">Open items</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    Loading reconciliations…
                  </td>
                </tr>
              ) : null}
              {!loading && records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No reconciliation records match the current filters. Import a statement or start a new
                    reconciliation.
                  </td>
                </tr>
              ) : null}
              {records.map((record) => (
                <tr key={record.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => onOpen(record.id)}
                    >
                      {record.id}
                    </button>
                    <span className="block text-xs text-muted-foreground">v{record.version}</span>
                  </td>
                  <td className="px-3 py-2">{record.bank_account_name}</td>
                  <td className="px-3 py-2">
                    <span>
                      {record.statement_reference} · {record.statement_date}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {record.period_start} to {record.period_end}
                    </span>
                  </td>
                  <td className="px-3 py-2">{methodLabel(record.method)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatAmount(record.balances.closing_statement_balance, record.balances.currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatAmount(record.balances.difference, record.balances.currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {record.balances.unmatched_statement_count + record.balances.unmatched_ledger_count}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={record.state === "submitted" ? "default" : "outline"}>
                      {bankReconciliationStateLabel(record.state)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>{records.length} reconciliation record(s) loaded</span>
          {nextCursor ? (
            <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void loadMore()}>
              Load more
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Summary({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <article className={`rounded-lg border bg-card p-4 ${warning ? "border-amber-500/50" : "border-border"}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-xl font-semibold tabular-nums">{value}</strong>
      <small className="mt-1 block text-xs text-muted-foreground">{detail}</small>
    </article>
  );
}
