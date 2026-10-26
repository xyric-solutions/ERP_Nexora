import { requireSettlementPayrollDecision } from "./settlement-payroll.js";
import { confirmLoanDisbursement, loanDisbursementOptions, requireLoanDisbursementAuthority } from "./payroll-loans.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { evaluateApprovalActor } from "@nexora/auth";
import type {
  CreateHrPayrollRecord,
  HrPayrollRecordAction,
  HrPayrollWorkspaceQuery,
  HrPayrollWorkspace,
  HrPayrollItem,
  HrPayrollOptionsQuery,
  HrPayrollOptions,
  HrPayrollMutationResult,
  HrPayrollSection,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { attendanceHash, type AttendanceCompletionDependencies } from "./attendance-completion.js";
export type PayrollWorkspaceDependencies = Pick<
  AttendanceCompletionDependencies,
  "pool" | "read" | "company" | "override" | "audit"
>;
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_PAYROLL_REVIEW_REQUIRED", message);
};
const deny = (): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", "The required Payroll permission is missing.");
};
export function payrollUnits(value: string): bigint {
  if (!/^\d{1,16}(\.\d{1,4})?$/.test(value)) fail("Use an exact non-negative amount with up to four decimals.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, "0"));
}
export function payrollDecimal(value: bigint): string {
  if (value < 0n) fail("A negative amount is not permitted.");
  return `${value / 10000n}.${(value % 10000n).toString().padStart(4, "0")}`;
}
export function loanSchedule(principal: string, count: number, scale = 4): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 600) fail("Choose 1–600 instalments.");
  if (!Number.isInteger(scale) || scale < 0 || scale > 4) fail("Unsupported loan currency precision.");
  const factor = 10n ** BigInt(4 - scale),
    units = payrollUnits(principal);
  if (units % factor) fail("The principal exceeds the currency precision.");
  const total = units / factor,
    n = BigInt(count),
    base = total / n,
    remainder = total % n;
  if (base < 1n) fail("The principal must cover every instalment at the currency precision.");
  return Array.from({ length: count }, (_, i) => payrollDecimal((base + (BigInt(i) < remainder ? 1n : 0n)) * factor));
}
/** Validate a bounded arithmetic grammar; never evaluate administrator input as JavaScript. */
export function validatePayrollFormula(formula: string, allowed: ReadonlySet<string>): void {
  const tokens = formula.match(/\d+(?:\.\d{1,4})?|[A-Za-z][A-Za-z0-9_]*|[+*/(),-]/g) ?? [];
  if (tokens.join("") !== formula.replace(/\s/g, "") || tokens.length > 200 || !tokens.length)
    fail("Use numbers, approved variables, arithmetic and min/max/round only.");
  let i = 0,
    depth = 0;
  const peek = () => tokens[i];
  const atom = (): void => {
    if (++depth > 24) fail("The formula is too deeply nested.");
    const t = tokens[i++];
    if (t === "+" || t === "-") atom();
    else if (t === "(") {
      expression();
      if (tokens[i++] !== ")") fail("Close each formula parenthesis.");
    } else if (t && /^\d/.test(t)) {
      /* A numeric literal has no further grammar. */
    } else if (t && ["min", "max", "round"].includes(t)) {
      if (tokens[i++] !== "(") fail("A formula function requires parentheses.");
      expression();
      let count = 1;
      while (peek() === ",") {
        i++;
        expression();
        count++;
        if (count > 10) fail("Too many function arguments.");
      }
      if (tokens[i++] !== ")" || (t === "round" ? count !== 2 : count < 2))
        fail("Use two arguments for round and at least two for min/max.");
    } else if (!t || !allowed.has(t)) fail("A formula contains an unavailable or forward component reference.");
    depth--;
  };
  const term = (): void => {
    atom();
    while (peek() === "*" || peek() === "/") {
      i++;
      atom();
    }
  };
  const expression = (): void => {
    term();
    while (peek() === "+" || peek() === "-") {
      i++;
      term();
    }
  };
  expression();
  if (i !== tokens.length) fail("The formula has an unexpected token.");
}
const definitions = {
  components: { table: "hr_pay_component", permission: "setup", kind: "component" },
  structures: { table: "hr_salary_structure", permission: "salary", kind: "structure" },
  salaries: { table: "hr_salary_assignment", permission: "salary", kind: "salary" },
  adjustments: { table: "hr_payroll_adjustment", permission: "adjustment", kind: "adjustment" },
  loans: { table: "hr_employee_loan", permission: "loan", kind: "loan" },
  runs: { table: "hr_payroll_period", permission: "period", kind: "run" },
  review: { table: "hr_payroll_period", permission: "period", kind: "run" },
  journals: { table: "hr_payroll_journal_proposal", permission: "report", kind: "journal" },
  payments: { table: "hr_payroll_payment_batch", permission: "payment", kind: "payment" },
  payslips: { table: "hr_payroll_result", permission: "payslip", kind: "payslip" },
} as const;
type Row = Record<string, unknown>;
const text = (r: Row, k: string): string | null =>
  r[k] === null || r[k] === undefined
    ? null
    : r[k] instanceof Date
      ? ["effective_from", "effective_to", "effective_month", "start_month", "month"].includes(k)
        ? [
            (r[k] as Date).getFullYear(),
            String((r[k] as Date).getMonth() + 1).padStart(2, "0"),
            String((r[k] as Date).getDate()).padStart(2, "0"),
          ].join("-")
        : (r[k] as Date).toISOString()
      : String(r[k]);
const sectionFor = {
  component: "components",
  structure: "structures",
  salary: "salaries",
  adjustment: "adjustments",
  loan: "loans",
} as const;
export class PayrollWorkspace {
  constructor(private readonly d: PayrollWorkspaceDependencies) {}
  private permission(section: HrPayrollSection, suffix = "read") {
    return "hr.payroll." + definitions[section].permission + "." + suffix;
  }
  private async company(client: PoolClient, c: HrActorContext, id: string) {
    await this.d.company(client, c, id);
  }
  private async load(
    client: PoolClient,
    c: HrActorContext,
    section: HrPayrollSection,
    company: string,
    id: string,
  ): Promise<Row> {
    const row = (
      await client.query(`select * from ${definitions[section].table} where tenant_id=$1 and company_id=$2 and id=$3`, [
        c.tenantId,
        company,
        id,
      ])
    ).rows[0] as Row | undefined;
    if (!row)
      throw new HrApiError(404, "HR_PAYROLL_RECORD_NOT_FOUND", "The Payroll record is unavailable in this company.");
    return row;
  }
  private async map(client: PoolClient, c: HrActorContext, section: HrPayrollSection, r: Row): Promise<HrPayrollItem> {
    let lines: HrPayrollItem["lines"] = [];
    const detail: Record<string, string | null> = {};
    if (section === "components") {
      for (const k of [
        "kind",
        "method",
        "formula",
        "expense_account_id",
        "liability_account_id",
        "taxable",
        "prorated",
        "position",
      ])
        detail[k] = text(r, k);
    }
    if (section === "structures")
      lines = (
        await client.query(
          `select c.name as label,i.amount::text as amount,coalesce(i.formula_override,c.code) as description from hr_salary_structure_item i join hr_pay_component c on c.tenant_id=i.tenant_id and c.id=i.component_id where i.tenant_id=$1 and i.structure_id=$2 order by i.position`,
          [c.tenantId, r.id],
        )
      ).rows;
    if (section === "salaries")
      lines = (
        await client.query(
          `select c.name as label,s.amount::text,coalesce(s.formula,c.code) as description from hr_salary_assignment_component s join hr_pay_component c on c.tenant_id=s.tenant_id and c.id=s.component_id where s.tenant_id=$1 and s.assignment_id=$2 order by s.position`,
          [c.tenantId, r.id],
        )
      ).rows;
    if (section === "loans")
      lines = (
        await client.query(
          `select due_month::text as label,amount::text,state as description from hr_loan_instalment where tenant_id=$1 and loan_id=$2 order by due_month limit 600`,
          [c.tenantId, r.id],
        )
      ).rows;
    if (section === "loans") {
      const evidence = (
        await client.query(
          "select payment_id,bank_payment_line_id,journal_id,receivable_account_id,bank_reference,confirmed_on::text,confirmed_by,confirmed_at::text from hr_loan_disbursement where tenant_id=$1 and company_id=$2 and loan_id=$3",
          [c.tenantId, r.company_id, r.id],
        )
      ).rows[0];
      if (evidence) for (const [key, value] of Object.entries(evidence)) detail[key] = String(value);
      const balance = (
        await client.query(
          "select coalesce(sum(amount) filter(where state='consumed'),0)::text as recovered,coalesce(sum(amount) filter(where state='scheduled'),0)::text as outstanding from hr_loan_instalment where tenant_id=$1 and loan_id=$2",
          [c.tenantId, r.id],
        )
      ).rows[0];
      detail.recovered = balance.recovered;
      detail.outstanding = balance.outstanding;
    }
    if (section === "journals")
      lines = (
        await client.query(
          `select a.code||' · '||a.name as label,case when l.debit>0 then l.debit::text else l.credit::text end as amount,case when l.debit>0 then 'Debit' else 'Credit' end as description from hr_payroll_journal_line l join account a on a.tenant_id=l.tenant_id and a.id=l.account_id and a.company_id=$3 where l.tenant_id=$1 and l.proposal_id=$2 order by l.position`,
          [c.tenantId, r.id, r.company_id],
        )
      ).rows;
    if (section === "payslips")
      lines = (
        await client.query(
          `select component_name as label,amount::text,kind as description from hr_payroll_result_item where tenant_id=$1 and result_id=$2 order by position`,
          [c.tenantId, r.id],
        )
      ).rows;
    for (const k of [
      "supersedes_id",
      "predecessor_version",
      "predecessor_hash",
      "closed_by_successor_id",
      "reason",
      "description",
      "structure_id",
      "compensation_type",
      "payment_basis",
      "approved_by",
      "approved_at",
      "start_month",
      "instalment_count",
      "effective_month",
      "component_id",
      "run_number",
      "gross",
      "deductions",
      "net",
      "source_hash",
      "calculation_hash",
      "attendance_source_hash",
      "external_journal_id",
      "external_entry_number",
      "period_id",
      "posted_at",
      "paid_at",
      "released_at",
      "confirmed_at",
    ])
      if (r[k] !== undefined) detail[k] = text(r, k);
    let employeeName: string | null = null;
    if (r.employee_id)
      employeeName =
        (
          await client.query(
            `select concat_ws(' ',employee_number,first_name,middle_name,last_name) as name from employee where tenant_id=$1 and id=$2`,
            [c.tenantId, r.employee_id],
          )
        ).rows[0]?.name ?? null;
    const history = (
      await client.query(
        `select action,reason,actor_id,created_at::text as occurred_at,(override_id is not null) as override from hr_payroll_workspace_event where tenant_id=$1 and company_id=$2 and record_id=$3 order by created_at desc,id desc limit 100`,
        [c.tenantId, r.company_id, r.id],
      )
    ).rows;
    const status = text(r, "status") ?? text(r, "state") ?? "recorded";
    return {
      ...(section === "loans" ? { disbursement_options: await loanDisbursementOptions(client, c, r) } : {}),
      id: String(r.id),
      title:
        text(r, "name") ??
        employeeName ??
        (section === "runs" || section === "review"
          ? "Payroll · " + text(r, "month")
          : section === "journals"
            ? "Payroll journal"
            : section === "payments"
              ? "Payment batch"
              : "Payroll record"),
      reference: text(r, "code") ?? text(r, "reference") ?? String(r.id),
      status,
      version: Number(r.version ?? 1),
      workflow_managed: r.workflow_managed === true,
      source_hash: attendanceHash({ row: r, lines }),
      created_by: text(r, "created_by") ?? "",
      submitted_by: text(r, "submitted_by"),
      employee_id: text(r, "employee_id"),
      employee_name: employeeName,
      currency_code: text(r, "currency_code"),
      amount: text(r, "principal") ?? text(r, "amount") ?? text(r, "net"),
      effective_from:
        text(r, "effective_from") ?? text(r, "effective_month") ?? text(r, "start_month") ?? text(r, "month"),
      effective_to: text(r, "effective_to"),
      details: detail,
      history,
      lines,
    };
  }
  async workspace(c: HrActorContext, q: HrPayrollWorkspaceQuery): Promise<HrPayrollWorkspace> {
    return this.d.read(c, this.permission(q.section), async (client) => {
      await this.company(client, c, q.company_id);
      const def = definitions[q.section],
        values: unknown[] = [c.tenantId, q.company_id],
        where = ["r.tenant_id=$1", "r.company_id=$2"];
      if (["adjustments", "runs", "review"].includes(q.section)) {
        values.push(q.month);
        where.push(`r.${q.section === "adjustments" ? "effective_month" : "month"}=$${values.length}::date`);
      }
      if (["journals", "payments", "payslips"].includes(q.section)) {
        values.push(q.month);
        where.push(
          `exists(select 1 from hr_payroll_period p where p.tenant_id=r.tenant_id and p.company_id=r.company_id and p.id=r.period_id and p.month=$${values.length}::date)`,
        );
      }
      if (q.section === "payslips")
        where.push(
          `exists(select 1 from hr_payslip_release s where s.tenant_id=r.tenant_id and s.company_id=r.company_id and s.payroll_result_id=r.id)`,
        );
      if (q.search) {
        values.push("%" + q.search.replace(/[\\%_]/g, "\\$&") + "%");
        where.push(
          `(r.id ilike $${values.length} or coalesce(to_jsonb(r)->>'name',to_jsonb(r)->>'reference',to_jsonb(r)->>'code','') ilike $${values.length} or exists(select 1 from employee e where e.tenant_id=r.tenant_id and e.id=to_jsonb(r)->>'employee_id' and concat_ws(' ',e.employee_number,e.first_name,e.middle_name,e.last_name) ilike $${values.length}))`,
        );
      }
      const clause = where.join(" and "),
        total = Number(
          (await client.query(`select count(*) as total from ${def.table} r where ${clause}`, values)).rows[0].total,
        );
      values.push(q.limit, q.offset);
      const rows = (
        await client.query(
          `select r.* from ${def.table} r where ${clause} order by r.id collate "C" limit $${values.length - 1} offset $${values.length}`,
          values,
        )
      ).rows as Row[];
      const items = [];
      for (const row of rows) items.push(await this.map(client, c, q.section, row));
      const notices = [
        "Reviewed statutory setup is available in Pay Components. Salary, monetary overtime, funded loan recoveries and supported published statutory calculations are available in Payroll Runs. Rule bundles require independent review and an authorized publisher. Payroll journals use independent Finance acceptance and shared General Ledger posting. Payslips support independent publication and frozen documents. Payment integration is deferred until Banking delivery.",
      ];
      if (q.section === "salaries")
        notices.push(
          "Approval requires an independent authorized actor. A declared successor closes its reviewed predecessor atomically; historical salary amounts and approvals remain unchanged.",
        );
      if (q.section === "loans")
        notices.push(
          "Approval prepares a currency-exact interest-free schedule. An independent officer must link the posted Bank Payment and bank confirmation before recovery. Current instalments are consumed only at final Payroll approval; overdue, unverified and unsupported loans block execution. Approved recovery commits the Payroll deduction; General Ledger posting remains a separate financial step.",
        );
      if (q.section === "payslips")
        notices.push("Only explicitly released payslips from posted payroll results appear here.");
      return {
        company_id: q.company_id,
        section: q.section,
        month: q.month,
        items,
        total,
        limit: q.limit,
        offset: q.offset,
        notices,
      };
    });
  }
  async options(c: HrActorContext, q: HrPayrollOptionsQuery): Promise<HrPayrollOptions> {
    const grants = ["setup", "salary", "adjustment", "loan"].map((p) => "hr.payroll." + p + ".read");
    if (!grants.some((p) => c.actor.permissions.includes(p))) deny();
    return this.d.read(
      c,
      grants.find((p) => c.actor.permissions.includes(p))!,
      async (client) => {
        await this.company(client, c, q.company_id);
        const params = [c.tenantId, q.company_id, "%" + q.search.replace(/[\\%_]/g, "\\$&") + "%", q.on_date],
          has = (p: string) => c.actor.permissions.includes("hr.payroll." + p + ".read");
        const employees =
          has("salary") || has("adjustment") || has("loan")
            ? (
                await client.query(
                  `select e.id,concat_ws(' · ',e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name)) as label from employee e where e.tenant_id=$1 and concat_ws(' ',e.employee_number,e.first_name,e.middle_name,e.last_name) ilike $3 and exists(select 1 from employee_assignment a left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=e.tenant_id and a.employee_id=e.id and a.company_id=$2 and a.effective_from<=$4::date and (a.effective_to is null or a.effective_to>=$4::date) and (a.assignment_status='legacy_compatibility' or (a.assignment_status in('active','ended') and er.approval_state='approved' and er.status in('active','ended')))) order by e.employee_number,e.id limit 101`,
                  params,
                )
              ).rows
            : [];
        const accounts = has("setup")
          ? (
              await client.query(
                `select id,code||' · '||name as label,type from account where tenant_id=$1 and company_id=$2 and status='active' and not is_header and type in('expense','liability') order by code,id limit 501`,
                params.slice(0, 2),
              )
            ).rows
          : [];
        const components = (
          await client.query(
            `select id,code||' · '||name as label,kind,method from hr_pay_component where tenant_id=$1 and company_id=$2 and status='active' order by position,code,id limit 501`,
            params.slice(0, 2),
          )
        ).rows;
        const structures = has("salary")
          ? (
              await client.query(
                `select id,code||' · '||name as label,currency_code from hr_salary_structure where tenant_id=$1 and company_id=$2 and status='active' order by code,id limit 501`,
                params.slice(0, 2),
              )
            ).rows
          : [];
        return {
          employees: employees.slice(0, 100),
          accounts: accounts.slice(0, 500),
          components: components.slice(0, 500),
          structures: structures.slice(0, 500),
          truncated:
            employees.length > 100 || accounts.length > 500 || components.length > 500 || structures.length > 500,
        };
      },
    );
  }
  async runWrite(
    c: HrActorContext,
    company: string,
    permission: string,
    key: string,
    corr: string,
    path: string,
    input: unknown,
    operation: (client: PoolClient) => Promise<{
      id: string;
      status: string;
      version: number;
      kind: string;
      before: unknown;
      after: unknown;
      override?: string | null;
    }>,
    authorize?: (client: PoolClient) => Promise<void>,
  ): Promise<HrPayrollMutationResult> {
    if (!c.actor.permissions.includes(permission)) deny();
    if (c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId)) deny();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new HrApiError(400, "INVALID_IDEMPOTENCY_KEY", "Use a valid idempotency key.");
    const client = await this.d.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      await this.company(client, c, company);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        "nexora:payroll:" + c.tenantId + ":" + company,
      ]);
      if (typeof input === "object" && input !== null && "action" in input && input.action === "confirm_disbursement")
        await requireLoanDisbursementAuthority(client, c, company);
      if (authorize) await authorize(client);
      const fingerprint = attendanceHash(input),
        replay = (
          await client.query(
            `select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4`,
            [c.tenantId, c.actor.userId, path, key],
          )
        ).rows[0];
      if (replay) {
        if (replay.request_fingerprint !== fingerprint)
          throw new HrApiError(409, "IDEMPOTENCY_CONFLICT", "This key was used for different Payroll terms.");
        await client.query("commit");
        return { ...replay.response_body, replayed: true };
      }
      const outcome = await operation(client),
        hash = attendanceHash(outcome.after),
        reason = (input as { reason: string }).reason;
      await client.query(
        `insert into hr_payroll_workspace_event(tenant_id,id,company_id,record_id,record_type,action,reason,actor_id,before_json,after_json,source_hash,override_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
        [
          c.tenantId,
          "payroll-event-" + randomUUID(),
          company,
          outcome.id,
          outcome.kind,
          (input as { action?: string }).action ?? "create",
          reason,
          c.actor.userId,
          JSON.stringify(outcome.before),
          JSON.stringify(outcome.after),
          hash,
          outcome.override ?? null,
        ],
      );
      const audit = await this.d.audit(client, c, corr, outcome.id, outcome.before, outcome.after),
        result = {
          id: outcome.id,
          company_id: company,
          status: outcome.status,
          version: outcome.version,
          audit_event_id: audit,
          replayed: false,
        };
      await client.query(
        `insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
        [c.tenantId, c.actor.userId, path, key, fingerprint, result, attendanceHash(result)],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (
        error &&
        typeof error === "object" &&
        "constraint" in error &&
        error.constraint === "hr_settled_salary_change"
      )
        throw new HrApiError(
          409,
          "HR_SETTLEMENT_CORRECTION_REQUIRED",
          "Correct the approved salary-based final settlement independently before submitting or approving a salary change that covers its exit date.",
        );
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23505", "23514", "23P01", "P0001", "23503", "22003"].includes(String(error.code))
      )
        throw Object.assign(
          new HrApiError(
            409,
            "HR_PAYROLL_REVIEW_REQUIRED",
            "Payroll terms conflict with an existing record, effective period, source scope or accounting rule. Refresh and review the record.",
          ),
          { cause: error },
        );
      throw error;
    } finally {
      client.release();
    }
  }
  private async employee(client: PoolClient, c: HrActorContext, company: string, employee: string, date: string) {
    const valid = await client.query(
      `select 1 from employee_assignment a left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=$1 and a.company_id=$2 and a.employee_id=$3 and a.effective_from<=$4::date and (a.effective_to is null or a.effective_to>=$4::date) and (a.assignment_status='legacy_compatibility' or (a.assignment_status in('active','ended') and er.approval_state='approved' and er.status in('active','ended')))`,
      [c.tenantId, company, employee, date],
    );
    if (!valid.rowCount) fail("Choose an employee with an approved operational placement on the effective date.");
  }
  private async component(client: PoolClient, c: HrActorContext, company: string, id: string) {
    const r = await this.load(client, c, "components", company, id);
    if (r.status !== "active") fail("The pay component must be active.");
    return r;
  }
  private async ensureUnfrozen(client: PoolClient, c: HrActorContext, company: string, date: string) {
    if (
      (
        await client.query(
          `select 1 from hr_payroll_period where tenant_id=$1 and company_id=$2 and month>=date_trunc('month',$3::date)::date and state<>'open' limit 1`,
          [c.tenantId, company, date],
        )
      ).rowCount
    )
      fail(
        "A calculated or finalized Payroll period already covers this effective date. Use the governed correction process.",
      );
  }
  async create(
    c: HrActorContext,
    input: CreateHrPayrollRecord,
    key: string,
    corr: string,
  ): Promise<HrPayrollMutationResult> {
    const section = sectionFor[input.kind],
      permission = this.permission(section, "manage");
    return this.runWrite(
      c,
      input.company_id,
      permission,
      key,
      corr,
      "/api/v1/hr/payroll_records",
      input,
      async (client) => {
        const id = "payroll-" + input.kind + "-" + randomUUID(),
          tenant = c.tenantId,
          company = input.company_id,
          actor = c.actor.userId;
        let status = "draft";
        if (input.kind === "component") {
          const account = (
            await client.query(
              `select id from account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and not is_header and type=$4`,
              [tenant, company, input.account_id, input.component_kind === "earning" ? "expense" : "liability"],
            )
          ).rows[0];
          if (!account) fail("Choose an active posting account of the correct type from this company.");
          if (input.method === "formula") {
            const preceding = (
              await client.query(
                `select code from hr_pay_component where tenant_id=$1 and company_id=$2 and status='active' and position<$3`,
                [tenant, company, input.position],
              )
            ).rows;
            validatePayrollFormula(
              input.formula!,
              new Set(["PAID_DAYS", "UNPAID_DAYS", "CALENDAR_DAYS", ...preceding.map((r) => r.code)]),
            );
          }
          await client.query(
            `insert into hr_pay_component(id,tenant_id,company_id,code,name,kind,method,formula,taxable,prorated,expense_account_id,liability_account_id,position,created_by,workflow_managed) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true)`,
            [
              id,
              tenant,
              company,
              input.code,
              input.name,
              input.component_kind,
              input.method,
              input.formula,
              input.taxable,
              input.prorated,
              input.component_kind === "earning" ? input.account_id : null,
              input.component_kind === "deduction" ? input.account_id : null,
              input.position,
              actor,
            ],
          );
          status = "active";
        } else if (input.kind === "structure") {
          await client.query(
            `insert into hr_salary_structure(id,tenant_id,company_id,code,name,description,currency_code,created_by,workflow_managed) values($1,$2,$3,$4,$5,$6,$7,$8,true)`,
            [id, tenant, company, input.code, input.name, input.description, input.currency_code, actor],
          );
          const sources = [];
          for (const item of input.items)
            sources.push({ item, component: await this.component(client, c, company, item.component_id) });
          sources.sort(
            (a, b) =>
              Number(a.component.position) - Number(b.component.position) ||
              String(a.component.code).localeCompare(String(b.component.code)),
          );
          const variables = new Set(["PAID_DAYS", "UNPAID_DAYS", "CALENDAR_DAYS"]);
          let pos = 0;
          for (const { item, component } of sources) {
            if ((component.method === "fixed") !== (item.amount !== null))
              fail("Structure items must use the component calculation method.");
            if (item.formula) validatePayrollFormula(item.formula, variables);
            await client.query(
              `insert into hr_salary_structure_item(tenant_id,structure_id,component_id,amount,formula_override,position) values($1,$2,$3,$4,$5,$6)`,
              [tenant, id, item.component_id, item.amount, item.formula, ++pos],
            );
            variables.add(String(component.code));
          }
          status = "active";
        } else if (input.kind === "salary") {
          await this.employee(client, c, company, input.employee_id, input.effective_from);
          if (input.effective_to) await this.employee(client, c, company, input.employee_id, input.effective_to);
          await this.ensureUnfrozen(client, c, company, input.effective_from);
          const structure = await this.load(client, c, "structures", company, input.structure_id);
          if (structure.status !== "active" || structure.currency_code !== input.currency_code)
            fail("Choose an active structure with an explicit matching currency.");
          let predecessor: HrPayrollItem | null = null;
          if (input.supersedes_id) {
            const previous = await this.load(client, c, "salaries", company, input.supersedes_id);
            predecessor = await this.map(client, c, "salaries", previous);
            if (
              previous.employee_id !== input.employee_id ||
              !["approved", "effective"].includes(predecessor.status) ||
              predecessor.details.closed_by_successor_id ||
              predecessor.effective_from! >= input.effective_from ||
              (predecessor.effective_to && predecessor.effective_to < input.effective_from)
            )
              fail(
                "Choose the current approved salary for this employee; the successor must start later within its covered dates.",
              );
          }
          const items = (
            await client.query(
              `select i.*,c.method,c.status from hr_salary_structure_item i join hr_pay_component c on c.tenant_id=i.tenant_id and c.id=i.component_id and c.company_id=$3 where i.tenant_id=$1 and i.structure_id=$2 order by i.position`,
              [tenant, input.structure_id, company],
            )
          ).rows;
          if (!items.length || items.some((r) => r.status !== "active"))
            fail("The salary structure needs active component items.");
          await client.query(
            `insert into hr_salary_assignment(id,tenant_id,company_id,employee_id,structure_id,currency_code,effective_from,effective_to,reason,created_by,compensation_type,payment_basis,compensation_model_version,workflow_managed,supersedes_id,predecessor_version,predecessor_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,true,$13,$14,$15)`,
            [
              id,
              tenant,
              company,
              input.employee_id,
              input.structure_id,
              input.currency_code,
              input.effective_from,
              input.effective_to,
              input.reason,
              actor,
              input.compensation_type,
              input.payment_basis,
              input.supersedes_id,
              predecessor?.version ?? null,
              predecessor?.source_hash ?? null,
            ],
          );
          for (const item of items)
            await client.query(
              `insert into hr_salary_assignment_component(id,tenant_id,company_id,assignment_id,structure_id,component_id,position,method,amount,formula,currency_code,evidence_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
              [
                "salary-item-" + randomUUID(),
                tenant,
                company,
                id,
                input.structure_id,
                item.component_id,
                item.position,
                item.method,
                item.amount,
                item.formula_override,
                input.currency_code,
                attendanceHash(item),
              ],
            );
        } else if (input.kind === "adjustment") {
          await this.employee(client, c, company, input.employee_id, input.effective_month);
          await this.ensureUnfrozen(client, c, company, input.effective_month);
          await this.component(client, c, company, input.component_id);
          await client.query(
            `insert into hr_payroll_adjustment(id,tenant_id,company_id,employee_id,component_id,effective_month,amount,reason,created_by,workflow_managed) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
            [
              id,
              tenant,
              company,
              input.employee_id,
              input.component_id,
              input.effective_month,
              input.amount,
              input.reason,
              actor,
            ],
          );
        } else {
          await this.employee(client, c, company, input.employee_id, input.start_month);
          await this.ensureUnfrozen(client, c, company, input.start_month);
          const comp = await this.component(client, c, company, input.component_id);
          if (comp.kind !== "deduction" || comp.method !== "fixed")
            fail("Loan recovery requires an active fixed deduction component.");
          const currency = (
            await client.query(
              "select decimal_places from currency where tenant_id=$1 and code=$2 and status='active'",
              [tenant, input.currency_code],
            )
          ).rows[0];
          if (!currency || currency.decimal_places > 4) fail("Choose an active currency with supported precision.");
          loanSchedule(input.principal, input.instalment_count, currency.decimal_places);
          await client.query(
            `insert into hr_employee_loan(id,tenant_id,company_id,employee_id,reference,principal,currency_code,start_month,instalment_count,component_id,created_by,workflow_managed) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
            [
              id,
              tenant,
              company,
              input.employee_id,
              input.reference,
              input.principal,
              input.currency_code,
              input.start_month,
              input.instalment_count,
              input.component_id,
              actor,
            ],
          );
        }
        const after = await this.map(client, c, section, await this.load(client, c, section, company, id));
        return { id, status, version: 1, kind: input.kind, before: null, after };
      },
    );
  }
  async action(
    c: HrActorContext,
    id: string,
    input: HrPayrollRecordAction,
    key: string,
    corr: string,
  ): Promise<HrPayrollMutationResult> {
    const section = input.section,
      permission = this.permission(
        section,
        ["approve", "reject", "confirm_disbursement"].includes(input.action) ? "approve" : "manage",
      );
    return this.runWrite(
      c,
      input.company_id,
      permission,
      key,
      corr,
      "/api/v1/hr/payroll_records/" + id + "/actions",
      input,
      async (client) => {
        const row = await this.load(client, c, section, input.company_id, id),
          before = await this.map(client, c, section, row),
          def = definitions[section];
        if (!before.workflow_managed) fail("This legacy Payroll record is read-only.");
        if (before.version !== input.expected_version || before.source_hash !== input.source_hash)
          fail("Payroll source terms changed. Refresh and review again.");
        const config = ["components", "structures"].includes(section),
          state = before.status;
        let next = "",
          override: string | null = null;
        if (input.action === "confirm_disbursement") {
          if (section !== "loans") fail("Disbursement confirmation is only available for loans.");
          await this.ensureUnfrozen(client, c, input.company_id, before.effective_from!);
          await this.employee(client, c, input.company_id, before.employee_id!, before.effective_from!);
          await confirmLoanDisbursement(client, c, row, input);
          next = "active";
        } else if (config) {
          if (!["activate", "deactivate"].includes(input.action)) fail("Choose an available configuration action.");
          next = input.action === "activate" ? "active" : "inactive";
          if (next === state) fail("The configuration already has this status.");
          if (next === "active" && section === "components") {
            const account = await client.query(
              `select 1 from account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and not is_header and type=$4`,
              [
                c.tenantId,
                input.company_id,
                row.expense_account_id ?? row.liability_account_id,
                row.kind === "earning" ? "expense" : "liability",
              ],
            );
            if (!account.rowCount) fail("Restore a valid active posting account before reactivating this component.");
          }
          if (next === "active" && section === "structures") {
            const components = (
              await client.query(
                `select c.status from hr_salary_structure_item i join hr_pay_component c on c.tenant_id=i.tenant_id and c.id=i.component_id and c.company_id=$3 where i.tenant_id=$1 and i.structure_id=$2`,
                [c.tenantId, id, input.company_id],
              )
            ).rows;
            if (!components.length || components.some((r) => r.status !== "active"))
              fail("All structure components must be active before the structure is reactivated.");
          }

          if (
            section === "components" &&
            next === "inactive" &&
            (
              await client.query(
                `select 1 from hr_salary_structure_item i join hr_salary_structure s on s.tenant_id=i.tenant_id and s.id=i.structure_id where i.tenant_id=$1 and i.component_id=$2 and s.status='active' limit 1`,
                [c.tenantId, id],
              )
            ).rowCount
          )
            fail("An active salary structure still uses this component.");
        } else {
          if (input.action === "submit" && state === "draft") next = "submitted";
          else if (["approve", "reject"].includes(input.action) && state === "submitted") {
            const bindings = before.employee_id
              ? (
                  await client.query(
                    `select user_id from employee_user_binding where tenant_id=$1 and employee_id=$2 and ended_at is null and effective_from<=current_date and (effective_to is null or effective_to>=current_date)`,
                    [c.tenantId, before.employee_id],
                  )
                ).rows
              : [];
            const makers = [before.created_by, before.submitted_by ?? "", ...bindings.map((r) => r.user_id)],
              policy = evaluateApprovalActor({
                account: c.actor,
                normalDecisionPermission: permission,
                makerActorIds: makers,
                impersonated: Boolean(c.impersonationRequestId || (c.realActorId && c.realActorId !== c.actor.userId)),
              });
            if (policy.kind === "forbidden" || (policy.kind === "override" && !input.confirm_override))
              throw new HrApiError(
                403,
                "HR_PAYROLL_INDEPENDENT_APPROVAL_REQUIRED",
                "An independent approver or an explicit governed super-administrator override is required.",
              );
            override = await this.d.override(client, c, {
              normalDecisionPermission: permission,
              makerActorIds: makers,
              resourceType: "hr_payroll_" + def.kind,
              resourceId: id,
              decisionAction: input.action as "approve" | "reject",
              reason: input.reason,
              correlationId: corr,
              idempotencyKey: key,
            });
            next = input.action === "approve" ? "approved" : section === "salaries" ? "cancelled" : "rejected";
          } else if (input.action === "cancel" && ["draft", "submitted"].includes(state) && section !== "adjustments") {
            if (before.created_by !== c.actor.userId) deny();
            next = "cancelled";
          } else fail("This action is unavailable for the current Payroll state.");
          if (next === "submitted" && before.created_by !== c.actor.userId) deny();
          if (["submitted", "approved"].includes(next)) {
            const effective = before.effective_from!;
            await this.employee(client, c, input.company_id, before.employee_id!, effective);
            await this.ensureUnfrozen(client, c, input.company_id, effective);
            if (section === "salaries") {
              const structure = await this.load(client, c, "structures", input.company_id, String(row.structure_id));
              if (structure.status !== "active") fail("The salary structure is inactive.");
              if (before.effective_to)
                await this.employee(client, c, input.company_id, before.employee_id!, before.effective_to);
            } else await this.component(client, c, input.company_id, String(row.component_id));
          }
        }

        if (section === "salaries" && next === "approved" && row.supersedes_id) {
          const previousRow = await this.load(client, c, "salaries", input.company_id, String(row.supersedes_id)),
            previous = await this.map(client, c, "salaries", previousRow);
          if (
            previous.version !== Number(row.predecessor_version) ||
            previous.source_hash !== row.predecessor_hash ||
            !["approved", "effective"].includes(previous.status)
          )
            fail(
              "The predecessor salary changed after this revision was drafted. Cancel this draft and create a fresh reviewed successor.",
            );
          const closed = await client.query(
            `update hr_salary_assignment set effective_to=$4::date-1,closed_by_successor_id=$5,version=version+1 where tenant_id=$1 and company_id=$2 and id=$3 and version=$6`,
            [c.tenantId, input.company_id, previous.id, before.effective_from, id, previous.version],
          );
          if (closed.rowCount !== 1) fail("The predecessor salary changed during approval.");
          const afterPrevious = await this.map(
            client,
            c,
            "salaries",
            await this.load(client, c, "salaries", input.company_id, previous.id),
          );
          await client.query(
            `insert into hr_payroll_workspace_event(tenant_id,id,company_id,record_id,record_type,action,reason,actor_id,before_json,after_json,source_hash,override_id) values($1,$2,$3,$4,'salary','successor_close',$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
            [
              c.tenantId,
              "salary-close-" + randomUUID(),
              input.company_id,
              previous.id,
              input.reason,
              c.actor.userId,
              JSON.stringify(previous),
              JSON.stringify(afterPrevious),
              attendanceHash(afterPrevious),
              override,
            ],
          );
          await this.d.audit(client, c, corr, previous.id, previous, afterPrevious);
        }
        const sets = [`${config ? "status" : "state"}=$4`, "version=version+1"];

        const params: unknown[] = [c.tenantId, input.company_id, id, next];
        if (next === "submitted") {
          params.push(c.actor.userId);
          sets.push(`submitted_by=$${params.length}`, "submitted_at=now()");
        }
        if (next === "approved" || next === "rejected" || (input.action === "reject" && section === "salaries")) {
          params.push(c.actor.userId);
          sets.push(`approved_by=$${params.length}`, "approved_at=now()");
        }
        params.push(input.expected_version);
        const changed = await client.query(
          `update ${def.table} set ${sets.join(",")} where tenant_id=$1 and company_id=$2 and id=$3 and version=$${params.length}`,
          params,
        );
        if (changed.rowCount !== 1) fail("The Payroll record changed during the decision. Refresh and review again.");
        if (section === "loans" && next === "approved") {
          const currency = (
            await client.query(
              "select decimal_places from currency where tenant_id=$1 and code=$2 and status='active'",
              [c.tenantId, row.currency_code],
            )
          ).rows[0];
          if (!currency || currency.decimal_places > 4) fail("The loan currency is unavailable.");
          const amounts = loanSchedule(String(row.principal), Number(row.instalment_count), currency.decimal_places);
          for (const [i, amount] of amounts.entries())
            await client.query(
              `insert into hr_loan_instalment(id,tenant_id,loan_id,due_month,amount) values($1,$2,$3,($4::date+($5::text||' months')::interval)::date,$6)`,
              ["loan-due-" + randomUUID(), c.tenantId, id, text(row, "start_month"), i, amount],
            );
        }
        const after = await this.map(client, c, section, await this.load(client, c, section, input.company_id, id));
        return { id, status: next, version: after.version, kind: def.kind, before, after, override };
      },
      section === "adjustments"
        ? (client) => requireSettlementPayrollDecision(client, c, input.company_id, id, input.action)
        : undefined,
    );
  }
}
