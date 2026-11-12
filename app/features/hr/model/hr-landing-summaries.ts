import type { HrMasterType } from "@nexora/contracts";

import { paymentRouteLabel } from "./employment-setup";
import { hiringBasisLabel } from "./hiring-basis";
import {
  countLabel,
  details,
  humanize,
  nameList,
  tally,
  type HrLandingSummaryContext,
  type HrLandingSummaryLoaders,
} from "./hr-landing-summary";

/** List reads are bounded; a full page is reported as "100+" instead of an exact count. */
const listLimit = 100;
const boundedCount = (length: number, singular: string, plural?: string) =>
  length >= listLimit ? `${listLimit}+ ${plural ?? `${singular}s`}` : countLabel(length, singular, plural);

const units = ({ client, companyId, once }: HrLandingSummaryContext) =>
  once("organization-units", () => client.organizationUnits({ companyId, limit: 200 }));
const masters = ({ client, companyId, once }: HrLandingSummaryContext, type: HrMasterType) =>
  once(`masters:${type}`, () => client.masters({ companyId, type, activeOnly: true, limit: listLimit }));
const dashboard = ({ client, companyId, once }: HrLandingSummaryContext) =>
  once("hr-dashboard", () => client.dashboard(companyId));

/** Organisation & Masters: what each master holds for the selected company. */
export const organisationLandingSummaries: HrLandingSummaryLoaders = {
  "org-structure": async (context) => {
    const [companies, directory] = await Promise.all([
      context.once("companies", () => context.client.companies()),
      units(context),
    ]);
    const active = directory.items.filter((unit) => unit.status === "active");
    const count = (type: (typeof active)[number]["type"]) => active.filter((unit) => unit.type === type).length;
    return details(
      [
        countLabel(companies.items.length, "company", "companies"),
        countLabel(count("branch"), "project"),
        countLabel(count("division"), "location"),
        countLabel(count("department"), "department"),
      ].join(" · "),
      count("business_unit") ? countLabel(count("business_unit"), "business unit") : null,
      count("warehouse") ? countLabel(count("warehouse"), "warehouse") : null,
    );
  },
  "work-locations": async (context) => {
    const { items } = await masters(context, "work_location");
    if (!items.length) return [];
    return details(boundedCount(items.length, "location"), nameList(items.map((item) => item.name)));
  },
  "cost-centres": async (context) => {
    const { items } = await masters(context, "cost_center");
    if (!items.length) return [];
    const withNominal = items.filter(
      (item) => item.configuration_key === "default_nominal" && item.configuration_value,
    );
    return details(
      `${boundedCount(items.length, "cost centre")} · ${nameList(items.map((item) => paymentRouteLabel(item.payment_route)))}`,
      nameList(items.map((item) => item.name)),
      withNominal.length ? `${withNominal.length} with a default nominal code` : "No default nominal codes",
    );
  },
  designations: async (context) => {
    const { items } = await masters(context, "designation");
    if (!items.length) return [];
    return details(boundedCount(items.length, "designation"), nameList(items.map((item) => item.name)));
  },
  "job-grades": async ({ client, companyId, once }) => {
    const { items } = await once("job-grades", () => client.jobGrades(companyId));
    const active = items.filter((grade) => grade.status === "active");
    if (!active.length) return [];
    const levels = active.map((grade) => grade.grade_level).sort((a, b) => a - b);
    const banded = active.filter((grade) => grade.band_minimum && grade.band_maximum).length;
    return details(
      levels[0] === levels.at(-1) ? `Grade ${levels[0]}` : `Grades ${levels[0]}–${levels.at(-1)}`,
      `${countLabel(active.length, "grade")} · ${nameList(active.map((grade) => grade.currency_code))}`,
      banded === active.length ? "All have a salary band" : `${active.length - banded} without a salary band`,
    );
  },
  jobs: async (context) => {
    const { items } = await masters(context, "job");
    if (!items.length) return [];
    return details(boundedCount(items.length, "job"), nameList(items.map((item) => item.name)));
  },
};

/** People: headcount, joining queue and workforce insight cards. */
export const peopleLandingSummaries: HrLandingSummaryLoaders = {
  employees: async (context) => {
    const { metrics } = await dashboard(context);
    if (!metrics.active_headcount) return [];
    return details(
      `${countLabel(metrics.active_headcount, "active employee")}`,
      `${countLabel(metrics.active_departments, "department")} · ${countLabel(metrics.recent_joiners, "recent joiner")}`,
    );
  },
  "add-employee": async ({ client, companyId, once }) => {
    const drafts = await once("employee-drafts", () => client.employeeDrafts({ companyId, limit: listLimit }));
    return details(
      drafts.items.length ? `${boundedCount(drafts.items.length, "draft")} in progress` : "No drafts in progress",
    );
  },
  "employee-drafts": async ({ client, companyId, once }) => {
    const drafts = await once("employee-drafts", () => client.employeeDrafts({ companyId, limit: listLimit }));
    if (!drafts.items.length) return [];
    return details(
      boundedCount(drafts.items.length, "draft"),
      nameList(
        drafts.items.map((draft) => draft.display_name),
        2,
      ),
    );
  },
  "employee-approvals": async ({ client, companyId }) => {
    const queue = await client.employeeDraftApprovals({ companyId, limit: listLimit });
    if (!queue.items.length) return ["Nothing awaiting approval"];
    return details(
      `${boundedCount(queue.items.length, "profile")} awaiting approval`,
      nameList(
        queue.items.map((item) => item.display_name),
        2,
      ),
    );
  },
  "positions-org": async ({ client, companyId }) => {
    const { metrics } = await client.positionsOrganization({ companyId, limit: 25 });
    if (!metrics.current_assignments) return [];
    return details(
      `${countLabel(metrics.current_assignments, "assignment")} · ${countLabel(metrics.represented_jobs, "job")}`,
      `${countLabel(metrics.reporting_managers, "manager")} · ${metrics.without_manager} without one`,
    );
  },
  "hr-dashboard": async (context) => {
    const { metrics } = await dashboard(context);
    return details(
      metrics.master_configuration_gaps
        ? `${countLabel(metrics.active_headcount, "active employee")} · ${countLabel(metrics.master_configuration_gaps, "setup gap")}`
        : countLabel(metrics.active_headcount, "active employee"),
      `Pending: ${countLabel(metrics.pending_employee_approvals, "approval")} · ${countLabel(metrics.pending_movements, "movement")}`,
    );
  },
  "finance-payroll-dashboard": async ({ client, companyId }) => {
    const { metrics, latest_period: latest } = await client.financePayrollDashboard(companyId);
    return details(
      latest
        ? `Latest: ${new Date(`${latest.month}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })} ${humanize(latest.state)}`
        : "No payroll periods yet",
      `${metrics.salary_covered_employees} of ${metrics.current_employees} employees salaried`,
      metrics.review_queue || metrics.payment_exceptions
        ? `${metrics.review_queue} in review · ${metrics.payment_exceptions} payment exceptions`
        : null,
    );
  },
};

/** Recruitment: requisition-to-offer pipeline counts. */
export const recruitmentLandingSummaries: HrLandingSummaryLoaders = {
  "manpower-requisitions": async ({ client, companyId }) => {
    const { items } = await client.manpowerRequisitions({ companyId, limit: listLimit });
    if (!items.length) return [];
    return details(
      boundedCount(items.length, "requisition"),
      tally(items.map((item) => item.state)),
      nameList(
        items.flatMap((item) => (item.hiring_basis ? [hiringBasisLabel(item.hiring_basis)] : [])),
        2,
      ),
    );
  },
  "job-openings": async ({ client, companyId }) => {
    const { items } = await client.jobOpenings({ companyId, limit: listLimit });
    if (!items.length) return [];
    const open = items.filter((item) => item.state === "open");
    return details(
      `${countLabel(open.length, "open role")} · ${open.reduce((sum, item) => sum + item.remaining_positions, 0)} positions to fill`,
      nameList(
        open.map((item) => item.title),
        2,
      ),
    );
  },
  candidates: async ({ client, companyId }) => {
    const { items } = await client.candidates({ companyId, status: "active", limit: listLimit });
    if (!items.length) return [];
    return details(
      boundedCount(items.length, "active candidate"),
      `By source: ${tally(items.map((item) => item.source))}`,
    );
  },
  "recruitment-pipeline": async ({ client, companyId, once }) => {
    const { items, total } = await once("applications", () => client.applications({ companyId, limit: listLimit }));
    if (!total) return [];
    return details(countLabel(total, "application"), tally(items.map((item) => item.stage)));
  },
  interviews: async ({ client, companyId, once }) => {
    const { items } = await once("applications", () => client.applications({ companyId, limit: listLimit }));
    const inInterview = items.filter((item) => item.stage === "interview" || item.stage === "evaluation");
    if (!inInterview.length) return ["No candidates in interview"];
    return details(
      `${countLabel(inInterview.length, "candidate")} in interview or evaluation`,
      nameList(
        inInterview.map((item) => item.opening_title),
        2,
      ),
    );
  },
  offers: async ({ client, companyId, once }) => {
    const { items, total } = await once("offers", () => client.offers({ companyId }));
    if (!total) return [];
    const overdue = items.filter((item) => item.is_overdue).length;
    return details(
      countLabel(total, "offer"),
      tally(items.map((item) => item.state)),
      overdue ? `${overdue} overdue` : null,
    );
  },
  "create-employee-from-offer": async ({ client, companyId, once }) => {
    const { items } = await once("offers", () => client.offers({ companyId }));
    const accepted = items.filter((item) => item.state === "accepted");
    if (!accepted.length) return ["No accepted offers to convert"];
    return details(
      `${countLabel(accepted.length, "accepted offer")}`,
      nameList(
        accepted.map((item) => item.candidate_name),
        2,
      ),
    );
  },
};
