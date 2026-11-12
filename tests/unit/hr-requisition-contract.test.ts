import { describe, expect, it } from "vitest";
import { createHrManpowerRequisitionRequestSchema, hrHiringBasisSchema } from "@nexora/contracts";

import { hiringBasisLabel, hiringBasisOptions } from "../../app/features/hr/model/hiring-basis";

const base = {
  company_id: "company-a",
  job_title: "Data Analyst",
  designation_id: "designation-1",
  job_grade_id: "grade-1",
  cost_center_id: "cost-centre-1",
  project_id: "project-1",
  hiring_basis: "project_based",
  work_arrangement: "hybrid",
  department_id: "department-1",
  positions_requested: 1,
  position_type: "new_position",
  salary_minimum: "1000",
  salary_maximum: "3000",
  currency_code: "USD",
  target_start_date: "2026-12-01",
  reason: "Growth",
};

describe("manpower requisition contract (HR136)", () => {
  it("accepts a project-based requisition without a branch", () => {
    expect(createHrManpowerRequisitionRequestSchema.safeParse(base).success).toBe(true);
  });

  it("requires a project and a known hiring basis", () => {
    const withoutProject: Partial<typeof base> = { ...base };
    delete withoutProject.project_id;
    expect(createHrManpowerRequisitionRequestSchema.safeParse(withoutProject).success).toBe(false);
    expect(createHrManpowerRequisitionRequestSchema.safeParse({ ...base, hiring_basis: "freelance" }).success).toBe(
      false,
    );
    expect(createHrManpowerRequisitionRequestSchema.safeParse({ ...base, work_arrangement: "office" }).success).toBe(
      false,
    );
  });

  it("labels every hiring basis the contract allows", () => {
    expect(hiringBasisOptions.map((option) => option.value)).toEqual(hrHiringBasisSchema.options);
    expect(hiringBasisLabel("project_based")).toBe("Project-Based");
    expect(hiringBasisLabel(null)).toBe("Not recorded");
  });
});
