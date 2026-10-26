import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  isPersistedBankReconciliationId,
  isPersistedBankStatementImportId,
  resolveBankReconciliationRoute,
  resolveBankStatementImportRoute,
} from "../../app/features/banking/model/bank-reconciliation-routing.js";

describe("Bank reconciliation persisted routing", () => {
  it("accepts only server-issued statement import and reconciliation identifiers", () => {
    expect(isPersistedBankStatementImportId("9f4b74f4-b118-4ac1-a531-54a0e61f6c89")).toBe(true);
    expect(isPersistedBankStatementImportId("../../statement.csv")).toBe(false);
    expect(isPersistedBankReconciliationId("bank-reconciliation-9f4b74f4-b118-4ac1-a531-54a0e61f6c89")).toBe(true);
    expect(isPersistedBankReconciliationId("REC-2026-0041")).toBe(false);
  });

  it("resolves refreshable register, create, and persisted-detail route state", () => {
    expect(resolveBankReconciliationRoute(undefined)).toEqual({ kind: "register" });
    expect(resolveBankReconciliationRoute("new/bank-account-a")).toEqual({
      kind: "new",
      bankAccountId: "bank-account-a",
    });
    expect(resolveBankReconciliationRoute("bank-reconciliation-9f4b74f4-b118-4ac1-a531-54a0e61f6c89")).toEqual({
      kind: "detail",
      reconciliationId: "bank-reconciliation-9f4b74f4-b118-4ac1-a531-54a0e61f6c89",
    });
    expect(resolveBankReconciliationRoute("unknown-record")).toEqual({ kind: "register" });
  });

  it("preserves a finalized statement import when starting reconciliation", () => {
    expect(resolveBankReconciliationRoute("new/import/123e4567-e89b-42d3-a456-426614174000/bank-account-1")).toEqual({
      kind: "new",
      statementImportId: "123e4567-e89b-42d3-a456-426614174000",
      bankAccountId: "bank-account-1",
    });
    expect(resolveBankReconciliationRoute("new/import/not-an-import/bank-account-1")).toEqual({ kind: "register" });
  });

  it("resolves the statement-import work page, new form, and persisted detail", () => {
    expect(resolveBankStatementImportRoute(undefined)).toEqual({ kind: "register" });
    expect(resolveBankStatementImportRoute("new")).toEqual({ kind: "new" });
    expect(resolveBankStatementImportRoute("123e4567-e89b-42d3-a456-426614174000")).toEqual({
      kind: "detail",
      importId: "123e4567-e89b-42d3-a456-426614174000",
    });
    expect(resolveBankStatementImportRoute("not-a-server-id")).toEqual({ kind: "register" });
  });

  it("routes the reconciliation page exclusively through backend-connected components", async () => {
    const source = await readFile(new URL("../../app/shell/prototype-content.tsx", import.meta.url), "utf8");

    expect(source).toContain('<PageIntro context={{ ...context, status: "backend connected" }}>');
    expect(source).not.toContain("findReconciliation(context.recordRef");
    expect(source).not.toContain("<BankingReconciliation\n");
    expect(source).toContain("<BankingStatementImportRegister");
  });
});
