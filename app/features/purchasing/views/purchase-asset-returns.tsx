"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FixedAssetsWorkspace } from "@/features/fixed-assets/views/fixed-assets-workspace";

export const isPurchaseAssetReturnPage = (page: string) =>
  ["purchase-returns", "purchase-refunds", "purchase-bill-returns"].includes(page);

export function PurchaseAssetReturnsWorkspace({
  page,
  recordRef,
  onNavigate,
  onDirtyChange,
}: {
  page: string;
  recordRef?: string;
  onNavigate: (module: string, page: string, reference?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const refund = page === "purchase-refunds";
  const billId = page === "purchase-bill-returns" ? recordRef : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={refund ? "refund" : "return"}
          onValueChange={(value) =>
            onNavigate("purchases", value === "refund" ? "purchase-refunds" : "purchase-returns")
          }
        >
          <TabsList aria-label="Purchase asset returns and refunds">
            <TabsTrigger value="return">Purchase Returns</TabsTrigger>
            <TabsTrigger value="refund">Vendor Refunds</TabsTrigger>
          </TabsList>
        </Tabs>
        {billId && (
          <Button variant="outline" onClick={() => onNavigate("purchases", "add-purchase-bill", billId)}>
            Back to Purchase Bill
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Return acquired assets to suppliers or link their posted refunds. Returns for stock and other purchases are a
        separate workflow.
      </p>
      <FixedAssetsWorkspace
        page={refund ? "asset-refund" : "asset-return"}
        recordRef={billId ? undefined : recordRef}
        purchaseContext
        purchaseBillId={billId}
        onNavigate={onNavigate}
        onDirtyChange={onDirtyChange}
      />
    </div>
  );
}
