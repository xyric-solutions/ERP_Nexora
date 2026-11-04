import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { createDatabasePool } from "../../packages/db/src/pool.js";
import { inspectSourceMigrationState, migrateSourceModule } from "../../packages/db/src/source-migrations.js";

// HR134 upgrade proof: seed legacy Employment Type / Employee Category data on
// HR133, apply HR134, and verify the Employment Setup backfill and guards.
const bootstrapDatabaseUrl =
  process.env.TEST_SOURCE_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test";
const database = `hr134_upgrade_${randomUUID().replaceAll("-", "")}`;
let bootstrap: ReturnType<typeof createDatabasePool>;
let pool: ReturnType<typeof createDatabasePool>;

const T = "hr134-tenant";
const C1 = "hr134-company-1";
const C2 = "hr134-company-2";
const actor = "hr134.admin";

async function q<R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await pool.query<R>(sql, params)).rows;
}

async function master(
  id: string,
  company: string,
  type: string,
  code: string,
  name: string,
  configuration?: [string, string],
) {
  await q(
    `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,status,created_by,configuration_key,configuration_value)
     values ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9)`,
    [
      id,
      T,
      company,
      type,
      code,
      name,
      `${actor}.${code.toLowerCase()}`,
      configuration?.[0] ?? null,
      configuration?.[1] ?? null,
    ],
  );
}

async function company(id: string, suffix: string) {
  await q(
    `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,null,'company',$3,$4,'active')`,
    [id, T, `HR134-C${suffix}`, `HR134 company ${suffix}`],
  );
  await q(
    `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,$3,'branch',$4,$5,'active')`,
    [`${id}-branch`, T, id, `HR134-B${suffix}`, `HR134 branch ${suffix}`],
  );
  await q(
    `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status) values ($1,$2,$3,'department',$4,$5,'active')`,
    [`${id}-dept`, T, `${id}-branch`, `HR134-D${suffix}`, `HR134 department ${suffix}`],
  );
  for (const [type, code] of [
    ["designation", "DSG-001"],
    ["job_grade", "GRD-001"],
    ["cost_center", "CC-001"],
    ["work_location", "LOC-001"],
  ] as const) {
    await master(`${id}-${type}`, id, type, code, `${type} ${suffix}`);
  }
  await q(
    `insert into hr_job_grade_detail (tenant_id,master_record_id,company_id,grade_level,currency_code,band_minimum,band_midpoint,band_maximum)
     values ($1,$2,$3,1,'USD',1000,2000,3000)`,
    [T, `${id}-job_grade`, id],
  );
}

async function employeeWithAssignment(
  employeeId: string,
  companyId: string,
  type: string,
  category: string,
  from: string,
  to: string | null = null,
  status = "legacy_compatibility",
  assignmentId = `${employeeId}-assignment`,
) {
  await q(
    `insert into employee (id,tenant_id,employee_number,first_name,last_name,joined_on,status,created_by)
     values ($1,$2,$3,'Test',$1,'2024-01-01','active',$4) on conflict do nothing`,
    [employeeId, T, employeeId.toUpperCase(), actor],
  );
  await q(
    `insert into employee_assignment (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_grade_id,
       cost_center_id,work_location_id,employment_type_id,employee_category_id,effective_from,effective_to,change_reason,created_by,assignment_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'initial_appointment',$15,$16)`,
    [
      assignmentId,
      T,
      employeeId,
      companyId,
      `${companyId}-branch`,
      `${companyId}-dept`,
      `${companyId}-designation`,
      `${companyId}-job_grade`,
      `${companyId}-cost_center`,
      `${companyId}-work_location`,
      type,
      category,
      from,
      to,
      actor,
      status,
    ],
  );
}

async function requisition(
  id: string,
  reference: string,
  setupColumn: "employment_type_id" | "employment_setup_id",
  setup: string,
  state = "draft",
) {
  const decided = state === "approved";
  await q(
    `insert into hr_manpower_requisition (id,tenant_id,company_id,reference,job_title,designation_id,job_grade_id,${setupColumn},
       branch_id,department_id,positions_requested,position_type,salary_minimum,salary_maximum,currency_code,target_start_date,reason,
       state,created_by,submitted_by,submitted_at,decided_by,decided_at,decision_reason)
     values ($1,$2,$3,$4,'Engineer',$5,$6,$7,$8,$9,2,'new_position',1000,3000,'USD','2026-12-01','Growth',$10,$11,
       $12,$13,$14,$15,$16)`,
    [
      id,
      T,
      C1,
      reference,
      `${C1}-designation`,
      `${C1}-job_grade`,
      setup,
      `${C1}-branch`,
      `${C1}-dept`,
      state,
      actor,
      decided ? actor : null,
      decided ? new Date() : null,
      decided ? "hr134.approver" : null,
      decided ? new Date() : null,
      decided ? "Approved" : null,
    ],
  );
}

async function offer(
  id: string,
  reference: string,
  application: string,
  legacy: [string, string] | null,
  setup: string | null,
) {
  const columns = legacy ? "employment_type_id,employee_category_id" : "employment_setup_id";
  const values = legacy ? legacy : [setup];
  await q(
    `insert into hr_recruitment_offer (tenant_id,id,company_id,application_id,opening_id,requisition_id,reference,designation_id,job_grade_id,
       branch_id,department_id,salary_minimum,salary_maximum,currency_code,proposed_gross,joining_on,valid_until,probation_months,notice_days,
       cost_center_id,work_location_id,created_by,${columns})
     values ($1,$2,$3,$4,'hr134-opening','hr134-req-approved',$5,$6,$7,$8,$9,1000,3000,'USD',2000,'2026-12-15','2026-12-01',3,30,$10,$11,$12,
       ${values.map((_, index) => `$${13 + index}`).join(",")})`,
    [
      T,
      id,
      C1,
      application,
      reference,
      `${C1}-designation`,
      `${C1}-job_grade`,
      `${C1}-branch`,
      `${C1}-dept`,
      `${C1}-cost_center`,
      `${C1}-work_location`,
      actor,
      ...values,
    ],
  );
}

describe("HR134 Employment Setup migration", () => {
  beforeAll(async () => {
    expect(database).toMatch(/^hr134_upgrade_[a-f0-9]{32}$/);
    bootstrap = createDatabasePool(bootstrapDatabaseUrl);
    await bootstrap.query(`create database ${database}`);
    const url = new URL(bootstrapDatabaseUrl);
    url.pathname = `/${database}`;
    pool = createDatabasePool(url.toString());
    for (const moduleName of ["platform", "security", "workflow", "master_data", "finance"] as const) {
      await migrateSourceModule(pool, moduleName);
    }
    await migrateSourceModule(pool, "hr", { throughVersion: 133 });
    await expect(inspectSourceMigrationState(pool)).resolves.toMatchObject({ hr: 133 });

    // Legacy HR133 data.
    await q(
      `insert into tenant (id,name,plan,region,status,default_locale) values ($1,'HR134 tenant','enterprise','test','active','en')`,
      [T],
    );
    await company(C1, "1");
    await company(C2, "2");
    await master("et-a", C1, "employment_type", "ET-001", "Permanent", ["payment_route", "stipend"]);
    await master("et-r", C1, "employment_type", "ET-002", "Contract");
    await master("et-u", C1, "employment_type", "ET-003", "Agency", ["payment_route", "accounts_payable"]);
    await master("et-old", C1, "employment_type", "ET-004", "Retired type");
    await q(
      `update hr_master_record set status='inactive',deactivated_by=$2,deactivated_at=now() where tenant_id=$1 and id='et-old'`,
      [T, actor],
    );
    await master("ec-x", C1, "employee_category", "EC-001", "Staff", ["pay_cycle", "weekly"]);
    await master("ec-y", C1, "employee_category", "EC-002", "Manager");
    await master("ec-l", C1, "employee_category", "EC-003", "Seasonal", ["pay_cycle", "fortnightly"]);
    await master("et-a2", C2, "employment_type", "ET-001", "Permanent", ["payment_route", "payroll"]);
    await master("ec-x2", C2, "employee_category", "EC-001", "Staff", ["pay_cycle", "monthly"]);

    // (A,X) twice incl. closed history, (A,Y) once, and another company.
    await employeeWithAssignment("e1", C1, "et-a", "ec-x", "2024-01-01", "2024-12-31", "ended", "e1-closed");
    await employeeWithAssignment("e1", C1, "et-a", "ec-x", "2025-01-01");
    await employeeWithAssignment("e2", C1, "et-a", "ec-y", "2025-01-01");
    await employeeWithAssignment("e3", C2, "et-a2", "ec-x2", "2025-01-01");

    // A requisition with only a type (ET-002) and an approved one for offers (ET-001).
    await requisition("hr134-req-draft", "MRQ-2026-AAAAAA", "employment_type_id", "et-r");
    await requisition("hr134-req-approved", "MRQ-2026-BBBBBB", "employment_type_id", "et-a", "approved");
    await q(
      `insert into hr_job_opening (id,tenant_id,company_id,reference,requisition_id,title,positions_requested,created_by)
       values ('hr134-opening',$1,$2,'JOP-2026-AAAAAA','hr134-req-approved','Engineer',2,$3)`,
      [T, C1, actor],
    );
    for (const suffix of ["1", "2"]) {
      await q(
        `insert into hr_candidate (id,tenant_id,company_id,reference,first_name,last_name,email,source,created_by)
         values ($1,$2,$3,$4,'Cand',$5,$6,'direct',$7)`,
        [`hr134-cand-${suffix}`, T, C1, `CAN-2026-AAAAA${suffix}`, suffix, `cand${suffix}@example.invalid`, actor],
      );
      await q(
        `insert into hr_recruitment_application (id,tenant_id,company_id,candidate_id,opening_id,reference,stage,created_by)
         values ($1,$2,$3,$4,'hr134-opening',$5,'selected',$6)`,
        [`hr134-app-${suffix}`, T, C1, `hr134-cand-${suffix}`, `APL-2026-AAAAAAAAAAA${suffix}`, actor],
      );
    }
    await offer("hr134-offer-legacy", "OFR-2026-AAAAAAAAAAAA", "hr134-app-1", ["et-a", "ec-x"], null);

    // Leave: a type limited to the leave-only category; a policy limited to (X, L).
    await q(
      `insert into hr_leave_type (id,tenant_id,company_id,code,name,paid,accrual_method,minimum_request_days,maximum_request_days,applicable_category_ids,created_by)
       values ('hr134-leave',$1,$2,'LT-001','Seasonal leave',true,'annual_grant',1,10,$3,$4)`,
      [T, C1, ["ec-l"], actor],
    );
    await q(
      `insert into hr_leave_policy_version (id,tenant_id,company_id,leave_type_id,version_number,effective_from,effective_to,annual_entitlement_days,
         accrual_method,minimum_request_days,maximum_request_days,applicable_category_ids,created_by)
       values ('hr134-leave-v1',$1,$2,'hr134-leave',1,'2024-01-01','2024-12-31',10,'annual_grant',1,10,$3,$4),
              ('hr134-leave-v2',$1,$2,'hr134-leave',2,'2025-01-01',null,10,'annual_grant',1,10,$5,$4)`,
      [T, C1, ["ec-l"], actor, ["ec-x", "ec-l"]],
    );

    await migrateSourceModule(pool, "hr");
    await migrateSourceModule(pool, "runtime");
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${database}`);
      await bootstrap.end();
    }
  });

  it("records the HR134 ledger row", async () => {
    expect((await inspectSourceMigrationState(pool)).hr).toBeGreaterThanOrEqual(134);
  });

  it("creates sequential per-company setups with names, terms and provenance", async () => {
    const setups = await q<{
      company_id: string;
      code: string;
      name: string;
      description: string;
      payment_route: string;
      pay_cycle: string;
      status: string;
      created_by: string;
      type_id: string | null;
      category_id: string | null;
    }>(
      `select s.company_id,s.code,s.name,s.description,s.payment_route,s.pay_cycle,s.status,s.created_by,
              m.employment_type_id type_id,m.employee_category_id category_id
         from hr_master_record s
         join hr_employment_setup_legacy_map m on m.tenant_id=s.tenant_id and m.employment_setup_id=s.id
        where s.tenant_id=$1 and s.master_type='employment_setup'
        order by s.company_id,s.code`,
      [T],
    );
    expect(
      setups.map(({ company_id, code, name, description, payment_route, pay_cycle, status, type_id, category_id }) => ({
        company_id,
        code,
        name,
        description,
        payment_route,
        pay_cycle,
        status,
        type_id,
        category_id,
      })),
    ).toEqual([
      {
        company_id: C1,
        code: "ES-001",
        name: "Permanent / Staff",
        description: "Converted from ET-001 / EC-001",
        payment_route: "stipend",
        pay_cycle: "weekly",
        status: "active",
        type_id: "et-a",
        category_id: "ec-x",
      },
      {
        company_id: C1,
        code: "ES-002",
        name: "Permanent / Manager",
        description: "Converted from ET-001 / EC-002",
        payment_route: "stipend",
        pay_cycle: "monthly",
        status: "active",
        type_id: "et-a",
        category_id: "ec-y",
      },
      {
        company_id: C1,
        code: "ES-003",
        name: "Contract",
        description: "Converted from ET-002",
        payment_route: "payroll",
        pay_cycle: "monthly",
        status: "active",
        type_id: "et-r",
        category_id: null,
      },
      {
        company_id: C1,
        code: "ES-004",
        name: "Agency",
        description: "Converted from ET-003",
        payment_route: "accounts_payable",
        pay_cycle: "monthly",
        status: "active",
        type_id: "et-u",
        category_id: null,
      },
      {
        company_id: C1,
        code: "ES-005",
        name: "Seasonal",
        description: "Converted from EC-003",
        payment_route: "payroll",
        pay_cycle: "fortnightly",
        status: "active",
        type_id: null,
        category_id: "ec-l",
      },
      {
        company_id: C2,
        code: "ES-001",
        name: "Permanent / Staff",
        description: "Converted from ET-001 / EC-001",
        payment_route: "payroll",
        pay_cycle: "monthly",
        status: "active",
        type_id: "et-a2",
        category_id: "ec-x2",
      },
    ]);
    expect(setups[0]!.created_by).toBe(`${actor}.et-001`);
    expect(setups[4]!.created_by).toBe(`${actor}.ec-003`);
    // The inactive, unused legacy type does not become a setup.
    expect(setups.some((row) => row.type_id === "et-old")).toBe(false);
    const counters = await q<{ scope_id: string; next_value: string }>(
      `select scope_id,next_value::text from hr_record_code_counter where tenant_id=$1 and record_kind='employment_setup' order by scope_id`,
      [T],
    );
    expect(counters).toEqual([
      { scope_id: C1, next_value: "6" },
      { scope_id: C2, next_value: "2" },
    ]);
  });

  it("fills every new reference and expands leave restrictions", async () => {
    const codeOf = async (sql: string) =>
      (
        await q<{ code: string }>(
          `select s.code from (${sql}) x join hr_master_record s on s.tenant_id=$1 and s.id=x.setup_id order by 1`,
          [T],
        )
      ).map((row) => row.code);
    expect(
      await codeOf(
        `select employment_setup_id setup_id from employee_assignment where tenant_id='${T}' and employee_id='e1'`,
      ),
    ).toEqual(["ES-001", "ES-001"]);
    expect(
      await codeOf(
        `select employment_setup_id setup_id from employee_assignment where tenant_id='${T}' and employee_id='e2'`,
      ),
    ).toEqual(["ES-002"]);
    expect(
      await codeOf(
        `select employment_setup_id setup_id from employee_assignment where tenant_id='${T}' and employee_id='e3'`,
      ),
    ).toEqual(["ES-001"]);
    expect(
      await codeOf(
        `select employment_setup_id setup_id from hr_manpower_requisition where tenant_id='${T}' and id='hr134-req-draft'`,
      ),
    ).toEqual(["ES-003"]);
    expect(
      await codeOf(
        `select employment_setup_id setup_id from hr_manpower_requisition where tenant_id='${T}' and id='hr134-req-approved'`,
      ),
    ).toEqual(["ES-001"]);
    expect(
      await codeOf(
        `select employment_setup_id setup_id from hr_recruitment_offer where tenant_id='${T}' and id='hr134-offer-legacy'`,
      ),
    ).toEqual(["ES-001"]);
    const leave = await q<{ id: string; codes: string[] }>(
      `select x.id, array(select s.code from unnest(x.applicable_employment_setup_ids) with ordinality u(id,n)
                          join hr_master_record s on s.tenant_id=x.tenant_id and s.id=u.id order by u.n) codes
         from (select id,tenant_id,applicable_employment_setup_ids from hr_leave_type
               union all select id,tenant_id,applicable_employment_setup_ids from hr_leave_policy_version) x
        where x.tenant_id=$1 order by x.id`,
      [T],
    );
    expect(leave).toEqual([
      { id: "hr134-leave", codes: ["ES-005"] },
      { id: "hr134-leave-v1", codes: ["ES-005"] },
      { id: "hr134-leave-v2", codes: ["ES-001", "ES-005"] },
    ]);
    for (const [table, column] of [
      ["employee_assignment", "employment_setup_id"],
      ["hr_employee_transfer_request", "proposed_employment_setup_id"],
      ["hr_manpower_requisition", "employment_setup_id"],
      ["hr_recruitment_offer", "employment_setup_id"],
    ] as const) {
      const [shape] = await q<{ is_nullable: string }>(
        `select is_nullable from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
        [table, column],
      );
      expect(shape?.is_nullable).toBe("NO");
    }
  });

  it("archives the legacy masters and keeps them read-only", async () => {
    const legacy = await q<{ status: string; deactivated_by: string | null }>(
      `select status,deactivated_by from hr_master_record where tenant_id=$1 and master_type in ('employment_type','employee_category') order by id`,
      [T],
    );
    expect(legacy.length).toBe(9);
    expect(legacy.every((row) => row.status === "inactive")).toBe(true);
    await expect(master("et-new", C1, "employment_type", "ET-009", "New type")).rejects.toThrow(/retired/);
    await expect(master("ec-new", C1, "employee_category", "EC-009", "New category")).rejects.toThrow(/retired/);
    await expect(
      q(
        `update hr_master_record set status='active',deactivated_by=null,deactivated_at=null where tenant_id=$1 and id='et-a'`,
        [T],
      ),
    ).rejects.toThrow(/retired/);
    await expect(q(`update hr_master_record set name='Renamed' where tenant_id=$1 and id='ec-x'`, [T])).rejects.toThrow(
      /retired/,
    );
  });

  it("requires valid setup terms on new employment setups", async () => {
    const insert = (
      id: string,
      route: string | null,
      cycle: string | null,
      configuration: [string, string] | null = null,
    ) =>
      q(
        `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,status,created_by,payment_route,pay_cycle,configuration_key,configuration_value)
         values ($1,$2,$3,'employment_setup',$4,$4,'active',$5,$6,$7,$8,$9)`,
        [id, T, C1, id.toUpperCase(), actor, route, cycle, configuration?.[0] ?? null, configuration?.[1] ?? null],
      );
    await expect(insert("es-no-cycle", "payroll", null)).rejects.toMatchObject({
      constraint: "hr_master_employment_setup_terms",
    });
    await expect(insert("es-no-route", null, "monthly")).rejects.toMatchObject({
      constraint: "hr_master_employment_setup_terms",
    });
    await expect(insert("es-bad-cycle", "payroll", "daily")).rejects.toMatchObject({
      constraint: "hr_master_employment_setup_terms",
    });
    await expect(insert("es-config", "payroll", "monthly", ["pay_cycle", "monthly"])).rejects.toThrow();
    await expect(
      q(
        `insert into hr_master_record (id,tenant_id,company_id,master_type,code,name,status,created_by,pay_cycle) values ('dsg-x',$1,$2,'designation','DSG-009','X','active',$3,'monthly')`,
        [T, C1, actor],
      ),
    ).rejects.toMatchObject({ constraint: "hr_master_employment_setup_terms" });
    await insert("es-ok", "accounts_payable", "weekly");
    await q(
      `update hr_master_record set status='inactive',deactivated_by=$2,deactivated_at=now() where tenant_id=$1 and id='es-ok'`,
      [T, actor],
    );
  });

  it("keeps assignment close and history guards working", async () => {
    await q(
      `update employee_assignment set effective_to='2025-06-30',assignment_status='ended',updated_at=now() where tenant_id=$1 and id='e2-assignment'`,
      [T],
    );
    const setup = await q<{ id: string }>(
      `select id from hr_master_record where tenant_id=$1 and company_id=$2 and code='ES-001'`,
      [T, C1],
    );
    await expect(
      q(`update employee_assignment set employment_setup_id=$2 where tenant_id=$1 and id='e1-assignment'`, [
        T,
        "es-ok",
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      q(`update employee_assignment set employment_type_id=null where tenant_id=$1 and id='e1-assignment'`, [T]),
    ).rejects.toThrow(/immutable/);
    await expect(
      q(`update employee_assignment set effective_to='2025-07-01' where tenant_id=$1 and id='e1-closed'`, [T]),
    ).rejects.toThrow(/immutable/);
    // A new segment must reference an active employment setup of the same company.
    const insertSegment = (setupId: string | null) =>
      q(
        `insert into employee_assignment (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,job_grade_id,cost_center_id,
           work_location_id,employment_setup_id,effective_from,change_reason,created_by,assignment_status)
         values ($1,$2,'e2',$3,$4,$5,$6,$7,$8,$9,$10,'2025-07-01','correction',$11,'legacy_compatibility')`,
        [
          `e2-segment-${setupId ?? "none"}`,
          T,
          C1,
          `${C1}-branch`,
          `${C1}-dept`,
          `${C1}-designation`,
          `${C1}-job_grade`,
          `${C1}-cost_center`,
          `${C1}-work_location`,
          setupId,
          actor,
        ],
      );
    await expect(insertSegment(null)).rejects.toThrow();
    await expect(insertSegment("es-ok")).rejects.toThrow(/unavailable or mistyped/);
    await expect(insertSegment("et-a")).rejects.toThrow(/unavailable or mistyped/);
    await insertSegment(setup[0]!.id);
  });

  it("creates requisitions and offers that reference an employment setup", async () => {
    const [es1, es2] = (
      await q<{ id: string }>(
        `select id from hr_master_record where tenant_id=$1 and company_id=$2 and code in ('ES-001','ES-002') order by code`,
        [T, C1],
      )
    ).map((row) => row.id);
    await requisition("hr134-req-new", "MRQ-2026-CCCCCC", "employment_setup_id", es2!);
    await expect(requisition("hr134-req-bad", "MRQ-2026-DDDDDD", "employment_setup_id", "es-ok")).rejects.toThrow(
      /employment setup must be active/,
    );
    // The legacy draft requisition can still be submitted.
    await q(
      `update hr_manpower_requisition set state='submitted',submitted_by=$2,submitted_at=now() where tenant_id=$1 and id='hr134-req-draft'`,
      [T, actor],
    );

    await offer("hr134-offer-new", "OFR-2026-BBBBBBBBBBBB", "hr134-app-2", null, es2!);
    await expect(
      offer("hr134-offer-legacy-only", "OFR-2026-CCCCCCCCCCCC", "hr134-app-2", ["et-a", "ec-x"], null),
    ).rejects.toThrow();
    // Draft offers may change the setup; submitted offers may not.
    await q(
      `update hr_recruitment_offer set employment_setup_id=$2,version=version+1 where tenant_id=$1 and id='hr134-offer-new'`,
      [T, es1],
    );
    await expect(
      q(
        `update hr_recruitment_offer set employment_setup_id='es-ok',version=version+1 where tenant_id=$1 and id='hr134-offer-new'`,
        [T],
      ),
    ).rejects.toThrow(/employment setup must be active/);
    await q(
      `update hr_recruitment_offer set state='submitted',submitted_by=$2,version=version+1 where tenant_id=$1 and id='hr134-offer-new'`,
      [T, actor],
    );
    await expect(
      q(
        `update hr_recruitment_offer set employment_setup_id=$2,version=version+1 where tenant_id=$1 and id='hr134-offer-new'`,
        [T, es2],
      ),
    ).rejects.toThrow(/Submitted offer terms are immutable/);
    // The migrated legacy offer still transitions.
    await q(
      `update hr_recruitment_offer set state='submitted',submitted_by=$2,version=version+1 where tenant_id=$1 and id='hr134-offer-legacy'`,
      [T, actor],
    );
  });

  it("validates leave eligibility setups", async () => {
    const [es1] = (
      await q<{ id: string }>(
        `select id from hr_master_record where tenant_id=$1 and company_id=$2 and code='ES-001'`,
        [T, C1],
      )
    ).map((row) => row.id);
    const [c2Setup] = (
      await q<{ id: string }>(
        `select id from hr_master_record where tenant_id=$1 and company_id=$2 and code='ES-001'`,
        [T, C2],
      )
    ).map((row) => row.id);
    await q(
      `update hr_leave_type set applicable_employment_setup_ids=array_append(applicable_employment_setup_ids,$2),version=version+1 where tenant_id=$1 and id='hr134-leave'`,
      [T, es1],
    );
    await expect(
      q(
        `update hr_leave_type set applicable_employment_setup_ids=array_append(applicable_employment_setup_ids,$2),version=version+1 where tenant_id=$1 and id='hr134-leave'`,
        [T, c2Setup],
      ),
    ).rejects.toThrow(/leave eligibility/);
    await expect(
      q(
        `update hr_leave_type set applicable_employment_setup_ids=array_append(applicable_employment_setup_ids,'es-ok'),version=version+1 where tenant_id=$1 and id='hr134-leave'`,
        [T],
      ),
    ).rejects.toThrow(/leave eligibility/);
    // Closing the open policy version still works.
    await q(`update hr_leave_policy_version set effective_to='2025-12-31' where tenant_id=$1 and id='hr134-leave-v2'`, [
      T,
    ]);
  });
});
