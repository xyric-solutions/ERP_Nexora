import { productDraftSchema, type ProductInput } from "@nexora/contracts";
import { ApiError } from "@/lib/api/generated";

export const productSelectClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export const productTabs = ["General", "Pricing", "Inventory", "Accounting"] as const;
export type ProductTab = (typeof productTabs)[number];
export function emptyProduct(company: string, currency: string): ProductInput {
  return productDraftSchema.parse({
    company_id: company,
    currency,
    name: "",
    opening_date: new Date().toISOString().slice(0, 10),
  });
}
export function productError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Products could not be loaded or saved. Check your connection and retry.";
}
export function fieldTab(key: string): ProductTab {
  return [
    "sale_price",
    "cost",
    "sale_discount",
    "purchase_discount",
    "sales_tax",
    "purchase_tax",
    "non_filer_tax",
    "currency",
  ].includes(key)
    ? "Pricing"
    : [
          "track_inventory",
          "opening_quantity",
          "opening_rate",
          "opening_date",
          "low_stock_level",
          "bin_location",
          "weight",
          "large_pack_size",
          "small_pack_size",
        ].includes(key)
      ? "Inventory"
      : ["stock_account_id", "income_account_id", "expense_account_id"].includes(key)
        ? "Accounting"
        : "General";
}
