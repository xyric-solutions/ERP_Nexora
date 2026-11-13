"use client";

/**
 * Sales › Recurring Bills: recurring invoice templates (prototype).
 *
 * - New Template › Single customer: one customer billed weekly or monthly.
 * - New Template › Batch: several customers billed with the same lines.
 * - Create Invoice (single) opens the normal invoice form prefilled from the
 *   template; Save & Post issues it and moves the template to its next date.
 * - Create Invoices (batch) lists every customer for the period: Save & Post
 *   all in one step, or review any one customer in the invoice form first.
 *
 * Mock only: templates and invoices live in the browser-session store. No
 * invoice is generated automatically; the live flow must run generation on
 * the server with idempotency per template, customer and period.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { ActionMenu } from "../components/action-menu";
import { CurrencyFields } from "../components/currency-fields";
import { LineItemsEditor } from "../components/line-items-editor";
import { ProjectLocationFields } from "../components/project-location-fields";
import { ListPager, ListTable, ListViewMenu, usePagedRows, useListView, type ListColumn } from "../components/list-view-options";
import { GuardedSheet, Section, useReportDirty } from "../components/money-forms";
import { useIsDirty } from "../components/discard-guard";
import {
  ActivityList,
  Card,
  EmptyState,
  Field,
  MetricTiles,
  PageHead,
  ReadField,
  selectClass,
  StatusPill,
  tableClass,
  TotalsSummary,
} from "../components/sales-ui";
import type { SalesNav } from "../components/sales-nav";
import { currencyDefaults, docMoney, docRate } from "../model/sales-currency";
import { addDays, formatDate, todayIso } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  customerLabel,
  findRecurring,
  hasContext,
  lineTotals,
  newRecurringInput,
  postRecurringBatch,
  RECURRING_FREQUENCIES,
  recurringDue,
  recurringInputFrom,
  recurringPending,
  recurringTotal,
  invoiceFromRecurring,
  saveRecurring,
  setRecurringStatus,
  validateRecurring,
  type FieldErrors,
  type RecurringInput,
  referenceLabel,
} from "../model/sales-workflow";
import type { RecurringBill, RecurringScope, SalesLine, SalesState } from "../model/sales-types";

type Filter = "all" | "due" | "batch" | "paused";

const scopeLabel = (scope: RecurringScope) => (scope === "Batch" ? "Batch · multiple customers" : "Single customer");

function customersCell(state: SalesState, bill: RecurringBill) {
  if (bill.customerIds.length === 1) return customerLabel(state, bill.customerIds[0]);
  const [first] = bill.customerIds;
  return (
    <span title={bill.customerIds.map((id) => customerLabel(state, id)).join(", ")}>
      {bill.customerIds.length} customers <span className="text-muted-foreground">· {customerLabel(state, first)} +{bill.customerIds.length - 1}</span>
    </span>
  );
}

export function RecurringBillsView({
  nav,
  creating,
  selected,
  generating,
}: {
  nav: SalesNav;
  /** New template sheet open for this scope. */
  creating?: RecurringScope;
  /** Template open in the side sheet. */
  selected?: string;
  /** Batch template whose Create Invoices sheet is open. */
  generating?: string;
}) {
  const state = useSalesState();
  const today = todayIso();
  const horizon = addDays(today, 30);
  const due = recurringDue(state, horizon);
  const dueNow = recurringDue(state, today);
  const dueInvoices = due.reduce((sum, bill) => sum + recurringPending(bill).length, 0);
  const [filter, setFilter] = useState<Filter>("all");

  const createInvoice = (bill: RecurringBill) => {
    // Templates saved before Project and Location were required are completed first.
    if (!hasContext(bill)) {
      nav.notify(`Choose a project and a location on ${bill.code}, save it, then create the invoice.`);
      nav.open(bill.code);
      return;
    }
    // Single: the invoice form opens prefilled. Batch: choose to post all or review one customer.
    if (bill.scope === "Single") nav.openNew("invoices", bill.code);
    else nav.openNew("recurring-bills", bill.code);
  };
  const createDue = () => {
    const incomplete = due.filter((bill) => !hasContext(bill)).map((bill) => bill.code);
    try {
      const codes = commitSales((sales) => due.filter(hasContext).flatMap((bill) => recurringPending(bill).map((id) => invoiceFromRecurring(sales, bill.code, nav.actor, id))));
      nav.notify(
        `${codes.length} invoice(s) posted${codes.length ? `: ${codes.join(", ")}` : ""}.` +
          (incomplete.length ? ` Not billed until a project and location are chosen: ${incomplete.join(", ")}.` : ""),
      );
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The invoices could not be created.");
    }
  };

  const rows = state.recurring.filter((bill) =>
    filter === "due" ? dueNow.includes(bill) : filter === "batch" ? bill.scope === "Batch" : filter === "paused" ? bill.status === "Paused" : true,
  );

  const columns: ListColumn<RecurringBill>[] = [
    { id: "code", label: "Template", required: true, cell: (bill) => <span className="font-mono font-semibold">{bill.code}</span> },
    { id: "scope", label: "Type", cell: (bill) => (bill.scope === "Batch" ? "Batch" : "Single") },
    { id: "customer", label: "Customer", required: true, cell: (bill) => customersCell(state, bill) },
    { id: "name", label: "Billed for", cell: (bill) => bill.name },
    { id: "frequency", label: "Frequency", cell: (bill) => bill.frequency },
    { id: "project", label: "Project", optional: true, cell: (bill) => referenceLabel(bill.project) || "—" },
    { id: "location", label: "Location", optional: true, cell: (bill) => referenceLabel(bill.location) || "—" },
    {
      id: "next",
      label: "Next invoice",
      nowrap: true,
      cell: (bill) => (
        <span className={cn(bill.status === "Active" && bill.next <= today && "font-semibold text-[var(--nx-warning)]")}>
          {formatDate(bill.next)}
          {bill.status === "Active" && bill.next <= today ? " · due" : ""}
        </span>
      ),
    },
    { id: "amount", label: "Per invoice", align: "right", cell: (bill) => docMoney(recurringTotal(bill), bill) },
    {
      id: "progress",
      label: "This period",
      nowrap: true,
      cell: (bill) => {
        const done = bill.customerIds.length - recurringPending(bill).length;
        return bill.scope === "Batch" ? `${done} of ${bill.customerIds.length} invoiced` : done ? "Invoiced" : "Not invoiced";
      },
    },
    { id: "status", label: "Status", required: true, cell: (bill) => <StatusPill status={bill.status} /> },
    {
      id: "action",
      label: "Action",
      required: true,
      cell: (bill) => {
        if (bill.status !== "Active") return null;
        const pending = recurringPending(bill).length;
        return (
          <Button type="button" size="sm" variant="outline" disabled={!pending} onClick={() => createInvoice(bill)}>
            {bill.scope === "Batch" ? `Create Invoices (${pending})` : "Create Invoice"}
          </Button>
        );
      },
    },
  ];
  const view = useListView("recurring", columns);
  const paging = usePagedRows(view, rows, filter);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Recurring Bills"
        title="Recurring Bills"
        status={<StatusPill status="Prototype only" />}
        description="Invoice templates for customers billed every week or month. Set up a template once; when it is due, click Create Invoice and the invoice form opens with everything filled in, then click Save & Post. A batch template bills several customers with the same lines in one step."
        actions={
          <>
            <ListViewMenu view={view} />
            <Button type="button" variant="outline" disabled={!dueInvoices} onClick={createDue}>Bill everything due in 30 days ({dueInvoices})</Button>
            <ActionMenu
              label="+ New Template"
              options={[
                { label: "Single customer template", run: () => nav.openNew("recurring-bills") },
                { label: "Batch template · multiple customers", run: () => nav.openNew("recurring-bills", "batch") },
              ]}
            />
          </>
        }
      />
      <MetricTiles
        metrics={[
          { label: "Due now", value: dueNow.length, hint: "Templates with invoices to create today", onSelect: () => setFilter(filter === "due" ? "all" : "due"), selected: filter === "due" },
          { label: "Active templates", value: state.recurring.filter((bill) => bill.status === "Active").length, hint: "Weekly or monthly schedules", onSelect: () => setFilter("all"), selected: filter === "all" },
          { label: "Batch templates", value: state.recurring.filter((bill) => bill.scope === "Batch").length, hint: "One template, several customers", onSelect: () => setFilter(filter === "batch" ? "all" : "batch"), selected: filter === "batch" },
          { label: "Paused", value: state.recurring.filter((bill) => bill.status === "Paused").length, hint: "Not invoiced until resumed", onSelect: () => setFilter(filter === "paused" ? "all" : "paused"), selected: filter === "paused" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] px-3 py-2.5 text-[0.8125rem]">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-[var(--nx-warning)]">Research pending</span>
        <p className="m-0 flex-[1_1_18rem]">How recurring bills are settled is still being researched. This shows the simplest version: a schedule that creates normal invoices.</p>
      </div>
      <Card>
        {rows.length ? (
          <>
            <ListTable view={view} rows={paging.pageRows} rowKey={(bill) => bill.code} onOpen={(bill) => nav.open(bill.code)} selected={selected} />
            <ListPager view={view} paging={paging} noun="templates" />
          </>
        ) : (
          <EmptyState
            title={state.recurring.length ? "No templates match this filter" : "No recurring templates"}
            hint={state.recurring.length ? undefined : "Create a template for a customer billed every week or month."}
            action={state.recurring.length ? undefined : <Button type="button" size="sm" onClick={() => nav.openNew("recurring-bills")}>+ New Template</Button>}
          />
        )}
      </Card>
      <TemplateSheet key={selected ?? creating ?? ""} code={selected} creating={creating} nav={nav} onCreateInvoice={createInvoice} />
      <BatchInvoicesSheet code={generating} nav={nav} onClose={nav.back} />
    </div>
  );
}

/* ------------------------------------------------------- template sheet */

function TemplateSheet({
  code,
  creating,
  nav,
  onCreateInvoice,
}: {
  code?: string;
  creating?: RecurringScope;
  nav: SalesNav;
  onCreateInvoice: (bill: RecurringBill) => void;
}) {
  const state = useSalesState();
  const existing = findRecurring(state, code);
  const open = Boolean(creating || existing);
  const scope = existing?.scope ?? creating ?? "Single";
  return (
    <GuardedSheet
      open={open}
      wide
      title={existing ? `${existing.code} · ${existing.name}` : scope === "Batch" ? "New batch template" : "New recurring template"}
      description={
        existing
          ? `${scopeLabel(existing.scope)} · ${existing.frequency} · next invoice ${formatDate(existing.next)}`
          : scope === "Batch"
            ? "One template for several customers. Each customer gets their own invoice with the same lines."
            : "A customer billed every week or month. Create Invoice then opens the invoice form with these details filled in."
      }
      onClose={nav.back}
    >
      {({ setDirty, close }) => (
        <TemplateForm
          scope={scope}
          existing={existing}
          nav={nav}
          close={close}
          setDirty={setDirty}
          onCreateInvoice={onCreateInvoice}
        />
      )}
    </GuardedSheet>
  );
}

function TemplateForm({
  scope,
  existing,
  nav,
  close,
  setDirty,
  onCreateInvoice,
}: {
  scope: RecurringScope;
  existing?: RecurringBill;
  nav: SalesNav;
  close: () => void;
  setDirty: (dirty: boolean) => void;
  onCreateInvoice: (bill: RecurringBill) => void;
}) {
  const state = useSalesState();
  const [input, setInput] = useState<RecurringInput>(() => (existing ? recurringInputFrom(existing) : newRecurringInput(scope)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [search, setSearch] = useState("");
  useReportDirty(input, setDirty);
  const dirty = useIsDirty(input);

  const update = (patch: Partial<RecurringInput>) => {
    setInput((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };
  const updateLines = (change: (lines: SalesLine[]) => SalesLine[]) => {
    setInput((current) => ({ ...current, lines: change(current.lines) }));
    setErrors((current) => {
      const next = { ...current };
      delete next.lines;
      return next;
    });
  };

  const activeCustomers = state.customers.filter((item) => item.status === "Active" || input.customerIds.includes(item.id));
  const chooseSingle = (id: string) => {
    const chosen = state.customers.find((item) => item.id === id);
    // A new template starts in the customer's preferred currency.
    update({ customerIds: id ? [id] : [], ...(chosen && !existing ? currencyDefaults(chosen.currency) : {}) });
  };
  const toggle = (id: string, on: boolean) =>
    update({ customerIds: on ? [...input.customerIds, id] : input.customerIds.filter((item) => item !== id) });
  const term = search.trim().toLowerCase();
  const listed = activeCustomers.filter((item) => !term || `${item.code} ${item.display} ${item.name}`.toLowerCase().includes(term));
  const allListed = listed.length > 0 && listed.every((item) => input.customerIds.includes(item.id));

  const totals = lineTotals(input.lines);
  const amount = (value: number) => docMoney(value, input);
  const frequencies = useMemo(
    () => (RECURRING_FREQUENCIES.some((item) => item === input.frequency) ? [...RECURRING_FREQUENCIES] : [...RECURRING_FREQUENCIES, input.frequency]),
    [input.frequency],
  );

  const save = () => {
    const found = validateRecurring(state, input);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    try {
      const saved = commitSales((sales) => saveRecurring(sales, input, nav.actor));
      nav.notify(existing ? `${saved} updated.` : `Template ${saved} created. Click Create Invoice when it is due.`);
      setDirty(false);
      nav.go("recurring-bills");
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The template could not be saved.");
    }
  };
  const toggleStatus = () => {
    if (!existing) return;
    const status = existing.status === "Active" ? "Paused" : "Active";
    commitSales((sales) => setRecurringStatus(sales, existing.code, status, nav.actor));
    nav.notify(`${existing.code} ${status === "Active" ? "resumed" : "paused"}.`);
  };
  const pending = existing ? recurringPending(existing) : [];

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {existing ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusPill status={existing.status} />
              <span>{scopeLabel(existing.scope)}</span>
              <span>·</span>
              <span>{existing.scope === "Batch" ? `${existing.customerIds.length - pending.length} of ${existing.customerIds.length} invoiced for ${formatDate(existing.next)}` : pending.length ? `Not invoiced for ${formatDate(existing.next)}` : `Invoiced for ${formatDate(existing.next)}`}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={toggleStatus}>{existing.status === "Active" ? "Pause" : "Resume"}</Button>
              {existing.status === "Active" ? (
                <Button type="button" size="sm" disabled={!pending.length || dirty} title={dirty ? "Save your changes first." : undefined} onClick={() => onCreateInvoice(existing)}>
                  {existing.scope === "Batch" ? `Create Invoices (${pending.length})` : "Create Invoice"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <Section title="Schedule">
          <div className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2">
            <Field label="Billed for" required error={errors.name} className="sm:col-span-2">
              <Input value={input.name} placeholder="e.g. Monthly maintenance contract" aria-invalid={Boolean(errors.name)} onChange={(event) => update({ name: event.target.value })} />
            </Field>
            {scope === "Single" ? (
              <Field label="Customer" required error={errors.customerIds} className="sm:col-span-2">
                <select className={selectClass} value={input.customerIds[0] ?? ""} aria-invalid={Boolean(errors.customerIds)} onChange={(event) => chooseSingle(event.target.value)}>
                  <option value="">Select customer</option>
                  {activeCustomers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.display}</option>)}
                </select>
              </Field>
            ) : null}
            <ProjectLocationFields value={input} errors={errors} onChange={update} />
            <Field label="Frequency" required>
              <select className={selectClass} value={input.frequency} onChange={(event) => update({ frequency: event.target.value as RecurringInput["frequency"] })}>
                {frequencies.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field
              label="Next invoice date"
              required
              error={errors.next}
              hint={existing && input.next !== existing.next ? "Changing the date starts a new period." : `Then every ${input.frequency === "Weekly" ? "week" : input.frequency === "Monthly" ? "month" : input.frequency.toLowerCase().replace("ly", "")}.`}
            >
              <Input type="date" value={input.next} aria-invalid={Boolean(errors.next)} onChange={(event) => update({ next: event.target.value })} />
            </Field>
            <CurrencyFields
              value={{ currency: input.currency, fxRate: input.fxRate }}
              errors={errors}
              onChange={update}
              amount={totals.total}
              hint={scope === "Batch" ? "Every customer on the batch is invoiced in this currency." : undefined}
            />
            <Field label="Customer reference" hint="Optional. The period date is added to each invoice.">
              <Input value={input.reference} placeholder="e.g. AMC 2026" onChange={(event) => update({ reference: event.target.value })} />
            </Field>
            <Field label="Notes printed on each invoice" className="sm:col-span-2">
              <Textarea rows={2} value={input.notes} placeholder="Optional" onChange={(event) => update({ notes: event.target.value })} />
            </Field>
          </div>
        </Section>

        {scope === "Batch" ? (
          <Section
            title={`Customers · ${input.customerIds.length} selected`}
            aside={
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!listed.length}
                  onClick={() =>
                    update({
                      customerIds: allListed
                        ? input.customerIds.filter((id) => !listed.some((item) => item.id === id))
                        : [...new Set([...input.customerIds, ...listed.map((item) => item.id)])],
                    })
                  }
                >
                  {allListed ? "Clear listed" : "Select all listed"}
                </Button>
              </div>
            }
          >
            <div className="grid gap-2.5 p-4">
              <Input value={search} placeholder="Search customers by code or name" aria-label="Search customers" onChange={(event) => setSearch(event.target.value)} />
              {errors.customerIds ? <p className="m-0 text-xs font-semibold text-[var(--nx-danger)]" role="alert">{errors.customerIds}</p> : null}
              <div className="max-h-64 overflow-y-auto rounded border border-border">
                {listed.length ? (
                  <ul className="m-0 list-none divide-y divide-border p-0">
                    {listed.map((item) => {
                      const checked = input.customerIds.includes(item.id);
                      const invoiced = existing?.billed[item.id];
                      return (
                        <li key={item.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                            <Checkbox checked={checked} onCheckedChange={(value) => toggle(item.id, Boolean(value))} aria-label={`Include ${item.display}`} />
                            <span className="min-w-0 flex-1 truncate">
                              <span className="font-mono text-xs text-muted-foreground">{item.code}</span> · {item.display}
                            </span>
                            <span className="text-xs text-muted-foreground">{item.terms} · {item.currency}</span>
                            {invoiced ? <StatusPill status="Invoiced" /> : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="m-0 px-3 py-4 text-center text-xs text-muted-foreground">No active customers match “{search}”.</p>
                )}
              </div>
              <p className="m-0 text-xs text-muted-foreground">Each customer gets their own invoice, with their own payment terms and due date.</p>
            </div>
          </Section>
        ) : null}

        <Section title="Products & services on each invoice">
          <div className="p-4">
            <LineItemsEditor
              lines={input.lines}
              onChange={updateLines}
              currency={input.currency}
              fxRate={docRate(input)}
              error={errors.lines}
              formatAmount={amount}
            />
            <div className="mt-3.5 flex justify-end">
              <div className="w-full max-w-80">
                <TotalsSummary
                  rows={[
                    ["Untaxed amount", amount(totals.sub)],
                    ["Sales tax", amount(totals.tax)],
                    ...(scope === "Batch" && input.customerIds.length > 1
                      ? ([[`Per run · ${input.customerIds.length} customers`, amount(totals.total * input.customerIds.length)]] as [string, string][])
                      : []),
                  ]}
                  total={["Per invoice", amount(totals.total)]}
                />
              </div>
            </div>
          </div>
        </Section>

        {existing ? (
          <Section title="Activity">
            <div className="p-4">
              <ActivityList entries={[...existing.history].reverse()} />
            </div>
          </Section>
        ) : null}
      </div>
      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        <Button type="button" variant="outline" onClick={close}>Cancel</Button>
        <Button type="button" onClick={save}>{existing ? "Save changes" : "Save template"}</Button>
      </SheetFooter>
    </>
  );
}

/* ------------------------------------------------- batch invoices sheet */

function BatchInvoicesSheet({ code, nav, onClose }: { code?: string; nav: SalesNav; onClose: () => void }) {
  const state = useSalesState();
  const bill = findRecurring(state, code);
  return (
    <GuardedSheet
      open={Boolean(code && bill)}
      wide
      title={bill ? `Create invoices · ${bill.code}` : "Create invoices"}
      description={bill ? `${bill.name} · ${bill.frequency} · period ${formatDate(bill.next)}` : ""}
      onClose={onClose}
    >
      {() => (bill ? <BatchInvoices bill={bill} nav={nav} onClose={onClose} /> : null)}
    </GuardedSheet>
  );
}

function BatchInvoices({ bill, nav, onClose }: { bill: RecurringBill; nav: SalesNav; onClose: () => void }) {
  const state = useSalesState();
  // The period shown while the sheet is open; posting the last customer moves the template on.
  const [period] = useState(bill.next);
  const [posted, setPosted] = useState<Record<string, string>>(() => ({ ...bill.billed }));
  const pending = bill.customerIds.filter((id) => !posted[id]);
  const perInvoice = recurringTotal(bill);

  const postAll = () => {
    try {
      const codes = commitSales((sales) => postRecurringBatch(sales, bill.code, nav.actor));
      setPosted((current) => ({ ...current, ...Object.fromEntries(pending.map((id, index) => [id, codes[index]])) }));
      nav.notify(`${codes.length} invoice(s) posted from ${bill.code}: ${codes.join(", ")}.`);
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The invoices could not be created.");
    }
  };
  const review = (customerId: string) => nav.openNew("invoices", `${bill.code}@${customerId}`);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3.5 border-b border-border p-4 sm:grid-cols-4">
          <ReadField label="Period">{formatDate(period)}</ReadField>
          <ReadField label="Customers">{bill.customerIds.length}</ReadField>
          <ReadField label="Per invoice">{docMoney(perInvoice, bill)}</ReadField>
          <ReadField label="To invoice">{pending.length ? docMoney(perInvoice * pending.length, bill) : "All invoiced"}</ReadField>
        </div>
        <div className="relative overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Payment terms</th>
                <th className="text-right!">Amount</th>
                <th>Status</th>
                <th><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {bill.customerIds.map((id) => {
                const customer = state.customers.find((item) => item.id === id);
                const invoice = posted[id];
                return (
                  <tr key={id}>
                    <td>
                      <span className="font-mono text-xs text-muted-foreground">{customer?.code}</span> · {customerLabel(state, id)}
                    </td>
                    <td className="text-muted-foreground">{customer?.terms ?? "—"}</td>
                    <td className="text-right font-semibold tabular-nums whitespace-nowrap">{docMoney(perInvoice, bill)}</td>
                    <td>{invoice ? <StatusPill status="Invoiced" /> : <StatusPill status="Not invoiced" />}</td>
                    <td className="text-right whitespace-nowrap">
                      {invoice ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => nav.open(invoice)}>
                          {invoice}
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => review(id)}>Review in invoice form</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 px-4 py-3 text-xs text-muted-foreground">
          Save &amp; Post all issues one invoice per customer with the template lines, each customer&apos;s payment terms and due date. To change one customer&apos;s
          invoice first, use Review in invoice form. When every customer is invoiced, the template moves to its next {bill.frequency === "Weekly" ? "week" : "period"}.
        </p>
      </div>
      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        <Button type="button" disabled={!pending.length} onClick={postAll}>
          {pending.length ? `Save & Post all (${pending.length})` : "All invoiced"}
        </Button>
      </SheetFooter>
    </>
  );
}
