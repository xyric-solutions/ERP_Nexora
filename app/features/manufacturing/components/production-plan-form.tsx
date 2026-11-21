"use client";
import { useCallback, useRef, useState } from "react";
import { productionPlanInputSchema, type ProductionPlan, type ProductionPlanInput } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WorkForm, WorkFormLayout } from "@/shared/ui/work-form";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { manufacturingError, planStateLabels } from "../model/manufacturing";
import { ManufacturingLookup } from "./manufacturing-lookup";
import { useManufacturingForm } from "./use-manufacturing-form";
import { TemplateRequirements } from "./recipe-sections";

/**
 * Production Planning (simplified flow, 13 Nov 2026): finished product + production quantity,
 * Save Production Planning, then Convert to Manufacturing Order. Ingredients/BOM come in a later phase.
 */
export function ProductionPlanForm({
  company,
  recordRef,
  onClose,
  onDirtyChange,
  onOpenOrder,
}: {
  company: string;
  recordRef?: string;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const { api, session, csrfToken } = useSession(),
    notify = useActionFeedback(),
    [productLabel, setProductLabel] = useState(""),
    [converting, setConverting] = useState(false),
    [convertError, setConvertError] = useState(""),
    convertKey = useRef<{ version: number; key: string } | null>(null);
  const permissions = session?.user.permissions ?? [];
  const load = useCallback(
    async (id: string, scope: string) => {
      const record = await api.getProductionPlan(id, scope);
      setProductLabel(`${record.product_code} · ${record.product_name}`);
      return {
        record,
        input: {
          company_id: record.company_id,
          product_id: record.product_id,
          planned_quantity: record.planned_quantity,
          bom_version: record.recipe?.bom_version,
          warehouse_id: record.recipe?.warehouse_id,
          notes: record.notes,
          expected_version: record.version,
        } satisfies ProductionPlanInput,
      };
    },
    [api],
  );
  const persist = useCallback(
    (id: string | null, input: ProductionPlanInput, key: string) => api.saveProductionPlan(id, input, csrfToken(), key),
    [api, csrfToken],
  );
  const form = useManufacturingForm<ProductionPlanInput, ProductionPlan>({
    company,
    recordRef,
    formPage: "production-plan",
    initial: () => ({ company_id: company, product_id: "", planned_quantity: "1", notes: "" }),
    load,
    persist,
    schema: productionPlanInputSchema,
    canWrite: permissions.includes("manufacturing.plan.create") && !session?.impersonation,
    onClose,
    onDirtyChange,
  });
  const converted = form.record?.state === "converted";
  const writable = permissions.includes("manufacturing.plan.create") && !session?.impersonation && !converted;
  const canConvert =
    !!form.record &&
    !converted &&
    permissions.includes("manufacturing.plan.convert") &&
    permissions.includes("manufacturing.order.create") &&
    !session?.impersonation;
  async function convert() {
    const plan = form.record;
    if (!plan || converting) return;
    // One key per plan version, so a retried click after a lost response cannot create a second order.
    if (convertKey.current?.version !== plan.version)
      convertKey.current = { version: plan.version, key: `mo-convert-${crypto.randomUUID()}` };
    setConverting(true);
    setConvertError("");
    try {
      const result = await api.convertProductionPlan(
        plan.id,
        { company_id: company, expected_version: plan.version },
        csrfToken(),
        convertKey.current.key,
      );
      notify(`${result.order.code} created from ${plan.code}.`);
      onOpenOrder(result.order.id);
    } catch (e) {
      setConvertError(manufacturingError(e));
    } finally {
      setConverting(false);
    }
  }
  if (form.loading)
    return (
      <WorkFormLayout>
        <p role="status">Loading production planning…</p>
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
  const busy = form.saving || converting;
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
          <h1 className="m-0 text-[1.625rem] font-semibold tracking-tight">
            {form.record?.code ?? "New Production Planning"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the finished product and how many units to produce.
          </p>
        </div>
        <Badge variant={converted ? "secondary" : "outline"}>
          {form.dirty ? "Unsaved changes" : form.record ? planStateLabels[form.record.state] : "New"}
        </Badge>
      </header>
      {converted && form.record?.manufacturing_order_id ? (
        <Alert>
          <AlertDescription>
            Converted to Manufacturing Order{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 align-baseline"
              onClick={() => onOpenOrder(form.record!.manufacturing_order_id!)}
            >
              {form.record.manufacturing_order_code}
            </Button>
            . A converted plan is read-only.
          </AlertDescription>
        </Alert>
      ) : null}
      {form.error || convertError ? (
        <Alert variant="destructive">
          <AlertDescription>{form.error || convertError}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset
        disabled={busy || !writable}
        className="m-0 min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <LabeledField label="Finished product *" hint="Products marked for manufacture in Inventory.">
            <ManufacturingLookup
              company={company}
              surface="plans"
              kind="finished_product"
              label="Finished product"
              required
              disabled={!writable || busy}
              value={form.input.product_id}
              selectedLabel={productLabel}
              onChange={(choice) => {
                setProductLabel(choice?.label ?? "");
                form.change((current) => ({ ...current, product_id: choice?.id ?? "", bom_version: undefined }));
              }}
            />
          </LabeledField>
          <LabeledField label="Production quantity *" hint={form.record ? `Units (${form.record.unit})` : "Units"}>
            <Input
              inputMode="decimal"
              value={form.input.planned_quantity}
              onChange={(e) => form.change((current) => ({ ...current, planned_quantity: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="Plan code">
            <Input readOnly value={form.record?.code ?? "Assigned on save"} />
          </LabeledField>
        </div>
        <LabeledField label="Notes">
          <Textarea
            className="min-h-20!"
            maxLength={4000}
            value={form.input.notes}
            onChange={(e) => form.change((current) => ({ ...current, notes: e.target.value }))}
          />
        </LabeledField>
      </fieldset>
      <LabeledField label="Material warehouse">
        <ManufacturingLookup
          company={company}
          surface="plans"
          kind="warehouse"
          label="Material warehouse"
          value={form.input.warehouse_id ?? ""}
          disabled={!writable || busy}
          selectedLabel={
            form.record?.recipe?.warehouse_id === form.input.warehouse_id
              ? form.record?.recipe?.lines[0]?.warehouse_name
              : undefined
          }
          onChange={(choice) => form.change((c) => ({ ...c, warehouse_id: choice?.id ?? null }))}
        />
      </LabeledField>
      <TemplateRequirements
        company={company}
        surface="plans"
        product={form.input.product_id}
        quantity={form.input.planned_quantity}
        bomVersion={form.input.bom_version}
        warehouse={form.input.warehouse_id}
        snapshot={form.record?.recipe}
        frozen={!writable}
        legacy={Boolean(form.record && !form.record.recipe)}
        onPreview={(recipe) => {
          if (form.input.bom_version !== recipe.bom_version)
            form.change((c) => ({ ...c, bom_version: recipe.bom_version }));
        }}
      />
      <footer className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-card p-4 shadow-sm">
        <p className="max-w-xl text-sm text-muted-foreground">
          {form.record
            ? converted
              ? "This plan has been converted."
              : "Convert the saved plan to create its Manufacturing Order."
            : "Save the planning first, then convert it to a Manufacturing Order."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={form.close}>
            Close
          </Button>
          {writable ? (
            <Button
              type="submit"
              variant={canConvert && !form.dirty ? "outline" : "default"}
              disabled={busy || (!form.dirty && !!form.record)}
            >
              {form.saving ? "Saving…" : "Save Production Planning"}
            </Button>
          ) : null}
          {canConvert ? (
            <Button
              type="button"
              disabled={busy || form.dirty}
              title={form.dirty ? "Save the planning before converting it." : undefined}
              onClick={() => void convert()}
            >
              {converting ? "Converting…" : "Convert to Manufacturing Order"}
            </Button>
          ) : null}
        </div>
      </footer>
    </WorkForm>
  );
}
