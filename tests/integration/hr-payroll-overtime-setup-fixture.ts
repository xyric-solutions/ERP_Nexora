import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createPayrollRunFixture, runActor } from "./hr-payroll-run-fixture.js";
import {
  createHrOvertimeMoneySchema,
  hrOvertimeMoneyQuerySchema,
  type HrOvertimeMoneyDecision,
  type HrOvertimeMoneyRecord,
} from "../../packages/contracts/src/hr/index.js";
export async function createGovernedOvertimeFixture(pool: DatabasePool, extraUsers: string[] = [], overtime = true) {
  const f = await createPayrollRunFixture(pool, extraUsers, { overtime });
  const terms = {
    category: "regular" as const,
    basis_source: "selected_components" as const,
    rate_basis_method: "monthly" as const,
    component_ids: [f.component.id],
    earning_component_id: f.component.id,
    currency_code: "PKR",
    money_scale: 2,
    ordinary_hours: "200",
    multiplier: "1.5",
    rounding_mode: "half_up" as const,
    rounding_stage: "per_ot_day" as const,
    minute_precision: 8,
    hourly_rate_precision: 8,
    intermediate_precision: 8,
    source_reference: "Synthetic approved monetary authority for integration acceptance",
  };
  const policyInput = createHrOvertimeMoneySchema.parse({
    company_id: f.companyId,
    kind: "policy",
    reference: "OT-" + randomUUID().slice(0, 8).toUpperCase(),
    name: "Governed monthly overtime",
    effective_from: f.month,
    effective_to: null,
    reason: "Governed monetary policy creation acceptance",
    terms,
  });
  const query = (kind: "policy" | "arrangement") =>
    hrOvertimeMoneyQuerySchema.parse({
      company_id: f.companyId,
      on_date: f.month,
      section: kind === "policy" ? "policies" : "arrangements",
    });
  const record = async (id: string, kind: "policy" | "arrangement") =>
    (await f.repo.getOvertimeMoneyWorkspace(runActor(), query(kind))).items.find((row) => row.id === id)!;
  const decide = async (
    id: string,
    kind: "policy" | "arrangement",
    action: HrOvertimeMoneyDecision["action"],
    who = "r06.maker",
    extra: Partial<HrOvertimeMoneyDecision> = {},
  ) => {
    const row = await record(id, kind);
    return f.repo.decideOvertimeMoney(
      runActor(who),
      id,
      {
        company_id: f.companyId,
        kind,
        action,
        expected_version: row.version,
        source_hash: row.source_hash,
        reason: "Governed monetary review acceptance",
        confirm_override: false,
        ...extra,
      },
      randomUUID(),
      "ot-setup-fixture",
    );
  };
  const createPolicy = (extra: Record<string, unknown> = {}, key = randomUUID()) =>
    f.repo.createOvertimeMoney(
      runActor(),
      createHrOvertimeMoneySchema.parse({ ...policyInput, ...extra }),
      key,
      "ot-setup-fixture",
    );
  const release = async (id: string) => {
    await decide(id, "policy", "submit");
    await decide(id, "policy", "approve", "r06.checker");
    await decide(id, "policy", "release", "r06.checker");
  };
  const createArrangement = (id: string, extra: Record<string, unknown> = {}) =>
    f.repo.createOvertimeMoney(
      runActor(),
      createHrOvertimeMoneySchema.parse({
        company_id: f.companyId,
        kind: "arrangement",
        employee_id: f.person.employeeId,
        policy_version_id: id,
        effective_from: f.month,
        effective_to: null,
        direct_rate: null,
        reason: "Explicit governed employee monetary authority",
        ...extra,
      }),
      randomUUID(),
      "ot-setup-fixture",
    );
  const calculate = async () => {
    await f.act("policy", {
      currency_code: "PKR",
      money_scale: 2,
      rounding_mode: "half_up",
      net_payable_account_id: f.liability,
    });
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    await f.act("open", { policy_id: state.policies[0]!.id });
    await f.act("calculate");
  };
  return {
    ...f,
    terms,
    policyInput,
    moneyQuery: query,
    record,
    decide,
    createPolicy,
    release,
    createArrangement,
    calculate,
  };
}
export type GovernedOvertimeRecord = HrOvertimeMoneyRecord;
