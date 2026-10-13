/**
 * Document types, formatting and fixtures.
 *
 * Kept apart from `document-template.tsx` so the pure logic - amount in
 * words above all - can be imported and tested directly. Node's type
 * stripping runs .ts but not .tsx.
 */

export type DocumentKind = "invoice" | "purchase-order" | "statement" | "journal-voucher";

export interface DocumentLine {
  id: string;
  code: string;
  description: string;
  quantity: number;
  uom: string;
  rate: number;
  taxRate: number;
}

export interface DocumentRecord {
  document: string;
  party: string;
  date: string;
  reference: string;
  currency: string;
  owner: string;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underThousand(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return (TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""));
  return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + underThousand(n % 100) : "");
}

/** Amount in words - a hard requirement on real commercial documents. */
export function amountInWords(value: number, currency: string): string {
  const whole = Math.floor(Math.abs(value));
  const cents = Math.round((Math.abs(value) - whole) * 100);
  if (whole === 0 && cents === 0) return `${currency} Zero only`;
  const groups: [number, string][] = [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1_000, "Thousand"]];
  let rest = whole;
  const parts: string[] = [];
  for (const [size, name] of groups) {
    if (rest >= size) {
      parts.push(underThousand(Math.floor(rest / size)) + " " + name);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(underThousand(rest));
  const words = parts.join(" ") || "Zero";
  const tail = cents ? ` and ${underThousand(cents)} Cents` : "";
  return `${currency} ${words}${tail} only`;
}

export function money(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const KIND_META: Record<DocumentKind, { title: string; partyLabel: string; numberLabel: string; showTax: boolean }> = {
  invoice: { title: "Tax Invoice", partyLabel: "Bill to", numberLabel: "Invoice no.", showTax: true },
  "purchase-order": { title: "Purchase Order", partyLabel: "Supplier", numberLabel: "Order no.", showTax: true },
  statement: { title: "Statement of Account", partyLabel: "Account", numberLabel: "Statement no.", showTax: false },
  "journal-voucher": { title: "Journal Voucher", partyLabel: "Narration", numberLabel: "Voucher no.", showTax: false },
};

/** Build plausible document lines from whatever rows a page already has. */
export function documentLinesFrom(
  rows: readonly { id: string; reference: string; amount: string }[],
  count = 4,
): DocumentLine[] {
  const uoms = ["Each", "Hour", "Box", "Kg"];
  return rows.slice(0, count).map((row, index) => {
    const numeric = Number(String(row.amount).replace(/[^0-9.]/g, "")) || 1200;
    const quantity = index + 1;
    return {
      id: row.id,
      code: row.reference,
      description: `Contracted ${index % 2 === 0 ? "supply" : "service"} against ${row.reference}`,
      quantity,
      uom: uoms[index % uoms.length],
      rate: Math.round((numeric / quantity) * 100) / 100,
      taxRate: index === 2 ? 0 : 18,
    };
  });
}
