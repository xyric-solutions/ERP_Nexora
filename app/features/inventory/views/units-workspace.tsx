"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { cn } from "cn";
import {
  unitInputSchema,
  unitCategorySchema,
  convertUnitQuantity,
  unitRatio,
  type MeasurementUnit,
  type UnitInput,
} from "@nexora/contracts";
import { Plus } from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WorkForm, WorkFormLayout } from "@/shared/ui/work-form";
import { useInventoryForm } from "../components/use-inventory-form";
import { productError, productSelectClass } from "../model/products";

const categories = unitCategorySchema.options;
const categoryName = (value: string) =>
  value === "legacy_day" ? "Service day (explicit rule)" : value.charAt(0).toUpperCase() + value.slice(1);
const reference: Record<string, string> = {
  mass: "kg",
  length: "m",
  area: "m²",
  volume: "L",
  count: "Each",
  time: "second",
  packaging: "product contents",
  legacy_day: "explicit product rule",
};

export function UnitsWorkspace({
  onDirtyChange,
  recordRef,
}: {
  onDirtyChange?: (dirty: boolean) => void;
  recordRef?: string;
}) {
  const { api, session, activeCompany } = useSession(),
    company = activeCompany?.id ?? "";
  const canRead = !!session?.user.permissions.includes("inventory.item.read"),
    canWrite = !!session?.user.permissions.includes("inventory.item.create") && !session?.impersonation;
  const [items, setItems] = useState<MeasurementUnit[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState("active"),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<string | null>(recordRef ?? null);
  const scope = JSON.stringify({ company, search, category, status, refresh });
  const latestScope = useRef(scope);
  useEffect(() => {
    latestScope.current = scope;
  }, [scope]);
  useEffect(() => {
    if (!company || !canRead) return;
    let active = true;
    const timer = setTimeout(() => {
      setBusy(true);
      api
        .listMeasurementUnits(
          `?${new URLSearchParams({ company_id: company, search, ...(category ? { category } : {}), ...(status ? { status } : {}), limit: "30" })}`,
        )
        .then((r) => {
          if (active) {
            setItems(r.items);
            setCursor(r.next_cursor);
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setItems([]);
            setCursor(null);
            setError(productError(e));
          }
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, company, canRead, search, category, status, refresh]);
  if (!canRead)
    return (
      <p role="alert" className="m-0">
        Your account needs Inventory read permission for this company.
      </p>
    );
  if (!company) return <p role="status">Choose your company in the ERP top row.</p>;
  if (editing !== null)
    return (
      <UnitForm
        key={`${company}:${editing}`}
        company={company}
        recordRef={editing || undefined}
        canWrite={canWrite}
        onDirtyChange={onDirtyChange}
        onClose={() => {
          window.history.replaceState(null, "", "#/inventory/units-of-measure");
          setEditing(null);
          setRefresh((n) => n + 1);
        }}
      />
    );
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    const requestedScope = scope;
    try {
      const result = await api.listMeasurementUnits(
        `?${new URLSearchParams({ company_id: company, search, ...(category ? { category } : {}), ...(status ? { status } : {}), after: cursor, limit: "30" })}`,
      );
      if (latestScope.current === requestedScope) {
        setItems((current) => [...current, ...result.items]);
        setCursor(result.next_cursor);
      }
    } catch (e) {
      if (latestScope.current === requestedScope) setError(productError(e));
    } finally {
      if (latestScope.current === requestedScope) setBusy(false);
    }
  }
  return (
    <div className="min-w-0 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="m-0 text-lg font-semibold">Unit of Measure</h1>
          <p className="m-0 text-sm text-muted-foreground">Manage product units, precision and standard conversions.</p>
        </div>
        {canWrite ? (
          <Button type="button" className="h-9 shrink-0" onClick={() => setEditing("")}>
            <Plus aria-hidden="true" />
            Add New Unit
          </Button>
        ) : null}
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button type="button" variant="outline" size="sm" onClick={() => setRefresh((n) => n + 1)}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <section
        aria-label="Unit filters"
        className="grid gap-2 rounded-xl border border-border bg-card p-2.5 sm:grid-cols-[minmax(0,2fr)_1fr_1fr]"
      >
        <LabeledField label="Search units">
          <Input
            className="h-9"
            placeholder="Name, symbol or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Measurement category">
          <select
            className={cn(productSelectClass, "h-9")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryName(c)}
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField label="Status">
          <select className={cn(productSelectClass, "h-9")} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="">All statuses</option>
          </select>
        </LabeledField>
      </section>
      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- WCAG 2.1.1: the labelled horizontally scrollable unit directory needs its own keyboard focus. */}
      <div
        role="region"
        aria-label="Unit directory"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-ring"
      >
        {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Units of Measure</caption>
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              {["Code / Unit", "Category", "Reference conversion", "Precision", "Status"].map((c) => (
                <th key={c} scope="col" className="px-3 py-1.5 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto min-h-6 max-w-full flex-wrap items-center gap-x-2 gap-y-0 whitespace-normal p-0 text-left font-sans text-foreground"
                    onClick={() => setEditing(u.id)}
                  >
                    <span>
                      {u.name} <span className="font-normal text-muted-foreground">({u.symbol})</span>
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {u.code}
                      {u.standard ? " · Standard" : ""}
                    </span>
                  </Button>
                </td>
                <td className="px-3 py-1.5">{categoryName(u.category)}</td>
                <td className="px-3 py-1.5">
                  {["packaging", "legacy_day"].includes(u.category)
                    ? "Product rule required"
                    : `1 ${u.symbol} = ${u.numerator}/${u.denominator} ${reference[u.category]}`}
                </td>
                <td className="px-3 py-1.5">{u.precision} decimals</td>
                <td className="px-3 py-1.5">
                  <Badge variant="outline">{u.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="status" className="m-0 text-xs text-muted-foreground">
        {busy
          ? "Loading units…"
          : items.length
            ? `${items.length} units${cursor ? " loaded" : ""}`
            : "No matching units. Change the filters or add a unit."}
      </p>
      {cursor ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void more()}>
          Load more units
        </Button>
      ) : null}
      <UnitConverter company={company} refresh={refresh} />
    </div>
  );
}

function UnitForm({
  company,
  recordRef,
  canWrite,
  onClose,
  onDirtyChange,
}: {
  company: string;
  recordRef?: string;
  canWrite: boolean;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, csrfToken } = useSession();
  const load = useCallback(
    async (id: string, scope: string) => {
      const record = await api.getMeasurementUnit(id, scope);
      return { record, input: unitInputSchema.strip().parse({ ...record, expected_version: record.version }) };
    },
    [api],
  );
  const persist = useCallback(
    (id: string | null, input: UnitInput, key: string) => api.saveMeasurementUnit(id, input, csrfToken(), key),
    [api, csrfToken],
  );
  const form = useInventoryForm<UnitInput, MeasurementUnit>({
    company,
    recordRef,
    formPage: "units-of-measure",
    initial: () => ({
      company_id: company,
      name: "",
      symbol: "",
      category: "mass",
      numerator: "1",
      denominator: "1",
      precision: 4,
      status: "active",
    }),
    load,
    persist,
    schema: unitInputSchema,
    canWrite,
    onClose,
    onDirtyChange,
  });
  const change = <K extends keyof UnitInput>(key: K, value: UnitInput[K]) =>
    form.change((current) => ({ ...current, [key]: value }));
  if (form.loading) return <p role="status">Loading unit…</p>;
  return (
    <WorkForm
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.save(true);
      }}
    >
      <WorkFormLayout className="space-y-3">
        <header className="space-y-1">
          <h1 className="m-0 text-lg font-semibold">{form.record ? form.record.name : "Add New Unit"}</h1>
          <p className="m-0 text-sm text-muted-foreground">
            Definitions retain their meaning. Mark unused units inactive; create a replacement to change a definition.
          </p>
        </header>
        {form.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {form.error}
              {form.loadFailed ? (
                <Button type="button" variant="outline" onClick={form.reload}>
                  Retry
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <fieldset
          disabled={!canWrite || form.saving || form.loadFailed}
          className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2 lg:grid-cols-3"
        >
          <LabeledField label="Unit code">
            <Input readOnly value={form.record?.code ?? "Assigned automatically on save"} />
          </LabeledField>
          <LabeledField label="Unit name *">
            <Input
              required
              maxLength={32}
              value={form.input.name}
              disabled={!!form.record}
              onChange={(e) => change("name", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Symbol *">
            <Input
              required
              maxLength={16}
              value={form.input.symbol}
              disabled={!!form.record}
              onChange={(e) => change("symbol", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Measurement category">
            <select
              className={productSelectClass}
              value={form.input.category}
              disabled={!!form.record}
              onChange={(e) => {
                const value = unitCategorySchema.parse(e.target.value);
                form.change((c) => ({ ...c, category: value, numerator: "1", denominator: "1" }));
              }}
            >
              {categories
                .filter((c) => c !== "legacy_day" || !!form.record)
                .map((c) => (
                  <option key={c} value={c}>
                    {categoryName(c)}
                  </option>
                ))}
            </select>
          </LabeledField>
          <LabeledField label="Reference units (numerator)">
            <Input
              inputMode="numeric"
              value={form.input.numerator}
              disabled={!!form.record || form.input.category === "packaging"}
              onChange={(e) => change("numerator", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Divided by (denominator)">
            <Input
              inputMode="numeric"
              value={form.input.denominator}
              disabled={!!form.record || form.input.category === "packaging"}
              onChange={(e) => change("denominator", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Quantity decimal places">
            <select
              className={productSelectClass}
              value={form.input.precision}
              disabled={!!form.record}
              onChange={(e) => change("precision", Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Status">
            <select
              className={productSelectClass}
              value={form.input.status}
              onChange={(e) => change("status", e.target.value === "inactive" ? "inactive" : "active")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </LabeledField>
        </fieldset>
        <p className="m-0 text-sm text-muted-foreground">
          {form.input.category === "packaging"
            ? "Set package contents for each product in its Inventory tab."
            : `1 ${form.input.symbol || "unit"} = ${form.input.numerator}/${form.input.denominator} ${reference[form.input.category]}. For example, 1 Gram = 1/1000 kg.`}
        </p>
        <footer className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" disabled={form.saving} onClick={form.close}>
            Close
          </Button>
          {canWrite ? (
            <Button type="submit" disabled={form.saving || form.loadFailed}>
              {form.saving ? "Saving…" : "Save Unit"}
            </Button>
          ) : null}
        </footer>
      </WorkFormLayout>
    </WorkForm>
  );
}

function UnitConverter({ company, refresh }: { company: string; refresh: number }) {
  const { api } = useSession();
  const [units, setUnits] = useState<MeasurementUnit[]>([]),
    [error, setError] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const all: MeasurementUnit[] = [];
      let after: string | null = null;
      do {
        const r = await api.listMeasurementUnits(
          `?${new URLSearchParams({ company_id: company, status: "active", limit: "100", ...(after ? { after } : {}) })}`,
        );
        all.push(...r.items);
        after = r.next_cursor;
      } while (after && all.length <= 1000);
      if (active) {
        const convertible = all.filter((u) => !["packaging", "legacy_day"].includes(u.category));
        setUnits(convertible);
        setFrom((c) =>
          convertible.some((u) => u.id === c)
            ? c
            : (convertible.find((u) => u.name === "Kg")?.id ?? convertible[0]?.id ?? ""),
        );
        setTo((c) =>
          convertible.some((u) => u.id === c) ? c : (convertible.find((u) => u.name === "Gram")?.id ?? ""),
        );
        setError("");
      }
    }
    void load().catch(() => {
      if (active) setError("Conversion units could not be loaded.");
    });
    return () => {
      active = false;
    };
  }, [api, company, refresh, retry]);
  const source = units.find((u) => u.id === from),
    destination = units.find((u) => u.id === to && u.category === source?.category);
  let result = "",
    invalid = "";
  if (source && destination) {
    try {
      const converted = convertUnitQuantity(quantity, unitRatio(source, destination));
      result = `${converted.exact ? "" : "Approximately "}${converted.quantity} ${destination.symbol}`;
    } catch (e) {
      invalid = e instanceof Error ? e.message : "Enter a valid quantity.";
    }
  }
  return (
    <section className="space-y-2 border-t border-border pt-3" aria-labelledby="unit-converter-title">
      <h2 id="unit-converter-title" className="m-0 text-base font-semibold">
        Unit converter
      </h2>
      <p className="m-0 text-sm text-muted-foreground">
        Convert compatible measurements in either direction. Packaging uses the content rules saved on each product.
      </p>
      {error ? (
        <p role="alert" className="m-0">
          {error}{" "}
          <Button type="button" variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </Button>
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <LabeledField label="Convert quantity">
          <Input className="h-9" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </LabeledField>
        <LabeledField label="From unit">
          <select
            className={cn(productSelectClass, "h-9")}
            value={from}
            onChange={(e) => {
              const unit = units.find((u) => u.id === e.target.value);
              setFrom(e.target.value);
              setTo(units.find((u) => u.category === unit?.category && u.id !== unit.id)?.id ?? unit?.id ?? "");
            }}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.symbol})
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField label="To unit">
          <select
            className={cn(productSelectClass, "h-9")}
            value={destination?.id ?? ""}
            onChange={(e) => setTo(e.target.value)}
          >
            {units
              .filter((u) => u.category === source?.category)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.symbol})
                </option>
              ))}
          </select>
        </LabeledField>
      </div>
      <output className="block text-lg font-semibold" aria-live="polite">
        {invalid || result || "Choose compatible units to convert."}
      </output>
      {source && destination ? (
        <p className="m-0 text-xs text-muted-foreground">
          1 {source.symbol} = {source.numerator}/{source.denominator} {reference[source.category]}; 1{" "}
          {destination.symbol} = {destination.numerator}/{destination.denominator} {reference[destination.category]}
        </p>
      ) : null}
    </section>
  );
}
