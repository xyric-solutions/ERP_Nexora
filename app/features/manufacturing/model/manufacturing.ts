import type { ManufacturingOrderState, ManufacturingSurface } from "@nexora/contracts";
import { ApiError } from "@/lib/api/generated";

/*
 * Live Manufacturing pages (meeting decision 13 Nov 2026): Bill of Materials,
 * Production Planning and Manufacturing Orders. Every other Manufacturing menu page
 * remains a prototype served by `manufacturing-workspace.tsx`.
 */
export interface ManufacturingSection {
  surface: ManufacturingSurface;
  listPage: string;
  formPage: string;
  title: string;
  singular: string;
  description: string;
  readPermission: string;
  createPermission: string;
}
export const manufacturingSections: Record<ManufacturingSurface, ManufacturingSection> = {
  boms: {
    surface: "boms",
    listPage: "boms",
    formPage: "bom-editor",
    title: "Bill of Materials",
    singular: "Bill of Materials",
    description: "The components and quantities needed to make each finished product. One per product.",
    readPermission: "manufacturing.bom.read",
    createPermission: "manufacturing.bom.create",
  },
  plans: {
    surface: "plans",
    listPage: "production-plans",
    formPage: "production-plan",
    title: "Production Planning",
    singular: "Production Planning",
    description: "Plan how many units of a finished product to make, then convert the plan to a Manufacturing Order.",
    readPermission: "manufacturing.plan.read",
    createPermission: "manufacturing.plan.create",
  },
  orders: {
    surface: "orders",
    listPage: "production-orders",
    formPage: "add-production-order",
    title: "Manufacturing Orders",
    singular: "Manufacturing Order",
    description: "Orders to manufacture a finished product. Confirm an order to approve it.",
    readPermission: "manufacturing.order.read",
    createPermission: "manufacturing.order.create",
  },
};

/** Page id -> section, for the live pages only. */
export const manufacturingLivePages: Record<string, ManufacturingSurface> = {
  boms: "boms",
  "bom-editor": "boms",
  "production-plans": "plans",
  "production-plan": "plans",
  "production-orders": "orders",
  "add-production-order": "orders",
  "production-order-detail": "orders",
};
export function isManufacturingLivePage(pageId: string): boolean {
  return Object.prototype.hasOwnProperty.call(manufacturingLivePages, pageId);
}

export const manufacturingSelectClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function manufacturingError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Manufacturing data could not be loaded or saved. Check your connection and retry.";
}

export const orderStateLabels: Record<ManufacturingOrderState, string> = {
  draft: "Draft",
  approved: "Approved",
  // Only orders saved before the one-step confirmation (13 Nov 2026); they can still be confirmed.
  submitted: "Awaiting confirmation",
  returned: "Draft (returned)",
};
export const planStateLabels = { draft: "Draft", converted: "Converted" } as const;

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
