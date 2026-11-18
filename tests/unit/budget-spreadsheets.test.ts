import { Readable } from "node:stream";
import { describe, it, expect } from "vitest";
import { createMinimalXlsx } from "./bank-statement-xlsx-fixture.js";
import { parseBankStatementFile } from "../../server/api/src/modules/banking/statements/file-parser.js";
import { writeXlsx } from "../../server/api/src/files/xlsx.js";
describe("Budget workbook safety", () => {
  it("rejects formula cells even when they contain valid cached numbers", async () => {
    const file = createMinimalXlsx({
      rows: [["Amount"], ["100"]],
      formulaCell: { reference: "A2", formula: "50+50", result: "100" },
    });
    await expect(
      parseBankStatementFile(Readable.from(file), {
        format: "xlsx",
        worksheet: "Statement",
        headerRow: 1,
        rejectFormulas: true,
      }),
    ).rejects.toMatchObject({ code: "BANK_STATEMENT_XLSX_UNSAFE" });
  });
  it("round-trips exact amounts and keeps formula-like labels as inert text", async () => {
    const file = writeXlsx("Budget", ["Account", "Amount"], [["=1+1", "12345678901234567890.12345678"]]);
    const parsed = await parseBankStatementFile(Readable.from(file), {
      format: "xlsx",
      worksheet: "Budget",
      headerRow: 1,
      rejectFormulas: true,
    });
    expect(parsed.rows[0]?.values).toEqual({ Account: "=1+1", Amount: "12345678901234567890.12345678" });
  });
});
