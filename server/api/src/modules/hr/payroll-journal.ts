import { resolvePayrollJournalDimensions, type PayrollJournalMapping } from "./payroll-journal-dimensions.js";
import { ExactPayrollAmount } from "./payroll-calculation.js";
import { convertFinanceAmountToBase, parseFinanceDecimal } from "../finance/posting/service.js";
import { SourceFinancePostingRepository } from "../finance/posting/source-repository.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { HrPayrollJournalQuery, HrPayrollJournalAction, HrPayrollJournalWorkspace } from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import {
  PayrollWorkspace,
  payrollUnits,
  payrollDecimal,
  type PayrollWorkspaceDependencies,
} from "./payroll-workspace.js";
import { attendanceHash } from "./attendance-completion.js";
import {
  FinancePostingService,
  FinancePostingError,
  createFinanceTransactionClient,
} from "../finance/posting/index.js";
import {
  CompanyCurrencyAuthorityError,
  resolveCompanyBaseCurrency,
} from "../finance/currencies/company-authority.js";
import { requireBankPaymentCompanyPermission } from "../banking/payments/source-repository.js";
import { BankingApiError } from "../banking/source-repository.js";
import type { StatutoryExecutionMode } from "./payroll-statutory.js";

// PostgreSQL query values are reconciled against immutable Payroll rows before use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const conflict = (message: string): never => {
  throw new HrApiError(409, "HR_PAYROLL_JOURNAL_REVIEW_REQUIRED", message);
};
const denied = (message = "The required Payroll/Finance permission is missing."): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
const actionPermission = {
  prepare: "finance.journal.create",
  accept: "workflow.approval.approve",
  reject: "workflow.approval.reject",
  post: "finance.journal.post",
} as const;

/** Pure, exact accrual assembly; deductions credit liabilities or the verified loan receivable. */
export function assemblePayrollAccrual(results: Row[], items: Row[], netAccount: string) {
  const grouped = new Map<string, { account_id: string; debit: string; credit: string }>();
  const add = (account: unknown, amount: string, side: "debit" | "credit") => {
    const value = payrollUnits(amount);
    if (!value) return;
    if (typeof account !== "string" || !account)
      conflict("Every nonzero result requires its retained posting account.");
    const key = String(account) + ":" + side,
      old = grouped.get(key),
      total = payrollUnits(old?.[side] ?? "0") + value;
    const formatted = payrollDecimal(total);
    payrollUnits(formatted);
    grouped.set(key, {
      account_id: String(account),
      debit: side === "debit" ? formatted : "0.0000",
      credit: side === "credit" ? formatted : "0.0000",
    });
  };
  for (const result of results) {
    const lines = items.filter((i) => i.result_id === result.id);
    let gross = 0n,
      deductions = 0n,
      employer = 0n;
    for (const line of lines) {
      if (line.kind === "earning") {
        gross += payrollUnits(line.amount);
        add(line.expense_account_id, line.amount, "debit");
      } else if (line.kind === "deduction") {
        deductions += payrollUnits(line.amount);
        add(line.liability_account_id, line.amount, "credit");
      } else if (line.kind === "employer_contribution") {
        employer += payrollUnits(line.amount);
        add(line.expense_account_id, line.amount, "debit");
        add(line.liability_account_id, line.amount, "credit");
      } else conflict("An unsupported result line cannot enter the Payroll journal.");
    }
    if (
      gross !== payrollUnits(result.gross) ||
      deductions !== payrollUnits(result.deductions) ||
      employer !== payrollUnits(result.employer_contributions) ||
      gross - deductions !== payrollUnits(result.net)
    )
      conflict("Immutable employee totals and their result lines do not reconcile.");
    add(netAccount, result.net, "credit");
  }
  const lines = [...grouped.values()].sort(
    (a, b) => a.account_id.localeCompare(b.account_id) || a.debit.localeCompare(b.debit),
  );
  if (lines.length < 2 || lines.length > 1000)
    conflict("An accrual needs 2–1000 nonzero account lines; larger journals require worker execution.");
  const debit = lines.reduce((s, l) => s + payrollUnits(l.debit), 0n),
    credit = lines.reduce((s, l) => s + payrollUnits(l.credit), 0n);
  if (debit !== credit) conflict("Payroll accrual debits and credits do not balance exactly.");
  return { lines, debit: payrollDecimal(debit), credit: payrollDecimal(credit) };
}
export class PayrollJournal {
  private readonly writes: PayrollWorkspace;
  private readonly finance = new FinancePostingService();
  private readonly authority = new SourceFinancePostingRepository();
  constructor(
    private readonly d: PayrollWorkspaceDependencies,
    private readonly mode: StatutoryExecutionMode = "production",
  ) {
    this.writes = new PayrollWorkspace(d);
  }
  private async authorize(client: PoolClient, c: HrActorContext, company: string, permission = "finance.journal.read") {
    for (const p of ["hr.payroll.report.read", "hr.payroll.result.read", "finance.journal.read", permission])
      if (!c.actor.permissions.includes(p)) denied();
    for (const p of new Set(["finance.journal.read", permission])) {
      try {
        await requireBankPaymentCompanyPermission(client, c, p, company);
      } catch (error) {
        if (error instanceof BankingApiError && error.status === 403)
          denied("Company-scoped Finance authority is required for this Payroll journal.");
        throw error;
      }
    }
  }
  private async independent(client: PoolClient, c: HrActorContext, p: Row, j: Row, post = false) {
    const beneficiaries = (
      await client.query(
        `select distinct b.user_id from employee_user_binding b join hr_payroll_result r on r.tenant_id=b.tenant_id and r.employee_id=b.employee_id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 and b.ended_at is null`,
        [c.tenantId, p.company_id, p.id, p.run_number],
      )
    ).rows.map((r) => r.user_id);
    const makers = [
      p.created_by,
      p.calculated_by,
      p.submitted_by,
      j.created_by,
      ...beneficiaries,
      ...(post ? [j.accepted_by, p.approved_by] : []),
    ];
    if (makers.includes(c.actor.userId))
      denied(
        post
          ? "A separate Finance officer must post this accepted journal. Maker, reviewer and employee self-posting cannot be overridden."
          : "An independent officer must review the Payroll journal. Maker and employee self-review cannot be overridden.",
      );
  }
  async workspace(c: HrActorContext, q: HrPayrollJournalQuery): Promise<HrPayrollJournalWorkspace> {
    return this.d.read(c, "hr.payroll.report.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      await this.authorize(client, c, q.company_id);
      return this.readIn(client, c, q);
    });
  }
  private async context(
    client: PoolClient,
    c: HrActorContext,
    q: HrPayrollJournalQuery,
    lock = false,
    mappings?: PayrollJournalMapping[],
  ) {
    const p = (
      await client.query(
        `select p.*,p.month::text,p.approved_at::text,pol.currency_code,pol.money_scale,pol.net_payable_account_id from hr_payroll_period p join hr_payroll_policy pol on pol.tenant_id=p.tenant_id and pol.company_id=p.company_id and pol.id=p.policy_id where p.tenant_id=$1 and p.company_id=$2 and p.month=$3::date`,
        [c.tenantId, q.company_id, q.month],
      )
    ).rows[0] as Row | undefined;
    const proposal = p
      ? ((
          await client.query(
            `select j.*,j.posting_date::text,j.exchange_rate::text,j.created_at::text,j.accepted_at::text,j.rejected_at::text,j.posted_at::text from hr_payroll_journal_proposal j where tenant_id=$1 and company_id=$2 and period_id=$3 order by j.revision desc,j.created_at desc,j.id desc limit 1`,
            [c.tenantId, q.company_id, p.id],
          )
        ).rows[0] as Row | undefined)
      : undefined;
    const today = (
      await client.query(
        `select current_date::text as today,least(current_date,($1::date+interval '1 month - 1 day')::date)::text as posting_date`,
        [q.month],
      )
    ).rows[0];
    const postingDate =
      proposal?.posting_date && proposal.state !== "rejected"
        ? proposal.posting_date
        : (q.posting_date ?? today.posting_date);
    const results = p
      ? (
          await client.query(
            `select r.id,r.employee_id,r.currency_code,r.gross::text,r.deductions::text,r.net::text,r.employer_contributions::text,r.calculation_hash,r.warnings,s.state as snapshot_state,s.calculation_engine_version,s.context_segments_json from hr_payroll_result r left join hr_payroll_statutory_snapshot s on s.tenant_id=r.tenant_id and s.company_id=r.company_id and s.payroll_result_id=r.id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 order by r.id collate "C" limit 501`,
            [c.tenantId, q.company_id, p.id, p.run_number],
          )
        ).rows
      : [];
    const items = p
      ? (
          await client.query(
            `select i.*,i.amount::text from hr_payroll_result_item i join hr_payroll_result r on r.tenant_id=i.tenant_id and r.id=i.result_id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 order by i.result_id collate "C",i.position limit 10001`,
            [c.tenantId, q.company_id, p.id, p.run_number],
          )
        ).rows
      : [];
    const blocked: string[] = [];
    let assembly: {
      lines: { account_id: string; debit: string; credit: string; dimensions?: Record<string, string> }[];
      debit: string;
      credit: string;
    } = {
      lines: [],
      debit: "0.0000",
      credit: "0.0000",
    };
    if (
      !p ||
      !p.workflow_managed ||
      !["approved", "posting_ready", "posted"].includes(p.state) ||
      !p.approved_by ||
      !p.review_hash
    )
      blocked.push("Independently approve the governed Payroll run before preparing its accrual.");
    if (proposal && !proposal.workflow_managed)
      blocked.push("This historical journal preserves its original accounting evidence and remains read-only.");
    if (!results.length || results.length > 500 || items.length > 10000)
      blocked.push("Journal preparation supports 1–500 approved employee results and up to 10000 source items.");
    if (
      results.some(
        (r) =>
          r.currency_code !== p?.currency_code ||
          r.warnings.length ||
          r.snapshot_state !== "sealed" ||
          r.calculation_engine_version !== (this.mode === "test" ? "statutory_rules_v1_test" : "statutory_rules_v1") ||
          !r.context_segments_json?.some((segment: Row) => segment.base_calculation_hash === r.calculation_hash),
      )
    )
      blocked.push("Every result requires matching sealed statutory execution and no unresolved calculation warnings.");
    if (p && p.state !== "posted") {
      const count = (
        await client.query(
          `select count(*)::int as n from hr_payroll_input where tenant_id=$1 and company_id=$2 and period_id=$3`,
          [c.tenantId, q.company_id, p.attendance_period_id],
        )
      ).rows[0].n;
      if (count !== results.length)
        blocked.push("The journal must include every frozen attendance employee exactly once.");
    }
    if (p && results.length && results.length <= 500 && items.length <= 10000)
      try {
        assembly = assemblePayrollAccrual(results, items, p.net_payable_account_id);
      } catch (error) {
        if (error instanceof HrApiError) blocked.push(error.message);
        else throw error;
      }
    if (
      p &&
      assembly.lines.some((line) =>
        [line.debit, line.credit].some(
          (value) =>
            ExactPayrollAmount.parse(value).compare(
              ExactPayrollAmount.parse(ExactPayrollAmount.parse(value).decimal(Number(p.money_scale))),
            ) !== 0,
        ),
      )
    )
      blocked.push("Accrual source amounts exceed the approved Finance currency precision.");
    const accountIds = assembly.lines.map((l) => l.account_id),
      accounts = (
        await client.query(
          `select id,code,name,type,status,is_header,manual_posting_allowed,required_dimensions from account where tenant_id=$1 and company_id=$2 and id=any($3::text[]) order by id collate "C"${lock ? " for share" : ""}`,
          [c.tenantId, q.company_id, accountIds],
        )
      ).rows;
    for (const account of accounts)
      if (account.status !== "active" || account.is_header)
        blocked.push("An accrual account is inactive or not postable: " + account.code);

    const dimensioned = await resolvePayrollJournalDimensions(
      client,
      c.tenantId,
      q.company_id,
      assembly.lines,
      accounts,
      mappings ??
        (proposal && proposal.state !== "rejected" ? (proposal.source_evidence?.cost_center_mappings ?? []) : []),
      mappings !== undefined || Boolean(proposal && proposal.state !== "rejected"),
      lock,
    );
    assembly.lines = dimensioned.lines;
    blocked.push(...dimensioned.blocked);
    if (accounts.length !== new Set(accountIds).size)
      blocked.push("An accrual account is missing from the authorized company.");
    for (const item of items.filter((i) => payrollUnits(i.amount) > 0n))
      for (const [id, type] of [
        [item.expense_account_id, "expense"],
        [item.liability_account_id, item.source.startsWith("loan:") ? "asset" : "liability"],
      ])
        if (id && accounts.find((a) => a.id === id)?.type !== type)
          blocked.push(
            "A retained Payroll account no longer has its approved expense, liability or loan-receivable role.",
          );
    if (
      p &&
      accounts.find((a) => a.id === p.net_payable_account_id)?.type !== "liability" &&
      results.some((r) => payrollUnits(r.net) > 0n)
    )
      blocked.push("Net pay requires its configured liability account.");
    const loanFunding: Row[] = [];
    if (p)
      for (const item of items.filter((i) => i.source.startsWith("loan:"))) {
        const loan = (
          await client.query(
            `select d.amount::text as principal,e.payload->'resolved'->>'base_currency' as funding_base_currency,jl.base_debit::text,jl.currency from hr_loan_instalment i join hr_employee_loan l on l.tenant_id=i.tenant_id and l.id=i.loan_id join hr_loan_disbursement d on d.tenant_id=l.tenant_id and d.company_id=l.company_id and d.loan_id=l.id join accounting_event e on e.tenant_id=d.tenant_id and e.id=d.accounting_event_id join bank_payment_line bpl on bpl.tenant_id=d.tenant_id and bpl.id=d.bank_payment_line_id and bpl.company_id=d.company_id join journal_line jl on jl.tenant_id=d.tenant_id and jl.journal_id=d.journal_id and jl.line_number=bpl.line_number and jl.account_id=d.receivable_account_id where i.tenant_id=$1 and l.company_id=$2 and i.id=$3 and i.state='consumed' and i.consumed_result_id=$4 and i.amount=$5::numeric and d.receivable_account_id=$6 and l.employee_id=$7 and l.component_id=$8 and i.due_month=$9::date`,
            [
              c.tenantId,
              q.company_id,
              item.source.slice(5),
              item.result_id,
              item.amount,
              item.liability_account_id,
              results.find((r) => r.id === item.result_id)?.employee_id,
              item.component_id,
              q.month,
            ],
          )
        ).rows[0];
        if (loan) loanFunding.push({ ...loan, amount: item.amount });
        if (!loan) blocked.push("A loan recovery is not linked to its exact approved deduction and funded receivable.");
      }
    const financeClient = await createFinanceTransactionClient(client);
    let base: { code: string; decimal_places: number } | null = null;
    let rate: { id: string | null; rate: string } | null = null;
    try {
      if (p) {
        const currency = await this.authority.resolveCompanyCurrency(financeClient, {
          tenantId: c.tenantId,
          companyId: q.company_id,
          sourceCurrency: p.currency_code,
          effectiveOnOrBefore: postingDate,
          lock,
        });
        base = { code: currency.baseCurrency, decimal_places: currency.baseDecimalPlaces };
        rate = { id: currency.rateId, rate: currency.rateValue };
        if (currency.sourceDecimalPlaces !== p.money_scale)
          blocked.push("The approved Payroll currency precision changed in Finance.");
      } else {
        const companyBase = await resolveCompanyBaseCurrency(financeClient, c.tenantId, q.company_id, lock);
        base = { code: companyBase.code, decimal_places: companyBase.decimalPlaces };
      }
    } catch (error) {
      if (error instanceof CompanyCurrencyAuthorityError) blocked.push(error.message);
      else throw error;
    }
    if (
      base &&
      rate &&
      loanFunding.some((funding) => !hasExactLoanCurrencyParity(funding, base.code, base.decimal_places, rate.rate))
    )
      blocked.push(
        "Loan recovery requires exact funding/recovery currency parity. Non-parity foreign-currency loans need a governed carrying-value and FX allocation workflow before posting.",
      );
    if (base && rate && assembly.lines.length) {
      const parsedRate = parseFinanceDecimal(rate.rate, { fractionalDigits: 18, integerDigits: 20, allowZero: false });
      const converted = (side: "debit" | "credit") =>
        assembly.lines.reduce(
          (sum, line) =>
            sum +
            convertFinanceAmountToBase(
              parseFinanceDecimal(line[side], { fractionalDigits: 8, integerDigits: 30, allowZero: true }).scaled,
              parsedRate.scaled,
              base.decimal_places,
            ),
          0n,
        );
      if (converted("debit") !== converted("credit"))
        blocked.push(
          "Finance base-currency rounding does not balance. A governed allocation correction is required; no rounding adjustment is invented.",
        );
    }
    const periods = await this.authority.loadPeriods(financeClient, c.tenantId, q.company_id, postingDate, lock);
    if (periods.length !== 1 || periods[0]?.status !== "open")
      blocked.push("The posting date must belong to exactly one open Finance period.");
    if (postingDate.slice(0, 7) !== q.month.slice(0, 7) || postingDate > today.today)
      blocked.push("Choose a posting date within this Payroll month and no later than today.");
    const sourceEvidence = {
      assembly_version: dimensioned.mappings.length ? "payroll_accrual_cost_centres_v1" : "payroll_accrual_v1",
      ...(dimensioned.mappings.length
        ? { cost_center_mappings: dimensioned.mappings, cost_center_authority: dimensioned.authority }
        : {}),
      run_number: p?.run_number ?? 0,
      payroll_review_hash: p?.review_hash ?? null,
      results: results.map((r) => ({ id: r.id, employee_id: r.employee_id, calculation_hash: r.calculation_hash })),
      source_items_hash: attendanceHash(items),
      net_account_id: p?.net_payable_account_id ?? null,
    };
    const sourceResultsHash = attendanceHash({
      sourceEvidence,
      lines: assembly.lines,
      currency: p?.currency_code ?? null,
    });
    const savedLines = proposal
      ? (
          await client.query(
            `select account_id,debit::text,credit::text,dimensions from hr_payroll_journal_line where tenant_id=$1 and proposal_id=$2 order by position`,
            [c.tenantId, proposal.id],
          )
        ).rows
      : [];
    if (proposal && proposal.state !== "rejected" && proposal.workflow_managed) {
      if (
        proposal.source_results_hash !== sourceResultsHash ||
        attendanceHash(
          savedLines.map(({ dimensions, ...l }) => (Object.keys(dimensions ?? {}).length ? { ...l, dimensions } : l)),
        ) !== attendanceHash(assembly.lines)
      )
        blocked.push(
          "The retained proposal differs from approved Payroll sources; reject it for a new reviewed revision.",
        );
      if (
        proposal.base_currency !== base?.code ||
        proposal.exchange_rate_id !== rate?.id ||
        proposal.exchange_rate !== rate?.rate
      )
        blocked.push("Finance currency/rate authority changed after preparation; reject for a new reviewed proposal.");
    }
    const lines = assembly.lines.map((l) => {
      const a = accounts.find((a) => a.id === l.account_id);
      const retainedCentre =
        proposal?.state !== "rejected"
          ? proposal?.source_evidence?.cost_center_authority?.find((cc: Row) => cc.id === l.dimensions?.cost_center)
          : null;
      return {
        ...l,
        account_code: a?.code ?? "Missing",
        account_name: a?.name ?? "Unavailable account",
        account_type: a?.type ?? "unknown",
        dimensions: l.dimensions ?? {},
        cost_center_label: retainedCentre
          ? retainedCentre.code + " · " + retainedCentre.name
          : Object.hasOwn(dimensioned.labels, l.dimensions?.cost_center ?? "")
            ? (dimensioned.labels[l.dimensions?.cost_center ?? ""] ?? null)
            : null,
      };
    });
    const hash = attendanceHash({
      period: p ?? null,
      proposal: proposal ?? null,
      sourceResultsHash,
      postingDate,
      accounts,
      base,
      rate,
      periods,
      savedLines,
      blocked,
    });
    return {
      p,
      proposal,
      postingDate,
      results,
      assembly,
      lines,
      sourceEvidence,
      dimensionRequirements: accounts
        .filter((a) => a.required_dimensions?.length)
        .map((a) => ({
          account_id: a.id,
          account_code: a.code,
          required_dimensions: Array.isArray(a.required_dimensions)
            ? a.required_dimensions.filter((d: unknown) => typeof d === "string")
            : [],
        })),
      sourceResultsHash,
      base,
      rate,
      blocked: [...new Set(blocked)],
      hash,
    };
  }
  private async readIn(
    client: PoolClient,
    c: HrActorContext,
    q: HrPayrollJournalQuery,
  ): Promise<HrPayrollJournalWorkspace> {
    const x = await this.context(client, c, q),
      { p, proposal: j } = x;
    const allowed: HrPayrollJournalAction["action"][] = [];
    const can = async (action: HrPayrollJournalAction["action"]) => {
      try {
        await this.authorize(client, c, q.company_id, actionPermission[action]);
        if (action !== "prepare") await this.independent(client, c, p!, j!, action === "post");
        return true;
      } catch (error) {
        if (error instanceof HrApiError && error.status === 403) return false;
        throw error;
      }
    };
    if (!x.blocked.length && p?.state === "approved" && (!j || j.state === "rejected") && (await can("prepare")))
      allowed.push("prepare");
    if (j?.workflow_managed && ["prepared", "accepted"].includes(j.state) && (await can("reject")))
      allowed.push("reject");
    if (!x.blocked.length && j?.workflow_managed && j.state === "prepared" && (await can("accept")))
      allowed.push("accept");
    if (!x.blocked.length && j?.workflow_managed && j.state === "accepted" && (await can("post"))) allowed.push("post");
    const history = p
      ? (
          await client.query(
            `select action,reason,actor_id,created_at::text as occurred_at from hr_payroll_workspace_event where tenant_id=$1 and company_id=$2 and record_type='journal' and after_json->>'period_id'=$3 order by created_at desc,id desc limit 100`,
            [c.tenantId, q.company_id, p.id],
          )
        ).rows
      : [];
    if (j && !j.workflow_managed) {
      const historical = (
        await client.query(
          "select l.account_id,a.code as account_code,a.name as account_name,a.type as account_type,l.debit::text,l.credit::text,l.dimensions,null::text as cost_center_label from hr_payroll_journal_line l join account a on a.tenant_id=l.tenant_id and a.company_id=$3 and a.id=l.account_id where l.tenant_id=$1 and l.proposal_id=$2 order by l.position limit 1001",
          [c.tenantId, j.id, q.company_id],
        )
      ).rows;
      if (historical.length > 1000)
        x.blocked.push(
          "Historical journal display is bounded to 1000 lines; inspect the original Finance entry for the complete journal.",
        );
      x.lines = historical.slice(0, 1000);
      const sums = (
        await client.query(
          "select coalesce(sum(debit),0)::text as debit,coalesce(sum(credit),0)::text as credit from hr_payroll_journal_line where tenant_id=$1 and proposal_id=$2",
          [c.tenantId, j.id],
        )
      ).rows[0];
      x.assembly.debit = sums.debit;
      x.assembly.credit = sums.credit;
    }
    const centres = (
      await client.query(
        "select id,code,name from hr_master_record where tenant_id=$1 and company_id=$2 and master_type='cost_center' and status='active' and ($3='' or code ilike $4 escape '!' or name ilike $4 escape '!') order by code collate \"C\",id collate \"C\" limit 501",
        [
          c.tenantId,
          q.company_id,
          q.cost_center_search ?? "",
          "%" + (q.cost_center_search ?? "").replace(/[!%_]/g, (v) => "!" + v) + "%",
        ],
      )
    ).rows;
    return {
      cost_centres: centres.slice(0, 500),
      cost_centres_truncated: centres.length > 500,
      dimension_requirements: x.dimensionRequirements,
      company_id: q.company_id,
      month: q.month,
      posting_date: x.postingDate,
      source_hash: x.hash,
      period: p ? { id: p.id, state: p.state, run_number: p.run_number, version: p.version } : null,
      proposal: j
        ? {
            id: j.id,
            state: j.state,
            version: j.version,
            revision: j.revision,
            workflow_managed: j.workflow_managed,
            created_by: j.created_by,
            accepted_by: j.accepted_by,
            rejected_by: j.rejected_by,
            posted_by: j.posted_by,
            external_journal_id: j.external_journal_id,
            external_entry_number: j.external_entry_number,
            accounting_event_id: j.accounting_event_id,
            source_results_hash: j.source_results_hash ?? "",
            source_evidence: j.source_evidence ?? {},
          }
        : null,
      currency_code: p?.currency_code ?? null,
      base_currency: j?.base_currency ?? x.base?.code ?? null,
      exchange_rate_id: j?.exchange_rate_id ?? x.rate?.id ?? null,
      exchange_rate: j?.exchange_rate ?? x.rate?.rate ?? null,
      totals: {
        debit: x.assembly.debit,
        credit: x.assembly.credit,
        net: payrollDecimal(x.results.reduce((sum, r) => sum + payrollUnits(r.net), 0n)),
        employer_contributions: payrollDecimal(
          x.results.reduce((sum, r) => sum + payrollUnits(r.employer_contributions), 0n),
        ),
        employee_count: x.results.length,
      },
      lines: x.lines,
      blocked: x.blocked,
      allowed_actions: allowed,
      history,
    };
  }
  async action(c: HrActorContext, input: HrPayrollJournalAction, key: string, corr: string) {
    return this.writes.runWrite(
      c,
      input.company_id,
      actionPermission[input.action],
      key,
      corr,
      "/api/v1/hr/payroll_journal/actions",
      input,
      async (client) => {
        let x = await this.context(client, c, input, true);
        const p = x.p,
          j = x.proposal;
        if (
          x.hash !== input.source_hash ||
          (j?.version ?? 0) !== input.expected_version ||
          input.posting_date !== x.postingDate
        )
          conflict("Payroll/Finance evidence changed. Refresh and review the journal again.");
        if (input.action === "prepare")
          x = await this.context(client, c, input, true, input.cost_center_mappings ?? []);
        if (input.action !== "reject" && x.blocked.length) conflict(x.blocked.join(" "));
        if (!p) conflict("An approved Payroll period is required.");
        let id = j?.id ?? "",
          status = "",
          version = 0;
        if (input.action === "prepare") {
          if (p!.state !== "approved" || (j && j.state !== "rejected"))
            conflict("Reject the current proposal before preparing a successor.");
          id = "payroll-accrual-" + randomUUID();
          status = "prepared";
          version = 1;
          await client.query(
            `insert into hr_payroll_journal_proposal(id,tenant_id,company_id,period_id,state,created_by,workflow_managed,revision,run_number,posting_date,currency_code,base_currency,exchange_rate_id,exchange_rate,source_results_hash,source_evidence) values($1,$2,$3,$4,'prepared',$5,true,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
            [
              id,
              c.tenantId,
              input.company_id,
              p!.id,
              c.actor.userId,
              (j?.revision ?? 0) + 1,
              p!.run_number,
              x.postingDate,
              p!.currency_code,
              x.base!.code,
              x.rate!.id,
              x.rate!.rate,
              x.sourceResultsHash,
              JSON.stringify(x.sourceEvidence),
            ],
          );
          for (const [i, line] of x.assembly.lines.entries())
            await client.query(
              `insert into hr_payroll_journal_line(id,tenant_id,proposal_id,account_id,debit,credit,position,dimensions) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
              [
                "payroll-accrual-line-" + randomUUID(),
                c.tenantId,
                id,
                line.account_id,
                line.debit,
                line.credit,
                i + 1,
                JSON.stringify(line.dimensions ?? {}),
              ],
            );
        } else {
          if (!j?.workflow_managed) conflict("Historical proposals are read-only.");
          await this.independent(client, c, p!, j!, input.action === "post");
          version = j!.version + 1;
          if (input.action === "accept") {
            if (j!.state !== "prepared" || p!.state !== "approved")
              conflict("Only a prepared journal for approved Payroll can be accepted.");
            status = "accepted";
            await client.query(
              `update hr_payroll_journal_proposal set state='accepted',version=version+1,accepted_by=$3,accepted_at=clock_timestamp() where tenant_id=$1 and id=$2`,
              [c.tenantId, id, c.actor.userId],
            );
            await client.query(
              `update hr_payroll_period set state='posting_ready',version=version+1 where tenant_id=$1 and company_id=$2 and id=$3`,
              [c.tenantId, input.company_id, p!.id],
            );
          } else if (input.action === "reject") {
            if (!["prepared", "accepted"].includes(j!.state) || !["approved", "posting_ready"].includes(p!.state))
              conflict("Only an unposted journal can be rejected.");
            status = "rejected";
            await client.query(
              `update hr_payroll_journal_proposal set state='rejected',version=version+1,rejected_by=$3,rejected_at=clock_timestamp() where tenant_id=$1 and id=$2`,
              [c.tenantId, id, c.actor.userId],
            );
            if (p!.state === "posting_ready")
              await client.query(
                `update hr_payroll_period set state='approved',version=version+1 where tenant_id=$1 and company_id=$2 and id=$3`,
                [c.tenantId, input.company_id, p!.id],
              );
          } else {
            if (j!.state !== "accepted" || p!.state !== "posting_ready")
              conflict("An independently accepted journal is required before posting.");
            status = "posted";
            let posted;
            try {
              posted = await this.finance.post(await createFinanceTransactionClient(client), {
                tenantId: c.tenantId,
                companyId: input.company_id,
                actorId: c.actor.userId,
                sourceType: "hr.payroll",
                sourceId: p!.id,
                eventType: "payroll.accrued",
                externalIdempotencyKey: key,
                transactionCurrency: j!.currency_code,
                postingDate: j!.posting_date,
                exchangeRateId: j!.exchange_rate_id,
                exchangeRateValue: j!.exchange_rate,
                payloadHashMaterial: {
                  proposal_id: id,
                  proposal_version: j!.version,
                  run_number: p!.run_number,
                  source_results_hash: x.sourceResultsHash,
                  accepted_by: j!.accepted_by,
                },
                auditRef: corr,
                lines: x.assembly.lines.map((l) => ({
                  accountId: l.account_id,
                  debit: ExactPayrollAmount.parse(l.debit).decimal(Number(p!.money_scale)),
                  credit: ExactPayrollAmount.parse(l.credit).decimal(Number(p!.money_scale)),
                  dimensions: l.dimensions ?? {},
                  description: "Payroll accrual " + input.month,
                  sourceMetadata: {
                    proposal_id: id,
                    payroll_period_id: p!.id,
                    source_results_hash: x.sourceResultsHash,
                  },
                })),
              });
            } catch (error) {
              if (error instanceof FinancePostingError) throw new HrApiError(error.status, error.code, error.message);
              throw error;
            }
            await client.query(
              `insert into hr_payroll_finance_approval_binding(id,tenant_id,company_id,proposal_id,finance_journal_id,created_by,evidence_hash) values($1,$2,$3,$4,$5,$6,$7)`,
              [
                "payroll-finance-binding-" + randomUUID(),
                c.tenantId,
                input.company_id,
                id,
                posted.journalId,
                c.actor.userId,
                attendanceHash({
                  proposal: id,
                  reviewer: j!.accepted_by,
                  source: x.sourceResultsHash,
                  journal: posted.journalId,
                }),
              ],
            );
            await client.query(
              `update hr_payroll_journal_proposal set state='posted',version=version+1,posted_by=$3,posted_at=clock_timestamp(),external_journal_id=$4,external_entry_number=$5,accounting_event_id=$6,financial_period_id=$7 where tenant_id=$1 and id=$2`,
              [
                c.tenantId,
                id,
                c.actor.userId,
                posted.journalId,
                posted.entryNumber,
                posted.accountingEventId,
                posted.periodId,
              ],
            );
            await client.query(
              `update hr_payroll_period set state='posted',version=version+1,posted_by=$4,posted_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
              [c.tenantId, input.company_id, p!.id, c.actor.userId],
            );
          }
        }
        const after = await this.readIn(client, c, input);
        return {
          id,
          status,
          version,
          kind: "journal",
          before: { proposal: j ?? null, period: p ?? null },
          after: { ...after, period_id: p!.id },
        };
      },
      (client) => this.authorize(client, c, input.company_id, actionPermission[input.action]),
    );
  }
}

export function hasExactLoanCurrencyParity(funding: Row, baseCurrency: string, baseScale: number, rate: string) {
  return (
    funding.funding_base_currency === baseCurrency &&
    ExactPayrollAmount.parse(rate).compare(ExactPayrollAmount.parse("1")) === 0 &&
    ExactPayrollAmount.parse(funding.base_debit).compare(ExactPayrollAmount.parse(funding.principal)) === 0 &&
    ExactPayrollAmount.parse(funding.amount).compare(
      ExactPayrollAmount.parse(ExactPayrollAmount.parse(funding.amount).decimal(Math.min(4, baseScale))),
    ) === 0
  );
}
