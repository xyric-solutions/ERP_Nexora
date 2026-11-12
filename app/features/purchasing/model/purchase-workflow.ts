import type { PurchaseKind } from "@nexora/contracts";

export const purchaseSteps = [
  { kind: "request", page: "purchase-requisitions", form: "add-requisition", label: "Purchase Request", source: [] },
  { kind: "rfq", page: "rfqs", form: "add-rfq", label: "Request for Quotation", source: ["request"] },
  {
    kind: "order",
    page: "purchase-orders",
    form: "add-purchase-order",
    label: "Purchase Order",
    source: ["rfq", "request"],
  },
  { kind: "receipt", page: "goods-receipts", form: "add-goods-receipt", label: "Receive Products", source: ["order"] },
  { kind: "bill", page: "purchase-bills", form: "add-purchase-bill", label: "Bills", source: ["order"] },
  { kind: "payment", page: "payments", form: "add-payment", label: "Payment", source: ["bill"] },
  {
    kind: "multi_payment",
    page: "multi-vendor-payments",
    form: "add-multi-vendor-payment",
    label: "Multi-vendor Payment",
    source: ["bill"],
  },
] as const satisfies readonly {
  kind: PurchaseKind;
  page: string;
  form: string;
  label: string;
  source: readonly PurchaseKind[];
}[];
export const purchaseStep = (page: string) =>
  purchaseSteps.find((step) => step.page === page || step.form === page) ?? purchaseSteps[0];
export const nextPurchaseStep = (kind: PurchaseKind) =>
  purchaseSteps[purchaseSteps.findIndex((step) => step.kind === kind) + 1];
export const purchaseSelectClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
