import type { HrPayrollRunWorkspace, HrPayrollSection } from "@nexora/contracts";

import { lifecycleWorkspace, payrollWorkspace } from "./hr-section-navigation";
import {
  countLabel,
  details,
  humanize,
  nameList,
  tally,
  type HrLandingSummaryContext,
  type HrLandingSummaryLoader,
  type HrLandingSummaryLoaders,
} from "./hr-landing-summary";
import { attendanceLeaveWorkspace } from "./time-workspace-navigation";

/**
 * Landing-card facts for the operations hubs (Attendance & Leave, Payroll, Performance, Learning, Lifecycle,
 * Benefits and Compliance). Every fact is read from the authorized API; list reads are bounded, so state
 * breakdowns are shown only when the whole list fitted in one page.
 */

/** Page ids of a workspace definition, so a page without a loader is a type error. */
type PageIdOf<Workspace> = Workspace extends { groups: readonly (infer Group)[] }
  ? Group extends { pages: readonly (infer Page)[] }
    ? Page extends { id: infer Id extends string }
      ? Id
      : never
    : never
  : never;
type WorkspaceLoaders<Workspace> = Readonly<Record<PageIdOf<Workspace>, HrLandingSummaryLoader>>;

const pad = (value: number) => String(value).padStart(2, "0");
/** Today in the browser's local calendar, as an ISO date. */
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
/** First day of the local month, `offset` months from now. */
const monthStart = (offset = 0) => {
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${month.getFullYear()}-${pad(month.getMonth() + 1)}-01`;
};
/** "2026-10-01" -> "Oct 2026". */
const monthLabel = (isoMonth: string) => {
  const [year, month] = isoMonth.split("-").map(Number);
  return new Date(year!, (month ?? 1) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};
const amount = (value: string, currency: string | null | undefined) =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value))}${currency ? ` ${currency}` : ""}`;
/** A state breakdown only when every record was read; a partial page would misstate the counts. */
const stateTally = (states: readonly string[], total: number, label?: (value: string) => string) =>
  states.length && states.length >= total ? tally(states, label) : null;
const joined = (...parts: readonly (string | false | null | undefined)[]) =>
  parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" · ");

/* ------------------------------------------------------------------ Attendance & Leave */

const leaveStatusCount = (
  { client, companyId, once }: HrLandingSummaryContext,
  status: "pending_manager" | "pending_hr" | "approved",
) =>
  once(`leave-requests:${status}`, () =>
    client
      .listLeaveRequests({
        company_id: companyId,
        as_of: today(),
        status,
        queue_only: "false",
        limit: 1,
        offset: 0,
      })
      .then((directory) => directory.total),
  );
const attendancePeriod = ({ client, companyId, once }: HrLandingSummaryContext, month: string) =>
  once(`attendance-period:${month}`, () =>
    client.periodWorkspace({ company_id: companyId, month, limit: 1, offset: 0 }),
  );
const correctionCount = (
  { client, companyId, once }: HrLandingSummaryContext,
  status?: "pending_manager" | "pending_hr",
) =>
  once(`attendance-corrections:${status ?? "all"}`, () =>
    client.corrections({ company_id: companyId, status, limit: 1, offset: 0 }).then((directory) => directory.total),
  );

const attendanceSummaries: WorkspaceLoaders<typeof attendanceLeaveWorkspace> = {
  shifts: async ({ client, companyId, once }) => {
    const { items, total } = await once("shifts:all", () => client.shifts({ companyId, limit: 100 }));
    if (!total) return [];
    const active = items.filter((shift) => shift.status === "active");
    const inactive = items.length - active.length;
    return details(
      joined(countLabel(active.length, "active shift"), inactive > 0 && `${inactive} inactive`),
      stateTally(
        active.map((shift) => shift.kind),
        active.length,
        (kind) => `${humanize(kind)}`,
      ),
      nameList(active.map((shift) => shift.name)),
    );
  },
  "shift-assignments": async ({ client, companyId, once }) => {
    const [active, scheduled] = await Promise.all([
      once("shift-allocations:active", () => client.shiftAllocations({ companyId, state: "active", limit: 50 })),
      once("shift-allocations:scheduled", () => client.shiftAllocations({ companyId, state: "scheduled", limit: 1 })),
    ]);
    if (!active.total && !scheduled.total) return [];
    return details(
      joined(countLabel(active.total, "active assignment"), scheduled.total > 0 && `${scheduled.total} scheduled`),
      stateTally(
        active.items.map((allocation) => allocation.scope),
        active.total,
        (scope) => `by ${scope}`,
      ),
      active.items.length
        ? `Shifts: ${nameList(
            active.items.map((allocation) => allocation.shift_name),
            2,
          )}`
        : null,
    );
  },
  "leave-types": async ({ client, companyId, once }) => {
    const { items, total } = await once("leave-types", () =>
      client.listLeaveTypes({ company_id: companyId, as_of: today(), limit: 50, offset: 0 }),
    );
    if (!total) return [];
    const active = items.filter((type) => type.status === "active");
    const paid = active.filter((type) => type.paid).length;
    return details(
      countLabel(active.length, "active leave type"),
      items.length >= total ? joined(`${paid} paid`, `${active.length - paid} unpaid`) : null,
      nameList(active.map((type) => type.name)),
    );
  },
  "leave-balances": async ({ client, companyId, once }) => {
    const { items, total } = await once("leave-balances", () =>
      client.listLeaveBalances({ company_id: companyId, as_of: today(), limit: 50, offset: 0 }),
    );
    if (!total) return [];
    const complete = items.length >= total;
    const reserved = items.filter((balance) => Number(balance.reserved) > 0).length;
    return details(
      countLabel(total, "balance record"),
      complete &&
        joined(
          countLabel(new Set(items.map((balance) => balance.employee_id)).size, "employee"),
          countLabel(new Set(items.map((balance) => balance.leave_type_id)).size, "leave type"),
        ),
      complete && reserved > 0 && `${reserved} with reserved days`,
    );
  },
  "leave-requests": async (context) => {
    const { client, companyId, once } = context;
    const [total, manager, hr, approved] = await Promise.all([
      once("leave-requests:all", () =>
        client
          .listLeaveRequests({ company_id: companyId, as_of: today(), queue_only: "false", limit: 1, offset: 0 })
          .then((directory) => directory.total),
      ),
      leaveStatusCount(context, "pending_manager"),
      leaveStatusCount(context, "pending_hr"),
      leaveStatusCount(context, "approved"),
    ]);
    if (!total) return [];
    return details(
      countLabel(total, "leave request"),
      manager + hr > 0 ? joined(`${manager} awaiting manager`, `${hr} awaiting HR`) : "None awaiting approval",
      approved > 0 && `${approved} approved`,
    );
  },
  "leave-approval": async (context) => {
    const { client, companyId, once } = context;
    const [queue, manager, hr] = await Promise.all([
      once("leave-requests:queue", () =>
        client
          .listLeaveRequests({ company_id: companyId, as_of: today(), queue_only: "true", limit: 1, offset: 0 })
          .then((directory) => directory.total),
      ),
      leaveStatusCount(context, "pending_manager"),
      leaveStatusCount(context, "pending_hr"),
    ]);
    if (!queue && !manager && !hr) return [];
    return details(
      queue > 0 ? `${queue} in your approval queue` : "Your approval queue is clear",
      manager > 0 && `${manager} awaiting manager`,
      hr > 0 && `${hr} awaiting HR`,
    );
  },
  "attendance-check-in": async ({ client, companyId }) => {
    const self = await client.selfAttendance({ company_id: companyId, from: today(), to: today() }).catch(() => null);
    const record = self?.today_record;
    if (!self) return [];
    return details(
      !record?.check_in_time
        ? "Not checked in today"
        : record.check_out_time
          ? `Checked out today after ${Math.floor(record.worked_minutes / 60)}h ${record.worked_minutes % 60}m`
          : `Checked in today at ${record.check_in_time}`,
    );
  },
  "my-attendance": async ({ client, companyId }) => {
    const month = monthStart();
    const self = await client.selfAttendance({ company_id: companyId, from: month, to: today() }).catch(() => null);
    if (!self?.summary.recorded_days) return [];
    return details(
      `${monthLabel(month)}: ${countLabel(self.summary.recorded_days, "recorded day")}`,
      self.summary.late > 0 && `${self.summary.late} late`,
    );
  },
  "daily-attendance": async ({ client, companyId, once }) => {
    const day = await once("daily-attendance:today", () =>
      client.dailyAttendance({ company_id: companyId, on_date: today(), limit: 100, offset: 0 }),
    );
    if (!day.total) return [];
    const complete = day.items.length >= day.total;
    const withIssues = day.items.filter((row) => row.issues.length > 0).length;
    return details(
      `${countLabel(day.total, "employee")} today`,
      stateTally(
        day.items.map((row) => row.status),
        day.total,
      ),
      complete && withIssues > 0 && `${withIssues} with exceptions`,
    );
  },
  "attendance-corrections": async (context) => {
    const [total, manager, hr] = await Promise.all([
      correctionCount(context),
      correctionCount(context, "pending_manager"),
      correctionCount(context, "pending_hr"),
    ]);
    if (!total) return [];
    return details(
      countLabel(total, "correction"),
      manager + hr > 0 ? joined(`${manager} awaiting manager`, `${hr} awaiting HR`) : "None awaiting approval",
    );
  },
  overtime: async ({ client, companyId, once }) => {
    const month = monthStart();
    const [requests, rules] = await Promise.all([
      once(`overtime:${month}`, () => client.listOvertime({ company_id: companyId, month, limit: 50, offset: 0 })),
      once("overtime-context:today", () => client.overtimeContext({ company_id: companyId, on_date: today() })),
    ]);
    if (!requests.total && !rules.rules.length) return [];
    return details(
      rules.rules.length
        ? `${countLabel(rules.rules.length, "rule")}: ${nameList(rules.rules.map((rule) => humanize(rule.category)))}`
        : "No overtime rules in effect",
      `${monthLabel(month)}: ${countLabel(requests.total, "request")}`,
      stateTally(
        requests.items.map((request) => request.status),
        requests.total,
      ),
    );
  },
  "monthly-attendance": async ({ client, companyId, once }) => {
    const month = monthStart();
    const sheet = await once(`monthly-attendance:${month}`, () =>
      client.monthlyAttendance({ company_id: companyId, month, limit: 1, offset: 0 }),
    );
    if (!sheet.total) return [];
    return details(
      `${monthLabel(month)}: ${countLabel(sheet.total, "employee")}`,
      sheet.period_state ? `Period ${humanize(sheet.period_state)}` : "Period not opened",
    );
  },
  "attendance-period": async (context) => {
    const [current, previous] = await Promise.all([
      attendancePeriod(context, monthStart()),
      attendancePeriod(context, monthStart(-1)),
    ]);
    if (!current.period && !previous.period) return [];
    const line = (month: string, workspace: typeof current) =>
      `${monthLabel(month)} ${workspace.period ? humanize(workspace.period.state) : "not opened"}`;
    return details(
      line(monthStart(), current),
      current.period &&
        joined(
          countLabel(current.period.employee_count, "employee"),
          countLabel(current.period.exception_count, "exception"),
        ),
      line(monthStart(-1), previous),
    );
  },
};

/* ------------------------------------------------------------------ Payroll */

const payrollRecords = ({ client, companyId, once }: HrLandingSummaryContext, section: HrPayrollSection) => {
  const month = monthStart();
  return once(`payroll:${section}:${month}`, () =>
    client.payrollWorkspace({ company_id: companyId, section, month, search: "", limit: 50, offset: 0 }),
  );
};
/** Loan or advance requests: count and state breakdown. */
const loanRequestSummary =
  (loanKind: "loan" | "advance", singular: string) =>
  async ({ client, companyId, once }: HrLandingSummaryContext) => {
    const month = monthStart();
    const workspace = await once(`payroll:loans:${loanKind}:${month}`, () =>
      client.payrollWorkspace({
        company_id: companyId,
        section: "loans",
        month,
        search: "",
        loan_kind: loanKind,
        limit: 50,
        offset: 0,
      }),
    );
    if (!workspace.total) return [];
    return details(
      countLabel(workspace.total, singular),
      stateTally(
        workspace.items.map((item) => item.status),
        workspace.total,
      ),
    );
  };
/** A governed payroll master: count, state breakdown and a few names. */
const payrollRecordSummary =
  (section: HrPayrollSection, singular: string, options: { names?: boolean; month?: boolean } = {}) =>
  async (context: HrLandingSummaryContext) => {
    const { items, total } = await payrollRecords(context, section);
    if (!total) return [];
    return details(
      options.month ? `${monthLabel(monthStart())}: ${countLabel(total, singular)}` : countLabel(total, singular),
      stateTally(
        items.map((item) => item.status),
        total,
      ),
      options.names && nameList(items.map((item) => item.title)),
    );
  };

const payrollRun = ({ client, companyId, once }: HrLandingSummaryContext, month: string) =>
  once(`payroll-run:${month}`, () => client.payrollRunWorkspace({ company_id: companyId, month, limit: 1, offset: 0 }));
/** The current month's run, or last month's when this month has not been opened yet. */
const latestPayrollRun = (context: HrLandingSummaryContext) =>
  context.once("payroll-run:latest", async (): Promise<HrPayrollRunWorkspace | null> => {
    const current = await payrollRun(context, monthStart());
    if (current.period) return current;
    const previous = await payrollRun(context, monthStart(-1));
    return previous.period ? previous : null;
  });
const runLabel = (run: HrPayrollRunWorkspace) =>
  `${monthLabel(run.month)} run ${run.period?.run_number ?? 1} · ${humanize(run.period?.state ?? "not opened")}`;

const payrollSummaries: WorkspaceLoaders<typeof payrollWorkspace> = {
  "payroll-setup": payrollRecordSummary("components", "pay component", { names: true }),
  "salary-structures": payrollRecordSummary("structures", "salary structure", { names: true }),
  "salary-revisions": payrollRecordSummary("salaries", "salary record"),
  "payroll-inputs": payrollRecordSummary("adjustments", "adjustment", { month: true }),
  "payroll-runs": async (context) => {
    const run = await latestPayrollRun(context);
    if (!run) return [];
    return details(
      runLabel(run),
      run.totals
        ? joined(countLabel(run.total, "employee"), `Net ${amount(run.totals.net, run.totals.currency_code)}`)
        : countLabel(run.total, "employee"),
      run.blocked.length > 0 && countLabel(run.blocked.length, "blocker"),
    );
  },
  "payroll-validation": async (context) => {
    const run = await latestPayrollRun(context);
    if (!run) return [];
    return details(
      runLabel(run),
      run.review_access && `Review access: ${humanize(run.review_access)}`,
      run.allowed_actions.length ? `Next: ${run.allowed_actions.map(humanize).join(", ")}` : "No action open to you",
    );
  },
  "payroll-journal": async (context) => {
    const run = await latestPayrollRun(context);
    if (!run) return [];
    const journal = await context.once(`payroll-journal:${run.month}`, () =>
      context.client.payrollJournalWorkspace({ company_id: context.companyId, month: run.month }),
    );
    const proposal = journal.proposal;
    return details(
      `${monthLabel(run.month)} journal ${proposal ? humanize(proposal.state) : "not prepared"}`,
      proposal?.external_entry_number
        ? `Entry ${proposal.external_entry_number}`
        : journal.totals.employee_count > 0 &&
            `${countLabel(journal.totals.employee_count, "employee")} · Net ${amount(journal.totals.net, journal.currency_code)}`,
      journal.blocked.length > 0 && countLabel(journal.blocked.length, "blocker"),
    );
  },
  "payment-batch": async (context) => {
    const run = await latestPayrollRun(context);
    if (!run) return [];
    const payment = await context.once(`payroll-payment:${run.month}`, () =>
      context.client.payrollPaymentWorkspace({ company_id: context.companyId, month: run.month }),
    );
    return details(
      `${monthLabel(run.month)} batch ${payment.batch ? humanize(payment.batch.state) : "not prepared"}`,
      payment.totals.employee_count > 0 &&
        joined(
          countLabel(payment.totals.employee_count, "employee"),
          `Outstanding ${amount(payment.totals.outstanding, payment.currency_code)}`,
        ),
      payment.blocked.length > 0 && countLabel(payment.blocked.length, "blocker"),
    );
  },
  payslips: async (context) => {
    const run = await latestPayrollRun(context);
    if (!run) return [];
    const slips = await context.once(`payslips:${run.month}`, () =>
      context.client.payslipWorkspace({
        company_id: context.companyId,
        month: run.month,
        search: "",
        state: "all",
        limit: 1,
        offset: 0,
      }),
    );
    if (!slips.counts.results) return details(`${monthLabel(run.month)}: no payslips yet`);
    return details(
      `${monthLabel(run.month)}: ${countLabel(slips.counts.results, "payslip")}`,
      joined(`${slips.counts.released} released`, `${slips.counts.pending} pending`),
    );
  },
};

/* ------------------------------------------------------------------ Employee Lifecycle */

type LifecycleSection = "onboarding" | "probation" | "resignation" | "termination" | "clearance";
const lifecycleCaseSummary =
  (section: LifecycleSection, singular: string) =>
  async ({ client, companyId, once }: HrLandingSummaryContext) => {
    const workspace = await once(`lifecycle-cases:${section}`, () =>
      client.lifecycleCaseWorkspace({ company_id: companyId, section, state: "all", search: "", limit: 25, offset: 0 }),
    );
    if (!workspace.total) return [];
    return details(
      countLabel(workspace.total, singular),
      stateTally(
        workspace.items.map((item) => item.state),
        workspace.total,
      ),
      nameList(
        workspace.items.map((item) => item.employee_name),
        2,
      ),
    );
  };

const lifecycleSummaries: WorkspaceLoaders<typeof lifecycleWorkspace> = {
  "lifecycle-policies": async ({ client, companyId, once }) => {
    const { items } = await once("lifecycle-policies", () =>
      client.employmentLifecyclePolicies({ companyId, limit: 50 }),
    );
    if (!items.length) return [];
    const active = items.filter((policy) => policy.status === "active");
    return details(
      countLabel(items.length, "policy", "policies"),
      tally(items.map((policy) => policy.status)),
      active.length > 0 &&
        `Active: ${nameList(
          active.map((policy) => policy.name),
          2,
        )}`,
    );
  },
  onboarding: lifecycleCaseSummary("onboarding", "onboarding case"),
  "probation-reviews": lifecycleCaseSummary("probation", "probation review"),
  "employee-movements": async ({ client, companyId, once }) => {
    const { items } = await once("transfer-requests:all", () =>
      client.transferRequests({ companyId, status: "all", limit: 100 }),
    );
    if (!items.length) return [];
    const pending = items.filter((item) => item.status === "pending").length;
    return details(
      items.length >= 100 ? "100+ transfers" : countLabel(items.length, "transfer"),
      pending > 0 && `${pending} pending approval`,
    );
  },
  "employee-promotions": async ({ client, companyId, once }) => {
    const { items } = await once("promotion-requests:all", () =>
      client.promotionRequests({ companyId, status: "all", limit: 100 }),
    );
    if (!items.length) return [];
    const pending = items.filter((item) => item.status === "pending").length;
    return details(
      items.length >= 100 ? "100+ promotions" : countLabel(items.length, "promotion"),
      pending > 0 && `${pending} pending approval`,
    );
  },
  "loans-benefits": loanRequestSummary("loan", "loan request"),
  "advance-requests": loanRequestSummary("advance", "advance request"),
  resignations: lifecycleCaseSummary("resignation", "resignation"),
  terminations: lifecycleCaseSummary("termination", "termination case"),
  clearance: lifecycleCaseSummary("clearance", "clearance case"),
};

/** Landing-card loaders for the operations hubs, by workspace id and then page id. */
export const hrOperationsLandingSummaries: Readonly<Record<string, HrLandingSummaryLoaders>> = {
  [attendanceLeaveWorkspace.id]: attendanceSummaries,
  [payrollWorkspace.id]: payrollSummaries,
  [lifecycleWorkspace.id]: lifecycleSummaries,
};
