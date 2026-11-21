"use client";
import { useCallback, useRef, useState } from "react";
import {
  manufacturingOrderInputSchema,
  type ManufacturingOrder,
  type ManufacturingOrderInput,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LabeledField } from "@/shared/ui/labeled-field";
import { WorkForm, WorkFormLayout } from "@/shared/ui/work-form";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { manufacturingError, orderStateLabels, today } from "../model/manufacturing";
import { ManufacturingLookup } from "./manufacturing-lookup";
import { useManufacturingForm } from "./use-manufacturing-form";
import { TemplateRequirements } from "./recipe-sections";

type Labels = { product: string; project: string; location: string };
const eventLabels: Record<string, string> = {
  created: "Created",
  saved: "Saved",
  submit: "Submitted for approval",
  approve: "Confirmed and approved",
  return: "Returned for correction",
};
function inputFrom(record: ManufacturingOrder): ManufacturingOrderInput {
  return {
    bom_version: record.recipe?.bom_version,
    warehouse_id: record.recipe?.warehouse_id,
    lines: record.recipe?.lines.map(({ product_id, quantity, remark }) => ({ product_id, quantity, remark })),
    company_id: record.company_id,
    product_id: record.product_id,
    quantity: record.quantity,
    order_date: record.order_date,
    project_id: record.project_id,
    location_id: record.location_id,
    notes: record.notes,
    expected_version: record.version,
  };
}
function labelsFrom(record: ManufacturingOrder): Labels {
  return {
    product: `${record.product_code} · ${record.product_name}`,
    project: record.project_name ?? "",
    location: record.location_name ?? "",
  };
}

/**
 * Manufacturing Order (simplified flow, 13 Nov 2026): finished product, quantity and date, optionally a
 * project and site location. A draft is confirmed and approved in one step; components arrive with the
 * BOM integration phase.
 */
export function ManufacturingOrderForm({
  company,
  recordRef,
  onClose,
  onDirtyChange,
  onOpenPlan,
}: {
  company: string;
  recordRef?: string;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenPlan: (planId: string) => void;
}) {
  const { api, session, csrfToken } = useSession(),
    notify = useActionFeedback(),
    [labels, setLabels] = useState<Labels>({ product: "", project: "", location: "" }),
    [confirming, setConfirming] = useState(false),
    confirmKey = useRef<{ version: number; key: string } | null>(null);
  const permissions = session?.user.permissions ?? [];
  const load = useCallback(
    async (id: string, scope: string) => {
      const record = await api.getManufacturingOrder(id, scope);
      setLabels(labelsFrom(record));
      return { record, input: inputFrom(record) };
    },
    [api],
  );
  const persist = useCallback(
    async (id: string | null, input: ManufacturingOrderInput, key: string) => {
      const result = await api.saveManufacturingOrder(id, input, csrfToken(), key);
      setLabels(labelsFrom(result.record));
      return result;
    },
    [api, csrfToken],
  );
  const form = useManufacturingForm<ManufacturingOrderInput, ManufacturingOrder>({
    company,
    recordRef,
    formPage: "add-production-order",
    initial: () => ({
      company_id: company,
      product_id: "",
      quantity: "1",
      order_date: today(),
      project_id: null,
      location_id: null,
      notes: "",
    }),
    load,
    persist,
    schema: manufacturingOrderInputSchema,
    canWrite: permissions.includes("manufacturing.order.create") && !session?.impersonation,
    onClose,
    onDirtyChange,
  });
  const record = form.record,
    state = record?.state ?? "draft",
    approved = state === "approved";
  const writable =
    ["draft", "returned"].includes(state) &&
    permissions.includes("manufacturing.order.create") &&
    !session?.impersonation;
  const canConfirm =
    !approved &&
    permissions.includes("manufacturing.order.approve") &&
    (!!record || permissions.includes("manufacturing.order.create")) &&
    !session?.impersonation;
  async function confirm() {
    if (confirming) return;
    let current = record;
    // Unsaved changes (or a new order) are saved first, so exactly what is on screen is approved.
    if (form.dirty || !current) {
      current = await form.save(false);
      if (!current) return;
    }
    if (confirmKey.current?.version !== current.version)
      confirmKey.current = { version: current.version, key: `mo-confirm-${crypto.randomUUID()}` };
    setConfirming(true);
    form.setError("");
    try {
      const result = await api.actOnManufacturingOrder(
        current.id,
        { company_id: company, expected_version: current.version, action: "approve" },
        csrfToken(),
        confirmKey.current.key,
      );
      form.adopt(result.record, inputFrom(result.record));
      setLabels(labelsFrom(result.record));
      notify(`${result.record.code} confirmed and approved.`);
    } catch (e) {
      form.setError(manufacturingError(e));
    } finally {
      setConfirming(false);
    }
  }
  const busy = form.saving || confirming;
  if (form.loading)
    return (
      <WorkFormLayout>
        <p role="status">Loading Manufacturing Order…</p>
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
      className="min-w-0 space-y-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-[1.625rem] font-semibold tracking-tight">
            {record?.code ?? "New Manufacturing Order"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {record?.plan_code
              ? `Created from production plan ${record.plan_code}.`
              : "Order a finished product to be manufactured."}
          </p>
        </div>
        <Badge variant={approved ? "default" : "outline"}>
          {form.dirty ? "Unsaved changes" : record ? orderStateLabels[state] : "New"}
        </Badge>
      </header>
      {approved ? (
        <Alert>
          <AlertDescription>
            Approved by {record?.approved_by_name ?? "the approver"}
            {record?.approved_at ? ` on ${new Date(record.approved_at).toLocaleString()}` : ""}. The order can no longer
            be changed. Actual batch quantity issued: {record?.issued_quantity ?? "0"} {record?.unit}. Finished output
            posted: {record?.completed_quantity ?? "0"} {record?.unit}.
          </AlertDescription>
        </Alert>
      ) : null}
      {form.error ? (
        <Alert variant="destructive">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset
        disabled={busy || !writable}
        className="m-0 min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <LabeledField
            label="Finished product *"
            hint={record?.plan_id ? "Set by the production plan." : "Products marked for manufacture in Inventory."}
          >
            <ManufacturingLookup
              company={company}
              surface="orders"
              kind="finished_product"
              label="Finished product"
              required
              disabled={!writable || busy || !!record?.plan_id}
              value={form.input.product_id}
              selectedLabel={labels.product}
              onChange={(choice) => {
                setLabels((current) => ({ ...current, product: choice?.label ?? "" }));
                form.change((current) => ({
                  ...current,
                  product_id: choice?.id ?? "",
                  bom_version: undefined,
                  lines: undefined,
                }));
              }}
            />
          </LabeledField>
          <LabeledField label="Quantity *" hint={record ? `Units (${record.unit})` : "Units"}>
            <Input
              inputMode="decimal"
              value={form.input.quantity}
              onChange={(e) => form.change((current) => ({ ...current, quantity: e.target.value, lines: undefined }))}
            />
          </LabeledField>
          <LabeledField label="Order date *">
            <Input
              type="date"
              value={form.input.order_date}
              onChange={(e) => form.change((current) => ({ ...current, order_date: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="Project">
            <ManufacturingLookup
              company={company}
              surface="orders"
              kind="project"
              label="Project"
              disabled={!writable || busy}
              value={form.input.project_id ?? ""}
              selectedLabel={labels.project}
              onChange={(choice) => {
                setLabels((current) => ({ ...current, project: choice?.label ?? "" }));
                form.change((current) => ({ ...current, project_id: choice?.id ?? null }));
              }}
            />
          </LabeledField>
          <LabeledField label="Site location">
            <ManufacturingLookup
              company={company}
              surface="orders"
              kind="location"
              label="Site location"
              disabled={!writable || busy}
              value={form.input.location_id ?? ""}
              selectedLabel={labels.location}
              onChange={(choice) => {
                setLabels((current) => ({ ...current, location: choice?.label ?? "" }));
                form.change((current) => ({ ...current, location_id: choice?.id ?? null }));
              }}
            />
          </LabeledField>
          <LabeledField label="Order code">
            <Input readOnly value={record?.code ?? "Assigned on save"} />
          </LabeledField>
          {record?.plan_id ? (
            <div className="grid min-w-0 gap-1.5">
              <span className="text-sm font-medium">Source plan</span>
              <Button
                type="button"
                variant="link"
                className="h-10 justify-start px-0"
                onClick={() => onOpenPlan(record.plan_id!)}
              >
                {record.plan_code}
              </Button>
            </div>
          ) : null}
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
          surface="orders"
          kind="warehouse"
          label="Material warehouse"
          value={form.input.warehouse_id ?? ""}
          disabled={!writable || busy}
          onChange={(choice) => form.change((c) => ({ ...c, warehouse_id: choice?.id ?? null }))}
        />
      </LabeledField>
      <TemplateRequirements
        company={company}
        surface="orders"
        product={form.input.product_id}
        quantity={form.input.quantity}
        bomVersion={form.input.bom_version}
        warehouse={form.input.warehouse_id}
        snapshot={record?.recipe}
        frozen={!writable}
        legacy={Boolean(record && !record.recipe)}
        actualLines={form.input.lines}
        onMaterialChange={writable ? (lines) => form.change((c) => ({ ...c, lines })) : undefined}
        onPreview={(recipe) => {
          if (form.input.bom_version !== recipe.bom_version || !form.input.lines)
            form.change((c) => ({
              ...c,
              bom_version: recipe.bom_version,
              lines: recipe.lines.map(({ product_id, quantity, remark }) => ({ product_id, quantity, remark })),
            }));
        }}
      />
      {record?.events.length ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="History">
          <h3 className="text-sm font-semibold">History</h3>
          <ol className="space-y-2">
            {record.events.map((event, index) => (
              <li key={index} className="grid gap-0.5 border-l-2 border-border pl-3 text-sm">
                <span>
                  <strong>{eventLabels[event.action] ?? event.action}</strong> by {event.actor_name}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <footer className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-card p-4 shadow-sm">
        <p className="max-w-xl text-sm text-muted-foreground">
          Confirming freezes this order&apos;s recipe. Record actual material issues, approved charges and finished output in
          Stock Movements.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={form.close}>
            Close
          </Button>
          {writable ? (
            <Button type="submit" variant="outline" disabled={busy || (!form.dirty && !!record)}>
              {form.saving ? "Saving…" : "Save Draft"}
            </Button>
          ) : null}
          {canConfirm ? (
            <Button type="button" disabled={busy} onClick={() => void confirm()}>
              {confirming ? "Confirming…" : "Confirm & Approve"}
            </Button>
          ) : null}
        </div>
      </footer>
    </WorkForm>
  );
}
