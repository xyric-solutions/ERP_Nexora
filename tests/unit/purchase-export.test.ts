import { describe, expect, it } from "vitest";
import { purchaseDocumentSchema } from "../../packages/contracts/src/procurement/index.js";
import { purchaseCsv, purchaseExportRows } from "../../app/features/purchasing/model/purchase-export.js";

const record = () =>
  purchaseDocumentSchema.parse({
    id: "test",
    code: "PRQ-001",
    company_id: "company",
    kind: "request",
    document_date: "2026-11-10",
    currency: "USD",
    state: "draft",
    version: 1,
    total_amount: "10.00",
    created_by: "maker",
    updated_by: "maker",
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    supplier_name: null,
    source_code: null,
    lines: [
      {
        item_code: "PRD-001",
        product_id: "product",
        product_name: 'Valve, 2"',
        description: "Separate purpose",
        quantity: "1",
        uom: "Each",
        unit_price: "10.00",
        tax_percent: "0",
      },
    ],
  });
describe("Purchase exports", () => {
  it("exports persisted bill dates, terms and exact installment schedules", () => {
    const invoice = record();
    invoice.kind = "bill";
    invoice.bill_date = "2026-11-01";
    invoice.due_date = "2026-12-31";
    invoice.payment_term = "percent_30_now_balance_60_days";
    const rows = purchaseExportRows([invoice]);
    expect(rows[1].slice(-4)).toEqual([
      "2026-11-01",
      "2026-12-31",
      "30% Now, Balance 60 Days",
      "2026-11-01: 3.00 USD; 2026-12-31: 7.00 USD",
    ]);
    expect(rows[1]).toHaveLength(rows[0].length);
  });
  it("exports payment tax details once per supplier and preserves separate allocation discounts", () => {
    const document = record();
    document.kind = "payment";
    document.lines = [];
    document.allocations = [{ bill_id: "bill", amount: "75", discount: "5" }];
    document.payment_details = {
      bank_account_id: "bank",
      bank_account_name: "Operating",
      entries: [
        {
          supplier_id: "supplier",
          supplier_name: "Supplier A",
          amount: "100",
          mode: "cheque",
          reference: "CHQ-1",
          wht_rate: "2.5",
          additional_wht: "1",
        },
      ],
    };
    const rows = purchaseExportRows([document]);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.length === rows[0].length)).toBe(true);
    const supplier = Object.fromEntries(rows[0].map((header, index) => [header, rows[2][index]]));
    expect(supplier).toMatchObject({
      Bank: "Operating",
      Mode: "cheque",
      "Gross Amount": "100",
      "WHT Amount": "2.50",
      "Net Bank Amount": "96.50",
      "Unallocated Balance": "25.00",
      "Row Type": "Supplier payment",
    });
    expect(rows[1][14]).toBe("5");
  });
  it("keeps code, name and description in separate fields without splitting punctuation in names", () => {
    const rows = purchaseExportRows([record()]);
    expect(rows[0].slice(5, 8)).toEqual(["Product Code", "Product Name", "Description"]);
    expect(rows[1].slice(5, 8)).toEqual(["PRD-001", 'Valve, 2"', "Separate purpose"]);
    expect(purchaseCsv([record()])).toContain('"PRD-001","Valve, 2""","Separate purpose"');
  });
  it("neutralizes spreadsheet formulas and supports historical lines with no product name", () => {
    const document = record();
    document.lines[0].product_name = '\t=HYPERLINK("bad")';
    expect(purchaseCsv([document])).toContain('"\'\t=HYPERLINK(""bad"")"');
    delete document.lines[0].product_name;
    expect(purchaseExportRows([document])[1][6]).toBe("");
  });
});
