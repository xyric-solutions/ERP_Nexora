import { describe, it, expect } from "vitest";
import {
  hrPayslipQuerySchema,
  hrPayslipReleaseSchema,
  type HrPayslipDocument,
} from "../../packages/contracts/src/hr/index.js";
import { reconcilePayslip } from "../../server/api/src/modules/hr/payroll-payslips.js";
import { payslipHtml } from "../../app/features/hr/components/payslip-print.js";
export const doc: HrPayslipDocument = {
  version: "payslip_v1",
  company: { id: "c", code: "C", name: "Company" },
  employee: { id: "e", number: "001", name: "Employee" },
  period: { id: "p", month: "2026-10-01", run_number: 1 },
  result: {
    id: "r",
    currency: "PKR",
    gross: "100.0000",
    deductions: "20.0000",
    net: "80.0000",
    employer_contributions: "5.0000",
    calculation_hash: "a".repeat(64),
  },
  accrual: { id: "a", journal_id: "j", entry_number: "JE-1" },
  lines: [
    { code: "BASIC", name: "Salary", kind: "earning", amount: "100.0000", position: 1 },
    { code: "TAX", name: "Tax", kind: "deduction", amount: "20.0000", position: 2 },
    { code: "ER", name: "Employer fund", kind: "employer_contribution", amount: "5.0000", position: 3 },
  ],
};
describe("Exact payslip publication contracts and safe printable document", () => {
  const command = {
    company_id: "c",
    month: "2026-10-01",
    result_ids: ["r"],
    source_hash: "a".repeat(64),
    reason: "Independently reviewed publication",
  };
  it("accepts bounded publication commands", () =>
    expect(hrPayslipReleaseSchema.safeParse(command).success).toBe(true));
  it.each([
    { amount: "1" },
    { bank_reference: "x" },
    { confirm_override: true },
    { result_ids: [] },
    { result_ids: ["r", "r"] },
    { result_ids: Array.from({ length: 51 }, (_, i) => "r" + i) },
    { source_hash: "bad" },
    { month: "2026-10-02" },
  ])("rejects unsafe terms %j", (change) =>
    expect(hrPayslipReleaseSchema.safeParse({ ...command, ...change }).success).toBe(false),
  );
  it("rejects unbounded queries", () => {
    expect(hrPayslipQuerySchema.safeParse({ company_id: "c", month: "2026-10-01", limit: 10000 }).success).toBe(false);
  });
  it("reconciles earnings, deductions, employer amounts and net exactly", () =>
    expect(() => reconcilePayslip(doc)).not.toThrow());
  it.each([{ gross: "101" }, { deductions: "21" }, { net: "79" }, { employer_contributions: "6" }])(
    "rejects altered totals %j",
    (change) => expect(() => reconcilePayslip({ ...doc, result: { ...doc.result, ...change } })).toThrow(),
  );
  it("does not print or download an unreleased preview", () =>
    expect(() => payslipHtml({ document: doc, release: null, can_release: true })).toThrow());
  it("escapes employee and component labels and retains publication evidence without executable content", () => {
    const html = payslipHtml({
      document: {
        ...doc,
        employee: { ...doc.employee, name: "<script>alert(1)</script>" },
        lines: [{ ...doc.lines[0]!, name: "<img onerror=alert(1)>" }],
      },
      release: {
        id: "slip-1",
        released_by: "checker",
        released_at: "2026-10-20T00:00:00Z",
        publication_hash: "b".repeat(64),
        workflow_managed: true,
      },
      can_release: false,
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("slip-1");
    expect(html).toContain("does not confirm a bank transfer");
    expect(html).toContain("default-src 'none'");
  });
});
