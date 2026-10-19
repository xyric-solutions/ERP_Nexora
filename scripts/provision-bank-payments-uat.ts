import { createDatabasePool, type DatabasePool } from "../packages/db/src/index.js";
import { SourceTenantAuthenticationRepository } from "../server/api/src/modules/auth/source-repository.js";
import { BankingIdentifierCrypto } from "../server/api/src/modules/banking/crypto.js";
import {
  SourceBankingRepository,
  type BankingActorContext,
} from "../server/api/src/modules/banking/source-repository.js";
import {
  bankPaymentPermissions,
  ensureSourceSuperAdministratorFixture,
  sourceTestCompanyId,
  sourceTestTenantId,
} from "../tests/integration/source-security-fixture.js";

const databaseUrl = process.env.DATABASE_URL;
const bankingEncryptionKey = process.env.BANKING_DATA_ENCRYPTION_KEY;
const bankingEncryptionKeyVersion = process.env.BANKING_DATA_ENCRYPTION_KEY_VERSION ?? "uat-v1";

if (process.env.NEXORA_ENVIRONMENT !== "uat" || process.env.NEXORA_UAT_CONFIRM !== sourceTestTenantId) {
  throw new Error(`Set NEXORA_ENVIRONMENT=uat and NEXORA_UAT_CONFIRM=${sourceTestTenantId}`);
}
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!bankingEncryptionKey) throw new Error("BANKING_DATA_ENCRYPTION_KEY is required");

const parsedDatabaseUrl = new URL(databaseUrl);
const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ""));
if (!localHosts.has(parsedDatabaseUrl.hostname) || !/(?:uat|test|codex|isolated)/i.test(databaseName)) {
  throw new Error("Bank Payment UAT provisioning is restricted to an explicitly named local isolated database");
}

const makerId = "r06.maker";
const checkerId = "r06.checker";
const posterId = "r06.target";
const controlAccountId = "r06-uat-bank-payment-control";
const nominalAccountId = "r06-uat-bank-payment-expense";
const bankAccountName = "Synthetic Bank Payment Operating Account";
const syntheticTransactionCurrency = "XBP";
const syntheticAccountNumber = "R06UATBANKPAYMENT0001";

function expectedPaymentPermissions(userId: string): readonly string[] {
  if (userId === makerId)
    return ["banking.payment.read", "banking.payment.create", "banking.payment.update", "banking.payment.submit"];
  if (userId === checkerId) return ["banking.payment.read", "banking.payment.approve"];
  if (userId === posterId) return ["banking.payment.read", "banking.payment.post", "banking.payment.reverse"];
  return [];
}

async function actorContext(pool: DatabasePool, userId: string): Promise<BankingActorContext> {
  const actor = await new SourceTenantAuthenticationRepository(pool).loadAuthenticatedAccount(
    sourceTestTenantId,
    userId,
    new Date(),
  );
  if (!actor) throw new Error(`Controlled UAT identity ${userId} is unavailable`);
  return { tenantId: sourceTestTenantId, actor };
}

const pool = createDatabasePool(databaseUrl);
const lockClient = await pool.connect();
try {
  await lockClient.query("select pg_advisory_lock(hashtextextended($1,0))", [
    `nexora:uat:bank-payments:${sourceTestTenantId}`,
  ]);

  await ensureSourceSuperAdministratorFixture(pool);

  const setup = await pool.connect();
  let baseCurrency = "";
  let calendarId = "";
  try {
    await setup.query("begin isolation level serializable");
    await setup.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);

    const tenant = await setup.query<{ region: string }>(
      "select region from tenant where id=$1 and status='active' for update",
      [sourceTestTenantId],
    );
    if (tenant.rows[0]?.region !== "uat-isolated") throw new Error("The controlled UAT tenant is not isolated");

    const definitions = await setup.query<{ permission_key: string }>(
      `select permission_key from security_permission_definition
        where status='active' and permission_key=any($1::text[]) order by permission_key`,
      [bankPaymentPermissions],
    );
    if (definitions.rowCount !== bankPaymentPermissions.length)
      throw new Error("The complete Bank Payment permission set is unavailable");

    const superPolicies = await setup.query<{ id: string; permissions: unknown }>(
      `select policy.id,policy.permissions
         from security_role_policy policy
         join security_tenant_role role
           on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
        where policy.tenant_id=$1 and policy.status='active' and policy.lifecycle_state='active'
          and role.role_code='super_administrator' and role.lifecycle_state='active'
        order by policy.id for update of policy`,
      [sourceTestTenantId],
    );
    if (!superPolicies.rowCount) throw new Error("No active governed super-administrator policy is available");
    for (const policy of superPolicies.rows) {
      const current = Array.isArray(policy.permissions)
        ? policy.permissions.filter((permission): permission is string => typeof permission === "string")
        : [];
      const reconciled = [...new Set([...current, ...bankPaymentPermissions])].sort();
      await setup.query(
        `update security_role_policy set permissions=$3::jsonb
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, policy.id, JSON.stringify(reconciled)],
      );
      await setup.query(
        `insert into security_role_permission_grant
          (tenant_id,role_policy_id,permission_key,field_allow_mode)
         select $1,$2,permission_key,'all' from security_permission_definition
          where status='active' and permission_key=any($3::text[])
         on conflict do nothing`,
        [sourceTestTenantId, policy.id, bankPaymentPermissions],
      );
      await setup.query(
        `insert into security_role_scope_grant
          (tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
         select $1,$2,permission_key,'tenant',$1 from security_permission_definition
          where status='active' and permission_key=any($3::text[])
         on conflict do nothing`,
        [sourceTestTenantId, policy.id, bankPaymentPermissions],
      );
    }

    const dateAuthority = await setup.query<{
      current_date: string;
      year: number;
      month: number;
      year_start: string;
      year_end: string;
      month_start: string;
      month_end: string;
      rate_date: string;
    }>(
      `select current_date::text as current_date,
              extract(year from current_date)::integer as year,
              extract(month from current_date)::integer as month,
              make_date(extract(year from current_date)::integer,1,1)::text as year_start,
              make_date(extract(year from current_date)::integer,12,31)::text as year_end,
              date_trunc('month',current_date)::date::text as month_start,
              (date_trunc('month',current_date)+interval '1 month - 1 day')::date::text as month_end,
              (current_date-1)::text as rate_date`,
    );
    const dates = dateAuthority.rows[0]!;
    const year = dates.year;
    const month = dates.month;

    const activeBase = await setup.query<{
      code: string;
      name: string;
      decimal_places: number;
      is_base: boolean;
      status: string;
    }>(
      `select code,name,decimal_places,is_base,status from currency
        where tenant_id=$1 and status='active' and is_base order by code for update`,
      [sourceTestTenantId],
    );
    if (activeBase.rows.length > 1) throw new Error("The UAT tenant has conflicting active base-currency authority");
    if (!activeBase.rows[0]) {
      const reservedBase = await setup.query<{ code: string }>(
        "select code from currency where tenant_id=$1 and code='USD' for update",
        [sourceTestTenantId],
      );
      if (reservedBase.rows[0]) throw new Error("The reserved UAT base currency conflicts with expected authority");
      await setup.query(
        `insert into currency (tenant_id,code,name,decimal_places,is_base,status)
         values ($1,'USD','US Dollar',2,true,'active')`,
        [sourceTestTenantId],
      );
      baseCurrency = "USD";
    } else {
      baseCurrency = activeBase.rows[0].code;
    }
    if (baseCurrency === syntheticTransactionCurrency)
      throw new Error("The reserved synthetic transaction currency cannot be the tenant base currency");
    const transactionCurrency = await setup.query<{
      tenant_id: string;
      code: string;
      name: string;
      decimal_places: number;
      is_base: boolean;
      status: string;
    }>(
      `select tenant_id,code,name,decimal_places,is_base,status from currency
        where tenant_id=$1 and code=$2 for update`,
      [sourceTestTenantId, syntheticTransactionCurrency],
    );
    if (!transactionCurrency.rows[0]) {
      await setup.query(
        `insert into currency (tenant_id,code,name,decimal_places,is_base,status)
         values ($1,$2,'Synthetic Bank Payment Unit',2,false,'active')`,
        [sourceTestTenantId, syntheticTransactionCurrency],
      );
    } else if (
      transactionCurrency.rows[0].tenant_id !== sourceTestTenantId ||
      transactionCurrency.rows[0].code !== syntheticTransactionCurrency ||
      transactionCurrency.rows[0].name !== "Synthetic Bank Payment Unit" ||
      Number(transactionCurrency.rows[0].decimal_places) !== 2 ||
      transactionCurrency.rows[0].is_base ||
      transactionCurrency.rows[0].status !== "active"
    ) {
      throw new Error("The reserved synthetic Bank Payment currency conflicts with expected authority");
    }
    const rates = await setup.query<{
      id: string;
      tenant_id: string;
      source_currency: string;
      target_currency: string;
      rate: string;
      effective_date: string;
    }>(
      `select id,tenant_id,source_currency,target_currency,rate::text as rate,effective_date::text
         from currency_rate
        where tenant_id=$1 and (id='r06-uat-bank-payment-rate'
          or (source_currency=$2 and target_currency=$3 and effective_date=$4::date))
        order by id for update`,
      [sourceTestTenantId, syntheticTransactionCurrency, baseCurrency, dates.rate_date],
    );
    if (rates.rows.length > 1)
      throw new Error("Multiple records conflict with the reserved synthetic Bank Payment exchange-rate authority");
    const rate = rates.rows[0];
    if (!rate) {
      await setup.query(
        `insert into currency_rate
          (id,tenant_id,source_currency,target_currency,rate,effective_date,created_at)
         values ('r06-uat-bank-payment-rate',$1,$2,$3,1.25,$4::date,now())`,
        [sourceTestTenantId, syntheticTransactionCurrency, baseCurrency, dates.rate_date],
      );
    } else if (
      rate.id !== "r06-uat-bank-payment-rate" ||
      rate.tenant_id !== sourceTestTenantId ||
      rate.source_currency !== syntheticTransactionCurrency ||
      rate.target_currency !== baseCurrency ||
      rate.rate !== "1.250000000000000000" ||
      rate.effective_date !== dates.rate_date
    ) {
      throw new Error("The reserved synthetic Bank Payment exchange-rate authority conflicts with expected authority");
    }

    const expectedCalendarId = `r06-uat-bank-payment-calendar-${year}`;
    const calendars = await setup.query<{
      id: string;
      tenant_id: string;
      company_id: string;
      year: number;
      period_start: string;
      period_end: string;
      status: string;
    }>(
      `select id,tenant_id,company_id,year,period_start::text,period_end::text,status
         from fiscal_calendar
        where tenant_id=$1 and (id=$2 or (company_id=$3 and year=$4))
        order by id for update`,
      [sourceTestTenantId, expectedCalendarId, sourceTestCompanyId, year],
    );
    if (calendars.rows.length > 1)
      throw new Error("Multiple records conflict with the reserved synthetic Bank Payment fiscal calendar");
    const calendar = calendars.rows[0];
    if (!calendar) {
      calendarId = expectedCalendarId;
      await setup.query(
        `insert into fiscal_calendar
          (id,tenant_id,company_id,year,period_start,period_end,status)
         values ($1,$2,$3,$4,$5::date,$6::date,'active')`,
        [calendarId, sourceTestTenantId, sourceTestCompanyId, year, dates.year_start, dates.year_end],
      );
    } else {
      calendarId = calendar.id;
      if (
        calendar.id !== expectedCalendarId ||
        calendar.tenant_id !== sourceTestTenantId ||
        calendar.company_id !== sourceTestCompanyId ||
        Number(calendar.year) !== year ||
        calendar.period_start !== dates.year_start ||
        calendar.period_end !== dates.year_end ||
        calendar.status !== "active"
      )
        throw new Error("The reserved synthetic Bank Payment fiscal calendar conflicts with expected authority");
    }
    const expectedPeriodId = `r06-uat-bank-payment-period-${year}-${month}`;
    const periods = await setup.query<{
      id: string;
      tenant_id: string;
      company_id: string;
      fiscal_calendar_id: string;
      period_number: number;
      period_start: string;
      period_end: string;
      status: string;
    }>(
      `select id,tenant_id,company_id,fiscal_calendar_id,period_number,
              period_start::text,period_end::text,status
         from financial_period
        where tenant_id=$1 and (id=$2
          or (company_id=$3 and current_date between period_start and period_end)
          or (fiscal_calendar_id=$4 and period_number=$5))
        order by id for update`,
      [sourceTestTenantId, expectedPeriodId, sourceTestCompanyId, calendarId, month],
    );
    if (periods.rows.length > 1)
      throw new Error("Multiple records conflict with the reserved synthetic Bank Payment Finance period");
    const period = periods.rows[0];
    if (!period) {
      await setup.query(
        `insert into financial_period
          (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
         values ($1,$2,$3,$4,$5,$6::date,$7::date,'open',now())`,
        [
          expectedPeriodId,
          sourceTestTenantId,
          sourceTestCompanyId,
          calendarId,
          month,
          dates.month_start,
          dates.month_end,
        ],
      );
    } else if (
      period.id !== expectedPeriodId ||
      period.tenant_id !== sourceTestTenantId ||
      period.company_id !== sourceTestCompanyId ||
      period.fiscal_calendar_id !== calendarId ||
      Number(period.period_number) !== month ||
      period.period_start !== dates.month_start ||
      period.period_end !== dates.month_end ||
      period.status !== "open"
    ) {
      throw new Error("The reserved synthetic Bank Payment Finance period conflicts with expected authority");
    }

    const reservedAccounts = await setup.query<{
      id: string;
      tenant_id: string;
      company_id: string;
      code: string;
      name: string;
      type: string;
      parent_id: string | null;
      is_header: boolean;
      required_dimensions: unknown;
      status: string;
      manual_posting_allowed: boolean;
      is_system_account: boolean;
      reconciliation_required: boolean;
    }>(
      `select id,tenant_id,company_id,code,name,type,parent_id,is_header,required_dimensions,
              status,manual_posting_allowed,is_system_account,reconciliation_required
         from account
        where tenant_id=$1 and (id=any($2::text[]) or (company_id=$3 and code=any($4::text[])))
        order by id for update`,
      [sourceTestTenantId, [controlAccountId, nominalAccountId], sourceTestCompanyId, ["R06-BP-BANK", "R06-BP-EXP"]],
    );
    const accountExpectations = [
      {
        id: controlAccountId,
        code: "R06-BP-BANK",
        name: "Synthetic Bank Payment Control",
        type: "asset",
        requiredDimensions: [] as string[],
        reconciliationRequired: true,
      },
      {
        id: nominalAccountId,
        code: "R06-BP-EXP",
        name: "Synthetic Bank Payment Expense",
        type: "expense",
        requiredDimensions: ["department"],
        reconciliationRequired: false,
      },
    ];
    for (const expected of accountExpectations) {
      const matching = reservedAccounts.rows.filter((row) => row.id === expected.id || row.code === expected.code);
      if (matching.length > 1) throw new Error(`Multiple records conflict with reserved account ${expected.id}`);
      const row = matching[0];
      if (!row) {
        await setup.query(
          `insert into account
            (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
             manual_posting_allowed,is_system_account,reconciliation_required,created_at)
           values ($1,$2,$3,$4,$5,$6,false,$7::jsonb,'active',true,false,$8,now())`,
          [
            expected.id,
            sourceTestTenantId,
            sourceTestCompanyId,
            expected.code,
            expected.name,
            expected.type,
            JSON.stringify(expected.requiredDimensions),
            expected.reconciliationRequired,
          ],
        );
      } else if (
        row.id !== expected.id ||
        row.tenant_id !== sourceTestTenantId ||
        row.company_id !== sourceTestCompanyId ||
        row.code !== expected.code ||
        row.name !== expected.name ||
        row.type !== expected.type ||
        row.parent_id !== null ||
        row.is_header ||
        JSON.stringify(row.required_dimensions) !== JSON.stringify(expected.requiredDimensions) ||
        row.status !== "active" ||
        !row.manual_posting_allowed ||
        row.is_system_account ||
        row.reconciliation_required !== expected.reconciliationRequired
      ) {
        throw new Error(`Reserved account ${expected.id} conflicts with expected authority`);
      }
    }
    await setup.query("commit");
  } catch (error) {
    await setup.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    setup.release();
  }

  const [maker, checker, poster] = await Promise.all([
    actorContext(pool, makerId),
    actorContext(pool, checkerId),
    actorContext(pool, posterId),
  ]);
  for (const context of [maker, checker, poster]) {
    const expected = expectedPaymentPermissions(context.actor.userId);
    const actual = context.actor.permissions.filter((permission) => permission.startsWith("banking.payment.")).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
      throw new Error(`Controlled Bank Payment permissions are invalid for ${context.actor.userId}`);
  }

  const identifierCrypto = new BankingIdentifierCrypto(bankingEncryptionKey, bankingEncryptionKeyVersion);
  const bankRepository = new SourceBankingRepository(pool, identifierCrypto);
  const existing = await pool.query<{
    id: string;
    tenant_id: string;
    company_id: string;
    account_id: string;
    reference: string;
    account_name: string;
    account_type: string;
    bank_name: string;
    branch: string;
    account_number_masked: string;
    account_number_hash: string;
    account_ciphertext_valid: boolean;
    account_nonce_valid: boolean;
    iban_masked: string | null;
    iban_ciphertext: Buffer | null;
    iban_nonce: Buffer | null;
    iban_hash: string | null;
    encryption_key_version: string;
    swift_bic: string;
    currency: string;
    status: string;
    row_version: number;
    overdraft_limit: string;
    created_by: string | null;
  }>(
    `select id,tenant_id,company_id,account_id,reference,account_name,account_type,bank_name,branch,
            account_number_masked,account_number_hash,
            octet_length(account_number_ciphertext)>16 as account_ciphertext_valid,
            octet_length(account_number_nonce)=12 as account_nonce_valid,
            iban_masked,iban_ciphertext,iban_nonce,iban_hash,encryption_key_version,swift_bic,currency,
            status,row_version,overdraft_limit::text,created_by
       from bank_account
      where tenant_id=$1 and ((company_id=$2 and account_id=$3) or account_name=$4 or account_number_hash=$5)
      order by id`,
    [
      sourceTestTenantId,
      sourceTestCompanyId,
      controlAccountId,
      bankAccountName,
      identifierCrypto.hash(syntheticAccountNumber),
    ],
  );
  if (existing.rows.length > 1)
    throw new Error("Multiple records conflict with the reserved governed synthetic Bank Account");
  let accountId = existing.rows[0]?.id;
  let state = existing.rows[0]?.status;
  let version = Number(existing.rows[0]?.row_version ?? 0);
  const existingAccount = existing.rows[0];
  if (existingAccount) {
    const expectedVersion =
      existingAccount.status === "draft" ? 1 : existingAccount.status === "pending_approval" ? 2 : 3;
    if (
      existingAccount.tenant_id !== sourceTestTenantId ||
      existingAccount.company_id !== sourceTestCompanyId ||
      existingAccount.account_id !== controlAccountId ||
      !/^BA-\d{4}-[A-Z0-9]{8}$/.test(existingAccount.reference) ||
      existingAccount.account_name !== bankAccountName ||
      existingAccount.account_type !== "current" ||
      existingAccount.bank_name !== "Synthetic Acceptance Bank" ||
      existingAccount.branch !== "Controlled UAT" ||
      existingAccount.account_number_masked !== identifierCrypto.mask(syntheticAccountNumber) ||
      existingAccount.account_number_hash !== identifierCrypto.hash(syntheticAccountNumber) ||
      !existingAccount.account_ciphertext_valid ||
      !existingAccount.account_nonce_valid ||
      existingAccount.iban_masked !== null ||
      existingAccount.iban_ciphertext !== null ||
      existingAccount.iban_nonce !== null ||
      existingAccount.iban_hash !== null ||
      existingAccount.encryption_key_version !== bankingEncryptionKeyVersion ||
      existingAccount.swift_bic !== "" ||
      existingAccount.currency !== syntheticTransactionCurrency ||
      !["draft", "pending_approval", "active"].includes(existingAccount.status) ||
      Number(existingAccount.row_version) !== expectedVersion ||
      existingAccount.overdraft_limit !== "0.00000000" ||
      existingAccount.created_by !== makerId
    )
      throw new Error("The reserved governed synthetic Bank Account conflicts with expected authority");
  }
  if (!accountId) {
    const created = await bankRepository.createAccount(
      maker,
      {
        company_id: sourceTestCompanyId,
        account_name: bankAccountName,
        account_type: "current",
        bank_name: "Synthetic Acceptance Bank",
        branch: "Controlled UAT",
        account_number: syntheticAccountNumber,
        iban: null,
        swift_bic: null,
        currency: syntheticTransactionCurrency,
        ledger_account_id: controlAccountId,
        overdraft_limit: "0",
        opening_balance: "0",
      },
      "r06-uat-bank-payment-account-create",
      "r06-uat-bank-payment-account-create",
    );
    accountId = created.id;
    state = created.state;
    version = created.version;
  }
  if (state === "draft") {
    const submitted = await bankRepository.submitAccount(
      maker,
      accountId!,
      { expected_version: version, reason: "Controlled Bank Payment acceptance authority" },
      "r06-uat-bank-payment-account-submit",
      "r06-uat-bank-payment-account-submit",
    );
    state = submitted.state;
    version = submitted.version;
  }
  if (state === "pending_approval") {
    const approved = await bankRepository.decideAccount(
      checker,
      accountId!,
      { action: "approve", expected_version: version, reason: "Independent controlled UAT approval" },
      "r06-uat-bank-payment-account-approve",
      "r06-uat-bank-payment-account-approve",
    );
    state = approved.state;
    version = approved.version;
  }
  if (state !== "active") throw new Error(`The governed synthetic Bank Account is ${state ?? "unavailable"}`);

  const governedAccount = await pool.query<{
    submitted_by: string | null;
    submitted_at_present: boolean;
    submission_reason: string | null;
    approved_by: string | null;
    approved_at_present: boolean;
    decision_reason: string | null;
    rejected_by: string | null;
    rejected_at: Date | null;
    approval_override_event_id: string | null;
    deactivated_by: string | null;
    deactivated_at: Date | null;
    closed_by: string | null;
    closed_at: Date | null;
    status: string;
    row_version: number;
  }>(
    `select submitted_by,submitted_at is not null as submitted_at_present,submission_reason,
            approved_by,approved_at is not null as approved_at_present,decision_reason,
            rejected_by,rejected_at,approval_override_event_id,deactivated_by,deactivated_at,
            closed_by,closed_at,status,row_version
       from bank_account where tenant_id=$1 and company_id=$2 and id=$3`,
    [sourceTestTenantId, sourceTestCompanyId, accountId],
  );
  const governed = governedAccount.rows[0];
  if (
    !governed ||
    governed.submitted_by !== makerId ||
    !governed.submitted_at_present ||
    governed.submission_reason !== "Controlled Bank Payment acceptance authority" ||
    governed.approved_by !== checkerId ||
    !governed.approved_at_present ||
    governed.decision_reason !== "Independent controlled UAT approval" ||
    governed.rejected_by !== null ||
    governed.rejected_at !== null ||
    governed.approval_override_event_id !== null ||
    governed.deactivated_by !== null ||
    governed.deactivated_at !== null ||
    governed.closed_by !== null ||
    governed.closed_at !== null ||
    governed.status !== "active" ||
    Number(governed.row_version) !== 3
  )
    throw new Error("The governed synthetic Bank Account lifecycle evidence conflicts with expected authority");

  const evidence = await pool.query<{
    permission_count: number;
    super_policy_count: number;
    scoped_role_count: number;
  }>(
    `select
       (select count(*)::int from security_permission_definition
         where status='active' and permission_key=any($2::text[])) as permission_count,
       (select count(distinct policy.id)::int from security_role_policy policy
         join security_tenant_role role on role.tenant_id=policy.tenant_id and role.role_id=policy.role_id
         where policy.tenant_id=$1 and policy.status='active' and policy.lifecycle_state='active'
           and role.role_code='super_administrator' and not exists (
             select 1 from unnest($2::text[]) required(permission_key)
              where not exists (select 1 from security_role_permission_grant grant_row
                where grant_row.tenant_id=policy.tenant_id and grant_row.role_policy_id=policy.id
                  and grant_row.permission_key=required.permission_key))) as super_policy_count,
       (select count(distinct role_policy_id)::int from security_role_scope_grant
         where tenant_id=$1 and scope_kind='company' and scope_value=$3
           and permission_key=any($2::text[])) as scoped_role_count`,
    [sourceTestTenantId, bankPaymentPermissions, sourceTestCompanyId],
  );
  const result = evidence.rows[0];
  if (!result || result.permission_count !== 7 || result.super_policy_count < 1 || result.scoped_role_count !== 3)
    throw new Error("Bank Payment UAT authorization verification failed");

  process.stdout.write(
    `${JSON.stringify({
      tenantId: sourceTestTenantId,
      companyId: sourceTestCompanyId,
      bankAccountId: accountId,
      nominalAccountId,
      baseCurrency,
      transactionCurrency: syntheticTransactionCurrency,
      permissionCount: result.permission_count,
      ordinaryRoleCount: result.scoped_role_count,
      superAdministratorPolicyCount: result.super_policy_count,
      state,
      version,
      credentialsChanged: false,
    })}\n`,
  );
} finally {
  await lockClient
    .query("select pg_advisory_unlock(hashtextextended($1,0))", [`nexora:uat:bank-payments:${sourceTestTenantId}`])
    .catch(() => undefined);
  lockClient.release();
  await pool.end();
}
