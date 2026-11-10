"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, KeyValues, selectClass } from "./sales-ui";
import { APPROVER_ROLES } from "../model/sales-constants";
import { money } from "../model/sales-format";
import { decisionNeedsNote, type ReturnInput } from "../model/sales-workflow";
import type { ApprovalDecision, SalesDocument } from "../model/sales-types";

/** New sales return against an invoice; it goes to Sales Approvals. */
export function ReturnDialog({
  open,
  invoices,
  customerName,
  validate,
  onClose,
  onSave,
}: {
  open: boolean;
  invoices: readonly SalesDocument[];
  customerName: (id: string) => string;
  validate: (input: ReturnInput) => string;
  onClose: () => void;
  onSave: (input: ReturnInput) => void;
}) {
  const [input, setInput] = useState<ReturnInput>({ invoice: "", item: "", qty: 1, reason: "" });
  const [error, setError] = useState("");
  const invoice = invoices.find((candidate) => candidate.code === input.invoice);
  const save = () => {
    const problem = validate(input);
    if (problem) setError(problem);
    else onSave(input);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New sales return</DialogTitle>
          <DialogDescription>The return goes to Sales Approvals.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Invoice" required className="sm:col-span-2">
            <select className={selectClass} value={input.invoice} onChange={(event) => { const target = invoices.find((candidate) => candidate.code === event.target.value); setInput({ ...input, invoice: event.target.value, item: target?.lines[0]?.desc ?? "" }); setError(""); }}>
              <option value="">Select invoice</option>
              {invoices.map((candidate) => <option key={candidate.code} value={candidate.code}>{candidate.code} · {customerName(candidate.customerId)}</option>)}
            </select>
          </Field>
          <Field label="Item" required className="sm:col-span-2">
            <select className={selectClass} value={input.item} disabled={!invoice} onChange={(event) => { setInput({ ...input, item: event.target.value }); setError(""); }}>
              {invoice ? invoice.lines.map((item) => <option key={item.desc}>{item.desc}</option>) : <option value="">Select an invoice first</option>}
            </select>
          </Field>
          <Field label="Quantity" required>
            <Input type="number" min={1} step={1} className="text-right" value={input.qty} onChange={(event) => { setInput({ ...input, qty: Number(event.target.value) }); setError(""); }} />
          </Field>
          <Field label="Reason" required>
            <Input value={input.reason} placeholder="Damaged, wrong item…" onChange={(event) => { setInput({ ...input, reason: event.target.value }); setError(""); }} />
          </Field>
        </div>
        {error ? <p className="m-0 text-xs font-semibold text-[var(--nx-danger)]" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save}>Save return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DECISION_COPY: Record<ApprovalDecision, { title: string; text: string; button: string; notePlaceholder: string }> = {
  Approved: {
    title: "Approve",
    text: "Approving confirms the sales order straight away and sends it to Pick, Pack & Delivery. No further approval is needed. Your name, role and the date are recorded and the creator is notified.",
    button: "Approve & Confirm Order",
    notePlaceholder: "Optional note for the salesperson",
  },
  "Changes requested": {
    title: "Request changes on",
    text: "The quotation goes back to its creator to correct and resubmit. Your name, role and note are recorded and the creator is notified.",
    button: "Request changes",
    notePlaceholder: "What needs to change before you can approve it",
  },
  Rejected: {
    title: "Reject",
    text: "The quotation is closed and cannot be turned into an order. Your name, role and note are recorded and the creator is notified.",
    button: "Reject quotation",
    notePlaceholder: "Why the quotation is rejected",
  },
};

/** Reviewer decision on a quotation: Approve, Request Changes or Reject, with role and note. */
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
  onConfirm: (role: string, note: string) => void;
}) {
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ role?: string; note?: string }>({});
  const copy = DECISION_COPY[decision];
  const needsNote = decisionNeedsNote(decision);
  const confirm = () => {
    const found = {
      role: role ? undefined : "Choose the role you are deciding as.",
      note: needsNote && !note.trim() ? "Add a note so the salesperson knows what to do." : undefined,
    };
    if (found.role || found.note) {
      setErrors(found);
      return;
    }
    onConfirm(role, note.trim());
  };
  return (
    <Dialog open={Boolean(quotation)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title} {quotation?.code}</DialogTitle>
          <DialogDescription>{copy.text}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4">
          <KeyValues rows={[["Customer", customerName || "—"], ["Total", money(total)], ["Reviewer", reviewer]]} />
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
        <div className="grid gap-3">
          <Field label="Deciding as" required error={errors.role}>
            <select
              className={selectClass}
              value={role}
              aria-invalid={Boolean(errors.role)}
              onChange={(event) => { setRole(event.target.value); setErrors((current) => ({ ...current, role: undefined })); }}
            >
              <option value="">Select role</option>
              {APPROVER_ROLES.map((option) => <option key={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="Note" required={needsNote} error={errors.note}>
            <Textarea
              rows={3}
              value={note}
              aria-invalid={Boolean(errors.note)}
              placeholder={copy.notePlaceholder}
              onChange={(event) => { setNote(event.target.value); setErrors((current) => ({ ...current, note: undefined })); }}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" variant={decision === "Rejected" ? "destructive" : "default"} disabled={decision === "Approved" && Boolean(blocker)} onClick={confirm}>{copy.button}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Three reviewer buttons: Reject, Request Changes, Approve. */
export function QuotationDecisionButtons({ onDecide, size = "sm" }: { onDecide: (decision: ApprovalDecision) => void; size?: "sm" | "default" }) {
  const click = (decision: ApprovalDecision) => (event: React.MouseEvent) => {
    event.stopPropagation();
    onDecide(decision);
  };
  return (
    <div className="flex flex-wrap justify-end gap-1.5 whitespace-nowrap">
      <Button type="button" size={size} variant="destructive" onClick={click("Rejected")}>Reject</Button>
      <Button type="button" size={size} variant="outline" onClick={click("Changes requested")}>Request Changes</Button>
      <Button type="button" size={size} onClick={click("Approved")}>Approve & Confirm Order</Button>
    </div>
  );
}
