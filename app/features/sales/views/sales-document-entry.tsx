"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import {
  Card,
  EntryActionBar,
  EntryTabs,
  Field,
  PageHead,
  ReadField,
  selectClass,
  StatusPill,
  TotalsSummary,
} from "../components/sales-ui";
import { LineItemsEditor } from "../components/line-items-editor";
import { ProjectLocationFields } from "../components/project-location-fields";
import type { SalesNav } from "../components/sales-nav";
import { CurrencyFields } from "../components/currency-fields";
import { currencyDefaults, docCurrency, docMoney, docRate, toBase } from "../model/sales-currency";
import { useDiscardGuard, useIsDirty } from "../components/discard-guard";
import { approverDirectory } from "../model/sales-approvers";
import { SALES_KINDS, SALES_TERM_DAYS, SALES_TERMS, SALES_WAREHOUSES, SALESPEOPLE } from "../model/sales-constants";
import { documentTermsFor, onCreditHold } from "../model/customer-model";
import { addDays, formatDate, money, moneyWhole } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  deliveryAddress,
  displayStatus,
  exposure,
  findDocument,
  findRecurring,
  invoiceDraftFromOrder,
  lineTotals,
  newDocumentDraft,
  recurringInvoiceDraft,
  saveDocument,
  validateDocument,
  type FieldErrors,
} from "../model/sales-workflow";
import type { SalesDocument, SalesDocumentKind, SalesLine } from "../model/sales-types";

type EntryTab = "lines" | "other";

export function DocumentEntry({
  kind,
  customerCode,
  fromOrder,
  fromTemplate,
  existing,
  nav,
  onSaved,
  onCancel,
}: {
  kind: SalesDocumentKind;
  customerCode?: string;
  /** Invoices only: delivered sales order whose values prefill the form. Nothing is saved until Save. */
  fromOrder?: string;
  /**
   * Invoices only: recurring template (RB-) and, for a batch template, the
   * customer to bill. The form opens prefilled; Save and Post issues it.
   */
  fromTemplate?: { code: string; customerId?: string };
  existing?: SalesDocument;
  nav: SalesNav;
  onSaved: (code: string) => void;
  onCancel?: () => void;
}) {
  const state = useSalesState();
  const meta = SALES_KINDS[kind];
  const [source] = useState<{ draft?: SalesDocument; error?: string }>(() => {
    if (kind !== "invoice") return {};
    if (fromTemplate) {
      try {
        return { draft: recurringInvoiceDraft(state, fromTemplate.code, nav.actor, fromTemplate.customerId) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : `${fromTemplate.code} cannot be invoiced.` };
      }
    }
    if (!fromOrder) return {};
    try {
      return { draft: invoiceDraftFromOrder(state, fromOrder, nav.actor) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : `${fromOrder} cannot be invoiced.` };
    }
  });
  const [draft, setDraft] = useState<SalesDocument>(() => {
    if (existing) return structuredClone(existing);
    if (source.draft) return source.draft;
    const presetCustomer = state.customers.find((item) => item.code === customerCode);
    return newDocumentDraft(state, kind, presetCustomer?.id);
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tab, setTab] = useState<EntryTab>("lines");
  const isNew = !draft.code;
  const customer = state.customers.find((item) => item.id === draft.customerId);
  // An invoice raised from a delivered order stays with that order's customer.
  const sourceOrder = kind === "invoice" && isNew ? findDocument(state, "order", draft.links.order) : undefined;
  // An invoice raised from a recurring template stays with the template's customer.
  const sourceTemplate = kind === "invoice" && isNew ? findRecurring(state, draft.links.recurring) : undefined;
  const sourceCode = sourceOrder?.code ?? sourceTemplate?.code;
  const totals = lineTotals(draft.lines);
  const { guard, dialog } = useDiscardGuard(useIsDirty(draft));
  const cancel = () => guard(onCancel ?? nav.back);
  const approverOptions = useMemo(
    () => [
      { value: "", label: "No approver · I approve it myself" },
      ...approverDirectory(nav.actor).map((person) => ({ value: person.name, label: `${person.name} · ${person.title}` })),
    ],
    [nav.actor],
  );

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
    update({
      customerId: id,
      terms: chosen ? documentTermsFor(chosen) : draft.terms,
      owner: chosen?.salesperson ?? draft.owner,
      // A new document starts in the customer's preferred currency.
      ...(chosen && isNew ? currencyDefaults(chosen.currency) : {}),
    });
  };

  const updateLines = (change: (lines: SalesLine[]) => SalesLine[]) => {
    setDraft((current) => ({ ...current, lines: change(current.lines) }));
    setErrors((current) => {
      const next = { ...current };
      delete next.lines;
      return next;
    });
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
          ? sourceTemplate
            ? `Invoice ${code} posted from ${sourceTemplate.code}. Record its payment in Receipts.`
            : `Invoice ${code} saved${sourceOrder ? ` from ${sourceOrder.code}` : ""}. Click it in the list to record payments.`
          : kind === "quotation"
            ? `Quotation ${code} saved as draft. Next: ${draft.approver ? `Submit for Approval to ${draft.approver}` : "Approve"}.`
            : `${meta.label} ${code} saved. Next: Confirm Order.`
        : `${code} updated.`,
    );
    onSaved(code);
  };

  // Only open quotations and saved orders are editable, and neither counts in exposure yet.
  // Exposure and the credit limit are in PKR; the document converts at its own rate.
  const after = customer ? exposure(state, customer.id) + (kind === "invoice" ? 0 : toBase(totals.total, draft)) : 0;
  const docAmount = (value: number) => docMoney(value, draft);
  const overLimit = Boolean(customer && customer.creditLimit && after > customer.creditLimit);
  const errorCount = Object.keys(errors).length;

  if (source.error) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
        <PageHead
          eyebrow={`Sales · ${meta.label}`}
          title="Create Invoice"
          actions={<Button type="button" variant="outline" onClick={onCancel ?? nav.back}>Close</Button>}
        />
        <Card>
          <div className="grid gap-1 p-5" role="alert">
            <strong className="text-sm font-bold">This invoice cannot be created</strong>
            <p className="m-0 text-[0.8125rem] text-muted-foreground">
              {source.error}{fromTemplate ? "" : " It may already have been invoiced, or its delivery is not saved yet."}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow={`Sales · ${meta.label}`}
        title={sourceCode ? `Create Invoice · ${sourceCode}` : isNew ? `New ${meta.label}` : `Edit ${draft.code}`}
        actions={<Button type="button" variant="outline" onClick={cancel}>Close</Button>}
      />
      <EntryActionBar
        saveLabel={sourceTemplate ? "Save & Post" : meta.saveLabel}
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
            <p className="m-0 mt-0.5 text-xs text-muted-foreground">
              {sourceTemplate
                ? `Prefilled from recurring template ${sourceTemplate.code} for the ${formatDate(sourceTemplate.next)} period. Review, then Save & Post; the invoice number is assigned then.`
                : sourceOrder
                ? `Prefilled from ${sourceOrder.code}. Review and edit any field; the invoice number is assigned when you save.`
                : isNew
                  ? "The number is assigned when you save."
                  : "Changes apply when you save."}
            </p>
          </div>
          <div className="grid justify-items-end gap-1">
            <StatusPill status={isNew ? "Draft" : displayStatus(draft)} />
            <strong className="text-lg font-bold tabular-nums">{docAmount(totals.total)}</strong>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-x-6 gap-y-3.5 border-b border-border p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-3 sm:grid-cols-2 [&>*:first-child]:sm:col-span-2">
            <Field label="Customer" required error={errors.customerId} hint={sourceCode ? `Billed to the customer of ${sourceCode}.` : undefined}>
              <select className={selectClass} value={draft.customerId} disabled={Boolean(sourceCode)} aria-invalid={Boolean(errors.customerId)} onChange={(event) => chooseCustomer(event.target.value)}>
                <option value="">Select customer</option>
                {state.customers
                  .filter((item) => item.status === "Active" || item.id === draft.customerId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>{item.code} · {item.display}</option>
                  ))}
              </select>
            </Field>
            <ProjectLocationFields value={draft} errors={errors} onChange={update} />
            {kind === "quotation" ? (
              <Field label="Approver" hint={draft.approver ? `Saved as draft, then submitted to ${draft.approver} for approval.` : "Optional. Leave empty when no manager approval is needed; you approve it yourself."}>
                <SearchableSelect
                  label="Approver"
                  value={draft.approver ?? ""}
                  options={approverOptions}
                  onValueChange={(value) => update({ approver: value })}
                  placeholder="No approver"
                  searchLabel="Search employees"
                  searchPlaceholder="Search by name or role…"
                  valueLabel={(option) => (option.value ? option.value : "No approver")}
                />
              </Field>
            ) : sourceTemplate ? (
              <ReadField label="From recurring template">
                {sourceTemplate.code} · {sourceTemplate.name} · {sourceTemplate.frequency}
              </ReadField>
            ) : (
              <ReadField label={kind === "order" ? "From quotation" : "From sales order"}>
                {(kind === "order" ? draft.links.quotation : draft.links.order) ?? "Direct, no source document"}
                {sourceOrder?.delivery ? ` · Delivery ${sourceOrder.delivery.no}` : ""}
                {sourceOrder && draft.links.quotation ? ` · ${draft.links.quotation}` : ""}
              </ReadField>
            )}
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
            ) : null}
            <CurrencyFields
              value={{ currency: docCurrency(draft), fxRate: draft.fxRate ?? 1 }}
              errors={errors}
              onChange={update}
              disabled={Boolean(sourceOrder)}
              amount={totals.total}
              hint={customer && customer.currency !== docCurrency(draft) ? `${customer.display} prefers ${customer.currency}.` : undefined}
            />
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
              <LineItemsEditor
                lines={draft.lines}
                onChange={updateLines}
                currency={docCurrency(draft)}
                fxRate={docRate(draft)}
                error={errors.lines}
                formatAmount={docAmount}
              />
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
              ? sourceTemplate
                ? `Save & Post issues the invoice and marks this customer as billed on ${sourceTemplate.code} for the ${formatDate(sourceTemplate.next)} period. Close without saving to leave it unbilled.`
                : sourceOrder
                ? `Saving issues the invoice, links it to ${sourceOrder.code}${draft.links.quotation ? ` and ${draft.links.quotation}` : ""}, and returns to Invoices, where payments are recorded. Close without saving to leave the order uninvoiced.`
                : "Saving issues the invoice and opens it in the invoice panel, where payments are recorded."
              : kind === "quotation"
                ? "Saving keeps the quotation as a draft. With an approver, submit it for approval; without one, approve it yourself. Confirm Order is a separate step once it is approved."
                : "After saving, Confirm Order appears on the sales order."}
          </p>
          <TotalsSummary
            rows={[
              ["Untaxed amount", docAmount(totals.sub)],
              ["Sales tax", docAmount(totals.tax)],
              ...(docCurrency(draft) !== "PKR" && (draft.fxRate ?? 0) > 0 ? ([["Total in PKR", money(toBase(totals.total, draft))]] as [string, string][]) : []),
            ]}
            total={["Total", docAmount(totals.total)]}
          />
        </footer>
      </Card>
      {dialog}
    </div>
  );
}
