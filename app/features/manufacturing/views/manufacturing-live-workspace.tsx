"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Bom,
  ManufacturingCompanies,
  ManufacturingOrder,
  ManufacturingSurface,
  ProductionPlan,
} from "@nexora/contracts";
import { Plus } from "lucide-react";
import { inActiveCompany } from "@/lib/session/active-company";
import { useSession } from "@/lib/session/session-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WorkTable } from "@/shared/ui/work-table";
import { BomForm } from "../components/bom-form";
import { ManufacturingOrderForm } from "../components/manufacturing-order-form";
import { ProductionPlanForm } from "../components/production-plan-form";
import {
  manufacturingError,
  manufacturingLivePages,
  manufacturingSections,
  manufacturingSelectClass,
  orderStateLabels,
  planStateLabels,
} from "../model/manufacturing";

type Row = Bom | ProductionPlan | ManufacturingOrder;
const stateFilters: Partial<Record<ManufacturingSurface, [string, string][]>> = {
  plans: Object.entries(planStateLabels),
  orders: [
    ["draft", orderStateLabels.draft],
    ["approved", orderStateLabels.approved],
  ],
};
const columns: Record<ManufacturingSurface, string[]> = {
  boms: ["Code", "Finished product", "Output", "Components", "Updated"],
  plans: ["Code", "Finished product", "Production quantity", "Status"],
  orders: ["Code", "Finished product", "Quantity", "Order date", "Source plan", "Status"],
};

/** Live Bill of Materials, Production Planning and Manufacturing Order pages. */
export function ManufacturingLiveWorkspace({
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
  const surface = manufacturingLivePages[page] ?? "boms";
  const section = manufacturingSections[surface];
  const { api, session, loading: sessionLoading } = useSession();
  const editing = page !== section.listPage || !!recordRef;
  const [companies, setCompanies] = useState<ManufacturingCompanies["items"]>([]),
    [companiesLoaded, setCompaniesLoaded] = useState(false),
    [company, setCompany] = useState(""),
    [records, setRecords] = useState<Row[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [state, setState] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [loadedScope, setLoadedScope] = useState(""),
    [dirty, setDirty] = useState(false);
  const generation = useRef(0);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes(section.readPermission);
  const canCreate = permissions.includes(section.createPermission) && !session?.impersonation;
  const scope = JSON.stringify({ company, search, state, refresh, surface });
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
      .listManufacturingCompanies(surface)
      // Only the company chosen at sign-in is in scope; the API rejects any other company.
      .then(inActiveCompany)
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        setCompaniesLoaded(true);
        setCompany((current) => (result.items.some((c) => c.id === current) ? current : (result.items[0]?.id ?? "")));
      })
      .catch((e) => active && setError(manufacturingError(e)));
    return () => {
      active = false;
    };
  }, [api, canRead, surface, refresh]);
  const readDirectory = useCallback(
    (after?: string) => {
      const query = `?${new URLSearchParams({
        company_id: company,
        search,
        limit: "30",
        ...(state && surface !== "boms" ? { state } : {}),
        ...(after ? { cursor: after } : {}),
      })}`;
      return surface === "boms"
        ? api.listBoms(query)
        : surface === "plans"
          ? api.listProductionPlans(query)
          : api.listManufacturingOrders(query);
    },
    [api, company, search, state, surface],
  );
  useEffect(() => {
    if (!company || editing || !canRead) return;
    const token = ++generation.current;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      readDirectory()
        .then((result) => {
          if (token !== generation.current) return;
          setRecords(result.items);
          setCursor(result.next_cursor);
          setLoadedScope(scope);
        })
        .catch((e) => {
          if (token !== generation.current) return;
          setRecords([]);
          setCursor(null);
          setError(manufacturingError(e));
          setLoadedScope(scope);
        })
        .finally(() => token === generation.current && setBusy(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      generation.current = token + 1;
    };
  }, [company, editing, canRead, readDirectory, scope]);
  async function more() {
    if (busy || !cursor) return;
    const token = generation.current;
    setBusy(true);
    try {
      const result = await readDirectory(cursor);
      if (token !== generation.current) return;
      setRecords((current) => [...current, ...result.items]);
      setCursor(result.next_cursor);
    } catch (e) {
      if (token === generation.current) setError(manufacturingError(e));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  const open = (id?: string) => onNavigate("manufacturing", section.formPage, id);
  const shown = loadedScope === scope ? records : [],
    loading = busy || loadedScope !== scope;
  if (sessionLoading) return <p role="status">Loading Manufacturing permissions…</p>;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>
          Your account needs {section.title} read access for this company. Ask a Super Admin to grant Manufacturing
          access.
        </AlertDescription>
      </Alert>
    );
  const filterControls = (
    <>
      <LabeledField label={`Search ${section.title.toLowerCase()}`} className="w-full sm:max-w-md">
        <Input
          maxLength={160}
          value={search}
          placeholder="Code or product"
          onChange={(e) => setSearch(e.target.value)}
        />
      </LabeledField>
      {stateFilters[surface] ? (
        <LabeledField label="Status" className="w-full sm:w-56">
          <select className={manufacturingSelectClass} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All statuses</option>
            {stateFilters[surface]!.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </LabeledField>
      ) : null}
    </>
  );
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        {!editing ? (
          <div>
            <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--nx-brand)]">
              Manufacturing
            </p>
            <h1 className="m-0 text-[1.625rem] font-semibold tracking-tight">{section.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
          </div>
        ) : (
          <Button
            type="button"
            variant="link"
            className="px-0"
            onClick={() => {
              if (!dirty || window.confirm("Discard these unsaved Manufacturing changes?")) {
                reportDirty(false);
                onNavigate("manufacturing", section.listPage);
              }
            }}
          >
            {section.title}
          </Button>
        )}
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          {companies.length > 1 ? (
            <LabeledField label="Company" className="w-full sm:w-72">
              <select
                className={manufacturingSelectClass}
                value={company}
                disabled={editing || dirty}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setError("");
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </LabeledField>
          ) : null}
          {!editing ? (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>
                Refresh
              </Button>
              {canCreate ? (
                <Button type="button" disabled={!company} onClick={() => open()}>
                  <Plus aria-hidden="true" />
                  Add {section.singular}
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
          {companiesLoaded ? "No companies are available for Manufacturing." : "Loading available companies…"}
        </p>
      ) : editing ? (
        surface === "boms" ? (
          <BomForm
            key={`${company}:${recordRef ?? "new"}`}
            company={company}
            recordRef={recordRef}
            onClose={() => onNavigate("manufacturing", section.listPage)}
            onDirtyChange={reportDirty}
          />
        ) : surface === "plans" ? (
          <ProductionPlanForm
            key={`${company}:${recordRef ?? "new"}`}
            company={company}
            recordRef={recordRef}
            onClose={() => onNavigate("manufacturing", section.listPage)}
            onDirtyChange={reportDirty}
            onOpenOrder={(id) => onNavigate("manufacturing", manufacturingSections.orders.formPage, id)}
          />
        ) : (
          <ManufacturingOrderForm
            key={`${company}:${recordRef ?? "new"}`}
            company={company}
            recordRef={recordRef}
            onClose={() => onNavigate("manufacturing", section.listPage)}
            onDirtyChange={reportDirty}
            onOpenPlan={(id) => onNavigate("manufacturing", manufacturingSections.plans.formPage, id)}
          />
        )
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {loading
              ? "Loading records…"
              : `${shown.length} record${shown.length === 1 ? "" : "s"}${cursor ? " loaded" : ""}`}
          </p>
          {!loading && !shown.length ? (
            <section className="overflow-hidden rounded-[10px] border border-border bg-card">
              <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 text-left">
                {filterControls}
              </div>
              <div className="space-y-3 px-5 py-10 text-center">
                <h2 className="text-base font-semibold">
                  {search || state ? "No matching records" : `Create your first ${section.singular}`}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {search || state
                    ? "Try another code, product or status."
                    : surface === "boms"
                      ? "Mark finished products for manufacture in Inventory, then list their components here."
                      : surface === "plans"
                        ? "Choose a finished product and the quantity to produce, then convert the plan to a Manufacturing Order."
                        : "Create an order directly, or convert a saved production plan."}
                </p>
                {canCreate ? (
                  <Button type="button" onClick={() => open()}>
                    Add {section.singular}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-[10px] border border-border bg-card">
              <WorkTable
                toolbar={filterControls}
                label={section.title}
                continuation={{
                  cursor,
                  hasMore: !!(cursor && loadedScope === scope),
                  busy,
                  loadMore: () => void more(),
                }}
                tableId={`app/features/manufacturing/views/manufacturing-live-workspace:${surface}`}
                className="w-full min-w-[600px] text-left text-[13px]"
              >
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {columns[surface].map((label) => (
                      <th key={label} scope="col" className="px-4 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((record) => (
                    <tr key={record.id} className="border-t border-border hover:bg-accent">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => open(record.id)}
                        >
                          {record.code}
                        </button>
                      </td>
                      <RowCells
                        record={record}
                        surface={surface}
                        onOpenOrder={(id) => onNavigate("manufacturing", manufacturingSections.orders.formPage, id)}
                      />
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

function RowCells({
  record,
  surface,
  onOpenOrder,
}: {
  record: Row;
  surface: ManufacturingSurface;
  onOpenOrder: (id: string) => void;
}) {
  const product = `${record.product_code} · ${record.product_name}`;
  if (surface === "boms") {
    const bom = record as Bom;
    return (
      <>
        <td className="px-4 py-3">{product}</td>
        <td className="px-4 py-3 tabular-nums">
          {bom.output_quantity} {bom.unit}
        </td>
        <td className="px-4 py-3 tabular-nums">{bom.component_count}</td>
        <td className="px-4 py-3">{new Date(bom.updated_at).toLocaleDateString()}</td>
      </>
    );
  }
  if (surface === "plans") {
    const plan = record as ProductionPlan;
    return (
      <>
        <td className="px-4 py-3">{product}</td>
        <td className="px-4 py-3 tabular-nums">
          {plan.planned_quantity} {plan.unit}
        </td>
        <td className="px-4 py-3">
          {plan.state === "converted" && plan.manufacturing_order_id ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Converted</Badge>
              <button
                type="button"
                className="text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => onOpenOrder(plan.manufacturing_order_id!)}
              >
                {plan.manufacturing_order_code}
              </button>
            </span>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )}
        </td>
      </>
    );
  }
  const order = record as ManufacturingOrder;
  return (
    <>
      <td className="px-4 py-3">{product}</td>
      <td className="px-4 py-3 tabular-nums">
        {order.quantity} {order.unit}
      </td>
      <td className="px-4 py-3">{order.order_date}</td>
      <td className="px-4 py-3">{order.plan_code ?? "—"}</td>
      <td className="px-4 py-3">
        <Badge variant={order.state === "approved" ? "default" : "outline"}>{orderStateLabels[order.state]}</Badge>
      </td>
    </>
  );
}
