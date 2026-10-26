import { describe, it, expect } from "vitest";
import { hrLearningCertificateSchema } from "../../packages/contracts/src/hr/index.js";
import { learningCertificateHtml } from "../../app/features/hr/components/learning-certificate.js";
const data = () =>
  hrLearningCertificateSchema.parse({
    issuer_name: "Independent reviewer",
    company_name: "Company & Partners",
    issued_at: "2026-10-22T10:00:00Z",
    record: {
      id: "completion",
      company_id: "company",
      kind: "completion",
      programme_id: "programme",
      parent_id: "participation",
      employee_id: "employee",
      employee_name: "<script>alert(1)</script>",
      employee_number: "E1",
      version: 2,
      state: "issued",
      created_by: "assessor",
      updated_by: "reviewer",
      manager_user_id: null,
      manager_decided_by: null,
      created_at: "2026-10-22",
      updated_at: "2026-10-22",
      allowed_actions: ["certificate"],
      expired: false,
      terms: {
        kind: "completion",
        participation_id: "participation",
        employee_name: "<script>alert(1)</script>",
        employee_number: "E1",
        programme_name: "Safe <img src=x onerror=alert(1)> learning",
        session_title: "Session",
        completed_on: "2026-10-22",
        attendance_percent: 100,
        assessment_score: 90,
        result: "passed",
        certificate_id: "NXL-verified-certificate",
        valid_until: "2027-10-22",
        source_hash: "a".repeat(64),
        evidence_reference: "Signed attendance and assessment register",
        minimum_attendance_percent: 80,
        pass_mark: 70,
      },
    },
  });
describe("Internal learning certificate document boundary", () => {
  it("escapes all record content and retains the actual global font", () => {
    const html = learningCertificateHtml(data(), '"Inter", system-ui, sans-serif');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Company &amp; Partners");
    expect(html).toContain('font-family:"Inter", system-ui, sans-serif');
    expect(html).not.toContain("__GLOBAL_FONT__");
    expect(html).toContain("a downloaded copy does not reflect later revocation");
  });
  it("prevents CSS or script injection through the document font parameter", () => {
    const html = learningCertificateHtml(data(), "Inter;</style><script>alert(1)</script>");
    expect(html).not.toContain("</style><script>");
    expect(html).not.toContain("font-family:Inter;");
    expect(html).toContain("Internal training certificate");
  });
});
