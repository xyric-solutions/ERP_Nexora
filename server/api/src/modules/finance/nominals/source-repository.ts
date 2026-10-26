import { createHash, randomUUID } from "node:crypto";
import { evaluateApprovalActor, type AuthenticatedAccount } from "@nexora/auth";
import {
  createFinanceNominalRequestSchema,
  updateFinanceNominalRequestSchema,
  submitFinanceNominalRequestSchema,
  decideFinanceNominalRequestSchema,
  changeFinanceNominalStatusRequestSchema,
  type CreateFinanceNominalRequest,
  type UpdateFinanceNominalRequest,
  type SubmitFinanceNominalRequest,
  type DecideFinanceNominalRequest,
  type ChangeFinanceNominalStatusRequest,
  type FinanceNominalDirectoryQuery,
  type FinanceNominalDirectory,
  type FinanceNominalOptions,
  type FinanceNominalDetail,
  type FinanceNominalSummary,
  type FinanceNominalMutationResult,
  type FinanceNominalState,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";
import { insertNominalBankCapability } from "../../banking/accounts/source-capability-writer.js";
import { bankDecisionEvidence } from "../../banking/decision-evidence.js";
import { writeApprovalOverrideEvent, ApprovalOverrideWriterError } from "../../security/approval-override-writer.js";
import { hasLiveCoaMasterAuthority, isCoaSuperAdministrator } from "../coa-master-authority.js";
import { changeCoaMaster, CoaMasterError } from "../coa-master-change.js";

export interface FinanceNominalActorContext {
  tenantId: string;
  actor: AuthenticatedAccount;
  realActorId?: string;
  impersonationRequestId?: string;
}
export class FinanceNominalError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
interface NominalRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description: string | null;
  type: FinanceNominalSummary["type"];
  status: "active" | "inactive";
  is_header: boolean;
  managed_bank_nominal: boolean;
  managed_general_nominal: boolean;
  created_at: Date | string;
  section_id: string | null;
  section_code: string | null;
  section_name: string | null;
  category_id: string | null;
  category_code: string | null;
  category_name: string | null;
  bank_id: string | null;
  currency: string | null;
  identity_mode: "nominal_only" | "legacy_detailed" | null;
  bank_status: FinanceNominalState | null;
  row_version: string | null;
  created_by: string | null;
  submitted_by: string | null;
  approval_override_event_id: string | null;
  posting_classification: "review_required" | "ordinary" | "module_controlled" | null;
  chart_template_id: string | null;
}
type Command =
  | { action: "create"; input: CreateFinanceNominalRequest }
  | { action: "update"; input: UpdateFinanceNominalRequest }
  | { action: "submit"; input: SubmitFinanceNominalRequest }
  | { action: "approve"; input: DecideFinanceNominalRequest }
  | { action: "status"; input: ChangeFinanceNominalStatusRequest };

const projection = `select nominal.id,nominal.company_id,nominal.code,nominal.name,nominal.description,
 nominal.type,nominal.status,nominal.is_header,nominal.managed_bank_nominal,nominal.managed_general_nominal,nominal.created_at,
 section.id as section_id,section.code as section_code,section.name as section_name,
 category.id as category_id,category.code as category_code,category.name as category_name,
 bank.id as bank_id,coalesce(bank.currency,general.currency) as currency,bank.identity_mode,
 coalesce(bank.status,general.state) as bank_status,coalesce(bank.row_version,general.row_version) as row_version,
 coalesce(bank.created_by,general.created_by) as created_by,coalesce(bank.submitted_by,general.submitted_by) as submitted_by,
 coalesce(bank.approval_override_event_id,general.approval_override_event_id) as approval_override_event_id,
 chart.posting_classification,chart.template_id as chart_template_id
 from account nominal
 left join account section on section.tenant_id=nominal.tenant_id and section.company_id=nominal.company_id
  and section.id=nominal.parent_id and section.is_header
 left join account category on category.tenant_id=section.tenant_id and category.company_id=section.company_id
  and category.id=section.parent_id and category.is_header
 left join bank_account bank on bank.tenant_id=nominal.tenant_id and bank.company_id=nominal.company_id and bank.account_id=nominal.id
 left join finance_general_nominal general on general.tenant_id=nominal.tenant_id and general.company_id=nominal.company_id and general.nominal_id=nominal.id
 left join finance_chart_company_node chart on chart.tenant_id=nominal.tenant_id and chart.company_id=nominal.company_id and chart.account_id=nominal.id and chart.posting_classification<>'not_applicable'`;

function summary(row: NominalRow): FinanceNominalSummary {
  return {
    id: row.id,
    company_id: row.company_id,
    code: row.code,
    name: row.name,
    description: row.description,
    type: row.type,
    account_status: row.status,
    is_header: row.is_header,
    category: row.category_id ? { id: row.category_id, code: row.category_code!, name: row.category_name! } : null,
    section: row.section_id ? { id: row.section_id, code: row.section_code!, name: row.section_name! } : null,
    currency: row.currency,
    bank_account_id: row.bank_id,
    identity_mode: row.identity_mode,
    state: row.bank_status,
    version: row.row_version === null ? null : Number(row.row_version),
    banking_available: row.bank_id !== null && row.bank_status === "active" && row.status === "active",
    posting_classification: row.posting_classification,
    chart_template_id: row.chart_template_id,
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
function requirePermission(context: FinanceNominalActorContext, permission: string) {
  if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
    throw new FinanceNominalError(403, "PERMISSION_DENIED", "You are not permitted to access this nominal operation.");
}

export class SourceFinanceNominalRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(
    context: FinanceNominalActorContext,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level read committed");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select set_config('nexora.user_id',$1,true)", [context.actor.userId]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof CoaMasterError) throw new FinanceNominalError(error.status, error.code, error.message);
      if (error instanceof ApprovalOverrideWriterError) throw new FinanceNominalError(403, error.code, error.message);
      if (typeof error === "object" && error !== null && "code" in error) {
        if (error.code === "23505")
          throw new FinanceNominalError(409, "NOMINAL_DUPLICATE", "The nominal name, code or mapping already exists.");
        if (error.code === "23514" || error.code === "23503")
          throw new FinanceNominalError(
            409,
            "NOMINAL_AUTHORITY_CONFLICT",
            "The nominal authority changed or its setup is incomplete. Refresh and review the master data.",
          );
        if (error.code === "40P01" || error.code === "40001")
          throw new FinanceNominalError(
            409,
            "NOMINAL_CONCURRENT_CHANGE",
            "A concurrent operation changed this record. Retry the same request.",
          );
      }
      throw error;
    } finally {
      client.release();
    }
  }
  private async company(client: PoolClient, context: FinanceNominalActorContext, companyId: string) {
    const access = await client.query(
      `select 1 from security_user_company_access access join organization_unit company
     on company.tenant_id=access.tenant_id and company.id=access.company_id
     where access.tenant_id=$1 and access.user_id=$2 and access.company_id=$3 and access.revoked_at is null
       and company.type='company' and company.status='active'`,
      [context.tenantId, context.actor.userId, companyId],
    );
    if (!access.rowCount)
      throw new FinanceNominalError(403, "COMPANY_ACCESS_DENIED", "The company is outside your access scope.");
    await this.scopedPermission(client, context, "finance.nominal.read", companyId);
  }
  private async scopedPermission(
    client: PoolClient,
    context: FinanceNominalActorContext,
    permission: string,
    companyId: string,
  ) {
    requirePermission(context, permission);
    const grant = await client.query(
      `select 1 from security_user_role_assignment_version assignment
      join security_user_account actor on actor.tenant_id=assignment.tenant_id and actor.id=assignment.user_id
        and actor.status='active' and actor.archived_at is null
      join security_role_policy policy on policy.tenant_id=assignment.tenant_id and policy.id=assignment.role_policy_id
        and policy.status='active' and policy.lifecycle_state='active'
      join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id and role.lifecycle_state='active'
      join security_role_permission_grant permission_grant on permission_grant.tenant_id=policy.tenant_id
        and permission_grant.role_policy_id=policy.id and permission_grant.permission_key=$3
      join security_permission_definition definition on definition.permission_key=permission_grant.permission_key and definition.status='active'
      join security_role_scope_grant scope on scope.tenant_id=permission_grant.tenant_id
        and scope.role_policy_id=permission_grant.role_policy_id and scope.permission_key=permission_grant.permission_key
      where assignment.tenant_id=$1 and assignment.user_id=$2
        and assignment.version=(select max(latest.version) from security_user_role_assignment_version latest
          where latest.tenant_id=assignment.tenant_id and latest.assignment_id=assignment.assignment_id)
        and assignment.lifecycle_state='active' and assignment.valid_from<=now()
        and (assignment.valid_until is null or assignment.valid_until>now())
        and ((scope.scope_kind='tenant' and scope.scope_value=$1) or (scope.scope_kind='company' and scope.scope_value=$4)) limit 1`,
      [context.tenantId, context.actor.userId, permission, companyId],
    );
    if (!grant.rowCount)
      throw new FinanceNominalError(
        403,
        "PERMISSION_DENIED",
        "This nominal operation is outside your company permission scope.",
      );
  }
  private async load(
    client: PoolClient,
    context: FinanceNominalActorContext,
    id: string,
    lock = false,
  ): Promise<NominalRow> {
    if (lock)
      await client.query("select id from account where tenant_id=$1 and id=$2 for update", [context.tenantId, id]);
    const result = await client.query<NominalRow>(`${projection} where nominal.tenant_id=$1 and nominal.id=$2`, [
      context.tenantId,
      id,
    ]);
    const row = result.rows[0];
    if (!row) throw new FinanceNominalError(404, "NOMINAL_NOT_FOUND", "The nominal was not found.");
    await this.company(client, context, row.company_id);
    if (lock && row.bank_id)
      await client.query("select id from bank_account where tenant_id=$1 and id=$2 for update", [
        context.tenantId,
        row.bank_id,
      ]);
    return row;
  }
  async options(context: FinanceNominalActorContext, companyId?: string): Promise<FinanceNominalOptions> {
    requirePermission(context, "finance.nominal.read");
    return this.transaction(context, async (client) => {
      const companies = await client.query<FinanceNominalOptions["companies"][number]>(
        `select company.id,company.code,company.name
       from organization_unit company join security_user_company_access access on access.tenant_id=company.tenant_id and access.company_id=company.id
       where company.tenant_id=$1 and access.user_id=$2 and access.revoked_at is null and company.type='company' and company.status='active'
       order by access.is_default desc,company.name,company.id limit 100`,
        [context.tenantId, context.actor.userId],
      );
      if (!companyId)
        return {
          companies: companies.rows,
          selected_company_id: null,
          categories: [],
          sections: [],
          currencies: [],
          setup: { cash_and_bank_configured: false, code_policy_configured: false },
        };
      await this.company(client, context, companyId);
      const sections = await client.query<FinanceNominalOptions["sections"][number]>(
        `select section.id,section.code,section.name,section.parent_id as category_id,
       coalesce(policy.section_role,case when general.section_id is not null then 'general' end) as section_role,
       coalesce(policy.status='active' and policy.next_value<=policy.last_value,
         general.status='active' and general.next_value<=general.last_value,false) as creation_enabled
       from account section join account category on category.tenant_id=section.tenant_id and category.company_id=section.company_id and category.id=section.parent_id
       left join finance_nominal_section_policy policy on policy.tenant_id=section.tenant_id and policy.company_id=section.company_id and policy.section_id=section.id
       left join finance_general_nominal_policy general on general.tenant_id=section.tenant_id and general.company_id=section.company_id and general.section_id=section.id
       where section.tenant_id=$1 and section.company_id=$2 and section.is_header and category.is_header
       and section.status='active' and category.status='active' order by section.code limit 200`,
        [context.tenantId, companyId],
      );
      const categories = await client.query<FinanceNominalOptions["categories"][number]>(
        `select distinct category.id,category.code,category.name from account category
       join account section on section.tenant_id=category.tenant_id and section.company_id=category.company_id and section.parent_id=category.id
       where category.tenant_id=$1 and category.company_id=$2 and category.is_header and section.is_header
        and category.status='active' order by category.code limit 200`,
        [context.tenantId, companyId],
      );
      const currencies = await client.query<FinanceNominalOptions["currencies"][number]>(
        `select standard.code,standard.name,standard.decimal_places,company_currency.is_base
           from company_currency
           join currency standard
             on standard.tenant_id=company_currency.tenant_id
            and standard.code=company_currency.currency_code
            and standard.status='active'
          where company_currency.tenant_id=$1 and company_currency.company_id=$2
            and company_currency.status='active'
          order by company_currency.is_base desc,standard.code limit 200`,
        [context.tenantId, companyId],
      );
      const definitions = await client.query<NonNullable<FinanceNominalOptions["bank_definitions"]>[number]>(
        `select m.template_id,m.node_key,source.code,source.name,parent.account_id as section_id,(m.account_id is not null) as configured
        from finance_chart_company_node m join finance_chart_template_node source on source.tenant_id=m.tenant_id and source.template_id=m.template_id and source.node_key=m.node_key
        join finance_chart_company_node parent on parent.tenant_id=m.tenant_id and parent.company_id=m.company_id and parent.template_id=m.template_id and parent.node_key=source.parent_key
        where m.tenant_id=$1 and m.company_id=$2 and source.kind='nominal' and source.parent_key='section:2309' order by source.code limit 100`,
        [context.tenantId, companyId],
      );
      return {
        companies: companies.rows,
        selected_company_id: companyId,
        categories: categories.rows,
        sections: sections.rows,
        currencies: currencies.rows,
        bank_definitions: definitions.rows,
        setup: {
          cash_and_bank_configured: sections.rows.some((r) => r.section_role === "cash_and_bank"),
          code_policy_configured: sections.rows.some((r) => r.creation_enabled),
        },
      };
    });
  }
  async list(
    context: FinanceNominalActorContext,
    query: FinanceNominalDirectoryQuery,
  ): Promise<FinanceNominalDirectory> {
    requirePermission(context, "finance.nominal.read");
    return this.transaction(context, async (client) => {
      await this.company(client, context, query.company_id);
      let offset = 0;
      if (query.cursor) {
        try {
          const parsed: unknown = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
          if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000)
            throw new Error();
          offset = parsed;
        } catch {
          throw new FinanceNominalError(400, "NOMINAL_CURSOR_INVALID", "The nominal cursor is invalid.");
        }
      }
      const values: unknown[] = [context.tenantId, query.company_id];
      const conditions = ["nominal.tenant_id=$1", "nominal.company_id=$2", "not nominal.is_header"];
      for (const [column, value] of [
        ["section.id", query.section_id],
        ["category.id", query.category_id],
        ["coalesce(bank.currency,general.currency)", query.currency],
        ["coalesce(bank.status,general.state,nominal.status)", query.state],
        ["nominal.status", query.account_status],
      ] as const)
        if (value !== undefined) {
          values.push(value);
          conditions.push(`${column}=$${values.length}`);
        }
      if (query.search) {
        values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        conditions.push(`(nominal.name ilike $${values.length} or nominal.code ilike $${values.length})`);
      }
      if (query.nominal_kind === "bank") conditions.push("bank.id is not null");
      if (query.nominal_kind === "general") conditions.push("bank.id is null");
      const sort = {
        code: "nominal.code",
        name: "nominal.name",
        currency: "coalesce(bank.currency,general.currency)",
        state: "coalesce(bank.status,general.state)",
      }[query.sort_by];
      values.push(query.limit + 1, offset);
      const result = await client.query<NominalRow>(
        `${projection} where ${conditions.join(" and ")} order by ${sort} ${query.sort_direction === "desc" ? "desc" : "asc"} nulls last,nominal.id asc limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return {
        items: result.rows.slice(0, query.limit).map(summary),
        next_cursor:
          result.rows.length > query.limit
            ? Buffer.from(JSON.stringify(offset + query.limit)).toString("base64url")
            : null,
      };
    });
  }
  async get(context: FinanceNominalActorContext, id: string): Promise<FinanceNominalDetail> {
    requirePermission(context, "finance.nominal.read");
    return this.transaction(context, async (client) => {
      const row = await this.load(client, context, id);
      const policy = evaluateApprovalActor({
        account: context.actor,
        normalDecisionPermission: row.managed_general_nominal
          ? "finance.nominal.approve"
          : "banking.bank_account.approve",
        makerActorIds: [row.created_by ?? "", row.submitted_by ?? ""],
        impersonated: !!context.impersonationRequestId,
      });
      const masterAdmin = await hasLiveCoaMasterAuthority(client, context, row.company_id);
      const can = (action: string) =>
        masterAdmin &&
        (row.managed_bank_nominal || row.managed_general_nominal) &&
        !context.impersonationRequestId &&
        context.actor.permissions.includes(`finance.nominal.${action}`) &&
        (row.managed_general_nominal || context.actor.permissions.includes(`banking.bank_account.${action}`));
      const events = await client.query<FinanceNominalDetail["events"][number]>(
        `select event.event_id as id,event.event_type,coalesce(actor.display_name,actor.id) as actor_name,event.reason,
       event.occurred_at,event.approval_override_event_id from ${row.managed_general_nominal ? "finance_general_nominal_event" : "finance_nominal_event"} event join security_user_account actor
        on actor.tenant_id=event.tenant_id and actor.id=event.actor_id where event.tenant_id=$1 and event.nominal_id=$2 order by event.resulting_version desc limit 200`,
        [context.tenantId, id],
      );
      return {
        ...summary(row),
        created_at: new Date(row.created_at).toISOString(),
        self_decision_requires_override: [row.created_by, row.submitted_by].includes(context.actor.userId),
        super_admin_override_allowed: can("approve") && policy.kind === "override",
        capabilities: {
          update: can("update") && ["draft", "active", "inactive"].includes(row.bank_status ?? ""),
          submit: false,
          decide: false,
          activate:
            can("status") &&
            ["draft", "pending_approval", "inactive"].includes(row.bank_status ?? "") &&
            (!row.posting_classification || row.posting_classification === "ordinary"),
          deactivate: can("status") && row.bank_status === "active",
        },
        events: events.rows.map((event) => ({ ...event, occurred_at: new Date(event.occurred_at).toISOString() })),
      };
    });
  }
  create(context: FinanceNominalActorContext, input: CreateFinanceNominalRequest, key: string, correlation: string) {
    return this.mutate(
      context,
      undefined,
      { action: "create", input: createFinanceNominalRequestSchema.parse(input) },
      key,
      correlation,
    );
  }
  update(
    context: FinanceNominalActorContext,
    id: string,
    input: UpdateFinanceNominalRequest,
    key: string,
    correlation: string,
  ) {
    return this.mutate(
      context,
      id,
      { action: "update", input: updateFinanceNominalRequestSchema.parse(input) },
      key,
      correlation,
    );
  }
  submit(
    context: FinanceNominalActorContext,
    id: string,
    input: SubmitFinanceNominalRequest,
    key: string,
    correlation: string,
  ) {
    return this.mutate(
      context,
      id,
      { action: "submit", input: submitFinanceNominalRequestSchema.parse(input) },
      key,
      correlation,
    );
  }
  decide(
    context: FinanceNominalActorContext,
    id: string,
    input: DecideFinanceNominalRequest,
    key: string,
    correlation: string,
  ) {
    return this.mutate(
      context,
      id,
      { action: "approve", input: decideFinanceNominalRequestSchema.parse(input) },
      key,
      correlation,
    );
  }
  changeStatus(
    context: FinanceNominalActorContext,
    id: string,
    input: ChangeFinanceNominalStatusRequest,
    key: string,
    correlation: string,
  ) {
    return this.mutate(
      context,
      id,
      { action: "status", input: changeFinanceNominalStatusRequestSchema.parse(input) },
      key,
      correlation,
    );
  }

  private async mutate(
    context: FinanceNominalActorContext,
    id: string | undefined,
    command: Command,
    key: string,
    correlation: string,
  ): Promise<FinanceNominalMutationResult> {
    if (!isCoaSuperAdministrator(context))
      throw new FinanceNominalError(
        403,
        "COA_SUPER_ADMIN_REQUIRED",
        "Only a global Super Admin may manage Chart of Accounts masters.",
      );
    requirePermission(context, `finance.nominal.${command.action}`);
    if (context.impersonationRequestId || context.realActorId)
      throw new FinanceNominalError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Master data changes are disabled during impersonation.",
      );
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      throw new FinanceNominalError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    return this.transaction(context, async (client) => {
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${context.tenantId}`,
      ]);
      const method = command.action === "update" ? "PATCH" : "POST";
      const suffix = { create: "", update: "", submit: "/submit", approve: "/decision", status: "/status" }[
        command.action
      ];
      const path = `/api/v1/finance/nominals${id ? `/${id}` : ""}${suffix}`;
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:nominal:${context.tenantId}:${context.actor.userId}:${method}:${path}:${key}`,
      ]);
      const before = id ? await this.load(client, context, id, true) : null;
      const companyId = before?.company_id ?? (command.action === "create" ? command.input.company_id : "");
      if (!(await hasLiveCoaMasterAuthority(client, context, companyId)))
        throw new FinanceNominalError(
          403,
          "COA_SUPER_ADMIN_REQUIRED",
          "Live Super Admin and company authority are required.",
        );
      await this.scopedPermission(client, context, `finance.nominal.${command.action}`, companyId);
      const general =
        command.action === "create"
          ? command.input.nominal_kind === "general"
          : before?.managed_general_nominal === true;
      if (general && (command.action === "submit" || command.action === "approve"))
        throw new FinanceNominalError(
          410,
          "COA_APPROVAL_RETIRED",
          "Ordinary master submission and approval are retired. Super Admins use direct activation.",
        );
      if (!general) await this.scopedPermission(client, context, `banking.bank_account.${command.action}`, companyId);
      if (command.action === "create") await this.company(client, context, command.input.company_id);
      const replay = await client.query<{ request_fingerprint: string; response_body: FinanceNominalMutationResult }>(
        `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method=$3 and path=$4 and idempotency_key=$5`,
        [context.tenantId, context.actor.userId, method, path, key],
      );
      const fingerprint = hash(command.input);
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint)
          throw new FinanceNominalError(409, "IDEMPOTENCY_CONFLICT", "This key was used for a different request.");
        return { ...replay.rows[0].response_body, replayed: true };
      }
      if (before && (command.action === "update" || command.action === "status")) {
        const direct = await changeCoaMaster(
          client,
          context,
          before.id,
          command.action === "update" ? "updated" : command.input.action === "activate" ? "activated" : "deactivated",
          command.input.expected_version,
          correlation,
          command.action === "update" ? command.input : {},
        );
        await client.query(
          "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,$3,$4,$5,$6,200,$7,$8)",
          [context.tenantId, context.actor.userId, method, path, key, fingerprint, direct, `"${direct.version}"`],
        );
        return direct;
      }
      let nominalId = id;
      let eventType: FinanceNominalDetail["events"][number]["event_type"];
      let reason: string | null = null;
      if (general) {
        const changed = await this.mutateGeneral(client, context, before, command, key, path, correlation);
        nominalId = changed.id;
        eventType = changed.eventType;
        reason = changed.reason;
      } else if (command.action === "create") {
        const input = command.input;
        const policy = await client.query(
          `select 1 from finance_nominal_section_policy where tenant_id=$1 and company_id=$2 and section_id=$3 and category_id=$4 and section_role='cash_and_bank' and status='active' for update`,
          [context.tenantId, input.company_id, input.section_id, input.category_id],
        );
        if (!policy.rowCount)
          throw new FinanceNominalError(
            409,
            "NOMINAL_SETUP_REQUIRED",
            "Configure the company Cash & Bank hierarchy and code policy first.",
          );
        await this.currency(client, context, input.company_id, input.currency);
        const duplicate = await client.query(
          "select 1 from account where tenant_id=$1 and company_id=$2 and parent_id=$3 and lower(btrim(name))=lower(btrim($4))",
          [context.tenantId, input.company_id, input.section_id, input.name],
        );
        if (duplicate.rowCount)
          throw new FinanceNominalError(
            409,
            "NOMINAL_DUPLICATE",
            "A nominal with this name already exists in the Section.",
          );
        let nominalCode: string;
        if (input.chart_template_id && input.chart_node_key) {
          const definition = await client.query<{
            code: string;
            name: string;
            account_id: string | null;
            section_id: string;
          }>(
            `select source.code,source.name,m.account_id,parent.account_id as section_id from finance_chart_company_node m
            join finance_chart_template_node source on source.tenant_id=m.tenant_id and source.template_id=m.template_id and source.node_key=m.node_key
            join finance_chart_company_node parent on parent.tenant_id=m.tenant_id and parent.company_id=m.company_id and parent.template_id=m.template_id and parent.node_key=source.parent_key
            where m.tenant_id=$1 and m.company_id=$2 and m.template_id=$3 and m.node_key=$4 and source.kind='nominal' and source.parent_key='section:2309' for update of m`,
            [context.tenantId, input.company_id, input.chart_template_id, input.chart_node_key],
          );
          const row = definition.rows[0];
          if (!row || row.account_id || row.section_id !== input.section_id || row.name !== input.name)
            throw new FinanceNominalError(
              409,
              "BANK_DEFINITION_CONFLICT",
              "Select an unconfigured adopted Bank definition with its exact source name and company section.",
            );
          nominalCode = row.code;
        } else {
          nominalCode = (
            await client.query<{ code: string }>("select allocate_finance_nominal_code($1,$2,$3) as code", [
              context.tenantId,
              input.company_id,
              input.section_id,
            ])
          ).rows[0]!.code;
        }
        nominalId = `nominal-${randomUUID()}`;
        await client.query(
          `insert into account (tenant_id,company_id,id,code,name,description,type,parent_id,is_header,status,manual_posting_allowed,reconciliation_required,managed_bank_nominal,created_at)
         values ($1,$2,$3,$4,$5,$6,'asset',$7,false,'inactive',true,true,true,clock_timestamp())`,
          [
            context.tenantId,
            input.company_id,
            nominalId,
            nominalCode,
            input.name,
            input.description ?? null,
            input.section_id,
          ],
        );
        await insertNominalBankCapability(client, {
          tenantId: context.tenantId,
          companyId: input.company_id,
          bankId: `bank-${randomUUID()}`,
          nominalId,
          name: input.name,
          currency: input.currency,
          actorId: context.actor.userId,
        });
        eventType = "created";
      } else {
        if (!before?.managed_bank_nominal || !before.bank_id)
          throw new FinanceNominalError(
            409,
            "NOMINAL_READ_ONLY",
            "This legacy or non-bank nominal is read-only in this workflow.",
          );
        if (Number(before.row_version) !== command.input.expected_version)
          throw new FinanceNominalError(
            409,
            "NOMINAL_VERSION_CONFLICT",
            "The nominal changed. Reload its latest version.",
          );
        const bankId = before.bank_id;
        if (command.action === "update") {
          if (before.bank_status !== "draft")
            throw new FinanceNominalError(409, "NOMINAL_STATE_CONFLICT", "Only a draft may be edited.");
          if (command.input.currency)
            await this.currency(client, context, before.company_id, command.input.currency);
          await client.query(`update account set name=$3,description=$4 where tenant_id=$1 and id=$2`, [
            context.tenantId,
            id,
            command.input.name ?? before.name,
            command.input.description === undefined ? before.description : command.input.description,
          ]);
          await client.query(
            `update bank_account set account_name=$3,currency=$4,row_version=row_version+1,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where tenant_id=$1 and id=$2`,
            [context.tenantId, bankId, command.input.name ?? before.name, command.input.currency ?? before.currency],
          );
          eventType = "updated";
        } else if (command.action === "submit") {
          if (before.bank_status !== "draft")
            throw new FinanceNominalError(409, "NOMINAL_STATE_CONFLICT", "Only a draft may be submitted.");
          await this.currency(client, context, before.company_id, before.currency!);
          reason = command.input.reason;
          await client.query(
            `update bank_account set status='pending_approval',submitted_by=$3,submitted_at=clock_timestamp(),submission_reason=$4,row_version=row_version+1,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where tenant_id=$1 and id=$2`,
            [context.tenantId, bankId, context.actor.userId, reason],
          );
          eventType = "submitted";
        } else if (command.action === "approve") {
          if (before.bank_status !== "pending_approval")
            throw new FinanceNominalError(409, "NOMINAL_STATE_CONFLICT", "The nominal is not pending approval.");
          const evidence = bankDecisionEvidence(command.input, "Bank account");
          reason = evidence.reason;
          const decision = evaluateApprovalActor({
            account: context.actor,
            normalDecisionPermission: "banking.bank_account.approve",
            makerActorIds: [before.created_by ?? "", before.submitted_by ?? ""],
          });
          if (decision.kind === "forbidden")
            throw new FinanceNominalError(
              403,
              "MAKER_CHECKER_REQUIRED",
              "An independent authorized checker must decide this request.",
            );
          let override: string | null = null;
          if (decision.kind === "override")
            override = (
              await writeApprovalOverrideEvent(client, {
                tenantId: context.tenantId,
                account: context.actor,
                makerActorIds: [before.created_by ?? "", before.submitted_by ?? ""],
                normalDecisionPermission: "banking.bank_account.approve",
                resourceType: "banking.bank_account",
                resourceId: bankId,
                decisionAction: command.input.action,
                reason,
                correlationId: correlation,
                idempotencyKey: `nominal-override-${hash({ key, path })}`,
                metadata: { nominal_id: id, company_id: before.company_id, reason_source: evidence.source },
              })
            ).eventId;
          if (command.input.action === "approve")
            await this.currency(client, context, before.company_id, before.currency!);
          const approved = command.input.action === "approve";
          await client.query(
            `update bank_account set status=$3,approved_by=case when $3='active' then $4 else null end,approved_at=case when $3='active' then clock_timestamp() else null end,
           rejected_by=case when $3='rejected' then $4 else null end,rejected_at=case when $3='rejected' then clock_timestamp() else null end,decision_reason=$5,approval_override_event_id=$6,row_version=row_version+1,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where tenant_id=$1 and id=$2`,
            [context.tenantId, bankId, approved ? "active" : "rejected", context.actor.userId, reason, override],
          );
          await client.query("update account set status=$3 where tenant_id=$1 and id=$2", [
            context.tenantId,
            id,
            approved ? "active" : "inactive",
          ]);
          eventType = approved ? "approved" : "rejected";
        } else {
          if (before.bank_status !== "active")
            throw new FinanceNominalError(409, "NOMINAL_STATE_CONFLICT", "Only an active nominal may be deactivated.");
          reason = command.input.reason;
          await client.query(
            `update bank_account set status='inactive',deactivated_by=$3,deactivated_at=clock_timestamp(),row_version=row_version+1,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where tenant_id=$1 and id=$2`,
            [context.tenantId, bankId, context.actor.userId],
          );
          await client.query("update account set status='inactive' where tenant_id=$1 and id=$2", [
            context.tenantId,
            id,
          ]);
          eventType = "deactivated";
        }
      }
      const after = await this.load(client, context, nominalId!);
      await client.query(
        `insert into ${general ? "finance_general_nominal_event" : "finance_nominal_event"} (tenant_id,event_id,company_id,nominal_id,${general ? "" : "bank_account_id,"}event_type,resulting_version,actor_id,reason,approval_override_event_id)
       values (${Array.from({ length: general ? 9 : 10 }, (_, index) => "$" + (index + 1)).join(",")})`,
        [
          context.tenantId,
          `nominal-event-${randomUUID()}`,
          after.company_id,
          after.id,
          ...(general ? [] : [after.bank_id]),
          eventType,
          Number(after.row_version),
          context.actor.userId,
          reason,
          ["approved", "rejected"].includes(eventType) ? after.approval_override_event_id : null,
        ],
      );
      if (!general)
        await client.query(
          `insert into bank_account_event (tenant_id,event_id,account_id,event_type,actor_id,reason,state_snapshot) values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            context.tenantId,
            `bank-event-${randomUUID()}`,
            after.bank_id,
            eventType,
            context.actor.userId,
            reason,
            summary(after),
          ],
        );
      const audit = await this.audit(
        client,
        context,
        correlation,
        `finance.nominal.${eventType === "created" ? "create" : eventType === "updated" ? "update" : eventType === "submitted" ? "submit" : eventType === "approved" ? "approve" : eventType === "rejected" ? "reject" : "status"}`,
        before ? summary(before) : null,
        summary(after),
        after.approval_override_event_id,
      );
      let result: FinanceNominalMutationResult = {
        id: after.id,
        bank_account_id: after.bank_id!,
        code: after.code,
        state: after.bank_status!,
        version: Number(after.row_version),
        audit_event_id: audit,
        replayed: false,
      };
      if (command.action === "create" && command.input.chart_template_id && command.input.chart_node_key) {
        await client.query(
          "insert into finance_chart_bank_binding(tenant_id,company_id,template_id,node_key,nominal_id,audit_event_id,created_by) values($1,$2,$3,$4,$5,$6,$7)",
          [
            context.tenantId,
            after.company_id,
            command.input.chart_template_id,
            command.input.chart_node_key,
            after.id,
            audit,
            context.actor.userId,
          ],
        );
        const bound = await client.query(
          "update finance_chart_company_node set account_id=$5 where tenant_id=$1 and company_id=$2 and template_id=$3 and node_key=$4 and account_id is null returning account_id",
          [context.tenantId, after.company_id, command.input.chart_template_id, command.input.chart_node_key, after.id],
        );
        if (bound.rowCount !== 1)
          throw new FinanceNominalError(
            409,
            "BANK_DEFINITION_CONFLICT",
            "The Bank definition was configured concurrently. Refresh its persisted record.",
          );
      }
      if (command.action === "create")
        result = await changeCoaMaster(client, context, after.id, "activated", Number(after.row_version), correlation);
      await client.query(
        `insert into platform_admin_idempotency (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.tenantId,
          context.actor.userId,
          method,
          path,
          key,
          fingerprint,
          command.action === "create" ? 201 : 200,
          result,
          hash(result),
        ],
      );
      return result;
    });
  }
  private async mutateGeneral(
    client: PoolClient,
    context: FinanceNominalActorContext,
    before: NominalRow | null,
    command: Command,
    key: string,
    path: string,
    correlation: string,
  ): Promise<{ id: string; eventType: FinanceNominalDetail["events"][number]["event_type"]; reason: string | null }> {
    if (command.action === "create") {
      const input = command.input;
      const configured = await client.query<{
        prefix: string;
        code_width: number;
        next_value: string;
        last_value: string;
        type: FinanceNominalSummary["type"];
      }>(
        `select p.prefix,p.code_width,p.next_value,p.last_value,s.type from finance_general_nominal_policy p
        join account s on s.tenant_id=p.tenant_id and s.company_id=p.company_id and s.id=p.section_id
        join account c on c.tenant_id=s.tenant_id and c.company_id=s.company_id and c.id=s.parent_id
        where p.tenant_id=$1 and p.company_id=$2 and p.section_id=$3 and p.category_id=$4 and p.status='active'
        and s.status='active' and c.status='active' and s.is_header and c.is_header and s.type=c.type
        for update of p for share of s,c`,
        [context.tenantId, input.company_id, input.section_id, input.category_id],
      );
      const policy = configured.rows[0];
      if (!policy || BigInt(policy.next_value) > BigInt(policy.last_value))
        throw new FinanceNominalError(
          409,
          "NOMINAL_SETUP_REQUIRED",
          "Configure an ordinary account Section and an available nominal code range first.",
        );
      await this.currency(client, context, input.company_id, input.currency);
      const duplicate = await client.query(
        "select 1 from account where tenant_id=$1 and company_id=$2 and parent_id=$3 and lower(btrim(name))=lower(btrim($4))",
        [context.tenantId, input.company_id, input.section_id, input.name],
      );
      if (duplicate.rowCount)
        throw new FinanceNominalError(
          409,
          "NOMINAL_DUPLICATE",
          "A nominal with this name already exists in the Section.",
        );
      const code = policy.prefix + policy.next_value.padStart(policy.code_width, "0");
      const id = `nominal-${randomUUID()}`;
      await client.query(
        `insert into account (tenant_id,company_id,id,code,name,description,type,parent_id,is_header,status,manual_posting_allowed,reconciliation_required,managed_general_nominal,created_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,false,'inactive',true,false,true,clock_timestamp())`,
        [
          context.tenantId,
          input.company_id,
          id,
          code,
          input.name,
          input.description ?? null,
          policy.type,
          input.section_id,
        ],
      );
      await client.query(
        `insert into finance_general_nominal(tenant_id,company_id,nominal_id,currency,created_by) values($1,$2,$3,$4,$5)`,
        [context.tenantId, input.company_id, id, input.currency, context.actor.userId],
      );
      await client.query(
        `update finance_general_nominal_policy set next_value=next_value+1 where tenant_id=$1 and company_id=$2 and section_id=$3`,
        [context.tenantId, input.company_id, input.section_id],
      );
      return { id, eventType: "created", reason: null };
    }
    if (!before?.managed_general_nominal || before.bank_id)
      throw new FinanceNominalError(409, "NOMINAL_READ_ONLY", "This legacy nominal is read-only in this workflow.");
    if (Number(before.row_version) !== command.input.expected_version)
      throw new FinanceNominalError(409, "NOMINAL_VERSION_CONFLICT", "The nominal changed. Reload its latest version.");
    const id = before.id;
    let state = before.bank_status,
      reason: string | null = null;
    let eventType: FinanceNominalDetail["events"][number]["event_type"];
    let override = before.approval_override_event_id;
    if (command.action === "update") {
      if (state !== "draft")
        throw new FinanceNominalError(409, "NOMINAL_STATE_CONFLICT", "Only a draft may be edited.");
      const duplicate = await client.query(
        "select 1 from account where tenant_id=$1 and company_id=$2 and parent_id=$3 and id<>$4 and lower(btrim(name))=lower(btrim($5))",
        [context.tenantId, before.company_id, before.section_id, id, command.input.name ?? before.name],
      );
      if (duplicate.rowCount)
        throw new FinanceNominalError(
          409,
          "NOMINAL_DUPLICATE",
          "A nominal with this name already exists in the Section.",
        );
      if (command.input.currency)
        await this.currency(client, context, before.company_id, command.input.currency);
      await client.query(`update account set name=$3,description=$4 where tenant_id=$1 and id=$2`, [
        context.tenantId,
        id,
        command.input.name ?? before.name,
        command.input.description === undefined ? before.description : command.input.description,
      ]);
      eventType = "updated";
    } else if (command.action === "submit") {
      if (before.posting_classification && before.posting_classification !== "ordinary")
        throw new FinanceNominalError(
          409,
          "NOMINAL_POSTING_REVIEW_REQUIRED",
          "Review this nominal as ordinary before submission. Module-controlled accounts cannot use the manual posting workflow.",
        );
      if (state !== "draft")
        throw new FinanceNominalError(409, "NOMINAL_STATE_CONFLICT", "Only a draft may be submitted.");
      state = "pending_approval";
      reason = command.input.reason;
      eventType = "submitted";
    } else if (command.action === "approve") {
      if (state !== "pending_approval")
        throw new FinanceNominalError(409, "NOMINAL_STATE_CONFLICT", "The nominal is not pending approval.");
      const evidence = bankDecisionEvidence(command.input, "Finance nominal");
      reason = evidence.reason;
      const makerActorIds = [before.created_by ?? "", before.submitted_by ?? ""];
      const decision = evaluateApprovalActor({
        account: context.actor,
        normalDecisionPermission: "finance.nominal.approve",
        makerActorIds,
      });
      if (decision.kind === "forbidden")
        throw new FinanceNominalError(
          403,
          "MAKER_CHECKER_REQUIRED",
          "An independent authorized checker must decide this request.",
        );
      override =
        decision.kind === "override"
          ? (
              await writeApprovalOverrideEvent(client, {
                tenantId: context.tenantId,
                account: context.actor,
                makerActorIds,
                normalDecisionPermission: "finance.nominal.approve",
                resourceType: "finance.nominal",
                resourceId: id,
                decisionAction: command.input.action,
                reason,
                correlationId: correlation,
                idempotencyKey: `nominal-override-${hash({ key, path })}`,
                metadata: { company_id: before.company_id, reason_source: evidence.source },
              })
            ).eventId
          : null;
      state = command.input.action === "approve" ? "active" : "rejected";
      eventType = command.input.action === "approve" ? "approved" : "rejected";
    } else {
      if (state !== "active")
        throw new FinanceNominalError(409, "NOMINAL_STATE_CONFLICT", "Only an active nominal may be deactivated.");
      state = "inactive";
      reason = command.input.reason;
      eventType = "deactivated";
    }
    const nextCurrency = command.action === "update" ? (command.input.currency ?? before.currency!) : before.currency!;
    await this.currency(client, context, before.company_id, nextCurrency);
    await client.query(
      `update finance_general_nominal set currency=$3,state=$4,
      submitted_by=case when $5='submitted' then $6 else submitted_by end,
      decided_by=case when $5 in ('approved','rejected') then $6 else decided_by end,
      approval_override_event_id=$7,row_version=row_version+1,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
      where tenant_id=$1 and nominal_id=$2`,
      [context.tenantId, id, nextCurrency, state, eventType, context.actor.userId, override],
    );
    if (eventType !== "updated" && eventType !== "submitted")
      await client.query("update account set status=$3 where tenant_id=$1 and id=$2", [
        context.tenantId,
        id,
        state === "active" ? "active" : "inactive",
      ]);
    return { id, eventType, reason };
  }
  private async currency(
    client: PoolClient,
    context: FinanceNominalActorContext,
    companyId: string,
    code: string,
  ) {
    const found = await client.query(
      `select company_currency.currency_code
         from company_currency
         join currency standard
           on standard.tenant_id=company_currency.tenant_id
          and standard.code=company_currency.currency_code
          and standard.status='active'
        where company_currency.tenant_id=$1 and company_currency.company_id=$2
          and company_currency.currency_code=$3 and company_currency.status='active'
        for share of company_currency,standard`,
      [context.tenantId, companyId, code],
    );
    if (!found.rowCount)
      throw new FinanceNominalError(
        400,
        "NOMINAL_CURRENCY_INVALID",
        "Select a currency that is active for this company.",
      );
  }
  private async audit(
    client: PoolClient,
    context: FinanceNominalActorContext,
    correlation: string,
    action: string,
    before: unknown,
    after: FinanceNominalSummary,
    approval: string | null,
  ): Promise<string> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const latest = await client.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [context.tenantId],
    );
    const id = `audit-${randomUUID()}`,
      sequence = Number(latest.rows[0]?.sequence ?? 0) + 1,
      occurred = new Date().toISOString(),
      previous = latest.rows[0]?.event_hash ?? hash({ genesis: context.tenantId });
    const payload = {
      id,
      tenant_id: context.tenantId,
      actor_id: context.actor.userId,
      correlation_id: correlation,
      action,
      entity_type: "finance_nominal",
      entity_id: after.id,
      before_hash: hash(before),
      after_hash: hash(after),
      source_reference: "finance.nominal",
      approval_reference: approval,
      occurred_at: occurred,
      sequence,
      previous_event_hash: previous,
    };
    await client.query(
      `insert into platform_admin_audit_event (id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        context.tenantId,
        sequence,
        context.actor.userId,
        correlation,
        action,
        "finance_nominal",
        after.id,
        payload.before_hash,
        payload.after_hash,
        "finance.nominal",
        approval,
        occurred,
        previous,
        hash(payload),
      ],
    );
    return id;
  }
}
