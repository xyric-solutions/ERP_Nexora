"use client";
import { useCallback, useState } from "react";
import { fleetDriverInputSchema, type FleetDriver, type FleetDriverInput } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/shared/ui/labeled-field";
import { fleetSelectClass, paymentRouteLabels } from "../model/fleet";
import { FleetFormShell } from "./fleet-form-shell";
import { FleetLookup } from "./fleet-lookup";
import { useFleetForm } from "./use-fleet-form";

/** Add Driver: pick an HR employee of this company and record the licence details HR does not hold. */
export function DriverForm({
  company,
  recordRef,
  onClose,
  onDirtyChange,
}: {
  company: string;
  recordRef?: string;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, session, csrfToken } = useSession(),
    [employeeLabel, setEmployeeLabel] = useState(""),
    [employeeDetail, setEmployeeDetail] = useState("");
  const permissions = session?.user.permissions ?? [];
  const load = useCallback(
    async (id: string, scope: string) => {
      const record = await api.getFleetDriver(id, scope);
      setEmployeeLabel(`${record.employee_number} · ${record.employee_name}`);
      return {
        record,
        input: {
          company_id: record.company_id,
          employee_id: record.employee_id,
          licence_number: record.licence_number,
          licence_class: record.licence_class,
          licence_expires_on: record.licence_expires_on,
          status: record.status,
          notes: record.notes,
          expected_version: record.version,
        } satisfies FleetDriverInput,
      };
    },
    [api],
  );
  const persist = useCallback(
    (id: string | null, input: FleetDriverInput, key: string) => api.saveFleetDriver(id, input, csrfToken(), key),
    [api, csrfToken],
  );
  const form = useFleetForm<FleetDriverInput, FleetDriver>({
    company,
    recordRef,
    formPage: "add-driver",
    initial: () => ({
      company_id: company,
      employee_id: "",
      licence_number: "",
      licence_class: "",
      licence_expires_on: "",
      status: "active",
      notes: "",
    }),
    load,
    persist,
    schema: fleetDriverInputSchema,
    canWrite:
      (permissions.includes("fleet.driver.create") || permissions.includes("fleet.driver.update")) &&
      !session?.impersonation,
    label: (record) => `${record.code} · ${record.employee_name}`,
    onDirtyChange,
  });
  const record = form.record;
  const writable =
    permissions.includes(record ? "fleet.driver.update" : "fleet.driver.create") && !session?.impersonation;
  const set = <K extends keyof FleetDriverInput>(key: K, value: FleetDriverInput[K]) =>
    form.change((current) => ({ ...current, [key]: value }));
  const expired =
    !!form.input.licence_expires_on && form.input.licence_expires_on < new Date().toISOString().slice(0, 10);
  return (
    <FleetFormShell
      title={record ? `${record.code} · ${record.employee_name}` : "Add Driver"}
      description={
        record
          ? [
              record.designation,
              record.payment_route ? paymentRouteLabels[record.payment_route] : null,
              record.assigned_vehicle_registration
                ? `Drives ${record.assigned_vehicle_registration}`
                : "No vehicle assigned",
            ]
              .filter(Boolean)
              .join(" · ")
          : "Choose the HR employee who will drive, then add their licence details."
      }
      status={form.dirty ? "Unsaved changes" : record ? (record.status === "active" ? "Active" : "Inactive") : "New"}
      error={form.error}
      loading={form.loading}
      loadFailed={form.loadFailed}
      busy={form.saving}
      disabled={!writable}
      canSave={writable && (form.dirty || !record)}
      saveLabel="Save Driver"
      saving={form.saving}
      hint="Assign the driver to a vehicle from the vehicle record."
      onSubmit={() => void form.save()}
      onClose={() => form.confirmDiscard() && (onDirtyChange?.(false), onClose())}
      onRetry={form.reload}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <LabeledField
          label="HR employee *"
          hint={
            record ? "A driver keeps their employee record." : employeeDetail || "Active employees of this company."
          }
        >
          <FleetLookup
            company={company}
            kind="employee"
            label="HR employee"
            required
            disabled={!!record || !writable || form.saving}
            value={form.input.employee_id}
            selectedLabel={employeeLabel}
            onChange={(choice) => {
              setEmployeeLabel(choice ? `${choice.item.code} · ${choice.item.name}` : "");
              setEmployeeDetail(choice?.item.detail ?? "");
              set("employee_id", choice?.id ?? "");
            }}
          />
        </LabeledField>
        <LabeledField label="Licence no. *">
          <Input
            maxLength={60}
            value={form.input.licence_number}
            onChange={(e) => set("licence_number", e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Licence class *" hint="For example LTV or HTV.">
          <Input
            maxLength={40}
            value={form.input.licence_class}
            onChange={(e) => set("licence_class", e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Licence expiry *" hint={expired ? "This licence has expired." : undefined}>
          <Input
            type="date"
            value={form.input.licence_expires_on}
            onChange={(e) => set("licence_expires_on", e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Status *">
          <select
            className={fleetSelectClass}
            value={form.input.status}
            onChange={(e) => set("status", e.target.value as FleetDriverInput["status"])}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
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
  );
}
