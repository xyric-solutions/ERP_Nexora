import { readLeaveBalances, leaveDecimal, leaveUnits } from "./leave-balances.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { HrLifecycleCaseAction } from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { attendanceHash } from "./attendance-completion.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { requireSettlementBenefitRead } from "./settlement-benefits.js";
import { ExactPayrollAmount as Money, PayrollCalculationError } from "./payroll-calculation.js";
import {
  recalculateSettlementPayroll,
  settlementCorrectionJournal,
  type CorrectionPayroll,
  type CorrectionAmount,
} from "./settlement-correction-calculation.js";
import {
  FinancePostingService,
  FinancePostingError,
  createFinanceTransactionClient,
} from "../finance/posting/index.js";
import { SourceFinancePostingRepository } from "../finance/posting/source-repository.js";
// Private SQL projections are retained in immutable evidence; only compact contract fields leave this service.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type SettlementExecutionAction = Extract<
  HrLifecycleCaseAction,
  {
    action:
      | "calculate_payroll_correction"
      | "approve_payroll_correction"
      | "reject_payroll_correction"
      | "post_payroll_correction";
  }
>;
export const isSettlementExecution = (input: HrLifecycleCaseAction): input is SettlementExecutionAction =>
  [
    "calculate_payroll_correction",
    "approve_payroll_correction",
    "reject_payroll_correction",
    "post_payroll_correction",
  ].includes(input.action);
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_SUPPLEMENTAL_PAYROLL_REVIEW_REQUIRED", message);
};
const deny = (message: string): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
const keys = (action: string) => [
  "hr.payroll.setup.read",
  "hr.payroll.adjustment.read",
  "hr.payroll.result.read",
  "hr.payroll.report.read",
  "finance.journal.read",
  ...(action === "calculate_payroll_correction"
    ? ["hr.payroll.period.manage"]
    : action === "post_payroll_correction"
      ? ["finance.journal.post"]
      : [
          "hr.payroll.period.approve",
          action === "approve_payroll_correction" ? "workflow.approval.approve" : "workflow.approval.reject",
        ]),
];
export async function requireSettlementExecutionAuthority(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  caseId: string,
  input: SettlementExecutionAction,
) {
  for (const key of keys(input.action)) await requireHrCompanyPermission(client, c, company, key);
  const leaveReview = (
    await client.query(
      "select 1 from hr_settlement_correction_review v where v.tenant_id=$1 and v.company_id=$2 and v.case_id=$3 and v.id=coalesce($4::text,(select correction_id from hr_settlement_correction_execution where tenant_id=$1 and company_id=$2 and id=$5)) and exists(select 1 from jsonb_array_elements(v.lines) line where line->>'original_leave_days' is distinct from line->>'corrected_leave_days')",
      [
        c.tenantId,
        company,
        caseId,
        input.action === "calculate_payroll_correction" ? input.correction_id : null,
        input.action === "calculate_payroll_correction" ? null : input.execution_id,
      ],
    )
  ).rowCount;
  if (leaveReview)
    for (const key of [
      "hr.leave.balance.read",
      ...(input.action === "approve_payroll_correction" || input.action === "post_payroll_correction"
        ? ["hr.leave.balance.adjust"]
        : []),
    ])
      await requireHrCompanyPermission(client, c, company, key);
  await requireSettlementBenefitRead(client, c, company, caseId);
  if (
    (
      await client.query(
        "select 1 from hr_lifecycle_case x join employee_user_binding b on b.tenant_id=x.tenant_id and b.employee_id=x.employee_id and b.ended_at is null where x.tenant_id=$1 and x.company_id=$2 and x.id=$3 and b.user_id=$4",
        [c.tenantId, company, caseId, c.actor.userId],
      )
    ).rowCount
  )
    deny("The affected employee cannot calculate, approve or post their correction.");
  if (input.action !== "calculate_payroll_correction") {
    if (
      (
        await client.query(
          "select 1 where EXISTS(SELECT 1 FROM hr_lifecycle_case x WHERE x.tenant_id=$1 AND x.company_id=$2 AND x.id=$3 AND($4=ANY(ARRAY[x.created_by,x.submitted_by,CASE WHEN x.updated_by IS DISTINCT FROM x.decided_by THEN x.updated_by ELSE NULL END]) OR EXISTS(SELECT 1 FROM hr_settlement_benefit_source s WHERE s.tenant_id=x.tenant_id AND s.company_id=x.company_id AND s.case_id=x.id AND s.created_by=$4 AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.terms->'lines') l WHERE l->>'benefit_source_id'=s.id)) OR EXISTS(SELECT 1 FROM hr_settlement_encashment_source s WHERE s.tenant_id=x.tenant_id AND s.company_id=x.company_id AND s.case_id=x.id AND s.created_by=$4 AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.terms->'lines') l WHERE l->>'encashment_source_id'=s.id))))",
          [c.tenantId, company, caseId, c.actor.userId],
        )
      ).rowCount
    )
      deny(
        "Original statement authors and entitlement calculators cannot approve, reject or post derived Payroll corrections.",
      );
    const r = (
      await client.query(
        "select e.created_by,e.approved_by,r.requested_by from hr_settlement_correction_execution e join hr_settlement_correction_review r on r.tenant_id=e.tenant_id and r.company_id=e.company_id and r.id=e.correction_id where e.tenant_id=$1 and e.company_id=$2 and e.case_id=$3 and e.id=$4",
        [c.tenantId, company, caseId, input.execution_id],
      )
    ).rows[0];
    if (
      r &&
      [r.created_by, r.requested_by, ...(input.action === "post_payroll_correction" ? [r.approved_by] : [])].includes(
        c.actor.userId,
      )
    )
      deny("An independent Payroll reviewer and a separate Finance poster are required.");
  }
}
const minorDecimal = (minor: string, scale: number) => {
  const s = minor.padStart(scale + 1, "0");
  return scale ? s.slice(0, -scale) + "." + s.slice(-scale) : s;
};
async function build(client: PoolClient, c: HrActorContext, r: Row, review: Row, terms: Row) {
  const links = (
    await client.query(
      "select distinct on(l.line_index) l.line_index,l.adjustment_id,a.state,a.consumed_result_id from hr_settlement_payroll_link l left join hr_payroll_adjustment a on a.tenant_id=l.tenant_id and a.company_id=l.company_id and a.id=l.adjustment_id where l.tenant_id=$1 and l.company_id=$2 and l.case_id=$3 order by l.line_index,l.revision desc",
      [c.tenantId, r.company_id, r.id],
    )
  ).rows;
  const changed = review.lines.filter(
    (x: Row) => x.original_minor !== x.corrected_minor || x.original_leave_days !== x.corrected_leave_days,
  );
  const sources = changed.map((line: Row) => {
    const link = links.find((x) => Number(x.line_index) === line.line_index);
    if (!link?.consumed_result_id || link.state !== "consumed")
      fail(
        "Complete original settlement Payroll processing before calculating its supplement. Changed external or excluded amounts require their original governed source, not an invented Payroll input.",
      );
    return { ...line, result_id: link.consumed_result_id, source: "adjustment:" + link.adjustment_id };
  });
  if (!sources.length) fail("No changed Payroll obligation was selected.");
  const targetIds = [...new Set(sources.map((x: Row) => x.result_id))];
  const targets = (
    await client.query(
      "select r.id,p.month::text as month from hr_payroll_result r join hr_payroll_period p on p.tenant_id=r.tenant_id and p.id=r.period_id and p.company_id=r.company_id and p.run_number=r.run_number where r.tenant_id=$1 and r.company_id=$2 and r.employee_id=$3 and r.id=any($4::text[])",
      [c.tenantId, r.company_id, r.employee_id, targetIds],
    )
  ).rows;
  if (targets.length !== targetIds.length)
    fail("Every correction source must belong to this employee's actual current finalized Payroll run.");
  const from = targets.map((x) => x.month).sort()[0];
  const rows = (
    await client.query(
      `select r.id,r.employee_id,r.currency_code,r.gross::text,r.deductions::text,r.net::text,r.employer_contributions::text,r.calculation_hash,r.execution_evidence,p.month::text,p.state as period_state,p.version as period_version,pol.money_scale,pol.net_payable_account_id,j.external_journal_id,je.status as finance_state,s.state as statutory_state,s.calculation_engine_version,effective_hr_payroll_correction(r.tenant_id,r.company_id,r.id) as effective
 from hr_payroll_result r join hr_payroll_period p on p.tenant_id=r.tenant_id and p.company_id=r.company_id and p.id=r.period_id and p.run_number=r.run_number join hr_payroll_policy pol on pol.tenant_id=p.tenant_id and pol.company_id=p.company_id and pol.id=p.policy_id
 left join hr_payroll_statutory_snapshot s on s.tenant_id=r.tenant_id and s.payroll_result_id=r.id
 left join hr_payroll_journal_proposal j on j.tenant_id=p.tenant_id and j.company_id=p.company_id and j.period_id=p.id and j.run_number=p.run_number and j.state='posted'
 left join journal_entry je on je.tenant_id=j.tenant_id and je.company_id=j.company_id and je.id=j.external_journal_id
 where r.tenant_id=$1 and r.company_id=$2 and r.employee_id=$3 and p.month>=$4::date and p.state in('approved','posting_ready','posted','paid','closed') order by p.month,r.id limit 121`,
      [c.tenantId, r.company_id, r.employee_id, from],
    )
  ).rows;
  if (!rows.length || rows.length > 120)
    fail(
      "A synchronous correction supports up to 120 finalized employee months; a larger history requires worker execution.",
    );
  if (
    rows.some(
      (x) =>
        x.currency_code !== r.terms.currency ||
        x.statutory_state !== "sealed" ||
        x.calculation_engine_version !== "statutory_rules_v1",
    )
  )
    fail("Every affected month must retain a sealed production statutory result in the statement currency.");
  if (rows.some((x) => x.finance_state !== "posted"))
    fail(
      "Post each affected original Payroll accrual in Finance first. A reversed original journal must be resolved through its source workflow.",
    );
  const before: CorrectionPayroll[] = rows.map(
    (x) =>
      x.effective ?? {
        result_id: x.id,
        month: x.month,
        currency_code: x.currency_code,
        money_scale: Number(x.money_scale),
        net_payable_account_id: x.net_payable_account_id,
        lines: x.execution_evidence.calculation.lines,
        statutory: x.execution_evidence.statutory,
        gross: x.gross,
        deductions: x.deductions,
        net: x.net,
        employer_contributions: x.employer_contributions,
      },
  );
  const earlier = (
    await client.query(
      "select r.id,effective_hr_payroll_correction(r.tenant_id,r.company_id,r.id) as effective from hr_payroll_result r join hr_payroll_period p on p.tenant_id=r.tenant_id and p.company_id=r.company_id and p.id=r.period_id and p.run_number=r.run_number where r.tenant_id=$1 and r.company_id=$2 and r.employee_id=$3 and p.month<$4::date and p.state in('approved','posting_ready','posted','paid','closed') order by p.month limit 601",
      [c.tenantId, r.company_id, r.employee_id, from],
    )
  ).rows;
  if (earlier.length > 600) fail("An older correction history requires bounded worker execution.");
  const prior = new Map<string, CorrectionPayroll>(earlier.filter((x) => x.effective).map((x) => [x.id, x.effective]));
  const after: CorrectionPayroll[] = [];
  try {
    for (const original of before) {
      const changes: CorrectionAmount[] = sources
        .filter((x: Row) => x.result_id === original.result_id)
        .map((x: Row) => ({
          source: x.source,
          amount: minorDecimal(x.corrected_minor, original.money_scale),
          taxable: terms.taxable_lines.includes(x.line_index),
        }));
      const updated = recalculateSettlementPayroll(original, changes, prior);
      after.push(updated);
      prior.set(updated.result_id, updated);
    }
  } catch (error) {
    if (error instanceof PayrollCalculationError) fail(error.message);
    throw error;
  }
  const leave_changes = [];
  for (const line of review.lines.filter((x: Row) => x.original_leave_days !== x.corrected_leave_days)) {
    const id = r.terms.lines[line.line_index]?.encashment_source_id;
    const source = (
      await client.query(
        "select s.*,s.as_of::text,p.terms->>'maximum_days' as maximum_days from hr_settlement_encashment_source s join hr_settlement_encashment_rule p on p.tenant_id=s.tenant_id and p.id=s.rule_id where s.tenant_id=$1 and s.company_id=$2 and s.case_id=$3 and s.id=$4",
        [c.tenantId, r.company_id, r.id, id],
      )
    ).rows[0];
    if (
      !source ||
      leaveUnits(line.corrected_leave_days) < 0 ||
      leaveUnits(line.corrected_leave_days) > leaveUnits(source.maximum_days)
    )
      fail("Corrected encashment days exceed the retained approved rule cap.");
    const actual = (
      await client.query(
        "select(-coalesce(sum(days),0))::text as days from hr_leave_transaction where tenant_id=$1 and company_id=$2 and((kind='encashed' and source_type='final_settlement' and source_id=$3)or(kind='encashment_correction' and evidence_json->>'original_source_id'=$3))",
        [c.tenantId, r.company_id, source.id],
      )
    ).rows[0].days;
    if (leaveUnits(actual) !== leaveUnits(line.original_leave_days))
      fail("The source encashment ledger changed. Prepare a fresh correction review.");
    const balance = (
      await readLeaveBalances(
        client,
        c,
        r.company_id,
        [{ employee: r.employee_id, type: source.leave_type_id }],
        source.as_of,
      )
    )[0]!;
    const delta = leaveUnits(line.original_leave_days) - leaveUnits(line.corrected_leave_days);
    if (delta < 0 && leaveUnits(balance.available) + delta < 0)
      fail("Additional encashment would consume reserved or unavailable leave.");
    leave_changes.push({
      source_id: source.id,
      employee_id: r.employee_id,
      leave_type_id: source.leave_type_id,
      policy_version_id: source.leave_policy_version_id,
      effective_on: source.as_of,
      original_days: leaveDecimal(leaveUnits(actual)),
      corrected_days: leaveDecimal(leaveUnits(line.corrected_leave_days)),
      delta_days: leaveDecimal(delta),
      balance_hash: balance.hash,
    });
  }
  const journal = settlementCorrectionJournal(before, after);
  if (
    rows.some((x) => ["paid", "closed"].includes(x.period_state)) &&
    after
      .reduce((s, x) => s.add(Money.parse(x.net)), new Money(0n))
      .compare(before.reduce((s, x) => s.add(Money.parse(x.net)), new Money(0n))) < 0
  )
    fail(
      "A recovery after paid or closed Payroll requires actual Banking payment reconciliation and receivable classification. Banking integration remains deferred to its owner.",
    );
  const authority = new SourceFinancePostingRepository(),
    financeClient = await createFinanceTransactionClient(client),
    bases = await authority.loadBaseCurrencies(financeClient, c.tenantId, true);
  if (bases.length !== 1) fail("Finance requires exactly one active base currency.");
  const base = bases[0]!;
  const currency = await authority.loadTransactionCurrency(financeClient, c.tenantId, r.terms.currency, true);
  if (!currency || currency.decimal_places !== before[0]!.money_scale)
    fail("The retained Payroll currency precision must match Finance.");
  if (r.terms.currency !== base.code)
    await authority.lockRateAuthority(financeClient, c.tenantId, r.terms.currency, base.code);
  const rate =
    r.terms.currency === base.code
      ? { id: null, rate: "1.000000000000000000" }
      : await authority.loadDirectRate(
          financeClient,
          c.tenantId,
          r.terms.currency,
          base.code,
          terms.posting_date,
          true,
        );
  if (!rate) fail("Add an approved direct Finance exchange rate covering the correction posting date.");
  const source = {
    review_id: review.id,
    review_lines: review.lines,
    results: rows.map((x) => ({
      id: x.id,
      calculation_hash: x.calculation_hash,
      period_state: x.period_state,
      period_version: x.period_version,
      journal_id: x.external_journal_id,
      finance_state: x.finance_state,
      effective_hash: attendanceHash(x.effective ?? null),
    })),
    earlier: earlier.filter((x) => x.effective).map((x) => ({ id: x.id, hash: attendanceHash(x.effective) })),
    base_currency: base.code,
    rate,
  };
  return {
    source,
    before,
    after,
    journal,
    leave_changes,
    net_delta: after
      .reduce((s, x) => s.add(Money.parse(x.net)), new Money(0n))
      .subtract(before.reduce((s, x) => s.add(Money.parse(x.net)), new Money(0n)))
      .decimal(before[0]!.money_scale),
  };
}
export async function settlementExecutionRecords(client: PoolClient, c: HrActorContext, r: Row) {
  for (const permission of ["finance.journal.read", "hr.payroll.report.read"]) {
    try {
      await requireHrCompanyPermission(client, c, r.company_id, permission);
    } catch (error) {
      if (error instanceof HrApiError && error.status === 403) return [];
      throw error;
    }
  }
  const rows = (
    await client.query(
      "select e.*,e.terms->>'posting_date' as posting_date from hr_settlement_correction_execution e where e.tenant_id=$1 and e.company_id=$2 and e.case_id=$3 order by e.created_at desc,e.id desc limit 25",
      [c.tenantId, r.company_id, r.id],
    )
  ).rows;
  const result = [];
  for (const x of rows) {
    const allowed: string[] = [];
    for (const action of x.state === "calculated"
      ? ["approve_payroll_correction", "reject_payroll_correction"]
      : x.state === "approved"
        ? ["post_payroll_correction", "reject_payroll_correction"]
        : []) {
      try {
        await requireSettlementExecutionAuthority(client, c, r.company_id, r.id, {
          action,
          company_id: r.company_id,
          id: r.id,
          expected_version: r.version,
          execution_id: x.id,
          execution_version: x.version,
          execution_source_hash: x.source_hash,
          reason: "Read permitted correction actions",
        } as SettlementExecutionAction);
        allowed.push(action);
      } catch (e) {
        if (!(e instanceof HrApiError && e.status === 403)) throw e;
      }
    }
    result.push({
      id: x.id,
      correction_id: x.correction_id,
      state: x.state,
      version: x.version,
      source_hash: x.source_hash,
      posting_date: x.posting_date,
      created_by: x.created_by,
      approved_by: x.approved_by,
      posted_by: x.posted_by,
      journal_id: x.journal_id,
      entry_number: x.entry_number,
      reason: x.terms.reason,
      decision_reason: x.decision_reason,
      net_delta: x.snapshot.net_delta,
      taxable_lines: x.terms.taxable_lines,
      leave_changes: (x.snapshot.leave_changes ?? []).map((l: Row) => ({
        source_id: l.source_id,
        leave_type_id: l.leave_type_id,
        original_days: l.original_days,
        corrected_days: l.corrected_days,
        delta_days: l.delta_days,
      })),
      months: x.snapshot.after.map((a: CorrectionPayroll, i: number) => ({
        month: a.month,
        result_id: a.result_id,
        before_gross: x.snapshot.before[i].gross,
        after_gross: a.gross,
        before_deductions: x.snapshot.before[i].deductions,
        after_deductions: a.deductions,
        before_net: x.snapshot.before[i].net,
        after_net: a.net,
      })),
      journal_lines: x.snapshot.journal.lines,
      allowed_actions: allowed,
    });
  }
  return result;
}
export async function applySettlementExecution(
  client: PoolClient,
  c: HrActorContext,
  r: Row,
  input: SettlementExecutionAction,
  key: string,
  corr: string,
) {
  for (const prefix of ["nexora:hr:attendance:", "nexora:payroll:"])
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      prefix + c.tenantId + ":" + r.company_id,
    ]);
  let before: Row | null = null,
    id: string;
  if (input.action === "calculate_payroll_correction") {
    const current = (
      await client.query("select hr_settlement_correction_context($1,$2,$3) as snapshot", [
        c.tenantId,
        r.company_id,
        r.id,
      ])
    ).rows[0].snapshot;
    if (attendanceHash(current) !== input.correction_source_hash)
      fail("Original evidence changed. Refresh before calculating the supplement.");
    const review = (
      await client.query(
        "select * from hr_settlement_correction_review where tenant_id=$1 and company_id=$2 and case_id=$3 and id=$4 and state='approved'",
        [c.tenantId, r.company_id, r.id, input.correction_id],
      )
    ).rows[0];
    if (!review) fail("Independently approve the financial correction review first.");
    if (input.taxable_lines.some((i) => r.terms.lines[i]?.direction !== "earning"))
      fail("Taxable classification applies only to an actual earning line.");
    if (
      (
        await client.query(
          "select 1 from hr_settlement_correction_execution where tenant_id=$1 and company_id=$2 and correction_id=$3 and state<>'rejected'",
          [c.tenantId, r.company_id, review.id],
        )
      ).rowCount
    )
      fail("Reject the current unposted calculation before preparing its successor.");
    const terms = {
        posting_date: input.posting_date,
        taxable_lines: input.taxable_lines,
        tax_treatment_reviewed: true,
        reason: input.reason,
      },
      snapshot = await build(client, c, r, review, terms);
    id = "supplemental-payroll-" + randomUUID();
    await client.query(
      "insert into hr_settlement_correction_execution(tenant_id,company_id,id,case_id,correction_id,source_hash,terms,snapshot,created_by) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)",
      [
        c.tenantId,
        r.company_id,
        id,
        r.id,
        review.id,
        attendanceHash(snapshot),
        JSON.stringify(terms),
        JSON.stringify(snapshot),
        c.actor.userId,
      ],
    );
  } else {
    id = input.execution_id;
    before =
      (
        await client.query(
          "select * from hr_settlement_correction_execution where tenant_id=$1 and company_id=$2 and case_id=$3 and id=$4 for update",
          [c.tenantId, r.company_id, r.id, id],
        )
      ).rows[0] ?? null;
    if (!before || before!.version !== input.execution_version || before!.source_hash !== input.execution_source_hash)
      fail("The supplemental calculation changed. Refresh the independently reviewed version.");
    const x = before!,
      review = (
        await client.query(
          "select * from hr_settlement_correction_review where tenant_id=$1 and company_id=$2 and id=$3",
          [c.tenantId, r.company_id, x.correction_id],
        )
      ).rows[0];
    if (input.action === "reject_payroll_correction") {
      if (!["calculated", "approved"].includes(x.state)) fail("Only an unposted calculation can be rejected.");
      await client.query(
        "update hr_settlement_correction_execution set state='rejected',version=version+1,approved_by=$3,approved_at=clock_timestamp(),decision_reason=$4 where tenant_id=$1 and id=$2",
        [c.tenantId, id, c.actor.userId, input.reason],
      );
    } else {
      const fresh = await build(client, c, r, review, x.terms);
      if (attendanceHash(fresh) !== x.source_hash)
        fail("Payroll, prior corrections or Finance rate evidence changed. Reject and recalculate the supplement.");
      if (input.action === "approve_payroll_correction") {
        if (x.state !== "calculated") fail("Only a calculated supplement can be approved.");
        await client.query(
          "update hr_settlement_correction_execution set state='approved',version=version+1,approved_by=$3,approved_at=clock_timestamp(),decision_reason=$4 where tenant_id=$1 and id=$2",
          [c.tenantId, id, c.actor.userId, input.reason],
        );
      } else {
        if (x.state !== "approved") fail("Independent Payroll and Finance approval is required before posting.");
        let posted: { journalId: string; entryNumber: string; accountingEventId: string } | null = null;
        if (fresh.journal.lines.length) {
          try {
            posted = await new FinancePostingService().post(await createFinanceTransactionClient(client), {
              tenantId: c.tenantId,
              companyId: r.company_id,
              actorId: c.actor.userId,
              sourceType: "hr.settlement_correction",
              sourceId: id,
              eventType: "settlement.corrected",
              externalIdempotencyKey: key,
              transactionCurrency: r.terms.currency,
              postingDate: x.terms.posting_date,
              exchangeRateId: fresh.source.rate!.id,
              exchangeRateValue: fresh.source.rate!.rate,
              payloadHashMaterial: {
                execution_id: id,
                source_hash: x.source_hash,
                approved_by: x.approved_by,
                correction_id: x.correction_id,
              },
              auditRef: corr,
              lines: fresh.journal.lines.map((line) => ({
                accountId: line.account_id,
                debit: Money.parse(line.debit).decimal(fresh.before[0]!.money_scale),
                credit: Money.parse(line.credit).decimal(fresh.before[0]!.money_scale),
                dimensions: {},
                description: "Supplemental final settlement Payroll correction",
                sourceMetadata: { execution_id: id, case_id: r.id, correction_id: x.correction_id },
              })),
            });
          } catch (error) {
            if (error instanceof FinancePostingError) throw new HrApiError(error.status, error.code, error.message);
            throw error;
          }
        }
        await client.query(
          "update hr_settlement_correction_execution set state='posted',version=version+1,posted_by=$3,posted_at=clock_timestamp(),journal_id=$4,entry_number=$5,accounting_event_id=$6 where tenant_id=$1 and id=$2",
          [
            c.tenantId,
            id,
            c.actor.userId,
            posted?.journalId ?? null,
            posted?.entryNumber ?? null,
            posted?.accountingEventId ?? null,
          ],
        );
        for (const entry of fresh.leave_changes)
          await client.query(
            "insert into hr_leave_transaction(tenant_id,id,company_id,employee_id,leave_type_id,effective_on,kind,days,source_type,source_id,reason,created_by,policy_version_id,evidence_hash,evidence_json) values($1,$2,$3,$4,$5,$6,'encashment_correction',$7,'settlement_correction',$8,$9,$10,$11,$12,$13::jsonb)",
            [
              c.tenantId,
              "corrected-encashment-" + randomUUID(),
              r.company_id,
              entry.employee_id,
              entry.leave_type_id,
              entry.effective_on,
              entry.delta_days,
              id + ":" + entry.source_id,
              input.reason,
              c.actor.userId,
              entry.policy_version_id,
              x.source_hash,
              JSON.stringify({
                case_id: r.id,
                correction_id: x.correction_id,
                execution_id: id,
                original_source_id: entry.source_id,
              }),
            ],
          );
        await client.query(
          "update hr_settlement_correction_review set state='processed' where tenant_id=$1 and company_id=$2 and id=$3",
          [c.tenantId, r.company_id, x.correction_id],
        );
      }
    }
  }
  const after = (
    await client.query(
      "select * from hr_settlement_correction_execution where tenant_id=$1 and company_id=$2 and id=$3",
      [c.tenantId, r.company_id, id],
    )
  ).rows[0];
  return { id, before, after };
}
