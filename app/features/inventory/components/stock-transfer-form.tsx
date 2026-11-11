"use client";
import { WorkForm, WorkFormLayout } from "@/shared/ui/work-form";

import { useCallback, useState } from "react";
import { stockTransferInputSchema, type StockTransferInput } from "@nexora/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LabeledField } from "@/shared/ui/labeled-field";
import { ProductLookup } from "./product-lookup";
import { useInventoryForm } from "./use-inventory-form";

export function StockTransferForm({
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
    [warehouseNames, setWarehouseNames] = useState<Record<string, string | null>>({}),
    [productNames, setProductNames] = useState<Record<number, string | null>>({}),
    [units, setUnits] = useState<Record<number, string>>({});
  const canWrite =
    !!session?.user.permissions.includes("inventory.item.create") &&
    !!session.user.permissions.includes("inventory.stock.read") &&
    !session.impersonation;
  const load = useCallback(
    async (id: string, scope: string) => {
      const record = await api.getStockTransfer(id, scope);
      return {
        record,
        input: stockTransferInputSchema.strip().parse({
          ...record,
          expected_version: record.version,
          lines: record.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        }),
      };
    },
    [api],
  );
  const persist = useCallback(
    (id: string | null, input: StockTransferInput, key: string) => api.saveStockTransfer(id, input, csrfToken(), key),
    [api, csrfToken],
  );
  const form = useInventoryForm<StockTransferInput, Awaited<ReturnType<typeof api.getStockTransfer>>>({
    company,
    recordRef,
    formPage: "add-stock-transfer",
    initial: () => ({
      company_id: company,
      from_warehouse_id: "",
      to_warehouse_id: "",
      transfer_date: new Date().toISOString().slice(0, 10),
      reference: "",
      notes: "",
      lines: [{ product_id: "", quantity: "1" }],
    }),
    load,
    persist,
    schema: stockTransferInputSchema,
    canWrite,
    onClose,
    onDirtyChange,
  });
  const change = <K extends keyof StockTransferInput>(key: K, value: StockTransferInput[K]) =>
    form.change((current) => ({ ...current, [key]: value }));
  function remove(index: number) {
    form.change((current) => ({ ...current, lines: current.lines.filter((_, n) => n !== index) }));
    setProductNames((current) =>
      Object.fromEntries(
        form.input.lines
          .filter((_, n) => n !== index)
          .map((_, n) => [
            n,
            current[n >= index ? n + 1 : n] ?? form.record?.lines[n >= index ? n + 1 : n]?.product_name ?? null,
          ]),
      ),
    );
    setUnits((current) =>
      Object.fromEntries(
        form.input.lines
          .filter((_, n) => n !== index)
          .map((_, n) => [
            n,
            current[n >= index ? n + 1 : n] ?? form.record?.lines[n >= index ? n + 1 : n]?.unit ?? "",
          ]),
      ),
    );
  }
  if (form.loading) return <WorkFormLayout><p role="status">Loading stock transfer…</p></WorkFormLayout>;
  if (form.loadFailed)
    return (
      <WorkFormLayout><Alert variant="destructive">
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
      </Alert></WorkFormLayout>
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
          <h2 className="text-xl font-semibold">{form.record?.code ?? "New stock transfer"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Prepare a movement between warehouses.</p>
        </div>
        <Badge variant="outline">{form.dirty ? "Unsaved draft" : "Draft"}</Badge>
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
          <ProductLookup
            company={company}
            surface="transfers"
            kind="warehouse"
            label="From warehouse *"
            value={form.input.from_warehouse_id || null}
            name={warehouseNames.from ?? form.record?.from_warehouse_name ?? null}
            onChange={(id, name) => {
              change("from_warehouse_id", id ?? "");
              setWarehouseNames((n) => ({ ...n, from: name }));
            }}
          />
          <ProductLookup
            company={company}
            surface="transfers"
            kind="warehouse"
            label="To warehouse *"
            value={form.input.to_warehouse_id || null}
            name={warehouseNames.to ?? form.record?.to_warehouse_name ?? null}
            onChange={(id, name) => {
              change("to_warehouse_id", id ?? "");
              setWarehouseNames((n) => ({ ...n, to: name }));
            }}
          />
          <LabeledField label="Transfer date *">
            <Input
              type="date"
              value={form.input.transfer_date}
              onChange={(e) => change("transfer_date", e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Transfer code">
            <Input readOnly value={form.record?.code ?? "Assigned on save"} />
          </LabeledField>
          <LabeledField label="Reference">
            <Input maxLength={160} value={form.input.reference} onChange={(e) => change("reference", e.target.value)} />
          </LabeledField>
        </div>
        <section className="space-y-3 border-t border-border pt-4" aria-label="Transfer products">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Products to transfer</h3>
            {canWrite ? (
              <Button
                type="button"
                variant="outline"
                disabled={form.input.lines.length >= 100}
                onClick={() =>
                  form.change((current) => ({
                    ...current,
                    lines: [...current.lines, { product_id: "", quantity: "1" }],
                  }))
                }
              >
                <Plus aria-hidden="true" />
                Add line
              </Button>
            ) : null}
          </div>
          <div className="space-y-3">
            {form.input.lines.map((line, index) => (
              <div
                key={index}
                className="grid min-w-0 items-start gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_6rem_2.5rem]"
              >
                <ProductLookup
                  company={company}
                  surface="transfers"
                  kind="product"
                  label={`Line ${index + 1} product *`}
                  value={line.product_id || null}
                  name={productNames[index] ?? form.record?.lines[index]?.product_name ?? null}
                  onChange={(id, name, unit) => {
                    form.change((current) => ({
                      ...current,
                      lines: current.lines.map((l, n) => (n === index ? { ...l, product_id: id ?? "" } : l)),
                    }));
                    setProductNames((n) => ({ ...n, [index]: name }));
                    setUnits((n) => ({ ...n, [index]: unit ?? "" }));
                  }}
                />
                <LabeledField label={`Line ${index + 1} quantity *`}>
                  <Input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={line.quantity}
                    onChange={(e) =>
                      form.change((current) => ({
                        ...current,
                        lines: current.lines.map((l, n) => (n === index ? { ...l, quantity: e.target.value } : l)),
                      }))
                    }
                  />
                </LabeledField>
                <LabeledField label={`Line ${index + 1} unit`}>
                  <Input readOnly value={units[index] ?? form.record?.lines[index]?.unit ?? ""} />
                </LabeledField>
                {canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="sm:mt-5"
                    disabled={form.input.lines.length === 1}
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        <LabeledField label="Transfer notes">
          <Textarea
            className="min-h-20!"
            maxLength={4000}
            value={form.input.notes}
            onChange={(e) => change("notes", e.target.value)}
          />
        </LabeledField>
      </fieldset>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="max-w-xl text-sm text-muted-foreground">
          Draft only. Stock balances remain unchanged until a controlled transfer is posted.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={form.saving} onClick={form.close}>
            Close
          </Button>
          {canWrite ? (
            <>
              <Button type="submit" variant="outline" disabled={form.saving || (!form.dirty && !!form.record)}>
                {form.saving ? "Saving…" : "Save Draft"}
              </Button>
              <Button
                type="button"
                disabled={form.saving || (!form.dirty && !!form.record)}
                onClick={() => void form.save(true)}
              >
                Save Draft & Close
              </Button>
            </>
          ) : null}
        </div>
      </footer>
    </WorkForm>
  );
}
