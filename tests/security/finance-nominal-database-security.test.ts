import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "../integration/source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const companyId = `bn-security-company-${suffix}`;
const categoryId = `bn-security-category-${suffix}`;
const sectionId = `bn-security-section-${suffix}`;

run("Finance Bank Nominal database security", () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    await pool.query(
      `insert into organization_unit (tenant_id,id,type,code,name,status)
       values ($1,$2,'company',$2,'Synthetic Nominal Security Company','active')`,
      [sourceTestTenantId, companyId],
    );
    await pool.query(
      `insert into currency (tenant_id,code,name,decimal_places,is_base,status)
       values ($1,'XBN','Synthetic Nominal Currency',2,false,'active') on conflict do nothing`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at)
       values ($1,$2,$3,$3,'Current Assets','asset',null,true,'active',false,now()),
              ($1,$2,$4,$4,'Cash & Bank','asset',$3,true,'active',false,now())`,
      [sourceTestTenantId, companyId, categoryId, sectionId],
    );
    await pool.query(
      `insert into finance_nominal_section_policy
       (tenant_id,company_id,category_id,section_id,section_role,prefix,code_width,first_value,last_value,next_value)
       values ($1,$2,$3,$4,'cash_and_bank',$5,4,1,9999,1)`,
      [sourceTestTenantId, companyId, categoryId, sectionId, `BS-${suffix}-`],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function transaction(work: (client: PoolClient) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await work(client);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }

  async function draft(client: PoolClient, key = randomUUID(), parentId = sectionId) {
    const id = `nominal-${key}`;
    const bankId = `capability-${key}`;
    const result = await client.query<{ code: string }>("select allocate_finance_nominal_code($1,$2,$3) as code", [
      sourceTestTenantId,
      companyId,
      sectionId,
    ]);
    await client.query(
      `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,
       manual_posting_allowed,reconciliation_required,managed_bank_nominal,created_at)
       values ($1,$2,$3,$4,$3,'asset',$5,false,'inactive',true,true,true,now())`,
      [sourceTestTenantId, companyId, id, result.rows[0]!.code, parentId],
    );
    await client.query(
      `insert into bank_account (tenant_id,company_id,id,account_id,reference,account_name,account_type,
       bank_name,branch,swift_bic,currency,status,identity_mode,created_by,created_at)
       values ($1,$2,$3,$4,$3,$4,'current',null,null,null,'XBN','draft','nominal_only','r06.maker',now())`,
      [sourceTestTenantId, companyId, bankId, id],
    );
    return { id, bankId, code: result.rows[0]!.code };
  }

  async function submit(client: PoolClient, bankId: string) {
    await client.query(
      `update bank_account set status='pending_approval',row_version=row_version+1,
       updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond'),
       submitted_by='r06.maker',submitted_at=clock_timestamp(),submission_reason='Ready for review'
       where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, bankId],
    );
  }

  async function approve(client: PoolClient, bankId: string) {
    await client.query(
      `update bank_account set status='active',row_version=row_version+1,
       updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond'),
       approved_by='r06.checker',approved_at=clock_timestamp(),decision_reason='Independently verified'
       where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, bankId],
    );
  }

  it("forces RLS on new authorities and adds only explicit Nominal permissions", async () => {
    const result = await pool.query(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
       where relname in ('finance_nominal_section_policy','finance_nominal_event') order by relname`,
    );
    expect(result.rows).toEqual([
      { relname: "finance_nominal_event", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "finance_nominal_section_policy", relrowsecurity: true, relforcerowsecurity: true },
    ]);
    const permissions = await pool.query<{ permission_key: string }>(
      "select permission_key from security_permission_definition where permission_key like 'finance.nominal.%' order by permission_key",
    );
    expect(permissions.rows.map((row) => row.permission_key)).toEqual([
      "finance.nominal.approve",
      "finance.nominal.create",
      "finance.nominal.read",
      "finance.nominal.status",
      "finance.nominal.submit",
      "finance.nominal.update",
    ]);
  });

  it("persists minimal identity without bank identifiers and protects its one-to-one mapping", async () =>
    transaction(async (client) => {
      const { id, bankId } = await draft(client);
      await client.query("set constraints all immediate");
      const result = await client.query(
        `select identity_mode,bank_name,branch,swift_bic,account_number_masked,account_number_ciphertext,iban_hash
       from bank_account where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, bankId],
      );
      expect(result.rows).toEqual([
        {
          identity_mode: "nominal_only",
          bank_name: null,
          branch: null,
          swift_bic: null,
          account_number_masked: null,
          account_number_ciphertext: null,
          iban_hash: null,
        },
      ]);
      await client.query("savepoint duplicate");
      await expect(
        client.query(
          `insert into bank_account (tenant_id,company_id,id,account_id,reference,account_name,account_type,
       bank_name,branch,swift_bic,currency,status,identity_mode,created_by,created_at)
       values ($1,$2,$3,$4,$3,$4,'current',null,null,null,'XBN','draft','nominal_only','r06.maker',now())`,
          [sourceTestTenantId, companyId, `duplicate-${suffix}`, id],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    }));

  it("rejects fake bank details, identity-mode conversion, remapping and Finance name divergence", async () =>
    transaction(async (client) => {
      const { id, bankId } = await draft(client);
      await client.query("set constraints all immediate");
      for (const change of ["bank_name='Fake Bank'", "identity_mode='legacy_detailed'", "account_id='missing'"]) {
        await client.query("savepoint invalid_bank");
        await expect(
          client.query(
            `update bank_account set ${change},row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
            [sourceTestTenantId, bankId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
        await client.query("rollback to savepoint invalid_bank");
      }
      await expect(
        client.query("update account set name='Diverged name' where tenant_id=$1 and id=$2", [sourceTestTenantId, id]),
      ).rejects.toMatchObject({ code: "23514" });
    }));

  it("requires atomic activation and rejects ordinary maker self-approval", async () =>
    transaction(async (client) => {
      const { id, bankId } = await draft(client);
      await submit(client, bankId);
      await client.query("savepoint self_decision");
      await expect(
        client.query(
          `update bank_account set status='active',approved_by='r06.maker',approved_at=clock_timestamp(),decision_reason='Self decision',
       row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
          [sourceTestTenantId, bankId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint self_decision");
      await approve(client, bankId);
      await client.query("savepoint partial_activation");
      await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint partial_activation");
      await client.query("update account set status='active' where tenant_id=$1 and id=$2", [sourceTestTenantId, id]);
      await client.query("set constraints all immediate");
      const result = await client.query(
        `select bank.status as banking,nominal.status as finance from bank_account bank
       join account nominal on nominal.tenant_id=bank.tenant_id and nominal.id=bank.account_id
       where bank.tenant_id=$1 and bank.id=$2`,
        [sourceTestTenantId, bankId],
      );
      expect(result.rows).toEqual([{ banking: "active", finance: "active" }]);
    }));

  it("protects active Currency, hierarchy, code and business facts at PostgreSQL", async () =>
    transaction(async (client) => {
      const { id, bankId } = await draft(client);
      await submit(client, bankId);
      await approve(client, bankId);
      await client.query("update account set status='active' where tenant_id=$1 and id=$2", [sourceTestTenantId, id]);
      await client.query("set constraints all immediate");
      const attempts: Array<[string, string[], string]> = [
        ["update currency set status='inactive' where tenant_id=$1 and code='XBN'", [sourceTestTenantId], "23514"],
        ["update account set code='different-code' where tenant_id=$1 and id=$2", [sourceTestTenantId, id], "P0001"],
        [
          "update account set description='Edited after submission' where tenant_id=$1 and id=$2",
          [sourceTestTenantId, id],
          "23514",
        ],
        ["update account set status='inactive' where tenant_id=$1 and id=$2", [sourceTestTenantId, sectionId], "23514"],
      ];
      for (const [query, parameters, code] of attempts) {
        await client.query("savepoint protected_fact");
        await expect(client.query(query, parameters)).rejects.toMatchObject({ code });
        await client.query("rollback to savepoint protected_fact");
      }
    }));

  it("requires same-company parents, configured section semantics and active currency for activation", async () =>
    transaction(async (client) => {
      await client.query("savepoint wrong_company");
      await expect(
        client.query(
          `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,created_at)
       values ($1,'nexora-r06-uat-company',$2,$2,'Wrong company','asset',$3,false,'inactive',now())`,
          [sourceTestTenantId, `wrong-company-${suffix}`, sectionId],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await client.query("rollback to savepoint wrong_company");
      const { id, bankId } = await draft(client);
      await client.query(
        `update currency set status='inactive',row_version=row_version+1,updated_at=clock_timestamp()
          where tenant_id=$1 and code='XBN'`,
        [sourceTestTenantId],
      );
      await submit(client, bankId);
      await approve(client, bankId);
      await client.query("update account set status='active' where tenant_id=$1 and id=$2", [sourceTestTenantId, id]);
      await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
    }));

  it("requires atomic deactivation and preserves historical identity", async () =>
    transaction(async (client) => {
      const { id, bankId, code } = await draft(client);
      await submit(client, bankId);
      await approve(client, bankId);
      await client.query("update account set status='active' where tenant_id=$1 and id=$2", [sourceTestTenantId, id]);
      await client.query("set constraints all immediate");
      await client.query("set constraints all deferred");
      await client.query(
        `update bank_account set status='inactive',deactivated_by='r06.maker',deactivated_at=clock_timestamp(),
       row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, bankId],
      );
      await client.query("savepoint partial_deactivation");
      await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint partial_deactivation");
      await client.query("update account set status='inactive' where tenant_id=$1 and id=$2", [sourceTestTenantId, id]);
      await client.query("set constraints all immediate");
      expect(
        (
          await client.query("select id,code,status from account where tenant_id=$1 and id=$2", [
            sourceTestTenantId,
            id,
          ])
        ).rows,
      ).toEqual([{ id, code, status: "inactive" }]);
      await expect(
        client.query("delete from account where tenant_id=$1 and id=$2", [sourceTestTenantId, id]),
      ).rejects.toMatchObject({ code: "23514" });
    }));

  it("rejects a bank nominal outside its governed Section and duplicate company section roles", async () =>
    transaction(async (client) => {
      await client.query("savepoint unconfigured");
      await draft(client, randomUUID(), categoryId);
      await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint unconfigured");
      const otherSection = `other-section-${suffix}`;
      await client.query(
        `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,created_at)
       values ($1,$2,$3,$3,'Other section','asset',$4,true,'active',now())`,
        [sourceTestTenantId, companyId, otherSection, categoryId],
      );
      await expect(
        client.query(
          `insert into finance_nominal_section_policy
       (tenant_id,company_id,category_id,section_id,section_role,prefix,code_width,first_value,last_value,next_value)
       values ($1,$2,$3,$4,'cash_and_bank','Other',2,1,99,1)`,
          [sourceTestTenantId, companyId, categoryId, otherSection],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    }));

  it("rejects duplicate managed names within a company Section", async () =>
    transaction(async (client) => {
      const { id } = await draft(client);
      await expect(
        client.query(
          `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,
         manual_posting_allowed,reconciliation_required,managed_bank_nominal,created_at)
       values ($1,$2,$3,$3,upper($4),'asset',$5,false,'inactive',true,true,true,now())`,
          [sourceTestTenantId, companyId, `duplicate-name-${suffix}`, id, sectionId],
        ),
      ).rejects.toMatchObject({ code: "23505" });
    }));

  it("binds immutable Finance evidence to the capability, actor and version", async () =>
    transaction(async (client) => {
      const { id, bankId } = await draft(client);
      const eventId = `event-${suffix}`;
      await client.query(
        `insert into finance_nominal_event (tenant_id,event_id,company_id,nominal_id,bank_account_id,event_type,resulting_version,actor_id)
       values ($1,$2,$3,$4,$5,'created',1,'r06.maker')`,
        [sourceTestTenantId, eventId, companyId, id, bankId],
      );
      await client.query("savepoint evidence");
      await expect(
        client.query("update finance_nominal_event set actor_id='r06.checker' where tenant_id=$1 and event_id=$2", [
          sourceTestTenantId,
          eventId,
        ]),
      ).rejects.toThrow("immutable");
      await client.query("rollback to savepoint evidence");
      await expect(
        client.query(
          `insert into finance_nominal_event (tenant_id,event_id,company_id,nominal_id,bank_account_id,event_type,resulting_version,actor_id)
       values ($1,$2,$3,$4,$5,'created',2,'r06.checker')`,
          [sourceTestTenantId, `invalid-event-${suffix}`, companyId, id, bankId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }));

  it("enforces tenant RLS for a real non-owner role and rejects cross-tenant writes", async () =>
    transaction(async (client) => {
      const { id, bankId } = await draft(client);
      await client.query(
        `insert into finance_nominal_event (tenant_id,event_id,company_id,nominal_id,bank_account_id,event_type,resulting_version,actor_id)
       values ($1,$2,$3,$4,$5,'created',1,'r06.maker')`,
        [sourceTestTenantId, `rls-event-${suffix}`, companyId, id, bankId],
      );
      const role = `bn_rls_${suffix}`;
      // The role and grants are transaction-local test setup, undone by rollback.
      await client.query(`create role ${role} nologin nosuperuser nobypassrls`);
      await client.query(`grant usage on schema public to ${role}`);
      await client.query(`grant select,insert on finance_nominal_section_policy,finance_nominal_event to ${role}`);
      await client.query(`grant select on account,bank_account,currency to ${role}`);
      await client.query(`set local role ${role}`);
      const own = await client.query("select section_id from finance_nominal_section_policy where company_id=$1", [
        companyId,
      ]);
      expect(own.rows).toEqual([{ section_id: sectionId }]);
      expect(
        (await client.query("select event_id from finance_nominal_event where company_id=$1", [companyId])).rows,
      ).toEqual([{ event_id: `rls-event-${suffix}` }]);
      await client.query("select set_config('nexora.tenant_id','outside-tenant',true)");
      expect(
        (await client.query("select section_id from finance_nominal_section_policy where company_id=$1", [companyId]))
          .rows,
      ).toEqual([]);
      expect((await client.query("select event_id from finance_nominal_event")).rows).toEqual([]);
      await expect(
        client.query(
          `insert into finance_nominal_section_policy
       (tenant_id,company_id,category_id,section_id,section_role,prefix,code_width,first_value,last_value,next_value)
       values ($1,$2,$3,$4,'cash_and_bank','X',2,1,99,1)`,
          [sourceTestTenantId, companyId, categoryId, sectionId],
        ),
      ).rejects.toThrow();
    }));
});
