"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { Card, clickableRow, EmptyState, ListToolbar, MetricTiles, PageHead, rowKeyHandler, StatusPill, tableClass } from "../components/sales-ui";
import { FulfilmentPanel } from "../components/fulfilment-panel";
import type { SalesNav } from "../components/sales-nav";
import { formatDate, moneyWhole, todayIso } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import { approvalOf, approverName, createInvoiceFromOrder, deliveryAddress, documentTotal, findCustomer, findDocument } from "../model/sales-workflow";
import type { SalesDocument } from "../model/sales-types";

type DeliveryTab = "pick" | "packed" | "done";

/**
 * Approved orders arrive here automatically. Click an order to pick, pack and
 * save its delivery in the side panel, then create the invoice. No approvals.
 */
export function DeliveryView({ nav }: { nav: SalesNav }) {
  const state = useSalesState();
  const [tab, setTab] = useState<DeliveryTab>("pick");
  const [selected, setSelected] = useState<string | null>(null);
  const toPick = state.order.filter((order) => order.status === "Confirmed");
  const packed = state.order.filter((order) => order.status === "Packed");
  const delivered = state.order
    .filter((order) => order.delivery)
    .sort((a, b) => (b.delivery?.no ?? "").localeCompare(a.delivery?.no ?? "", undefined, { numeric: true }));
  const notInvoiced = delivered.filter((order) => order.status === "Delivered").length;
  const today = todayIso();

  const createInvoice = (order: SalesDocument) => {
    try {
      const code = commitSales((sales) => createInvoiceFromOrder(sales, order.code, nav.actor));
      nav.notify(`Invoice ${code} created and saved. Click it in Invoices to record payments.`);
      nav.go("invoices");
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The invoice could not be created.");
    }
  };

  const chip = (id: DeliveryTab, label: string) => (
    <button
      type="button"
      aria-pressed={tab === id}
      onClick={() => setTab(id)}
      className={cn(
        "min-h-7.5 rounded-full border px-3 text-xs font-semibold",
        // Legacy unlayered button colours outrank Tailwind layers, so the text colour is forced.
        tab === id
          ? "border-primary bg-primary text-primary-foreground! [-webkit-text-fill-color:var(--nx-action-text)]"
          : "border-border bg-card text-muted-foreground! hover:text-foreground!",
      )}
    >
      {label}
    </button>
  );

  const source = (order: SalesDocument) => {
    const quotation = findDocument(state, "quotation", order.links.quotation);
    const approved = quotation ? approvalOf(quotation) : undefined;
    return approved ? `${quotation!.code} · approved by ${approverName(approved)}` : "Direct order";
  };

  const pendingRows = (orders: SalesDocument[], action: string) => (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr><th>Order</th><th>Customer</th><th>Delivery date</th><th>Ship from</th><th>Items</th><th className="text-right!">Amount</th><th>Next action</th></tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const customer = findCustomer(state, order.customerId);
            const open = () => setSelected(order.code);
            return (
              <tr key={order.id} className={clickableRow} tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)}>
                <td><span className="font-mono font-semibold">{order.code}</span><small>{source(order)}</small></td>
                <td><strong>{customer?.display}</strong><small>{deliveryAddress(customer)}</small></td>
                <td>
                  {formatDate(order.date2)}
                  {order.date2 < today ? <small className="text-[var(--nx-danger)]!">Late</small> : null}
                </td>
                <td>{order.warehouse}</td>
                <td>{order.lines.map((item, index) => <span key={`${item.sku}-${index}`} className="block">{item.qty} × {item.desc}</span>)}</td>
                <td className="text-right tabular-nums">{moneyWhole(documentTotal(order))}</td>
                <td className="text-xs font-semibold whitespace-nowrap text-[var(--nx-brand)]">{action} →</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Pick, Pack & Delivery"
        title="Pick, Pack & Delivery"
        status={<StatusPill status="Prototype only" />}
        description="Orders appear here as soon as Management approves the quotation. Click an order to pick and pack it, save the delivery and create the invoice. No further approval is needed."
      />
      <MetricTiles
        metrics={[
          { label: "Ready to pick & pack", value: toPick.length, hint: "Approved orders", onSelect: () => setTab("pick"), selected: tab === "pick" },
          { label: "Packed", value: packed.length, hint: "Next: Save Delivery", onSelect: () => setTab("packed"), selected: tab === "packed" },
          { label: "Delivered", value: delivered.length, hint: "All deliveries", onSelect: () => setTab("done"), selected: tab === "done" },
          { label: "Delivered, not invoiced", value: notInvoiced, hint: "Next: Create Invoice" },
        ]}
      />
      <Card>
        <ListToolbar>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="View">
            {chip("pick", `Ready to pick & pack (${toPick.length})`)}
            {chip("packed", `Packed (${packed.length})`)}
            {chip("done", `Delivered (${delivered.length})`)}
          </div>
        </ListToolbar>
        {tab === "pick" ? (
          toPick.length ? pendingRows(toPick, "Pick & Pack") : <EmptyState title="Nothing to pick" hint="Orders appear here once their quotation is approved." />
        ) : tab === "packed" ? (
          packed.length ? pendingRows(packed, "Save Delivery") : <EmptyState title="Nothing packed and waiting" hint="Picked and packed orders appear here until delivered." />
        ) : delivered.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr><th>Delivery</th><th>Delivered on</th><th>Order</th><th>Customer</th><th>Received by</th><th>Invoice</th></tr>
              </thead>
              <tbody>
                {delivered.map((order) => {
                  const open = () => setSelected(order.code);
                  return (
                    <tr key={order.id} className={clickableRow} tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)}>
                      <td><span className="font-mono font-semibold">{order.delivery?.no}</span></td>
                      <td>{formatDate(order.delivery?.date)}</td>
                      <td className="font-mono">{order.code}</td>
                      <td>{findCustomer(state, order.customerId)?.display}</td>
                      <td>{order.delivery?.receivedBy || "—"}</td>
                      <td>
                        {order.links.invoice ? (
                          <Button type="button" size="sm" variant="outline" className="font-mono" onClick={(event) => { event.stopPropagation(); nav.open(order.links.invoice!); }}>
                            {order.links.invoice}
                          </Button>
                        ) : (
                          <Button type="button" size="sm" onClick={(event) => { event.stopPropagation(); createInvoice(order); }}>Create Invoice</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No deliveries yet" />
        )}
      </Card>
      <FulfilmentPanel orderCode={selected} nav={nav} onClose={() => setSelected(null)} />
    </div>
  );
}
