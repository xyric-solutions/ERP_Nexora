import { describe, it, expect } from "vitest";
import { performanceScore } from "../../server/api/src/modules/hr/performance.js";
import { hrPerformanceCommandSchema, hrPerformanceQuerySchema } from "../../packages/contracts/src/hr/index.js";
describe("Exact bounded Performance ratings and strict commands", () => {
  it("weights integer basis points without monetary or Payroll effects", () =>
    expect(
      performanceScore(
        [
          { id: "a", weight_bps: 3333 },
          { id: "b", weight_bps: 6667 },
        ],
        [
          { goal_id: "a", rating: 3 },
          { goal_id: "b", rating: 4 },
        ],
      ),
    ).toEqual({ score: "3.6667", band: "Exceeds expectations" }));
  it.each([
    [0, 10000],
    [5000, 6000],
    [5000, 4999],
  ])("rejects invalid goal weights %j", (a, b) =>
    expect(() =>
      performanceScore(
        [
          { id: "a", weight_bps: a },
          { id: "b", weight_bps: b },
        ],
        [
          { goal_id: "a", rating: 3 },
          { goal_id: "b", rating: 4 },
        ],
      ),
    ).toThrow(),
  );
  it.each([0, 6, 2.5])("rejects invalid ratings %s", (rating) =>
    expect(() => performanceScore([{ id: "a", weight_bps: 10000 }], [{ goal_id: "a", rating }])).toThrow(),
  );
  it("requires every goal once", () => {
    expect(() =>
      performanceScore(
        [
          { id: "a", weight_bps: 5000 },
          { id: "b", weight_bps: 5000 },
        ],
        [
          { goal_id: "a", rating: 4 },
          { goal_id: "a", rating: 4 },
        ],
      ),
    ).toThrow();
  });
  const body = {
    action: "activate",
    company_id: "c",
    record_id: "r",
    expected_version: 1,
    reason: "Reviewed cycle activation",
  };
  it("accepts governed decisions", () => expect(hrPerformanceCommandSchema.safeParse(body).success).toBe(true));
  it.each([
    { expected_version: 0 },
    { salary_increase: "100" },
    { confirm_override: true },
    { score: "5" },
    { employee_id: "foreign" },
    { reason: "x" },
    { action: "promote_employee" },
  ])("rejects hidden or unsafe inputs %j", (change) =>
    expect(hrPerformanceCommandSchema.safeParse({ ...body, ...change }).success).toBe(false),
  );
  it("bounds directory reads", () => {
    expect(hrPerformanceQuerySchema.safeParse({ company_id: "c", section: "reviews", limit: 51 }).success).toBe(false);
    expect(
      hrPerformanceQuerySchema.safeParse({ company_id: "c", section: "reviews", tenant_id: "other" }).success,
    ).toBe(false);
  });
});
