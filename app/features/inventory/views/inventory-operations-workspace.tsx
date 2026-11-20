"use client";
import { inActiveCompany } from "@/lib/session/active-company";
import { WorkTable } from "@/shared/ui/work-table";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import type { Warehouse, StockTransfer } from "@nexora/contracts";
import { Plus } from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WarehouseForm } from "../components/warehouse-form";
import { StockTransferForm } from "../components/stock-transfer-form";
import { productError, productSelectClass } from "../model/products";

export function InventoryOperationsWorkspace({
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
  const { api, session, loading: sessionLoading } = useSession(),
    warehouse = page === "warehouses" || page === "add-warehouse",
    surface = warehouse ? "warehouses" : "transfers",
    listPage = warehouse ? "warehouses" : "stock-transfers",
    formPage = warehouse ? "add-warehouse" : "add-stock-transfer",
    title = warehouse ? "Warehouse" : "Stock Transfer",
    editing = page === formPage || !!recordRef;
  const [companiesLoaded, setCompaniesLoaded] = useState(false),
    [company, setCompany] = useState(""),
    [records, setRecords] = useState<(Warehouse | StockTransfer)[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("active"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [loadedScope, setLoadedScope] = useState(""),
    [dirty, setDirty] = useState(false);
  const generation = useRef(0),
    canRead = !!session?.user.permissions.includes(warehouse ? "inventory.bin.read" : "inventory.stock.read"),
    canCreate =
      !!session?.user.permissions.includes(warehouse ? "inventory.bin.create" : "inventory.item.create") &&
      !session?.impersonation;
  const scope = JSON.stringify({ company, search, status: warehouse ? status : "", refresh, surface });
  const reportDirty = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange?.(value);
    },
    [onDirtyChange],
  );
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api
      .listInventoryCompanies(surface)
      // Only the company chosen at sign-in is in scope; the API rejects any other company.
      .then(inActiveCompany)
      .then((result) => {
        if (active) {
          setCompaniesLoaded(true);
          setCompany((current) =>
            result.items.some((c) => c.id === current)
              ? current
              : (result.items.find(
                  (c) => c.id === window.localStorage.getItem(`nexora-inventory-company:${session?.tenant_id}`),
                )?.id ??
                result.items[0]?.id ??
                ""),
          );
        }
      })
      .catch((e) => {
        if (active) setError(productError(e));
      });
    return () => {
      active = false;
    };
  }, [api, canRead, surface, session?.tenant_id, refresh]);
  const query = useCallback(
    (after?: string) =>
      `?${new URLSearchParams({ company_id: company, search, limit: "30", ...(warehouse && status ? { status } : {}), ...(after ? { cursor: after } : {}) })}`,
    [company, search, warehouse, status],
  );
  const readDirectory = useCallback(
    (after?: string) => (warehouse ? api.listWarehouses(query(after)) : api.listStockTransfers(query(after))),
    [api, warehouse, query],
  );
  useEffect(() => {
    if (!company || editing) return;
    const token = ++generation.current;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      readDirectory()
        .then((result) => {
          if (token === generation.current) {
            setRecords(result.items);
            setCursor(result.next_cursor);
            setLoadedScope(scope);
          }
        })
        .catch((e) => {
          if (token === generation.current) {
            setRecords([]);
            setCursor(null);
            setError(productError(e));
            setLoadedScope(scope);
          }
        })
        .finally(() => {
          if (token === generation.current) setBusy(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      generation.current = token + 1;
    };
  }, [company, editing, readDirectory, scope]);
  async function more() {
    if (busy || !cursor) return;
    const token = generation.current;
    setBusy(true);
    try {
      const result = await readDirectory(cursor);
      if (token === generation.current) {
        setRecords((current) => [...current, ...result.items]);
        setCursor(result.next_cursor);
      }
    } catch (e) {
      if (token === generation.current) setError(productError(e));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function open(id?: string) {
    onNavigate("inventory", formPage, id);
  }
  const shown = loadedScope === scope ? records : [],
    loading = busy || loadedScope !== scope;
  if (sessionLoading) return <p role="status">Loading Inventory permissions…</p>;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Your account needs {title.toLowerCase()} read access for this company.</AlertDescription>
      </Alert>
    );
  return (
    <div className="min-w-0 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        {!editing ? (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="m-0 text-lg font-semibold">{title}</h1>
            <p className="m-0 text-sm text-muted-foreground">
              {warehouse
                ? "Manage warehouse locations and contact details."
                : "Prepare draft product movements between warehouses."}
            </p>
          </div>
        ) : (
          <Button
            type="button"
            variant="link"
            className="px-0"
            onClick={() => {
              if (!dirty || window.confirm("Discard these unsaved Inventory changes?")) {
                reportDirty(false);
                onNavigate("inventory", listPage);
              }
            }}
          >
            {title}
          </Button>
        )}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-9"
                disabled={busy}
                onClick={() => setRefresh((n) => n + 1)}
              >
                Refresh
              </Button>
              {canCreate ? (
                <Button type="button" className="h-9" disabled={!company} onClick={() => open()}>
                  <Plus aria-hidden="true" />
                  Add New
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setError("");
                setRefresh((n) => n + 1);
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!company ? (
        <p role="status" className="py-8 text-sm text-muted-foreground">
          {companiesLoaded ? "No companies are available for this Inventory page." : "Loading available companies…"}
        </p>
      ) : editing ? (
        warehouse ? (
          <WarehouseForm
            key={`${company}:${recordRef ?? "new"}`}
            company={company}
            recordRef={recordRef}
            onClose={() => onNavigate("inventory", listPage)}
            onDirtyChange={reportDirty}
          />
        ) : (
          <StockTransferForm
            key={`${company}:${recordRef ?? "new"}`}
            company={company}
            recordRef={recordRef}
            onClose={() => onNavigate("inventory", listPage)}
            onDirtyChange={reportDirty}
          />
        )
      ) : (
        <>
          <section
            aria-label={`${title} filters`}
            className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-2.5"
          >
            <LabeledField label={`Search ${title.toLowerCase()}`} className="w-full sm:max-w-md sm:flex-1">
              <Input
                className="h-9"
                maxLength={160}
                value={search}
                placeholder={warehouse ? "Code, name or location" : "Code, reference or warehouse"}
                onChange={(e) => setSearch(e.target.value)}
              />
            </LabeledField>
            {warehouse ? (
              <LabeledField label="Status" className="w-full sm:w-40">
                <select
                  className={cn(productSelectClass, "h-9")}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </LabeledField>
            ) : null}
          </section>
          <p role="status" className="m-0 text-xs text-muted-foreground">
            {loading
              ? "Loading records…"
              : `${shown.length} ${warehouse ? "warehouse" : "transfer"}${shown.length === 1 ? "" : "s"}${cursor ? " loaded" : ""}`}
          </p>
          {!loading && !shown.length ? (
            <section className="space-y-2 rounded-xl border border-dashed border-border px-4 py-6 text-center">
              <h2 className="m-0 text-base font-semibold">
                {search
                  ? "No matching records"
                  : warehouse
                    ? "Create your first warehouse"
                    : "Create your first stock transfer"}
              </h2>
              <p className="m-0 text-sm text-muted-foreground">
                {search
                  ? "Try another name, code or reference."
                  : warehouse
                    ? "Add storage locations before preparing stock transfers."
                    : "Select two active warehouses and the products to move."}
              </p>
              {canCreate ? (
                <Button type="button" onClick={() => open()}>
                  Add New
                </Button>
              ) : null}
            </section>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-xl border border-border bg-card">
              <WorkTable
                continuation={{
                  cursor: cursor,
                  hasMore: !!(cursor && loadedScope === scope),
                  busy: !!busy,
                  loadMore: () => void more(),
                }}
                tableId="app/features/inventory/views/inventory-operations-workspace:1"
                className="w-full min-w-[720px] border-collapse text-left text-sm"
              >
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {(warehouse
                      ? ["Code", "Warehouse", "Location", "Contact", "Status"]
                      : ["Code", "Date", "From warehouse", "To warehouse", "Products", "Status"]
                    ).map((label) => (
                      <th key={label} scope="col" className="px-3 py-1.5 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((record) => (
                    <tr key={record.id} className="border-t border-border hover:bg-accent">
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          className="min-h-6 border-0 bg-transparent p-0 text-left font-sans text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => open(record.id)}
                        >
                          {record.code}
                        </button>
                      </td>
                      {"from_warehouse_id" in record ? (
                        <>
                          <td className="px-3 py-1.5">{record.transfer_date}</td>
                          <td className="px-3 py-1.5">{record.from_warehouse_name}</td>
                          <td className="px-3 py-1.5">{record.to_warehouse_name}</td>
                          <td className="px-3 py-1.5 tabular-nums">{record.lines.length}</td>
                          <td className="px-3 py-1.5">
                            <Badge variant="outline">
                              {record.state.charAt(0).toUpperCase() + record.state.slice(1)}
                              {record.posted ? "" : " · Not posted"}
                            </Badge>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5">{record.name}</td>
                          <td className="px-3 py-1.5">{record.location_name ?? "—"}</td>
                          <td className="px-3 py-1.5">{record.contact_name || record.phone || "—"}</td>
                          <td className="px-3 py-1.5">
                            <Badge variant="outline">{record.status}</Badge>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </WorkTable>
            </div>
          )}
        </>
      )}
    </div>
  );
}
