import {
  money,
  scaled,
  paymentTotals,
  billPaymentTerms,
  billPaymentSchedule,
  type PurchaseDocument,
} from "@nexora/contracts";

export const PURCHASE_EXPORT_EVENT = "nexora:purchase-export";

/** Export identity fields separately; never split the combined UI label. */
export function purchaseExportRows(records: readonly PurchaseDocument[]) {
  const rows: string[][] = [
    [
      "Document Code",
      "Date",
      "Supplier",
      "Status",
      "Currency",
      "Product Code",
      "Product Name",
      "Description",
      "Quantity",
      "Unit",
      "Unit Price",
      "Tax %",
      "Bill ID",
      "Allocation Amount",
      "Discount",
      "Bank",
      "Mode",
      "Payment Reference",
      "Gross Amount",
      "WHT Rate %",
      "WHT Amount",
      "Additional WHT",
      "Net Bank Amount",
      "Unallocated Balance",
      "Supplier ID",
      "Row Type",
    ],
  ];
  for (const record of records) {
    const firstRow = rows.length;
    const prefix = [record.code, record.document_date, record.supplier_name ?? "", record.state, record.currency];
    for (const line of record.lines)
      rows.push([
        ...prefix,
        line.item_code,
        line.product_name ?? "",
        line.description,
        line.quantity,
        line.uom,
        line.unit_price,
        line.tax_percent,
        "",
        "",
      ]);
    for (const allocation of record.allocations)
      rows.push([
        ...prefix,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        allocation.bill_id,
        allocation.amount,
        allocation.discount ?? "0.00",
        record.payment_details?.bank_account_name ?? "",
      ]);
    for (const entry of record.payment_details?.entries ?? []) {
      // Supplier totals are separate rows: never repeat a gross voucher amount on every bill.
      const allocated =
        record.kind === "payment"
          ? money(record.allocations.reduce((sum, item) => sum + scaled(item.amount, 2), 0n))
          : "0.00";
      const totals = paymentTotals(entry, allocated);
      rows.push([
        record.code,
        record.document_date,
        entry.supplier_name ?? record.supplier_name ?? "",
        record.state,
        record.currency,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        record.payment_details?.bank_account_name ?? "",
        entry.mode,
        entry.reference,
        entry.amount,
        entry.wht_rate,
        totals.wht,
        entry.additional_wht,
        totals.net,
        record.kind === "payment" ? totals.unallocated : "",
        entry.supplier_id,
        "Supplier payment",
      ]);
    }
    const billValues = [
      record.kind === "bill" ? (record.bill_date ?? record.document_date) : "",
      record.due_date ?? "",
      billPaymentTerms.find((term) => term.value === record.payment_term)?.label ?? "",
      record.kind === "bill" && record.payment_term
        ? billPaymentSchedule(record.bill_date ?? record.document_date, record.payment_term, record.total_amount)
            .map((item) => `${item.due_date}: ${item.amount} ${record.currency}`)
            .join("; ")
        : "",
    ];
    for (let index = firstRow; index < rows.length; index++) {
      while (rows[index].length < rows[0].length) rows[index].push("");
      rows[index].push(...billValues);
    }
  }
  rows[0].push("Bill Date", "Due Date", "Payment Term", "Payment Schedule");
  return rows.map((row) => [...row, ...Array<string>(rows[0].length - row.length).fill("")]);
}

function csvCell(value: string) {
  // Neutralize spreadsheet formulas in untrusted names, codes and descriptions.
  let start = 0;
  while (start < value.length && (value.charCodeAt(start) <= 32 || /\s/u.test(value[start]))) start++;
  const text = /^[=+@-]/.test(value.slice(start)) ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}
export function purchaseCsv(records: readonly PurchaseDocument[]) {
  return (
    "\uFEFF" +
    purchaseExportRows(records)
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function downloadPurchaseCsv(records: readonly PurchaseDocument[], filename: string) {
  const url = URL.createObjectURL(new Blob([purchaseCsv(records)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
