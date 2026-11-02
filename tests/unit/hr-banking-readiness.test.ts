import { describe, it, expect, vi } from "vitest";
import type { PoolClient } from "pg";
import { requirePayrollBankingReady } from "../../server/api/src/modules/hr/banking-readiness.js";
describe("HR Banking consumption readiness", () => {
  it("allows salary actions only after the migration and all guards are enabled", async () => {
    const query = vi.fn(async () => ({ rows: [{ ready: true }] }));
    await expect(requirePayrollBankingReady({ query } as unknown as PoolClient)).resolves.toBeUndefined();
    expect(query.mock.calls).toHaveLength(1);
  });
  it("keeps deferred or incompletely upgraded installations unavailable", async () => {
    const query = vi.fn(async () => ({ rows: [{ ready: false }] }));
    await expect(requirePayrollBankingReady({ query } as unknown as PoolClient)).rejects.toMatchObject({
      status: 503,
      code: "HR_PAYMENT_BANKING_SETUP_REQUIRED",
    });
  });
});
