import type { SalesDocumentKind } from "../model/sales-types";

/** Navigation and feedback handed to every sales view by SalesWorkspace. */
export interface SalesNav {
  /** Signed-in user's display name, written into activity history. */
  actor: string;
  /** Opens a record by code. keepPage keeps the current menu item. */
  open: (code: string, keepPage?: boolean) => void;
  /** Starts a new record on a page; preset carries a source code such as an invoice. */
  openNew: (pageId: string, preset?: string) => void;
  /** Shows a page list. */
  go: (pageId: string) => void;
  /** Returns from a record to the list of the current menu item. */
  back: () => void;
  notify: (message: string) => void;
}

export type SalesRecordKind = SalesDocumentKind | "customer" | "receipt" | "recurring";

export const KIND_BY_PREFIX: Record<string, SalesRecordKind> = {
  QTN: "quotation",
  SO: "order",
  INV: "invoice",
  CUS: "customer",
  // Receipts page documents: receipts, customer payments and their returns.
  RCT: "receipt",
  CPY: "receipt",
  RRC: "receipt",
  RPY: "receipt",
  // Recurring invoice templates (Sales › Recurring Bills).
  RB: "recurring",
};

export const ROUTE_BY_KIND: Record<SalesRecordKind, [moduleId: string, pageId: string]> = {
  quotation: ["sales", "quotations"],
  order: ["sales", "sales-orders"],
  invoice: ["sales", "invoices"],
  customer: ["sales", "customers"],
  receipt: ["sales", "receipts"],
  recurring: ["sales", "recurring-bills"],
};

export function kindOfCode(code: string) {
  return KIND_BY_PREFIX[code.split("-")[0]];
}
