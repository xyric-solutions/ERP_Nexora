const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const persistedStatementImportIdPattern = new RegExp(`^${uuidPattern}$`, "i");
const persistedReconciliationIdPattern = new RegExp(`^bank-reconciliation-${uuidPattern}$`, "i");
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export type BankReconciliationRoute =
  | { kind: "register" }
  | { kind: "new"; bankAccountId?: string; statementImportId?: string }
  | { kind: "detail"; reconciliationId: string };

export type BankStatementImportRoute = { kind: "register" } | { kind: "new" } | { kind: "detail"; importId: string };

export function isPersistedBankStatementImportId(value: string | undefined): value is string {
  return Boolean(value && persistedStatementImportIdPattern.test(value));
}

export function isPersistedBankReconciliationId(value: string | undefined): value is string {
  return Boolean(value && persistedReconciliationIdPattern.test(value));
}

export function resolveBankStatementImportRoute(recordRef: string | undefined): BankStatementImportRoute {
  if (!recordRef) return { kind: "register" };
  if (recordRef === "new") return { kind: "new" };
  if (isPersistedBankStatementImportId(recordRef)) return { kind: "detail", importId: recordRef };
  return { kind: "register" };
}

export function resolveBankReconciliationRoute(recordRef: string | undefined): BankReconciliationRoute {
  if (!recordRef) return { kind: "register" };
  if (recordRef === "new") return { kind: "new" };
  if (recordRef.startsWith("new/import/")) {
    const [statementImportId, bankAccountId] = recordRef.slice("new/import/".length).split("/");
    return isPersistedBankStatementImportId(statementImportId) && identifierPattern.test(bankAccountId ?? "")
      ? { kind: "new", statementImportId, bankAccountId }
      : { kind: "register" };
  }
  if (recordRef.startsWith("new/")) {
    const bankAccountId = recordRef.slice(4);
    return identifierPattern.test(bankAccountId) ? { kind: "new", bankAccountId } : { kind: "register" };
  }
  if (isPersistedBankReconciliationId(recordRef)) return { kind: "detail", reconciliationId: recordRef };
  return { kind: "register" };
}
