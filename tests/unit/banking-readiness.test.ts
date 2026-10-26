import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { createBankingFoundationReadiness } from "../../server/api/src/modules/banking/readiness.js";

describe("Banking production readiness", () => {
  it("requires the current statement/reconciliation schema", async () => {
    const query = vi.fn(async () => ({ rows: [{ available: false }] }));
    const check = createBankingFoundationReadiness({ query } as never);
    await expect(check()).rejects.toThrow("current Banking foundation migration");
    expect(query.mock.calls[0]?.[0]).toContain("bank_reconciliation_adjustment");
    expect(query.mock.calls[0]?.[0]).toContain("bank_reconciliation_manual_selection");
    expect(query.mock.calls[0]?.[0]).toContain("bank_reconciliation_manual_selection_event");
    expect(query.mock.calls[0]?.[0]).toContain("bank_revaluation_reversal_schedule");
    expect(query.mock.calls[0]?.[0]).toContain("module_name='finance' and version>=30");
    expect(query.mock.calls[0]?.[0]).toContain("module_name='platform' and version>=11");
    expect(query.mock.calls[0]?.[0]).toContain("module_name='security' and version>=19");
  });

  it("passes only when every required relation and migration is available", async () => {
    const query = vi.fn(async () => ({ rows: [{ available: true }] }));
    await expect(createBankingFoundationReadiness({ query } as never)()).resolves.toBeUndefined();
  });

  it("wires real statement, reconciliation, adjustment and storage dependencies in production", () => {
    const serverPath = fileURLToPath(new URL("../../server/api/src/server.ts", import.meta.url));
    const source = readFileSync(serverPath, "utf8");
    for (const required of [
      "new SourceBankStatementImportRepository(pool)",
      "new SourceBankReconciliationRepository(pool)",
      "new SourceBankReconciliationAdjustmentRepository(",
      "bankingStatementStorage: objectStorage",
      "object_storage: () => objectStorage.checkReady()",
      "banking_foundation: createBankingFoundationReadiness(pool)",
      "new SourceBankRevaluationRepository(pool, new FinancePostingService())",
    ]) {
      expect(source).toContain(required);
    }
  });
});
