import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  FinancePostingService,
} from "../../server/api/src/modules/finance/posting/service.js";
import {
  SourceFinancePostingRepository,
} from "../../server/api/src/modules/finance/posting/source-repository.js";
import {
  FinancePostingError,
  createFinanceTransactionClient,
  type FinancePostCommand,
  type FinanceTransactionClient,
} from "../../server/api/src/modules/finance/posting/types.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceAuthorizationFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const companyId = `finance-company-${suffix}`;
const calendarId = `finance-calendar-${suffix}`;
const periodId = `finance-period-${suffix}`;
const debitAccountId = `finance-expense-${suffix}`;
const creditAccountId = `finance-bank-${suffix}`;
const headerAccountId = `finance-header-${suffix}`;
const initialRateId = `finance-rate-initial-${suffix}`;
const changedRateId = `finance-rate-changed-${suffix}`;
const raceInitialRateId = `finance-rate-race-initial-${suffix}`;
const raceChangedRateId = `finance-rate-race-changed-${suffix}`;
let postingDate: string;
let fiscalYear: number;
let periodNumber: number;
let foreignCurrency: string;
let missingCurrency: string;
let raceCurrency: string;

function postCommand(
  sourceId: string,
  idempotencyKey: string,
  transactionCurrency: string,
  overrides: Partial<FinancePostCommand> = {},
): FinancePostCommand {
  return {
    tenantId: sourceTestTenantId,
    companyId,
    actorId: "r06.maker",
    postingDate,
    sourceType: "banking.payment",
    sourceId,
    eventType: "bank_payment.posted",
    externalIdempotencyKey: idempotencyKey,
    transactionCurrency,
    exchangeRateId: null,
    exchangeRateValue: "1",
    payloadHashMaterial: { payment_version: 4, fixture: suffix },
    lines: [
      {
        accountId: debitAccountId,
        debit: "125.25",
        credit: "0",
        dimensions: { department: "finance" },
        description: "Controlled posting debit",
        sourceMetadata: { payment_line: "primary" },
      },
      {
        accountId: creditAccountId,
        debit: "0",
        credit: "125.25",
        dimensions: {},
        description: "Controlled posting credit",
      },
    ],
    ...overrides,
  };
}

async function tenantTransaction<T>(
  pool: DatabasePool,
  operation: (client: FinanceTransactionClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
    await client.query("select set_config('nexora.user_id','r06.maker',true)");
    const result = await operation(await createFinanceTransactionClient(client));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

class FailingPostingRepository extends SourceFinancePostingRepository {
  override async postJournal(): Promise<void> {
    throw new Error("injected Finance posting failure");
  }
}

class SignalingRateLockRepository extends SourceFinancePostingRepository {
  constructor(private readonly onRateLockAttempt: () => void) {
    super();
  }

  override async resolveCompanyCurrency(
    client: FinanceTransactionClient,
    input: {
      tenantId: string;
      companyId: string;
      sourceCurrency: string;
      effectiveOnOrBefore: string;
    },
  ) {
    this.onRateLockAttempt();
    return super.resolveCompanyCurrency(client, input);
  }
}

async function immutableOriginalSnapshot(
  pool: DatabasePool,
  eventId: string,
  journalId: string,
): Promise<string> {
  const result = await pool.query<{ snapshot: string }>(
    `select jsonb_build_object(
       'event',to_jsonb(event),
       'journal',to_jsonb(journal) - array['status','reversed_by_journal_id']::text[],
       'lines',(select jsonb_agg(to_jsonb(line) order by line.line_number)
                  from journal_line line
                 where line.tenant_id=journal.tenant_id and line.journal_id=journal.id)
     )::text as snapshot
       from accounting_event event
       join journal_entry journal
         on journal.tenant_id=event.tenant_id and journal.source_type='accounting_event'
        and journal.source_id=event.id
      where event.tenant_id=$1 and event.id=$2 and journal.id=$3`,
    [sourceTestTenantId, eventId, journalId],
  );
  return result.rows[0]!.snapshot;
}

run("Finance posting service", () => {
  let pool: DatabasePool;
  let baseCurrency: string;
  let service: FinancePostingService;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    const dateAuthority = await pool.query<{ current_date: string; fiscal_year: number; period_number: number }>(
      `select current_date::text as current_date,
              extract(year from current_date)::integer as fiscal_year,
              extract(month from current_date)::integer as period_number`,
    );
    postingDate = dateAuthority.rows[0]!.current_date;
    fiscalYear = dateAuthority.rows[0]!.fiscal_year;
    periodNumber = dateAuthority.rows[0]!.period_number;
    const existingBase = await pool.query<{ code: string }>(
      `select code from currency where tenant_id=$1 and status='active' and is_base`,
      [sourceTestTenantId],
    );
    baseCurrency = existingBase.rows[0]?.code ?? "USD";
    if (!existingBase.rows[0]) {
      await pool.query(
        `insert into currency (tenant_id,code,name,decimal_places,is_base,status)
         values ($1,'USD','US Dollar',2,true,'active')`,
        [sourceTestTenantId],
      );
    }
    const availableCurrencies = await pool.query<{ code: string; name: string; decimal_places: number }>(
      `select catalog.code,catalog.name,catalog.decimal_places
         from currency_catalog catalog
        where catalog.status='active' and catalog.code<>$2
          and catalog.decimal_places>=2
          and exists(select 1 from country_currency_catalog mapping where mapping.currency_code=catalog.code)
          and not exists(select 1 from currency adopted where adopted.tenant_id=$1 and adopted.code=catalog.code)
        order by catalog.code limit 3`,
      [sourceTestTenantId, baseCurrency],
    );
    if (availableCurrencies.rows.length < 3)
      throw new Error("Finance test could not allocate isolated currency fixtures.");
    [foreignCurrency, missingCurrency, raceCurrency] = availableCurrencies.rows.map((row) => row.code) as [
      string,
      string,
      string,
    ];
    for (const currency of availableCurrencies.rows)
      await pool.query(
        `insert into currency
         (tenant_id,code,name,decimal_places,is_base,status,catalog_code,row_version,adopted_by,adopted_at)
         values ($1,$2,$3,$4,false,'active',$2,1,'r06.maker',clock_timestamp())`,
        [sourceTestTenantId, currency.code, currency.name, currency.decimal_places],
      );
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values ($1,$2,null,'company',$3,'Finance Posting Test Company','active')`,
      [companyId, sourceTestTenantId, `FIN-${suffix}`],
    );
    await ensureCompanyCurrencyFixture(pool, companyId, baseCurrency, [
      foreignCurrency,
      missingCurrency,
      raceCurrency,
    ]);
    await pool.query(
      `insert into security_user_company_access
       (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       values($1,$2,'r06.maker',$3,false,'r06.last-admin-a','governed_administration','finance-posting-integration')`,
      [sourceTestTenantId, `finance-access-${suffix}`, companyId],
    );
    await pool.query(
      `insert into currency_rate
        (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,created_at)
       values ($1,$2,$3,$4,$5,1.25,current_date - 1,now())`,
      [initialRateId, sourceTestTenantId, companyId, foreignCurrency, baseCurrency],
    );
    await pool.query(
      `insert into currency_rate
        (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,created_at)
       values ($1,$2,$3,$4,$5,1.1,current_date - 1,now())`,
      [raceInitialRateId, sourceTestTenantId, companyId, raceCurrency, baseCurrency],
    );
    await pool.query(
      `insert into fiscal_calendar
        (id,tenant_id,company_id,year,period_start,period_end,status)
       values ($1,$2,$3,$4,make_date($4,1,1),make_date($4,12,31),'active')`,
      [calendarId, sourceTestTenantId, companyId, fiscalYear],
    );
    await pool.query(
      `insert into financial_period
        (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
       values ($1,$2,$3,$4,$5,date_trunc('month',current_date)::date,
               (date_trunc('month',current_date) + interval '1 month - 1 day')::date,'open',now())`,
      [periodId, sourceTestTenantId, companyId, calendarId, periodNumber],
    );
    await pool.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
         manual_posting_allowed,is_system_account,reconciliation_required,created_at)
       values
        ($1,$3,$4,$5,'Posting Expense','expense',false,'["department"]'::jsonb,'active',true,false,false,now()),
        ($2,$3,$4,$6,'Posting Bank','asset',false,'[]'::jsonb,'active',true,false,true,now()),
        ($7,$3,$4,$8,'Posting Header','expense',true,'[]'::jsonb,'active',true,false,false,now())`,
      [
        debitAccountId,
        creditAccountId,
        sourceTestTenantId,
        companyId,
        `EXP-${suffix}`,
        `BANK-${suffix}`,
        headerAccountId,
        `HDR-${suffix}`,
      ],
    );
    service = new FinancePostingService();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("posts once, replays the same key, rejects a second key, and creates an exact compensating reversal", async () => {
    const sourceId = `payment-${suffix}`;
    const input = postCommand(sourceId, `post-${suffix}`, foreignCurrency, {
      exchangeRateId: initialRateId,
      exchangeRateValue: "1.25",
    });
    const posted = await tenantTransaction(pool, (client) => service.post(client, input));
    expect(posted).toMatchObject({
      baseCurrency,
      transactionCurrency: foreignCurrency,
      exchangeRateId: initialRateId,
      exchangeRate: "1.250000000000000000",
      periodId,
      replayed: false,
    });
    expect(posted.entryNumber).toMatch(new RegExp(`^JE-${fiscalYear}-${String(periodNumber).padStart(2, "0")}-\\d{8}$`));

    const replayed = await tenantTransaction(pool, (client) => service.post(client, input));
    expect(replayed).toEqual({ ...posted, replayed: true });
    await expect(
      tenantTransaction(pool, (client) =>
        service.post(client, {
          ...input,
          lines: input.lines.map((line) => ({
            ...line,
            debit: line.debit === "0" ? "0" : "126.25",
            credit: line.credit === "0" ? "0" : "126.25",
          })),
        }),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_IDEMPOTENCY_CONFLICT" });
    await expect(
      tenantTransaction(pool, (client) =>
        service.post(client, { ...input, externalIdempotencyKey: `post-second-${suffix}` }),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_SOURCE_ALREADY_POSTED" });

    const evidence = await pool.query<{
      event_count: string;
      journal_count: string;
      line_count: string;
      event_state: string;
      journal_status: string;
      debit_total: string;
      credit_total: string;
      audit_line_count: number;
      audit_description: string;
      audit_metadata: string;
    }>(
      `select
        (select count(*)::text from accounting_event where tenant_id=$1 and source_type='banking.payment' and source_id=$2) event_count,
        (select count(*)::text from journal_entry where tenant_id=$1 and source_type='accounting_event' and source_id=$3) journal_count,
        (select count(*)::text from journal_line where tenant_id=$1 and journal_id=$4) line_count,
        (select state from accounting_event where tenant_id=$1 and id=$3) event_state,
        (select status from journal_entry where tenant_id=$1 and id=$4) journal_status,
        (select sum(base_debit)::text from journal_line where tenant_id=$1 and journal_id=$4) debit_total,
        (select sum(base_credit)::text from journal_line where tenant_id=$1 and journal_id=$4) credit_total,
        (select jsonb_array_length(payload->'audit_lines') from accounting_event where tenant_id=$1 and id=$3) audit_line_count,
        (select payload#>>'{audit_lines,0,description}' from accounting_event where tenant_id=$1 and id=$3) audit_description,
        (select payload#>>'{audit_lines,0,source_metadata,payment_line}' from accounting_event where tenant_id=$1 and id=$3) audit_metadata`,
      [sourceTestTenantId, sourceId, posted.accountingEventId, posted.journalId],
    );
    expect(evidence.rows[0]).toEqual({
      event_count: "1",
      journal_count: "1",
      line_count: "2",
      event_state: "posted",
      journal_status: "posted",
      debit_total: "156.56000000",
      credit_total: "156.56000000",
      audit_line_count: 2,
      audit_description: "Controlled posting debit",
      audit_metadata: "primary",
    });

    await pool.query(
      `insert into currency_rate
        (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,created_at)
       values ($1,$2,$3,$4,$5,1.5,current_date,now())`,
      [changedRateId, sourceTestTenantId, companyId, foreignCurrency, baseCurrency],
    );
    await expect(
      tenantTransaction(pool, (client) =>
        service.post(
          client,
          postCommand(`stale-rate-${suffix}`, `stale-rate-key-${suffix}`, foreignCurrency, {
            exchangeRateId: initialRateId,
            exchangeRateValue: "1.25",
          }),
        ),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_EXCHANGE_RATE_CHANGED" });

    const originalBeforeReversal = await immutableOriginalSnapshot(
      pool,
      posted.accountingEventId,
      posted.journalId,
    );

    const reversalCommand = {
      tenantId: sourceTestTenantId,
      companyId,
      actorId: "r06.checker",
      sourceType: "banking.payment",
      sourceId,
      eventType: "bank_payment.reversed",
      originalEventType: "bank_payment.posted",
      externalIdempotencyKey: `reverse-${suffix}`,
      transactionCurrency: foreignCurrency,
      payloadHashMaterial: { reason_hash: "synthetic-reversal" },
      originalAccountingEventId: posted.accountingEventId,
      originalJournalId: posted.journalId,
    } as const;
    const reversed = await tenantTransaction(pool, (client) => service.reverse(client, reversalCommand));
    expect(reversed).toMatchObject({
      originalAccountingEventId: posted.accountingEventId,
      originalJournalId: posted.journalId,
      replayed: false,
    });
    const reversalEvidence = await pool.query<{
      original_status: string;
      reversed_by_journal_id: string;
      reversal_status: string;
      reversal_posting_date: string;
      reverses_journal_id: string;
      compensates_event_id: string;
      opposite_line_count: string;
    }>(
      `select original.status as original_status,original.reversed_by_journal_id,
              reversal.status as reversal_status,reversal.posting_date::text as reversal_posting_date,
              reversal.reverses_journal_id,
              event.compensates_event_id,
              (select count(*)::text
                 from journal_line before_line
                 join journal_line after_line
                   on after_line.tenant_id=before_line.tenant_id
                  and after_line.journal_id=reversal.id
                  and after_line.line_number=before_line.line_number
                  and after_line.debit=before_line.credit
                  and after_line.credit=before_line.debit
                  and after_line.base_debit=before_line.base_credit
                  and after_line.base_credit=before_line.base_debit
                  and after_line.currency=before_line.currency
                  and after_line.fx_rate is not distinct from before_line.fx_rate
                  and after_line.dimensions=before_line.dimensions
                where before_line.tenant_id=original.tenant_id
                  and before_line.journal_id=original.id) opposite_line_count
         from journal_entry original
         join journal_entry reversal
           on reversal.tenant_id=original.tenant_id and reversal.id=original.reversed_by_journal_id
         join accounting_event event
           on event.tenant_id=reversal.tenant_id and event.id=reversal.source_id
        where original.tenant_id=$1 and original.id=$2`,
      [sourceTestTenantId, posted.journalId],
    );
    expect(reversalEvidence.rows[0]).toEqual({
      original_status: "reversed",
      reversed_by_journal_id: reversed.journalId,
      reversal_status: "posted",
      reversal_posting_date: postingDate,
      reverses_journal_id: posted.journalId,
      compensates_event_id: posted.accountingEventId,
      opposite_line_count: "2",
    });
    expect(await immutableOriginalSnapshot(pool, posted.accountingEventId, posted.journalId)).toBe(
      originalBeforeReversal,
    );
    const replayedReversal = await tenantTransaction(pool, (client) => service.reverse(client, reversalCommand));
    expect(replayedReversal).toEqual({ ...reversed, replayed: true });
    const replayedPostAfterReversal = await tenantTransaction(pool, (client) => service.post(client, input));
    expect(replayedPostAfterReversal).toEqual({ ...posted, replayed: true });
    await expect(
      tenantTransaction(pool, (client) =>
        service.reverse(client, {
          ...reversalCommand,
          externalIdempotencyKey: `reverse-second-${suffix}`,
        }),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_REVERSAL_ALREADY_EXISTS" });
  });

  it("allocates distinct journal numbers across concurrent source transactions", async () => {
    const [left, right] = await Promise.all([
      tenantTransaction(pool, (client) =>
        service.post(client, postCommand(`concurrent-left-${suffix}`, `concurrent-left-key-${suffix}`, baseCurrency)),
      ),
      tenantTransaction(pool, (client) =>
        service.post(client, postCommand(`concurrent-right-${suffix}`, `concurrent-right-key-${suffix}`, baseCurrency)),
      ),
    ]);
    expect(left.entryNumber).not.toBe(right.entryNumber);
    expect(left.journalId).not.toBe(right.journalId);
  });

  it("rejects an unbranded autocommit client before any Finance write", async () => {
    const sourceId = `autocommit-${suffix}`;
    await expect(createFinanceTransactionClient(pool)).rejects.toMatchObject<Partial<FinancePostingError>>({
      code: "FINANCE_TRANSACTION_REQUIRED",
    });
    await expect(
      service.post(
        pool as unknown as FinanceTransactionClient,
        postCommand(sourceId, `autocommit-key-${suffix}`, baseCurrency),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_TRANSACTION_REQUIRED" });
    const count = await pool.query<{ count: string }>(
      `select count(*)::text as count from accounting_event where tenant_id=$1 and source_id=$2`,
      [sourceTestTenantId, sourceId],
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("serializes rate writers and fails a stale snapshot when newer authority commits first", async () => {
    const sourceId = `rate-race-${suffix}`;
    let notifyRateLockAttempt!: () => void;
    const rateLockAttempted = new Promise<void>((resolve) => {
      notifyRateLockAttempt = resolve;
    });
    const guardedService = new FinancePostingService(
      new SignalingRateLockRepository(notifyRateLockAttempt),
    );
    const writer = await pool.connect();
    let writerCommitted = false;
    try {
      await writer.query("begin");
      await writer.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await writer.query(
        `insert into currency_rate
          (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,created_at)
         values ($1,$2,$3,$4,$5,1.2,current_date,now())`,
        [raceChangedRateId, sourceTestTenantId, companyId, raceCurrency, baseCurrency],
      );
      const postingOutcome = tenantTransaction(pool, (client) =>
        guardedService.post(
          client,
          postCommand(sourceId, `rate-race-key-${suffix}`, raceCurrency, {
            exchangeRateId: raceInitialRateId,
            exchangeRateValue: "1.1",
          }),
        ),
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await rateLockAttempted;
      await writer.query("commit");
      writerCommitted = true;
      await expect(postingOutcome).resolves.toMatchObject<Partial<FinancePostingError>>({
        code: "FINANCE_EXCHANGE_RATE_CHANGED",
      });
    } finally {
      if (!writerCommitted) await writer.query("rollback").catch(() => undefined);
      writer.release();
    }
    const count = await pool.query<{ count: string }>(
      `select count(*)::text as count from accounting_event where tenant_id=$1 and source_id=$2`,
      [sourceTestTenantId, sourceId],
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("leaves no partial event, journal, lines, or sequence consumption after caller rollback", async () => {
    const sourceId = `rollback-${suffix}`;
    const failing = new FinancePostingService(new FailingPostingRepository());
    const sequenceBefore = await pool.query<{ next_value: string }>(
      `select next_value::text as next_value from journal_entry_sequence
        where tenant_id=$1 and company_id=$2 and period_id=$3`,
      [sourceTestTenantId, companyId, periodId],
    );
    await expect(
      tenantTransaction(pool, (client) =>
        failing.post(client, postCommand(sourceId, `rollback-key-${suffix}`, baseCurrency)),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({
      status: 500,
      code: "FINANCE_PERSISTENCE_INVARIANT",
      message: "The Finance posting could not be completed safely.",
    });
    const evidence = await pool.query<{
      events: string;
      journals: string;
      draft_journals: string;
      next_value: string;
    }>(
      `select
        (select count(*)::text from accounting_event where tenant_id=$1 and source_id=$2) events,
        (select count(*)::text from journal_entry journal
          join accounting_event event on event.tenant_id=journal.tenant_id and event.id=journal.source_id
         where event.tenant_id=$1 and event.source_id=$2) journals,
        (select count(*)::text from journal_entry journal
          join accounting_event event on event.tenant_id=journal.tenant_id and event.id=journal.source_id
         where event.tenant_id=$1 and event.source_id=$2 and journal.status='draft') draft_journals,
        (select next_value::text from journal_entry_sequence
          where tenant_id=$1 and company_id=$3 and period_id=$4) next_value`,
      [sourceTestTenantId, sourceId, companyId, periodId],
    );
    expect(evidence.rows[0]).toEqual({
      events: "0",
      journals: "0",
      draft_journals: "0",
      next_value: sequenceBefore.rows[0]!.next_value,
    });
  });

  it("rejects inactive and header accounts before creating accounting evidence", async () => {
    const sources: string[] = [];
    const inactiveSource = `account-inactive-${suffix}`;
    sources.push(inactiveSource);
    await expect(
      tenantTransaction(pool, async (client) => {
        await client.query(
          "update account set status='inactive' where tenant_id=$1 and company_id=$2 and id=$3",
          [sourceTestTenantId, companyId, debitAccountId],
        );
        return service.post(client, postCommand(inactiveSource, `${inactiveSource}-key`, baseCurrency));
      }),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_ACCOUNT_INACTIVE_POST_BLOCKED" });

    const headerSource = `account-header-${suffix}`;
    sources.push(headerSource);
    const headerCommand = postCommand(headerSource, `${headerSource}-key`, baseCurrency);
    await expect(
      tenantTransaction(pool, (client) =>
        service.post(client, {
          ...headerCommand,
          lines: [{ ...headerCommand.lines[0]!, accountId: headerAccountId }, headerCommand.lines[1]!],
        }),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_ACCOUNT_NOT_POSTABLE" });
    const counts = await pool.query<{ count: string }>(
      `select count(*)::text as count from accounting_event where tenant_id=$1 and source_id=any($2::text[])`,
      [sourceTestTenantId, sources],
    );
    expect(counts.rows[0]?.count).toBe("0");
  });

  it("rejects a locked period and missing direct FX before writing an event", async () => {
    const lockedSources: string[] = [];
    for (const status of ["soft_close", "closed"] as const) {
      const sourceId = `${status}-${suffix}`;
      lockedSources.push(sourceId);
      await expect(
        tenantTransaction(pool, async (client) => {
          await client.query("update financial_period set status=$3 where tenant_id=$1 and id=$2", [
            sourceTestTenantId,
            periodId,
            status,
          ]);
          return service.post(client, postCommand(sourceId, `${sourceId}-key`, baseCurrency));
        }),
      ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_PERIOD_CLOSED_POST_BLOCKED" });
    }

    const fxSource = `missing-fx-${suffix}`;
    await expect(
      tenantTransaction(pool, (client) =>
        service.post(
          client,
          postCommand(fxSource, `missing-fx-key-${suffix}`, missingCurrency, {
            exchangeRateId: `missing-rate-${suffix}`,
            exchangeRateValue: "1.25",
          }),
        ),
      ),
    ).rejects.toMatchObject<Partial<FinancePostingError>>({ code: "FINANCE_EXCHANGE_RATE_MISSING" });
    const counts = await pool.query<{ locked: string; fx: string }>(
      `select
        (select count(*)::text from accounting_event where tenant_id=$1 and source_id=any($2::text[])) locked,
        (select count(*)::text from accounting_event where tenant_id=$1 and source_id=$3) fx`,
      [sourceTestTenantId, lockedSources, fxSource],
    );
    expect(counts.rows[0]).toEqual({ locked: "0", fx: "0" });
  });
});
