import { createHash, randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { SourceSubledgerRepository } from "../../server/api/src/modules/finance/subledger/source-repository.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceAuthorizationFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

export const subledgerPermissions = [
  "finance.subledger.read",
  "finance.subledger.manage",
  "finance.subledger.approve",
  "finance.subledger.post",
  "finance.subledger.report",
];
export const subledgerActor = (id = "r06.maker"): BankingActorContext => ({
  tenantId: sourceTestTenantId,
  actor: {
    tenantId: sourceTestTenantId,
    organizationName: "Isolated currency test",
    userId: id,
    email: `${id}@uat.nexora.invalid`,
    displayName: id,
    roles: [],
    permissions: subledgerPermissions,
    sessionVersion: 1,
  },
});

export async function setupSubledgerFixture(pool: DatabasePool, company = `mc-${randomUUID()}`, base = "PKR") {
  await migrateSourceSchema(pool);
  await ensureSourceAuthorizationFixture(pool);
  const tenant = sourceTestTenantId;
  for (const currency of ["PKR", "USD", "EUR", "JPY", "KWD"])
    await pool.query(
      `insert into currency(tenant_id,code,name,decimal_places,is_base,status,catalog_code,row_version,adopted_by,adopted_at)
    select $1,code,name,decimal_places,false,'active',code,1,'r06.maker',clock_timestamp() from currency_catalog where code=$2 on conflict(tenant_id,code) do nothing`,
      [tenant, currency],
    );
  await pool.query(
    "insert into organization_unit(id,tenant_id,parent_id,type,code,name,status) values($1,$2,null,'company',$1,$1,'active')",
    [company, tenant],
  );
  await ensureCompanyCurrencyFixture(pool, company, base, ["PKR", "USD", "EUR", "JPY", "KWD"]);
  for (const [policy, user] of [
    ["r06-uat-policy-maker", "r06.maker"],
    ["r06-uat-policy-checker", "r06.checker"],
    ["r06-uat-policy-payment-poster", "r06.target"],
  ]) {
    await pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing",
      [tenant, policy, subledgerPermissions],
    );
    await pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$4 from unnest($3::text[]) p on conflict do nothing",
      [tenant, policy, subledgerPermissions, company],
    );
    await pool.query(
      `insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','disposable-subledger-fixture')`,
      [tenant, randomUUID(), user, company],
    );
  }
  await pool.query(
    "insert into fiscal_calendar(id,tenant_id,company_id,year,period_start,period_end,status) values($1,$2,$3,2026,'2026-01-01','2026-12-31','active')",
    [`cal-${company}`, tenant, company],
  );
  for (const month of [9, 10, 11, 12]) {
    const date = `2026-${month.toString().padStart(2, "0")}-01`,
      last = new Date(Date.UTC(2026, month, 0)).toISOString().slice(0, 10);
    await pool.query(
      "insert into financial_period(id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at) values($1,$2,$3,$4,$5,$6,$7,'open',clock_timestamp())",
      [`period-${company}-${month}`, tenant, company, `cal-${company}`, month, date, last],
    );
  }
  const roles = [
    "receivable",
    "payable",
    "revenue",
    "expense",
    "realized_gain",
    "realized_loss",
    "unrealized_gain",
    "unrealized_loss",
  ] as const;
  const types = ["asset", "liability", "revenue", "expense", "revenue", "expense", "revenue", "expense"];
  const accountIds = Object.fromEntries(roles.map((role) => [`${role}_account_id`, `${company}-${role}`]));
  for (const [index, role] of roles.entries())
    await pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$4,$4,$5,false,'active',clock_timestamp())",
      [`${company}-${role}`, tenant, company, role, types[index]],
    );
  const banks: Record<string, string> = {};
  for (const currency of ["PKR", "USD", "EUR", "JPY", "KWD"]) {
    const account = `${company}-bank-${currency}`,
      id = `${company}-${currency}`;
    await pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,reconciliation_required,created_at) values($1,$2,$3,$4,$4,'asset',false,'active',true,clock_timestamp())",
      [account, tenant, company, `bank-${currency}`],
    );
    await pool.query(
      `insert into bank_account(id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,account_type,account_number_masked,account_number_ciphertext,account_number_nonce,account_number_hash,encryption_key_version,overdraft_limit,row_version,created_by,submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
      values($1,$2,$3,$4,'Isolated bank',$5,'active',clock_timestamp(),$1,$5,'current','**** 2468',$6,$7,$8,'integration-v1',100000000,1,'r06.maker','r06.maker',clock_timestamp(),'Synthetic test bank','r06.checker',clock_timestamp(),'Independent synthetic setup',clock_timestamp())`,
      [
        id,
        tenant,
        company,
        account,
        currency,
        Buffer.alloc(24, 1),
        Buffer.alloc(12, 1),
        createHash("sha256").update(id).digest("hex"),
      ],
    );
    banks[currency] = id;
  }
  const rate = async (currency: string, value: string, date: string) => {
    if (currency === base) return;
    await pool.query(
      "insert into currency_rate(id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,created_by,reason,updated_at) values($1,$2,$3,$4,$5,$6,$7,'active',1,'r06.maker','Synthetic governed rate',clock_timestamp())",
      [randomUUID(), tenant, company, currency, base, value, date],
    );
  };
  const values: Record<string, string> =
    base === "PKR"
      ? { USD: "280", EUR: "300", JPY: "2", KWD: "900" }
      : { PKR: "0.003571428571428571", EUR: "1.1", JPY: "0.007", KWD: "3.25" };
  for (const [currency, value] of Object.entries(values)) await rate(currency, value, "2026-09-01");
  const repository = new SourceSubledgerRepository(pool);
  const policy = await repository.configure(
    subledgerActor(),
    {
      company_id: company,
      expected_version: 0,
      receivable_account_id: accountIds.receivable_account_id!,
      payable_account_id: accountIds.payable_account_id!,
      revenue_account_id: accountIds.revenue_account_id!,
      expense_account_id: accountIds.expense_account_id!,
      realized_gain_account_id: accountIds.realized_gain_account_id!,
      realized_loss_account_id: accountIds.realized_loss_account_id!,
      unrealized_gain_account_id: accountIds.unrealized_gain_account_id!,
      unrealized_loss_account_id: accountIds.unrealized_loss_account_id!,
    },
    randomUUID(),
  );
  return { pool, repository, tenant, company, policy, banks, rate };
}
