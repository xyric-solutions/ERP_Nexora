import { describe, expect, it } from "vitest";

import { createSalesSeed } from "@/features/sales/model/sales-fixtures";
import { amountInWords, money } from "@/features/sales/model/sales-format";
import {
  addReturn,
  autoAllocate,
  exposure,
  applyOffset,
  approveOwnQuotation,
  confirmQuotation,
  createInvoiceFromOrder,
  decideQuotation,
  deleteMoneyDraft,
  deleteQuotation,
  documentTotal,
  findDocument,
  contextErrors,
  findMoneyDoc,
  fulfilmentStage,
  invoiceBalance,
  invoiceDraftFromOrder,
  newDocumentDraft,
  newMoneyInput,
  newReturnInput,
  offsetPlan,
  onAccountCredit,
  paidOn,
  postMoneyDoc,
  nextActionFor,
  recordDelivery,
  resetMoneyToDraft,
  resetQuotationToDraft,
  returnableOf,
  saveDocument,
  saveMoneyDoc,
  submitQuotation,
  validateDocument,
  validateMoney,
} from "@/features/sales/model/sales-workflow";
import type { SalesState } from "@/features/sales/model/sales-types";

const ME = "Test User";
/** Project and Location are required on every Sales transaction (12 Nov 2026). */
const CTX = {
  project: { id: "prj-1", code: "PRJ-001", name: "Lahore Plant" },
  location: { id: "loc-1", code: "LOC-001", name: "Lahore" },
};

function newQuotation(state: SalesState, approver = ""): string {
  const draft = newDocumentDraft(state, "quotation", "c1");
  Object.assign(draft, CTX);
  draft.approver = approver;
  draft.lines = [{ sku: "SRV-220", desc: "Servo", qty: 1, rate: 15000, tax: 18, uom: "Each" }];
  return saveDocument(state, draft, ME);
}

function deliveredInvoice(state: SalesState): string {
  const code = newQuotation(state);
  approveOwnQuotation(state, code, ME);
  const order = confirmQuotation(state, code, ME);
  recordDelivery(state, order, ME, { date: "2026-11-11", warehouse: "Main", receivedBy: "", notes: "", ...CTX });
  return createInvoiceFromOrder(state, order, ME);
}

describe("quotation approval (meeting of 11 Nov 2026)", () => {
  it("saves as Draft; without an approver the creator approves it and it shows Approved, not Ordered", () => {
    const state = createSalesSeed();
    const code = newQuotation(state);
    expect(findDocument(state, "quotation", code)?.status).toBe("Draft");
    approveOwnQuotation(state, code, ME);
    expect(findDocument(state, "quotation", code)?.status).toBe("Approved");
    expect(state.order.some((order) => order.links.quotation === code)).toBe(false);
  });

  it("Confirm Order creates a Confirmed sales order without a second approval", () => {
    const state = createSalesSeed();
    const code = newQuotation(state);
    approveOwnQuotation(state, code, ME);
    const order = confirmQuotation(state, code, ME);
    expect(findDocument(state, "order", order)?.status).toBe("Confirmed");
    expect(findDocument(state, "quotation", code)?.status).toBe("Ordered");
  });

  it("only the named approver decides; a reason is required only to reject", () => {
    const state = createSalesSeed();
    const code = newQuotation(state, "Farah Khan");
    expect(() => approveOwnQuotation(state, code, ME)).toThrow();
    submitQuotation(state, code, ME);
    expect(state.notifications[0].to).toBe("Farah Khan");
    expect(() => decideQuotation(state, code, "Approved", ME)).toThrow(/Only Farah Khan/);
    expect(() => decideQuotation(state, code, "Rejected", "Farah Khan", "")).toThrow(/reason/);
    decideQuotation(state, code, "Approved", "Farah Khan");
    expect(findDocument(state, "quotation", code)?.status).toBe("Approved");
  });

  it("deletes only drafts; an approved quotation is reset to draft first", () => {
    const state = createSalesSeed();
    const code = newQuotation(state);
    approveOwnQuotation(state, code, ME);
    expect(() => deleteQuotation(state, code)).toThrow(/Only draft/);
    resetQuotationToDraft(state, code, ME);
    deleteQuotation(state, code);
    expect(findDocument(state, "quotation", code)).toBeUndefined();
  });
});

describe("order fulfilment", () => {
  it("keeps the order Confirmed while fulfilment moves directly to Delivered → Invoiced (no pick & pack)", () => {
    const state = createSalesSeed();
    const code = newQuotation(state);
    approveOwnQuotation(state, code, ME);
    const orderCode = confirmQuotation(state, code, ME);
    const order = () => findDocument(state, "order", orderCode)!;
    expect([order().status, fulfilmentStage(order())]).toEqual(["Confirmed", "Not started"]);
    expect(nextActionFor(state, order())).toMatchObject({ action: "delivery", label: "Delivery" });
    recordDelivery(state, orderCode, ME, { date: "2026-11-11", warehouse: "Main", receivedBy: "", notes: "", ...CTX });
    expect([order().status, fulfilmentStage(order())]).toEqual(["Confirmed", "Delivered"]);
    expect(() =>
      recordDelivery(state, orderCode, ME, { date: "2026-11-11", warehouse: "Main", receivedBy: "", notes: "", ...CTX }),
    ).toThrow(/not ready for delivery/);
    createInvoiceFromOrder(state, orderCode, ME);
    expect([order().status, fulfilmentStage(order())]).toEqual(["Confirmed", "Invoiced"]);
  });

  it("Create Invoice prefills an unsaved draft; edits are kept and the links are set only on save", () => {
    const state = createSalesSeed();
    const code = newQuotation(state);
    approveOwnQuotation(state, code, ME);
    const orderCode = confirmQuotation(state, code, ME);
    recordDelivery(state, orderCode, ME, { date: "2026-11-11", warehouse: "Main", receivedBy: "", notes: "", ...CTX });
    const invoices = state.invoice.length;
    const draft = invoiceDraftFromOrder(state, orderCode, ME);
    expect(draft).toMatchObject({ code: "", kind: "invoice", customerId: "c1", links: { order: orderCode, quotation: code } });
    expect(draft.lines).toHaveLength(1);
    expect(state.invoice).toHaveLength(invoices);
    expect(findDocument(state, "order", orderCode)!.links.invoice).toBeUndefined();

    draft.lines[0] = { ...draft.lines[0], qty: 2, rate: 14000 };
    draft.terms = "Net 15";
    draft.date2 = "2026-12-01";
    const invoiceCode = saveDocument(state, draft, ME);
    const invoice = findDocument(state, "invoice", invoiceCode)!;
    expect(invoice).toMatchObject({ status: "Unpaid", terms: "Net 15", date2: "2026-12-01" });
    expect(documentTotal(invoice)).toBe(2 * 14000 * 1.18);
    expect(findDocument(state, "order", orderCode)!.links.invoice).toBe(invoiceCode);
    expect(findDocument(state, "quotation", code)!.links.invoice).toBe(invoiceCode);
    expect(() => invoiceDraftFromOrder(state, orderCode, ME)).toThrow(/not ready to invoice/);
    expect(() => saveDocument(state, { ...draft, code: "" }, ME)).toThrow(/not ready to invoice/);
  });
});

describe("receipts", () => {
  it("allocates a part payment, keeps the rest on account and offsets it later", () => {
    const state = createSalesSeed();
    const inv = deliveredInvoice(state);
    const invoice = () => findDocument(state, "invoice", inv)!;
    const total = documentTotal(invoice());
    const before = onAccountCredit(state, "c1");
    const input = { ...newMoneyInput("Receipt", "c1", undefined, CTX), amount: 10000, reference: "IBFT 1", alloc: [{ inv, amount: 6000 }] };
    const code = saveMoneyDoc(state, input, ME, { post: true });
    expect(paidOn(state, invoice())).toBe(6000);
    expect(invoice().status).toBe("Partially paid");
    expect(onAccountCredit(state, "c1")).toBe(before + 4000);
    expect(invoiceBalance(state, invoice())).toBeCloseTo(total - 6000, 2);
    const plan = offsetPlan(state, "c1");
    expect(plan.length).toBeGreaterThan(0);
    applyOffset(state, plan, ME);
    expect(onAccountCredit(state, "c1")).toBe(0);
    expect(findMoneyDoc(state, code)?.alloc.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects allocating more than the invoice balance or the amount received", () => {
    const state = createSalesSeed();
    const inv = deliveredInvoice(state);
    const balance = invoiceBalance(state, findDocument(state, "invoice", inv)!);
    const tooMuch = validateMoney(state, { ...newMoneyInput("Receipt", "c1", undefined, CTX), amount: balance + 50, reference: "x", alloc: [{ inv, amount: balance + 50 }] });
    expect(tooMuch[`alloc.${inv}`]).toMatch(/is due/);
    const overAmount = validateMoney(state, { ...newMoneyInput("Receipt", "c1", undefined, CTX), amount: 100, reference: "x", alloc: [{ inv, amount: 200 }] });
    expect(overAmount.alloc).toMatch(/more than/);
  });

  it("drafts have no effect; posting applies them and Reset to Draft removes the effect", () => {
    const state = createSalesSeed();
    const inv = deliveredInvoice(state);
    const invoice = () => findDocument(state, "invoice", inv)!;
    const code = saveMoneyDoc(state, { ...newMoneyInput("Receipt", "c1", undefined, CTX), amount: 5000, reference: "r", alloc: [{ inv, amount: 5000 }] }, ME, { post: false });
    expect(paidOn(state, invoice())).toBe(0);
    postMoneyDoc(state, code, ME);
    expect(paidOn(state, invoice())).toBe(5000);
    resetMoneyToDraft(state, code, ME);
    expect(paidOn(state, invoice())).toBe(0);
    expect(invoice().status).toBe("Unpaid");
    deleteMoneyDraft(state, code);
    expect(findMoneyDoc(state, code)).toBeUndefined();
  });

  it("a return receipt reopens the invoice balance and blocks resetting the original", () => {
    const state = createSalesSeed();
    const inv = deliveredInvoice(state);
    const invoice = () => findDocument(state, "invoice", inv)!;
    const receipt = saveMoneyDoc(state, { ...newMoneyInput("Receipt", "c1", undefined, CTX), amount: 3000, reference: "r", alloc: [{ inv, amount: 3000 }] }, ME, { post: true });
    const back = saveMoneyDoc(state, { ...newMoneyInput("Return receipt", "c1", undefined, CTX), against: receipt, amount: 1000, reference: "ref", note: "Cheque bounced" }, ME, { post: true });
    expect(back.startsWith("RRC-")).toBe(true);
    expect(paidOn(state, invoice())).toBe(2000);
    expect(returnableOf(state, findMoneyDoc(state, receipt)!)).toBe(2000);
    expect(() => resetMoneyToDraft(state, receipt, ME)).toThrow(/posted returns/);
  });

  it("customer payments and return payments use CPY and RPY codes", () => {
    const state = createSalesSeed();
    const cpy = saveMoneyDoc(state, { ...newMoneyInput("Customer payment", "c2", undefined, CTX), amount: 2000, reference: "chq" }, ME, { post: true });
    expect(cpy).toMatch(/^CPY-\d{3}$/);
    const rpy = saveMoneyDoc(state, { ...newMoneyInput("Return payment", "c2", undefined, CTX), against: cpy, amount: 2000, reference: "chq", note: "Deposit refunded" }, ME, { post: true });
    expect(rpy).toMatch(/^RPY-\d{3}$/);
    expect(returnableOf(state, findMoneyDoc(state, cpy)!)).toBe(0);
  });
});

describe("sale return from an invoice", () => {
  it("credits the returned value to the invoice and limits quantities", () => {
    const state = createSalesSeed();
    const inv = deliveredInvoice(state);
    const invoice = () => findDocument(state, "invoice", inv)!;
    const tooMany = { ...newReturnInput(invoice()), qty: [5], reason: "Damaged" };
    expect(() => addReturn(state, tooMany, ME)).toThrow(/can still be returned/);
    addReturn(state, { ...newReturnInput(invoice()), qty: [1], reason: "Damaged" }, ME);
    expect(invoiceBalance(state, invoice())).toBe(0);
    expect(invoice().status).toBe("Paid");
  });
});

describe("document currencies", () => {
  function usdInvoice(state: SalesState): string {
    const draft = newDocumentDraft(state, "invoice", "c1");
    Object.assign(draft, CTX);
    draft.currency = "USD";
    draft.fxRate = 280;
    draft.lines = [{ sku: "", desc: "Export servo", qty: 1, rate: 1000, tax: 0, uom: "Each" }];
    return saveDocument(state, draft, ME);
  }

  it("formats amounts with each currency's ISO decimals", () => {
    expect(money(1234.5, "USD")).toBe("USD 1,234.50");
    expect(money(1234.5, "JPY")).toBe("JPY 1,235");
    expect(money(1.2345, "KWD")).toBe("KWD 1.235");
    expect(amountInWords(12.5, "USD")).toBe("USD Twelve and 50/100 only");
  });

  it("needs an exchange rate for a foreign currency and converts exposure to PKR", () => {
    const state = createSalesSeed();
    const draft = newDocumentDraft(state, "invoice", "c1");
    Object.assign(draft, CTX);
    draft.currency = "EUR";
    draft.fxRate = 0;
    draft.lines = [{ sku: "", desc: "Spares", qty: 1, rate: 100, tax: 0, uom: "Each" }];
    expect(validateDocument(draft).fxRate).toMatch(/exchange rate/);

    const before = exposure(state, "c1");
    const code = usdInvoice(state);
    expect(findDocument(state, "invoice", code)).toMatchObject({ currency: "USD", fxRate: 280 });
    expect(exposure(state, "c1")).toBe(before + 280000);
  });

  it("allocates receipts only to invoices in the receipt currency", () => {
    const state = createSalesSeed();
    const code = usdInvoice(state);
    expect(autoAllocate(state, "c1", 500, "USD")).toEqual([{ inv: code, amount: 500 }]);
    expect(autoAllocate(state, "c1", 500, "PKR").some((line) => line.inv === code)).toBe(false);

    const pkr = { ...newMoneyInput("Receipt", "c1", undefined, CTX), reference: "T1", amount: 500, alloc: [{ inv: code, amount: 500 }] };
    expect(validateMoney(state, pkr)[`alloc.${code}`]).toMatch(/is in USD/);

    const usd = { ...pkr, currency: "USD", fxRate: 281 };
    const receipt = saveMoneyDoc(state, usd, ME, { post: true });
    expect(findMoneyDoc(state, receipt)).toMatchObject({ currency: "USD", fxRate: 281, amount: 500 });
    expect(invoiceBalance(state, findDocument(state, "invoice", code)!)).toBe(500);
  });

  it("a return must be in the currency of the receipt it returns", () => {
    const state = createSalesSeed();
    const code = usdInvoice(state);
    const receipt = saveMoneyDoc(
      state,
      { ...newMoneyInput("Receipt", "c1", "USD", CTX), fxRate: 280, reference: "T2", amount: 200, alloc: [{ inv: code, amount: 200 }] },
      ME,
      { post: true },
    );
    const back = { ...newMoneyInput("Return receipt", "c1", undefined, CTX), against: receipt, amount: 50, note: "Refund", reference: "R1" };
    expect(validateMoney(state, back).currency).toMatch(/is in USD/);
    expect(validateMoney(state, { ...back, currency: "USD", fxRate: 280 })).toEqual({});
  });
});

describe("project and location (required on every transaction)", () => {
  it("rejects saving a quotation, order or invoice without them", () => {
    const state = createSalesSeed();
    const draft = newDocumentDraft(state, "invoice", "c1");
    draft.lines = [{ sku: "", desc: "Spares", qty: 1, rate: 100, tax: 0, uom: "Each" }];
    expect(validateDocument(draft)).toMatchObject({ project: "Select a project.", location: "Select a location." });
    expect(() => saveDocument(state, draft, ME)).toThrow(/project and a location/);
    expect(() => saveDocument(state, { ...draft, project: CTX.project }, ME)).toThrow(/project and a location/);
    const code = saveDocument(state, { ...draft, ...CTX }, ME);
    expect(findDocument(state, "invoice", code)).toMatchObject(CTX);
  });

  it("carries them from quotation to order, delivery, invoice, receipt and return", () => {
    const state = createSalesSeed();
    const inv = deliveredInvoice(state);
    const invoice = findDocument(state, "invoice", inv)!;
    expect(invoice).toMatchObject(CTX);
    expect(findDocument(state, "order", invoice.links.order)!.delivery).toMatchObject(CTX);
    expect(newMoneyInput("Receipt", "c1", undefined, invoice)).toMatchObject(CTX);
    expect(newReturnInput(invoice)).toMatchObject(CTX);
  });

  it("records saved before the rule must be given them first", () => {
    const state = createSalesSeed();
    // QTN-008 is an approved seed quotation without project or location.
    expect(() => confirmQuotation(state, "QTN-008", ME)).toThrow(/project and a location/);
    const order = confirmQuotation(state, "QTN-008", ME, CTX);
    expect(findDocument(state, "order", order)).toMatchObject(CTX);
    // RCT-004 is a seed draft receipt without them.
    expect(() => postMoneyDoc(state, "RCT-004", ME)).toThrow(/project and a location/);
  });

  it("rejects receipts, deliveries and returns without them", () => {
    const state = createSalesSeed();
    expect(contextErrors({})).toEqual({ project: "Select a project.", location: "Select a location." });
    const receipt = { ...newMoneyInput("Customer payment", "c2"), amount: 100, reference: "x" };
    expect(validateMoney(state, receipt)).toMatchObject({ project: "Select a project.", location: "Select a location." });
    expect(() => saveMoneyDoc(state, receipt, ME, { post: false })).toThrow();
    const code = newQuotation(state);
    approveOwnQuotation(state, code, ME);
    const order = confirmQuotation(state, code, ME);
    expect(() => recordDelivery(state, order, ME, { date: "2026-11-11", warehouse: "Main", receivedBy: "", notes: "" })).toThrow(/project and a location/);
  });
});
