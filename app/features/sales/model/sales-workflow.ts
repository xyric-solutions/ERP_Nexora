/**
 * Sales workflow rules for the prototype.
 *
 * New Quotation → Management approval (the only approval; it confirms the
 * order) → Pick & Pack → Delivery → Create Invoice → Record Payment. Only
 * quotations and sales returns go to Sales Approvals. These rules run in the browser
 * against session fixtures; when the Sales API is built they move server-side.
 */

import { RECEIPT_ACCOUNTS, RECEIPT_METHODS, SALES_CATALOG, SALES_KINDS, SALES_TERM_DAYS, SALES_WAREHOUSES } from "./sales-constants";
import { addDays, addMonths, formatDate, money, stamp, todayIso } from "./sales-format";
import { addressLines, blankCustomer, documentTermsFor, normalizeCustomer, onCreditHold, shippingAddress } from "./customer-model";
import type {
  ApprovalDecision,
  ApprovalEntry,
  CustomerReceipt,
  RecurringBill,
  SalesCustomer,
  SalesDocument,
  SalesDocumentKind,
  SalesLine,
  SalesNotification,
  SalesReturn,
  SalesState,
} from "./sales-types";

export type FieldErrors = Record<string, string>;

export function lineAmount(line: SalesLine): number {
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
    const match = String(code).match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const findCustomer = (state: SalesState, id: string) => state.customers.find((customer) => customer.id === id);
export const findDocument = (state: SalesState, kind: SalesDocumentKind, code: string | undefined) =>
  code ? state[kind].find((doc) => doc.code === code) : undefined;

export function customerLabel(state: SalesState, id: string): string {
  return findCustomer(state, id)?.display ?? "—";
}

export function deliveryAddress(customer: SalesCustomer | undefined): string {
  if (!customer) return "";
  return addressLines(shippingAddress(customer)).join(", ");
}

export function paidOn(state: SalesState, invoice: SalesDocument): number {
  return state.receipt.reduce(
    (sum, receipt) =>
      sum + receipt.alloc.filter((item) => item.inv === invoice.code).reduce((total, item) => total + item.amount, 0),
    0,
  );
}

export function invoiceBalance(state: SalesState, invoice: SalesDocument): number {
  return Math.max(0, documentTotal(invoice) - paidOn(state, invoice));
}

/** Unpaid invoices past their due date show as Overdue. */
export function displayStatus(doc: SalesDocument, today = todayIso()): string {
  if (doc.kind === "invoice" && doc.status !== "Paid" && doc.date2 && doc.date2 < today) return "Overdue";
  return doc.status;
}

/** Opening balance, open orders not yet invoiced and unpaid invoice balances. */
export function exposure(state: SalesState, customerId: string): number {
  let total = findCustomer(state, customerId)?.openingBalance ?? 0;
  for (const order of state.order) {
    if (order.customerId === customerId && ["Confirmed", "Packed", "Delivered"].includes(order.status))
      total += documentTotal(order);
  }
  for (const invoice of state.invoice) {
    if (invoice.customerId === customerId && invoice.status !== "Paid") total += invoiceBalance(state, invoice);
  }
  return total;
}

/** Unpaid invoices raised in Nexora. */
export function invoicedBalance(state: SalesState, customerId: string): number {
  return state.invoice
    .filter((invoice) => invoice.customerId === customerId && invoice.status !== "Paid")
    .reduce((sum, invoice) => sum + invoiceBalance(state, invoice), 0);
}

/** Outstanding receivable: opening balance carried in plus unpaid invoices. */
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

export function creditCheck(state: SalesState, customerId: string, amount: number): CreditCheck {
  const customer = findCustomer(state, customerId);
  const current = exposure(state, customerId);
  const limit = customer?.creditLimit ?? 0;
  const overBy = current + amount - limit;
  return { hold: onCreditHold(customer), over: limit > 0 && overBy > 0, limit, exposure: current, amount, overBy };
}

export type SalesActionId = "submitApproval" | "confirmOrder" | "confirm" | "delivery" | "createInvoice" | "recordReceipt";

export type NextAction =
  | { type: "action"; action: SalesActionId; label: string; text: string }
  | { type: "wait"; text: string; approval?: boolean }
  | { type: "stopped"; text: string }
  | { type: "done"; text: string; link?: { kind: SalesDocumentKind; code: string; label: string } };

/* ------------------------------------------------------ quotation approval */

/** Quotation statuses that the salesperson can still edit. */
export const EDITABLE_QUOTATION_STATUSES: readonly string[] = ["Open", "Changes requested"];

/** The latest Management decision on a quotation, if any. */
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
  if (doc.status === "Pending approval") return "Waiting for Management";
  return "Not submitted";
}

export const decisionNeedsNote = (decision: ApprovalDecision) => decision !== "Approved";

/** Person who created a quotation: the one who first saved it. */
export function quotationCreator(doc: SalesDocument): string {
  return doc.history.find((entry) => entry.step === "Saved")?.by ?? doc.owner;
}

function notify(state: SalesState, notification: Omit<SalesNotification, "id" | "at" | "read">) {
  state.notifications.unshift({ ...notification, id: uid(), at: stamp(), read: false });
}

/** Sends an open quotation (or one sent back for changes) to Management. */
export function submitQuotation(state: SalesState, code: string, actor: string, note = "") {
  const quotation = findDocument(state, "quotation", code);
  if (!quotation || !EDITABLE_QUOTATION_STATUSES.includes(quotation.status))
    throw new Error(`${code} cannot be submitted for approval.`);
  const resubmitted = quotation.status === "Changes requested";
  quotation.approval = [...(quotation.approval ?? []), { action: "Submitted", by: actor, role: "", at: stamp(), note: note.trim() }];
  setStatus(quotation, "Pending approval", actor, resubmitted ? "Resubmitted after changes" : "Submitted for approval");
}

/** Why a quotation cannot be approved right now, or "" if it can. */
export function approvalBlocker(state: SalesState, doc: SalesDocument): string {
  const customer = findCustomer(state, doc.customerId);
  return customer && onCreditHold(customer)
    ? `${customer.display} is ${customer.creditStatus.toLowerCase()}. Change the customer's credit status before approving.`
    : "";
}

/**
 * Records Management's decision on a quotation. Approve is the only approval
 * in the sale: it also creates the sales order already confirmed, so it goes
 * straight to Pick, Pack & Delivery. The creator is notified of every decision.
 * Returns the new sales order code when approved.
 */
export function decideQuotation(
  state: SalesState,
  code: string,
  decision: ApprovalDecision,
  actor: string,
  role: string,
  note = "",
): string | undefined {
  const quotation = findDocument(state, "quotation", code);
  if (!quotation || quotation.status !== "Pending approval") throw new Error(`${code} is not waiting for approval.`);
  if (!role.trim()) throw new Error("Choose the role you are deciding as.");
  if (decisionNeedsNote(decision) && !note.trim()) throw new Error("Add a note explaining the decision.");
  if (decision === "Approved") {
    const blocker = approvalBlocker(state, quotation);
    if (blocker) throw new Error(blocker);
  }
  const entry: ApprovalEntry = { action: decision, by: actor, role: role.trim(), at: stamp(), note: note.trim() };
  quotation.approval = [...(quotation.approval ?? []), entry];
  setStatus(quotation, decision, actor, [`By ${approverName(entry)}`, entry.note].filter(Boolean).join(" · "));
  const orderCode = decision === "Approved" ? confirmQuotation(state, code, actor) : undefined;
  const customer = customerLabel(state, quotation.customerId);
  const by = `${approverName(entry)} on ${stampDate(entry.at)}`;
  notify(state, {
    to: quotationCreator(quotation),
    code,
    ...(decision === "Approved"
      ? { title: `${code} approved`, message: `Approved by ${by}. Sales order ${orderCode} for ${customer} is confirmed and in Pick, Pack & Delivery.`, tone: "success" as const }
      : decision === "Rejected"
        ? { title: `${code} rejected`, message: `Rejected by ${by}: ${entry.note}`, tone: "danger" as const }
        : { title: `Changes requested on ${code}`, message: `${by} asked for changes: ${entry.note}`, tone: "warning" as const }),
  });
  return orderCode;
}

/** Exactly one next action per state. */
export function nextActionFor(state: SalesState, doc: SalesDocument): NextAction {
  if (doc.kind === "quotation") {
    const decision = latestDecision(doc);
    if (doc.status === "Open")
      return { type: "action", action: "submitApproval", label: "Submit for Approval", text: "Sends this quotation to Management. When it is approved, the sales order is confirmed automatically." };
    if (doc.status === "Changes requested")
      return {
        type: "action",
        action: "submitApproval",
        label: "Resubmit for Approval",
        text: `${decision ? `${approverName(decision)} asked for changes: "${decision.note}". ` : ""}Edit the quotation, then resubmit it.`,
      };
    if (doc.status === "Pending approval")
      return { type: "wait", approval: true, text: "Waiting for Management to approve, reject or request changes. Approving confirms the sales order automatically." };
    if (doc.status === "Rejected")
      return {
        type: "stopped",
        text: `Rejected by ${decision ? `${approverName(decision)}${decision.note ? `: "${decision.note}"` : ""}` : "Management"}. Create a new quotation if the customer still wants to buy.`,
      };
    if (doc.status === "Approved")
      return { type: "action", action: "confirmOrder", label: "Confirm Order", text: "Approved, but the sales order was not created. Confirm Order creates it." };
    return {
      type: "done",
      text: `Approved and confirmed as sales order ${doc.links.order}.`,
      link: doc.links.order ? { kind: "order", code: doc.links.order, label: "Open sales order" } : undefined,
    };
  }
  if (doc.kind === "order") {
    if (doc.status === "Saved")
      return { type: "action", action: "confirm", label: "Confirm Order", text: "Confirms this direct order. It then appears in Pick, Pack & Delivery." };
    if (doc.status === "Confirmed")
      return { type: "action", action: "delivery", label: "Pick & Pack", text: "Pick the items, pack them and save the delivery from one panel." };
    if (doc.status === "Packed")
      return { type: "action", action: "delivery", label: "Save Delivery", text: "The order is picked and packed. Record who received it and save the delivery." };
    if (doc.status === "Delivered")
      return { type: "action", action: "createInvoice", label: "Create Invoice", text: "Creates and saves the invoice from this order, linked to its quotation and order." };
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
      label: "Record Payment",
      text: `${money(invoiceBalance(state, doc))} is still due${overdue}.`,
    };
  }
  return { type: "done", text: "Fully paid." };
}

/** Short label for the list "Next action" column. */
export function listNextAction(state: SalesState, doc: SalesDocument): string {
  const next = nextActionFor(state, doc);
  return next.type === "action" ? next.label : next.type === "wait" ? "Waiting for Management" : "";
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
      key: "approval", label: "Management approval", status: "Approved", state: "done", code: order?.code,
      details: [
        ["Approved by", approverName(approved)],
        ["Approved on", approved.at],
        ["Sales order", order ? `${order.code} · confirmed` : "—"],
        ...(approved.note ? ([["Note", approved.note]] as [string, string][]) : []),
      ],
    };
  } else if (quotation.status === "Pending approval") {
    approvalStage = {
      key: "approval", label: "Management approval", status: "Pending approval", state: "current",
      details: [["Submitted by", submission?.by ?? "—"], ["Submitted on", submission?.at ?? "—"]],
    };
  } else if (decision && (quotation.status === "Rejected" || quotation.status === "Changes requested")) {
    approvalStage = {
      key: "approval", label: "Management approval", status: quotation.status, state: blocked ? "blocked" : "current",
      details: [["Decided by", approverName(decision)], ["Decided on", decision.at], ["Note", decision.note || "—"]],
    };
  } else {
    approvalStage = { key: "approval", label: "Management approval", status: "Not submitted", state: "current", details: [["Next", "Submit for Approval"]] };
  }

  const packStage: QuotationStage = order?.pickPack
    ? {
        key: "pack", label: "Pick & pack", status: "Packed", state: "done", code: order.code,
        details: [["Packed by", order.pickPack.packedBy], ["Packages", String(order.pickPack.packages)], ["Packed on", order.pickPack.at]],
      }
    : { key: "pack", label: "Pick & pack", ...later(order?.status === "Confirmed", "Ready to pick"), code: order?.code, details: order ? [["Ship from", order.warehouse]] : [] };

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
        key: "delivery", label: "Delivery", ...later(order?.status === "Packed", "Ready to deliver"),
        details: order ? [["Planned", formatDate(order.date2)], ["Ship to", deliveryAddress(customer) || "—"]] : [],
      };

  const invoiceStage: QuotationStage = invoice
    ? {
        key: "invoice", label: "Invoice", status: "Issued", state: "done", code: invoice.code,
        details: [["Issued", formatDate(invoice.date)], ["Due", formatDate(invoice.date2)], ["Total", money(documentTotal(invoice))]],
      }
    : { key: "invoice", label: "Invoice", ...later(order?.status === "Delivered", "Ready to invoice"), details: [] };

  const receipts = invoice ? receiptsFor(state, invoice.code) : [];
  const paymentStage: QuotationStage = invoice
    ? {
        key: "payment", label: "Payment", status: displayStatus(invoice), state: invoice.status === "Paid" ? "done" : "current", code: invoice.code,
        details: [
          ["Received", money(paidOn(state, invoice))],
          ["Balance due", money(invoiceBalance(state, invoice))],
          ["Payments", receipts.length ? receipts.map((receipt) => `${receipt.code} · ${formatDate(receipt.date)}`).join(", ") : "None yet"],
        ],
      }
    : { key: "payment", label: "Payment", ...later(false, ""), details: [] };

  return [
    {
      key: "quotation", label: "Quotation", status: "Saved", state: "done", code: quotation.code,
      details: [
        ["Customer", customer?.display ?? "—"],
        ["Created by", quotationCreator(quotation)],
        ["Date", formatDate(quotation.date)],
        ["Total", money(documentTotal(quotation))],
      ],
    },
    approvalStage,
    packStage,
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
    lines: [blankLine()],
    notes: "",
    status: kind === "invoice" ? "Unpaid" : kind === "quotation" ? "Open" : "Saved",
    links: {},
    history: [],
  };
}

export function validateDocument(draft: SalesDocument): FieldErrors {
  const meta = SALES_KINDS[draft.kind];
  const errors: FieldErrors = {};
  if (!draft.customerId) errors.customerId = "Select a customer.";
  if (!draft.date) errors.date = "Enter the date.";
  if (draft.date && draft.date2 && draft.date2 < draft.date)
    errors.date2 = `${meta.date2} cannot be before the ${meta.date1.toLowerCase()}.`;
  const usable = draft.lines.filter((item) => item.desc.trim() && Number(item.qty) > 0);
  if (!usable.length) errors.lines = "Add at least one line with a description and a quantity above zero.";
  else if (usable.some((item) => !(Number(item.rate) > 0))) errors.lines = "Every line needs a rate above zero.";
  return errors;
}

/** Saves a new or edited quotation, order or invoice. Returns the saved code. */
export function saveDocument(state: SalesState, draft: SalesDocument, actor: string): string {
  const meta = SALES_KINDS[draft.kind];
  const lines = draft.lines.filter((item) => item.desc.trim() && Number(item.qty) > 0);
  const list = state[draft.kind];
  if (!draft.code) {
    const doc: SalesDocument = {
      ...draft,
      lines,
      id: uid(),
      code: nextCode(meta.prefix, list.map((item) => item.code)),
      owner: draft.owner || actor,
      history: [],
    };
    if (doc.kind === "quotation") {
      doc.status = "Open";
      log(doc, "Saved", actor);
    } else if (doc.kind === "order") {
      doc.status = "Saved";
      log(doc, "Saved", actor);
    } else {
      doc.status = "Unpaid";
      log(doc, "Issued", actor);
    }
    list.push(doc);
    return doc.code;
  }
  const index = list.findIndex((item) => item.code === draft.code);
  if (index < 0) throw new Error(`${draft.code} no longer exists.`);
  const current = list[index];
  const editable = draft.kind === "quotation" ? EDITABLE_QUOTATION_STATUSES.includes(current.status) : current.status === "Saved";
  if (!editable) throw new Error(`${draft.code} can no longer be edited.`);
  // Status, links and approval history come from the stored record, never from the form copy.
  const updated: SalesDocument = {
    ...draft,
    lines,
    status: current.status,
    links: current.links,
    approval: current.approval,
    history: [...current.history],
  };
  log(updated, "Edited", actor);
  list[index] = updated;
  return updated.code;
}

/* ------------------------------------------------------------ the actions */

/** Approved quotation → confirmed sales order. Called by decideQuotation on approval. */
export function confirmQuotation(state: SalesState, code: string, actor: string): string {
  const quotation = findDocument(state, "quotation", code);
  if (!quotation || quotation.status !== "Approved") throw new Error(`${code} must be approved before the order is confirmed.`);
  const today = todayIso();
  const order: SalesDocument = {
    ...structuredClone(quotation),
    id: uid(),
    code: nextCode("SO", state.order.map((item) => item.code)),
    kind: "order",
    date: today,
    date2: addDays(today, SALES_KINDS.order.date2Days),
    warehouse: SALES_WAREHOUSES[0],
    status: "Saved",
    links: { quotation: quotation.code },
    approval: undefined,
    history: [],
  };
  const approved = latestDecision(quotation);
  setStatus(order, "Confirmed", actor, `From ${quotation.code}${approved ? ` · approved by ${approverName(approved)}` : ""}`);
  state.order.push(order);
  quotation.links.order = order.code;
  setStatus(quotation, "Ordered", actor, `Sales order ${order.code} confirmed`);
  return order.code;
}

/** Direct sales orders (not from a quotation) are confirmed without any approval. */
export function confirmOrder(state: SalesState, code: string, actor: string) {
  const order = findDocument(state, "order", code);
  if (!order || order.status !== "Saved") throw new Error(`${code} cannot be confirmed.`);
  const customer = findCustomer(state, order.customerId);
  if (customer && onCreditHold(customer))
    throw new Error(`${customer.display} is ${customer.creditStatus.toLowerCase()}. Change the customer's credit status first.`);
  setStatus(order, "Confirmed", actor);
}

export function nextDeliveryNumber(state: SalesState): string {
  return nextCode("DLV", state.order.flatMap((order) => (order.delivery ? [order.delivery.no] : [])));
}

export interface PickPackInput {
  /** Indexes of the order lines that have been picked. */
  picked: readonly number[];
  packages: number;
  packedBy: string;
  notes: string;
}

export function validatePickPack(order: SalesDocument, input: PickPackInput): FieldErrors {
  const errors: FieldErrors = {};
  if (order.lines.some((_, index) => !input.picked.includes(index))) errors.picked = "Tick every item once it has been picked.";
  if (!(Number(input.packages) >= 1)) errors.packages = "Enter at least one package.";
  if (!input.packedBy.trim()) errors.packedBy = "Enter who packed the order.";
  return errors;
}

/** Confirmed → Packed. */
export function savePickPack(state: SalesState, code: string, actor: string, input: PickPackInput) {
  const order = findDocument(state, "order", code);
  if (!order || order.status !== "Confirmed") throw new Error(`${code} is not ready to pick and pack.`);
  const errors = validatePickPack(order, input);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  order.pickPack = { packages: Number(input.packages), packedBy: input.packedBy.trim(), notes: input.notes.trim(), at: stamp(), by: actor };
  setStatus(order, "Packed", actor, `${order.pickPack.packages} package(s) · packed by ${order.pickPack.packedBy}`);
}

export interface DeliveryInput {
  date: string;
  warehouse: string;
  receivedBy: string;
  notes: string;
}

/** Packed → Delivered. No approval follows a delivery. */
export function recordDelivery(state: SalesState, code: string, actor: string, input: DeliveryInput): string {
  const order = findDocument(state, "order", code);
  if (!order || order.status !== "Packed") throw new Error(`${code} must be picked and packed before delivery.`);
  if (!input.date) throw new Error("Enter the delivery date.");
  const no = nextDeliveryNumber(state);
  order.delivery = { no, ...input, receivedBy: input.receivedBy.trim(), notes: input.notes.trim(), at: stamp(), by: actor };
  setStatus(order, "Delivered", actor, `Delivery ${no}`);
  return no;
}

/** Delivered → Invoiced. The invoice is saved immediately and linked to its order and quotation. */
export function createInvoiceFromOrder(state: SalesState, code: string, actor: string): string {
  const order = findDocument(state, "order", code);
  if (!order || order.status !== "Delivered") throw new Error(`${code} is not ready to invoice.`);
  const today = todayIso();
  const invoice: SalesDocument = {
    ...structuredClone(order),
    id: uid(),
    code: nextCode("INV", state.invoice.map((item) => item.code)),
    kind: "invoice",
    owner: actor,
    date: today,
    date2: addDays(today, SALES_TERM_DAYS[order.terms] ?? 30),
    status: "Unpaid",
    links: { order: order.code, ...(order.links.quotation ? { quotation: order.links.quotation } : {}) },
    pickPack: undefined,
    delivery: undefined,
    history: [],
  };
  log(invoice, "Issued", actor, `From ${order.code}${order.links.quotation ? ` · ${order.links.quotation}` : ""}`);
  state.invoice.push(invoice);
  order.links.invoice = invoice.code;
  setStatus(order, "Invoiced", actor, `Invoice ${invoice.code}`);
  const quotation = findDocument(state, "quotation", order.links.quotation);
  if (quotation) quotation.links.invoice = invoice.code;
  return invoice.code;
}

/* ------------------------------------------------- invoice payments */

/** Receipts applied to an invoice, oldest first: the invoice's payment history. */
export function receiptsFor(state: SalesState, invoiceCode: string): CustomerReceipt[] {
  return state.receipt
    .filter((receipt) => receipt.alloc.some((item) => item.inv === invoiceCode))
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/** Amount of a receipt applied to one invoice. */
export function appliedTo(receipt: CustomerReceipt, invoiceCode: string): number {
  return receipt.alloc.filter((item) => item.inv === invoiceCode).reduce((sum, item) => sum + item.amount, 0);
}

export type PaymentKind = "Paid in full" | "Partially paid";

export interface PaymentInput {
  kind: PaymentKind;
  amount: number;
  date: string;
  method: string;
  account: string;
  reference: string;
}

export function newPaymentInput(state: SalesState, invoice: SalesDocument): PaymentInput {
  return {
    kind: "Paid in full",
    amount: Math.round(invoiceBalance(state, invoice) * 100) / 100,
    date: todayIso(),
    method: RECEIPT_METHODS[0],
    account: RECEIPT_ACCOUNTS[0],
    reference: "",
  };
}

export function validatePayment(state: SalesState, invoice: SalesDocument, input: PaymentInput): FieldErrors {
  const errors: FieldErrors = {};
  const balance = Math.round(invoiceBalance(state, invoice) * 100) / 100;
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (!(amount > 0)) errors.amount = "Enter the amount received.";
  else if (amount > balance + 0.004) errors.amount = `Only ${money(balance)} is still due.`;
  else if (input.kind === "Partially paid" && amount >= balance - 0.004) errors.amount = "A part payment must be less than the balance. Choose Paid in full instead.";
  if (!input.date) errors.date = "Enter the payment date.";
  if (!input.method) errors.method = "Choose the payment method.";
  if (input.method !== "Cash" && !input.reference.trim()) errors.reference = "Enter the cheque number or transaction reference.";
  return errors;
}

/**
 * Save Receipt from the invoice panel: records the receipt against this
 * invoice, which updates the amount received, the balance and the status.
 */
export function recordInvoicePayment(state: SalesState, invoiceCode: string, input: PaymentInput, actor: string): string {
  const invoice = findDocument(state, "invoice", invoiceCode);
  if (!invoice || invoice.status === "Paid") throw new Error(`${invoiceCode} has nothing left to pay.`);
  const errors = validatePayment(state, invoice, input);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const receipt: CustomerReceipt = {
    id: uid(),
    code: nextCode("RCT", state.receipt.map((item) => item.code)),
    customerId: invoice.customerId,
    owner: actor,
    date: input.date,
    method: input.method,
    account: input.method === "Cash" ? "Cash in hand" : input.account,
    reference: input.reference.trim(),
    amount,
    alloc: [{ inv: invoice.code, amount }],
    status: "Recorded",
    history: [{ step: "Recorded", at: stamp(), by: actor, note: `Against ${invoice.code}` }],
  };
  state.receipt.push(receipt);
  const status = invoiceBalance(state, invoice) <= 0.004 ? "Paid" : "Partially paid";
  setStatus(invoice, status, actor, `Receipt ${receipt.code} · ${money(amount)}`);
  return receipt.code;
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

/* ------------------------------------------------- approvals and returns */

export function decideReturn(state: SalesState, id: string, approve: boolean, actor: string) {
  const item = state.returns.find((candidate) => candidate.id === id);
  if (!item || item.status !== "Pending approval") throw new Error("This return is not waiting for approval.");
  item.status = approve ? "Approved" : "Rejected";
  item.history.push({ step: item.status, at: stamp(), by: actor, note: "" });
}

export interface ReturnInput {
  invoice: string;
  item: string;
  qty: number;
  reason: string;
}

export function validateReturn(state: SalesState, input: ReturnInput): string {
  if (!input.invoice || !input.item || !(input.qty > 0) || !input.reason.trim())
    return "Choose an invoice and item, and enter a quantity and reason.";
  const line = findDocument(state, "invoice", input.invoice)?.lines.find((candidate) => candidate.desc === input.item);
  if (line && input.qty > line.qty) return `Only ${line.qty} were invoiced.`;
  return "";
}

export function addReturn(state: SalesState, input: ReturnInput, actor: string): string {
  const invoice = findDocument(state, "invoice", input.invoice);
  if (!invoice) throw new Error("Invoice not found.");
  const created: SalesReturn = {
    id: uid(),
    code: nextCode("SR", state.returns.map((item) => item.code)),
    customerId: invoice.customerId,
    invoice: invoice.code,
    date: todayIso(),
    item: input.item,
    qty: input.qty,
    reason: input.reason.trim(),
    status: "Pending approval",
    history: [{ step: "Received", at: stamp(), by: actor, note: "" }],
  };
  state.returns.push(created);
  return created.code;
}

/* ------------------------------------------------------- recurring bills */

const FREQUENCY_MONTHS: Record<RecurringBill["frequency"], number> = { Monthly: 1, Quarterly: 3, Annually: 12 };

export const recurringTotal = (bill: RecurringBill) => bill.qty * bill.rate * (1 + bill.tax / 100);

export function invoiceFromRecurring(state: SalesState, id: string, actor: string): string {
  const bill = state.recurring.find((item) => item.id === id);
  if (!bill || bill.status !== "Active") throw new Error("This recurring bill is not active.");
  const customer = findCustomer(state, bill.customerId);
  const terms = documentTermsFor(customer);
  const today = todayIso();
  const invoice: SalesDocument = {
    id: uid(),
    code: nextCode("INV", state.invoice.map((item) => item.code)),
    kind: "invoice",
    customerId: bill.customerId,
    owner: actor,
    date: today,
    date2: addDays(today, SALES_TERM_DAYS[terms] ?? 30),
    terms,
    reference: `${bill.code} · ${formatDate(bill.next)}`,
    warehouse: SALES_WAREHOUSES[0],
    lines: [{
      sku: bill.sku,
      desc: `${bill.desc} · ${formatDate(bill.next)}`,
      qty: bill.qty,
      rate: bill.rate,
      tax: bill.tax,
      uom: SALES_CATALOG.find((item) => item.sku === bill.sku)?.uom ?? "Each",
    }],
    notes: "",
    status: "Unpaid",
    links: { recurring: bill.code },
    history: [],
  };
  log(invoice, "Issued", actor, `From ${bill.code}`);
  state.invoice.push(invoice);
  bill.next = addMonths(bill.next, FREQUENCY_MONTHS[bill.frequency]);
  return invoice.code;
}
