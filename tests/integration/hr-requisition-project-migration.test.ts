import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { createDatabasePool } from "../../packages/db/src/pool.js";
import { inspectSourceMigrationState, migrateSourceModule } from "../../packages/db/src/source-migrations.js";

// HR136 upgrade proof: a legacy branch-based requisition survives, and new
// requisitions must name an active project of their company and a hiring basis.
const bootstrapDatabaseUrl =
  process.env.TEST_SOURCE_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test";
const database = `hr136_upgrade_${randomUUID().replaceAll("-", "")}`;
let bootstrap: ReturnType<typeof createDatabasePool>;
let pool: ReturnType<typeof createDatabasePool>;

const T = "hr136-tenant";
const C1 = "hr136-company-1";
const C2 = "hr136-company-2";
const actor = "hr136-actor";

async function q<R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await pool.query<R>(sql, params)).rows;
}

async function company(id: string, suffix: string) {
  await q(
    `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,null,'company',$3,$4,'active')`,
    [id, T, `HR136-C${suffix}`, `HR136 company ${suffix}`],
  );
  await q(
    `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,$3,'branch',$4,$5,'active')`,
    [`${id}-branch`, T, id, `HR136-B${suffix}`, `HR136 branch ${suffix}`],
  );
  await q(
    `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,$3,'department',$4,$5,'active')`,
    [`${id}-dept`, T, `${id}-branch`, `HR136-D${suffix}`, `HR136 department ${suffix}`],
  );
  await q(
    `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,status,created_by)
     values ($1,$2,$3,'designation','DSG-001','Analyst','active',$4),($5,$2,$3,'job_grade','GRD-001','Grade one','active',$4)`,
    [`${id}-designation`, T, id, actor, `${id}-job_grade`],
  );
  await q(
    `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,status,created_by,payment_route,pay_cycle)
     values ($1,$2,$3,'employment_setup','ES-001','Staff','active',$4,'payroll','monthly')`,
    [`${id}-setup`, T, id, actor],
  );
  await q(
    `insert into hr_job_grade_detail (tenant_id,master_record_id,company_id,grade_level,currency_code,band_minimum,band_midpoint,band_maximum)
     values ($1,$2,$3,1,'USD',1000,2000,3000)`,
    [T, `${id}-job_grade`, id],
  );
}

/** Fixture-only project rows; Finance's change/audit evidence trigger is outside this proof. */
async function project(id: string, companyId: string, status: "active" | "inactive") {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(
      `insert into erp_project (tenant_id,company_id,id,code,name,status,created_by,updated_by) values ($1,$2,$3,$4,$5,$6,$7,$7)`,
      [T, companyId, id, id.toUpperCase(), `Project ${id}`, status, actor],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Inserts a C1 requisition; `extra` names the HR136 columns to set. */
async function requisition(
  id: string,
  extra: { branch?: boolean; project?: string; basis?: string; arrangement?: string } = {},
) {
  const columns = ["branch_id", "project_id", "hiring_basis", "work_arrangement"];
  const values = [
    extra.branch ? `${C1}-branch` : null,
    extra.project ?? null,
    extra.basis ?? null,
    extra.arrangement ?? null,
  ];
  const hr136 = extra.project !== undefined || extra.basis !== undefined;
  await q(
    `insert into hr_manpower_requisition (id,tenant_id,company_id,reference,job_title,designation_id,job_grade_id,employment_setup_id,
       department_id,positions_requested,position_type,salary_minimum,salary_maximum,currency_code,target_start_date,reason,created_by,
       ${hr136 ? columns.join(",") : "branch_id"})
     values ($1,$2,$3,$4,'Data Analyst',$5,$6,$7,$8,1,'new_position',1000,3000,'USD','2026-12-01','Growth',$9,
       ${hr136 ? "$10,$11,$12,$13" : "$10"})`,
    [
      id,
      T,
      C1,
      `MRQ-2026-${id.slice(-6).toUpperCase()}`,
      `${C1}-designation`,
      `${C1}-job_grade`,
      `${C1}-setup`,
      `${C1}-dept`,
      actor,
      ...(hr136 ? values : [values[0]]),
    ],
  );
}

describe("HR136 requisition project and hiring basis migration", () => {
  beforeAll(async () => {
    expect(database).toMatch(/^hr136_upgrade_[a-f0-9]{32}$/);
    bootstrap = createDatabasePool(bootstrapDatabaseUrl);
    await bootstrap.query(`create database ${database}`);
    const url = new URL(bootstrapDatabaseUrl);
    url.pathname = `/${database}`;
    pool = createDatabasePool(url.toString());
    for (const moduleName of ["platform", "security", "workflow", "master_data", "finance"] as const) {
      await migrateSourceModule(pool, moduleName);
    }
    await migrateSourceModule(pool, "hr", { throughVersion: 135 });

    await q(
      `insert into tenant (id,name,plan,region,status,default_locale) values ($1,'HR136 tenant','enterprise','test','active','en')`,
      [T],
    );
    await q(
      `insert into security_user_account (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
       values ($1,$2,$3,'hr136@example.test','active','disabled',now(),now(),'HR136 Actor')`,
      [actor, T, `test:${actor}`],
    );
    await company(C1, "1");
    await company(C2, "2");
    await project("prj-active-001", C1, "active");
    await project("prj-closed-002", C1, "inactive");
    await project("prj-other-003", C2, "active");
    // Legacy HR135 requisition: branch, no project or hiring basis.
    await requisition("hr136-req-legacy01", { branch: true });

    // Pinned: HR149 retires employment setups (its own proof covers the merge).
    await migrateSourceModule(pool, "hr", { throughVersion: 137 });
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${database}`);
      await bootstrap.end();
    }
  });

  it("records HR137 as the latest HR migration", async () => {
    await expect(inspectSourceMigrationState(pool)).resolves.toMatchObject({ hr: 137 });
  });

  it("keeps legacy requisitions unchanged and still lets them progress", async () => {
    const [legacy] = await q(
      `select branch_id,project_id,hiring_basis,work_arrangement from hr_manpower_requisition where tenant_id=$1 and id='hr136-req-legacy01'`,
      [T],
    );
    expect(legacy).toEqual({
      branch_id: `${C1}-branch`,
      project_id: null,
      hiring_basis: null,
      work_arrangement: null,
    });
    await q(
      `update hr_manpower_requisition set state='submitted',submitted_by=$2,submitted_at=now() where tenant_id=$1 and id='hr136-req-legacy01'`,
      [T, actor],
    );
  });

  it("accepts a new requisition with an active company project, a hiring basis and no branch", async () => {
    await requisition("hr136-req-new0001", { project: "prj-active-001", basis: "project_based" });
    const [row] = await q<{ branch_id: string | null; project_id: string; hiring_basis: string }>(
      `select branch_id,project_id,hiring_basis from hr_manpower_requisition where tenant_id=$1 and id='hr136-req-new0001'`,
      [T],
    );
    expect(row).toEqual({ branch_id: null, project_id: "prj-active-001", hiring_basis: "project_based" });
  });

  it("requires a project and a hiring basis on new requisitions", async () => {
    await expect(requisition("hr136-req-noproj1", { basis: "permanent" })).rejects.toThrow(
      /project and hiring basis are required/,
    );
    await expect(requisition("hr136-req-nobasis", { project: "prj-active-001" })).rejects.toThrow(
      /project and hiring basis are required/,
    );
  });

  it("rejects inactive, other-company and unknown hiring-basis values", async () => {
    await expect(requisition("hr136-req-closed1", { project: "prj-closed-002", basis: "permanent" })).rejects.toThrow(
      /project must be active in the selected company/,
    );
    // The scope trigger rejects another company's project before the composite foreign key does.
    await expect(requisition("hr136-req-other01", { project: "prj-other-003", basis: "permanent" })).rejects.toThrow(
      /project must be active in the selected company/,
    );
    await expect(
      requisition("hr136-req-badbase", { project: "prj-active-001", basis: "freelance" }),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("stores a requisition work arrangement and rejects unknown values (HR137)", async () => {
    await requisition("hr137-req-remote1", { project: "prj-active-001", basis: "permanent", arrangement: "remote" });
    const [row] = await q(
      `select work_arrangement from hr_manpower_requisition where tenant_id=$1 and id='hr137-req-remote1'`,
      [T],
    );
    expect(row).toEqual({ work_arrangement: "remote" });
    await expect(
      requisition("hr137-req-moon001", { project: "prj-active-001", basis: "permanent", arrangement: "moon_base" }),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
