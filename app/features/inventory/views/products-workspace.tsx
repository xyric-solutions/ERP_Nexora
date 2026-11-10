"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InventoryCompanies, InventoryOptions, Product } from "@nexora/contracts";
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
  const [companies, setCompanies] = useState<InventoryCompanies["items"]>([]),
    [company, setCompany] = useState(""),
    [options, setOptions] = useState<InventoryOptions | null>(null),
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
      .then((r) => {
        if (active) {
          setCompanies(r.items);
          setCompaniesLoaded(true);
          setCompany((current) =>
            r.items.some((c) => c.id === current)
              ? current
              : (r.items.find(
                  (c) => c.id === window.localStorage.getItem(`nexora-inventory-company:${session?.tenant_id}`),
                )?.id ??
                r.items[0]?.id ??
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
        }
      })
      .catch((e) => {
        if (active) setError(productError(e));
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
  function changeCompany(value: string) {
    if (dirty) return;
    setCompany(value);
    setOptions(null);
    setOptionsCompany("");
    setError("");
    window.localStorage.setItem(`nexora-inventory-company:${session?.tenant_id}`, value);
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
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {!editing ? (
          <div>
            <h1 className="text-xl font-semibold">Products</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage goods, services, prices and stock settings.</p>
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
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <LabeledField label="Company" className="w-full sm:w-72">
            <select
              className={productSelectClass}
              value={company}
              disabled={editing || dirty}
              onChange={(e) => changeCompany(e.target.value)}
            >
              {companies.length ? (
                companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))
              ) : (
                <option value="">No company available</option>
              )}
            </select>
          </LabeledField>
          {!editing ? (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
                Refresh
              </Button>
              {canCreate ? (
                <Button
                  type="button"
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
            className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,2fr)_1fr_1fr_1fr_auto]"
          >
            <LabeledField label="Search products">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
                />
                <Input
                  className="pl-9"
                  aria-label="Search products"
                  maxLength={160}
                  value={search}
                  placeholder="Name, code, reference or barcode"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </LabeledField>
            <LabeledField label="Product type">
              <select className={productSelectClass} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                <option value="goods">Goods</option>
                <option value="service">Services</option>
              </select>
            </LabeledField>
            <LabeledField label="Status">
              <select className={productSelectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </LabeledField>
            <LabeledField label="Category">
              <Input
                maxLength={120}
                placeholder="Exact category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </LabeledField>
            <div role="group" aria-label="Product view" className="flex items-end gap-1">
              <Button
                type="button"
                variant={view === "grid" ? "secondary" : "outline"}
                aria-pressed={view === "grid"}
                aria-label="Grid view"
                onClick={() => setView("grid")}
              >
                <LayoutGrid aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant={view === "list" ? "secondary" : "outline"}
                aria-pressed={view === "list"}
                aria-label="List view"
                onClick={() => setView("list")}
              >
                <List aria-hidden="true" />
              </Button>
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <p role="status">
              {loading
                ? "Loading products…"
                : `${shown.length} product${shown.length === 1 ? "" : "s"}${cursor ? " loaded" : ""}`}
            </p>
            <p>On-hand quantities require posted stock.</p>
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
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => open(product.id)}
                  className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 text-left text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-semibold">{product.name}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {product.code}
                        {product.reference ? ` · ${product.reference}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{product.type === "goods" ? "Goods" : "Service"}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Sale price / {product.unit}</dt>
                      <dd className="mt-1 font-medium tabular-nums">
                        {product.currency}{" "}
                        {Number(product.sale_price).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">On hand</dt>
                      <dd className="mt-1">{product.track_inventory ? "Not posted" : "Not tracked"}</dd>
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
              <table className="w-full min-w-[720px] text-left text-sm">
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
                      <td className="px-4 py-3">{p.track_inventory ? "Not posted" : "Not tracked"}</td>
                      <td className="px-4 py-3">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {cursor && loadedScope === scope ? (
            <div className="flex justify-center">
              <Button type="button" variant="outline" disabled={busy} onClick={() => void more()}>
                {busy ? "Loading…" : "Load more products"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
