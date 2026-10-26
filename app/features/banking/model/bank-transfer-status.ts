import type { BankTransferState } from "@nexora/contracts";

const bankTransferStateLabels: Record<BankTransferState, string> = {
  draft: "Draft",
  submitted: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
  posted: "Posted",
  reversed: "Reversed",
};

export function bankTransferStateLabel(state: BankTransferState): string {
  return bankTransferStateLabels[state];
}
