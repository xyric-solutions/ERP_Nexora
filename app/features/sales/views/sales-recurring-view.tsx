"use client";

import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, PageHead, StatusPill, tableClass } from "../components/sales-ui";
import type { SalesNav } from "../components/sales-nav";
import { addDays, formatDate, money, todayIso } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import { customerLabel, invoiceFromRecurring, recurringTotal } from "../model/sales-workflow";

interface RevenueMenuOption {
  label: string;
  /** Opens a real prototype flow; options without one report that they are not built yet. */
  run?: (nav: SalesNav) => void;
}

const ADD_NEW_OPTIONS: RevenueMenuOption[] = [
  // Customer receipts are recorded from the invoice panel (Invoices → Save Receipt).
  { label: "Receipts (SR)", run: (nav) => { nav.go("invoices"); nav.notify("Open an invoice and use Save Receipt to record a payment."); } },
  { label: "Payment (SCP)" },
  { label: "Return Receipts (RSR)" },
  { label: "Return Payment (RSCP)" },
];

const BATCH_OPTIONS: RevenueMenuOption[] = [
  { label: "Invoices Receipts (SR)", run: (nav) => nav.go("invoices") },
  { label: "Receipts (SR)" },
  { label: "Payments (SCP)" },
  { label: "Combined Accounts Offset" },
  { label: "All Combined Accounts Offset" },
];

/** Hover-opened action menu (also opens on click / keyboard) used for Add New and Batch. */
function RevenueHoverMenu({ label, options, nav }: { label: string; options: RevenueMenuOption[]; nav: SalesNav }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        openOnHover
        delay={60}
        closeDelay={120}
        render={<Button type="button" className="rounded-full px-4 data-popup-open:ring-3 data-popup-open:ring-ring/50" />}
      >
        {label}
        <ChevronDownIcon data-icon="inline-end" aria-hidden className="transition-transform duration-150 group-data-popup-open/button:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-auto min-w-56 p-1.5">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.label}
            className="rounded-none border-b border-border px-3 py-2.5 text-sm last:border-b-0 focus:rounded-md focus:text-[var(--nx-brand)]"
            onClick={() =>
              option.run ? option.run(nav) : nav.notify(`${label} › ${option.label} is not available in this prototype yet.`)
            }
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Revenue keeps only Recurring Bills; each bill becomes a normal invoice. */
export function RecurringBillsView({ nav }: { nav: SalesNav }) {
  const state = useSalesState();
  const horizon = addDays(todayIso(), 30);
  const due = state.recurring.filter((bill) => bill.status === "Active" && bill.next <= horizon);

  const createOne = (id: string) => {
    const code = commitSales((sales) => invoiceFromRecurring(sales, id, nav.actor));
    nav.notify(`Invoice ${code} created.`);
  };
  const createDue = () => {
    const codes = commitSales((sales) => due.map((bill) => invoiceFromRecurring(sales, bill.id, nav.actor)));
    nav.notify(`${codes.length} invoice(s) created: ${codes.join(", ")}.`);
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Revenue · Recurring Bills"
        title="Recurring Bills"
        status={<StatusPill status="Prototype only" />}
        description="Customers billed on a fixed schedule, such as maintenance contracts. Each bill becomes a normal invoice."
        actions={
          <>
            <RevenueHoverMenu label="Add New" options={ADD_NEW_OPTIONS} nav={nav} />
            <RevenueHoverMenu label="Batch" options={BATCH_OPTIONS} nav={nav} />
            <Button type="button" variant="outline" disabled={!due.length} onClick={createDue}>Bill everything due in 30 days ({due.length})</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] px-3 py-2.5 text-[0.8125rem]">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-[var(--nx-warning)]">Research pending</span>
        <p className="m-0 flex-[1_1_18rem]">How recurring bills are settled is still being researched. This shows the simplest version: a schedule that creates normal invoices.</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr><th>Schedule</th><th>Customer</th><th>Billed for</th><th>Frequency</th><th>Next bill</th><th className="text-right!">Per bill</th><th>Status</th><th><span className="sr-only">Action</span></th></tr>
            </thead>
            <tbody>
              {state.recurring.map((bill) => (
                <tr key={bill.id}>
                  <td className="font-mono font-semibold">{bill.code}</td>
                  <td>{customerLabel(state, bill.customerId)}</td>
                  <td>{bill.desc}</td>
                  <td>{bill.frequency}</td>
                  <td>{formatDate(bill.next)}</td>
                  <td className="text-right tabular-nums">{money(recurringTotal(bill))}</td>
                  <td><StatusPill status={bill.status} /></td>
                  <td className="text-right">
                    {bill.status === "Active" ? <Button type="button" size="sm" variant="outline" onClick={() => createOne(bill.id)}>Create invoice</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
