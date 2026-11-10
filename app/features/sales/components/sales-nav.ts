import type { SalesDocumentKind } from "../model/sales-types";

/** Navigation and feedback handed to every sales view by SalesWorkspace. */
export interface SalesNav {
  /** Signed-in user's display name, written into activity history. */
  actor: string;
  /** Opens a record by code. keepPage keeps the current menu item (e.g. Sales Approvals). */
  open: (code: string, keepPage?: boolean) => void;
  /** Starts a new record on a page; preset carries a source code such as an invoice. */
  openNew: (pageId: string, preset?: string) => void;
  /** Shows a page list. */
  go: (pageId: string) => void;
  /** Returns from a record to the list of the current menu item. */
  back: () => void;
  notify: (message: string) => void;
}

export const KIND_BY_PREFIX: Record<string, SalesDocumentKind | "customer"> = {
  QTN: "quotation",
  SO: "order",
  INV: "invoice",
  CUS: "customer",
};

export const ROUTE_BY_KIND: Record<SalesDocumentKind | "customer", [moduleId: string, pageId: string]> = {
  quotation: ["sales", "quotations"],
  order: ["sales", "sales-orders"],
  invoice: ["sales", "invoices"],
  customer: ["customers", "customers"],
};

export function kindOfCode(code: string) {
  return KIND_BY_PREFIX[code.split("-")[0]];
}
