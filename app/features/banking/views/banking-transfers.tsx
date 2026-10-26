"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { BankTransferState, BankTransferSummary, BankingCompanyDirectory } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { BankingApiClient } from "../api/banking-client";
import { bankTransferStateLabel } from "../model/bank-transfer-status";

const states: readonly BankTransferState[] = ["draft", "submitted", "approved", "rejected", "posted", "reversed"];

export function BankingTransfers({ onCreate, onOpen }: { onCreate: () => void; onOpen: (id: string) => void }) {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("banking.transfer.read") ?? false;
  const canCreate = session?.user.permissions.includes("banking.transfer.create") ?? false;
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [state, setState] = useState<BankTransferState | "">("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [rows, setRows] = useState<BankTransferSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading || !canRead) return;
    let active = true;
    client
      .companies()
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
      })
      .catch(
        (caught) => active && setError(caught instanceof ApiError ? caught.message : "Companies could not be loaded."),
      );
    return () => {
      active = false;
    };
  }, [canRead, client, sessionLoading]);

  useEffect(() => {
    if (!companyId || !canRead) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      client
        .transfers({
          company_id: companyId,
          state: state || undefined,
          search: deferredSearch || undefined,
          sort_by: "posting_date",
          sort_direction: "desc",
          limit: 100,
        })
        .then((result) => {
          if (!active) return;
          setRows(result.items);
          setNextCursor(result.next_cursor);
        })
        .catch(
          (caught) =>
            active && setError(caught instanceof ApiError ? caught.message : "Bank Transfers could not be loaded."),
        )
        .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canRead, client, companyId, deferredSearch, state]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const result = await client.transfers({
        company_id: companyId,
        state: state || undefined,
        search: deferredSearch || undefined,
        sort_by: "posting_date",
        sort_direction: "desc",
        limit: 100,
        cursor: nextCursor,
      });
      setRows((current) => [...current, ...result.items]);
      setNextCursor(result.next_cursor);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "More Bank Transfers could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (sessionLoading) return <Notice title="Checking access" detail="Confirming your live Banking permissions." />;
  if (!session)
    return <Notice title="Sign in required" detail="Use an authenticated Nexora session to access Bank Transfers." />;
  if (!canRead) return <Notice title="Permission required" detail="banking.transfer.read is required." />;

  return (
    <div className="space-y-5" aria-busy={loading}>
      <header className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Banking &amp; Treasury</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Bank Transfers</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Same-company Bank Account movements with governed FX evidence and separate approval and posting.
          </p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={onCreate}>
            Add transfer
          </Button>
        ) : null}
      </header>
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="grid gap-3 border-b border-border bg-muted/25 p-4 md:grid-cols-3">
          <label htmlFor="transfer-directory-company" className="grid gap-1 text-sm font-medium">
            Company
            <select
              id="transfer-directory-company"
              className="h-10 rounded-md border border-input bg-background px-3"
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
          <label htmlFor="transfer-directory-state" className="grid gap-1 text-sm font-medium">
            State
            <select
              id="transfer-directory-state"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={state}
              onChange={(event) => setState(event.target.value as BankTransferState | "")}
            >
              <option value="">All states</option>
              {states.map((item) => (
                <option key={item} value={item}>
                  {bankTransferStateLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="transfer-search" className="grid gap-1 text-sm font-medium">
            Search
            <Input
              id="transfer-search"
              value={search}
              maxLength={160}
              placeholder="Reference, bank or details…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        {error ? (
          <div className="p-4">
            <Notice title="Bank Transfers could not be loaded" detail={error} destructive />
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                {["Reference", "Date", "From Bank", "To Bank", "Source amount", "Base total", "Lines", "State"].map(
                  (item) => (
                    <th className="px-4 py-3 font-semibold" key={item}>
                      {item}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No persisted Bank Transfers match these filters.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-semibold text-primary hover:underline"
                      onClick={() => onOpen(row.id)}
                    >
                      {row.reference}
                    </button>
                  </td>
                  <td className="px-4 py-3">{row.posting_date}</td>
                  <td className="max-w-56 px-4 py-3">{row.source_bank_summary}</td>
                  <td className="max-w-56 px-4 py-3">{row.destination_bank_summary}</td>
                  <td className="px-4 py-3">
                    {row.source_totals.map((total) => `${total.currency} ${total.amount}`).join(" · ")}
                  </td>
                  <td className="px-4 py-3">
                    {row.base_currency} {row.base_total}
                  </td>
                  <td className="px-4 py-3">{row.line_count}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        row.state === "posted" ? "default" : row.state === "rejected" ? "destructive" : "outline"
                      }
                    >
                      {bankTransferStateLabel(row.state)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nextCursor ? (
          <div className="flex justify-center border-t border-border p-4">
            <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Loading more…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Notice({ title, detail, destructive = false }: { title: string; detail: string; destructive?: boolean }) {
  return (
    <Alert variant={destructive ? "destructive" : "default"}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
