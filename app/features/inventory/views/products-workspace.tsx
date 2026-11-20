"use client";
import { inActiveCompany } from "@/lib/session/active-company";
import { WorkTable } from "@/shared/ui/work-table";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import type { InventoryOptions, Product } from "@nexora/contracts";
import { LayoutGrid, List, Plus, Search, Package } from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LabeledField } from "@/shared/ui/labeled-field";
import { ProductForm } from "../components/product-form";
import { productError, productSelectClass } from "../model/products";

export function ProductsWorkspace({
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
  const [company, setCompany] = useState(""),
    [options, setOptions] = useState<InventoryOptions | null>(null),
    [optionsError, setOptionsError] = useState(""),
    [optionsCompany, setOptionsCompany] = useState(""),
    [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [records, setRecords] = useState<Product[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [status, setStatus] = useState("active"),
    [category, setCategory] = useState(""),
    [view, setView] = useState<"grid" | "list">("grid"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [dirty, setDirty] = useState(false),
    [loadedScope, setLoadedScope] = useState("");
  const generation = useRef(0),
    canRead = !!session?.user.permissions.includes("inventory.item.read"),
    canCreate = !!session?.user.permissions.includes("inventory.item.create") && !session?.impersonation;
  const editing = page === "add-product" || page === "product-detail" || !!recordRef,
    scope = JSON.stringify({ company, search, type, status, category, refresh });
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
      .listInventoryCompanies()
      // Only the company chosen at sign-in is in scope; the API rejects any other company.
      .then(inActiveCompany)
      .then((r) => {
        if (active) {
          setCompaniesLoaded(true);
          setCompany(r.items[0]?.id ?? "");
        }
      })
      .catch((e) => {
        if (active) setError(productError(e));
      });
    return () => {
      active = false;
    };
  }, [api, canRead, session?.tenant_id, refresh]);
  useEffect(() => {
    if (!company) return;
    let active = true;
    api
      .getInventoryOptions(company)
      .then((r) => {
        if (active) {
          setOptions(r);
          setOptionsCompany(company);
          setOptionsError("");
        }
      })
      .catch((e) => {
        if (active) setOptionsError(productError(e));
      });
    return () => {
      active = false;
    };
  }, [api, company, refresh]);
  const query = useCallback(
    (after?: string) =>
      `?${new URLSearchParams({ company_id: company, search, limit: "30", ...(type ? { type } : {}), ...(status ? { status } : {}), ...(category ? { category } : {}), ...(after ? { cursor: after } : {}) })}`,
    [company, search, type, status, category],
  );
  useEffect(() => {
    if (!company || editing) return;
    const token = ++generation.current;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      api
        .listProducts(query())
        .then((r) => {
          if (token === generation.current) {
            setRecords(r.items);
            setCursor(r.next_cursor);
            setLoadedScope(scope);
          }
        })
        .catch((e) => {
          if (token === generation.current) {
            setRecords([]);
            setCursor(null);
            setLoadedScope(scope);
            setError(productError(e));
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
  }, [api, company, editing, query, scope]);
  async function more() {
    if (!cursor || busy) return;
    const token = generation.current;
    setBusy(true);
    try {
      const r = await api.listProducts(query(cursor));
      if (token === generation.current) {
        setRecords((current) => [...current, ...r.items]);
        setCursor(r.next_cursor);
      }
    } catch (e) {
      if (token === generation.current) setError(productError(e));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function open(id?: string) {
    onNavigate("inventory", "add-product", id);
  }
  const shown = loadedScope === scope ? records : [],
    loading = busy || loadedScope !== scope;
  if (sessionLoading) return <p role="status">Loading Products permissions…</p>;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Your account needs Products read access for this company.</AlertDescription>
      </Alert>
    );
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!editing ? (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="m-0 text-lg font-semibold">Products</h1>
            <p className="m-0 text-sm text-muted-foreground">Manage goods, services, prices and stock settings.</p>
          </div>
        ) : (
          <Button
            type="button"
            variant="link"
            className="px-0"
            onClick={() => {
              if (!dirty || window.confirm("Discard the unsaved product changes?")) {
                reportDirty(false);
                onNavigate("inventory", "products");
              }
            }}
          >
            Products
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
                <Button
                  type="button"
                  className="h-9"
                  disabled={!company || optionsCompany !== company || !options?.currencies.length}
                  onClick={() => open()}
                >
                  <Plus aria-hidden="true" />
                  Add New
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      {error || optionsError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error || optionsError}
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
      {company && optionsCompany === company && !options?.currencies.length ? (
        <Alert>
          <AlertDescription>
            No active two-decimal company currency is available. Set up an active currency before adding products.
            {[
              "finance.company_currency_profile.read",
              "finance.company_currency.read",
              "finance.company_currency_rate.read",
            ].every((permission) => session?.user.permissions.includes(permission)) ? (
              <Button type="button" variant="link" onClick={() => onNavigate("finance", "currencies-fx")}>
                Open currency setup
              </Button>
            ) : (
              " Ask your administrator to review company currency setup."
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {!company ? (
        <p role="status" className="py-8 text-sm text-muted-foreground">
          {error
            ? "Products are unavailable. Retry to load your companies."
            : companiesLoaded
              ? "No companies are available for your Products access. Ask an administrator to check your company scope."
              : "Loading available companies…"}
        </p>
      ) : editing ? (
        optionsCompany === company && options && (recordRef || options.currencies.length) ? (
          <ProductForm
            key={`${company}:${recordRef ?? "new"}`}
            company={company}
            recordRef={recordRef}
            options={options}
            onDirtyChange={reportDirty}
            onClose={() => onNavigate("inventory", "products")}
          />
        ) : (
          <p role="status" className="py-6 text-sm text-muted-foreground">
            {optionsCompany === company
              ? "Activate a company currency before creating products."
              : "Loading product settings…"}
          </p>
        )
      ) : (
        <>
          <section
            aria-label="Product filters"
            className="grid min-w-0 gap-2 rounded-xl border border-border bg-card p-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,2fr)_1fr_1fr_1fr_auto]"
          >
            <LabeledField label="Search products">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
                />
                <Input
                  className="h-9 pl-9"
                  aria-label="Search products"
                  maxLength={160}
                  value={search}
                  placeholder="Name, code, reference or barcode"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </LabeledField>
            <LabeledField label="Product type">
              <select className={cn(productSelectClass, "h-9")} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                <option value="goods">Goods</option>
                <option value="service">Services</option>
              </select>
            </LabeledField>
            <LabeledField label="Status">
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
            <LabeledField label="Category">
              <Input
                className="h-9"
                maxLength={120}
                placeholder="Exact category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </LabeledField>
            <div role="group" aria-label="Product view" className="flex items-end gap-1">
              <Button
                type="button"
                size="icon-lg"
                variant={view === "grid" ? "secondary" : "outline"}
                aria-pressed={view === "grid"}
                aria-label="Grid view"
                onClick={() => setView("grid")}
              >
                <LayoutGrid aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon-lg"
                variant={view === "list" ? "secondary" : "outline"}
                aria-pressed={view === "list"}
                aria-label="List view"
                onClick={() => setView("list")}
              >
                <List aria-hidden="true" />
              </Button>
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <p role="status" className="m-0">
              {loading
                ? "Loading products…"
                : `${shown.length} product${shown.length === 1 ? "" : "s"}${cursor ? " loaded" : ""}`}
            </p>
            <p className="m-0">On-hand quantities require posted stock.</p>
          </div>
          {!loading && !shown.length ? (
            <div className="space-y-3 rounded-xl border border-dashed border-border px-5 py-12 text-center">
              <Package aria-hidden="true" className="mx-auto size-7 text-muted-foreground" />
              <h2 className="text-base font-semibold">
                {search || type || category || status !== "active"
                  ? "No matching products"
                  : "Create your first product"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {search || type || category || status !== "active"
                  ? "Adjust the filters or search by name, code or barcode."
                  : "Add goods or services to maintain one product catalog for this company."}
              </p>
              {canCreate ? (
                <Button
                  type="button"
                  disabled={!options?.currencies.length || optionsCompany !== company}
                  onClick={() => open()}
                >
                  Add New
                </Button>
              ) : null}
            </div>
          ) : view === "grid" ? (
            <div className="flex min-w-0 flex-wrap items-start gap-2">
              {shown.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => open(product.id)}
                  className="w-full min-w-0 space-y-2 rounded-xl border border-border bg-card p-2.5 text-left text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:w-56"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="m-0 break-words text-sm font-semibold leading-5">{product.name}</h2>
                      <p className="m-0 mt-0.5 break-words text-xs text-muted-foreground">
                        {product.code}
                        {product.reference ? ` · ${product.reference}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{product.type === "goods" ? "Goods" : "Service"}</Badge>
                  </div>
                  <dl className="m-0 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-xs text-muted-foreground">Sale price / {product.unit}</dt>
                      <dd className="m-0 mt-0.5 font-medium tabular-nums">
                        {product.currency}{" "}
                        {Number(product.sale_price).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">On hand</dt>
                      <dd className="m-0 mt-0.5">
                        {product.track_inventory ? (product.on_hand_quantity ?? "Not posted") : "Not tracked"}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>{product.category || "Uncategorised"}</span>
                    <span>{product.status}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-xl border border-border bg-card">
              <WorkTable
                continuation={{
                  cursor: cursor,
                  hasMore: !!(cursor && loadedScope === scope),
                  busy: !!busy,
                  loadMore: () => void more(),
                }}
                tableId="app/features/inventory/views/products-workspace:1"
                className="w-full min-w-[720px] text-left text-sm"
              >
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {["Product", "Code", "Type", "Category", "Sale price", "On hand", "Status"].map((label) => (
                      <th key={label} scope="col" className="px-4 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} className="border-t border-border hover:bg-accent">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => open(p.id)}
                        >
                          {p.name}
                        </button>
                      </td>
                      <td className="px-4 py-3">{p.code}</td>
                      <td className="px-4 py-3">{p.type === "goods" ? "Goods" : "Service"}</td>
                      <td className="px-4 py-3">{p.category || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {p.currency} {Number(p.sale_price).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        {p.track_inventory ? (p.on_hand_quantity ?? "Not posted") : "Not tracked"}
                      </td>
                      <td className="px-4 py-3">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </WorkTable>
            </div>
          )}
          {view === "grid" && cursor && loadedScope === scope ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void more()}>
              Load more products
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
