import { createHash, randomUUID } from "node:crypto";
import type { AuthenticatedAccount } from "@nexora/auth";
import type {
  ChangeRecurringJournalStatusRequest,
  CreateJournalRequest,
  CreateRecurringJournalRequest,
  DecideJournalRequest,
  DeleteJournalRequest,
  JournalDeleteResult,
  JournalDetail,
  JournalDirectory,
  JournalDirectoryQuery,
  JournalMutationResult,
  JournalOptions,
  RecurringJournalDirectory,
  RecurringJournalDirectoryQuery,
  RecurringJournalOccurrenceDirectory,
  RecurringJournalTemplate,
  ReverseJournalRequest,
  SubmitJournalRequest,
  UpdateJournalRequest,
  UpdateRecurringJournalRequest,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";
import { writeApprovalOverrideEvent, ApprovalOverrideWriterError } from "../../security/approval-override-writer.js";
import { resolveCompanyBaseCurrency, CompanyCurrencyAuthorityError } from "../currencies/company-authority.js";
import { FinancePostingService } from "../posting/service.js";
import { FinancePostingError, createFinanceTransactionClient } from "../posting/types.js";

export interface FinanceJournalActorContext {
  tenantId: string;
  actor: AuthenticatedAccount;
  realActorId?: string;
  impersonationRequestId?: string;
}

export class FinanceJournalError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FinanceJournalError";
  }
}

interface ManualRow {
  id: string;
  company_id: string;
  draft_number: string;
  journal_date: Date | string;
  reference_number: string | null;
  base_currency: string;
  base_decimal_places: number;
  state: "draft" | "submitted" | "posted" | "reversed";
  row_version: string;
  maker_user_id: string;
  submitted_at: Date | string | null;
  rejection_reason: string | null;
  approval_note: string | null;
  accounting_event_id: string | null;
  journal_entry_id: string | null;
  reversal_accounting_event_id: string | null;
  reversal_journal_entry_id: string | null;
  recurring_template_id: string | null;
}

interface EventRow {
  id: string;
  journal_id: string;
  event_type: JournalDetail["events"][number]["event_type"];
  from_state: ManualRow["state"] | null;
  to_state: ManualRow["state"] | null;
  resulting_version: string;
  actor_id: string;
  actor_name?: string;
  reason: string | null;
  request_sha256: string;
  occurred_at: Date | string;
}

interface LineRow {
  id: string;
  line_number: number;
  account_id: string;
  account_code: string;
  account_name: string;
  description: string;
  debit: string;
  credit: string;
  dimensions: Record<string, string>;
}

interface RecurringRow {
  id: string;
  company_id: string;
  name: string;
  schedule: "monthly" | "quarterly";
  status: "active" | "inactive";
  start_date: Date | string;
  end_date: Date | string | null;
  next_scheduled_date: Date | string | null;
  last_generated_date: Date | string | null;
  base_currency: string;
  reference_pattern: string | null;
  narration: string;
  row_version: string;
  lines: unknown;
  updated_at: Date | string;
}

const amountScale = 8;
const baseRate = "1.000000000000000000";

function dateText(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
function dateTime(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
function scaled(value: string, decimalPlaces: number): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > amountScale || /[1-9]/.test(fraction.slice(decimalPlaces)))
    throw new FinanceJournalError(
      400,
      "JOURNAL_CURRENCY_SCALE_INVALID",
      "A Journal amount exceeds the company base-currency scale.",
    );
  return (
    BigInt(whole) * 10n ** BigInt(amountScale) + BigInt((fraction + "0".repeat(amountScale)).slice(0, amountScale))
  );
}
function formattedScaled(value: bigint, decimalPlaces: number): string {
  const whole = value / 10n ** BigInt(amountScale);
  if (decimalPlaces === 0) return whole.toString();
  const fraction = (value % 10n ** BigInt(amountScale)).toString().padStart(amountScale, "0").slice(0, decimalPlaces);
  return `${whole}.${fraction}`;
}
function validateLines(lines: readonly { debit: string; credit: string }[], decimalPlaces: number) {
  let debits = 0n;
  let credits = 0n;
  for (const line of lines) {
    debits += scaled(line.debit, decimalPlaces);
    credits += scaled(line.credit, decimalPlaces);
  }
  if (debits <= 0n || debits !== credits)
    throw new FinanceJournalError(
      400,
      "JOURNAL_UNBALANCED",
      "Journal debits and credits must be equal and greater than zero.",
    );
}
function requirePermission(context: FinanceJournalActorContext, permission: string) {
  if (context.actor.tenantId !== context.tenantId || !context.actor.permissions.includes(permission))
    throw new FinanceJournalError(403, "PERMISSION_DENIED", "You are not permitted to perform this Journal operation.");
}
function requireMutationActor(context: FinanceJournalActorContext) {
  if (context.realActorId || context.impersonationRequestId)
    throw new FinanceJournalError(
      403,
      "IMPERSONATED_MUTATION_FORBIDDEN",
      "Impersonated sessions cannot change Finance Journals.",
    );
}
function cursorOffset(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new Error();
    return value;
  } catch {
    throw new FinanceJournalError(400, "JOURNAL_CURSOR_INVALID", "The Journal cursor is invalid.");
  }
}
function nextCursor(offset: number, count: number, limit: number): string | null {
  return count > limit ? Buffer.from(JSON.stringify(offset + limit)).toString("base64url") : null;
}

function journalSource(sourceType: string): JournalDirectory["items"][number]["source"] {
  if (sourceType.startsWith("banking.") || sourceType.startsWith("bank_")) return "bank";
  if (sourceType.startsWith("hr.") || sourceType.startsWith("hr_")) return "payroll";
  if (sourceType.startsWith("finance.") || sourceType.startsWith("finance_")) return "finance";
  return "other";
}

export class SourceFinanceJournalRepository {
  constructor(
    private readonly pool: Pool,
    private readonly posting = new FinancePostingService(),
  ) {}

  private async transaction<T>(
    context: FinanceJournalActorContext,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select set_config('nexora.user_id',$1,true)", [context.actor.userId]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof FinanceJournalError) throw error;
      if (error instanceof FinancePostingError) throw new FinanceJournalError(error.status, error.code, error.message);
      if (error instanceof CompanyCurrencyAuthorityError)
        throw new FinanceJournalError(error.status, error.code, error.message);
      if (error instanceof ApprovalOverrideWriterError) throw new FinanceJournalError(403, error.code, error.message);
      if (typeof error === "object" && error !== null && "code" in error) {
        if (error.code === "23505")
          throw new FinanceJournalError(
            409,
            "JOURNAL_DUPLICATE",
            "This Journal request conflicts with an existing record.",
          );
        if (error.code === "23503" || error.code === "23514")
          throw new FinanceJournalError(
            409,
            "JOURNAL_AUTHORITY_CONFLICT",
            "Journal authority or master data changed. Refresh and review the transaction.",
          );
        if (error.code === "40001" || error.code === "40P01")
          throw new FinanceJournalError(
            409,
            "JOURNAL_CONCURRENT_CHANGE",
            "A concurrent Journal change was detected. Refresh and retry.",
          );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async scoped(client: PoolClient, context: FinanceJournalActorContext, companyId: string, permission: string) {
    requirePermission(context, permission);
    const result = await client.query<{ allowed: boolean }>(`select bank_has_live_permission($1,$2,$3,$4) as allowed`, [
      context.tenantId,
      companyId,
      context.actor.userId,
      permission,
    ]);
    if (!result.rows[0]?.allowed)
      throw new FinanceJournalError(
        403,
        "COMPANY_PERMISSION_DENIED",
        "This Journal operation is outside your live company authority.",
      );
  }

  private async hasScoped(
    client: PoolClient,
    context: FinanceJournalActorContext,
    companyId: string,
    permission: string,
  ) {
    if (!context.actor.permissions.includes(permission)) return false;
    return (
      (
        await client.query<{ allowed: boolean }>(`select bank_has_live_permission($1,$2,$3,$4) as allowed`, [
          context.tenantId,
          companyId,
          context.actor.userId,
          permission,
        ])
      ).rows[0]?.allowed === true
    );
  }

  private async loadManual(
    client: PoolClient,
    context: FinanceJournalActorContext,
    id: string,
    lock = false,
  ): Promise<ManualRow> {
    const suffix = lock ? " for update" : "";
    const row = (
      await client.query<ManualRow>(
        `select id,company_id,draft_number,journal_date,reference_number,base_currency,base_decimal_places,
              state,row_version::text,maker_user_id,submitted_at,rejection_reason,approval_note,
              accounting_event_id,journal_entry_id,reversal_accounting_event_id,reversal_journal_entry_id,
              recurring_template_id
         from manual_journal where tenant_id=$1 and id=$2${suffix}`,
        [context.tenantId, id],
      )
    ).rows[0];
    if (!row) throw new FinanceJournalError(404, "JOURNAL_NOT_FOUND", "The Manual Journal was not found.");
    await this.scoped(client, context, row.company_id, "finance.journal.read");
    return row;
  }

  private async lines(client: PoolClient, tenantId: string, journalId: string): Promise<LineRow[]> {
    return (
      await client.query<LineRow>(
        `select line.id,line.line_number,line.account_id,account.code as account_code,account.name as account_name,
              line.description,line.debit::text,line.credit::text,line.dimensions
         from manual_journal_line line join account on account.tenant_id=line.tenant_id
          and account.company_id=line.company_id and account.id=line.account_id
        where line.tenant_id=$1 and line.journal_id=$2 order by line.line_number`,
        [tenantId, journalId],
      )
    ).rows;
  }

  private async assertNominals(client: PoolClient, tenantId: string, companyId: string, accountIds: readonly string[]) {
    const unique = [...new Set(accountIds)];
    const result = await client.query<{ id: string }>(
      `select account.id from account
        join finance_general_nominal nominal on nominal.tenant_id=account.tenant_id
         and nominal.company_id=account.company_id and nominal.nominal_id=account.id and nominal.state='active'
       where account.tenant_id=$1 and account.company_id=$2 and account.id=any($3::text[])
         and account.status='active' and not account.is_header and account.manual_posting_allowed
         and not account.is_system_account and not account.managed_bank_nominal and account.managed_general_nominal`,
      [tenantId, companyId, unique],
    );
    if (result.rowCount !== unique.length)
      throw new FinanceJournalError(
        409,
        "JOURNAL_NOMINAL_INVALID",
        "Every line must use an active ordinary postable company nominal.",
      );
  }

  private async existingEvent(
    client: PoolClient,
    context: FinanceJournalActorContext,
    key: string,
  ): Promise<EventRow | null> {
    await this.lockMutationKey(client, context, key);
    return (
      (
        await client.query<EventRow>(
          `select id,journal_id,event_type,from_state,to_state,resulting_version::text,actor_id,reason,request_sha256,occurred_at
         from manual_journal_event where tenant_id=$1 and actor_id=$2 and idempotency_key=$3 for share`,
          [context.tenantId, context.actor.userId, key],
        )
      ).rows[0] ?? null
    );
  }

  private async lockMutationKey(client: PoolClient, context: FinanceJournalActorContext, key: string): Promise<void> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `finance-journal:${context.tenantId}:${context.actor.userId}:${key}`,
    ]);
  }

  private async preparerActorIds(
    client: PoolClient,
    context: FinanceJournalActorContext,
    journalId: string,
  ): Promise<string[]> {
    return (
      await client.query<{ actor_id: string }>(
        `select actor_id from manual_journal_preparer
          where tenant_id=$1 and journal_id=$2 order by actor_id`,
        [context.tenantId, journalId],
      )
    ).rows.map((row) => row.actor_id);
  }

  private async insertEvent(
    client: PoolClient,
    input: {
      context: FinanceJournalActorContext;
      journalId: string;
      companyId: string;
      eventType: EventRow["event_type"];
      fromState: ManualRow["state"] | null;
      toState: ManualRow["state"] | null;
      version: number;
      reason?: string | null;
      permission: string;
      selfApproval?: boolean;
      overrideId?: string | null;
      correlationId: string;
      key: string;
      hash: string;
    },
  ): Promise<string> {
    const id = `manual-journal-event-${randomUUID()}`;
    await client.query(
      `insert into manual_journal_event
       (tenant_id,company_id,id,journal_id,event_type,from_state,to_state,resulting_version,actor_id,reason,
        permission_key,self_approval_used,super_admin_override_used,approval_override_event_id,
        correlation_id,idempotency_key,request_sha256)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        input.context.tenantId,
        input.companyId,
        id,
        input.journalId,
        input.eventType,
        input.fromState,
        input.toState,
        input.version,
        input.context.actor.userId,
        input.reason ?? null,
        input.permission,
        input.selfApproval ?? false,
        !!input.overrideId,
        input.overrideId ?? null,
        input.correlationId,
        input.key,
        input.hash,
      ],
    );
    return id;
  }

  private replayMutation(
    event: EventRow,
    expectedType: EventRow["event_type"],
    hash: string,
    row?: ManualRow,
  ): JournalMutationResult {
    if (event.event_type !== expectedType || event.request_sha256 !== hash)
      throw new FinanceJournalError(
        409,
        "JOURNAL_IDEMPOTENCY_CONFLICT",
        "The idempotency key was used for another Journal request.",
      );
    return {
      id: event.journal_id,
      state: event.to_state ?? row?.state ?? "draft",
      version: Number(event.resulting_version),
      audit_event_id: event.id,
      ledger_journal_id:
        expectedType === "reversed" ? (row?.reversal_journal_entry_id ?? null) : (row?.journal_entry_id ?? null),
      entry_number: null,
      replayed: true,
    };
  }

  async options(context: FinanceJournalActorContext, companyId?: string): Promise<JournalOptions> {
    requirePermission(context, "finance.journal.read");
    return this.transaction(context, async (client) => {
      const companies = await client.query<{ id: string; code: string; name: string }>(
        `select company.id,company.code,company.name from organization_unit company
          join security_user_company_access access on access.tenant_id=company.tenant_id and access.company_id=company.id
         where company.tenant_id=$1 and access.user_id=$2 and access.revoked_at is null
           and company.type='company' and company.status='active'
         order by access.is_default desc,company.name limit 100`,
        [context.tenantId, context.actor.userId],
      );
      if (!companyId)
        return {
          companies: companies.rows,
          selected_company_id: null,
          base_currency: null,
          decimal_places: null,
          nominals: [],
        };
      await this.scoped(client, context, companyId, "finance.journal.read");
      const base = await resolveCompanyBaseCurrency(client, context.tenantId, companyId);
      const nominals = await client.query<{ id: string; code: string; name: string; required_dimensions: string[] }>(
        `select account.id,account.code,account.name,account.required_dimensions from account
          join finance_general_nominal nominal on nominal.tenant_id=account.tenant_id
           and nominal.company_id=account.company_id and nominal.nominal_id=account.id and nominal.state='active'
         where account.tenant_id=$1 and account.company_id=$2 and account.status='active'
           and not account.is_header and account.manual_posting_allowed and not account.is_system_account
           and not account.managed_bank_nominal and account.managed_general_nominal
         order by account.code,account.id limit 2000`,
        [context.tenantId, companyId],
      );
      return {
        companies: companies.rows,
        selected_company_id: companyId,
        base_currency: base.code,
        decimal_places: base.decimalPlaces,
        nominals: nominals.rows,
      };
    });
  }

  async list(context: FinanceJournalActorContext, query: JournalDirectoryQuery): Promise<JournalDirectory> {
    requirePermission(context, "finance.journal.read");
    return this.transaction(context, async (client) => {
      await this.scoped(client, context, query.company_id, "finance.journal.read");
      const offset = cursorOffset(query.cursor);
      const values: unknown[] = [context.tenantId, query.company_id];
      const manual = ["journal.tenant_id=$1", "journal.company_id=$2"];
      const ledger = ["entry.tenant_id=$1", "entry.company_id=$2", "event.source_type<>'finance_manual_journal'"];
      if (query.state) {
        values.push(query.state);
        manual.push(`journal.state=$${values.length}`);
        ledger.push(`entry.status=$${values.length}`);
      }
      if (query.reference) {
        values.push(`%${query.reference}%`);
        manual.push(`coalesce(journal.reference_number,'') ilike $${values.length}`);
        ledger.push(`coalesce(event.source_id,'') ilike $${values.length}`);
      }
      if (query.date_from) {
        values.push(query.date_from);
        manual.push(`journal.journal_date>=$${values.length}::date`);
        ledger.push(`entry.posting_date>=$${values.length}::date`);
      }
      if (query.date_to) {
        values.push(query.date_to);
        manual.push(`journal.journal_date<=$${values.length}::date`);
        ledger.push(`entry.posting_date<=$${values.length}::date`);
      }
      if (query.approval_queue) manual.push("journal.state='submitted'");
      if (query.source) {
        if (query.source === "manual") ledger.push("false");
        else {
          manual.push("false");
          if (query.source === "bank")
            ledger.push("(event.source_type like 'banking.%' or event.source_type like 'bank_%')");
          else if (query.source === "payroll")
            ledger.push("(event.source_type like 'hr.%' or event.source_type like 'hr_%')");
          else if (query.source === "finance")
            ledger.push("(event.source_type like 'finance.%' or event.source_type like 'finance_%')");
          else
            ledger.push(
              "not (event.source_type like 'banking.%' or event.source_type like 'bank_%' or event.source_type like 'hr.%' or event.source_type like 'hr_%' or event.source_type like 'finance.%' or event.source_type like 'finance_%')",
            );
        }
      }
      if (query.nominal_id) {
        values.push(query.nominal_id);
        manual.push(
          `exists(select 1 from manual_journal_line ml where ml.tenant_id=journal.tenant_id and ml.journal_id=journal.id and ml.account_id=$${values.length})`,
        );
        ledger.push(
          `exists(select 1 from journal_line jl where jl.tenant_id=entry.tenant_id and jl.journal_id=entry.id and jl.account_id=$${values.length})`,
        );
      }
      values.push(query.limit + 1, offset);
      const result = await client.query<JournalDirectory["items"][number]>(
        `select * from (
          select journal.id,journal.company_id,journal.draft_number as display_number,journal.journal_date::text,
                 journal.reference_number,'manual'::text as source,'Manual Journal'::text as source_label,
                 journal.state,journal.base_currency as currency,
                 coalesce((select sum(line.debit)::text from manual_journal_line line where line.tenant_id=journal.tenant_id and line.journal_id=journal.id),'0') as total,
                 journal.row_version::integer as version,journal.maker_user_id,journal.submitted_at,
                 true as can_open_owner_workflow
            from manual_journal journal where ${manual.join(" and ")}
          union all
          select entry.id,entry.company_id,coalesce(entry.entry_number,entry.id),entry.posting_date::text,
                 event.source_id,
                 case
                   when event.source_type like 'banking.%' or event.source_type like 'bank_%' then 'bank'
                   when event.source_type like 'hr.%' or event.source_type like 'hr_%' then 'payroll'
                   when event.source_type like 'finance.%' or event.source_type like 'finance_%' then 'finance'
                   else 'other'
                 end,
                 replace(initcap(event.source_type),'_',' '),entry.status,profile.base_currency,
                 coalesce((select sum(line.base_debit)::text from journal_line line where line.tenant_id=entry.tenant_id and line.journal_id=entry.id),'0'),
                 null::integer,null::text,null::timestamptz,true
            from journal_entry entry join accounting_event event on event.tenant_id=entry.tenant_id
             and entry.source_type='accounting_event' and event.id=entry.source_id
            join company_currency_profile profile on profile.tenant_id=entry.tenant_id
             and profile.company_id=entry.company_id and profile.status='active'
           where ${ledger.join(" and ")}
        ) directory order by journal_date desc,display_number desc,id limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return {
        items: result.rows.slice(0, query.limit),
        next_cursor: nextCursor(offset, result.rows.length, query.limit),
      };
    });
  }

  async get(context: FinanceJournalActorContext, id: string): Promise<JournalDetail> {
    requirePermission(context, "finance.journal.read");
    return this.transaction(context, async (client) => {
      const manual = (
        await client.query<ManualRow>(
          `select id,company_id,draft_number,journal_date,reference_number,base_currency,base_decimal_places,state,row_version::text,
                maker_user_id,submitted_at,rejection_reason,approval_note,accounting_event_id,journal_entry_id,
                reversal_accounting_event_id,reversal_journal_entry_id,recurring_template_id
           from manual_journal where tenant_id=$1 and id=$2`,
          [context.tenantId, id],
        )
      ).rows[0];
      if (manual) {
        await this.scoped(client, context, manual.company_id, "finance.journal.read");
        const lines = await this.lines(client, context.tenantId, id);
        const events = await client.query<EventRow>(
          `select event.id,event.event_type,event.actor_id,coalesce(actor.display_name,actor.email,event.actor_id) as actor_name,
                  event.reason,event.occurred_at,event.journal_id,event.from_state,event.to_state,event.resulting_version::text,event.request_sha256
             from manual_journal_event event join security_user_account actor on actor.tenant_id=event.tenant_id and actor.id=event.actor_id
            where event.tenant_id=$1 and event.journal_id=$2 order by event.occurred_at,event.id`,
          [context.tenantId, id],
        );
        const total = lines.reduce((sum, line) => sum + scaled(line.debit, manual.base_decimal_places), 0n);
        const canUpdate =
          manual.state === "draft" &&
          (await this.hasScoped(client, context, manual.company_id, "finance.journal.update"));
        const canApprove =
          manual.state === "submitted" &&
          (await this.hasScoped(client, context, manual.company_id, "finance.journal.approve"));
        const preparerActorIds = await this.preparerActorIds(client, context, manual.id);
        const preparedByActor = preparerActorIds.includes(context.actor.userId);
        const canSelf =
          preparedByActor && (await this.hasScoped(client, context, manual.company_id, "finance.journal.self_approve"));
        return {
          id: manual.id,
          company_id: manual.company_id,
          display_number: manual.draft_number,
          journal_date: dateText(manual.journal_date),
          reference_number: manual.reference_number,
          source: "manual",
          source_label: manual.recurring_template_id ? "Recurring Journal Draft" : "Manual Journal",
          state: manual.state,
          currency: manual.base_currency,
          total: formattedScaled(total, manual.base_decimal_places),
          version: Number(manual.row_version),
          maker_user_id: manual.maker_user_id,
          submitted_at: manual.submitted_at ? dateTime(manual.submitted_at) : null,
          can_open_owner_workflow: true,
          base_decimal_places: manual.base_decimal_places,
          approval_note: manual.approval_note,
          rejection_reason: manual.rejection_reason,
          posted_entry_number: manual.journal_entry_id,
          lines: lines.map((line) => ({ ...line, debit: line.debit, credit: line.credit })),
          events: events.rows.map((event) => ({
            id: event.id,
            event_type: event.event_type,
            actor_id: event.actor_id,
            actor_name: event.actor_name!,
            reason: event.reason,
            occurred_at: dateTime(event.occurred_at),
          })),
          capabilities: {
            update: canUpdate,
            delete_draft:
              manual.state === "draft" &&
              (await this.hasScoped(client, context, manual.company_id, "finance.journal.delete_draft")),
            submit:
              manual.state === "draft" &&
              (await this.hasScoped(client, context, manual.company_id, "finance.journal.submit")),
            approve: canApprove && (!preparedByActor || canSelf || context.actor.roles.includes("super_administrator")),
            reject:
              manual.state === "submitted" &&
              (await this.hasScoped(client, context, manual.company_id, "finance.journal.reject")),
            reverse:
              manual.state === "posted" &&
              (await this.hasScoped(client, context, manual.company_id, "finance.journal.reverse")),
            self_approval_required: canApprove && preparedByActor,
            super_admin_override_available: preparedByActor && context.actor.roles.includes("super_administrator"),
          },
        };
      }
      const entry = (
        await client.query<{
          id: string;
          company_id: string;
          entry_number: string;
          posting_date: Date | string;
          status: "posted" | "reversed";
          source_type: string;
          source_id: string;
          base_currency: string;
          created_by: string;
        }>(
          `select entry.id,entry.company_id,coalesce(entry.entry_number,entry.id) as entry_number,entry.posting_date,entry.status,
                event.source_type,event.source_id,coalesce(event.payload->'resolved'->>'base_currency','XXX') as base_currency,
                entry.created_by
           from journal_entry entry join accounting_event event on event.tenant_id=entry.tenant_id
            and entry.source_type='accounting_event' and event.id=entry.source_id
          where entry.tenant_id=$1 and entry.id=$2`,
          [context.tenantId, id],
        )
      ).rows[0];
      if (!entry) throw new FinanceJournalError(404, "JOURNAL_NOT_FOUND", "The Journal was not found.");
      await this.scoped(client, context, entry.company_id, "finance.journal.read");
      const base = await resolveCompanyBaseCurrency(client, context.tenantId, entry.company_id);
      const lines = await client.query<LineRow>(
        `select line.id,line.line_number,line.account_id,account.code as account_code,account.name as account_name,
                coalesce(account.name,'Ledger line') as description,line.base_debit::text as debit,line.base_credit::text as credit,line.dimensions
           from journal_line line join account on account.tenant_id=line.tenant_id and account.id=line.account_id
          where line.tenant_id=$1 and line.journal_id=$2 order by line.line_number`,
        [context.tenantId, id],
      );
      const total = lines.rows.reduce((sum, line) => sum + scaled(line.debit, 8), 0n);
      const source = journalSource(entry.source_type);
      return {
        id: entry.id,
        company_id: entry.company_id,
        display_number: entry.entry_number,
        journal_date: dateText(entry.posting_date),
        reference_number: entry.source_id,
        source,
        source_label: entry.source_type.replaceAll("_", " "),
        state: entry.status,
        currency: base.code,
        total: formattedScaled(total, base.decimalPlaces),
        version: null,
        maker_user_id: entry.created_by,
        submitted_at: null,
        can_open_owner_workflow: true,
        base_decimal_places: base.decimalPlaces,
        approval_note: null,
        rejection_reason: null,
        posted_entry_number: entry.entry_number,
        lines: lines.rows,
        events: [],
        capabilities: {
          update: false,
          delete_draft: false,
          submit: false,
          approve: false,
          reject: false,
          reverse: false,
          self_approval_required: false,
          super_admin_override_available: false,
        },
      };
    });
  }

  async create(
    context: FinanceJournalActorContext,
    input: CreateJournalRequest,
    key: string,
    correlationId: string,
  ): Promise<JournalMutationResult> {
    requireMutationActor(context);
    requirePermission(context, "finance.journal.create");
    const hash = fingerprint({ action: "create", input });
    return this.transaction(context, async (client) => {
      const replay = await this.existingEvent(client, context, key);
      if (replay) return this.replayMutation(replay, "created", hash);
      await this.scoped(client, context, input.company_id, "finance.journal.create");
      const base = await resolveCompanyBaseCurrency(client, context.tenantId, input.company_id);
      validateLines(input.lines, base.decimalPlaces);
      await this.assertNominals(
        client,
        context.tenantId,
        input.company_id,
        input.lines.map((line) => line.account_id),
      );
      const year = Number(input.journal_date.slice(0, 4));
      const sequence = (
        await client.query<{ value: string }>(
          `insert into manual_journal_sequence(tenant_id,company_id,fiscal_year,next_value) values($1,$2,$3,2)
         on conflict(tenant_id,company_id,fiscal_year) do update set next_value=manual_journal_sequence.next_value+1
         returning (next_value-1)::text as value`,
          [context.tenantId, input.company_id, year],
        )
      ).rows[0]!.value;
      const id = `manual-journal-${randomUUID()}`,
        number = `MJ-${year}-${sequence.padStart(6, "0")}`;
      await client.query(
        `insert into manual_journal(tenant_id,company_id,id,draft_number,journal_date,reference_number,base_currency,base_decimal_places,maker_user_id)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.tenantId,
          input.company_id,
          id,
          number,
          input.journal_date,
          input.reference_number ?? null,
          base.code,
          base.decimalPlaces,
          context.actor.userId,
        ],
      );
      for (const [index, line] of input.lines.entries())
        await client.query(
          `insert into manual_journal_line(tenant_id,company_id,journal_id,id,line_number,account_id,description,debit,credit,dimensions)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [
            context.tenantId,
            input.company_id,
            id,
            `manual-journal-line-${randomUUID()}`,
            index + 1,
            line.account_id,
            line.description,
            line.debit,
            line.credit,
            JSON.stringify(line.dimensions),
          ],
        );
      const audit = await this.insertEvent(client, {
        context,
        journalId: id,
        companyId: input.company_id,
        eventType: "created",
        fromState: null,
        toState: "draft",
        version: 1,
        permission: "finance.journal.create",
        correlationId,
        key,
        hash,
      });
      return {
        id,
        state: "draft",
        version: 1,
        audit_event_id: audit,
        ledger_journal_id: null,
        entry_number: null,
        replayed: false,
      };
    });
  }

  async update(
    context: FinanceJournalActorContext,
    id: string,
    input: UpdateJournalRequest,
    key: string,
    correlationId: string,
  ): Promise<JournalMutationResult> {
    requireMutationActor(context);
    requirePermission(context, "finance.journal.update");
    const hash = fingerprint({ action: "update", id, input });
    return this.transaction(context, async (client) => {
      const replay = await this.existingEvent(client, context, key);
      if (replay) return this.replayMutation(replay, "updated", hash);
      const row = await this.loadManual(client, context, id, true);
      await this.scoped(client, context, row.company_id, "finance.journal.update");
      if (row.state !== "draft")
        throw new FinanceJournalError(409, "JOURNAL_NOT_DRAFT", "Only a draft Journal can be updated.");
      if (Number(row.row_version) !== input.expected_version)
        throw new FinanceJournalError(412, "JOURNAL_PRECONDITION_FAILED", "The Journal version changed.");
      validateLines(input.lines, row.base_decimal_places);
      await this.assertNominals(
        client,
        context.tenantId,
        row.company_id,
        input.lines.map((line) => line.account_id),
      );
      await client.query(`delete from manual_journal_line where tenant_id=$1 and journal_id=$2`, [
        context.tenantId,
        id,
      ]);
      for (const [index, line] of input.lines.entries())
        await client.query(
          `insert into manual_journal_line(tenant_id,company_id,journal_id,id,line_number,account_id,description,debit,credit,dimensions)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [
            context.tenantId,
            row.company_id,
            id,
            `manual-journal-line-${randomUUID()}`,
            index + 1,
            line.account_id,
            line.description,
            line.debit,
            line.credit,
            JSON.stringify(line.dimensions),
          ],
        );
      const next = Number(row.row_version) + 1;
      await client.query(
        `update manual_journal set journal_date=$3,reference_number=$4,row_version=$5,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
        [context.tenantId, id, input.journal_date, input.reference_number ?? null, next],
      );
      const audit = await this.insertEvent(client, {
        context,
        journalId: id,
        companyId: row.company_id,
        eventType: "updated",
        fromState: "draft",
        toState: "draft",
        version: next,
        permission: "finance.journal.update",
        correlationId,
        key,
        hash,
      });
      return {
        id,
        state: "draft",
        version: next,
        audit_event_id: audit,
        ledger_journal_id: null,
        entry_number: null,
        replayed: false,
      };
    });
  }

  async deleteDraft(
    context: FinanceJournalActorContext,
    id: string,
    input: DeleteJournalRequest,
    key: string,
    correlationId: string,
  ): Promise<JournalDeleteResult> {
    requireMutationActor(context);
    requirePermission(context, "finance.journal.delete_draft");
    const hash = fingerprint({ action: "delete", id, input });
    return this.transaction(context, async (client) => {
      const replay = await this.existingEvent(client, context, key);
      if (replay) {
        if (replay.event_type !== "deleted" || replay.request_sha256 !== hash)
          throw new FinanceJournalError(
            409,
            "JOURNAL_IDEMPOTENCY_CONFLICT",
            "The idempotency key was used for another Journal request.",
          );
        return { id: replay.journal_id, deleted: true, audit_event_id: replay.id, replayed: true };
      }
      const row = await this.loadManual(client, context, id, true);
      await this.scoped(client, context, row.company_id, "finance.journal.delete_draft");
      if (row.state !== "draft")
        throw new FinanceJournalError(
          409,
          "JOURNAL_DELETE_FORBIDDEN",
          "Only a draft Journal can be permanently deleted.",
        );
      if (Number(row.row_version) !== input.expected_version)
        throw new FinanceJournalError(412, "JOURNAL_PRECONDITION_FAILED", "The Journal version changed.");
      const audit = await this.insertEvent(client, {
        context,
        journalId: id,
        companyId: row.company_id,
        eventType: "deleted",
        fromState: "draft",
        toState: null,
        version: Number(row.row_version),
        reason: input.reason,
        permission: "finance.journal.delete_draft",
        correlationId,
        key,
        hash,
      });
      if (row.recurring_template_id)
        await client.query(
          `update recurring_journal_occurrence set state='draft_deleted',manual_journal_id=null,updated_at=clock_timestamp() where tenant_id=$1 and manual_journal_id=$2`,
          [context.tenantId, id],
        );
      await client.query(`delete from manual_journal where tenant_id=$1 and id=$2`, [context.tenantId, id]);
      return { id, deleted: true, audit_event_id: audit, replayed: false };
    });
  }

  async submit(
    context: FinanceJournalActorContext,
    id: string,
    input: SubmitJournalRequest,
    key: string,
    correlationId: string,
  ): Promise<JournalMutationResult> {
    requireMutationActor(context);
    requirePermission(context, "finance.journal.submit");
    const hash = fingerprint({ action: "submit", id, input });
    return this.transaction(context, async (client) => {
      const replay = await this.existingEvent(client, context, key);
      if (replay) return this.replayMutation(replay, "submitted", hash);
      const row = await this.loadManual(client, context, id, true);
      await this.scoped(client, context, row.company_id, "finance.journal.submit");
      if (row.state !== "draft")
        throw new FinanceJournalError(409, "JOURNAL_NOT_DRAFT", "Only a draft Journal can be submitted.");
      if (Number(row.row_version) !== input.expected_version)
        throw new FinanceJournalError(412, "JOURNAL_PRECONDITION_FAILED", "The Journal version changed.");
      const lines = await this.lines(client, context.tenantId, id);
      if (lines.length < 2)
        throw new FinanceJournalError(400, "JOURNAL_LINES_REQUIRED", "At least two Journal lines are required.");
      validateLines(lines, row.base_decimal_places);
      await this.assertNominals(
        client,
        context.tenantId,
        row.company_id,
        lines.map((line) => line.account_id),
      );
      const next = Number(row.row_version) + 1;
      await client.query(
        `update manual_journal set state='submitted',submitted_by=$3,submitted_at=clock_timestamp(),rejected_by=null,rejected_at=null,rejection_reason=null,row_version=$4,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
        [context.tenantId, id, context.actor.userId, next],
      );
      const audit = await this.insertEvent(client, {
        context,
        journalId: id,
        companyId: row.company_id,
        eventType: "submitted",
        fromState: "draft",
        toState: "submitted",
        version: next,
        permission: "finance.journal.submit",
        correlationId,
        key,
        hash,
      });
      return {
        id,
        state: "submitted",
        version: next,
        audit_event_id: audit,
        ledger_journal_id: null,
        entry_number: null,
        replayed: false,
      };
    });
  }

  async decide(
    context: FinanceJournalActorContext,
    id: string,
    input: DecideJournalRequest,
    key: string,
    correlationId: string,
  ): Promise<JournalMutationResult> {
    requireMutationActor(context);
    const permission = input.action === "reject" ? "finance.journal.reject" : "finance.journal.approve";
    requirePermission(context, permission);
    const eventType = input.action === "reject" ? "rejected" : "posted";
    const hash = fingerprint({ action: "decision", id, input });
    return this.transaction(context, async (client) => {
      const replay = await this.existingEvent(client, context, key);
      if (replay) {
        const current = await this.loadManual(client, context, id);
        return this.replayMutation(replay, eventType, hash, current);
      }
      const row = await this.loadManual(client, context, id, true);
      await this.scoped(client, context, row.company_id, permission);
      if (row.state !== "submitted")
        throw new FinanceJournalError(409, "JOURNAL_NOT_SUBMITTED", "Only a submitted Journal can be decided.");
      if (Number(row.row_version) !== input.expected_version)
        throw new FinanceJournalError(412, "JOURNAL_PRECONDITION_FAILED", "The Journal version changed.");
      const next = Number(row.row_version) + 1;
      if (input.action === "reject") {
        await client.query(
          `update manual_journal set state='draft',rejected_by=$3,rejected_at=clock_timestamp(),rejection_reason=$4,row_version=$5,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
          [context.tenantId, id, context.actor.userId, input.reason, next],
        );
        const audit = await this.insertEvent(client, {
          context,
          journalId: id,
          companyId: row.company_id,
          eventType: "rejected",
          fromState: "submitted",
          toState: "draft",
          version: next,
          reason: input.reason ?? null,
          permission,
          correlationId,
          key,
          hash,
        });
        return {
          id,
          state: "draft",
          version: next,
          audit_event_id: audit,
          ledger_journal_id: null,
          entry_number: null,
          replayed: false,
        };
      }
      const lines = await this.lines(client, context.tenantId, id);
      validateLines(lines, row.base_decimal_places);
      await this.assertNominals(
        client,
        context.tenantId,
        row.company_id,
        lines.map((line) => line.account_id),
      );
      const preparerActorIds = await this.preparerActorIds(client, context, id);
      const preparedByActor = preparerActorIds.includes(context.actor.userId);
      let selfApproval = false;
      let overrideId: string | null = null;
      if (preparedByActor) {
        selfApproval = await this.hasScoped(client, context, row.company_id, "finance.journal.self_approve");
        if (!selfApproval) {
          if (!input.reason)
            throw new FinanceJournalError(
              400,
              "APPROVAL_OVERRIDE_REASON_REQUIRED",
              "A reason is required for Super Administrator self-approval.",
            );
          overrideId = (
            await writeApprovalOverrideEvent(client, {
              tenantId: context.tenantId,
              account: context.actor,
              makerActorIds: preparerActorIds,
              normalDecisionPermission: "finance.journal.approve",
              resourceType: "finance.manual_journal",
              resourceId: id,
              decisionAction: "post",
              reason: input.reason,
              correlationId,
              idempotencyKey: `${key}:override`,
              metadata: { company_id: row.company_id, version: input.expected_version },
            })
          ).eventId;
        }
      }
      const financeClient = await createFinanceTransactionClient(client);
      const posted = await this.posting.post(financeClient, {
        tenantId: context.tenantId,
        companyId: row.company_id,
        actorId: context.actor.userId,
        sourceType: "finance_manual_journal",
        sourceId: id,
        eventType: "manual_journal_posted",
        externalIdempotencyKey: key,
        transactionCurrency: row.base_currency,
        postingDate: dateText(row.journal_date),
        exchangeRateId: null,
        exchangeRateValue: baseRate,
        payloadHashMaterial: { manual_journal_id: id, row_version: input.expected_version },
        ...(overrideId ? { auditRef: overrideId } : {}),
        lines: lines.map((line) => ({
          accountId: line.account_id,
          debit: formattedScaled(scaled(line.debit, row.base_decimal_places), row.base_decimal_places),
          credit: formattedScaled(scaled(line.credit, row.base_decimal_places), row.base_decimal_places),
          dimensions: line.dimensions,
          description: line.description,
        })),
      });
      await client.query(
        `update manual_journal set state='posted',approved_by=$3,approved_at=clock_timestamp(),approval_note=$4,self_approval_used=$5,super_admin_override_used=$6,decision_evidence_id=$7,posted_by=$3,posted_at=clock_timestamp(),accounting_event_id=$8,journal_entry_id=$9,row_version=$10,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          id,
          context.actor.userId,
          input.approval_note ?? null,
          selfApproval,
          !!overrideId,
          overrideId,
          posted.accountingEventId,
          posted.journalId,
          next,
        ],
      );
      const audit = await this.insertEvent(client, {
        context,
        journalId: id,
        companyId: row.company_id,
        eventType: "posted",
        fromState: "submitted",
        toState: "posted",
        version: next,
        reason: input.reason ?? input.approval_note ?? null,
        permission,
        selfApproval,
        overrideId,
        correlationId,
        key,
        hash,
      });
      return {
        id,
        state: "posted",
        version: next,
        audit_event_id: audit,
        ledger_journal_id: posted.journalId,
        entry_number: posted.entryNumber,
        replayed: posted.replayed,
      };
    });
  }

  async reverse(
    context: FinanceJournalActorContext,
    id: string,
    input: ReverseJournalRequest,
    key: string,
    correlationId: string,
  ): Promise<JournalMutationResult> {
    requireMutationActor(context);
    requirePermission(context, "finance.journal.reverse");
    const hash = fingerprint({ action: "reverse", id, input });
    return this.transaction(context, async (client) => {
      const replay = await this.existingEvent(client, context, key);
      if (replay) {
        const current = await this.loadManual(client, context, id);
        return this.replayMutation(replay, "reversed", hash, current);
      }
      const row = await this.loadManual(client, context, id, true);
      await this.scoped(client, context, row.company_id, "finance.journal.reverse");
      if (row.state !== "posted" || !row.accounting_event_id || !row.journal_entry_id)
        throw new FinanceJournalError(
          409,
          "JOURNAL_REVERSAL_FORBIDDEN",
          "Only a posted Manual Journal can be reversed here.",
        );
      if (Number(row.row_version) !== input.expected_version)
        throw new FinanceJournalError(412, "JOURNAL_PRECONDITION_FAILED", "The Journal version changed.");
      const financeClient = await createFinanceTransactionClient(client);
      const reversed = await this.posting.reverse(financeClient, {
        tenantId: context.tenantId,
        companyId: row.company_id,
        actorId: context.actor.userId,
        sourceType: "finance_manual_journal",
        sourceId: id,
        eventType: "manual_journal_reversed",
        externalIdempotencyKey: key,
        transactionCurrency: row.base_currency,
        payloadHashMaterial: { manual_journal_id: id, row_version: input.expected_version, reason: input.reason },
        originalEventType: "manual_journal_posted",
        originalAccountingEventId: row.accounting_event_id,
        originalJournalId: row.journal_entry_id,
        postingDate: input.reversal_date,
      });
      const next = Number(row.row_version) + 1;
      await client.query(
        `update manual_journal set state='reversed',reversed_by=$3,reversed_at=clock_timestamp(),reversal_reason=$4,reversal_accounting_event_id=$5,reversal_journal_entry_id=$6,row_version=$7,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          id,
          context.actor.userId,
          input.reason,
          reversed.accountingEventId,
          reversed.journalId,
          next,
        ],
      );
      const audit = await this.insertEvent(client, {
        context,
        journalId: id,
        companyId: row.company_id,
        eventType: "reversed",
        fromState: "posted",
        toState: "reversed",
        version: next,
        reason: input.reason,
        permission: "finance.journal.reverse",
        correlationId,
        key,
        hash,
      });
      return {
        id,
        state: "reversed",
        version: next,
        audit_event_id: audit,
        ledger_journal_id: reversed.journalId,
        entry_number: reversed.entryNumber,
        replayed: reversed.replayed,
      };
    });
  }

  private recurring(row: RecurringRow): RecurringJournalTemplate {
    if (!Array.isArray(row.lines))
      throw new FinanceJournalError(500, "RECURRING_JOURNAL_DATA_INVALID", "Recurring Journal lines are invalid.");
    return {
      id: row.id,
      company_id: row.company_id,
      name: row.name,
      schedule: row.schedule,
      status: row.status,
      start_date: dateText(row.start_date),
      end_date: row.end_date ? dateText(row.end_date) : null,
      next_scheduled_date: row.next_scheduled_date ? dateText(row.next_scheduled_date) : null,
      last_generated_date: row.last_generated_date ? dateText(row.last_generated_date) : null,
      base_currency: row.base_currency,
      reference_pattern: row.reference_pattern,
      narration: row.narration,
      version: Number(row.row_version),
      lines: row.lines as RecurringJournalTemplate["lines"],
      updated_at: dateTime(row.updated_at),
    };
  }
  private async loadRecurring(
    client: PoolClient,
    context: FinanceJournalActorContext,
    id: string,
    lock = false,
  ): Promise<RecurringRow> {
    const row = (
      await client.query<RecurringRow>(
        `select id,company_id,name,schedule,status,start_date,end_date,next_scheduled_date,last_generated_date,base_currency,reference_pattern,narration,row_version::text,lines,updated_at from recurring_journal_template where tenant_id=$1 and id=$2${lock ? " for update" : ""}`,
        [context.tenantId, id],
      )
    ).rows[0];
    if (!row)
      throw new FinanceJournalError(
        404,
        "RECURRING_JOURNAL_NOT_FOUND",
        "The Recurring Journal template was not found.",
      );
    await this.scoped(client, context, row.company_id, "finance.recurring_journal.read");
    return row;
  }
  async listRecurring(
    context: FinanceJournalActorContext,
    query: RecurringJournalDirectoryQuery,
  ): Promise<RecurringJournalDirectory> {
    requirePermission(context, "finance.recurring_journal.read");
    return this.transaction(context, async (client) => {
      await this.scoped(client, context, query.company_id, "finance.recurring_journal.read");
      const offset = cursorOffset(query.cursor);
      const values: unknown[] = [context.tenantId, query.company_id];
      let status = "";
      if (query.status) {
        values.push(query.status);
        status = ` and status=$${values.length}`;
      }
      values.push(query.limit + 1, offset);
      const rows = await client.query<RecurringRow>(
        `select id,company_id,name,schedule,status,start_date,end_date,next_scheduled_date,last_generated_date,base_currency,reference_pattern,narration,row_version::text,lines,updated_at from recurring_journal_template where tenant_id=$1 and company_id=$2 and created_by is not null${status} order by name,id limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return {
        items: rows.rows.slice(0, query.limit).map((row) => this.recurring(row)),
        next_cursor: nextCursor(offset, rows.rows.length, query.limit),
      };
    });
  }
  async createRecurring(
    context: FinanceJournalActorContext,
    input: CreateRecurringJournalRequest,
    key: string,
    correlationId: string,
  ): Promise<RecurringJournalTemplate> {
    requireMutationActor(context);
    requirePermission(context, "finance.recurring_journal.manage");
    return this.transaction(context, async (client) => {
      await this.scoped(client, context, input.company_id, "finance.recurring_journal.manage");
      const hash = fingerprint({ action: "create_recurring", input });
      await this.lockMutationKey(client, context, key);
      const replay = await client.query<{ template_id: string; request_sha256: string }>(
        `select template_id,request_sha256 from recurring_journal_template_event where tenant_id=$1 and actor_id=$2 and idempotency_key=$3`,
        [context.tenantId, context.actor.userId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_sha256 !== hash)
          throw new FinanceJournalError(
            409,
            "JOURNAL_IDEMPOTENCY_CONFLICT",
            "The idempotency key was used for another recurring request.",
          );
        return this.recurring(await this.loadRecurring(client, context, replay.rows[0].template_id));
      }
      const base = await resolveCompanyBaseCurrency(client, context.tenantId, input.company_id);
      validateLines(input.lines, base.decimalPlaces);
      await this.assertNominals(
        client,
        context.tenantId,
        input.company_id,
        input.lines.map((line) => line.account_id),
      );
      const id = `recurring-journal-${randomUUID()}`;
      await client.query(
        `insert into recurring_journal_template(tenant_id,company_id,id,name,schedule,lines,status,start_date,end_date,next_scheduled_date,base_currency,reference_pattern,narration,created_by,updated_by) values($1,$2,$3,$4,$5,$6::jsonb,'inactive',$7,$8,$7,$9,$10,$11,$12,$12)`,
        [
          context.tenantId,
          input.company_id,
          id,
          input.name,
          input.schedule,
          JSON.stringify(input.lines),
          input.start_date,
          input.end_date ?? null,
          base.code,
          input.reference_pattern ?? null,
          input.narration,
          context.actor.userId,
        ],
      );
      await client.query(
        `insert into recurring_journal_template_event(tenant_id,company_id,id,template_id,event_type,resulting_version,actor_id,correlation_id,idempotency_key,request_sha256) values($1,$2,$3,$4,'created',1,$5,$6,$7,$8)`,
        [
          context.tenantId,
          input.company_id,
          `recurring-journal-event-${randomUUID()}`,
          id,
          context.actor.userId,
          correlationId,
          key,
          hash,
        ],
      );
      return this.recurring(await this.loadRecurring(client, context, id));
    });
  }
  async updateRecurring(
    context: FinanceJournalActorContext,
    id: string,
    input: UpdateRecurringJournalRequest,
    key: string,
    correlationId: string,
  ): Promise<RecurringJournalTemplate> {
    requireMutationActor(context);
    requirePermission(context, "finance.recurring_journal.manage");
    return this.transaction(context, async (client) => {
      const hash = fingerprint({ action: "update_recurring", id, input });
      await this.lockMutationKey(client, context, key);
      const replay = await client.query<{ template_id: string; request_sha256: string }>(
        `select template_id,request_sha256 from recurring_journal_template_event where tenant_id=$1 and actor_id=$2 and idempotency_key=$3`,
        [context.tenantId, context.actor.userId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_sha256 !== hash || replay.rows[0].template_id !== id)
          throw new FinanceJournalError(
            409,
            "JOURNAL_IDEMPOTENCY_CONFLICT",
            "The idempotency key was used for another recurring request.",
          );
        return this.recurring(await this.loadRecurring(client, context, id));
      }
      const row = await this.loadRecurring(client, context, id, true);
      await this.scoped(client, context, row.company_id, "finance.recurring_journal.manage");
      if (Number(row.row_version) !== input.expected_version)
        throw new FinanceJournalError(412, "JOURNAL_PRECONDITION_FAILED", "The template version changed.");
      validateLines(
        input.lines,
        (await resolveCompanyBaseCurrency(client, context.tenantId, row.company_id)).decimalPlaces,
      );
      await this.assertNominals(
        client,
        context.tenantId,
        row.company_id,
        input.lines.map((line) => line.account_id),
      );
      const next = Number(row.row_version) + 1;
      await client.query(
        `update recurring_journal_template set name=$3,schedule=$4,lines=$5::jsonb,start_date=$6,end_date=$7,next_scheduled_date=case when last_generated_date is null then $6 else next_scheduled_date end,reference_pattern=$8,narration=$9,updated_by=$10,row_version=$11,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
        [
          context.tenantId,
          id,
          input.name,
          input.schedule,
          JSON.stringify(input.lines),
          input.start_date,
          input.end_date ?? null,
          input.reference_pattern ?? null,
          input.narration,
          context.actor.userId,
          next,
        ],
      );
      await client.query(
        `insert into recurring_journal_template_event(tenant_id,company_id,id,template_id,event_type,resulting_version,actor_id,correlation_id,idempotency_key,request_sha256) values($1,$2,$3,$4,'updated',$5,$6,$7,$8,$9)`,
        [
          context.tenantId,
          row.company_id,
          `recurring-journal-event-${randomUUID()}`,
          id,
          next,
          context.actor.userId,
          correlationId,
          key,
          hash,
        ],
      );
      return this.recurring(await this.loadRecurring(client, context, id));
    });
  }
  async changeRecurringStatus(
    context: FinanceJournalActorContext,
    id: string,
    input: ChangeRecurringJournalStatusRequest,
    key: string,
    correlationId: string,
  ): Promise<RecurringJournalTemplate> {
    requireMutationActor(context);
    requirePermission(context, "finance.recurring_journal.manage");
    return this.transaction(context, async (client) => {
      const hash = fingerprint({ action: "recurring_status", id, input });
      await this.lockMutationKey(client, context, key);
      const replay = await client.query<{ template_id: string; request_sha256: string }>(
        `select template_id,request_sha256 from recurring_journal_template_event where tenant_id=$1 and actor_id=$2 and idempotency_key=$3`,
        [context.tenantId, context.actor.userId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_sha256 !== hash || replay.rows[0].template_id !== id)
          throw new FinanceJournalError(
            409,
            "JOURNAL_IDEMPOTENCY_CONFLICT",
            "The idempotency key was used for another recurring request.",
          );
        return this.recurring(await this.loadRecurring(client, context, id));
      }
      const row = await this.loadRecurring(client, context, id, true);
      await this.scoped(client, context, row.company_id, "finance.recurring_journal.manage");
      if (Number(row.row_version) !== input.expected_version)
        throw new FinanceJournalError(412, "JOURNAL_PRECONDITION_FAILED", "The template version changed.");
      const target = input.action === "activate" ? "active" : "inactive";
      if (row.status === target)
        throw new FinanceJournalError(409, "RECURRING_JOURNAL_STATE_INVALID", "The template already has that status.");
      const next = Number(row.row_version) + 1;
      await client.query(
        `update recurring_journal_template set status=$3,updated_by=$4,row_version=$5,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
        [context.tenantId, id, target, context.actor.userId, next],
      );
      await client.query(
        `insert into recurring_journal_template_event(tenant_id,company_id,id,template_id,event_type,resulting_version,actor_id,reason,correlation_id,idempotency_key,request_sha256) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          context.tenantId,
          row.company_id,
          `recurring-journal-event-${randomUUID()}`,
          id,
          input.action === "activate" ? "activated" : "inactivated",
          next,
          context.actor.userId,
          input.reason,
          correlationId,
          key,
          hash,
        ],
      );
      return this.recurring(await this.loadRecurring(client, context, id));
    });
  }
  async listOccurrences(
    context: FinanceJournalActorContext,
    id: string,
    limit: number,
    cursor?: string,
  ): Promise<RecurringJournalOccurrenceDirectory> {
    requirePermission(context, "finance.recurring_journal.read");
    return this.transaction(context, async (client) => {
      await this.loadRecurring(client, context, id);
      const offset = cursorOffset(cursor);
      const rows = await client.query<{
        id: string;
        scheduled_date: Date | string;
        state: "pending" | "draft_created" | "draft_deleted" | "failed" | "exhausted";
        manual_journal_id: string | null;
        attempt_count: number;
        last_error_code: string | null;
        updated_at: Date | string;
      }>(
        `select id,scheduled_date,state,manual_journal_id,attempt_count,last_error_code,updated_at from recurring_journal_occurrence where tenant_id=$1 and template_id=$2 order by scheduled_date desc,id limit $3 offset $4`,
        [context.tenantId, id, limit + 1, offset],
      );
      return {
        items: rows.rows.slice(0, limit).map((row) => ({
          ...row,
          scheduled_date: dateText(row.scheduled_date),
          updated_at: dateTime(row.updated_at),
        })),
        next_cursor: nextCursor(offset, rows.rows.length, limit),
      };
    });
  }
}
