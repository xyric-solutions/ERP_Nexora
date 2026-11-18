import { describe, it, expect } from "vitest";
import {
  spreadBudget,
  budgetPoolsOverlap,
  budgetPoolMatches,
  budgetPercent,
  budgetDimensionKey,
} from "../../packages/contracts/src/budget/index.js";
describe("Budget exact allocation and pool matching", () => {
  it("preserves minor units and a deterministic weighted remainder", () => {
    expect(spreadBudget("100.01", ["1", "1", "1"], 2)).toEqual(["33.33", "33.33", "33.35"]);
    expect(spreadBudget("0.001", ["0", "1", "1", "0"], 3)).toEqual(["0.000", "0.000", "0.001", "0.000"]);
    expect(spreadBudget("999999999999999999.99", ["1", "0"], 2)).toEqual(["999999999999999999.99", "0.00"]);
  });
  it("rejects unsupported precision and zero weights", () => {
    expect(() => spreadBudget("0.001", ["1"], 2)).toThrow();
    expect(() => spreadBudget("10", ["0", "0"], 2)).toThrow();
  });
  it("detects intersections between differently dimensioned pools", () => {
    expect(budgetPoolsOverlap({ department: "D1" }, { project: "P1" })).toBe(true);
    expect(budgetPoolsOverlap({ department: "D1" }, { department: "D2" })).toBe(false);
    expect(budgetPoolMatches({ department: "D1" }, { department: "D1", project: "P1" })).toBe(true);
    expect(budgetPoolMatches({ department: "D1" }, {})).toBe(false);
    expect(budgetDimensionKey({ project: "P1", department: "D1" })).toBe(
      budgetDimensionKey({ department: "D1", project: "P1" }),
    );
  });
  it("does not invent a zero-budget variance percentage", () => {
    expect(budgetPercent(100n, 0n)).toBeNull();
    expect(budgetPercent(-25n, 100n)).toBe("-25.00");
  });
});
