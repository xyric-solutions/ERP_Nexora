import {
  isSettlementExecution,
  requireSettlementExecutionAuthority,
  applySettlementExecution,
} from "./settlement-correction-execution.js";
import {
  requireSettlementCorrectionAuthority,
  settlementCorrectionWorkspace,
  applySettlementCorrection,
} from "./settlement-corrections.js";
import {
  settlementVoidActions,
  settlementVoidHistory,
  settlementVoidBlockers,
  requireSettlementVoidAuthority,
  applySettlementVoid,
  type SettlementVoidAction,
} from "./settlement-void.js";
import {
  requireSettlementBenefitAuthority,
  reviewSettlementBenefits,
  requireSettlementBenefitRead,
} from "./settlement-benefits.js";
import { lifecycleSettlement } from "./settlement-calculation.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { reviewSettlementEncashment, requireSettlementEncashmentAuthority } from "./settlement-entitlements.js";
import { prepareSettlementPayroll, settlementPayrollLinks } from "./settlement-payroll.js";
import type { HrPolicyUpgradeQuery, HrPolicyUpgradeAction, HrPolicyUpgradeWorkspace } from "@nexora/contracts";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  HrLifecycleCaseTerms,
  HrLifecycleCaseQuery,
  HrLifecycleCaseAction,
  HrLifecycleCaseRecord,
  HrLifecycleCaseWorkspace,
  HrPayrollMutationResult,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import type { PayrollWorkspaceDependencies } from "./payroll-workspace.js";
import { attendanceHash } from "./attendance-completion.js";
// Explicit PostgreSQL projections are validated by the shared response contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_LIFECYCLE_REVIEW_REQUIRED", message);
};
const deny = (message = "Current company-scoped Lifecycle permission is required."): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
export { lifecycleSettlement } from "./settlement-calculation.js";
export class LifecycleCases {
  constructor(private readonly d: PayrollWorkspaceDependencies) {}
  private async permission(client: PoolClient, c: HrActorContext, company: string, key = "hr.employment_history.read") {
    return requireHrCompanyPermission(client, c, company, key);
  }
  private async self(client: PoolClient, c: HrActorContext, employee: string) {
    return !!(
      await client.query(
        "select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2 and user_id=$3 and ended_at is null",
        [c.tenantId, employee, c.actor.userId],
      )
    ).rowCount;
  }
  private async independent(client: PoolClient, c: HrActorContext, r: Row) {
    if (
      [r.created_by, r.updated_by, r.submitted_by].includes(c.actor.userId) ||
      (await this.self(client, c, r.employee_id))
    )
      deny(
        "A separate authorized officer must decide the case. Authors and the assessed employee cannot self-approve.",
      );
  }
  private async load(client: PoolClient, c: HrActorContext, company: string, id: string) {
    const r = (
      await client.query(
        "select x.*,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.last_name)) as employee_name,x.updated_at::text from hr_lifecycle_case x join employee e on e.tenant_id=x.tenant_id and e.id=x.employee_id where x.tenant_id=$1 and x.company_id=$2 and x.id=$3",
        [c.tenantId, company, id],
      )
    ).rows[0];
    if (!r) throw new HrApiError(404, "HR_LIFECYCLE_NOT_FOUND", "This case is unavailable in the selected company.");
    return r as Row;
  }
  private async relationship(client: PoolClient, c: HrActorContext, company: string, id: string) {
    const r = (
      await client.query(
        "select * from hr_employment_relationship where tenant_id=$1 and legal_employer_id=$2 and id=$3 for update",
        [c.tenantId, company, id],
      )
    ).rows[0];
    if (!r || r.approval_state !== "approved") fail("Choose an approved employment relationship from this company.");
    return r as Row;
  }
  private async allowed(client: PoolClient, c: HrActorContext, r: Row) {
    const a: string[] = [];
    try {
      await this.permission(client, c, r.company_id, "hr.employment_lifecycle.action");
      if (r.state === "draft") a.push("edit", "submit", "cancel");
      if (
        r.state === "approved" &&
        ["resignation", "termination"].includes(r.kind) &&
        !(await this.self(client, c, r.employee_id)) &&
        !(
          await client.query(
            "select 1 from hr_settlement_void_request v join hr_lifecycle_case s on s.tenant_id=v.tenant_id and s.id=v.case_id where v.tenant_id=$1 and v.company_id=$2 and s.parent_id=$3 and v.state='submitted' limit 1",
            [c.tenantId, r.company_id, r.id],
          )
        ).rowCount
      )
        a.push("apply_exit");
    } catch (e) {
      if (!(e instanceof HrApiError && e.status === 403)) throw e;
    }
    if (r.state === "submitted")
      try {
        await this.permission(client, c, r.company_id, "hr.employment_lifecycle.approve");
        await this.independent(client, c, r);
        a.push("approve", "return");
      } catch (e) {
        if (!(e instanceof HrApiError && e.status === 403)) throw e;
      }
    if (r.kind === "settlement" && r.state === "approved") {
      const pending = (await settlementVoidHistory(client, c, r)).find((v) => v.state === "submitted");
      const actions: SettlementVoidAction[] = pending ? ["approve_void", "reject_void"] : ["request_void"];
      for (const action of actions)
        try {
          await requireSettlementVoidAuthority(client, c, r.company_id, r.id, action);
          if (action === "reject_void" || !(await settlementVoidBlockers(client, c, r)).length) a.push(action);
        } catch (e) {
          if (!(e instanceof HrApiError && e.status === 403)) throw e;
        }
    }
    return a;
  }
  private async payrollAccess(client: PoolClient, c: HrActorContext, company: string, write = false) {
    try {
      for (const key of [
        "hr.payroll.adjustment.read",
        "hr.payroll.setup.read",
        ...(write ? ["hr.payroll.adjustment.manage"] : []),
      ])
        await this.permission(client, c, company, key);
      return true;
    } catch (e) {
      if (e instanceof HrApiError && e.status === 403) return false;
      throw e;
    }
  }
  private async map(
    client: PoolClient,
    c: HrActorContext,
    r: Row,
    payroll = { read: false, write: false },
  ): Promise<HrLifecycleCaseRecord> {
    const links = r.kind === "settlement" && payroll.read ? await settlementPayrollLinks(client, c, r) : [];
    const countrySources =
      r.kind === "settlement" ? await requireSettlementBenefitRead(client, c, r.company_id, r.id) : [];
    const corrections = await settlementVoidHistory(client, c, r);
    const financialCorrections = await settlementCorrectionWorkspace(client, c, r);
    return {
      financial_corrections: financialCorrections,
      country_sources: countrySources,
      void_requests: corrections,
      void_blockers:
        r.kind === "settlement" && r.state === "approved" ? await settlementVoidBlockers(client, c, r) : [],
      id: r.id,
      kind: r.kind,
      relationship_id: r.relationship_id,
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      state: r.state,
      version: r.version,
      terms: r.terms,
      evidence: r.evidence,
      created_by: r.created_by,
      updated_by: r.updated_by,
      submitted_by: r.submitted_by,
      decided_by: r.decided_by,
      updated_at: r.updated_at,
      payroll_links: links,
      can_prepare_payroll:
        r.kind === "settlement" &&
        r.state === "approved" &&
        payroll.write &&
        !corrections.some((v) => v.state === "submitted") &&
        !financialCorrections?.records.some((v) => v.state === "submitted") &&
        !links.some((l) => l.period_state && l.period_state !== "open") &&
        (!links.length || links.some((l) => ["rejected", "excluded"].includes(l.state))),
      allowed_actions: await this.allowed(client, c, r),
    };
  }
  private async upgradeSnapshot(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    relationshipId: string,
    targetId: string,
    date: string,
  ) {
    const rel = await this.relationship(client, c, company, relationshipId);
    if (rel.status !== "active") fail("Policy upgrades require active approved employment.");
    const last = (
      await client.query(
        "select id,sequence,event_type,effective_on::text,resulting_state_id from hr_employment_event where tenant_id=$1 and relationship_id=$2 order by sequence desc limit 1",
        [c.tenantId, relationshipId],
      )
    ).rows[0];
    const origin = (
      await client.query(
        "select r.*,s.code,s.label,s.canonical_class,p.code as policy_code,p.version as policy_version from resolve_hr_employment_policy($1,$2,$3::date)r join hr_employment_lifecycle_state s on s.tenant_id=$1 and s.id=r.state_id join hr_employment_lifecycle_policy p on p.tenant_id=$1 and p.id=r.policy_id",
        [c.tenantId, relationshipId, date],
      )
    ).rows[0];
    const target = (
      await client.query(
        "select p.id,p.code,p.name,p.version,p.status,p.effective_from::text,p.effective_to::text,s.id as target_state_id,s.label as target_state from hr_employment_lifecycle_policy p join hr_employment_lifecycle_state s on s.tenant_id=p.tenant_id and s.policy_id=p.id and s.code=$4 and s.canonical_class='employed' where p.tenant_id=$1 and p.legal_employer_id=$2 and p.id=$3 and p.status in('approved','active')",
        [c.tenantId, company, targetId, origin?.code ?? ""],
      )
    ).rows[0];
    const today = (await client.query("select current_date::text as date")).rows[0].date;
    if (!last || !origin || !target || origin.canonical_class !== "employed" || origin.policy_id === target.id)
      fail(
        "Select a different approved policy with the same employed state code. No employment state may be changed by an upgrade.",
      );
    if (
      date > today ||
      date < last.effective_on ||
      date < target.effective_from ||
      (target.effective_to && date > target.effective_to)
    )
      fail(
        "Choose an effective date no earlier than the latest employment event, no later than today, and within the approved target policy period.",
      );
    const later = await client.query(
      "select 1 from hr_employment_policy_adoption where tenant_id=$1 and relationship_id=$2 and state='approved' and effective_on>=$3::date limit 1",
      [c.tenantId, relationshipId, date],
    );
    if (later.rowCount) fail("Choose a date after the employee’s existing approved policy upgrade.");
    const exits = (
      await client.query(
        "select t.event_type from hr_employment_lifecycle_transition t join hr_employment_lifecycle_state s on s.tenant_id=t.tenant_id and s.id=t.to_state_id and s.canonical_class='ended' where t.tenant_id=$1 and t.policy_id=$2 and t.from_state_id=$3 and t.event_type in('resignation','termination') order by t.event_type",
        [c.tenantId, targetId, target.target_state_id],
      )
    ).rows;
    if (new Set(exits.map((r) => r.event_type)).size !== 2)
      fail("The replacement policy must authorize governed resignation and termination from the retained state.");
    const pending = await client.query(
      "select 1 from hr_employment_lifecycle_request where tenant_id=$1 and relationship_id=$2 and approval_state='pending' limit 1",
      [c.tenantId, relationshipId],
    );
    if (pending.rowCount) fail("Resolve pending employment lifecycle requests before changing policy authority.");
    const impacts = (
      await client.query(
        "select id,kind,state,version from hr_lifecycle_case where tenant_id=$1 and company_id=$2 and relationship_id=$3 and state not in('closed','cancelled') order by id collate \"C\" limit 201",
        [c.tenantId, company, relationshipId],
      )
    ).rows;
    if (impacts.length > 200) fail("This employment has too many open cases for an interactive policy upgrade.");
    return {
      relationship_id: rel.id,
      employee_id: rel.employee_id,
      source_policy_id: origin.policy_id,
      source_policy: origin.policy_code + " v" + origin.policy_version,
      source_event: last,
      previous_adoption_id: origin.adoption_id,
      from_state_id: origin.state_id,
      from_state: origin.label,
      target_policy: target,
      effective_on: date,
      affected_cases: impacts,
    };
  }
  private async upgradeAllowed(client: PoolClient, c: HrActorContext, r: Row) {
    const actions: string[] = [];
    if (r.state !== "pending") return actions;
    try {
      await this.permission(client, c, r.company_id, "hr.employment_lifecycle_policy.manage");
      await this.permission(client, c, r.company_id, "hr.employment_lifecycle.action");
      actions.push("cancel");
    } catch (e) {
      if (!(e instanceof HrApiError && e.status === 403)) throw e;
    }
    try {
      await this.permission(client, c, r.company_id, "hr.employment_lifecycle_policy.approve");
      await this.permission(client, c, r.company_id, "hr.employment_lifecycle.approve");
      if (r.requested_by !== c.actor.userId && !(await this.self(client, c, r.employee_id)))
        actions.push("approve", "reject");
    } catch (e) {
      if (!(e instanceof HrApiError && e.status === 403)) throw e;
    }
    return actions;
  }
  async policyUpgrades(c: HrActorContext, q: HrPolicyUpgradeQuery): Promise<HrPolicyUpgradeWorkspace> {
    return this.d.read(c, "hr.employment_lifecycle_policy.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      await this.permission(client, c, q.company_id, "hr.employment_lifecycle_policy.read");
      await this.permission(client, c, q.company_id);
      const search = "%" + q.search.replace(/[\\%_]/g, "\\$&") + "%",
        where =
          "a.tenant_id=$1 and a.company_id=$2 and concat_ws(' ',e.employee_number,e.first_name,e.last_name,sp.code,tp.code,a.state) ilike $3";
      const base = `from hr_employment_policy_adoption a join hr_employment_relationship r on r.tenant_id=a.tenant_id and r.id=a.relationship_id join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id join hr_employment_lifecycle_policy sp on sp.tenant_id=a.tenant_id and sp.id=a.source_policy_id join hr_employment_lifecycle_policy tp on tp.tenant_id=a.tenant_id and tp.id=a.target_policy_id`;
      const total = (
        await client.query(`select count(*)::int as count ${base} where ${where}`, [c.tenantId, q.company_id, search])
      ).rows[0].count;
      const rows = (
        await client.query(
          `select a.*,r.employee_id,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.last_name)) as employee_name,sp.code||' v'||sp.version as source_policy,tp.code||' v'||tp.version as target_policy,fs.label as from_state,ts.label as target_state,a.effective_on::text,a.created_at::text ${base} join hr_employment_lifecycle_state fs on fs.tenant_id=a.tenant_id and fs.id=a.from_state_id join hr_employment_lifecycle_state ts on ts.tenant_id=a.tenant_id and ts.id=a.target_state_id where ${where} order by a.created_at desc,a.id desc limit $4 offset $5`,
          [c.tenantId, q.company_id, search, q.limit, q.offset],
        )
      ).rows as Row[];
      const items: HrPolicyUpgradeWorkspace["items"] = [];
      for (const r of rows)
        items.push({
          id: r.id,
          relationship_id: r.relationship_id,
          employee_name: r.employee_name,
          source_policy_id: r.source_policy_id,
          source_policy: r.source_policy,
          target_policy_id: r.target_policy_id,
          target_policy: r.target_policy,
          from_state: r.from_state,
          target_state: r.target_state,
          effective_on: r.effective_on,
          state: r.state,
          version: r.version,
          requested_by: r.requested_by,
          decided_by: r.decided_by,
          reason: r.reason,
          decision_reason: r.decision_reason,
          snapshot: r.snapshot,
          created_at: r.created_at,
          allowed_actions: await this.upgradeAllowed(client, c, r),
        });
      const relationships = (
        await client.query(
          "select r.id,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.last_name),r.relationship_number) as label,p.id as effective_policy_id,p.code||' v'||p.version as effective_policy,s.label as current_state from hr_employment_relationship r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id cross join lateral resolve_hr_employment_policy(r.tenant_id,r.id,current_date) x join hr_employment_lifecycle_policy p on p.tenant_id=r.tenant_id and p.id=x.policy_id join hr_employment_lifecycle_state s on s.tenant_id=r.tenant_id and s.id=x.state_id and s.canonical_class='employed' where r.tenant_id=$1 and r.legal_employer_id=$2 and r.status='active' and r.approval_state='approved' and concat_ws(' ',e.employee_number,e.first_name,e.last_name,r.relationship_number) ilike $3 order by e.employee_number,r.id limit 201",
          [c.tenantId, q.company_id, search],
        )
      ).rows;
      const policies = (
        await client.query(
          "select id,code||' v'||version||' · '||name||' · '||status as label,effective_from::text,effective_to::text from hr_employment_lifecycle_policy where tenant_id=$1 and legal_employer_id=$2 and status in('approved','active') and effective_from<=current_date and(effective_to is null or effective_to>=current_date) order by created_at desc,id desc limit 201",
          [c.tenantId, q.company_id],
        )
      ).rows;
      let canRequest = false;
      try {
        await this.permission(client, c, q.company_id, "hr.employment_lifecycle_policy.manage");
        await this.permission(client, c, q.company_id, "hr.employment_lifecycle.action");
        canRequest = true;
      } catch (e) {
        if (!(e instanceof HrApiError && e.status === 403)) throw e;
      }
      return {
        company_id: q.company_id,
        items,
        total,
        limit: q.limit,
        offset: q.offset,
        can_request: canRequest,
        relationships: relationships.slice(0, 200),
        policies: policies.slice(0, 200),
        truncated: relationships.length > 200 || policies.length > 200,
      };
    });
  }
  async policyUpgradeAction(
    c: HrActorContext,
    input: HrPolicyUpgradeAction,
    key: string,
    corr: string,
  ): Promise<HrPayrollMutationResult> {
    if (c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId))
      deny("Use your own authorized account to change employment policy.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.");
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      await this.d.company(client, c, input.company_id);
      await this.permission(client, c, input.company_id);
      await this.permission(client, c, input.company_id, "hr.employment_lifecycle_policy.read");
      const approving = ["approve", "reject"].includes(input.action);
      for (const permission of approving
        ? ["hr.employment_lifecycle_policy.approve", "hr.employment_lifecycle.approve"]
        : ["hr.employment_lifecycle_policy.manage", "hr.employment_lifecycle.action"])
        await this.permission(client, c, input.company_id, permission);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "nexora:hr:lifecycle-cases:" + c.tenantId + ":" + input.company_id,
      ]);
      if (approving && input.action !== "request") {
        const identity = (
          await client.query(
            "select a.requested_by,r.employee_id from hr_employment_policy_adoption a join hr_employment_relationship r on r.tenant_id=a.tenant_id and r.id=a.relationship_id where a.tenant_id=$1 and a.company_id=$2 and a.id=$3",
            [c.tenantId, input.company_id, input.id],
          )
        ).rows[0];
        if (
          identity &&
          (identity.requested_by === c.actor.userId || (await this.self(client, c, identity.employee_id)))
        )
          deny("An independent authorized officer must decide the policy upgrade.");
      }
      const path = "/api/v1/hr/policy_upgrades/actions",
        hash = attendanceHash(input),
        prior = (
          await client.query(
            "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
            [c.tenantId, c.actor.userId, path, key],
          )
        ).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== hash) fail("This key belongs to different policy upgrade terms.");
        await client.query("commit");
        return { ...prior.response_body, replayed: true };
      }
      let before: Row | null = null,
        id: string;
      if (input.action === "request") {
        const snapshot = await this.upgradeSnapshot(
          client,
          c,
          input.company_id,
          input.relationship_id,
          input.target_policy_id,
          input.effective_on,
        );
        id = "policy-upgrade-" + randomUUID();
        await client.query(
          "insert into hr_employment_policy_adoption(tenant_id,company_id,id,relationship_id,source_policy_id,target_policy_id,source_event_id,previous_adoption_id,from_state_id,target_state_id,effective_on,snapshot,source_hash,reason,requested_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)",
          [
            c.tenantId,
            input.company_id,
            id,
            input.relationship_id,
            snapshot.source_policy_id,
            input.target_policy_id,
            snapshot.source_event.id,
            snapshot.previous_adoption_id,
            snapshot.from_state_id,
            snapshot.target_policy.target_state_id,
            input.effective_on,
            JSON.stringify(snapshot),
            attendanceHash(snapshot),
            input.reason,
            c.actor.userId,
          ],
        );
      } else {
        const r = (
          await client.query(
            "select a.*,a.effective_on::text,r.employee_id from hr_employment_policy_adoption a join hr_employment_relationship r on r.tenant_id=a.tenant_id and r.id=a.relationship_id where a.tenant_id=$1 and a.company_id=$2 and a.id=$3 for update of a",
            [c.tenantId, input.company_id, input.id],
          )
        ).rows[0] as Row | undefined;
        if (!r)
          throw new HrApiError(
            404,
            "HR_POLICY_UPGRADE_NOT_FOUND",
            "This policy upgrade is unavailable in the selected company.",
          );
        if (r.version !== input.expected_version || r.state !== "pending")
          fail("Refresh this pending policy upgrade before deciding.");
        if (!(await this.upgradeAllowed(client, c, r)).includes(input.action))
          deny("A separate authorized officer must approve or reject the upgrade; the employee cannot self-approve.");
        if (input.action === "approve") {
          const current = await this.upgradeSnapshot(
            client,
            c,
            input.company_id,
            r.relationship_id,
            r.target_policy_id,
            r.effective_on,
          );
          if (attendanceHash(current) !== r.source_hash)
            fail(
              "Employment, policy or affected case evidence changed. Cancel this request and prepare a fresh upgrade for independent review.",
            );
        }
        before = r;
        id = r.id;
        await client.query(
          "update hr_employment_policy_adoption set state=$3,version=version+1,decided_by=$4,decision_reason=$5,decided_at=clock_timestamp() where tenant_id=$1 and id=$2",
          [
            c.tenantId,
            id,
            { approve: "approved", reject: "rejected", cancel: "cancelled" }[input.action],
            c.actor.userId,
            input.reason,
          ],
        );
      }
      const after = (
        await client.query("select * from hr_employment_policy_adoption where tenant_id=$1 and id=$2", [c.tenantId, id])
      ).rows[0];
      const audit = await this.d.audit(client, c, corr, id, before, {
          ...after,
          action: input.action,
          reason: input.reason,
        }),
        result = {
          id,
          company_id: input.company_id,
          status: after.state,
          version: after.version,
          audit_event_id: audit,
          replayed: false,
        };
      await client.query(
        "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
        [c.tenantId, c.actor.userId, path, key, hash, result, attendanceHash(result)],
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
            "HR_POLICY_UPGRADE_REVIEW_REQUIRED",
            "The upgrade conflicts with approved policy boundaries, current employment, state mapping or independent approval. Refresh and review.",
          ),
          { cause: e },
        );
      throw e;
    } finally {
      client.release();
    }
  }

  async workspace(c: HrActorContext, q: HrLifecycleCaseQuery): Promise<HrLifecycleCaseWorkspace> {
    return this.d.read(c, "hr.employment_history.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      await this.permission(client, c, q.company_id);
      const values: unknown[] = [c.tenantId, q.company_id];
      const kindWhere = q.section === "offboarding" ? "x.kind in('resignation','termination')" : "x.kind=$3";
      if (q.section !== "offboarding") values.push(q.section);
      values.push("%" + q.search.replace(/[\\%_]/g, "\\$&") + "%");
      const where = `x.tenant_id=$1 and x.company_id=$2 and ${kindWhere} and concat_ws(' ',e.employee_number,e.first_name,e.last_name,x.state,x.terms::text) ilike $${values.length}`;
      const total = (
        await client.query(
          `select count(*)::int as total from hr_lifecycle_case x join employee e on e.tenant_id=x.tenant_id and e.id=x.employee_id where ${where}`,
          values,
        )
      ).rows[0].total;
      const rows = (
        await client.query(
          `select x.*,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.last_name)) as employee_name,x.updated_at::text from hr_lifecycle_case x join employee e on e.tenant_id=x.tenant_id and e.id=x.employee_id where ${where} order by x.updated_at desc,x.id desc limit $${values.length + 1} offset $${values.length + 2}`,
          [...values, q.limit, q.offset],
        )
      ).rows as Row[];
      const relationships = (
        await client.query(
          "select r.id,r.employee_id,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.last_name),r.relationship_number) as label,r.status,(select policy_id from resolve_hr_employment_policy(r.tenant_id,r.id,current_date)) as policy_id from hr_employment_relationship r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id where r.tenant_id=$1 and r.legal_employer_id=$2 and r.approval_state='approved' and r.status in('active','suspended') and concat_ws(' ',e.employee_number,e.first_name,e.last_name,r.relationship_number) ilike $3 order by e.employee_number,r.id limit 201",
          [c.tenantId, q.company_id, "%" + q.search.replace(/[\\%_]/g, "\\$&") + "%"],
        )
      ).rows;
      const exits = (
        await client.query(
          "select x.*,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.last_name)) as employee_name,x.updated_at::text from hr_lifecycle_case x join employee e on e.tenant_id=x.tenant_id and e.id=x.employee_id where x.tenant_id=$1 and x.company_id=$2 and x.kind in('resignation','termination') and x.state='approved' order by x.updated_at desc,x.id desc limit 201",
          [c.tenantId, q.company_id],
        )
      ).rows as Row[];
      let canCreate = false;
      try {
        await this.permission(client, c, q.company_id, "hr.employment_lifecycle.action");
        canCreate = q.section !== "offboarding";
      } catch (e) {
        if (!(e instanceof HrApiError && e.status === 403)) throw e;
      }
      const currencies = (
        await client.query(
          "select code,decimal_places from currency where tenant_id=$1 and status='active' and decimal_places<=4 order by code limit 200",
          [c.tenantId],
        )
      ).rows;
      const history = (
        await client.query(
          "select record_id,action,reason,actor_id,created_at::text from hr_lifecycle_case_event where tenant_id=$1 and company_id=$2 order by created_at desc,id desc limit 100",
          [c.tenantId, q.company_id],
        )
      ).rows;
      const payrollRead = q.section === "settlement" && (await this.payrollAccess(client, c, q.company_id));
      const payrollWrite = payrollRead && canCreate && (await this.payrollAccess(client, c, q.company_id, true));
      return {
        company_id: q.company_id,
        section: q.section,
        currencies,
        payroll_components: payrollRead
          ? (
              await client.query(
                "select id,code,name,kind from hr_pay_component where tenant_id=$1 and company_id=$2 and status='active' and method='fixed' order by code,id limit 200",
                [c.tenantId, q.company_id],
              )
            ).rows
          : [],
        items: await Promise.all(rows.map((r) => this.map(client, c, r, { read: payrollRead, write: payrollWrite }))),
        total,
        limit: q.limit,
        offset: q.offset,
        can_create: canCreate,
        relationships: relationships.slice(0, 200),
        exits: await Promise.all(exits.slice(0, 200).map((r) => this.map(client, c, r))),
        history,
        truncated: relationships.length > 200 || exits.length > 200,
      };
    });
  }
  private async transition(
    client: PoolClient,
    c: HrActorContext,
    r: Row,
    eventType: string,
    effective: string,
    caseId: string,
    reason: string,
  ) {
    if (!r.lifecycle_policy_id) fail("This relationship needs a governed lifecycle policy before a status change.");
    const last = (
      await client.query(
        "select * from hr_employment_event where tenant_id=$1 and relationship_id=$2 order by sequence desc limit 1",
        [c.tenantId, r.id],
      )
    ).rows[0];
    const effectiveAuthority = (
      await client.query("select * from resolve_hr_employment_policy($1,$2,$3::date)", [c.tenantId, r.id, effective])
    ).rows[0];
    const transition = (
      await client.query(
        "select * from hr_employment_lifecycle_transition where tenant_id=$1 and policy_id=$2 and event_type=$3 and from_state_id=$4",
        [c.tenantId, effectiveAuthority?.policy_id, eventType, effectiveAuthority?.state_id],
      )
    ).rows[0];
    if (!last || !transition)
      fail(
        "The approved employment policy does not authorize this transition from the current state. Review Lifecycle Policies before proceeding.",
      );
    if (last.effective_on.toISOString?.().slice(0, 10) > effective) fail("A later employment event already exists.");
    const id = "employment-event-" + randomUUID();
    await client.query(
      "insert into hr_employment_event(id,tenant_id,relationship_id,sequence,event_type,effective_on,previous_state_id,resulting_state_id,recorded_by,approved_by,approved_at,source_reference,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,now(),$10,$11)",
      [
        id,
        c.tenantId,
        r.id,
        last.sequence + 1,
        eventType,
        effective,
        last.resulting_state_id,
        transition.to_state_id,
        c.actor.userId,
        "hr:lifecycle-case:" + caseId,
        reason,
      ],
    );
    return id;
  }
  private validate(terms: HrLifecycleCaseTerms, relationship: Row) {
    if (relationship.status === "ended") fail("This employment relationship has ended.");
    if (terms.kind === "probation") {
      if (
        terms.effective_date <
        String(
          relationship.effective_from instanceof Date
            ? relationship.effective_from.toISOString().slice(0, 10)
            : relationship.effective_from,
        )
      )
        fail("The probation review cannot precede employment.");
      if (
        terms.recommendation === "extend" &&
        (!terms.extension_until || terms.extension_until <= terms.effective_date)
      )
        fail("An extension needs a new end date after the review date.");
      if (terms.recommendation === "confirm" && terms.extension_until)
        fail("A confirmation does not take a probation extension date.");
    }
    if (
      (terms.kind === "resignation" || terms.kind === "termination") &&
      terms.last_working_date <
        String(
          relationship.effective_from instanceof Date
            ? relationship.effective_from.toISOString().slice(0, 10)
            : relationship.effective_from,
        )
    )
      fail("The last working date cannot precede employment.");
  }
  async command(
    c: HrActorContext,
    input: HrLifecycleCaseAction,
    key: string,
    corr: string,
  ): Promise<HrPayrollMutationResult> {
    if (c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId))
      deny("Impersonated sessions cannot change lifecycle cases.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.");
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      await this.d.company(client, c, input.company_id);
      await this.permission(client, c, input.company_id);
      await this.permission(
        client,
        c,
        input.company_id,
        isSettlementExecution(input)
          ? input.action === "post_payroll_correction"
            ? "finance.journal.post"
            : input.action === "calculate_payroll_correction"
              ? "hr.payroll.period.manage"
              : "hr.payroll.period.approve"
          : ["approve", "return", "approve_void", "reject_void", "decide_financial_correction"].includes(input.action)
            ? "hr.employment_lifecycle.approve"
            : "hr.employment_lifecycle.action",
      );
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "nexora:hr:lifecycle-cases:" + c.tenantId + ":" + input.company_id,
      ]);
      if (input.action === "prepare_payroll" && !(await this.payrollAccess(client, c, input.company_id, true)))
        deny("Current company-scoped Payroll setup read, adjustment read and manage authority is required.");
      if (isSettlementExecution(input))
        await requireSettlementExecutionAuthority(client, c, input.company_id, input.id, input);
      if (input.action === "request_financial_correction" || input.action === "decide_financial_correction")
        await requireSettlementCorrectionAuthority(client, c, input.company_id, input.id, input);
      if (settlementVoidActions.includes(input.action as SettlementVoidAction))
        await requireSettlementVoidAuthority(
          client,
          c,
          input.company_id,
          input.id!,
          input.action as SettlementVoidAction,
        );
      if (input.action !== "save" && input.action !== "prepare_payroll")
        await requireSettlementEncashmentAuthority(client, c, input.company_id, input.id, input.action);
      if (input.action !== "save" && input.action !== "prepare_payroll")
        await requireSettlementBenefitAuthority(client, c, input.company_id, input.id, input.action);
      if (input.action === "prepare_payroll") await requireSettlementBenefitRead(client, c, input.company_id, input.id);
      const path = "/api/v1/hr/lifecycle_cases/actions",
        fingerprint = attendanceHash(input),
        prior = (
          await client.query(
            "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
            [c.tenantId, c.actor.userId, path, key],
          )
        ).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fingerprint) fail("This key belongs to different lifecycle terms.");
        await client.query("commit");
        return { ...prior.response_body, replayed: true };
      }
      const old = input.id ? await this.load(client, c, input.company_id, input.id) : null;
      if ((old?.version ?? 0) !== input.expected_version)
        fail("The case changed. Refresh and review the current version.");
      if (isSettlementExecution(input)) {
        if (!old || old.kind !== "settlement" || old.state !== "approved")
          fail("Choose the retained approved settlement statement.");
        const change = await applySettlementExecution(client, c, old!, input, key, corr);
        const audit = await this.d.audit(client, c, corr, change.id, change.before, change.after);
        const result = {
          id: old!.id,
          company_id: input.company_id,
          status: "supplemental_payroll_" + change.after.state,
          version: old!.version,
          audit_event_id: audit,
          replayed: false,
        };
        await client.query(
          "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
          [c.tenantId, c.actor.userId, path, key, fingerprint, result, attendanceHash(result)],
        );
        await client.query("commit");
        return result;
      }
      if (input.action === "request_financial_correction" || input.action === "decide_financial_correction") {
        if (!old) fail("Choose an approved settlement statement.");
        const change = await applySettlementCorrection(client, c, old!, input);
        const audit = await this.d.audit(client, c, corr, change.id, change.before, change.after);
        const result = {
          id: old!.id,
          company_id: input.company_id,
          status: "correction_review_" + change.after.state,
          version: old!.version,
          audit_event_id: audit,
          replayed: false,
        };
        await client.query(
          "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
          [c.tenantId, c.actor.userId, path, key, fingerprint, result, attendanceHash(result)],
        );
        await client.query("commit");
        return result;
      }
      if (input.action === "request_void" || input.action === "approve_void" || input.action === "reject_void") {
        if (!old) fail("Choose an approved statement.");
        await applySettlementVoid(client, c, old!, input.action, input.reason);
        const after = await this.load(client, c, input.company_id, old!.id);
        await client.query(
          "insert into hr_lifecycle_case_event(tenant_id,company_id,id,record_id,version,action,reason,actor_id,before_json,after_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)",
          [
            c.tenantId,
            input.company_id,
            "lifecycle-event-" + randomUUID(),
            old!.id,
            after.version,
            input.action,
            input.reason,
            c.actor.userId,
            JSON.stringify(old),
            JSON.stringify(after),
          ],
        );
        const audit = await this.d.audit(client, c, corr, old!.id, old, after),
          result = {
            id: old!.id,
            company_id: input.company_id,
            status: after.state,
            version: after.version,
            audit_event_id: audit,
            replayed: false,
          };
        await client.query(
          "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
          [c.tenantId, c.actor.userId, path, key, fingerprint, result, attendanceHash(result)],
        );
        await client.query("commit");
        return result;
      }
      if (input.action === "prepare_payroll") {
        if (!old) fail("Choose an approved settlement statement.");
        const after = await prepareSettlementPayroll(client, c, old!, input);
        const audit = await this.d.audit(client, c, corr, old!.id, old, after);
        const result = {
          id: old!.id,
          company_id: input.company_id,
          status: "payroll_inputs_prepared",
          version: old!.version,
          audit_event_id: audit,
          replayed: false,
        };
        await client.query(
          "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
          [c.tenantId, c.actor.userId, path, key, fingerprint, result, attendanceHash(result)],
        );
        await client.query("commit");
        return result;
      }
      const terms: HrLifecycleCaseTerms = input.action === "save" ? input.terms : old!.terms;
      let parent: Row | null = null;
      if (terms.kind === "clearance" || terms.kind === "settlement") {
        parent = await this.load(client, c, input.company_id, terms.exit_case_id);
        if (!["resignation", "termination"].includes(parent.kind) || parent.state !== "approved")
          fail("Choose an approved exit case.");
      }
      const relationshipId = parent?.relationship_id ?? ("relationship_id" in terms ? terms.relationship_id : ""),
        rel = await this.relationship(client, c, input.company_id, relationshipId);
      if (old && (old.relationship_id !== rel.id || old.kind !== terms.kind || old.parent_id !== (parent?.id ?? null)))
        fail("Case identity cannot be reassigned.");
      this.validate(terms, rel);
      if (terms.kind === "onboarding" || terms.kind === "clearance") {
        const expected =
          terms.kind === "onboarding"
            ? ["identity", "employment", "access", "equipment", "payroll"]
            : ["assets", "access", "finance", "knowledge", "hr"];
        if (terms.tasks.length !== expected.length || expected.some((id) => !terms.tasks.some((t) => t.id === id)))
          fail("Use every required checklist task; no mandatory control can be removed.");
      }
      let moneyScale = 2;
      if (terms.kind === "settlement") {
        const currency = (
          await client.query(
            "select decimal_places from currency where tenant_id=$1 and code=$2 and status='active' and decimal_places<=4",
            [c.tenantId, terms.currency],
          )
        ).rows[0];
        if (!currency) fail("Choose an active supported currency.");
        moneyScale = currency.decimal_places;
      }
      let state = "draft",
        submitted = old?.submitted_by ?? null,
        decided = old?.decided_by ?? null,
        evidence: Row =
          terms.kind === "settlement"
            ? {
                ...lifecycleSettlement(terms.lines),
                currency: terms.currency,
                money_scale: moneyScale,
                reviewed_sources: terms.lines.map((l) => l.source_reference),
              }
            : (old?.evidence ?? {});
      const id = old?.id ?? "lifecycle-case-" + randomUUID();
      if (terms.kind === "settlement" && ["save", "submit", "approve"].includes(input.action))
        await reviewSettlementBenefits(client, c, input.company_id, id, terms);
      if (terms.kind === "settlement" && ["save", "submit", "approve"].includes(input.action))
        await reviewSettlementEncashment(
          client,
          c,
          input.company_id,
          id,
          terms,
          input.action as "save" | "submit" | "approve",
        );
      if (input.action === "save") {
        if (old?.state && old.state !== "draft") fail("Only draft cases can be edited.");
      } else {
        if (!old) fail("Choose an existing case.");
        const allowed = await this.allowed(client, c, old!);
        if (!allowed.includes(input.action)) deny("This action is unavailable for the current actor or case state.");
        state = {
          submit: "submitted",
          approve: "approved",
          return: "draft",
          cancel: "cancelled",
          apply_exit: "closed",
        }[input.action];
        if (
          ["submit", "approve"].includes(input.action) &&
          (terms.kind === "onboarding" || terms.kind === "clearance") &&
          terms.tasks.some((t) => !t.complete || t.evidence.length < 5)
        )
          fail("Complete every required checklist task with evidence before submitting.");
        if (["submit", "approve"].includes(input.action) && terms.kind === "clearance") {
          const activeAccount = await client.query(
            "select 1 from employee_user_binding b join security_user_account u on u.tenant_id=b.tenant_id and u.id=b.user_id and u.status='active' and u.archived_at is null where b.tenant_id=$1 and b.employee_id=$2 and b.ended_at is null and b.effective_from<=current_date and(b.effective_to is null or b.effective_to>=current_date) limit 1",
            [c.tenantId, rel.employee_id],
          );
          if (activeAccount.rowCount)
            fail(
              "Deactivate the departing employee’s linked account through Security before approving exit clearance. Recording a checklist note does not revoke access.",
            );
        }
        const today = (await client.query("select current_date::text as today")).rows[0].today;
        if (input.action === "submit") submitted = c.actor.userId;
        if (input.action === "approve") {
          await this.independent(client, c, old!);
          decided = c.actor.userId;
          if (terms.kind === "probation") {
            if (terms.effective_date > today) fail("Approve the probation decision on or after its effective date.");
            if (terms.recommendation === "confirm") {
              evidence = {
                employment_event_id: await this.transition(
                  client,
                  c,
                  rel,
                  "confirmation",
                  terms.effective_date,
                  id,
                  input.reason,
                ),
                result: "confirmed",
              };
              await client.query(
                "update employee set status='confirmed',updated_at=now() where tenant_id=$1 and id=$2",
                [c.tenantId, rel.employee_id],
              );
            } else evidence = { result: "probation_extended", extension_until: terms.extension_until };
          }
        }
        if (input.action === "apply_exit") {
          if (terms.kind !== "resignation" && terms.kind !== "termination")
            fail("Choose an approved resignation or termination.");
          const exitTerms = terms as Extract<HrLifecycleCaseTerms, { kind: "resignation" | "termination" }>;
          if (exitTerms.last_working_date > today) fail("The approved last working date has not arrived.");
          const children = (
            await client.query(
              "select kind,id,version,evidence from hr_lifecycle_case where tenant_id=$1 and company_id=$2 and parent_id=$3 and state='approved' and kind in('clearance','settlement')",
              [c.tenantId, input.company_id, id],
            )
          ).rows;
          if (children.length !== 2)
            fail("Approve this exit’s clearance and final settlement statement before offboarding.");
          const pendingPayroll = await client.query(
            "select 1 from hr_payroll_result r join hr_payroll_period p on p.tenant_id=r.tenant_id and p.company_id=r.company_id and p.id=r.period_id where r.tenant_id=$1 and r.company_id=$2 and r.employee_id=$3 and r.run_number=p.run_number and p.state not in('posted','paid','closed') limit 1",
            [c.tenantId, input.company_id, rel.employee_id],
          );
          if (pendingPayroll.rowCount)
            fail("Finalize or correct this employee’s pending Payroll results before closing employment.");
          const future = await client.query(
            "select 1 from employee_assignment where tenant_id=$1 and employment_relationship_id=$2 and assignment_status in('active','legacy_compatibility') and(effective_from>$3::date or(effective_to is not null and effective_to>$3::date)) limit 1",
            [c.tenantId, rel.id, exitTerms.last_working_date],
          );
          if (future.rowCount)
            fail("Resolve future or already closed assignment segments after the last working date first.");
          const pending = await client.query(
            `select 1 from hr_employee_transfer_request where tenant_id=$1 and relationship_id=$2 and request_state='pending' union all select 1 from hr_employee_promotion_request where tenant_id=$1 and relationship_id=$2 and request_state='pending' union all select 1 from hr_employee_manager_change_request where tenant_id=$1 and relationship_id=$2 and request_state='pending' union all select 1 from hr_employee_work_location_change_request where tenant_id=$1 and relationship_id=$2 and request_state='pending' union all select 1 from hr_employee_organization_placement_change_request where tenant_id=$1 and relationship_id=$2 and request_state='pending' limit 1`,
            [c.tenantId, rel.id],
          );
          if (pending.rowCount) fail("Resolve pending assignment movements before offboarding.");
          await client.query(
            "update employee_assignment set effective_to=$3,assignment_status='ended' where tenant_id=$1 and employment_relationship_id=$2 and assignment_status in('active','legacy_compatibility') and effective_to is null",
            [c.tenantId, rel.id, exitTerms.last_working_date],
          );
          const event = await this.transition(
            client,
            c,
            rel,
            exitTerms.kind,
            exitTerms.last_working_date,
            id,
            input.reason,
          );
          await client.query(
            "update hr_employment_relationship set status='ended',effective_to=$3,updated_at=now() where tenant_id=$1 and id=$2",
            [c.tenantId, rel.id, exitTerms.last_working_date],
          );
          await client.query("update employee set status=$3,updated_at=now() where tenant_id=$1 and id=$2", [
            c.tenantId,
            rel.employee_id,
            exitTerms.kind === "resignation" ? "resigned" : "terminated",
          ]);
          evidence = {
            employment_event_id: event,
            closed_assignment_date: exitTerms.last_working_date,
            approved_handoffs: children,
            payment_status: "not_paid",
            posting_status: "statement_only",
          };
        }
      }
      if (old)
        await client.query(
          "update hr_lifecycle_case set terms=$3::jsonb,evidence=$4::jsonb,state=$5,version=version+1,updated_by=$6,submitted_by=$7,decided_by=$8,updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
          [c.tenantId, id, JSON.stringify(terms), JSON.stringify(evidence), state, c.actor.userId, submitted, decided],
        );
      else
        await client.query(
          "insert into hr_lifecycle_case(tenant_id,company_id,id,relationship_id,employee_id,parent_id,kind,terms,evidence,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10)",
          [
            c.tenantId,
            input.company_id,
            id,
            rel.id,
            rel.employee_id,
            parent?.id ?? null,
            terms.kind,
            JSON.stringify(terms),
            JSON.stringify(evidence),
            c.actor.userId,
          ],
        );
      const after = await this.load(client, c, input.company_id, id);
      await client.query(
        "insert into hr_lifecycle_case_event(tenant_id,company_id,id,record_id,version,action,reason,actor_id,before_json,after_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)",
        [
          c.tenantId,
          input.company_id,
          "lifecycle-event-" + randomUUID(),
          id,
          after.version,
          input.action,
          input.reason,
          c.actor.userId,
          JSON.stringify(old),
          JSON.stringify(after),
        ],
      );
      const audit = await this.d.audit(client, c, corr, id, old, after),
        result = {
          id,
          company_id: input.company_id,
          status: after.state,
          version: after.version,
          audit_event_id: audit,
          replayed: false,
        };
      await client.query(
        "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
        [c.tenantId, c.actor.userId, path, key, fingerprint, result, attendanceHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      if (e instanceof HrApiError) throw e;
      if (["23505", "23503", "23514", "P0001", "23P01"].includes(String((e as { code?: string }).code)))
        throw Object.assign(
          new HrApiError(
            409,
            "HR_LIFECYCLE_REVIEW_REQUIRED",
            "The case conflicts with approved employment, immutable history, required evidence or an existing lifecycle case. Refresh and review.",
          ),
          { cause: e },
        );
      throw e;
    } finally {
      client.release();
    }
  }
}
