import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { parse } from "csv-parse";
import { SaxesParser, type SaxesTagPlain } from "saxes";
import yauzl, { type Entry, type ZipFile } from "yauzl";

import { sanitizeBankStatementCell } from "./mapping.js";

const DEFAULT_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxRows: 1_000,
  maxColumns: 64,
  maxCellCharacters: 4_000,
  maxRecordBytes: 256 * 1024,
  maxZipEntries: 256,
  maxExpandedBytes: 64 * 1024 * 1024,
  maxZipEntryBytes: 16 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxParseMs: 15_000,
} as const;

export type BankStatementParserLimits = Partial<{
  maxFileBytes: number;
  maxRows: number;
  maxColumns: number;
  maxCellCharacters: number;
  maxRecordBytes: number;
  maxZipEntries: number;
  maxExpandedBytes: number;
  maxZipEntryBytes: number;
  maxCompressionRatio: number;
  maxParseMs: number;
}>;
type ResolvedBankStatementParserLimits = Required<BankStatementParserLimits>;

export type ParsedBankStatement = {
  format: "csv" | "xlsx";
  worksheet: string | null;
  headers: string[];
  rows: Array<{ sourceRowNumber: number; values: Record<string, string | null> }>;
};

export type ParseBankStatementOptions =
  | {
      format: "csv";
      delimiter: string;
      encoding: "utf-8" | "windows-1252";
      headerRow: number;
      limits?: BankStatementParserLimits;
    }
  | {
      format: "xlsx";
      worksheet: string;
      headerRow: number;
      limits?: BankStatementParserLimits;
    };

export class BankStatementFileError extends Error {
  constructor(
    readonly code:
      | "BANK_STATEMENT_FILE_LIMIT"
      | "BANK_STATEMENT_FILE_SIGNATURE"
      | "BANK_STATEMENT_CSV_INVALID"
      | "BANK_STATEMENT_RECORD_LIMIT"
      | "BANK_STATEMENT_ROW_LIMIT"
      | "BANK_STATEMENT_COLUMN_LIMIT"
      | "BANK_STATEMENT_CELL_LIMIT"
      | "BANK_STATEMENT_PARSE_TIMEOUT"
      | "BANK_STATEMENT_XLSX_INVALID"
      | "BANK_STATEMENT_XLSX_UNSAFE",
    message: string,
  ) {
    super(message);
    this.name = "BankStatementFileError";
  }
}

export async function parseBankStatementFile(
  source: Readable,
  options: ParseBankStatementOptions,
): Promise<ParsedBankStatement> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const startedAt = Date.now();
  assertDeadline(startedAt, limits.maxParseMs);
  if (!Number.isInteger(options.headerRow) || options.headerRow < 1 || options.headerRow > 100) {
    throw new BankStatementFileError("BANK_STATEMENT_XLSX_INVALID", "The header row must be between 1 and 100.");
  }
  return options.format === "csv"
    ? parseCsv(source, options, limits, startedAt)
    : parseXlsx(source, options, limits, startedAt);
}

async function parseCsv(
  source: Readable,
  options: Extract<ParseBankStatementOptions, { format: "csv" }>,
  limits: ResolvedBankStatementParserLimits,
  startedAt: number,
): Promise<ParsedBankStatement> {
  if (options.delimiter.length < 1 || options.delimiter.length > 4) {
    throw new BankStatementFileError("BANK_STATEMENT_CSV_INVALID", "The CSV delimiter is invalid.");
  }
  const parser = parse({
    bom: true,
    delimiter: options.delimiter,
    max_record_size: limits.maxRecordBytes,
    relax_column_count: false,
    skip_empty_lines: true,
  });
  const decoded = Readable.from(decodeText(source, options.encoding, limits.maxFileBytes));
  const pumping = pipeline(decoded, parser);

  let recordNumber = 0;
  let headers: string[] | null = null;
  const rows: ParsedBankStatement["rows"] = [];
  try {
    for await (const value of parser) {
      assertDeadline(startedAt, limits.maxParseMs);
      recordNumber += 1;
      const record = value as string[];
      if (record.length > limits.maxColumns) throw columnLimit();
      if (recordNumber < options.headerRow) continue;
      if (recordNumber === options.headerRow) {
        headers = sanitizeHeaders(record, limits);
        continue;
      }
      if (!headers) throw invalidCsv();
      if (rows.length >= limits.maxRows) throw rowLimit();
      rows.push({ sourceRowNumber: recordNumber, values: toRecord(headers, record, limits, "csv") });
    }
    await pumping;
  } catch (error) {
    source.destroy();
    decoded.destroy();
    parser.destroy();
    await pumping.catch(() => undefined);
    if (error instanceof BankStatementFileError) throw error;
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "CSV_MAX_RECORD_SIZE") throw recordLimit();
    throw invalidCsv();
  }
  if (!headers) throw invalidCsv();
  return { format: "csv", worksheet: null, headers, rows };
}

async function* decodeText(
  source: Readable,
  encoding: "utf-8" | "windows-1252",
  maxBytes: number,
): AsyncGenerator<string> {
  const decoder = new TextDecoder(encoding, { fatal: true });
  let total = 0;
  let signature = Buffer.alloc(0);
  try {
    for await (const chunk of source) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buffer.length;
      if (total > maxBytes) throw fileLimit();
      if (signature.length < 8) signature = Buffer.concat([signature, buffer]).subarray(0, 8);
      if (signature.length >= 4) assertCsvSignature(signature);
      const decoded = decoder.decode(buffer, { stream: true });
      if (decoded) yield decoded;
    }
    assertCsvSignature(signature);
    const tail = decoder.decode();
    if (tail) yield tail;
  } catch (error) {
    if (error instanceof BankStatementFileError) throw error;
    throw new BankStatementFileError("BANK_STATEMENT_CSV_INVALID", "The CSV file could not be decoded safely.");
  }
}

function assertCsvSignature(prefix: Buffer): void {
  if (prefix.subarray(0, 4).toString("ascii") === "%PDF" || prefix.includes(0)) {
    throw new BankStatementFileError("BANK_STATEMENT_FILE_SIGNATURE", "The uploaded file does not match CSV format.");
  }
}

async function parseXlsx(
  source: Readable,
  options: Extract<ParseBankStatementOptions, { format: "xlsx" }>,
  limits: ResolvedBankStatementParserLimits,
  startedAt: number,
): Promise<ParsedBankStatement> {
  const archive = await collectBounded(source, limits.maxFileBytes);
  assertDeadline(startedAt, limits.maxParseMs);
  if (archive.length < 4 || archive.readUInt32LE(0) !== 0x04034b50) {
    throw new BankStatementFileError("BANK_STATEMENT_FILE_SIGNATURE", "The uploaded file does not match XLSX format.");
  }
  const entries = await readZipEntries(archive, limits, startedAt);
  rejectUnsafeWorkbook(entries);

  const workbook = requiredXml(entries, "xl/workbook.xml");
  const relationships = requiredXml(entries, "xl/_rels/workbook.xml.rels");
  const relationshipTargets = parseRelationships(relationships);
  const sheets = parseWorkbookSheets(workbook);
  const selected = sheets.find((sheet) => sheet.name === options.worksheet);
  if (!selected) throw invalidXlsx("The selected worksheet was not found.");
  const target = relationshipTargets.get(selected.relationshipId);
  if (!target) throw invalidXlsx("The selected worksheet relationship is invalid.");
  const worksheetPath = resolveWorkbookTarget(target);
  const worksheet = requiredXml(entries, worksheetPath);
  const sharedStrings = entries.has("xl/sharedStrings.xml")
    ? parseSharedStrings(requiredXml(entries, "xl/sharedStrings.xml"), limits)
    : [];
  const parsedRows = parseWorksheet(worksheet, sharedStrings, limits, startedAt, options.headerRow);
  const header = parsedRows.find((row) => row.sourceRowNumber === options.headerRow);
  if (!header) throw invalidXlsx("The configured header row is missing.");
  const headers = sanitizeHeaders(header.cells, limits);
  const rows: ParsedBankStatement["rows"] = [];
  for (const row of parsedRows) {
    if (row.sourceRowNumber <= options.headerRow) continue;
    if (rows.length >= limits.maxRows) throw rowLimit();
    rows.push({ sourceRowNumber: row.sourceRowNumber, values: toRecord(headers, row.cells, limits, "xlsx") });
  }
  return { format: "xlsx", worksheet: options.worksheet, headers, rows };
}

async function collectBounded(source: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of source) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) {
      source.destroy();
      throw fileLimit();
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

async function readZipEntries(
  archive: Buffer,
  limits: ResolvedBankStatementParserLimits,
  startedAt: number,
): Promise<Map<string, Buffer>> {
  const zip = await openZip(archive);
  const values = new Map<string, Buffer>();
  let entryCount = 0;
  let expandedBytes = 0;
  try {
    while (true) {
      assertDeadline(startedAt, limits.maxParseMs);
      const entry = await nextEntry(zip);
      if (!entry) break;
      entryCount += 1;
      if (entryCount > limits.maxZipEntries) throw unsafeXlsx("The XLSX archive contains too many entries.");
      validateZipEntry(entry, limits);
      expandedBytes += entry.uncompressedSize;
      if (expandedBytes > limits.maxExpandedBytes)
        throw unsafeXlsx("The XLSX archive expands beyond the allowed size.");
      if (entry.fileName.endsWith("/")) continue;
      const value = await readZipEntry(zip, entry, limits.maxZipEntryBytes);
      if (values.has(entry.fileName)) throw unsafeXlsx("The XLSX archive contains a duplicate entry.");
      values.set(entry.fileName, value);
    }
  } finally {
    zip.close();
  }
  return values;
}

function openZip(archive: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(unsafeXlsx("The XLSX archive is invalid."));
      else resolve(zip);
    });
  });
}

function nextEntry(zip: ZipFile): Promise<Entry | null> {
  return new Promise((resolve, reject) => {
    const onEntry = (entry: Entry) => finish(() => resolve(entry));
    const onEnd = () => finish(() => resolve(null));
    const onError = () => finish(() => reject(unsafeXlsx("The XLSX archive is invalid.")));
    const finish = (callback: () => void) => {
      zip.off("entry", onEntry);
      zip.off("end", onEnd);
      zip.off("error", onError);
      callback();
    };
    zip.once("entry", onEntry);
    zip.once("end", onEnd);
    zip.once("error", onError);
    zip.readEntry();
  });
}

function readZipEntry(zip: ZipFile, entry: Entry, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(unsafeXlsx("An XLSX archive entry could not be read."));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) stream.destroy(unsafeXlsx("An XLSX archive entry is too large."));
        else chunks.push(chunk);
      });
      stream.once("error", () => reject(unsafeXlsx("An XLSX archive entry is invalid.")));
      stream.once("end", () => resolve(Buffer.concat(chunks, total)));
    });
  });
}

function validateZipEntry(entry: Entry, limits: ResolvedBankStatementParserLimits): void {
  const normalized = path.posix.normalize(entry.fileName.replaceAll("\\", "/"));
  if (
    entry.fileName.startsWith("/") ||
    /^[A-Za-z]:/u.test(entry.fileName) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized !== entry.fileName
  ) {
    throw unsafeXlsx("The XLSX archive contains an unsafe path.");
  }
  if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw unsafeXlsx("Encrypted XLSX files are not supported.");
  if (entry.uncompressedSize > limits.maxZipEntryBytes) throw unsafeXlsx("An XLSX archive entry is too large.");
  if (
    entry.uncompressedSize > 1_000_000 &&
    entry.uncompressedSize / Math.max(entry.compressedSize, 1) > limits.maxCompressionRatio
  ) {
    throw unsafeXlsx("The XLSX archive has an unsafe compression ratio.");
  }
}

function rejectUnsafeWorkbook(entries: Map<string, Buffer>): void {
  for (const name of entries.keys()) {
    const lower = name.toLocaleLowerCase("en-US");
    if (lower === "encryptioninfo" || lower === "encryptedpackage" || lower.endsWith("vbaproject.bin")) {
      throw unsafeXlsx("Encrypted or macro-enabled workbooks are not supported.");
    }
  }
  for (const [name, value] of entries) {
    if (!name.toLocaleLowerCase("en-US").endsWith(".xml") && !name.toLocaleLowerCase("en-US").endsWith(".rels"))
      continue;
    const prefix = value.subarray(0, Math.min(value.length, 8_192)).toString("utf8");
    if (/<!DOCTYPE|<!ENTITY/iu.test(prefix)) throw unsafeXlsx("DTD and entity declarations are not supported.");
    if (name === "[Content_Types].xml" && /macroEnabled|vbaProject/iu.test(prefix)) {
      throw unsafeXlsx("Macro-enabled workbooks are not supported.");
    }
    if (name.toLocaleLowerCase("en-US").endsWith(".rels")) parseRelationships(value.toString("utf8"));
  }
}

function requiredXml(entries: Map<string, Buffer>, name: string): string {
  const value = entries.get(name);
  if (!value) throw invalidXlsx("The XLSX workbook is incomplete.");
  return value.toString("utf8");
}

function parseRelationships(xml: string): Map<string, string> {
  const relationships = new Map<string, string>();
  parseXml(xml, (tag) => {
    if (localName(tag.name) !== "Relationship") return;
    const id = attribute(tag, "Id");
    const target = attribute(tag, "Target");
    if (attribute(tag, "TargetMode")?.toLocaleLowerCase("en-US") === "external") {
      throw unsafeXlsx("External workbook relationships are not supported.");
    }
    if (id && target) relationships.set(id, target);
  });
  return relationships;
}

function parseWorkbookSheets(xml: string): Array<{ name: string; relationshipId: string }> {
  const sheets: Array<{ name: string; relationshipId: string }> = [];
  parseXml(xml, (tag) => {
    if (localName(tag.name) !== "sheet") return;
    const name = attribute(tag, "name");
    const relationshipId = attribute(tag, "r:id") ?? attribute(tag, "id");
    if (name && relationshipId) sheets.push({ name, relationshipId });
  });
  return sheets;
}

function resolveWorkbookTarget(target: string): string {
  const normalized = path.posix.normalize(path.posix.join("xl", target.replaceAll("\\", "/")));
  if (!normalized.startsWith("xl/") || normalized.includes("../")) throw unsafeXlsx("The worksheet path is unsafe.");
  return normalized;
}

function parseSharedStrings(xml: string, limits: ResolvedBankStatementParserLimits): string[] {
  const values: string[] = [];
  let insideString = false;
  let insideText = false;
  let current = "";
  const parser = new SaxesParser();
  parser.on("opentag", (tag) => {
    const name = localName(tag.name);
    if (name === "si") {
      if (values.length >= limits.maxRows * limits.maxColumns + limits.maxColumns) {
        throw unsafeXlsx("The XLSX shared-string table is too large.");
      }
      insideString = true;
      current = "";
    } else if (insideString && name === "t") insideText = true;
  });
  parser.on("text", (text) => {
    if (insideText) current += text;
  });
  parser.on("closetag", (tag) => {
    const name = localName(typeof tag === "string" ? tag : tag.name);
    if (name === "t") insideText = false;
    if (name === "si") {
      const value = sanitizeCell(current, limits);
      values.push(value ?? "");
      insideString = false;
    }
  });
  writeXml(parser, xml);
  return values;
}

function parseWorksheet(
  xml: string,
  sharedStrings: string[],
  limits: ResolvedBankStatementParserLimits,
  startedAt: number,
  headerRow: number,
): Array<{ sourceRowNumber: number; cells: string[] }> {
  const rows: Array<{ sourceRowNumber: number; cells: string[] }> = [];
  let currentRow: { sourceRowNumber: number; cells: string[] } | null = null;
  let currentCell: { column: number; type: string | null; value: string; inline: string } | null = null;
  let activeText: "v" | "t" | null = null;
  const parser = new SaxesParser();
  parser.on("opentag", (tag) => {
    assertDeadline(startedAt, limits.maxParseMs);
    const name = localName(tag.name);
    if (name === "row") {
      const sourceRowNumber = Number(attribute(tag, "r") ?? rows.length + 1);
      if (!Number.isSafeInteger(sourceRowNumber) || sourceRowNumber < 1)
        throw invalidXlsx("An XLSX row number is invalid.");
      currentRow = { sourceRowNumber, cells: [] };
    } else if (name === "c" && currentRow) {
      const reference = attribute(tag, "r");
      const column = reference ? columnIndex(reference) : currentRow.cells.length;
      if (column >= limits.maxColumns) throw columnLimit();
      currentCell = { column, type: attribute(tag, "t") ?? null, value: "", inline: "" };
    } else if (currentCell && (name === "v" || name === "t")) activeText = name;
  });
  parser.on("text", (text) => {
    if (!currentCell || !activeText) return;
    if (activeText === "v") currentCell.value += text;
    else currentCell.inline += text;
  });
  parser.on("closetag", (tag) => {
    const name = localName(typeof tag === "string" ? tag : tag.name);
    if (name === "v" || name === "t") activeText = null;
    if (name === "c" && currentCell && currentRow) {
      let value = currentCell.type === "inlineStr" ? currentCell.inline : currentCell.value;
      if (currentCell.type === "s") {
        const index = Number(value);
        if (!Number.isSafeInteger(index) || index < 0 || sharedStrings[index] === undefined) {
          throw invalidXlsx("An XLSX shared-string reference is invalid.");
        }
        value = sharedStrings[index]!;
      }
      while (currentRow.cells.length <= currentCell.column) currentRow.cells.push("");
      currentRow.cells[currentCell.column] = sanitizeCell(value, limits) ?? "";
      currentCell = null;
    }
    if (name === "row" && currentRow) {
      if (rows.length >= headerRow + limits.maxRows) throw rowLimit();
      rows.push(currentRow);
      currentRow = null;
    }
  });
  writeXml(parser, xml);
  return rows;
}

function parseXml(xml: string, onOpenTag: (tag: SaxesTagPlain) => void): void {
  const parser = new SaxesParser();
  parser.on("opentag", onOpenTag);
  writeXml(parser, xml);
}

function writeXml(parser: SaxesParser, xml: string): void {
  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof BankStatementFileError) throw error;
    throw invalidXlsx("The XLSX workbook contains invalid XML.");
  }
}

function attribute(tag: SaxesTagPlain, name: string): string | undefined {
  const value = tag.attributes[name];
  return typeof value === "string" ? value : undefined;
}

function localName(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

function columnIndex(reference: string): number {
  const match = /^([A-Z]+)[1-9]\d*$/u.exec(reference);
  if (!match?.[1]) throw invalidXlsx("An XLSX cell reference is invalid.");
  let value = 0;
  for (const character of match[1]) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

function sanitizeHeaders(values: string[], limits: ResolvedBankStatementParserLimits): string[] {
  if (values.length === 0 || values.length > limits.maxColumns) throw columnLimit();
  return values.map((value) => sanitizeCell(value, limits) ?? "");
}

function toRecord(
  headers: string[],
  cells: string[],
  limits: ResolvedBankStatementParserLimits,
  format: "csv" | "xlsx",
): Record<string, string | null> {
  if (cells.length > headers.length || (format === "csv" && cells.length !== headers.length)) {
    if (format === "xlsx") throw invalidXlsx("A Statement row has data without a corresponding header.");
    throw new BankStatementFileError("BANK_STATEMENT_CSV_INVALID", "A Statement row has an unexpected column count.");
  }
  return Object.fromEntries(headers.map((header, index) => [header, sanitizeCell(cells[index] ?? "", limits)]));
}

function sanitizeCell(value: string, limits: ResolvedBankStatementParserLimits): string | null {
  if (value.length > limits.maxCellCharacters) throw cellLimit();
  try {
    return sanitizeBankStatementCell(value);
  } catch {
    throw cellLimit();
  }
}

function assertDeadline(startedAt: number, maxParseMs: number): void {
  if (maxParseMs <= 0 || Date.now() - startedAt > maxParseMs) {
    throw new BankStatementFileError(
      "BANK_STATEMENT_PARSE_TIMEOUT",
      "The Bank Statement exceeded its parsing deadline.",
    );
  }
}

const fileLimit = () =>
  new BankStatementFileError("BANK_STATEMENT_FILE_LIMIT", "The Bank Statement exceeds the upload limit.");
const recordLimit = () =>
  new BankStatementFileError("BANK_STATEMENT_RECORD_LIMIT", "A CSV record exceeds the allowed size.");
const rowLimit = () =>
  new BankStatementFileError("BANK_STATEMENT_ROW_LIMIT", "Bank Statements may contain at most 1,000 data rows.");
const columnLimit = () =>
  new BankStatementFileError("BANK_STATEMENT_COLUMN_LIMIT", "Bank Statements may contain at most 64 columns.");
const cellLimit = () =>
  new BankStatementFileError("BANK_STATEMENT_CELL_LIMIT", "A Bank Statement cell exceeds the allowed size.");
const invalidCsv = () =>
  new BankStatementFileError("BANK_STATEMENT_CSV_INVALID", "The CSV file could not be parsed safely.");
const invalidXlsx = (message: string) => new BankStatementFileError("BANK_STATEMENT_XLSX_INVALID", message);
const unsafeXlsx = (message: string) => new BankStatementFileError("BANK_STATEMENT_XLSX_UNSAFE", message);
