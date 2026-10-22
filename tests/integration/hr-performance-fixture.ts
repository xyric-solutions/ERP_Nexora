import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import { createShiftAllocationFixture } from "./hr-shift-allocation-fixture.js";
import { correctionActor } from "./hr-correction-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import {
  hrPerformanceQuerySchema,
  hrPerformanceCommandSchema,
  hrPerformanceWorkspaceSchema,
  type HrPerformanceTerms,
  type HrPerformanceCommand,
} from "../../packages/contracts/src/hr/index.js";
export const performancePermissions = [
  "hr.performance.read",
  "hr.performance.manage",
  "hr.performance.review",
  "hr.performance.publish",
];
export const performanceActor = (who = "r06.maker", permissions = performancePermissions) =>
  correctionActor(who, permissions);
export async function createPerformanceFixture(pool: DatabasePool) {
  const f = await createShiftAllocationFixture(pool, ["r06.maker", "r06.checker", "r06.target"]),
    person = await f.target(),
    repo = new SourceHrRepository(pool);
  for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"])
    for (const permission of performancePermissions) {
      await pool.query(
        `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing`,
        [tenant, policy, permission],
      );
      await pool.query(
        `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing`,
        [tenant, policy, permission, f.companyId],
      );
    }
  await pool.query(
    `update security_role_policy p set permissions=coalesce((select jsonb_agg(g.permission_key order by g.permission_key) from security_role_permission_grant g join security_permission_definition d on d.permission_key=g.permission_key and d.status='active' where g.tenant_id=p.tenant_id and g.role_policy_id=p.id),'[]'::jsonb) where p.tenant_id=$1 and p.id=any($2::text[])`,
    [tenant, ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]],
  );
  let cycleId = "";
  const read = async (
    section: "cycles" | "goals" | "reviews" | "outcomes",
    who = "r06.maker",
    extra: Record<string, unknown> = {},
  ) =>
    hrPerformanceWorkspaceSchema.parse(
      await repo.getPerformanceWorkspace(
        performanceActor(who),
        hrPerformanceQuerySchema.parse({
          company_id: f.companyId,
          section,
          ...(cycleId ? { cycle_id: cycleId } : {}),
          ...extra,
        }),
      ),
    );
  const save = async (terms: HrPerformanceTerms, who = "r06.maker", old?: { id: string; version: number }) =>
    repo.actOnPerformance(
      performanceActor(who),
      hrPerformanceCommandSchema.parse({
        action: "save",
        company_id: f.companyId,
        record_id: old?.id ?? null,
        expected_version: old?.version ?? 0,
        terms,
        reason: "Isolated reviewed Performance record setup",
      }),
      randomUUID(),
      "performance-test",
    );
  const act = async (id: string, action: Exclude<HrPerformanceCommand["action"], "save">, who = "r06.maker") => {
    const record = (
      await pool.query("select version from hr_performance_record where tenant_id=$1 and company_id=$2 and id=$3", [
        tenant,
        f.companyId,
        id,
      ])
    ).rows[0];
    return repo.actOnPerformance(
      performanceActor(who),
      hrPerformanceCommandSchema.parse({
        company_id: f.companyId,
        record_id: id,
        expected_version: record.version,
        action,
        reason: "Independent governed Performance action evidence",
      }),
      randomUUID(),
      "performance-test",
    );
  };
  const cycle = await save({
    kind: "cycle",
    title: "Annual assessment " + f.companyId.slice(-5),
    description: "Explicit weighted five-point model",
    start_date: f.today.slice(0, 7) + "-01",
    end_date: f.today,
    review_due_date: f.today,
  });
  cycleId = cycle.id;
  const goal = async (weight = 10000, title = "Delivery quality") =>
    save({
      kind: "goal",
      cycle_id: cycle.id,
      employee_id: person.employeeId,
      title,
      measure: "Verified deliverable acceptance percentage",
      target: "At least 95 percent accepted on time",
      weight_bps: weight,
      due_date: f.today,
    });
  const review = async (who = "r06.maker", old?: { id: string; version: number }) => {
    const w = await read("reviews", who),
      gs = w.goal_sets.find((g) => g.employee_id === person.employeeId)!;
    return save(
      {
        kind: "review",
        cycle_id: cycle.id,
        employee_id: person.employeeId,
        goals_hash: gs.source_hash,
        summary: "Consistent delivery with verified acceptance evidence",
        strengths: "Reliable delivery and collaboration",
        development: "Improve documentation and mentoring",
        ratings: (gs.goals.length
          ? gs.goals
          : (await read("goals", who)).items.filter((g) => g.employee_id === person.employeeId)
        ).map((g) => ({ goal_id: g.id, rating: 4, evidence: "Verified accepted deliverables and manager records" })),
      },
      who,
      old,
    );
  };
  const outcome = async (reviewId: string) =>
    save({
      kind: "outcome",
      review_id: reviewId,
      outcome_kind: "development_plan",
      plan: "Complete mentoring and document the next two delivery milestones",
      owner_employee_id: person.employeeId,
      due_date: f.today,
    });
  return { ...f, person, repo, cycle, read, save, act, goal, review, outcome };
}
