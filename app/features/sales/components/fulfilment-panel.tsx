"use client";

/**
 * Pick, Pack & Delivery panel for one sales order (prototype).
 *
 * One right-side panel takes an approved order through pick, pack and
 * delivery, then offers Create Invoice, which opens the invoice form
 * prefilled from the order. No step here asks for approval:
 * Management approval happens once, on the quotation.
 */

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  deliveryAddress,
  findCustomer,
  findDocument,
  fulfilmentStage,
  nextDeliveryNumber,
  recordDelivery,
  savePickPack,
  validatePickPack,
  type DeliveryInput,
  type FieldErrors,
} from "../model/sales-workflow";
import type { SalesDocument } from "../model/sales-types";

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
  const [picked, setPicked] = useState<number[]>(() => (order.pickPack ? order.lines.map((_, index) => index) : []));
  const [packages, setPackages] = useState(order.pickPack?.packages ?? 1);
  const [packedBy, setPackedBy] = useState(order.pickPack?.packedBy ?? nav.actor);
  const [packNotes, setPackNotes] = useState(order.pickPack?.notes ?? "");
  const [delivery, setDelivery] = useState<DeliveryInput>({
    date: todayIso(),
    warehouse: order.warehouse || SALES_WAREHOUSES[0],
    receivedBy: customer?.contactName ?? "",
    notes: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const packed = Boolean(order.pickPack);
  const delivered = Boolean(order.delivery);
  const stage = fulfilmentStage(order);
  const pickInput = { picked, packages, packedBy, notes: packNotes };

  const run = (change: () => string) => {
    try {
      nav.notify(change());
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "That action could not be completed.");
    }
  };

  const checkPickPack = () => {
    const found = validatePickPack(order, pickInput);
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const savePack = () => {
    if (!checkPickPack()) return;
    run(() => {
      commitSales((sales) => savePickPack(sales, order.code, nav.actor, pickInput));
      return `${order.code} picked and packed. Next: Save Delivery.`;
    });
  };

  const saveDelivery = () => {
    if (!packed && !checkPickPack()) return;
    if (!delivery.date) {
      setErrors((current) => ({ ...current, date: "Enter the delivery date." }));
      return;
    }
    run(() => {
      const no = commitSales((sales) => {
        if (!packed) savePickPack(sales, order.code, nav.actor, pickInput);
        return recordDelivery(sales, order.code, nav.actor, delivery);
      });
      return `Delivery ${no} saved. Next: Create Invoice.`;
    });
  };

  // Opens the invoice form prefilled from this order; the invoice is saved from that form.
  const createInvoice = () => {
    onClose();
    nav.openNew("invoices", order.code);
  };

  const togglePick = (index: number, checked: boolean) => {
    setPicked((current) => (checked ? [...new Set([...current, index])] : current.filter((item) => item !== index)));
    setErrors((current) => ({ ...current, picked: "" }));
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

        <Step index={1} title="Pick items" done={packed}>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {order.lines.map((item, index) => {
              const id = `pick-${order.code}-${index}`;
              return (
                <li key={id} className="flex items-center gap-2.5 rounded border border-border px-3 py-2">
                  <Checkbox
                    id={id}
                    checked={picked.includes(index)}
                    disabled={packed}
                    aria-invalid={Boolean(errors.picked) && !picked.includes(index)}
                    onCheckedChange={(checked) => togglePick(index, Boolean(checked))}
                  />
                  <label htmlFor={id} className="flex min-w-0 flex-1 justify-between gap-2 text-[0.8125rem]">
                    <span className="truncate">{item.desc}</span>
                    <strong className="whitespace-nowrap tabular-nums">{item.qty} {item.uom}</strong>
                  </label>
                </li>
              );
            })}
          </ul>
          {!packed ? (
            <div className="flex items-center justify-between gap-2">
              {errors.picked ? <small className="text-xs font-semibold text-[var(--nx-danger)]">{errors.picked}</small> : <span />}
              <Button type="button" size="sm" variant="outline" onClick={() => { setPicked(order.lines.map((_, index) => index)); setErrors((current) => ({ ...current, picked: "" })); }}>
                Pick all
              </Button>
            </div>
          ) : null}
        </Step>

        <Step index={2} title="Pack" done={packed}>
          {packed && order.pickPack ? (
            <p className="m-0 text-[0.8125rem] text-muted-foreground">
              {order.pickPack.packages} package(s) packed by {order.pickPack.packedBy} · {order.pickPack.at}
              {order.pickPack.notes ? ` · ${order.pickPack.notes}` : ""}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Packages" required error={errors.packages}>
                <Input type="number" min={1} step={1} className="text-right" value={packages} aria-invalid={Boolean(errors.packages)} onChange={(event) => setPackages(Number(event.target.value))} />
              </Field>
              <Field label="Packed by" required error={errors.packedBy}>
                <Input value={packedBy} aria-invalid={Boolean(errors.packedBy)} onChange={(event) => setPackedBy(event.target.value)} />
              </Field>
              <Field label="Packing notes" className="sm:col-span-2">
                <Input value={packNotes} placeholder="Optional" onChange={(event) => setPackNotes(event.target.value)} />
              </Field>
            </div>
          )}
        </Step>

        <Step index={3} title="Delivery" done={delivered}>
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
              <p className="m-0 text-xs text-muted-foreground">Delivery number {nextDeliveryNumber(state)} is assigned when you save. No approval is needed.</p>
            </>
          )}
        </Step>
      </div>

      <SheetFooter className="flex-row flex-wrap justify-end border-t border-border bg-muted">
        {order.status !== "Confirmed" ? null : stage === "Not started" ? (
          <>
            <Button type="button" variant="outline" onClick={savePack}>Save Pick & Pack</Button>
            <Button type="button" onClick={saveDelivery}>Save Delivery</Button>
          </>
        ) : stage === "Packed" ? (
          <Button type="button" onClick={saveDelivery}>Save Delivery</Button>
        ) : stage === "Delivered" ? (
          <Button type="button" onClick={createInvoice}>Create Invoice</Button>
        ) : order.links.invoice ? (
          <Button type="button" variant="outline" onClick={() => { onClose(); nav.open(order.links.invoice!); }}>Open invoice {order.links.invoice}</Button>
        ) : null}
      </SheetFooter>
    </>
  );
}

/** Right-side panel: pick, pack, save delivery, then create the invoice. */
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
              <SheetDescription className="m-0">Pick, pack and deliver this order. Then create the invoice.</SheetDescription>
            </SheetHeader>
            <FulfilmentBody key={`${order.code}-${fulfilmentStage(order)}`} order={order} nav={nav} onClose={onClose} />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
