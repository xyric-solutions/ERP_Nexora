"use client";
import { useCallback, useState } from "react";
import { fleetVehicleInputSchema, type FleetVehicle, type FleetVehicleInput } from "@nexora/contracts";
import { Fuel, Wrench, Hammer } from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/shared/ui/labeled-field";
import { fleetSelectClass, formatNumber, fuelTypeLabels, ownershipLabels, vehicleStatusLabels } from "../model/fleet";
import { FleetFormShell } from "./fleet-form-shell";
import { FleetLookup } from "./fleet-lookup";
import { VehicleToolsSheet } from "./vehicle-tools-sheet";
import { useFleetForm } from "./use-fleet-form";

/**
 * Add Vehicle / vehicle record. Fleet owns the vehicle until a live Assets register exists;
 * the asset number links it to its Assets record. A saved vehicle opens its Tools, Fuel and Maintenance.
 */
export function VehicleForm({
  company,
  recordRef,
  onClose,
  onDirtyChange,
  onAddFuel,
  onAddMaintenance,
}: {
  company: string;
  recordRef?: string;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onAddFuel: (vehicleId: string) => void;
  onAddMaintenance: (vehicleId: string) => void;
}) {
  const { api, session, csrfToken } = useSession(),
    [driverLabel, setDriverLabel] = useState(""),
    [toolsOpen, setToolsOpen] = useState(false);
  const permissions = session?.user.permissions ?? [];
  const load = useCallback(
    async (id: string, scope: string) => {
      const record = await api.getFleetVehicle(id, scope);
      setDriverLabel(record.current_driver_name ?? "");
      return {
        record,
        input: {
          company_id: record.company_id,
          registration_no: record.registration_no,
          asset_number: record.asset_number,
          make_model: record.make_model,
          category: record.category,
          ownership: record.ownership,
          fuel_type: record.fuel_type,
          opening_odometer: record.opening_odometer,
          status: record.status,
          current_driver_id: record.current_driver_id,
          notes: record.notes,
          expected_version: record.version,
        } satisfies FleetVehicleInput,
      };
    },
    [api],
  );
  const persist = useCallback(
    (id: string | null, input: FleetVehicleInput, key: string) => api.saveFleetVehicle(id, input, csrfToken(), key),
    [api, csrfToken],
  );
  const canWrite =
    permissions.includes(recordRef ? "fleet.vehicle.update" : "fleet.vehicle.create") && !session?.impersonation;
  // A new vehicle needs create; once saved, edits need update. The server enforces both.
  const canSaveAny =
    (permissions.includes("fleet.vehicle.create") || permissions.includes("fleet.vehicle.update")) &&
    !session?.impersonation;
  const form = useFleetForm<FleetVehicleInput, FleetVehicle>({
    company,
    recordRef,
    formPage: "add-vehicle",
    initial: () => ({
      company_id: company,
      registration_no: "",
      asset_number: "",
      make_model: "",
      category: "",
      ownership: "owned",
      fuel_type: "diesel",
      opening_odometer: "",
      status: "active",
      current_driver_id: null,
      notes: "",
    }),
    load,
    persist,
    schema: fleetVehicleInputSchema,
    canWrite: canSaveAny,
    label: (record) => record.registration_no,
    onDirtyChange,
  });
  const record = form.record;
  const writable = record ? permissions.includes("fleet.vehicle.update") && !session?.impersonation : canWrite;
  const set = <K extends keyof FleetVehicleInput>(key: K, value: FleetVehicleInput[K]) =>
    form.change((current) => ({ ...current, [key]: value }));
  const close = () => form.confirmDiscard() && (onDirtyChange?.(false), onClose());
  const usable = record && record.status !== "retired" && !form.dirty;
  return (
    <>
      <FleetFormShell
        title={record ? `${record.registration_no}` : "Add Vehicle"}
        description={
          record
            ? `${record.code} · ${record.make_model}`
            : "Bring a vehicle into Fleet when it goes into operation, then assign its driver."
        }
        status={form.dirty ? "Unsaved changes" : record ? vehicleStatusLabels[record.status] : "New"}
        error={form.error}
        loading={form.loading}
        loadFailed={form.loadFailed}
        busy={form.saving}
        disabled={!writable}
        canSave={writable && (form.dirty || !record)}
        saveLabel="Save Vehicle"
        saving={form.saving}
        hint={
          record
            ? `Odometer ${formatNumber(record.current_odometer)} km${record.average_km_per_litre ? ` · average ${record.average_km_per_litre} km/L` : ""}`
            : "Save the vehicle to record its tools, fuel and maintenance."
        }
        actions={
          record ? (
            <>
              <Button type="button" variant="outline" disabled={form.dirty} onClick={() => setToolsOpen(true)}>
                <Hammer aria-hidden="true" />
                Tools ({record.tool_count})
              </Button>
              {permissions.includes("fleet.fuel.create") ? (
                <Button type="button" variant="outline" disabled={!usable} onClick={() => onAddFuel(record.id)}>
                  <Fuel aria-hidden="true" />
                  Fuel
                </Button>
              ) : null}
              {permissions.includes("fleet.maintenance.create") ? (
                <Button type="button" variant="outline" disabled={!usable} onClick={() => onAddMaintenance(record.id)}>
                  <Wrench aria-hidden="true" />
                  Maintenance
                </Button>
              ) : null}
            </>
          ) : null
        }
        onSubmit={() => void form.save()}
        onClose={close}
        onRetry={form.reload}
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <LabeledField label="Registration no. *">
            <Input
              maxLength={20}
              value={form.input.registration_no}
              placeholder="KHI-6296"
              onChange={(e) => set("registration_no", e.target.value.toUpperCase())}
            />
          </LabeledField>
          <LabeledField label="Asset no." hint="The vehicle's number in Assets, if it has one.">
            <Input
              maxLength={40}
              value={form.input.asset_number}
              placeholder="FA-10214"
              onChange={(e) => set("asset_number", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Make & model *">
            <Input
              maxLength={160}
              value={form.input.make_model}
              placeholder="Toyota Hilux Revo 2.8"
              onChange={(e) => set("make_model", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Category *">
            <Input
              maxLength={80}
              value={form.input.category}
              placeholder="Light commercial"
              onChange={(e) => set("category", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Ownership *">
            <select
              className={fleetSelectClass}
              value={form.input.ownership}
              onChange={(e) => set("ownership", e.target.value as FleetVehicleInput["ownership"])}
            >
              {Object.entries(ownershipLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Fuel type *">
            <select
              className={fleetSelectClass}
              value={form.input.fuel_type}
              onChange={(e) => set("fuel_type", e.target.value as FleetVehicleInput["fuel_type"])}
            >
              {Object.entries(fuelTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField
            label="Opening odometer (km) *"
            hint={record ? "Fixed once fuel has been recorded." : "The reading when the vehicle enters Fleet."}
          >
            <Input
              inputMode="decimal"
              value={form.input.opening_odometer}
              onChange={(e) => set("opening_odometer", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Status *">
            <select
              className={fleetSelectClass}
              value={form.input.status}
              onChange={(e) => set("status", e.target.value as FleetVehicleInput["status"])}
            >
              {Object.entries(vehicleStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Driver" hint="Fleet drivers who are not assigned to another vehicle.">
            <FleetLookup
              company={company}
              kind="driver"
              label="Driver"
              disabled={!writable || form.saving}
              value={form.input.current_driver_id ?? ""}
              selectedLabel={driverLabel}
              onChange={(choice) => {
                setDriverLabel(choice?.item.name ?? "");
                set("current_driver_id", choice?.id ?? null);
              }}
            />
          </LabeledField>
        </div>
        <LabeledField label="Notes">
          <Textarea
            className="min-h-20!"
            maxLength={2000}
            value={form.input.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </LabeledField>
      </FleetFormShell>
      {record ? (
        <VehicleToolsSheet
          open={toolsOpen}
          onOpenChange={setToolsOpen}
          company={company}
          vehicle={record}
          canWrite={
            permissions.includes("fleet.vehicle.update") && !session?.impersonation && record.status !== "retired"
          }
          onChanged={form.reload}
        />
      ) : null}
    </>
  );
}
