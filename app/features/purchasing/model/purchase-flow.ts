import type { PurchaseFlow, PurchaseKind } from "@nexora/contracts";

export const purchaseFlowStages = [
  { kind: "request", label: "Purchase Request", create: "Create Request", sources: [] },
  { kind: "rfq", label: "RFQ", create: "Create RFQ", sources: ["request"] },
  { kind: "order", label: "Order", create: "Create Order", sources: ["rfq"] },
  { kind: "receipt", label: "Receive Products", create: "Receive Products", sources: ["order"] },
  { kind: "bill", label: "Bill", create: "Create Bill", sources: ["receipt"] },
] as const satisfies readonly { kind: PurchaseKind; label: string; create: string; sources: readonly PurchaseKind[] }[];

export const purchaseStateLabels = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
} as const;

export function purchaseStageStatus(stage: PurchaseFlow["stages"][number] | undefined) {
  if (!stage?.total) return "Not started";
  return (Object.keys(purchaseStateLabels) as (keyof typeof purchaseStateLabels)[])
    .filter((state) => stage[state] > 0)
    .map((state) => `${stage[state]} ${purchaseStateLabels[state].toLowerCase()}`)
    .join(" · ");
}
