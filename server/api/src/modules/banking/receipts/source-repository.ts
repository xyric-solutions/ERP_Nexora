import { createHash, randomUUID } from "node:crypto";

import { evaluateApprovalActor } from "@nexora/auth";
import type {
  BankReceiptDetail,
  BankReceiptDirectory,
  BankReceiptDirectoryQuery,
  BankReceiptLineInput,
  BankReceiptMutationResult,
  BankReceiptNominalAccountDirectory,
  BankReceiptNominalAccountDirectoryQuery,
  BankReceiptOptions,
  BankReceiptOptionsQuery,
  BankReceiptPostingResult,
  BankReceiptReversalResult,
  BankReceiptState,
  CreateBankReceiptRequest,
  DecideBankReceiptRequest,
  PostBankReceiptRequest,
  ReverseBankReceiptRequest,
  SubmitBankReceiptRequest,
  UpdateBankReceiptRequest,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";

import {
  FinancePostingError,
  FinancePostingService,
  createFinanceTransactionClient,
} from "../../finance/posting/index.js";
import { ApprovalOverrideWriterError, writeApprovalOverrideEvent } from "../../security/approval-override-writer.js";
import { BankingApiError, type BankingActorContext } from "../source-repository.js";

const amountScale = 8;
const maximumAmount = 10n ** 38n - 1n;

interface ReceiptRow {
  id: string;
  tenant_id: string;
  company_id: string;
  reference: string;
  bank_account_id: string;
  posting_date: string | Date;
  value_date: string | Date | null;
  transaction_currency: string;
  base_currency: string;
  exchange_rate_id: string | null;
  exchange_rate_value: string;
  total_amount: string;
  state: BankReceiptState;
  row_version: string | number;
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
  submitted_by: string | null;
  submitted_at: string | Date | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  rejected_by: string | null;
  rejected_at: string | Date | null;
  decision_reason: string | null;
  approval_override_event_id: string | null;
  posted_by: string | null;
  posted_at: string | Date | null;
  original_period_id: string | null;
  original_accounting_event_id: string | null;
  original_journal_entry_id: string | null;
  reversed_by: string | null;
  reversed_at: string | Date | null;
  reversal_reason: string | null;
  reversal_period_id: string | null;
  reversal_accounting_event_id: string | null;
  reversal_journal_entry_id: string | null;
}

interface BankAuthority {
  id: string;
  reference: string;
  account_name: string;
  bank_name: string;
  account_number_masked: string;
  currency: string;
  account_id: string;
  ledger_account_code: string;
  ledger_account_name: string;
}

interface RateAuthority {
  baseCurrency: string;
  rateId: string | null;
  rateValue: string;
  decimalPlaces: number;
}

type ReceiptResult = BankReceiptMutationResult | BankReceiptPostingResult | BankReceiptReversalResult;

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  return value;
}

function stateHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)), "utf8")
    .digest("hex");
}

function validIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(value);
}

function iso(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function dateOnly(value: string | Date | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return [
    value.getFullYear().toString().padStart(4, "0"),
    (value.getMonth() + 1).toString().padStart(2, "0"),
    value.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function escapeSearch(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function scaledAmount(value: string): { scaled: bigint; fraction: number } {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match || (match[2]?.length ?? 0) > amountScale || match[1]!.length > 30)
    throw new BankingApiError(
      400,
      "RECEIPT_AMOUNT_INVALID",
      "A receipt amount is invalid or exceeds supported precision.",
    );
  const fraction = match[2] ?? "";
  return {
    scaled: BigInt(match[1]!) * 10n ** 8n + BigInt(fraction.padEnd(amountScale, "0")),
    fraction: fraction.replace(/0+$/, "").length,
  };
}

function canonicalDecimal(value: string): string {
  if (!value.includes(".")) return value;
  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed || "0";
}

function formatAmount(value: bigint): string {
  const digits = value.toString().padStart(amountScale + 1, "0");
  return `${digits.slice(0, -amountScale)}.${digits.slice(-amountScale)}`;
}

function decimalEquivalent(left: string, right: string): boolean {
  const canonical = (value: string): string => {
    const [integer = "0", fraction = ""] = value.split(".");
    const trimmed = fraction.replace(/0+$/, "");
    return trimmed ? `${BigInt(integer)}.${trimmed}` : BigInt(integer).toString();
  };
  return canonical(left) === canonical(right);
}

function totalLines(lines: readonly BankReceiptLineInput[], decimalPlaces: number): string {
  let total = 0n;
  for (const line of lines) {
    const parsed = scaledAmount(line.amount);
    if (parsed.scaled <= 0n || parsed.fraction > decimalPlaces)
      throw new BankingApiError(
        400,
        "RECEIPT_CURRENCY_SCALE_INVALID",
        "A receipt amount exceeds the bank account currency scale.",
      );
    total += parsed.scaled;
    if (total > maximumAmount)
      throw new BankingApiError(400, "RECEIPT_AMOUNT_INVALID", "The receipt total exceeds supported precision.");
  }
  return formatAmount(total);
}

interface ReceiptCursor {
  version: 1;
  sort_by: BankReceiptDirectoryQuery["sort_by"];
  sort_direction: BankReceiptDirectoryQuery["sort_direction"];
  value: string;
  id: string;
}

function encodeCursor(cursor: ReceiptCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined, query: BankReceiptDirectoryQuery): ReceiptCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ReceiptCursor>;
    if (
      parsed.version !== 1 ||
      parsed.sort_by !== query.sort_by ||
      parsed.sort_direction !== query.sort_direction ||
      typeof parsed.value !== "string" ||
      !parsed.value ||
      typeof parsed.id !== "string" ||
      !parsed.id
    )
      throw new Error("invalid cursor");
    return parsed as ReceiptCursor;
  } catch {
    throw new BankingApiError(400, "RECEIPT_CURSOR_INVALID", "The Bank Receipt cursor is invalid.");
  }
}

function safeSnapshot(row: ReceiptRow): Record<string, unknown> {
  return {
    id: row.id,
    company_id: row.company_id,
    reference: row.reference,
    bank_account_id: row.bank_account_id,
    posting_date: dateOnly(row.posting_date),
    value_date: dateOnly(row.value_date),
    transaction_currency: row.transaction_currency,
    base_currency: row.base_currency,
    exchange_rate_id: row.exchange_rate_id,
    exchange_rate_value: row.exchange_rate_value,
    total_amount: row.total_amount,
    state: row.state,
    version: Number(row.row_version),
    approval_override: row.approval_override_event_id !== null,
    original_accounting_event_id: row.original_accounting_event_id,
    original_journal_entry_id: row.original_journal_entry_id,
    reversal_accounting_event_id: row.reversal_accounting_event_id,
    reversal_journal_entry_id: row.reversal_journal_entry_id,
  };
}

function postgresCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export class SourceBankReceiptRepository {
  constructor(
    private readonly pool: Pool,
    private readonly finance: FinancePostingService = new FinancePostingService(),
  ) {}

  list(context: BankingActorContext, query: BankReceiptDirectoryQuery): Promise<BankReceiptDirectory> {
    return this.read(context, async (client) => {
      await this.requireScopedPermission(client, context, "banking.receipt.read", query.company_id);
      await this.requireCompanyAccess(client, context, query.company_id);
      const cursor = decodeCursor(query.cursor, query);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["receipt.tenant_id=$1", "receipt.company_id=$2"];
      const add = (value: unknown): string => {
        values.push(value);
        return `$${values.length}`;
      };
      if (query.bank_account_id) filters.push(`receipt.bank_account_id=${add(query.bank_account_id)}`);
      if (query.state) filters.push(`receipt.state=${add(query.state)}`);
      if (query.posting_date_from) filters.push(`receipt.posting_date>=${add(query.posting_date_from)}::date`);
      if (query.posting_date_to) filters.push(`receipt.posting_date<=${add(query.posting_date_to)}::date`);
      if (query.search) {
        const term = add(`%${escapeSearch(query.search)}%`);
        filters.push(
          `(receipt.reference ilike ${term} escape '\\' or bank.account_name ilike ${term} escape '\\' or bank.bank_name ilike ${term} escape '\\' or exists (select 1 from bank_receipt_line search_line where search_line.tenant_id=receipt.tenant_id and search_line.receipt_id=receipt.id and (search_line.payer_name ilike ${term} escape '\\' or search_line.external_reference ilike ${term} escape '\\' or search_line.document_reference ilike ${term} escape '\\' or search_line.narration ilike ${term} escape '\\')))`,
        );
      }
      const sortExpressions = {
        posting_date: "receipt.posting_date",
        reference: "receipt.reference",
        total_amount: "receipt.total_amount",
        state: "receipt.state",
      } as const;
      const sort = sortExpressions[query.sort_by];
      if (cursor) {
        const cursorValue = add(cursor.value);
        const cursorId = add(cursor.id);
        const cast =
          query.sort_by === "posting_date" ? "::date" : query.sort_by === "total_amount" ? "::numeric" : "::text";
        const operator = query.sort_direction === "asc" ? ">" : "<";
        filters.push(
          `((${sort}) ${operator} ${cursorValue}${cast} or ((${sort})=${cursorValue}${cast} and receipt.id ${operator} ${cursorId}))`,
        );
      }
      values.push(query.limit + 1);
      const result = await client.query<{
        id: string;
        company_id: string;
        reference: string;
        bank_account_id: string;
        bank_account_name: string;
        bank_name: string;
        account_number_masked: string;
        posting_date: string | Date;
        value_date: string | Date | null;
        currency: string;
        total_amount: string;
        line_count: string | number;
        payer_summary: string | null;
        nominal_account_summary: string | null;
        narration_summary: string | null;
        state: BankReceiptState;
        version: string | number;
        created_at: string | Date;
      }>(
        `select receipt.id,receipt.company_id,receipt.reference,receipt.bank_account_id,
                bank.account_name as bank_account_name,bank.bank_name,bank.account_number_masked,
                receipt.posting_date,receipt.value_date,receipt.transaction_currency as currency,
                receipt.total_amount::text,receipt.state,receipt.row_version as version,receipt.created_at,
                count(line.id)::integer as line_count,
                (array_agg(line.payer_name order by line.line_number))[1] as payer_summary,
                (array_agg(nominal.code || ' - ' || nominal.name order by line.line_number))[1] as nominal_account_summary,
                (array_agg(line.narration order by line.line_number))[1] as narration_summary
           from bank_receipt receipt
           join bank_account bank on bank.tenant_id=receipt.tenant_id and bank.company_id=receipt.company_id and bank.id=receipt.bank_account_id
           join bank_receipt_line line on line.tenant_id=receipt.tenant_id and line.company_id=receipt.company_id and line.receipt_id=receipt.id
           join account nominal on nominal.tenant_id=line.tenant_id and nominal.company_id=line.company_id and nominal.id=line.nominal_account_id
          where ${filters.join(" and ")}
          group by receipt.id,receipt.tenant_id,bank.id,bank.tenant_id
          order by ${sort} ${query.sort_direction},receipt.id ${query.sort_direction}
          limit $${values.length}`,
        values,
      );
      const hasNext = result.rows.length > query.limit;
      const rows = result.rows.slice(0, query.limit);
      const items = rows.map((row) => ({
        ...row,
        posting_date: dateOnly(row.posting_date)!,
        value_date: dateOnly(row.value_date),
        line_count: Number(row.line_count),
        version: Number(row.version),
        created_at: iso(row.created_at)!,
      }));
      const last = rows.at(-1);
      const cursorValue = last
        ? query.sort_by === "posting_date"
          ? dateOnly(last.posting_date)!
          : query.sort_by === "reference"
            ? last.reference
            : query.sort_by === "total_amount"
              ? last.total_amount
              : last.state
        : null;
      return {
        items,
        next_cursor:
          hasNext && last && cursorValue
            ? encodeCursor({
                version: 1,
                sort_by: query.sort_by,
                sort_direction: query.sort_direction,
                value: cursorValue,
                id: last.id,
              })
            : null,
      };
    });
  }

  options(context: BankingActorContext, query: BankReceiptOptionsQuery): Promise<BankReceiptOptions> {
    return this.read(context, async (client) => {
      await this.requireScopedPermission(client, context, "banking.receipt.read", query.company_id);
      await this.requireCompanyAccess(client, context, query.company_id);
      const result = await client.query<BankReceiptOptions["bank_accounts"][number]>(
        `select bank.id,bank.reference,bank.account_name,bank.bank_name,bank.account_number_masked,bank.currency,
                ledger.code as ledger_account_code,ledger.name as ledger_account_name
           from bank_account bank join account ledger
             on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
          where bank.tenant_id=$1 and bank.company_id=$2 and bank.status='active'
            and ledger.status='active' and not ledger.is_header and ledger.manual_posting_allowed and ledger.reconciliation_required
          order by bank.account_name,bank.reference,bank.id limit 200`,
        [context.tenantId, query.company_id],
      );
      return {
        bank_accounts: result.rows,
        receipt_methods: [
          { value: "bank_transfer", label: "Bank transfer" },
          { value: "cheque", label: "Cheque" },
          { value: "cash", label: "Cash" },
          { value: "online", label: "Online" },
          { value: "direct_debit", label: "Direct debit" },
          { value: "card", label: "Card" },
        ],
      };
    });
  }

  listNominalAccounts(
    context: BankingActorContext,
    query: BankReceiptNominalAccountDirectoryQuery,
  ): Promise<BankReceiptNominalAccountDirectory> {
    return this.read(context, async (client) => {
      await this.requireScopedPermission(client, context, "banking.receipt.read", query.company_id);
      await this.requireCompanyAccess(client, context, query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      let search = "";
      if (query.search) {
        values.push(`%${escapeSearch(query.search)}%`);
        search = ` and (account.code ilike $3 escape '\\' or account.name ilike $3 escape '\\')`;
      }
      values.push(query.limit);
      const result = await client.query<BankReceiptNominalAccountDirectory["items"][number]>(
        `select account.id,account.code,account.name,account.type as account_type,account.required_dimensions
           from account
          where account.tenant_id=$1 and account.company_id=$2 and account.status='active'
            and not account.is_header and account.manual_posting_allowed and not account.reconciliation_required
            and not exists (select 1 from bank_account bank where bank.tenant_id=account.tenant_id
                             and bank.company_id=account.company_id and bank.account_id=account.id and bank.status='active')
            ${search}
          order by account.code,account.name,account.id limit $${values.length}`,
        values,
      );
      return { items: result.rows };
    });
  }

  get(context: BankingActorContext, receiptId: string): Promise<BankReceiptDetail> {
    return this.read(context, async (client) => {
      const row = await this.requireReceipt(client, context, receiptId, false);
      await this.requireScopedPermission(client, context, "banking.receipt.read", row.company_id);
      return this.loadDetail(client, context, row);
    });
  }

  create(
    context: BankingActorContext,
    input: CreateBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReceiptMutationResult> {
    const path = "/api/v1/banking/receipts";
    return this.mutate(context, "banking.receipt.create", "POST", path, input, idempotencyKey, 201, async (client) => {
      await this.requireScopedPermission(client, context, "banking.receipt.create", input.company_id);
      await this.requireCompanyAccess(client, context, input.company_id);
      const bank = await this.requireBankAuthority(client, context.tenantId, input.company_id, input.bank_account_id);
      const rate = await this.resolveRate(client, context.tenantId, bank.currency, input.posting_date);
      await this.validateLines(client, context.tenantId, input.company_id, bank.account_id, input.lines);
      const total = totalLines(input.lines, rate.decimalPlaces);
      const fiscalYear = await this.resolveFiscalYear(client, context.tenantId, input.company_id, input.posting_date);
      const allocated = await client.query<{ allocated: string }>(
        `insert into bank_receipt_sequence (tenant_id,company_id,fiscal_year,next_value)
         values ($1,$2,$3,2)
         on conflict (tenant_id,company_id,fiscal_year) do update set next_value=bank_receipt_sequence.next_value+1
         returning (next_value-1)::text as allocated`,
        [context.tenantId, input.company_id, fiscalYear],
      );
      const id = `bank-receipt-${randomUUID()}`;
      const reference = `BR-${fiscalYear}-${allocated.rows[0]!.allocated.padStart(8, "0")}`;
      await client.query(
        `insert into bank_receipt
          (id,tenant_id,company_id,reference,bank_account_id,posting_date,value_date,transaction_currency,
           base_currency,exchange_rate_id,exchange_rate_value,total_amount,state,row_version,created_by,created_at,updated_at)
         values ($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10,$11,$12,'draft',1,$13,clock_timestamp(),clock_timestamp())`,
        [
          id,
          context.tenantId,
          input.company_id,
          reference,
          input.bank_account_id,
          input.posting_date,
          input.value_date ?? null,
          bank.currency,
          rate.baseCurrency,
          rate.rateId,
          rate.rateValue,
          total,
          context.actor.userId,
        ],
      );
      await this.replaceLines(client, context.tenantId, input.company_id, id, input.lines);
      const row = await this.requireReceipt(client, context, id, true);
      const auditId = await this.appendAudit(
        client,
        context,
        correlationId,
        "banking.receipt.create",
        id,
        null,
        safeSnapshot(row),
      );
      await this.appendEvent(
        client,
        context,
        row,
        "created",
        null,
        "draft",
        correlationId,
        idempotencyKey,
        auditId,
        null,
      );
      return this.mutationResult(row, auditId);
    });
  }

  update(
    context: BankingActorContext,
    receiptId: string,
    input: UpdateBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReceiptMutationResult> {
    const path = `/api/v1/banking/receipts/${receiptId}`;
    return this.mutate(context, "banking.receipt.update", "PATCH", path, input, idempotencyKey, 200, async (client) => {
      const previous = await this.requireReceipt(client, context, receiptId, true);
      await this.requireScopedPermission(client, context, "banking.receipt.update", previous.company_id);
      this.requireVersion(previous, input.expected_version);
      if (previous.state !== "draft")
        throw new BankingApiError(409, "RECEIPT_NOT_EDITABLE", "Only a draft Bank Receipt can be edited.");
      const bankAccountId = input.bank_account_id ?? previous.bank_account_id;
      const postingDate = input.posting_date ?? dateOnly(previous.posting_date)!;
      if (
        (await this.resolveFiscalYear(client, context.tenantId, previous.company_id, postingDate)) !==
        (await this.resolveFiscalYear(client, context.tenantId, previous.company_id, dateOnly(previous.posting_date)!))
      )
        throw new BankingApiError(
          409,
          "RECEIPT_FISCAL_YEAR_IMMUTABLE",
          "A Bank Receipt cannot be moved to another fiscal year.",
        );
      const bank = await this.requireBankAuthority(client, context.tenantId, previous.company_id, bankAccountId);
      const rate = await this.resolveRate(client, context.tenantId, bank.currency, postingDate);
      const lines =
        input.lines ?? (await this.loadLineInputs(client, context.tenantId, previous.company_id, receiptId));
      await this.validateLines(client, context.tenantId, previous.company_id, bank.account_id, lines);
      const total = totalLines(lines, rate.decimalPlaces);
      const updated = await client.query(
        `update bank_receipt set bank_account_id=$4,posting_date=$5::date,value_date=$6::date,
                transaction_currency=$7,base_currency=$8,exchange_rate_id=$9,exchange_rate_value=$10,total_amount=$11,
                row_version=row_version+1,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2 and company_id=$3 and state='draft' and row_version=$12`,
        [
          context.tenantId,
          receiptId,
          previous.company_id,
          bankAccountId,
          postingDate,
          input.value_date === undefined ? dateOnly(previous.value_date) : input.value_date,
          bank.currency,
          rate.baseCurrency,
          rate.rateId,
          rate.rateValue,
          total,
          input.expected_version,
        ],
      );
      if (updated.rowCount !== 1) throw this.versionConflict();
      if (input.lines) await this.replaceLines(client, context.tenantId, previous.company_id, receiptId, lines);
      const row = await this.requireReceipt(client, context, receiptId, true);
      const auditId = await this.appendAudit(
        client,
        context,
        correlationId,
        "banking.receipt.update",
        receiptId,
        safeSnapshot(previous),
        safeSnapshot(row),
      );
      await this.appendEvent(
        client,
        context,
        row,
        "updated",
        "draft",
        "draft",
        correlationId,
        idempotencyKey,
        auditId,
        null,
      );
      return this.mutationResult(row, auditId);
    });
  }

  submit(
    context: BankingActorContext,
    receiptId: string,
    input: SubmitBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReceiptMutationResult> {
    const path = `/api/v1/banking/receipts/${receiptId}/submit`;
    return this.mutate(context, "banking.receipt.submit", "POST", path, input, idempotencyKey, 200, async (client) => {
      const previous = await this.requireReceipt(client, context, receiptId, true);
      await this.requireScopedPermission(client, context, "banking.receipt.submit", previous.company_id);
      this.requireVersion(previous, input.expected_version);
      if (previous.state !== "draft")
        throw new BankingApiError(409, "RECEIPT_NOT_SUBMITTABLE", "Only a draft Bank Receipt can be submitted.");
      const bank = await this.requireBankAuthority(
        client,
        context.tenantId,
        previous.company_id,
        previous.bank_account_id,
      );
      const postingDate = dateOnly(previous.posting_date)!;
      const rate = await this.resolveRate(client, context.tenantId, bank.currency, postingDate);
      const lines = await this.loadLineInputs(client, context.tenantId, previous.company_id, receiptId);
      await this.validateLines(client, context.tenantId, previous.company_id, bank.account_id, lines);
      const total = totalLines(lines, rate.decimalPlaces);
      await this.requireOpenPeriod(client, context.tenantId, previous.company_id, postingDate);
      let version = input.expected_version;
      if (
        previous.transaction_currency !== bank.currency ||
        previous.base_currency !== rate.baseCurrency ||
        previous.exchange_rate_id !== rate.rateId ||
        !decimalEquivalent(previous.exchange_rate_value, rate.rateValue) ||
        scaledAmount(previous.total_amount).scaled !== scaledAmount(total).scaled
      ) {
        const refreshed = await client.query(
          `update bank_receipt set transaction_currency=$4,base_currency=$5,exchange_rate_id=$6,
                  exchange_rate_value=$7,total_amount=$8,row_version=row_version+1,updated_at=clock_timestamp()
            where tenant_id=$1 and id=$2 and company_id=$3 and state='draft' and row_version=$9`,
          [
            context.tenantId,
            receiptId,
            previous.company_id,
            bank.currency,
            rate.baseCurrency,
            rate.rateId,
            rate.rateValue,
            total,
            version,
          ],
        );
        if (refreshed.rowCount !== 1) throw this.versionConflict();
        version += 1;
      }
      const transitioned = await client.query(
        `update bank_receipt set state='submitted',submitted_by=$4,submitted_at=clock_timestamp(),
                row_version=row_version+1,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2 and company_id=$3 and state='draft' and row_version=$5`,
        [context.tenantId, receiptId, previous.company_id, context.actor.userId, version],
      );
      if (transitioned.rowCount !== 1) throw this.versionConflict();
      const row = await this.requireReceipt(client, context, receiptId, true);
      const auditId = await this.appendAudit(
        client,
        context,
        correlationId,
        "banking.receipt.submit",
        receiptId,
        safeSnapshot(previous),
        safeSnapshot(row),
      );
      await this.appendEvent(
        client,
        context,
        row,
        "submitted",
        "draft",
        "submitted",
        correlationId,
        idempotencyKey,
        auditId,
        null,
      );
      return this.mutationResult(row, auditId);
    });
  }

  decide(
    context: BankingActorContext,
    receiptId: string,
    input: DecideBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReceiptMutationResult> {
    const path = `/api/v1/banking/receipts/${receiptId}/decision`;
    return this.mutate(context, "banking.receipt.approve", "POST", path, input, idempotencyKey, 200, async (client) => {
      const previous = await this.requireReceipt(client, context, receiptId, true);
      await this.requireScopedPermission(client, context, "banking.receipt.approve", previous.company_id);
      this.requireVersion(previous, input.expected_version);
      if (previous.state !== "submitted")
        throw new BankingApiError(409, "RECEIPT_NOT_PENDING", "The Bank Receipt is not pending approval.");
      const policy = evaluateApprovalActor({
        account: context.actor,
        makerActorIds: [previous.created_by, previous.submitted_by ?? ""],
        normalDecisionPermission: "banking.receipt.approve",
        impersonated: context.impersonationRequestId !== undefined,
      });
      if (policy.kind === "forbidden")
        throw new BankingApiError(
          403,
          "RECEIPT_MAKER_CHECKER_REQUIRED",
          "An independent authorized checker must decide this Bank Receipt.",
        );
      let overrideId: string | null = null;
      if (policy.kind === "override") {
        if (!input.reason)
          throw new BankingApiError(
            400,
            "RECEIPT_OVERRIDE_REASON_REQUIRED",
            "A reason is required for a super-administrator self-decision.",
          );
        try {
          overrideId = (
            await writeApprovalOverrideEvent(client, {
              tenantId: context.tenantId,
              account: context.actor,
              makerActorIds: [previous.created_by, previous.submitted_by ?? ""],
              normalDecisionPermission: "banking.receipt.approve",
              resourceType: "banking.receipt",
              resourceId: receiptId,
              decisionAction: input.action,
              reason: input.reason,
              correlationId,
              idempotencyKey: `${idempotencyKey}:approval-override`,
              metadata: { receipt_reference: previous.reference, expected_version: input.expected_version },
              impersonated: context.impersonationRequestId !== undefined,
            })
          ).eventId;
        } catch (error) {
          if (error instanceof ApprovalOverrideWriterError)
            throw new BankingApiError(error.code.includes("IDEMPOTENCY") ? 409 : 403, error.code, error.message);
          throw error;
        }
      }
      const approved = input.action === "approve";
      const updated = await client.query(
        `update bank_receipt set state=$4,
                approved_by=case when $4='approved' then $5 else null end,
                approved_at=case when $4='approved' then clock_timestamp() else null end,
                rejected_by=case when $4='rejected' then $5 else null end,
                rejected_at=case when $4='rejected' then clock_timestamp() else null end,
                decision_reason=$6,approval_override_event_id=$7,
                row_version=row_version+1,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2 and company_id=$3 and state='submitted' and row_version=$8`,
        [
          context.tenantId,
          receiptId,
          previous.company_id,
          approved ? "approved" : "rejected",
          context.actor.userId,
          input.reason ?? null,
          overrideId,
          input.expected_version,
        ],
      );
      if (updated.rowCount !== 1) throw this.versionConflict();
      const row = await this.requireReceipt(client, context, receiptId, true);
      const action = approved ? "banking.receipt.approve" : "banking.receipt.reject";
      const auditId = await this.appendAudit(
        client,
        context,
        correlationId,
        action,
        receiptId,
        safeSnapshot(previous),
        safeSnapshot(row),
        overrideId,
      );
      await this.appendEvent(
        client,
        context,
        row,
        approved ? "approved" : "rejected",
        "submitted",
        approved ? "approved" : "rejected",
        correlationId,
        idempotencyKey,
        auditId,
        overrideId,
      );
      return this.mutationResult(row, auditId);
    });
  }

  post(
    context: BankingActorContext,
    receiptId: string,
    input: PostBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReceiptPostingResult> {
    const path = `/api/v1/banking/receipts/${receiptId}/post`;
    return this.mutate(context, "banking.receipt.post", "POST", path, input, idempotencyKey, 200, async (client) => {
      const previous = await this.requireReceipt(client, context, receiptId, true);
      await this.requireScopedPermission(client, context, "banking.receipt.post", previous.company_id);
      this.requireVersion(previous, input.expected_version);
      if (previous.state !== "approved")
        throw new BankingApiError(409, "RECEIPT_NOT_POSTABLE", "Only an approved Bank Receipt can be posted.");
      const poster = evaluateApprovalActor({
        account: context.actor,
        makerActorIds: [previous.created_by, previous.submitted_by ?? "", previous.approved_by ?? ""],
        normalDecisionPermission: "banking.receipt.post",
        impersonated: context.impersonationRequestId !== undefined,
      });
      if (poster.kind === "forbidden")
        throw new BankingApiError(
          403,
          "RECEIPT_POSTER_SEPARATION_REQUIRED",
          "An independent authorized poster must post this Bank Receipt.",
        );
      let postingOverrideId: string | null = null;
      if (poster.kind === "override") {
        try {
          postingOverrideId = (
            await writeApprovalOverrideEvent(client, {
              tenantId: context.tenantId,
              account: context.actor,
              makerActorIds: [previous.created_by, previous.submitted_by ?? "", previous.approved_by ?? ""],
              normalDecisionPermission: "banking.receipt.post",
              resourceType: "banking.receipt",
              resourceId: receiptId,
              decisionAction: "post",
              reason: "Governed global super-administrator posting segregation override",
              correlationId,
              idempotencyKey: `${idempotencyKey}:posting-override`,
              metadata: {
                company_id: previous.company_id,
                receipt_reference: previous.reference,
                expected_version: input.expected_version,
              },
              impersonated: context.impersonationRequestId !== undefined,
            })
          ).eventId;
        } catch (error) {
          if (error instanceof ApprovalOverrideWriterError)
            throw new BankingApiError(error.code.includes("IDEMPOTENCY") ? 409 : 403, error.code, error.message);
          throw error;
        }
      }
      const bank = await this.requireBankAuthority(
        client,
        context.tenantId,
        previous.company_id,
        previous.bank_account_id,
      );
      const lines = await this.loadLineInputs(client, context.tenantId, previous.company_id, receiptId);
      await this.validateLines(client, context.tenantId, previous.company_id, bank.account_id, lines);
      const financeClient = await createFinanceTransactionClient(client);
      let posted;
      try {
        posted = await this.finance.post(financeClient, {
          tenantId: context.tenantId,
          companyId: previous.company_id,
          actorId: context.actor.userId,
          sourceType: "banking.receipt",
          sourceId: receiptId,
          eventType: "bank_receipt.posted",
          externalIdempotencyKey: idempotencyKey,
          transactionCurrency: previous.transaction_currency,
          postingDate: dateOnly(previous.posting_date)!,
          exchangeRateId: previous.exchange_rate_id,
          exchangeRateValue: previous.exchange_rate_value,
          payloadHashMaterial: {
            receipt_reference: previous.reference,
            receipt_version: Number(previous.row_version),
            receipt_total: previous.total_amount,
          },
          auditRef: correlationId,
          lines: [
            {
              accountId: bank.account_id,
              debit: canonicalDecimal(previous.total_amount),
              credit: "0",
              dimensions: {},
              description: `Bank Receipt ${previous.reference}`,
              sourceMetadata: { bank_account_id: previous.bank_account_id, is_bank_control: true },
            },
            ...lines.map((line) => ({
              accountId: line.nominal_account_id,
              debit: "0",
              credit: canonicalDecimal(line.amount),
              dimensions: line.dimensions,
              description: line.narration ?? `Receipt from ${line.payer_name}`,
              sourceMetadata: {
                line_order: line.line_order,
                external_reference: line.external_reference ?? null,
                document_reference: line.document_reference ?? null,
                receipt_method: line.receipt_method,
                payer_name: line.payer_name,
              },
            })),
          ],
        });
      } catch (error) {
        throw this.mapFinanceError(error);
      }
      const updated = await client.query(
        `update bank_receipt set state='posted',posted_by=$4,posted_at=clock_timestamp(),original_period_id=$5,
                original_accounting_event_id=$6,original_journal_entry_id=$7,row_version=row_version+1,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2 and company_id=$3 and state='approved' and row_version=$8`,
        [
          context.tenantId,
          receiptId,
          previous.company_id,
          context.actor.userId,
          posted.periodId,
          posted.accountingEventId,
          posted.journalId,
          input.expected_version,
        ],
      );
      if (updated.rowCount !== 1) throw this.versionConflict();
      const row = await this.requireReceipt(client, context, receiptId, true);
      const auditId = await this.appendAudit(
        client,
        context,
        correlationId,
        "banking.receipt.post",
        receiptId,
        safeSnapshot(previous),
        safeSnapshot(row),
        postingOverrideId,
      );
      await this.appendEvent(
        client,
        context,
        row,
        "posted",
        "approved",
        "posted",
        correlationId,
        idempotencyKey,
        auditId,
        postingOverrideId,
      );
      return {
        ...this.mutationResult(row, auditId),
        accounting_event_id: posted.accountingEventId,
        journal_id: posted.journalId,
        journal_entry_number: posted.entryNumber,
      };
    });
  }

  reverse(
    context: BankingActorContext,
    receiptId: string,
    input: ReverseBankReceiptRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReceiptReversalResult> {
    const path = `/api/v1/banking/receipts/${receiptId}/reverse`;
    return this.mutate(context, "banking.receipt.reverse", "POST", path, input, idempotencyKey, 200, async (client) => {
      const previous = await this.requireReceipt(client, context, receiptId, true);
      await this.requireScopedPermission(client, context, "banking.receipt.reverse", previous.company_id);
      this.requireVersion(previous, input.expected_version);
      if (previous.state !== "posted" || !previous.original_accounting_event_id || !previous.original_journal_entry_id)
        throw new BankingApiError(409, "RECEIPT_NOT_REVERSIBLE", "Only a posted Bank Receipt can be reversed.");
      const financeClient = await createFinanceTransactionClient(client);
      let reversed;
      try {
        reversed = await this.finance.reverse(financeClient, {
          tenantId: context.tenantId,
          companyId: previous.company_id,
          actorId: context.actor.userId,
          sourceType: "banking.receipt",
          sourceId: receiptId,
          eventType: "bank_receipt.reversed",
          originalEventType: "bank_receipt.posted",
          originalAccountingEventId: previous.original_accounting_event_id,
          originalJournalId: previous.original_journal_entry_id,
          externalIdempotencyKey: idempotencyKey,
          transactionCurrency: previous.transaction_currency,
          payloadHashMaterial: {
            receipt_reference: previous.reference,
            receipt_version: Number(previous.row_version),
            reason_hash: stateHash(input.reason),
          },
          auditRef: correlationId,
        });
      } catch (error) {
        throw this.mapFinanceError(error);
      }
      const updated = await client.query(
        `update bank_receipt set state='reversed',reversed_by=$4,reversed_at=clock_timestamp(),reversal_reason=$5,
                reversal_period_id=$6,reversal_accounting_event_id=$7,reversal_journal_entry_id=$8,
                row_version=row_version+1,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2 and company_id=$3 and state='posted' and row_version=$9`,
        [
          context.tenantId,
          receiptId,
          previous.company_id,
          context.actor.userId,
          input.reason,
          reversed.periodId,
          reversed.accountingEventId,
          reversed.journalId,
          input.expected_version,
        ],
      );
      if (updated.rowCount !== 1) throw this.versionConflict();
      const row = await this.requireReceipt(client, context, receiptId, true);
      const auditId = await this.appendAudit(
        client,
        context,
        correlationId,
        "banking.receipt.reverse",
        receiptId,
        safeSnapshot(previous),
        safeSnapshot(row),
      );
      await this.appendEvent(
        client,
        context,
        row,
        "reversed",
        "posted",
        "reversed",
        correlationId,
        idempotencyKey,
        auditId,
        null,
      );
      return {
        ...this.mutationResult(row, auditId),
        original_accounting_event_id: previous.original_accounting_event_id,
        original_journal_id: previous.original_journal_entry_id,
        reversal_accounting_event_id: reversed.accountingEventId,
        reversal_journal_id: reversed.journalId,
        reversal_journal_entry_number: reversed.entryNumber,
      };
    });
  }

  private async mutate<T extends ReceiptResult>(
    context: BankingActorContext,
    permission: string,
    method: "POST" | "PATCH",
    path: string,
    request: unknown,
    idempotencyKey: string,
    responseStatus: number,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (context.impersonationRequestId)
      throw new BankingApiError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Mutating Banking operations are disabled during impersonation.",
      );
    if (!validIdempotencyKey(idempotencyKey))
      throw new BankingApiError(400, "INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
    const fingerprint = stateHash(request);
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:banking:${context.tenantId}`,
      ]);
      const replay = await client.query<{ request_fingerprint: string; response_body: T }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method=$3 and path=$4 and idempotency_key=$5 for update`,
        [context.tenantId, context.actor.userId, method, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        const replayId = replay.rows[0].response_body.id;
        if (!replayId)
          throw new BankingApiError(
            500,
            "RECEIPT_IDEMPOTENCY_EVIDENCE_INVALID",
            "Stored Bank Receipt replay evidence is invalid.",
          );
        await this.revalidateReplayAuthority(client, context, permission, replayId);
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new BankingApiError(
            409,
            "RECEIPT_IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const result = await operation(client);
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.tenantId,
          context.actor.userId,
          method,
          path,
          idempotencyKey,
          fingerprint,
          responseStatus,
          result,
          stateHash(result),
        ],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (error instanceof BankingApiError) throw error;
      if (postgresCode(error) === "23505")
        throw new BankingApiError(409, "RECEIPT_CONFLICT", "The Bank Receipt conflicts with an existing record.");
      if (postgresCode(error) === "23503" || postgresCode(error) === "23514" || postgresCode(error) === "P0001")
        throw new BankingApiError(
          409,
          "RECEIPT_INVARIANT_VIOLATION",
          "The Bank Receipt could not be changed in its current state.",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  private async read<T>(context: BankingActorContext, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async requireScopedPermission(
    client: PoolClient,
    context: BankingActorContext,
    permission: string,
    companyId: string,
  ): Promise<void> {
    if (context.actor.tenantId !== context.tenantId)
      throw new BankingApiError(403, "TENANT_ACCESS_DENIED", "The tenant boundary was rejected.");
    const result = await client.query(
      `select 1
         from security_user_role_assignment_version assignment
         join security_user_account actor
           on actor.tenant_id=assignment.tenant_id and actor.id=assignment.user_id
          and actor.status='active' and actor.archived_at is null
         join security_role_policy policy
           on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
          and policy.status='active' and policy.lifecycle_state='active'
         join security_tenant_role role
           on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
          and role.lifecycle_state='active'
         join security_role_permission_grant permission_grant
           on permission_grant.tenant_id=policy.tenant_id
          and permission_grant.role_policy_id=policy.id
          and permission_grant.permission_key=$3
         join security_permission_definition definition
           on definition.permission_key=permission_grant.permission_key and definition.status='active'
         join security_role_scope_grant scope
           on scope.tenant_id=permission_grant.tenant_id
          and scope.role_policy_id=permission_grant.role_policy_id
          and scope.permission_key=permission_grant.permission_key
        where assignment.tenant_id=$1 and assignment.user_id=$2
          and assignment.version=(select max(latest.version)
            from security_user_role_assignment_version latest
           where latest.tenant_id=assignment.tenant_id
             and latest.assignment_id=assignment.assignment_id)
          and assignment.lifecycle_state='active' and assignment.valid_from<=now()
          and (assignment.valid_until is null or assignment.valid_until>now())
          and ((scope.scope_kind='tenant' and scope.scope_value=$1)
            or (scope.scope_kind='company' and scope.scope_value=$4))
        limit 1`,
      [context.tenantId, context.actor.userId, permission, companyId],
    );
    if (!result.rowCount)
      throw new BankingApiError(
        403,
        "PERMISSION_DENIED",
        "You are not permitted to perform this Banking operation for the company.",
      );
  }

  private async revalidateReplayAuthority(
    client: PoolClient,
    context: BankingActorContext,
    permission: string,
    receiptId: string,
  ): Promise<void> {
    const receipt = await client.query<{ company_id: string }>(
      `select company_id from bank_receipt where tenant_id=$1 and id=$2`,
      [context.tenantId, receiptId],
    );
    const companyId = receipt.rows[0]?.company_id;
    if (!companyId)
      throw new BankingApiError(404, "RECEIPT_NOT_FOUND", "The stored Bank Receipt replay target is unavailable.");
    await this.requireScopedPermission(client, context, permission, companyId);
    await this.requireCompanyAccess(client, context, companyId);
  }

  private async requireCompanyAccess(
    client: PoolClient,
    context: BankingActorContext,
    companyId: string,
  ): Promise<void> {
    const result = await client.query(
      `select 1 from security_user_company_access access join organization_unit company
         on company.tenant_id=access.tenant_id and company.id=access.company_id
        where access.tenant_id=$1 and access.user_id=$2 and access.company_id=$3 and access.revoked_at is null
          and company.type='company' and company.status='active'`,
      [context.tenantId, context.actor.userId, companyId],
    );
    if (!result.rowCount)
      throw new BankingApiError(403, "COMPANY_ACCESS_DENIED", "The company is outside your access scope.");
  }

  private async requireReceipt(
    client: PoolClient,
    context: BankingActorContext,
    receiptId: string,
    forUpdate: boolean,
  ): Promise<ReceiptRow> {
    const result = await client.query<ReceiptRow>(
      `select receipt.* from bank_receipt receipt
        where receipt.tenant_id=$1 and receipt.id=$2
          and exists (select 1 from security_user_company_access access
                       where access.tenant_id=receipt.tenant_id and access.user_id=$3
                         and access.company_id=receipt.company_id and access.revoked_at is null)
        ${forUpdate ? "for update" : ""}`,
      [context.tenantId, receiptId, context.actor.userId],
    );
    if (!result.rows[0])
      throw new BankingApiError(404, "RECEIPT_NOT_FOUND", "The Bank Receipt is unavailable in your company scope.");
    return result.rows[0];
  }

  private requireVersion(row: ReceiptRow, expectedVersion: number): void {
    if (Number(row.row_version) !== expectedVersion) throw this.versionConflict();
  }

  private versionConflict(): BankingApiError {
    return new BankingApiError(
      409,
      "RECEIPT_VERSION_CONFLICT",
      "The Bank Receipt changed before this request was applied.",
    );
  }

  private async requireBankAuthority(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    bankAccountId: string,
  ): Promise<BankAuthority> {
    const result = await client.query<BankAuthority>(
      `select bank.id,bank.reference,bank.account_name,bank.bank_name,bank.account_number_masked,bank.currency,
              bank.account_id,ledger.code as ledger_account_code,ledger.name as ledger_account_name
         from bank_account bank join account ledger
           on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
        where bank.tenant_id=$1 and bank.company_id=$2 and bank.id=$3 and bank.status='active'
          and ledger.status='active' and not ledger.is_header and ledger.manual_posting_allowed and ledger.reconciliation_required
        for share of bank,ledger`,
      [tenantId, companyId, bankAccountId],
    );
    if (!result.rows[0])
      throw new BankingApiError(400, "RECEIPT_BANK_ACCOUNT_INVALID", "Select an active eligible bank account.");
    return result.rows[0];
  }

  private async resolveRate(
    client: PoolClient,
    tenantId: string,
    transactionCurrency: string,
    postingDate: string,
  ): Promise<RateAuthority> {
    const bases = await client.query<{ code: string }>(
      `select code from currency where tenant_id=$1 and status='active' and is_base order by code for share`,
      [tenantId],
    );
    if (bases.rows.length !== 1)
      throw new BankingApiError(
        500,
        "RECEIPT_CURRENCY_AUTHORITY_INVALID",
        "Exactly one active base currency is required.",
      );
    const currency = await client.query<{ decimal_places: number }>(
      `select decimal_places from currency where tenant_id=$1 and code=$2 and status='active' for share`,
      [tenantId, transactionCurrency],
    );
    if (!currency.rows[0])
      throw new BankingApiError(400, "RECEIPT_CURRENCY_INVALID", "The bank account currency is unavailable.");
    const baseCurrency = bases.rows[0]!.code;
    if (transactionCurrency === baseCurrency)
      return {
        baseCurrency,
        rateId: null,
        rateValue: "1.000000000000000000",
        decimalPlaces: currency.rows[0].decimal_places,
      };
    await client.query("select pg_advisory_xact_lock(finance_currency_rate_lock_key($1,$2,$3))", [
      tenantId,
      transactionCurrency,
      baseCurrency,
    ]);
    const rate = await client.query<{ id: string; rate: string }>(
      `select id,rate::text as rate from currency_rate
        where tenant_id=$1 and source_currency=$2 and target_currency=$3 and effective_date<=$4::date
        order by effective_date desc,id desc limit 1 for share`,
      [tenantId, transactionCurrency, baseCurrency, postingDate],
    );
    if (!rate.rows[0])
      throw new BankingApiError(
        400,
        "RECEIPT_FX_RATE_UNAVAILABLE",
        "A direct exchange rate is unavailable for the posting date.",
      );
    return {
      baseCurrency,
      rateId: rate.rows[0].id,
      rateValue: rate.rows[0].rate,
      decimalPlaces: currency.rows[0].decimal_places,
    };
  }

  private async resolveFiscalYear(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    postingDate: string,
  ): Promise<number> {
    const result = await client.query<{ year: number }>(
      `select year from fiscal_calendar where tenant_id=$1 and company_id=$2
        and $3::date between period_start and period_end order by id for share`,
      [tenantId, companyId, postingDate],
    );
    if (result.rows.length !== 1)
      throw new BankingApiError(
        409,
        "RECEIPT_FISCAL_CALENDAR_UNAVAILABLE",
        "Exactly one fiscal calendar must cover the posting date.",
      );
    return result.rows[0]!.year;
  }

  private async requireOpenPeriod(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    postingDate: string,
  ): Promise<void> {
    const result = await client.query<{ status: string }>(
      `select period.status from financial_period period join fiscal_calendar calendar
         on calendar.tenant_id=period.tenant_id and calendar.company_id=period.company_id and calendar.id=period.fiscal_calendar_id
        where period.tenant_id=$1 and period.company_id=$2 and $3::date between period.period_start and period.period_end
        order by period.id for share of period,calendar`,
      [tenantId, companyId, postingDate],
    );
    if (result.rows.length !== 1 || result.rows[0]!.status !== "open")
      throw new BankingApiError(409, "RECEIPT_PERIOD_LOCKED", "The Finance period for this posting date is not open.");
  }

  private async validateLines(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    controlAccountId: string,
    lines: readonly BankReceiptLineInput[],
  ): Promise<void> {
    const ids = [...new Set(lines.map((line) => line.nominal_account_id))];
    const accounts = await client.query<{ id: string; required_dimensions: unknown }>(
      `select id,required_dimensions from account
        where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active'
          and not is_header and manual_posting_allowed and not reconciliation_required for share`,
      [tenantId, companyId, ids],
    );
    if (accounts.rows.length !== ids.length || ids.includes(controlAccountId))
      throw new BankingApiError(
        400,
        "RECEIPT_ACCOUNT_INVALID",
        "A receipt nominal account is unavailable or is the bank control account.",
      );
    const byId = new Map(accounts.rows.map((account) => [account.id, account]));
    for (const line of lines) {
      const required = byId.get(line.nominal_account_id)?.required_dimensions;
      if (!Array.isArray(required) || !required.every((item) => typeof item === "string"))
        throw new BankingApiError(
          500,
          "RECEIPT_ACCOUNT_AUTHORITY_INVALID",
          "Nominal account dimension authority is invalid.",
        );
      for (const dimension of required)
        if (!line.dimensions[dimension]?.trim())
          throw new BankingApiError(400, "RECEIPT_DIMENSION_REQUIRED", "A required accounting dimension is missing.");
    }
  }

  private async replaceLines(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    receiptId: string,
    lines: readonly BankReceiptLineInput[],
  ): Promise<void> {
    const existing = await client.query<{ id: string; line_number: number }>(
      `select id,line_number from bank_receipt_line where tenant_id=$1 and company_id=$2 and receipt_id=$3 order by line_number for update`,
      [tenantId, companyId, receiptId],
    );
    const ids = new Map(existing.rows.map((line) => [line.line_number, line.id]));
    await client.query(`delete from bank_receipt_line where tenant_id=$1 and company_id=$2 and receipt_id=$3`, [
      tenantId,
      companyId,
      receiptId,
    ]);
    for (const line of [...lines].sort((left, right) => left.line_order - right.line_order)) {
      await client.query(
        `insert into bank_receipt_line
          (id,tenant_id,company_id,receipt_id,line_number,document_date,external_reference,document_reference,
           receipt_method,payer_name,nominal_account_id,narration,amount,dimensions,created_at,updated_at)
         values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,clock_timestamp(),clock_timestamp())`,
        [
          ids.get(line.line_order) ?? `bank-receipt-line-${randomUUID()}`,
          tenantId,
          companyId,
          receiptId,
          line.line_order,
          line.document_date,
          line.external_reference ?? null,
          line.document_reference ?? null,
          line.receipt_method,
          line.payer_name,
          line.nominal_account_id,
          line.narration ?? null,
          line.amount,
          JSON.stringify(line.dimensions),
        ],
      );
    }
  }

  private async loadLineInputs(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    receiptId: string,
  ): Promise<BankReceiptLineInput[]> {
    const result = await client.query<BankReceiptLineInput>(
      `select line_number as line_order,document_date::text,external_reference,document_reference,receipt_method,
              payer_name,nominal_account_id,narration,amount::text,dimensions
         from bank_receipt_line where tenant_id=$1 and company_id=$2 and receipt_id=$3 order by line_number`,
      [tenantId, companyId, receiptId],
    );
    return result.rows;
  }

  private async loadDetail(
    client: PoolClient,
    context: BankingActorContext,
    row: ReceiptRow,
  ): Promise<BankReceiptDetail> {
    const bank = await client.query<BankAuthority>(
      `select bank.id,bank.reference,bank.account_name,bank.bank_name,bank.account_number_masked,bank.currency,
              bank.account_id,ledger.code as ledger_account_code,ledger.name as ledger_account_name
         from bank_account bank join account ledger
           on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
        where bank.tenant_id=$1 and bank.company_id=$2 and bank.id=$3`,
      [context.tenantId, row.company_id, row.bank_account_id],
    );
    const bankRow = bank.rows[0];
    if (!bankRow)
      throw new BankingApiError(500, "RECEIPT_BANK_AUTHORITY_INVALID", "Stored bank account authority is unavailable.");
    const lines = await client.query<{
      id: string;
      line_order: number;
      document_date: string;
      external_reference: string | null;
      document_reference: string | null;
      receipt_method: BankReceiptDetail["lines"][number]["receipt_method"];
      payer_name: string;
      nominal_account_id: string;
      narration: string | null;
      amount: string;
      dimensions: Record<string, string>;
    }>(
      `select id,line_number as line_order,document_date::text,external_reference,document_reference,receipt_method,
              payer_name,nominal_account_id,narration,amount::text,dimensions
         from bank_receipt_line where tenant_id=$1 and company_id=$2 and receipt_id=$3 order by line_number`,
      [context.tenantId, row.company_id, row.id],
    );
    const accountIds = [...new Set(lines.rows.map((line) => line.nominal_account_id))];
    const accounts = await client.query<{ id: string; code: string; name: string }>(
      `select id,code,name from account where tenant_id=$1 and company_id=$2 and id=any($3::text[])`,
      [context.tenantId, row.company_id, accountIds],
    );
    const accountById = new Map(accounts.rows.map((account) => [account.id, account]));
    const events = await client.query<{
      id: string;
      action: BankReceiptDetail["timeline"][number]["action"];
      previous_state: BankReceiptState | null;
      resulting_state: BankReceiptState;
      actor_id: string;
      actor_label: string;
      occurred_at: string | Date;
    }>(
      `select event.event_id as id,event.event_type as action,event.from_state as previous_state,event.to_state as resulting_state,
              event.actor_id,coalesce(nullif(actor.display_name,''),nullif(actor.email,''),event.actor_id) as actor_label,event.occurred_at
         from bank_receipt_event event left join security_user_account actor
           on actor.tenant_id=event.tenant_id and actor.id=event.actor_id
        where event.tenant_id=$1 and event.company_id=$2 and event.receipt_id=$3
        order by event.occurred_at,event.event_id limit 1000`,
      [context.tenantId, row.company_id, row.id],
    );
    const journalNumbers = await client.query<{ original_entry: string | null; reversal_entry: string | null }>(
      `select original.entry_number as original_entry,reversal.entry_number as reversal_entry
         from (select 1) seed
         left join journal_entry original on original.tenant_id=$1 and original.company_id=$2 and original.id=$3
         left join journal_entry reversal on reversal.tenant_id=$1 and reversal.company_id=$2 and reversal.id=$4`,
      [context.tenantId, row.company_id, row.original_journal_entry_id, row.reversal_journal_entry_id],
    );
    const makerIds = [row.created_by, row.submitted_by ?? ""];
    const approval = evaluateApprovalActor({
      account: context.actor,
      makerActorIds: makerIds,
      normalDecisionPermission: "banking.receipt.approve",
      impersonated: context.impersonationRequestId !== undefined,
    });
    const selfDecision = makerIds.includes(context.actor.userId);
    const previewLines: BankReceiptDetail["accounting_preview"]["lines"] = [
      {
        line_order: 1,
        account_id: bankRow.account_id,
        account_code: bankRow.ledger_account_code,
        account_name: bankRow.ledger_account_name,
        side: "debit",
        amount: row.total_amount,
        is_bank_control: true,
      },
    ];
    previewLines.push(
      ...lines.rows.map((line) => {
        const account = accountById.get(line.nominal_account_id);
        if (!account)
          throw new BankingApiError(
            500,
            "RECEIPT_ACCOUNT_AUTHORITY_INVALID",
            "Stored nominal account authority is unavailable.",
          );
        return {
          line_order: line.line_order + 1,
          account_id: account.id,
          account_code: account.code,
          account_name: account.name,
          side: "credit" as const,
          amount: line.amount,
          is_bank_control: false,
        };
      }),
    );
    return {
      id: row.id,
      company_id: row.company_id,
      reference: row.reference,
      bank_account_id: row.bank_account_id,
      bank_account_name: bankRow.account_name,
      bank_name: bankRow.bank_name,
      account_number_masked: bankRow.account_number_masked,
      posting_date: dateOnly(row.posting_date)!,
      value_date: dateOnly(row.value_date),
      currency: row.transaction_currency,
      total_amount: row.total_amount,
      line_count: lines.rows.length,
      payer_summary: lines.rows[0]?.payer_name ?? null,
      nominal_account_summary: lines.rows[0]
        ? `${accountById.get(lines.rows[0].nominal_account_id)?.code ?? ""} - ${accountById.get(lines.rows[0].nominal_account_id)?.name ?? ""}`.trim()
        : null,
      narration_summary: lines.rows[0]?.narration ?? null,
      state: row.state,
      version: Number(row.row_version),
      created_at: iso(row.created_at)!,
      base_currency: row.base_currency,
      exchange_rate: row.transaction_currency === row.base_currency ? null : row.exchange_rate_value,
      lines: lines.rows,
      timeline: events.rows.map((event) => ({
        ...event,
        reason:
          event.action === "rejected" || event.action === "approved"
            ? row.decision_reason
            : event.action === "reversed"
              ? row.reversal_reason
              : null,
        occurred_at: iso(event.occurred_at)!,
      })),
      accounting_preview: {
        currency: row.transaction_currency,
        lines: previewLines,
        debit_total: row.total_amount,
        credit_total: row.total_amount,
      },
      created_by: row.created_by,
      submitted_by: row.submitted_by,
      approved_by: row.approved_by,
      rejected_by: row.rejected_by,
      posted_by: row.posted_by,
      reversed_by: row.reversed_by,
      submitted_at: iso(row.submitted_at),
      approved_at: iso(row.approved_at),
      rejected_at: iso(row.rejected_at),
      posted_at: iso(row.posted_at),
      reversed_at: iso(row.reversed_at),
      accounting_event_id: row.original_accounting_event_id,
      journal_id: row.original_journal_entry_id,
      journal_entry_number: journalNumbers.rows[0]?.original_entry ?? null,
      reversal_accounting_event_id: row.reversal_accounting_event_id,
      reversal_journal_id: row.reversal_journal_entry_id,
      reversal_journal_entry_number: journalNumbers.rows[0]?.reversal_entry ?? null,
      self_decision_requires_override: selfDecision,
      super_admin_override_allowed: selfDecision && approval.kind === "override",
    };
  }

  private mutationResult(row: ReceiptRow, auditId: string): BankReceiptMutationResult {
    return {
      id: row.id,
      reference: row.reference,
      state: row.state,
      version: Number(row.row_version),
      audit_event_id: auditId,
      replayed: false,
    };
  }

  private async appendAudit(
    client: PoolClient,
    context: BankingActorContext,
    correlationId: string,
    action: string,
    receiptId: string,
    before: unknown,
    after: unknown,
    approvalReference: string | null = null,
  ): Promise<string> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const latest = await client.query<{ sequence: string; event_hash: string }>(
      `select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1`,
      [context.tenantId],
    );
    const sequence = latest.rows[0] ? Number(latest.rows[0].sequence) + 1 : 1;
    const previousEventHash = latest.rows[0]?.event_hash ?? stateHash({ genesis: context.tenantId });
    const id = `audit-${randomUUID()}`;
    const occurredAt = new Date().toISOString();
    const payload = {
      id,
      tenant_id: context.tenantId,
      actor_id: context.actor.userId,
      correlation_id: correlationId,
      action,
      entity_type: "bank_receipt",
      entity_id: receiptId,
      before_hash: stateHash(before),
      after_hash: stateHash(after),
      source_reference: "banking.receipt",
      approval_reference: approvalReference,
      occurred_at: occurredAt,
      sequence,
      previous_event_hash: previousEventHash,
    };
    const eventHash = stateHash(payload);
    await client.query(
      `insert into platform_admin_audit_event
       (id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,
        source_reference,approval_reference,occurred_at,previous_event_hash,event_hash)
       values ($1,$2,$3,$4,$5,$6,'bank_receipt',$7,$8,$9,'banking.receipt',$10,$11,$12,$13)`,
      [
        id,
        context.tenantId,
        sequence,
        context.actor.userId,
        correlationId,
        action,
        receiptId,
        payload.before_hash,
        payload.after_hash,
        approvalReference,
        occurredAt,
        previousEventHash,
        eventHash,
      ],
    );
    return id;
  }

  private async appendEvent(
    client: PoolClient,
    context: BankingActorContext,
    row: ReceiptRow,
    eventType: BankReceiptDetail["timeline"][number]["action"],
    fromState: BankReceiptState | null,
    toState: BankReceiptState,
    correlationId: string,
    idempotencyKey: string,
    auditId: string,
    overrideId: string | null,
  ): Promise<void> {
    await client.query(
      `insert into bank_receipt_event
       (tenant_id,company_id,event_id,receipt_id,event_type,from_state,to_state,actor_id,correlation_id,
        idempotency_key,platform_audit_event_id,approval_override_event_id,safe_metadata,occurred_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,clock_timestamp())`,
      [
        context.tenantId,
        row.company_id,
        `bank-receipt-event-${randomUUID()}`,
        row.id,
        eventType,
        fromState,
        toState,
        context.actor.userId,
        correlationId,
        idempotencyKey,
        auditId,
        overrideId,
        JSON.stringify({ reference: row.reference, version: Number(row.row_version), total_amount: row.total_amount }),
      ],
    );
  }

  private mapFinanceError(error: unknown): BankingApiError {
    if (!(error instanceof FinancePostingError))
      return new BankingApiError(
        500,
        "RECEIPT_POSTING_FAILED",
        "The Bank Receipt accounting operation could not be completed safely.",
      );
    const mapping: Partial<Record<FinancePostingError["code"], string>> = {
      FINANCE_PERIOD_CLOSED_POST_BLOCKED: "RECEIPT_PERIOD_LOCKED",
      FINANCE_PERIOD_UNAVAILABLE: "RECEIPT_PERIOD_LOCKED",
      FINANCE_EXCHANGE_RATE_MISSING: "RECEIPT_FX_RATE_UNAVAILABLE",
      FINANCE_EXCHANGE_RATE_CHANGED: "RECEIPT_FX_RATE_CHANGED",
      FINANCE_ACCOUNT_INVALID: "RECEIPT_ACCOUNT_INVALID",
      FINANCE_ACCOUNT_INACTIVE_POST_BLOCKED: "RECEIPT_ACCOUNT_INVALID",
      FINANCE_ACCOUNT_NOT_POSTABLE: "RECEIPT_ACCOUNT_INVALID",
      FINANCE_DIMENSION_REQUIRED: "RECEIPT_DIMENSION_REQUIRED",
      FINANCE_IDEMPOTENCY_CONFLICT: "RECEIPT_IDEMPOTENCY_CONFLICT",
      FINANCE_SOURCE_ALREADY_POSTED: "RECEIPT_ALREADY_POSTED",
      FINANCE_REVERSAL_ALREADY_EXISTS: "RECEIPT_ALREADY_REVERSED",
    };
    return new BankingApiError(error.status, mapping[error.code] ?? "RECEIPT_POSTING_FAILED", error.message);
  }
}
