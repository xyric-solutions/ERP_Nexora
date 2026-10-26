import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import {
  bankPaymentDimensionsSchema,
  bankWorkflowOptionQuerySchema,
  bankWorkflowOptionsSchema,
  type BankWorkflowOptionQuery,
  type BankWorkflowOptions,
} from "@nexora/contracts";
import { BankingApiError, type BankingActorContext } from "./source-repository.js";
export interface BankWorkflowContext {
  project_id?: string | null | undefined;
  location_id?: string | null | undefined;
  approver_user_id?: string | null | undefined;
  delegated_decision_id?: string | null | undefined;
  approver_reassignment_id?: string | null | undefined;
}
type TransactionKind = "payment" | "receipt" | "transfer" | "revaluation";
export async function globalBankOverride(
  client: PoolClient,
  context: BankingActorContext,
  company: string,
): Promise<boolean> {
  if (
    context.impersonationRequestId ||
    context.realActorId ||
    context.tenantId !== context.actor.tenantId ||
    !context.actor.roles.includes("super_administrator") ||
    !context.actor.permissions.includes("platform.approval.override")
  )
    return false;
  const result = await client.query<{ allowed: boolean }>(
    "select bank_has_live_permission($1,$2,$3,'platform.approval.override',true) as allowed",
    [context.tenantId, company, context.actor.userId],
  );
  return result.rows[0]?.allowed === true;
}
export async function validateBankApprover(
  client: PoolClient,
  context: BankingActorContext,
  kind: TransactionKind,
  company: string,
  approver: string | null | undefined,
  makerIds: readonly string[],
  required: boolean,
) {
  if (!approver) {
    if (required)
      throw new BankingApiError(400, "BANK_APPROVER_REQUIRED", "Select an eligible approver before submitting.");
    return;
  }
  const result = await client.query<{ allowed: boolean; self_allowed: boolean }>(
    `select bank_has_live_permission($1,$2,$3,$4) as allowed,
    (bank_has_live_permission($1,$2,$3,'platform.approval.override',true) or bank_can_self_approve($1,$2,$3,$5)) as self_allowed`,
    [context.tenantId, company, approver, `banking.${kind}.approve`, kind],
  );
  if (!result.rows[0]?.allowed || (makerIds.includes(approver) && !result.rows[0]?.self_allowed))
    throw new BankingApiError(
      400,
      "BANK_APPROVER_INELIGIBLE",
      "The selected approver is inactive, outside company scope, unauthorized, or not permitted to self-approve.",
    );
}
export async function normalizeBankDimensions<T extends { dimensions: Record<string, string> }>(
  client: PoolClient,
  tenant: string,
  company: string,
  input: BankWorkflowContext,
  lines: readonly T[],
): Promise<T[]> {
  for (const [kind, selected] of [
    ["project", input.project_id],
    ["location", input.location_id],
  ] as const) {
    if (!selected) continue;
    const table = kind === "project" ? "erp_project" : "erp_location";
    const active = await client.query(
      `select id from ${table} where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for share`,
      [tenant, company, selected],
    );
    if (!active.rowCount)
      throw new BankingApiError(400, "BANK_CONTEXT_INELIGIBLE", `Select an active ${kind} belonging to this company.`);
  }
  return lines.map((line) => {
    const dimensions = { ...line.dimensions };
    for (const [key, selected] of [
      ["project", input.project_id],
      ["location", input.location_id],
    ] as const) {
      if (dimensions[key] && dimensions[key] !== selected)
        throw new BankingApiError(
          400,
          "BANK_CONTEXT_CONFLICT",
          `The line ${key} dimension conflicts with the selected company master.`,
        );
      if (selected) dimensions[key] = selected;
    }
    const parsed = bankPaymentDimensionsSchema.safeParse(dimensions);
    if (!parsed.success)
      throw new BankingApiError(
        400,
        "BANK_CONTEXT_DIMENSIONS_INVALID",
        "Accounting dimensions, including selected project/location, exceed the supported limits.",
      );
    return { ...line, dimensions: parsed.data };
  });
}
export function updatedBankContext(
  previous: BankWorkflowContext,
  input: BankWorkflowContext,
): { project_id: string | null; location_id: string | null; approver_user_id: string | null } {
  return {
    project_id: input.project_id === undefined ? (previous.project_id ?? null) : input.project_id,
    location_id: input.location_id === undefined ? (previous.location_id ?? null) : input.location_id,
    approver_user_id:
      input.approver_user_id === undefined ? (previous.approver_user_id ?? null) : input.approver_user_id,
  };
}
export async function requireAssignedBankDecision(
  client: PoolClient,
  context: BankingActorContext,
  kind: TransactionKind,
  row: BankWorkflowContext & { company_id: string; created_by: string; submitted_by: string | null },
) {
  if (!row.approver_user_id) return false; // Preserve the pre-migration independent checker queue.
  await validateBankApprover(
    client,
    context,
    kind,
    row.company_id,
    row.approver_user_id,
    [row.created_by, row.submitted_by ?? ""],
    true,
  );
  if (row.approver_user_id === context.actor.userId) return false;
  if (!(await globalBankOverride(client, context, row.company_id)))
    throw new BankingApiError(
      403,
      "BANK_ASSIGNED_CHECKER_REQUIRED",
      "Only the assigned checker may decide this transaction.",
    );
  return true;
}
export async function recordBankAssignmentIntervention(
  client: PoolClient,
  context: BankingActorContext,
  kind: TransactionKind,
  row: BankWorkflowContext & { id: string; company_id: string; row_version: number | string },
  audit: string,
) {
  const column = `${kind}_id`;
  await client.query(
    `insert into bank_assignment_intervention(tenant_id,company_id,id,${column},record_version,assigned_user_id,actor_id,audit_event_id) values($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      context.tenantId,
      row.company_id,
      randomUUID(),
      row.id,
      row.row_version,
      row.approver_user_id,
      context.actor.userId,
      audit,
    ],
  );
}
export async function bankContextDetail(
  client: PoolClient,
  context: BankingActorContext,
  row: BankWorkflowContext & {
    id: string;
    company_id: string;
    state: string;
    created_by: string;
    submitted_by: string | null;
  },
  kind: TransactionKind,
) {
  const labels = await client.query<{
    project_name: string | null;
    location_name: string | null;
    approver_name: string | null;
  }>(
    `select
    (select name from erp_project where tenant_id=$1 and company_id=$2 and id=$3) as project_name,
    (select name from erp_location where tenant_id=$1 and company_id=$2 and id=$4) as location_name,
    (select coalesce(display_name,id) from security_user_account where tenant_id=$1 and id=$5) as approver_name`,
    [context.tenantId, row.company_id, row.project_id ?? null, row.location_id ?? null, row.approver_user_id ?? null],
  );
  const grant = await delegatedBankDecisionGrant(client, context, kind, row);
  const admin = await globalBankOverride(client, context, row.company_id);
  const history = await client.query(
    `select id,record_version::integer as version,previous_user_id,assigned_user_id,actor_id,
    to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as occurred_at
    from bank_approver_reassignment where tenant_id=$1 and company_id=$2 and ${kind}_id=$3 order by record_version desc limit 100`,
    [context.tenantId, row.company_id, row.id],
  );
  const normal = await client.query<{ allowed: boolean }>("select bank_has_live_permission($1,$2,$3,$4) as allowed", [
    context.tenantId,
    row.company_id,
    context.actor.userId,
    `banking.${kind}.approve`,
  ]);
  return {
    ...updatedBankContext(row, {}),
    ...labels.rows[0],
    delegated_decision_id: row.delegated_decision_id ?? null,
    delegated_self_approval_allowed: grant !== null,
    can_reassign_approver: row.state === "submitted" && admin && normal.rows[0]?.allowed === true,
    approver_history: history.rows,
    assigned_decision_allowed: !row.approver_user_id || row.approver_user_id === context.actor.userId || admin,
  };
}
const cursorSchema = z.strictObject({ id: z.string().max(128), scope: z.string().length(64) });
export async function bankWorkflowOptions(
  client: PoolClient,
  context: BankingActorContext,
  transactionKind: TransactionKind,
  input: BankWorkflowOptionQuery,
): Promise<BankWorkflowOptions> {
  const query = bankWorkflowOptionQuerySchema.parse(input);
  const scope = createHash("sha256")
    .update(
      JSON.stringify([
        context.tenantId,
        query.company_id,
        transactionKind,
        query.kind,
        query.search ?? "",
        query.limit,
      ]),
    )
    .digest("hex");
  let cursor = "";
  if (query.cursor) {
    try {
      const decoded = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")));
      if (decoded.scope !== scope) throw new Error("scope");
      cursor = decoded.id;
    } catch {
      throw new BankingApiError(
        400,
        "BANK_CONTEXT_CURSOR_INVALID",
        "This continuation does not match the selected company and filters.",
      );
    }
  }
  const search = `%${(query.search ?? "").replace(/[\\%_]/g, "\\$&")}%`;
  let sql: string;
  const values: unknown[] = [
    context.tenantId,
    query.company_id,
    context.actor.userId,
    `banking.${transactionKind}.approve`,
  ];
  if (query.kind === "approver")
    sql = `select u.id,''::text as code,coalesce(u.display_name,u.id) as name,
    (bank_has_live_permission($1,$2,u.id,$4) and (u.id<>$3 or bank_has_live_permission($1,$2,u.id,'platform.approval.override',true) or bank_can_self_approve($1,$2,u.id,'${transactionKind}'))) as eligible,
    (u.id=$3 and (bank_has_live_permission($1,$2,u.id,'platform.approval.override',true) or bank_can_self_approve($1,$2,u.id,'${transactionKind}'))) as self_approval
    from security_user_account u where u.tenant_id=$1 and exists(select 1 from security_user_company_access a where a.tenant_id=u.tenant_id and a.company_id=$2 and a.user_id=u.id)`;
  else {
    const table = query.kind === "project" ? "erp_project" : "erp_location";
    // Keep fixed parameter positions shared by the two projections.
    sql = `select id,code,name,(status='active') as eligible,false as self_approval from ${table} where tenant_id=$1 and company_id=$2 and $3::text is not null and $4::text is not null`;
  }
  const items = await client.query(
    `select * from (${sql}) options where eligible and id>$5 and (name ilike $6 escape '\\' or code ilike $6 escape '\\') order by id limit $7`,
    [...values, cursor, search, query.limit + 1],
  );
  const selected = query.selected_id
    ? await client.query(`select * from (${sql}) options where id=$5`, [...values, query.selected_id])
    : null;
  const page = items.rows.slice(0, query.limit),
    last = page.at(-1);
  return bankWorkflowOptionsSchema.parse({
    items: page,
    selected: selected?.rows[0] ?? null,
    next_cursor:
      items.rows.length > query.limit && last
        ? Buffer.from(JSON.stringify({ id: last.id, scope })).toString("base64url")
        : null,
  });
}

export async function delegatedBankDecisionGrant(
  client: PoolClient,
  context: BankingActorContext,
  kind: TransactionKind,
  row: BankWorkflowContext & { company_id: string; created_by: string; submitted_by: string | null },
): Promise<number | null> {
  if (
    context.realActorId ||
    context.impersonationRequestId ||
    context.actor.tenantId !== context.tenantId ||
    row.approver_user_id !== context.actor.userId ||
    ![row.created_by, row.submitted_by].includes(context.actor.userId)
  )
    return null;
  const result = await client.query<{ version: number }>(
    `select version::integer from bank_self_approval_grant_version
    where tenant_id=$1 and company_id=$2 and transaction_kind=$3 and user_id=$4 and bank_can_self_approve($1,$2,$4,$3)
    order by version desc limit 1`,
    [context.tenantId, row.company_id, kind, context.actor.userId],
  );
  return result.rows[0]?.version ?? null;
}
export async function recordBankDelegatedDecision(
  client: PoolClient,
  context: BankingActorContext,
  kind: TransactionKind,
  row: BankWorkflowContext & {
    id: string;
    company_id: string;
    row_version: number | string;
    created_by: string;
    submitted_by: string | null;
  },
  action: "approve" | "reject",
  grantVersion: number,
  evidenceId: string,
  auditId: string,
) {
  await client.query(
    `insert into bank_delegated_decision(tenant_id,company_id,id,transaction_kind,${kind}_id,record_version,user_id,grant_version,created_by,submitted_by,decision_action,audit_event_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      context.tenantId,
      row.company_id,
      evidenceId,
      kind,
      row.id,
      row.row_version,
      context.actor.userId,
      grantVersion,
      row.created_by,
      row.submitted_by,
      action,
      auditId,
    ],
  );
}
