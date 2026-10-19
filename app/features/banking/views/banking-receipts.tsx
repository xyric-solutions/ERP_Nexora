"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  BankReceiptOptions,
  BankReceiptState,
  BankReceiptSummary,
  BankingCompanyDirectory,
} from "@nexora/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { BankingApiClient } from "../api/banking-client";

const receiptStates: readonly BankReceiptState[] = ["draft", "submitted", "approved", "rejected", "posted", "reversed"];
type ReceiptSort = "posting_date" | "reference" | "total_amount" | "state";

interface LoadFailure {
  title: string;
  detail: string;
  retryable: boolean;
}

export interface BankingReceiptsProps {
  onOpenReceipt: (receiptId: string) => void;
  onCreateReceipt?: () => void;
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function money(value: string, currency: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return `${currency} ${value}`;
  try {
    const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(BigInt(match[1]));
    const fraction = (match[2] ?? "").padEnd(2, "0");
    const decimal = new Intl.NumberFormat(undefined).formatToParts(1.1).find((part) => part.type === "decimal")?.value;
    return `${currency} ${integer}${fraction ? `${decimal ?? "."}${fraction}` : ""}`;
  } catch {
    return `${currency} ${value}`;
  }
}

function date(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function failure(error: unknown): LoadFailure {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return {
        title: "Bank receipt access denied",
        detail: "The API denied access to these company-scoped bank receipts.",
        retryable: true,
      };
    }
    return { title: "Bank receipts could not be loaded", detail: error.message, retryable: true };
  }
  return {
    title: "Bank receipts could not be loaded",
    detail: "Bank receipt data is temporarily unavailable. Retry after checking the API connection.",
    retryable: true,
  };
}

function stateVariant(state: BankReceiptState): "default" | "secondary" | "destructive" | "outline" {
  if (state === "posted") return "default";
  if (state === "rejected") return "destructive";
  if (state === "submitted" || state === "approved") return "secondary";
  return "outline";
}

export function BankingReceipts({ onOpenReceipt, onCreateReceipt }: BankingReceiptsProps) {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("banking.receipt.read") ?? false;
  const canCreate = session?.user.permissions.includes("banking.receipt.create") ?? false;
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankReceiptOptions["bank_accounts"]>([]);
  const [rows, setRows] = useState<BankReceiptSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [bankAccountId, setBankAccountId] = useState("");
  const [state, setState] = useState<BankReceiptState | "">("");
  const [postingDateFrom, setPostingDateFrom] = useState("");
  const [postingDateTo, setPostingDateTo] = useState("");
  const [sortBy, setSortBy] = useState<ReceiptSort>("posting_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailure, setLoadFailure] = useState<LoadFailure | null>(null);
  const [companyReload, setCompanyReload] = useState(0);
  const companyRequest = useRef(0);
  const directoryRequest = useRef(0);

  const invalidateDirectory = useCallback(() => {
    directoryRequest.current += 1;
    setRows([]);
    setNextCursor(null);
    setLoadFailure(null);
  }, []);

  useEffect(() => {
    if (sessionLoading || !canRead) return;
    const request = ++companyRequest.current;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingCompanies(true);
      setCompanies([]);
      setCompanyId("");
      setBankAccounts([]);
      invalidateDirectory();
      client
        .companies()
        .then((result) => {
          if (!active || request !== companyRequest.current) return;
          setCompanies(result.items);
          setCompanyId(result.items[0]?.id ?? "");
          setLoadFailure(null);
        })
        .catch((caught) => {
          if (!active || request !== companyRequest.current) return;
          setCompanies([]);
          setCompanyId("");
          setBankAccounts([]);
          setRows([]);
          setNextCursor(null);
          setLoadFailure(failure(caught));
        })
        .finally(() => {
          if (active && request === companyRequest.current) setLoadingCompanies(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canRead, client, companyReload, invalidateDirectory, sessionLoading]);

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!companyId || !canRead) return;
      const request = ++directoryRequest.current;
      if (postingDateFrom && postingDateTo && postingDateFrom > postingDateTo) {
        setRows([]);
        setNextCursor(null);
        setLoadFailure({
          title: "Check the posting date range",
          detail: "The ending posting date cannot be before the starting posting date.",
          retryable: false,
        });
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setRows([]);
        setNextCursor(null);
        setLoadFailure(null);
      }

      try {
        const [directory, options] = await Promise.all([
          client.receipts({
            company_id: companyId,
            bank_account_id: bankAccountId || undefined,
            state: state || undefined,
            posting_date_from: postingDateFrom || undefined,
            posting_date_to: postingDateTo || undefined,
            search: deferredSearch || undefined,
            sort_by: sortBy,
            sort_direction: sortDirection,
            limit: 50,
            cursor,
          }),
          append ? Promise.resolve(null) : client.receiptOptions({ company_id: companyId }),
        ]);
        if (request !== directoryRequest.current) return;
        setRows((current) => (append ? [...current, ...directory.items] : directory.items));
        setNextCursor(directory.next_cursor);
        if (options) setBankAccounts(options.bank_accounts);
        setLoadFailure(null);
      } catch (caught) {
        if (request !== directoryRequest.current) return;
        setRows([]);
        setNextCursor(null);
        setBankAccounts([]);
        setLoadFailure(failure(caught));
      } finally {
        if (request === directoryRequest.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [bankAccountId, canRead, client, companyId, deferredSearch, postingDateFrom, postingDateTo, sortBy, sortDirection, state],
  );

  useEffect(() => {
    if (!companyId || !canRead) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [canRead, companyId, load]);

  if (sessionLoading) return <StateCard title="Checking banking access" detail="Confirming your live Nexora session and permissions." />;
  if (!session) return <StateCard title="Sign in required" detail="Use an authenticated Nexora session to access bank receipts." />;
  if (!canRead) return <StateCard title="Permission required" detail="Your account does not have banking.receipt.read." />;

  return (
    <div className="space-y-5" aria-busy={loadingCompanies || loading || loadingMore}>
      <header className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Banking &amp; Treasury</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Bank Receipts</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Review persisted incoming funds, payer snapshots, approval state and posting dates for the selected company.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled aria-describedby="bank-receipts-export-note" title="Export is not available until a governed receipt export is delivered.">
              Export unavailable
            </Button>
            {canCreate && onCreateReceipt ? <Button type="button" onClick={onCreateReceipt}>Add bank receipt</Button> : null}
          </div>
          <p id="bank-receipts-export-note" className="max-w-sm text-xs text-muted-foreground sm:text-right">
            Export is disabled because no governed receipt export endpoint is available yet.
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm" aria-label="Bank receipts">
        <div className="grid gap-3 border-b border-border bg-muted/25 p-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Company">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={companyId} disabled={loadingCompanies || companies.length === 0} onChange={(event) => {
              directoryRequest.current += 1;
              setCompanyId(event.target.value);
              setBankAccountId("");
              setBankAccounts([]);
              setRows([]);
              setNextCursor(null);
              setLoadFailure(null);
            }}>
              {companies.length === 0 ? <option value="">No accessible companies</option> : null}
              {companies.map((company) => <option key={company.id} value={company.id}>{company.code} · {company.name}</option>)}
            </select>
          </Field>
          <Field label="Bank account">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={bankAccountId} disabled={!companyId || loadingCompanies} onChange={(event) => { invalidateDirectory(); setBankAccountId(event.target.value); }}>
              <option value="">All bank accounts</option>
              {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.account_name} · {account.account_number_masked}</option>)}
            </select>
          </Field>
          <Field label="Receipt state">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={state} onChange={(event) => { invalidateDirectory(); setState(event.target.value as BankReceiptState | ""); }}>
              <option value="">All states</option>
              {receiptStates.map((receiptState) => <option key={receiptState} value={receiptState}>{label(receiptState)}</option>)}
            </select>
          </Field>
          <Field label="Search receipts">
            <Input className="h-10" maxLength={160} placeholder="Reference, payer or nominal account…" value={search} onChange={(event) => { invalidateDirectory(); setSearch(event.target.value); }} />
          </Field>
          <Field label="Posting date from">
            <Input className="h-10" type="date" value={postingDateFrom} onChange={(event) => { invalidateDirectory(); setPostingDateFrom(event.target.value); }} />
          </Field>
          <Field label="Posting date to">
            <Input className="h-10" type="date" value={postingDateTo} onChange={(event) => { invalidateDirectory(); setPostingDateTo(event.target.value); }} />
          </Field>
          <Field label="Sort receipts">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={sortBy} onChange={(event) => { invalidateDirectory(); setSortBy(event.target.value as ReceiptSort); }}>
              <option value="posting_date">Posting date</option><option value="reference">Reference</option><option value="total_amount">Total amount</option><option value="state">State</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Button className="flex-1" type="button" variant="outline" onClick={() => { invalidateDirectory(); setSortDirection((current) => current === "asc" ? "desc" : "asc"); }} aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}>
              {sortDirection === "asc" ? "Ascending ↑" : "Descending ↓"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || !companyId}>Refresh</Button>
          </div>
        </div>

        {loadFailure ? <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          <strong className="block">{loadFailure.title}</strong><span>{loadFailure.detail}</span>
          {loadFailure.retryable ? <Button className="mt-3" type="button" variant="outline" onClick={() => companyId ? void load() : setCompanyReload((current) => current + 1)}>Retry</Button> : null}
        </div> : null}
        {!loadFailure && loading && rows.length === 0 ? <div className="space-y-2 p-4" role="status" aria-label="Loading bank receipts">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-md bg-muted/60" />)}</div> : null}
        {!loadFailure && !loading && !loadingCompanies && !companyId ? <StateCard title="No accessible companies" detail="No company is available to your authenticated banking scope." /> : null}
        {!loadFailure && !loading && companyId && rows.length === 0 ? <StateCard title="No bank receipts found" detail="No persisted receipt matches the selected company and server-side filters." /> : null}

        {rows.length > 0 ? <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] border-collapse text-left text-sm">
            <caption className="sr-only">Persisted bank receipts for the selected company</caption>
            <thead className="bg-muted/50 text-xs uppercase tracking-[0.08em] text-muted-foreground"><tr>
              {["Reference", "Dates", "Bank account", "Received from", "Nominal account", "Currency", "Lines", "Total", "State"].map((heading) => <th key={heading} className="border-b border-border px-4 py-3 font-semibold" scope="col">{heading}</th>)}
            </tr></thead>
            <tbody>{rows.map((receipt) => <tr key={receipt.id} className="border-b border-border/70 transition-colors hover:bg-muted/35">
              <td className="px-4 py-3.5"><button className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="button" onClick={() => onOpenReceipt(receipt.id)}>{receipt.reference}</button><small className="mt-1 block text-muted-foreground">Version {receipt.version}</small></td>
              <td className="whitespace-nowrap px-4 py-3.5"><span className="block font-medium">Posted {date(receipt.posting_date)}</span><small className="mt-1 block text-muted-foreground">Value {receipt.value_date ? date(receipt.value_date) : "not set"}</small></td>
              <td className="px-4 py-3.5"><span className="block font-medium text-foreground">{receipt.bank_account_name}</span><small className="mt-1 block text-muted-foreground">{receipt.bank_name} · {receipt.account_number_masked}</small></td>
              <td className="max-w-64 px-4 py-3.5 text-muted-foreground">{receipt.payer_summary ?? "Payer not recorded"}</td>
              <td className="max-w-72 px-4 py-3.5 text-muted-foreground">{receipt.nominal_account_summary ?? receipt.narration_summary ?? "No nominal summary"}</td>
              <td className="px-4 py-3.5 font-medium">{receipt.currency}</td>
              <td className="px-4 py-3.5 text-right tabular-nums">{receipt.line_count}</td>
              <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{money(receipt.total_amount, receipt.currency)}</td>
              <td className="px-4 py-3.5"><Badge variant={stateVariant(receipt.state)}>{label(receipt.state)}</Badge></td>
            </tr>)}</tbody>
          </table>
        </div> : null}
        <footer className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
          <span aria-live="polite">Showing {rows.length} persisted receipt{rows.length === 1 ? "" : "s"}</span>
          {nextCursor ? <Button variant="outline" type="button" disabled={loadingMore} onClick={() => void load(nextCursor, true)}>{loadingMore ? "Loading…" : "Load more"}</Button> : null}
        </footer>
      </section>
    </div>
  );
}

function Field({ label: fieldLabel, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"><span className="mb-1.5 block">{fieldLabel}</span>{children}</label>;
}

function StateCard({ title, detail }: { title: string; detail: string }) {
  return <div className="m-4 rounded-lg border border-dashed border-border bg-muted/25 p-10 text-center" role="status"><strong className="block text-lg text-foreground">{title}</strong><p className="mt-2 text-sm text-muted-foreground">{detail}</p></div>;
}
