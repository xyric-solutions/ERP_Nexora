"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { productInputSchema, type Product, type ProductInput, type InventoryOptions } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LabeledField } from "@/shared/ui/labeled-field";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { ProductLookup } from "./product-lookup";
import {
  emptyProduct,
  productError,
  productSelectClass,
  productTabs,
  fieldTab,
  type ProductTab,
} from "../model/products";

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
export function ProductForm({
  company,
  recordRef,
  options,
  onClose,
  onDirtyChange,
}: {
  company: string;
  recordRef?: string;
  options: InventoryOptions;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const trackId = useId();
  const { api, session, csrfToken } = useSession(),
    notify = useActionFeedback();
  const [input, setInput] = useState<ProductInput>(() => emptyProduct(company, options.currencies[0]?.code ?? "")),
    [record, setRecord] = useState<Product | null>(null),
    [loading, setLoading] = useState(!!recordRef),
    [loadFailed, setLoadFailed] = useState(false),
    [refresh, setRefresh] = useState(0),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState<ProductTab>("General");
  const [names, setNames] = useState<Record<string, string | null>>({}),
    [issues, setIssues] = useState<Record<string, string>>({});
  const lock = useRef(false),
    retry = useRef<{ body: string; key: string } | null>(null),
    currentRef = useRef(recordRef);
  const canSave = !!session?.user.permissions.includes("inventory.item.create") && !session?.impersonation;
  useEffect(() => {
    if (!currentRef.current) return;
    let active = true;
    api
      .getProduct(currentRef.current, company)
      .then((r) => {
        if (active) {
          setRecord(r);
          setInput(
            productInputSchema.strip().parse({
              ...r,
              expected_version: r.version,
            }),
          );
          setNames({
            preferred_supplier_id: r.preferred_supplier_name,
            stock_account_id: r.stock_account_name,
            income_account_id: r.income_account_name,
            expense_account_id: r.expense_account_name,
            location_id: r.location_name,
            default_warehouse_id: r.default_warehouse_name,
          });
          setLoadFailed(false);
          setDirty(false);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setError(productError(e));
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, company, refresh]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const handle = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [dirty]);
  function change<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setIssues((current) => ({ ...current, [key]: "" }));
  }
  function close() {
    if (dirty && !window.confirm("Discard the unsaved product changes?")) return;
    onDirtyChange?.(false);
    onClose();
  }
  async function save(closeAfter: boolean) {
    if (lock.current || loading || loadFailed || !canSave) return;
    const parsed = productInputSchema.safeParse(input);
    if (!parsed.success) {
      const errors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
      setIssues(errors);
      setError("Check the highlighted product fields before saving.");
      setTab(fieldTab(String(parsed.error.issues[0]?.path[0])));
      return;
    }
    lock.current = true;
    setSaving(true);
    setError("");
    const body = JSON.stringify({ id: record?.id ?? null, input: parsed.data });
    if (retry.current?.body !== body) retry.current = { body, key: `product-${crypto.randomUUID()}` };
    try {
      const result = await api.saveProduct(record?.id ?? null, parsed.data, csrfToken(), retry.current.key);
      setRecord(result.record);
      setInput((current) => ({ ...current, expected_version: result.record.version }));
      currentRef.current = result.record.id;
      window.history.replaceState(null, "", `#/inventory/add-product/${encodeURIComponent(result.record.id)}`);
      retry.current = null;
      setDirty(false);
      onDirtyChange?.(false);
      notify(`${result.record.code} saved.`);
      if (closeAfter) onClose();
    } catch (e) {
      setError(productError(e));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function field(key: keyof ProductInput, label: string, children: ReactNode, hint?: string) {
    return (
      <LabeledField
        label={label}
        hint={issues[key] || hint}
        className={
          issues[key]
            ? "[&_input]:border-destructive [&_select]:border-destructive [&_textarea]:border-destructive"
            : ""
        }
      >
        {children}
      </LabeledField>
    );
  }
  function decimal(key: keyof ProductInput, label: string, step = "0.01", hint?: string) {
    return field(
      key,
      label,
      <Input
        type="number"
        min="0"
        step={step}
        value={String(input[key] ?? "")}
        onChange={(e) => change(key, e.target.value)}
        aria-invalid={!!issues[key]}
      />,
      hint,
    );
  }
  if (loading)
    return (
      <p role="status" className="p-4">
        Loading product…
      </p>
    );
  if (loadFailed)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLoading(true);
                setRefresh((n) => n + 1);
              }}
            >
              Retry
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      className="min-w-0 space-y-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{record ? record.name : "New product"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{record?.code ?? "Code assigned when saved"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{dirty ? "Unsaved" : (record?.status ?? "New")}</Badge>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>
            Close
          </Button>
        </div>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="min-w-0 space-y-5">
        <fieldset disabled={saving || !canSave} className="m-0 min-w-0 border-0 p-0">
          <section className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,15rem)]">
            {field(
              "name",
              "Product name *",
              <Input
                maxLength={200}
                value={input.name}
                placeholder="e.g. 5 Way Valve"
                onChange={(e) => change("name", e.target.value)}
                aria-invalid={!!issues.name}
              />,
            )}
            <LabeledField label="Product code">
              <Input readOnly value={record?.code ?? "Assigned on save"} className="bg-muted" />
            </LabeledField>
            <div className="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2">
              {(
                [
                  ["sales_enabled", "Sales"],
                  ["purchase_enabled", "Purchase"],
                  ["manufacture_enabled", "Manufacture"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex min-h-8 items-center gap-2 text-sm">
                  <Checkbox
                    checked={input[key]}
                    disabled={key === "manufacture_enabled" && input.type === "service"}
                    onCheckedChange={(checked) => change(key, !!checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
        </fieldset>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (productTabs.some((t) => t === value)) setTab(value as ProductTab);
          }}
          className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
        >
          <div className="max-w-full overflow-x-auto pb-2">
            <TabsList variant="line" className="h-11 gap-3">
              {productTabs.map((t) => (
                <TabsTrigger key={t} value={t} className="px-2">
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="General" className="mt-4 space-y-6">
            <fieldset disabled={saving || !canSave} className="m-0 min-w-0 space-y-6 border-0 p-0">
              <FormSection title="Product details">
                {field(
                  "type",
                  "Product type",
                  <select
                    className={productSelectClass}
                    value={input.type}
                    onChange={(e) => {
                      const type = e.target.value === "service" ? "service" : "goods";
                      setInput((current) => ({
                        ...current,
                        type,
                        track_inventory: type === "goods",
                        manufacture_enabled: type === "goods" ? current.manufacture_enabled : false,
                        opening_quantity: "0",
                        opening_rate: "0",
                      }));
                      setDirty(true);
                    }}
                  >
                    <option value="goods">Goods</option>
                    <option value="service">Service</option>
                  </select>,
                )}
                {field(
                  "category",
                  "Category",
                  <Input
                    maxLength={120}
                    value={input.category}
                    placeholder="e.g. Spare parts"
                    onChange={(e) => change("category", e.target.value)}
                  />,
                )}
                {field(
                  "unit",
                  "Unit",
                  <select
                    className={productSelectClass}
                    value={input.unit}
                    onChange={(e) => {
                      const unit = options.units.find((u) => u === e.target.value);
                      if (unit) change("unit", unit);
                    }}
                  >
                    {options.units.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>,
                )}
                {field(
                  "reference",
                  "Internal reference",
                  <Input
                    maxLength={120}
                    value={input.reference}
                    onChange={(e) => change("reference", e.target.value)}
                  />,
                )}
                {field(
                  "barcode",
                  "Barcode",
                  <Input maxLength={120} value={input.barcode} onChange={(e) => change("barcode", e.target.value)} />,
                )}
                <ProductLookup
                  company={company}
                  kind="supplier"
                  label="Preferred supplier"
                  value={input.preferred_supplier_id}
                  name={names.preferred_supplier_id ?? null}
                  onChange={(id, name) => {
                    change("preferred_supplier_id", id);
                    setNames((n) => ({ ...n, preferred_supplier_id: name }));
                  }}
                />
                {field(
                  "invoice_policy",
                  "Invoicing policy",
                  <select
                    className={productSelectClass}
                    value={input.invoice_policy}
                    onChange={(e) => change("invoice_policy", e.target.value === "delivered" ? "delivered" : "ordered")}
                  >
                    <option value="ordered">Ordered quantities</option>
                    <option value="delivered">Delivered quantities</option>
                  </select>,
                )}
                {field(
                  "status",
                  "Status",
                  <select
                    className={productSelectClass}
                    value={input.status}
                    onChange={(e) => change("status", e.target.value === "inactive" ? "inactive" : "active")}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>,
                )}
              </FormSection>
              <FormSection title="Location">
                <ProductLookup
                  company={company}
                  kind="location"
                  label="Location / City"
                  value={input.location_id}
                  name={names.location_id ?? null}
                  onChange={(id, name) => {
                    change("location_id", id);
                    setNames((n) => ({ ...n, location_id: name }));
                  }}
                />
                <ProductLookup
                  company={company}
                  kind="warehouse"
                  label="Default warehouse"
                  value={input.default_warehouse_id}
                  name={names.default_warehouse_id ?? null}
                  onChange={(id, name) => {
                    change("default_warehouse_id", id);
                    setNames((n) => ({ ...n, default_warehouse_id: name }));
                  }}
                />
              </FormSection>
              <FormSection title="Income and expense accounts">
                {(
                  [
                    ["income_account", "Income account"],
                    ["expense_account", "Expense account"],
                  ] as const
                ).map(([kind, label]) => {
                  const key = `${kind}_id` as const;
                  return (
                    <ProductLookup
                      key={kind}
                      company={company}
                      kind={kind}
                      label={label}
                      value={input[key]}
                      name={names[key] ?? null}
                      onChange={(id, name) => {
                        change(key, id);
                        setNames((n) => ({ ...n, [key]: name }));
                      }}
                    />
                  );
                })}
              </FormSection>
              <FormSection title="Descriptions">
                {field(
                  "sales_description",
                  "Sales information",
                  <Textarea
                    className="min-h-20!"
                    maxLength={2000}
                    rows={3}
                    value={input.sales_description}
                    onChange={(e) => change("sales_description", e.target.value)}
                  />,
                )}
                {field(
                  "purchase_description",
                  "Purchase information",
                  <Textarea
                    className="min-h-20!"
                    maxLength={2000}
                    rows={3}
                    value={input.purchase_description}
                    onChange={(e) => change("purchase_description", e.target.value)}
                  />,
                )}
                {field(
                  "notes",
                  "Internal notes",
                  <Textarea
                    className="min-h-20!"
                    maxLength={4000}
                    rows={3}
                    value={input.notes}
                    onChange={(e) => change("notes", e.target.value)}
                  />,
                )}
              </FormSection>
            </fieldset>
          </TabsContent>
          <TabsContent value="Pricing" className="mt-4 space-y-6">
            <fieldset disabled={saving || !canSave} className="m-0 min-w-0 space-y-6 border-0 p-0">
              <FormSection title="Prices and discounts">
                {field(
                  "currency",
                  "Currency *",
                  <select
                    className={productSelectClass}
                    value={input.currency}
                    onChange={(e) => change("currency", e.target.value)}
                  >
                    {!options.currencies.some((c) => c.code === input.currency) ? (
                      <option value={input.currency}>
                        {input.currency ? `${input.currency} · Inactive` : "Select currency"}
                      </option>
                    ) : null}
                    {options.currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>,
                )}
                {decimal("sale_price", "Sale price / unit")}
                {decimal("cost", "Cost / unit")}
                {decimal("sale_discount", "Sale discount (%)")}
                {decimal("purchase_discount", "Purchase discount (%)")}
              </FormSection>
              <FormSection title="Tax rates">
                {decimal("sales_tax", "Sales GST (%)")}
                {decimal("purchase_tax", "Purchase GST (%)")}
                {decimal("non_filer_tax", "Non-filer GST (%)")}
              </FormSection>
            </fieldset>
          </TabsContent>
          <TabsContent value="Inventory" className="mt-4 space-y-6">
            <fieldset disabled={saving || !canSave} className="m-0 min-w-0 space-y-6 border-0 p-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor={trackId} className="flex min-h-10 items-center gap-2 text-sm font-medium">
                  <Checkbox
                    id={trackId}
                    checked={input.track_inventory}
                    disabled={input.type === "service"}
                    onCheckedChange={(checked) => {
                      change("track_inventory", !!checked);
                      if (!checked) {
                        change("opening_quantity", "0");
                        change("opening_rate", "0");
                      }
                    }}
                  />
                  Track inventory by quantity
                </label>
                <p className="text-sm text-muted-foreground">
                  {input.type === "service" ? "Services do not hold stock." : "Negative stock is disabled."}
                </p>
              </div>
              <FormSection title="Stock planning">
                {decimal("low_stock_level", "Low stock level", "0.0001")}
                {field(
                  "bin_location",
                  "Bin location",
                  <Input
                    maxLength={120}
                    value={input.bin_location}
                    onChange={(e) => change("bin_location", e.target.value)}
                  />,
                )}
                {decimal("weight", "Weight (kg)", "0.0001")}
                {decimal("large_pack_size", "Large pack size", "0.0001")}
                {decimal("small_pack_size", "Small pack size", "0.0001")}
              </FormSection>
              <details
                className="border-t border-border pt-4"
                open={Number(input.opening_quantity) > 0 || !!issues.opening_quantity}
              >
                <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">
                  Opening stock plan
                </summary>
                <p className="my-3 text-sm text-muted-foreground">
                  Saved as an opening plan. On-hand stock and accounting balances change only through a posted stock
                  opening.
                </p>
                <fieldset
                  disabled={!input.track_inventory}
                  className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-3"
                >
                  {field(
                    "opening_date",
                    "Opening date",
                    <Input
                      type="date"
                      value={input.opening_date ?? ""}
                      onChange={(e) => change("opening_date", e.target.value || null)}
                    />,
                  )}
                  {decimal("opening_quantity", "Opening quantity", "0.0001")}
                  {decimal("opening_rate", "Opening rate")}
                </fieldset>
              </details>
            </fieldset>
          </TabsContent>
          <TabsContent value="Accounting" className="mt-4 space-y-5">
            <fieldset disabled={saving || !canSave} className="m-0 min-w-0 space-y-5 border-0 p-0">
              <FormSection title="Account mappings">
                {([["stock_account", "Stock asset account"]] as const).map(([kind, label]) => {
                  const key = `${kind}_id` as const;
                  return (
                    <ProductLookup
                      key={kind}
                      company={company}
                      kind={kind}
                      label={label}
                      value={input[key]}
                      name={names[key] ?? null}
                      onChange={(id, name) => {
                        change(key, id);
                        setNames((n) => ({ ...n, [key]: name }));
                      }}
                    />
                  );
                })}
              </FormSection>
              <p className="text-sm text-muted-foreground">
                Optional product defaults. Saving a product does not post a journal.
              </p>
            </fieldset>
          </TabsContent>
        </Tabs>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          {canSave
            ? dirty
              ? "You have unsaved changes."
              : record
                ? "All changes saved."
                : "Complete the product details to create it."
            : "You have read-only access to this product."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={close}>
            Close
          </Button>
          {canSave ? (
            <>
              <Button type="submit" variant="outline" disabled={saving || (!dirty && !!record)}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button type="button" disabled={saving || (!dirty && !!record)} onClick={() => void save(true)}>
                Save & Close
              </Button>
            </>
          ) : null}
        </div>
      </footer>
    </form>
  );
}
