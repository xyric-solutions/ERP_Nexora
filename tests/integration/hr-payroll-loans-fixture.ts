import { randomUUID, createHash } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import {
  createHrPayrollRecordSchema,
  hrPayrollRecordActionSchema,
  type HrPayrollRecordAction,
} from "../../packages/contracts/src/hr/index.js";
import { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";
import { createStatutoryFixture } from "./hr-payroll-statutory-fixture.js";
import { runActor, runPermissions } from "./hr-payroll-run-fixture.js";
import { ensureCompanyCurrencyFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
const key = () => randomUUID(),
  reason = "Isolated loan recovery acceptance";
export const loanActor = (who = "r06.maker") => runActor(who, [...runPermissions, "banking.payment.read"]);
export async function createLoanFixture(pool: DatabasePool, options: { principal?: string; count?: number } = {}) {
  const f = await createStatutoryFixture(pool),
    bank = key(),
    ledger = key(),
    receivable = key(),
    calendar = key(),
    period = key();
  await pool.query(
    `insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.target',$3,false,'r06.last-admin-a','governed_administration','loan-test')`,
    [tenant, key(), f.companyId],
  );
  for (const [policy, permissions] of [
    ["r06-uat-policy-maker", ["banking.payment.read", "banking.payment.create", "banking.payment.submit"]],
    ["r06-uat-policy-checker", ["banking.payment.read", "banking.payment.approve"]],
    ["r06-uat-policy-payment-poster", ["banking.payment.read", "banking.payment.post", "banking.payment.reverse"]],
  ] as const)
    await pool.query(
      `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$3 from unnest($4::text[]) p on conflict do nothing`,
      [tenant, policy, f.companyId, permissions],
    );
  await pool.query(
    `insert into account(id,tenant_id,company_id,code,name,type,status,reconciliation_required,created_at) values($1,$3,$4,'LOAN_BANK','Loan bank control','asset','active',true,now()),($2,$3,$4,'LOAN_RECEIVABLE','Employee loan receivable','asset','active',false,now())`,
    [ledger, receivable, tenant, f.companyId],
  );
  await pool.query(
    `insert into fiscal_calendar(id,tenant_id,company_id,year,period_start,period_end,status) values($1,$2,$3,extract(year from current_date)::int,date_trunc('year',current_date)::date,(date_trunc('year',current_date)+interval '1 year - 1 day')::date,'active')`,
    [calendar, tenant, f.companyId],
  );
  await pool.query(
    `insert into financial_period(id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at) values($1,$2,$3,$4,extract(month from current_date)::int,date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,'open',now())`,
    [period, tenant, f.companyId, calendar],
  );
  if (
    !(await pool.query("select 1 from currency where tenant_id=$1 and is_base and status='active'", [tenant])).rowCount
  )
    await pool.query(
      "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','Synthetic base currency',2,true,'active') on conflict(tenant_id,code) do update set is_base=true,status='active'",
      [tenant],
    );
  const base = (
    await pool.query(
      `select code from currency where tenant_id=$1 and is_base and status='active' order by code limit 1`,
      [tenant],
    )
  ).rows[0]?.code;
  if (!base) throw new Error("The isolated loan fixture requires a tenant base currency.");
  await ensureCompanyCurrencyFixture(pool, f.companyId, base, ["PKR"]);
  if (base && base !== "PKR")
    await pool.query(
      `insert into currency_rate(id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,created_at)
       values($1,$2,$3,'PKR',$4,1,current_date,now()) on conflict do nothing`,
      [key(), tenant, f.companyId, base],
    );
  await pool.query(
    `insert into bank_account(id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,account_type,branch,account_number_masked,account_number_ciphertext,account_number_nonce,account_number_hash,encryption_key_version,swift_bic,overdraft_limit,row_version,created_by,submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason)
    values($1,$2,$3,$4,'Synthetic loan bank','PKR','active',now(),$1,'Synthetic loan funding','current','Test branch','**** 1234',$5,$6,$7,'integration-v1','SYNTPKKA',0,1,'r06.maker','r06.maker',now(),'Synthetic setup','r06.checker',now(),'Synthetic approval')`,
    [
      bank,
      tenant,
      f.companyId,
      ledger,
      Buffer.alloc(24, 7),
      Buffer.alloc(12, 3),
      createHash("sha256").update(bank).digest("hex"),
    ],
  );
  const component = await f.repo.createPayrollRecord(
    loanActor(),
    createHrPayrollRecordSchema.parse({
      kind: "component",
      company_id: f.companyId,
      reason,
      code: "LOAN",
      name: "Loan recovery",
      component_kind: "deduction",
      method: "fixed",
      formula: null,
      taxable: false,
      prorated: false,
      account_id: f.liability,
      position: 20,
    }),
    key(),
    "loan-test",
  );
  const principal = options.principal ?? "100.00",
    count = options.count ?? 3;
  const loan = await f.repo.createPayrollRecord(
    loanActor(),
    createHrPayrollRecordSchema.parse({
      kind: "loan",
      company_id: f.companyId,
      reason,
      employee_id: f.person.employeeId,
      component_id: component.id,
      reference: "LOAN-" + key(),
      currency_code: "PKR",
      start_month: f.month,
      principal,
      instalment_count: count,
    }),
    key(),
    "loan-test",
  );
  const row = async () =>
    (
      await f.repo.getPayrollWorkspace(loanActor(), {
        company_id: f.companyId,
        section: "loans",
        month: f.month,
        search: "",
        limit: 25,
        offset: 0,
      })
    ).items.find((r) => r.id === loan.id)!;
  const act = async (
    action: HrPayrollRecordAction["action"],
    who = "r06.maker",
    extra: Record<string, unknown> = {},
    requestKey = key(),
  ) => {
    const current = await row();
    return f.repo.actOnPayrollRecord(
      loanActor(who),
      loan.id,
      hrPayrollRecordActionSchema.parse({
        company_id: f.companyId,
        section: "loans",
        action,
        expected_version: current.version,
        source_hash: current.source_hash,
        reason,
        confirm_override: false,
        ...extra,
      }),
      requestKey,
      "loan-test",
    );
  };
  await act("submit");
  await act("approve", "r06.checker");
  const payments = new SourceBankPaymentRepository(pool);
  const bankActor = (who: string) =>
    runActor(who, [
      "banking.payment.read",
      "banking.payment.create",
      "banking.payment.submit",
      "banking.payment.approve",
      "banking.payment.post",
      "banking.payment.reverse",
    ]);
  const pay = async (overrides: Record<string, unknown> = {}) => {
    const current = await row();
    const created = await payments.create(
      bankActor("r06.maker"),
      {
        company_id: f.companyId,
        bank_account_id: bank,
        approver_user_id: "r06.checker",
        posting_date: f.today,
        lines: [
          {
            line_order: 1,
            document_date: f.today,
            external_reference: current.reference,
            document_reference: f.person.employeeId,
            payment_method: "bank_transfer",
            nominal_account_id: receivable,
            narration: "Synthetic employee loan funding",
            amount: principal,
            dimensions: {},
            ...overrides,
          },
        ],
      },
      key(),
      "loan-test",
    );
    await payments.submit(bankActor("r06.maker"), created.id, { expected_version: 1 }, key(), "loan-test");
    await payments.decide(
      bankActor("r06.checker"),
      created.id,
      { expected_version: 2, action: "approve" },
      key(),
      "loan-test",
    );
    const posted = await payments.post(
      bankActor("r06.target"),
      created.id,
      { expected_version: 3 },
      key(),
      "loan-test",
    );
    const line = (
      await pool.query(`select id from bank_payment_line where tenant_id=$1 and company_id=$2 and payment_id=$3`, [
        tenant,
        f.companyId,
        posted.id,
      ])
    ).rows[0];
    return { posted, lineId: line.id };
  };
  const payment = await pay(),
    confirmation = {
      bank_payment_line_id: payment.lineId,
      bank_reference: "SYN-TRANSFER-" + key(),
      confirmed_on: f.today,
    };
  return {
    ...f,
    loan,
    component,
    receivable,
    payments,
    bankActor,
    row,
    loanAction: act,
    payment,
    pay,
    confirmation,
    fund: () => act("confirm_disbursement", "r06.checker", confirmation),
  };
}
