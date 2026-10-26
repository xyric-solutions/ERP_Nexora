import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  AdoptCompanyChartRequest,
  AdoptCompanyChartResult,
  ChartCompanyPreview,
  ChartTemplateNodes,
  ChartTemplateSummary,
  ClassifyChartNominalRequest,
  ClassifyChartNominalResult,
} from "@nexora/contracts";
import { classifyChartNominalResultSchema } from "@nexora/contracts";
import type { FinanceNominalActorContext } from "../nominals/source-repository.js";
import { ChartTemplateError, chartTemplateHash } from "./template-shared.js";
import { hasLiveCoaMasterAuthority } from "../coa-master-authority.js";
type Context = FinanceNominalActorContext;

export async function companyChartPermission(
  client: PoolClient,
  context: Context,
  companyId: string,
  permission: string,
) {
  if (!(await hasLiveCoaMasterAuthority(client, context, companyId)))
    throw new ChartTemplateError(
      403,
      "COA_SUPER_ADMIN_REQUIRED",
      "Only a live Super Admin may change company Chart of Accounts master data.",
    );
  if (context.realActorId || context.impersonationRequestId || !context.actor.permissions.includes(permission))
    throw new ChartTemplateError(
      403,
      "PERMISSION_DENIED",
      "Company chart mutation authority is required; impersonation is not allowed.",
    );
  const grant = await client.query(
    `select 1 from security_user_account u
 join security_user_company_access c on c.tenant_id=u.tenant_id and c.user_id=u.id and c.company_id=$3 and c.revoked_at is null
 join organization_unit company on company.tenant_id=c.tenant_id and company.id=c.company_id and company.type='company' and company.status='active'
 join security_user_role_assignment_version a on a.tenant_id=u.tenant_id and a.user_id=u.id
 join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id and p.status='active' and p.lifecycle_state='active'
 join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id and r.lifecycle_state='active'
 join security_role_permission_grant g on g.tenant_id=p.tenant_id and g.role_policy_id=p.id and g.permission_key=$4
 join security_permission_definition d on d.permission_key=g.permission_key and d.status='active'
 join security_role_scope_grant s on s.tenant_id=g.tenant_id and s.role_policy_id=g.role_policy_id and s.permission_key=g.permission_key
 where u.tenant_id=$1 and u.id=$2 and u.status='active' and u.archived_at is null
 and a.lifecycle_state='active' and a.valid_from<=now() and (a.valid_until is null or a.valid_until>now())
 and a.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=a.tenant_id and v.assignment_id=a.assignment_id)
 and ((s.scope_kind='tenant' and s.scope_value=$1) or (s.scope_kind='company' and s.scope_value=$3)) limit 1`,
    [context.tenantId, context.actor.userId, companyId, permission],
  );
  if (!grant.rowCount)
    throw new ChartTemplateError(403, "COMPANY_ACCESS_DENIED", "Live company-scoped chart authority is required.");
}

async function audit(
  client: PoolClient,
  context: Context,
  companyId: string,
  templateId: string,
  action: string,
  before: unknown,
  after: unknown,
  correlation: string,
) {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `nexora:platform:audit:${context.tenantId}`,
  ]);
  const latest = await client.query<{ sequence: string; event_hash: string }>(
    "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
    [context.tenantId],
  );
  const id = `audit-${randomUUID()}`;
  const event = {
    id,
    tenant_id: context.tenantId,
    sequence: Number(latest.rows[0]?.sequence ?? 0) + 1,
    actor_id: context.actor.userId,
    correlation_id: correlation,
    action: `finance.chart_template.company_${action}`,
    entity_type: "finance_chart_company_adoption",
    entity_id: companyId,
    before_hash: chartTemplateHash(before),
    after_hash: chartTemplateHash(after),
    source_reference: templateId,
    approval_reference: null,
    occurred_at: new Date().toISOString(),
    previous_event_hash: latest.rows[0]?.event_hash ?? chartTemplateHash({ genesis: context.tenantId }),
  };
  await client.query(
    `insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      event.tenant_id,
      event.sequence,
      event.actor_id,
      event.correlation_id,
      event.action,
      event.entity_type,
      event.entity_id,
      event.before_hash,
      event.after_hash,
      event.source_reference,
      null,
      event.occurred_at,
      event.previous_event_hash,
      chartTemplateHash(event),
    ],
  );
  return id;
}
export async function companyReplay(
  client: PoolClient,
  context: Context,
  action: "adopted" | "classified",
  key: string,
  fingerprint: string,
) {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `chart-company:${context.tenantId}:${context.actor.userId}:${action}:${key}`,
  ]);
  const replay = await client.query<{ request_sha256: string; result: unknown }>(
    `select request_sha256,result from finance_chart_company_event where tenant_id=$1 and actor_id=$2 and action=$3 and idempotency_key=$4`,
    [context.tenantId, context.actor.userId, action, key],
  );
  if (!replay.rowCount) return null;
  if (replay.rows[0]!.request_sha256 !== fingerprint)
    throw new ChartTemplateError(409, "IDEMPOTENCY_CONFLICT", "The request key was used with a different payload.");
  return replay.rows[0]!.result;
}
export async function adoptCompanyChart(
  client: PoolClient,
  context: Context,
  template: ChartTemplateSummary,
  input: AdoptCompanyChartRequest,
  preview: ChartCompanyPreview,
  key: string,
  correlation: string,
): Promise<AdoptCompanyChartResult> {
  if (template.version !== input.expected_template_version || preview.preview_sha256 !== input.preview_sha256)
    throw new ChartTemplateError(409, "CHART_PREVIEW_STALE", "Company setup changed. Run and review a fresh preview.");
  if (preview.blocked)
    throw new ChartTemplateError(409, "CHART_ADOPTION_CONFLICT", "Resolve every preview conflict before adoption.");
  const prior = await client.query(
    "select id from finance_chart_company_adoption where tenant_id=$1 and company_id=$2 and catalog_key=$3",
    [context.tenantId, input.company_id, template.catalog_key],
  );
  if (prior.rowCount)
    throw new ChartTemplateError(
      409,
      "CHART_ALREADY_ADOPTED",
      "This company already adopted the catalog. Existing identities will not be recreated.",
    );
  const nodes = await client.query<ChartTemplateNodes["items"][number]>(
    `select node_key as key,kind,code,name,parent_key,account_type as type,source_rows,review_note from finance_chart_template_node where tenant_id=$1 and template_id=$2 order by case kind when 'category' then 1 when 'section' then 2 else 3 end,code,node_key`,
    [context.tenantId, template.id],
  );
  const id = `chart-adoption-${randomUUID()}`;
  await client.query(
    "insert into finance_chart_company_adoption(tenant_id,company_id,id,template_id,catalog_key,currency,created_by) values($1,$2,$3,$4,$5,$6,$7)",
    [context.tenantId, input.company_id, id, template.id, template.catalog_key, input.currency, context.actor.userId],
  );
  // Preview items are supplied as a complete internally collected plan, not a browser payload.
  const plan = new Map(preview.items.map((item) => [item.key, item]));
  const resolved = new Map<string, string>();
  const counts = {
    created_categories: 0,
    created_sections: 0,
    created_nominals: 0,
    matched_accounts: 0,
    bank_references: 0,
  };
  const mappings: Array<{ key: string; account_id: string | null; classification: string }> = [];
  for (const node of nodes.rows) {
    const planned = plan.get(node.key);
    if (!planned) throw new ChartTemplateError(409, "CHART_PLAN_INCOMPLETE", "Company preview is incomplete.");
    if (planned.status === "bank_setup_required") {
      mappings.push({ key: node.key, account_id: null, classification: "not_applicable" });
      counts.bank_references++;
      continue;
    }
    let accountId = planned.existing_account_id;
    if (planned.status === "match") counts.matched_accounts++;
    else if (planned.status === "create") {
      accountId = `nominal-${randomUUID()}`;
      await client.query(
        `insert into account(tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,reconciliation_required,managed_general_nominal,created_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,clock_timestamp())`,
        [
          context.tenantId,
          input.company_id,
          accountId,
          planned.code,
          node.name,
          node.type,
          node.parent_key ? resolved.get(node.parent_key) : null,
          node.kind !== "nominal",
          node.kind === "nominal" ? "inactive" : "active",
          node.kind === "nominal",
          node.kind === "nominal",
        ],
      );
      if (node.kind === "category") counts.created_categories++;
      else if (node.kind === "section") counts.created_sections++;
      else {
        counts.created_nominals++;
        await client.query(
          "insert into finance_general_nominal(tenant_id,company_id,nominal_id,currency,created_by) values($1,$2,$3,$4,$5)",
          [context.tenantId, input.company_id, accountId, input.currency, context.actor.userId],
        );
        await client.query(
          `insert into finance_general_nominal_event(tenant_id,event_id,company_id,nominal_id,event_type,resulting_version,actor_id) values($1,$2,$3,$4,'created',1,$5)`,
          [context.tenantId, `nominal-event-${randomUUID()}`, input.company_id, accountId, context.actor.userId],
        );
      }
    } else throw new ChartTemplateError(409, "CHART_ADOPTION_CONFLICT", "The preview contains a conflicting account.");
    if (!accountId)
      throw new ChartTemplateError(409, "CHART_PLAN_INCOMPLETE", "A company identity could not be resolved.");
    resolved.set(node.key, accountId);
    mappings.push({
      key: node.key,
      account_id: accountId,
      classification: node.kind === "nominal" ? "review_required" : "not_applicable",
    });
    if (node.kind === "section" && node.code !== "2309") {
      const sourceCodes = nodes.rows
        .filter((child) => child.kind === "nominal" && child.parent_key === node.key)
        .map((child) => child.code!);
      if (
        !/^\d{4}$/.test(node.code!) ||
        sourceCodes.some((code) => !code.startsWith(node.code!) || !/^\d{6}$/.test(code))
      )
        throw new ChartTemplateError(
          409,
          "CHART_CODE_POLICY_REQUIRED",
          "Source section numbering needs explicit review.",
        );
      const occupied = await client.query<{ code: string }>(
        "select code from account where tenant_id=$1 and company_id=$2 and parent_id=$3",
        [context.tenantId, input.company_id, accountId],
      );
      const next = Math.max(
        1,
        ...[...sourceCodes, ...occupied.rows.map((row) => row.code)]
          .filter((code) => code.startsWith(node.code!) && /^\d{6}$/.test(code))
          .map((code) => Number(code.slice(4)) + 1),
      );
      if (next > 100)
        throw new ChartTemplateError(409, "CHART_CODE_RANGE_EXHAUSTED", "Source nominal code range is exhausted.");
      const existingPolicy = await client.query(
        "select prefix,code_width,next_value,last_value from finance_general_nominal_policy where tenant_id=$1 and company_id=$2 and section_id=$3 for update",
        [context.tenantId, input.company_id, accountId],
      );
      if (existingPolicy.rowCount) {
        const policy = existingPolicy.rows[0];
        if (policy.prefix !== node.code || policy.code_width !== 2 || Number(policy.last_value) !== 99)
          throw new ChartTemplateError(
            409,
            "CHART_POLICY_CONFLICT",
            "Existing numbering policy differs; no replacement is allowed.",
          );
        await client.query(
          "update finance_general_nominal_policy set next_value=greatest(next_value,$4) where tenant_id=$1 and company_id=$2 and section_id=$3",
          [context.tenantId, input.company_id, accountId, next],
        );
      } else
        await client.query(
          `insert into finance_general_nominal_policy(tenant_id,company_id,section_id,category_id,prefix,code_width,next_value,last_value) values($1,$2,$3,$4,$5,2,$6,99)`,
          [context.tenantId, input.company_id, accountId, resolved.get(node.parent_key!), node.code, next],
        );
    }
  }
  await client.query(
    `insert into finance_chart_company_node(tenant_id,company_id,template_id,node_key,account_id,posting_classification)
   select $1,$2,$3,x.key,x.account_id,x.classification from jsonb_to_recordset($4::jsonb) as x(key text,account_id text,classification text)`,
    [context.tenantId, input.company_id, template.id, JSON.stringify(mappings)],
  );
  const auditId = await audit(
    client,
    context,
    input.company_id,
    template.id,
    "adopted",
    null,
    { adoption_id: id, currency: input.currency, mappings, counts },
    correlation,
  );
  const result = {
    adoption_id: id,
    company_id: input.company_id,
    template_id: template.id,
    ...counts,
    audit_event_id: auditId,
    replayed: false,
  };
  await client.query(
    `insert into finance_chart_company_event(tenant_id,event_id,company_id,template_id,action,actor_id,idempotency_key,request_sha256,result) values($1,$2,$3,$4,'adopted',$5,$6,$7,$8)`,
    [
      context.tenantId,
      auditId,
      input.company_id,
      template.id,
      context.actor.userId,
      key,
      chartTemplateHash({ template_id: template.id, ...input }),
      JSON.stringify(result),
    ],
  );
  return result;
}

export async function classifyCompanyNominal(
  client: PoolClient,
  context: Context,
  nominalId: string,
  input: ClassifyChartNominalRequest,
  key: string,
  correlation: string,
): Promise<ClassifyChartNominalResult> {
  const mapping = await client.query<{
    company_id: string;
    template_id: string;
    node_key: string;
    posting_classification: string;
    review_version: number;
  }>(
    `select company_id,template_id,node_key,posting_classification,review_version from finance_chart_company_node where tenant_id=$1 and account_id=$2 for update`,
    [context.tenantId, nominalId],
  );
  if (mapping.rowCount !== 1)
    throw new ChartTemplateError(404, "CHART_NOMINAL_NOT_FOUND", "The adopted nominal was not found.");
  const row = mapping.rows[0]!;
  await companyChartPermission(client, context, row.company_id, "finance.chart_template.classify");
  await companyChartPermission(client, context, row.company_id, "finance.nominal.update");
  const fingerprint = chartTemplateHash({ nominal_id: nominalId, ...input });
  const prior = await companyReplay(client, context, "classified", key, fingerprint);
  if (prior) return { ...classifyChartNominalResultSchema.parse(prior), replayed: true };
  const profile = await client.query<{ state: string; row_version: string }>(
    `select state,row_version from finance_general_nominal where tenant_id=$1 and nominal_id=$2 and company_id=$3 for update`,
    [context.tenantId, nominalId, row.company_id],
  );
  if (
    !profile.rowCount ||
    profile.rows[0]!.state !== "draft" ||
    Number(profile.rows[0]!.row_version) !== input.expected_version
  )
    throw new ChartTemplateError(
      409,
      "CHART_NOMINAL_VERSION_CONFLICT",
      "Only the latest governed draft may be classified.",
    );
  await client.query(
    `update finance_chart_company_node set posting_classification=$3,reviewed_by=$4,review_reason=$5,review_version=review_version+1 where tenant_id=$1 and account_id=$2`,
    [context.tenantId, nominalId, input.classification, context.actor.userId, input.reason],
  );
  await client.query(
    `update finance_general_nominal set row_version=row_version+1,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where tenant_id=$1 and nominal_id=$2`,
    [context.tenantId, nominalId],
  );
  await client.query(
    `insert into finance_general_nominal_event(tenant_id,event_id,company_id,nominal_id,event_type,resulting_version,actor_id,reason) values($1,$2,$3,$4,'updated',$5,$6,$7)`,
    [
      context.tenantId,
      `nominal-event-${randomUUID()}`,
      row.company_id,
      nominalId,
      input.expected_version + 1,
      context.actor.userId,
      input.reason,
    ],
  );
  const result = {
    nominal_id: nominalId,
    company_id: row.company_id,
    classification: input.classification,
    version: input.expected_version + 1,
    review_version: row.review_version + 1,
  };
  const auditId = await audit(client, context, row.company_id, row.template_id, "classified", row, result, correlation);
  const response = { ...result, audit_event_id: auditId, replayed: false };
  await client.query(
    `insert into finance_chart_company_event(tenant_id,event_id,company_id,template_id,node_key,action,actor_id,idempotency_key,request_sha256,result) values($1,$2,$3,$4,$5,'classified',$6,$7,$8,$9)`,
    [
      context.tenantId,
      auditId,
      row.company_id,
      row.template_id,
      row.node_key,
      context.actor.userId,
      key,
      fingerprint,
      JSON.stringify(response),
    ],
  );
  return response;
}
