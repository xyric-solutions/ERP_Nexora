import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { evaluateApprovalActor } from "@nexora/auth";
import type { ChangeFinanceHierarchyRequest } from "@nexora/contracts";
import type { FinanceNominalActorContext } from "./nominals/source-repository.js";
import { changeCoaMaster, CoaMasterError } from "./coa-master-change.js";
import { writeApprovalOverrideEvent } from "../security/approval-override-writer.js";

type Action = "created" | "updated" | "submitted" | "approved" | "rejected" | "activated" | "deactivated";
export async function changeHierarchyMaster(
  client: PoolClient,
  context: FinanceNominalActorContext,
  id: string,
  action: Action,
  expectedVersion: number,
  correlation: string,
  fields: { name?: string } = {},
  command: { idempotencyKey: string; reason?: string },
) {
  const account = (
    await client.query<{
      company_id: string;
      coa_version: string;
      status: string;
      parent_id: string | null;
      code: string;
    }>(
      "select company_id,coa_version,status,parent_id,code from account where tenant_id=$1 and id=$2 and is_header for update",
      [context.tenantId, id],
    )
  ).rows[0];
  if (!account) throw new CoaMasterError(404, "COA_MASTER_NOT_FOUND", "The hierarchy master was not found.");
  if (Number(account.coa_version) !== expectedVersion)
    throw new CoaMasterError(409, "NOMINAL_VERSION_CONFLICT", "The master changed. Reload its current version.");
  const previous = (
    await client.query<{ state: string }>(
      "select state from finance_coa_hierarchy_workflow where tenant_id=$1 and account_id=$2 order by record_version desc limit 1",
      [context.tenantId, id],
    )
  ).rows[0];
  if (!previous && action !== "created") {
    if (action === "submitted" || action === "approved" || action === "rejected")
      throw new CoaMasterError(
        409,
        "COA_WORKFLOW_REQUIRED",
        "This existing record retains its original active/inactive workflow.",
      );
    return changeCoaMaster(client, context, id, action, expectedVersion, correlation, fields);
  }
  const state = previous?.state ?? account.status;
  const allowed: Record<Action, string[]> = {
    created: ["inactive"],
    updated: ["draft", "active", "inactive"],
    submitted: ["draft"],
    approved: ["pending_approval"],
    rejected: ["pending_approval"],
    activated: ["inactive"],
    deactivated: ["active"],
  };
  if (!allowed[action].includes(state))
    throw new CoaMasterError(409, "COA_STATE_CONFLICT", "The master is not in a state that supports this action.");
  if (action === "rejected" && (!command.reason || command.reason.trim().length < 3))
    throw new CoaMasterError(
      400,
      "COA_REJECTION_REASON_REQUIRED",
      "Enter a rejection reason of at least three characters.",
    );
  const nextState =
    action === "created"
      ? "draft"
      : action === "submitted"
        ? "pending_approval"
        : action === "approved" || action === "activated"
          ? "active"
          : action === "rejected"
            ? "rejected"
            : action === "deactivated"
              ? "inactive"
              : state;
  const reason =
    command.reason?.trim() ?? `Hierarchy master ${action} by the authorized user. No financial posting was performed.`;
  let override: string | null = null;
  if (action === "approved" || action === "rejected") {
    const makers = await client.query<{ actor_id: string }>(
      "select actor_id from finance_coa_hierarchy_workflow where tenant_id=$1 and account_id=$2 and action in ('created','submitted')",
      [context.tenantId, id],
    );
    const makerActorIds = makers.rows.map((row) => row.actor_id);
    const decision = evaluateApprovalActor({
      account: context.actor,
      makerActorIds,
      normalDecisionPermission: "finance.nominal.approve",
      impersonated: !!context.realActorId || !!context.impersonationRequestId,
    });
    if (decision.kind === "forbidden")
      throw new CoaMasterError(
        403,
        "MAKER_CHECKER_REQUIRED",
        "An independent authorized checker must decide this request.",
      );
    if (decision.kind === "override")
      override = (
        await writeApprovalOverrideEvent(client, {
          tenantId: context.tenantId,
          account: context.actor,
          makerActorIds,
          normalDecisionPermission: "finance.nominal.approve",
          resourceType: "finance.hierarchy",
          resourceId: id,
          decisionAction: action === "approved" ? "approve" : "reject",
          reason,
          correlationId: correlation,
          idempotencyKey: `coa-override-${createHash("sha256")
            .update(JSON.stringify({ key: command.idempotencyKey, id }))
            .digest("hex")}`,
          metadata: { company_id: account.company_id, expected_version: expectedVersion },
        })
      ).eventId;
  }
  const masterAction =
    action === "submitted" || action === "rejected" ? "updated" : action === "approved" ? "activated" : action;
  const result = await changeCoaMaster(client, context, id, masterAction, expectedVersion, correlation, fields, {
    reason,
    approvalReference: override,
  });
  if (action === "approved" && account.parent_id)
    await client.query(
      "insert into finance_general_nominal_policy(tenant_id,company_id,section_id,category_id,prefix,code_width,next_value,last_value) values($1,$2,$3,$4,$5,2,1,99)",
      [context.tenantId, account.company_id, id, account.parent_id, account.code],
    );
  await client.query(
    "insert into finance_coa_hierarchy_workflow(tenant_id,company_id,account_id,record_version,change_id,state,action,actor_id,approval_override_event_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      context.tenantId,
      account.company_id,
      id,
      result.version,
      result.audit_event_id,
      nextState,
      action,
      context.actor.userId,
      override,
    ],
  );
  return result;
}

export function hierarchyAction(action: ChangeFinanceHierarchyRequest["action"]): Action {
  return action === "activate"
    ? "activated"
    : action === "deactivate"
      ? "deactivated"
      : action === "submit"
        ? "submitted"
        : action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : "updated";
}
