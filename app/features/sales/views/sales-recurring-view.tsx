"use client";

import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHead, StatusPill } from "../components/sales-ui";
import { ListPager, ListTable, ListViewMenu, usePagedRows, useListView, type ListColumn } from "../components/list-view-options";
import type { SalesNav } from "../components/sales-nav";
import { addDays, formatDate, money, todayIso } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import { customerLabel, invoiceFromRecurring, recurringTotal } from "../model/sales-workflow";
import type { RecurringBill } from "../model/sales-types";

/**
 * Revenue keeps only Recurring Bills; each bill becomes a normal invoice.
 * The Add New / Batch receipt menus moved to Sales › Receipts (meeting of
 * 11 Nov 2026), where receipts, payments and their returns are recorded.
 */
export function RecurringBillsView({ nav }: { nav: SalesNav }) {
  const state = useSalesState();
  const horizon = addDays(todayIso(), 30);
  const due = state.recurring.filter((bill) => bill.status === "Active" && bill.next <= horizon);

  const createOne = (id: string) => {
    try {
      const code = commitSales((sales) => invoiceFromRecurring(sales, id, nav.actor));
      nav.notify(`Invoice ${code} created.`);
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The invoice could not be created.");
    }
  };
  const createDue = () => {
    const codes = commitSales((sales) => due.map((bill) => invoiceFromRecurring(sales, bill.id, nav.actor)));
    nav.notify(`${codes.length} invoice(s) created: ${codes.join(", ")}.`);
  };

  const columns: ListColumn<RecurringBill>[] = [
      { id: "code", label: "Schedule", required: true, cell: (bill) => <span className="font-mono font-semibold">{bill.code}</span> },
      { id: "customer", label: "Customer", required: true, cell: (bill) => customerLabel(state, bill.customerId) },
      { id: "desc", label: "Billed for", cell: (bill) => bill.desc },
      { id: "sku", label: "Item", optional: true, cell: (bill) => bill.sku },
      { id: "qty", label: "Qty", align: "right", optional: true, cell: (bill) => bill.qty },
      { id: "frequency", label: "Frequency", cell: (bill) => bill.frequency },
      { id: "next", label: "Next bill", nowrap: true, cell: (bill) => formatDate(bill.next) },
      { id: "amount", label: "Per bill", align: "right", cell: (bill) => money(recurringTotal(bill)) },
      { id: "status", label: "Status", required: true, cell: (bill) => <StatusPill status={bill.status} /> },
      {
        id: "action",
        label: "Action",
        required: true,
        cell: (bill) => (bill.status === "Active" ? <Button type="button" size="sm" variant="outline" onClick={() => createOne(bill.id)}>Create invoice</Button> : null),
      },
  ];
  const view = useListView("recurring", columns);
  const paging = usePagedRows(view, state.recurring);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Revenue · Recurring Bills"
        title="Recurring Bills"
        status={<StatusPill status="Prototype only" />}
        description="Customers billed on a fixed schedule, such as maintenance contracts. Each bill becomes a normal invoice; record its payment in Sales › Receipts."
        actions={
          <>
            <ListViewMenu view={view} />
            <Button type="button" variant="outline" disabled={!due.length} onClick={createDue}>Bill everything due in 30 days ({due.length})</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] px-3 py-2.5 text-[0.8125rem]">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-[var(--nx-warning)]">Research pending</span>
        <p className="m-0 flex-[1_1_18rem]">How recurring bills are settled is still being researched. This shows the simplest version: a schedule that creates normal invoices.</p>
      </div>
      <Card>
        {state.recurring.length ? (
          <>
            <ListTable view={view} rows={paging.pageRows} rowKey={(bill) => bill.id} />
            <ListPager view={view} paging={paging} noun="schedules" />
          </>
        ) : (
          <EmptyState title="No recurring bills" />
        )}
      </Card>
    </div>
  );
}
