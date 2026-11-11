"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { Field, KeyValues, salesLayer, selectClass, tableClass } from "./sales-ui";
import { useDiscardGuard, useIsDirty } from "./discard-guard";
import { formatDate, todayIso } from "../model/sales-format";
import { docMoney } from "../model/sales-currency";
import {
  customerLabel,
  decisionNeedsNote,
  documentTotal,
  lineAmount,
  newReturnInput,
  returnedQty,
  validateReturn,
  type FieldErrors,
  type ReturnInput,
} from "../model/sales-workflow";
import type { ApprovalDecision, SalesDocument, SalesState } from "../model/sales-types";

/**
 * Sale Return, chosen from Add New on the Invoices page (meeting of 11 Nov
 * 2026: "when clicking add new, there should be a sale return option"; there
 * is no separate returns module). Pick the invoice, enter the quantity
 * returned per line; the value incl. sales tax is credited to that invoice.
 */
export function SaleReturnDialog({
  invoices,
  state,
  onClose,
  onSave,
}: {
  /** Invoices that still have something to return. */
  invoices: readonly SalesDocument[];
  state: SalesState;
  onClose: () => void;
  onSave: (input: ReturnInput) => void;
}) {
  const [input, setInput] = useState<ReturnInput>({ invoice: "", date: todayIso(), qty: [], reason: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const { guard, dialog } = useDiscardGuard(useIsDirty(input));
  const invoice = invoices.find((item) => item.code === input.invoice);
  const value = invoice ? invoice.lines.reduce((sum, line, index) => sum + lineAmount({ ...line, qty: Number(input.qty[index]) || 0 }), 0) : 0;

  const chooseInvoice = (code: string) => {
    const chosen = invoices.find((item) => item.code === code);
    setInput((current) => (chosen ? { ...newReturnInput(chosen), date: current.date, reason: current.reason } : { ...current, invoice: "", qty: [] }));
    setErrors({});
  };

  const setQty = (index: number, qty: number) => {
    setInput((current) => ({ ...current, qty: current.qty.map((item, i) => (i === index ? qty : item)) }));
    setErrors((current) => ({ ...current, [`qty.${index}`]: "", lines: "" }));
  };

  const save = () => {
    if (!invoice) {
      setErrors({ invoice: "Choose the invoice the goods were sold on." });
      return;
    }
    const found = validateReturn(state, input);
    if (Object.keys(found).length) setErrors(found);
    else onSave(input);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && guard(onClose)}>
      <DialogContent overlayClassName={salesLayer.dialogOverlay} className={cn("sm:max-w-2xl", salesLayer.dialog)}>
        <DialogHeader>
          <DialogTitle className="m-0">Sale Return{invoice ? ` · ${invoice.code}` : ""}</DialogTitle>
          <DialogDescription className="m-0">Choose the invoice and enter what the customer returned. The value, including sales tax, is credited to that invoice and lowers its balance.</DialogDescription>
        </DialogHeader>
        <Field label="Invoice" required error={errors.invoice || undefined}>
          <select className={selectClass} value={input.invoice} aria-invalid={Boolean(errors.invoice)} onChange={(event) => chooseInvoice(event.target.value)}>
            <option value="">{invoices.length ? "Choose an invoice" : "No invoice has anything left to return"}</option>
            {invoices.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} · {customerLabel(state, item.customerId)} · {formatDate(item.date)} · {docMoney(documentTotal(item), item)}
              </option>
            ))}
          </select>
        </Field>
        {invoice ? (
          <div className="max-h-[45vh] overflow-auto">
            <table className={cn(tableClass, "[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2")}>
              <thead>
                <tr><th>Item</th><th className="text-right!">Invoiced</th><th className="text-right!">Already returned</th><th className="text-right!">Return now</th><th className="text-right!">Value</th></tr>
              </thead>
              <tbody>
                {invoice.lines.map((line, index) => {
                  const done = returnedQty(state, invoice.code, line);
                  const left = line.qty - done;
                  const error = errors[`qty.${index}`];
                  return (
                    <tr key={`${line.sku}-${index}`}>
                      <td>{line.desc}<small>{line.sku || "Other charge"} · {docMoney(line.rate, invoice)} + {line.tax}% tax</small></td>
                      <td className="text-right tabular-nums">{line.qty} {line.uom}</td>
                      <td className="text-right tabular-nums">{done}</td>
                      <td className="w-28">
                        <Input
                          type="number"
                          min={0}
                          max={left}
                          step={1}
                          className="h-8.5 text-right"
                          disabled={left <= 0}
                          value={input.qty[index] ?? 0}
                          aria-label={`Quantity returned, ${line.desc}`}
                          aria-invalid={Boolean(error)}
                          onChange={(event) => setQty(index, Number(event.target.value))}
                        />
                        {error ? <small className="text-[var(--nx-danger)]!">{error}</small> : null}
                      </td>
                      <td className="text-right font-semibold tabular-nums">{docMoney(lineAmount({ ...line, qty: Number(input.qty[index]) || 0 }), invoice)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {errors.lines ? <p className="m-0 text-xs font-semibold text-[var(--nx-danger)]" role="alert">{errors.lines}</p> : null}
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Return date" required error={errors.date || undefined}>
            <Input type="date" value={input.date} aria-invalid={Boolean(errors.date)} onChange={(event) => { setInput({ ...input, date: event.target.value }); setErrors((current) => ({ ...current, date: "" })); }} />
          </Field>
          <Field label="Reason" required error={errors.reason || undefined}>
            <Input value={input.reason} placeholder="Damaged, wrong item, not used…" aria-invalid={Boolean(errors.reason)} onChange={(event) => { setInput({ ...input, reason: event.target.value }); setErrors((current) => ({ ...current, reason: "" })); }} />
          </Field>
        </div>
        <p className="m-0 text-right text-sm">Return value <strong className="tabular-nums">{docMoney(value, invoice)}</strong></p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => guard(onClose)}>Cancel</Button>
          <Button type="button" onClick={save} disabled={!invoices.length}>Save Sale Return</Button>
        </DialogFooter>
        {dialog}
      </DialogContent>
    </Dialog>
  );
}

const DECISION_COPY: Record<ApprovalDecision, { title: string; text: string; button: string; notePlaceholder: string }> = {
  Approved: {
    title: "Approve",
    text: "Approves the offered price. The quotation shows Approved; Confirm Order is a separate step when the customer orders. Your name and the date are recorded and the creator is notified.",
    button: "Approve",
    notePlaceholder: "",
  },
  "Changes requested": {
    title: "Request changes on",
    text: "The quotation goes back to its creator to correct and resubmit. Your name and reason are recorded and the creator is notified.",
    button: "Request changes",
    notePlaceholder: "What needs to change before you can approve it",
  },
  Rejected: {
    title: "Reject",
    text: "The quotation is closed. It can be reset to draft and resent later. Your name and reason are recorded and the creator is notified.",
    button: "Reject quotation",
    notePlaceholder: "Why the quotation is rejected",
  },
};

/** Approver's decision on a quotation. A reason is asked for only on Reject or Request Changes. */
export function QuotationDecisionDialog({
  quotation,
  decision,
  customerName,
  total,
  reviewer,
  blocker,
  warning,
  onClose,
  onConfirm,
}: {
  quotation: SalesDocument | null;
  decision: ApprovalDecision;
  customerName: string;
  total: number;
  reviewer: string;
  /** Stops an approval, e.g. customer on credit hold. */
  blocker?: string;
  /** Shown but does not stop the decision, e.g. over credit limit. */
  warning?: string;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const copy = DECISION_COPY[decision];
  const needsNote = decisionNeedsNote(decision);
  const confirm = () => {
    if (needsNote && !note.trim()) {
      setError("Add a reason so the creator knows what to do.");
      return;
    }
    onConfirm(needsNote ? note.trim() : "");
  };
  return (
    <Dialog open={Boolean(quotation)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent overlayClassName={salesLayer.dialogOverlay} className={cn("sm:max-w-md", salesLayer.dialog)}>
        <DialogHeader>
          <DialogTitle className="m-0">{copy.title} {quotation?.code}</DialogTitle>
          <DialogDescription className="m-0">{copy.text}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4">
          <KeyValues rows={[["Customer", customerName || "—"], ["Total", docMoney(total, quotation ?? undefined)], ["Approver", reviewer]]} />
        </div>
        {decision === "Approved" && (blocker || warning) ? (
          <p
            role={blocker ? "alert" : undefined}
            className={
              blocker
                ? "m-0 rounded border border-[var(--nx-danger-border)] bg-[var(--nx-danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--nx-danger)]"
                : "m-0 rounded border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--nx-warning)]"
            }
          >
            {blocker || warning}
          </p>
        ) : null}
        {needsNote ? (
          <Field label="Reason" required error={error || undefined}>
            <Textarea
              rows={3}
              value={note}
              aria-invalid={Boolean(error)}
              placeholder={copy.notePlaceholder}
              onChange={(event) => { setNote(event.target.value); setError(""); }}
            />
          </Field>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" variant={decision === "Rejected" ? "destructive" : "default"} disabled={decision === "Approved" && Boolean(blocker)} onClick={confirm}>{copy.button}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Approver buttons: Reject, Request Changes, Approve. */
export function QuotationDecisionButtons({ onDecide, size = "sm" }: { onDecide: (decision: ApprovalDecision) => void; size?: "sm" | "default" }) {
  const click = (decision: ApprovalDecision) => (event: React.MouseEvent) => {
    event.stopPropagation();
    onDecide(decision);
  };
  return (
    <div className="flex flex-wrap justify-end gap-1.5 whitespace-nowrap">
      <Button type="button" size={size} variant="destructive" onClick={click("Rejected")}>Reject</Button>
      <Button type="button" size={size} variant="outline" onClick={click("Changes requested")}>Request Changes</Button>
      <Button type="button" size={size} onClick={click("Approved")}>Approve</Button>
    </div>
  );
}

/** Confirmation before deleting a draft. */
export function DeleteDraftDialog({ code, onClose, onConfirm }: { code: string | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={Boolean(code)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent overlayClassName={salesLayer.dialogOverlay} className={cn("sm:max-w-sm", salesLayer.dialog)}>
        <DialogHeader>
          <DialogTitle className="m-0">Delete {code}?</DialogTitle>
          <DialogDescription className="m-0">Only drafts can be deleted. This removes the draft from this session and cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Keep it</Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>Delete draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
