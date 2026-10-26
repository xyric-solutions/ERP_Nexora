import { describe, expect, it } from "vitest";

import type { BankStatementMappingSnapshot } from "@nexora/contracts";
import {
  buildBankStatementObjectKey,
  mapBankStatementRows,
  normalizeBankStatementHeader,
  sanitizeBankStatementCell,
} from "../../server/api/src/modules/banking/statements/mapping.js";

const mapping: BankStatementMappingSnapshot = {
  file_format: "csv",
  delimiter: ",",
  encoding: "utf-8",
  worksheet: null,
  header_row: 1,
  date_format: "dd/MM/yyyy",
  amount_convention: "separate_debit_credit",
  signed_amount_direction: null,
  columns: {
    date: "DATE",
    payment: "Payment",
    receipt: "Receipts",
    signed_amount: null,
    reference: "Ref No.",
    details: "Detail",
    transaction_type: null,
    account_text: null,
    payment_mode: null,
  },
};

describe("Bank Statement mapping primitives", () => {
  it("normalizes Unicode headers and sanitizes cells without evaluating formulas", () => {
    expect(normalizeBankStatementHeader("  Ref\u00A0No.  ")).toBe("ref no.");
    expect(sanitizeBankStatementCell("\0  =SUM(A1:A2)\r\n")).toBe("=SUM(A1:A2)");
    expect(() => sanitizeBankStatementCell("x".repeat(4_001))).toThrow(/4,000/);
  });

  it("resolves mappings case-insensitively and rejects normalized header collisions", () => {
    const parsed = {
      format: "csv" as const,
      worksheet: null,
      headers: ["Date", "Payment", "Receipts", "Ref No.", "Detail"],
      rows: [
        {
          sourceRowNumber: 2,
          values: { Date: "22/10/2026", Payment: "", Receipts: "100", "Ref No.": "A-1", Detail: "Credit" },
        },
      ],
    };
    expect(mapBankStatementRows(parsed, mapping)).toEqual([
      {
        sourceRowNumber: 2,
        rawRow: parsed.rows[0]!.values,
        mapped: {
          date: "22/10/2026",
          payment: "",
          receipt: "100",
          signed_amount: null,
          reference: "A-1",
          details: "Credit",
          transaction_type: null,
          account_text: null,
          payment_mode: null,
        },
      },
    ]);
    expect(() => mapBankStatementRows({ ...parsed, headers: ["Ref No.", " ref\u00A0no. "] }, mapping)).toThrow(
      /duplicate normalized header/i,
    );
  });

  it("creates opaque server-owned object keys and rejects path-shaped identifiers", () => {
    expect(
      buildBankStatementObjectKey({
        tenantId: "tenant-a",
        companyId: "company-a",
        importId: "import-a",
        format: "xlsx",
      }),
    ).toBe("bank-statements/quarantine/tenant-a/company-a/import-a.xlsx");
    expect(() =>
      buildBankStatementObjectKey({
        tenantId: "../tenant",
        companyId: "company-a",
        importId: "import-a",
        format: "csv",
      }),
    ).toThrow(/identifier/i);
  });
});
