const persistedBankTransferId =
  /^bank-transfer-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BankTransferEntryKind = "transfer" | "fx";

export function bankTransferEntryKind(value: string | undefined): BankTransferEntryKind | undefined {
  return value === "transfer" || value === "fx" ? value : undefined;
}

export function isPersistedBankTransferId(value: string | undefined): value is string {
  return Boolean(value && persistedBankTransferId.test(value));
}
