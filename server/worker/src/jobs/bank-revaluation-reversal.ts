import { createHash, randomUUID } from "node:crypto";

import {
  createFinanceTransactionClient,
  FinancePostingError,
  FinancePostingService,
} from "@nexora/api/finance-posting";
import type pg from "pg";

export const BANK_REVALUATION_REVERSAL_JOB = "bank-revaluation-reversal";

export type BankRevaluationReversalClaim = {
  tenantId: string;
  companyId: string;
  scheduleId: string;
  revaluationId: string;
  scheduledDate: string;
  attemptCount: number;
  workerId: string;
};

export type BankRevaluationReversalOptions = {
  now: Date;
  workerId: string;
  actorId: string;
  tenantLimit: number;
  claimLimit: number;
  claimLeaseMs: number;
  retryBaseMs: number;
  retryMaximumMs: number;
};

export type BankRevaluationReversalResult = {
  tenantsScanned: number;
  claimed: number;
  reversed: number;
  pending: number;
  failed: number;
  tenantScanTruncated: boolean;
};

export interface BankRevaluationReversalRepository {
  listActiveTenants(limit: number): Promise<{ tenantIds: string[]; truncated: boolean }>;
  claimDue(input: {
    tenantId: string;
    actorId: string;
    workerId: string;
    now: Date;
    limit: number;
    leaseMs: number;
  }): Promise<BankRevaluationReversalClaim[]>;
  reverse(claim: BankRevaluationReversalClaim, actorId: string, correlationId: string): Promise<void>;
  recordFailure(input: {
    claim: BankRevaluationReversalClaim;
    actorId: string;
    correlationId: string;
    errorCode: string;
    keepPending: boolean;
    nextAttemptAt: Date;
  }): Promise<void>;
}

export class BankRevaluationReversalJobError extends Error {
  constructor(
    readonly code: string,
    readonly keepPending: boolean,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BankRevaluationReversalJobError";
  }
}

function validateOptions(options: BankRevaluationReversalOptions): void {
  if (!Number.isFinite(options.now.getTime())) throw new Error("Bank Revaluation reversal time is invalid.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(options.workerId))
    throw new Error("Bank Revaluation worker ID is invalid.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(options.actorId))
    throw new Error("Bank Revaluation reversal actor ID is invalid.");
  if (!Number.isInteger(options.tenantLimit) || options.tenantLimit < 1 || options.tenantLimit > 1_000)
    throw new Error("Bank Revaluation tenant limit must be between 1 and 1,000.");
  if (!Number.isInteger(options.claimLimit) || options.claimLimit < 1 || options.claimLimit > 100)
    throw new Error("Bank Revaluation claim limit must be between 1 and 100.");
  if (!Number.isInteger(options.claimLeaseMs) || options.claimLeaseMs < 30_000 || options.claimLeaseMs > 3_600_000)
    throw new Error("Bank Revaluation claim lease must be between 30 seconds and one hour.");
  if (!Number.isInteger(options.retryBaseMs) || options.retryBaseMs < 1_000)
    throw new Error("Bank Revaluation retry base must be at least one second.");
  if (!Number.isInteger(options.retryMaximumMs) || options.retryMaximumMs < options.retryBaseMs)
    throw new Error("Bank Revaluation retry maximum must not be below its base.");
}

function safeFailure(error: unknown): { code: string; keepPending: boolean } {
  if (error instanceof BankRevaluationReversalJobError)
    return { code: error.code.slice(0, 64), keepPending: error.keepPending };
  if (error instanceof FinancePostingError) return { code: error.code.slice(0, 64), keepPending: false };
  return { code: "REVALUATION_REVERSAL_FAILED", keepPending: true };
}

function retryAt(options: BankRevaluationReversalOptions, attempt: number): Date {
  const exponent = Math.min(Math.max(attempt - 1, 0), 16);
  const delay = Math.min(options.retryMaximumMs, options.retryBaseMs * 2 ** exponent);
  return new Date(options.now.getTime() + delay);
}

export async function processBankRevaluationReversals(
  options: BankRevaluationReversalOptions,
  repository: BankRevaluationReversalRepository,
): Promise<BankRevaluationReversalResult> {
  validateOptions(options);
  const tenants = await repository.listActiveTenants(options.tenantLimit);
  let claimed = 0;
  let reversed = 0;
  let pending = 0;
  let failed = 0;
  for (const tenantId of tenants.tenantIds) {
    const claims = await repository.claimDue({
      tenantId,
      actorId: options.actorId,
      workerId: options.workerId,
      now: options.now,
      limit: options.claimLimit,
      leaseMs: options.claimLeaseMs,
    });
    claimed += claims.length;
    for (const claim of claims) {
      const correlationId = `bank-revaluation-reversal-${claim.scheduleId}`.slice(0, 128);
      try {
        await repository.reverse(claim, options.actorId, correlationId);
        reversed += 1;
      } catch (error) {
        const failure = safeFailure(error);
        await repository.recordFailure({
          claim,
          actorId: options.actorId,
          correlationId,
          errorCode: failure.code,
          keepPending: failure.keepPending,
          nextAttemptAt: retryAt(options, claim.attemptCount),
        });
        if (failure.keepPending) pending += 1;
        else failed += 1;
      }
    }
  }
  return {
    tenantsScanned: tenants.tenantIds.length,
    claimed,
    reversed,
    pending,
    failed,
    tenantScanTruncated: tenants.truncated,
  };
}

type ScheduleRow = {
  schedule_id: string;
  tenant_id: string;
  company_id: string;
  revaluation_id: string;
  scheduled_date: string | Date;
  attempt_count: number;
};

type RevaluationRow = {
  id: string;
  company_id: string;
  voucher_number: string;
  base_currency: string;
  journal_entry_id: string;
  posted_by: string;
  row_version: string | number;
  state: string;
};

const dateOnly = (value: string | Date): string =>
  value instanceof Date
    ? `${value.getFullYear().toString().padStart(4, "0")}-${(value.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${value.getDate().toString().padStart(2, "0")}`
    : value.slice(0, 10);

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");

export class PostgresBankRevaluationReversalRepository implements BankRevaluationReversalRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly finance = new FinancePostingService(),
  ) {}

  async listActiveTenants(limit: number): Promise<{ tenantIds: string[]; truncated: boolean }> {
    const rows = (
      await this.pool.query<{ id: string }>("select id from tenant where status='active' order by id limit $1", [
        limit + 1,
      ])
    ).rows;
    return { tenantIds: rows.slice(0, limit).map((row) => row.id), truncated: rows.length > limit };
  }

  async claimDue(input: {
    tenantId: string;
    actorId: string;
    workerId: string;
    now: Date;
    limit: number;
    leaseMs: number;
  }): Promise<BankRevaluationReversalClaim[]> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [input.tenantId]);
      await client.query("select set_config('nexora.user_id',$1,true)", [input.actorId]);
      const rows = (
        await client.query<ScheduleRow>(
          `with candidates as (
             select schedule.tenant_id,schedule.id
               from bank_revaluation_reversal_schedule schedule
               join bank_revaluation revaluation
                 on revaluation.tenant_id=schedule.tenant_id and revaluation.company_id=schedule.company_id
                and revaluation.id=schedule.revaluation_id and revaluation.state='posted'
              where schedule.tenant_id=$1 and schedule.scheduled_date<=$3::timestamptz::date
                and schedule.next_attempt_at<=$3
                and schedule.attempt_count<100
                and bank_has_live_permission(schedule.tenant_id,schedule.company_id,$2,'banking.revaluation.reverse')
                and (
                  schedule.state='pending'
                  or (schedule.state='processing' and schedule.claimed_at<$3-($4::bigint*interval '1 millisecond'))
                )
              order by schedule.scheduled_date,schedule.tenant_id,schedule.id
              limit $5 for update of schedule skip locked
           )
           update bank_revaluation_reversal_schedule schedule
              set state='processing',attempt_count=attempt_count+1,claimed_by=$6,claimed_at=$3,
                  next_attempt_at=$3,updated_at=clock_timestamp()
             from candidates
            where schedule.tenant_id=candidates.tenant_id and schedule.id=candidates.id
           returning schedule.id as schedule_id,schedule.tenant_id,schedule.company_id,
                     schedule.revaluation_id,schedule.scheduled_date,schedule.attempt_count`,
          [input.tenantId, input.actorId, input.now, input.leaseMs, input.limit, input.workerId],
        )
      ).rows;
      await client.query("commit");
      return rows.map((row) => ({
        tenantId: row.tenant_id,
        companyId: row.company_id,
        scheduleId: row.schedule_id,
        revaluationId: row.revaluation_id,
        scheduledDate: dateOnly(row.scheduled_date),
        attemptCount: row.attempt_count,
        workerId: input.workerId,
      }));
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async reverse(claim: BankRevaluationReversalClaim, actorId: string, correlationId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level serializable");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [claim.tenantId]);
      await client.query("select set_config('nexora.user_id',$1,true)", [actorId]);
      const schedule = (
        await client.query<{ state: string; claimed_by: string | null; scheduled_date: string | Date }>(
          `select state,claimed_by,scheduled_date from bank_revaluation_reversal_schedule
            where tenant_id=$1 and company_id=$2 and id=$3 and revaluation_id=$4 for update`,
          [claim.tenantId, claim.companyId, claim.scheduleId, claim.revaluationId],
        )
      ).rows[0];
      if (schedule?.state === "posted") {
        await client.query("commit");
        return;
      }
      if (!schedule || schedule.state !== "processing" || schedule.claimed_by !== claim.workerId)
        throw new BankRevaluationReversalJobError(
          "REVALUATION_REVERSAL_CLAIM_LOST",
          false,
          "The Bank Revaluation reversal claim is no longer owned by this worker.",
        );
      const revaluation = (
        await client.query<RevaluationRow>(
          `select id,company_id,voucher_number,base_currency,journal_entry_id,posted_by,row_version,state
             from bank_revaluation
            where tenant_id=$1 and company_id=$2 and id=$3 for update`,
          [claim.tenantId, claim.companyId, claim.revaluationId],
        )
      ).rows[0];
      if (!revaluation || revaluation.state !== "posted" || !revaluation.journal_entry_id)
        throw new BankRevaluationReversalJobError(
          "REVALUATION_SOURCE_NOT_POSTED",
          false,
          "The Bank Revaluation source is not eligible for reversal.",
        );
      const periods = (
        await client.query<{ id: string; status: string }>(
          `select id,status from financial_period
            where tenant_id=$1 and company_id=$2 and $3::date between period_start and period_end
            order by period_start,id limit 2 for share`,
          [claim.tenantId, claim.companyId, claim.scheduledDate],
        )
      ).rows;
      if (periods.length !== 1 || periods[0]!.status !== "open")
        throw new BankRevaluationReversalJobError(
          "REVALUATION_REVERSAL_PERIOD_NOT_OPEN",
          true,
          "The scheduled reversal period is not open.",
        );
      const original = (
        await client.query<{ accounting_event_id: string }>(
          `select source_id as accounting_event_id from journal_entry
            where tenant_id=$1 and company_id=$2 and id=$3 and source_type='accounting_event' for share`,
          [claim.tenantId, claim.companyId, revaluation.journal_entry_id],
        )
      ).rows[0];
      if (!original)
        throw new BankRevaluationReversalJobError(
          "REVALUATION_ORIGINAL_POSTING_INVALID",
          false,
          "The original Bank Revaluation posting evidence is unavailable.",
        );
      const financeClient = await createFinanceTransactionClient(client);
      const reversed = await this.finance.reverse(financeClient, {
        tenantId: claim.tenantId,
        companyId: claim.companyId,
        actorId,
        sourceType: "bank_fx_revaluation",
        sourceId: revaluation.id,
        eventType: "bank_fx_revaluation.reversed",
        originalEventType: "bank_fx_revaluation.posted",
        originalAccountingEventId: original.accounting_event_id,
        originalJournalId: revaluation.journal_entry_id,
        postingDate: claim.scheduledDate,
        externalIdempotencyKey: `bank-revaluation-reversal:${claim.scheduleId}`,
        transactionCurrency: revaluation.base_currency,
        payloadHashMaterial: {
          schedule_id: claim.scheduleId,
          voucher_number: revaluation.voucher_number,
          scheduled_date: claim.scheduledDate,
        },
        auditRef: correlationId,
      });
      await client.query(
        `update bank_revaluation_reversal_schedule
            set state='posted',reversal_journal_entry_id=$4,claimed_by=null,claimed_at=null,
                last_error_code=null,updated_at=clock_timestamp()
          where tenant_id=$1 and company_id=$2 and id=$3`,
        [claim.tenantId, claim.companyId, claim.scheduleId, reversed.journalId],
      );
      const updated = (
        await client.query<{ row_version: string | number }>(
          `update bank_revaluation set state='reversed',reversal_journal_entry_id=$4,
                  reversed_at=clock_timestamp(),row_version=row_version+1,updated_at=clock_timestamp()
            where tenant_id=$1 and company_id=$2 and id=$3 and state='posted'
            returning row_version`,
          [claim.tenantId, claim.companyId, claim.revaluationId, reversed.journalId],
        )
      ).rows[0];
      if (!updated)
        throw new BankRevaluationReversalJobError(
          "REVALUATION_REVERSAL_STATE_CONFLICT",
          false,
          "The Bank Revaluation changed while its reversal was posting.",
        );
      await client.query(
        `insert into bank_revaluation_event
          (tenant_id,company_id,id,revaluation_id,event_type,from_state,to_state,actor_id,reason,
           record_version,correlation_id)
         values($1,$2,$3,$4,'reversed','posted','reversed',$5,$6,$7,$8)`,
        [
          claim.tenantId,
          claim.companyId,
          randomUUID(),
          claim.revaluationId,
          actorId,
          `Automatic Bank Revaluation reversal posted for ${claim.scheduledDate}.`,
          Number(updated.row_version),
          correlationId,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (error instanceof BankRevaluationReversalJobError) throw error;
      if (error instanceof FinancePostingError)
        throw new BankRevaluationReversalJobError(error.code, false, error.message, { cause: error });
      throw error;
    } finally {
      client.release();
    }
  }

  async recordFailure(input: {
    claim: BankRevaluationReversalClaim;
    actorId: string;
    correlationId: string;
    errorCode: string;
    keepPending: boolean;
    nextAttemptAt: Date;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [input.claim.tenantId]);
      await client.query("select set_config('nexora.user_id',$1,true)", [input.actorId]);
      const schedule = await client.query(
        `update bank_revaluation_reversal_schedule
            set state=$4,claimed_by=null,claimed_at=null,last_error_code=$5,next_attempt_at=$6,
                updated_at=clock_timestamp()
          where tenant_id=$1 and company_id=$2 and id=$3 and state='processing' and claimed_by=$7
          returning revaluation_id`,
        [
          input.claim.tenantId,
          input.claim.companyId,
          input.claim.scheduleId,
          input.keepPending ? "pending" : "failed",
          input.errorCode.slice(0, 64),
          input.nextAttemptAt,
          input.claim.workerId,
        ],
      );
      if (schedule.rowCount === 1) {
        const header = (
          await client.query<{ row_version: string | number }>(
            `select row_version from bank_revaluation
              where tenant_id=$1 and company_id=$2 and id=$3 and state='posted'`,
            [input.claim.tenantId, input.claim.companyId, input.claim.revaluationId],
          )
        ).rows[0];
        if (header)
          await client.query(
            `insert into bank_revaluation_event
              (tenant_id,company_id,id,revaluation_id,event_type,from_state,to_state,actor_id,reason,
               record_version,correlation_id)
             values($1,$2,$3,$4,'reversal_failed','posted','posted',$5,$6,$7,$8)`,
            [
              input.claim.tenantId,
              input.claim.companyId,
              randomUUID(),
              input.claim.revaluationId,
              input.actorId,
              input.errorCode.slice(0, 64),
              Number(header.row_version),
              input.correlationId,
            ],
          );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async checkReady(actorId: string, tenantLimit: number): Promise<void> {
    const schema = await this.pool.query<{
      schedule: string | null;
      revaluation: string | null;
      journal: string | null;
      period: string | null;
    }>(
      `select to_regclass('public.bank_revaluation_reversal_schedule')::text as schedule,
              to_regclass('public.bank_revaluation')::text as revaluation,
              to_regclass('public.journal_entry')::text as journal,
              to_regclass('public.financial_period')::text as period`,
    );
    if (Object.values(schema.rows[0] ?? {}).some((value) => value === null))
      throw new Error("Bank Revaluation reversal database authority is unavailable");
    const tenants = await this.listActiveTenants(tenantLimit);
    if (tenants.truncated) throw new Error("Bank Revaluation tenant readiness scan exceeded its configured bound");
    for (const tenantId of tenants.tenantIds) {
      const actor = await this.pool.query<{ ready: boolean }>(
        `select not exists(
           select 1
             from organization_unit company
            where company.tenant_id=$1 and company.type='company' and company.status='active'
              and not bank_has_live_permission($1,company.id,$2,'banking.revaluation.reverse')
         ) as ready`,
        [tenantId, actorId],
      );
      if (!actor.rows[0]?.ready)
        throw new Error(
          `Bank Revaluation reversal actor is not authorized for every active company in tenant ${hash(tenantId).slice(0, 12)}`,
        );
    }
  }
}
