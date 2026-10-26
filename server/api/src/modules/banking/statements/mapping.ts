import type { BankStatementMappingSnapshot } from "@nexora/contracts";

import type { ParsedBankStatement } from "./file-parser.js";

const MAX_CELL_CHARACTERS = 4_000;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type MappedBankStatementRow = {
  sourceRowNumber: number;
  rawRow: Record<string, string | null>;
  mapped: Record<keyof BankStatementMappingSnapshot["columns"], string | null>;
};

export function normalizeBankStatementHeader(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u00a0]+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function sanitizeBankStatementCell(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const sanitized = value.replaceAll("\0", "").replace(/\r\n?/gu, "\n").trim();
  if (sanitized.length > MAX_CELL_CHARACTERS) {
    throw new Error(
      `Bank Statement cells may contain at most ${MAX_CELL_CHARACTERS.toLocaleString("en-US")} characters.`,
    );
  }
  return sanitized;
}

export function mapBankStatementRows(
  parsed: ParsedBankStatement,
  mapping: BankStatementMappingSnapshot,
): MappedBankStatementRow[] {
  const headerByNormalized = new Map<string, string>();
  for (const header of parsed.headers) {
    const normalized = normalizeBankStatementHeader(header);
    if (!normalized) throw new Error("Bank Statement headers cannot be empty.");
    if (headerByNormalized.has(normalized)) throw new Error("Bank Statement contains a duplicate normalized header.");
    headerByNormalized.set(normalized, header);
  }

  const resolvedColumns = Object.fromEntries(
    Object.entries(mapping.columns).map(([field, sourceHeader]) => {
      if (sourceHeader === null || sourceHeader === undefined) return [field, null];
      const resolved = headerByNormalized.get(normalizeBankStatementHeader(sourceHeader));
      if (!resolved) throw new Error(`Mapped Bank Statement header was not found: ${sourceHeader}`);
      return [field, resolved];
    }),
  ) as Record<keyof BankStatementMappingSnapshot["columns"], string | null>;

  return parsed.rows.map((row) => ({
    sourceRowNumber: row.sourceRowNumber,
    rawRow: row.values,
    mapped: Object.fromEntries(
      Object.entries(resolvedColumns).map(([field, header]) => [
        field,
        header === null ? null : (row.values[header] ?? null),
      ]),
    ) as MappedBankStatementRow["mapped"],
  }));
}

export function buildBankStatementObjectKey(input: {
  tenantId: string;
  companyId: string;
  importId: string;
  format: "csv" | "xlsx";
}): string {
  for (const [name, value] of Object.entries({
    tenant: input.tenantId,
    company: input.companyId,
    import: input.importId,
  })) {
    if (!SAFE_IDENTIFIER.test(value)) throw new Error(`Bank Statement ${name} identifier is invalid.`);
  }
  return `bank-statements/quarantine/${input.tenantId}/${input.companyId}/${input.importId}.${input.format}`;
}
