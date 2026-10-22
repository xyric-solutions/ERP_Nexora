import { describe, it, expect } from "vitest";
import {
  createHrCorrectionRequestSchema,
  updateHrCorrectionRequestSchema,
  hrCorrectionActionRequestSchema,
  hrCorrectionQuerySchema,
} from "../../packages/contracts/src/hr/index.js";
const base = {
  company_id: "company",
  employee_id: "employee",
  work_date: "2026-10-20",
  kind: "incorrect_attendance",
  stated_in: "2026-10-20T09:00:00+05:00",
  stated_out: "2026-10-20T17:00:00+05:00",
  reason: "Correcting missing device evidence",
  expected_evidence_hash: "a".repeat(64),
};
describe("Attendance correction request contracts", () => {
  it("requires the correct timestamp shape for each correction type", () => {
    expect(createHrCorrectionRequestSchema.safeParse(base).success).toBe(true);
    expect(createHrCorrectionRequestSchema.safeParse({ ...base, kind: "missing_in", stated_out: null }).success).toBe(
      true,
    );
    expect(createHrCorrectionRequestSchema.safeParse({ ...base, kind: "missing_out", stated_in: null }).success).toBe(
      true,
    );
    expect(
      createHrCorrectionRequestSchema.safeParse({ ...base, kind: "official_duty", stated_in: null, stated_out: null })
        .success,
    ).toBe(true);
    for (const kind of ["missing_in", "missing_out", "official_duty"])
      expect(createHrCorrectionRequestSchema.safeParse({ ...base, kind }).success).toBe(false);
  });
  it("rejects naive timestamps, inverted intervals, excessive spans and injected fields", () => {
    for (const changes of [
      { stated_in: "2026-10-20T09:00:00" },
      { stated_out: "2026-10-20T08:00:00+05:00" },
      { stated_out: "2026-10-22T17:00:00+05:00" },
      { status: "approved" },
      { raw_punches: [] },
    ])
      expect(createHrCorrectionRequestSchema.safeParse({ ...base, ...changes }).success).toBe(false);
  });
  it("requires evidence hashes and optimistic versions and keeps override explicit", () => {
    const { employee_id, work_date, ...terms } = base;
    expect(updateHrCorrectionRequestSchema.safeParse({ ...terms, expected_version: 1 }).success).toBe(true);
    expect(updateHrCorrectionRequestSchema.safeParse(terms).success).toBe(false);
    expect(createHrCorrectionRequestSchema.safeParse({ ...base, expected_evidence_hash: "invalid" }).success).toBe(
      false,
    );
    expect(
      hrCorrectionActionRequestSchema.parse({
        company_id: "company",
        expected_version: 1,
        action: "submit",
        reason: "Submit for manager review",
        expected_evidence_hash: "a".repeat(64),
      }).override_self_approval,
    ).toBe(false);
  });
  it("bounds directory pagination and rejects unknown states", () => {
    expect(hrCorrectionQuerySchema.safeParse({ company_id: "company", limit: 101 }).success).toBe(false);
    expect(hrCorrectionQuerySchema.safeParse({ company_id: "company", offset: -1 }).success).toBe(false);
    expect(hrCorrectionQuerySchema.safeParse({ company_id: "company", status: "paid" }).success).toBe(false);
  });
});
