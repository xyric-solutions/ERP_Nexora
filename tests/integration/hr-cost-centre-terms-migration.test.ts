import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { createDatabasePool } from "../../packages/db/src/pool.js";
import { inspectSourceMigrationState, migrateSourceModule } from "../../packages/db/src/source-migrations.js";

// HR149 upgrade proof: Employment Setup merges into Cost Centre. It fails closed on
// ambiguous data, then backfills cost-centre terms, requisitions and leave eligibility.
const bootstrapDatabaseUrl =
  process.env.TEST_SOURCE_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test";
const database = `hr149_upgrade_${randomUUID().replaceAll("-", "")}`;
let bootstrap: ReturnType<typeof createDatabasePool>;
let pool: ReturnType<typeof createDatabasePool>;

const T = "hr149-tenant";
const C = "hr149-company";
const actor = "hr149-actor";

async function q<R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await pool.query<R>(sql, params)).rows;
}

/** Fixture-only rows written without business triggers; the proof is about HR149's backfill. */
async function raw(sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(sql, params);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function employee(id: string, costCentre: string, setup: string) {
  await raw(
    `insert into employee (id,tenant_id,employee_number,first_name,last_name,joined_on,status,created_by)
     values ($1,$2,$3,'HR149',$1,'2026-01-01','active',$4)`,
    [id, T, id.toUpperCase(), actor],
  );
  await raw(
    `insert into employee_assignment (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_grade_id,
       cost_center_id,work_location_id,employment_setup_id,effective_from,change_reason,created_by,assignment_status,source_reference)
     values ($1,$2,$3,$4,$5,$6,'des','grd',$7,'loc',$8,'2026-01-01','initial_appointment',$9,'legacy_compatibility','hr149-proof')`,
    [`${id}-assignment`, T, id, C, `${C}-branch`, `${C}-dept`, costCentre, setup, actor],
  );
}

async function migrateHr() {
  await migrateSourceModule(pool, "hr");
}

describe("HR149 Employment Setup merge into Cost Centre", () => {
  beforeAll(async () => {
    expect(database).toMatch(/^hr149_upgrade_[a-f0-9]{32}$/);
    bootstrap = createDatabasePool(bootstrapDatabaseUrl);
    await bootstrap.query(`create database ${database}`);
    const url = new URL(bootstrapDatabaseUrl);
    url.pathname = `/${database}`;
    pool = createDatabasePool(url.toString());
    for (const moduleName of ["platform", "security", "workflow", "master_data", "finance"] as const) {
      await migrateSourceModule(pool, moduleName);
    }
    await migrateSourceModule(pool, "hr", { throughVersion: 148 });

    await q(
      `insert into tenant (id,name,plan,region,status,default_locale) values ($1,'HR149 tenant','enterprise','test','active','en')`,
      [T],
    );
    await raw(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values
         ($1,$2,null,'company','HR149-C','HR149 company','active'),
         ($3,$2,$1,'branch','HR149-B','HR149 branch','active'),
         ($4,$2,$3,'department','HR149-D','HR149 department','active')`,
      [C, T, `${C}-branch`, `${C}-dept`],
    );
    await raw(
      `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,status,created_by,payment_route,pay_cycle) values
         ('des',$1,$2,'designation','DSG-001','Analyst','active',$3,null,null),
         ('grd',$1,$2,'job_grade','GRD-001','Grade one','active',$3,null,null),
         ('loc',$1,$2,'work_location','LOC-001','Head office','active',$3,null,null),
         ('cc-used',$1,$2,'cost_center','CC-001','Client delivery','active',$3,null,null),
         ('cc-idle',$1,$2,'cost_center','CC-002','Head office','active',$3,null,null),
         ('es-pay',$1,$2,'employment_setup','ES-001','Monthly staff','active',$3,'payroll','monthly'),
         ('es-ap',$1,$2,'employment_setup','ES-002','Contract weekly','active',$3,'accounts_payable','weekly')`,
      [T, C, actor],
    );
    await employee("e1", "cc-used", "es-pay");
    await raw(
      `insert into hr_manpower_requisition (id,tenant_id,company_id,reference,job_title,designation_id,job_grade_id,employment_setup_id,
         department_id,positions_requested,position_type,salary_minimum,salary_maximum,currency_code,target_start_date,reason,created_by)
       values ('req-1',$1,$2,'MRQ-2026-000001','Data Analyst','des','grd','es-pay',$3,1,'new_position',1000,3000,'USD','2026-12-01','Growth',$4)`,
      [T, C, `${C}-dept`, actor],
    );
    await raw(
      `insert into hr_leave_type (id,tenant_id,company_id,code,name,paid,accrual_method,minimum_request_days,maximum_request_days,applicable_employment_setup_ids,created_by)
       values ('leave-staff',$1,$2,'LT-001','Annual leave',true,'annual_grant',1,10,$3,$4)`,
      [T, C, ["es-pay"], actor],
    );
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${database}`);
      await bootstrap.end();
    }
  });

  it("refuses to merge a cost centre whose current employees use different payment terms", async () => {
    await employee("e2", "cc-used", "es-ap");
    await expect(migrateHr()).rejects.toThrow(/CC-001 pay current employees through different payment routes/);
    await expect(inspectSourceMigrationState(pool)).resolves.toMatchObject({ hr: 148 });
    await raw("delete from employee_assignment where tenant_id=$1 and id='e2-assignment'", [T]);
  }, 120_000);

  it("refuses to widen a leave restriction that no cost centre matches", async () => {
    await raw(
      `insert into hr_leave_type (id,tenant_id,company_id,code,name,paid,accrual_method,minimum_request_days,maximum_request_days,applicable_employment_setup_ids,created_by)
       values ('leave-contract',$1,$2,'LT-002','Contract leave',true,'annual_grant',1,10,$3,$4)`,
      [T, C, ["es-ap"], actor],
    );
    await expect(migrateHr()).rejects.toThrow(/would widen a leave eligibility restriction/);
    await expect(inspectSourceMigrationState(pool)).resolves.toMatchObject({ hr: 148 });
    await raw("delete from hr_leave_type where tenant_id=$1 and id='leave-contract'", [T]);
  }, 120_000);

  it("moves payment terms onto cost centres and archives employment setups", async () => {
    await migrateHr();
    const state = await inspectSourceMigrationState(pool);
    expect(state.hr).toBeGreaterThanOrEqual(149);
    const centres = await q<{ id: string; payment_route: string; pay_cycle: string }>(
      "select id,payment_route,pay_cycle from hr_master_record where tenant_id=$1 and master_type='cost_center' order by id",
      [T],
    );
    expect(centres).toEqual([
      { id: "cc-idle", payment_route: "payroll", pay_cycle: "monthly" },
      { id: "cc-used", payment_route: "payroll", pay_cycle: "monthly" },
    ]);
    expect(
      await q("select id,status,deactivated_by from hr_master_record where tenant_id=$1 and master_type='employment_setup' order by id", [T]),
    ).toEqual([
      { id: "es-ap", status: "inactive", deactivated_by: "migration-0149" },
      { id: "es-pay", status: "inactive", deactivated_by: "migration-0149" },
    ]);
    // The requisition prefers the cost centre its setup was used with.
    expect(await q("select cost_center_id from hr_manpower_requisition where tenant_id=$1 and id='req-1'", [T])).toEqual([
      { cost_center_id: "cc-used" },
    ]);
    // Leave eligibility maps setups to cost centres with the same terms.
    expect(
      await q("select applicable_cost_center_ids from hr_leave_type where tenant_id=$1 and id='leave-staff'", [T]),
    ).toEqual([{ applicable_cost_center_ids: ["cc-idle", "cc-used"] }]);
  }, 180_000);

  it("blocks new or reactivated employment setups and cost centres without terms", async () => {
    await expect(
      q(
        `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,status,created_by,payment_route,pay_cycle)
         values ('es-new',$1,$2,'employment_setup','ES-003','New setup','active',$3,'payroll','monthly')`,
        [T, C, actor],
      ),
    ).rejects.toThrow(/employment setups are retired/);
    await expect(
      q("update hr_master_record set status='active',deactivated_by=null,deactivated_at=null where tenant_id=$1 and id='es-pay'", [T]),
    ).rejects.toThrow(/employment setups are retired/);
    await expect(
      q(
        `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,status,created_by)
         values ('cc-bare',$1,$2,'cost_center','CC-003','No terms','active',$3)`,
        [T, C, actor],
      ),
    ).rejects.toThrow(/hr_master_employment_terms/);
  });

  it("accepts assignments, requisitions and offers without an employment setup", async () => {
    await expect(
      q("select is_nullable from information_schema.columns where table_name=$1 and column_name=$2", [
        "employee_assignment",
        "employment_setup_id",
      ]),
    ).resolves.toEqual([{ is_nullable: "YES" }]);
    for (const [table, column] of [
      ["hr_manpower_requisition", "employment_setup_id"],
      ["hr_recruitment_offer", "employment_setup_id"],
      ["hr_employee_transfer_request", "proposed_employment_setup_id"],
    ] as const)
      expect(
        await q("select is_nullable from information_schema.columns where table_name=$1 and column_name=$2", [table, column]),
      ).toEqual([{ is_nullable: "YES" }]);
  });
});
