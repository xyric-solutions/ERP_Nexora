import { createHash, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import {
  bankStatementImportDetailSchema,
  bankStatementImportDirectorySchema,
  bankStatementImportMutationResultSchema,
  bankStatementImportOptionsSchema,
  bankStatementMappingProfileDirectorySchema,
  bankStatementMappingProfileSchema,
  bankStatementMappingSnapshotSchema,
  type BankStatementImportDetail,
  type BankStatementImportDirectory,
  type BankStatementImportDirectoryQuery,
  type BankStatementImportMutationResult,
  type BankStatementImportOptions,
  type BankStatementImportOptionsQuery,
  type BankStatementMappingProfile,
  type BankStatementMappingProfileDirectory,
  type BankStatementMappingProfileDirectoryQuery,
  type BankStatementMappingSnapshot,
  type BankStatementUploadFields,
  type CreateBankStatementMappingProfileRequest,
  type FinalizeBankStatementImportRequest,
  type UpdateBankStatementImportMappingRequest,
  type UpdateBankStatementLineRequest,
  type UpdateBankStatementMappingProfileRequest,
  type ValidateBankStatementImportRequest,
} from "@nexora/contracts";

import { BankingApiError, type BankingActorContext } from "../source-repository.js";
import type {
  BankingStatementImportRepository,
  CreateBankStatementImportCommand,
  NormalizedBankStatementLine,
} from "./service.js";

type ProfileRow = {
  id: string;
  company_id: string;
  bank_account_id: string;
  name: string;
  state: "active" | "inactive";
  mapping: unknown;
  row_version: string | number;
  created_by: string;
  updated_by: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type ImportRow = {
  id: string;
  company_id: string;
  bank_account_id: string;
  bank_account_name: string;
  mapping_profile_id: string | null;
  statement_reference: string;
  statement_date_from: string | Date | null;
  statement_date_to: string | Date | null;
  original_filename: string;
  file_format: "csv" | "xlsx";
  detected_media_type:
    "text/csv" | "application/csv" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  object_storage_key: string;
  byte_size: string | number;
  checksum_sha256: string;
  date_format: BankStatementMappingSnapshot["date_format"];
  mapping_snapshot: unknown | null;
  statement_ending_date: string | Date | null;
  statement_ending_balance: string | null;
  state: "uploaded" | "draft" | "validated" | "finalized" | "rejected";
  total_row_count: number;
  valid_row_count: number;
  warning_row_count: number;
  error_row_count: number;
  duplicate_row_count: number;
  excluded_row_count: number;
  finalized_row_count: number;
  supersedes_import_id: string | null;
  row_version: string | number;
  created_by: string;
  created_at: string | Date;
  finalized_by: string | null;
  finalized_at: string | Date | null;
};

type LineRow = {
  id: string;
  import_id: string;
  source_row_number: number;
  raw_row: Record<string, string | null>;
  transaction_date: string | Date | null;
  direction: "money_in" | "money_out" | null;
  amount: string | null;
  currency: string;
  reference: string | null;
  details: string | null;
  transaction_type: string | null;
  account_text: string | null;
  payment_mode: string | null;
  running_balance: string | null;
  row_fingerprint: string;
  inclusion_state: "included" | "excluded";
  exclusion_reason: string | null;
  validation_state: "valid" | "warning" | "duplicate" | "error";
  duplicate_disposition: "not_applicable" | "unresolved" | "accepted_duplicate" | "rejected_duplicate";
  validation_issues: unknown;
  row_version: string | number;
};

type BankRow = {
  id: string;
  reference: string;
  account_name: string;
  bank_name: string | null;
  account_number_masked: string | null;
  currency: string;
};

type Counts = {
  total: number;
  valid: number;
  warning: number;
  error: number;
  duplicate: number;
  excluded: number;
  finalized: number;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 1_000;
const DATE_FORMATS = ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MM-yyyy"] as const;

const iso = (value: string | Date | null) => (value === null ? null : new Date(value).toISOString());
const dateOnly = (value: string | Date | null) =>
  value === null ? null : (value instanceof Date ? value.toISOString() : value).slice(0, 10);
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => [key, canonical(entry)]),
        )
      : value;
const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)), "utf8")
    .digest("hex");

export class SourceBankStatementImportRepository implements BankingStatementImportRepository {
  constructor(private readonly pool: Pool) {}

  private claim(context: BankingActorContext, permission: string): void {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission)) {
      throw new BankingApiError(
        403,
        "PERMISSION_DENIED",
        "You are not permitted to perform this Bank Statement operation.",
      );
    }
  }

  private async scoped(
    client: PoolClient,
    context: BankingActorContext,
    permission: string,
    companyId: string,
  ): Promise<void> {
    this.claim(context, permission);
    const result = await client.query<{ allowed: boolean }>("select bank_has_live_permission($1,$2,$3,$4) as allowed", [
      context.tenantId,
      companyId,
      context.actor.userId,
      permission,
    ]);
    if (!result.rows[0]?.allowed) {
      throw new BankingApiError(403, "COMPANY_ACCESS_DENIED", "The company is outside your live permission scope.");
    }
  }

  private async transaction<T>(
    context: BankingActorContext,
    mutation: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (mutation && (context.realActorId || context.impersonationRequestId)) {
      throw new BankingApiError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Mutating Bank Statement operations are disabled during impersonation.",
      );
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select set_config('nexora.user_id',$1,true)", [context.actor.userId]);
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${context.tenantId}`,
      ]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof BankingApiError) throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23503", "23505", "23514", "40001", "40P01"].includes(String(error.code))
      ) {
        throw new BankingApiError(
          409,
          "STATEMENT_AUTHORITY_CONFLICT",
          "Bank Statement authority or a concurrent change conflicted. Refresh and retry.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async idempotent<T>(
    client: PoolClient,
    context: BankingActorContext,
    path: string,
    input: unknown,
    key: string,
    parse: (value: unknown, replayed: boolean) => T,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(key)) {
      throw new BankingApiError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    }
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:statement-import:${context.tenantId}:${context.actor.userId}:${path}:${key}`,
    ]);
    const requestFingerprint = hash(input);
    const prior = (
      await client.query<{ request_fingerprint: string; response_body: unknown }>(
        `select request_fingerprint,response_body
           from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4`,
        [context.tenantId, context.actor.userId, path, key],
      )
    ).rows[0];
    if (prior) {
      if (prior.request_fingerprint !== requestFingerprint) {
        throw new BankingApiError(409, "IDEMPOTENCY_CONFLICT", "This key was used for another request.");
      }
      return parse(prior.response_body, true);
    }
    const result = await work();
    await client.query(
      `insert into platform_admin_idempotency
        (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
       values($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
      [
        context.tenantId,
        context.actor.userId,
        path,
        key,
        requestFingerprint,
        JSON.stringify(result),
        `"${hash(result)}"`,
      ],
    );
    return result;
  }

  private profile(row: ProfileRow): BankStatementMappingProfile {
    return bankStatementMappingProfileSchema.parse({
      id: row.id,
      company_id: row.company_id,
      bank_account_id: row.bank_account_id,
      name: row.name,
      state: row.state,
      mapping: row.mapping,
      version: Number(row.row_version),
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    });
  }

  private async profileById(
    client: PoolClient,
    context: BankingActorContext,
    id: string,
    lock = false,
  ): Promise<ProfileRow> {
    const row = (
      await client.query<ProfileRow>(
        `select * from bank_statement_mapping_profile
          where tenant_id=$1 and id=$2${lock ? " for update" : ""}`,
        [context.tenantId, id],
      )
    ).rows[0];
    if (!row)
      throw new BankingApiError(404, "STATEMENT_MAPPING_PROFILE_NOT_FOUND", "The mapping profile was not found.");
    return row;
  }

  private async bank(
    client: PoolClient,
    context: BankingActorContext,
    companyId: string,
    bankAccountId: string,
  ): Promise<BankRow> {
    const row = (
      await client.query<BankRow>(
        `select bank.id,bank.reference,bank.account_name,nullif(bank.bank_name,'') as bank_name,
                bank.account_number_masked,bank.currency
           from bank_account bank
           join account ledger
             on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
           join currency
             on currency.tenant_id=bank.tenant_id and currency.code=bank.currency and currency.status='active'
          where bank.tenant_id=$1 and bank.company_id=$2 and bank.id=$3 and bank.status='active'
            and ledger.status='active' and not ledger.is_header and ledger.reconciliation_required
          for share of bank,ledger,currency`,
        [context.tenantId, companyId, bankAccountId],
      )
    ).rows[0];
    if (!row) {
      throw new BankingApiError(
        400,
        "STATEMENT_BANK_ACCOUNT_INVALID",
        "Select an active same-company Bank Account with an approved reconciliation nominal.",
      );
    }
    return row;
  }

  private async importById(
    client: PoolClient,
    context: BankingActorContext,
    id: string,
    lock = false,
  ): Promise<ImportRow> {
    const row = (
      await client.query<ImportRow>(
        `select statement.*,bank.account_name as bank_account_name,
                period.statement_date_from,period.statement_date_to
           from bank_statement_import statement
           join bank_account bank
             on bank.tenant_id=statement.tenant_id and bank.company_id=statement.company_id
            and bank.id=statement.bank_account_id
           left join lateral (
             select min(line.transaction_date) as statement_date_from,
                    max(line.transaction_date) as statement_date_to
               from bank_statement_line line
              where line.tenant_id=statement.tenant_id
                and line.company_id=statement.company_id
                and line.import_id=statement.id
                and line.inclusion_state='included'
                and line.transaction_date is not null
                and line.validation_state in ('valid','warning','duplicate')
                and (line.validation_state<>'duplicate' or line.duplicate_disposition='accepted_duplicate')
           ) period on true
          where statement.tenant_id=$1 and statement.id=$2${lock ? " for update of statement" : ""}`,
        [context.tenantId, id],
      )
    ).rows[0];
    if (!row) throw new BankingApiError(404, "STATEMENT_IMPORT_NOT_FOUND", "The Bank Statement import was not found.");
    return row;
  }

  private version(actual: string | number, expected: number, code = "STATEMENT_VERSION_CONFLICT"): void {
    if (Number(actual) !== expected) {
      throw new BankingApiError(409, code, "The Bank Statement changed. Reload and retry.");
    }
  }

  private async profileEvent(
    client: PoolClient,
    context: BankingActorContext,
    row: ProfileRow,
    eventType: "created" | "updated" | "activated" | "inactivated",
  ): Promise<string> {
    const eventId = `bank-statement-profile-event-${randomUUID()}`;
    await client.query(
      `insert into bank_statement_mapping_profile_event
        (tenant_id,company_id,event_id,profile_id,profile_version,event_type,actor_id,state_snapshot)
       values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        context.tenantId,
        row.company_id,
        eventId,
        row.id,
        row.row_version,
        eventType,
        context.actor.userId,
        JSON.stringify(this.profile(row)),
      ],
    );
    return eventId;
  }

  private async importEvent(
    client: PoolClient,
    context: BankingActorContext,
    row: ImportRow,
    eventType: "uploaded" | "mapping_updated" | "line_resolved" | "validated" | "finalized",
    correlationId: string,
    lineId: string | null = null,
    reason: string | null = null,
  ): Promise<string> {
    const eventId = `bank-statement-import-event-${randomUUID()}`;
    await client.query(
      `insert into bank_statement_import_event
        (tenant_id,company_id,event_id,import_id,import_version,event_type,actor_id,statement_line_id,reason,state_snapshot)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        context.tenantId,
        row.company_id,
        eventId,
        row.id,
        row.row_version,
        eventType,
        context.actor.userId,
        lineId,
        reason,
        JSON.stringify({
          state: row.state,
          version: Number(row.row_version),
          counts: this.counts(row),
          correlation_id: correlationId.slice(0, 128),
        }),
      ],
    );
    return eventId;
  }

  private counts(row: ImportRow): Counts {
    return {
      total: Number(row.total_row_count),
      valid: Number(row.valid_row_count),
      warning: Number(row.warning_row_count),
      error: Number(row.error_row_count),
      duplicate: Number(row.duplicate_row_count),
      excluded: Number(row.excluded_row_count),
      finalized: Number(row.finalized_row_count),
    };
  }

  private summary(row: ImportRow) {
    return {
      id: row.id,
      company_id: row.company_id,
      bank_account_id: row.bank_account_id,
      bank_account_name: row.bank_account_name,
      statement_reference: row.statement_reference,
      statement_date_from: dateOnly(row.statement_date_from ?? null),
      statement_date_to: dateOnly(row.statement_date_to ?? null),
      original_filename: row.original_filename,
      file_format: row.file_format,
      detected_media_type: row.detected_media_type,
      byte_size: Number(row.byte_size),
      checksum_sha256: row.checksum_sha256,
      state: row.state,
      counts: this.counts(row),
      version: Number(row.row_version),
      created_by: row.created_by,
      created_at: iso(row.created_at),
      finalized_by: row.finalized_by,
      finalized_at: iso(row.finalized_at),
    };
  }

  private mutation(row: ImportRow, eventId: string, replayed = false): BankStatementImportMutationResult {
    return bankStatementImportMutationResultSchema.parse({
      id: row.id,
      state: row.state,
      version: Number(row.row_version),
      audit_event_id: eventId,
      replayed,
    });
  }

  private parseMutation(value: unknown, replayed: boolean): BankStatementImportMutationResult {
    const parsed = bankStatementImportMutationResultSchema.parse(value);
    return { ...parsed, replayed };
  }

  private async latestImportEvent(client: PoolClient, tenantId: string, importId: string): Promise<string> {
    const row = (
      await client.query<{ event_id: string }>(
        `select event_id from bank_statement_import_event
          where tenant_id=$1 and import_id=$2 order by occurred_at desc,event_id desc limit 1`,
        [tenantId, importId],
      )
    ).rows[0];
    if (!row)
      throw new BankingApiError(500, "STATEMENT_AUDIT_INVALID", "Bank Statement audit evidence is unavailable.");
    return row.event_id;
  }

  async options(
    context: BankingActorContext,
    query: BankStatementImportOptionsQuery,
  ): Promise<BankStatementImportOptions> {
    this.claim(context, "banking.statement_import.create");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.statement_import.create", query.company_id);
      await this.scoped(client, context, "banking.statement_mapping.read", query.company_id);
      const banks = await client.query<BankRow>(
        `select bank.id,bank.reference,bank.account_name,nullif(bank.bank_name,'') as bank_name,
                bank.account_number_masked,bank.currency
           from bank_account bank
           join account ledger
             on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
           join currency
             on currency.tenant_id=bank.tenant_id and currency.code=bank.currency and currency.status='active'
          where bank.tenant_id=$1 and bank.company_id=$2 and bank.status='active'
            and ledger.status='active' and not ledger.is_header and ledger.reconciliation_required
          order by bank.account_name,bank.reference,bank.id limit 200`,
        [context.tenantId, query.company_id],
      );
      const profiles = await client.query<ProfileRow>(
        `select * from bank_statement_mapping_profile
          where tenant_id=$1 and company_id=$2 and state='active'
          order by name,id limit 100`,
        [context.tenantId, query.company_id],
      );
      return bankStatementImportOptionsSchema.parse({
        bank_accounts: banks.rows,
        mapping_profiles: profiles.rows.map((row) => this.profile(row)),
        date_formats: DATE_FORMATS,
        max_file_bytes: MAX_FILE_BYTES,
        max_rows: MAX_ROWS,
      });
    });
  }

  async listMappingProfiles(
    context: BankingActorContext,
    query: BankStatementMappingProfileDirectoryQuery,
  ): Promise<BankStatementMappingProfileDirectory> {
    this.claim(context, "banking.statement_mapping.read");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.statement_mapping.read", query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["tenant_id=$1", "company_id=$2"];
      if (query.bank_account_id) {
        values.push(query.bank_account_id);
        filters.push(`bank_account_id=$${values.length}`);
      }
      if (query.state) {
        values.push(query.state);
        filters.push(`state=$${values.length}`);
      }
      if (query.search) {
        values.push(`%${escapeLike(query.search)}%`);
        filters.push(`name ilike $${values.length} escape '\\'`);
      }
      const offset = decodeCursor(query.cursor);
      values.push(query.limit + 1, offset);
      const result = await client.query<ProfileRow>(
        `select * from bank_statement_mapping_profile where ${filters.join(" and ")}
          order by name,id limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return bankStatementMappingProfileDirectorySchema.parse({
        items: result.rows.slice(0, query.limit).map((row) => this.profile(row)),
        next_cursor:
          result.rows.length > query.limit
            ? Buffer.from(String(offset + query.limit), "utf8").toString("base64url")
            : null,
      });
    });
  }

  async createMappingProfile(
    context: BankingActorContext,
    input: CreateBankStatementMappingProfileRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementMappingProfile> {
    void correlationId;
    this.claim(context, "banking.statement_mapping.manage");
    return this.transaction(context, true, async (client) => {
      await this.scoped(client, context, "banking.statement_mapping.manage", input.company_id);
      return this.idempotent(
        client,
        context,
        "/api/v1/banking/statement_mapping_profiles",
        input,
        idempotencyKey,
        (value) => bankStatementMappingProfileSchema.parse(value),
        async () => {
          await this.bank(client, context, input.company_id, input.bank_account_id);
          const id = `bank-statement-profile-${randomUUID()}`;
          const row = (
            await client.query<ProfileRow>(
              `insert into bank_statement_mapping_profile
                (tenant_id,company_id,id,bank_account_id,name,state,mapping,created_by,updated_by)
               values($1,$2,$3,$4,$5,'active',$6,$7,$7) returning *`,
              [
                context.tenantId,
                input.company_id,
                id,
                input.bank_account_id,
                input.name,
                JSON.stringify(bankStatementMappingSnapshotSchema.parse(input.mapping)),
                context.actor.userId,
              ],
            )
          ).rows[0]!;
          await this.profileEvent(client, context, row, "created");
          return this.profile(row);
        },
      );
    });
  }

  async updateMappingProfile(
    context: BankingActorContext,
    id: string,
    input: UpdateBankStatementMappingProfileRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementMappingProfile> {
    void correlationId;
    this.claim(context, "banking.statement_mapping.manage");
    return this.transaction(context, true, async (client) => {
      const authority = await this.profileById(client, context, id);
      await this.scoped(client, context, "banking.statement_mapping.manage", authority.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/statement_mapping_profiles/${id}`,
        input,
        idempotencyKey,
        (value) => bankStatementMappingProfileSchema.parse(value),
        async () => {
          const previous = await this.profileById(client, context, id, true);
          await this.scoped(client, context, "banking.statement_mapping.manage", previous.company_id);
          this.version(previous.row_version, input.expected_version, "STATEMENT_MAPPING_PROFILE_VERSION_CONFLICT");
          const mapping = input.mapping
            ? bankStatementMappingSnapshotSchema.parse(input.mapping)
            : bankStatementMappingSnapshotSchema.parse(previous.mapping);
          const row = (
            await client.query<ProfileRow>(
              `update bank_statement_mapping_profile
                  set name=$4,state=$5,mapping=$6,updated_by=$7,row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and id=$3 returning *`,
              [
                context.tenantId,
                previous.company_id,
                id,
                input.name ?? previous.name,
                input.state ?? previous.state,
                JSON.stringify(mapping),
                context.actor.userId,
              ],
            )
          ).rows[0]!;
          const eventType =
            previous.state !== row.state ? (row.state === "active" ? "activated" : "inactivated") : "updated";
          await this.profileEvent(client, context, row, eventType);
          return this.profile(row);
        },
      );
    });
  }

  async prepareUpload(
    context: BankingActorContext,
    fields: BankStatementUploadFields,
  ): Promise<{ currency: string; mappingProfile: { id: string; mapping: BankStatementMappingSnapshot } | null }> {
    this.claim(context, "banking.statement_import.create");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.statement_import.create", fields.company_id);
      const bank = await this.bank(client, context, fields.company_id, fields.bank_account_id);
      let mappingProfile: { id: string; mapping: BankStatementMappingSnapshot } | null = null;
      if (fields.mapping_profile_id) {
        await this.scoped(client, context, "banking.statement_mapping.read", fields.company_id);
        const profile = await this.profileById(client, context, fields.mapping_profile_id);
        if (
          profile.company_id !== fields.company_id ||
          profile.bank_account_id !== fields.bank_account_id ||
          profile.state !== "active"
        ) {
          throw new BankingApiError(
            400,
            "STATEMENT_MAPPING_PROFILE_INVALID",
            "The selected mapping profile is unavailable for this Bank Account.",
          );
        }
        mappingProfile = { id: profile.id, mapping: bankStatementMappingSnapshotSchema.parse(profile.mapping) };
      }
      return { currency: bank.currency, mappingProfile };
    });
  }

  async createImport(
    context: BankingActorContext,
    command: CreateBankStatementImportCommand,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult> {
    this.claim(context, "banking.statement_import.create");
    return this.transaction(context, true, async (client) => {
      await this.scoped(client, context, "banking.statement_import.create", command.fields.company_id);
      return this.idempotent(
        client,
        context,
        "/api/v1/banking/statement_imports",
        {
          fields: command.fields,
          original_filename: command.originalFilename,
          checksum_sha256: command.object.checksumSha256,
          byte_size: command.object.sizeBytes,
          mapping: command.mappingSnapshot,
        },
        idempotencyKey,
        (value, replayed) => this.parseMutation(value, replayed),
        async () => {
          const bank = await this.bank(client, context, command.fields.company_id, command.fields.bank_account_id);
          if (command.lines.length < 1 || command.lines.length > MAX_ROWS) {
            throw new BankingApiError(400, "STATEMENT_ROW_COUNT_INVALID", "A Bank Statement requires 1 to 1,000 rows.");
          }
          if (command.lines.some((line) => line.currency !== bank.currency)) {
            throw new BankingApiError(
              400,
              "STATEMENT_CURRENCY_INVALID",
              "Statement rows must use the Bank Account currency.",
            );
          }
          const mapping = bankStatementMappingSnapshotSchema.parse(command.mappingSnapshot);
          if (command.mappingProfileId) {
            await this.scoped(client, context, "banking.statement_mapping.read", command.fields.company_id);
            const profile = await this.profileById(client, context, command.mappingProfileId);
            if (
              profile.company_id !== command.fields.company_id ||
              profile.bank_account_id !== command.fields.bank_account_id ||
              profile.state !== "active"
            ) {
              throw new BankingApiError(
                400,
                "STATEMENT_MAPPING_PROFILE_INVALID",
                "The mapping profile is unavailable.",
              );
            }
          }
          await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
            `nexora:statement-file:${context.tenantId}:${command.fields.company_id}:${command.fields.bank_account_id}:${command.object.checksumSha256}`,
          ]);
          const duplicate = (
            await client.query<ImportRow>(
              `select statement.*,bank.account_name as bank_account_name
                 from bank_statement_import statement
                 join bank_account bank
                   on bank.tenant_id=statement.tenant_id and bank.company_id=statement.company_id
                  and bank.id=statement.bank_account_id
                where statement.tenant_id=$1 and statement.company_id=$2 and statement.bank_account_id=$3
                  and statement.checksum_sha256=$4
                limit 1`,
              [
                context.tenantId,
                command.fields.company_id,
                command.fields.bank_account_id,
                command.object.checksumSha256,
              ],
            )
          ).rows[0];
          if (duplicate) {
            return this.mutation(duplicate, await this.latestImportEvent(client, context.tenantId, duplicate.id), true);
          }
          const lines = await this.classifyStoredDuplicates(
            client,
            context,
            command.fields.company_id,
            command.fields.bank_account_id,
            command.lines,
          );
          const counts = countLines(lines, false);
          const ending = endingEvidence(lines);
          await client.query(
            `insert into bank_statement_import
              (tenant_id,company_id,id,bank_account_id,mapping_profile_id,statement_reference,
               original_filename,file_format,detected_media_type,object_storage_key,byte_size,checksum_sha256,
               date_format,mapping_snapshot,state,total_row_count,valid_row_count,warning_row_count,
               error_row_count,duplicate_row_count,excluded_row_count,finalized_row_count,
               statement_ending_date,statement_ending_balance,supersedes_import_id,created_by)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15,$16,$17,$18,$19,$20,0,$21,$22,$23,$24)`,
            [
              context.tenantId,
              command.fields.company_id,
              command.id,
              command.fields.bank_account_id,
              command.mappingProfileId,
              command.fields.statement_reference,
              command.originalFilename,
              command.fileFormat,
              command.detectedMediaType,
              command.object.objectKey,
              command.object.sizeBytes,
              command.object.checksumSha256,
              command.fields.date_format,
              JSON.stringify(mapping),
              counts.total,
              counts.valid,
              counts.warning,
              counts.error,
              counts.duplicate,
              counts.excluded,
              ending?.transactionDate ?? null,
              ending?.runningBalance ?? null,
              command.fields.supersedes_import_id ?? null,
              context.actor.userId,
            ],
          );
          await this.insertLines(client, context, command.fields.company_id, command.id, lines);
          const row = await this.importById(client, context, command.id, true);
          const eventId = await this.importEvent(client, context, row, "uploaded", correlationId);
          return this.mutation(row, eventId);
        },
      );
    });
  }

  private async classifyStoredDuplicates(
    client: PoolClient,
    context: BankingActorContext,
    companyId: string,
    bankAccountId: string,
    lines: readonly NormalizedBankStatementLine[],
  ): Promise<NormalizedBankStatementLine[]> {
    const fingerprints = [
      ...new Set(
        lines
          .filter((line) => line.validationState === "valid" || line.validationState === "warning")
          .map((line) => line.rowFingerprint),
      ),
    ];
    if (fingerprints.length === 0) return [...lines];
    const stored = await client.query<{ row_fingerprint: string }>(
      `select distinct line.row_fingerprint
         from bank_statement_line line
         join bank_statement_import statement
           on statement.tenant_id=line.tenant_id and statement.company_id=line.company_id
          and statement.id=line.import_id
        where line.tenant_id=$1 and line.company_id=$2 and statement.bank_account_id=$3
          and statement.state='finalized' and line.inclusion_state='included'
          and line.row_fingerprint=any($4::text[])`,
      [context.tenantId, companyId, bankAccountId, fingerprints],
    );
    const occurrences = new Map<string, number>();
    for (const line of lines) occurrences.set(line.rowFingerprint, (occurrences.get(line.rowFingerprint) ?? 0) + 1);
    const duplicateFingerprints = new Set(stored.rows.map((row) => row.row_fingerprint));
    return lines.map((line) =>
      (duplicateFingerprints.has(line.rowFingerprint) || (occurrences.get(line.rowFingerprint) ?? 0) > 1) &&
      line.validationState !== "error"
        ? { ...line, validationState: "duplicate", duplicateDisposition: "unresolved" }
        : line,
    );
  }

  private async insertLines(
    client: PoolClient,
    context: BankingActorContext,
    companyId: string,
    importId: string,
    lines: readonly NormalizedBankStatementLine[],
  ): Promise<void> {
    const payload = lines.map((line, index) => ({
      id: `bank-statement-line-${randomUUID()}`,
      source_row_number: index + 1,
      raw_row: line.rawRow,
      transaction_date: line.transactionDate,
      direction: line.direction,
      amount: line.amount,
      currency: line.currency,
      reference: line.reference,
      details: line.details,
      transaction_type: line.transactionType,
      account_text: line.accountText,
      payment_mode: line.paymentMode,
      running_balance: line.runningBalance,
      row_fingerprint: line.rowFingerprint,
      inclusion_state: line.inclusionState,
      exclusion_reason: line.exclusionReason,
      validation_state: line.validationState,
      duplicate_disposition: line.duplicateDisposition,
      validation_issues: line.issues,
    }));
    await client.query(
      `insert into bank_statement_line
        (tenant_id,company_id,id,import_id,source_row_number,raw_row,transaction_date,direction,amount,
         currency,reference,details,transaction_type,account_text,payment_mode,running_balance,row_fingerprint,
         inclusion_state,exclusion_reason,validation_state,duplicate_disposition,validation_issues)
       select $1,$2,row.id,$3,row.source_row_number,row.raw_row,row.transaction_date::date,row.direction,
              row.amount::numeric,row.currency,row.reference,row.details,row.transaction_type,row.account_text,
              row.payment_mode,row.running_balance::numeric,row.row_fingerprint,row.inclusion_state,row.exclusion_reason,
              row.validation_state,row.duplicate_disposition,row.validation_issues
         from jsonb_to_recordset($4::jsonb) as row(
           id text,source_row_number integer,raw_row jsonb,transaction_date text,direction text,amount text,
           currency text,reference text,details text,transaction_type text,account_text text,payment_mode text,
           running_balance text,
           row_fingerprint text,inclusion_state text,exclusion_reason text,validation_state text,
           duplicate_disposition text,validation_issues jsonb
         )`,
      [context.tenantId, companyId, importId, JSON.stringify(payload)],
    );
  }

  async list(
    context: BankingActorContext,
    query: BankStatementImportDirectoryQuery,
  ): Promise<BankStatementImportDirectory> {
    this.claim(context, "banking.statement_import.read");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.statement_import.read", query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["statement.tenant_id=$1", "statement.company_id=$2"];
      if (query.bank_account_id) {
        values.push(query.bank_account_id);
        filters.push(`statement.bank_account_id=$${values.length}`);
      }
      if (query.state) {
        values.push(query.state);
        filters.push(`statement.state=$${values.length}`);
      }
      if (query.statement_date_from) {
        values.push(query.statement_date_from);
        filters.push(
          `exists(select 1 from bank_statement_line line where line.tenant_id=statement.tenant_id and line.company_id=statement.company_id and line.import_id=statement.id and line.transaction_date>=$${values.length}::date)`,
        );
      }
      if (query.statement_date_to) {
        values.push(query.statement_date_to);
        filters.push(
          `exists(select 1 from bank_statement_line line where line.tenant_id=statement.tenant_id and line.company_id=statement.company_id and line.import_id=statement.id and line.transaction_date<=$${values.length}::date)`,
        );
      }
      if (query.search) {
        values.push(`%${escapeLike(query.search)}%`);
        filters.push(
          `(statement.statement_reference ilike $${values.length} escape '\\' or statement.original_filename ilike $${values.length} escape '\\')`,
        );
      }
      const offset = decodeCursor(query.cursor);
      values.push(query.limit + 1, offset);
      const result = await client.query<ImportRow>(
        `select statement.*,bank.account_name as bank_account_name,
                period.statement_date_from,period.statement_date_to
           from bank_statement_import statement
           join bank_account bank
             on bank.tenant_id=statement.tenant_id and bank.company_id=statement.company_id
            and bank.id=statement.bank_account_id
           left join lateral (
             select min(line.transaction_date) as statement_date_from,
                    max(line.transaction_date) as statement_date_to
               from bank_statement_line line
              where line.tenant_id=statement.tenant_id
                and line.company_id=statement.company_id
                and line.import_id=statement.id
                and line.inclusion_state='included'
                and line.transaction_date is not null
                and line.validation_state in ('valid','warning','duplicate')
                and (line.validation_state<>'duplicate' or line.duplicate_disposition='accepted_duplicate')
           ) period on true
          where ${filters.join(" and ")}
          order by statement.created_at desc,statement.id desc
          limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return bankStatementImportDirectorySchema.parse({
        items: result.rows.slice(0, query.limit).map((row) => this.summary(row)),
        next_cursor:
          result.rows.length > query.limit
            ? Buffer.from(String(offset + query.limit), "utf8").toString("base64url")
            : null,
      });
    });
  }

  async get(context: BankingActorContext, id: string): Promise<BankStatementImportDetail> {
    this.claim(context, "banking.statement_import.read");
    return this.transaction(context, false, async (client) => {
      const row = await this.importById(client, context, id);
      await this.scoped(client, context, "banking.statement_import.read", row.company_id);
      const lines = await client.query<LineRow>(
        `select id,import_id,source_row_number,raw_row,transaction_date,direction,amount::text,currency,
                reference,details,transaction_type,account_text,payment_mode,running_balance::text,row_fingerprint,inclusion_state,
                exclusion_reason,validation_state,duplicate_disposition,validation_issues,row_version
           from bank_statement_line
          where tenant_id=$1 and company_id=$2 and import_id=$3
          order by source_row_number,id`,
        [context.tenantId, row.company_id, row.id],
      );
      return bankStatementImportDetailSchema.parse({
        ...this.summary(row),
        mapping_profile_id: row.mapping_profile_id,
        mapping_snapshot: row.mapping_snapshot,
        lines: lines.rows.map((line) => ({
          id: line.id,
          import_id: line.import_id,
          source_row_number: line.source_row_number,
          raw_row: line.raw_row,
          transaction_date: dateOnly(line.transaction_date),
          direction: line.direction,
          amount: line.amount,
          currency: line.currency,
          reference: line.reference,
          details: line.details,
          transaction_type: line.transaction_type,
          account_text: line.account_text,
          payment_mode: line.payment_mode,
          running_balance: line.running_balance,
          row_fingerprint: line.row_fingerprint,
          inclusion_state: line.inclusion_state,
          exclusion_reason: line.exclusion_reason,
          validation_state: line.validation_state,
          duplicate_disposition: line.duplicate_disposition,
          issues: line.validation_issues,
          version: Number(line.row_version),
        })),
        supersedes_import_id: row.supersedes_import_id,
        statement_ending_date: dateOnly(row.statement_ending_date),
        statement_ending_balance: row.statement_ending_balance,
      });
    });
  }

  async prepareReparse(
    context: BankingActorContext,
    id: string,
    expectedVersion: number,
  ): Promise<{
    currency: string;
    fileFormat: "csv" | "xlsx";
    objectKey: string;
    byteSize: number;
    checksumSha256: string;
  }> {
    this.claim(context, "banking.statement_import.update");
    return this.transaction(context, false, async (client) => {
      const row = await this.importById(client, context, id);
      await this.scoped(client, context, "banking.statement_import.update", row.company_id);
      this.version(row.row_version, expectedVersion);
      if (!(["draft", "validated"] as const).includes(row.state as "draft" | "validated")) {
        throw new BankingApiError(409, "STATEMENT_MAPPING_LOCKED", "Only an open Bank Statement can be remapped.");
      }
      const priorLineResolution = await client.query<{ exists: boolean }>(
        `select exists(
           select 1 from bank_statement_import_event
            where tenant_id=$1 and company_id=$2 and import_id=$3 and event_type='line_resolved'
         ) as exists`,
        [context.tenantId, row.company_id, id],
      );
      if (priorLineResolution.rows[0]?.exists) {
        throw new BankingApiError(
          409,
          "STATEMENT_MAPPING_HAS_RESOLUTIONS",
          "Resetting a mapping after row decisions would invalidate audit evidence. Create a new import instead.",
        );
      }
      const bank = await this.bank(client, context, row.company_id, row.bank_account_id);
      return {
        currency: bank.currency,
        fileFormat: row.file_format,
        objectKey: row.object_storage_key,
        byteSize: Number(row.byte_size),
        checksumSha256: row.checksum_sha256,
      };
    });
  }

  async replaceMapping(
    context: BankingActorContext,
    id: string,
    input: UpdateBankStatementImportMappingRequest,
    normalizedLines: NormalizedBankStatementLine[],
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult> {
    this.claim(context, "banking.statement_import.update");
    return this.transaction(context, true, async (client) => {
      const authority = await this.importById(client, context, id);
      await this.scoped(client, context, "banking.statement_import.update", authority.company_id);
      if (input.save_profile) {
        await this.scoped(client, context, "banking.statement_mapping.manage", authority.company_id);
      }
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/statement_imports/${id}/mapping`,
        input,
        idempotencyKey,
        (value, replayed) => this.parseMutation(value, replayed),
        async () => {
          const previous = await this.importById(client, context, id, true);
          await this.scoped(client, context, "banking.statement_import.update", previous.company_id);
          this.version(previous.row_version, input.expected_version);
          if (!(["draft", "validated"] as const).includes(previous.state as "draft" | "validated")) {
            throw new BankingApiError(409, "STATEMENT_MAPPING_LOCKED", "Only an open Bank Statement can be remapped.");
          }
          const priorLineResolution = await client.query<{ exists: boolean }>(
            `select exists(
               select 1 from bank_statement_import_event
                where tenant_id=$1 and company_id=$2 and import_id=$3 and event_type='line_resolved'
             ) as exists`,
            [context.tenantId, previous.company_id, id],
          );
          if (priorLineResolution.rows[0]?.exists) {
            throw new BankingApiError(
              409,
              "STATEMENT_MAPPING_HAS_RESOLUTIONS",
              "Resetting a mapping after row decisions would invalidate audit evidence. Create a new import instead.",
            );
          }
          if (normalizedLines.length < 1 || normalizedLines.length > MAX_ROWS) {
            throw new BankingApiError(400, "STATEMENT_ROW_COUNT_INVALID", "A Bank Statement requires 1 to 1,000 rows.");
          }
          const bank = await this.bank(client, context, previous.company_id, previous.bank_account_id);
          if (normalizedLines.some((line) => line.currency !== bank.currency)) {
            throw new BankingApiError(
              400,
              "STATEMENT_CURRENCY_INVALID",
              "Statement rows must use the Bank Account currency.",
            );
          }
          const mapping = bankStatementMappingSnapshotSchema.parse(input.mapping);
          const lines = await this.classifyStoredDuplicates(
            client,
            context,
            previous.company_id,
            previous.bank_account_id,
            normalizedLines,
          );
          let profileId: string | null = null;
          if (input.save_profile) {
            const profileRow = (
              await client.query<ProfileRow>(
                `insert into bank_statement_mapping_profile
                  (tenant_id,company_id,id,bank_account_id,name,state,mapping,created_by,updated_by)
                 values($1,$2,$3,$4,$5,'active',$6,$7,$7) returning *`,
                [
                  context.tenantId,
                  previous.company_id,
                  `bank-statement-profile-${randomUUID()}`,
                  previous.bank_account_id,
                  input.save_profile.name,
                  JSON.stringify(mapping),
                  context.actor.userId,
                ],
              )
            ).rows[0]!;
            await this.profileEvent(client, context, profileRow, "created");
            profileId = profileRow.id;
          }
          await client.query("delete from bank_statement_line where tenant_id=$1 and company_id=$2 and import_id=$3", [
            context.tenantId,
            previous.company_id,
            id,
          ]);
          await this.insertLines(client, context, previous.company_id, id, lines);
          const counts = countLines(lines, false);
          const ending = endingEvidence(lines);
          await client.query(
            `update bank_statement_import
                set mapping_profile_id=$4,mapping_snapshot=$5,date_format=$6,state='draft',
                    total_row_count=$7,valid_row_count=$8,warning_row_count=$9,error_row_count=$10,
                    duplicate_row_count=$11,excluded_row_count=$12,finalized_row_count=0,
                    statement_ending_date=$13::date,statement_ending_balance=$14::numeric,
                    row_version=row_version+1,updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and id=$3`,
            [
              context.tenantId,
              previous.company_id,
              id,
              profileId,
              JSON.stringify(mapping),
              mapping.date_format,
              counts.total,
              counts.valid,
              counts.warning,
              counts.error,
              counts.duplicate,
              counts.excluded,
              ending?.transactionDate ?? null,
              ending?.runningBalance ?? null,
            ],
          );
          const row = await this.importById(client, context, id, true);
          const eventId = await this.importEvent(client, context, row, "mapping_updated", correlationId);
          return this.mutation(row, eventId);
        },
      );
    });
  }

  async updateLine(
    context: BankingActorContext,
    importId: string,
    lineId: string,
    input: UpdateBankStatementLineRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult> {
    this.claim(context, "banking.statement_import.update");
    return this.transaction(context, true, async (client) => {
      const authority = await this.importById(client, context, importId);
      await this.scoped(client, context, "banking.statement_import.update", authority.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/statement_imports/${importId}/lines/${lineId}`,
        input,
        idempotencyKey,
        (value, replayed) => this.parseMutation(value, replayed),
        async () => {
          const previousImport = await this.importById(client, context, importId, true);
          await this.scoped(client, context, "banking.statement_import.update", previousImport.company_id);
          if (!(["draft", "validated"] as const).includes(previousImport.state as "draft" | "validated")) {
            throw new BankingApiError(409, "STATEMENT_LINE_LOCKED", "Finalized Bank Statement rows cannot be changed.");
          }
          const previousLine = (
            await client.query<LineRow>(
              `select * from bank_statement_line
                where tenant_id=$1 and company_id=$2 and import_id=$3 and id=$4 for update`,
              [context.tenantId, previousImport.company_id, importId, lineId],
            )
          ).rows[0];
          if (!previousLine)
            throw new BankingApiError(404, "STATEMENT_LINE_NOT_FOUND", "The statement row was not found.");
          this.version(previousLine.row_version, input.expected_version, "STATEMENT_LINE_VERSION_CONFLICT");

          const inclusionState = input.inclusion_state ?? previousLine.inclusion_state;
          const exclusionReason =
            inclusionState === "included" ? null : (input.exclusion_reason ?? previousLine.exclusion_reason);
          const duplicateDisposition = input.duplicate_disposition ?? previousLine.duplicate_disposition;
          if (inclusionState === "excluded" && !exclusionReason?.trim()) {
            throw new BankingApiError(400, "STATEMENT_EXCLUSION_REASON_REQUIRED", "Excluded rows require a reason.");
          }
          if (exclusionReason && exclusionReason.trim().length < 3) {
            throw new BankingApiError(
              400,
              "STATEMENT_EXCLUSION_REASON_INVALID",
              "An exclusion reason must contain at least three characters.",
            );
          }
          if (previousLine.validation_state === "error" && inclusionState === "included") {
            throw new BankingApiError(
              409,
              "STATEMENT_ERROR_ROW_INCLUDED",
              "A row with errors must be excluded before validation.",
            );
          }
          if (previousLine.validation_state !== "duplicate" && duplicateDisposition !== "not_applicable") {
            throw new BankingApiError(
              400,
              "STATEMENT_DUPLICATE_DISPOSITION_INVALID",
              "Only duplicate rows accept a duplicate decision.",
            );
          }
          if (
            previousLine.validation_state === "duplicate" &&
            ((duplicateDisposition === "accepted_duplicate" && inclusionState !== "included") ||
              (duplicateDisposition === "rejected_duplicate" && inclusionState !== "excluded") ||
              duplicateDisposition === "not_applicable")
          ) {
            throw new BankingApiError(
              400,
              "STATEMENT_DUPLICATE_RESOLUTION_INVALID",
              "Accept included duplicates or reject and exclude them with a reason.",
            );
          }
          await client.query(
            `update bank_statement_line
                set inclusion_state=$5,exclusion_reason=$6,duplicate_disposition=$7,row_version=row_version+1
              where tenant_id=$1 and company_id=$2 and import_id=$3 and id=$4`,
            [
              context.tenantId,
              previousImport.company_id,
              importId,
              lineId,
              inclusionState,
              exclusionReason,
              duplicateDisposition,
            ],
          );
          await this.refreshImportCounts(client, context, previousImport, "draft");
          const row = await this.importById(client, context, importId, true);
          const reason =
            exclusionReason ?? (duplicateDisposition === "accepted_duplicate" ? "Duplicate explicitly accepted" : null);
          const eventId = await this.importEvent(client, context, row, "line_resolved", correlationId, lineId, reason);
          return this.mutation(row, eventId);
        },
      );
    });
  }

  private async refreshImportCounts(
    client: PoolClient,
    context: BankingActorContext,
    row: ImportRow,
    state: "draft" | "validated" | "finalized",
  ): Promise<void> {
    const counts = await queryCounts(client, context.tenantId, row.company_id, row.id, state === "finalized");
    await client.query(
      `update bank_statement_import
          set state=$4,total_row_count=$5,valid_row_count=$6,warning_row_count=$7,error_row_count=$8,
              duplicate_row_count=$9,excluded_row_count=$10,finalized_row_count=$11,
              statement_ending_date=(
                select line.transaction_date
                  from bank_statement_line line
                 where line.tenant_id=$1 and line.company_id=$2 and line.import_id=$3
                   and line.inclusion_state='included' and line.running_balance is not null
                   and line.validation_state in ('valid','warning','duplicate')
                   and (line.validation_state<>'duplicate' or line.duplicate_disposition='accepted_duplicate')
                 order by line.transaction_date desc,line.source_row_number desc,line.id desc limit 1
              ),
              statement_ending_balance=(
                select line.running_balance
                  from bank_statement_line line
                 where line.tenant_id=$1 and line.company_id=$2 and line.import_id=$3
                   and line.inclusion_state='included' and line.running_balance is not null
                   and line.validation_state in ('valid','warning','duplicate')
                   and (line.validation_state<>'duplicate' or line.duplicate_disposition='accepted_duplicate')
                 order by line.transaction_date desc,line.source_row_number desc,line.id desc limit 1
              ),
              row_version=row_version+1,updated_at=clock_timestamp(),
              finalized_by=case when $4='finalized' then $12 else null end,
              finalized_at=case when $4='finalized' then clock_timestamp() else null end
        where tenant_id=$1 and company_id=$2 and id=$3`,
      [
        context.tenantId,
        row.company_id,
        row.id,
        state,
        counts.total,
        counts.valid,
        counts.warning,
        counts.error,
        counts.duplicate,
        counts.excluded,
        counts.finalized,
        context.actor.userId,
      ],
    );
  }

  async validate(
    context: BankingActorContext,
    id: string,
    input: ValidateBankStatementImportRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult> {
    this.claim(context, "banking.statement_import.update");
    return this.transition(
      context,
      id,
      input,
      idempotencyKey,
      correlationId,
      "banking.statement_import.update",
      "draft",
      "validated",
      "validated",
    );
  }

  async finalize(
    context: BankingActorContext,
    id: string,
    input: FinalizeBankStatementImportRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankStatementImportMutationResult> {
    this.claim(context, "banking.statement_import.finalize");
    return this.transition(
      context,
      id,
      input,
      idempotencyKey,
      correlationId,
      "banking.statement_import.finalize",
      "validated",
      "finalized",
      "finalized",
    );
  }

  private async transition(
    context: BankingActorContext,
    id: string,
    input: { expected_version: number },
    idempotencyKey: string,
    correlationId: string,
    permission: "banking.statement_import.update" | "banking.statement_import.finalize",
    expectedState: "draft" | "validated",
    targetState: "validated" | "finalized",
    eventType: "validated" | "finalized",
  ): Promise<BankStatementImportMutationResult> {
    return this.transaction(context, true, async (client) => {
      const authority = await this.importById(client, context, id);
      await this.scoped(client, context, permission, authority.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/statement_imports/${id}/${targetState === "validated" ? "validate" : "finalize"}`,
        input,
        idempotencyKey,
        (value, replayed) => this.parseMutation(value, replayed),
        async () => {
          const previous = await this.importById(client, context, id, true);
          await this.scoped(client, context, permission, previous.company_id);
          this.version(previous.row_version, input.expected_version);
          if (previous.state !== expectedState) {
            throw new BankingApiError(
              409,
              targetState === "validated" ? "STATEMENT_NOT_DRAFT" : "STATEMENT_NOT_VALIDATED",
              targetState === "validated"
                ? "Only a draft Bank Statement can be validated."
                : "Validate the Bank Statement before finalization.",
            );
          }
          const counts = await queryCounts(
            client,
            context.tenantId,
            previous.company_id,
            id,
            targetState === "finalized",
          );
          const unresolved = await client.query<{ count: string }>(
            `select count(*)::text as count from bank_statement_line
              where tenant_id=$1 and company_id=$2 and import_id=$3 and inclusion_state='included'
                and (validation_state='error'
                     or (validation_state='duplicate' and duplicate_disposition<>'accepted_duplicate')
                     or transaction_date is null or direction is null or amount is null)`,
            [context.tenantId, previous.company_id, id],
          );
          if (counts.total === counts.excluded || counts.error > 0 || Number(unresolved.rows[0]?.count ?? 0) > 0) {
            throw new BankingApiError(
              409,
              "STATEMENT_VALIDATION_UNRESOLVED",
              "Resolve or exclude every invalid and duplicate row before continuing.",
            );
          }
          await this.refreshImportCounts(client, context, previous, targetState);
          const row = await this.importById(client, context, id, true);
          const eventId = await this.importEvent(client, context, row, eventType, correlationId);
          return this.mutation(row, eventId);
        },
      );
    });
  }
}

function endingEvidence(lines: readonly NormalizedBankStatementLine[]) {
  return [...lines]
    .filter(
      (line) =>
        line.inclusionState === "included" &&
        (line.validationState === "valid" || line.validationState === "warning") &&
        line.transactionDate !== null &&
        line.runningBalance != null,
    )
    .toSorted(
      (left, right) =>
        left.transactionDate!.localeCompare(right.transactionDate!) || left.sourceRowNumber - right.sourceRowNumber,
    )
    .at(-1);
}

function countLines(lines: readonly NormalizedBankStatementLine[], finalized: boolean): Counts {
  const included = lines.filter((line) => line.inclusionState === "included");
  return {
    total: lines.length,
    valid: included.filter((line) => line.validationState === "valid").length,
    warning: included.filter((line) => line.validationState === "warning").length,
    error: included.filter((line) => line.validationState === "error").length,
    duplicate: included.filter((line) => line.validationState === "duplicate").length,
    excluded: lines.length - included.length,
    finalized: finalized ? included.length : 0,
  };
}

async function queryCounts(
  client: PoolClient,
  tenantId: string,
  companyId: string,
  importId: string,
  finalized: boolean,
): Promise<Counts> {
  const row = (
    await client.query<{
      total: string;
      valid: string;
      warning: string;
      error: string;
      duplicate: string;
      excluded: string;
      included: string;
    }>(
      `select count(*)::text as total,
              count(*) filter(where inclusion_state='included' and validation_state='valid')::text as valid,
              count(*) filter(where inclusion_state='included' and validation_state='warning')::text as warning,
              count(*) filter(where inclusion_state='included' and validation_state='error')::text as error,
              count(*) filter(where inclusion_state='included' and validation_state='duplicate')::text as duplicate,
              count(*) filter(where inclusion_state='excluded')::text as excluded,
              count(*) filter(where inclusion_state='included')::text as included
         from bank_statement_line where tenant_id=$1 and company_id=$2 and import_id=$3`,
      [tenantId, companyId, importId],
    )
  ).rows[0]!;
  return {
    total: Number(row.total),
    valid: Number(row.valid),
    warning: Number(row.warning),
    error: Number(row.error),
    duplicate: Number(row.duplicate),
    excluded: Number(row.excluded),
    finalized: finalized ? Number(row.included) : 0,
  };
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const decoded = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isSafeInteger(decoded) || decoded < 0) {
    throw new BankingApiError(400, "STATEMENT_CURSOR_INVALID", "The directory cursor is invalid.");
  }
  return decoded;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, "\\$&");
}
