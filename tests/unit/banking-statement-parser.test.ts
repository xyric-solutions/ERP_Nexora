import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  BankStatementFileError,
  parseBankStatementFile,
  type BankStatementParserLimits,
} from "../../server/api/src/modules/banking/statements/file-parser.js";
import { createMinimalXlsx, createZip } from "./bank-statement-xlsx-fixture.js";

const stream = (value: string | Buffer) => Readable.from([Buffer.isBuffer(value) ? value : Buffer.from(value)]);

describe("bounded Bank Statement parser", () => {
  it("streams quoted UTF-8 CSV, removes BOM and preserves formula-like text inertly", async () => {
    const result = await parseBankStatementFile(
      stream('\uFEFFDate,Receipt,Ref No.,Detail\n"22/10/2026","1,250.00",ABC,"=1+1"\n'),
      { format: "csv", delimiter: ",", encoding: "utf-8", headerRow: 1 },
    );

    expect(result).toMatchObject({ format: "csv", worksheet: null, headers: ["Date", "Receipt", "Ref No.", "Detail"] });
    expect(result.rows).toEqual([
      {
        sourceRowNumber: 2,
        values: { Date: "22/10/2026", Receipt: "1,250.00", "Ref No.": "ABC", Detail: "=1+1" },
      },
    ]);
  });

  it("decodes explicitly selected Windows-1252 CSV without unsafe fallback", async () => {
    const result = await parseBankStatementFile(
      stream(Buffer.concat([Buffer.from("Date,Detail\n2026-10-22,caf", "ascii"), Buffer.from([0xe9])])),
      { format: "csv", delimiter: ",", encoding: "windows-1252", headerRow: 1 },
    );
    expect(result.rows[0]?.values.Detail).toBe("café");
  });

  it("accepts exactly 1,000 rows and rejects row 1,001", async () => {
    const csv = (count: number) =>
      `Date,Receipt,Reference\n${Array.from({ length: count }, (_, index) => `2026-10-22,1,R${index}`).join("\n")}`;
    const accepted = await parseBankStatementFile(stream(csv(1_000)), {
      format: "csv",
      delimiter: ",",
      encoding: "utf-8",
      headerRow: 1,
    });
    expect(accepted.rows).toHaveLength(1_000);
    await expect(
      parseBankStatementFile(stream(csv(1_001)), {
        format: "csv",
        delimiter: ",",
        encoding: "utf-8",
        headerRow: 1,
      }),
    ).rejects.toMatchObject<Partial<BankStatementFileError>>({ code: "BANK_STATEMENT_ROW_LIMIT" });
  });

  it("rejects malformed, binary and oversized CSV without exposing content", async () => {
    await expect(
      parseBankStatementFile(stream('Date,Detail\n2026-10-22,"unterminated'), {
        format: "csv",
        delimiter: ",",
        encoding: "utf-8",
        headerRow: 1,
      }),
    ).rejects.toMatchObject<Partial<BankStatementFileError>>({ code: "BANK_STATEMENT_CSV_INVALID" });
    await expect(
      parseBankStatementFile(stream(Buffer.from("%PDF-1.7\0secret")), {
        format: "csv",
        delimiter: ",",
        encoding: "utf-8",
        headerRow: 1,
      }),
    ).rejects.toMatchObject<Partial<BankStatementFileError>>({ code: "BANK_STATEMENT_FILE_SIGNATURE" });
    await expect(
      parseBankStatementFile(stream(`Header\n${"x".repeat(300_000)}`), {
        format: "csv",
        delimiter: ",",
        encoding: "utf-8",
        headerRow: 1,
      }),
    ).rejects.toMatchObject<Partial<BankStatementFileError>>({ code: "BANK_STATEMENT_RECORD_LIMIT" });
  });

  it("reads one bounded XLSX sheet and returns cached formula values without execution", async () => {
    const workbook = createMinimalXlsx({
      rows: [
        ["Date", "Receipt", "Reference"],
        ["2026-10-22", "", "ABC"],
      ],
      formulaCell: { reference: "B2", formula: "1+1", result: "2" },
    });
    const result = await parseBankStatementFile(stream(workbook), {
      format: "xlsx",
      worksheet: "Statement",
      headerRow: 1,
    });
    expect(result).toMatchObject({ format: "xlsx", worksheet: "Statement" });
    expect(result.rows[0]?.values).toEqual({ Date: "2026-10-22", Receipt: "2", Reference: "ABC" });
  });

  it("rejects XLSX traversal, macros, external relationships, entities and ZIP bombs", async () => {
    const cases: Array<{ value: Buffer; limits: BankStatementParserLimits }> = [
      createMinimalXlsx({ rows: [["Date"]], extraEntries: [{ name: "../evil.xml", content: "bad" }] }),
      createMinimalXlsx({ rows: [["Date"]], extraEntries: [{ name: "xl/vbaProject.bin", content: "macro" }] }),
      createMinimalXlsx({ rows: [["Date"]], externalRelationship: true }),
      createMinimalXlsx({
        rows: [["Date"]],
        extraEntries: [{ name: "xl/worksheets/hidden.xml", content: "encrypted", encrypted: true }],
      }),
      createMinimalXlsx({
        rows: [["Date"]],
        workbookPreamble: '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>',
      }),
      createZip([
        { name: "[Content_Types].xml", content: "A".repeat(2_000_000) },
        { name: "xl/workbook.xml", content: "<workbook/>" },
      ]),
    ];
    for (const value of cases) {
      await expect(
        parseBankStatementFile(stream(value), { format: "xlsx", worksheet: "Statement", headerRow: 1 }),
      ).rejects.toBeInstanceOf(BankStatementFileError);
    }
  });

  it("enforces compressed, expanded, entry-count, entry-size and shared-string memory bounds", async () => {
    const workbook = createMinimalXlsx({ rows: [["Date"]] });
    const sharedStrings = createMinimalXlsx({
      rows: [["Date"]],
      extraEntries: [
        {
          name: "xl/sharedStrings.xml",
          content: `<?xml version="1.0"?><sst>${Array.from({ length: 129 }, (_, index) => `<si><t>${index}</t></si>`).join("")}</sst>`,
        },
      ],
    });
    const cases = [
      { value: workbook, limits: { maxFileBytes: workbook.length - 1 } },
      { value: workbook, limits: { maxZipEntries: 4 } },
      { value: workbook, limits: { maxZipEntryBytes: 100 } },
      { value: workbook, limits: { maxExpandedBytes: 500 } },
      { value: sharedStrings, limits: { maxRows: 1, maxColumns: 64 } },
    ];
    for (const testCase of cases) {
      await expect(
        parseBankStatementFile(stream(testCase.value), {
          format: "xlsx",
          worksheet: "Statement",
          headerRow: 1,
          limits: testCase.limits,
        }),
      ).rejects.toBeInstanceOf(BankStatementFileError);
    }
  });

  it("rejects XLSX row 1,001 and deterministic parse deadlines", async () => {
    const workbook = createMinimalXlsx({
      rows: [
        ["Date", "Receipt", "Reference"],
        ...Array.from({ length: 1_001 }, (_, index) => ["2026-10-22", "1", `R${index}`]),
      ],
    });
    await expect(
      parseBankStatementFile(stream(workbook), { format: "xlsx", worksheet: "Statement", headerRow: 1 }),
    ).rejects.toMatchObject<Partial<BankStatementFileError>>({ code: "BANK_STATEMENT_ROW_LIMIT" });
    await expect(
      parseBankStatementFile(stream(createMinimalXlsx({ rows: [["Date"]] })), {
        format: "xlsx",
        worksheet: "Statement",
        headerRow: 1,
        limits: { maxParseMs: 0 },
      }),
    ).rejects.toMatchObject<Partial<BankStatementFileError>>({ code: "BANK_STATEMENT_PARSE_TIMEOUT" });
  });
});
