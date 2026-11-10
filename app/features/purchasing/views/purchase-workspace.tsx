"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcurementCompanies, ProcurementOptions, PurchaseDocument, Supplier } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { purchaseError } from "../api/purchasing-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LabeledField } from "@/shared/ui/labeled-field";
import { purchaseStep, nextPurchaseStep, purchaseSelectClass } from "../model/purchase-workflow";
import { PurchaseDocumentForm } from "../components/purchase-document-form";
import { PurchaseSuppliers } from "../components/purchase-suppliers";
import { downloadPurchaseCsv, PURCHASE_EXPORT_EVENT } from "../model/purchase-export";

export function PurchaseWorkspace({
  page,
  recordRef,
  onNavigate,
  onDirtyChange,
}: {
  page: string;
  recordRef?: string;
  onNavigate: (module: string, page: string, reference?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, session, loading: sessionLoading } = useSession();
  const [companies, setCompanies] = useState<ProcurementCompanies["items"]>([]),
    [company, setCompany] = useState("");
  const [options, setOptions] = useState<ProcurementOptions>({ currencies: [], execution_mode: "instruction_only" });
  const [optionsCompany, setOptionsCompany] = useState("");
  const [records, setRecords] = useState<PurchaseDocument[]>([]),
    [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cursor, setCursor] = useState<string | null>(null),
    [supplierCursor, setSupplierCursor] = useState<string | null>(null);
  const [search, setSearch] = useState(""),
    [state, setState] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [formDirty, setFormDirty] = useState(false);
  const reportDirty = useCallback(
    (value: boolean) => {
      setFormDirty(value);
      onDirtyChange?.(value);
    },
    [onDirtyChange],
  );
  const generation = useRef(0),
    step = purchaseStep(page);
  const canRead = !!session?.user.permissions.includes("procurement.document.read");
  const canReadSuppliers = !!session?.user.permissions.includes("procurement.vendor.read");
  const supplierPage = page === "suppliers" || page === "add-supplier";
  const editing = !supplierPage && (page === step.form || !!recordRef);
  const navigate = (target: string, reference?: string) => onNavigate("purchases", target, reference);
  useEffect(() => {
    if (editing || supplierPage) return;
    const exportRecords = () => {
      if (busy || !records.length) {
        setError("Wait for Purchase records to load before exporting.");
        return;
      }
      downloadPurchaseCsv(records, `${step.page}-loaded-records.csv`);
    };
    window.addEventListener(PURCHASE_EXPORT_EVENT, exportRecords);
    return () => window.removeEventListener(PURCHASE_EXPORT_EVENT, exportRecords);
  }, [editing, supplierPage, busy, records, step.page]);
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api
      .listProcurementCompanies()
      .then((result) => {
        if (active) {
          setCompanies(result.items);
          setCompany((current) =>
            result.items.some((item) => item.id === current)
              ? current
              : (result.items.find(
                  (item) => item.id === window.localStorage.getItem(`nexora-purchase-company:${session?.tenant_id}`),
                )?.id ??
                result.items[0]?.id ??
                ""),
          );
        }
      })
      .catch((caught) => {
        if (active) setError(purchaseError(caught));
      });
    return () => {
      active = false;
    };
  }, [api, canRead, session?.tenant_id]);
  useEffect(() => {
    if (!company) return;
    let active = true;
    Promise.all([
      api.getProcurementOptions(company),
      canReadSuppliers
        ? api.listPurchaseSuppliers(`?${new URLSearchParams({ company_id: company, limit: "100" })}`)
        : Promise.resolve({ items: [], next_cursor: null }),
    ])
      .then(([settings, vendors]) => {
        if (active) {
          setOptions(settings);
          setOptionsCompany(company);
          setSuppliers(vendors.items);
          setSupplierCursor(vendors.next_cursor);
        }
      })
      .catch((caught) => {
        if (active) setError(purchaseError(caught));
      });
    return () => {
      active = false;
    };
  }, [api, company, canReadSuppliers, refresh]);
  useEffect(() => {
    if (!company || editing || supplierPage) return;
    const token = ++generation.current;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      setRecords([]);
      setCursor(null);
      api
        .listPurchaseDocuments(
          `?${new URLSearchParams({ company_id: company, kind: step.kind, search, limit: "50", ...(state ? { state } : {}) })}`,
        )
        .then((result) => {
          if (token === generation.current) {
            setRecords(result.items);
            setCursor(result.next_cursor);
          }
        })
        .catch((caught) => {
          if (token === generation.current) setError(purchaseError(caught));
        })
        .finally(() => {
          if (token === generation.current) setBusy(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      generation.current = token + 1;
    };
  }, [api, company, step.kind, search, state, refresh, editing, supplierPage]);
  async function moreSuppliers() {
    if (!supplierCursor || busy) return;
    setBusy(true);
    try {
      const result = await api.listPurchaseSuppliers(
        `?${new URLSearchParams({ company_id: company, limit: "100", cursor: supplierCursor })}`,
      );
      setSuppliers((current) => [
        ...current,
        ...result.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setSupplierCursor(result.next_cursor);
    } catch (caught) {
      setError(purchaseError(caught));
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const result = await api.listPurchaseDocuments(
        `?${new URLSearchParams({ company_id: company, kind: step.kind, search, limit: "50", cursor, ...(state ? { state } : {}) })}`,
      );
      setRecords((current) => [...current, ...result.items]);
      setCursor(result.next_cursor);
    } catch (caught) {
      setError(purchaseError(caught));
    } finally {
      setBusy(false);
    }
  }
  if (sessionLoading) return <p role="status">Loading your Purchase permissions…</p>;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Your account requires Purchase read access for this workspace.</AlertDescription>
      </Alert>
    );
  return (
    <div className="grid min-w-0 gap-4 text-foreground">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="m-0 text-xl font-semibold">
            {supplierPage
              ? "Suppliers"
              : editing && !["payment", "multi_payment"].includes(step.kind)
                ? "Purchase workflow"
                : step.label}
          </h1>
          <p className="mb-0 mt-1 text-sm text-muted-foreground">
            {supplierPage
              ? "Manage suppliers for this company within Purchases."
              : editing && !["payment", "multi_payment"].includes(step.kind)
                ? "Create, review and follow the linked purchase documents here."
                : "Purchase Request → RFQ → Order → Receive Products → Bills → Payment"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing && !supplierPage ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !records.length}
              onClick={() => downloadPurchaseCsv(records, `${step.page}-loaded-records.csv`)}
            >
              Export loaded rows
            </Button>
          ) : null}
          {!supplierPage && canReadSuppliers ? (
            <Button variant="outline" onClick={() => navigate("suppliers")}>
              Suppliers
            </Button>
          ) : null}
          {supplierPage ? (
            <Button variant="outline" onClick={() => navigate("purchase-requisitions")}>
              Back to Purchases
            </Button>
          ) : !editing ? (
            <Button
              disabled={!company || !session?.user.permissions.includes("procurement.document.create")}
              onClick={() => navigate(step.form)}
            >
              Add {step.label === "Bills" ? "Bill" : step.label}
            </Button>
          ) : null}
        </div>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button type="button" variant="link" onClick={() => setRefresh((value) => value + 1)}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LabeledField label="Company">
          <select
            aria-label="Purchase company"
            className={purchaseSelectClass}
            value={company}
            disabled={editing || formDirty}
            onChange={(event) => {
              setCompany(event.target.value);
              setSearch("");
            }}
          >
            <option value="">Select company</option>
            {companies.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </LabeledField>
        {!editing && !supplierPage ? (
          <>
            <LabeledField label="Search">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Code, supplier or reference"
              />
            </LabeledField>
            <LabeledField label="Status">
              <select className={purchaseSelectClass} value={state} onChange={(event) => setState(event.target.value)}>
                <option value="">All statuses</option>
                {["draft", "submitted", "approved", "rejected", "cancelled"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </LabeledField>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>
              Refresh
            </Button>
          </>
        ) : null}
      </div>
      {!companies.length && !error ? (
        <p className="text-sm text-muted-foreground">No company is available for your Purchase permissions.</p>
      ) : null}
      {company && supplierPage ? (
        <PurchaseSuppliers
          key={`${company}:${page}`}
          company={company}
          initialCreate={page === "add-supplier"}
          currencies={optionsCompany === company ? options.currencies : []}
          onClose={page === "add-supplier" ? () => navigate("suppliers") : undefined}
          suppliers={suppliers}
          canLoadMore={!!supplierCursor}
          onMore={() => void moreSuppliers()}
          busy={busy}
          onSaved={() => {
            setRefresh((value) => value + 1);
            if (page === "add-supplier") navigate("suppliers");
          }}
          onDirtyChange={reportDirty}
        />
      ) : null}
      {company && editing && optionsCompany === company ? (
        <PurchaseDocumentForm
          key={`${company}:${page}:${recordRef ?? "new"}`}
          company={company}
          kind={step.kind}
          reference={recordRef}
          options={options}
          suppliers={suppliers}
          onMoreSuppliers={supplierCursor ? () => void moreSuppliers() : undefined}
          onClose={() => navigate(step.page)}
          onNavigate={navigate}
          onDirtyChange={reportDirty}
        />
      ) : null}
      {!supplierPage && !editing && company ? (
        <section
          aria-label={`${step.label} register`}
          className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
          aria-busy={busy}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  {["Code", "Date", "Supplier", "Source", "Amount", "Status", "Actions"].map((label) => (
                    <th className="px-3 py-2 font-medium" scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => navigate(step.form, record.id)}
                      >
                        {record.code}
                      </Button>
                    </td>
                    <td className="px-3 py-2">{record.document_date}</td>
                    <td className="px-3 py-2">
                      {record.supplier_name ?? (record.kind === "multi_payment" ? "Multiple suppliers" : "—")}
                    </td>
                    <td className="px-3 py-2">{record.source_code ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {record.currency} {record.total_amount}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="capitalize">
                        {record.state}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate(step.form, record.id)}>
                          Open
                        </Button>
                        {record.state === "approved" &&
                        nextPurchaseStep(record.kind) &&
                        record.kind !== "payment" &&
                        session?.user.permissions.includes("procurement.document.create") &&
                        !session.impersonation ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const next = nextPurchaseStep(record.kind)!;
                              navigate(next.form, `from:${record.id}`);
                            }}
                          >
                            {record.kind === "order" ? "Receive Products" : nextPurchaseStep(record.kind)!.label}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!records.length ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      {busy
                        ? "Loading Purchase records…"
                        : "No matching records. Create the first record or adjust the filters."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {cursor ? (
            <div className="border-t border-border p-3">
              <Button variant="outline" disabled={busy} onClick={() => void more()}>
                Load more records
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
      {!editing && !supplierPage && ["payment", "multi_payment"].includes(step.kind) ? (
        <p className="m-0 text-xs text-muted-foreground">
          These are supplier payment instructions. Approval reserves bill allocations; it does not execute a bank
          payment or mark a bill paid.
        </p>
      ) : null}
    </div>
  );
}
