/**
 * Sales workflow rules for the prototype (meeting of 11 Nov 2026).
 *
 * Quotation (Draft) → optional named approver → Approved → Confirm Order →
 * Sales Order (Confirmed) → Delivery → Invoice → Receipts. Items are
 * delivered directly; there is no separate pick & pack step.
 * Without an approver the creator approves the quotation. Payments are
 * recorded on the Receipts page (receipts, customer payments and their
 * returns) and allocated against outstanding invoices; Sale Return is
 * recorded from an opened invoice. These rules run in the browser against
 * session fixtures; when the Sales API is built they move server-side with
 * authorization, audit and idempotency.
 */

import { moneyDocMeta, RECEIPT_ACCOUNTS, RECEIPT_METHODS, SALES_KINDS, SALES_TERM_DAYS, SALES_WAREHOUSES } from "./sales-constants";
import { addDays, addMonths, BASE_CURRENCY, formatDate, money, stamp, todayIso } from "./sales-format";
import { addressLines, blankCustomer, documentTermsFor, normalizeCustomer, onCreditHold, shippingAddress } from "./customer-model";
import { approverTitle, samePerson } from "./sales-approvers";
import { currencyDefaults, docCurrency, docMoney, fxRateError, normalizeCurrency, toBase } from "./sales-currency";
import type {
  ApprovalDecision,
  ApprovalEntry,
  CustomerReceipt,
  FulfilmentStage,
  MoneyDocType,
  ReceiptAllocation,
  ReceiptSource,
  RecurringBill,
  RecurringFrequency,
  RecurringScope,
  SalesContextFields,
  SalesCustomer,
  SalesDocument,
  SalesDocumentKind,
  SalesLine,
  SalesNotification,
  SalesReference,
  SalesReturn,
  SalesReturnLine,
  SalesState,
} from "./sales-types";

export type FieldErrors = Record<string, string>;

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const EPSILON = 0.004;

export function lineAmount(line: Pick<SalesLine, "qty" | "rate" | "tax">): number {
  return (Number(line.qty) || 0) * (Number(line.rate) || 0) * (1 + (Number(line.tax) || 0) / 100);
}

export function lineTotals(lines: readonly SalesLine[]) {
  let sub = 0;
  let tax = 0;
  for (const line of lines) {
    const net = (Number(line.qty) || 0) * (Number(line.rate) || 0);
    sub += net;
    tax += (net * (Number(line.tax) || 0)) / 100;
  }
  return { sub, tax, total: sub + tax };
}

export const documentTotal = (doc: SalesDocument) => lineTotals(doc.lines).total;

export function nextCode(prefix: string, codes: readonly string[]): string {
  let max = 0;
  for (const code of codes) {
    if (!String(code).startsWith(`${prefix}-`)) continue;
    const match = String(code).match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const findCustomer = (state: SalesState, id: string) => state.customers.find((customer) => customer.id === id);
export const findDocument = (state: SalesState, kind: SalesDocumentKind, code: string | undefined) =>
  code ? state[kind].find((doc) => doc.code === code) : undefined;
export const findMoneyDoc = (state: SalesState, code: string | undefined) => (code ? state.receipt.find((doc) => doc.code === code) : undefined);

export function customerLabel(state: SalesState, id: string): string {
  return findCustomer(state, id)?.display ?? "—";
}

export function deliveryAddress(customer: SalesCustomer | undefined): string {
  if (!customer) return "";
  return addressLines(shippingAddress(customer)).join(", ");
}

/* ------------------------------------------------------ money documents */

export const isPosted = (doc: CustomerReceipt) => doc.status === "Posted";
const allocTotal = (alloc: readonly ReceiptAllocation[]) => alloc.reduce((sum, item) => sum + item.amount, 0);
const allocFor = (alloc: readonly ReceiptAllocation[], invoiceCode: string) =>
  alloc.filter((item) => item.inv === invoiceCode).reduce((sum, item) => sum + item.amount, 0);

/** Posted returns made against a receipt or customer payment. */
export function returnsAgainst(state: SalesState, code: string, includeDrafts = false): CustomerReceipt[] {
  return state.receipt.filter((doc) => doc.against === code && (includeDrafts || isPosted(doc)));
}

/** Net amount a posted receipt still applies to one invoice, after return receipts. */
export function appliedTo(state: SalesState, receipt: CustomerReceipt, invoiceCode: string): number {
  if (receipt.type !== "Receipt") return 0;
  const reversed = returnsAgainst(state, receipt.code).reduce((sum, doc) => sum + allocFor(doc.alloc, invoiceCode), 0);
  return round2(allocFor(receipt.alloc, invoiceCode) - reversed);
}

/** Part of a receipt that is not allocated to any invoice (on account). */
export function unallocatedOf(state: SalesState, receipt: CustomerReceipt): number {
  if (receipt.type !== "Receipt") return 0;
  const fromAccount = returnsAgainst(state, receipt.code).reduce((sum, doc) => sum + (doc.amount - allocTotal(doc.alloc)), 0);
  return Math.max(0, round2(receipt.amount - allocTotal(receipt.alloc) - fromAccount));
}

/** Amount of a posted receipt or customer payment that can still be returned. */
export function returnableOf(state: SalesState, doc: CustomerReceipt): number {
  if (!isPosted(doc) || (doc.type !== "Receipt" && doc.type !== "Customer payment")) return 0;
  return Math.max(0, round2(doc.amount - returnsAgainst(state, doc.code).reduce((sum, item) => sum + item.amount, 0)));
}

/** Posted receipts that apply to an invoice, oldest first: its payment history. */
export function receiptsFor(state: SalesState, invoiceCode: string): CustomerReceipt[] {
  return state.receipt
    .filter((doc) => isPosted(doc) && doc.type === "Receipt" && doc.alloc.some((item) => item.inv === invoiceCode))
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/** Posted return receipts that reopened part of an invoice. */
export function reversalsFor(state: SalesState, invoiceCode: string): CustomerReceipt[] {
  return state.receipt.filter((doc) => isPosted(doc) && doc.type === "Return receipt" && doc.alloc.some((item) => item.inv === invoiceCode));
}

export function paidOn(state: SalesState, invoice: SalesDocument): number {
  let total = 0;
  for (const doc of state.receipt) {
    if (!isPosted(doc)) continue;
    if (doc.type === "Receipt") total += allocFor(doc.alloc, invoice.code);
    else if (doc.type === "Return receipt") total -= allocFor(doc.alloc, invoice.code);
  }
  return round2(total);
}

/* ---------------------------------------------------------- sales returns */

export const returnValue = (item: SalesReturn) => item.lines.reduce((sum, line) => sum + lineAmount(line), 0);

export function returnsFor(state: SalesState, invoiceCode: string): SalesReturn[] {
  return state.returns.filter((item) => item.invoice === invoiceCode);
}

/** Value of goods returned against an invoice, incl. sales tax. */
export function returnedOn(state: SalesState, invoice: SalesDocument): number {
  return round2(returnsFor(state, invoice.code).reduce((sum, item) => sum + returnValue(item), 0));
}

/** Quantity of one invoice line already returned. */
export function returnedQty(state: SalesState, invoiceCode: string, line: SalesLine): number {
  return returnsFor(state, invoiceCode).reduce(
    (sum, item) => sum + item.lines.filter((returned) => returned.sku === line.sku && returned.desc === line.desc).reduce((total, returned) => total + returned.qty, 0),
    0,
  );
}

export function invoiceBalance(state: SalesState, invoice: SalesDocument): number {
  return Math.max(0, round2(documentTotal(invoice) - paidOn(state, invoice) - returnedOn(state, invoice)));
}

/** Paid or returned above the invoice total: owed back to the customer. */
export function invoiceCredit(state: SalesState, invoice: SalesDocument): number {
  return Math.max(0, round2(paidOn(state, invoice) + returnedOn(state, invoice) - documentTotal(invoice)));
}

/** Recalculates Unpaid / Partially paid / Paid after money or a return changes an invoice. */
function syncInvoiceStatus(state: SalesState, invoiceCode: string, actor: string, note: string) {
  const invoice = findDocument(state, "invoice", invoiceCode);
  if (!invoice) return;
  const settled = paidOn(state, invoice) + returnedOn(state, invoice);
  const status = invoiceBalance(state, invoice) <= EPSILON ? "Paid" : settled > EPSILON ? "Partially paid" : "Unpaid";
  if (invoice.status !== status) setStatus(invoice, status, actor, note);
}

/** Unpaid invoices past their due date show as Overdue. */
export function displayStatus(doc: SalesDocument, today = todayIso()): string {
  if (doc.kind === "invoice" && doc.status !== "Paid" && doc.date2 && doc.date2 < today) return "Overdue";
  return doc.status;
}

/** Customer money held on account: unallocated receipts. */
export function onAccountCredit(state: SalesState, customerId: string): number {
  return round2(
    state.receipt
      .filter((doc) => doc.customerId === customerId && isPosted(doc) && doc.type === "Receipt")
      .reduce((sum, doc) => sum + toBase(unallocatedOf(state, doc), doc), 0),
  );
}

/** Opening balance, open orders not yet invoiced and unpaid invoice balances, in PKR. */
export function exposure(state: SalesState, customerId: string): number {
  let total = findCustomer(state, customerId)?.openingBalance ?? 0;
  for (const order of state.order) {
    if (order.customerId === customerId && order.status === "Confirmed" && !order.links.invoice) total += toBase(documentTotal(order), order);
  }
  for (const invoice of state.invoice) {
    if (invoice.customerId === customerId && invoice.status !== "Paid") total += toBase(invoiceBalance(state, invoice), invoice);
  }
  return total;
}

/** Unpaid invoices raised in Nexora, less money held on account, in PKR. */
export function invoicedBalance(state: SalesState, customerId: string): number {
  return state.invoice
    .filter((invoice) => invoice.customerId === customerId && invoice.status !== "Paid")
    .reduce((sum, invoice) => sum + toBase(invoiceBalance(state, invoice), invoice), 0) - onAccountCredit(state, customerId);
}

/** Outstanding receivable: opening balance carried in plus unpaid invoices, less money on account. */
export function openBalance(state: SalesState, customerId: string): number {
  return (findCustomer(state, customerId)?.openingBalance ?? 0) + invoicedBalance(state, customerId);
}

export interface CreditCheck {
  hold: boolean;
  over: boolean;
  limit: number;
  exposure: number;
  amount: number;
  overBy: number;
}

/** Credit check in PKR; `amount` is the PKR value of the new document. */
export function creditCheck(state: SalesState, customerId: string, amount: number): CreditCheck {
  const customer = findCustomer(state, customerId);
  const current = exposure(state, customerId);
  const limit = customer?.creditLimit ?? 0;
  const overBy = current + amount - limit;
  return { hold: onCreditHold(customer), over: limit > 0 && overBy > 0, limit, exposure: current, amount, overBy };
}

export type SalesActionId = "submitApproval" | "approveSelf" | "confirmOrder" | "confirm" | "delivery" | "createInvoice" | "recordReceipt";

export type NextAction =
  | { type: "action"; action: SalesActionId; label: string; text: string }
  | { type: "wait"; text: string; approval?: boolean }
  | { type: "stopped"; text: string }
  | { type: "done"; text: string; link?: { kind: SalesDocumentKind; code: string; label: string } };

/* ------------------------------------------------------ quotation approval */

/** Quotation statuses that can still be edited. */
export const EDITABLE_QUOTATION_STATUSES: readonly string[] = ["Draft", "Changes requested"];
/** Quotation statuses that Reset to Draft accepts. Ordered quotations stay as they are. */
export const RESETTABLE_QUOTATION_STATUSES: readonly string[] = ["Pending approval", "Approved", "Rejected", "Changes requested"];

/** The latest approval decision on a quotation, if any. */
export function latestDecision(doc: SalesDocument): ApprovalEntry | undefined {
  return [...(doc.approval ?? [])].reverse().find((entry) => entry.action !== "Submitted");
}

/** The latest submission for approval, if any. */
export function latestSubmission(doc: SalesDocument): ApprovalEntry | undefined {
  return [...(doc.approval ?? [])].reverse().find((entry) => entry.action === "Submitted");
}

/** "Imran Sheikh (CEO)": who acted and in what capacity. */
export function approverName(entry: ApprovalEntry): string {
  return entry.role ? `${entry.by} (${entry.role})` : entry.by;
}

/** The approval that let this quotation proceed; only set once it has been approved. */
export function approvalOf(doc: SalesDocument): ApprovalEntry | undefined {
  const decision = latestDecision(doc);
  return decision?.action === "Approved" && (doc.status === "Approved" || doc.status === "Ordered") ? decision : undefined;
}

/** Date part of an activity stamp, e.g. "21 Oct 2026" from "21 Oct 2026, 09:30". */
export const stampDate = (at: string) => at.split(",")[0] ?? at;

/** Short approval status for lists, e.g. "Approved by Imran Sheikh (CEO) · 21 Oct 2026". */
export function approvalSummary(doc: SalesDocument): string {
  if (doc.kind !== "quotation") return "";
  const approved = approvalOf(doc);
  if (approved) return `Approved by ${approverName(approved)} · ${stampDate(approved.at)}`;
  const decision = latestDecision(doc);
  if (doc.status === "Rejected" && decision) return `Rejected by ${approverName(decision)}`;
  if (doc.status === "Changes requested" && decision) return `Changes requested by ${approverName(decision)}`;
  if (doc.status === "Pending approval") return `Waiting for ${doc.approver || "the approver"}`;
  return doc.approver ? `Approver: ${doc.approver} · not submitted` : "No approver · approve it yourself";
}

/** A reason is needed only to reject or send back; approving takes no reason field. */
export const decisionNeedsNote = (decision: ApprovalDecision) => decision !== "Approved";

/** Person who created a quotation: the one who first saved it. */
export function quotationCreator(doc: SalesDocument): string {
  return doc.history.find((entry) => entry.step === "Saved")?.by ?? doc.owner;
}

/** True when the signed-in user is the quotation's named approver. */
export const isApproverOf = (doc: SalesDocument, actor: string) => samePerson(doc.approver, actor);

function notify(state: SalesState, notification: Omit<SalesNotification, "id" | "at" | "read">) {
  state.notifications.unshift({ ...notification, id: uid(), at: stamp(), read: false });
}

/** Why a quotation cannot be approved right now, or "" if it can. */
export function approvalBlocker(state: SalesState, doc: SalesDocument): string {
  const customer = findCustomer(state, doc.customerId);
  return customer && onCreditHold(customer)
    ? `${customer.display} is ${customer.creditStatus.toLowerCase()}. Change the customer's credit status before approving.`
    : "";
}

/** Sends a draft quotation (or one sent back for changes) to its named approver. */
export function submitQuotation(state: SalesState, code: string, actor: string, note = "") {
  const quotation = findDocument(state, "quotation", code);
  if (!quotation || !EDITABLE_QUOTATION_STATUSES.includes(quotation.status))
    throw new Error(`${code} cannot be submitted for approval.`);
  if (!quotation.approver?.trim()) throw new Error("Choose an approver first, or approve the quotation yourself.");
  const resubmitted = quotation.status === "Changes requested";
  quotation.approval = [...(quotation.approval ?? []), { action: "Submitted", by: actor, role: "", at: stamp(), note: note.trim() }];
  setStatus(quotation, "Pending approval", actor, `${resubmitted ? "Resubmitted" : "Submitted"} to ${quotation.approver}`);
  notify(state, {
    to: quotation.approver,
    code,
    title: `${code} waiting for your approval`,
    message: `${actor} sent quotation ${code} for ${customerLabel(state, quotation.customerId)} (${docMoney(documentTotal(quotation), quotation)}) for your approval.`,
    tone: "info",
  });
}

/** No approver chosen: the creator approves the quotation. */
export function approveOwnQuotation(state: SalesState, code: string, actor: string) {
  const quotation = findDocument(state, "quotation", code);
  if (!quotation || !EDITABLE_QUOTATION_STATUSES.includes(quotation.status)) throw new Error(`${code} cannot be approved now.`);
  if (quotation.approver?.trim() && !samePerson(quotation.approver, actor))
    throw new Error(`${code} has ${quotation.approver} as approver. Submit it for approval instead.`);
  const blocker = approvalBlocker(state, quotation);
  if (blocker) throw new Error(blocker);
  const entry: ApprovalEntry = { action: "Approved", by: actor, role: "Self-approved", at: stamp(), note: "" };
  quotation.approval = [...(quotation.approval ?? []), entry];
  setStatus(quotation, "Approved", actor, "Approved by the creator, no approver needed");
}

/**
 * Records the named approver's decision. Approving only approves the price:
 * Confirm Order is a separate step once the customer orders. The creator is
 * notified of every decision. A note is required only to reject or send back.
 */
export function decideQuotation(
  state: SalesState,
  code: string,
  decision: ApprovalDecision,
  actor: string,
  note = "",
  role = approverTitle(actor),
) {
  const quotation = findDocument(state, "quotation", code);
  if (!quotation || quotation.status !== "Pending approval") throw new Error(`${code} is not waiting for approval.`);
  if (!samePerson(quotation.approver, actor)) throw new Error(`Only ${quotation.approver || "the named approver"} can decide on ${code}.`);
  if (decisionNeedsNote(decision) && !note.trim()) throw new Error("Add a reason explaining the decision.");
  if (decision === "Approved") {
    const blocker = approvalBlocker(state, quotation);
    if (blocker) throw new Error(blocker);
  }
  const entry: ApprovalEntry = { action: decision, by: actor, role: role.trim(), at: stamp(), note: decisionNeedsNote(decision) ? note.trim() : "" };
  quotation.approval = [...(quotation.approval ?? []), entry];
  setStatus(quotation, decision, actor, [`By ${approverName(entry)}`, entry.note].filter(Boolean).join(" · "));
  const by = `${approverName(entry)} on ${stampDate(entry.at)}`;
  notify(state, {
    to: quotationCreator(quotation),
    code,
    ...(decision === "Approved"
      ? { title: `${code} approved`, message: `Approved by ${by}. Open it and click Confirm Order when the customer orders.`, tone: "success" as const }
      : decision === "Rejected"
        ? { title: `${code} rejected`, message: `Rejected by ${by}: ${entry.note}`, tone: "danger" as const }
        : { title: `Changes requested on ${code}`, message: `${by} asked for changes: ${entry.note}`, tone: "warning" as const }),
  });
}

/** Approved, rejected, returned or pending quotation → Draft, so it can be edited or deleted. */
export function resetQuotationToDraft(state: SalesState, code: string, actor: string) {
  const quotation = findDocument(state, "quotation", code);
  if (!quotation || !RESETTABLE_QUOTATION_STATUSES.includes(quotation.status))
    throw new Error(quotation?.status === "Ordered" ? `${code} is already a sales order and cannot go back to draft.` : `${code} cannot be reset to draft.`);
  setStatus(quotation, "Draft", actor, `Reset from ${quotation.status}`);
}

/** Only draft quotations can be deleted. */
export function deleteQuotation(state: SalesState, code: string) {
  const index = state.quotation.findIndex((doc) => doc.code === code);
  if (index < 0) throw new Error(`${code} no longer exists.`);
  if (state.quotation[index].status !== "Draft") throw new Error(`Only draft quotations can be deleted. Reset ${code} to draft first.`);
  state.quotation.splice(index, 1);
  state.notifications = state.notifications.filter((item) => item.code !== code);
}

/** Only draft sales orders can be deleted. */
export function deleteOrder(state: SalesState, code: string) {
  const index = state.order.findIndex((doc) => doc.code === code);
  if (index < 0) throw new Error(`${code} no longer exists.`);
  if (state.order[index].status !== "Draft") throw new Error("Only draft sales orders can be deleted.");
  state.order.splice(index, 1);
}

/* ------------------------------------------------------------ fulfilment */

/** Fulfilment progress of a sales order. Drafts have not started. */
export function fulfilmentStage(order: SalesDocument): FulfilmentStage {
  if (order.links.invoice) return "Invoiced";
  if (order.delivery) return "Delivered";
  return "Not started";
}

/** Exactly one next action per state. */
export function nextActionFor(state: SalesState, doc: SalesDocument): NextAction {
  if (doc.kind === "quotation") {
    const decision = latestDecision(doc);
    if (doc.status === "Draft" || doc.status === "Changes requested") {
      const sentBack = doc.status === "Changes requested" && decision ? `${approverName(decision)} asked for changes: "${decision.note}". ` : "";
      return doc.approver?.trim()
        ? {
            type: "action",
            action: "submitApproval",
            label: doc.status === "Draft" ? "Submit for Approval" : "Resubmit for Approval",
            text: `${sentBack}Sends this quotation to ${doc.approver} for approval.`,
          }
        : {
            type: "action",
            action: "approveSelf",
            label: "Approve",
            text: `${sentBack}No approver is selected, so you approve this quotation yourself. Edit it to choose an approver instead.`,
          };
    }
    if (doc.status === "Pending approval")
      return { type: "wait", approval: true, text: `Waiting for ${doc.approver || "the approver"} to approve, reject or request changes.` };
    if (doc.status === "Rejected")
      return {
        type: "stopped",
        text: `Rejected by ${decision ? `${approverName(decision)}${decision.note ? `: "${decision.note}"` : ""}` : "the approver"}. Reset it to draft to change and resend it, or create a new quotation.`,
      };
    if (doc.status === "Approved")
      return { type: "action", action: "confirmOrder", label: "Confirm Order", text: "The price is approved. When the customer accepts it, Confirm Order creates the confirmed sales order. No further approval is needed." };
    return {
      type: "done",
      text: `Order confirmed as sales order ${doc.links.order}.`,
      link: doc.links.order ? { kind: "order", code: doc.links.order, label: "Open sales order" } : undefined,
    };
  }
  if (doc.kind === "order") {
    if (doc.status === "Draft")
      return { type: "action", action: "confirm", label: "Confirm Order", text: "Confirms this direct order. It then appears in Delivery." };
    const stage = fulfilmentStage(doc);
    if (stage === "Not started")
      return { type: "action", action: "delivery", label: "Delivery", text: "Record the delivery details and confirm the delivery from one panel." };
    if (stage === "Delivered")
      return { type: "action", action: "createInvoice", label: "Create Invoice", text: "Delivered. Opens the invoice form prefilled from this order; review and edit it, then save." };
    return {
      type: "done",
      text: `Invoiced as ${doc.links.invoice}.`,
      link: doc.links.invoice ? { kind: "invoice", code: doc.links.invoice, label: "Open invoice" } : undefined,
    };
  }
  if (doc.status !== "Paid") {
    const overdue = displayStatus(doc) === "Overdue" ? " and the due date has passed" : "";
    return {
      type: "action",
      action: "recordReceipt",
      label: "Receive Payment",
      text: `${docMoney(invoiceBalance(state, doc), doc)} is still due${overdue}. Record the payment in Receipts.`,
    };
  }
  return { type: "done", text: "Fully paid." };
}

/** Short label for the list "Next action" column. */
export function listNextAction(state: SalesState, doc: SalesDocument): string {
  const next = nextActionFor(state, doc);
  return next.type === "action" ? next.label : next.type === "wait" ? `Waiting for ${doc.approver || "approver"}` : "";
}

export interface QuotationStage {
  key: "quotation" | "approval" | "pack" | "delivery" | "invoice" | "payment";
  label: string;
  /** Status shown on the stage, e.g. Approved, Delivered, Not started. */
  status: string;
  state: "done" | "current" | "waiting" | "blocked";
  code?: string;
  details: [string, string][];
}

/** The complete workflow for one quotation, from quotation to payment history. */
export function quotationStages(state: SalesState, quotation: SalesDocument): QuotationStage[] {
  const { order, invoice } = documentChain(state, quotation);
  const customer = findCustomer(state, quotation.customerId);
  const submission = latestSubmission(quotation);
  const decision = latestDecision(quotation);
  const approved = approvalOf(quotation);
  const blocked = quotation.status === "Rejected";
  const later = (ready: boolean, readyLabel: string) =>
    ({ status: blocked ? "Not applicable" : ready ? readyLabel : "Not started", state: blocked ? "blocked" : ready ? "current" : "waiting" }) as const;

  let approvalStage: QuotationStage;
  if (approved) {
    approvalStage = {
      key: "approval", label: "Approval", status: "Approved", state: "done",
      details: [
        ["Approved by", approverName(approved)],
        ["Approved on", approved.at],
        ["Order", order ? `${order.code} · confirmed` : "Next: Confirm Order"],
      ],
    };
  } else if (quotation.status === "Pending approval") {
    approvalStage = {
      key: "approval", label: "Approval", status: "Pending approval", state: "current",
      details: [["Approver", quotation.approver || "—"], ["Submitted by", submission?.by ?? "—"], ["Submitted on", submission?.at ?? "—"]],
    };
  } else if (decision && (quotation.status === "Rejected" || quotation.status === "Changes requested")) {
    approvalStage = {
      key: "approval", label: "Approval", status: quotation.status, state: blocked ? "blocked" : "current",
      details: [["Decided by", approverName(decision)], ["Decided on", decision.at], ["Reason", decision.note || "—"]],
    };
  } else {
    approvalStage = {
      key: "approval", label: "Approval", status: "Not submitted", state: "current",
      details: [["Approver", quotation.approver || "None · approve it yourself"], ["Next", quotation.approver ? "Submit for Approval" : "Approve"]],
    };
  }

  const confirmed = order?.status === "Confirmed";
  const deliveryStage: QuotationStage = order?.delivery
    ? {
        key: "delivery", label: "Delivery", status: "Delivered", state: "done", code: order.delivery.no,
        details: [
          ["Delivered on", formatDate(order.delivery.date)],
          ["Received by", order.delivery.receivedBy || "—"],
          ["Recorded by", order.delivery.by],
        ],
      }
    : {
        key: "delivery", label: "Delivery", ...later(confirmed, "Ready to deliver"),
        details: order ? [["Planned", formatDate(order.date2)], ["Ship to", deliveryAddress(customer) || "—"]] : [],
      };

  const invoiceStage: QuotationStage = invoice
    ? {
        key: "invoice", label: "Invoice", status: "Issued", state: "done", code: invoice.code,
        details: [["Issued", formatDate(invoice.date)], ["Due", formatDate(invoice.date2)], ["Total", docMoney(documentTotal(invoice), invoice)]],
      }
    : { key: "invoice", label: "Invoice", ...later(Boolean(order?.delivery), "Ready to invoice"), details: [] };

  const receipts = invoice ? receiptsFor(state, invoice.code) : [];
  const paymentStage: QuotationStage = invoice
    ? {
        key: "payment", label: "Payment", status: displayStatus(invoice), state: invoice.status === "Paid" ? "done" : "current", code: invoice.code,
        details: [
          ["Received", docMoney(paidOn(state, invoice), invoice)],
          ["Balance due", docMoney(invoiceBalance(state, invoice), invoice)],
          ["Receipts", receipts.length ? receipts.map((receipt) => `${receipt.code} · ${formatDate(receipt.date)}`).join(", ") : "None yet"],
        ],
      }
    : { key: "payment", label: "Payment", ...later(false, ""), details: [] };

  return [
    {
      key: "quotation", label: "Quotation", status: quotation.status === "Draft" ? "Draft" : "Saved", state: "done", code: quotation.code,
      details: [
        ["Customer", customer?.display ?? "—"],
        ["Created by", quotationCreator(quotation)],
        ["Date", formatDate(quotation.date)],
        ["Total", docMoney(documentTotal(quotation), quotation)],
      ],
    },
    approvalStage,
    deliveryStage,
    invoiceStage,
    paymentStage,
  ];
}

export function documentChain(state: SalesState, doc: SalesDocument) {
  let quotation: SalesDocument | undefined;
  let order: SalesDocument | undefined;
  let invoice: SalesDocument | undefined;
  if (doc.kind === "quotation") {
    quotation = doc;
    order = findDocument(state, "order", doc.links.order);
  } else if (doc.kind === "order") {
    order = doc;
    quotation = findDocument(state, "quotation", doc.links.quotation);
  } else {
    invoice = doc;
    order = findDocument(state, "order", doc.links.order);
    quotation = order ? findDocument(state, "quotation", order.links.quotation) : undefined;
  }
  if (order && !invoice) invoice = findDocument(state, "invoice", order.links.invoice);
  return { quotation, order, invoice };
}

export function historyTime(doc: { history: { step: string; at: string }[] } | undefined, step: string): string {
  if (!doc) return "";
  return [...doc.history].reverse().find((entry) => entry.step === step)?.at ?? "";
}

function log(doc: { history: SalesDocument["history"] }, step: string, actor: string, note = "") {
  doc.history.push({ step, at: stamp(), by: actor, note });
}

function setStatus(doc: SalesDocument, status: SalesDocument["status"], actor: string, note = "") {
  doc.status = status;
  log(doc, status, actor, note);
}

/* ------------------------------------- project and location (required) */

/**
 * Every Sales transaction needs a Project and a Location (12 Nov 2026). The
 * forms check this, and every save, post and one-click action checks it again
 * here, so no path creates a transaction without both. Mock only: the live
 * Sales API must re-validate that both are active masters of the company.
 */
export function contextErrors(value: SalesContextFields | undefined): FieldErrors {
  const errors: FieldErrors = {};
  if (!value?.project?.id) errors.project = "Select a project.";
  if (!value?.location?.id) errors.location = "Select a location.";
  return errors;
}

export const hasContext = (value: SalesContextFields | undefined) => Object.keys(contextErrors(value)).length === 0;

/** Copies a record's project and location (only the ones it has). */
export function contextOf(value: SalesContextFields | undefined): SalesContextFields {
  return {
    ...(value?.project ? { project: { ...value.project } } : {}),
    ...(value?.location ? { location: { ...value.location } } : {}),
  };
}

/** Throws unless both are set; returns copies of them. */
function requireContext(value: SalesContextFields | undefined, what: string): Required<SalesContextFields> {
  if (!value?.project?.id || !value.location?.id) throw new Error(`Select a project and a location for ${what} first.`);
  return { project: { ...value.project }, location: { ...value.location } };
}

export const referenceLabel = (reference: SalesReference | undefined) => (reference ? `${reference.code} · ${reference.name}` : "");

/* ---------------------------------------------------------------- drafts */

export function blankLine(): SalesLine {
  return { sku: "", desc: "", qty: 1, rate: 0, tax: 18, uom: "Each" };
}

export function newDocumentDraft(state: SalesState, kind: SalesDocumentKind, customerId = ""): SalesDocument {
  const meta = SALES_KINDS[kind];
  const customer = findCustomer(state, customerId);
  const today = todayIso();
  const terms = documentTermsFor(customer);
  return {
    id: "",
    code: "",
    kind,
    customerId: customer ? customer.id : "",
    owner: customer?.salesperson ?? "",
    date: today,
    date2: addDays(today, kind === "invoice" ? (SALES_TERM_DAYS[terms] ?? 30) : meta.date2Days),
    terms,
    reference: "",
    warehouse: SALES_WAREHOUSES[0],
    ...currencyDefaults(customer?.currency),
    lines: [blankLine()],
    notes: "",
    status: kind === "invoice" ? "Unpaid" : "Draft",
    links: {},
    ...(kind === "quotation" ? { approver: "" } : {}),
    history: [],
  };
}

export function validateDocument(draft: SalesDocument): FieldErrors {
  const meta = SALES_KINDS[draft.kind];
  const errors: FieldErrors = contextErrors(draft);
  if (!draft.customerId) errors.customerId = "Select a customer.";
  if (!draft.date) errors.date = "Enter the date.";
  if (draft.date && draft.date2 && draft.date2 < draft.date)
    errors.date2 = `${meta.date2} cannot be before the ${meta.date1.toLowerCase()}.`;
  const rateError = fxRateError(draft);
  if (rateError) errors.fxRate = rateError;
  const usable = draft.lines.filter((item) => item.desc.trim() && Number(item.qty) > 0);
  if (!usable.length) errors.lines = "Add at least one line with a description and a quantity above zero.";
  else if (usable.some((item) => !(Number(item.rate) > 0))) errors.lines = "Every line needs a rate above zero.";
  return errors;
}

/** Saves a new or edited quotation, order or invoice. Returns the saved code. */
export function saveDocument(state: SalesState, draft: SalesDocument, actor: string): string {
  const meta = SALES_KINDS[draft.kind];
  const context = requireContext(draft, draft.code || `this ${meta.label.toLowerCase()}`);
  const lines = draft.lines.filter((item) => item.desc.trim() && Number(item.qty) > 0);
  const list = state[draft.kind];
  const approver = draft.kind === "quotation" ? (draft.approver ?? "").trim() : undefined;
  if (!draft.code) {
    const doc: SalesDocument = {
      ...draft,
      ...normalizeCurrency(draft),
      ...context,
      lines,
      id: uid(),
      code: nextCode(meta.prefix, list.map((item) => item.code)),
      owner: draft.owner || actor,
      ...(draft.kind === "quotation" ? { approver } : {}),
      history: [],
    };
    if (doc.kind === "invoice") {
      doc.status = "Unpaid";
      if (doc.links.order) linkInvoiceToOrder(state, doc, actor);
      if (doc.links.recurring) markRecurringBilled(state, doc, actor);
      log(
        doc,
        "Issued",
        actor,
        doc.links.order
          ? `From ${doc.links.order}${doc.links.quotation ? ` · ${doc.links.quotation}` : ""}`
          : doc.links.recurring
            ? `From ${doc.links.recurring}`
            : "",
      );
    } else {
      doc.status = "Draft";
      log(doc, "Saved", actor, approver ? `Approver: ${approver}` : "");
    }
    list.push(doc);
    return doc.code;
  }
  const index = list.findIndex((item) => item.code === draft.code);
  if (index < 0) throw new Error(`${draft.code} no longer exists.`);
  const current = list[index];
  const editable = draft.kind === "quotation" ? EDITABLE_QUOTATION_STATUSES.includes(current.status) : current.status === "Draft";
  if (!editable) throw new Error(`${draft.code} can no longer be edited. Reset it to draft first.`);
  // Status, links and approval history come from the stored record, never from the form copy.
  const updated: SalesDocument = {
    ...draft,
    ...normalizeCurrency(draft),
    ...context,
    lines,
    status: current.status,
    links: current.links,
    approval: current.approval,
    ...(draft.kind === "quotation" ? { approver } : {}),
    history: [...current.history],
  };
  log(updated, "Edited", actor, approver !== undefined && approver !== (current.approver ?? "") ? `Approver: ${approver || "none"}` : "");
  list[index] = updated;
  return updated.code;
}

/* ------------------------------------------------------------ the actions */

/**
 * Confirm Order on an approved quotation: creates the confirmed sales order. No
 * approval. The order takes the quotation's project and location; a quotation
 * saved before they were required needs them passed in (chosen by the user).
 */
export function confirmQuotation(state: SalesState, code: string, actor: string, chosen?: SalesContextFields): string {
  const quotation = findDocument(state, "quotation", code);
  if (!quotation || quotation.status !== "Approved") throw new Error(`${code} must be approved before the order is confirmed.`);
  const context = requireContext(hasContext(quotation) ? quotation : chosen, "the sales order");
  const customer = findCustomer(state, quotation.customerId);
  if (customer && onCreditHold(customer))
    throw new Error(`${customer.display} is ${customer.creditStatus.toLowerCase()}. Change the customer's credit status first.`);
  const today = todayIso();
  const order: SalesDocument = {
    ...structuredClone(quotation),
    id: uid(),
    code: nextCode("SO", state.order.map((item) => item.code)),
    kind: "order",
    date: today,
    date2: addDays(today, SALES_KINDS.order.date2Days),
    warehouse: SALES_WAREHOUSES[0],
    ...context,
    status: "Confirmed",
    links: { quotation: quotation.code },
    approver: undefined,
    approval: undefined,
    history: [],
  };
  const approved = latestDecision(quotation);
  log(order, "Confirmed", actor, `From ${quotation.code}${approved ? ` · approved by ${approverName(approved)}` : ""}`);
  state.order.push(order);
  quotation.links.order = order.code;
  setStatus(quotation, "Ordered", actor, `Order confirmed as ${order.code}`);
  return order.code;
}

/** Direct sales orders (not from a quotation) are confirmed without any approval. */
export function confirmOrder(state: SalesState, code: string, actor: string) {
  const order = findDocument(state, "order", code);
  if (!order || order.status !== "Draft") throw new Error(`${code} cannot be confirmed.`);
  requireContext(order, code);
  const customer = findCustomer(state, order.customerId);
  if (customer && onCreditHold(customer))
    throw new Error(`${customer.display} is ${customer.creditStatus.toLowerCase()}. Change the customer's credit status first.`);
  setStatus(order, "Confirmed", actor);
}

export function nextDeliveryNumber(state: SalesState): string {
  return nextCode("DLV", state.order.flatMap((order) => (order.delivery ? [order.delivery.no] : [])));
}

export interface DeliveryInput extends SalesContextFields {
  date: string;
  warehouse: string;
  receivedBy: string;
  notes: string;
}

/** Confirmed → delivered. Items are delivered directly; no pick & pack or approval is needed. */
export function recordDelivery(state: SalesState, code: string, actor: string, input: DeliveryInput): string {
  const order = findDocument(state, "order", code);
  if (!order || order.status !== "Confirmed" || order.delivery) throw new Error(`${code} is not ready for delivery.`);
  if (!input.date) throw new Error("Enter the delivery date.");
  const context = requireContext(input, "the delivery");
  const no = nextDeliveryNumber(state);
  order.delivery = { no, ...input, ...context, receivedBy: input.receivedBy.trim(), notes: input.notes.trim(), at: stamp(), by: actor };
  log(order, "Delivered", actor, `Delivery ${no}`);
  return no;
}

/** Throws unless the order is delivered and not yet invoiced. */
function invoiceableOrder(state: SalesState, code: string | undefined): SalesDocument {
  const order = findDocument(state, "order", code);
  if (!order || order.status !== "Confirmed" || !order.delivery || order.links.invoice) throw new Error(`${code ?? "The order"} is not ready to invoice.`);
  return order;
}

/**
 * Delivered → invoice draft. Copies the order's customer, terms, lines,
 * reference, salesperson and notes into an unsaved invoice that the invoice
 * form opens for editing. Nothing is stored until saveDocument runs.
 */
export function invoiceDraftFromOrder(state: SalesState, code: string, actor: string): SalesDocument {
  const order = invoiceableOrder(state, code);
  const today = todayIso();
  return {
    ...structuredClone(order),
    id: "",
    code: "",
    kind: "invoice",
    owner: order.owner || actor,
    date: today,
    date2: addDays(today, SALES_TERM_DAYS[order.terms] ?? 30),
    status: "Unpaid",
    links: { order: order.code, ...(order.links.quotation ? { quotation: order.links.quotation } : {}) },
    ...contextOf(hasContext(order) ? order : order.delivery),
    delivery: undefined,
    approver: undefined,
    approval: undefined,
    history: [],
  };
}

/** Links a newly saved invoice back to its order and quotation. */
function linkInvoiceToOrder(state: SalesState, invoice: SalesDocument, actor: string) {
  const order = invoiceableOrder(state, invoice.links.order);
  if (order.customerId !== invoice.customerId) throw new Error(`The invoice customer must match ${order.code}.`);
  if (docCurrency(order) !== docCurrency(invoice)) throw new Error(`The invoice currency must match ${order.code} (${docCurrency(order)}).`);
  order.links.invoice = invoice.code;
  log(order, "Invoiced", actor, `Invoice ${invoice.code}`);
  const quotation = findDocument(state, "quotation", order.links.quotation);
  if (quotation) quotation.links.invoice = invoice.code;
}

/** Delivered → invoiced in one step, with the order's values unchanged. */
export function createInvoiceFromOrder(state: SalesState, code: string, actor: string): string {
  return saveDocument(state, invoiceDraftFromOrder(state, code, actor), actor);
}

/* ------------------------------------------------- receipts and payments */

/** Invoices that can still take a receipt, oldest due date first; optionally only those in one currency. */
export function openInvoices(state: SalesState, customerId?: string, currency?: string): SalesDocument[] {
  return state.invoice
    .filter((invoice) => (!customerId || invoice.customerId === customerId) && (!currency || docCurrency(invoice) === currency) && invoiceBalance(state, invoice) > EPSILON)
    .sort((a, b) => a.date2.localeCompare(b.date2) || a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/** Receipt source shown in lists; records saved before sources existed came from an invoice. */
export const receiptSource = (receipt: CustomerReceipt): ReceiptSource => receipt.source ?? "Invoice";

export interface MoneyInput extends SalesContextFields {
  type: MoneyDocType;
  customerId: string;
  date: string;
  method: string;
  account: string;
  reference: string;
  /** ISO 4217 currency of the amount; receipts allocate only to invoices in this currency. */
  currency: string;
  /** PKR per 1 unit of currency (1 for PKR). */
  fxRate: number;
  amount: number;
  /** Receipt only: amount allocated to each outstanding invoice. */
  alloc: ReceiptAllocation[];
  /** Returns only: the receipt or customer payment being returned. */
  against: string;
  /** Customer payment only. */
  purpose: string;
  note: string;
}

export function newMoneyInput(type: MoneyDocType, customerId = "", currency?: string, context?: SalesContextFields): MoneyInput {
  return {
    ...currencyDefaults(currency),
    ...contextOf(context),
    type,
    customerId,
    date: todayIso(),
    method: RECEIPT_METHODS[0],
    account: RECEIPT_ACCOUNTS[0],
    reference: "",
    amount: 0,
    alloc: [],
    against: "",
    purpose: type === "Customer payment" ? "Security deposit" : "",
    note: "",
  };
}

export function moneyInputFrom(doc: CustomerReceipt): MoneyInput {
  return {
    type: doc.type,
    customerId: doc.customerId,
    date: doc.date,
    method: doc.method,
    account: doc.account,
    reference: doc.reference,
    ...normalizeCurrency(doc),
    ...contextOf(doc),
    amount: doc.amount,
    alloc: doc.type === "Receipt" ? doc.alloc.map((item) => ({ ...item })) : [],
    against: doc.against ?? "",
    purpose: doc.purpose ?? "",
    note: doc.note ?? "",
  };
}

/** Allocates an amount to a customer's outstanding invoices in the same currency, oldest due first. */
export function autoAllocate(state: SalesState, customerId: string, amount: number, currency = BASE_CURRENCY): ReceiptAllocation[] {
  let left = round2(amount);
  const alloc: ReceiptAllocation[] = [];
  for (const invoice of openInvoices(state, customerId, currency)) {
    if (left <= EPSILON) break;
    const take = Math.min(left, invoiceBalance(state, invoice));
    if (take > EPSILON) {
      alloc.push({ inv: invoice.code, amount: round2(take) });
      left = round2(left - take);
    }
  }
  return alloc;
}

/**
 * How a return receipt reverses a receipt: first from its on-account part,
 * then from its invoice allocations, newest allocation first.
 */
export function reversalPlan(state: SalesState, receipt: CustomerReceipt, amount: number): { fromAccount: number; alloc: ReceiptAllocation[] } {
  let left = round2(amount);
  const fromAccount = Math.min(left, unallocatedOf(state, receipt));
  left = round2(left - fromAccount);
  const alloc: ReceiptAllocation[] = [];
  for (const item of [...receipt.alloc].reverse()) {
    if (left <= EPSILON) break;
    const net = appliedTo(state, receipt, item.inv) - allocFor(alloc, item.inv);
    const take = Math.min(left, net);
    if (take > EPSILON) {
      alloc.push({ inv: item.inv, amount: round2(take) });
      left = round2(left - take);
    }
  }
  return { fromAccount: round2(fromAccount), alloc };
}

/** Receipts and customer payments of a customer that can still be returned. */
export function returnableDocs(state: SalesState, type: "Return receipt" | "Return payment", customerId: string): CustomerReceipt[] {
  const source: MoneyDocType = type === "Return receipt" ? "Receipt" : "Customer payment";
  return state.receipt.filter((doc) => doc.customerId === customerId && doc.type === source && returnableOf(state, doc) > EPSILON);
}

export function validateMoney(state: SalesState, input: MoneyInput): FieldErrors {
  const errors: FieldErrors = contextErrors(input);
  const amount = round2(input.amount);
  if (!input.customerId) errors.customerId = "Choose the customer.";
  if (!input.date) errors.date = "Enter the date.";
  if (!input.method) errors.method = "Choose the payment method.";
  if (input.method !== "Cash" && !input.reference.trim()) errors.reference = "Enter the cheque number or transaction reference.";
  if (!(amount > 0)) errors.amount = "Enter an amount above zero.";
  const rateError = fxRateError(input);
  if (rateError) errors.fxRate = rateError;
  const fmt = (value: number) => money(value, input.currency);
  if (input.type === "Receipt") {
    let allocated = 0;
    for (const item of input.alloc) {
      const value = round2(item.amount);
      if (value < 0) errors[`alloc.${item.inv}`] = "Cannot be negative.";
      if (value <= 0) continue;
      const invoice = findDocument(state, "invoice", item.inv);
      if (!invoice || invoice.customerId !== input.customerId) errors[`alloc.${item.inv}`] = "This invoice is not this customer's.";
      else if (docCurrency(invoice) !== input.currency) errors[`alloc.${item.inv}`] = `${invoice.code} is in ${docCurrency(invoice)}; this receipt is in ${input.currency}.`;
      else if (value > invoiceBalance(state, invoice) + EPSILON) errors[`alloc.${item.inv}`] = `Only ${fmt(invoiceBalance(state, invoice))} is due.`;
      allocated += value;
    }
    if (amount > 0 && allocated > amount + EPSILON) errors.alloc = `Allocated ${fmt(allocated)} is more than the ${fmt(amount)} received.`;
  }
  if (input.type === "Customer payment" && !input.purpose.trim()) errors.purpose = "Choose what the payment is for.";
  if (input.type === "Return receipt" || input.type === "Return payment") {
    const original = findMoneyDoc(state, input.against);
    const source: MoneyDocType = input.type === "Return receipt" ? "Receipt" : "Customer payment";
    if (!original || original.type !== source || original.customerId !== input.customerId || !isPosted(original))
      errors.against = `Choose the posted ${source.toLowerCase()} being returned.`;
    else if (docCurrency(original) !== input.currency) errors.currency = `${original.code} is in ${docCurrency(original)}; a return uses the same currency.`;
    else if (amount > returnableOf(state, original) + EPSILON) errors.amount = `Only ${fmt(returnableOf(state, original))} of ${original.code} can be returned.`;
    if (!input.note.trim()) errors.note = "Enter the reason for the return.";
  }
  return errors;
}

/** Same customer, type and amount with the same reference or date: probably entered twice. */
export function possibleDuplicates(state: SalesState, doc: CustomerReceipt): CustomerReceipt[] {
  return state.receipt.filter(
    (other) =>
      other.code !== doc.code &&
      other.type === doc.type &&
      other.customerId === doc.customerId &&
      Math.abs(other.amount - doc.amount) < 0.01 &&
      ((doc.reference && other.reference.trim().toLowerCase() === doc.reference.trim().toLowerCase()) || other.date === doc.date),
  );
}

function syncFor(state: SalesState, doc: CustomerReceipt, actor: string, note: string) {
  for (const code of new Set(doc.alloc.map((item) => item.inv))) syncInvoiceStatus(state, code, actor, note);
}

/** Checks posting rules against the current balances and fills a return receipt's reversal. */
function preparePosting(state: SalesState, doc: CustomerReceipt) {
  const errors = validateMoney(state, moneyInputFrom(doc));
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (doc.type === "Return receipt") {
    const original = findMoneyDoc(state, doc.against);
    if (original) doc.alloc = reversalPlan(state, original, doc.amount).alloc;
  }
}

/**
 * Saves a receipt, customer payment or return as Draft or Posted. Drafts have
 * no effect on balances; posting applies allocations and updates invoice
 * statuses. Editing is allowed only while the document is a draft.
 */
export function saveMoneyDoc(
  state: SalesState,
  input: MoneyInput,
  actor: string,
  options: { post: boolean; source?: ReceiptSource; code?: string },
): string {
  const meta = moneyDocMeta(input.type);
  const errors = validateMoney(state, input);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const alloc = input.type === "Receipt" ? input.alloc.filter((item) => round2(item.amount) > 0).map((item) => ({ inv: item.inv, amount: round2(item.amount) })) : [];
  const fields = {
    type: input.type,
    customerId: input.customerId,
    date: input.date,
    method: input.method,
    account: input.method === "Cash" ? "Cash in hand" : input.account,
    reference: input.reference.trim(),
    ...normalizeCurrency(input),
    ...requireContext(input, `this ${meta.label.toLowerCase()}`),
    amount: round2(input.amount),
    alloc,
    against: input.type === "Return receipt" || input.type === "Return payment" ? input.against : undefined,
    purpose: input.type === "Customer payment" ? input.purpose.trim() : undefined,
    note: input.note.trim(),
  };
  let doc: CustomerReceipt;
  if (options.code) {
    const existing = findMoneyDoc(state, options.code);
    if (!existing) throw new Error(`${options.code} no longer exists.`);
    if (existing.status !== "Draft") throw new Error(`${options.code} is posted. Reset it to draft before editing.`);
    Object.assign(existing, fields);
    log(existing, "Edited", actor);
    doc = existing;
  } else {
    doc = {
      id: uid(),
      code: nextCode(meta.prefix, state.receipt.map((item) => item.code)),
      owner: actor,
      status: "Draft",
      source: options.source ?? "Manual",
      history: [],
      ...fields,
    };
    log(doc, "Saved as draft", actor, fields.against ? `Against ${fields.against}` : "");
    state.receipt.push(doc);
  }
  if (options.post) postMoneyDoc(state, doc.code, actor);
  return doc.code;
}

/** Draft → Posted: allocations and returns start counting in invoice balances. */
export function postMoneyDoc(state: SalesState, code: string, actor: string) {
  const doc = findMoneyDoc(state, code);
  if (!doc || doc.status !== "Draft") throw new Error(`${code} is not a draft.`);
  requireContext(doc, `${code} (edit the draft)`);
  preparePosting(state, doc);
  doc.status = "Posted";
  const target = doc.type === "Receipt" ? doc.alloc.map((item) => item.inv).join(", ") : doc.against ?? "";
  const onAccount = doc.type === "Receipt" ? unallocatedOf(state, doc) : 0;
  log(doc, "Posted", actor, [target ? `Against ${target}` : "", onAccount > EPSILON ? `${docMoney(onAccount, doc)} on account` : ""].filter(Boolean).join(" · "));
  syncFor(state, doc, actor, `${moneyDocMeta(doc.type).label} ${doc.code} · ${docMoney(doc.amount, doc)}`);
}

/** Posted → Draft: the document stops counting until it is posted again. */
export function resetMoneyToDraft(state: SalesState, code: string, actor: string) {
  const doc = findMoneyDoc(state, code);
  if (!doc || doc.status !== "Posted") throw new Error(`${code} is not posted.`);
  const returns = returnsAgainst(state, code);
  if (returns.length) throw new Error(`${code} has posted returns (${returns.map((item) => item.code).join(", ")}). Reset those to draft first.`);
  doc.status = "Draft";
  log(doc, "Reset to draft", actor);
  syncFor(state, doc, actor, `${doc.code} reset to draft`);
}

export function deleteMoneyDraft(state: SalesState, code: string) {
  const index = state.receipt.findIndex((doc) => doc.code === code);
  if (index < 0) throw new Error(`${code} no longer exists.`);
  if (state.receipt[index].status !== "Draft") throw new Error(`Only drafts can be deleted. Reset ${code} to draft first.`);
  if (returnsAgainst(state, code, true).length) throw new Error(`${code} has draft returns against it. Delete those first.`);
  state.receipt.splice(index, 1);
}

/* ------------------------------------------------------------------ batch */

export interface BatchCommon extends SalesContextFields {
  date: string;
  method: string;
  account: string;
  reference: string;
}

/**
 * Batch › Invoice Receipts: one posted receipt per customer and currency for
 * the ticked invoice amounts. A foreign-currency receipt takes the rate of the
 * first invoice it pays.
 */
export function batchInvoiceReceipts(state: SalesState, rows: readonly ReceiptAllocation[], common: BatchCommon, actor: string): string[] {
  const groups = new Map<string, { customerId: string; invoice: SalesDocument; alloc: ReceiptAllocation[] }>();
  for (const row of rows) {
    if (!(round2(row.amount) > 0)) continue;
    const invoice = findDocument(state, "invoice", row.inv);
    if (!invoice) throw new Error(`${row.inv} no longer exists.`);
    const key = `${invoice.customerId}|${docCurrency(invoice)}`;
    const group = groups.get(key) ?? { customerId: invoice.customerId, invoice, alloc: [] };
    group.alloc.push({ inv: row.inv, amount: round2(row.amount) });
    groups.set(key, group);
  }
  if (!groups.size) throw new Error("Tick at least one invoice and enter an amount.");
  requireContext(common, "the batch");
  return [...groups.values()].map(({ customerId, invoice, alloc }) =>
    saveMoneyDoc(
      state,
      { ...newMoneyInput("Receipt", customerId), ...normalizeCurrency(invoice), ...common, amount: allocTotal(alloc), alloc },
      actor,
      { post: true, source: "Batch" },
    ),
  );
}

export interface BatchRow extends BatchCommon {
  customerId: string;
  amount: number;
  /** Customer payments only. */
  purpose?: string;
}

/** Batch › Receipts: each row (PKR) is posted and allocated to that customer's oldest PKR invoices first. */
export function batchReceipts(state: SalesState, rows: readonly BatchRow[], actor: string): string[] {
  const usable = rows.filter((row) => row.customerId || round2(row.amount) > 0);
  if (!usable.length) throw new Error("Add at least one receipt line.");
  usable.forEach((row) => requireContext(row, "the batch"));
  return usable.map((row) =>
    saveMoneyDoc(state, { ...newMoneyInput("Receipt", row.customerId), ...row, alloc: autoAllocate(state, row.customerId, row.amount) }, actor, { post: true, source: "Batch" }),
  );
}

/** Batch › Payments: each row is posted as a PKR customer payment. */
export function batchPayments(state: SalesState, rows: readonly BatchRow[], actor: string): string[] {
  const usable = rows.filter((row) => row.customerId || round2(row.amount) > 0);
  if (!usable.length) throw new Error("Add at least one payment line.");
  usable.forEach((row) => requireContext(row, "the batch"));
  return usable.map((row) =>
    saveMoneyDoc(state, { ...newMoneyInput("Customer payment", row.customerId), ...row, purpose: row.purpose || "Security deposit" }, actor, { post: true, source: "Batch" }),
  );
}

export interface OffsetLine {
  receipt: string;
  customerId: string;
  inv: string;
  amount: number;
}

/**
 * Combined Accounts Offset: applies money held on account (unallocated
 * posted receipts) to the same customer's outstanding invoices, oldest
 * receipt and oldest due invoice first. Without a customer it covers all.
 */
export function offsetPlan(state: SalesState, customerId?: string): OffsetLine[] {
  const lines: OffsetLine[] = [];
  const customers = customerId ? [customerId] : [...new Set(state.receipt.map((doc) => doc.customerId))];
  for (const id of customers) {
    const invoices = openInvoices(state, id);
    const balances = new Map(invoices.map((invoice) => [invoice.code, invoiceBalance(state, invoice)]));
    const currencyOf = new Map(invoices.map((invoice) => [invoice.code, docCurrency(invoice)]));
    const receipts = state.receipt
      .filter((doc) => doc.customerId === id && doc.type === "Receipt" && isPosted(doc) && unallocatedOf(state, doc) > EPSILON)
      .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code, undefined, { numeric: true }));
    for (const receipt of receipts) {
      let free = unallocatedOf(state, receipt);
      for (const [inv, due] of balances) {
        if (free <= EPSILON) break;
        if (due <= EPSILON || currencyOf.get(inv) !== docCurrency(receipt)) continue;
        const take = round2(Math.min(free, due));
        lines.push({ receipt: receipt.code, customerId: id, inv, amount: take });
        balances.set(inv, round2(due - take));
        free = round2(free - take);
      }
    }
  }
  return lines;
}

export function applyOffset(state: SalesState, lines: readonly OffsetLine[], actor: string): number {
  if (!lines.length) throw new Error("There is no money on account to offset against outstanding invoices.");
  for (const line of lines) {
    const receipt = findMoneyDoc(state, line.receipt);
    const invoice = findDocument(state, "invoice", line.inv);
    if (!receipt || !invoice || docCurrency(receipt) !== docCurrency(invoice)) throw new Error("The offset is out of date. Open it again.");
    if (line.amount > unallocatedOf(state, receipt) + EPSILON || line.amount > invoiceBalance(state, invoice) + EPSILON)
      throw new Error("Balances changed since the offset was prepared. Open it again.");
    const existing = receipt.alloc.find((item) => item.inv === line.inv);
    if (existing) existing.amount = round2(existing.amount + line.amount);
    else receipt.alloc.push({ inv: line.inv, amount: line.amount });
    log(receipt, "Offset", actor, `${docMoney(line.amount, receipt)} applied to ${line.inv}`);
    syncInvoiceStatus(state, line.inv, actor, `Offset from ${receipt.code} · ${docMoney(line.amount, receipt)}`);
  }
  return lines.length;
}

/* --------------------------------------------------------------- customers */

export function newCustomerDraft(state: SalesState): SalesCustomer {
  return { ...blankCustomer(), code: nextCode("CUS", state.customers.map((item) => item.code)) };
}

/** Saves a validated customer and returns its code. Edits record what changed in the activity history. */
export function saveCustomer(state: SalesState, draft: SalesCustomer, actor: string): string {
  const customer = normalizeCustomer(structuredClone(draft));
  if (!draft.id) {
    customer.id = uid();
    customer.code = nextCode("CUS", state.customers.map((item) => item.code));
    customer.history = [{ step: "Created", at: stamp(), by: actor, note: customer.openingBalance ? `Opening balance ${money(customer.openingBalance)}` : "" }];
    state.customers.push(customer);
    return customer.code;
  }
  const index = state.customers.findIndex((item) => item.id === draft.id);
  if (index < 0) throw new Error(`${draft.code} no longer exists.`);
  const previous = state.customers[index];
  const notes: string[] = [];
  if (previous.status !== customer.status) notes.push(`Status ${previous.status} → ${customer.status}`);
  if (previous.openingBalance !== customer.openingBalance)
    notes.push(`Opening balance ${money(previous.openingBalance)} → ${money(customer.openingBalance)}`);
  if (previous.creditLimit !== customer.creditLimit)
    notes.push(`Credit limit ${money(previous.creditLimit)} → ${money(customer.creditLimit)}`);
  if (previous.creditStatus !== customer.creditStatus) notes.push(`Credit status ${previous.creditStatus} → ${customer.creditStatus}`);
  customer.history = [...previous.history, { step: "Edited", at: stamp(), by: actor, note: notes.join(" · ") }];
  state.customers[index] = customer;
  return customer.code;
}

/* ----------------------------------------------------------- sales returns */

export interface ReturnInput extends SalesContextFields {
  invoice: string;
  date: string;
  /** Quantity returned per invoice line, by line index. */
  qty: number[];
  reason: string;
}

export function newReturnInput(invoice: SalesDocument): ReturnInput {
  return { invoice: invoice.code, date: todayIso(), qty: invoice.lines.map(() => 0), reason: "", ...contextOf(invoice) };
}

export function validateReturn(state: SalesState, input: ReturnInput): FieldErrors {
  const errors: FieldErrors = {};
  const invoice = findDocument(state, "invoice", input.invoice);
  if (!invoice) return { invoice: "Invoice not found." };
  Object.assign(errors, contextErrors(input));
  if (!input.date) errors.date = "Enter the return date.";
  else if (input.date < invoice.date) errors.date = "A return cannot be dated before the invoice.";
  if (!input.reason.trim()) errors.reason = "Enter the reason for the return.";
  let any = false;
  invoice.lines.forEach((line, index) => {
    const qty = Number(input.qty[index]) || 0;
    if (qty < 0) errors[`qty.${index}`] = "Cannot be negative.";
    if (qty > 0) any = true;
    const left = line.qty - returnedQty(state, invoice.code, line);
    if (qty > left) errors[`qty.${index}`] = `Only ${left} can still be returned.`;
  });
  if (!any) errors.lines = "Enter the quantity returned for at least one line.";
  return errors;
}

/** Sale Return from an opened invoice. Its value (incl. sales tax) is credited to the invoice. */
export function addReturn(state: SalesState, input: ReturnInput, actor: string): string {
  const invoice = findDocument(state, "invoice", input.invoice);
  if (!invoice) throw new Error("Invoice not found.");
  const errors = validateReturn(state, input);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const lines: SalesReturnLine[] = invoice.lines
    .map((line, index) => ({ sku: line.sku, desc: line.desc, qty: Number(input.qty[index]) || 0, rate: line.rate, tax: line.tax, uom: line.uom }))
    .filter((line) => line.qty > 0);
  const created: SalesReturn = {
    id: uid(),
    code: nextCode("SR", state.returns.map((item) => item.code)),
    customerId: invoice.customerId,
    invoice: invoice.code,
    date: input.date,
    ...requireContext(input, "the sale return"),
    lines,
    reason: input.reason.trim(),
    status: "Recorded",
    history: [{ step: "Recorded", at: stamp(), by: actor, note: `From ${invoice.code}` }],
  };
  state.returns.push(created);
  log(invoice, "Sale return", actor, `${created.code} · ${docMoney(returnValue(created), invoice)}`);
  syncInvoiceStatus(state, invoice.code, actor, `Sale return ${created.code}`);
  return created.code;
}

/* ------------------------------------------------------- recurring bills */

/**
 * Recurring invoice templates (Sales › Recurring Bills).
 *
 * A Single template bills one customer; a Batch template bills several
 * customers with the same lines. Create Invoice prefills the normal invoice
 * form (recurringInvoiceDraft) and Save and Post issues it through
 * saveDocument, which records the customer as billed for the period. When
 * every customer is billed the template moves to the next week or month.
 * Mock only: when the Sales API exists, generation must run server-side with
 * idempotency per template, customer and period.
 */

/** Frequencies offered for new templates. */
export const RECURRING_FREQUENCIES = ["Weekly", "Monthly"] as const satisfies readonly RecurringFrequency[];

export function nextPeriod(iso: string, frequency: RecurringFrequency): string {
  if (frequency === "Weekly") return addDays(iso, 7);
  return addMonths(iso, frequency === "Monthly" ? 1 : frequency === "Quarterly" ? 3 : 12);
}

export const findRecurring = (state: SalesState, code: string | undefined) =>
  code ? state.recurring.find((item) => item.code === code) : undefined;

/** Value of one invoice raised from the template (per customer), in the template currency. */
export const recurringTotal = (bill: RecurringBill) => lineTotals(bill.lines).total;

/** Customers on the template still to be invoiced for the current period. */
export function recurringPending(bill: RecurringBill): string[] {
  return bill.customerIds.filter((id) => !bill.billed[id]);
}

/** Active templates whose current period is on or before the given date and still has customers to invoice. */
export function recurringDue(state: SalesState, onOrBefore: string): RecurringBill[] {
  return state.recurring.filter((bill) => bill.status === "Active" && bill.next <= onOrBefore && recurringPending(bill).length > 0);
}

function advanceRecurring(bill: RecurringBill, actor: string) {
  const from = bill.next;
  bill.next = nextPeriod(bill.next, bill.frequency);
  bill.billed = {};
  log(bill, "Period complete", actor, `All invoices for ${formatDate(from)} issued · next on ${formatDate(bill.next)}`);
}

/**
 * Unsaved invoice prefilled from a template for one of its customers. The
 * invoice form opens it for review; nothing is stored until Save and Post.
 */
export function recurringInvoiceDraft(state: SalesState, code: string, actor: string, customerId?: string): SalesDocument {
  const bill = findRecurring(state, code);
  if (!bill) throw new Error(`${code} no longer exists.`);
  if (bill.status !== "Active") throw new Error(`${code} is paused. Resume it to create invoices.`);
  const target = customerId ?? (bill.scope === "Single" ? bill.customerIds[0] : undefined);
  if (!target || !bill.customerIds.includes(target)) throw new Error(`Choose a customer on ${code}.`);
  if (bill.billed[target]) throw new Error(`${customerLabel(state, target)} is already invoiced for ${formatDate(bill.next)} (${bill.billed[target]}).`);
  const customer = findCustomer(state, target);
  if (!customer) throw new Error(`The customer on ${code} no longer exists.`);
  const context = requireContext(bill, code);
  const draft = newDocumentDraft(state, "invoice", target);
  const period = formatDate(bill.next);
  return {
    ...draft,
    owner: customer.salesperson || actor,
    reference: bill.reference.trim() ? `${bill.reference.trim()} · ${period}` : `${bill.code} · ${period}`,
    ...normalizeCurrency(bill),
    lines: bill.lines.map((line) => ({ ...line, desc: `${line.desc} · ${period}` })),
    notes: bill.notes,
    ...context,
    links: { recurring: bill.code },
  };
}

/** Called by saveDocument for a new invoice that came from a template. */
function markRecurringBilled(state: SalesState, invoice: SalesDocument, actor: string) {
  const bill = findRecurring(state, invoice.links.recurring);
  if (!bill) return;
  if (!bill.customerIds.includes(invoice.customerId)) throw new Error(`The invoice customer is not on ${bill.code}.`);
  if (bill.billed[invoice.customerId]) throw new Error(`${customerLabel(state, invoice.customerId)} is already invoiced for ${formatDate(bill.next)} (${bill.billed[invoice.customerId]}).`);
  bill.billed[invoice.customerId] = invoice.code;
  log(bill, "Invoiced", actor, `${invoice.code} · ${customerLabel(state, invoice.customerId)} · ${formatDate(bill.next)}`);
  if (!recurringPending(bill).length) advanceRecurring(bill, actor);
}

/** One-click invoice for one customer on the template, with the template's values unchanged. */
export function invoiceFromRecurring(state: SalesState, code: string, actor: string, customerId?: string): string {
  return saveDocument(state, recurringInvoiceDraft(state, code, actor, customerId), actor);
}

/** Save and Post all: invoices every customer still to be billed on the template for the current period. */
export function postRecurringBatch(state: SalesState, code: string, actor: string): string[] {
  const bill = findRecurring(state, code);
  if (!bill) throw new Error(`${code} no longer exists.`);
  const pending = recurringPending(bill);
  if (!pending.length) throw new Error(`Every customer on ${code} is already invoiced for this period.`);
  return pending.map((customerId) => invoiceFromRecurring(state, code, actor, customerId));
}

export interface RecurringInput extends SalesContextFields {
  code: string;
  scope: RecurringScope;
  name: string;
  customerIds: string[];
  lines: SalesLine[];
  currency: string;
  fxRate: number;
  reference: string;
  notes: string;
  frequency: RecurringFrequency;
  next: string;
}

export function newRecurringInput(scope: RecurringScope): RecurringInput {
  return {
    code: "",
    scope,
    name: "",
    customerIds: [],
    lines: [blankLine()],
    ...currencyDefaults(undefined),
    reference: "",
    notes: "",
    frequency: "Monthly",
    next: todayIso(),
  };
}

export function recurringInputFrom(bill: RecurringBill): RecurringInput {
  return {
    code: bill.code,
    scope: bill.scope,
    name: bill.name,
    customerIds: [...bill.customerIds],
    lines: structuredClone(bill.lines),
    ...normalizeCurrency(bill),
    ...contextOf(bill),
    reference: bill.reference,
    notes: bill.notes,
    frequency: bill.frequency,
    next: bill.next,
  };
}

export function validateRecurring(state: SalesState, input: RecurringInput): FieldErrors {
  const errors: FieldErrors = contextErrors(input);
  if (!input.name.trim()) errors.name = "Enter what is billed, e.g. Monthly maintenance.";
  if (input.scope === "Single" && input.customerIds.length !== 1) errors.customerIds = "Select a customer.";
  if (input.scope === "Batch" && input.customerIds.length < 2) errors.customerIds = "Select at least two customers. Use a single-customer template for one.";
  const inactive = input.customerIds.filter((id) => findCustomer(state, id)?.status !== "Active");
  if (!errors.customerIds && inactive.length) errors.customerIds = `${inactive.map((id) => customerLabel(state, id)).join(", ")} ${inactive.length === 1 ? "is" : "are"} inactive.`;
  if (!input.next) errors.next = "Enter the next invoice date.";
  const rateError = fxRateError(input);
  if (rateError) errors.fxRate = rateError;
  const usable = input.lines.filter((item) => item.desc.trim() && Number(item.qty) > 0);
  if (!usable.length) errors.lines = "Add at least one line with a description and a quantity above zero.";
  else if (usable.some((item) => !(Number(item.rate) > 0))) errors.lines = "Every line needs a rate above zero.";
  return errors;
}

/** Creates or updates a template. Returns its code. */
export function saveRecurring(state: SalesState, input: RecurringInput, actor: string): string {
  const fields = {
    name: input.name.trim(),
    customerIds: [...new Set(input.customerIds)],
    lines: input.lines.filter((item) => item.desc.trim() && Number(item.qty) > 0),
    ...normalizeCurrency(input),
    ...requireContext(input, "the template"),
    reference: input.reference.trim(),
    notes: input.notes.trim(),
    frequency: input.frequency,
    next: input.next,
  };
  if (!input.code) {
    const bill: RecurringBill = {
      id: uid(),
      code: nextCode("RB", state.recurring.map((item) => item.code)),
      scope: input.scope,
      ...fields,
      status: "Active",
      billed: {},
      history: [],
    };
    log(bill, "Created", actor, `${bill.scope === "Batch" ? `${bill.customerIds.length} customers · ` : ""}${bill.frequency} from ${formatDate(bill.next)}`);
    state.recurring.push(bill);
    return bill.code;
  }
  const bill = findRecurring(state, input.code);
  if (!bill) throw new Error(`${input.code} no longer exists.`);
  const periodChanged = bill.next !== fields.next;
  Object.assign(bill, fields);
  // A new period date starts a fresh period; otherwise keep invoices already issued for customers still on it.
  bill.billed = periodChanged ? {} : Object.fromEntries(Object.entries(bill.billed).filter(([id]) => bill.customerIds.includes(id)));
  log(bill, "Edited", actor);
  if (Object.keys(bill.billed).length && !recurringPending(bill).length) advanceRecurring(bill, actor);
  return bill.code;
}

export function setRecurringStatus(state: SalesState, code: string, status: RecurringBill["status"], actor: string) {
  const bill = findRecurring(state, code);
  if (!bill) throw new Error(`${code} no longer exists.`);
  bill.status = status;
  log(bill, status === "Active" ? "Resumed" : "Paused", actor);
}
