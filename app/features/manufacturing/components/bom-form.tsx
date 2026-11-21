"use client";
import { useCallback, useState } from "react";
import { bomInputSchema, type Bom, type BomInput } from "@nexora/contracts";
import { BomTemplateSections } from "./bom-template-sections";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { WorkForm, WorkFormLayout } from "@/shared/ui/work-form";
import { useManufacturingForm } from "./use-manufacturing-form";

type Known = Record<string, { label: string; unit: string }>;
function knownFrom(record: Bom): Known {
  return Object.fromEntries([
    [record.product_id, { label: `${record.product_code} · ${record.product_name}`, unit: record.unit }],
    ...(record.charges ?? []).flatMap((line) => [
      [line.product_id ?? "", { label: line.product_name ?? "", unit: "" }],
      [line.expense_account_id ?? "", { label: line.account_name ?? "", unit: "" }],
    ]),
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
          output_quantity: record.output_snapshot?.entered_quantity ?? record.output_quantity,
          output_unit_id: record.output_snapshot?.unit_id,
          template_name: record.template_name,
          warehouse_id: record.warehouse_id,
          currency: record.currency,
          charges: record.charges?.map(({ kind, product_id, expense_account_id, description, quantity, rate }) => ({
            kind,
            product_id,
            expense_account_id,
            description,
            quantity,
            rate,
          })),
          notes: record.notes,
          lines: record.lines.map((line) => ({
            product_id: line.product_id,
            quantity: line.unit_snapshot?.entered_quantity ?? line.quantity,
            unit_id: line.unit_snapshot?.unit_id,
            warehouse_id: line.warehouse_id,
            description: line.description,
          })),
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
  return (
    <WorkForm
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.save(false);
      }}
      className="grid min-w-0 gap-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-lg font-semibold">{form.record?.code ?? "New BOM template"}</h1>
          <p className="m-0 text-sm text-muted-foreground">
            Template for material planning and approved manufacturing requirements.
          </p>
        </div>
        <Badge variant="outline">{form.record ? "Saved template" : "Draft template"}</Badge>
      </header>
      {form.error ? (
        <Alert variant="destructive">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      ) : null}
      <BomTemplateSections
        company={company}
        input={{ ...form.input, currency: form.input.currency ?? form.record?.currency }}
        change={form.change}
        known={known}
        onKnown={(id, label, unit) => setKnown((c) => ({ ...c, [id]: { label, unit: unit ?? "" } }))}
        disabled={form.saving || !writable}
        existing={Boolean(form.record)}
      />
      <footer className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={form.saving} onClick={form.close}>
          Close
        </Button>
        {writable ? (
          <>
            <Button type="submit" variant="outline" disabled={form.saving || (!form.dirty && Boolean(form.record))}>
              {form.saving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              disabled={form.saving || (!form.dirty && Boolean(form.record))}
              onClick={() => void form.save(true)}
            >
              Save & Close
            </Button>
          </>
        ) : null}
      </footer>
    </WorkForm>
  );
}
