"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  FleetCompanies,
  FleetDriver,
  FleetFuelEfficiencyReport,
  FleetFuelEntry,
  FleetMaintenanceEntry,
  FleetVehicle,
} from "@nexora/contracts";
import { Plus, UserPlus } from "lucide-react";
import { inActiveCompany } from "@/lib/session/active-company";
import { useSession } from "@/lib/session/session-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WorkTable } from "@/shared/ui/work-table";
import { DriverForm } from "../components/driver-form";
import { FuelForm } from "../components/fuel-form";
import { MaintenanceForm } from "../components/maintenance-form";
import { VehicleForm } from "../components/vehicle-form";
import {
  billingStatusLabels,
  fleetError,
  fleetLivePages,
  fleetSections,
  fleetSelectClass,
  formatNumber,
  paymentRouteLabels,
  today,
  vehicleFromReference,
  vehicleReference,
  vehicleStatusLabels,
  type FleetSurface,
} from "../model/fleet";

type DirectorySurface = Exclude<FleetSurface, "efficiency">;
type Row = FleetVehicle | FleetDriver | FleetFuelEntry | FleetMaintenanceEntry;
const columns: Record<DirectorySurface, string[]> = {
  vehicles: ["Registration", "Asset no.", "Make & model", "Driver", "Odometer", "Avg km/L", "Tools", "Status"],
  drivers: ["Driver", "Employee", "Designation / terms", "Licence", "Expiry", "Vehicle", "Status"],
  fuel: ["Entry", "Date", "Vehicle", "Driver", "Odometer", "Distance", "Litres", "Amount", "km/L", "Vendor / bill"],
  maintenance: ["Entry", "Date", "Vehicle", "Work performed", "Labour", "Parts", "Total", "Vendor / bill"],
};
const placeholders: Record<DirectorySurface, string> = {
  vehicles: "Registration, model, asset no. or driver",
  drivers: "Driver, employee, licence or vehicle",
  fuel: "Entry, vehicle, vendor or invoice",
  maintenance: "Entry, vehicle, work or vendor",
};
const td = "px-4 py-3";
const num = "px-4 py-3 text-right tabular-nums";

/** Live Fleet pages: Vehicles, Drivers, Fuel, Maintenance and the Fuel Efficiency report. */
export function FleetLiveWorkspace({
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
  const surface = fleetLivePages[page] ?? "vehicles";
  const section = fleetSections[surface];
  const { api, session, loading: sessionLoading } = useSession();
  const editing = !!section.formPage && (page === section.formPage || (!!recordRef && page !== section.listPage));
  const [companies, setCompanies] = useState<FleetCompanies["items"]>([]),
    [companiesLoaded, setCompaniesLoaded] = useState(false),
    [company, setCompany] = useState(""),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [dirty, setDirty] = useState(false);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes(section.readPermission);
  const can = (permission: string | null) =>
    !!permission && permissions.includes(permission) && !session?.impersonation;
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
      .listFleetCompanies()
      // Only the company chosen at sign-in is in scope; the API rejects any other company.
      .then(inActiveCompany)
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        setCompaniesLoaded(true);
        setCompany((current) => (result.items.some((c) => c.id === current) ? current : (result.items[0]?.id ?? "")));
      })
      .catch((e) => active && setError(fleetError(e)));
    return () => {
      active = false;
    };
  }, [api, canRead, refresh]);
  const go = (target: string, reference?: string) => onNavigate("fleet", target, reference);
  if (sessionLoading) return <p role="status">Loading Fleet permissions…</p>;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>
          Your account needs {section.title} read access for this company. Ask a Super Admin to grant Fleet access.
        </AlertDescription>
      </Alert>
    );
  const backToList = () => {
    reportDirty(false);
    go(section.listPage);
  };
  const createButtons: ReactNode = !editing ? (
    <>
      {surface === "vehicles" || surface === "drivers" ? (
        <>
          {can("fleet.vehicle.create") && surface === "vehicles" ? (
            <Button type="button" disabled={!company} onClick={() => go("add-vehicle")}>
              <Plus aria-hidden="true" />
              Add Vehicle
            </Button>
          ) : null}
          {can("fleet.driver.create") ? (
            <Button
              type="button"
              variant={surface === "vehicles" ? "outline" : "default"}
              disabled={!company}
              onClick={() => go("add-driver")}
            >
              <UserPlus aria-hidden="true" />
              Add Driver
            </Button>
          ) : null}
        </>
      ) : section.formPage && can(section.createPermission) ? (
        <Button type="button" disabled={!company} onClick={() => go(section.formPage!)}>
          <Plus aria-hidden="true" />
          Add {section.singular}
        </Button>
      ) : null}
    </>
  ) : null;
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        {!editing ? (
          <div>
            <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--nx-brand)]">
              Fleet
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
              if (!dirty || window.confirm("Discard these unsaved Fleet changes?")) backToList();
            }}
          >
            {section.title}
          </Button>
        )}
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          {companies.length > 1 ? (
            <LabeledField label="Company" className="w-full sm:w-72">
              <select
                className={fleetSelectClass}
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
            <Button type="button" variant="outline" onClick={() => setRefresh((n) => n + 1)}>
              Refresh
            </Button>
          ) : null}
          {createButtons}
        </div>
      </header>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {!company ? (
        <p role="status" className="py-8 text-sm text-muted-foreground">
          {companiesLoaded ? "No companies are available for Fleet." : "Loading available companies…"}
        </p>
      ) : editing ? (
        <EditView
          surface={surface}
          company={company}
          recordRef={recordRef}
          onBack={backToList}
          onDirtyChange={reportDirty}
          go={go}
        />
      ) : surface === "efficiency" ? (
        <EfficiencyReport company={company} refresh={refresh} onOpenVehicle={(id) => go("add-vehicle", id)} />
      ) : (
        <Directory
          key={`${surface}:${company}`}
          surface={surface}
          company={company}
          refresh={refresh}
          canCreate={can(section.createPermission)}
          onOpen={(row) =>
            surface === "vehicles"
              ? go("add-vehicle", row.id)
              : surface === "drivers"
                ? go("add-driver", row.id)
                : go("add-vehicle", (row as FleetFuelEntry | FleetMaintenanceEntry).vehicle_id)
          }
          onCreate={() => section.formPage && go(section.formPage)}
        />
      )}
    </div>
  );
}

function EditView({
  surface,
  company,
  recordRef,
  onBack,
  onDirtyChange,
  go,
}: {
  surface: FleetSurface;
  company: string;
  recordRef?: string;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  go: (page: string, reference?: string) => void;
}) {
  const vehicleId = vehicleFromReference(recordRef);
  const key = `${company}:${recordRef ?? "new"}`;
  if (surface === "vehicles")
    return (
      <VehicleForm
        key={key}
        company={company}
        recordRef={recordRef}
        onClose={onBack}
        onDirtyChange={onDirtyChange}
        onAddFuel={(id) => go("add-fuel-entry", vehicleReference(id))}
        onAddMaintenance={(id) => go("add-maintenance-entry", vehicleReference(id))}
      />
    );
  if (surface === "drivers")
    return (
      <DriverForm key={key} company={company} recordRef={recordRef} onClose={onBack} onDirtyChange={onDirtyChange} />
    );
  if (surface === "fuel")
    return (
      <FuelForm key={key} company={company} vehicleId={vehicleId} onClose={onBack} onDirtyChange={onDirtyChange} />
    );
  return (
    <MaintenanceForm key={key} company={company} vehicleId={vehicleId} onClose={onBack} onDirtyChange={onDirtyChange} />
  );
}

function Directory({
  surface,
  company,
  refresh,
  canCreate,
  onOpen,
  onCreate,
}: {
  surface: DirectorySurface;
  company: string;
  refresh: number;
  canCreate: boolean;
  onOpen: (row: Row) => void;
  onCreate: () => void;
}) {
  const { api } = useSession();
  const section = fleetSections[surface];
  const [records, setRecords] = useState<Row[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loadedScope, setLoadedScope] = useState("");
  const generation = useRef(0);
  const scope = JSON.stringify({ company, search, refresh, surface });
  const read = useCallback(
    (after?: string): Promise<{ items: Row[]; next_cursor: string | null }> => {
      const query = `?${new URLSearchParams({ company_id: company, search, limit: "30", ...(after ? { cursor: after } : {}) })}`;
      if (surface === "vehicles") return api.listFleetVehicles(query);
      if (surface === "drivers") return api.listFleetDrivers(query);
      if (surface === "fuel") return api.listFleetFuelEntries(query);
      return api.listFleetMaintenanceEntries(query);
    },
    [api, company, search, surface],
  );
  useEffect(() => {
    const token = ++generation.current;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      read()
        .then((result) => {
          if (token !== generation.current) return;
          setRecords(result.items);
          setCursor(result.next_cursor);
        })
        .catch((e) => {
          if (token !== generation.current) return;
          setRecords([]);
          setCursor(null);
          setError(fleetError(e));
        })
        .finally(() => {
          if (token !== generation.current) return;
          setLoadedScope(scope);
          setBusy(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      generation.current = token + 1;
    };
  }, [read, scope]);
  async function more() {
    if (busy || !cursor) return;
    const token = generation.current;
    setBusy(true);
    try {
      const result = await read(cursor);
      if (token !== generation.current) return;
      setRecords((current) => [...current, ...result.items]);
      setCursor(result.next_cursor);
    } catch (e) {
      if (token === generation.current) setError(fleetError(e));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  const shown = loadedScope === scope ? records : [],
    loading = busy || loadedScope !== scope;
  const filter = (
    <LabeledField label={`Search ${section.title.toLowerCase()}`} className="w-full sm:max-w-md">
      <Input
        maxLength={160}
        value={search}
        placeholder={placeholders[surface]}
        onChange={(e) => setSearch(e.target.value)}
      />
    </LabeledField>
  );
  return (
    <>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <p role="status" className="text-sm text-muted-foreground">
        {loading
          ? "Loading records…"
          : `${shown.length} record${shown.length === 1 ? "" : "s"}${cursor ? " loaded" : ""}`}
      </p>
      {!loading && !shown.length ? (
        <section className="overflow-hidden rounded-[10px] border border-border bg-card">
          <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 text-left">{filter}</div>
          <div className="space-y-3 px-5 py-10 text-center">
            <h2 className="text-base font-semibold">
              {search ? "No matching records" : `No ${section.title.toLowerCase()} yet`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {search
                ? "Try another search."
                : surface === "vehicles"
                  ? "Add each vehicle when it goes into operation, then assign its driver."
                  : surface === "drivers"
                    ? "Add HR employees who drive company vehicles."
                    : surface === "fuel"
                      ? "Record fuel against a vehicle to calculate its fuel average."
                      : "Record maintenance and repairs against a vehicle."}
            </p>
            {canCreate ? (
              <Button type="button" onClick={onCreate}>
                Add {section.singular}
              </Button>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-[10px] border border-border bg-card">
          <WorkTable
            toolbar={filter}
            label={section.title}
            continuation={{ cursor, hasMore: !!cursor, busy, loadMore: () => void more() }}
            tableId={`app/features/fleet/views/fleet-live-workspace:${surface}`}
            className="w-full min-w-[760px] text-left text-[13px]"
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
              {shown.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-accent">
                  <RowCells surface={surface} row={row} onOpen={() => onOpen(row)} />
                </tr>
              ))}
            </tbody>
          </WorkTable>
        </div>
      )}
    </>
  );
}

function OpenLink({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Billing({
  name,
  reference,
  status,
}: {
  name: string | null;
  reference: string;
  status: FleetFuelEntry["billing_status"];
}) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {name}
      {reference ? <span className="text-muted-foreground">#{reference}</span> : null}
      <Badge variant={status === "billed" ? "secondary" : "outline"}>{billingStatusLabels[status]}</Badge>
    </span>
  );
}

function RowCells({ surface, row, onOpen }: { surface: DirectorySurface; row: Row; onOpen: () => void }) {
  if (surface === "vehicles") {
    const v = row as FleetVehicle;
    return (
      <>
        <td className={td}>
          <OpenLink onClick={onOpen}>{v.registration_no}</OpenLink>
        </td>
        <td className={td}>{v.asset_number || "—"}</td>
        <td className={td}>
          {v.make_model}
          <span className="block text-xs text-muted-foreground">{v.category}</span>
        </td>
        <td className={td}>{v.current_driver_name ?? <span className="text-muted-foreground">Unassigned</span>}</td>
        <td className={num}>{formatNumber(v.current_odometer)} km</td>
        <td className={num}>{v.average_km_per_litre ?? "—"}</td>
        <td className={num}>{v.tool_count}</td>
        <td className={td}>
          <Badge variant={v.status === "active" ? "secondary" : "outline"}>{vehicleStatusLabels[v.status]}</Badge>
        </td>
      </>
    );
  }
  if (surface === "drivers") {
    const d = row as FleetDriver;
    const expired = d.licence_expires_on < today();
    return (
      <>
        <td className={td}>
          <OpenLink onClick={onOpen}>{d.code}</OpenLink>
        </td>
        <td className={td}>
          {d.employee_name}
          <span className="block text-xs text-muted-foreground">{d.employee_number}</span>
        </td>
        <td className={td}>
          {d.designation ?? "—"}
          {d.payment_route ? (
            <span className="block text-xs text-muted-foreground">
              {paymentRouteLabels[d.payment_route] ?? d.payment_route}
            </span>
          ) : null}
        </td>
        <td className={td}>
          {d.licence_number}
          <span className="block text-xs text-muted-foreground">{d.licence_class}</span>
        </td>
        <td className={td}>
          {expired ? <Badge variant="destructive">Expired {d.licence_expires_on}</Badge> : d.licence_expires_on}
        </td>
        <td className={td}>
          {d.assigned_vehicle_registration ?? <span className="text-muted-foreground">Unassigned</span>}
        </td>
        <td className={td}>
          <Badge variant={d.status === "active" ? "secondary" : "outline"}>
            {d.status === "active" ? "Active" : "Inactive"}
          </Badge>
        </td>
      </>
    );
  }
  if (surface === "fuel") {
    const f = row as FleetFuelEntry;
    return (
      <>
        <td className={td}>{f.code}</td>
        <td className={td}>{f.entry_date}</td>
        <td className={td}>
          <OpenLink onClick={onOpen} title="Open vehicle">
            {f.vehicle_registration}
          </OpenLink>
        </td>
        <td className={td}>{f.driver_name ?? "—"}</td>
        <td className={num}>{formatNumber(f.odometer)}</td>
        <td className={num}>{formatNumber(f.distance)} km</td>
        <td className={num}>{f.litres}</td>
        <td className={num}>{formatNumber(f.amount)}</td>
        <td className={`${num} font-semibold`}>{f.km_per_litre}</td>
        <td className={td}>
          <Billing name={f.supplier_name} reference={f.supplier_invoice_ref} status={f.billing_status} />
        </td>
      </>
    );
  }
  const m = row as FleetMaintenanceEntry;
  return (
    <>
      <td className={td}>{m.code}</td>
      <td className={td}>{m.entry_date}</td>
      <td className={td}>
        <OpenLink onClick={onOpen} title="Open vehicle">
          {m.vehicle_registration}
        </OpenLink>
      </td>
      <td className={`${td} max-w-[22rem]`}>{m.work_description}</td>
      <td className={num}>{formatNumber(m.labour_amount)}</td>
      <td className={num}>{formatNumber(m.parts_amount)}</td>
      <td className={`${num} font-semibold`}>{formatNumber(m.total_amount)}</td>
      <td className={td}>
        {m.is_external ? (
          <Billing name={m.supplier_name} reference={m.supplier_invoice_ref} status={m.billing_status} />
        ) : (
          <span className="text-muted-foreground">In-house</span>
        )}
      </td>
    </>
  );
}

function monthStart() {
  return `${today().slice(0, 8)}01`;
}

/** Fuel Efficiency report: km per litre for each vehicle over a period. */
function EfficiencyReport({
  company,
  refresh,
  onOpenVehicle,
}: {
  company: string;
  refresh: number;
  onOpenVehicle: (id: string) => void;
}) {
  const { api } = useSession();
  const [from, setFrom] = useState(monthStart),
    [to, setTo] = useState(today),
    [report, setReport] = useState<FleetFuelEfficiencyReport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      api
        .getFleetFuelEfficiency(
          `?${new URLSearchParams({ company_id: company, ...(from ? { from } : {}), ...(to ? { to } : {}) })}`,
        )
        .then((result) => active && setReport(result))
        .catch((e) => active && setError(fleetError(e)))
        .finally(() => active && setBusy(false));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, company, from, to, refresh]);
  const rows = report?.rows ?? [];
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <LabeledField label="From" className="w-44">
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </LabeledField>
        <LabeledField label="To" className="w-44">
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </LabeledField>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <p role="status" className="text-sm text-muted-foreground">
        {busy ? "Calculating…" : `${rows.length} vehicle${rows.length === 1 ? "" : "s"}`}
      </p>
      <div className="max-w-full overflow-x-auto rounded-[10px] border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <caption className="sr-only">Fuel efficiency by vehicle</caption>
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {["Vehicle", "Make & model", "Fuel entries", "Distance", "Litres", "Fuel cost", "km/L"].map((label) => (
                <th key={label} scope="col" className="px-4 py-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.vehicle_id} className="border-t border-border hover:bg-accent">
                <td className={td}>
                  <OpenLink onClick={() => onOpenVehicle(row.vehicle_id)}>{row.vehicle_registration}</OpenLink>
                </td>
                <td className={td}>{row.make_model}</td>
                <td className={num}>{row.entries}</td>
                <td className={num}>{formatNumber(row.distance)} km</td>
                <td className={num}>{formatNumber(row.litres)}</td>
                <td className={num}>{formatNumber(row.amount)}</td>
                <td className={`${num} font-semibold`}>{row.km_per_litre ?? "—"}</td>
              </tr>
            ))}
            {!busy && !rows.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No vehicles yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
