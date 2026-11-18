import { describe, it, expect } from "vitest";
import { budgetPaths } from "../../packages/contracts/src/budget/openapi.js";
import {
  budgetVersionInputSchema,
  budgetModelInputSchema,
  budgetPolicyInputSchema,
  budgetDimensionsSchema,
} from "../../packages/contracts/src/budget/index.js";
describe("Budget public contracts", () => {
  it("documents cookie authorization, idempotency and version preconditions", () => {
    const paths = budgetPaths();
    expect(paths["/budget/versions/{id}"].patch.security).toEqual([{ cookieAuth: [] }]);
    expect(paths["/budget/versions/{id}"].patch.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: "header", name: "idempotency-key", required: true }),
        expect.objectContaining({ in: "header", name: "if-match", required: true }),
      ]),
    );
    expect(paths["/budget/imports"].post.requestBody.content["multipart/form-data"].schema.required).toEqual(["file"]);
    expect(paths["/budget/export"].get.responses[200].content).toHaveProperty(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
  it("rejects unknown dimensions, negative allocations and executable model expressions", () => {
    expect(budgetDimensionsSchema.safeParse({ department: "d", tenant_id: "another-tenant" }).success).toBe(false);
    expect(
      budgetVersionInputSchema.safeParse({
        company_id: "c",
        plan_id: "p",
        name: "Invalid",
        reason: "Negative amount",
        lines: [{ account_id: "a", allocations: [{ period_id: "m", amount: "-1" }] }],
      }).success,
    ).toBe(false);
    expect(
      budgetModelInputSchema.safeParse({
        company_id: "c",
        name: "Executable",
        reason: "Unsupported expression",
        expression: "process.env",
        lines: [],
      }).success,
    ).toBe(false);
  });
  it("requires explicit policy mode and bounds the warning threshold", () => {
    expect(
      budgetPolicyInputSchema.safeParse({
        company_id: "c",
        fiscal_calendar_id: "f",
        control_version_id: "v",
        expected_version: 0,
        enabled: true,
        mode: "silent",
        warn_percent: "101",
        effective_date: "2026-11-18",
        reason: "Invalid policy",
      }).success,
    ).toBe(false);
  });
});
