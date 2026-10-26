import type { HrPerformanceInbox } from "@nexora/contracts";
import type {
  HrPerformanceParticipationQuery,
  HrPerformanceParticipationAction,
  HrPerformanceParticipation,
} from "@nexora/contracts";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  HrPerformanceCommand,
  HrPerformanceQuery,
  HrPerformanceRecord,
  HrPerformanceTerms,
  HrPerformanceWorkspace,
  HrPayrollMutationResult,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import type { PayrollWorkspaceDependencies } from "./payroll-workspace.js";
import { attendanceHash } from "./attendance-completion.js";
// PostgreSQL records are projected explicitly into the shared public contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_PERFORMANCE_REVIEW_REQUIRED", message);
};
const deny = (message = "Current company-scoped Performance permission is required."): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
const kinds = { cycles: "cycle", goals: "goal", reviews: "review", outcomes: "outcome" } as const;
export function performanceScore(
  goals: { id: string; weight_bps: number }[],
  ratings: { goal_id: string; rating: number }[],
) {
  if (
    !goals.length ||
    goals.length > 50 ||
    goals.reduce((n, g) => n + g.weight_bps, 0) !== 10000 ||
    ratings.length !== goals.length ||
    new Set(ratings.map((r) => r.goal_id)).size !== ratings.length
  )
    fail("A review needs every approved goal exactly once, with total goal weight 100%.");
  let total = 0;
  for (const g of goals) {
    const r = ratings.find((r) => r.goal_id === g.id);
    if (
      !r ||
      !Number.isInteger(r.rating) ||
      r.rating < 1 ||
      r.rating > 5 ||
      !Number.isInteger(g.weight_bps) ||
      g.weight_bps < 1 ||
      g.weight_bps > 10000
    )
      fail("Use a rating from 1 to 5 for each approved goal.");
    total += g.weight_bps * r!.rating;
  }
  return {
    score: (total / 10000).toFixed(4),
    band:
      total >= 45000
        ? "Exceptional"
        : total >= 35000
          ? "Exceeds expectations"
          : total >= 25000
            ? "Meets expectations"
            : total >= 15000
              ? "Developing"
              : "Needs improvement",
  };
}
export class Performance {
  constructor(private readonly d: PayrollWorkspaceDependencies) {}
  private async permission(client: PoolClient, c: HrActorContext, company: string, suffix = "read") {
    const key = "hr.performance." + suffix;
    if (c.actor.tenantId !== c.tenantId || !c.actor.permissions.includes(key)) deny();
    const result = await client.query(
      `select 1 from security_user_role_assignment_version a join security_user_account u on u.tenant_id=a.tenant_id and u.id=a.user_id and u.status='active' and u.archived_at is null join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id and p.status='active' and p.lifecycle_state='active' join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id and r.lifecycle_state='active' join security_role_permission_grant g on g.tenant_id=p.tenant_id and g.role_policy_id=p.id and g.permission_key=$3 join security_permission_definition d on d.permission_key=g.permission_key and d.status='active' join security_role_scope_grant s on s.tenant_id=g.tenant_id and s.role_policy_id=g.role_policy_id and s.permission_key=g.permission_key where a.tenant_id=$1 and a.user_id=$2 and a.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=a.tenant_id and v.assignment_id=a.assignment_id) and a.lifecycle_state='active' and a.valid_from<=now() and(a.valid_until is null or a.valid_until>now()) and((s.scope_kind='tenant' and s.scope_value=$1)or(s.scope_kind='company' and s.scope_value=$4)) limit 1`,
      [c.tenantId, c.actor.userId, key, company],
    );
    if (!result.rowCount) deny();
  }
  private required(command: HrPerformanceCommand) {
    if (command.action === "save") return command.terms.kind === "review" ? "review" : "manage";
    if (["approve_goal", "submit_review"].includes(command.action)) return "review";
    if (["publish_review", "approve_outcome", "return_outcome"].includes(command.action)) return "publish";
    return "manage";
  }
  private async self(client: PoolClient, c: HrActorContext, employee: string | null) {
    return (
      !!employee &&
      (
        await client.query(
          "select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2 and user_id=$3 and ended_at is null and effective_from<=current_date and(effective_to is null or effective_to>=current_date)",
          [c.tenantId, employee, c.actor.userId],
        )
      ).rowCount !== 0
    );
  }
  private async independent(client: PoolClient, c: HrActorContext, r: Row) {
    if (
      [r.created_by, r.updated_by, r.submitted_by].includes(c.actor.userId) ||
      (await this.self(client, c, r.employee_id))
    )
      deny(
        "A separate officer must decide this record. Authors, submitting actors and the assessed employee cannot self-approve through an override.",
      );
  }
  private async load(client: PoolClient, c: HrActorContext, company: string, id: string) {
    const row = (
      await client.query(
        `select r.*,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name)) as employee_name,r.created_at::text,r.updated_at::text from hr_performance_record r left join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id where r.tenant_id=$1 and r.company_id=$2 and r.id=$3`,
        [c.tenantId, company, id],
      )
    ).rows[0];
    if (!row)
      throw new HrApiError(404, "HR_PERFORMANCE_NOT_FOUND", "The Performance record is unavailable in this company.");
    return row as Row;
  }
  private async employee(client: PoolClient, c: HrActorContext, company: string, id: string, cycle: Row) {
    const ok = await client.query(
      `select 1 from employee_assignment a left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=$1 and a.company_id=$2 and a.employee_id=$3 and a.effective_from<=$5::date and(a.effective_to is null or a.effective_to>=$4::date) and(a.assignment_status='legacy_compatibility' or(a.assignment_status='active' and er.approval_state='approved' and er.status='active')) limit 1`,
      [c.tenantId, company, id, cycle.terms.start_date, cycle.terms.end_date],
    );
    if (!ok.rowCount) fail("Choose an employee with authorized employment in this company during the cycle.");
  }
  private async goals(client: PoolClient, c: HrActorContext, company: string, cycle: string, employee: string) {
    const rows = (
      await client.query(
        `select * from hr_performance_record where tenant_id=$1 and company_id=$2 and parent_id=$3 and employee_id=$4 and kind='goal' and state<>'cancelled' order by id collate "C" limit 51`,
        [c.tenantId, company, cycle, employee],
      )
    ).rows as Row[];
    if (rows.length > 50) fail("A single employee review supports up to 50 goals.");
    const approved = rows.filter((g) => g.state === "approved");
    return {
      all: rows,
      approved,
      hash: attendanceHash(approved.map((g) => ({ id: g.id, version: g.version, terms: g.terms }))),
    };
  }
  private async validateReview(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    terms: Extract<HrPerformanceTerms, { kind: "review" }>,
  ) {
    const gs = await this.goals(client, c, company, terms.cycle_id, terms.employee_id);
    if (gs.hash !== terms.goals_hash || gs.all.some((g) => g.state !== "approved"))
      fail("Approve every goal and refresh the current goal evidence before reviewing.");
    const score = performanceScore(
      gs.approved.map((g) => ({ id: g.id, weight_bps: g.terms.weight_bps })),
      terms.ratings,
    );
    const contributions = (
      await client.query(
        "select id,version,kind,contributor_employee_id,summary,goals_hash,ratings from hr_performance_contribution where tenant_id=$1 and company_id=$2 and cycle_id=$3 and employee_id=$4 and state='submitted' order by id collate \"C\"",
        [c.tenantId, company, terms.cycle_id, terms.employee_id],
      )
    ).rows;
    return {
      ...(contributions.length ? { contributions, contributions_hash: attendanceHash(contributions) } : {}),
      ...score,
      goals_hash: gs.hash,
      rating_model: "weighted_five_point_v1",
      goals: gs.approved.map((g) => ({ id: g.id, version: g.version, ...g.terms })),
      ratings: terms.ratings,
    };
  }
  private async parentCycle(client: PoolClient, c: HrActorContext, company: string, r: Row) {
    if (r.kind === "cycle") return r;
    const p = await this.load(client, c, company, r.parent_id);
    return r.kind === "outcome" ? this.load(client, c, company, p.parent_id) : p;
  }
  private async allowed(client: PoolClient, c: HrActorContext, r: Row) {
    const result: string[] = [],
      company = r.company_id;
    const can = async (p: string, independent = false) => {
      try {
        await this.permission(client, c, company, p);
        if (independent) await this.independent(client, c, r);
        return true;
      } catch (e) {
        if (e instanceof HrApiError && e.status === 403) return false;
        throw e;
      }
    };
    const cycle = await this.parentCycle(client, c, company, r);
    if (r.kind !== "cycle" && cycle.state !== "active") return result;
    if (r.state === "draft" && (await can(r.kind === "review" ? "review" : "manage"))) result.push("edit");
    if (r.kind === "cycle" && (await can("manage"))) {
      if (r.state === "draft") result.push("activate", "cancel_cycle");
      if (r.state === "active") result.push("close_cycle");
    }
    if (r.kind === "goal" && r.state === "approved" && (await can("manage"))) result.push("revise_goal");
    if (r.kind === "goal" && r.state === "draft") {
      if (await can("review", true)) result.push("approve_goal");
      if (await can("manage")) result.push("cancel_goal");
    }
    if (r.kind === "review") {
      if (r.state === "draft" && (await can("review")) && !(await this.self(client, c, r.employee_id)))
        result.push("submit_review");
      if (r.state === "submitted" && (await can("publish", true))) result.push("publish_review", "return_review");
    }
    if (r.kind === "outcome") {
      if (r.state === "draft" && (await can("manage"))) result.push("submit_outcome");
      if (r.state === "submitted" && (await can("publish", true))) result.push("approve_outcome", "return_outcome");
      if (r.state === "approved" && (await can("manage"))) result.push("complete_outcome");
    }
    return result;
  }
  private async map(client: PoolClient, c: HrActorContext, r: Row): Promise<HrPerformanceRecord> {
    return {
      id: r.id,
      kind: r.kind,
      parent_id: r.parent_id,
      employee_id: r.employee_id,
      employee_name: r.employee_name ?? null,
      state: r.state,
      version: r.version,
      terms: r.terms,
      evidence: r.evidence,
      created_by: r.created_by,
      updated_by: r.updated_by,
      submitted_by: r.submitted_by,
      decided_by: r.decided_by,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
      allowed_actions: await this.allowed(client, c, r),
    };
  }
  async participationInbox(c: HrActorContext): Promise<HrPerformanceInbox> {
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      if (c.actor.tenantId !== c.tenantId) deny();
      const rows = (
        await client.query(
          `select distinct r.company_id,o.name as company_name,r.id as cycle_id,r.terms->>'title' as cycle_title,r.state from hr_performance_record r join organization_unit o on o.tenant_id=r.tenant_id and o.id=r.company_id join security_user_company_access a on a.tenant_id=r.tenant_id and a.company_id=r.company_id and a.user_id=$2 and a.revoked_at is null where r.tenant_id=$1 and r.kind='cycle' and(exists(select 1 from hr_performance_contribution p join employee_user_binding b on b.tenant_id=p.tenant_id and b.employee_id=p.contributor_employee_id and b.user_id=$2 and b.ended_at is null and b.effective_from<=current_date and(b.effective_to is null or b.effective_to>=current_date) where p.tenant_id=r.tenant_id and p.company_id=r.company_id and p.cycle_id=r.id)or exists(select 1 from hr_performance_record v join employee_user_binding b on b.tenant_id=v.tenant_id and b.employee_id=v.employee_id and b.user_id=$2 and b.ended_at is null and b.effective_from<=current_date and(b.effective_to is null or b.effective_to>=current_date) where v.tenant_id=r.tenant_id and v.company_id=r.company_id and v.parent_id=r.id and v.kind='review' and v.state='published')) order by cycle_title,cycle_id limit 101`,
          [c.tenantId, c.actor.userId],
        )
      ).rows;
      await client.query("commit");
      return { items: rows.slice(0, 100), truncated: rows.length > 100 };
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async participation(c: HrActorContext, q: HrPerformanceParticipationQuery): Promise<HrPerformanceParticipation> {
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      if (c.actor.tenantId !== c.tenantId) deny();
      await this.d.company(client, c, q.company_id);
      if (q.mode === "staff") await this.permission(client, c, q.company_id);
      let canInvite = false;
      if (q.mode === "staff")
        try {
          await this.permission(client, c, q.company_id, "manage");
          canInvite = true;
        } catch (e) {
          if (!(e instanceof HrApiError && e.status === 403)) throw e;
        }
      const cycle = await this.load(client, c, q.company_id, q.cycle_id);
      if (cycle.kind !== "cycle") fail("Select a Performance cycle.");
      const rows = (
        await client.query(
          `select p.*,concat_ws(' ',e.first_name,e.last_name) as employee_name,concat_ws(' ',v.first_name,v.last_name) as contributor_name from hr_performance_contribution p join employee e on e.tenant_id=p.tenant_id and e.id=p.employee_id join employee v on v.tenant_id=p.tenant_id and v.id=p.contributor_employee_id where p.tenant_id=$1 and p.company_id=$2 and p.cycle_id=$3 and($4::boolean or exists(select 1 from employee_user_binding b where b.tenant_id=p.tenant_id and b.employee_id=p.contributor_employee_id and b.user_id=$5 and b.ended_at is null and b.effective_from<=current_date and(b.effective_to is null or b.effective_to>=current_date))) order by p.created_at,p.id limit 201`,
          [c.tenantId, q.company_id, q.cycle_id, q.mode === "staff", c.actor.userId],
        )
      ).rows as Row[];
      const items: HrPerformanceParticipation["items"] = [];
      for (const p of rows.slice(0, 200)) {
        const gs = await this.goals(client, c, q.company_id, q.cycle_id, p.employee_id),
          own = await this.self(client, c, p.contributor_employee_id);
        items.push({
          id: p.id,
          employee_id: p.employee_id,
          employee_name: p.employee_name,
          contributor_employee_id: p.contributor_employee_id,
          contributor_name: p.contributor_name,
          kind: p.kind,
          state: p.state,
          version: p.version,
          summary: p.summary,
          goals_hash: p.state === "submitted" ? p.goals_hash : gs.hash,
          goals:
            p.state === "submitted"
              ? p.goals
              : gs.approved.map((g) => ({ id: g.id, title: g.terms.title, weight_bps: g.terms.weight_bps })),
          ratings: p.ratings,
          can_submit:
            own &&
            p.state === "invited" &&
            cycle.state === "active" &&
            gs.all.every((g) => g.state === "approved") &&
            gs.approved.reduce((n, g) => n + g.terms.weight_bps, 0) === 10000,
          can_withdraw: canInvite && p.state === "invited" && cycle.state === "active",
        });
      }
      const reviewRows = (
        await client.query(
          `select r.id,r.version,r.employee_id,concat_ws(' ',e.first_name,e.last_name) as employee_name,r.terms->>'summary' as summary,r.terms->>'strengths' as strengths,r.terms->>'development' as development,r.terms->'ratings' as raw_ratings,r.evidence->'goals' as raw_goals,r.evidence->>'score' as score,r.evidence->>'band' as band,a.created_at::text as acknowledged_at,a.comment as acknowledgement from hr_performance_record r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id left join hr_performance_acknowledgement a on a.tenant_id=r.tenant_id and a.review_id=r.id where r.tenant_id=$1 and r.company_id=$2 and r.parent_id=$3 and r.kind='review' and r.state='published' and($4::boolean or exists(select 1 from employee_user_binding b where b.tenant_id=r.tenant_id and b.employee_id=r.employee_id and b.user_id=$5 and b.ended_at is null and b.effective_from<=current_date and(b.effective_to is null or b.effective_to>=current_date))) order by r.id limit 201`,
          [c.tenantId, q.company_id, q.cycle_id, q.mode === "staff", c.actor.userId],
        )
      ).rows;
      const reviews: HrPerformanceParticipation["reviews"] = [];
      for (const r of reviewRows.slice(0, 200)) {
        const { raw_ratings, raw_goals, ...publicReview } = r;
        reviews.push({
          ...publicReview,
          ratings: raw_ratings.map((v: Row) => ({
            title: raw_goals.find((g: Row) => g.id === v.goal_id)?.title ?? v.goal_id,
            rating: v.rating,
            evidence: v.evidence,
          })),
          can_acknowledge: !r.acknowledged_at && (await this.self(client, c, r.employee_id)),
        });
      }
      await client.query("commit");
      return {
        company_id: q.company_id,
        cycle_id: q.cycle_id,
        mode: q.mode,
        can_invite: canInvite && cycle.state === "active",
        items,
        reviews,
        truncated: rows.length > 200 || reviewRows.length > 200,
      };
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  async participationAction(
    c: HrActorContext,
    input: HrPerformanceParticipationAction,
    key: string,
    corr: string,
  ): Promise<HrPayrollMutationResult> {
    if (
      c.actor.tenantId !== c.tenantId ||
      c.impersonationRequestId ||
      (c.realActorId && c.realActorId !== c.actor.userId)
    )
      deny("Use your own authenticated employee account.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.");
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      await this.d.company(client, c, input.company_id);
      if (input.action === "invite" || input.action === "withdraw") {
        await this.permission(client, c, input.company_id);
        await this.permission(client, c, input.company_id, "manage");
      }
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "nexora:hr:performance:" + c.tenantId + ":" + input.company_id,
      ]);
      const cycle = await this.load(client, c, input.company_id, input.cycle_id);
      if (cycle.kind !== "cycle") fail("Choose a Performance cycle.");
      let before: Row | null = null;
      if (input.action === "submit" || input.action === "withdraw") {
        before = (
          await client.query(
            "select * from hr_performance_contribution where tenant_id=$1 and company_id=$2 and cycle_id=$3 and id=$4",
            [c.tenantId, input.company_id, input.cycle_id, input.id],
          )
        ).rows[0];
        if (!before) throw new HrApiError(404, "HR_PERFORMANCE_NOT_FOUND", "This contribution is unavailable.");
        if (input.action === "submit" && !(await this.self(client, c, before.contributor_employee_id)))
          deny("Only the invited employee can submit this contribution.");
      }
      let review: Row | null = null;
      if (input.action === "acknowledge") {
        review = await this.load(client, c, input.company_id, input.review_id);
        if (
          review.kind !== "review" ||
          review.parent_id !== input.cycle_id ||
          review.state !== "published" ||
          !(await this.self(client, c, review.employee_id))
        )
          deny("Only the assessed employee can acknowledge their published review.");
      }
      const path = "/api/v1/hr/performance/participation/actions",
        fingerprint = attendanceHash(input),
        prior = (
          await client.query(
            "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
            [c.tenantId, c.actor.userId, path, key],
          )
        ).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fingerprint) fail("This key belongs to different terms.");
        await client.query("commit");
        return { ...prior.response_body, replayed: true };
      }
      if (input.action !== "acknowledge" && cycle.state !== "active") fail("The cycle must be active.");
      let id: string, status: string, version: number, after: Row;
      if (input.action === "invite") {
        await this.employee(client, c, input.company_id, input.employee_id, cycle);
        await this.employee(client, c, input.company_id, input.contributor_employee_id, cycle);
        if ((input.kind === "self") !== (input.employee_id === input.contributor_employee_id))
          fail("Self appraisal uses the same employee; peer feedback uses a different employee.");
        const binding = await client.query(
          "select 1 from employee_user_binding b join security_user_account u on u.tenant_id=b.tenant_id and u.id=b.user_id and u.status='active' and u.archived_at is null join security_user_company_access a on a.tenant_id=b.tenant_id and a.user_id=b.user_id and a.company_id=$3 and a.revoked_at is null where b.tenant_id=$1 and b.employee_id=$2 and b.ended_at is null and b.effective_from<=current_date and(b.effective_to is null or b.effective_to>=current_date)",
          [c.tenantId, input.contributor_employee_id, input.company_id],
        );
        if (binding.rowCount !== 1) fail("The contributor needs one active employee account with company access.");
        id = "performance-contribution-" + randomUUID();
        status = "invited";
        version = 1;
        after = (
          await client.query(
            `insert into hr_performance_contribution(tenant_id,company_id,id,cycle_id,employee_id,contributor_employee_id,kind,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$8) returning *`,
            [
              c.tenantId,
              input.company_id,
              id,
              input.cycle_id,
              input.employee_id,
              input.contributor_employee_id,
              input.kind,
              c.actor.userId,
            ],
          )
        ).rows[0];
      } else if (input.action === "acknowledge") {
        if (review!.version !== input.expected_version) fail("Refresh the published review before acknowledging.");
        id = review!.id;
        status = "acknowledged";
        version = review!.version;
        after = (
          await client.query(
            "insert into hr_performance_acknowledgement(tenant_id,company_id,review_id,review_version,employee_id,actor_id,comment) values($1,$2,$3,$4,$5,$6,$7) returning *",
            [c.tenantId, input.company_id, id, version, review!.employee_id, c.actor.userId, input.reason],
          )
        ).rows[0];
      } else {
        if (before!.version !== input.expected_version || before!.state !== "invited")
          fail("Refresh this outstanding invitation before acting.");
        id = before!.id;
        status = input.action === "submit" ? "submitted" : "withdrawn";
        version = before!.version + 1;
        let goals: unknown[] = [],
          ratings: unknown[] = [],
          hash = "",
          summary = "";
        if (input.action === "submit") {
          const gs = await this.goals(client, c, input.company_id, input.cycle_id, before!.employee_id);
          if (gs.hash !== input.goals_hash || gs.all.some((g) => g.state !== "approved"))
            fail("Refresh the agreed goals before submitting.");
          performanceScore(
            gs.approved.map((g) => ({ id: g.id, weight_bps: g.terms.weight_bps })),
            input.ratings,
          );
          goals = gs.approved.map((g) => ({ id: g.id, title: g.terms.title, weight_bps: g.terms.weight_bps }));
          ratings = input.ratings;
          hash = gs.hash;
          summary = input.summary;
        }
        after = (
          await client.query(
            "update hr_performance_contribution set state=$3,version=version+1,updated_by=$4,updated_at=clock_timestamp(),summary=$5,goals_hash=$6,goals=$7::jsonb,ratings=$8::jsonb where tenant_id=$1 and id=$2 returning *",
            [c.tenantId, id, status, c.actor.userId, summary, hash, JSON.stringify(goals), JSON.stringify(ratings)],
          )
        ).rows[0];
      }
      const audit = await this.d.audit(client, c, corr, id, before, {
        ...after,
        action: input.action,
        reason: input.reason,
        cycle_id: input.cycle_id,
      });
      const result = { id, company_id: input.company_id, status, version, audit_event_id: audit, replayed: false };
      await client.query(
        "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
        [c.tenantId, c.actor.userId, path, key, fingerprint, result, attendanceHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      if (e instanceof HrApiError) throw e;
      if (["23505", "23503", "23514", "P0001"].includes(String((e as { code?: string }).code)))
        throw new HrApiError(
          409,
          "HR_PERFORMANCE_REVIEW_REQUIRED",
          "The invitation, frozen goals or published review changed. Refresh and review outstanding contributions.",
        );
      throw e;
    } finally {
      client.release();
    }
  }

  async workspace(c: HrActorContext, q: HrPerformanceQuery): Promise<HrPerformanceWorkspace> {
    return this.d.read(c, "hr.performance.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      await this.permission(client, c, q.company_id);
      const cycles = (
        await client.query(
          `select *,created_at::text,updated_at::text from hr_performance_record where tenant_id=$1 and company_id=$2 and kind='cycle' order by hr_performance_record.created_at desc,hr_performance_record.id desc limit 101`,
          [c.tenantId, q.company_id],
        )
      ).rows as Row[];
      const cycle = q.cycle_id ? await this.load(client, c, q.company_id, q.cycle_id) : cycles[0];
      if (cycle && cycle.kind !== "cycle") fail("Select a Performance cycle.");
      const rows = cycle
        ? ((
            await client.query(
              `select r.*,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name)) as employee_name,r.created_at::text,r.updated_at::text from hr_performance_record r left join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id where r.tenant_id=$1 and r.company_id=$2 and(r.parent_id=$3 or r.parent_id in(select id from hr_performance_record where tenant_id=$1 and company_id=$2 and parent_id=$3 and kind='review')) order by r.created_at desc,r.id desc limit 2001`,
              [c.tenantId, q.company_id, cycle.id],
            )
          ).rows as Row[])
        : [];
      const blocked: string[] = [];
      if (rows.length > 2000)
        blocked.push(
          "This cycle exceeds the supported interactive record limit. Split future cycles or use a governed bulk workflow.",
        );
      if (cycles.length > 100)
        blocked.push("Only the latest 100 cycles are offered; older records remain preserved by ID.");
      let canCreate = false;
      try {
        await this.permission(client, c, q.company_id, q.section === "reviews" ? "review" : "manage");
        canCreate = q.section === "cycles" || cycle?.state === "active";
      } catch (e) {
        if (!(e instanceof HrApiError && e.status === 403)) throw e;
      }
      const candidates = q.section === "cycles" ? cycles : rows.filter((r) => r.kind === kinds[q.section]);
      const filtered = candidates.filter(
        (r) =>
          !q.search ||
          [r.employee_name, JSON.stringify(r.terms), r.state].join(" ").toLowerCase().includes(q.search.toLowerCase()),
      );
      const employees = cycle
        ? (
            await client.query(
              `select e.id,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name)) as label from employee e where e.tenant_id=$1 and concat_ws(' ',e.employee_number,e.first_name,e.middle_name,e.last_name) ilike $5 and exists(select 1 from employee_assignment a left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=e.tenant_id and a.employee_id=e.id and a.company_id=$2 and a.effective_from<=$4::date and(a.effective_to is null or a.effective_to>=$3::date) and(a.assignment_status='legacy_compatibility' or(a.assignment_status='active' and er.approval_state='approved' and er.status='active'))) order by e.employee_number,e.id limit 101`,
              [
                c.tenantId,
                q.company_id,
                cycle.terms.start_date,
                cycle.terms.end_date,
                "%" + q.employee_search.replace(/[\\%_]/g, "\\$&") + "%",
              ],
            )
          ).rows
        : [];
      const goalSets: HrPerformanceWorkspace["goal_sets"] = [];
      if (q.section === "reviews")
        for (const employee of [...new Set(rows.filter((r) => r.kind === "goal").map((r) => r.employee_id))].slice(
          0,
          500,
        )) {
          const goals = rows
            .filter((r) => r.kind === "goal" && r.employee_id === employee && r.state === "approved")
            .sort((a, b) => (a.id < b.id ? -1 : 1));
          if (goals.length > 50) continue;
          goalSets.push({
            employee_id: employee,
            employee_name: goals[0]?.employee_name ?? employee,
            source_hash: attendanceHash(goals.map((g) => ({ id: g.id, version: g.version, terms: g.terms }))),
            weight_bps: goals.reduce((n, g) => n + g.terms.weight_bps, 0),
            goals: await Promise.all(goals.map((g) => this.map(client, c, g))),
          });
        }
      const history = (
        await client.query(
          `select record_id,action,reason,actor_id,created_at::text from hr_performance_event where tenant_id=$1 and company_id=$2${cycle ? " and(record_id=$3 or after_json->>'cycle_id'=$3)" : ""} order by created_at desc,id desc limit 100`,
          cycle ? [c.tenantId, q.company_id, cycle.id] : [c.tenantId, q.company_id],
        )
      ).rows;
      return {
        company_id: q.company_id,
        section: q.section,
        cycle_id: cycle?.id ?? null,
        cycles: cycles.map((r) => ({ id: r.id, label: r.terms.title, state: r.state })),
        cycle: cycle ? await this.map(client, c, cycle) : null,
        items: await Promise.all(filtered.slice(q.offset, q.offset + q.limit).map((r) => this.map(client, c, r))),
        total: filtered.length,
        limit: q.limit,
        offset: q.offset,
        can_create: canCreate && !blocked.length,
        employees,
        employees_truncated: employees.length > 100,
        goal_sets: goalSets,
        published_reviews: await Promise.all(
          rows
            .filter((r) => r.kind === "review" && r.state === "published")
            .slice(0, 500)
            .map((r) => this.map(client, c, r)),
        ),
        blocked,
        history,
      };
    });
  }
  async command(
    c: HrActorContext,
    input: HrPerformanceCommand,
    key: string,
    corr: string,
  ): Promise<HrPayrollMutationResult> {
    if (c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId))
      deny("Impersonated sessions cannot change Performance records.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.");
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      await this.d.company(client, c, input.company_id);
      await this.permission(client, c, input.company_id);
      await this.permission(client, c, input.company_id, this.required(input));
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "nexora:hr:performance:" + c.tenantId + ":" + input.company_id,
      ]);
      const fingerprint = attendanceHash(input),
        path = "/api/v1/hr/performance/actions",
        prior = (
          await client.query(
            `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4`,
            [c.tenantId, c.actor.userId, path, key],
          )
        ).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fingerprint) fail("This key belongs to different Performance terms.");
        await client.query("commit");
        return { ...prior.response_body, replayed: true };
      }
      const old = input.record_id ? await this.load(client, c, input.company_id, input.record_id) : null;
      if ((old?.version ?? 0) !== input.expected_version)
        fail("The record changed. Refresh and review its current version.");
      const id = old?.id ?? "performance-" + randomUUID();
      let state = "draft",
        terms: HrPerformanceTerms,
        evidence: Row = {},
        parent: string | null = null,
        employee: string | null = null,
        submitted: string | null = old?.submitted_by ?? null,
        decided: string | null = old?.decided_by ?? null;
      if (input.action === "save") {
        terms = input.terms;
        if (old && (old.kind !== terms.kind || old.state !== "draft"))
          fail("Only a draft of the same record type can be edited.");
        if (terms.kind === "cycle") {
          if (terms.start_date > terms.end_date || terms.end_date > terms.review_due_date)
            fail("Order the cycle start, end and review due dates.");
        } else {
          parent = terms.kind === "outcome" ? terms.review_id : terms.cycle_id;
          let cycle = await this.load(client, c, input.company_id, parent);
          if (terms.kind === "outcome") {
            if (cycle.kind !== "review" || cycle.state !== "published") fail("Choose a published employee review.");
            employee = cycle.employee_id;
            cycle = await this.load(client, c, input.company_id, cycle.parent_id);
            await this.employee(client, c, input.company_id, terms.owner_employee_id, cycle);
            if (terms.due_date < cycle.terms.end_date) fail("Set the follow-up due date on or after the cycle end.");
          } else {
            employee = terms.employee_id;
            await this.employee(client, c, input.company_id, employee, cycle);
          }
          if (cycle.kind !== "cycle" || cycle.state !== "active") fail("Activate this company cycle first.");
          if (old && (old.parent_id !== parent || old.employee_id !== employee))
            fail("The cycle, review and employee cannot be reassigned.");
          if (terms.kind === "goal") {
            if (terms.due_date < cycle.terms.start_date || terms.due_date > cycle.terms.end_date)
              fail("Goal due dates must fall inside the cycle.");
            const gs = await this.goals(client, c, input.company_id, parent, employee!);
            if (
              gs.all.filter((g) => g.id !== id).reduce((n, g) => n + g.terms.weight_bps, 0) + terms.weight_bps >
              10000
            )
              fail("Employee goal weights cannot exceed 100%.");
          }
          if (terms.kind === "review") {
            if (await this.self(client, c, employee))
              deny("The assessed employee cannot write their own manager review.");
            evidence = await this.validateReview(client, c, input.company_id, terms);
          }
        }
      } else {
        if (!old) fail("Choose an existing Performance record.");
        terms = old!.terms;
        evidence = old!.evidence;
        parent = old!.parent_id;
        employee = old!.employee_id;
        if (input.action === "close_cycle") {
          const unfinished = (
            await client.query(
              `select 1 from hr_performance_record r where r.tenant_id=$1 and r.company_id=$2 and((r.parent_id=$3 and r.kind='goal' and r.state<>'cancelled' and not exists(select 1 from hr_performance_record v where v.tenant_id=r.tenant_id and v.parent_id=r.parent_id and v.employee_id=r.employee_id and v.kind='review' and v.state='published'))or(r.parent_id=$3 and r.kind='review' and(r.state<>'published' or not exists(select 1 from hr_performance_record o where o.tenant_id=r.tenant_id and o.parent_id=r.id and o.kind='outcome' and o.state='closed')))) limit 1`,
              [c.tenantId, input.company_id, old!.id],
            )
          ).rowCount;
          if (unfinished)
            fail("Publish every employee review and complete its approved follow-up before closing this cycle.");
        }
        if (input.action === "submit_review" || input.action === "publish_review") {
          const cycle = await this.parentCycle(client, c, input.company_id, old!),
            today = (await client.query("select current_date::text as today")).rows[0].today;
          if (cycle.terms.end_date > today) fail("Reviews can be submitted or published only after the cycle ends.");
        }
        const allowed = await this.allowed(client, c, old!);
        if (!allowed.includes(input.action))
          deny("This action is unavailable for your current role, actor or record state.");
        const transitions: Record<string, string> = {
          activate: "active",
          close_cycle: "closed",
          cancel_cycle: "cancelled",
          approve_goal: "approved",
          revise_goal: "draft",
          cancel_goal: "cancelled",
          submit_review: "submitted",
          publish_review: "published",
          return_review: "draft",
          submit_outcome: "submitted",
          approve_outcome: "approved",
          return_outcome: "draft",
          complete_outcome: "closed",
        };
        state = transitions[input.action]!;
        if (
          ["approve_goal", "publish_review", "approve_outcome", "return_review", "return_outcome"].includes(
            input.action,
          )
        ) {
          await this.independent(client, c, old!);
          decided = c.actor.userId;
        }
        if (["submit_review", "submit_outcome"].includes(input.action)) submitted = c.actor.userId;
        if (input.action === "submit_review" || input.action === "publish_review") {
          if (terms.kind !== "review") fail("Choose a review.");
          const current = await this.validateReview(
            client,
            c,
            input.company_id,
            terms as Extract<HrPerformanceTerms, { kind: "review" }>,
          );
          if (attendanceHash(current) !== attendanceHash(evidence))
            fail("The approved goal snapshot changed. Return to draft and save the review again.");
        }
      }
      if (old)
        await client.query(
          `update hr_performance_record set terms=$3::jsonb,evidence=$4::jsonb,state=$5,version=version+1,updated_by=$6,updated_at=clock_timestamp(),submitted_by=$7,decided_by=$8 where tenant_id=$1 and id=$2`,
          [c.tenantId, id, JSON.stringify(terms!), JSON.stringify(evidence), state, c.actor.userId, submitted, decided],
        );
      else
        await client.query(
          `insert into hr_performance_record(tenant_id,company_id,id,kind,parent_id,employee_id,state,terms,evidence,created_by,updated_by) values($1,$2,$3,$4,$5,$6,'draft',$7::jsonb,$8::jsonb,$9,$9)`,
          [
            c.tenantId,
            input.company_id,
            id,
            terms!.kind,
            parent,
            employee,
            JSON.stringify(terms!),
            JSON.stringify(evidence),
            c.actor.userId,
          ],
        );
      const after = await this.load(client, c, input.company_id, id),
        cycle = await this.parentCycle(client, c, input.company_id, after),
        event = { ...after, cycle_id: cycle.id };
      await client.query(
        `insert into hr_performance_event(tenant_id,company_id,id,record_id,record_version,action,reason,actor_id,before_json,after_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
        [
          c.tenantId,
          input.company_id,
          "performance-event-" + randomUUID(),
          id,
          after.version,
          input.action,
          input.reason,
          c.actor.userId,
          JSON.stringify(old),
          JSON.stringify(event),
        ],
      );
      const audit = await this.d.audit(client, c, corr, id, old, event),
        result = {
          id,
          company_id: input.company_id,
          status: after.state,
          version: after.version,
          audit_event_id: audit,
          replayed: false,
        };
      await client.query(
        `insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [c.tenantId, c.actor.userId, path, key, fingerprint, result, attendanceHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      if (e instanceof HrApiError) throw e;
      if (["23505", "23503", "23514", "P0001"].includes(String((e as { code?: string }).code)))
        throw Object.assign(
          new HrApiError(
            409,
            "HR_PERFORMANCE_REVIEW_REQUIRED",
            "Performance terms conflict with protected history, employee scope, goal weights, review evidence or record state. Refresh and review.",
          ),
          { cause: e },
        );
      throw e;
    } finally {
      client.release();
    }
  }
}
