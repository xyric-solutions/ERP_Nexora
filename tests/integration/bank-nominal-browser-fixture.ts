import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { importChartTemplateRequestSchema } from "../../packages/contracts/src/index.js";
import { SourceChartTemplateRepository } from "../../server/api/src/modules/finance/templates/source-repository.js";
import type { FinanceNominalActorContext } from "../../server/api/src/modules/finance/nominals/source-repository.js";
import { sourceTestTenantId as tenant, sourceTestCompanyId as company } from "./source-security-fixture.js";

// Only called by the fresh-database browser harness. This imports the existing
// approved catalog through its real repository, not hardcoded dropdown options.
export async function prepareBankNominalBrowserFixture(pool: DatabasePool) {
  const db = await pool.query<{ current_database: string }>("select current_database()");
  if (!db.rows[0]?.current_database.startsWith("nexora_bank_context_e2e_isolated_"))
    throw new Error("Fresh isolated browser database required for catalog fixture.");
  const permissions = [
    "finance.chart_template.read",
    "finance.chart_template.admin",
    "finance.chart_template.adopt",
    "finance.chart_template.classify",
    "finance.nominal.read",
    "finance.nominal.create",
    "finance.nominal.update",
    "finance.nominal.submit",
    "finance.nominal.status",
    "platform.approval.override",
  ];
  for (const [policy, keys] of [
    ["r06-uat-policy-maker", permissions],
    ["r06-uat-policy-approval-override", permissions],
    ["r06-uat-policy-checker", ["finance.nominal.read", "finance.nominal.approve"]],
  ] as const) {
    for (const permission of keys) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
        [tenant, policy, permission],
      );
      const central =
        permission === "platform.approval.override" ||
        permission === "finance.chart_template.read" ||
        permission === "finance.chart_template.admin";
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,$4,$5) on conflict do nothing",
        [tenant, policy, permission, central ? "tenant" : "company", central ? tenant : company],
      );
    }
  }
  // The older synthetic offset fixtures have no financial records in this fresh
  // database. Start them inactive to reproduce the real all-pending directory.
  await pool.query("update account set status='inactive' where tenant_id=$1 and company_id=$2 and id=any($3::text[])", [
    tenant,
    company,
    ["r06-uat-bank-payment-expense", "r06-context-receipt-income"],
  ]);
  const context: FinanceNominalActorContext = {
    tenantId: tenant,
    actor: {
      tenantId: tenant,
      userId: "r06.override-admin",
      organizationName: "Synthetic browser test",
      displayName: "r06.maker",
      email: "maker@example.invalid",
      roles: ["super_administrator"],
      permissions,
      sessionVersion: 1,
    },
  };
  const source = importChartTemplateRequestSchema.parse(
    JSON.parse(
      await readFile(new URL("../../packages/db/catalogs/approved-chart-20261020.json", import.meta.url), "utf8"),
    ),
  );
  const repo = new SourceChartTemplateRepository(pool);
  const imported = await repo.import(context, source, randomUUID(), randomUUID());
  await repo.publish(context, imported.template.id, { expected_version: 1 }, randomUUID(), randomUUID());
  const preview = await repo.companyPreview(context, imported.template.id, {
    company_id: company,
    currency: "USD",
    limit: 100,
  });
  if (preview.blocked) throw new Error("Catalog fixture conflicts with synthetic company setup.");
  await repo.adoptCompany(
    context,
    imported.template.id,
    { company_id: company, currency: "USD", expected_template_version: 2, preview_sha256: preview.preview_sha256 },
    randomUUID(),
    randomUUID(),
  );
}
