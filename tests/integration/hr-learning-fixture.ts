import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createPersonalLeaveFixture } from "./hr-self-leave-fixture.js";
import { correctionActor } from "./hr-correction-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import {
  hrLearningActionSchema,
  hrLearningQuerySchema,
  type HrLearningRecord,
} from "../../packages/contracts/src/hr/index.js";
export const learningPermissions = [
  "read",
  "manage",
  "request",
  "manager_decide",
  "hr_decide",
  "attendance",
  "certify",
].map((k) => "hr.learning." + k);
export const learningActor = (who = "r06.maker") => correctionActor(who, learningPermissions);
export async function grantLearningFixture(pool: DatabasePool, company: string, userIds: string[]) {
  const policies = (
    await pool.query<{ role_policy_id: string }>(
      "select distinct role_policy_id from security_user_role_assignment_version where tenant_id=$1 and user_id=any($2::text[]) and lifecycle_state='active'",
      [tenant, userIds],
    )
  ).rows;
  for (const p of policies) {
    for (const key of learningPermissions) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)values($1,$2,$3,'all')on conflict do nothing",
        [tenant, p.role_policy_id, key],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)values($1,$2,$3,'company',$4)on conflict do nothing",
        [tenant, p.role_policy_id, key, company],
      );
    }
    await pool.query(
      "update security_role_policy set permissions=(select jsonb_agg(g.permission_key order by g.permission_key)from security_role_permission_grant g join security_permission_definition d on d.permission_key=g.permission_key and d.status='active' where g.tenant_id=$1 and g.role_policy_id=$2),row_version=row_version+1 where tenant_id=$1 and id=$2",
      [tenant, p.role_policy_id],
    );
  }
}
export async function createLearningFixture(pool: DatabasePool) {
  const f = await createPersonalLeaveFixture(pool),
    assignment = "learning-manager-" + randomUUID();
  await pool.query(
    "insert into security_user_role_assignment(tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)values($1,$2,'r06-uat-policy-checker','r06.last-admin-a',now(),$3,'active',now())",
    [tenant, f.managerId, assignment],
  );
  await pool.query(
    "insert into security_user_role_assignment_version(tenant_id,assignment_id,version,user_id,role_policy_id,lifecycle_state,valid_from,assigned_by,source_kind,source_reference)values($1,$2,1,$3,'r06-uat-policy-checker','active',now(),'r06.last-admin-a','legacy_backfill','isolated-learning-fixture')",
    [tenant, assignment, f.managerId],
  );
  await grantLearningFixture(pool, f.companyId, ["r06.maker", "r06.checker", f.managerId, "r06.last-admin-a"]);
  const act = (input: unknown, who = "r06.maker", key = randomUUID()) =>
    f.repo.actOnLearning(
      learningActor(who),
      hrLearningActionSchema.parse({ company_id: f.companyId, ...(input as object) }),
      key,
      "learning-integration",
    );
  const ownAct = (input: unknown, key = randomUUID()) =>
    f.repo.actOnLearning(
      f.own(),
      hrLearningActionSchema.parse({ company_id: f.companyId, ...(input as object) }),
      key,
      "personal-learning-integration",
    );
  const read = (section = "programmes", id?: string, mode: "hr" | "mine" = "hr", who = "r06.maker") =>
    f.repo.getLearning(
      mode === "mine" ? f.own() : learningActor(who),
      hrLearningQuerySchema.parse({ company_id: f.companyId, section, ...(id ? { record_id: id } : {}), mode }),
    );
  const row = async (id: string) => {
    const r = (
      await pool.query<{ kind: string }>("select kind from hr_learning_record where tenant_id=$1 and id=$2", [
        tenant,
        id,
      ])
    ).rows[0]!;
    return (
      await read(
        (
          {
            programme: "programmes",
            request: "requests",
            session: "sessions",
            completion: "completions",
            participation: "sessions",
          } as Record<string, string>
        )[r.kind]!,
        id,
      )
    ).selected!;
  };
  const transition = async (id: string, action: string, who = "r06.maker", key = randomUUID()) =>
    act(
      {
        id,
        action,
        expected_version: (await row(id)).version,
        reason: "Independently governed learning " + action + " action",
      },
      who,
      key,
    );
  const programmeTerms = {
    kind: "programme" as const,
    code: "LEARN-" + randomUUID().slice(0, 8),
    name: "Mandatory secure company learning",
    objectives: "Learn and demonstrate safe company working practices",
    category: "Compliance" as const,
    delivery_mode: "Classroom" as const,
    provider: "Internal HR training",
    duration_minutes: 60,
    cost_per_participant: "1000.00",
    currency: "PKR",
    mandatory: true,
    minimum_attendance_percent: 80,
    pass_mark: 70,
    validity_months: 12,
    prerequisite_ids: [] as string[],
  };
  const draft = await act({
    action: "create",
    expected_version: 0,
    terms: programmeTerms,
    reason: "Create independently reviewed company learning programme",
  });
  const programme = await transition(draft.id, "activate", "r06.checker");
  async function request() {
    const r = await ownAct({
      action: "create",
      expected_version: 0,
      terms: {
        kind: "request",
        programme_id: programme.id,
        justification: "Training to address my independently reviewed development needs",
        goal_id: null,
        outcome_id: null,
      },
      reason: "Employee personal training request for development",
    });
    await ownAct({
      action: "submit",
      id: r.id,
      expected_version: 1,
      reason: "Submit my training request to the current reporting manager",
    });
    await transition(r.id, "manager_approve", f.managerId);
    await transition(r.id, "hr_approve", "r06.checker");
    return row(r.id);
  }
  async function session(finished = false, capacity = 20) {
    const starts = Date.now() + (finished ? -7200000 : 172800000),
      terms = {
        kind: "session",
        programme_id: programme.id,
        title: "Secure company training cohort",
        trainer: "Independent internal trainer",
        location: "Learning room 1",
        capacity,
        slots: [{ starts_at: new Date(starts).toISOString(), ends_at: new Date(starts + 3600000).toISOString() }],
      };
    const r = await act({
      action: "create",
      expected_version: 0,
      terms,
      reason: "Plan company learning delivery with actual capacity",
    });
    const real = Date.now;
    if (finished) Date.now = () => starts - 60000;
    try {
      await transition(r.id, "schedule");
    } finally {
      Date.now = real;
    }
    return row(r.id);
  }
  async function enroll(request: HrLearningRecord, session: HrLearningRecord) {
    const real = Date.now;
    if (session.terms.kind === "session" && Date.parse(session.terms.slots[0]!.starts_at) < real())
      Date.now = () =>
        Date.parse((session.terms as Extract<typeof session.terms, { kind: "session" }>).slots[0]!.starts_at) - 60000;
    try {
      return await act({
        action: "enroll",
        request_id: request.id,
        session_id: session.id,
        expected_request_version: request.version,
        expected_session_version: session.version,
        reason: "Enroll approved employee request in the matching session",
      });
    } finally {
      Date.now = real;
    }
  }
  async function attendance(id: string, minutes = 60, score = 90) {
    const p = await row(id),
      s = await row(p.parent_id!);
    if (s.terms.kind !== "session") throw Error("Missing session fixture");
    return act({
      action: "attendance",
      id,
      expected_version: p.version,
      attendance: s.terms.slots.map((s) => ({
        starts_at: s.starts_at,
        minutes,
        note: minutes ? "Verified lesson presence" : "Verified lesson absence",
      })),
      assessment_score: score,
      evidence_reference: "Signed trainer register and assessment evidence",
      reason: "Record actual attendance and independently retained assessment",
    });
  }
  return { ...f, act, ownAct, read, row, transition, programme, programmeTerms, request, session, enroll, attendance };
}
