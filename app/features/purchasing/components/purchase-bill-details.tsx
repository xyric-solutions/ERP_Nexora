"use client";
import { WorkFormLayout } from "@/shared/ui/work-form";


import type { ReactNode } from "react";
import {
  billPaymentTerms,
  billPaymentTermSchema,
  billPaymentSchedule,
  documentTotal,
  supplierMailingAddress,
  type SavePurchaseRequest,
  type ProcurementOptions,
  type Supplier,
} from "@nexora/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PurchaseFormField as Field } from "./purchase-form-field";
import { purchaseSelectClass } from "../model/purchase-workflow";

export function PurchaseBillDetailsForm({
  input,
  options,
  supplier,
  supplierName,
  disabled,
  sourceField,
  onChange,
}: {
  input: SavePurchaseRequest;
  options: ProcurementOptions;
  supplier?: Supplier;
  supplierName?: string | null;
  disabled: boolean;
  sourceField: ReactNode;
  onChange: (patch: Partial<SavePurchaseRequest>) => void;
}) {
  const billDate = input.bill_date ?? input.document_date;
  let schedule: ReturnType<typeof billPaymentSchedule> = [],
    scheduleError = "";
  try {
    if (input.payment_term) schedule = billPaymentSchedule(billDate, input.payment_term, documentTotal(input.lines));
  } catch {
    scheduleError = "Enter a valid bill date and line amounts to calculate the payment schedule.";
  }
  function update(patch: Partial<SavePurchaseRequest>) {
    const next = { ...input, ...patch };
    if (next.payment_term) {
      try {
        patch.due_date = billPaymentSchedule(
          next.bill_date ?? next.document_date,
          next.payment_term,
          documentTotal(next.lines),
        ).at(-1)!.due_date;
      } catch {
        patch.due_date = null;
      }
    }
    onChange(patch);
  }
  return (
    <WorkFormLayout><section aria-label="Bill details" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid min-w-0 divide-y divide-border lg:grid-cols-5 lg:divide-y-0">
        <fieldset
          aria-label="Bill supplier and source"
          disabled={disabled}
          className="m-0 grid min-w-0 content-start gap-3 border-0 bg-muted/30 p-4 lg:col-span-2 lg:border-r lg:border-solid lg:border-border"
        >
          <h2 className="m-0 mb-1 text-base font-semibold">Supplier and bill reference</h2>
          <Field label="Supplier *">
            <Input
              readOnly
              value={supplier ? `${supplier.code} · ${supplier.name}` : (supplierName ?? "Select a purchase order")}
            />
          </Field>
          <Field label="Mailing address">
            <Textarea
              readOnly
              rows={3}
              className="min-h-20! resize-y"
              value={supplier ? supplierMailingAddress(supplier) : ""}
            />
          </Field>
          <Field label="Supplier invoice reference *">
            <Input
              required
              maxLength={128}
              value={input.reference}
              onChange={(event) => onChange({ reference: event.target.value })}
            />
          </Field>
          {sourceField}
        </fieldset>
        <fieldset
          aria-label="Bill dates and payment terms"
          disabled={disabled}
          className="m-0 grid min-w-0 content-start gap-3 border-0 p-4 lg:col-span-3"
        >
          <h2 className="m-0 mb-1 text-base font-semibold">Dates and payment terms</h2>
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            <Field label="Document date *">
              <Input
                required
                type="date"
                value={input.document_date}
                onChange={(event) => update({ document_date: event.target.value })}
              />
            </Field>
            <Field label="Bill date *">
              <Input
                required
                type="date"
                value={billDate}
                onChange={(event) => update({ bill_date: event.target.value })}
              />
            </Field>
            <Field label="Payment term">
              <select
                className={purchaseSelectClass}
                value={input.payment_term ?? ""}
                onChange={(event) => {
                  const term = billPaymentTermSchema.safeParse(event.target.value);
                  update({ payment_term: term.success ? term.data : null });
                }}
              >
                <option value="">Specific due date</option>
                {billPaymentTerms.map((term) => (
                  <option key={term.value} value={term.value}>
                    {term.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <Input
                type="date"
                readOnly={!!input.payment_term}
                value={schedule.at(-1)?.due_date ?? input.due_date ?? ""}
                onChange={(event) => update({ due_date: event.target.value || null })}
              />
            </Field>
            <Field label="Currency *">
              <select
                required
                className={purchaseSelectClass}
                value={input.currency}
                onChange={(event) => onChange({ currency: event.target.value })}
              >
                <option value="">Select currency</option>
                {options.currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} · {currency.name}
                  </option>
                ))}
                {input.currency && !options.currencies.some((currency) => currency.code === input.currency) ? (
                  <option value={input.currency}>{input.currency} · saved currency</option>
                ) : null}
              </select>
            </Field>
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            Payment terms use the bill date. Choose Specific due date to enter a date directly.
          </p>
          {schedule.length > 1 ? (
            <div
              className="grid gap-2 rounded-lg bg-accent px-3 py-2 text-sm"
              aria-label="Bill payment schedule"
              aria-live="polite"
            >
              {schedule.map((item, index) => (
                <div key={item.due_date} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {index === 0 ? "30% due" : "Remaining balance due"} {item.due_date}
                  </span>
                  <strong className="tabular-nums">
                    {item.amount} {input.currency}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}
          {scheduleError ? (
            <p role="alert" className="m-0 text-sm text-destructive">
              {scheduleError}
            </p>
          ) : null}
        </fieldset>
      </div>
    </section></WorkFormLayout>
  );
}
