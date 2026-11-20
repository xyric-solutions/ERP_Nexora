import { describe, expect, it } from "vitest";
import { issueStockCost } from "../../server/api/src/modules/inventory/stock-costing.js";
describe("Posted stock cost allocation", () => {
  const layers = [
    { id: "old", quantity: 30000n, value: 100n },
    { id: "new", quantity: 20000n, value: 200n },
  ];
  it("consumes FIFO layers in order and retains the exact last-unit residual", () => {
    expect(issueStockCost("fifo", 40000n, layers)).toEqual({
      value: 200n,
      allocations: [
        { entry_id: "old", quantity: 30000n, value: 100n },
        { entry_id: "new", quantity: 10000n, value: 100n },
      ],
    });
    const first = issueStockCost("fifo", 10000n, layers);
    expect(first.value).toBe(33n);
    expect(issueStockCost("fifo", 20000n, [{ id: "old", quantity: 20000n, value: 67n }]).value).toBe(67n);
  });
  it("uses actual weighted-average carrying value, not the last purchase price", () => {
    expect(issueStockCost("weighted_average", 10000n, layers)).toEqual({ value: 60n, allocations: [] });
    expect(issueStockCost("weighted_average", 50000n, layers).value).toBe(300n);
  });
  it.each(["fifo", "weighted_average"] as const)("rejects %s shortages and unrepresentable costs", (method) => {
    expect(() => issueStockCost(method, 50001n, layers)).toThrow("Insufficient posted stock");
    expect(() => issueStockCost(method, 0n, layers)).toThrow("positive");
    expect(() => issueStockCost(method, 10000n, [{ id: "small", quantity: 20000n, value: 1n }])).toThrow();
    expect(() => issueStockCost(method, 1n, [{ id: "bad", quantity: 0n, value: 1n }])).toThrow("inconsistent");
  });
});
