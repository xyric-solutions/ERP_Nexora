"use client";
import { useCallback, useState } from "react";
import { warehouseInputSchema, warehouseDraftSchema, type WarehouseInput } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LabeledField } from "@/shared/ui/labeled-field";
import { productSelectClass } from "../model/products";
import { ProductLookup } from "./product-lookup";
import { useInventoryForm } from "./use-inventory-form";

export function WarehouseForm({
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
    [locationName, setLocationName] = useState<string | null>(null);
  const canWrite = !!session?.user.permissions.includes("inventory.bin.create") && !session?.impersonation;
  const load = useCallback(
    async (id: string, scope: string) => {
      const record = await api.getWarehouse(id, scope);
      return { record, input: warehouseInputSchema.strip().parse({ ...record, expected_version: record.version }) };
    },
    [api],
  );
  const persist = useCallback(
    (id: string | null, input: WarehouseInput, key: string) => api.saveWarehouse(id, input, csrfToken(), key),
    [api, csrfToken],
  );
  const form = useInventoryForm({
    company,
    recordRef,
    formPage: "add-warehouse",
    initial: () => warehouseDraftSchema.parse({ company_id: company, name: "" }),
    load,
    persist,
    schema: warehouseInputSchema,
    canWrite,
    onClose,
    onDirtyChange,
  });
  const change = <K extends keyof WarehouseInput>(key: K, value: WarehouseInput[K]) =>
    form.change((current) => ({ ...current, [key]: value }));
  if (form.loading) return <p role="status">Loading warehouse…</p>;
  if (form.loadFailed)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {form.error}
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" onClick={form.reload}>
              Retry
            </Button>
            <Button type="button" variant="outline" onClick={form.close}>
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
        void form.save(false);
      }}
      className="min-w-0 space-y-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{form.record ? form.record.name : "New warehouse"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {form.record?.code ?? "Warehouse code assigned when saved"}
          </p>
        </div>
        <Badge variant="outline">{form.dirty ? "Unsaved" : (form.record?.status ?? "New")}</Badge>
      </header>
      {form.error ? (
        <Alert variant="destructive">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset
        disabled={form.saving || !canWrite}
        className="m-0 min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <LabeledField label="Warehouse name *">
            <Input
              maxLength={200}
              value={form.input.name}
              onChange={(e) => change("name", e.target.value)}
              placeholder="e.g. Main warehouse"
            />
          </LabeledField>
          <LabeledField label="Warehouse code">
            <Input readOnly value={form.record?.code ?? "Assigned on save"} />
          </LabeledField>
          <ProductLookup
            company={company}
            surface="warehouses"
            kind="location"
            label="Location / City"
            value={form.input.location_id}
            name={locationName ?? form.record?.location_name ?? null}
            onChange={(id, name) => {
              change("location_id", id);
              setLocationName(name);
            }}
          />
          <LabeledField label="Contact person">
            <Input
              maxLength={160}
              value={form.input.contact_name}
              onChange={(e) => change("contact_name", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Phone">
            <Input
              type="tel"
              maxLength={60}
              value={form.input.phone}
              onChange={(e) => change("phone", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Email">
            <Input
              type="email"
              maxLength={254}
              value={form.input.email}
              onChange={(e) => change("email", e.target.value)}
            />
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
        </div>
        <div className="grid min-w-0 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <LabeledField label="Address">
            <Textarea
              className="min-h-24!"
              rows={3}
              maxLength={1000}
              value={form.input.address}
              onChange={(e) => change("address", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Notes">
            <Textarea
              className="min-h-24!"
              rows={3}
              maxLength={4000}
              value={form.input.notes}
              onChange={(e) => change("notes", e.target.value)}
            />
          </LabeledField>
        </div>
      </fieldset>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          {!canWrite
            ? "Read-only warehouse access."
            : form.dirty
              ? "You have unsaved changes."
              : form.record
                ? "All changes saved."
                : "Add the warehouse details."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={form.saving} onClick={form.close}>
            Close
          </Button>
          {canWrite ? (
            <>
              <Button type="submit" variant="outline" disabled={form.saving || (!form.dirty && !!form.record)}>
                {form.saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                disabled={form.saving || (!form.dirty && !!form.record)}
                onClick={() => void form.save(true)}
              >
                Save & Close
              </Button>
            </>
          ) : null}
        </div>
      </footer>
    </form>
  );
}
