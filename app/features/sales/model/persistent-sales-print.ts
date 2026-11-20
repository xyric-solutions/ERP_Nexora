import type { SalesDocument } from "@nexora/contracts";
import { salesLabels, salesMoney, salesStateLabel } from "./persistent-sales";

/** Browser print/PDF preserves Unicode and uses actual company/source data only. */
export function printPersistentSales(record: SalesDocument, company: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => entities[char] ?? char);
  const money = (value: string) => escape(salesMoney(value, record.currency, record.decimal_places));
  const frame = document.createElement("iframe");
  frame.title = `Print ${record.code}`;
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.width = "210mm";
  frame.style.height = "297mm";
  const rows = record.lines
    .map(
      (line) =>
        `<tr><td>${escape(line.product_code ?? "Other charge")}<br>${escape(line.description)}</td><td>${escape(`${line.quantity} ${line.unit}`)}</td><td>${money(line.unit_price)}</td><td>${money(line.net_amount)}</td><td>${money(line.tax_amount)}<br>${escape(line.tax_snapshot?.name ?? record.no_tax_reason)}</td><td>${money(line.total_amount)}</td></tr>`,
    )
    .join("");
  frame.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(record.code)}</title><style>@page{size:A4;margin:16mm}body{font-family:system-ui,sans-serif;font-size:10pt;color:#000;background:#fff}h1{font-size:18pt}table{border-collapse:collapse;width:100%}th,td{padding:7pt;border-bottom:1px solid #aaa;text-align:left;vertical-align:top}thead{display:table-header-group}tr{break-inside:avoid}.facts{display:grid;grid-template-columns:1fr 1fr;gap:6pt;margin:16pt 0}.totals{text-align:right;margin-top:16pt}.notes{white-space:pre-wrap}</style></head><body><h1>${escape(company)}</h1><h2>${escape(salesLabels[record.kind].single)} ${escape(record.code)}</h2><div class="facts"><span>Customer: ${escape(record.customer_name ?? record.recurring_customers.map((customer) => customer.name).join(", "))}</span><span>Date: ${escape(record.document_date)}</span><span>Commercial status: ${escape(salesStateLabel(record.state))}</span><span>Accounting status: ${escape(salesStateLabel(record.posting_state))}</span><span>Project: ${escape(record.project_name)}</span><span>Location: ${escape(record.location_name)}</span><span>Reference: ${escape(record.reference)}</span><span>Due: ${escape(record.due_date ?? "—")}</span></div><table><thead><tr><th>Product / Service</th><th>Quantity</th><th>Unit price</th><th>Net</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals">Net: ${money(record.net_amount)}<br>Tax: ${money(record.tax_amount)}<br><strong>Total: ${money(record.total_amount)}</strong>${record.outstanding === null ? "" : `<br>Outstanding: ${money(record.outstanding)}`}</div><p class="notes">${escape(record.notes)}</p></body></html>`;
  frame.onload = () => {
    const window = frame.contentWindow;
    if (!window) {
      frame.remove();
      return;
    }
    window.addEventListener("afterprint", () => frame.remove(), { once: true });
    window.focus();
    window.print();
  };
  document.body.appendChild(frame);
}
