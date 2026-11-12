"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { Card, EmptyState, ListToolbar, MetricTiles, PageHead, SearchBox, StatusPill } from "../components/sales-ui";
import { ListPager, ListTable, ListViewMenu, usePagedRows, useListView, type ListColumn } from "../components/list-view-options";
import { FulfilmentPanel } from "../components/fulfilment-panel";
import type { SalesNav } from "../components/sales-nav";
import { formatDate, moneyWhole, todayIso } from "../model/sales-format";
import { docCurrency } from "../model/sales-currency";
import { useSalesState } from "../model/sales-store";
import { approvalOf, approverName, deliveryAddress, documentTotal, findCustomer, findDocument, fulfilmentStage } from "../model/sales-workflow";
import type { SalesDocument, SalesState } from "../model/sales-types";

type DeliveryTab = "pick" | "packed" | "done";

const NEXT_ACTION: Record<"pick" | "packed", string> = { pick: "Pick & Pack", packed: "Save Delivery" };

function pendingColumns(state: SalesState, tab: "pick" | "packed"): ListColumn<SalesDocument>[] {
  const today = todayIso();
  const source = (order: SalesDocument) => {
    const quotation = findDocument(state, "quotation", order.links.quotation);
    const approved = quotation ? approvalOf(quotation) : undefined;
    return approved ? `${quotation!.code} · approved by ${approverName(approved)}` : "Direct order";
  };
  return [
    { id: "order", label: "Order", required: true, cell: (order) => <><span className="font-mono font-semibold">{order.code}</span><small>{source(order)}</small></> },
    { id: "customer", label: "Customer", required: true, cell: (order) => <><strong>{findCustomer(state, order.customerId)?.display}</strong><small>{deliveryAddress(findCustomer(state, order.customerId))}</small></> },
    {
      id: "date2",
      label: "Delivery date",
      cell: (order) => (
        <>
          {formatDate(order.date2)}
          {order.date2 < today ? <small className="text-[var(--nx-danger)]!">Late</small> : null}
        </>
      ),
    },
    { id: "warehouse", label: "Ship from", cell: (order) => order.warehouse },
    { id: "items", label: "Items", cell: (order) => order.lines.map((item, index) => <span key={`${item.sku}-${index}`} className="block">{item.qty} × {item.desc}</span>) },
    { id: "packed", label: "Packed", optional: tab === "pick", cell: (order) => (order.pickPack ? `${order.pickPack.packages} pkg · ${order.pickPack.packedBy}` : "—") },
    { id: "amount", label: "Amount", align: "right", cell: (order) => moneyWhole(documentTotal(order), docCurrency(order)) },
    { id: "stage", label: "Fulfilment", cell: (order) => <StatusPill status={fulfilmentStage(order)} /> },
    { id: "next", label: "Next action", required: true, cell: () => <span className="text-xs font-semibold whitespace-nowrap text-[var(--nx-brand)]">{NEXT_ACTION[tab]} →</span> },
  ];
}

function deliveredColumns(state: SalesState, nav: SalesNav, createInvoice: (order: SalesDocument) => void): ListColumn<SalesDocument>[] {
  return [
    { id: "delivery", label: "Delivery", required: true, cell: (order) => <span className="font-mono font-semibold">{order.delivery?.no}</span> },
    { id: "date", label: "Delivered on", nowrap: true, cell: (order) => formatDate(order.delivery?.date) },
    { id: "order", label: "Order", cell: (order) => <span className="font-mono">{order.code}</span> },
    { id: "customer", label: "Customer", required: true, cell: (order) => findCustomer(state, order.customerId)?.display },
    { id: "receivedBy", label: "Received by", cell: (order) => order.delivery?.receivedBy || "—" },
    { id: "warehouse", label: "Ship from", optional: true, cell: (order) => order.delivery?.warehouse || "—" },
    { id: "notes", label: "Notes", optional: true, cell: (order) => order.delivery?.notes || "—" },
    { id: "amount", label: "Amount", align: "right", optional: true, cell: (order) => moneyWhole(documentTotal(order), docCurrency(order)) },
    {
      id: "invoice",
      label: "Invoice",
      required: true,
      cell: (order) =>
        order.links.invoice ? (
          <Button type="button" size="sm" variant="outline" className="font-mono" onClick={() => nav.open(order.links.invoice!)}>
            {order.links.invoice}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => createInvoice(order)}>Create Invoice</Button>
        ),
    },
  ];
}

/**
 * Confirmed orders arrive here. Click an order to pick, pack and save its
 * delivery in the side panel, then create the invoice. No approvals. The
 * order status stays Confirmed; fulfilment shows Packed / Delivered / Invoiced.
 */
export function DeliveryView({ nav }: { nav: SalesNav }) {
  const state = useSalesState();
  const [tab, setTab] = useState<DeliveryTab>("pick");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const confirmed = state.order.filter((order) => order.status === "Confirmed");
  const toPick = confirmed.filter((order) => fulfilmentStage(order) === "Not started");
  const packed = confirmed.filter((order) => fulfilmentStage(order) === "Packed");
  const delivered = state.order
    .filter((order) => order.delivery)
    .sort((a, b) => (b.delivery?.no ?? "").localeCompare(a.delivery?.no ?? "", undefined, { numeric: true }));
  const notInvoiced = delivered.filter((order) => !order.links.invoice).length;

  // Opens the invoice form prefilled from the order; nothing is saved until the form is saved.
  const createInvoice = (order: SalesDocument) => nav.openNew("invoices", order.code);

  const pendingCols = useMemo(() => pendingColumns(state, tab === "packed" ? "packed" : "pick"), [state, tab]);
  const doneCols = deliveredColumns(state, nav, createInvoice);
  const pendingView = useListView(`delivery.${tab === "packed" ? "packed" : "pick"}`, pendingCols);
  const doneView = useListView("delivery.done", doneCols);
  const view = tab === "done" ? doneView : pendingView;

  const source = tab === "pick" ? toPick : tab === "packed" ? packed : delivered;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source.filter((order) => {
      if (!needle) return true;
      const customer = findCustomer(state, order.customerId);
      return [order.code, order.delivery?.no, customer?.display, customer?.name, order.links.invoice, order.links.quotation].join(" ").toLowerCase().includes(needle);
    });
  }, [query, source, state]);
  const paging = usePagedRows(view, rows, [tab, query].join("|"));

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

  const empty =
    tab === "pick"
      ? <EmptyState title="Nothing to pick" hint="Orders appear here once they are confirmed." />
      : tab === "packed"
        ? <EmptyState title="Nothing packed and waiting" hint="Picked and packed orders appear here until delivered." />
        : <EmptyState title="No deliveries yet" />;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Pick, Pack & Delivery"
        title="Pick, Pack & Delivery"
        status={<StatusPill status="Prototype only" />}
        description="Confirmed sales orders appear here. Click an order to pick and pack it, save the delivery and create the invoice once delivered. No further approval is needed."
        actions={<ListViewMenu view={view} />}
      />
      <MetricTiles
        metrics={[
          { label: "Ready to pick & pack", value: toPick.length, hint: "Confirmed orders", onSelect: () => setTab("pick"), selected: tab === "pick" },
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
          <SearchBox value={query} onChange={setQuery} placeholder="Search order, delivery, customer or invoice" />
        </ListToolbar>
        {rows.length ? (
          <>
            <ListTable view={view} rows={paging.pageRows} rowKey={(order) => order.code} onOpen={(order) => setSelected(order.code)} />
            <ListPager view={view} paging={paging} of={source.length} noun={tab === "done" ? "deliveries" : "orders"} />
          </>
        ) : (
          empty
        )}
      </Card>
      <FulfilmentPanel orderCode={selected} nav={nav} onClose={() => setSelected(null)} />
    </div>
  );
}
