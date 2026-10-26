import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const sourceTestCompanyId = `bn-company-${suffix}`;
const categoryId = `bn-category-${suffix}`;
const sectionId = `bn-section-${suffix}`;

run("Finance Bank Nominal PostgreSQL authority", () => {
  let pool: DatabasePool;
  let preflightSql: string;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    const migration = await readFile(
      new URL("../../packages/db/source-migrations/finance/0009_bank_nominal_master_data.forward.sql", import.meta.url),
      "utf8",
    );
    preflightSql = migration.slice(0, migration.indexOf("ALTER TABLE account"));
    expect(preflightSql).toContain("DO $$");
    await ensureSourceAuthorizationFixture(pool);
    await pool.query(
      `insert into organization_unit (tenant_id,id,type,code,name,status)
       values ($1,$2,'company',$2,'Synthetic Bank Nominal Company','active')`,
      [sourceTestTenantId, sourceTestCompanyId],
    );
    await pool.query(
      `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,
                            manual_posting_allowed,created_at)
       values ($1,$2,$3,$5,'Synthetic Current Assets','asset',null,true,'active',false,now()),
              ($1,$2,$4,$6,'Synthetic Cash & Bank','asset',$3,true,'active',false,now())`,
      [sourceTestTenantId, sourceTestCompanyId, categoryId, sectionId, `CA-${suffix}`, `CB-${suffix}`],
    );
    await pool.query(
      `insert into finance_nominal_section_policy
       (tenant_id,company_id,category_id,section_id,section_role,prefix,code_width,first_value,last_value,next_value)
       values ($1,$2,$3,$4,'cash_and_bank',$5,4,1,9999,1)`,
      [sourceTestTenantId, sourceTestCompanyId, categoryId, sectionId, `BN-${suffix}-`],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("stops the real migration preflight on legacy cross-company parents without repairing records", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      // Reproduce the pre-0009 constraint set only inside this rolled-back,
      // disposable-database transaction; persistent schema is never weakened.
      await client.query("alter table account drop constraint account_company_parent_fk");
      await client.query(
        `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,created_at)
         values ($1,'nexora-r06-uat-company',$2,$2,'Invalid legacy parent','asset',$3,false,'inactive',now())`,
        [sourceTestTenantId, `bad-legacy-parent-${suffix}`, sectionId],
      );
      await expect(client.query(preflightSql)).rejects.toThrow("cross-company account parents require review");
    } finally {
      await client.query("rollback");
      client.release();
    }
    expect(
      (
        await pool.query("select id from account where tenant_id=$1 and id=$2", [
          sourceTestTenantId,
          `bad-legacy-parent-${suffix}`,
        ])
      ).rows,
    ).toEqual([]);
  });

  it("stops the real migration preflight on missing legacy currencies without inventing Currency Master records", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("alter table bank_account drop constraint bank_account_currency_master_fk");
      const missing = await client.query<{ code: string }>(
        `select chr(65+a)||chr(65+b)||chr(65+c) as code
         from generate_series(0,25) a,generate_series(0,25) b,generate_series(0,25) c
         where not exists (select 1 from currency where tenant_id=$1 and code=chr(65+a)||chr(65+b)||chr(65+c))
         limit 1`,
        [sourceTestTenantId],
      );
      expect(missing.rows).toHaveLength(1);
      await client.query(
        `insert into bank_account (tenant_id,company_id,id,account_id,reference,account_name,account_type,
          bank_name,currency,status,created_at)
         values ($1,$2,$3,$4,$3,'Invalid legacy currency','current','Synthetic Legacy Bank',$5,'review_required',now())`,
        [sourceTestTenantId, sourceTestCompanyId, `bad-legacy-currency-${suffix}`, categoryId, missing.rows[0]!.code],
      );
      await expect(client.query(preflightSql)).rejects.toThrow("legacy bank currencies require Currency Master review");
    } finally {
      await client.query("rollback");
      client.release();
    }
    expect(
      (
        await pool.query("select id from bank_account where tenant_id=$1 and id=$2", [
          sourceTestTenantId,
          `bad-legacy-currency-${suffix}`,
        ])
      ).rows,
    ).toEqual([]);
  });

  it("allocates distinct codes under concurrency and rolls back uncommitted allocation", async () => {
    const allocate = async () => {
      const result = await pool.query<{ code: string }>("select allocate_finance_nominal_code($1,$2,$3) as code", [
        sourceTestTenantId,
        sourceTestCompanyId,
        sectionId,
      ]);
      return result.rows[0]!.code;
    };
    const codes = await Promise.all(Array.from({ length: 8 }, allocate));
    expect(new Set(codes).size).toBe(8);
    expect(codes.sort()).toEqual(Array.from({ length: 8 }, (_, i) => `BN-${suffix}-${String(i + 1).padStart(4, "0")}`));
    const client = await pool.connect();
    try {
      await client.query("begin");
      const first = await client.query<{ code: string }>("select allocate_finance_nominal_code($1,$2,$3) as code", [
        sourceTestTenantId,
        sourceTestCompanyId,
        sectionId,
      ]);
      await client.query("rollback");
      expect(await allocate()).toBe(first.rows[0]!.code);
    } finally {
      client.release();
    }
  });

  it("rejects absent policy and a collision without advancing the allocation", async () => {
    await expect(
      pool.query("select allocate_finance_nominal_code($1,$2,'missing')", [sourceTestTenantId, sourceTestCompanyId]),
    ).rejects.toMatchObject({ code: "23514" });
    const client = await pool.connect();
    try {
      await client.query("begin");
      const policy = await client.query<{ next_value: string }>(
        "select next_value from finance_nominal_section_policy where tenant_id=$1 and company_id=$2 and section_id=$3 for update",
        [sourceTestTenantId, sourceTestCompanyId, sectionId],
      );
      const collision = `BN-${suffix}-${policy.rows[0]!.next_value.padStart(4, "0")}`;
      await client.query(
        `insert into account (tenant_id,company_id,id,code,name,type,is_header,status,created_at)
         values ($1,$2,$3,$4,'Existing nominal','asset',false,'inactive',now())`,
        [sourceTestTenantId, sourceTestCompanyId, `collision-${suffix}`, collision],
      );
      await client.query("savepoint collision");
      await expect(
        client.query("select allocate_finance_nominal_code($1,$2,$3)", [
          sourceTestTenantId,
          sourceTestCompanyId,
          sectionId,
        ]),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("rollback to savepoint collision");
      const unchanged = await client.query<{ next_value: string }>(
        "select next_value from finance_nominal_section_policy where tenant_id=$1 and company_id=$2 and section_id=$3",
        [sourceTestTenantId, sourceTestCompanyId, sectionId],
      );
      expect(unchanged.rows).toEqual(policy.rows);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("fails closed on exhaustion and does not permit decrementing counters", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update finance_nominal_section_policy set next_value=last_value+1,row_version=row_version+1,
          updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and section_id=$3`,
        [sourceTestTenantId, sourceTestCompanyId, sectionId],
      );
      await client.query("savepoint exhausted");
      await expect(
        client.query("select allocate_finance_nominal_code($1,$2,$3)", [
          sourceTestTenantId,
          sourceTestCompanyId,
          sectionId,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint exhausted");
      await expect(
        client.query(
          `update finance_nominal_section_policy set next_value=1,row_version=row_version+1,updated_at=clock_timestamp()
         where tenant_id=$1 and company_id=$2 and section_id=$3`,
          [sourceTestTenantId, sourceTestCompanyId, sectionId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("keeps an account, capability and allocated code atomic when the final consistency guard fails", async () => {
    const client = await pool.connect();
    const nominalId = `orphan-${suffix}`;
    try {
      await client.query("begin");
      const allocated = await client.query<{ code: string }>("select allocate_finance_nominal_code($1,$2,$3) as code", [
        sourceTestTenantId,
        sourceTestCompanyId,
        sectionId,
      ]);
      await client.query(
        `insert into account (tenant_id,company_id,id,code,name,type,parent_id,is_header,status,
          manual_posting_allowed,reconciliation_required,managed_bank_nominal,created_at)
         values ($1,$2,$3,$4,'Orphan must rollback','asset',$5,false,'inactive',true,true,true,now())`,
        [sourceTestTenantId, sourceTestCompanyId, nominalId, allocated.rows[0]!.code, sectionId],
      );
      await expect(client.query("commit")).rejects.toMatchObject({ code: "23514" });
      const state = await pool.query("select id from account where tenant_id=$1 and id=$2", [
        sourceTestTenantId,
        nominalId,
      ]);
      expect(state.rows).toEqual([]);
      const next = await pool.query<{ code: string }>("select allocate_finance_nominal_code($1,$2,$3) as code", [
        sourceTestTenantId,
        sourceTestCompanyId,
        sectionId,
      ]);
      expect(next.rows[0]!.code).toBe(allocated.rows[0]!.code);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
