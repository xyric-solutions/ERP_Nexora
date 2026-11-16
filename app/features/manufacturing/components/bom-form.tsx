"use client";
import { useCallback, useState } from "react";
import { bomInputSchema, type Bom, type BomInput } from "@nexora/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WorkForm, WorkFormLayout } from "@/shared/ui/work-form";
import { ManufacturingLookup } from "./manufacturing-lookup";
import { useManufacturingForm } from "./use-manufacturing-form";

type Known = Record<string, { label: string; unit: string }>;
function knownFrom(record: Bom): Known {
  return Object.fromEntries([
    [record.product_id, { label: `${record.product_code} · ${record.product_name}`, unit: record.unit }],
    ...record.lines.map((line) => [
      line.product_id,
      { label: `${line.product_code} · ${line.product_name}`, unit: line.unit },
    ]),
  ]);
}

export function BomForm({
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
    [known, setKnown] = useState<Known>({});
  const permissions = session?.user.permissions ?? [];
  const load = useCallback(
    async (id: string, scope: string) => {
      const record = await api.getBom(id, scope);
      setKnown(knownFrom(record));
      return {
        record,
        input: {
          company_id: record.company_id,
          product_id: record.product_id,
          output_quantity: record.output_quantity,
          notes: record.notes,
          lines: record.lines.map((line) => ({ product_id: line.product_id, quantity: line.quantity })),
          expected_version: record.version,
        } satisfies BomInput,
      };
    },
    [api],
  );
  const persist = useCallback(
    async (id: string | null, input: BomInput, key: string) => {
      const result = await api.saveBom(id, input, csrfToken(), key);
      setKnown(knownFrom(result.record));
      return result;
    },
    [api, csrfToken],
  );
  const form = useManufacturingForm<BomInput, Bom>({
    company,
    recordRef,
    formPage: "bom-editor",
    initial: () => ({
      company_id: company,
      product_id: "",
      output_quantity: "1",
      notes: "",
      lines: [{ product_id: "", quantity: "1" }],
    }),
    load,
    persist,
    schema: bomInputSchema,
    // Gate for saving at all; `writable` below decides per state (create vs update).
    canWrite:
      !session?.impersonation &&
      (permissions.includes("manufacturing.bom.create") || permissions.includes("manufacturing.bom.update")),
    onClose,
    onDirtyChange,
  });
  // A saved Bill of Materials is edited with update access from then on.
  const writable =
    !session?.impersonation &&
    permissions.includes(form.record ? "manufacturing.bom.update" : "manufacturing.bom.create");
  const unit = form.input.product_id ? (known[form.input.product_id]?.unit ?? "") : "";
  const setLine = (index: number, patch: Partial<BomInput["lines"][number]>) =>
    form.change((current) => ({
      ...current,
      lines: current.lines.map((line, n) => (n === index ? { ...line, ...patch } : line)),
    }));
  if (form.loading)
    return (
      <WorkFormLayout>
        <p role="status">Loading Bill of Materials…</p>
      </WorkFormLayout>
    );
  if (form.loadFailed)
    return (
      <WorkFormLayout>
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
      </WorkFormLayout>
    );
  const chosen = form.input.lines.map((line) => line.product_id).filter(Boolean);
  return (
    <WorkForm
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.save(false);
      }}
      className="min-w-0 space-y-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{form.record?.code ?? "New Bill of Materials"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Components and quantities needed to make the output quantity of one finished product.
          </p>
        </div>
        <Badge variant="outline">{form.dirty ? "Unsaved changes" : form.record ? "Saved" : "New"}</Badge>
      </header>
      {form.error ? (
        <Alert variant="destructive">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset
        disabled={form.saving || !writable}
        className="m-0 min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <LabeledField
            label="Finished product *"
            hint={form.record ? "The finished product of a saved Bill of Materials cannot change." : undefined}
          >
            <ManufacturingLookup
              company={company}
              surface="boms"
              kind="finished_product"
              label="Finished product"
              required
              disabled={!!form.record || !writable || form.saving}
              value={form.input.product_id}
              selectedLabel={known[form.input.product_id]?.label}
              exclude={chosen}
              onChange={(choice) => {
                if (choice)
                  setKnown((current) => ({
                    ...current,
                    [choice.id]: { label: choice.label, unit: choice.unit ?? "" },
                  }));
                form.change((current) => ({ ...current, product_id: choice?.id ?? "" }));
              }}
            />
          </LabeledField>
          <LabeledField label="Output quantity *" hint="The quantity these components produce.">
            <Input
              inputMode="decimal"
              value={form.input.output_quantity}
              onChange={(e) => form.change((current) => ({ ...current, output_quantity: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="Unit">
            <Input readOnly value={unit || "From the product"} />
          </LabeledField>
          <LabeledField label="BOM code">
            <Input readOnly value={form.record?.code ?? "Assigned on save"} />
          </LabeledField>
        </div>
        <section className="space-y-3 border-t border-border pt-4" aria-label="Components">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Components</h3>
            {writable ? (
              <Button
                type="button"
                variant="outline"
                disabled={form.input.lines.length >= 200}
                onClick={() =>
                  form.change((current) => ({
                    ...current,
                    lines: [...current.lines, { product_id: "", quantity: "1" }],
                  }))
                }
              >
                <Plus aria-hidden="true" />
                Add component
              </Button>
            ) : null}
          </div>
          <div className="space-y-3">
            {form.input.lines.map((line, index) => (
              <div
                key={index}
                className="grid min-w-0 items-start gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_7rem_2.5rem]"
              >
                <LabeledField label={`Component ${index + 1} *`}>
                  <ManufacturingLookup
                    company={company}
                    surface="boms"
                    kind="component"
                    label={`Component ${index + 1}`}
                    required
                    disabled={!writable || form.saving}
                    value={line.product_id}
                    selectedLabel={known[line.product_id]?.label}
                    exclude={[form.input.product_id, ...chosen.filter((id) => id !== line.product_id)]}
                    onChange={(choice) => {
                      if (choice)
                        setKnown((current) => ({
                          ...current,
                          [choice.id]: { label: choice.label, unit: choice.unit ?? "" },
                        }));
                      setLine(index, { product_id: choice?.id ?? "" });
                    }}
                  />
                </LabeledField>
                <LabeledField label={`Component ${index + 1} quantity *`}>
                  <Input
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => setLine(index, { quantity: e.target.value })}
                  />
                </LabeledField>
                <LabeledField label="Unit">
                  <Input readOnly value={known[line.product_id]?.unit ?? ""} />
                </LabeledField>
                {writable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="sm:mt-6"
                    disabled={form.input.lines.length === 1}
                    aria-label={`Remove component ${index + 1}`}
                    onClick={() =>
                      form.change((current) => ({ ...current, lines: current.lines.filter((_, n) => n !== index) }))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        <LabeledField label="Notes">
          <Textarea
            className="min-h-20!"
            maxLength={4000}
            value={form.input.notes}
            onChange={(e) => form.change((current) => ({ ...current, notes: e.target.value }))}
          />
        </LabeledField>
      </fieldset>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="max-w-xl text-sm text-muted-foreground">
          One Bill of Materials per finished product. Plans and orders scale these quantities to the quantity needed.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={form.saving} onClick={form.close}>
            Close
          </Button>
          {writable ? (
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
    </WorkForm>
  );
}
