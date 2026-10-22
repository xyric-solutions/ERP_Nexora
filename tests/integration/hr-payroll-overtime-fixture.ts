import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createPayrollRunFixture, runActor } from "./hr-payroll-run-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
export type OvertimeFixtureOptions = {
  stage?: string;
  scale?: number;
  released?: boolean;
  direct?: boolean;
  selectedHourly?: boolean;
  minutes?: number;
  days?: number;
};
export async function createPayrollOvertimeFixture(
  pool: DatabasePool,
  options: OvertimeFixtureOptions = {},
  extraUsers: string[] = [],
) {
  const f = await createPayrollRunFixture(pool, extraUsers, {
    overtime: true,
    overtimeMinutes: options.minutes,
    overtimeDays: options.days,
  });
  const ot = f.payload.days[0]!.overtime[0]!,
    token = randomUUID(),
    policy = "ot-policy-" + token,
    version = "ot-version-" + token,
    option = "ot-option-" + token,
    arrangement = "ot-arrangement-" + token;
  await pool.query(
    `insert into hr_ot_monetary_policy(id,tenant_id,company_id,reference,name,created_by) values($1,$2,$3,'ACCEPTANCE','Synthetic monetary authority','r06.maker')`,
    [policy, tenant, f.companyId],
  );
  await pool.query(
    `insert into hr_ot_monetary_policy_version(id,tenant_id,company_id,policy_id,version_number,category,effective_from,source_reference,created_by) values($1,$2,$3,$4,1,'regular',$5,'synthetic-test-only','r06.maker')`,
    [version, tenant, f.companyId, policy, f.month],
  );
  await pool.query(
    `insert into hr_ot_monetary_policy_option(id,tenant_id,company_id,policy_version_id,code,name,rate_basis_method,basis_source,allowed_compensation_types,allowed_payment_bases,minimum_components,maximum_components,ordinary_hours,multiplier,minute_precision,hourly_rate_precision,intermediate_precision,rounding_mode,rounding_stage,final_currency_scale,earning_component_id) values($1,$2,$3,$4,'MONTHLY','Approved monthly basis',$5,$6,ARRAY['fixed'],ARRAY['monthly'],$7,$7,$8,1.5,8,8,8,'half_up',$9,$10,$11)`,
    [
      option,
      tenant,
      f.companyId,
      version,
      options.direct || options.selectedHourly ? "direct_hourly" : "monthly",
      options.direct ? "direct_contractual_rate" : "selected_components",
      options.direct ? 0 : 1,
      options.direct || options.selectedHourly ? null : "200",
      options.stage ?? "per_ot_day",
      options.scale ?? 2,
      f.component.id,
    ],
  );
  if (!options.direct)
    await pool.query(
      `insert into hr_ot_monetary_option_component(id,tenant_id,company_id,option_id,component_id,position) values($1,$2,$3,$4,$5,1)`,
      ["allowed-" + token, tenant, f.companyId, option, f.component.id],
    );
  await pool.query(
    `insert into hr_employee_ot_arrangement(id,tenant_id,company_id,employee_id,category,policy_version_id,policy_option_id,effective_from,direct_rate,currency_code,reason,created_by) values($1,$2,$3,$4,'regular',$5,$6,$7,$8,'PKR','Synthetic explicit monetary selection','r06.maker')`,
    [arrangement, tenant, f.companyId, f.person.employeeId, version, option, f.month, options.direct ? "250" : null],
  );
  if (!options.direct)
    await pool.query(
      `insert into hr_employee_ot_arrangement_component(id,tenant_id,company_id,arrangement_id,component_id,position) values($1,$2,$3,$4,$5,1)`,
      ["selected-" + token, tenant, f.companyId, arrangement, f.component.id],
    );
  if (options.released !== false)
    await pool.query(
      `update hr_ot_monetary_policy_version set status='released',submitted_by='r06.maker',submitted_at=now(),approved_by='r06.checker',approved_at=now(),released_by='r06.checker',released_at=now(),evidence_hash=$3 where tenant_id=$1 and id=$2`,
      [tenant, version, "b".repeat(64)],
    );
  await pool.query(
    `update hr_employee_ot_arrangement set state='approved',submitted_by='r06.maker',submitted_at=now(),approved_by='r06.checker',approved_at=now(),evidence_hash=$3 where tenant_id=$1 and id=$2`,
    [tenant, arrangement, "c".repeat(64)],
  );
  await f.act("policy", {
    currency_code: "PKR",
    money_scale: 2,
    rounding_mode: "half_up",
    net_payable_account_id: f.liability,
  });
  const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
  await f.act("open", { policy_id: state.policies[0]!.id });
  return { ...f, ot, policy, version, option, arrangement };
}
