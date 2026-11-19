import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import type { SubledgerRequest } from "../../packages/contracts/src/index.js";
import { FinancePostingService } from "../../server/api/src/modules/finance/posting/service.js";
import {
  createFinanceTransactionClient,
  type FinancePostCommand,
} from "../../server/api/src/modules/finance/posting/types.js";
import { readBankNominalDirectory } from "../../server/api/src/modules/banking/nominal-directory.js";
import { SourceReferenceMasterRepository } from "../../server/api/src/modules/master-data/source-repository.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor, configureCustomerCreditFixture } from "./subledger-fixture.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("Accounting integrity guards", () => {
  let fixture: Awaited<ReturnType<typeof setupSubledgerFixture>>;
  let close: () => Promise<void>;
  const finance = new FinancePostingService();
  beforeAll(async () => {
    const database = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = database.close;
    fixture = await setupSubledgerFixture(database.pool, undefined, "USD");
  }, 60000);
  afterAll(async () => {
    await close?.();
  });

  async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await fixture.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.target',true)",
        [fixture.tenant],
      );
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  function command(account = fixture.policy.expense_account_id): FinancePostCommand {
    const id = randomUUID();
    return {
      tenantId: fixture.tenant,
      companyId: fixture.company,
      actorId: "r06.target",
      sourceType: "banking.payment",
      sourceId: id,
      eventType: "bank_payment.posted",
      externalIdempotencyKey: id,
      transactionCurrency: "USD",
      postingDate: "2026-10-20",
      exchangeRateId: null,
      exchangeRateValue: "1",
      payloadHashMaterial: {},
      lines: [
        { accountId: account, debit: "10", credit: "0", dimensions: {}, description: "Synthetic debit" },
        {
          accountId: `${fixture.company}-bank-USD`,
          debit: "0",
          credit: "10",
          dimensions: {},
          description: "Synthetic credit",
        },
      ],
    };
  }
  const post = (input: FinancePostCommand) =>
    transaction(async (client) => finance.post(await createFinanceTransactionClient(client), input));

  it.each(["receivable_account_id", "payable_account_id"] as const)(
    "rejects generic voucher posting to %s without financial effects",
    async (role) => {
      const input = command(fixture.policy[role]);
      await expect(post(input)).rejects.toMatchObject({ code: "FINANCE_SUBLEDGER_CONTROL_REQUIRED" });
      expect(
        (
          await fixture.pool.query("select 1 from accounting_event where tenant_id=$1 and source_id=$2", [
            fixture.tenant,
            input.sourceId,
          ])
        ).rowCount,
      ).toBe(0);
    },
  );

  it.each(["project", "location", "department", "branch", "cost_center", "cost_centre"])(
    "rejects a foreign or missing %s dimension even when optional",
    async (key) => {
      const input = command();
      input.lines = input.lines.map((line, i) =>
        i ? line : { ...line, dimensions: { [key]: "not-in-this-company" } },
      );
      await expect(post(input)).rejects.toMatchObject({ code: "FINANCE_DIMENSION_INVALID" });
    },
  );

  it("rejects an unbalanced journal and preserves replay and reversal controls", async () => {
    const unbalanced = command();
    unbalanced.lines = unbalanced.lines.map((line, i) => (i ? { ...line, credit: "11" } : line));
    await expect(post(unbalanced)).rejects.toMatchObject({ code: "FINANCE_JOURNAL_UNBALANCED" });
    const input = command();
    const original = await post(input);
    expect(await post(input)).toMatchObject({ journalId: original.journalId, replayed: true });
    await expect(post({ ...input, externalIdempotencyKey: randomUUID() })).rejects.toMatchObject({
      code: "FINANCE_SOURCE_ALREADY_POSTED",
    });
    const reverse = () =>
      transaction(async (client) =>
        finance.reverse(await createFinanceTransactionClient(client), {
          ...input,
          eventType: "bank_payment.reversed",
          originalEventType: input.eventType,
          originalAccountingEventId: original.accountingEventId,
          originalJournalId: original.journalId,
          externalIdempotencyKey: `reverse-${input.sourceId}`,
        }),
      );
    const reversal = await reverse();
    expect(await reverse()).toMatchObject({ journalId: reversal.journalId, replayed: true });
  });

  it("rejects appending new lines to an already posted journal", async () => {
    const original = await post(command());
    await expect(
      transaction(async (client) => {
        await client.query(
          `insert into journal_line(id,journal_id,tenant_id,line_number,account_id,debit,credit,currency,base_debit,base_credit)
        values($1,$2,$3,3,$4,1,0,'USD',1,0)`,
          [randomUUID(), original.journalId, fixture.tenant, fixture.policy.expense_account_id],
        );
      }),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (
        await fixture.pool.query(
          "select count(*)::int as count from journal_line where tenant_id=$1 and journal_id=$2",
          [fixture.tenant, original.journalId],
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it("requires real open-item effects even when an internal source claims to be the subledger", async () => {
    await expect(
      post({
        ...command(fixture.policy.receivable_account_id),
        sourceType: "currency_subledger",
        eventType: "currency_subledger.posted",
      }),
    ).rejects.toMatchObject({ code: "23514", constraint: "finance_subledger_journal_reconciliation" });
  });

  it("excludes control accounts from the shared payment/receipt selector", async () => {
    const directory = await transaction((client) =>
      readBankNominalDirectory(client, fixture.tenant, { company_id: fixture.company, limit: 200 }),
    );
    expect(directory.items.map((item) => item.id)).toContain(fixture.policy.expense_account_id);
    expect(directory.items.map((item) => item.id)).not.toContain(fixture.policy.payable_account_id);
    expect(directory.items.map((item) => item.id)).not.toContain(fixture.policy.receivable_account_id);
    expect(directory.availability?.protected_count).toBeGreaterThanOrEqual(2);
  });

  it("serializes different idempotency keys for one source into exactly one journal", async () => {
    const input = command();
    const outcomes = await Promise.allSettled([post(input), post({ ...input, externalIdempotencyKey: randomUUID() })]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(
      (
        await fixture.pool.query(
          "select count(*)::int as count from accounting_event where tenant_id=$1 and source_id=$2 and state='posted'",
          [fixture.tenant, input.sourceId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  async function rawJournal(
    client: PoolClient,
    account: string,
    dimensions = {},
    period = `period-${fixture.company}-10`,
  ) {
    const id = randomUUID();
    await client.query(
      `insert into journal_entry(id,tenant_id,company_id,created_by,posting_date,source_type,source_id,status,created_at)
      values($1,$2,$3,'r06.target','2026-10-20','integrity-probe',$1,'draft',clock_timestamp())`,
      [id, fixture.tenant, fixture.company],
    );
    await client.query(
      `insert into journal_line(id,journal_id,tenant_id,line_number,account_id,debit,credit,currency,base_debit,base_credit,dimensions)
      values($1,$2,$3,1,$4,7,0,'USD',7,0,$6),($5,$2,$3,2,$7,0,7,'USD',0,7,'{}')`,
      [
        randomUUID(),
        id,
        fixture.tenant,
        account,
        randomUUID(),
        JSON.stringify(dimensions),
        fixture.policy.revenue_account_id,
      ],
    );
    await client.query(
      "update journal_entry set status='posted',period_id=$3,entry_number=$2,posted_at=clock_timestamp() where tenant_id=$4 and id=$1",
      [id, `PROBE-${id}`, period, fixture.tenant],
    );
    return id;
  }

  it("blocks a direct-SQL control-account journal at commit", async () => {
    await expect(transaction((client) => rawJournal(client, fixture.policy.payable_account_id))).rejects.toMatchObject({
      code: "23514",
      constraint: "finance_subledger_journal_reconciliation",
    });
  });

  it("rejects a directly inserted empty posted journal and duplicate posted source evidence", async () => {
    await expect(
      transaction(async (client) => {
        const id = randomUUID();
        await client.query(
          `insert into journal_entry(id,tenant_id,company_id,created_by,posting_date,period_id,source_type,source_id,status,entry_number,created_at,posted_at)
        values($1,$2,$3,'r06.target','2026-10-20',$4,'integrity-probe',$1,'posted',$1,clock_timestamp(),clock_timestamp())`,
          [id, fixture.tenant, fixture.company, `period-${fixture.company}-10`],
        );
      }),
    ).rejects.toMatchObject({ code: "23514", constraint: "finance_journal_balance" });
    const posted = await post(command());
    await expect(
      transaction(async (client) => {
        await client.query(
          `insert into accounting_event(id,tenant_id,source_type,source_id,event_type,payload,payload_hash,idempotency_key,state,retry_count,created_at,posted_at)
        select $1,tenant_id,source_type,source_id,event_type,payload,payload_hash,$2,'posted',0,clock_timestamp(),clock_timestamp()
        from accounting_event where tenant_id=$3 and id=$4`,
          [randomUUID(), randomUUID(), fixture.tenant, posted.accountingEventId],
        );
      }),
    ).rejects.toMatchObject({ code: "23505", constraint: "finance_accounting_source_operation_once" });
  });

  it("blocks direct-SQL forged dimensions and moving draft lines into a posted journal", async () => {
    await expect(
      transaction((client) => rawJournal(client, fixture.policy.expense_account_id, { department: "forged" })),
    ).rejects.toMatchObject({ code: "23514", constraint: "finance_dimension_reference" });
    const original = await post(command());
    await expect(
      transaction(async (client) => {
        const draft = randomUUID();
        await client.query(
          `insert into journal_entry(id,tenant_id,company_id,created_by,posting_date,source_type,source_id,status,created_at)
        values($1,$2,$3,'r06.target','2026-10-20','integrity-probe',$1,'draft',clock_timestamp())`,
          [draft, fixture.tenant, fixture.company],
        );
        const line = randomUUID();
        await client.query(
          `insert into journal_line(id,journal_id,tenant_id,line_number,account_id,debit,credit,currency,base_debit,base_credit)
        values($1,$2,$3,1,$4,1,0,'USD',1,0)`,
          [line, draft, fixture.tenant, fixture.policy.expense_account_id],
        );
        await client.query("update journal_line set journal_id=$1,line_number=3 where tenant_id=$2 and id=$3", [
          original.journalId,
          fixture.tenant,
          line,
        ]);
      }),
    ).rejects.toMatchObject({ code: "23514", constraint: "finance_journal_line_immutable" });
  });

  it("rejects adopting a bank or a nominal with unmatched GL as a control account", async () => {
    const dirty = randomUUID();
    await fixture.pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$1,'Synthetic unmatched nominal','asset',false,'active',clock_timestamp())",
      [dirty, fixture.tenant, fixture.company],
    );
    await post(command(dirty));
    for (const control of [dirty, `${fixture.company}-bank-USD`]) {
      const { version, ...policy } = fixture.policy;
      await expect(
        fixture.repository.configure(
          subledgerActor(),
          { ...policy, expected_version: version, receivable_account_id: control },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: "SUBLEDGER_CONFLICT" });
    }
  });

  it("excludes control-policy adoption while a validated posting is still committing", async () => {
    const nominal = randomUUID();
    await fixture.pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$1,'Synthetic concurrent nominal','asset',false,'active',clock_timestamp())",
      [nominal, fixture.tenant, fixture.company],
    );
    const posting = await fixture.pool.connect();
    const policy = await fixture.pool.connect();
    try {
      await posting.query("begin");
      await posting.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.target',true)",
        [fixture.tenant],
      );
      await rawJournal(posting, nominal);
      await posting.query("set constraints all immediate");
      await policy.query("begin");
      const result = await policy.query<{ acquired: boolean }>(
        "select pg_try_advisory_xact_lock(hashtextextended($1,0)) as acquired",
        [`finance:control-policy:${fixture.tenant}:${fixture.company}`],
      );
      expect(result.rows[0]?.acquired).toBe(false);
      await policy.query("rollback");
      await posting.query("commit");
    } finally {
      await posting.query("rollback");
      await policy.query("rollback");
      posting.release();
      policy.release();
    }
    const { version, ...configured } = fixture.policy;
    await expect(
      fixture.repository.configure(
        subledgerActor(),
        { ...configured, expected_version: version, receivable_account_id: nominal },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "SUBLEDGER_CONFLICT" });
  });

  it("accepts company master IDs, rejects cross-company IDs, and preserves inactive dimensions on reversal", async () => {
    const permissions = ["master_data.project.manage", "master_data.project.read"];
    for (const permission of permissions) {
      await fixture.pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-maker',$2,'all') on conflict do nothing",
        [fixture.tenant, permission],
      );
      await fixture.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker',$2,'company',$3) on conflict do nothing",
        [fixture.tenant, permission, fixture.company],
      );
    }
    const actor = subledgerActor();
    actor.actor.permissions = [...actor.actor.permissions, ...permissions];
    const masters = new SourceReferenceMasterRepository(fixture.pool);
    const { record: project } = await masters.create(
      actor,
      "projects",
      { company_id: fixture.company, code: "INTEGRITY", name: "Synthetic integrity project" },
      randomUUID(),
      randomUUID(),
    );
    const input = command();
    input.lines = input.lines.map((line, i) => (i ? line : { ...line, dimensions: { project: project.id } }));
    const original = await post(input);
    const other = await setupSubledgerFixture(fixture.pool, undefined, "USD");
    await expect(
      post({
        ...command(),
        companyId: other.company,
        lines: [
          { ...input.lines[0]!, accountId: other.policy.expense_account_id },
          { ...input.lines[1]!, accountId: `${other.company}-bank-USD` },
        ],
      }),
    ).rejects.toMatchObject({ code: "FINANCE_DIMENSION_INVALID" });
    await masters.status(
      actor,
      "projects",
      project.id,
      {
        company_id: fixture.company,
        expected_version: project.version,
        status: "inactive",
      },
      randomUUID(),
      randomUUID(),
    );
    await expect(
      post({ ...input, sourceId: randomUUID(), externalIdempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: "FINANCE_DIMENSION_INVALID" });
    await transaction(async (client) =>
      finance.reverse(await createFinanceTransactionClient(client), {
        ...input,
        eventType: "bank_payment.reversed",
        originalEventType: input.eventType,
        originalAccountingEventId: original.accountingEventId,
        originalJournalId: original.journalId,
        externalIdempotencyKey: randomUUID(),
      }),
    );
  });

  async function postOperation(input: SubledgerRequest) {
    let operation = await fixture.repository.create(subledgerActor(), input, randomUUID());
    for (const [actor, action] of [
      ["r06.maker", "submit"],
      ["r06.checker", "approve"],
      ["r06.target", "post"],
    ] as const) {
      operation = await fixture.repository.action(
        subledgerActor(actor),
        operation.id,
        {
          company_id: fixture.company,
          expected_version: operation.version,
          action,
          reason: "Independent synthetic integrity check",
        },
        randomUUID(),
      );
    }
    return operation;
  }
  it("commits matching GL and open items and reverses both through the existing lifecycle", async () => {
    const party = await fixture.repository.createParty(
      subledgerActor(),
      {
        company_id: fixture.company,
        kind: "customer",
        name: "Synthetic integrity customer",
        default_currency: "USD",
      },
      randomUUID(),
    );
    if (party.kind === "customer") await configureCustomerCreditFixture(fixture, party.id);
    const invoice = await postOperation({
      company_id: fixture.company,
      type: "recognition",
      side: "receivable",
      party_id: party.id,
      kind: "invoice",
      currency: "USD",
      amount: "25",
      date: "2026-10-21",
      due_date: "2026-10-21",
      monetary: true,
      reference: "Integrity invoice",
      reason: "Synthetic reviewed source",
    });
    await postOperation({
      company_id: fixture.company,
      type: "reversal",
      operation_id: invoice.id,
      date: "2026-10-22",
      reference: "Integrity reversal",
      reason: "Synthetic reviewed reversal",
    });
    const totals = (
      await fixture.pool.query(
        `select
      (select coalesce(sum(l.base_debit-l.base_credit),0)::text from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed') and l.account_id=$3) as ledger,
      (select coalesce(sum(e.base_delta),0)::text from finance_subledger_item_event e join finance_subledger_item i on i.tenant_id=e.tenant_id and i.company_id=e.company_id and i.id=e.item_id where i.tenant_id=$1 and i.company_id=$2 and i.party_id=$4) as items`,
        [fixture.tenant, fixture.company, fixture.policy.receivable_account_id, party.id],
      )
    ).rows[0];
    expect(Number(totals.ledger)).toBe(0);
    expect(Number(totals.items)).toBe(0);
  });

  it("rejects closing-period and wrong-company account posting before financial effects", async () => {
    const input = command();
    input.lines = input.lines.map((line, i) => (i ? line : { ...line, accountId: "foreign-company-account" }));
    await expect(post(input)).rejects.toMatchObject({ code: "FINANCE_ACCOUNT_INVALID" });
    await fixture.pool.query(
      "update financial_period set status='soft_close',row_version=row_version+1 where tenant_id=$1 and id=$2",
      [fixture.tenant, `period-${fixture.company}-11`],
    );
    await expect(post({ ...command(), postingDate: "2026-11-20" })).rejects.toMatchObject({
      code: "FINANCE_PERIOD_CLOSED_POST_BLOCKED",
    });
  });

  it("applies the migration chain idempotently without rewriting posted history", async () => {
    const snapshot = async () =>
      (
        await fixture.pool.query(`select
      (select md5(coalesce(jsonb_agg(to_jsonb(j) order by id)::text,'')) from journal_entry j) as journals,
      (select md5(coalesce(jsonb_agg(to_jsonb(l) order by id)::text,'')) from journal_line l) as lines,
      (select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'')) from accounting_event e) as events`)
      ).rows[0];
    const before = await snapshot();
    expect(await migrateSourceSchema(fixture.pool)).toEqual([]);
    expect(await snapshot()).toEqual(before);
    expect(
      (await fixture.pool.query("select name from nexora_schema_migration where module_name='finance' and version=42"))
        .rows[0].name,
    ).toBe("accounting_integrity_guards");
  });
});
