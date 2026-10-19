"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { BankAccountState, BankAccountSummary, BankingCompanyDirectory } from "@nexora/contracts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { BankingApiClient } from "../api/banking-client";

const accountStates: readonly BankAccountState[] = [
  "draft",
  "pending_approval",
  "active",
  "rejected",
  "inactive",
  "closed",
  "review_required",
];

function money(value: string, currency: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return `${currency} ${value}`;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(number);
  } catch {
    return `${currency} ${number.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  }
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Bank account data is temporarily unavailable. Retry after checking the API connection.";
}

export function BankingAccountBalances({ onOpenAccount }: { onOpenAccount: (accountId: string) => void }) {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("banking.bank_account.read") ?? false;
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [rows, setRows] = useState<BankAccountSummary[]>([]);
  const [summary, setSummary] = useState<Array<{ currency: string; ledger_balance: string; account_count: number }>>(
    [],
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [bank, setBank] = useState("");
  const [currency, setCurrency] = useState("");
  const [state, setState] = useState<BankAccountState | "">("");
  const [sortBy, setSortBy] = useState<
    "account_name" | "bank_name" | "currency" | "ledger_balance" | "last_movement_on"
  >("account_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading || !canRead) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      client
        .companies()
        .then((result) => {
          if (!active) return;
          setCompanies(result.items);
          setCompanyId((current) => current || result.items[0]?.id || "");
          setError("");
        })
        .catch((caught) => {
          if (active) setError(message(caught));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canRead, client, sessionLoading]);

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!companyId || !canRead) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const [directory, totals] = await Promise.all([
          client.accounts({
            company_id: companyId,
            search: deferredSearch || undefined,
            bank: bank || undefined,
            currency: currency || undefined,
            state: state || undefined,
            sort_by: sortBy,
            sort_direction: sortDirection,
            limit: 50,
            cursor,
          }),
          append ? Promise.resolve(null) : client.summary(companyId),
        ]);
        setRows((current) => (append ? [...current, ...directory.items] : directory.items));
        setNextCursor(directory.next_cursor);
        if (totals) setSummary(totals.items);
        setError("");
      } catch (caught) {
        setError(message(caught));
        if (!append) {
          setRows([]);
          setSummary([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [bank, canRead, client, companyId, currency, deferredSearch, sortBy, sortDirection, state],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const banks = useMemo(() => [...new Set(rows.map((row) => row.bank_name))].sort(), [rows]);
  const currencies = useMemo(() => [...new Set(rows.map((row) => row.currency))].sort(), [rows]);

  if (!sessionLoading && !session) {
    return (
      <StateCard
        title="Sign in required"
        detail="Use an authenticated Nexora session to access governed bank accounts."
      />
    );
  }
  if (!sessionLoading && !canRead) {
    return <StateCard title="Permission required" detail="Your account does not have banking.bank_account.read." />;
  }

  return (
    <div className="space-y-5" aria-busy={loading}>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <label className="min-w-64 flex-1 text-sm font-medium text-foreground">
          Company
          <select
            className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.code} · {company.name}
              </option>
            ))}
          </select>
        </label>
        <p className="max-w-md text-sm text-muted-foreground">
          Balances are calculated from posted journal lines. Available and reconciliation values remain unavailable
          until those production workflows are delivered.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Bank account currency totals">
        {loading && summary.length === 0
          ? Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-lg border border-border bg-muted/50" />
            ))
          : summary.map((total) => (
              <article key={total.currency} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <span className="text-sm text-muted-foreground">Total held · {total.currency}</span>
                <strong className="mt-3 block text-2xl font-semibold text-foreground">
                  {money(total.ledger_balance, total.currency)}
                </strong>
                <small className="mt-2 block text-muted-foreground">
                  {total.account_count} active account{total.account_count === 1 ? "" : "s"}
                </small>
              </article>
            ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap gap-3 border-b border-border bg-muted/30 p-4">
          <Input
            className="min-w-64 flex-1"
            aria-label="Search bank accounts"
            placeholder="Search bank, account or reference..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Filter label="Bank" value={bank} onChange={setBank} options={banks} />
          <Filter label="Currency" value={currency} onChange={setCurrency} options={currencies} />
          <Filter
            label="Status"
            value={state}
            onChange={(value) => setState(value as BankAccountState | "")}
            options={accountStates.map(label)}
            optionValues={accountStates}
          />
          <Filter
            label="Sort"
            value={sortBy}
            onChange={(value) => setSortBy(value as typeof sortBy)}
            options={["Account name", "Bank name", "Currency", "Ledger balance", "Last movement"]}
            optionValues={["account_name", "bank_name", "currency", "ledger_balance", "last_movement_on"]}
          />
          <Button
            variant="outline"
            type="button"
            onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
            aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
          >
            {sortDirection === "asc" ? "↑" : "↓"}
          </Button>
          <Button variant="outline" type="button" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {error ? (
          <div
            className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            role="alert"
          >
            <strong className="block">Bank account data could not be loaded.</strong>
            <span>{error}</span>
            <Button className="mt-3" variant="outline" type="button" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : null}

        {!error && !loading && rows.length === 0 ? (
          <StateCard
            title="No bank accounts found"
            detail="No persisted account matches the selected company and filters."
          />
        ) : null}

        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  {[
                    "Bank",
                    "Account",
                    "Nominal",
                    "Cur.",
                    "Ledger balance",
                    "Available",
                    "Unreconciled",
                    "Last movement",
                    "Status",
                  ].map((heading) => (
                    <th key={heading} className="border-b border-border px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((account) => (
                  <tr key={account.id} className="border-b border-border/70 transition-colors hover:bg-muted/35">
                    <td className="px-4 py-4">
                      <button
                        className="font-semibold text-primary hover:underline"
                        type="button"
                        onClick={() => onOpenAccount(account.id)}
                      >
                        {account.bank_name}
                      </button>
                      <small className="mt-1 block text-muted-foreground">
                        {account.branch || "Branch not recorded"}
                      </small>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        className="font-semibold text-primary hover:underline"
                        type="button"
                        onClick={() => onOpenAccount(account.id)}
                      >
                        {account.account_name}
                      </button>
                      <small className="mt-1 block text-muted-foreground">
                        {account.account_number_masked} · {account.reference}
                      </small>
                    </td>
                    <td className="px-4 py-4">
                      {account.ledger_account_code}
                      <small className="mt-1 block text-muted-foreground">{account.ledger_account_name}</small>
                    </td>
                    <td className="px-4 py-4">{account.currency}</td>
                    <td className="px-4 py-4 text-right font-semibold tabular-nums">
                      {money(account.ledger_balance, account.currency)}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      {account.available_balance === null ? (
                        <span className="text-muted-foreground">Unavailable</span>
                      ) : (
                        money(account.available_balance, account.currency)
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {account.unreconciled_count === null ? (
                        <span className="text-muted-foreground">Unavailable</span>
                      ) : (
                        `${account.unreconciled_count} items`
                      )}
                    </td>
                    <td className="px-4 py-4">{account.last_movement_on ?? "No posted movement"}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                        {label(account.state)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
          <span>
            Showing {rows.length} persisted account{rows.length === 1 ? "" : "s"}
          </span>
          {nextCursor ? (
            <Button variant="outline" type="button" disabled={loadingMore} onClick={() => void load(nextCursor, true)}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Filter({
  label: fieldLabel,
  value,
  onChange,
  options,
  optionValues,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  optionValues?: readonly string[];
}) {
  return (
    <label className="contents">
      <span className="sr-only">{fieldLabel}</span>
      <select
        className="h-10 min-w-36 rounded-md border border-input bg-background px-3 text-sm"
        aria-label={fieldLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{fieldLabel}: All</option>
        {options.map((option, index) => (
          <option key={optionValues?.[index] ?? option} value={optionValues?.[index] ?? option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StateCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="m-4 rounded-lg border border-dashed border-border bg-muted/25 p-10 text-center" role="status">
      <strong className="block text-lg text-foreground">{title}</strong>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
