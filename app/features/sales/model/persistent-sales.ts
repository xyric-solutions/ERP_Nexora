import {
  decimal,
  decimalText,
  type SalesKind,
  type SalesSource,
  salesDocumentInputSchema,
  salesLineInputSchema,
} from "@nexora/contracts";
import { ApiError } from "@/lib/api/generated";

export const salesPages: Record<SalesKind, string> = {
  quotation: "quotations",
  order: "sales-orders",
  delivery: "pick-pack-delivery",
  invoice: "invoices",
  return: "pick-pack-delivery",
  credit: "invoices",
  recurring: "recurring-bills",
};
export const salesLabels: Record<SalesKind, { single: string; plural: string }> = {
  quotation: { single: "Quotation", plural: "Quotations" },
  order: { single: "Sales order", plural: "Sales Orders" },
  delivery: { single: "Delivery", plural: "Delivery" },
  invoice: { single: "Invoice", plural: "Invoices" },
  return: { single: "Sale return", plural: "Sale Returns" },
  credit: { single: "Credit note", plural: "Credit Notes" },
  recurring: { single: "Recurring bill", plural: "Recurring Bills" },
};
export function salesQuery(value: Record<string, string | number | undefined>) {
  return `?${new URLSearchParams(Object.entries(value).flatMap(([key, value]) => (value === undefined || value === "" ? [] : [[key, String(value)]])))}`;
}
export function salesToday() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function salesError(error: unknown) {
  return error instanceof ApiError
    ? `${error.message}${error.correlationId ? ` Reference ${error.correlationId}` : ""}`
    : error instanceof Error
      ? error.message
      : "The Sales request failed. Check the connection and retry.";
}
export function salesMoney(value: string, currency: string, precision: number) {
  const units = decimal(value, 8, true),
    divisor = 10n ** BigInt(8 - precision);
  const text = units % divisor === 0n ? decimalText(units / divisor, precision) : value;
  const [whole = "0", fraction] = text.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
}
export function editSales(source: SalesSource) {
  return salesDocumentInputSchema
    .strip()
    .parse({ ...source, lines: source.lines.map((line) => salesLineInputSchema.strip().parse(line)) });
}
const states: Record<string, string> = {
  draft: "Draft",
  submitted: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  unprepared: "Not prepared",
  posted: "Posted",
  reversed: "Reversed",
};
export const salesStateLabel = (state: string) => states[state] ?? state;
