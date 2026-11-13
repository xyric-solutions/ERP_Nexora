import { describe, expect, it } from "vitest";

import { createSalesSeed } from "@/features/sales/model/sales-fixtures";
import {
  findDocument,
  findRecurring,
  invoiceFromRecurring,
  newRecurringInput,
  nextPeriod,
  postRecurringBatch,
  recurringInputFrom,
  recurringDue,
  recurringInvoiceDraft,
  recurringPending,
  saveDocument,
  saveRecurring,
  setRecurringStatus,
  validateRecurring,
  type RecurringInput,
} from "@/features/sales/model/sales-workflow";
import type { SalesState } from "@/features/sales/model/sales-types";

const ME = "Test User";
const CTX = {
  project: { id: "prj-1", code: "PRJ-001", name: "Lahore Plant" },
  location: { id: "loc-1", code: "LOC-001", name: "Lahore" },
};
const LINE = { sku: "INS-HRS", desc: "Support hours", qty: 2, rate: 6500, tax: 16, uom: "Hour" };

function template(state: SalesState, patch: Partial<RecurringInput>): string {
  const input = { ...newRecurringInput(patch.scope ?? "Single"), ...CTX, name: "Support", lines: [LINE], next: "2026-11-30", ...patch };
  expect(validateRecurring(state, input)).toEqual({});
  return saveRecurring(state, input, ME);
}

describe("recurring invoice templates", () => {
  it("steps weekly by seven days and monthly by one month", () => {
    expect(nextPeriod("2026-11-30", "Weekly")).toBe("2026-12-07");
    expect(nextPeriod("2026-11-30", "Monthly")).toBe("2026-12-30");
  });

  it("requires a project and a location on the template", () => {
    const state = createSalesSeed();
    const input = { ...newRecurringInput("Single"), name: "X", customerIds: ["c1"], lines: [LINE] };
    expect(validateRecurring(state, input)).toMatchObject({ project: "Select a project.", location: "Select a location." });
    expect(() => saveRecurring(state, input, ME)).toThrow(/project and a location/);
  });

  it("validates the customer count for single and batch templates", () => {
    const state = createSalesSeed();
    const base = { ...newRecurringInput("Batch"), name: "Retainer", lines: [LINE] };
    expect(validateRecurring(state, { ...base, customerIds: ["c1"] }).customerIds).toMatch(/at least two/);
    expect(validateRecurring(state, { ...newRecurringInput("Single"), name: "X", lines: [LINE] }).customerIds).toMatch(/Select a customer/);
    expect(validateRecurring(state, { ...base, customerIds: ["c1", "c2"], name: "" }).name).toBeDefined();
  });

  it("prefills an unsaved invoice from a single template without changing it", () => {
    const state = createSalesSeed();
    const code = template(state, { customerIds: ["c4"], frequency: "Weekly", reference: "AMC" });
    const draft = recurringInvoiceDraft(state, code, ME);
    expect(draft).toMatchObject({ code: "", kind: "invoice", customerId: "c4", terms: "Net 15", reference: "AMC · 30 Nov 2026", links: { recurring: code }, ...CTX });
    expect(draft.lines[0]).toMatchObject({ sku: "INS-HRS", qty: 2, rate: 6500, desc: "Support hours · 30 Nov 2026" });
    expect(findRecurring(state, code)).toMatchObject({ next: "2026-11-30", billed: {} });
  });

  it("Save & Post issues the invoice and moves a single template to the next period", () => {
    const state = createSalesSeed();
    const code = template(state, { customerIds: ["c4"], frequency: "Weekly" });
    const invoice = saveDocument(state, recurringInvoiceDraft(state, code, ME), ME);
    expect(findDocument(state, "invoice", invoice)).toMatchObject({ status: "Unpaid", customerId: "c4", links: { recurring: code } });
    expect(findRecurring(state, code)).toMatchObject({ next: "2026-12-07", billed: {} });
  });

  it("does not invoice the same customer twice in one period", () => {
    const state = createSalesSeed();
    const code = template(state, { scope: "Batch", customerIds: ["c1", "c2"] });
    const draft = recurringInvoiceDraft(state, code, ME, "c1");
    invoiceFromRecurring(state, code, ME, "c1");
    expect(() => saveDocument(state, draft, ME)).toThrow(/already invoiced/);
    expect(() => recurringInvoiceDraft(state, code, ME, "c1")).toThrow(/already invoiced/);
  });

  it("a batch template invoices each customer and advances once all are invoiced", () => {
    const state = createSalesSeed();
    const code = template(state, { scope: "Batch", customerIds: ["c1", "c2", "c4"], frequency: "Monthly" });
    const first = invoiceFromRecurring(state, code, ME, "c2");
    expect(recurringPending(findRecurring(state, code)!)).toEqual(["c1", "c4"]);
    expect(findRecurring(state, code)!.next).toBe("2026-11-30");
    const rest = postRecurringBatch(state, code, ME);
    expect(rest).toHaveLength(2);
    const customers = [first, ...rest].map((inv) => findDocument(state, "invoice", inv)!.customerId).sort();
    expect(customers).toEqual(["c1", "c2", "c4"]);
    // Each invoice uses its own customer's payment terms.
    expect(findDocument(state, "invoice", rest[0])!.terms).toBe("Net 30");
    expect(findRecurring(state, code)).toMatchObject({ next: "2026-12-30", billed: {} });
  });

  it("paused templates cannot be invoiced and are not due", () => {
    const state = createSalesSeed();
    const code = template(state, { customerIds: ["c1"], next: "2026-11-01" });
    setRecurringStatus(state, code, "Paused", ME);
    expect(() => recurringInvoiceDraft(state, code, ME)).toThrow(/paused/);
    expect(recurringDue(state, "2026-12-31").some((bill) => bill.code === code)).toBe(false);
  });

  it("seeded schedules need a project and location, then keep working", () => {
    const state = createSalesSeed();
    // Saved before Project and Location were required.
    expect(() => invoiceFromRecurring(state, "RB-001", ME)).toThrow(/project and a location/);
    for (const code of ["RB-001", "RB-002"]) saveRecurring(state, { ...recurringInputFrom(findRecurring(state, code)!), ...CTX }, ME);
    expect(findRecurring(state, "RB-001")!.next).toBe("2026-11-15");
    const invoice = invoiceFromRecurring(state, "RB-001", ME);
    expect(findDocument(state, "invoice", invoice)).toMatchObject({ customerId: "c4", links: { recurring: "RB-001" } });
    expect(findRecurring(state, "RB-001")!.next).toBe("2026-12-15");
    const quarterly = invoiceFromRecurring(state, "RB-002", ME);
    expect(findDocument(state, "invoice", quarterly)!.customerId).toBe("c1");
    expect(findRecurring(state, "RB-002")!.next).toBe("2027-03-01");
  });
});
