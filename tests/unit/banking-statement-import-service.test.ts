import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount } from "@nexora/auth";
import type { BankStatementMappingSnapshot } from "@nexora/contracts";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import {
  BankingStatementImportService,
  normalizeBankStatementRows,
  type BankingStatementImportRepository,
} from "../../server/api/src/modules/banking/statements/service.js";

const actor: AuthenticatedAccount = {
  tenantId: "tenant-a",
  organizationName: "Tenant A",
  userId: "user-a",
  email: "user-a@example.test",
  displayName: "User A",
  roles: [],
  permissions: [
    "banking.statement_import.read",
    "banking.statement_import.create",
    "banking.statement_import.update",
    "banking.statement_import.finalize",
    "banking.statement_mapping.read",
    "banking.statement_mapping.manage",
  ],
  sessionVersion: 1,
};
const context: BankingActorContext = { tenantId: actor.tenantId, actor };

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
    date: "Date",
    payment: "Payment",
    receipt: "Receipt",
    signed_amount: null,
    reference: "Ref No.",
    details: "Detail",
    transaction_type: null,
    account_text: null,
    payment_mode: null,
  },
};

function repository(overrides: Partial<BankingStatementImportRepository> = {}): BankingStatementImportRepository {
  return {
    options: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    listMappingProfiles: vi.fn(),
    createMappingProfile: vi.fn(),
    updateMappingProfile: vi.fn(),
    prepareUpload: vi.fn().mockResolvedValue({ currency: "GBP", mappingProfile: null }),
    createImport: vi
      .fn()
      .mockResolvedValue({ id: "import-a", state: "draft", version: 1, audit_event_id: "event-a", replayed: false }),
    prepareReparse: vi.fn(),
    replaceMapping: vi.fn(),
    updateLine: vi.fn(),
    validate: vi.fn(),
    finalize: vi.fn(),
    ...overrides,
  };
}

function storage() {
  let stored = Buffer.alloc(0);
  return {
    writeBounded: vi.fn(async (request: { objectKey: string; contentType: string }, body: Readable) => {
      const chunks: Buffer[] = [];
      for await (const chunk of body) chunks.push(Buffer.from(chunk));
      stored = Buffer.concat(chunks);
      return {
        objectKey: request.objectKey,
        contentType: request.contentType,
        sizeBytes: stored.length,
        checksumSha256: createHash("sha256").update(stored).digest("hex"),
      };
    }),
    readBounded: vi.fn(async (request: { objectKey: string }) => ({
      metadata: {
        objectKey: request.objectKey,
        contentType: "text/csv",
        sizeBytes: stored.length,
        checksumSha256: createHash("sha256").update(stored).digest("hex"),
      },
      body: Readable.from([stored]),
    })),
    remove: vi.fn(async () => undefined),
  };
}

describe("BankingStatementImportService", () => {
  it("uploads, parses and passes normalized draft evidence to one repository transaction", async () => {
    const source = repository({
      prepareUpload: vi.fn().mockResolvedValue({ currency: "GBP", mappingProfile: { id: "profile-a", mapping } }),
    });
    const objects = storage();
    const service = new BankingStatementImportService(source, objects);
    const csv = "Date,Payment,Receipt,Ref No.,Detail\n22/10/2026,,1250.00,ABC,Credit";

    await expect(
      service.upload(
        context,
        {
          company_id: "company-a",
          bank_account_id: "bank-a",
          statement_reference: "STMT-001",
          date_format: "dd/MM/yyyy",
          mapping_profile_id: "profile-a",
        },
        { originalFilename: "statement.csv", sizeBytes: Buffer.byteLength(csv), body: Readable.from([csv]) },
        "idem-a",
        "correlation-a",
      ),
    ).resolves.toMatchObject({ id: "import-a", state: "draft" });

    expect(source.createImport).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        fileFormat: "csv",
        mappingProfileId: "profile-a",
        mappingSnapshot: mapping,
        lines: [
          expect.objectContaining({
            transactionDate: "2026-10-22",
            direction: "money_in",
            amount: "1250.00000000",
            currency: "GBP",
            reference: "ABC",
            validationState: "valid",
          }),
        ],
      }),
      "idem-a",
      "correlation-a",
    );
  });

  it("normalizes exact decimals, signed directions, invalid rows and deterministic duplicates", () => {
    const signed: BankStatementMappingSnapshot = {
      ...mapping,
      amount_convention: "signed_amount",
      signed_amount_direction: "positive_money_in",
      columns: { ...mapping.columns, payment: null, receipt: null, signed_amount: "Amount" },
    };
    const parsed = {
      format: "csv" as const,
      worksheet: null,
      headers: ["Date", "Amount", "Ref No.", "Detail"],
      rows: [
        { sourceRowNumber: 2, values: { Date: "22/10/2026", Amount: "1,250.50", "Ref No.": "A", Detail: "In" } },
        { sourceRowNumber: 3, values: { Date: "22/10/2026", Amount: "1,250.50", "Ref No.": "A", Detail: "In" } },
        { sourceRowNumber: 4, values: { Date: "31/02/2026", Amount: "-10", "Ref No.": "B", Detail: "Out" } },
      ],
    };
    const rows = normalizeBankStatementRows(parsed, signed, "GBP");
    expect(rows[0]).toMatchObject({
      direction: "money_in",
      amount: "1250.50000000",
      validationState: "duplicate",
      duplicateDisposition: "unresolved",
    });
    expect(rows[1]?.rowFingerprint).toBe(rows[0]?.rowFingerprint);
    expect(rows[2]).toMatchObject({ direction: "money_out", amount: "10.00000000", validationState: "error" });
    expect(rows[2]?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "DATE_INVALID" })]));
  });

  it("extracts an optional signed running balance without weakening row validation", () => {
    const balanceMapping: BankStatementMappingSnapshot = {
      ...mapping,
      columns: { ...mapping.columns, running_balance: "Balance" },
    };
    const rows = normalizeBankStatementRows(
      {
        format: "csv",
        worksheet: null,
        headers: ["Date", "Payment", "Receipt", "Ref No.", "Detail", "Balance"],
        rows: [
          {
            sourceRowNumber: 2,
            values: {
              Date: "22/10/2026",
              Payment: "125.00",
              Receipt: "",
              "Ref No.": "FEE-1",
              Detail: "Charge",
              Balance: "(875.00)",
            },
          },
          {
            sourceRowNumber: 3,
            values: {
              Date: "23/10/2026",
              Payment: "",
              Receipt: "10.00",
              "Ref No.": "INT-1",
              Detail: "Interest",
              Balance: "not-money",
            },
          },
        ],
      },
      balanceMapping,
      "GBP",
    );

    expect(rows[0]).toMatchObject({ runningBalance: "-875.00000000", validationState: "valid" });
    expect(rows[1]).toMatchObject({ runningBalance: null, validationState: "error" });
    expect(rows[1]?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "BALANCE_INVALID" })]));
  });

  it("removes a newly written object when checksum idempotency replays an existing import", async () => {
    const source = repository({
      createImport: vi
        .fn()
        .mockResolvedValue({ id: "existing", state: "draft", version: 2, audit_event_id: "event-old", replayed: true }),
    });
    const objects = storage();
    const service = new BankingStatementImportService(source, objects);
    const csv =
      "Date,Payment,Receipt,Transaction Type,Account,Payment Mode,Ref No.,Detail\n22/10/2026,10,,Transfer,Bank,Online,A,Debit";
    await expect(
      service.upload(
        context,
        {
          company_id: "company-a",
          bank_account_id: "bank-a",
          statement_reference: "STMT-002",
          date_format: "dd/MM/yyyy",
        },
        { originalFilename: "statement.csv", sizeBytes: Buffer.byteLength(csv), body: Readable.from([csv]) },
        "idem-replay",
        "correlation-replay",
      ),
    ).resolves.toMatchObject({ id: "existing", replayed: true });
    expect(objects.remove).toHaveBeenCalledTimes(1);
  });

  it("exports tenant-free CSV and XLSX templates", () => {
    const service = new BankingStatementImportService(repository(), storage());
    const csv = service.template("csv");
    const xlsx = service.template("xlsx");
    expect(csv.body.toString("utf8")).toContain(
      "Date,Payment,Receipt,Transaction Type,Account,Payment Mode,Ref No.,Detail",
    );
    expect(csv.body.toString("utf8")).not.toContain(context.tenantId);
    expect(xlsx.body.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(xlsx.body.toString("utf8")).not.toContain(context.tenantId);
  });
});
