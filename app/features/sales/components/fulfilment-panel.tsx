"use client";

/**
 * Delivery panel for one sales order (prototype).
 *
 * Items are delivered directly, so there is no separate pick & pack. The
 * right-side panel confirms the delivery of a confirmed order, then offers
 * Create Invoice, which opens the invoice form prefilled from the order. No
 * step here asks for approval: Management approval happens once, on the quotation.
 */

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "cn";
import { Field, KeyValues, LinkButton, salesLayer, selectClass, StatusPill } from "./sales-ui";
import type { SalesNav } from "./sales-nav";
import { SALES_WAREHOUSES } from "../model/sales-constants";
import { formatDate, todayIso } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  approvalOf,
  approverName,
  contextErrors,
  contextOf,
  deliveryAddress,
  findCustomer,
  findDocument,
  fulfilmentStage,
  nextDeliveryNumber,
  recordDelivery,
  type DeliveryInput,
  type FieldErrors,
} from "../model/sales-workflow";
import type { SalesContextFields, SalesDocument } from "../model/sales-types";
import { ProjectLocationFields, ProjectLocationRead } from "./project-location-fields";

export const sidePanelClass = "w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl";

function Step({ index, title, done, children }: { index: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-foreground">
        <i
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full border text-xs not-italic",
            done ? "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]" : "border-primary bg-primary text-primary-foreground",
          )}
        >
          {done ? <Check className="size-3.5" aria-hidden="true" /> : index}
        </i>
        {title}
      </h3>
      {children}
    </section>
  );
}

function FulfilmentBody({ order, nav, onClose }: { order: SalesDocument; nav: SalesNav; onClose: () => void }) {
  const state = useSalesState();
  const customer = findCustomer(state, order.customerId);
  const quotation = findDocument(state, "quotation", order.links.quotation);
  const approved = quotation ? approvalOf(quotation) : undefined;
  // The delivery uses the order's project and location by default.
  const [context, setContext] = useState<SalesContextFields>(() => contextOf(order));
  const [delivery, setDelivery] = useState<DeliveryInput>({
    date: todayIso(),
    warehouse: order.warehouse || SALES_WAREHOUSES[0],
    receivedBy: customer?.contactName ?? "",
    notes: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const delivered = Boolean(order.delivery);
  const stage = fulfilmentStage(order);
  const chooseContext = (patch: SalesContextFields) => {
    setContext((current) => ({ ...current, ...patch }));
    setErrors((current) => ({ ...current, ...Object.fromEntries(Object.keys(patch).map((key) => [key, ""])) }));
  };

  const run = (change: () => string) => {
    try {
      nav.notify(change());
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "That action could not be completed.");
    }
  };

  const confirmDelivery = () => {
    const missing = contextErrors(context);
    if (Object.keys(missing).length) {
      setErrors((current) => ({ ...current, ...missing }));
      return;
    }
    if (!delivery.date) {
      setErrors((current) => ({ ...current, date: "Enter the delivery date." }));
      return;
    }
    run(() => {
      const no = commitSales((sales) => recordDelivery(sales, order.code, nav.actor, { ...delivery, ...context }));
      return `Delivery ${no} confirmed. Next: Create Invoice.`;
    });
  };

  // Opens the invoice form prefilled from this order; the invoice is saved from that form.
  const createInvoice = () => {
    onClose();
    nav.openNew("invoices", order.code);
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="-mt-2">
          <KeyValues
            rows={[
              ["Customer", customer?.display ?? "—"],
              ["Ship to", deliveryAddress(customer) || "—"],
              ["Delivery date", formatDate(order.date2)],
              ...(quotation
                ? ([
                    ["Quotation", <LinkButton key="q" mono onClick={() => { onClose(); nav.open(quotation.code); }}>{quotation.code}</LinkButton>],
                    ["Approved by", approved ? `${approverName(approved)} · ${approved.at}` : "—"],
                  ] as [string, ReactNode][])
                : ([["Source", "Direct order"]] as [string, ReactNode][])),
            ]}
          />
        </div>

        <section className="grid gap-3 border-b border-border px-4 py-4 sm:grid-cols-2" aria-label="Project and location">
          {delivered && order.delivery ? (
            <ProjectLocationRead value={order.delivery} />
          ) : (
            <ProjectLocationFields value={context} errors={errors} onChange={chooseContext} />
          )}
        </section>

        <Step index={1} title="Delivery" done={delivered}>
          {delivered && order.delivery ? (
            <KeyValues
              rows={[
                ["Delivery no.", <span key="no" className="font-mono">{order.delivery.no}</span>],
                ["Delivered on", formatDate(order.delivery.date)],
                ["Ship from", order.delivery.warehouse],
                ["Received by", order.delivery.receivedBy || "—"],
                ["Recorded by", `${order.delivery.by} · ${order.delivery.at}`],
              ]}
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Delivery date" required error={errors.date}>
                  <Input type="date" value={delivery.date} aria-invalid={Boolean(errors.date)} onChange={(event) => { setDelivery({ ...delivery, date: event.target.value }); setErrors((current) => ({ ...current, date: "" })); }} />
                </Field>
                <Field label="Ship from">
                  <select className={selectClass} value={delivery.warehouse} onChange={(event) => setDelivery({ ...delivery, warehouse: event.target.value })}>
                    {SALES_WAREHOUSES.map((warehouse) => <option key={warehouse}>{warehouse}</option>)}
                  </select>
                </Field>
                <Field label="Received by">
                  <Input value={delivery.receivedBy} placeholder="Optional" onChange={(event) => setDelivery({ ...delivery, receivedBy: event.target.value })} />
                </Field>
                <Field label="Notes">
                  <Input value={delivery.notes} placeholder="Vehicle, driver or site notes" onChange={(event) => setDelivery({ ...delivery, notes: event.target.value })} />
                </Field>
              </div>
              <p className="m-0 text-xs text-muted-foreground">Delivery number {nextDeliveryNumber(state)} is assigned when you confirm. No approval is needed.</p>
            </>
          )}
        </Step>
      </div>

      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        {order.status !== "Confirmed" ? null : stage === "Not started" ? (
          <Button type="button" onClick={confirmDelivery}>Confirm Delivery</Button>
        ) : stage === "Delivered" ? (
          <Button type="button" onClick={createInvoice}>Create Invoice</Button>
        ) : order.links.invoice ? (
          <Button type="button" variant="outline" onClick={() => { onClose(); nav.open(order.links.invoice!); }}>Open invoice {order.links.invoice}</Button>
        ) : null}
      </SheetFooter>
    </>
  );
}

/** Right-side panel: confirm the delivery, then create the invoice. */
export function FulfilmentPanel({ orderCode, nav, onClose }: { orderCode: string | null; nav: SalesNav; onClose: () => void }) {
  const state = useSalesState();
  const order = orderCode ? findDocument(state, "order", orderCode) : undefined;
  return (
    <Sheet open={Boolean(order)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" overlayClassName={salesLayer.sheetOverlay} className={cn(sidePanelClass, salesLayer.sheet)}>
        {order ? (
          <>
            <SheetHeader className="border-b border-border pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="m-0 font-mono text-lg font-bold">{order.code}</SheetTitle>
                <StatusPill status={fulfilmentStage(order)} />
              </div>
              <SheetDescription className="m-0">Confirm the delivery of this order. Then create the invoice.</SheetDescription>
            </SheetHeader>
            <FulfilmentBody key={`${order.code}-${fulfilmentStage(order)}`} order={order} nav={nav} onClose={onClose} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
