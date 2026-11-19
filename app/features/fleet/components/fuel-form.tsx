"use client";
import { useCallback, useEffect, useState } from "react";
import {
  computeFuelAmount,
  computeKmPerLitre,
  fleetFuelEntryInputSchema,
  type FleetFuelEntry,
  type FleetFuelEntryInput,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Input } from "@/components/ui/input";
import { LabeledField } from "@/shared/ui/labeled-field";
import { fleetError, formatNumber, today } from "../model/fleet";
import { FleetFormShell } from "./fleet-form-shell";
import { FleetLookup } from "./fleet-lookup";
import { useFleetForm } from "./use-fleet-form";

/**
 * Fuel entry (meeting 16 Nov 2026): enter the odometer reading and litres added; the fuel average
 * (current − previous reading) ÷ litres is calculated as you type. Vendor purchases record the
 * supplier and invoice number so the bill can follow.
 */
export function FuelForm({
  company,
  vehicleId,
  onClose,
  onDirtyChange,
}: {
  company: string;
  /** Pre-selected when opened from a vehicle's Fuel button. */
  vehicleId: string | null;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, session, csrfToken } = useSession(),
    [vehicleLabel, setVehicleLabel] = useState(""),
    [driverLabel, setDriverLabel] = useState(""),
    [supplierLabel, setSupplierLabel] = useState(""),
    [reading, setReading] = useState<{ vehicleId: string; odometer: string } | null>(null),
    [vehicleError, setVehicleError] = useState("");
  const permissions = session?.user.permissions ?? [];
  const canWrite = permissions.includes("fleet.fuel.create") && !session?.impersonation;
  const persist = useCallback(
    (_id: string | null, input: FleetFuelEntryInput, key: string) => api.createFleetFuelEntry(input, csrfToken(), key),
    [api, csrfToken],
  );
  const form = useFleetForm<FleetFuelEntryInput & { expected_version?: number }, FleetFuelEntry>({
    company,
    formPage: "add-fuel-entry",
    initial: () => ({
      company_id: company,
      vehicle_id: vehicleId ?? "",
      driver_id: null,
      entry_date: today(),
      odometer: "",
      litres: "",
      rate: "",
      supplier_id: null,
      supplier_invoice_ref: "",
      notes: "",
    }),
    persist,
    schema: fleetFuelEntryInputSchema,
    canWrite,
    label: (record) => `${record.code} (${record.km_per_litre} km/L)`,
    onSaved: () => onClose(),
    onDirtyChange,
  });
  const selected = form.input.vehicle_id;
  // The previous reading comes from the vehicle: its latest fuel entry, or its opening odometer.
  useEffect(() => {
    if (!selected) return;
    let active = true;
    api
      .getFleetVehicle(selected, company)
      .then((vehicle) => {
        if (!active) return;
        setVehicleError("");
        setReading({ vehicleId: vehicle.id, odometer: vehicle.current_odometer });
        setVehicleLabel(`${vehicle.registration_no} · ${vehicle.make_model}`);
        if (vehicle.current_driver_id && vehicle.current_driver_name) setDriverLabel(vehicle.current_driver_name);
      })
      .catch((e) => active && setVehicleError(fleetError(e)));
    return () => {
      active = false;
    };
  }, [api, company, selected]);
  const previous = reading && reading.vehicleId === selected ? reading.odometer : null;
  const set = <K extends keyof FleetFuelEntryInput>(key: K, value: FleetFuelEntryInput[K]) =>
    form.change((current) => ({ ...current, [key]: value }));
  const odometer = form.input.odometer ?? "",
    litres = form.input.litres ?? "",
    rate = form.input.rate ?? "";
  const average = previous && odometer && litres ? computeKmPerLitre(previous, odometer, litres) : null;
  const amount = litres && rate ? computeFuelAmount(litres, rate) : null;
  const distance = previous && odometer ? Number(odometer) - Number(previous) : null;
  const tooLow = distance !== null && Number.isFinite(distance) && distance <= 0;
  return (
    <FleetFormShell
      title="Add Fuel Entry"
      description="Enter the odometer reading and litres added. The fuel average is calculated for you."
      status={form.dirty ? "Unsaved changes" : "New"}
      error={form.error || vehicleError}
      loading={false}
      loadFailed={false}
      busy={form.saving}
      disabled={!canWrite}
      canSave={canWrite}
      saveLabel="Save Fuel Entry"
      saving={form.saving}
      hint={
        <span aria-live="polite">
          {average ? (
            <>
              Fuel average <strong className="text-foreground">{average} km/L</strong> ({formatNumber(String(distance))}{" "}
              km ÷ {litres} L)
            </>
          ) : tooLow ? (
            <span className="text-destructive">The reading must be higher than the previous reading.</span>
          ) : (
            "Fuel average = (current reading − previous reading) ÷ litres added."
          )}
        </span>
      }
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
        <LabeledField label="Previous reading (km)" hint="Last fuel entry, or the opening odometer.">
          <Input readOnly value={previous ? formatNumber(previous) : "Choose a vehicle"} />
        </LabeledField>
        <LabeledField label="Current odometer (km) *">
          <Input
            inputMode="decimal"
            aria-invalid={tooLow || undefined}
            value={odometer}
            onChange={(e) => set("odometer", e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Litres added *">
          <Input inputMode="decimal" value={litres} onChange={(e) => set("litres", e.target.value)} />
        </LabeledField>
        <LabeledField label="Rate per litre *">
          <Input inputMode="decimal" value={rate} onChange={(e) => set("rate", e.target.value)} />
        </LabeledField>
        <LabeledField label="Amount">
          <Input readOnly value={amount ? formatNumber(amount) : "—"} />
        </LabeledField>
        <LabeledField label="Fuel average (km/L)">
          <Input readOnly value={average ?? "—"} />
        </LabeledField>
        <LabeledField label="Driver" hint="Defaults to the vehicle's current driver.">
          <FleetLookup
            company={company}
            kind="driver"
            label="Driver"
            disabled={!canWrite || form.saving}
            value={form.input.driver_id ?? ""}
            selectedLabel={driverLabel}
            onChange={(choice) => {
              setDriverLabel(choice?.item.name ?? "");
              set("driver_id", choice?.id ?? null);
            }}
          />
        </LabeledField>
        <LabeledField label="Vendor" hint="Only when fuel is bought from a vendor on credit or invoice.">
          <FleetLookup
            company={company}
            kind="supplier"
            label="Vendor"
            disabled={!canWrite || form.saving}
            value={form.input.supplier_id ?? ""}
            selectedLabel={supplierLabel}
            onChange={(choice) => {
              setSupplierLabel(choice ? `${choice.item.code} · ${choice.item.name}` : "");
              set("supplier_id", choice?.id ?? null);
            }}
          />
        </LabeledField>
        {form.input.supplier_id ? (
          <LabeledField label="Vendor invoice no." hint="The vendor bill is created from this later.">
            <Input
              maxLength={80}
              value={form.input.supplier_invoice_ref ?? ""}
              onChange={(e) => set("supplier_invoice_ref", e.target.value)}
            />
          </LabeledField>
        ) : null}
      </div>
    </FleetFormShell>
  );
}
