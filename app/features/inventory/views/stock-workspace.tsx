"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { StockWorkspace as Workspace, StockOperation, StockAction } from "@nexora/contracts";
import { ApiError } from "@/lib/api/generated";
import { inActiveCompany } from "@/lib/session/active-company";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WorkTable } from "@/shared/ui/work-table";
import { StockConfiguration } from "../components/stock-configuration";
import { StockMovementForm } from "../components/stock-movement-form";

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : "Stock could not be loaded or saved. Check your connection and retry.";
const accountEvidence = z.array(z.object({ id: z.string(), code: z.string(), name: z.string() }));
type Tab = "balances" | "movements" | "new" | "configuration";
export function StockWorkspace({
  recordRef,
  onNavigate,
  onDirtyChange,
}: {
  recordRef?: string;
  onNavigate: (module: string, page: string, reference?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, session, loading: sessionLoading } = useSession();
  const [company, setCompany] = useState(""),
    [companyLoaded, setCompanyLoaded] = useState(false);
  const [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [companyScope, setCompanyScope] = useState("");
  const scope = JSON.stringify({
    tenant: session?.tenant_id,
    user: session?.user.id,
    company: session?.active_company?.id,
    refresh,
  });
  const canRead = !!session?.user.permissions.includes("inventory.stock.read");
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api
      .listInventoryCompanies("transfers")
      .then(inActiveCompany)
      .then((result) => {
        if (active) {
          setCompany(result.items[0]?.id ?? "");
          setCompanyLoaded(true);
          setCompanyScope(scope);
        }
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [api, canRead, scope]);
  if (sessionLoading) return <p role="status">Loading your session…</p>;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Stock read access is required.</AlertDescription>
      </Alert>
    );
  if (!company || companyScope !== scope)
    return (
      <Alert variant={error ? "destructive" : "default"}>
        <AlertDescription>
          {error ||
            (companyLoaded && companyScope === scope
              ? "No authorized active company is available."
              : "Loading the active company…")}
          {error ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError("");
                setRefresh((n) => n + 1);
              }}
            >
              Retry
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  return (
    <CompanyStockWorkspace
      key={company}
      company={company}
      recordRef={recordRef}
      onNavigate={onNavigate}
      onDirtyChange={onDirtyChange}
    />
  );
}
function CompanyStockWorkspace({
  company,
  recordRef,
  onNavigate,
  onDirtyChange,
}: {
  company: string;
  recordRef?: string;
  onNavigate: (module: string, page: string, reference?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, session, csrfToken } = useSession();
  const [tab, setTab] = useState<Tab>(recordRef ? "movements" : "balances"),
    [asOf, setAsOf] = useState(new Date().toLocaleDateString("en-CA"));
  const [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<Workspace | null>(null);
  const [selected, setSelected] = useState<StockOperation | null>(null),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [dirty, setDirty] = useState(false);
  const lock = useRef(false),
    retry = useRef<{ body: string; key: string } | null>(null);
  const can = (permission: string) =>
    !!session?.user.permissions.includes(`inventory.stock.${permission}`) && !session?.impersonation;
  const reportDirty = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange?.(value);
    },
    [onDirtyChange],
  );
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setData(null);
    const query = new URLSearchParams({
      company_id: company,
      as_of: asOf,
      search,
      offset: String(offset),
      limit: "30",
    });
    const timer = window.setTimeout(() => {
      api
        .getStockWorkspace(`?${query}`)
        .then((result) => {
          if (active) setData(result);
        })
        .catch((error) => {
          if (active) setError(message(error));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, company, asOf, search, offset, refresh]);
  useEffect(() => {
    setSelected(null);
    setReason("");
    if (!recordRef) return;
    let active = true;
    api
      .getStockMovement(recordRef, company)
      .then((record) => {
        if (active) setSelected(record);
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [api, company, recordRef, refresh]);
  useEffect(() => {
    if (recordRef) setTab("movements");
  }, [recordRef]);
  function changeTab(next: Tab) {
    if (dirty && !window.confirm("Discard the unsaved stock form changes?")) return;
    reportDirty(false);
    setTab(next);
    setOffset(0);
    setRefresh((n) => n + 1);
  }
  async function action(action: StockAction["action"]) {
    if (!selected || lock.current || reason.trim().length < 3) return;
    const input = { company_id: company, expected_version: selected.version, action, reason },
      body = JSON.stringify({ id: selected.id, input });
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api.actOnStockMovement(selected.id, input, csrfToken(), retry.current.key);
      retry.current = null;
      reportDirty(false);
      setReason("");
      setRefresh((n) => n + 1);
    } catch (error) {
      setError(message(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const maker = selected?.maker_id === session?.user.id;
  const evidence = accountEvidence.safeParse(selected?.preview?.evidence.accounts);
  const accountName = (id: string) => {
    const account = evidence.success ? evidence.data.find((account) => account.id === id) : undefined;
    return account ? `${account.code} · ${account.name}` : id;
  };
  const total = tab === "balances" ? (data?.total_balances ?? 0) : (data?.total_operations ?? 0);
  const tabs: { id: Tab; label: string; enabled: boolean }[] = [
    { id: "balances", label: "Stock balances", enabled: true },
    { id: "movements", label: "Movements", enabled: true },
    { id: "new", label: "New movement", enabled: can("manage") },
    { id: "configuration", label: "Configuration", enabled: can("configure") },
  ];
  return (
    <section className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold">Stock movements & valuation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Actual stock, manufacturing cost and linked accounting. Drafts do not change balances.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={busy || dirty} onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </Button>
      </header>
      <div role="group" aria-label="Stock workspace views" className="flex flex-wrap gap-2">
        {tabs
          .filter((item) => item.enabled)
          .map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={tab === item.id ? "default" : "outline"}
              aria-pressed={tab === item.id}
              disabled={busy}
              onClick={() => changeTab(item.id)}
            >
              {item.label}
            </Button>
          ))}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading stock evidence…
        </p>
      ) : null}
      {data && !data.policy ? (
        <Alert>
          <AlertDescription>
            Company stock accounting mappings are not configured. Review Configuration before preparing postings.
          </AlertDescription>
        </Alert>
      ) : null}
      {tab === "new" && can("manage") ? (
        <StockMovementForm
          company={company}
          onDirtyChange={reportDirty}
          onCreated={(record) => {
            setSelected(record);
            setTab("movements");
            onNavigate("inventory", "stock-movements", record.id);
            setRefresh((n) => n + 1);
          }}
        />
      ) : null}
      {tab === "configuration" && data && can("configure") ? (
        <StockConfiguration
          company={company}
          policy={data.policy}
          onDirtyChange={reportDirty}
          onSaved={() => setRefresh((n) => n + 1)}
        />
      ) : null}
      {tab === "balances" || tab === "movements" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label="As of">
              <Input
                type="date"
                value={asOf}
                disabled={dirty}
                onChange={(event) => {
                  setAsOf(event.target.value);
                  setOffset(0);
                }}
              />
            </LabeledField>
            <LabeledField label={tab === "balances" ? "Search product" : "Search movement code"}>
              <Input
                value={search}
                disabled={dirty}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
              />
            </LabeledField>
          </div>
          {data ? (
            <WorkTable
              tableId="stock-workspace-register"
              label="Stock records"
              paging={false}
              tools={false}
              keyboardScroll
              className="w-full text-left text-sm"
            >
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {(tab === "balances"
                    ? ["Product", "Warehouse", "Quantity", "Unit", `Value (${data.base_currency})`]
                    : ["Movement", "Date", "Type", "State"]
                  ).map((label) => (
                    <th key={label} className="px-3 py-2 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tab === "balances"
                  ? data.balances.map((row) => (
                      <tr key={`${row.product_id}:${row.warehouse_id}`} className="border-t border-border">
                        <td className="px-3 py-2">
                          {row.product_code} · {row.product_name}
                        </td>
                        <td className="px-3 py-2">{row.warehouse_name}</td>
                        <td className="px-3 py-2 tabular-nums">{row.quantity}</td>
                        <td className="px-3 py-2">{row.unit}</td>
                        <td className="px-3 py-2 tabular-nums">{row.value}</td>
                      </tr>
                    ))
                  : data.operations.map((record) => (
                      <tr key={record.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            variant="link"
                            disabled={dirty}
                            onClick={() => onNavigate("inventory", "stock-movements", record.id)}
                          >
                            {record.code}
                          </Button>
                        </td>
                        <td className="px-3 py-2">{record.date}</td>
                        <td className="px-3 py-2">{record.kind.replaceAll("_", " ")}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline">{record.state}</Badge>
                        </td>
                      </tr>
                    ))}
                {!(tab === "balances" ? data.balances : data.operations).length ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No matching posted balances or movements.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </WorkTable>
          ) : null}
          <div className="flex items-center justify-end gap-3 text-sm">
            <Button
              type="button"
              variant="outline"
              disabled={busy || dirty || offset === 0}
              onClick={() => setOffset((n) => Math.max(0, n - 30))}
            >
              Previous
            </Button>
            <span>{total ? `${offset + 1}–${Math.min(offset + 30, total)} of ${total}` : "0 records"}</span>
            <Button
              type="button"
              variant="outline"
              disabled={busy || dirty || offset + 30 >= total}
              onClick={() => setOffset((n) => n + 30)}
            >
              Next
            </Button>
          </div>
        </>
      ) : null}
      {tab === "movements" && selected ? (
        <article className="space-y-4 rounded-lg border border-border bg-card p-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-lg font-semibold">
              {selected.code} · {selected.kind.replaceAll("_", " ")}
            </h2>
            <Badge variant="outline">
              {selected.state} · version {selected.version}
            </Badge>
          </header>
          <p className="m-0 text-sm">
            {selected.date} · {selected.input.reference || "No external reference"} · {selected.input.reason}
          </p>
          {selected.preview ? (
            <>
              <h3 className="m-0 text-base font-medium">
                Quantity and cost evidence · {selected.preview.base_currency}
              </h3>
              <WorkTable
                tableId="stock-entry-evidence"
                keyboardScroll
                label="Stock quantity and cost evidence"
                paging={false}
                tools={false}
                className="w-full text-left text-sm"
              >
                <thead>
                  <tr>
                    {["Product", "Warehouse", "Quantity", "Value", "Costing"].map((label) => (
                      <th key={label} className="px-3 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.preview.entries.map((entry, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">
                        {entry.product_code} · {entry.product_name}
                      </td>
                      <td className="px-3 py-2">{entry.warehouse_name}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {entry.quantity} {entry.unit}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{entry.value}</td>
                      <td className="px-3 py-2">{entry.method.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </WorkTable>
              {selected.input.kind === "manufacturing_charge" ? (
                <div className="grid gap-2">
                  <h3 className="m-0 text-base font-medium">Approved actual expense allocations</h3>
                  <p className="m-0 text-sm text-muted-foreground">
                    Production batch: {selected.input.source_id}. These amounts increase WIP value without changing
                    physical quantities.
                  </p>
                  <ul className="m-0 grid gap-1 pl-5 text-sm">
                    {selected.input.allocations.map((line) => (
                      <li key={line.journal_line_id}>
                        Expense journal line {line.journal_line_id}: {line.amount} {selected.preview!.base_currency}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <h3 className="m-0 text-base font-medium">Accounting preview</h3>
              <WorkTable
                tableId="stock-journal-evidence"
                keyboardScroll
                label="Stock accounting evidence"
                paging={false}
                tools={false}
                className="w-full text-left text-sm"
              >
                <thead>
                  <tr>
                    {["Account", "Description", "Debit", "Credit"].map((label) => (
                      <th key={label} className="px-3 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.preview.lines.map((line, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">{accountName(line.accountId)}</td>
                      <td className="px-3 py-2">{line.description}</td>
                      <td className="px-3 py-2 tabular-nums">{line.debit}</td>
                      <td className="px-3 py-2 tabular-nums">{line.credit}</td>
                    </tr>
                  ))}
                </tbody>
              </WorkTable>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Submit this draft to calculate and freeze its source quantities, valuation and accounting preview.
            </p>
          )}
          {selected.journal_id ? (
            <p className="break-all text-sm text-muted-foreground">Posted journal reference: {selected.journal_id}</p>
          ) : null}
          {!["posted", "reversed", "cancelled"].includes(selected.state) ? (
            <>
              <LabeledField label="Decision reason">
                <Textarea
                  value={reason}
                  maxLength={500}
                  onChange={(event) => {
                    setReason(event.target.value);
                    reportDirty(!!event.target.value);
                  }}
                />
              </LabeledField>
              <div className="flex flex-wrap gap-2">
                {maker && can("manage") && ["draft", "rejected"].includes(selected.state) ? (
                  <>
                    <Button
                      type="button"
                      disabled={busy || reason.trim().length < 3}
                      onClick={() => void action("submit")}
                    >
                      Submit for review
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || reason.trim().length < 3}
                      onClick={() => void action("cancel")}
                    >
                      Cancel draft
                    </Button>
                  </>
                ) : null}
                {!maker && can("approve") && selected.state === "submitted" ? (
                  <Button
                    type="button"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => void action("approve")}
                  >
                    Approve evidence
                  </Button>
                ) : null}
                {!maker && can("approve") && ["submitted", "approved"].includes(selected.state) ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => void action("reject")}
                  >
                    Return for correction
                  </Button>
                ) : null}
                {!maker && can("post") && selected.state === "approved" ? (
                  <Button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void action("post")}>
                    Post stock & accounting
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
