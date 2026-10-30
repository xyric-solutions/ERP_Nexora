import { randomUUID } from "node:crypto";

import type { QueryResult, QueryResultRow } from "pg";

import {
  resolveCompanyCurrencyAuthority,
  type CompanyCurrencyAuthority,
} from "../currencies/company-authority.js";
import type { FinanceJsonValue, FinanceTransactionClient } from "./types.js";

type FinancePostingClient = FinanceTransactionClient;

export interface FinanceCurrencyRow {
  code: string;
  decimal_places: number;
}

export interface FinanceRateRow {
  id: string;
  rate: string;
}

export interface FinancePeriodRow {
  id: string;
  status: "open" | "soft_close" | "closed";
  period_number: number;
  fiscal_year: number;
}

export interface FinanceAccountRow {
  id: string;
  status: "active" | "inactive";
  is_header: boolean;
  manual_posting_allowed: boolean;
  required_dimensions: unknown;
}

export interface FinanceEventRow {
  id: string;
  source_type: string;
  source_id: string;
  event_type: string;
  payload: unknown;
  payload_hash: string;
  idempotency_key: string;
  state: "received" | "validated" | "posted" | "rejected" | "failed" | "retry" | "dead";
  compensates_event_id: string | null;
}

export interface FinanceJournalRow {
  id: string;
  company_id: string;
  posting_date: string;
  period_id: string | null;
  source_type: string;
  source_id: string;
  status: "draft" | "posted" | "reversed";
  entry_number: string | null;
  reverses_journal_id: string | null;
  reversed_by_journal_id: string | null;
}

export interface FinanceJournalLineRow {
  line_number: number;
  account_id: string;
  debit: string;
  credit: string;
  currency: string;
  fx_rate: string | null;
  base_debit: string;
  base_credit: string;
  dimensions: unknown;
}

export interface PersistedFinanceLine {
  accountId: string;
  debit: string;
  credit: string;
  currency: string;
  fxRate: string | null;
  baseDebit: string;
  baseCredit: string;
  dimensions: Readonly<Record<string, string>>;
}

export interface FinancePostingRepository {
  assertTenantContext(client: FinancePostingClient, tenantId: string): Promise<boolean>;
  lockSource(client: FinancePostingClient, tenantId: string, sourceType: string, sourceId: string): Promise<void>;
  findEventByKey(
    client: FinancePostingClient,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<FinanceEventRow | null>;
  findSourceEvent(
    client: FinancePostingClient,
    tenantId: string,
    sourceType: string,
    sourceId: string,
    operation: "post" | "reverse",
  ): Promise<FinanceEventRow | null>;
  loadBaseCurrencies(client: FinancePostingClient, tenantId: string, lock?: boolean): Promise<FinanceCurrencyRow[]>;
  resolveCompanyCurrency(
    client: FinancePostingClient,
    input: {
      tenantId: string;
      companyId: string;
      sourceCurrency: string;
      effectiveOnOrBefore: string;
      lock?: boolean;
    },
  ): Promise<CompanyCurrencyAuthority>;
  loadTransactionCurrency(
    client: FinancePostingClient,
    tenantId: string,
    currency: string,
    lock?: boolean,
  ): Promise<FinanceCurrencyRow | null>;
  loadDirectRate(
    client: FinancePostingClient,
    tenantId: string,
    sourceCurrency: string,
    targetCurrency: string,
    postingDate: string,
    lock?: boolean,
  ): Promise<FinanceRateRow | null>;
  lockRateAuthority(
    client: FinancePostingClient,
    tenantId: string,
    sourceCurrency: string,
    targetCurrency: string,
  ): Promise<void>;
  loadCurrentDate(client: FinancePostingClient): Promise<string>;
  loadPeriods(
    client: FinancePostingClient,
    tenantId: string,
    companyId: string,
    postingDate: string,
    lock?: boolean,
  ): Promise<FinancePeriodRow[]>;
  loadAccounts(
    client: FinancePostingClient,
    tenantId: string,
    companyId: string,
    accountIds: readonly string[],
  ): Promise<FinanceAccountRow[]>;
  insertEvent(
    client: FinancePostingClient,
    input: {
      tenantId: string;
      sourceType: string;
      sourceId: string;
      eventType: string;
      payload: Readonly<Record<string, FinanceJsonValue>>;
      payloadHash: string;
      idempotencyKey: string;
      compensatesEventId: string | null;
      auditRef: string | null;
    },
  ): Promise<string>;
  transitionEvent(
    client: FinancePostingClient,
    tenantId: string,
    eventId: string,
    fromState: "received" | "validated",
    toState: "validated" | "posted",
  ): Promise<void>;
  allocateEntryNumber(
    client: FinancePostingClient,
    tenantId: string,
    companyId: string,
    period: FinancePeriodRow,
  ): Promise<string>;
  insertDraftJournal(
    client: FinancePostingClient,
    input: {
      tenantId: string;
      companyId: string;
      actorId: string;
      postingDate: string;
      eventId: string;
      reversesJournalId: string | null;
    },
  ): Promise<string>;
  insertJournalLines(
    client: FinancePostingClient,
    tenantId: string,
    journalId: string,
    lines: readonly PersistedFinanceLine[],
  ): Promise<void>;
  postJournal(
    client: FinancePostingClient,
    tenantId: string,
    journalId: string,
    periodId: string,
    entryNumber: string,
  ): Promise<void>;
  findJournalByEvent(
    client: FinancePostingClient,
    tenantId: string,
    eventId: string,
  ): Promise<FinanceJournalRow | null>;
  loadOriginalPosting(
    client: FinancePostingClient,
    tenantId: string,
    eventId: string,
    journalId: string,
  ): Promise<{ event: FinanceEventRow; journal: FinanceJournalRow; lines: FinanceJournalLineRow[] } | null>;
  markOriginalReversed(
    client: FinancePostingClient,
    tenantId: string,
    originalJournalId: string,
    reversalJournalId: string,
  ): Promise<void>;
}

function one<T extends QueryResultRow>(result: QueryResult<T>): T | null {
  return result.rows[0] ?? null;
}

function invariant(message: string): Error {
  return new Error(`Finance persistence invariant failed: ${message}`);
}

export function financeRateAuthorityLockResource(
  tenantId: string,
  sourceCurrency: string,
  targetCurrency: string,
): string {
  return `nexora:finance:rate-authority:${tenantId}:${sourceCurrency}:${targetCurrency}`;
}

/**
 * Shared transaction-level protocol for currency-rate readers and writers.
 * A writer must acquire this lock before changing authority for the same
 * tenant/source/target tuple; posting holds it from revalidation through commit.
 */
export async function lockFinanceRateAuthority(
  client: FinanceTransactionClient,
  tenantId: string,
  sourceCurrency: string,
  targetCurrency: string,
): Promise<void> {
  await client.query("select pg_advisory_xact_lock(finance_currency_rate_lock_key($1,$2,$3))", [
    tenantId,
    sourceCurrency,
    targetCurrency,
  ]);
}

export class SourceFinancePostingRepository implements FinancePostingRepository {
  async assertTenantContext(client: FinancePostingClient, tenantId: string): Promise<boolean> {
    const result = await client.query<{ tenant_id: string }>(
      "select current_setting('nexora.tenant_id',true) as tenant_id",
    );
    return result.rows[0]?.tenant_id === tenantId;
  }

  async lockSource(
    client: FinancePostingClient,
    tenantId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<void> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:finance:${tenantId}:${sourceType}:${sourceId}`,
    ]);
  }

  async findEventByKey(
    client: FinancePostingClient,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<FinanceEventRow | null> {
    return one(
      await client.query<FinanceEventRow>(
        `select id,source_type,source_id,event_type,payload,payload_hash,idempotency_key,state,compensates_event_id
           from accounting_event where tenant_id=$1 and idempotency_key=$2 for update`,
        [tenantId, idempotencyKey],
      ),
    );
  }

  async findSourceEvent(
    client: FinancePostingClient,
    tenantId: string,
    sourceType: string,
    sourceId: string,
    operation: "post" | "reverse",
  ): Promise<FinanceEventRow | null> {
    return one(
      await client.query<FinanceEventRow>(
        `select id,source_type,source_id,event_type,payload,payload_hash,idempotency_key,state,compensates_event_id
          from accounting_event
          where tenant_id=$1 and source_type=$2 and source_id=$3
            and (($4='post' and compensates_event_id is null)
              or ($4='reverse' and compensates_event_id is not null))
          order by created_at,id limit 1 for update`,
        [tenantId, sourceType, sourceId, operation],
      ),
    );
  }

  resolveCompanyCurrency(
    client: FinancePostingClient,
    input: {
      tenantId: string;
      companyId: string;
      sourceCurrency: string;
      effectiveOnOrBefore: string;
      lock?: boolean;
    },
  ): Promise<CompanyCurrencyAuthority> {
    return resolveCompanyCurrencyAuthority(client, input);
  }

  async loadBaseCurrencies(client: FinancePostingClient, tenantId: string, lock = true): Promise<FinanceCurrencyRow[]> {
    return (
      await client.query<FinanceCurrencyRow>(
        `select code,decimal_places from currency
          where tenant_id=$1 and status='active' and is_base${lock ? " for share" : ""}`,
        [tenantId],
      )
    ).rows;
  }

  async loadTransactionCurrency(
    client: FinancePostingClient,
    tenantId: string,
    currency: string,
    lock = true,
  ): Promise<FinanceCurrencyRow | null> {
    return one(
      await client.query<FinanceCurrencyRow>(
        `select code,decimal_places from currency
          where tenant_id=$1 and code=$2 and status='active'${lock ? " for share" : ""}`,
        [tenantId, currency],
      ),
    );
  }

  async loadDirectRate(
    client: FinancePostingClient,
    tenantId: string,
    sourceCurrency: string,
    targetCurrency: string,
    postingDate: string,
    lock = true,
  ): Promise<FinanceRateRow | null> {
    return one(
      await client.query<FinanceRateRow>(
        `select id,rate::text as rate from currency_rate
          where tenant_id=$1 and source_currency=$2 and target_currency=$3 and effective_date<=$4::date and status='active'
          order by effective_date desc,id desc limit 1${lock ? " for share" : ""}`,
        [tenantId, sourceCurrency, targetCurrency, postingDate],
      ),
    );
  }

  async lockRateAuthority(
    client: FinancePostingClient,
    tenantId: string,
    sourceCurrency: string,
    targetCurrency: string,
  ): Promise<void> {
    await lockFinanceRateAuthority(client, tenantId, sourceCurrency, targetCurrency);
  }

  async loadCurrentDate(client: FinancePostingClient): Promise<string> {
    const result = await client.query<{ current_date: string }>("select current_date::text as current_date");
    const currentDate = result.rows[0]?.current_date;
    if (!currentDate) throw invariant("database current date returned no value");
    return currentDate;
  }

  async loadPeriods(
    client: FinancePostingClient,
    tenantId: string,
    companyId: string,
    postingDate: string,
    lock = true,
  ): Promise<FinancePeriodRow[]> {
    return (
      await client.query<FinancePeriodRow>(
        `select period.id,period.status,period.period_number,calendar.year as fiscal_year
           from financial_period period
           join fiscal_calendar calendar
             on calendar.tenant_id=period.tenant_id and calendar.id=period.fiscal_calendar_id
            and calendar.company_id=period.company_id
          where period.tenant_id=$1 and period.company_id=$2
            and $3::date between period.period_start and period.period_end
          order by period.id${lock ? " for share of period,calendar" : ""}`,
        [tenantId, companyId, postingDate],
      )
    ).rows;
  }

  async loadAccounts(
    client: FinancePostingClient,
    tenantId: string,
    companyId: string,
    accountIds: readonly string[],
  ): Promise<FinanceAccountRow[]> {
    return (
      await client.query<FinanceAccountRow>(
        `select id,status,is_header,manual_posting_allowed,required_dimensions
           from account where tenant_id=$1 and company_id=$2 and id=any($3::text[]) for share`,
        [tenantId, companyId, accountIds],
      )
    ).rows;
  }

  async insertEvent(
    client: FinancePostingClient,
    input: {
      tenantId: string;
      sourceType: string;
      sourceId: string;
      eventType: string;
      payload: Readonly<Record<string, FinanceJsonValue>>;
      payloadHash: string;
      idempotencyKey: string;
      compensatesEventId: string | null;
      auditRef: string | null;
    },
  ): Promise<string> {
    const id = `finance-event-${randomUUID()}`;
    await client.query(
      `insert into accounting_event
        (id,tenant_id,source_type,source_id,event_type,payload,payload_hash,idempotency_key,state,
         retry_count,compensates_event_id,audit_ref,created_at,posted_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'received',0,$9,$10,clock_timestamp(),null)`,
      [
        id,
        input.tenantId,
        input.sourceType,
        input.sourceId,
        input.eventType,
        JSON.stringify(input.payload),
        input.payloadHash,
        input.idempotencyKey,
        input.compensatesEventId,
        input.auditRef,
      ],
    );
    return id;
  }

  async transitionEvent(
    client: FinancePostingClient,
    tenantId: string,
    eventId: string,
    fromState: "received" | "validated",
    toState: "validated" | "posted",
  ): Promise<void> {
    const result = await client.query(
      `update accounting_event set state=$4,posted_at=case when $4='posted' then clock_timestamp() else null end
        where tenant_id=$1 and id=$2 and state=$3`,
      [tenantId, eventId, fromState, toState],
    );
    if (result.rowCount !== 1) throw invariant(`event ${eventId} could not transition ${fromState} -> ${toState}`);
  }

  async allocateEntryNumber(
    client: FinancePostingClient,
    tenantId: string,
    companyId: string,
    period: FinancePeriodRow,
  ): Promise<string> {
    const result = await client.query<{ allocated: string }>(
      `insert into journal_entry_sequence (tenant_id,company_id,period_id,next_value)
       values ($1,$2,$3,2)
       on conflict (tenant_id,company_id,period_id) do update
         set next_value=journal_entry_sequence.next_value+1
       returning (next_value-1)::text as allocated`,
      [tenantId, companyId, period.id],
    );
    const allocated = result.rows[0]?.allocated;
    if (!allocated) throw invariant("journal sequence allocation returned no value");
    return `JE-${period.fiscal_year}-${String(period.period_number).padStart(2, "0")}-${allocated.padStart(8, "0")}`;
  }

  async insertDraftJournal(
    client: FinancePostingClient,
    input: {
      tenantId: string;
      companyId: string;
      actorId: string;
      postingDate: string;
      eventId: string;
      reversesJournalId: string | null;
    },
  ): Promise<string> {
    const id = `journal-${randomUUID()}`;
    await client.query(
      `insert into journal_entry
        (id,tenant_id,company_id,created_by,posting_date,period_id,source_type,source_id,status,
         entry_number,reverses_journal_id,reversed_by_journal_id,created_at,posted_at)
       values ($1,$2,$3,$4,$5::date,null,'accounting_event',$6,'draft',null,$7,null,clock_timestamp(),null)`,
      [id, input.tenantId, input.companyId, input.actorId, input.postingDate, input.eventId, input.reversesJournalId],
    );
    return id;
  }

  async insertJournalLines(
    client: FinancePostingClient,
    tenantId: string,
    journalId: string,
    lines: readonly PersistedFinanceLine[],
  ): Promise<void> {
    const values: unknown[] = [];
    const tuples = lines.map((line, index) => {
      const base = values.length;
      values.push(
        `journal-line-${randomUUID()}`,
        journalId,
        tenantId,
        index + 1,
        line.accountId,
        line.debit,
        line.credit,
        line.currency,
        line.fxRate,
        line.baseDebit,
        line.baseCredit,
        JSON.stringify(line.dimensions),
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12}::jsonb)`;
    });
    await client.query(
      `insert into journal_line
        (id,journal_id,tenant_id,line_number,account_id,debit,credit,currency,fx_rate,
         base_debit,base_credit,dimensions) values ${tuples.join(",")}`,
      values,
    );
  }

  async postJournal(
    client: FinancePostingClient,
    tenantId: string,
    journalId: string,
    periodId: string,
    entryNumber: string,
  ): Promise<void> {
    const result = await client.query(
      `update journal_entry set status='posted',period_id=$3,entry_number=$4,posted_at=clock_timestamp()
        where tenant_id=$1 and id=$2 and status='draft'`,
      [tenantId, journalId, periodId, entryNumber],
    );
    if (result.rowCount !== 1) throw invariant(`journal ${journalId} could not transition draft -> posted`);
  }

  async findJournalByEvent(
    client: FinancePostingClient,
    tenantId: string,
    eventId: string,
  ): Promise<FinanceJournalRow | null> {
    return one(
      await client.query<FinanceJournalRow>(
        `select id,company_id,posting_date::text as posting_date,period_id,source_type,source_id,status,entry_number,
                reverses_journal_id,reversed_by_journal_id
           from journal_entry where tenant_id=$1 and source_type='accounting_event' and source_id=$2
          order by created_at,id limit 1`,
        [tenantId, eventId],
      ),
    );
  }

  async loadOriginalPosting(
    client: FinancePostingClient,
    tenantId: string,
    eventId: string,
    journalId: string,
  ): Promise<{ event: FinanceEventRow; journal: FinanceJournalRow; lines: FinanceJournalLineRow[] } | null> {
    const locked = await client.query<FinanceEventRow & FinanceJournalRow & { event_id: string; journal_id: string }>(
      `select event.id as event_id,event.source_type,event.source_id,event.event_type,event.payload,
              event.payload_hash,event.idempotency_key,event.state,event.compensates_event_id,
              journal.id as journal_id,journal.company_id,journal.posting_date::text as posting_date,journal.period_id,
              journal.source_type as journal_source_type,journal.source_id as journal_source_id,
              journal.status,journal.entry_number,journal.reverses_journal_id,journal.reversed_by_journal_id
         from accounting_event event
         join journal_entry journal
           on journal.tenant_id=event.tenant_id and journal.source_type='accounting_event'
          and journal.source_id=event.id
        where event.tenant_id=$1 and event.id=$2 and journal.id=$3
        for update of event,journal`,
      [tenantId, eventId, journalId],
    );
    const row = locked.rows[0] as
      | (FinanceEventRow & {
          event_id: string;
          journal_id: string;
          company_id: string;
          posting_date: string;
          period_id: string | null;
          journal_source_type: string;
          journal_source_id: string;
          status: FinanceJournalRow["status"];
          entry_number: string | null;
          reverses_journal_id: string | null;
          reversed_by_journal_id: string | null;
        })
      | undefined;
    if (!row) return null;
    const lines = (
      await client.query<FinanceJournalLineRow>(
        `select line_number,account_id,debit::text,credit::text,currency,fx_rate::text,
                base_debit::text,base_credit::text,dimensions
           from journal_line where tenant_id=$1 and journal_id=$2 order by line_number for share`,
        [tenantId, journalId],
      )
    ).rows;
    return {
      event: {
        id: row.event_id,
        source_type: row.source_type,
        source_id: row.source_id,
        event_type: row.event_type,
        payload: row.payload,
        payload_hash: row.payload_hash,
        idempotency_key: row.idempotency_key,
        state: row.state,
        compensates_event_id: row.compensates_event_id,
      },
      journal: {
        id: row.journal_id,
        company_id: row.company_id,
        posting_date: row.posting_date,
        period_id: row.period_id,
        source_type: row.journal_source_type,
        source_id: row.journal_source_id,
        status: row.status,
        entry_number: row.entry_number,
        reverses_journal_id: row.reverses_journal_id,
        reversed_by_journal_id: row.reversed_by_journal_id,
      },
      lines,
    };
  }

  async markOriginalReversed(
    client: FinancePostingClient,
    tenantId: string,
    originalJournalId: string,
    reversalJournalId: string,
  ): Promise<void> {
    const result = await client.query(
      `update journal_entry set status='reversed',reversed_by_journal_id=$3
        where tenant_id=$1 and id=$2 and status='posted' and reversed_by_journal_id is null`,
      [tenantId, originalJournalId, reversalJournalId],
    );
    if (result.rowCount !== 1) throw invariant(`journal ${originalJournalId} could not transition posted -> reversed`);
  }
}
