import { createHash, randomUUID } from "node:crypto";

import type { AuthenticatedAccount } from "@nexora/auth";
import type {
  BankAccountCurrencySummary,
  BankAccountDetail,
  BankAccountDirectory,
  BankAccountDirectoryQuery,
  BankAccountMutationResult,
  BankingCompanyDirectory,
  BankingLedgerAccountDirectory,
  BankingLedgerAccountDirectoryQuery,
  ChangeBankAccountStatusRequest,
  CreateBankAccountRequest,
  DecideBankAccountRequest,
  SubmitBankAccountRequest,
  UpdateBankAccountRequest,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";

import { BankingIdentifierCrypto } from "./crypto.js";

export class BankingApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface BankingActorContext {
  tenantId: string;
  actor: AuthenticatedAccount;
  realActorId?: string;
  impersonationRequestId?: string;
}

interface BankAccountRow {
  id: string;
  tenant_id: string;
  company_id: string;
  account_id: string;
  reference: string;
  account_name: string;
  account_type: "current" | "deposit" | "escrow" | "cash";
  bank_name: string;
  branch: string;
  account_number_masked: string;
  account_number_ciphertext: Buffer;
  account_number_nonce: Buffer;
  account_number_hash: string;
  iban_masked: string | null;
  iban_ciphertext: Buffer | null;
  iban_nonce: Buffer | null;
  iban_hash: string | null;
  encryption_key_version: string;
  swift_bic: string;
  currency: string;
  status: BankAccountDetail["state"];
  overdraft_limit: string;
  row_version: string | number;
  created_by: string | null;
  submitted_by: string | null;
  submitted_at: string | Date | null;
  submission_reason: string | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  rejected_by: string | null;
  rejected_at: string | Date | null;
  decision_reason: string | null;
  deactivated_by: string | null;
  deactivated_at: string | Date | null;
  closed_by: string | null;
  closed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `<protected:${value.length}>`;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
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
  return value === null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function escapeSearch(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ version: 1, offset }), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      version?: unknown;
      offset?: unknown;
    };
    if (parsed.version !== 1 || !Number.isInteger(parsed.offset) || Number(parsed.offset) < 0)
      throw new Error("invalid cursor");
    return Number(parsed.offset);
  } catch {
    throw new BankingApiError(400, "BANKING_CURSOR_INVALID", "The bank account cursor is invalid.");
  }
}

function safeSnapshot(row: BankAccountRow): Record<string, unknown> {
  return {
    id: row.id,
    company_id: row.company_id,
    reference: row.reference,
    account_name: row.account_name,
    account_type: row.account_type,
    bank_name: row.bank_name,
    branch: row.branch,
    account_number_masked: row.account_number_masked,
    iban_masked: row.iban_masked,
    swift_bic: row.swift_bic,
    currency: row.currency,
    ledger_account_id: row.account_id,
    overdraft_limit: row.overdraft_limit,
    state: row.status,
    version: Number(row.row_version),
  };
}

function postgresCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export class SourceBankingRepository {
  constructor(
    private readonly pool: Pool,
    private readonly identifiers: BankingIdentifierCrypto,
  ) {}

  listCompanies(context: BankingActorContext): Promise<BankingCompanyDirectory> {
    return this.read(
      context,
      [
        "banking.bank_account.read",
        "banking.bank_account.create",
        "banking.bank_account.update",
        "banking.bank_account.submit",
        "banking.bank_account.approve",
        "banking.bank_account.status",
      ],
      async (client) => {
        const result = await client.query<BankingCompanyDirectory["items"][number]>(
          `select company.id,company.code,company.name
             from organization_unit company
             join security_user_company_access access
               on access.tenant_id=company.tenant_id and access.company_id=company.id
            where company.tenant_id=$1 and access.user_id=$2 and access.revoked_at is null
              and company.type='company' and company.status='active'
            order by access.is_default desc,company.name,company.code,company.id
            limit 100`,
          [context.tenantId, context.actor.userId],
        );
        return { items: result.rows };
      },
    );
  }

  listLedgerAccounts(
    context: BankingActorContext,
    query: BankingLedgerAccountDirectoryQuery,
  ): Promise<BankingLedgerAccountDirectory> {
    return this.read(
      context,
      ["banking.bank_account.read", "banking.bank_account.create", "banking.bank_account.update"],
      async (client) => {
        await this.requireCompanyAccess(client, context, query.company_id);
        const values: unknown[] = [context.tenantId, query.company_id];
        const filters = [
          "ledger.tenant_id=$1",
          "ledger.company_id=$2",
          "ledger.type='asset'",
          "ledger.status='active'",
          "ledger.is_header=false",
          "ledger.manual_posting_allowed=true",
          "ledger.reconciliation_required=true",
        ];
        if (query.search) {
          const parameter = values.push(`%${escapeSearch(query.search)}%`);
          filters.push(`(ledger.code ilike $${parameter} escape '\\' or ledger.name ilike $${parameter} escape '\\')`);
        }
        values.push(query.limit);
        const result = await client.query<BankingLedgerAccountDirectory["items"][number]>(
          `select ledger.id,ledger.code,ledger.name,null::text as currency
           from account ledger
          where ${filters.join(" and ")}
          order by ledger.code,ledger.id
          limit $${values.length}`,
          values,
        );
        return { items: result.rows };
      },
    );
  }

  listAccounts(context: BankingActorContext, query: BankAccountDirectoryQuery): Promise<BankAccountDirectory> {
    return this.read(context, "banking.bank_account.read", async (client) => {
      await this.requireCompanyAccess(client, context, query.company_id);
      const offset = decodeCursor(query.cursor);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["bank.tenant_id=$1", "bank.company_id=$2"];
      if (query.search) {
        const parameter = values.push(`%${escapeSearch(query.search)}%`);
        filters.push(
          `(bank.account_name ilike $${parameter} escape '\\' or bank.bank_name ilike $${parameter} escape '\\' or bank.reference ilike $${parameter} escape '\\' or bank.account_number_masked ilike $${parameter} escape '\\')`,
        );
      }
      if (query.bank) filters.push(`bank.bank_name=$${values.push(query.bank)}`);
      if (query.currency) filters.push(`bank.currency=$${values.push(query.currency)}`);
      if (query.ledger_account_id) filters.push(`bank.account_id=$${values.push(query.ledger_account_id)}`);
      if (query.state) filters.push(`bank.status=$${values.push(query.state)}`);
      const sortColumns = {
        account_name: "bank.account_name",
        bank_name: "bank.bank_name",
        currency: "bank.currency",
        ledger_balance: "ledger_balance",
        last_movement_on: "last_movement_on",
      } as const;
      const sortColumn = sortColumns[query.sort_by];
      values.push(query.limit + 1, offset);
      const result = await client.query<{
        id: string;
        reference: string;
        account_name: string;
        account_type: BankAccountDetail["account_type"];
        bank_name: string;
        branch: string;
        account_number_masked: string;
        currency: string;
        ledger_account_id: string;
        ledger_account_code: string;
        ledger_account_name: string;
        ledger_balance: string;
        available_balance: string | null;
        unreconciled_count: number | null;
        last_movement_on: string | Date | null;
        state: BankAccountDetail["state"];
        version: string | number;
      }>(
        `select bank.id,bank.reference,bank.account_name,bank.account_type,bank.bank_name,bank.branch,
                bank.account_number_masked,bank.currency,bank.account_id as ledger_account_id,
                ledger.code as ledger_account_code,ledger.name as ledger_account_name,
                coalesce(sum(case when journal.status='posted' and line.currency=bank.currency
                                  then line.debit-line.credit else 0 end),0)::text as ledger_balance,
                null::text as available_balance,null::integer as unreconciled_count,
                max(journal.posting_date) filter (where journal.status='posted') as last_movement_on,
                bank.status as state,bank.row_version as version
           from bank_account bank
           join account ledger on ledger.tenant_id=bank.tenant_id and ledger.id=bank.account_id
           left join journal_line line on line.tenant_id=bank.tenant_id and line.account_id=bank.account_id
           left join journal_entry journal
             on journal.tenant_id=line.tenant_id and journal.id=line.journal_id and journal.company_id=bank.company_id
          where ${filters.join(" and ")}
          group by bank.id,bank.tenant_id,ledger.code,ledger.name
          order by ${sortColumn} ${query.sort_direction},bank.id ${query.sort_direction}
          limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      const hasNext = result.rows.length > query.limit;
      return {
        items: result.rows.slice(0, query.limit).map((row) => ({
          ...row,
          ledger_balance: row.ledger_balance,
          available_balance: row.available_balance,
          unreconciled_count: row.unreconciled_count,
          last_movement_on: dateOnly(row.last_movement_on),
          version: Number(row.version),
        })),
        next_cursor: hasNext ? encodeCursor(offset + query.limit) : null,
      };
    });
  }

  accountSummary(context: BankingActorContext, companyId: string): Promise<BankAccountCurrencySummary> {
    return this.read(context, "banking.bank_account.read", async (client) => {
      await this.requireCompanyAccess(client, context, companyId);
      const result = await client.query<BankAccountCurrencySummary["items"][number]>(
        `with balances as (
           select bank.id,bank.currency,
                  coalesce(sum(case when journal.status='posted' and line.currency=bank.currency
                                    then line.debit-line.credit else 0 end),0) as ledger_balance
             from bank_account bank
             left join journal_line line on line.tenant_id=bank.tenant_id and line.account_id=bank.account_id
             left join journal_entry journal
               on journal.tenant_id=line.tenant_id and journal.id=line.journal_id and journal.company_id=bank.company_id
            where bank.tenant_id=$1 and bank.company_id=$2 and bank.status='active'
            group by bank.id,bank.currency
         )
         select currency,sum(ledger_balance)::text as ledger_balance,count(*)::integer as account_count
           from balances group by currency order by currency`,
        [context.tenantId, companyId],
      );
      return { items: result.rows };
    });
  }

  getAccount(context: BankingActorContext, accountId: string): Promise<BankAccountDetail> {
    return this.read(context, "banking.bank_account.read", async (client) => {
      const row = await this.loadAccountProjection(client, context, accountId);
      if (!row)
        throw new BankingApiError(
          404,
          "BANK_ACCOUNT_NOT_FOUND",
          "The bank account is unavailable in your company scope.",
        );
      return row;
    });
  }

  createAccount(
    context: BankingActorContext,
    input: CreateBankAccountRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankAccountMutationResult> {
    const path = "/api/v1/banking/accounts";
    return this.mutate(context, "banking.bank_account.create", path, input, idempotencyKey, 201, async (client) => {
      await this.requireCompanyAccess(client, context, input.company_id);
      await this.requireEligibleLedgerAccount(client, context.tenantId, input.company_id, input.ledger_account_id);
      const accountEnvelope = this.identifiers.encrypt(input.account_number);
      const ibanEnvelope = input.iban ? this.identifiers.encrypt(input.iban) : null;
      const id = `bank-account-${randomUUID()}`;
      const reference = `BA-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      try {
        await client.query(
          `insert into bank_account (
             id,tenant_id,company_id,account_id,reference,account_name,account_type,bank_name,branch,
             account_number_masked,account_number_ciphertext,account_number_nonce,account_number_hash,
             iban_masked,iban_ciphertext,iban_nonce,iban_hash,encryption_key_version,swift_bic,currency,
             status,overdraft_limit,row_version,created_by,created_at,updated_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'draft',$21,1,$22,now(),now())`,
          [
            id,
            context.tenantId,
            input.company_id,
            input.ledger_account_id,
            reference,
            input.account_name,
            input.account_type,
            input.bank_name,
            input.branch ?? "",
            this.identifiers.mask(input.account_number),
            accountEnvelope.ciphertext,
            accountEnvelope.nonce,
            this.identifiers.hash(input.account_number),
            input.iban ? this.identifiers.mask(input.iban) : null,
            ibanEnvelope?.ciphertext ?? null,
            ibanEnvelope?.nonce ?? null,
            input.iban ? this.identifiers.hash(input.iban) : null,
            accountEnvelope.keyVersion,
            input.swift_bic ?? "",
            input.currency,
            input.overdraft_limit,
            context.actor.userId,
          ],
        );
      } catch (error) {
        if (postgresCode(error) === "23505")
          throw new BankingApiError(
            409,
            "BANK_ACCOUNT_DUPLICATE",
            "A matching bank account already exists for this company.",
          );
        throw error;
      }
      const row = await this.loadAccountRow(client, context, id);
      if (!row) throw new Error("Created bank account could not be reloaded.");
      await this.appendEvent(client, context, row, "created", null);
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "banking.bank_account.create",
        id,
        null,
        safeSnapshot(row),
      );
      return { id, reference, state: "draft", version: 1, audit_event_id: audit, replayed: false };
    });
  }

  updateAccount(
    context: BankingActorContext,
    accountId: string,
    input: UpdateBankAccountRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankAccountMutationResult> {
    const path = `/api/v1/banking/accounts/${accountId}`;
    return this.mutate(context, "banking.bank_account.update", path, input, idempotencyKey, 200, async (client) => {
      const previous = await this.requireAccountForUpdate(client, context, accountId);
      if (!["draft", "rejected"].includes(previous.status))
        throw new BankingApiError(
          409,
          "BANK_ACCOUNT_NOT_EDITABLE",
          "Only draft or rejected bank accounts can be revised.",
        );
      if (Number(previous.row_version) !== input.expected_version)
        throw new BankingApiError(
          409,
          "BANK_ACCOUNT_VERSION_CONFLICT",
          "The bank account changed before this request was applied.",
        );
      const companyId = previous.company_id;
      const ledgerAccountId = input.ledger_account_id ?? previous.account_id;
      await this.requireEligibleLedgerAccount(client, context.tenantId, companyId, ledgerAccountId);

      const accountEnvelope = input.account_number ? this.identifiers.encrypt(input.account_number) : null;
      const ibanSpecified = Object.prototype.hasOwnProperty.call(input, "iban");
      const swiftBicSpecified = Object.prototype.hasOwnProperty.call(input, "swift_bic");
      const ibanEnvelope = typeof input.iban === "string" ? this.identifiers.encrypt(input.iban) : null;
      const nextState = previous.status === "rejected" ? "draft" : "draft";
      try {
        await client.query(
          `update bank_account set
             account_id=$4,account_name=$5,account_type=$6,bank_name=$7,branch=$8,
             account_number_masked=$9,account_number_ciphertext=$10,account_number_nonce=$11,account_number_hash=$12,
             iban_masked=$13,iban_ciphertext=$14,iban_nonce=$15,iban_hash=$16,
             encryption_key_version=$17,swift_bic=$18,currency=$19,overdraft_limit=$20,status=$21,
             submitted_by=null,submitted_at=null,submission_reason=null,
             approved_by=null,approved_at=null,rejected_by=null,rejected_at=null,decision_reason=null,
             row_version=row_version+1,updated_at=clock_timestamp()
           where tenant_id=$1 and id=$2 and row_version=$3`,
          [
            context.tenantId,
            accountId,
            input.expected_version,
            ledgerAccountId,
            input.account_name ?? previous.account_name,
            input.account_type ?? previous.account_type,
            input.bank_name ?? previous.bank_name,
            input.branch ?? previous.branch,
            input.account_number ? this.identifiers.mask(input.account_number) : previous.account_number_masked,
            accountEnvelope?.ciphertext ?? previous.account_number_ciphertext,
            accountEnvelope?.nonce ?? previous.account_number_nonce,
            input.account_number ? this.identifiers.hash(input.account_number) : previous.account_number_hash,
            ibanSpecified
              ? typeof input.iban === "string"
                ? this.identifiers.mask(input.iban)
                : null
              : previous.iban_masked,
            ibanSpecified ? (ibanEnvelope?.ciphertext ?? null) : previous.iban_ciphertext,
            ibanSpecified ? (ibanEnvelope?.nonce ?? null) : previous.iban_nonce,
            ibanSpecified
              ? typeof input.iban === "string"
                ? this.identifiers.hash(input.iban)
                : null
              : previous.iban_hash,
            accountEnvelope?.keyVersion ?? ibanEnvelope?.keyVersion ?? previous.encryption_key_version,
            swiftBicSpecified ? (input.swift_bic ?? "") : previous.swift_bic,
            input.currency ?? previous.currency,
            input.overdraft_limit ?? previous.overdraft_limit,
            nextState,
          ],
        );
      } catch (error) {
        if (postgresCode(error) === "23505")
          throw new BankingApiError(
            409,
            "BANK_ACCOUNT_DUPLICATE",
            "A matching bank account already exists for this company.",
          );
        throw error;
      }
      const row = await this.loadAccountRow(client, context, accountId);
      if (!row) throw new Error("Updated bank account could not be reloaded.");
      await this.appendEvent(client, context, row, previous.status === "rejected" ? "revised" : "updated", null);
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "banking.bank_account.update",
        accountId,
        safeSnapshot(previous),
        safeSnapshot(row),
      );
      return {
        id: row.id,
        reference: row.reference,
        state: row.status,
        version: Number(row.row_version),
        audit_event_id: audit,
        replayed: false,
      };
    });
  }

  submitAccount(
    context: BankingActorContext,
    accountId: string,
    input: SubmitBankAccountRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankAccountMutationResult> {
    const path = `/api/v1/banking/accounts/${accountId}/submit`;
    return this.mutate(context, "banking.bank_account.submit", path, input, idempotencyKey, 200, async (client) => {
      const previous = await this.requireAccountForUpdate(client, context, accountId);
      if (previous.status !== "draft")
        throw new BankingApiError(409, "BANK_ACCOUNT_NOT_SUBMITTABLE", "Only a draft bank account can be submitted.");
      this.requireVersion(previous, input.expected_version);
      await client.query(
        `update bank_account set status='pending_approval',submitted_by=$4,submitted_at=now(),submission_reason=$5,
                row_version=row_version+1,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2 and row_version=$3`,
        [context.tenantId, accountId, input.expected_version, context.actor.userId, input.reason],
      );
      const row = await this.loadAccountRow(client, context, accountId);
      if (!row) throw new Error("Submitted bank account could not be reloaded.");
      await this.appendEvent(client, context, row, "submitted", input.reason);
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "banking.bank_account.submit",
        accountId,
        safeSnapshot(previous),
        safeSnapshot(row),
      );
      return {
        id: row.id,
        reference: row.reference,
        state: row.status,
        version: Number(row.row_version),
        audit_event_id: audit,
        replayed: false,
      };
    });
  }

  decideAccount(
    context: BankingActorContext,
    accountId: string,
    input: DecideBankAccountRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankAccountMutationResult> {
    const path = `/api/v1/banking/accounts/${accountId}/decision`;
    return this.mutate(context, "banking.bank_account.approve", path, input, idempotencyKey, 200, async (client) => {
      const previous = await this.requireAccountForUpdate(client, context, accountId);
      if (previous.status !== "pending_approval")
        throw new BankingApiError(409, "BANK_ACCOUNT_NOT_PENDING", "The bank account is not pending approval.");
      this.requireVersion(previous, input.expected_version);
      if (previous.created_by === context.actor.userId || previous.submitted_by === context.actor.userId)
        throw new BankingApiError(
          403,
          "MAKER_CHECKER_REQUIRED",
          "A different authorized actor must decide this bank account.",
        );
      const approved = input.action === "approve";
      await client.query(
        `update bank_account set status=$4,
                approved_by=case when $4='active' then $5 else null end,
                approved_at=case when $4='active' then now() else null end,
                rejected_by=case when $4='rejected' then $5 else null end,
                rejected_at=case when $4='rejected' then now() else null end,
                decision_reason=$6,row_version=row_version+1,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2 and row_version=$3`,
        [
          context.tenantId,
          accountId,
          input.expected_version,
          approved ? "active" : "rejected",
          context.actor.userId,
          input.reason,
        ],
      );
      const row = await this.loadAccountRow(client, context, accountId);
      if (!row) throw new Error("Decided bank account could not be reloaded.");
      await this.appendEvent(client, context, row, approved ? "approved" : "rejected", input.reason);
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        approved ? "banking.bank_account.approve" : "banking.bank_account.reject",
        accountId,
        safeSnapshot(previous),
        safeSnapshot(row),
      );
      return {
        id: row.id,
        reference: row.reference,
        state: row.status,
        version: Number(row.row_version),
        audit_event_id: audit,
        replayed: false,
      };
    });
  }

  changeStatus(
    context: BankingActorContext,
    accountId: string,
    input: ChangeBankAccountStatusRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankAccountMutationResult> {
    const path = `/api/v1/banking/accounts/${accountId}/status`;
    return this.mutate(context, "banking.bank_account.status", path, input, idempotencyKey, 200, async (client) => {
      const previous = await this.requireAccountForUpdate(client, context, accountId);
      this.requireVersion(previous, input.expected_version);
      const expected = input.action === "deactivate" ? "active" : "inactive";
      const next = input.action === "deactivate" ? "inactive" : "closed";
      if (previous.status !== expected)
        throw new BankingApiError(
          409,
          "BANK_ACCOUNT_STATUS_CONFLICT",
          `Only an ${expected} bank account can be ${input.action}d.`,
        );
      await client.query(
        `update bank_account set status=$4,
                deactivated_by=case when $4='inactive' then $5 else deactivated_by end,
                deactivated_at=case when $4='inactive' then now() else deactivated_at end,
                closed_by=case when $4='closed' then $5 else closed_by end,
                closed_at=case when $4='closed' then now() else closed_at end,
                row_version=row_version+1,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2 and row_version=$3`,
        [context.tenantId, accountId, input.expected_version, next, context.actor.userId],
      );
      const row = await this.loadAccountRow(client, context, accountId);
      if (!row) throw new Error("Status-changed bank account could not be reloaded.");
      await this.appendEvent(
        client,
        context,
        row,
        input.action === "deactivate" ? "deactivated" : "closed",
        input.reason,
      );
      const audit = await this.appendPlatformAudit(
        client,
        context,
        correlationId,
        "banking.bank_account.status",
        accountId,
        safeSnapshot(previous),
        safeSnapshot(row),
      );
      return {
        id: row.id,
        reference: row.reference,
        state: row.status,
        version: Number(row.row_version),
        audit_event_id: audit,
        replayed: false,
      };
    });
  }

  private async mutate(
    context: BankingActorContext,
    permission: string,
    path: string,
    request: unknown,
    idempotencyKey: string,
    responseStatus: number,
    operation: (client: PoolClient) => Promise<BankAccountMutationResult>,
  ): Promise<BankAccountMutationResult> {
    if (!context.actor.permissions.includes(permission))
      throw new BankingApiError(403, "PERMISSION_DENIED", "You are not permitted to perform this Banking operation.");
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
      const replay = await client.query<{ request_fingerprint: string; response_body: BankAccountMutationResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4 for update`,
        [context.tenantId, context.actor.userId, path, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new BankingApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used for another request.",
          );
        await client.query("commit");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      const result = await operation(client);
      await client.query(
        `insert into platform_admin_idempotency
          (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
         values ($1,$2,'POST',$3,$4,$5,$6,$7,$8)`,
        [
          context.tenantId,
          context.actor.userId,
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
      throw error;
    } finally {
      client.release();
    }
  }

  private async read<T>(
    context: BankingActorContext,
    permission: string | readonly string[],
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const allowed = typeof permission === "string" ? [permission] : permission;
    if (!allowed.some((item) => context.actor.permissions.includes(item)))
      throw new BankingApiError(403, "PERMISSION_DENIED", "You are not permitted to access this Banking data.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      const output = await operation(client);
      await client.query("commit");
      return output;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async requireCompanyAccess(
    client: PoolClient,
    context: BankingActorContext,
    companyId: string,
  ): Promise<void> {
    const access = await client.query(
      `select 1 from security_user_company_access access
        join organization_unit company
          on company.tenant_id=access.tenant_id and company.id=access.company_id
       where access.tenant_id=$1 and access.user_id=$2 and access.company_id=$3
         and access.revoked_at is null and company.type='company' and company.status='active'`,
      [context.tenantId, context.actor.userId, companyId],
    );
    if (!access.rowCount)
      throw new BankingApiError(403, "COMPANY_ACCESS_DENIED", "The company is outside your access scope.");
  }

  private async requireEligibleLedgerAccount(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    ledgerAccountId: string,
  ): Promise<void> {
    const result = await client.query(
      `select 1 from account
        where tenant_id=$1 and company_id=$2 and id=$3 and type='asset' and status='active'
          and is_header=false and manual_posting_allowed=true and reconciliation_required=true`,
      [tenantId, companyId, ledgerAccountId],
    );
    if (!result.rowCount)
      throw new BankingApiError(400, "BANK_LEDGER_ACCOUNT_INVALID", "Select an active postable bank-control account.");
  }

  private async requireAccountForUpdate(
    client: PoolClient,
    context: BankingActorContext,
    accountId: string,
  ): Promise<BankAccountRow> {
    const row = await this.loadAccountRow(client, context, accountId, true);
    if (!row)
      throw new BankingApiError(
        404,
        "BANK_ACCOUNT_NOT_FOUND",
        "The bank account is unavailable in your company scope.",
      );
    return row;
  }

  private requireVersion(row: BankAccountRow, expectedVersion: number): void {
    if (Number(row.row_version) !== expectedVersion)
      throw new BankingApiError(
        409,
        "BANK_ACCOUNT_VERSION_CONFLICT",
        "The bank account changed before this request was applied.",
      );
  }

  private async loadAccountRow(
    client: PoolClient,
    context: BankingActorContext,
    accountId: string,
    forUpdate = false,
  ): Promise<BankAccountRow | null> {
    const result = await client.query<BankAccountRow>(
      `select bank.* from bank_account bank
        where bank.tenant_id=$1 and bank.id=$2
          and exists (select 1 from security_user_company_access access
                       where access.tenant_id=bank.tenant_id and access.user_id=$3
                         and access.company_id=bank.company_id and access.revoked_at is null)
        ${forUpdate ? "for update" : ""}`,
      [context.tenantId, accountId, context.actor.userId],
    );
    return result.rows[0] ?? null;
  }

  private async loadAccountProjection(
    client: PoolClient,
    context: BankingActorContext,
    accountId: string,
  ): Promise<BankAccountDetail | null> {
    const result = await client.query<{
      id: string;
      reference: string;
      account_name: string;
      account_type: BankAccountDetail["account_type"];
      bank_name: string;
      branch: string;
      account_number_masked: string;
      currency: string;
      ledger_account_id: string;
      ledger_account_code: string;
      ledger_account_name: string;
      ledger_balance: string;
      available_balance: string | null;
      unreconciled_count: number | null;
      last_movement_on: string | Date | null;
      state: BankAccountDetail["state"];
      version: string | number;
      company_id: string;
      iban_masked: string | null;
      swift_bic: string;
      overdraft_limit: string;
      created_by: string | null;
      submitted_by: string | null;
      approved_by: string | null;
      rejected_by: string | null;
      created_at: string | Date;
      submitted_at: string | Date | null;
      approved_at: string | Date | null;
      rejected_at: string | Date | null;
    }>(
      `select bank.id,bank.reference,bank.account_name,bank.account_type,bank.bank_name,bank.branch,
              bank.account_number_masked,bank.currency,bank.account_id as ledger_account_id,
              ledger.code as ledger_account_code,ledger.name as ledger_account_name,
              coalesce(sum(case when journal.status='posted' and line.currency=bank.currency
                                then line.debit-line.credit else 0 end),0)::text as ledger_balance,
              null::text as available_balance,null::integer as unreconciled_count,
              max(journal.posting_date) filter (where journal.status='posted') as last_movement_on,
              bank.status as state,bank.row_version as version,bank.company_id,bank.iban_masked,
              bank.swift_bic,bank.overdraft_limit::text,bank.created_by,bank.submitted_by,
              bank.approved_by,bank.rejected_by,bank.created_at,bank.submitted_at,bank.approved_at,bank.rejected_at
         from bank_account bank
         join account ledger on ledger.tenant_id=bank.tenant_id and ledger.id=bank.account_id
         left join journal_line line on line.tenant_id=bank.tenant_id and line.account_id=bank.account_id
         left join journal_entry journal
           on journal.tenant_id=line.tenant_id and journal.id=line.journal_id and journal.company_id=bank.company_id
        where bank.tenant_id=$1 and bank.id=$2
          and exists (select 1 from security_user_company_access access
                       where access.tenant_id=bank.tenant_id and access.user_id=$3
                         and access.company_id=bank.company_id and access.revoked_at is null)
        group by bank.id,bank.tenant_id,ledger.code,ledger.name`,
      [context.tenantId, accountId, context.actor.userId],
    );
    const row = result.rows[0];
    return row
      ? {
          ...row,
          last_movement_on: dateOnly(row.last_movement_on),
          version: Number(row.version),
          created_at: iso(row.created_at)!,
          submitted_at: iso(row.submitted_at),
          approved_at: iso(row.approved_at),
          rejected_at: iso(row.rejected_at),
        }
      : null;
  }

  private async appendEvent(
    client: PoolClient,
    context: BankingActorContext,
    row: BankAccountRow,
    eventType: "created" | "updated" | "submitted" | "approved" | "rejected" | "revised" | "deactivated" | "closed",
    reason: string | null,
  ): Promise<void> {
    await client.query(
      `insert into bank_account_event (tenant_id,event_id,account_id,event_type,actor_id,reason,state_snapshot)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        context.tenantId,
        `bank-account-event-${randomUUID()}`,
        row.id,
        eventType,
        context.actor.userId,
        reason,
        safeSnapshot(row),
      ],
    );
  }

  private async appendPlatformAudit(
    client: PoolClient,
    context: BankingActorContext,
    correlationId: string,
    action:
      | "banking.bank_account.create"
      | "banking.bank_account.update"
      | "banking.bank_account.submit"
      | "banking.bank_account.approve"
      | "banking.bank_account.reject"
      | "banking.bank_account.status",
    entityId: string,
    before: unknown,
    after: unknown,
  ): Promise<string> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const latest = await client.query<{ sequence: string; event_hash: string }>(
      `select sequence,event_hash from platform_admin_audit_event
        where tenant_id=$1 order by sequence desc limit 1`,
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
      entity_type: "bank_account",
      entity_id: entityId,
      before_hash: stateHash(before),
      after_hash: stateHash(after),
      source_reference: "banking.bank_account",
      approval_reference: null,
      occurred_at: occurredAt,
      sequence,
      previous_event_hash: previousEventHash,
    };
    const eventHash = stateHash(payload);
    await client.query(
      `insert into platform_admin_audit_event
       (id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        context.tenantId,
        sequence,
        context.actor.userId,
        correlationId,
        action,
        "bank_account",
        entityId,
        payload.before_hash,
        payload.after_hash,
        payload.source_reference,
        null,
        occurredAt,
        previousEventHash,
        eventHash,
      ],
    );
    return id;
  }
}
