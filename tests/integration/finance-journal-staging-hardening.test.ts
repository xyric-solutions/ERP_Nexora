import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { SourceFinanceJournalRepository } from "../../server/api/src/modules/finance/journals/source-repository.js";
import { SourceFinanceNominalRepository } from "../../server/api/src/modules/finance/nominals/source-repository.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceSuperAdministratorFixture,
  sourceTestCompanyId,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("Finance Journal staging hardening", () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceSuperAdministratorFixture(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("treats a material editor and submitter as a preparer for approval separation", async () => {
    const client = await pool.connect();
    const suffix = randomUUID();
    const journalId = `journal-sod-${suffix}`;
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query("select set_config('nexora.user_id','r06.checker',true)");
      await client.query(
        `insert into security_role_permission_grant
          (tenant_id,role_policy_id,permission_key,field_allow_mode)
         values($1,'r06-uat-policy-checker','finance.journal.approve','all')
         on conflict do nothing`,
        [sourceTestTenantId],
      );
      await client.query(
        `insert into security_role_scope_grant
          (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
         values($1,'r06-uat-policy-checker','finance.journal.approve','company',$2)
         on conflict do nothing`,
        [sourceTestTenantId, sourceTestCompanyId],
      );
      await client.query(
        `insert into manual_journal
          (tenant_id,company_id,id,draft_number,journal_date,base_currency,
           base_decimal_places,maker_user_id)
         values($1,$2,$3,$4,date '2026-10-29','USD',2,'r06.maker')`,
        [sourceTestTenantId, sourceTestCompanyId, journalId, `MJ-SOD-${suffix}`],
      );
      await client.query(
        `insert into manual_journal_event
          (tenant_id,company_id,id,journal_id,event_type,to_state,resulting_version,
           actor_id,permission_key,correlation_id,idempotency_key,request_sha256)
         values($1,$2,$3,$4,'created','draft',1,'r06.maker','finance.journal.create',$5,$6,$7)`,
        [
          sourceTestTenantId,
          sourceTestCompanyId,
          `event-created-${suffix}`,
          journalId,
          `correlation-created-${suffix}`,
          `created-${suffix}`,
          "a".repeat(64),
        ],
      );
      await client.query(
        `update manual_journal
            set reference_number='Edited by checker',row_version=2,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, journalId],
      );
      await client.query(
        `insert into manual_journal_event
          (tenant_id,company_id,id,journal_id,event_type,from_state,to_state,resulting_version,
           actor_id,permission_key,correlation_id,idempotency_key,request_sha256)
         values($1,$2,$3,$4,'updated','draft','draft',2,'r06.checker',
                'finance.journal.update',$5,$6,$7)`,
        [
          sourceTestTenantId,
          sourceTestCompanyId,
          `event-updated-${suffix}`,
          journalId,
          `correlation-updated-${suffix}`,
          `updated-${suffix}`,
          "b".repeat(64),
        ],
      );
      await client.query(
        `update manual_journal
            set state='submitted',submitted_by='r06.checker',submitted_at=clock_timestamp(),
                row_version=3,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, journalId],
      );
      await client.query(
        `insert into manual_journal_event
          (tenant_id,company_id,id,journal_id,event_type,from_state,to_state,resulting_version,
           actor_id,permission_key,correlation_id,idempotency_key,request_sha256)
         values($1,$2,$3,$4,'submitted','draft','submitted',3,'r06.checker',
                'finance.journal.submit',$5,$6,$7)`,
        [
          sourceTestTenantId,
          sourceTestCompanyId,
          `event-submitted-${suffix}`,
          journalId,
          `correlation-submitted-${suffix}`,
          `submitted-${suffix}`,
          "c".repeat(64),
        ],
      );

      const preparers = await client.query<{ actor_id: string }>(
        `select actor_id from manual_journal_preparer
          where tenant_id=$1 and journal_id=$2 order by actor_id`,
        [sourceTestTenantId, journalId],
      );
      expect(preparers.rows).toEqual([{ actor_id: "r06.checker" }, { actor_id: "r06.maker" }]);

      await client.query("savepoint rejected_preparer_approval");
      await expect(
        client.query(
          `update manual_journal
              set state='posted',approved_by='r06.checker',approved_at=clock_timestamp(),
                  posted_by='r06.checker',posted_at=clock_timestamp(),
                  accounting_event_id=$3,journal_entry_id=$4,row_version=4,
                  updated_at=clock_timestamp()
            where tenant_id=$1 and id=$2`,
          [sourceTestTenantId, journalId, `missing-event-${suffix}`, `missing-entry-${suffix}`],
        ),
      ).rejects.toThrow("preparer approval requires explicit authority");
      await client.query("rollback to savepoint rejected_preparer_approval");
      await client.query("release savepoint rejected_preparer_approval");

      const state = await client.query<{ state: string; row_version: string }>(
        "select state,row_version::text from manual_journal where tenant_id=$1 and id=$2",
        [sourceTestTenantId, journalId],
      );
      expect(state.rows[0]).toEqual({ state: "submitted", row_version: "3" });
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("runs the governed lifecycle, replays mutations, protects posted records and enforces company scope", async () => {
    const suffix = randomUUID().slice(0, 8);
    const companyId = `journal-company-${suffix}`;
    const categoryId = `journal-category-${suffix}`;
    const sectionId = `journal-section-${suffix}`;
    const calendarId = `journal-calendar-${suffix}`;
    const periodId = `journal-period-${suffix}`;
    const nominalPermissions = [
      "finance.nominal.read",
      "finance.nominal.create",
      "finance.nominal.update",
      "finance.nominal.submit",
      "finance.nominal.approve",
      "finance.nominal.status",
    ];
    const makerPermissions = [
      "finance.journal.read",
      "finance.journal.create",
      "finance.journal.update",
      "finance.journal.submit",
      "finance.journal.delete_draft",
      "finance.journal.reverse",
      "platform.approval.override",
      ...nominalPermissions,
    ];
    const checkerPermissions = ["finance.journal.read", "finance.journal.approve", "finance.journal.reject"];
    const account = (userId: string, permissions: string[], roles: string[]): AuthenticatedAccount => ({
      tenantId: sourceTestTenantId,
      organizationName: "Nexora Journal Integration",
      userId,
      email: `${userId}@uat.nexora.invalid`,
      displayName: userId,
      roles,
      permissions,
      sessionVersion: 1,
    });
    const maker = {
      tenantId: sourceTestTenantId,
      actor: account("r06.override-admin", makerPermissions, ["super_administrator"]),
    };
    const checker = {
      tenantId: sourceTestTenantId,
      actor: account("r06.checker", checkerPermissions, ["r06_uat_checker"]),
    };
    const restricted = {
      tenantId: sourceTestTenantId,
      actor: account("r06.restricted", ["finance.journal.read"], ["r06_uat_restricted"]),
    };

    await pool.query(
      `insert into organization_unit(tenant_id,id,type,code,name,status)
       values($1,$2,'company',$2,'Journal Integration Company','active')`,
      [sourceTestTenantId, companyId],
    );
    await ensureCompanyCurrencyFixture(pool, companyId, "USD", []);
    await pool.query(
      `insert into account
        (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at)
       values
        ($1,$2,$3,$3,'Journal expense category','expense',null,true,'active',false,now()),
        ($1,$2,$4,$4,'Journal expense section','expense',$3,true,'active',false,now())`,
      [sourceTestTenantId, companyId, categoryId, sectionId],
    );
    await pool.query(
      `insert into finance_general_nominal_policy
        (tenant_id,company_id,category_id,section_id,prefix,code_width,next_value,last_value)
       values($1,$2,$3,$4,$5,4,1,9999)`,
      [sourceTestTenantId, companyId, categoryId, sectionId, `JE-${suffix}-`],
    );
    for (const [userId, policyId, permissions] of [
      ["r06.override-admin", "r06-uat-policy-approval-override", makerPermissions],
      ["r06.checker", "r06-uat-policy-checker", checkerPermissions],
    ] as const) {
      await pool.query(
        `insert into security_user_company_access
          (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
         values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','journal-integration')`,
        [sourceTestTenantId, `journal-access-${userId}-${suffix}`, userId, companyId],
      );
      await pool.query(
        `insert into security_role_permission_grant
          (tenant_id,role_policy_id,permission_key,field_allow_mode)
         select $1,$2,permission,'all' from unnest($3::text[]) permission
         on conflict do nothing`,
        [sourceTestTenantId, policyId, permissions],
      );
      await pool.query(
        `insert into security_role_scope_grant
          (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
         select $1,$2,permission,'company',$4 from unnest($3::text[]) permission
         on conflict do nothing`,
        [sourceTestTenantId, policyId, permissions, companyId],
      );
    }
    await pool.query(
      `insert into fiscal_calendar
        (id,tenant_id,company_id,year,period_start,period_end,status)
       values($1,$2,$3,2026,date '2026-01-01',date '2026-12-31','active')`,
      [calendarId, sourceTestTenantId, companyId],
    );
    await pool.query(
      `insert into financial_period
        (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
       values($1,$2,$3,$4,10,date '2026-10-01',date '2026-10-31','open',now())`,
      [periodId, sourceTestTenantId, companyId, calendarId],
    );

    const nominalRepository = new SourceFinanceNominalRepository(pool);
    const debitNominal = await nominalRepository.create(
      maker,
      {
        nominal_kind: "general",
        company_id: companyId,
        category_id: categoryId,
        section_id: sectionId,
        name: `Journal debit ${suffix}`,
        currency: "USD",
      },
      `nominal-debit-${suffix}`,
      `correlation-nominal-debit-${suffix}`,
    );
    const creditNominal = await nominalRepository.create(
      maker,
      {
        nominal_kind: "general",
        company_id: companyId,
        category_id: categoryId,
        section_id: sectionId,
        name: `Journal credit ${suffix}`,
        currency: "USD",
      },
      `nominal-credit-${suffix}`,
      `correlation-nominal-credit-${suffix}`,
    );
    const journalRepository = new SourceFinanceJournalRepository(pool);
    const journalOptions = await journalRepository.options(maker, companyId);
    expect(journalOptions.nominals.find((nominal) => nominal.id === debitNominal.id)?.required_dimensions).toEqual([]);
    const createInput = {
      company_id: companyId,
      journal_date: "2026-10-29",
      reference_number: `Lifecycle ${suffix}`,
      lines: [
        { account_id: debitNominal.id, description: "Lifecycle debit", debit: "25.00", credit: "0", dimensions: {} },
        { account_id: creditNominal.id, description: "Lifecycle credit", debit: "0", credit: "25.00", dimensions: {} },
      ],
    };
    const createKey = `journal-create-${suffix}`;
    const created = await journalRepository.create(maker, createInput, createKey, `correlation-create-${suffix}`);
    expect(created).toMatchObject({ state: "draft", version: 1, replayed: false });
    await expect(journalRepository.list(maker, { company_id: companyId, limit: 25 })).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: created.id, state: "draft" })]),
    });
    await expect(
      journalRepository.create(maker, createInput, createKey, `correlation-create-replay-${suffix}`),
    ).resolves.toMatchObject({ id: created.id, state: "draft", version: 1, replayed: true });

    const updated = await journalRepository.update(
      maker,
      created.id,
      { ...createInput, expected_version: 1, reference_number: `Updated lifecycle ${suffix}` },
      `journal-update-${suffix}`,
      `correlation-update-${suffix}`,
    );
    expect(updated).toMatchObject({ state: "draft", version: 2 });
    const submitted = await journalRepository.submit(
      maker,
      created.id,
      { expected_version: 2 },
      `journal-submit-${suffix}`,
      `correlation-submit-${suffix}`,
    );
    expect(submitted).toMatchObject({ state: "submitted", version: 3 });
    const decisionKey = `journal-decision-${suffix}`;
    const posted = await journalRepository.decide(
      checker,
      created.id,
      { expected_version: 3, action: "post", confirmed: true, approval_note: "Independent approval" },
      decisionKey,
      `correlation-decision-${suffix}`,
    );
    expect(posted).toMatchObject({ state: "posted", version: 4, replayed: false });
    await expect(
      journalRepository.decide(
        checker,
        created.id,
        { expected_version: 3, action: "post", confirmed: true, approval_note: "Independent approval" },
        decisionKey,
        `correlation-decision-replay-${suffix}`,
      ),
    ).resolves.toMatchObject({ id: created.id, state: "posted", version: 4, replayed: true });
    await expect(
      journalRepository.deleteDraft(
        maker,
        created.id,
        { expected_version: 4, reason: "Posted records must remain immutable" },
        `journal-delete-posted-${suffix}`,
        `correlation-delete-posted-${suffix}`,
      ),
    ).rejects.toMatchObject({ code: "JOURNAL_DELETE_FORBIDDEN" });
    await expect(journalRepository.list(restricted, { company_id: companyId, limit: 25 })).rejects.toMatchObject({
      status: 403,
      code: "COMPANY_PERMISSION_DENIED",
    });

    const deletable = await journalRepository.create(
      maker,
      { ...createInput, reference_number: `Delete lifecycle ${suffix}` },
      `journal-create-delete-${suffix}`,
      `correlation-create-delete-${suffix}`,
    );
    const deleteKey = `journal-delete-${suffix}`;
    await expect(
      journalRepository.deleteDraft(
        maker,
        deletable.id,
        { expected_version: 1, reason: "Duplicate test draft" },
        deleteKey,
        `correlation-delete-${suffix}`,
      ),
    ).resolves.toMatchObject({ id: deletable.id, deleted: true, replayed: false });
    await expect(
      journalRepository.deleteDraft(
        maker,
        deletable.id,
        { expected_version: 1, reason: "Duplicate test draft" },
        deleteKey,
        `correlation-delete-replay-${suffix}`,
      ),
    ).resolves.toMatchObject({ id: deletable.id, deleted: true, replayed: true });
  });
});
