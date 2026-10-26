import { randomUUID } from "node:crypto";
import {
  importChartTemplateRequestSchema,
  chartTemplateSummarySchema,
  chartTemplateMutationSchema,
  chartTemplateQuerySchema,
  chartTemplateNodeQuerySchema,
  publishChartTemplateRequestSchema,
  type ImportChartTemplateRequest,
  type ChartTemplateQuery,
  type ChartTemplateNodeQuery,
  type ChartTemplateSummary,
  type ChartTemplateDirectory,
  type ChartTemplateNodes,
  type ChartTemplateMutation,
  type PublishChartTemplateRequest,
  chartCompanyPreviewQuerySchema,
  type ChartCompanyPreviewQuery,
  type ChartCompanyPreview,
  adoptCompanyChartRequestSchema,
  adoptCompanyChartResultSchema,
  classifyChartNominalRequestSchema,
  classifyChartNominalResultSchema,
  type AdoptCompanyChartRequest,
  type AdoptCompanyChartResult,
  type ClassifyChartNominalRequest,
  type ClassifyChartNominalResult,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";
import type { FinanceNominalActorContext } from "../nominals/source-repository.js";
import { hasLiveCoaMasterAuthority, isCoaSuperAdministrator } from "../coa-master-authority.js";

import { ChartTemplateError, chartTemplateHash } from "./template-shared.js";
export { ChartTemplateError, chartTemplateHash } from "./template-shared.js";
import {
  adoptCompanyChart,
  classifyCompanyNominal,
  companyChartPermission,
  companyReplay,
} from "./company-adoption.js";
const projection = `select id,catalog_key,name,revision,state,row_version as version,source_filename,
 source_sha256,content_sha256,category_count,section_count,nominal_count,
 to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
 case when published_at is null then null else to_char(published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as published_at
 from finance_chart_template`;
type Context = FinanceNominalActorContext;

export class SourceChartTemplateRepository {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(
    context: Context,
    permission: string,
    work: (client: PoolClient) => Promise<T>,
    consistentSnapshot = false,
  ): Promise<T> {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      throw new ChartTemplateError(403, "PERMISSION_DENIED", "Central template permission is required.");
    if (permission.endsWith(".admin") && !isCoaSuperAdministrator(context))
      throw new ChartTemplateError(
        403,
        "COA_SUPER_ADMIN_REQUIRED",
        "Only a global Super Admin may change category/section definitions.",
      );
    if (permission.endsWith(".admin") && (context.realActorId || context.impersonationRequestId))
      throw new ChartTemplateError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Template changes are disabled during impersonation.",
      );
    const client = await this.pool.connect();
    try {
      await client.query(consistentSnapshot ? "begin isolation level repeatable read" : "begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      if (permission.endsWith(".admin") && !(await hasLiveCoaMasterAuthority(client, context)))
        throw new ChartTemplateError(403, "COA_SUPER_ADMIN_REQUIRED", "Live global Super Admin authority is required.");
      const grant = await client.query(
        `select 1 from security_user_role_assignment_version a
       join security_user_account u on u.tenant_id=a.tenant_id and u.id=a.user_id and u.status='active' and u.archived_at is null
       join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id and p.status='active' and p.lifecycle_state='active'
       join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id and r.lifecycle_state='active'
       join security_role_permission_grant g on g.tenant_id=p.tenant_id and g.role_policy_id=p.id and g.permission_key=$3
       join security_permission_definition d on d.permission_key=g.permission_key and d.status='active'
       join security_role_scope_grant s on s.tenant_id=g.tenant_id and s.role_policy_id=g.role_policy_id and s.permission_key=g.permission_key
       where a.tenant_id=$1 and a.user_id=$2 and a.lifecycle_state='active' and a.valid_from<=now()
       and (a.valid_until is null or a.valid_until>now())
       and a.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=a.tenant_id and v.assignment_id=a.assignment_id)
       and s.scope_kind='tenant' and s.scope_value=$1 limit 1`,
        [context.tenantId, context.actor.userId, permission],
      );
      if (!grant.rowCount)
        throw new ChartTemplateError(
          403,
          "PERMISSION_DENIED",
          "Tenant-scoped central template permission is required.",
        );
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "23505")
          throw new ChartTemplateError(
            409,
            "TEMPLATE_REVISION_CONFLICT",
            "The template revision or request already exists.",
          );
        if (["23514", "23503", "40001", "40P01"].includes(String(error.code)))
          throw new ChartTemplateError(
            409,
            "TEMPLATE_INTEGRITY_CONFLICT",
            "Template setup changed or is incomplete. Refresh and review the revision.",
          );
      }
      throw error;
    } finally {
      client.release();
    }
  }
  private async load(client: PoolClient, tenant: string, id: string): Promise<ChartTemplateSummary> {
    const result = await client.query(`${projection} where tenant_id=$1 and id=$2`, [tenant, id]);
    if (!result.rowCount)
      throw new ChartTemplateError(404, "TEMPLATE_NOT_FOUND", "The central template was not found.");
    return chartTemplateSummarySchema.parse(result.rows[0]);
  }
  async list(context: Context, input: ChartTemplateQuery): Promise<ChartTemplateDirectory> {
    const query = chartTemplateQuerySchema.parse(input),
      offset = Number(query.cursor ?? 0);
    return this.transaction(context, "finance.chart_template.read", async (client) => {
      const result = await client.query(
        `${projection} where tenant_id=$1 order by created_at desc,id limit $2 offset $3`,
        [context.tenantId, query.limit + 1, offset],
      );
      return {
        items: result.rows.slice(0, query.limit).map((row) => chartTemplateSummarySchema.parse(row)),
        next_cursor: result.rows.length > query.limit ? String(offset + query.limit) : null,
      };
    });
  }
  async get(context: Context, id: string): Promise<ChartTemplateSummary> {
    return this.transaction(context, "finance.chart_template.read", (client) =>
      this.load(client, context.tenantId, id),
    );
  }
  async companyPreview(context: Context, id: string, request: ChartCompanyPreviewQuery): Promise<ChartCompanyPreview> {
    const input = chartCompanyPreviewQuerySchema.parse(request);
    return this.transaction(
      context,
      "finance.chart_template.read",
      (client) => this.buildCompanyPreview(client, context, id, input),
      true,
    );
  }
  private async buildCompanyPreview(
    client: PoolClient,
    context: Context,
    id: string,
    input: ChartCompanyPreviewQuery,
  ): Promise<ChartCompanyPreview> {
    // Take a consistent read snapshot. This operation never changes company data.
    const company = await client.query<{ id: string; code: string; name: string }>(
      `select c.id,c.code,c.name from organization_unit c
       join security_user_company_access access on access.tenant_id=c.tenant_id and access.company_id=c.id
       where c.tenant_id=$1 and c.id=$2 and c.type='company' and c.status='active'
       and access.user_id=$3 and access.revoked_at is null`,
      [context.tenantId, input.company_id, context.actor.userId],
    );
    if (!company.rowCount || !context.actor.permissions.includes("finance.nominal.read"))
      throw new ChartTemplateError(403, "COMPANY_ACCESS_DENIED", "Company-scoped Finance access is required.");
    const grant = await client.query(
      `select 1 from security_user_role_assignment_version a
       join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id and p.status='active' and p.lifecycle_state='active'
       join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id and r.lifecycle_state='active'
       join security_role_permission_grant g on g.tenant_id=p.tenant_id and g.role_policy_id=p.id and g.permission_key='finance.nominal.read'
       join security_permission_definition d on d.permission_key=g.permission_key and d.status='active'
       join security_role_scope_grant s on s.tenant_id=g.tenant_id and s.role_policy_id=g.role_policy_id and s.permission_key=g.permission_key
       where a.tenant_id=$1 and a.user_id=$2 and a.lifecycle_state='active' and a.valid_from<=now()
       and (a.valid_until is null or a.valid_until>now()) and a.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=a.tenant_id and v.assignment_id=a.assignment_id)
       and ((s.scope_kind='tenant' and s.scope_value=$1) or (s.scope_kind='company' and s.scope_value=$3)) limit 1`,
      [context.tenantId, context.actor.userId, input.company_id],
    );
    if (!grant.rowCount)
      throw new ChartTemplateError(403, "COMPANY_ACCESS_DENIED", "Company-scoped Finance access is required.");
    const template = await this.load(client, context.tenantId, id);
    if (template.state !== "published")
      throw new ChartTemplateError(
        409,
        "TEMPLATE_NOT_PUBLISHED",
        "Publish the reference revision before company adoption.",
      );
    const currency = await client.query(
      "select code from currency where tenant_id=$1 and code=$2 and status='active'",
      [context.tenantId, input.currency],
    );
    if (!currency.rowCount)
      throw new ChartTemplateError(400, "TEMPLATE_CURRENCY_INVALID", "Select an active Currency Master record.");
    const definitions = await client.query<ChartTemplateNodes["items"][number]>(
      `select node_key as key,kind,code,name,parent_key,account_type as type,source_rows,review_note from finance_chart_template_node where tenant_id=$1 and template_id=$2 order by case kind when 'category' then 1 when 'section' then 2 else 3 end,code,node_key limit 11101`,
      [context.tenantId, id],
    );
    const expected = template.category_count + template.section_count + template.nominal_count;
    if (definitions.rows.length !== expected)
      throw new ChartTemplateError(409, "TEMPLATE_INTEGRITY_CONFLICT", "The template definition totals do not match.");
    // An existing governed Cash & Bank policy establishes header identity.
    // Reuse its category only when the section ALREADY matches the source
    // code/name and its active root category matches the source classification.
    // Never infer Bank leaf identity from similar display names.
    const governedCategory = await client.query<{ code: string; name: string; type: string }>(
      `select c.code,c.name,c.type from finance_nominal_section_policy p
          join account s on s.tenant_id=p.tenant_id and s.company_id=p.company_id and s.id=p.section_id
          join account c on c.tenant_id=p.tenant_id and c.company_id=p.company_id and c.id=p.category_id and s.parent_id=c.id
          where p.tenant_id=$1 and p.company_id=$2 and p.section_role='cash_and_bank' and p.status='active'
          and s.code='2309' and s.name='Cash and Bank' and s.type='asset' and s.is_header and s.status='active'
          and c.type='asset' and c.is_header and c.status='active' and c.parent_id is null`,
      [context.tenantId, input.company_id],
    );
    const sourceBankCategoryKey = definitions.rows.find(
      (node) => node.kind === "section" && node.code === "2309",
    )?.parent_key;
    const categoryCode = (nodeKey: string) => {
      const source = definitions.rows.find((node) => node.key === nodeKey && node.kind === "category");
      const governed = governedCategory.rows[0];
      return nodeKey === sourceBankCategoryKey &&
        source &&
        governed &&
        source.name === governed.name &&
        source.type === governed.type
        ? governed.code
        : `CAT-${chartTemplateHash({ catalog: template.catalog_key, key: nodeKey }).slice(0, 24)}`;
    };
    const codes = definitions.rows.map((node) => node.code ?? categoryCode(node.key));
    interface Existing {
      id: string;
      code: string;
      name: string;
      type: string;
      parent_id: string | null;
      is_header: boolean;
      status: string;
      managed_general_nominal: boolean;
      managed_bank_nominal: boolean;
      currency: string | null;
      version: string | null;
      state: string | null;
    }
    const existing = await client.query<Existing>(
      `select a.id,a.code,a.name,a.type,a.parent_id,a.is_header,a.status,a.managed_general_nominal,a.managed_bank_nominal,g.currency,g.row_version::text as version,g.state from account a
       left join finance_general_nominal g on g.tenant_id=a.tenant_id and g.company_id=a.company_id and g.nominal_id=a.id
       where a.tenant_id=$1 and a.company_id=$2 and a.code=any($3::text[]) order by a.code,a.id`,
      [context.tenantId, input.company_id, codes],
    );
    const policies = await client.query<{
      section_id: string;
      section_code: string;
      category_id: string;
      prefix: string;
      row_version: string;
    }>(
      `select p.section_id,s.code as section_code,p.category_id,p.prefix,p.row_version::text from finance_nominal_section_policy p join account s on s.tenant_id=p.tenant_id and s.company_id=p.company_id and s.id=p.section_id where p.tenant_id=$1 and p.company_id=$2 and p.section_role='cash_and_bank'`,
      [context.tenantId, input.company_id],
    );
    const byCode = new Map(existing.rows.map((row) => [row.code, row]));
    const bindings = await client.query<{ node_key: string; nominal_id: string }>(
      `select node_key,nominal_id from finance_chart_bank_binding where tenant_id=$1 and company_id=$2 and template_id=$3`,
      [context.tenantId, input.company_id, id],
    );
    const boundBanks = new Map(bindings.rows.map((binding) => [binding.node_key, binding.nominal_id]));
    const bankSections = new Set(
      definitions.rows.filter((node) => node.kind === "section" && node.code === "2309").map((node) => node.key),
    );
    const resolved = new Map<string, string>();
    const items: ChartCompanyPreview["items"] = [];
    const totals = {
      categories_to_create: 0,
      sections_to_create: 0,
      nominal_drafts_to_create: 0,
      exact_matches: 0,
      conflicts: 0,
      bank_references: 0,
    };
    for (const node of definitions.rows) {
      const code = node.code ?? categoryCode(node.key),
        current = byCode.get(code);
      let status: ChartCompanyPreview["items"][number]["status"] = "create",
        message = "Create an inactive governed nominal draft; posting classification and approval remain separate.";
      if (node.kind !== "nominal")
        message =
          node.kind === "category"
            ? "Create a company category with an internal identifier; no source category number was supplied."
            : "Create the company section; preserve its template code.";
      if (node.kind === "nominal" && bankSections.has(node.parent_key ?? "")) {
        const bound = boundBanks.get(node.key);
        status = bound
          ? current?.id === bound &&
            current.managed_bank_nominal &&
            current.name === node.name &&
            current.parent_id === resolved.get(node.parent_key!)
            ? "match"
            : "conflict"
          : "bank_setup_required";
        message =
          status === "match"
            ? "Explicit Bank definition configured; its own currency and Bank approval lifecycle are preserved."
            : status === "conflict"
              ? "Configured Bank definition differs from its source identity; review without overwriting history."
              : "Bank reference only. Select this definition and its actual currency through the Bank creation workflow.";
      } else if (bankSections.has(node.key) && policies.rows.some((policy) => policy.section_code !== code)) {
        status = "conflict";
        message = `Existing Cash & Bank section ${policies.rows[0]!.section_code} uses a protected code series. An explicit preservation/mapping decision is required; no replacement or reparenting will occur.`;
      } else if (current) {
        const parentId = node.parent_key ? resolved.get(node.parent_key) : null;
        const exact =
          current.name === node.name &&
          current.type === node.type &&
          current.is_header === (node.kind !== "nominal") &&
          current.parent_id === parentId &&
          (node.kind !== "nominal"
            ? current.status === "active"
            : current.managed_general_nominal && current.currency === input.currency);
        status = exact ? "match" : "conflict";
        message = exact
          ? "Reuse the exact company identity; do not recreate it."
          : "Existing code has a different identity, hierarchy, governance or currency. Review without overwriting history.";
      }
      if (status === "match") {
        totals.exact_matches++;
        resolved.set(node.key, current!.id);
      } else if (status === "conflict") totals.conflicts++;
      else if (status === "bank_setup_required") totals.bank_references++;
      else {
        if (node.kind === "category") totals.categories_to_create++;
        else if (node.kind === "section") totals.sections_to_create++;
        else totals.nominal_drafts_to_create++;
        resolved.set(
          node.key,
          `planned-${chartTemplateHash({ company: input.company_id, catalog: template.catalog_key, key: node.key }).slice(0, 32)}`,
        );
      }
      items.push({
        key: node.key,
        kind: node.kind,
        code,
        name: node.name,
        status,
        existing_account_id: current?.id ?? null,
        message,
      });
    }
    const offset = Number(input.cursor ?? 0);
    const adoption = await client.query<{ id: string }>(
      "select id from finance_chart_company_adoption where tenant_id=$1 and company_id=$2 and catalog_key=$3",
      [context.tenantId, input.company_id, template.catalog_key],
    );
    return {
      template_id: id,
      template_version: template.version,
      company: company.rows[0]!,
      currency: input.currency,
      preview_sha256: chartTemplateHash({
        template: template.content_sha256,
        company: input.company_id,
        currency: input.currency,
        items,
        existing: existing.rows,
        policies: policies.rows,
      }),
      adoption_id: adoption.rows[0]?.id ?? null,
      blocked: totals.conflicts > 0,
      blocking_issues: items
        .filter((item) => item.status === "conflict")
        .slice(0, 100)
        .map((item) => ({ code: item.code, name: item.name, message: item.message })),
      totals,
      items: items.slice(offset, offset + input.limit),
      next_cursor: items.length > offset + input.limit ? String(offset + input.limit) : null,
    };
  }
  async adoptCompany(
    context: Context,
    id: string,
    request: AdoptCompanyChartRequest,
    key: string,
    correlation: string,
  ): Promise<AdoptCompanyChartResult> {
    const input = adoptCompanyChartRequestSchema.parse(request);
    this.validateKey(key);
    return this.transaction(context, "finance.chart_template.read", async (client) => {
      await companyChartPermission(client, context, input.company_id, "finance.chart_template.adopt");
      await companyChartPermission(client, context, input.company_id, "finance.nominal.create");
      const fingerprint = chartTemplateHash({ template_id: id, ...input });
      const prior = await companyReplay(client, context, "adopted", key, fingerprint);
      if (prior) return { ...adoptCompanyChartResultSchema.parse(prior), replayed: true };
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:chart-adoption:${context.tenantId}:${input.company_id}`,
      ]);
      // Lock competing account/numbering writes for a bounded setup transaction.
      // All current Finance create paths take account ROW EXCLUSIVE locks, so
      // they cannot allocate a conflicting code during this reviewed adoption.
      await client.query("set local lock_timeout='5s'");
      await client.query(
        "lock table account,finance_general_nominal_policy,finance_nominal_section_policy in share row exclusive mode",
      );
      const template = await this.load(client, context.tenantId, id);
      if (template.category_count + template.section_count + template.nominal_count > 1000)
        throw new ChartTemplateError(
          409,
          "CHART_ADOPTION_BATCH_LIMIT",
          "This catalog exceeds the 1,000-definition atomic setup limit; a separately reviewed staged adoption is required.",
        );
      const preview = await this.buildCompanyPreview(client, context, id, {
        company_id: input.company_id,
        currency: input.currency,
        limit: 11101,
      });
      return adoptCompanyChart(client, context, template, input, preview, key, correlation);
    });
  }
  async classifyNominal(
    context: Context,
    id: string,
    request: ClassifyChartNominalRequest,
    key: string,
    correlation: string,
  ): Promise<ClassifyChartNominalResult> {
    const input = classifyChartNominalRequestSchema.parse(request);
    this.validateKey(key);
    return this.transaction(context, "finance.chart_template.read", async (client) =>
      classifyChartNominalResultSchema.parse(
        await classifyCompanyNominal(client, context, id, input, key, correlation),
      ),
    );
  }
  async nodes(context: Context, id: string, input: ChartTemplateNodeQuery): Promise<ChartTemplateNodes> {
    const query = chartTemplateNodeQuerySchema.parse(input),
      offset = Number(query.cursor ?? 0);
    return this.transaction(context, "finance.chart_template.read", async (client) => {
      await this.load(client, context.tenantId, id);
      const result = await client.query<ChartTemplateNodes["items"][number]>(
        `select n.node_key as key,n.kind,n.code,n.name,n.parent_key,n.account_type as type,n.source_rows,n.review_note
       from finance_chart_template_node n left join finance_chart_template_node parent
        on parent.tenant_id=n.tenant_id and parent.template_id=n.template_id and parent.node_key=n.parent_key
       where n.tenant_id=$1 and n.template_id=$2
       and ($3::text is null or n.kind=$3) and ($4::text is null or n.parent_key=$4)
       and ($5::text is null or strpos(lower(n.name),lower($5))>0 or strpos(lower(coalesce(n.code,'')),lower($5))>0)
       and ($8::text is null or (n.kind='category' and n.node_key=$8)
         or (n.kind='section' and n.parent_key=$8) or (n.kind='nominal' and parent.parent_key=$8))
       order by n.kind,n.code nulls first,n.node_key limit $6 offset $7`,
        [
          context.tenantId,
          id,
          query.kind ?? null,
          query.parent_key ?? null,
          query.search || null,
          query.limit + 1,
          offset,
          query.category_key ?? null,
        ],
      );
      return {
        items: result.rows.slice(0, query.limit),
        next_cursor: result.rows.length > query.limit ? String(offset + query.limit) : null,
      };
    });
  }
  private validateKey(key: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      throw new ChartTemplateError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
  }
  private async replay(
    client: PoolClient,
    context: Context,
    action: string,
    key: string,
    digest: string,
  ): Promise<ChartTemplateMutation | null> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `chart-template:${context.tenantId}:${context.actor.userId}:${action}:${key}`,
    ]);
    const result = await client.query<{ request_sha256: string; result: unknown }>(
      `select request_sha256,result from finance_chart_template_event where tenant_id=$1 and actor_id=$2 and action=$3 and idempotency_key=$4`,
      [context.tenantId, context.actor.userId, action, key],
    );
    if (!result.rowCount) return null;
    if (result.rows[0]!.request_sha256 !== digest)
      throw new ChartTemplateError(409, "IDEMPOTENCY_CONFLICT", "This request key was used for a different payload.");
    return { ...chartTemplateMutationSchema.parse(result.rows[0]!.result), replayed: true };
  }
  private async evidence(
    client: PoolClient,
    context: Context,
    action: string,
    key: string,
    requestHash: string,
    template: ChartTemplateSummary,
    correlation: string,
  ): Promise<ChartTemplateMutation> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const latest = await client.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [context.tenantId],
    );
    const id = `audit-${randomUUID()}`,
      occurred = new Date().toISOString();
    const payload = {
      id,
      tenant_id: context.tenantId,
      sequence: Number(latest.rows[0]?.sequence ?? 0) + 1,
      actor_id: context.actor.userId,
      correlation_id: correlation,
      action: `finance.chart_template.${action}`,
      entity_type: "finance_chart_template",
      entity_id: template.id,
      before_hash: chartTemplateHash(action === "imported" ? null : { id: template.id, version: 1, state: "draft" }),
      after_hash: chartTemplateHash(template),
      source_reference: "finance.chart_template",
      approval_reference: null,
      occurred_at: occurred,
      previous_event_hash: latest.rows[0]?.event_hash ?? chartTemplateHash({ genesis: context.tenantId }),
    };
    await client.query(
      `insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        context.tenantId,
        payload.sequence,
        context.actor.userId,
        correlation,
        payload.action,
        payload.entity_type,
        template.id,
        payload.before_hash,
        payload.after_hash,
        payload.source_reference,
        null,
        occurred,
        payload.previous_event_hash,
        chartTemplateHash(payload),
      ],
    );
    const result: ChartTemplateMutation = { template, audit_event_id: id, replayed: false };
    await client.query(
      `insert into finance_chart_template_event(tenant_id,event_id,template_id,action,actor_id,idempotency_key,request_sha256,result) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [context.tenantId, id, template.id, action, context.actor.userId, key, requestHash, JSON.stringify(result)],
    );
    return result;
  }
  async import(
    context: Context,
    request: ImportChartTemplateRequest,
    key: string,
    correlation: string,
  ): Promise<ChartTemplateMutation> {
    const input = importChartTemplateRequestSchema.parse(request);
    this.validateKey(key);
    const digest = chartTemplateHash(input);
    return this.transaction(context, "finance.chart_template.admin", async (client) => {
      const replay = await this.replay(client, context, "imported", key, digest);
      if (replay) return replay;
      const id = `chart-${randomUUID()}`;
      await client.query(
        `insert into finance_chart_template(tenant_id,id,catalog_key,name,revision,source_filename,source_sha256,content_sha256,category_count,section_count,nominal_count,created_by)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          context.tenantId,
          id,
          input.catalog_key,
          input.name,
          input.revision,
          input.source_filename,
          input.source_sha256,
          digest,
          input.categories.length,
          input.sections.length,
          input.nominals.length,
          context.actor.userId,
        ],
      );
      const categoryMap = new Map(input.categories.map((category) => [category.key, category]));
      const sectionMap = new Map(input.sections.map((section) => [section.code, section]));
      const categoryNodes = input.categories.map((c) => ({
        key: `category:${c.key}`,
        kind: "category",
        code: null,
        name: c.name,
        parent: null,
        type: c.type,
        source: [],
        note: null,
      }));
      const sectionNodes = input.sections.map((s) => ({
        key: `section:${s.code}`,
        kind: "section",
        code: s.code,
        name: s.name,
        parent: `category:${s.category_key}`,
        type: categoryMap.get(s.category_key)!.type,
        source: [],
        note: null,
      }));
      const nominalNodes = input.nominals.map((n) => ({
        key: `nominal:${n.code}`,
        kind: "nominal",
        code: n.code,
        name: n.name,
        parent: `section:${n.section_code}`,
        type: categoryMap.get(sectionMap.get(n.section_code)!.category_key)!.type,
        source: n.source_rows,
        note: n.review_note ?? null,
      }));
      // Insert levels separately so parent validation sees each completed preceding level.
      for (const level of [categoryNodes, sectionNodes, nominalNodes])
        await client.query(
          `insert into finance_chart_template_node(tenant_id,template_id,node_key,kind,code,name,parent_key,account_type,source_rows,review_note)
       select $1,$2,x.key,x.kind,x.code,x.name,x.parent,x.type,x.source,x.note
       from jsonb_to_recordset($3::jsonb) as x(key text,kind text,code text,name text,parent text,type text,source jsonb,note text)`,
          [context.tenantId, id, JSON.stringify(level)],
        );
      return this.evidence(
        client,
        context,
        "imported",
        key,
        digest,
        await this.load(client, context.tenantId, id),
        correlation,
      );
    });
  }
  async publish(
    context: Context,
    id: string,
    input: PublishChartTemplateRequest,
    key: string,
    correlation: string,
  ): Promise<ChartTemplateMutation> {
    input = publishChartTemplateRequestSchema.parse(input);
    this.validateKey(key);
    const digest = chartTemplateHash({ id, ...input });
    return this.transaction(context, "finance.chart_template.admin", async (client) => {
      const replay = await this.replay(client, context, "published", key, digest);
      if (replay) return replay;
      await client.query("select id from finance_chart_template where tenant_id=$1 and id=$2 for update", [
        context.tenantId,
        id,
      ]);
      const before = await this.load(client, context.tenantId, id);
      if (before.version !== input.expected_version || before.state !== "draft")
        throw new ChartTemplateError(
          409,
          "TEMPLATE_VERSION_CONFLICT",
          "Refresh the current draft revision before publishing.",
        );
      await client.query(
        "update finance_chart_template set state='published',row_version=2,published_by=$3,published_at=clock_timestamp() where tenant_id=$1 and id=$2",
        [context.tenantId, id, context.actor.userId],
      );
      return this.evidence(
        client,
        context,
        "published",
        key,
        digest,
        await this.load(client, context.tenantId, id),
        correlation,
      );
    });
  }
}
