"use client";
import { useCallback, useEffect, useId, useState } from "react";
import {
  computeMaintenanceTotal,
  fleetMaintenanceInputSchema,
  type FleetMaintenanceEntry,
  type FleetMaintenanceInput,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/shared/ui/labeled-field";
import { formatNumber, today } from "../model/fleet";
import { FleetFormShell } from "./fleet-form-shell";
import { FleetLookup } from "./fleet-lookup";
import { useFleetForm } from "./use-fleet-form";

/**
 * Maintenance entry (meeting 16 Nov 2026): select the vehicle, describe the work, enter the labour
 * and parts amounts. Outsourced work names the vendor and its invoice so the bill can follow.
 */
export function MaintenanceForm({
  company,
  vehicleId,
  onClose,
  onDirtyChange,
}: {
  company: string;
  vehicleId: string | null;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, session, csrfToken } = useSession(),
    [vehicleLabel, setVehicleLabel] = useState(""),
    [supplierLabel, setSupplierLabel] = useState(""),
    externalId = useId();
  const permissions = session?.user.permissions ?? [];
  const canWrite = permissions.includes("fleet.maintenance.create") && !session?.impersonation;
  const persist = useCallback(
    (_id: string | null, input: FleetMaintenanceInput, key: string) =>
      api.createFleetMaintenanceEntry(input, csrfToken(), key),
    [api, csrfToken],
  );
  const form = useFleetForm<FleetMaintenanceInput & { expected_version?: number }, FleetMaintenanceEntry>({
    company,
    formPage: "add-maintenance-entry",
    initial: () => ({
      company_id: company,
      vehicle_id: vehicleId ?? "",
      entry_date: today(),
      odometer: null,
      work_description: "",
      labour_amount: "0",
      parts_amount: "0",
      is_external: false,
      supplier_id: null,
      supplier_invoice_ref: "",
    }),
    persist,
    schema: fleetMaintenanceInputSchema,
    canWrite,
    label: (record) => record.code,
    onSaved: () => onClose(),
    onDirtyChange,
  });
  // Opened from a vehicle's Maintenance button: show which vehicle is preselected.
  useEffect(() => {
    if (!vehicleId) return;
    let active = true;
    api
      .getFleetVehicle(vehicleId, company)
      .then((vehicle) => active && setVehicleLabel(`${vehicle.registration_no} · ${vehicle.make_model}`))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, company, vehicleId]);
  const set = <K extends keyof FleetMaintenanceInput>(key: K, value: FleetMaintenanceInput[K]) =>
    form.change((current) => ({ ...current, [key]: value }));
  const external = !!form.input.is_external;
  const total = computeMaintenanceTotal(form.input.labour_amount ?? "0", form.input.parts_amount ?? "0");
  return (
    <FleetFormShell
      title="Add Maintenance"
      description="Record the maintenance or repair carried out on a vehicle."
      status={form.dirty ? "Unsaved changes" : "New"}
      error={form.error}
      loading={false}
      loadFailed={false}
      busy={form.saving}
      disabled={!canWrite}
      canSave={canWrite}
      saveLabel="Save Maintenance"
      saving={form.saving}
      hint={total ? `Total ${formatNumber(total)}` : "Total = labour + parts."}
      onSubmit={() => void form.save()}
      onClose={() => form.confirmDiscard() && (onDirtyChange?.(false), onClose())}
      onRetry={() => undefined}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <LabeledField label="Vehicle *">
          <FleetLookup
            company={company}
            kind="vehicle"
            label="Vehicle"
            required
            disabled={!canWrite || form.saving}
            value={form.input.vehicle_id}
            selectedLabel={vehicleLabel}
            onChange={(choice) => {
              setVehicleLabel(choice ? `${choice.item.code} · ${choice.item.name}` : "");
              set("vehicle_id", choice?.id ?? "");
            }}
          />
        </LabeledField>
        <LabeledField label="Date *">
          <Input
            type="date"
            max={today()}
            value={form.input.entry_date}
            onChange={(e) => set("entry_date", e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Odometer (km)">
          <Input
            inputMode="decimal"
            value={form.input.odometer ?? ""}
            onChange={(e) => set("odometer", e.target.value || null)}
          />
        </LabeledField>
        <LabeledField label="Labour amount *">
          <Input
            inputMode="decimal"
            value={form.input.labour_amount ?? ""}
            onChange={(e) => set("labour_amount", e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Parts / maintenance amount *">
          <Input
            inputMode="decimal"
            value={form.input.parts_amount ?? ""}
            onChange={(e) => set("parts_amount", e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Total">
          <Input readOnly value={total ? formatNumber(total) : "—"} />
        </LabeledField>
      </div>
      <LabeledField label="Work performed *">
        <Textarea
          className="min-h-20!"
          maxLength={2000}
          value={form.input.work_description}
          placeholder="What maintenance or repair was carried out"
          onChange={(e) => set("work_description", e.target.value)}
        />
      </LabeledField>
      <label htmlFor={externalId} className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          id={externalId}
          checked={external}
          onCheckedChange={(checked) =>
            form.change((current) => ({
              ...current,
              is_external: checked === true,
              supplier_id: checked === true ? current.supplier_id : null,
              supplier_invoice_ref: checked === true ? current.supplier_invoice_ref : "",
            }))
          }
        />
        Done by an external vendor
      </label>
      {external ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <LabeledField label="Vendor *">
            <FleetLookup
              company={company}
              kind="supplier"
              label="Vendor"
              required
              disabled={!canWrite || form.saving}
              value={form.input.supplier_id ?? ""}
              selectedLabel={supplierLabel}
              onChange={(choice) => {
                setSupplierLabel(choice ? `${choice.item.code} · ${choice.item.name}` : "");
                set("supplier_id", choice?.id ?? null);
              }}
            />
          </LabeledField>
          <LabeledField label="Vendor invoice no." hint="The vendor bill is created from this later.">
            <Input
              maxLength={80}
              value={form.input.supplier_invoice_ref ?? ""}
              onChange={(e) => set("supplier_invoice_ref", e.target.value)}
            />
          </LabeledField>
        </div>
      ) : null}
    </FleetFormShell>
  );
}
