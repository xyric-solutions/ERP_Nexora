import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";

export const RECURRING_JOURNAL_GENERATION_JOB = "recurring-journal-generation";

export interface RecurringJournalGenerationOptions {
  now: Date;
  actorId: string;
  tenantLimit: number;
  templateLimit: number;
}

export interface RecurringJournalGenerationRepository {
  generateDue(options: RecurringJournalGenerationOptions): Promise<{
    tenantsScanned: number;
    draftsCreated: number;
    failed: number;
    tenantScanTruncated: boolean;
  }>;
}

type TemplateRow = {
  id: string;
  company_id: string;
  name: string;
  schedule: "monthly" | "quarterly";
  next_scheduled_date: string | Date;
  end_date: string | Date | null;
  base_currency: string;
  reference_pattern: string | null;
  narration: string;
  lines: unknown;
  row_version: string | number;
};

type TemplateLine = {
  account_id: string;
  description: string;
  debit: string;
  credit: string;
  dimensions: Record<string, string>;
};

const dateOnly = (value: string | Date): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);

const requestHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function lines(value: unknown): TemplateLine[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 1_000)
    throw new Error("RECURRING_JOURNAL_LINES_INVALID");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("RECURRING_JOURNAL_LINES_INVALID");
    const item = entry as Record<string, unknown>;
    if (
      typeof item.account_id !== "string" ||
      typeof item.description !== "string" ||
      typeof item.debit !== "string" ||
      typeof item.credit !== "string" ||
      !item.dimensions ||
      typeof item.dimensions !== "object" ||
      Array.isArray(item.dimensions)
    )
      throw new Error("RECURRING_JOURNAL_LINES_INVALID");
    return {
      account_id: item.account_id,
      description: item.description,
      debit: item.debit,
      credit: item.credit,
      dimensions: item.dimensions as Record<string, string>,
    };
  });
}

export class PostgresRecurringJournalGenerationRepository implements RecurringJournalGenerationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async generateDue(options: RecurringJournalGenerationOptions) {
    const tenants = await this.claimTenantBatch(options.tenantLimit);
    let draftsCreated = 0;
    let failed = 0;
    for (const tenant of tenants.rows) {
      try {
        const result = await this.generateTenant(tenant.id, options);
        draftsCreated += result.draftsCreated;
        failed += result.failed;
      } catch {
        failed += 1;
      }
    }
    return {
      tenantsScanned: tenants.rows.length,
      draftsCreated,
      failed,
      tenantScanTruncated: tenants.truncated,
    };
  }

  private async claimTenantBatch(limit: number): Promise<{ rows: { id: string }[]; truncated: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const cursor = (
        await client.query<{ last_tenant_id: string | null }>(
          "select last_tenant_id from recurring_journal_worker_cursor where id='tenant_scan' for update",
        )
      ).rows[0]?.last_tenant_id;
      const candidates = (
        await client.query<{ id: string }>(
          `select id from (
             select id,0 as scan_phase from tenant
              where status='active' and ($1::text is null or id>$1)
             union all
             select id,1 as scan_phase from tenant
              where status='active' and $1::text is not null and id<=$1
           ) candidate
           order by scan_phase,id limit $2`,
          [cursor ?? null, limit + 1],
        )
      ).rows;
      const rows = candidates.slice(0, limit);
      if (rows.length > 0)
        await client.query(
          "update recurring_journal_worker_cursor set last_tenant_id=$1,updated_at=clock_timestamp() where id='tenant_scan'",
          [rows.at(-1)!.id],
        );
      await client.query("commit");
      return { rows, truncated: candidates.length > limit };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async generateTenant(tenantId: string, options: RecurringJournalGenerationOptions) {
    const client = await this.pool.connect();
    let draftsCreated = 0;
    let failed = 0;
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenantId]);
      await client.query("select set_config('nexora.user_id',$1,true)", [options.actorId]);
      const due = (
        await client.query<TemplateRow>(
          `select id,company_id,name,schedule,next_scheduled_date,end_date,base_currency,
                  reference_pattern,narration,lines,row_version
             from recurring_journal_template
            where tenant_id=$1 and status='active' and created_by is not null
              and next_scheduled_date<=$2::timestamptz::date
              and bank_has_live_permission(tenant_id,company_id,$3,'finance.journal.create')
              and bank_has_live_permission(tenant_id,company_id,$3,'finance.recurring_journal.manage')
            order by next_scheduled_date,id limit $4 for update skip locked`,
          [tenantId, options.now, options.actorId, options.templateLimit],
        )
      ).rows;
      for (const template of due) {
        await client.query("savepoint recurring_template");
        try {
          const scheduledDate = dateOnly(template.next_scheduled_date);
          const occurrenceId = `recurring-occurrence-${randomUUID()}`;
          let occurrence = await client.query<{ id: string; state: string; attempt_count: number }>(
            `insert into recurring_journal_occurrence
              (tenant_id,company_id,id,template_id,scheduled_date,cycle_number,state,attempt_count)
             values($1,$2,$3,$4,$5,
               (select count(*)+1 from recurring_journal_occurrence where tenant_id=$1 and template_id=$4),
               'pending',1)
             on conflict(tenant_id,template_id,scheduled_date) do update
               set state='failed',attempt_count=least(recurring_journal_occurrence.attempt_count+1,100),
                   updated_at=clock_timestamp()
               where recurring_journal_occurrence.state in ('pending','failed')
                 and recurring_journal_occurrence.attempt_count<100
             returning id,state,attempt_count`,
            [tenantId, template.company_id, occurrenceId, template.id, scheduledDate],
          );
          if (!occurrence.rows[0])
            occurrence = await client.query<{ id: string; state: string; attempt_count: number }>(
              `select id,state,attempt_count from recurring_journal_occurrence
                where tenant_id=$1 and template_id=$2 and scheduled_date=$3`,
              [tenantId, template.id, scheduledDate],
            );
          if (
            occurrence.rows[0]?.state === "draft_created" ||
            occurrence.rows[0]?.state === "draft_deleted" ||
            occurrence.rows[0]?.state === "exhausted"
          ) {
            await client.query("release savepoint recurring_template");
            continue;
          }
          const templateLines = lines(template.lines);
          const year = Number(scheduledDate.slice(0, 4));
          const sequence = (
            await client.query<{ value: string }>(
              `insert into manual_journal_sequence(tenant_id,company_id,fiscal_year,next_value) values($1,$2,$3,2)
               on conflict(tenant_id,company_id,fiscal_year) do update set next_value=manual_journal_sequence.next_value+1
               returning (next_value-1)::text as value`,
              [tenantId, template.company_id, year],
            )
          ).rows[0]!.value;
          const journalId = `manual-journal-${randomUUID()}`;
          const draftNumber = `MJ-${year}-${sequence.padStart(6, "0")}`;
          const decimalPlaces = (
            await client.query<{ decimal_places: number }>(
              `select currency.decimal_places::integer from company_currency_profile profile
                join currency on currency.tenant_id=profile.tenant_id and currency.code=profile.base_currency
               where profile.tenant_id=$1 and profile.company_id=$2 and profile.status='active'`,
              [tenantId, template.company_id],
            )
          ).rows[0]?.decimal_places;
          if (decimalPlaces === undefined) throw new Error("RECURRING_JOURNAL_BASE_CURRENCY_MISSING");
          const reference =
            template.reference_pattern
              ?.replaceAll("{date}", scheduledDate)
              .replaceAll("{template}", template.name)
              .slice(0, 160) ?? null;
          await client.query(
            `insert into manual_journal
              (tenant_id,company_id,id,draft_number,journal_date,reference_number,base_currency,
               base_decimal_places,maker_user_id,recurring_template_id,recurring_scheduled_date)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$5)`,
            [
              tenantId,
              template.company_id,
              journalId,
              draftNumber,
              scheduledDate,
              reference,
              template.base_currency,
              decimalPlaces,
              options.actorId,
              template.id,
            ],
          );
          for (const [index, line] of templateLines.entries())
            await client.query(
              `insert into manual_journal_line
                (tenant_id,company_id,journal_id,id,line_number,account_id,description,debit,credit,dimensions)
               values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
              [
                tenantId,
                template.company_id,
                journalId,
                `manual-journal-line-${randomUUID()}`,
                index + 1,
                line.account_id,
                line.description || template.narration,
                line.debit,
                line.credit,
                JSON.stringify(line.dimensions),
              ],
            );
          const hash = requestHash({ template_id: template.id, scheduled_date: scheduledDate });
          await client.query(
            `insert into manual_journal_event
              (tenant_id,company_id,id,journal_id,event_type,to_state,resulting_version,actor_id,reason,
               permission_key,correlation_id,idempotency_key,request_sha256)
             values($1,$2,$3,$4,'created','draft',1,$5,$6,'finance.journal.create',$7,$8,$9)`,
            [
              tenantId,
              template.company_id,
              `manual-journal-event-${randomUUID()}`,
              journalId,
              options.actorId,
              `Generated from recurring template ${template.name}.`,
              `recurring-journal-${template.id}-${scheduledDate}`.slice(0, 128),
              `recurring:${template.id}:${scheduledDate}`,
              hash,
            ],
          );
          await client.query(
            `update recurring_journal_occurrence set state='draft_created',manual_journal_id=$3,last_error_code=null,updated_at=clock_timestamp()
              where tenant_id=$1 and id=$2`,
            [tenantId, occurrence.rows[0]!.id, journalId],
          );
          const months = template.schedule === "quarterly" ? 3 : 1;
          const next = (
            await client.query<{ next_date: string }>(
              "select ($1::date+($2::text||' months')::interval)::date::text as next_date",
              [scheduledDate, months],
            )
          ).rows[0]!.next_date;
          const finished = template.end_date !== null && next > dateOnly(template.end_date);
          const nextVersion = Number(template.row_version) + 1;
          await client.query(
            `update recurring_journal_template set last_generated_date=$3,next_scheduled_date=$4,status=$5,
                    updated_by=$6,row_version=$7,updated_at=clock_timestamp()
              where tenant_id=$1 and id=$2`,
            [
              tenantId,
              template.id,
              scheduledDate,
              finished ? null : next,
              finished ? "inactive" : "active",
              options.actorId,
              nextVersion,
            ],
          );
          await client.query(
            `insert into recurring_journal_template_event
              (tenant_id,company_id,id,template_id,event_type,resulting_version,actor_id,reason,
               correlation_id,idempotency_key,request_sha256)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              tenantId,
              template.company_id,
              `recurring-journal-event-${randomUUID()}`,
              template.id,
              finished ? "inactivated" : "updated",
              nextVersion,
              options.actorId,
              `Generated draft ${draftNumber}.`,
              `recurring-journal-${template.id}-${scheduledDate}`.slice(0, 128),
              `recurring-template:${template.id}:${scheduledDate}`,
              hash,
            ],
          );
          await client.query("release savepoint recurring_template");
          draftsCreated += 1;
        } catch (error) {
          await client.query("rollback to savepoint recurring_template");
          await client.query("release savepoint recurring_template");
          const scheduledDate = dateOnly(template.next_scheduled_date);
          const code = error instanceof Error ? error.message.slice(0, 64) : "RECURRING_JOURNAL_GENERATION_FAILED";
          await client.query("savepoint recurring_failure");
          try {
            await client.query(
              `insert into recurring_journal_occurrence
                (tenant_id,company_id,id,template_id,scheduled_date,cycle_number,state,attempt_count,last_error_code)
               values($1,$2,$3,$4,$5,
                 (select count(*)+1 from recurring_journal_occurrence where tenant_id=$1 and template_id=$4),
                 'failed',1,$6)
               on conflict(tenant_id,template_id,scheduled_date) do update
                 set state=case when recurring_journal_occurrence.attempt_count>=99 then 'exhausted' else 'failed' end,
                     manual_journal_id=null,attempt_count=least(recurring_journal_occurrence.attempt_count+1,100),
                     last_error_code=$6,updated_at=clock_timestamp()
                 where recurring_journal_occurrence.state in ('pending','failed')`,
              [tenantId, template.company_id, `recurring-occurrence-${randomUUID()}`, template.id, scheduledDate, code],
            );
            await client.query("release savepoint recurring_failure");
          } catch {
            await client.query("rollback to savepoint recurring_failure");
            await client.query("release savepoint recurring_failure");
          }
          failed += 1;
        }
      }
      await client.query("commit");
      return { draftsCreated, failed };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function processRecurringJournalGeneration(
  options: RecurringJournalGenerationOptions,
  repository: RecurringJournalGenerationRepository,
) {
  if (!Number.isFinite(options.now.getTime())) throw new Error("Recurring Journal generation time is invalid.");
  return repository.generateDue(options);
}
