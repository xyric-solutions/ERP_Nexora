import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import type { PoolClient } from "pg";
import {
  businessSetupSchema,
  businessSetupResultSchema,
  businessTemplateRolesSchema,
  importChartTemplateRequestSchema,
  type BusinessSetupInput,
  type BusinessSetupResult,
  type ChartCompanyPreview,
  type ChartCompanyPreviewQuery,
  type ChartTemplateMutation,
  type ChartTemplateSummary,
  type ImportChartTemplateRequest,
} from "@nexora/contracts";
import type { FinanceNominalActorContext } from "../nominals/source-repository.js";
import { changeCoaMaster } from "../coa-master-change.js";
import { adoptCompanyChart, classifyCompanyNominal, companyChartPermission } from "./company-adoption.js";
import { ChartTemplateError, chartTemplateHash } from "./template-shared.js";
import { operationalAudit } from "../../shared/operational-transaction.js";

type Context = FinanceNominalActorContext;
interface TemplateOperations {
  import(input: ImportChartTemplateRequest): Promise<ChartTemplateMutation>;
  publish(id: string): Promise<ChartTemplateMutation>;
  load(id: string): Promise<ChartTemplateSummary>;
  preview(id: string, input: ChartCompanyPreviewQuery): Promise<ChartCompanyPreview>;
}
export async function readBusinessSetup(client: PoolClient, tenant: string, company: string) {
  return (
    await client.query(
      `select s.company_id,c.name as company_name,s.business_nature_key,s.organisation_type,s.country_code,
      s.base_currency,s.financial_year_start_month,s.accounting_method,s.template_id,
      to_char(s.initialized_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as initialized_at
     from finance_company_business_setup s join organization_unit c on c.tenant_id=s.tenant_id and c.id=s.company_id
     where s.tenant_id=$1 and s.company_id=$2`,
      [tenant, company],
    )
  ).rows[0];
}
function conflict(message: string): never {
  throw new ChartTemplateError(409, "BUSINESS_SETUP_CONFLICT", message);
}

async function configureCurrency(client: PoolClient, ctx: Context, company: string, input: BusinessSetupInput) {
  if (
    !(
      await client.query(
        "select 1 from country_currency_catalog where country_code=$1 and currency_code=$2 and status='active'",
        [input.country_code, input.base_currency],
      )
    ).rowCount
  )
    conflict("Select a supported country and base currency pair.");
  await client.query(
    `insert into currency(tenant_id,code,name,decimal_places,is_base,status,catalog_code,row_version,adopted_by,adopted_at)
    select $1,code,name,decimal_places,false,'active',code,1,$3,clock_timestamp() from currency_catalog where code=$2 and status='active'
    on conflict(tenant_id,code) do nothing`,
    [ctx.tenantId, input.base_currency, ctx.actor.userId],
  );
  const current = (
    await client.query<{ base_currency: string }>(
      "select base_currency from company_currency_profile where tenant_id=$1 and company_id=$2 for update",
      [ctx.tenantId, company],
    )
  ).rows[0];
  if (current && current.base_currency !== input.base_currency)
    conflict("Existing company base currency must be preserved. Use the governed currency setup.");
  if (!current)
    await client.query(
      `insert into company_currency_profile(tenant_id,company_id,id,base_currency,base_country_code,created_by)
    values($1,$2,$3,$4,$5,$6)`,
      [ctx.tenantId, company, `ccp-${randomUUID()}`, input.base_currency, input.country_code, ctx.actor.userId],
    );
  await client.query(
    `insert into company_currency(tenant_id,company_id,id,currency_code,selected_country_code,is_base,created_by)
    values($1,$2,$3,$4,$5,true,$6) on conflict(tenant_id,company_id,currency_code) do nothing`,
    [ctx.tenantId, company, `cc-${randomUUID()}`, input.base_currency, input.country_code, ctx.actor.userId],
  );
  if (
    !(
      await client.query(
        `select 1 from company_currency c join currency s on s.tenant_id=c.tenant_id and s.code=c.currency_code
    where c.tenant_id=$1 and c.company_id=$2 and c.currency_code=$3 and c.status='active' and s.status='active' and c.is_base`,
        [ctx.tenantId, company, input.base_currency],
      )
    ).rowCount
  )
    conflict("The company base currency is inactive or inconsistent. Review currency configuration first.");
}

/** Master configuration only: no bank facilities, invoices, payments or journals.
 * The user explicitly requests AP/AR template mappings; existing subledger policy
 * validation verifies eligible zero/reconciled controls before accepting them.
 */
export async function initializeBusinessCompany(
  client: PoolClient,
  ctx: Context,
  input: BusinessSetupInput,
  key: string,
  correlation: string,
  operations: TemplateOperations,
): Promise<BusinessSetupResult> {
  const tenant = ctx.tenantId,
    actor = ctx.actor.userId,
    path = "/api/v1/finance/business_setup",
    fingerprint = chartTemplateHash(input);
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `business-setup:${tenant}:${actor}:${key}`,
  ]);
  const previous = (
    await client.query<{ request_fingerprint: string; response_body: unknown }>(
      "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
      [tenant, actor, path, key],
    )
  ).rows[0];
  if (previous) {
    if (previous.request_fingerprint !== fingerprint)
      conflict("The request key was already used for different setup details.");
    return { ...businessSetupResultSchema.parse(previous.response_body), replayed: true };
  }
  if (
    !(
      await client.query("select 1 from finance_business_nature_catalog where key=$1 and status='active'", [
        input.business_nature_key,
      ])
    ).rowCount
  )
    conflict("Select an active business nature from the database catalogue.");
  let company = input.company_id;
  if (!company) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`business-company-code:${tenant}`]);
    const next = (
      await client.query<{ next: string }>(
        "select (coalesce(max(substring(code from '^CO-([0-9]+)$')::bigint),0)+1)::text as next from organization_unit where tenant_id=$1 and type='company'",
        [tenant],
      )
    ).rows[0]!.next;
    company = `company-${randomUUID()}`;
    await client.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$3,$4,'active')",
      [tenant, company, `CO-${next.padStart(3, "0")}`, input.company_name],
    );
    await client.query(
      `insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
      values($1,$2,$3,$4,false,$3,'governed_administration','finance.business_setup')`,
      [tenant, `access-${randomUUID()}`, actor, company],
    );
  }
  for (const permission of [
    "finance.nominal.create",
    "finance.nominal.update",
    "finance.chart_template.adopt",
    "finance.chart_template.classify",
  ])
    await companyChartPermission(client, ctx, company, permission);
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `nexora:chart-adoption:${tenant}:${company}`,
  ]);
  const companyRow = (
    await client.query<{ name: string }>(
      "select name from organization_unit where tenant_id=$1 and id=$2 and type='company' and status='active' for update",
      [tenant, company],
    )
  ).rows[0];
  if (!companyRow || companyRow.name !== input.company_name)
    conflict("Select the existing company with its exact name. Setup does not rename business records.");
  const prior = await readBusinessSetup(client, tenant, company);
  if (prior) {
    const configured = businessSetupSchema.parse(prior);
    const comparable = {
      ...input,
      company_id: company,
      template_id: configured.template_id,
      initialized_at: configured.initialized_at,
    };
    if (chartTemplateHash(configured) !== chartTemplateHash(comparable))
      conflict("This company already has accounting defaults. Its business nature and chart will not be replaced.");
    const evidence = (
      await client.query<{ audit_event_id: string }>(
        "select audit_event_id from finance_company_business_setup where tenant_id=$1 and company_id=$2",
        [tenant, company],
      )
    ).rows[0]!;
    return { setup: configured, audit_event_id: evidence.audit_event_id, replayed: true };
  }
  await configureCurrency(client, ctx, company, input);
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `business-template:${tenant}:${input.business_nature_key}`,
  ]);
  let templateId = (
    await client.query<{ id: string }>(
      "select id from finance_chart_template where tenant_id=$1 and business_nature_key=$2 and state='published' order by published_at desc,id limit 1",
      [tenant, input.business_nature_key],
    )
  ).rows[0]?.id;
  if (!templateId) {
    const cataloguePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../../../packages/db/catalogs/business-natures-v1.json",
    );
    const raw: unknown = JSON.parse(await readFile(cataloguePath, "utf8"));
    if (!Array.isArray(raw)) throw new Error("Business template catalogue is invalid");
    const manifest = raw
      .map((item) => importChartTemplateRequestSchema.parse(item))
      .find((item) => item.business_nature_key === input.business_nature_key);
    if (!manifest)
      conflict("Import and publish a chart template for this business nature before creating its company.");
    const imported = await operations.import(manifest);
    templateId = imported.template.id;
    await operations.publish(templateId);
  }
  const metadata = (
    await client.query<{ initialization_roles: unknown }>(
      "select initialization_roles from finance_chart_template where tenant_id=$1 and id=$2",
      [tenant, templateId],
    )
  ).rows[0]!;
  const roles = businessTemplateRolesSchema.parse(metadata.initialization_roles);
  if (!/^2[0-9]{3}$/.test(roles.cash_and_bank_section))
    conflict("The Cash & Bank section requires a four-digit asset code.");
  const template = await operations.load(templateId);
  const page = await operations.preview(templateId, { company_id: company, currency: input.base_currency, limit: 100 });
  const items = [...page.items];
  let cursor = page.next_cursor;
  while (cursor) {
    const next = await operations.preview(templateId, {
      company_id: company,
      currency: input.base_currency,
      limit: 100,
      cursor,
    });
    items.push(...next.items);
    cursor = next.next_cursor;
  }
  const adoption = await adoptCompanyChart(
    client,
    ctx,
    template,
    {
      company_id: company,
      currency: input.base_currency,
      expected_template_version: template.version,
      preview_sha256: page.preview_sha256,
    },
    { ...page, items },
    `business-adopt-${company}`,
    correlation,
  );
  const nominals = (
    await client.query<{ account_id: string; code: string }>(
      `select m.account_id,n.code from finance_chart_company_node m join finance_chart_template_node n on n.tenant_id=m.tenant_id and n.template_id=m.template_id and n.node_key=m.node_key
    where m.tenant_id=$1 and m.company_id=$2 and m.template_id=$3 and n.kind='nominal' and m.account_id is not null order by n.code`,
      [tenant, company, templateId],
    )
  ).rows;
  for (const nominal of nominals) {
    await classifyCompanyNominal(
      client,
      ctx,
      nominal.account_id,
      {
        expected_version: 1,
        classification: "ordinary",
        reason: `Business nature ${input.business_nature_key} defaults selected by Super Admin; AP/AR posting remains governed by company control policy.`,
      },
      `business-classify-${company}-${nominal.code}`,
      correlation,
    );
    await changeCoaMaster(client, ctx, nominal.account_id, "activated", 2, correlation);
  }
  const mappings = new Map(nominals.map((n) => [n.code, n.account_id]));
  const controlRoles = [
    "receivable",
    "payable",
    "revenue",
    "expense",
    "realized_gain",
    "realized_loss",
    "unrealized_gain",
    "unrealized_loss",
  ] as const;
  const ids = controlRoles.map((role) => mappings.get(roles[role]));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    conflict("Each control role must map to a distinct governed nominal.");
  if (
    (
      await client.query("select 1 from finance_subledger_policy where tenant_id=$1 and company_id=$2", [
        tenant,
        company,
      ])
    ).rowCount
  )
    conflict("Existing AP/AR policy requires explicit reconciliation and mapping review; it will not be overwritten.");
  await client.query(
    `insert into finance_subledger_policy(tenant_id,company_id,version,receivable_account_id,payable_account_id,revenue_account_id,expense_account_id,realized_gain_account_id,realized_loss_account_id,unrealized_gain_account_id,unrealized_loss_account_id,created_by)
    values($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [tenant, company, ...ids, actor],
  );
  // Older published templates may omit treasury roles and retain manual policy
  // configuration. An existing policy is authoritative, including its tolerance.
  if (roles.bank_charge && roles.rounding) {
    await companyChartPermission(client, ctx, company, "finance.transfer_fx_policy.manage");
    const existingPolicy = await client.query(
      "select id from bank_transfer_fx_policy where tenant_id=$1 and company_id=$2 for update",
      [tenant, company],
    );
    if (!existingPolicy.rowCount) {
      const treasuryIds = [roles.realized_gain, roles.realized_loss, roles.rounding, roles.bank_charge].map((code) =>
        mappings.get(code),
      );
      if (treasuryIds.some((id) => !id) || new Set(treasuryIds).size !== treasuryIds.length)
        conflict("Each Transfer/FX role must map to a distinct governed nominal.");
      const policyId = `transfer-fx-policy-${randomUUID()}`;
      const policy = (
        await client.query(
          `insert into bank_transfer_fx_policy(tenant_id,company_id,id,fx_gain_nominal_id,fx_loss_nominal_id,rounding_nominal_id,bank_charge_nominal_id,rounding_tolerance,created_by,updated_by)
          values($1,$2,$3,$4,$5,$6,$7,0,$8,$8) returning *`,
          [tenant, company, policyId, ...treasuryIds, actor],
        )
      ).rows[0];
      const auditId = await operationalAudit(client, ctx, {
        company,
        entity: "bank_transfer_fx_policy",
        id: policyId,
        action: "finance.transfer_fx_policy.created",
        before: null,
        after: policy,
        correlation,
      });
      await client.query(
        `insert into bank_transfer_fx_policy_event(tenant_id,company_id,id,policy_id,actor_id,action,record_version,reason,correlation_id,occurred_at)
        select $1,$2,$3,$4,$5,'created',1,$6,$7,occurred_at from platform_admin_audit_event where tenant_id=$1 and id=$3`,
        [
          tenant,
          company,
          auditId,
          policyId,
          actor,
          `Business nature ${input.business_nature_key} template ${templateId}; zero rounding tolerance.`,
          correlation,
        ],
      );
    }
  }
  const bankSection = (
    await client.query<{ section_id: string; category_id: string }>(
      `select m.account_id as section_id,a.parent_id as category_id from finance_chart_company_node m join account a on a.tenant_id=m.tenant_id and a.company_id=m.company_id and a.id=m.account_id
    where m.tenant_id=$1 and m.company_id=$2 and m.template_id=$3 and m.node_key=$4`,
      [tenant, company, templateId, `section:${roles.cash_and_bank_section}`],
    )
  ).rows[0]!;
  const bankCodes = (
    await client.query<{ code: string }>(
      "select code from finance_chart_template_node where tenant_id=$1 and template_id=$2 and kind='nominal' and parent_key=$3",
      [tenant, templateId, `section:${roles.cash_and_bank_section}`],
    )
  ).rows;
  if (bankCodes.some((node) => !/^2[0-9]{5}$/.test(node.code) || !node.code.startsWith(roles.cash_and_bank_section)))
    conflict("Bank definitions require the governed six-digit section code range.");
  const nextBankCode = Math.max(1, ...bankCodes.map((node) => Number(node.code.slice(4)) + 1));
  await client.query(
    `insert into finance_nominal_section_policy(tenant_id,company_id,section_id,category_id,section_role,prefix,code_width,first_value,last_value,next_value)
    values($1,$2,$3,$4,'cash_and_bank',$5,2,1,99,$6) on conflict(tenant_id,company_id,section_id) do nothing`,
    [tenant, company, bankSection.section_id, bankSection.category_id, roles.cash_and_bank_section, nextBankCode],
  );
  const setup = businessSetupSchema.parse({
    ...input,
    company_id: company,
    template_id: templateId,
    initialized_at: new Date().toISOString(),
  });
  // The existing adoption event is immutable, actor-bound and carries every
  // account mapping. Bank definitions stay unbound until explicit bank creation.
  await client.query(
    `insert into finance_company_business_setup(tenant_id,company_id,business_nature_key,template_id,organisation_type,country_code,base_currency,financial_year_start_month,accounting_method,initialized_by,initialized_at,audit_event_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      tenant,
      company,
      input.business_nature_key,
      templateId,
      input.organisation_type,
      input.country_code,
      input.base_currency,
      input.financial_year_start_month,
      input.accounting_method,
      actor,
      setup.initialized_at,
      adoption.audit_event_id,
    ],
  );
  const result = { setup, audit_event_id: adoption.audit_event_id, replayed: false };
  await client.query(
    `insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
    values($1,$2,'POST',$3,$4,$5,201,$6,$7)`,
    [tenant, actor, path, key, fingerprint, JSON.stringify(result), chartTemplateHash(result)],
  );
  return result;
}
