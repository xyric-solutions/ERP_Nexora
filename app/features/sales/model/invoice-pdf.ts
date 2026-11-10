/**
 * Builds a downloadable A4 tax-invoice PDF in the browser without a library.
 *
 * Layout mirrors the on-screen invoice sheet (letterhead, bill-to block,
 * line table, amount in words, totals, remittance and signatures). The PDF
 * uses the standard Helvetica fonts, so it needs no embedded font data.
 * Prototype specimen: it carries no legal or accounting effect.
 */

import { amountInWords, figure, formatDate } from "./sales-format";
import { addressLines, customerPhone } from "./customer-model";
import type { SalesCustomer, SalesDocument } from "./sales-types";

export interface InvoicePdfInput {
  invoice: SalesDocument;
  customer: SalesCustomer | undefined;
  deliveryNo: string;
  received: number;
  balance: number;
}

export const INVOICE_ISSUER = {
  name: "Nexora Demonstration Holdings",
  address: "14 Kingsway Terrace · Level 9 · Karachi 75600",
  registration: "NTN 3140229-1 · STRN 32-77-0087-114-55 · +92 21 3555 0140",
  email: "accounts@nexora.example",
  bank: "Meridian Commercial Bank · Corporate Branch",
  account: "Account 0041-882-90117 · IBAN PK36MRDN0041882901170",
  terms:
    "Goods remain the property of Nexora Demonstration Holdings until paid in full. Queries must be raised within seven days of the invoice date. Prototype specimen with no legal or accounting effect.",
} as const;

/* Helvetica advance widths (1/1000 em) for ASCII 32–126, from the standard AFM. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LEFT = 50;
const RIGHT = PAGE_W - 50;

/** PDF base fonts use WinAnsi; keep text to printable ASCII. */
function ascii(text: string): string {
  return text
    .replace(/[·•]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, "x")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7e]/g, "?");
}

function width(text: string, size: number, bold = false): number {
  let units = 0;
  for (const char of ascii(text)) units += HELVETICA[char.charCodeAt(0) - 32] ?? 556;
  return (units / 1000) * size * (bold ? 1.06 : 1);
}

function wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of ascii(text).split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (width(candidate, size, bold) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

const escapePdf = (text: string) => ascii(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const n = (value: number) => (Math.round(value * 100) / 100).toString();

class Page {
  ops: string[] = [];
  /** `top` is measured from the top edge, like the screen layout. */
  text(value: string, x: number, top: number, size: number, options: { bold?: boolean; align?: "left" | "right"; gray?: number } = {}) {
    const bold = options.bold ?? false;
    const drawX = options.align === "right" ? x - width(value, size, bold) : x;
    this.ops.push(`${n(options.gray ?? 0.1)} g BT /${bold ? "F2" : "F1"} ${n(size)} Tf ${n(drawX)} ${n(PAGE_H - top)} Td (${escapePdf(value)}) Tj ET`);
  }
  rule(top: number, thickness = 0.5, gray = 0.75, from = LEFT, to = RIGHT) {
    this.ops.push(`${n(gray)} G ${n(thickness)} w ${n(from)} ${n(PAGE_H - top)} m ${n(to)} ${n(PAGE_H - top)} l S`);
  }
  box(x: number, top: number, w: number, h: number, gray: number) {
    this.ops.push(`${n(gray)} g ${n(x)} ${n(PAGE_H - top - h)} ${n(w)} ${n(h)} re f`);
  }
  stamp(value: string, x: number, top: number) {
    const angle = (12 * Math.PI) / 180;
    const cos = n(Math.cos(angle));
    const sin = n(Math.sin(angle));
    this.ops.push(`0.18 0.49 0.33 rg BT /F2 30 Tf ${cos} ${sin} -${sin} ${cos} ${n(x)} ${n(PAGE_H - top)} Tm (${escapePdf(value)}) Tj ET`);
  }
}

const COL = { index: LEFT, desc: LEFT + 22, qty: 330, unit: 340, rate: 430, tax: 478, amount: RIGHT };

function tableHeader(page: Page, top: number) {
  const size = 7;
  const head = (label: string, x: number, align: "left" | "right" = "left") =>
    page.text(label, x, top, size, { bold: true, align, gray: 0.1 });
  head("#", COL.index);
  head("DESCRIPTION", COL.desc);
  head("QTY", COL.qty, "right");
  head("UNIT", COL.unit);
  head("RATE", COL.rate, "right");
  head("TAX %", COL.tax, "right");
  head("AMOUNT", COL.amount, "right");
  page.rule(top + 6, 0.9, 0.1);
}

export function buildInvoicePdf({ invoice, customer, deliveryNo, received, balance }: InvoicePdfInput): Blob {
  const pages: Page[] = [];
  let page = new Page();
  pages.push(page);
  const muted = 0.36;

  // Letterhead
  page.box(LEFT, 48, 30, 30, 0.1);
  page.text("N", LEFT + 9.5, 69, 16, { bold: true, gray: 1 });
  page.text(INVOICE_ISSUER.name, LEFT + 42, 60, 14, { bold: true });
  page.text(INVOICE_ISSUER.address, LEFT + 42, 73, 7.5, { gray: muted });
  page.text(INVOICE_ISSUER.registration, LEFT + 42, 83, 7.5, { gray: muted });
  page.text(INVOICE_ISSUER.email, LEFT + 42, 93, 7.5, { gray: muted });
  page.text("Tax Invoice", RIGHT, 66, 21, { align: "right" });
  page.text("PROTOTYPE SPECIMEN", RIGHT, 82, 7, { bold: true, align: "right", gray: muted });
  page.rule(106, 1.6, 0.1);

  // Bill to + document facts
  page.text("BILL TO", LEFT, 128, 7, { bold: true, gray: muted });
  page.text(customer?.name ?? "—", LEFT, 144, 12, { bold: true });
  const billLines = [
    ...addressLines(customer?.billing),
    `NTN ${customer?.ntn || "-"}${customer?.strn ? ` - STRN ${customer.strn}` : ""}`,
    customer && (customer.contactName || customerPhone(customer))
      ? `Attn: ${[customer.contactName, customerPhone(customer)].filter(Boolean).join(" - ")}`
      : "",
  ].filter(Boolean);
  billLines.forEach((value, index) => page.text(value, LEFT, 158 + index * 11.5, 8.5, { gray: muted }));
  const facts: [string, string][] = [
    ["INVOICE NO.", invoice.code],
    ["INVOICE DATE", formatDate(invoice.date)],
    ["DUE DATE", formatDate(invoice.date2)],
    ["PAYMENT TERMS", invoice.terms],
    ["SALES ORDER", invoice.links.order ?? "-"],
    ["DELIVERY", deliveryNo || "-"],
    ["CUSTOMER REF.", invoice.reference || "-"],
    ["CURRENCY", "PKR"],
  ];
  facts.forEach(([label, value], index) => {
    const x = index % 2 === 0 ? 318 : 440;
    const top = 128 + Math.floor(index / 2) * 26;
    page.text(label, x, top, 7, { bold: true, gray: muted });
    page.text(value, x, top + 11, 9, { bold: true });
  });
  page.rule(222, 0.5, 0.75);

  // Lines
  let top = 246;
  tableHeader(page, top);
  top += 22;
  invoice.lines.forEach((item, index) => {
    if (top > 760) {
      page = new Page();
      pages.push(page);
      top = 60;
      tableHeader(page, top);
      top += 22;
    }
    page.text(String(index + 1), COL.index, top, 8.5, { gray: muted });
    page.text(item.sku || "Charge", COL.desc, top, 8.5, { bold: true });
    page.text(item.desc, COL.desc, top + 11, 7.5, { gray: muted });
    page.text(figure(item.qty), COL.qty, top, 8.5, { align: "right" });
    page.text(item.uom || "Each", COL.unit, top, 8.5);
    page.text(figure(item.rate), COL.rate, top, 8.5, { align: "right" });
    page.text(Number(item.tax).toFixed(1), COL.tax, top, 8.5, { align: "right" });
    page.text(figure(item.qty * item.rate), COL.amount, top, 8.5, { align: "right" });
    page.rule(top + 18, 0.4, 0.8);
    top += 30;
  });

  // Amount in words, terms and totals
  if (top > 600) {
    page = new Page();
    pages.push(page);
    top = 60;
  }
  const sub = invoice.lines.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const tax = invoice.lines.reduce((sum, item) => sum + (item.qty * item.rate * item.tax) / 100, 0);
  const total = sub + tax;
  page.text("AMOUNT IN WORDS", LEFT, top + 4, 7, { bold: true, gray: muted });
  let wordsTop = top + 18;
  for (const lineText of wrap(amountInWords(total), 10.5, 250, true)) {
    page.text(lineText, LEFT, wordsTop, 10.5, { bold: true });
    wordsTop += 13;
  }
  wordsTop += 6;
  for (const lineText of wrap(`${invoice.notes ? `${invoice.notes} ` : ""}${INVOICE_ISSUER.terms}`, 7.5, 250)) {
    page.text(lineText, LEFT, wordsTop, 7.5, { gray: muted });
    wordsTop += 10;
  }
  const totalsLeft = 335;
  let rowTop = top + 6;
  const totalRow = (label: string, value: string, strong = false) => {
    page.text(label, totalsLeft, rowTop, strong ? 8.5 : 8.5, { bold: strong, gray: strong ? 0.1 : muted });
    page.text(value, RIGHT, rowTop, strong ? 12 : 9, { bold: true, align: "right" });
    page.rule(rowTop + (strong ? 9 : 6), strong ? 1.4 : 0.5, strong ? 0.1 : 0.78, totalsLeft, RIGHT);
    rowTop += strong ? 24 : 19;
  };
  totalRow("Subtotal", `PKR ${figure(sub)}`);
  totalRow("Sales tax", `PKR ${figure(tax)}`);
  page.rule(rowTop - 13, 1.4, 0.1, totalsLeft, RIGHT);
  rowTop += 2;
  totalRow("TOTAL DUE", `PKR ${figure(total)}`, true);
  if (received > 0) {
    totalRow("Received", `PKR ${figure(received)}`);
    totalRow("Balance due", `PKR ${figure(balance)}`);
  }
  if (invoice.status === "Paid") page.stamp("PAID", 420, 190);

  // Remittance and signatures
  const footTop = Math.max(wordsTop, rowTop) + 30;
  page.rule(footTop, 0.5, 0.75);
  page.text("REMITTANCE", LEFT, footTop + 16, 7, { bold: true, gray: muted });
  page.text(INVOICE_ISSUER.bank, LEFT, footTop + 29, 7.5, { gray: muted });
  page.text(INVOICE_ISSUER.account, LEFT, footTop + 39, 7.5, { gray: muted });
  page.text(`Quote ${invoice.code} on every payment.`, LEFT, footTop + 49, 7.5, { gray: muted });
  ["Prepared by", "Reviewed by", "Authorised signatory"].forEach((label, index) => {
    const x = 330 + index * 74;
    page.rule(footTop + 40, 0.5, 0.6, x, x + 64);
    page.text(label, x + 32 - width(label, 7) / 2, footTop + 50, 7, { gray: muted });
  });

  return assemble(pages);
}

function assemble(pages: Page[]): Blob {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const stream = page.ops.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([new TextEncoder().encode(body)], { type: "application/pdf" });
}

export function downloadInvoicePdf(input: InvoicePdfInput) {
  const url = URL.createObjectURL(buildInvoicePdf(input));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${input.invoice.code}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
