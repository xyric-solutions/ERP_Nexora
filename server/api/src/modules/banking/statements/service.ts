import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { deflateRawSync } from "node:zlib";

import type {
  BankStatementFileFormat,
  BankStatementImportDetail,
  BankStatementImportDirectory,
  BankStatementImportDirectoryQuery,
  BankStatementImportMutationResult,
  BankStatementImportOptions,
  BankStatementImportOptionsQuery,
  BankStatementMappingProfile,
  BankStatementMappingProfileDirectory,
  BankStatementMappingProfileDirectoryQuery,
  BankStatementMappingSnapshot,
  BankStatementUploadFields,
  CreateBankStatementMappingProfileRequest,
  FinalizeBankStatementImportRequest,
  UpdateBankStatementImportMappingRequest,
  UpdateBankStatementLineRequest,
  UpdateBankStatementMappingProfileRequest,
  ValidateBankStatementImportRequest,
} from "@nexora/contracts";
import type { ObjectStorage, StoredObjectMetadata } from "@nexora/domain/storage";

import { BankingApiError, type BankingActorContext } from "../source-repository.js";
import { parseBankStatementFile, type ParsedBankStatement } from "./file-parser.js";
import { buildBankStatementObjectKey, mapBankStatementRows } from "./mapping.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const TEMPLATE_HEADERS = [
  "Date",
  "Payment",
  "Receipt",
  "Transaction Type",
  "Account",
  "Payment Mode",
  "Ref No.",
  "Detail",
  "Running Balance",
] as const;

export type NormalizedBankStatementLine = {
  sourceRowNumber: number;
  rawRow: Record<string, string | null>;
  transactionDate: string | null;
  direction: "money_in" | "money_out" | null;
  amount: string | null;
  currency: string;
  reference: string | null;
  details: string | null;
  transactionType: string | null;
  accountText: string | null;
  paymentMode: string | null;
  runningBalance: string | null;
  rowFingerprint: string;
  inclusionState: "included";
  exclusionReason: null;
  validationState: "valid" | "warning" | "duplicate" | "error";
  duplicateDisposition: "not_applicable" | "unresolved";
  issues: Array<{ code: string; severity: "warning" | "error"; field: string | null; message: string }>;
};

export type CreateBankStatementImportCommand = {
  id: string;
  fields: BankStatementUploadFields;
  originalFilename: string;
  fileFormat: BankStatementFileFormat;
  detectedMediaType:
    "text/csv" | "application/csv" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  mappingProfileId: string | null;
  mappingSnapshot: BankStatementMappingSnapshot;
  object: StoredObjectMetadata;
  lines: NormalizedBankStatementLine[];
};

export interface BankingStatementImportRepository {
  options(context: BankingActorContext, query: BankStatementImportOptionsQuery): Promise<BankStatementImportOptions>;
  list(context: BankingActorContext, query: BankStatementImportDirectoryQuery): Promise<BankStatementImportDirectory>;
  get(context: BankingActorContext, id: string): Promise<BankStatementImportDetail>;
  listMappingProfiles(
    context: BankingActorContext,
    query: BankStatementMappingProfileDirectoryQuery,
  ): Promise<BankStatementMappingProfileDirectory>;
  createMappingProfile(
    context: BankingActorContext,
    input: CreateBankStatementMappingProfileRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementMappingProfile>;
  updateMappingProfile(
    context: BankingActorContext,
    id: string,
    input: UpdateBankStatementMappingProfileRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementMappingProfile>;
  prepareUpload(
    context: BankingActorContext,
    fields: BankStatementUploadFields,
  ): Promise<{ currency: string; mappingProfile: { id: string; mapping: BankStatementMappingSnapshot } | null }>;
  createImport(
    context: BankingActorContext,
    command: CreateBankStatementImportCommand,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult>;
  prepareReparse(
    context: BankingActorContext,
    id: string,
    expectedVersion: number,
  ): Promise<{
    currency: string;
    fileFormat: BankStatementFileFormat;
    objectKey: string;
    byteSize: number;
    checksumSha256: string;
  }>;
  replaceMapping(
    context: BankingActorContext,
    id: string,
    input: UpdateBankStatementImportMappingRequest,
    lines: NormalizedBankStatementLine[],
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult>;
  updateLine(
    context: BankingActorContext,
    importId: string,
    lineId: string,
    input: UpdateBankStatementLineRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult>;
  validate(
    context: BankingActorContext,
    id: string,
    input: ValidateBankStatementImportRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult>;
  finalize(
    context: BankingActorContext,
    id: string,
    input: FinalizeBankStatementImportRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult>;
}

type StatementStorage = Pick<ObjectStorage, "writeBounded" | "readBounded" | "remove">;

export class BankingStatementImportService {
  constructor(
    private readonly repository: BankingStatementImportRepository,
    private readonly storage: StatementStorage,
  ) {}

  options(context: BankingActorContext, query: BankStatementImportOptionsQuery) {
    return this.repository.options(context, query);
  }

  list(context: BankingActorContext, query: BankStatementImportDirectoryQuery) {
    return this.repository.list(context, query);
  }

  get(context: BankingActorContext, id: string) {
    return this.repository.get(context, id);
  }

  listMappingProfiles(context: BankingActorContext, query: BankStatementMappingProfileDirectoryQuery) {
    return this.repository.listMappingProfiles(context, query);
  }

  createMappingProfile(
    context: BankingActorContext,
    input: CreateBankStatementMappingProfileRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.createMappingProfile(context, input, idempotencyKey, correlationId);
  }

  updateMappingProfile(
    context: BankingActorContext,
    id: string,
    input: UpdateBankStatementMappingProfileRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.updateMappingProfile(context, id, input, idempotencyKey, correlationId);
  }

  async upload(
    context: BankingActorContext,
    fields: BankStatementUploadFields,
    file: { originalFilename: string; sizeBytes: number; body: Readable },
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult> {
    const format = fileFormat(file.originalFilename);
    validateUploadFile(file.originalFilename, file.sizeBytes);
    const authority = await this.repository.prepareUpload(context, fields);
    if (fields.mapping_profile_id && !authority.mappingProfile) {
      throw new BankingApiError(
        400,
        "STATEMENT_MAPPING_PROFILE_INVALID",
        "The selected mapping profile is unavailable.",
      );
    }
    const mapping = authority.mappingProfile?.mapping ?? standardMapping(format, fields.date_format);
    if (mapping.file_format !== format) {
      throw new BankingApiError(
        400,
        "STATEMENT_MAPPING_FORMAT_MISMATCH",
        "The mapping profile does not match the uploaded file format.",
      );
    }
    const importId = randomUUID();
    const objectKey = buildBankStatementObjectKey({
      tenantId: context.tenantId,
      companyId: fields.company_id,
      importId,
      format,
    });
    const detectedMediaType = mediaType(format);
    let stored: StoredObjectMetadata | null = null;
    try {
      stored = await this.storage.writeBounded(
        {
          objectKey,
          contentType: detectedMediaType,
          sizeBytes: file.sizeBytes,
          maxBytes: MAX_FILE_BYTES,
          timeoutMs: 30_000,
        },
        file.body,
      );
      const content = await this.storage.readBounded({
        objectKey,
        maxBytes: MAX_FILE_BYTES,
        checksumSha256: stored.checksumSha256,
        timeoutMs: 30_000,
      });
      const parsed = await parseBankStatementFile(content.body, parserOptions(mapping));
      const result = await this.repository.createImport(
        context,
        {
          id: importId,
          fields,
          originalFilename: file.originalFilename,
          fileFormat: format,
          detectedMediaType,
          mappingProfileId: authority.mappingProfile?.id ?? null,
          mappingSnapshot: mapping,
          object: stored,
          lines: normalizeBankStatementRows(parsed, mapping, authority.currency),
        },
        idempotencyKey,
        correlationId,
      );
      if (result.replayed) await this.storage.remove(objectKey);
      return result;
    } catch (error) {
      if (!stored) throw mapStatementError(error);
      try {
        await this.storage.remove(stored.objectKey);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Bank Statement upload cleanup failed.");
      }
      throw mapStatementError(error);
    }
  }

  async updateMapping(
    context: BankingActorContext,
    id: string,
    input: UpdateBankStatementImportMappingRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult> {
    const authority = await this.repository.prepareReparse(context, id, input.expected_version);
    if (input.mapping.file_format !== authority.fileFormat) {
      throw new BankingApiError(
        400,
        "STATEMENT_MAPPING_FORMAT_MISMATCH",
        "The mapping does not match the stored file format.",
      );
    }
    const object = await this.storage.readBounded({
      objectKey: authority.objectKey,
      maxBytes: Math.min(MAX_FILE_BYTES, authority.byteSize),
      checksumSha256: authority.checksumSha256,
      timeoutMs: 30_000,
    });
    const parsed = await parseBankStatementFile(object.body, parserOptions(input.mapping));
    const lines = normalizeBankStatementRows(parsed, input.mapping, authority.currency);
    return this.repository.replaceMapping(context, id, input, lines, idempotencyKey, correlationId);
  }

  updateLine(
    context: BankingActorContext,
    importId: string,
    lineId: string,
    input: UpdateBankStatementLineRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.updateLine(context, importId, lineId, input, idempotencyKey, correlationId);
  }

  validate(
    context: BankingActorContext,
    id: string,
    input: ValidateBankStatementImportRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.validate(context, id, input, idempotencyKey, correlationId);
  }

  finalize(
    context: BankingActorContext,
    id: string,
    input: FinalizeBankStatementImportRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.repository.finalize(context, id, input, idempotencyKey, correlationId);
  }

  template(format: BankStatementFileFormat): { filename: string; contentType: string; body: Buffer } {
    if (format === "csv") {
      const body = Buffer.from(`${TEMPLATE_HEADERS.join(",")}\r\n`, "utf8");
      return { filename: "nexora-bank-statement-template.csv", contentType: "text/csv; charset=utf-8", body };
    }
    return {
      filename: "nexora-bank-statement-template.xlsx",
      contentType: mediaType("xlsx"),
      body: createTemplateXlsx(),
    };
  }
}

export function normalizeBankStatementRows(
  parsed: ParsedBankStatement,
  mapping: BankStatementMappingSnapshot,
  currency: string,
): NormalizedBankStatementLine[] {
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BankingApiError(500, "STATEMENT_BANK_CURRENCY_INVALID", "The Bank Account currency is invalid.");
  }
  let mappedRows: ReturnType<typeof mapBankStatementRows>;
  try {
    mappedRows = mapBankStatementRows(parsed, mapping);
  } catch {
    throw new BankingApiError(
      400,
      "STATEMENT_MAPPING_INVALID",
      "The selected mapping does not match the Bank Statement columns.",
    );
  }
  const rows = mappedRows.map((row): NormalizedBankStatementLine => {
    const issues: NormalizedBankStatementLine["issues"] = [];
    const transactionDate = parseDate(row.mapped.date, mapping.date_format);
    if (!transactionDate) issues.push(issue("DATE_INVALID", "date", "The transaction date is invalid."));
    const amount = resolveAmount(row.mapped, mapping, issues);
    const reference = boundedValue(row.mapped.reference, 500, "REFERENCE_TOO_LONG", "reference", issues);
    const details = boundedValue(row.mapped.details, 500, "DETAILS_TOO_LONG", "details", issues);
    const transactionType = boundedValue(
      row.mapped.transaction_type,
      160,
      "TRANSACTION_TYPE_TOO_LONG",
      "transaction_type",
      issues,
    );
    const accountText = boundedValue(row.mapped.account_text, 200, "ACCOUNT_TOO_LONG", "account_text", issues);
    const paymentMode = boundedValue(row.mapped.payment_mode, 160, "PAYMENT_MODE_TOO_LONG", "payment_mode", issues);
    const runningBalanceValue = parseDecimal(row.mapped.running_balance, true);
    if (runningBalanceValue === undefined) {
      issues.push(issue("BALANCE_INVALID", "running_balance", "The running balance must be a valid decimal."));
    }
    const runningBalance = runningBalanceValue ? formatAmount(runningBalanceValue.scaled) : null;
    if (!reference && !details) {
      issues.push(issue("REFERENCE_OR_DETAILS_REQUIRED", null, "A reference or detail is required."));
    }
    const rowFingerprint = fingerprint({
      transactionDate,
      direction: amount.direction,
      amount: amount.amount,
      currency,
      reference,
      details,
      transactionType,
      accountText,
      paymentMode,
      runningBalance,
    });
    return {
      sourceRowNumber: row.sourceRowNumber,
      rawRow: row.rawRow,
      transactionDate,
      direction: amount.direction,
      amount: amount.amount,
      currency,
      reference,
      details,
      transactionType,
      accountText,
      paymentMode,
      runningBalance,
      rowFingerprint,
      inclusionState: "included",
      exclusionReason: null,
      validationState: issues.some((value) => value.severity === "error") ? "error" : "valid",
      duplicateDisposition: "not_applicable",
      issues,
    };
  });
  const occurrences = new Map<string, number>();
  for (const row of rows) occurrences.set(row.rowFingerprint, (occurrences.get(row.rowFingerprint) ?? 0) + 1);
  return rows.map((row) =>
    row.validationState === "valid" && (occurrences.get(row.rowFingerprint) ?? 0) > 1
      ? { ...row, validationState: "duplicate", duplicateDisposition: "unresolved" }
      : row,
  );
}

function resolveAmount(
  mapped: Record<keyof BankStatementMappingSnapshot["columns"], string | null>,
  mapping: BankStatementMappingSnapshot,
  issues: NormalizedBankStatementLine["issues"],
): { direction: "money_in" | "money_out" | null; amount: string | null } {
  if (mapping.amount_convention === "signed_amount") {
    const parsed = parseDecimal(mapped.signed_amount, true);
    if (!parsed || parsed.scaled === 0n) {
      issues.push(issue("AMOUNT_INVALID", "signed_amount", "The signed amount must be a non-zero decimal."));
      return { direction: null, amount: null };
    }
    const positiveMeansIn = mapping.signed_amount_direction === "positive_money_in";
    return {
      direction: parsed.scaled > 0n === positiveMeansIn ? "money_in" : "money_out",
      amount: formatAmount(parsed.scaled < 0n ? -parsed.scaled : parsed.scaled),
    };
  }
  const payment = parseDecimal(mapped.payment, false);
  const receipt = parseDecimal(mapped.receipt, false);
  if (payment === undefined || receipt === undefined) {
    issues.push(issue("AMOUNT_INVALID", null, "Payment and receipt values must be non-negative decimals."));
    return { direction: null, amount: null };
  }
  const paymentValue = payment?.scaled ?? 0n;
  const receiptValue = receipt?.scaled ?? 0n;
  if (paymentValue > 0n === receiptValue > 0n) {
    issues.push(issue("AMOUNT_DIRECTION_INVALID", null, "Enter exactly one positive payment or receipt amount."));
    return { direction: null, amount: null };
  }
  return paymentValue > 0n
    ? { direction: "money_out", amount: formatAmount(paymentValue) }
    : { direction: "money_in", amount: formatAmount(receiptValue) };
}

function parseDecimal(value: string | null, signed: boolean): { scaled: bigint } | null | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const negativeParentheses = trimmed.startsWith("(") && trimmed.endsWith(")");
  const source = negativeParentheses ? `-${trimmed.slice(1, -1)}` : trimmed;
  if (!signed && source.startsWith("-")) return undefined;
  const sign = source.startsWith("-") ? -1n : 1n;
  const unsigned = /^[+-]/u.test(source) ? source.slice(1) : source;
  if (!/^(?:0|[1-9]\d{0,29})(?:\.\d{1,8})?$|^(?:[1-9]\d{0,2})(?:,\d{3})+(?:\.\d{1,8})?$/u.test(unsigned)) {
    return undefined;
  }
  const [integer = "0", fraction = ""] = unsigned.replaceAll(",", "").split(".");
  return { scaled: sign * (BigInt(integer) * 100_000_000n + BigInt(fraction.padEnd(8, "0"))) };
}

function formatAmount(value: bigint): string {
  const digits = value.toString().padStart(9, "0");
  return `${digits.slice(0, -8)}.${digits.slice(-8)}`;
}

function parseDate(value: string | null, format: BankStatementMappingSnapshot["date_format"]): string | null {
  if (!value) return null;
  const parts = value.trim().split(format.includes("/") ? "/" : "-");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/u.test(part))) return null;
  const numbers = parts.map(Number);
  const [year, month, day] = format.startsWith("yyyy")
    ? [numbers[0], numbers[1], numbers[2]]
    : format.startsWith("MM")
      ? [numbers[2], numbers[0], numbers[1]]
      : [numbers[2], numbers[1], numbers[0]];
  if (year === undefined || month === undefined || day === undefined || year < 1900 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function boundedValue(
  value: string | null,
  maximum: number,
  code: string,
  field: string,
  issues: NormalizedBankStatementLine["issues"],
): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > maximum) {
    issues.push(issue(code, field, `The mapped value exceeds ${maximum} characters.`));
    return null;
  }
  return normalized;
}

function issue(code: string, field: string | null, message: string) {
  return { code, severity: "error" as const, field, message };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function parserOptions(mapping: BankStatementMappingSnapshot) {
  return mapping.file_format === "csv"
    ? {
        format: "csv" as const,
        delimiter: mapping.delimiter ?? ",",
        encoding: mapping.encoding ?? "utf-8",
        headerRow: mapping.header_row,
      }
    : { format: "xlsx" as const, worksheet: mapping.worksheet ?? "Statement", headerRow: mapping.header_row };
}

function standardMapping(
  format: BankStatementFileFormat,
  dateFormat: BankStatementMappingSnapshot["date_format"],
): BankStatementMappingSnapshot {
  return {
    file_format: format,
    delimiter: format === "csv" ? "," : null,
    encoding: format === "csv" ? "utf-8" : null,
    worksheet: format === "xlsx" ? "Statement" : null,
    header_row: 1,
    date_format: dateFormat,
    amount_convention: "separate_debit_credit",
    signed_amount_direction: null,
    columns: {
      date: "Date",
      payment: "Payment",
      receipt: "Receipt",
      signed_amount: null,
      reference: "Ref No.",
      details: "Detail",
      transaction_type: "Transaction Type",
      account_text: "Account",
      payment_mode: "Payment Mode",
      running_balance: null,
    },
  };
}

function fileFormat(filename: string): BankStatementFileFormat {
  const lower = filename.toLocaleLowerCase("en-US");
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  throw new BankingApiError(400, "STATEMENT_FILE_FORMAT_UNSUPPORTED", "Upload a CSV or XLSX Bank Statement.");
}

function validateUploadFile(filename: string, sizeBytes: number): void {
  if (!filename.trim() || filename.length > 255 || /[\\/]/u.test(filename)) {
    throw new BankingApiError(400, "STATEMENT_FILENAME_INVALID", "The Bank Statement filename is invalid.");
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) {
    throw new BankingApiError(413, "STATEMENT_FILE_SIZE_INVALID", "The Bank Statement must be no larger than 25 MiB.");
  }
}

function mediaType(format: BankStatementFileFormat) {
  return format === "csv"
    ? ("text/csv" as const)
    : ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const);
}

function mapStatementError(error: unknown): Error {
  if (error instanceof BankingApiError) return error;
  if (error instanceof Error && error.name === "BankStatementFileError") {
    return new BankingApiError(400, "STATEMENT_FILE_INVALID", "The Bank Statement could not be parsed safely.");
  }
  return error instanceof Error ? error : new Error("The Bank Statement operation failed.");
}

type ZipEntry = { name: string; content: string };

function createTemplateXlsx(): Buffer {
  const cells = TEMPLATE_HEADERS.map(
    (header, index) => `<c r="${columnName(index)}1" t="inlineStr"><is><t>${escapeXml(header)}</t></is></c>`,
  ).join("");
  return createZip([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    },
    {
      name: "_rels/.rels",
      content:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      name: "xl/workbook.xml",
      content:
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Statement" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells}</row></sheetData></worksheet>`,
    },
  ]);
}

function createZip(entries: ZipEntry[]): Buffer {
  const files: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const compressed = deflateRawSync(content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    files.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, central, end]);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function columnName(index: number): string {
  return String.fromCharCode(65 + index);
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
