"use client";

/**
 * Receipts page forms (meeting of 11 Nov 2026 and the reference screenshots):
 * - Add New › Receipt: choose a customer and all their outstanding invoices
 *   are listed for allocation; part payments are allowed and anything not
 *   allocated stays on account.
 * - Add New › Customer Payment, Return Receipt, Return Payment.
 * - Batch › Invoice Receipts, Receipts, Payments, Combined Accounts Offset and
 *   All Combined Accounts Offset.
 *
 * Mock only: everything is saved to the browser-session store. Nothing is
 * posted to Banking or the general ledger; the live flow must post receipts
 * server-side with approval, audit and idempotency keys.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/shared/ui/amount-input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { EmptyState, Field, salesLayer, selectClass, StatusPill, tableClass } from "./sales-ui";
import { useDiscardGuard, useIsDirty } from "./discard-guard";
import { PaymentFields } from "./payment-fields";
import { CurrencyFields } from "./currency-fields";
import { BASE_CURRENCY, currencyDefaults, docCurrency, docMoney, normalizeCurrency } from "../model/sales-currency";
import type { SalesNav } from "./sales-nav";
import { moneyDocMeta, PAYMENT_PURPOSES, RECEIPT_ACCOUNTS, RECEIPT_METHODS } from "../model/sales-constants";
import { formatDate, money, todayIso } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  applyOffset,
  autoAllocate,
  batchInvoiceReceipts,
  batchPayments,
  batchReceipts,
  customerLabel,
  displayStatus,
  documentTotal,
  findMoneyDoc,
  invoiceBalance,
  moneyInputFrom,
  newMoneyInput,
  offsetPlan,
  onAccountCredit,
  openInvoices,
  returnableDocs,
  returnableOf,
  reversalPlan,
  saveMoneyDoc,
  validateMoney,
  type BatchCommon,
  type BatchRow,
  type FieldErrors,
  type MoneyInput,
} from "../model/sales-workflow";
import type { MoneyDocType, ReceiptAllocation, SalesState } from "../model/sales-types";

export const moneySheetClass = "w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
        <h3 className="m-0 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function run(nav: SalesNav, change: () => string): boolean {
  try {
    nav.notify(change());
    return true;
  } catch (error) {
    nav.notify(error instanceof Error ? error.message : "That action could not be completed.");
    return false;
  }
}

/**
 * Side sheet whose close (Cancel, ×, Escape, overlay) goes through the
 * discard prompt while the body reports unsaved changes.
 */
function GuardedSheet({
  open,
  title,
  description,
  wide = false,
  onClose,
  children,
}: {
  open: boolean;
  /** Batch grids need more width than a single-document form. */
  wide?: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: (props: { setDirty: (dirty: boolean) => void; close: () => void }) => ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const { guard, dialog } = useDiscardGuard(open && dirty);
  const close = () => guard(() => {
    setDirty(false);
    onClose();
  });
  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent side="right" overlayClassName={salesLayer.sheetOverlay} className={cn(moneySheetClass, wide && "data-[side=right]:sm:max-w-5xl", salesLayer.sheet)}>
        {open ? (
          <>
            <SheetHeader className="border-b border-border pr-12">
              <SheetTitle className="m-0 text-lg font-bold">{title}</SheetTitle>
              <SheetDescription className="m-0">{description}</SheetDescription>
            </SheetHeader>
            {children({ setDirty, close })}
          </>
        ) : null}
      </SheetContent>
      {dialog}
    </Sheet>
  );
}

/** Reports a form's unsaved state to its GuardedSheet. */
function useReportDirty<T>(value: T, setDirty: (dirty: boolean) => void) {
  const dirty = useIsDirty(value);
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
}

/* ---------------------------------------------------- receipt / payment form */

export interface MoneyFormPreset {
  type: MoneyDocType;
  /** Draft being edited. */
  code?: string;
  /** Receipt for this invoice (from the invoice panel's Receive Payment). */
  invoice?: string;
  /** Return against this receipt or customer payment. */
  against?: string;
}

function initialInput(state: SalesState, preset: MoneyFormPreset): MoneyInput {
  const existing = findMoneyDoc(state, preset.code);
  if (existing) {
    const input = moneyInputFrom(existing);
    if (input.type === "Receipt") {
      // Show every outstanding invoice of the customer, keeping the draft's allocations.
      const rows: ReceiptAllocation[] = openInvoices(state, input.customerId, input.currency).map((invoice) => ({
        inv: invoice.code,
        amount: input.alloc.find((item) => item.inv === invoice.code)?.amount ?? 0,
      }));
      for (const item of input.alloc) if (!rows.some((row) => row.inv === item.inv)) rows.push(item);
      input.alloc = rows;
    }
    return input;
  }
  if (preset.invoice) {
    const invoice = state.invoice.find((item) => item.code === preset.invoice);
    if (invoice) {
      const balance = invoiceBalance(state, invoice);
      return {
        ...newMoneyInput("Receipt", invoice.customerId),
        // A receipt for an invoice is in the invoice currency, at the invoice rate until changed.
        ...normalizeCurrency(invoice),
        amount: balance,
        alloc: openInvoices(state, invoice.customerId, normalizeCurrency(invoice).currency).map((item) => ({ inv: item.code, amount: item.code === invoice.code ? balance : 0 })),
      };
    }
  }
  if (preset.against) {
    const original = findMoneyDoc(state, preset.against);
    if (original)
      return {
        ...newMoneyInput(preset.type, original.customerId),
        ...normalizeCurrency(original),
        against: original.code,
        amount: returnableOf(state, original),
        method: original.method,
        account: original.account,
      };
  }
  return newMoneyInput(preset.type);
}

function MoneyDocBody({
  preset,
  nav,
  onDone,
  close,
  setDirty,
}: {
  preset: MoneyFormPreset;
  nav: SalesNav;
  onDone: (code: string) => void;
  close: () => void;
  setDirty: (dirty: boolean) => void;
}) {
  const state = useSalesState();
  const meta = moneyDocMeta(preset.type);
  const [input, setInput] = useState<MoneyInput>(() => initialInput(state, preset));
  const [errors, setErrors] = useState<FieldErrors>({});
  useReportDirty(input, setDirty);
  const isReturn = input.type === "Return receipt" || input.type === "Return payment";

  const customers = useMemo(() => {
    if (isReturn) {
      const type = input.type as "Return receipt" | "Return payment";
      return state.customers.filter((customer) => customer.id === input.customerId || returnableDocs(state, type, customer.id).length > 0);
    }
    return state.customers.filter((customer) => customer.status === "Active" || customer.id === input.customerId);
  }, [input.customerId, input.type, isReturn, state]);

  const update = (patch: Partial<MoneyInput>) => {
    setInput((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      if ("alloc" in patch || "amount" in patch) {
        delete next.alloc;
        for (const key of Object.keys(next)) if (key.startsWith("alloc.")) delete next[key];
      }
      return next;
    });
  };

  const invoiceRows = (customerId: string, currency: string) => openInvoices(state, customerId, currency).map((invoice) => ({ inv: invoice.code, amount: 0 }));

  // A new document starts in the customer's preferred currency.
  const chooseCustomer = (customerId: string) => {
    const preferred = currencyDefaults(state.customers.find((customer) => customer.id === customerId)?.currency);
    if (input.type === "Receipt") update({ customerId, ...preferred, alloc: invoiceRows(customerId, preferred.currency) });
    else if (isReturn) update({ customerId, against: "" });
    else update({ customerId, ...preferred });
  };

  // Receipts list only the outstanding invoices in the receipt currency.
  const chooseCurrency = (patch: { currency: string; fxRate: number }) => {
    if (input.type === "Receipt" && patch.currency !== input.currency) update({ ...patch, alloc: invoiceRows(input.customerId, patch.currency) });
    else update(patch);
  };

  // A return is in the currency of the receipt or payment it returns.
  const chooseAgainst = (code: string) => {
    const original = findMoneyDoc(state, code);
    update({ against: code, amount: original ? returnableOf(state, original) : 0, ...(original ? normalizeCurrency(original) : {}) });
  };
  const fmt = (value: number) => docMoney(value, input);

  const allocated = round2(input.alloc.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  const onAccount = round2((Number(input.amount) || 0) - allocated);

  const setAlloc = (inv: string, amount: number) => update({ alloc: input.alloc.map((item) => (item.inv === inv ? { ...item, amount } : item)) });

  /**
   * Ticking an invoice applies what is left of the amount received, up to its
   * balance. With no amount entered yet, it settles the invoice and adds its
   * balance to the amount. Unticking clears the allocation.
   */
  const tick = (inv: string, on: boolean) => {
    const invoice = state.invoice.find((item) => item.code === inv);
    if (!invoice) return;
    if (!on) {
      setAlloc(inv, 0);
      return;
    }
    const others = input.alloc.filter((item) => item.inv !== inv).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const balance = invoiceBalance(state, invoice);
    if (input.amount > 0) setAlloc(inv, round2(Math.min(balance, Math.max(0, input.amount - others))));
    else update({ alloc: input.alloc.map((item) => (item.inv === inv ? { ...item, amount: balance } : item)), amount: round2(others + balance) });
  };

  const allocateOldest = () => {
    const plan = autoAllocate(state, input.customerId, input.amount, input.currency);
    update({ alloc: input.alloc.map((item) => ({ ...item, amount: plan.find((line) => line.inv === item.inv)?.amount ?? 0 })) });
  };

  const save = (post: boolean) => {
    const found = validateMoney(state, input);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    let code = "";
    const ok = run(nav, () => {
      code = commitSales((sales) => saveMoneyDoc(sales, input, nav.actor, { post, code: preset.code, source: preset.invoice ? "Invoice" : "Manual" }));
      return post ? `${meta.label} ${code} posted.` : `${meta.label} ${code} saved as draft. It has no effect until it is posted.`;
    });
    if (ok) {
      setDirty(false);
      onDone(code);
    }
  };

  const sources = isReturn && input.customerId ? returnableDocs(state, input.type as "Return receipt" | "Return payment", input.customerId) : [];
  const original = isReturn ? findMoneyDoc(state, input.against) : undefined;
  const sourceOptions = original && !sources.some((doc) => doc.code === original.code) ? [...sources, original] : sources;
  const plan =
    input.type === "Return receipt" && original && input.amount > 0
      ? reversalPlan(state, original, Math.min(input.amount, returnableOf(state, original)))
      : undefined;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Customer">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Customer" required error={errors.customerId}>
              <select
                className={selectClass}
                value={input.customerId}
                disabled={Boolean(preset.code || preset.against)}
                aria-invalid={Boolean(errors.customerId)}
                onChange={(event) => chooseCustomer(event.target.value)}
              >
                <option value="">Choose a customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.display} · {customer.code}</option>)}
              </select>
            </Field>
            {input.type === "Customer payment" ? (
              <Field label="Paid for" required error={errors.purpose}>
                <select className={selectClass} value={input.purpose} onChange={(event) => update({ purpose: event.target.value })}>
                  {PAYMENT_PURPOSES.map((purpose) => <option key={purpose}>{purpose}</option>)}
                </select>
              </Field>
            ) : null}
            {isReturn ? (
              <Field label={input.type === "Return receipt" ? "Receipt being returned" : "Customer payment being returned"} required error={errors.against}>
                <select
                  className={selectClass}
                  value={input.against}
                  disabled={!input.customerId || Boolean(preset.against)}
                  aria-invalid={Boolean(errors.against)}
                  onChange={(event) => chooseAgainst(event.target.value)}
                >
                  <option value="">{input.customerId ? (sources.length ? "Choose one" : "Nothing can be returned") : "Choose a customer first"}</option>
                  {sourceOptions.map((doc) => (
                    <option key={doc.code} value={doc.code}>{doc.code} · {formatDate(doc.date)} · {docMoney(returnableOf(state, doc), doc)} returnable</option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
        </Section>

        <Section title="Payment details">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {input.customerId ? (
              <CurrencyFields
                value={{ currency: input.currency, fxRate: input.fxRate }}
                errors={errors}
                onChange={chooseCurrency}
                disabled={isReturn}
                amount={input.amount}
                hint={input.type === "Receipt" ? "Only invoices in this currency are listed for allocation." : undefined}
              />
            ) : null}
            <PaymentFields
              payment={input}
              errors={errors}
              onChange={update}
              amountHint={
                original
                  ? `Up to ${docMoney(returnableOf(state, original), original)} of ${original.code}.`
                  : input.type === "Receipt"
                    ? "Partial payments are fine. Anything not allocated stays on account."
                    : undefined
              }
            />
            <Field label={isReturn ? "Reason" : "Note"} required={isReturn} error={errors.note} className="sm:col-span-2">
              <Textarea
                rows={2}
                value={input.note}
                placeholder={isReturn ? "Refund, bounced cheque, deposit returned…" : "Optional"}
                aria-invalid={Boolean(errors.note)}
                onChange={(event) => update({ note: event.target.value })}
              />
            </Field>
          </div>
        </Section>

        {input.type === "Receipt" ? (
          <Section
            title="Outstanding invoices"
            aside={
              input.customerId && input.alloc.length ? (
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="outline" disabled={!(input.amount > 0)} onClick={allocateOldest}>Allocate oldest first</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => update({ alloc: input.alloc.map((item) => ({ ...item, amount: 0 })) })}>Clear</Button>
                </div>
              ) : undefined
            }
          >
            {!input.customerId ? (
              <p className="m-0 px-4 py-4 text-[0.8125rem] text-muted-foreground">Choose a customer. Their unpaid invoices appear here automatically.</p>
            ) : input.alloc.length ? (
              <div className="relative overflow-x-auto px-4 pt-2 pb-4">
                <table className={cn(tableClass, "[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2")}>
                  <thead>
                    <tr>
                      <th><span className="sr-only">Allocate</span></th>
                      <th>Invoice</th>
                      <th>Due</th>
                      <th className="text-right!">Total</th>
                      <th className="text-right!">Balance</th>
                      <th>Status</th>
                      <th className="text-right!">Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {input.alloc.map((item) => {
                      const invoice = state.invoice.find((candidate) => candidate.code === item.inv);
                      if (!invoice) return null;
                      const error = errors[`alloc.${item.inv}`];
                      return (
                        <tr key={item.inv}>
                          <td><Checkbox checked={item.amount > 0} aria-label={`Allocate to ${item.inv}`} onCheckedChange={(checked) => tick(item.inv, Boolean(checked))} /></td>
                          <td className="font-mono font-semibold">{item.inv}</td>
                          <td>{formatDate(invoice.date2)}</td>
                          <td className="text-right tabular-nums">{docMoney(documentTotal(invoice), invoice)}</td>
                          <td className="text-right font-semibold tabular-nums">{docMoney(invoiceBalance(state, invoice), invoice)}</td>
                          <td><StatusPill status={displayStatus(invoice)} /></td>
                          <td className="w-36">
                            <AmountInput
                              className="h-8.5"
                              value={item.amount || ""}
                              placeholder="0.00"
                              aria-label={`Amount allocated to ${item.inv}`}
                              aria-invalid={Boolean(error)}
                              onValueChange={(_, amount) => setAlloc(item.inv, amount)}
                            />
                            {error ? <small className="text-[var(--nx-danger)]!">{error}</small> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {errors.alloc ? <p className="mt-2 mb-0 text-xs font-semibold text-[var(--nx-danger)]" role="alert">{errors.alloc}</p> : null}
                <dl className="mt-3 mb-0 grid grid-cols-3 gap-2 rounded border border-border bg-muted p-3 text-xs">
                  {(
                    [
                      [meta.amountLabel, fmt(input.amount || 0), false],
                      ["Allocated", fmt(allocated), false],
                      ["On account", fmt(Math.max(0, onAccount)), onAccount < 0],
                    ] as const
                  ).map(([label, value, bad]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className={cn("m-0 mt-0.5 font-semibold tabular-nums", bad && "text-[var(--nx-danger)]")}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <p className="m-0 px-4 py-4 text-[0.8125rem] text-muted-foreground">This customer has no unpaid {input.currency} invoices. The receipt will be held on account as an advance.</p>
            )}
          </Section>
        ) : null}

        {plan ? (
          <Section title="Effect of this return">
            <ul className="m-0 grid list-none gap-1 px-4 pt-2 pb-4 text-[0.8125rem]">
              {plan.fromAccount > 0 ? <li>{fmt(plan.fromAccount)} comes off the money held on account.</li> : null}
              {plan.alloc.map((item) => (
                <li key={item.inv}>
                  {fmt(item.amount)} is reversed from <span className="font-mono">{item.inv}</span>; its balance reopens.
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        <Button type="button" variant="outline" onClick={close}>Cancel</Button>
        <Button type="button" variant="outline" onClick={() => save(false)}>Save as Draft</Button>
        <Button type="button" onClick={() => save(true)}>Save & Post</Button>
      </SheetFooter>
    </>
  );
}

/** Side sheet for a new or draft receipt, customer payment or return. */
export function MoneyDocSheet({ preset, nav, onClose, onDone }: { preset: MoneyFormPreset | null; nav: SalesNav; onClose: () => void; onDone: (code: string) => void }) {
  const meta = moneyDocMeta(preset?.type ?? "Receipt");
  return (
    <GuardedSheet open={Boolean(preset)} title={preset?.code ? `Edit ${preset.code}` : `New ${meta.label}`} description={meta.description} onClose={onClose}>
      {({ setDirty, close }) =>
        preset ? (
          <MoneyDocBody
            key={`${preset.type}-${preset.code ?? preset.invoice ?? preset.against ?? "new"}`}
            preset={preset}
            nav={nav}
            onDone={onDone}
            close={close}
            setDirty={setDirty}
          />
        ) : null
      }
    </GuardedSheet>
  );
}

/* ----------------------------------------------------------------- batches */

export type BatchKind = "invoice-receipts" | "receipts" | "payments" | "offset" | "offset-all";

const BATCH_COPY: Record<BatchKind, { title: string; description: string }> = {
  "invoice-receipts": {
    title: "Batch · Invoice Receipts",
    description: "Every customer's outstanding invoices in one list. Tick the invoices that were paid and enter the amounts in each invoice's currency; one receipt is posted per customer and currency.",
  },
  receipts: {
    title: "Batch · Receipts",
    description: "Enter several PKR receipts at once. Each one is posted and allocated to that customer's oldest unpaid PKR invoices first; any remainder stays on account. Record foreign-currency receipts with Add New › Receipt.",
  },
  payments: {
    title: "Batch · Payments",
    description: "Enter several PKR customer payments at once, such as security deposits or tender fees. Each line is posted as a customer payment.",
  },
  offset: {
    title: "Batch · Combined Accounts Offset",
    description: "Applies a customer's money held on account (unallocated receipts) to their outstanding invoices in the same currency, oldest first.",
  },
  "offset-all": {
    title: "Batch · All Combined Accounts Offset",
    description: "Applies money held on account to outstanding invoices in the same currency for every customer at once, oldest first.",
  },
};

/** "USD 1,200.00 + PKR 50,000.00": totals kept apart per currency, never added across currencies. */
function totalsByCurrency(items: readonly { amount: number; currency: string }[]): string {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.currency, round2((totals.get(item.currency) ?? 0) + item.amount));
  return totals.size ? [...totals].map(([currency, amount]) => money(amount, currency)).join(" + ") : money(0);
}

function newCommon(): BatchCommon {
  return { date: todayIso(), method: RECEIPT_METHODS[0], account: RECEIPT_ACCOUNTS[0], reference: "" };
}

function InvoiceReceiptsBatch({ nav, onDone, close, setDirty }: { nav: SalesNav; onDone: () => void; close: () => void; setDirty: (dirty: boolean) => void }) {
  const state = useSalesState();
  const invoices = openInvoices(state);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [common, setCommon] = useState<BatchCommon>(newCommon);
  const [errors, setErrors] = useState<FieldErrors>({});
  useReportDirty({ amounts, common }, setDirty);
  const rows: ReceiptAllocation[] = Object.entries(amounts).filter(([, amount]) => amount > 0).map(([inv, amount]) => ({ inv, amount }));
  const total = round2(rows.reduce((sum, row) => sum + row.amount, 0));
  const invoiceOf = (code: string) => state.invoice.find((invoice) => invoice.code === code);
  const totalLabel = totalsByCurrency(rows.map((row) => ({ amount: row.amount, currency: docCurrency(invoiceOf(row.inv)) })));
  // One receipt is posted per customer and currency.
  const customers = new Set(rows.map((row) => `${invoiceOf(row.inv)?.customerId}|${docCurrency(invoiceOf(row.inv))}`)).size;

  const post = () => {
    const found: FieldErrors = {};
    if (!rows.length) found.rows = "Tick at least one invoice and enter an amount.";
    for (const row of rows) {
      const invoice = state.invoice.find((item) => item.code === row.inv);
      if (invoice && row.amount > invoiceBalance(state, invoice) + 0.004) found[row.inv] = `Only ${docMoney(invoiceBalance(state, invoice), invoice)} is due.`;
    }
    if (!common.date) found.date = "Enter the date.";
    if (common.method !== "Cash" && !common.reference.trim()) found.reference = "Enter the transaction reference.";
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    const ok = run(nav, () => {
      const codes = commitSales((sales) => batchInvoiceReceipts(sales, rows, common, nav.actor));
      return `${codes.length} receipt(s) posted: ${codes.join(", ")}.`;
    });
    if (ok) {
      setDirty(false);
      onDone();
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Payment details (applies to every receipt)">
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <PaymentFields
              payment={{ type: "Receipt", amount: total, ...common }}
              errors={errors}
              showAmount={false}
              onChange={(patch) => {
                setCommon((current) => ({ ...current, ...patch }));
                setErrors((current) => ({ ...current, date: "", reference: "" }));
              }}
            />
          </div>
        </Section>
        <Section title="Outstanding invoices" aside={<span className="text-xs text-muted-foreground">{totalLabel} · {customers} receipt(s)</span>}>
          {invoices.length ? (
            <div className="relative overflow-x-auto px-4 pt-2 pb-4">
              <table className={cn(tableClass, "[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2")}>
                <thead>
                  <tr><th><span className="sr-only">Pay</span></th><th>Invoice</th><th>Customer</th><th>Due</th><th className="text-right!">Balance</th><th className="text-right!">Received</th></tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const balance = invoiceBalance(state, invoice);
                    const value = amounts[invoice.code] ?? 0;
                    return (
                      <tr key={invoice.code}>
                        <td>
                          <Checkbox
                            checked={value > 0}
                            aria-label={`Receive payment for ${invoice.code}`}
                            onCheckedChange={(checked) => setAmounts((current) => ({ ...current, [invoice.code]: checked ? balance : 0 }))}
                          />
                        </td>
                        <td className="font-mono font-semibold">{invoice.code}</td>
                        <td>{customerLabel(state, invoice.customerId)}</td>
                        <td>{formatDate(invoice.date2)}{displayStatus(invoice) === "Overdue" ? <small className="text-[var(--nx-danger)]!">Overdue</small> : null}</td>
                        <td className="text-right tabular-nums">{docMoney(balance, invoice)}</td>
                        <td className="w-36">
                          <AmountInput
                            className="h-8.5"
                            value={value || ""}
                            placeholder="0.00"
                            aria-label={`Amount received for ${invoice.code}`}
                            aria-invalid={Boolean(errors[invoice.code])}
                            onValueChange={(_, amount) => {
                              setAmounts((current) => ({ ...current, [invoice.code]: amount }));
                              setErrors((current) => ({ ...current, [invoice.code]: "", rows: "" }));
                            }}
                          />
                          {errors[invoice.code] ? <small className="text-[var(--nx-danger)]!">{errors[invoice.code]}</small> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {errors.rows ? <p className="mt-2 mb-0 text-xs font-semibold text-[var(--nx-danger)]" role="alert">{errors.rows}</p> : null}
            </div>
          ) : (
            <EmptyState title="No outstanding invoices" hint="Every invoice is fully paid." />
          )}
        </Section>
      </div>
      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        <Button type="button" variant="outline" onClick={close}>Cancel</Button>
        <Button type="button" onClick={post} disabled={!invoices.length}>Post {customers || ""} receipt(s)</Button>
      </SheetFooter>
    </>
  );
}

function blankRow(kind: "receipts" | "payments"): BatchRow {
  return { ...newCommon(), customerId: "", amount: 0, ...(kind === "payments" ? { purpose: PAYMENT_PURPOSES[0] } : {}) };
}

function RowsBatch({ kind, nav, onDone, close, setDirty }: { kind: "receipts" | "payments"; nav: SalesNav; onDone: () => void; close: () => void; setDirty: (dirty: boolean) => void }) {
  const state = useSalesState();
  const [rows, setRows] = useState<BatchRow[]>(() => [blankRow(kind), blankRow(kind)]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  useReportDirty(rows, setDirty);
  const type: MoneyDocType = kind === "receipts" ? "Receipt" : "Customer payment";
  const customers = state.customers.filter((customer) => customer.status === "Active");
  const used = rows.filter((row) => row.customerId || row.amount > 0);

  const patch = (index: number, change: Partial<BatchRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));
    setErrors((current) => ({ ...current, [index]: "" }));
  };

  const post = () => {
    const found: Record<number, string> = {};
    rows.forEach((row, index) => {
      if (!row.customerId && !(row.amount > 0)) return;
      const input: MoneyInput = {
        ...newMoneyInput(type, row.customerId),
        ...row,
        purpose: row.purpose ?? "",
        alloc: type === "Receipt" ? autoAllocate(state, row.customerId, row.amount, BASE_CURRENCY) : [],
      };
      const problems = validateMoney(state, input);
      const first = Object.values(problems)[0];
      if (first) found[index] = first;
    });
    if (!used.length) found[0] = "Add at least one line.";
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    const ok = run(nav, () => {
      const codes = commitSales((sales) => (kind === "receipts" ? batchReceipts(sales, rows, nav.actor) : batchPayments(sales, rows, nav.actor)));
      return `${codes.length} ${kind === "receipts" ? "receipt(s)" : "customer payment(s)"} posted: ${codes.join(", ")}.`;
    });
    if (ok) {
      setDirty(false);
      onDone();
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="relative overflow-x-auto">
          <table className={cn(tableClass, "min-w-215 [&_td]:px-1.5 [&_td]:py-1.5 [&_th]:px-1.5")}>
            <thead>
              <tr>
                <th>Customer</th>
                {kind === "payments" ? <th>Paid for</th> : <th>Outstanding (PKR)</th>}
                <th className="text-right!">Amount (PKR)</th>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const outstanding = row.customerId ? openInvoices(state, row.customerId, BASE_CURRENCY).reduce((sum, invoice) => sum + invoiceBalance(state, invoice), 0) : 0;
                return (
                  <tr key={index}>
                    <td className="min-w-48">
                      <select className={cn(selectClass, "h-8.5")} value={row.customerId} aria-label={`Customer, line ${index + 1}`} onChange={(event) => patch(index, { customerId: event.target.value })}>
                        <option value="">Choose customer</option>
                        {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.display}</option>)}
                      </select>
                      {errors[index] ? <small className="text-[var(--nx-danger)]!" role="alert">{errors[index]}</small> : null}
                    </td>
                    <td className="min-w-36">
                      {kind === "payments" ? (
                        <select className={cn(selectClass, "h-8.5")} value={row.purpose} aria-label={`Paid for, line ${index + 1}`} onChange={(event) => patch(index, { purpose: event.target.value })}>
                          {PAYMENT_PURPOSES.map((purpose) => <option key={purpose}>{purpose}</option>)}
                        </select>
                      ) : (
                        <span className="tabular-nums">{row.customerId ? money(outstanding) : "—"}</span>
                      )}
                    </td>
                    <td className="w-32">
                      <AmountInput className="h-8.5" value={row.amount || ""} placeholder="0.00" aria-label={`Amount, line ${index + 1}`} onValueChange={(_, amount) => patch(index, { amount })} />
                    </td>
                    <td className="w-38">
                      <Input type="date" className="h-8.5" value={row.date} aria-label={`Date, line ${index + 1}`} onChange={(event) => patch(index, { date: event.target.value })} />
                    </td>
                    <td className="w-36">
                      <select className={cn(selectClass, "h-8.5")} value={row.method} aria-label={`Method, line ${index + 1}`} onChange={(event) => patch(index, { method: event.target.value })}>
                        {RECEIPT_METHODS.map((method) => <option key={method}>{method}</option>)}
                      </select>
                    </td>
                    <td className="min-w-36">
                      <Input className="h-8.5" value={row.reference} placeholder={row.method === "Cash" ? "Optional" : "Required"} aria-label={`Reference, line ${index + 1}`} onChange={(event) => patch(index, { reference: event.target.value })} />
                    </td>
                    <td>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove line ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                        <X />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setRows((current) => [...current, blankRow(kind)])}>
            <Plus /> Add line
          </Button>
          <span className="text-xs text-muted-foreground">
            {used.length} line(s) · {money(used.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))}
            {kind === "receipts" ? " · allocated oldest invoice first" : ""}
          </span>
        </div>
      </div>
      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        <Button type="button" variant="outline" onClick={close}>Cancel</Button>
        <Button type="button" onClick={post}>Post all</Button>
      </SheetFooter>
    </>
  );
}

function OffsetBatch({ all, nav, onDone, close }: { all: boolean; nav: SalesNav; onDone: () => void; close: () => void }) {
  const state = useSalesState();
  const holders = state.customers.filter((customer) => onAccountCredit(state, customer.id) > 0.004);
  const [customerId, setCustomerId] = useState(holders[0]?.id ?? "");
  const lines = all ? offsetPlan(state) : customerId ? offsetPlan(state, customerId) : [];
  const receiptCurrency = (code: string) => docCurrency(findMoneyDoc(state, code));
  const totalLabel = totalsByCurrency(lines.map((line) => ({ amount: line.amount, currency: receiptCurrency(line.receipt) })));

  const apply = () => {
    const ok = run(nav, () => {
      const count = commitSales((sales) => applyOffset(sales, lines, nav.actor));
      return `${count} offset line(s) applied · ${totalLabel} moved from on account to invoices.`;
    });
    if (ok) onDone();
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!all ? (
          <Section title="Customer">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field label="Customer with money on account" hint={holders.length ? undefined : "No customer has money on account."}>
                <select className={selectClass} value={customerId} disabled={!holders.length} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">Choose a customer</option>
                  {holders.map((customer) => <option key={customer.id} value={customer.id}>{customer.display} · {money(onAccountCredit(state, customer.id))} on account</option>)}
                </select>
              </Field>
            </div>
          </Section>
        ) : null}
        <Section title="Offset preview" aside={<span className="text-xs text-muted-foreground">{totalLabel}</span>}>
          {lines.length ? (
            <div className="relative overflow-x-auto px-4 pt-2 pb-4">
              <table className={tableClass}>
                <thead><tr><th>Customer</th><th>From receipt</th><th>To invoice</th><th className="text-right!">Amount</th></tr></thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={`${line.receipt}-${line.inv}`}>
                      <td>{customerLabel(state, line.customerId)}</td>
                      <td className="font-mono">{line.receipt}</td>
                      <td className="font-mono">{line.inv}</td>
                      <td className="text-right font-semibold tabular-nums">{money(line.amount, receiptCurrency(line.receipt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Nothing to offset" hint="Offsets need money on account and an outstanding invoice for the same customer, in the same currency." />
          )}
        </Section>
      </div>
      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        <Button type="button" variant="outline" onClick={close}>Cancel</Button>
        <Button type="button" onClick={apply} disabled={!lines.length}>Apply offset</Button>
      </SheetFooter>
    </>
  );
}

/** Side sheet for the Batch menu. */
export function BatchSheet({ kind, nav, onClose }: { kind: BatchKind | null; nav: SalesNav; onClose: () => void }) {
  const copy = BATCH_COPY[kind ?? "receipts"];
  return (
    <GuardedSheet open={Boolean(kind)} wide title={copy.title} description={copy.description} onClose={onClose}>
      {({ setDirty, close }) =>
        kind === "invoice-receipts" ? (
          <InvoiceReceiptsBatch nav={nav} onDone={onClose} close={close} setDirty={setDirty} />
        ) : kind === "receipts" || kind === "payments" ? (
          <RowsBatch key={kind} kind={kind} nav={nav} onDone={onClose} close={close} setDirty={setDirty} />
        ) : kind === "offset" || kind === "offset-all" ? (
          <OffsetBatch key={kind} all={kind === "offset-all"} nav={nav} onDone={onClose} close={close} />
        ) : null
      }
    </GuardedSheet>
  );
}
