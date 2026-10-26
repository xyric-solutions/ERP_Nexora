import { BankingApiError } from "../banking/source-repository.js";
import { requireBankPaymentCompanyPermission } from "../banking/payments/source-repository.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { HrPayrollRecordAction, HrPayrollRunQuery } from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { ExactPayrollAmount } from "./payroll-calculation.js";
import { attendanceHash } from "./attendance-completion.js";

// Database evidence is validated at the query and lifecycle boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const conflict = (message: string): never => {
  throw new HrApiError(409, "HR_PAYROLL_LOAN_REVIEW_REQUIRED", message);
};

/** Links an independently confirmed, already posted bank payment. Never initiates a bank transfer. */
export async function confirmLoanDisbursement(
  client: PoolClient,
  c: HrActorContext,
  loan: Row,
  input: HrPayrollRecordAction,
) {
  await requireLoanDisbursementAuthority(client, c, input.company_id);
  if (loan.state !== "approved" || !loan.workflow_managed) conflict("Only a governed approved loan can be funded.");
  const self = await client.query(
    `select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2 and user_id=$3 and ended_at is null`,
    [c.tenantId, loan.employee_id, c.actor.userId],
  );
  if ([loan.created_by, loan.submitted_by].includes(c.actor.userId) || self.rowCount)
    throw new HrApiError(
      403,
      "HR_PAYROLL_INDEPENDENT_APPROVAL_REQUIRED",
      "An independent officer must confirm the employee's disbursement; self-confirmation cannot be overridden.",
    );
  const payment = (
    await client.query(
      `select p.*,p.posting_date::text,l.id as line_id,l.external_reference,l.document_reference,l.amount::text as line_amount,l.nominal_account_id,a.type as account_type,a.status as account_status,a.is_header
     from bank_payment_line l join bank_payment p on p.tenant_id=l.tenant_id and p.company_id=l.company_id and p.id=l.payment_id
     join account a on a.tenant_id=l.tenant_id and a.company_id=l.company_id and a.id=l.nominal_account_id
     where l.tenant_id=$1 and l.company_id=$2 and l.id=$3 for update of p`,
      [c.tenantId, input.company_id, input.bank_payment_line_id],
    )
  ).rows[0];
  if (
    !payment ||
    payment.state !== "posted" ||
    !payment.original_journal_entry_id ||
    !payment.original_accounting_event_id
  )
    conflict("Select a posted, unreversed Bank Payment line in this company.");
  if (
    payment.transaction_currency !== loan.currency_code ||
    payment.external_reference !== loan.reference ||
    payment.document_reference !== loan.employee_id ||
    ExactPayrollAmount.parse(payment.line_amount).compare(ExactPayrollAmount.parse(String(loan.principal))) !== 0
  )
    conflict("The payment line must match the loan reference, employee ID, currency and exact principal.");
  if (payment.account_type !== "asset" || payment.account_status !== "active" || payment.is_header)
    conflict("Disbursement must debit an active postable employee-loan receivable asset account.");
  const dates = (
    await client.query(
      `select $1::date<=current_date and $1::date>=$2::date and $1::date<($3::date+interval '1 month') as valid`,
      [input.confirmed_on, payment.posting_date, loan.start_month],
    )
  ).rows[0];
  if (!dates.valid)
    conflict(
      "Confirmation must follow the posted payment, be no later than today and fall before the first recovery month ends.",
    );
  const schedule = (
    await client.query(
      `select count(*)::int as count,sum(amount)::text as total,bool_and(state='scheduled') as scheduled from hr_loan_instalment where tenant_id=$1 and loan_id=$2`,
      [c.tenantId, loan.id],
    )
  ).rows[0];
  if (
    schedule.count !== loan.instalment_count ||
    !schedule.scheduled ||
    ExactPayrollAmount.parse(schedule.total ?? "0").compare(ExactPayrollAmount.parse(String(loan.principal))) !== 0
  )
    conflict("The complete approved repayment schedule must reconcile to the principal.");
  const precision = (
    await client.query("select decimal_places from currency where tenant_id=$1 and code=$2 and status='active'", [
      c.tenantId,
      loan.currency_code,
    ])
  ).rows[0];
  if (!precision || precision.decimal_places > 4)
    conflict("An active supported Finance currency is required before funding.");
  const amounts = (
    await client.query("select amount::text from hr_loan_instalment where tenant_id=$1 and loan_id=$2 limit 600", [
      c.tenantId,
      loan.id,
    ])
  ).rows;
  if (
    amounts.some(
      (r) =>
        ExactPayrollAmount.parse(r.amount).compare(
          ExactPayrollAmount.parse(ExactPayrollAmount.parse(r.amount).decimal(precision.decimal_places)),
        ) !== 0,
    )
  )
    conflict("The approved schedule exceeds the currency precision and requires governed correction before funding.");
  const evidence = {
    payment_id: payment.id,
    bank_payment_line_id: payment.line_id,
    journal_id: payment.original_journal_entry_id,
    accounting_event_id: payment.original_accounting_event_id,
    receivable_account_id: payment.nominal_account_id,
    currency_code: loan.currency_code,
    amount: String(loan.principal),
    employee_id: loan.employee_id,
    bank_reference: input.bank_reference!,
    confirmed_on: input.confirmed_on!,
    confirmed_by: c.actor.userId,
  };
  await client.query(
    `insert into hr_loan_disbursement(tenant_id,company_id,loan_id,payment_id,bank_payment_line_id,journal_id,accounting_event_id,receivable_account_id,amount,currency_code,bank_reference,confirmed_on,confirmed_by,source_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      c.tenantId,
      input.company_id,
      loan.id,
      evidence.payment_id,
      evidence.bank_payment_line_id,
      evidence.journal_id,
      evidence.accounting_event_id,
      evidence.receivable_account_id,
      evidence.amount,
      evidence.currency_code,
      evidence.bank_reference,
      evidence.confirmed_on,
      c.actor.userId,
      attendanceHash(evidence),
    ],
  );
}

/** Stable ordered inputs are retained in each immutable result and compared again at final approval. */
export async function loanRecoveries(
  client: PoolClient,
  c: HrActorContext,
  q: HrPayrollRunQuery,
  lock = false,
): Promise<Row[]> {
  return (
    await client.query(
      `select i.id,i.loan_id,i.amount::text,i.due_month::text,l.employee_id,l.version as loan_version,l.currency_code,l.component_id,l.reference,d.source_hash as disbursement_hash,d.receivable_account_id,c.code,c.name,c.status as component_status,c.kind,c.method,a.status as account_status,a.is_header,a.type as account_type
   from hr_loan_instalment i join hr_employee_loan l on l.tenant_id=i.tenant_id and l.id=i.loan_id
   join hr_loan_disbursement d on d.tenant_id=l.tenant_id and d.company_id=l.company_id and d.loan_id=l.id
   join hr_pay_component c on c.tenant_id=l.tenant_id and c.company_id=l.company_id and c.id=l.component_id
   join account a on a.tenant_id=d.tenant_id and a.company_id=d.company_id and a.id=d.receivable_account_id
   where l.tenant_id=$1 and l.company_id=$2 and l.state='active' and i.state='scheduled' and i.due_month=$3::date order by i.id collate "C" limit 1001${lock ? " for update of i,l" : ""}`,
      [c.tenantId, q.company_id, q.month],
    )
  ).rows;
}
export async function recordedLoanRecoveries(
  client: PoolClient,
  c: HrActorContext,
  q: HrPayrollRunQuery,
  p: Row,
): Promise<Row[]> {
  return (
    await client.query(
      `select id,execution_evidence->'loans' as loans from hr_payroll_result where tenant_id=$1 and company_id=$2 and period_id=$3 and run_number=$4 order by employee_id collate "C",id collate "C"`,
      [c.tenantId, q.company_id, p.id, p.run_number],
    )
  ).rows.flatMap((r) => (Array.isArray(r.loans) ? r.loans : []).map((a: Row) => ({ ...a, result_id: r.id })));
}
export function sameLoanRecoveries(recorded: Row[], current: Row[]) {
  const clean = (rows: Row[]) =>
    rows
      .map((row) => {
        const value = { ...row };
        delete value.result_id;
        return value;
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return attendanceHash(clean(recorded)) === attendanceHash(clean(current));
}
export async function loanRecoveryBlockers(client: PoolClient, c: HrActorContext, q: HrPayrollRunQuery) {
  const invalid = (
    await client.query(
      `select 1 from hr_employee_loan l where l.tenant_id=$1 and l.company_id=$2 and l.state='active' and l.start_month<($3::date+interval '1 month') and (not l.workflow_managed or not exists(select 1 from hr_loan_disbursement d where d.tenant_id=l.tenant_id and d.loan_id=l.id) or exists(select 1 from hr_loan_instalment i where i.tenant_id=l.tenant_id and i.loan_id=l.id and i.state='scheduled' and i.due_month<$3::date)) limit 1`,
      [c.tenantId, q.company_id, q.month],
    )
  ).rowCount;
  return invalid
    ? [
        "An active loan has unverified disbursement or overdue instalments. Resolve it before Payroll; no silent catch-up or omission is permitted.",
      ]
    : [];
}
export function loanRecoveryLine(r: Row, currency: string, scale: number) {
  if (
    r.currency_code !== currency ||
    r.component_status !== "active" ||
    r.kind !== "deduction" ||
    r.method !== "fixed" ||
    r.account_status !== "active" ||
    r.account_type !== "asset" ||
    r.is_header
  )
    conflict(
      "Loan recovery requires the Payroll currency, an active fixed deduction component and its active receivable asset account.",
    );
  const amount = ExactPayrollAmount.parse(r.amount),
    rounded = amount.decimal(scale);
  if (amount.compare(ExactPayrollAmount.parse(rounded)) !== 0)
    conflict("A loan instalment exceeds Payroll currency precision. A reviewed schedule correction is required.");
  return {
    component_id: r.component_id as string,
    component_code: r.code as string,
    component_name: (r.name + " · " + r.reference) as string,
    kind: "deduction" as const,
    amount: rounded,
    expense_account_id: null,
    liability_account_id: r.receivable_account_id as string,
    source: "loan:" + r.id,
  };
}
export async function consumeLoanRecoveries(
  client: PoolClient,
  c: HrActorContext,
  q: HrPayrollRunQuery,
  p: Row,
): Promise<Row[]> {
  const recorded = await recordedLoanRecoveries(client, c, q, p),
    changed: Row[] = [];
  for (const recovery of recorded) {
    const result = await client.query(
      `update hr_loan_instalment set state='consumed',consumed_result_id=$4 where tenant_id=$1 and loan_id=$2 and id=$3 and state='scheduled' and consumed_result_id is null`,
      [c.tenantId, recovery.loan_id, recovery.id, recovery.result_id],
    );
    if (result.rowCount !== 1) conflict("A reviewed loan instalment changed during consumption.");
    changed.push(recovery);
  }
  for (const id of new Set(recorded.map((r) => r.loan_id))) {
    await client.query(
      `update hr_employee_loan l set state='settled',version=version+1 where l.tenant_id=$1 and l.company_id=$2 and l.id=$3 and l.state='active' and not exists(select 1 from hr_loan_instalment i where i.tenant_id=l.tenant_id and i.loan_id=l.id and i.state<>'consumed')`,
      [c.tenantId, q.company_id, id],
    );
  }
  return changed.map((r) => ({ ...r, event_id: "loan-recovery-" + randomUUID() }));
}

export async function loanDisbursementOptions(client: PoolClient, c: HrActorContext, loan: Row) {
  if (loan.state !== "approved" || !loan.workflow_managed || !c.actor.permissions.includes("banking.payment.read"))
    return [];
  try {
    await requireBankPaymentCompanyPermission(client, c, "banking.payment.read", loan.company_id);
  } catch (error) {
    if (error instanceof BankingApiError && error.status === 403) return [];
    throw error;
  }
  return (
    await client.query(
      `select l.id as line_id,p.reference as payment_reference,p.posting_date::text,l.amount::text,p.transaction_currency as currency_code,a.code||' · '||a.name as receivable_account
  from bank_payment_line l join bank_payment p on p.tenant_id=l.tenant_id and p.company_id=l.company_id and p.id=l.payment_id join account a on a.tenant_id=l.tenant_id and a.company_id=l.company_id and a.id=l.nominal_account_id
  where l.tenant_id=$1 and l.company_id=$2 and p.state='posted' and p.transaction_currency=$3 and l.external_reference=$4 and l.document_reference=$5 and l.amount=$6::numeric and a.type='asset' and a.status='active' and not a.is_header
  and not exists(select 1 from hr_loan_disbursement d where d.tenant_id=l.tenant_id and d.bank_payment_line_id=l.id)
  order by p.posting_date desc,p.reference collate "C",l.line_number limit 25`,
      [c.tenantId, loan.company_id, loan.currency_code, loan.reference, loan.employee_id, loan.principal],
    )
  ).rows;
}

export async function requireLoanDisbursementAuthority(client: PoolClient, c: HrActorContext, company: string) {
  if (!c.actor.permissions.includes("banking.payment.read"))
    throw new HrApiError(403, "PERMISSION_DENIED", "Bank Payment read permission is required to verify disbursement.");
  try {
    await requireBankPaymentCompanyPermission(client, c, "banking.payment.read", company);
  } catch (error) {
    if (!(error instanceof BankingApiError) || error.status !== 403) throw error;
    throw new HrApiError(403, "PERMISSION_DENIED", "Bank Payment read authority is required for this company.");
  }
}
