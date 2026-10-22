import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { HrActorContext } from "./source-repository.js";
import { HrApiError } from "./source-repository.js";
import { requireHrCompanyPermission } from "./company-authority.js";
// Database projections are scoped and checked before any correction is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export const settlementVoidActions = ["request_void", "approve_void", "reject_void"] as const;
export type SettlementVoidAction = (typeof settlementVoidActions)[number];
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_SETTLEMENT_CORRECTION_REQUIRED", message);
};
const deny = (message: string): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
export async function settlementVoidHistory(client: PoolClient, c: HrActorContext, r: Row) {
  if (r.kind !== "settlement") return [];
  return (
    await client.query(
      "select id,state,case_version,requested_by,decided_by,reason,decision_reason,created_at::text,decided_at::text from hr_settlement_void_request where tenant_id=$1 and company_id=$2 and case_id=$3 order by created_at desc,id desc limit 25",
      [c.tenantId, r.company_id, r.id],
    )
  ).rows;
}
export async function requireSettlementVoidAuthority(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  id: string,
  action: SettlementVoidAction,
) {
  for (const key of [
    action === "request_void" ? "hr.employment_lifecycle.action" : "hr.employment_lifecycle.approve",
    "hr.leave.balance.read",
    ...(action === "approve_void" ? ["hr.leave.balance.adjust"] : []),
  ])
    await requireHrCompanyPermission(client, c, company, key);
  if (
    (
      await client.query(
        "select 1 from hr_lifecycle_case x join employee_user_binding b on b.tenant_id=x.tenant_id and b.employee_id=x.employee_id and b.ended_at is null where x.tenant_id=$1 and x.company_id=$2 and x.id=$3 and b.user_id=$4",
        [c.tenantId, company, id, c.actor.userId],
      )
    ).rowCount
  )
    deny("The affected employee cannot request or decide a settlement correction.");
  if (
    action !== "request_void" &&
    (
      await client.query(
        "select 1 from hr_settlement_void_request where tenant_id=$1 and company_id=$2 and case_id=$3 and id=(select id from hr_settlement_void_request where tenant_id=$1 and company_id=$2 and case_id=$3 order by created_at desc,id desc limit 1) and requested_by=$4",
        [c.tenantId, company, id, c.actor.userId],
      )
    ).rowCount
  )
    deny("A separate authorized officer must decide this correction.");
}
export async function settlementVoidBlockers(client: PoolClient, c: HrActorContext, r: Row): Promise<string[]> {
  const blockers: string[] = [];
  if (r.kind !== "settlement" || r.state !== "approved") return ["Choose an approved final settlement statement."];
  if (
    !(
      await client.query(
        "select 1 from hr_lifecycle_case x join hr_employment_relationship er on er.tenant_id=x.tenant_id and er.id=x.relationship_id where x.tenant_id=$1 and x.company_id=$2 and x.id=$3 and x.state='approved' and er.status='active' and er.approval_state='approved'",
        [c.tenantId, r.company_id, r.parent_id],
      )
    ).rowCount
  )
    blockers.push("Offboarding is complete or the exit is unavailable. Use the employment correction process.");
  if (
    (
      await client.query(
        "select 1 from hr_settlement_payroll_link l left join hr_payroll_adjustment a on a.tenant_id=l.tenant_id and a.company_id=l.company_id and a.id=l.adjustment_id where l.tenant_id=$1 and l.company_id=$2 and l.case_id=$3 and (a.state<>'rejected' or (a.id is null and (select (terms->'lines'->l.line_index->>'amount_minor')::numeric from hr_lifecycle_case where tenant_id=l.tenant_id and id=l.case_id)<>0)) limit 1",
        [c.tenantId, r.company_id, r.id],
      )
    ).rowCount
  )
    blockers.push(
      "This statement has active or consumed Payroll inputs. Submit draft inputs and have an independent Payroll reviewer reject them before correction. Consumed or finalized Payroll needs its governed reversal process.",
    );
  if (
    (
      await client.query(
        "select 1 from hr_payroll_period where tenant_id=$1 and company_id=$2 and month>=date_trunc('month',(select (terms->>'last_working_date')::date from hr_lifecycle_case where tenant_id=$1 and id=$3))::date and state<>'open' limit 1",
        [c.tenantId, r.company_id, r.parent_id],
      )
    ).rowCount
  )
    blockers.push("Payroll has been calculated or finalized. Use its governed correction process.");
  return blockers;
}
export async function applySettlementVoid(
  client: PoolClient,
  c: HrActorContext,
  r: Row,
  action: SettlementVoidAction,
  reason: string,
) {
  // Same lock order as Lifecycle encashment and its Payroll handoff.
  for (const prefix of ["nexora:hr:attendance:", "nexora:payroll:"])
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      prefix + c.tenantId + ":" + r.company_id,
    ]);
  if (r.kind !== "settlement" || r.state !== "approved")
    fail("Only an approved settlement can enter this correction process.");
  const history = await settlementVoidHistory(client, c, r),
    pending = history.find((x) => x.state === "submitted");
  if (action !== "reject_void") {
    const blockers = await settlementVoidBlockers(client, c, r);
    if (blockers.length) fail(blockers.join(" "));
  }
  if (action === "request_void") {
    if (pending) fail("An independent correction review is already pending.");
    await client.query(
      "insert into hr_settlement_void_request(tenant_id,company_id,id,case_id,case_version,requested_by,reason) values($1,$2,$3,$4,$5,$6,$7)",
      [c.tenantId, r.company_id, "settlement-void-" + randomUUID(), r.id, r.version, c.actor.userId, reason],
    );
  } else {
    if (!pending || pending.case_version + 1 !== r.version)
      fail("This correction review changed. Refresh before deciding.");
    if (pending.requested_by === c.actor.userId) deny("A separate authorized officer must decide this correction.");
    await client.query(
      "update hr_settlement_void_request set state=$3,decided_by=$4,decision_reason=$5,decided_at=clock_timestamp() where tenant_id=$1 and id=$2",
      [c.tenantId, pending.id, action === "approve_void" ? "approved" : "rejected", c.actor.userId, reason],
    );
    if (action === "approve_void") {
      // Restore only entries actually consumed by this approved statement; old sources stay immutable.
      await client.query(
        `insert into hr_leave_transaction(tenant_id,id,company_id,employee_id,leave_type_id,effective_on,kind,days,source_type,source_id,reason,created_by,policy_version_id,evidence_hash,evidence_json)
        select t.tenant_id,'encashment-void-'||gen_random_uuid(),t.company_id,t.employee_id,t.leave_type_id,t.effective_on,'encashment_reversal',-t.days,'settlement_void',t.source_id,$4,$5,t.policy_version_id,t.evidence_hash,jsonb_build_object('case_id',$3::text,'correction_id',$6::text,'original_entry_id',t.id)
        from hr_leave_transaction t join hr_settlement_encashment_source s on s.tenant_id=t.tenant_id and s.company_id=t.company_id and s.id=t.source_id
        where t.tenant_id=$1 and t.company_id=$2 and s.case_id=$3 and t.kind='encashed' and t.source_type='final_settlement'`,
        [c.tenantId, r.company_id, r.id, reason, c.actor.userId, pending.id],
      );
    }
  }
  await client.query(
    "update hr_lifecycle_case set state=$3,version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
    [c.tenantId, r.id, action === "approve_void" ? "cancelled" : "approved"],
  );
}
