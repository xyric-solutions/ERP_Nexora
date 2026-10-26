// Real API + fresh synthetic database for browser acceptance. Never reads .env.
import { createHash, randomBytes, pbkdf2Sync } from "node:crypto";
import { hashPassword } from "../packages/auth/src/passwords.js";
import { createDatabasePool, migrateSourceSchema, backfillLoginDirectory } from "../packages/db/src/index.js";
import {
  ensureSourceSuperAdministratorFixture,
  sourceTestCompanyId,
  sourceTestTenantId,
} from "../tests/integration/source-security-fixture.js";

const bootstrapUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const databaseName = process.env.NEXORA_BANK_CONTEXT_E2E_DATABASE;
const password = process.env.NEXORA_BANK_CONTEXT_E2E_PASSWORD;
const port = Number(process.env.NEXORA_BANK_CONTEXT_E2E_PORT);
if (
  !bootstrapUrl ||
  !databaseName ||
  !/^nexora_bank_context_e2e_isolated_[0-9a-z_]+$/.test(databaseName) ||
  !password ||
  password.length < 12 ||
  !Number.isInteger(port) ||
  port < 4011 ||
  port > 4099
)
  throw new Error(
    "Explicit local bootstrap URL, fresh E2E database name, synthetic password and test API port (4011–4099) are required.",
  );
const url = new URL(bootstrapUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  (!url.pathname.includes("chart_template_ct01") &&
    !(
      (process.env.NEXORA_BANK_RECONCILIATION_E2E === "true" || process.env.NEXORA_BANK_REVALUATION_E2E === "true") &&
      url.pathname.includes("nexora_source_test")
    ))
)
  throw new Error("An explicitly isolated bootstrap database is required.");
const bootstrap = createDatabasePool(bootstrapUrl);
try {
  // CREATE without IF NOT EXISTS: never reuse or modify an unrelated database.
  await bootstrap.query(`create database ${databaseName}`);
} finally {
  await bootstrap.end();
}
url.pathname = `/${databaseName}`;
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = "test";
process.env.API_HOST = "127.0.0.1";
process.env.API_PORT = String(port);
process.env.API_ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  process.env.NEXORA_BANK_CONTEXT_E2E_WEB_ORIGIN,
]
  .filter(Boolean)
  .join(",");
process.env.AUTH_THROTTLE_SECRET = randomBytes(32).toString("hex");
process.env.AUTH_LOGIN_DIRECTORY_SECRET = randomBytes(32).toString("hex");
process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.BANKING_DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.BANKING_DATA_ENCRYPTION_KEY_VERSION = "isolated-context-e2e";
process.env.NEXORA_ENVIRONMENT = "uat";
process.env.NEXORA_UAT_CONFIRM = sourceTestTenantId;
process.env.NEXORA_UAT_PASSWORD = password;
if (!process.env.REDIS_URL || !process.env.S3_ENDPOINT)
  throw new Error("Existing local test Redis and object-storage endpoints must be supplied explicitly.");
const pool = createDatabasePool(url.toString());
try {
  await migrateSourceSchema(pool);
} finally {
  await pool.end();
}
await import("./provision-c4-uat-auth.js");
if (process.env.NEXORA_BANK_REVALUATION_E2E === "true") {
  const securityFixture = createDatabasePool(url.toString());
  try {
    await ensureSourceSuperAdministratorFixture(securityFixture);
  } finally {
    await securityFixture.end();
  }
} else {
  await import("./provision-bank-payments-uat.js");
}
const fixture = createDatabasePool(url.toString());
try {
  // Both kinds share the synthetic Bank/calendar. Do not relax the older receipt
  // provisioning script's intentionally different reserved calendar identities.
  await fixture.query(
    `insert into account(tenant_id,company_id,id,code,name,type,is_header,required_dimensions,status,manual_posting_allowed,is_system_account,reconciliation_required,created_at)
    values($1,$2,'r06-context-receipt-income','CTX-INC','Synthetic Bank Receipt Income','revenue',false,'["department"]','active',true,false,false,now())`,
    [sourceTestTenantId, sourceTestCompanyId],
  );
  for (const [user, actions] of [
    ["r06.maker", ["read", "create", "update", "submit"]],
    ["r06.checker", ["read", "approve"]],
    ["r06.target", ["read", "post", "reverse"]],
  ] as const) {
    const policies = await fixture.query<{ id: string }>(
      `select distinct p.id from security_user_role_assignment_version a join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id
      where a.tenant_id=$1 and a.user_id=$2 and a.lifecycle_state='active' and p.lifecycle_state='active'
      and a.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=a.tenant_id and v.assignment_id=a.assignment_id)`,
      [sourceTestTenantId, user],
    );
    for (const policy of policies.rows)
      for (const action of actions) {
        const permission = `banking.receipt.${action}`;
        await fixture.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [sourceTestTenantId, policy.id, permission],
        );
        await fixture.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [sourceTestTenantId, policy.id, permission, sourceTestCompanyId],
        );
      }
  }
  // Fixture-only read/manage grants to the synthetic maker. No source/UAT policies changed.
  const permissions = [
    "master_data.project.read",
    "master_data.project.manage",
    "master_data.location.read",
    "master_data.location.manage",
  ];
  for (const permission of permissions) {
    await fixture.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-maker',$2,'all') on conflict do nothing",
      [sourceTestTenantId, permission],
    );
    await fixture.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker',$2,'company',$3) on conflict do nothing",
      [sourceTestTenantId, permission, sourceTestCompanyId],
    );
  }
  // WC-03 synthetic identities: normal approve authority is separate from the
  // self-approval grant, which the browser must issue through the real UI/API.
  for (const permission of ["banking.payment.approve", "banking.receipt.approve"]) {
    await fixture.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-maker',$2,'all') on conflict do nothing",
      [sourceTestTenantId, permission],
    );
    await fixture.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker',$2,'company',$3) on conflict do nothing",
      [sourceTestTenantId, permission, sourceTestCompanyId],
    );
  }
  if (process.env.NEXORA_BANK_RECONCILIATION_E2E === "true") {
    const reconciliationGrants = [
      [
        "r06-uat-policy-maker",
        [
          "banking.statement_import.read",
          "banking.statement_import.create",
          "banking.statement_import.update",
          "banking.statement_import.finalize",
          "banking.statement_mapping.read",
          "banking.statement_mapping.manage",
          "banking.reconciliation.read",
          "banking.reconciliation.create",
          "banking.reconciliation.update",
          "banking.reconciliation.match",
          "banking.reconciliation.submit",
          "banking.reconciliation_adjustment.read",
          "banking.reconciliation_adjustment.create",
          "banking.reconciliation_adjustment.update",
          "banking.reconciliation_adjustment.submit",
        ],
      ],
      [
        "r06-uat-policy-checker",
        [
          "banking.statement_import.read",
          "banking.reconciliation.read",
          "banking.reconciliation.approve",
          "banking.reconciliation_adjustment.read",
          "banking.reconciliation_adjustment.approve",
        ],
      ],
      [
        "r06-uat-policy-payment-poster",
        [
          "banking.reconciliation.read",
          "banking.reconciliation_adjustment.read",
          "banking.reconciliation_adjustment.post",
          "banking.reconciliation_adjustment.reverse",
        ],
      ],
    ] as const;
    for (const [policy, policyPermissions] of reconciliationGrants)
      for (const permission of policyPermissions) {
        await fixture.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [sourceTestTenantId, policy, permission],
        );
        await fixture.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [sourceTestTenantId, policy, permission, sourceTestCompanyId],
        );
      }
  }
  if (process.env.NEXORA_BANK_REVALUATION_E2E === "true") {
    const companyId = sourceTestCompanyId;
    const foreignCurrency = "PKR";
    const baseCurrency = "USD";
    const revaluationDate = "2026-10-26";
    await fixture.query(
      `insert into fiscal_calendar(id,tenant_id,company_id,year,period_start,period_end,status)
       values('fxr-e2e-calendar',$1,$2,2026,date '2026-01-01',date '2026-12-31','active')`,
      [sourceTestTenantId, companyId],
    );
    await fixture.query(
      `insert into financial_period
        (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
       values
        ('fxr-e2e-period',$1,$2,'fxr-e2e-calendar',10,date '2026-10-01',date '2026-10-31','open',clock_timestamp()),
        ('fxr-e2e-next-period',$1,$2,'fxr-e2e-calendar',11,date '2026-11-01',date '2026-11-30','open',clock_timestamp())`,
      [sourceTestTenantId, companyId],
    );
    const period = await fixture.query<{ id: string; fiscal_calendar_id: string }>(
      `select id,fiscal_calendar_id from financial_period
        where tenant_id=$1 and company_id=$2 and $3::date between period_start and period_end
          and status='open' order by period_start desc limit 1`,
      [sourceTestTenantId, companyId, revaluationDate],
    );
    if (!period.rows[0]) throw new Error("The synthetic Revaluation posting period is unavailable.");

    const grants = [
      [
        "r06-uat-policy-maker",
        [
          "banking.bank_account.read",
          "finance.company_currency_profile.read",
          "finance.company_currency.read",
          "banking.revaluation.read",
          "banking.revaluation.create",
          "banking.revaluation.update",
          "banking.revaluation.submit",
        ],
      ],
      [
        "r06-uat-policy-checker",
        [
          "banking.bank_account.read",
          "finance.company_currency_profile.read",
          "finance.company_currency.read",
          "banking.revaluation.read",
          "banking.revaluation.approve",
        ],
      ],
      [
        "r06-uat-policy-payment-poster",
        [
          "banking.bank_account.read",
          "finance.company_currency_profile.read",
          "finance.company_currency.read",
          "banking.revaluation.read",
          "banking.revaluation.post",
          "banking.revaluation.reverse",
        ],
      ],
    ] as const;
    for (const [policy, policyPermissions] of grants)
      for (const permission of policyPermissions) {
        await fixture.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [sourceTestTenantId, policy, permission],
        );
        await fixture.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [sourceTestTenantId, policy, permission, companyId],
        );
      }

    await fixture.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
         manual_posting_allowed,is_system_account,reconciliation_required,created_at)
       values
        ('fxr-e2e-counter',$1,$2,'FXR-E2E-COUNTER','FX Revaluation Counter','liability',false,'[]','active',true,false,false,clock_timestamp()),
        ('fxr-e2e-gain',$1,$2,'FXR-E2E-GAIN','Unrealized FX Gain','revenue',false,'[]','active',true,false,false,clock_timestamp()),
        ('fxr-e2e-loss',$1,$2,'FXR-E2E-LOSS','Unrealized FX Loss','expense',false,'[]','active',true,false,false,clock_timestamp())`,
      [sourceTestTenantId, companyId],
    );
    await fixture.query(
      `insert into bank_account
        (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,
         account_type,account_number_masked,account_number_ciphertext,account_number_nonce,
         account_number_hash,encryption_key_version,overdraft_limit,row_version,created_by,
         submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
       values('fxr-e2e-bank',$1,$2,'r06-uat-bank-operating-pkr','Synthetic FX Bank',$3,'active',
              clock_timestamp(),'FXR-E2E-BANK','Synthetic PKR Bank','current','**** 2468',$4,$5,$6,
              'isolated-e2e',0,1,'r06.maker','r06.maker',clock_timestamp(),'Synthetic E2E setup',
              'r06.checker',clock_timestamp(),'Independent synthetic approval',clock_timestamp())`,
      [
        sourceTestTenantId,
        companyId,
        foreignCurrency,
        Buffer.alloc(24, 24),
        Buffer.alloc(12, 12),
        createHash("sha256").update("fxr-e2e-bank-account").digest("hex"),
      ],
    );
    await fixture.query(
      `insert into bank_revaluation_policy
        (tenant_id,company_id,id,unrealized_gain_nominal_id,unrealized_loss_nominal_id,
         reversal_mode,status,row_version,created_by,updated_by)
       values($1,$2,'fxr-e2e-policy','fxr-e2e-gain','fxr-e2e-loss',
              'next_open_period_first_day','active',1,'r06.maker','r06.maker')`,
      [sourceTestTenantId, companyId],
    );
    await fixture.query(
      `insert into currency_rate
        (id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,
         created_by,reason,updated_at)
       values('fxr-e2e-rate',$1,$2,$3,$4,0.004,date '2026-10-26','active',1,
              'r06.maker','Synthetic E2E closing rate',clock_timestamp())`,
      [sourceTestTenantId, companyId, foreignCurrency, baseCurrency],
    );
    await fixture.query(
      `insert into journal_entry
        (id,tenant_id,company_id,created_by,posting_date,period_id,source_type,source_id,status,created_at)
       values('fxr-e2e-opening-journal',$1,$2,'r06.maker',date '2026-10-20',$3,
              'isolated.bank_fx_e2e','fxr-e2e-opening','draft',clock_timestamp())`,
      [sourceTestTenantId, companyId, period.rows[0].id],
    );
    await fixture.query(
      `insert into journal_line
        (id,journal_id,tenant_id,line_number,account_id,debit,credit,currency,fx_rate,
         base_debit,base_credit,dimensions)
       values
        ('fxr-e2e-opening-bank','fxr-e2e-opening-journal',$1,1,'r06-uat-bank-operating-pkr',
         10000,0,$2,0.0036,36,0,'{}'),
        ('fxr-e2e-opening-counter','fxr-e2e-opening-journal',$1,2,'fxr-e2e-counter',
         0,10000,$2,0.0036,0,36,'{}')`,
      [sourceTestTenantId, foreignCurrency],
    );
    await fixture.query(
      `update journal_entry set status='posted',entry_number='FXR-E2E-OPENING',posted_at=clock_timestamp()
        where tenant_id=$1 and id='fxr-e2e-opening-journal'`,
      [sourceTestTenantId],
    );
  }
  const adminPolicies = await fixture.query<{ id: string }>(
    `select distinct p.id from security_user_role_assignment_version a join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id
    where a.tenant_id=$1 and a.user_id='r06.override-admin' and a.lifecycle_state='active' and p.lifecycle_state='active'`,
    [sourceTestTenantId],
  );
  for (const policy of adminPolicies.rows)
    for (const permission of ["security.bank_self_approval.read", "security.bank_self_approval.manage"]) {
      await fixture.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
        [sourceTestTenantId, policy.id, permission],
      );
      await fixture.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
        [sourceTestTenantId, policy.id, permission, sourceTestCompanyId],
      );
    }
  const salt = randomBytes(16),
    argon = await hashPassword(password);
  await fixture.query(
    `insert into security_password_credential(tenant_id,user_id,username,algorithm,iterations,salt,password_hash,argon2_hash,argon2_updated_at,updated_at)
    values($1,'r06.override-admin','r06.override-admin','pbkdf2_sha256',310000,$2,$3,$4,now(),now())`,
    [sourceTestTenantId, salt, pbkdf2Sync(password, salt, 310000, 32, "sha256"), argon],
  );
  await backfillLoginDirectory(fixture, process.env.AUTH_LOGIN_DIRECTORY_SECRET!);
  if (process.env.NEXORA_BANK_NOMINAL_E2E_CATALOG === "true") {
    const { prepareBankNominalBrowserFixture } = await import("../tests/integration/bank-nominal-browser-fixture.js");
    await prepareBankNominalBrowserFixture(fixture);
  }
  if (process.env.NEXORA_FINANCE_CALENDAR_E2E === "true") {
    // Explicitly isolated harness only. Never grants source/UAT runtime authority.
    const calendarPermissions = [
      "platform.fiscal_calendar.read",
      "platform.fiscal_calendar.create",
      "platform.accounting_period.read",
      "finance.period.close",
      "finance.period.reopen",
    ];
    for (const policy of ["r06-uat-policy-approval-override", "r06-uat-policy-maker"])
      for (const permission of calendarPermissions) {
        await fixture.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [sourceTestTenantId, policy, permission],
        );
        await fixture.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [sourceTestTenantId, policy, permission, sourceTestCompanyId],
        );
      }
  }
  // Authentication deliberately verifies the compatibility projection against
  // normalized grants. Keep both fixture projections in parity; never bypass it.
  await fixture.query(
    `update security_role_policy p set permissions=(
    select coalesce(jsonb_agg(g.permission_key order by g.permission_key),'[]'::jsonb)
    from security_role_permission_grant g where g.tenant_id=p.tenant_id and g.role_policy_id=p.id)
    where p.tenant_id=$1`,
    [sourceTestTenantId],
  );
} finally {
  await fixture.end();
}
process.stdout.write(JSON.stringify({ isolatedDatabase: databaseName, apiPort: port, syntheticOnly: true }) + "\n");
await import("../server/api/src/server.js");
