import { ExactPayrollAmount } from "./payroll-calculation.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { HrPayrollPaymentQuery, HrPayrollPaymentAction, HrPayrollPaymentWorkspace } from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import {
  PayrollWorkspace,
  payrollUnits,
  payrollDecimal,
  type PayrollWorkspaceDependencies,
} from "./payroll-workspace.js";
import { attendanceHash } from "./attendance-completion.js";
import { requireBankPaymentCompanyPermission } from "../banking/payments/source-repository.js";
import { BankingApiError } from "../banking/source-repository.js";
// Rows stay inside the repository boundary; public output is an explicit contract projection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_PAYROLL_PAYMENT_REVIEW_REQUIRED", message);
};
const deny = (message = "Current company-scoped Payroll and Banking authority is required."): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
const permission = {
  prepare: "hr.payroll.payment.manage",
  approve: "workflow.approval.approve",
  reject: "workflow.approval.reject",
  confirm: "hr.payroll.payment.confirm",
} as const;
export class PayrollPayment {
  private readonly writes: PayrollWorkspace;
  constructor(private readonly d: PayrollWorkspaceDependencies) {
    this.writes = new PayrollWorkspace(d);
  }
  private async authorize(client: PoolClient, c: HrActorContext, company: string, extra = "hr.payroll.payment.read") {
    for (const p of new Set(["hr.payroll.payment.read", "hr.payroll.result.read", "banking.payment.read", extra])) {
      if (!c.actor.permissions.includes(p)) deny();
      try {
        await requireBankPaymentCompanyPermission(client, c, p, company);
      } catch (e) {
        if (e instanceof BankingApiError && e.status === 403) deny();
        throw e;
      }
    }
  }
  private async independent(client: PoolClient, c: HrActorContext, p: Row, b: Row) {
    const self = await client.query(
      `select 1 from employee_user_binding x join hr_payroll_result r on r.tenant_id=x.tenant_id and r.employee_id=x.employee_id where r.tenant_id=$1 and r.period_id=$2 and r.run_number=$3 and x.user_id=$4 and x.ended_at is null limit 1`,
      [c.tenantId, p.id, p.run_number, c.actor.userId],
    );
    if ([p.created_by, p.calculated_by, p.submitted_by, b.created_by].includes(c.actor.userId) || self.rowCount)
      deny(
        "An independent officer must approve or confirm this salary batch. Maker and employee self-confirmation cannot be overridden.",
      );
  }
  private async context(client: PoolClient, c: HrActorContext, q: HrPayrollPaymentQuery, lock = false) {
    const p = (
      await client.query(
        `select p.*,p.month::text from hr_payroll_period p where tenant_id=$1 and company_id=$2 and month=$3::date${lock ? " for update" : ""}`,
        [c.tenantId, q.company_id, q.month],
      )
    ).rows[0] as Row | undefined;
    const j = p
      ? ((
          await client.query(
            `select j.*,j.posting_date::text,j.exchange_rate::text,e.status as ledger_state from hr_payroll_journal_proposal j left join journal_entry e on e.tenant_id=j.tenant_id and e.company_id=j.company_id and e.id=j.external_journal_id where j.tenant_id=$1 and j.company_id=$2 and j.period_id=$3 and j.state='posted' order by j.revision desc limit 1`,
            [c.tenantId, q.company_id, p.id],
          )
        ).rows[0] as Row | undefined)
      : undefined;
    const b = p
      ? ((
          await client.query(
            `select * from hr_payroll_payment_batch where tenant_id=$1 and company_id=$2 and period_id=$3 order by created_at desc,id desc limit 1${lock ? " for update" : ""}`,
            [c.tenantId, q.company_id, p.id],
          )
        ).rows[0] as Row | undefined)
      : undefined;
    const results = p
      ? (
          await client.query(
            `select r.id,r.employee_id,r.currency_code,r.net::text,r.calculation_hash,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as employee_name from hr_payroll_result r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 order by r.id collate "C" limit 501`,
            [c.tenantId, q.company_id, p.id, p.run_number],
          )
        ).rows
      : [];
    const rows = b
      ? (
          await client.query(
            `select x.*,x.amount::text,s.bank_reference,s.confirmed_on::text,s.bank_payment_id,s.bank_payment_line_id,s.journal_id from hr_payroll_payment x left join hr_payroll_payment_settlement s on s.tenant_id=x.tenant_id and s.payment_id=x.id where x.tenant_id=$1 and x.batch_id=$2 order by x.result_id collate "C" limit 501`,
            [c.tenantId, b.id],
          )
        ).rows
      : [];
    const source = {
      period_id: p?.id ?? null,
      run_number: p?.run_number ?? null,
      review_hash: p?.review_hash ?? null,
      accrual_id: j?.id ?? null,
      journal_id: j?.external_journal_id ?? null,
      accrual_hash: j?.source_results_hash ?? null,
      currency: j?.currency_code ?? null,
      net_account_id: j?.source_evidence?.net_account_id ?? null,
      results: results.map((r) => ({
        id: r.id,
        employee_id: r.employee_id,
        currency_code: r.currency_code,
        net: r.net,
        calculation_hash: r.calculation_hash,
      })),
    };
    const resultsHash = attendanceHash(source),
      hash = attendanceHash({
        source,
        batch: b ? { id: b.id, state: b.state, version: b.version, validation_hash: b.validation_hash } : null,
        payments: rows.map((r) => ({ id: r.id, state: r.state, bank_reference: r.bank_reference ?? null })),
      });
    const blocked: string[] = [];
    if (
      !p?.workflow_managed ||
      !["posted", "paid"].includes(p.state) ||
      !j?.workflow_managed ||
      j.ledger_state !== "posted"
    )
      blocked.push("Post the independently accepted Payroll accrual to Finance first.");
    if (j && !/^1(?:\.0+)?$/.test(j.exchange_rate))
      blocked.push("Foreign-exchange salary settlement requires a governed carrying-value allocation.");
    if (!results.length || results.length > 500) blocked.push("This workflow supports 1–500 employees per posted run.");
    const positive = results.filter((r) => payrollUnits(r.net) > 0n),
      net: bigint = results.reduce((n, r) => n + payrollUnits(r.net), 0n);
    if (!net) blocked.push("This run has no salary transfer due. Zero-net closure requires its own closing workflow.");
    if (results.some((r) => r.currency_code !== j?.currency_code))
      blocked.push("All salary results must use the posted accrual currency.");
    if (b && !b.workflow_managed)
      blocked.push("Historical payment batches retain their original evidence and are read-only.");
    if (
      b?.workflow_managed &&
      b.state !== "cancelled" &&
      (b.validation_hash !== resultsHash ||
        b.accrual_proposal_id !== j?.id ||
        rows.length !== positive.length ||
        positive.some(
          (r) =>
            !rows.some(
              (x) =>
                x.result_id === r.id &&
                x.employee_id === r.employee_id &&
                payrollUnits(x.amount) === payrollUnits(r.net),
            ),
        ))
    )
      blocked.push("The retained salary payment population does not match its posted accrual.");
    return { p, j, b, results, rows, positive, net, resultsHash, hash, blocked };
  }
  async workspace(c: HrActorContext, q: HrPayrollPaymentQuery): Promise<HrPayrollPaymentWorkspace> {
    return this.d.read(c, "hr.payroll.payment.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      await this.authorize(client, c, q.company_id);
      return this.readIn(client, c, q);
    });
  }
  private async readIn(
    client: PoolClient,
    c: HrActorContext,
    q: HrPayrollPaymentQuery,
  ): Promise<HrPayrollPaymentWorkspace> {
    const x = await this.context(client, c, q),
      { p, j, b } = x;
    const can = async (action: keyof typeof permission) => {
      try {
        await this.authorize(client, c, q.company_id, permission[action]);
        if (action !== "prepare") await this.independent(client, c, p!, b!);
        return true;
      } catch (e) {
        if (e instanceof HrApiError && e.status === 403) return false;
        throw e;
      }
    };
    const allowed: HrPayrollPaymentWorkspace["allowed_actions"] = [];
    if (!x.blocked.length && p?.state === "posted" && (!b || b.state === "cancelled") && (await can("prepare")))
      allowed.push("prepare");
    if (b?.workflow_managed && b.state === "draft") {
      if (!x.blocked.length && (await can("approve"))) allowed.push("approve");
      if (await can("reject")) allowed.push("reject");
    }
    const canConfirm = !!(b?.workflow_managed && b.state === "released" && !x.blocked.length && (await can("confirm")));
    const bankLines =
      b?.workflow_managed && b.state === "released"
        ? (
            await client.query(
              `select l.id,l.payment_id,p.reference,l.external_reference as payment_reference,l.document_reference as employee_id,l.amount::text,p.posting_date::text,p.transaction_currency as currency_code from bank_payment_line l join bank_payment p on p.tenant_id=l.tenant_id and p.company_id=l.company_id and p.id=l.payment_id join hr_payroll_payment x on x.tenant_id=l.tenant_id and x.id=l.external_reference and x.employee_id=l.document_reference where l.tenant_id=$1 and l.company_id=$2 and x.batch_id=$3 and x.state='pending' and p.state='posted' and l.nominal_account_id=$4 and p.transaction_currency=$5 and l.amount=x.amount and l.payment_method in('bank_transfer','online','standing_order') and p.posting_date>=$6::date and not exists(select 1 from hr_payroll_payment_settlement s where s.tenant_id=l.tenant_id and s.bank_payment_line_id=l.id) order by p.posting_date,l.id limit 501`,
              [c.tenantId, q.company_id, b.id, j?.source_evidence?.net_account_id, j?.currency_code, j?.posting_date],
            )
          ).rows
        : [];
    const confirmed: bigint = x.rows
      .filter((r) => r.state === "confirmed")
      .reduce((n, r) => n + payrollUnits(r.amount), 0n);
    const history = p
      ? (
          await client.query(
            `select action,reason,actor_id,created_at::text as occurred_at from hr_payroll_workspace_event where tenant_id=$1 and company_id=$2 and record_type='payment' and after_json->>'period_id'=$3 order by created_at desc,id desc limit 100`,
            [c.tenantId, q.company_id, p.id],
          )
        ).rows
      : [];
    return {
      company_id: q.company_id,
      month: q.month,
      source_hash: x.hash,
      currency_code: j?.currency_code ?? null,
      period: p ? { id: p.id, state: p.state, run_number: p.run_number } : null,
      accrual_journal_id: j?.external_journal_id ?? null,
      net_payable_account_id: j?.source_evidence?.net_account_id ?? null,
      batch: b
        ? {
            id: b.id,
            reference: b.reference,
            state: b.state,
            version: b.version,
            workflow_managed: b.workflow_managed,
            created_by: b.created_by,
            approved_by: b.approved_by,
          }
        : null,
      totals: {
        net: payrollDecimal(x.net),
        confirmed: payrollDecimal(confirmed),
        outstanding: payrollDecimal(x.net - confirmed),
        employee_count: x.positive.length,
        zero_net_count: x.results.length - x.positive.length,
      },
      payments: x.rows.map((r) => {
        const employee = x.results.find((e) => e.id === r.result_id);
        return {
          id: r.id,
          result_id: r.result_id,
          employee_id: r.employee_id,
          employee_name: employee?.employee_name ?? r.beneficiary_name ?? r.employee_id,
          employee_number: employee?.employee_number ?? r.employee_id,
          amount: r.amount,
          state: r.state,
          bank_reference: r.bank_reference ?? r.external_reference ?? null,
          confirmed_on: r.confirmed_on ?? null,
          bank_payment_id: r.bank_payment_id ?? null,
          bank_payment_line_id: r.bank_payment_line_id ?? null,
          journal_id: r.journal_id ?? null,
          can_confirm: canConfirm && r.state === "pending",
        };
      }),
      bank_lines: bankLines,
      bank_lines_truncated: bankLines.length > 500,
      blocked: x.blocked,
      allowed_actions: allowed,
      history,
    };
  }
  async action(c: HrActorContext, input: HrPayrollPaymentAction, key: string, corr: string) {
    return this.writes.runWrite(
      c,
      input.company_id,
      permission[input.action],
      key,
      corr,
      "/api/v1/hr/payroll_payments/actions",
      input,
      async (client) => {
        const x = await this.context(client, c, input, true),
          { p, j, b } = x;
        if (x.hash !== input.source_hash || (b?.version ?? 0) !== input.expected_version)
          fail("Payment evidence changed. Refresh and review the batch again.");
        if (input.action !== "reject" && x.blocked.length) fail(x.blocked.join(" "));
        if (!p || !j) fail("A posted governed Payroll accrual is required.");
        let id = b?.id ?? "",
          status = "",
          version = (b?.version ?? 0) + 1;
        if (input.action === "prepare") {
          if (p!.state !== "posted" || (b && b.state !== "cancelled")) fail("An active payment batch already exists.");
          id = "salary-batch-" + randomUUID();
          status = "draft";
          version = 1;
          await client.query(
            `insert into hr_payroll_payment_batch(id,tenant_id,company_id,period_id,reference,state,created_by,workflow_managed,version,payment_mode,accrual_proposal_id,net_payable_account_id,currency_code,payroll_run_number,payroll_result_count,payroll_result_hash,validation_hash) values($1,$2,$3,$4,$1,'draft',$5,true,1,'posted_bank_reconciliation_v1',$6,$7,$8,$9,$10,$11,$11)`,
            [
              id,
              c.tenantId,
              input.company_id,
              p!.id,
              c.actor.userId,
              j!.id,
              j!.source_evidence.net_account_id,
              j!.currency_code,
              p!.run_number,
              x.positive.length,
              x.resultsHash,
            ],
          );
          for (const r of x.positive)
            await client.query(
              `insert into hr_payroll_payment(id,tenant_id,batch_id,result_id,employee_id,amount,currency_code,beneficiary_name,payroll_result_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [
                "SAL-" + randomUUID(),
                c.tenantId,
                id,
                r.id,
                r.employee_id,
                r.net,
                r.currency_code,
                r.employee_name,
                r.calculation_hash,
              ],
            );
        } else {
          if (!b?.workflow_managed) fail("Historical batches are read-only.");
          await this.independent(client, c, p!, b!);
          if (input.action === "approve" || input.action === "reject") {
            if (b!.state !== "draft" || p!.state !== "posted") fail("Only an unpaid draft batch can be reviewed.");
            status = input.action === "approve" ? "released" : "cancelled";
            if (input.action === "approve")
              await client.query(
                `update hr_payroll_payment_batch set state='released',version=version+1,approved_by=$3,approved_at=clock_timestamp(),released_by=$3,released_at=clock_timestamp() where tenant_id=$1 and id=$2`,
                [c.tenantId, id, c.actor.userId],
              );
            else {
              await client.query(`update hr_payroll_payment set state='cancelled' where tenant_id=$1 and batch_id=$2`, [
                c.tenantId,
                id,
              ]);
              await client.query(
                `update hr_payroll_payment_batch set state='cancelled',version=version+1,cancelled_by=$3,cancelled_at=clock_timestamp() where tenant_id=$1 and id=$2`,
                [c.tenantId, id, c.actor.userId],
              );
            }
          } else if (input.action === "confirm") {
            if (b!.state !== "released" || p!.state !== "posted")
              fail("Independently approve the batch before confirming a bank payment.");
            const payment = x.rows.find((r) => r.id === input.payment_id && r.state === "pending");
            if (!payment) fail("Select an outstanding salary payment in this batch.");
            const proof = await this.settlement(client, c, input, p!, j!, b!, payment!);
            await client.query(
              `insert into hr_payroll_payment_settlement(tenant_id,payment_id,company_id,batch_id,result_id,employee_id,bank_payment_id,bank_payment_line_id,journal_id,accounting_event_id,amount,currency_code,bank_reference,confirmed_on,confirmed_by,evidence_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
              [
                c.tenantId,
                payment!.id,
                input.company_id,
                id,
                payment!.result_id,
                payment!.employee_id,
                proof.id,
                proof.line_id,
                proof.original_journal_entry_id,
                proof.original_accounting_event_id,
                payment!.amount,
                j!.currency_code,
                input.bank_reference,
                input.confirmed_on,
                c.actor.userId,
                attendanceHash({
                  payment_id: payment!.id,
                  line_id: proof.line_id,
                  journal_id: proof.original_journal_entry_id,
                  amount: payment!.amount,
                  reference: input.bank_reference,
                  date: input.confirmed_on,
                  actor: c.actor.userId,
                }),
              ],
            );
            await client.query(
              `update hr_payroll_payment set state='confirmed',external_reference=$3,confirmed_at=clock_timestamp() where tenant_id=$1 and id=$2`,
              [c.tenantId, payment!.id, input.bank_reference],
            );
            const left = (
              await client.query(
                `select 1 from hr_payroll_payment where tenant_id=$1 and batch_id=$2 and state<>'confirmed' limit 1`,
                [c.tenantId, id],
              )
            ).rowCount;
            status = left ? "released" : "confirmed";
            await client.query(
              `update hr_payroll_payment_batch set state=$3,version=version+1,confirmed_by=case when $3='confirmed' then $4 else confirmed_by end,confirmed_at=case when $3='confirmed' then clock_timestamp() else confirmed_at end where tenant_id=$1 and id=$2`,
              [c.tenantId, id, status, c.actor.userId],
            );
            if (!left)
              await client.query(
                `update hr_payroll_period set state='paid',version=version+1,paid_by=$4,paid_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
                [c.tenantId, input.company_id, p!.id, c.actor.userId],
              );
          }
        }
        const after = await this.readIn(client, c, input);
        return {
          id,
          status,
          version,
          kind: "payment",
          before: { batch: b ?? null },
          after: { ...after, period_id: p!.id },
        };
      },
      (client) => this.authorize(client, c, input.company_id, permission[input.action]),
    );
  }
  private async settlement(
    client: PoolClient,
    c: HrActorContext,
    input: Extract<HrPayrollPaymentAction, { action: "confirm" }>,
    p: Row,
    j: Row,
    b: Row,
    payment: Row,
  ) {
    const bank = (
      await client.query(
        `select p.*,p.posting_date::text,l.id as line_id,l.line_number,l.external_reference,l.document_reference,l.nominal_account_id,l.payment_method,l.amount::text as line_amount,e.status as journal_status,e.posting_date::text as journal_date,e.source_id as journal_event_id from bank_payment p join bank_payment_line l on l.tenant_id=p.tenant_id and l.company_id=p.company_id and l.payment_id=p.id join journal_entry e on e.tenant_id=p.tenant_id and e.company_id=p.company_id and e.id=p.original_journal_entry_id where l.tenant_id=$1 and l.company_id=$2 and l.id=$3 for update of p,e`,
        [c.tenantId, input.company_id, input.bank_payment_line_id],
      )
    ).rows[0];
    if (
      !bank ||
      bank.state !== "posted" ||
      bank.journal_status !== "posted" ||
      bank.journal_event_id !== bank.original_accounting_event_id
    )
      fail("Select an actual posted, unreversed Bank Payment with its Finance journal.");
    if (
      bank.external_reference !== payment.id ||
      bank.document_reference !== payment.employee_id ||
      bank.nominal_account_id !== b.net_payable_account_id ||
      bank.transaction_currency !== j.currency_code ||
      ExactPayrollAmount.parse(bank.line_amount).compare(ExactPayrollAmount.parse(payment.amount)) !== 0 ||
      !["bank_transfer", "online", "standing_order"].includes(bank.payment_method)
    )
      fail(
        "The posted bank line must match the salary payment reference, employee ID, net payable account, exact net amount and currency.",
      );
    if (
      bank.approval_override_event_id ||
      !bank.approved_by ||
      !bank.posted_by ||
      new Set([bank.created_by, bank.approved_by, bank.posted_by]).size !== 3
    )
      fail("Salary payments require distinct Banking maker, approver and poster without approval overrides.");
    const self = await client.query(
      `select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2 and user_id=any($3::text[]) and ended_at is null`,
      [c.tenantId, payment.employee_id, [bank.created_by, bank.submitted_by, bank.approved_by, bank.posted_by]],
    );
    if (self.rowCount) deny("A beneficiary cannot make, approve or post their own salary payment.");
    const dates = (
      await client.query(
        `select $1::date>=greatest($2::date,$3::date) and $1::date<=current_date and $2::date>=$3::date and $2::date>= $4::date as valid`,
        [input.confirmed_on, bank.posting_date, j.posting_date, p.month],
      )
    ).rows[0];
    if (!dates.valid)
      fail("Confirmation must follow the posted salary payment and accrual, and cannot be in the future.");
    if (
      (
        await client.query(
          `select 1 from hr_loan_disbursement where tenant_id=$1 and bank_payment_line_id=$2 union all select 1 from hr_payroll_payment_settlement where tenant_id=$1 and bank_payment_line_id=$2`,
          [c.tenantId, bank.line_id],
        )
      ).rowCount
    )
      fail("This bank line is already allocated to another obligation.");
    // Until governed FX carrying-value allocation exists, only exact parity settles the original liability.
    const actual = (
      await client.query(
        `select account_id,debit::text,credit::text,base_debit::text,base_credit::text,currency,fx_rate::text from journal_line where tenant_id=$1 and journal_id=$2 and line_number=$3`,
        [
          c.tenantId,
          bank.original_journal_entry_id,
          (
            await client.query(
              `select count(*)::int as n from bank_payment_line where tenant_id=$1 and company_id=$2 and payment_id=$3 and line_number<=$4`,
              [c.tenantId, input.company_id, bank.id, bank.line_number],
            )
          ).rows[0].n,
        ],
      )
    ).rows[0];
    const equal = (a: string, z: string) => ExactPayrollAmount.parse(a).compare(ExactPayrollAmount.parse(z)) === 0;
    // Numeric SQL equality avoids binary floating-point and accepts Finance's eight-decimal storage.
    const parity = (
      await client.query(
        `select $1::numeric=$2::numeric and $3::numeric=1 and $4::numeric=1 and $5::numeric=$2::numeric as ok`,
        [actual?.base_debit ?? "-1", payment.amount, bank.exchange_rate_value, j.exchange_rate, actual?.debit ?? "-1"],
      )
    ).rows[0]?.ok;
    if (
      !actual ||
      actual.account_id !== b.net_payable_account_id ||
      actual.currency !== j.currency_code ||
      !equal(actual.credit, "0.00000000") ||
      !equal(actual.base_credit, "0.00000000") ||
      !parity ||
      bank.base_currency !== j.base_currency
    )
      fail(
        "The actual journal must clear the exact net payable at the accrual carrying value. Foreign-exchange settlement needs a governed allocation first.",
      );
    if (
      !(
        await client.query(
          "select 1 from hr_payroll_bank_allocation where tenant_id=$1 and payment_id=$2 and bank_payment_line_id=$3 and state='posted'",
          [c.tenantId, payment.id, bank.line_id],
        )
      ).rowCount
    ) {
      const candidates = (
        await client.query(
          `select count(*)::int as n from bank_payment_line l join bank_payment p on p.tenant_id=l.tenant_id and p.company_id=l.company_id and p.id=l.payment_id where l.tenant_id=$1 and l.company_id=$2 and l.external_reference=$3 and p.state='posted'`,
          [c.tenantId, input.company_id, payment.id],
        )
      ).rows[0];
      if (candidates.n !== 1)
        fail("Multiple historical posted candidates require a governed Banking correction before salary confirmation.");
      await client.query(
        `insert into hr_payroll_bank_allocation(tenant_id,payment_id,company_id,bank_payment_id,bank_payment_line_id,journal_id,state) values($1,$2,$3,$4,$5,$6,'posted')`,
        [c.tenantId, payment.id, input.company_id, bank.id, bank.line_id, bank.original_journal_entry_id],
      );
    }
    return bank;
  }
}
