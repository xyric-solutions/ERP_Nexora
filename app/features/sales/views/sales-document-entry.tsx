"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import {
  Card,
  EntryActionBar,
  EntryTabs,
  Field,
  PageHead,
  ReadField,
  selectClass,
  StatusPill,
  tableClass,
  TotalsSummary,
} from "../components/sales-ui";
import type { SalesNav } from "../components/sales-nav";
import { SALES_CATALOG, SALES_KINDS, SALES_TERM_DAYS, SALES_TERMS, SALES_WAREHOUSES, SALESPEOPLE } from "../model/sales-constants";
import { documentTermsFor, onCreditHold } from "../model/customer-model";
import { addDays, money, moneyWhole } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  blankLine,
  deliveryAddress,
  displayStatus,
  exposure,
  lineAmount,
  lineTotals,
  newDocumentDraft,
  saveDocument,
  validateDocument,
  type FieldErrors,
} from "../model/sales-workflow";
import type { SalesDocument, SalesDocumentKind, SalesLine } from "../model/sales-types";

type EntryTab = "lines" | "other";

export function DocumentEntry({
  kind,
  customerCode,
  existing,
  nav,
  onSaved,
  onCancel,
}: {
  kind: SalesDocumentKind;
  customerCode?: string;
  existing?: SalesDocument;
  nav: SalesNav;
  onSaved: (code: string) => void;
  onCancel?: () => void;
}) {
  const state = useSalesState();
  const meta = SALES_KINDS[kind];
  const [draft, setDraft] = useState<SalesDocument>(() => {
    if (existing) return structuredClone(existing);
    const presetCustomer = state.customers.find((item) => item.code === customerCode);
    return newDocumentDraft(state, kind, presetCustomer?.id);
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tab, setTab] = useState<EntryTab>("lines");
  const isNew = !draft.code;
  const customer = state.customers.find((item) => item.id === draft.customerId);
  const totals = lineTotals(draft.lines);
  const cancel = onCancel ?? nav.back;

  const update = (patch: Partial<SalesDocument>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (kind === "invoice" && ("terms" in patch || "date" in patch) && next.date)
        next.date2 = addDays(next.date, SALES_TERM_DAYS[next.terms] ?? 30);
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };

  const chooseCustomer = (id: string) => {
    const chosen = state.customers.find((item) => item.id === id);
    update({ customerId: id, terms: chosen ? documentTermsFor(chosen) : draft.terms, owner: chosen?.salesperson ?? draft.owner });
  };

  const updateLine = (index: number, patch: Partial<SalesLine>) => {
    setDraft((current) => ({ ...current, lines: current.lines.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
    setErrors((current) => {
      const next = { ...current };
      delete next.lines;
      return next;
    });
  };

  const chooseItem = (index: number, sku: string) => {
    const item = SALES_CATALOG.find((candidate) => candidate.sku === sku);
    updateLine(index, item ? { sku, desc: item.name, rate: item.rate, tax: item.tax, uom: item.uom } : { sku: "", uom: "Each" });
  };

  const save = () => {
    const found = validateDocument(draft);
    if (Object.keys(found).length) {
      setErrors(found);
      if (found.lines) setTab("lines");
      return;
    }
    let code: string;
    try {
      code = commitSales((sales) => saveDocument(sales, draft, nav.actor));
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The document could not be saved.");
      return;
    }
    nav.notify(
      isNew
        ? kind === "invoice"
          ? `Invoice ${code} saved. Click it in the list to record payments.`
          : kind === "quotation"
            ? `Quotation ${code} saved. Next: Submit for Approval.`
            : `${meta.label} ${code} saved. Next: Confirm Order.`
        : `${code} updated.`,
    );
    onSaved(code);
  };

  // Only open quotations and saved orders are editable, and neither counts in exposure yet.
  const after = customer ? exposure(state, customer.id) + (kind === "invoice" ? 0 : totals.total) : 0;
  const overLimit = Boolean(customer && customer.creditLimit && after > customer.creditLimit);
  const errorCount = Object.keys(errors).length;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow={`Sales · ${meta.label}`}
        title={isNew ? `New ${meta.label}` : `Edit ${draft.code}`}
        actions={<Button type="button" variant="outline" onClick={cancel}>Close</Button>}
      />
      <EntryActionBar
        saveLabel={meta.saveLabel}
        lifecycle={meta.lifecycle}
        state={isNew ? "Not saved yet" : "Unsaved changes"}
        error={errorCount ? "Fix the highlighted fields, then save again." : undefined}
        onSave={save}
        onDiscard={cancel}
      />
      <Card>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
          <div>
            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">{meta.label}</span>
            <h2 className="m-0 mt-0.5 text-lg font-bold">{isNew ? `New ${meta.label}` : draft.code}</h2>
            <p className="m-0 mt-0.5 text-xs text-muted-foreground">{isNew ? "The number is assigned when you save." : "Changes apply when you save."}</p>
          </div>
          <div className="grid justify-items-end gap-1">
            <StatusPill status={isNew ? "Draft" : displayStatus(draft)} />
            <strong className="text-lg font-bold tabular-nums">{money(totals.total)}</strong>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-x-6 gap-y-3.5 border-b border-border p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-3 sm:grid-cols-2 [&>*:first-child]:sm:col-span-2">
            <Field label="Customer" required error={errors.customerId}>
              <select className={selectClass} value={draft.customerId} aria-invalid={Boolean(errors.customerId)} onChange={(event) => chooseCustomer(event.target.value)}>
                <option value="">Select customer</option>
                {state.customers
                  .filter((item) => item.status === "Active" || item.id === draft.customerId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>{item.code} · {item.display}</option>
                  ))}
              </select>
            </Field>
            {kind !== "quotation" ? (
              <ReadField label={kind === "order" ? "From quotation" : "From sales order"}>
                {(kind === "order" ? draft.links.quotation : draft.links.order) ?? "Direct, no source document"}
              </ReadField>
            ) : null}
            <Field label={meta.referenceLabel}>
              <Input value={draft.reference} placeholder="Optional" onChange={(event) => update({ reference: event.target.value })} />
            </Field>
            <ReadField label={kind === "invoice" ? "Billing address" : "Delivery address"}>
              {customer ? deliveryAddress(customer) : <span className="text-muted-foreground">Loaded from the customer</span>}
            </ReadField>
          </div>
          <div className="grid min-w-0 content-start gap-3 sm:grid-cols-2">
            <Field label={meta.date1} required error={errors.date}>
              <Input type="date" value={draft.date} aria-invalid={Boolean(errors.date)} onChange={(event) => update({ date: event.target.value })} />
            </Field>
            <Field label={meta.date2} error={errors.date2}>
              <Input type="date" value={draft.date2} aria-invalid={Boolean(errors.date2)} onChange={(event) => update({ date2: event.target.value })} />
            </Field>
            <Field label="Payment terms">
              <select className={selectClass} value={draft.terms} onChange={(event) => update({ terms: event.target.value })}>
                {SALES_TERMS.map((term) => <option key={term}>{term}</option>)}
              </select>
            </Field>
            {kind === "order" ? (
              <Field label="Ship from">
                <select className={selectClass} value={draft.warehouse} onChange={(event) => update({ warehouse: event.target.value })}>
                  {SALES_WAREHOUSES.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}
                </select>
              </Field>
            ) : (
              <ReadField label="Currency">PKR · Pakistani Rupee</ReadField>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 border-b border-border bg-muted lg:grid-cols-4 [&>div]:min-w-0 [&>div]:border-border [&>div]:px-4 [&>div]:py-2.5 max-lg:[&>div:nth-child(-n+2)]:border-b lg:[&>div:not(:last-child)]:border-r max-lg:[&>div:nth-child(odd)]:border-r [&_span]:block [&_span]:text-xs [&_span]:text-muted-foreground [&_strong]:block [&_strong]:text-[0.8125rem] [&_strong]:font-semibold">
          <div>
            <span>Customer status</span>
            <strong className={onCreditHold(customer) ? "text-[var(--nx-danger)]" : undefined}>
              {customer ? (onCreditHold(customer) ? `Credit ${customer.creditStatus.toLowerCase()}` : `${customer.status} · ${customer.taxRegistration}`) : "Select a customer"}
            </strong>
          </div>
          <div><span>Credit limit</span><strong>{customer ? moneyWhole(customer.creditLimit) : "—"}</strong></div>
          <div>
            <span>Available after this</span>
            <strong className={overLimit ? "text-[var(--nx-danger)]" : undefined}>{customer ? moneyWhole(customer.creditLimit - after) : "—"}</strong>
          </div>
          <div><span>Salesperson</span><strong>{draft.owner || customer?.salesperson || nav.actor}</strong></div>
        </section>

        <EntryTabs<EntryTab>
          label="Document sections"
          tabs={[["lines", "Products & services"], ["other", "Other information"]]}
          active={tab}
          onChange={setTab}
          errors={errors.lines ? ["lines"] : []}
        />
        <div className="min-w-0 px-4 py-3.5" role="tabpanel">
          {tab === "lines" ? (
            <>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Prices come from the Standard price list. Sales tax: 18% goods, 16% services.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, blankLine()] }))}>
                  + Add line
                </Button>
              </div>
              {errors.lines ? <p className="mt-0 mb-2 text-xs font-semibold text-[var(--nx-danger)]">{errors.lines}</p> : null}
              <div className="overflow-x-auto">
                <table className={cn(tableClass, "min-w-210 [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2")}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Product / service</th>
                      <th>Description</th>
                      <th className="text-right!">Qty</th>
                      <th>Unit</th>
                      <th className="text-right!">Rate</th>
                      <th className="text-right!">Tax %</th>
                      <th className="text-right!">Amount</th>
                      <th><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.length ? (
                      draft.lines.map((item, index) => (
                        <tr key={index}>
                          <td className="text-muted-foreground">{index + 1}</td>
                          <td className="min-w-55">
                            <select className={cn(selectClass, "h-8.5")} value={item.sku} aria-label={`Product, line ${index + 1}`} onChange={(event) => chooseItem(index, event.target.value)}>
                              <option value="">Other charge</option>
                              {SALES_CATALOG.map((option) => <option key={option.sku} value={option.sku}>{option.sku} · {option.name}</option>)}
                            </select>
                          </td>
                          <td className="min-w-45">
                            <Input className="h-8.5" value={item.desc} aria-label={`Description, line ${index + 1}`} onChange={(event) => updateLine(index, { desc: event.target.value })} />
                          </td>
                          <td className="w-22">
                            <Input className="h-8.5 text-right" type="number" min={0} step={1} value={item.qty} aria-label={`Quantity, line ${index + 1}`} onChange={(event) => updateLine(index, { qty: Number(event.target.value) })} />
                          </td>
                          <td className="text-muted-foreground">{item.uom || "Each"}</td>
                          <td className="w-32">
                            <Input className="h-8.5 text-right" type="number" min={0} step={0.01} value={item.rate} aria-label={`Rate, line ${index + 1}`} onChange={(event) => updateLine(index, { rate: Number(event.target.value) })} />
                          </td>
                          <td className="w-20">
                            <Input className="h-8.5 text-right" type="number" min={0} max={100} step={1} value={item.tax} aria-label={`Tax percent, line ${index + 1}`} onChange={(event) => updateLine(index, { tax: Number(event.target.value) })} />
                          </td>
                          <td className="text-right font-semibold tabular-nums whitespace-nowrap">{money(lineAmount(item))}</td>
                          <td>
                            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>
                              <X />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={9} className="text-muted-foreground">No lines. Use + Add line.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
              <Field label="Salesperson">
                <select className={selectClass} value={draft.owner || customer?.salesperson || SALESPEOPLE[0]} onChange={(event) => update({ owner: event.target.value })}>
                  {SALESPEOPLE.map((person) => <option key={person}>{person}</option>)}
                </select>
              </Field>
              <Field label="Notes printed on the document" className="md:col-span-2">
                <Textarea rows={3} value={draft.notes} placeholder="Delivery terms, site details or anything the customer should see" onChange={(event) => update({ notes: event.target.value })} />
              </Field>
            </div>
          )}
        </div>

        <footer className="grid grid-cols-1 gap-4 rounded-b-lg border-t border-border bg-muted p-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)]">
          <p className="m-0 text-xs text-muted-foreground">
            {kind === "invoice"
              ? "Saving issues the invoice and opens it in the invoice panel, where payments are recorded."
              : kind === "quotation"
                ? "After saving, submit the quotation to Management. Approval confirms the sales order automatically."
                : "After saving, Confirm Order appears on the sales order."}
          </p>
          <TotalsSummary rows={[["Untaxed amount", money(totals.sub)], ["Sales tax", money(totals.tax)]]} total={["Total", money(totals.total)]} />
        </footer>
      </Card>
    </div>
  );
}
