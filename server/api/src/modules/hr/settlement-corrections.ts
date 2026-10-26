import { calculateHrSettlementMinor } from "@nexora/contracts";
import { leaveDecimal, leaveUnits } from "./leave-balances.js";
import { settlementExecutionRecords } from "./settlement-correction-execution.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { HrLifecycleCaseAction, HrSettlementCorrectionWorkspace } from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { attendanceHash } from "./attendance-completion.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { requireSettlementBenefitRead } from "./settlement-benefits.js";
// All projections are tenant/company scoped and validated by the API contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type SettlementCorrectionAction = Extract<
  HrLifecycleCaseAction,
  { action: "request_financial_correction" | "decide_financial_correction" }
>;
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_SETTLEMENT_CORRECTION_REVIEW_REQUIRED", message);
};
const deny = (message: string): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
function reviewLeaveDays(
  snapshot: Row,
  line: Row,
  input: { line_index: number; corrected_minor: string; corrected_leave_days?: string | undefined },
) {
  const source = snapshot.leave_sources.find((x: Row) => Number(x.line_index) === input.line_index);
  if (!source) {
    if (input.corrected_leave_days !== undefined)
      fail("Only a retained leave encashment line can change encashed days.");
    return {};
  }
  const original_leave_days = leaveDecimal(leaveUnits(source.days)),
    corrected_leave_days = leaveDecimal(leaveUnits(input.corrected_leave_days ?? source.days));
  if (
    original_leave_days !== corrected_leave_days &&
    calculateHrSettlementMinor(
      corrected_leave_days,
      line.calculation.rate_minor,
      line.calculation.rate_divisor,
      line.calculation.rate_multiplier,
    ) !== input.corrected_minor
  )
    fail("Corrected encashment days must reconcile to the retained exact rate and approved day cap.");
  return { original_leave_days, corrected_leave_days };
}
const readPermissions = ["hr.payroll.setup.read", "hr.payroll.adjustment.read", "hr.payroll.result.read"];
export async function requireSettlementCorrectionAuthority(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  id: string,
  input?: SettlementCorrectionAction,
) {
  for (const key of [
    ...readPermissions,
    ...(input
      ? [
          input.action === "request_financial_correction"
            ? "hr.employment_lifecycle.action"
            : "hr.employment_lifecycle.approve",
        ]
      : []),
  ])
    await requireHrCompanyPermission(client, c, company, key);
  await requireSettlementBenefitRead(client, c, company, id);
  if (
    input?.action === "request_financial_correction" &&
    input.corrections.some((x) => x.corrected_leave_days !== undefined)
  )
    await requireHrCompanyPermission(client, c, company, "hr.leave.balance.read");
  if (
    input?.action === "decide_financial_correction" &&
    input.decision === "approve" &&
    (
      await client.query(
        "select 1 from hr_settlement_correction_review where tenant_id=$1 and company_id=$2 and case_id=$3 and id=$4 and exists(select 1 from jsonb_array_elements(lines) l where l->>'original_leave_days' is distinct from l->>'corrected_leave_days')",
        [c.tenantId, company, id, input.correction_id],
      )
    ).rowCount
  )
    await requireHrCompanyPermission(client, c, company, "hr.leave.balance.adjust");
  if (!input) return;
  if (
    (
      await client.query(
        "select 1 from hr_lifecycle_case x join employee_user_binding b on b.tenant_id=x.tenant_id and b.employee_id=x.employee_id and b.ended_at is null where x.tenant_id=$1 and x.company_id=$2 and x.id=$3 and b.user_id=$4",
        [c.tenantId, company, id, c.actor.userId],
      )
    ).rowCount
  )
    deny("The affected employee cannot request or decide a financial correction.");
  if (
    input.action === "decide_financial_correction" &&
    (
      await client.query(
        "select 1 from hr_settlement_correction_review where tenant_id=$1 and company_id=$2 and case_id=$3 and id=$4 and requested_by=$5",
        [c.tenantId, company, id, input.correction_id, c.actor.userId],
      )
    ).rowCount
  )
    deny("A separate authorized officer must decide the financial correction.");
}
async function context(client: PoolClient, c: HrActorContext, company: string, id: string) {
  return (
    await client.query("select hr_settlement_correction_context($1,$2,$3) as snapshot", [c.tenantId, company, id])
  ).rows[0]?.snapshot as Row | null;
}
function eligible(snapshot: Row | null) {
  return (
    !!snapshot &&
    (snapshot.employment_status === "ended" ||
      snapshot.exit_state === "closed" ||
      (snapshot.exit_payroll && snapshot.exit_payroll.state !== "open") ||
      snapshot.payroll_links.some((l: Row) => l.state === "consumed"))
  );
}
export async function settlementCorrectionWorkspace(
  client: PoolClient,
  c: HrActorContext,
  r: Row,
): Promise<HrSettlementCorrectionWorkspace | null> {
  if (r.kind !== "settlement" || r.state !== "approved") return null;
  try {
    await requireSettlementCorrectionAuthority(client, c, r.company_id, r.id);
  } catch (error) {
    if (error instanceof HrApiError && error.status === 403) return null;
    throw error;
  }
  const snapshot = await context(client, c, r.company_id, r.id);
  if (!eligible(snapshot)) return null;
  const rows = (
    await client.query(
      "select id,state,source_hash,lines,net_delta_minor,authority_reference,reason,requested_by,decided_by,decision_reason,created_at::text,decided_at::text from hr_settlement_correction_review where tenant_id=$1 and company_id=$2 and case_id=$3 order by created_at desc,id desc limit 25",
      [c.tenantId, r.company_id, r.id],
    )
  ).rows;
  const pendingVoid = !!(
    await client.query(
      "select 1 from hr_settlement_void_request where tenant_id=$1 and company_id=$2 and case_id=$3 and state='submitted'",
      [c.tenantId, r.company_id, r.id],
    )
  ).rowCount;
  const can = async (key: string) => {
    try {
      await requireHrCompanyPermission(client, c, r.company_id, key);
      return true;
    } catch (e) {
      if (e instanceof HrApiError && e.status === 403) return false;
      throw e;
    }
  };
  const self = !!(
    await client.query(
      "select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2 and user_id=$3 and ended_at is null",
      [c.tenantId, r.employee_id, c.actor.userId],
    )
  ).rowCount;
  const canDecide = !self && (await can("hr.employment_lifecycle.approve"));
  const sourceHash = attendanceHash(snapshot);
  return {
    can_calculate:
      !self &&
      (
        await Promise.all(["hr.payroll.period.manage", "hr.payroll.report.read", "finance.journal.read"].map(can))
      ).every(Boolean),
    base_lines: (snapshot!.settled_lines as Row[]).map((x) => ({
      line_index: Number(x.line_index),
      amount_minor: x.corrected_minor,
      leave_days: snapshot!.leave_sources.find((s: Row) => Number(s.line_index) === Number(x.line_index))?.days,
    })),
    executions: await settlementExecutionRecords(client, c, r),
    source_hash: sourceHash,
    can_request:
      !self &&
      !pendingVoid &&
      !rows.some((x) => ["submitted", "approved"].includes(x.state)) &&
      (await can("hr.employment_lifecycle.action")),
    records: rows.map((x) => ({
      ...x,
      can_approve:
        canDecide &&
        x.state === "submitted" &&
        x.requested_by !== c.actor.userId &&
        x.source_hash === sourceHash &&
        !pendingVoid,
      can_reject: canDecide && x.state === "submitted" && x.requested_by !== c.actor.userId,
      stale: x.state === "submitted" && x.source_hash !== sourceHash,
    })),
  };
}
export async function applySettlementCorrection(
  client: PoolClient,
  c: HrActorContext,
  r: Row,
  input: SettlementCorrectionAction,
) {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    "nexora:payroll:" + c.tenantId + ":" + r.company_id,
  ]);
  const snapshot = await context(client, c, r.company_id, r.id);
  if (!snapshot || !eligible(snapshot))
    fail("Use the pre-Payroll statement correction workflow until Payroll is calculated or offboarding is completed.");
  let before: Row | null = null,
    id: string;
  if (input.action === "request_financial_correction") {
    if (attendanceHash(snapshot) !== input.correction_source_hash)
      fail("Source evidence changed. Refresh before proposing the correction.");
    if (
      (
        await client.query(
          "select 1 from hr_settlement_correction_review where tenant_id=$1 and company_id=$2 and case_id=$3 and state in('submitted','approved')",
          [c.tenantId, r.company_id, r.id],
        )
      ).rowCount
    )
      fail("An unresolved financial correction already exists. Approved reviews still await Payroll processing.");
    if (
      (
        await client.query(
          "select 1 from hr_settlement_void_request where tenant_id=$1 and company_id=$2 and case_id=$3 and state='submitted'",
          [c.tenantId, r.company_id, r.id],
        )
      ).rowCount
    )
      fail("Resolve the pending statement void before requesting a financial correction.");
    const original = (snapshot!.terms.lines as Array<{ amount_minor: string; direction: string }>).map(
      (line, index) => ({
        ...line,
        amount_minor: snapshot!.settled_lines.find((x: Row) => Number(x.line_index) === index).corrected_minor,
      }),
    );
    if (
      input.corrections.length !== original.length ||
      new Set(input.corrections.map((x) => x.line_index)).size !== original.length ||
      input.corrections.some((x) => !original[x.line_index])
    )
      fail("Review every original statement line exactly once.");
    const lines = input.corrections
      .map((x) => ({
        line_index: x.line_index,
        original_minor: original[x.line_index]!.amount_minor,
        corrected_minor: x.corrected_minor,
        delta_minor: (BigInt(x.corrected_minor) - BigInt(original[x.line_index]!.amount_minor)).toString(),
        ...reviewLeaveDays(snapshot!, r.terms.lines[x.line_index], x),
      }))
      .sort((a, b) => a.line_index - b.line_index);
    if (lines.every((x) => x.delta_minor === "0" && x.original_leave_days === x.corrected_leave_days))
      fail("At least one proposed amount must differ from the original statement.");
    const net = lines
      .reduce(
        (sum, x) => sum + BigInt(x.delta_minor) * (original[x.line_index]!.direction === "earning" ? 1n : -1n),
        0n,
      )
      .toString();
    id = "settlement-correction-" + randomUUID();
    await client.query(
      "insert into hr_settlement_correction_review(tenant_id,company_id,id,case_id,source_hash,snapshot,lines,net_delta_minor,authority_reference,reason,requested_by) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)",
      [
        c.tenantId,
        r.company_id,
        id,
        r.id,
        input.correction_source_hash,
        JSON.stringify(snapshot),
        JSON.stringify(lines),
        net,
        input.authority_reference,
        input.reason,
        c.actor.userId,
      ],
    );
  } else {
    id = input.correction_id;
    before =
      (
        await client.query(
          "select * from hr_settlement_correction_review where tenant_id=$1 and company_id=$2 and case_id=$3 and id=$4 for update",
          [c.tenantId, r.company_id, r.id, id],
        )
      ).rows[0] ?? null;
    if (!before || before.state !== "submitted")
      fail("This correction was already decided or is unavailable. Refresh the review.");
    if (before!.requested_by === c.actor.userId)
      deny("A separate authorized officer must decide the financial correction.");
    if (input.decision === "approve" && before!.source_hash !== attendanceHash(snapshot))
      fail("Payroll or employment evidence changed. Reject this proposal and prepare a fresh review.");
    await client.query(
      "update hr_settlement_correction_review set state=$5,decided_by=$6,decision_reason=$7,decided_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and case_id=$3 and id=$4",
      [
        c.tenantId,
        r.company_id,
        r.id,
        id,
        input.decision === "approve" ? "approved" : "rejected",
        c.actor.userId,
        input.reason,
      ],
    );
  }
  const after = (
    await client.query("select * from hr_settlement_correction_review where tenant_id=$1 and company_id=$2 and id=$3", [
      c.tenantId,
      r.company_id,
      id,
    ])
  ).rows[0];
  return { id, before, after };
}
