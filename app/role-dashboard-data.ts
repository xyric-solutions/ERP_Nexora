/**
 * Role-specific dashboard fixtures for the isolated Nexora UI/UX prototype.
 *
 * All values are deterministic presentation data. This file has no API,
 * database, Demo Account, authorization, posting, or business-transaction
 * dependency. Targets point only to pages in the prototype catalogue.
 */

import { extendedRoleDashboards } from "./extended-role-experience.ts";

export const ROLE_DASHBOARD_PAGE_IDS = [
  "ceo-executive-dashboard",
  "cfo-dashboard",
  "finance-manager-dashboard",
  "production-manager-dashboard",
  "hr-manager-dashboard",
  "purchasing-manager-dashboard",
  "sales-manager-dashboard",
  "accountant-workspace",
  "sales-executive-dashboard",
  "procurement-officer-dashboard",
  "inventory-manager-dashboard",
  "warehouse-dashboard",
  "project-manager-dashboard",
  "admin-dashboard",
  "crm-manager-dashboard",
  "ar-manager-dashboard",
  "ap-manager-dashboard",
  "tax-manager-dashboard",
  "auditor-dashboard",
] as const;

export type RoleDashboardPageId = (typeof ROLE_DASHBOARD_PAGE_IDS)[number];

export const ROLE_DASHBOARD_ROLE_IDS = [
  "chief-executive",
  "chief-financial-officer",
  "finance-manager",
  "production-manager",
  "hr-manager",
  "purchase-manager",
  "sales-manager",
  "accountant",
  "sales-executive",
  "procurement-officer",
  "inventory-manager",
  "warehouse-user",
  "project-manager",
  "administrator",
  "crm-manager",
  "ar-manager",
  "ap-manager",
  "tax-manager",
  "auditor",
] as const;

export type RoleDashboardRoleId = (typeof ROLE_DASHBOARD_ROLE_IDS)[number];
export type RoleDashboardTone = "positive" | "neutral" | "info" | "warning" | "danger";
export type RoleDashboardPriorityLevel = "urgent" | "high" | "normal" | "low";
export type RoleDashboardExceptionSeverity = "critical" | "high" | "medium" | "low";
export type RoleDashboardScoreStatus = "on-track" | "watch" | "at-risk" | "critical";
export type RoleDashboardChartUnit = "currency" | "percent" | "number" | "days";

export interface RoleDashboardTarget {
  moduleId: string;
  pageId: string;
}

export interface RoleDashboardKpi {
  id: string;
  label: string;
  value: string;
  delta: string;
  comparison: string;
  tone: RoleDashboardTone;
  target: RoleDashboardTarget;
}

export type RoleDashboardTwelveValues = readonly [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

export interface RoleDashboardMonthlySeries {
  label: string;
  values: RoleDashboardTwelveValues;
}

export interface RoleDashboardChart {
  title: string;
  subtitle: string;
  unit: RoleDashboardChartUnit;
  months: readonly [
    string, string, string, string, string, string,
    string, string, string, string, string, string,
  ];
  primary: RoleDashboardMonthlySeries;
  comparison: RoleDashboardMonthlySeries;
  accessibleSummary: string;
  target: RoleDashboardTarget;
}

export interface RoleDashboardPriority {
  id: string;
  title: string;
  detail: string;
  due: string;
  priority: RoleDashboardPriorityLevel;
  status: string;
  target: RoleDashboardTarget;
}

export interface RoleDashboardException {
  id: string;
  title: string;
  detail: string;
  severity: RoleDashboardExceptionSeverity;
  owner: string;
  target: RoleDashboardTarget;
}

export interface RoleDashboardQuickAction {
  id: string;
  label: string;
  description: string;
  kind: "primary" | "secondary";
  target: RoleDashboardTarget;
}

export interface RoleDashboardScorecardRow {
  id: string;
  label: string;
  value: string;
  target: string;
  variance: string;
  status: RoleDashboardScoreStatus;
}

type SixKpis = readonly [
  RoleDashboardKpi, RoleDashboardKpi, RoleDashboardKpi,
  RoleDashboardKpi, RoleDashboardKpi, RoleDashboardKpi,
];

type FourPriorities = readonly [RoleDashboardPriority, RoleDashboardPriority, RoleDashboardPriority, RoleDashboardPriority];
type FourExceptions = readonly [RoleDashboardException, RoleDashboardException, RoleDashboardException, RoleDashboardException];
type FourQuickActions = readonly [RoleDashboardQuickAction, RoleDashboardQuickAction, RoleDashboardQuickAction, RoleDashboardQuickAction];
type FourScorecardRows = readonly [RoleDashboardScorecardRow, RoleDashboardScorecardRow, RoleDashboardScorecardRow, RoleDashboardScorecardRow];

export interface RoleDashboardDefinition {
  pageId: RoleDashboardPageId;
  roleId: RoleDashboardRoleId;
  eyebrow: string;
  title: string;
  description: string;
  contextNote: string;
  kpis: SixKpis;
  chart: RoleDashboardChart;
  priorities: FourPriorities;
  exceptions: FourExceptions;
  quickActions: FourQuickActions;
  scorecard: FourScorecardRows;
}

const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"] as const;

export const roleDashboardDefinitions = {
  "ceo-executive-dashboard": {
    pageId: "ceo-executive-dashboard",
    roleId: "chief-executive",
    eyebrow: "Executive command centre",
    title: "CEO Enterprise Overview",
    description: "Consolidated growth, profitability, cash, delivery, people, and enterprise-risk signals.",
    contextNote: "Mock consolidated view across service, trading, and manufacturing companies; no live records.",
    kpis: [
      { id: "ceo-revenue", label: "Revenue YTD", value: "$8.42M", delta: "+14.8%", comparison: "vs prior year", tone: "positive", target: { moduleId: "reports", pageId: "report-viewer" } },
      { id: "ceo-margin", label: "Operating margin", value: "18.6%", delta: "+1.7 pts", comparison: "vs plan", tone: "positive", target: { moduleId: "finance", pageId: "financial-statements" } },
      { id: "ceo-cash", label: "Available cash", value: "$724.8K", delta: "+$38.2K", comparison: "vs last month", tone: "positive", target: { moduleId: "banking", pageId: "account-balances" } },
      { id: "ceo-working-capital", label: "Working capital", value: "$1.16M", delta: "-3.2%", comparison: "vs target", tone: "warning", target: { moduleId: "finance", pageId: "financial-statements" } },
      { id: "ceo-backlog", label: "Revenue backlog", value: "$2.63M", delta: "+11.4%", comparison: "vs prior quarter", tone: "positive", target: { moduleId: "sales", pageId: "sales-orders" } },
      { id: "ceo-risks", label: "Critical exceptions", value: "4", delta: "2 overdue", comparison: "enterprise queue", tone: "danger", target: { moduleId: "audit", pageId: "control-exceptions" } },
    ],
    chart: {
      title: "Enterprise revenue performance",
      subtitle: "Monthly recognized revenue compared with prior year — USD",
      unit: "currency",
      months,
      primary: { label: "FY 2026", values: [510000, 580000, 545000, 670000, 640000, 715000, 688000, 760000, 735000, 810000, 785000, 982000] },
      comparison: { label: "FY 2025", values: [455000, 492000, 510000, 552000, 570000, 603000, 625000, 650000, 668000, 702000, 720000, 756000] },
      accessibleSummary: "FY 2026 revenue exceeds the comparison year in eleven of twelve months and finishes August at $982,000 versus $756,000.",
      target: { moduleId: "reports", pageId: "report-viewer" },
    },
    priorities: [
      { id: "ceo-priority-approval", title: "Review executive approvals", detail: "Two high-value decisions are due today.", due: "Today, 3:00 PM", priority: "urgent", status: "Pending", target: { moduleId: "approvals", pageId: "my-approvals" } },
      { id: "ceo-priority-project", title: "Crescent programme recovery", detail: "Design sign-off is forecast three days late.", due: "Today", priority: "high", status: "At risk", target: { moduleId: "projects", pageId: "project-detail" } },
      { id: "ceo-priority-credit", title: "Atlas credit decision", detail: "Temporary $75,000 credit increase awaits review.", due: "Overdue", priority: "urgent", status: "Escalated", target: { moduleId: "customers", pageId: "credit-limit-review" } },
      { id: "ceo-priority-quality", title: "Quality-hold disposition", detail: "Forty-five enclosures remain unavailable to production.", due: "Tomorrow", priority: "high", status: "Blocked", target: { moduleId: "quality", pageId: "quarantine-disposition" } },
    ],
    exceptions: [
      { id: "ceo-exception-cash", title: "Cash forecast below buffer", detail: "Manufacturing cash is projected 8% below policy buffer in week six.", severity: "high", owner: "CFO", target: { moduleId: "banking", pageId: "cash-forecast" } },
      { id: "ceo-exception-margin", title: "Service margin pressure", detail: "One at-risk project is 4.3 points below planned margin.", severity: "medium", owner: "Project Director", target: { moduleId: "projects", pageId: "project-dashboard" } },
      { id: "ceo-exception-delivery", title: "Customer delivery exposure", detail: "Atlas delivery readiness depends on a quality-held component.", severity: "high", owner: "Production Manager", target: { moduleId: "manufacturing", pageId: "production-orders" } },
      { id: "ceo-exception-receivable", title: "Overdue strategic account", detail: "Crescent invoice balance of $48,500 is overdue.", severity: "medium", owner: "Finance Manager", target: { moduleId: "customers", pageId: "ar-ageing" } },
    ],
    quickActions: [
      { id: "ceo-action-pack", label: "Executive report pack", description: "Open the consolidated executive report pack.", kind: "primary", target: { moduleId: "reports", pageId: "report-catalogue" } },
      { id: "ceo-action-approvals", label: "My approvals", description: "Review decisions assigned to the executive role.", kind: "secondary", target: { moduleId: "approvals", pageId: "my-approvals" } },
      { id: "ceo-action-financials", label: "Financial statements", description: "Drill into the latest mock statements.", kind: "secondary", target: { moduleId: "finance", pageId: "financial-statements" } },
      { id: "ceo-action-risks", label: "Enterprise exceptions", description: "Open the cross-module control exception queue.", kind: "secondary", target: { moduleId: "audit", pageId: "control-exceptions" } },
    ],
    scorecard: [
      { id: "ceo-score-growth", label: "Revenue growth", value: "14.8%", target: "≥ 12.0%", variance: "+2.8 pts", status: "on-track" },
      { id: "ceo-score-margin", label: "Operating margin", value: "18.6%", target: "≥ 19.0%", variance: "-0.4 pts", status: "watch" },
      { id: "ceo-score-delivery", label: "On-time fulfilment", value: "93.0%", target: "≥ 95.0%", variance: "-2.0 pts", status: "at-risk" },
      { id: "ceo-score-close", label: "Close completion", value: "82.0%", target: "≥ 80.0%", variance: "+2.0 pts", status: "on-track" },
    ],
  },

  "cfo-dashboard": {
    pageId: "cfo-dashboard",
    roleId: "chief-financial-officer",
    eyebrow: "Finance leadership",
    title: "CFO Financial Command Centre",
    description: "Liquidity, working capital, profitability, close, compliance, and financial-control oversight.",
    contextNote: "Prototype finance leadership lens; approval buttons simulate source workflows and segregation of duties.",
    kpis: [
      { id: "cfo-cash", label: "Available cash", value: "$724.8K", delta: "+5.6%", comparison: "vs last month", tone: "positive", target: { moduleId: "banking", pageId: "account-balances" } },
      { id: "cfo-low-point", label: "13-week cash low", value: "$516.0K", delta: "Week 6", comparison: "$550K policy buffer", tone: "warning", target: { moduleId: "banking", pageId: "cash-forecast" } },
      { id: "cfo-overdue-ar", label: "Overdue receivables", value: "$48.5K", delta: "6.5% of AR", comparison: "vs 5% target", tone: "warning", target: { moduleId: "customers", pageId: "ar-ageing" } },
      { id: "cfo-ap-due", label: "AP due in 30 days", value: "$89.0K", delta: "+$14.2K", comparison: "vs prior window", tone: "info", target: { moduleId: "suppliers", pageId: "ap-ageing" } },
      { id: "cfo-budget", label: "Operating profit vs budget", value: "+$126K", delta: "+9.1%", comparison: "favourable YTD", tone: "positive", target: { moduleId: "budget", pageId: "budget-actual" } },
      { id: "cfo-close", label: "Month-end close", value: "82%", delta: "18 of 22 tasks", comparison: "2 due today", tone: "warning", target: { moduleId: "finance", pageId: "period-close" } },
    ],
    chart: {
      title: "Liquidity outlook",
      subtitle: "Monthly available cash compared with policy buffer — USD",
      unit: "currency",
      months,
      primary: { label: "Available cash", values: [612000, 598000, 641000, 665000, 628000, 684000, 651000, 697000, 675000, 708000, 686600, 724800] },
      comparison: { label: "Policy buffer", values: [550000, 550000, 550000, 550000, 550000, 550000, 550000, 550000, 550000, 550000, 550000, 550000] },
      accessibleSummary: "Available cash remains above the $550,000 policy buffer throughout the twelve-month view and closes August at $724,800.",
      target: { moduleId: "banking", pageId: "cash-forecast" },
    },
    priorities: [
      { id: "cfo-priority-po", title: "Approve PO-2026-1842", detail: "$46,820 automation-components purchase order.", due: "Overdue by 2 days", priority: "urgent", status: "Pending", target: { moduleId: "approvals", pageId: "approval-detail" } },
      { id: "cfo-priority-credit", title: "Atlas credit-limit review", detail: "Temporary $75,000 increase requires risk approval.", due: "Today, 10:00 AM", priority: "urgent", status: "Pending", target: { moduleId: "customers", pageId: "credit-limit-review" } },
      { id: "cfo-priority-close", title: "August close readiness", detail: "Four tasks remain, including two reconciliations.", due: "Tomorrow", priority: "high", status: "In progress", target: { moduleId: "finance", pageId: "period-close" } },
      { id: "cfo-priority-budget", title: "Review Q4 reforecast", detail: "Manufacturing materials forecast is above plan.", due: "05 Sep", priority: "normal", status: "Review", target: { moduleId: "budget", pageId: "budget-actual" } },
    ],
    exceptions: [
      { id: "cfo-exception-bank", title: "Bank line unmatched", detail: "$85 bank charge has no accounting match.", severity: "medium", owner: "Treasury Accountant", target: { moduleId: "banking", pageId: "statement-matching" } },
      { id: "cfo-exception-event", title: "Posting event requires review", detail: "One accounting event exceeded its retry threshold.", severity: "high", owner: "Finance Manager", target: { moduleId: "finance", pageId: "accounting-events" } },
      { id: "cfo-exception-ap", title: "Supplier bill not matched", detail: "$32,625 draft bill is blocked by a quality-held receipt.", severity: "high", owner: "AP Lead", target: { moduleId: "purchases", pageId: "match-exceptions" } },
      { id: "cfo-exception-report", title: "Consolidation difference", detail: "$8,420 intercompany difference remains unresolved.", severity: "medium", owner: "Group Accountant", target: { moduleId: "finance", pageId: "consolidation" } },
    ],
    quickActions: [
      { id: "cfo-action-cash", label: "Review cash forecast", description: "Open the prototype liquidity outlook.", kind: "primary", target: { moduleId: "banking", pageId: "cash-forecast" } },
      { id: "cfo-action-approvals", label: "Review approvals", description: "Open finance and executive decisions assigned to this role.", kind: "secondary", target: { moduleId: "approvals", pageId: "my-approvals" } },
      { id: "cfo-action-budget", label: "Budget vs actual", description: "Inspect material variances and reforecast signals.", kind: "secondary", target: { moduleId: "budget", pageId: "budget-actual" } },
      { id: "cfo-action-close", label: "Period-close workbench", description: "Review checklist progress and blockers.", kind: "secondary", target: { moduleId: "finance", pageId: "period-close" } },
    ],
    scorecard: [
      { id: "cfo-score-dso", label: "Days sales outstanding", value: "38 days", target: "≤ 35 days", variance: "+3 days", status: "watch" },
      { id: "cfo-score-dpo", label: "Days payable outstanding", value: "31 days", target: "30–35 days", variance: "Within range", status: "on-track" },
      { id: "cfo-score-close", label: "Close completion", value: "82%", target: "100% by day 5", variance: "On day 4", status: "watch" },
      { id: "cfo-score-recon", label: "Reconciled cash", value: "98.7%", target: "≥ 99.0%", variance: "-0.3 pts", status: "watch" },
    ],
  },

  "finance-manager-dashboard": {
    pageId: "finance-manager-dashboard",
    roleId: "finance-manager",
    eyebrow: "Finance operations",
    title: "Finance Manager Workspace",
    description: "Close execution, journals, accounting events, reconciliations, controls, and team workload.",
    contextNote: "Mock operational view; prepare, approval, posting, and close rights remain visibly separated.",
    kpis: [
      { id: "fm-tb", label: "Trial balance difference", value: "$0.00", delta: "Balanced", comparison: "current period", tone: "positive", target: { moduleId: "finance", pageId: "trial-balance" } },
      { id: "fm-events", label: "Unposted / failed events", value: "7", delta: "1 failed", comparison: "6 awaiting review", tone: "warning", target: { moduleId: "finance", pageId: "accounting-events" } },
      { id: "fm-journals", label: "Journals awaiting review", value: "5", delta: "$68.4K", comparison: "2 due today", tone: "warning", target: { moduleId: "finance", pageId: "journal-register" } },
      { id: "fm-close", label: "Close tasks complete", value: "18 / 22", delta: "82%", comparison: "day 4 of 5", tone: "info", target: { moduleId: "finance", pageId: "period-close" } },
      { id: "fm-bank", label: "Unreconciled bank", value: "$46.9K", delta: "3 items", comparison: "1 older than 3 days", tone: "warning", target: { moduleId: "banking", pageId: "bank-reconciliation" } },
      { id: "fm-freshness", label: "Report freshness", value: "10:24 AM", delta: "6 min ago", comparison: "within policy", tone: "positive", target: { moduleId: "reports", pageId: "reporting-admin" } },
    ],
    chart: {
      title: "Monthly close duration",
      subtitle: "Business days to close compared with prior year",
      unit: "days",
      months,
      primary: { label: "Current FY", values: [8, 8, 7, 7, 7, 6, 6, 6, 6, 5, 5, 5] },
      comparison: { label: "Prior FY", values: [10, 9, 10, 9, 8, 9, 8, 8, 7, 7, 7, 7] },
      accessibleSummary: "Monthly close duration improves from eight to five business days, two days faster than the prior-year August result.",
      target: { moduleId: "finance", pageId: "period-close" },
    },
    priorities: [
      { id: "fm-priority-journal", title: "Review JE-2026-00482", detail: "$18,600 month-end allocation journal.", due: "Today, 12:00 PM", priority: "high", status: "Pending review", target: { moduleId: "finance", pageId: "journal-detail" } },
      { id: "fm-priority-expense", title: "Expense claim finance review", detail: "$2,485 client-workshop claim requires evidence check.", due: "Overdue", priority: "urgent", status: "Pending", target: { moduleId: "approvals", pageId: "approval-detail" } },
      { id: "fm-priority-recon", title: "Complete operating-bank reconciliation", detail: "Three lines remain unmatched or suggested.", due: "Today", priority: "high", status: "In progress", target: { moduleId: "banking", pageId: "bank-reconciliation" } },
      { id: "fm-priority-close", title: "Certify subledger reconciliations", detail: "AR and AP certification remain open.", due: "Tomorrow", priority: "normal", status: "Open", target: { moduleId: "finance", pageId: "period-close" } },
    ],
    exceptions: [
      { id: "fm-exception-event", title: "Accounting event failed", detail: "One event requires correction before retry.", severity: "high", owner: "Finance Manager", target: { moduleId: "finance", pageId: "accounting-events" } },
      { id: "fm-exception-recon", title: "AR-to-GL difference", detail: "$1,240 difference is outside the zero-balance policy.", severity: "high", owner: "Receivables Accountant", target: { moduleId: "customers", pageId: "ar-reconciliation" } },
      { id: "fm-exception-ap", title: "AP match exception", detail: "Receipt quality hold blocks supplier-bill matching.", severity: "medium", owner: "AP Accountant", target: { moduleId: "suppliers", pageId: "ap-reconciliation" } },
      { id: "fm-exception-fx", title: "FX rate override pending", detail: "One manual rate awaits independent review.", severity: "medium", owner: "Treasury Lead", target: { moduleId: "finance", pageId: "finance-revaluation" } },
    ],
    quickActions: [
      { id: "fm-action-journal", label: "New journal", description: "Open the safe mock manual-journal form.", kind: "primary", target: { moduleId: "finance", pageId: "manual-journal" } },
      { id: "fm-action-recurring", label: "Recurring journals", description: "Review templates and generated drafts.", kind: "secondary", target: { moduleId: "finance", pageId: "recurring-journals" } },
      { id: "fm-action-reconcile", label: "Bank reconciliation", description: "Open the matching and certification workspace.", kind: "secondary", target: { moduleId: "banking", pageId: "bank-reconciliation" } },
      { id: "fm-action-tb", label: "Run Trial Balance", description: "Open the mock trial-balance report.", kind: "secondary", target: { moduleId: "finance", pageId: "trial-balance" } },
    ],
    scorecard: [
      { id: "fm-score-balance", label: "Trial balance", value: "$0 difference", target: "$0 difference", variance: "$0", status: "on-track" },
      { id: "fm-score-events", label: "Posting success", value: "99.2%", target: "≥ 99.5%", variance: "-0.3 pts", status: "watch" },
      { id: "fm-score-recon", label: "Reconciliations certified", value: "9 / 12", target: "12 / 12", variance: "3 open", status: "at-risk" },
      { id: "fm-score-close", label: "Close tasks on time", value: "94%", target: "≥ 95%", variance: "-1 pt", status: "watch" },
    ],
  },

  "production-manager-dashboard": {
    pageId: "production-manager-dashboard",
    roleId: "production-manager",
    eyebrow: "Plan to produce",
    title: "Production Manager Control Room",
    description: "Output, schedule, WIP, material readiness, capacity, quality, and manufacturing exceptions.",
    contextNote: "Manufacturing prototype only; material, quality, and costing actions are simulated locally.",
    kpis: [
      { id: "pm-adherence", label: "Schedule adherence", value: "91.4%", delta: "+2.6 pts", comparison: "vs last month", tone: "positive", target: { moduleId: "manufacturing", pageId: "production-orders" } },
      { id: "pm-output", label: "Output this month", value: "198 units", delta: "95.2%", comparison: "of 208 planned", tone: "warning", target: { moduleId: "manufacturing", pageId: "production-reports" } },
      { id: "pm-wip", label: "Work in progress", value: "$426K", delta: "14 orders", comparison: "3 high priority", tone: "info", target: { moduleId: "manufacturing", pageId: "wip-tracking" } },
      { id: "pm-shortages", label: "Material shortages", value: "3", delta: "1 critical", comparison: "next 14 days", tone: "danger", target: { moduleId: "manufacturing", pageId: "material-requirements" } },
      { id: "pm-capacity", label: "Capacity utilisation", value: "82.6%", delta: "+4.1 pts", comparison: "vs prior month", tone: "positive", target: { moduleId: "manufacturing", pageId: "capacity-planner" } },
      { id: "pm-quality", label: "First-pass yield", value: "97.8%", delta: "+0.8 pts", comparison: "vs target 98%", tone: "warning", target: { moduleId: "quality", pageId: "quality-dashboard" } },
    ],
    chart: {
      title: "Production output",
      subtitle: "Monthly completed units compared with production plan",
      unit: "number",
      months,
      primary: { label: "Completed", values: [142, 151, 148, 159, 164, 169, 172, 181, 176, 188, 191, 198] },
      comparison: { label: "Planned", values: [150, 155, 155, 165, 170, 175, 178, 185, 185, 195, 200, 208] },
      accessibleSummary: "Completed output trends upward from 142 to 198 units but remains ten units below the August plan of 208.",
      target: { moduleId: "manufacturing", pageId: "production-reports" },
    },
    priorities: [
      { id: "pm-priority-order", title: "Recover MO-2026-0047", detail: "Atlas panel order is 58% complete and material constrained.", due: "12 Sep", priority: "urgent", status: "In progress", target: { moduleId: "manufacturing", pageId: "production-order-detail" } },
      { id: "pm-priority-hold", title: "Resolve enclosure quality hold", detail: "Forty-five received enclosures await disposition.", due: "Today", priority: "urgent", status: "Blocked", target: { moduleId: "quality", pageId: "quarantine-disposition" } },
      { id: "pm-priority-material", title: "Confirm cable replenishment", detail: "Available cable is below reorder requirement.", due: "Tomorrow", priority: "high", status: "Shortage", target: { moduleId: "inventory", pageId: "replenishment" } },
      { id: "pm-priority-capacity", title: "Balance Assembly Line B", detail: "Next planned order has an unresolved capacity overlap.", due: "08 Sep", priority: "normal", status: "Planning", target: { moduleId: "manufacturing", pageId: "capacity-planner" } },
    ],
    exceptions: [
      { id: "pm-exception-material", title: "Critical material shortage", detail: "Control-panel completion may slip without enclosure release.", severity: "critical", owner: "Materials Planner", target: { moduleId: "manufacturing", pageId: "material-requirements" } },
      { id: "pm-exception-quality", title: "Incoming inspection pending", detail: "GRN-2026-0764 remains on quality hold.", severity: "high", owner: "Quality Engineer", target: { moduleId: "quality", pageId: "inspection-queue" } },
      { id: "pm-exception-variance", title: "Material usage variance", detail: "Servo consumption is 3.4% above the BOM allowance.", severity: "medium", owner: "Cost Accountant", target: { moduleId: "manufacturing", pageId: "production-variance" } },
      { id: "pm-exception-order", title: "Release approval due", detail: "MO-2026-0049 requires readiness confirmation before release.", severity: "medium", owner: "Production Manager", target: { moduleId: "manufacturing", pageId: "release-production-order" } },
    ],
    quickActions: [
      { id: "pm-action-order", label: "Create production order", description: "Open the mock production-order form.", kind: "primary", target: { moduleId: "manufacturing", pageId: "add-production-order" } },
      { id: "pm-action-issue", label: "Issue materials", description: "Record a local prototype material issue.", kind: "secondary", target: { moduleId: "manufacturing", pageId: "material-issue" } },
      { id: "pm-action-output", label: "Record completion", description: "Open the mock production-completion flow.", kind: "secondary", target: { moduleId: "manufacturing", pageId: "production-completion" } },
      { id: "pm-action-inspection", label: "Inspection queue", description: "Review pending quality inspections.", kind: "secondary", target: { moduleId: "quality", pageId: "inspection-queue" } },
    ],
    scorecard: [
      { id: "pm-score-adherence", label: "Schedule adherence", value: "91.4%", target: "≥ 95.0%", variance: "-3.6 pts", status: "at-risk" },
      { id: "pm-score-yield", label: "First-pass yield", value: "97.8%", target: "≥ 98.0%", variance: "-0.2 pts", status: "watch" },
      { id: "pm-score-capacity", label: "Capacity utilisation", value: "82.6%", target: "80–88%", variance: "Within range", status: "on-track" },
      { id: "pm-score-scrap", label: "Scrap rate", value: "1.7%", target: "≤ 1.5%", variance: "+0.2 pts", status: "watch" },
    ],
  },

  "hr-manager-dashboard": {
    pageId: "hr-manager-dashboard",
    roleId: "hr-manager",
    eyebrow: "People and payroll",
    title: "HR Manager People Overview",
    description: "Workforce capacity, attendance, leave, onboarding, payroll readiness, and people-risk signals.",
    contextNote: "Privacy-aware mock view; sensitive employee and payroll fields remain presentation-only.",
    kpis: [
      { id: "hr-headcount", label: "Active headcount", value: "248", delta: "+6", comparison: "vs last month", tone: "positive", target: { moduleId: "hr", pageId: "employees" } },
      { id: "hr-attendance", label: "Attendance rate", value: "96.2%", delta: "+0.7 pts", comparison: "vs prior month", tone: "positive", target: { moduleId: "hr", pageId: "attendance" } },
      { id: "hr-leave", label: "Leave awaiting approval", value: "9", delta: "3 due today", comparison: "manager queue", tone: "warning", target: { moduleId: "hr", pageId: "leave-requests" } },
      { id: "hr-onboarding", label: "Onboarding in progress", value: "7", delta: "2 start this week", comparison: "1 task overdue", tone: "warning", target: { moduleId: "hr", pageId: "onboarding" } },
      { id: "hr-payroll", label: "Payroll readiness", value: "94.8%", delta: "13 exceptions", comparison: "95% validation target", tone: "warning", target: { moduleId: "hr", pageId: "payroll-validation" } },
      { id: "hr-turnover", label: "Rolling turnover", value: "8.6%", delta: "-0.9 pts", comparison: "vs prior year", tone: "positive", target: { moduleId: "hr", pageId: "hr-reports" } },
    ],
    chart: {
      title: "Payroll validation readiness",
      subtitle: "Monthly inputs passing validation compared with 95% target",
      unit: "percent",
      months,
      primary: { label: "Validation pass rate", values: [91.2, 92.1, 92.8, 93.0, 92.6, 93.4, 93.8, 94.0, 94.3, 94.6, 94.7, 94.8] },
      comparison: { label: "Target", values: [95, 95, 95, 95, 95, 95, 95, 95, 95, 95, 95, 95] },
      accessibleSummary: "Payroll validation improves from 91.2% to 94.8% across the year but remains 0.2 percentage points below the 95% target.",
      target: { moduleId: "hr", pageId: "payroll-validation" },
    },
    priorities: [
      { id: "hr-priority-payroll", title: "Clear payroll validation blockers", detail: "Thirteen employees have missing or unapproved inputs.", due: "Today", priority: "urgent", status: "Blocked", target: { moduleId: "hr", pageId: "payroll-validation" } },
      { id: "hr-priority-leave", title: "Review leave queue", detail: "Three requests will breach the response SLA today.", due: "Today, 2:00 PM", priority: "high", status: "Pending", target: { moduleId: "hr", pageId: "leave-approval" } },
      { id: "hr-priority-onboarding", title: "Complete new-starter access", detail: "One onboarding checklist is overdue.", due: "Overdue", priority: "high", status: "At risk", target: { moduleId: "hr", pageId: "onboarding" } },
      { id: "hr-priority-exit", title: "Validate final settlement", detail: "One offboarding case needs Finance handoff.", due: "06 Sep", priority: "normal", status: "Review", target: { moduleId: "hr", pageId: "offboarding" } },
    ],
    exceptions: [
      { id: "hr-exception-bank", title: "Missing payroll bank details", detail: "Four employee records cannot proceed to payment handoff.", severity: "high", owner: "HR Operations", target: { moduleId: "hr", pageId: "payroll-inputs" } },
      { id: "hr-exception-time", title: "Attendance inputs unapproved", detail: "Six timesheets remain outside the approved payroll input set.", severity: "high", owner: "Department Managers", target: { moduleId: "hr", pageId: "attendance" } },
      { id: "hr-exception-contract", title: "Contracts nearing expiry", detail: "Three contracts require renewal or separation decisions.", severity: "medium", owner: "HR Business Partner", target: { moduleId: "hr", pageId: "employees" } },
      { id: "hr-exception-position", title: "Vacant critical position", detail: "Production planning role has been open for 42 days.", severity: "medium", owner: "Talent Acquisition", target: { moduleId: "hr", pageId: "positions-org" } },
    ],
    quickActions: [
      { id: "hr-action-employee", label: "Add employee", description: "Open the mock employee onboarding form.", kind: "primary", target: { moduleId: "hr", pageId: "add-employee" } },
      { id: "hr-action-attendance", label: "Review attendance", description: "Inspect attendance and input exceptions.", kind: "secondary", target: { moduleId: "hr", pageId: "attendance" } },
      { id: "hr-action-leave", label: "Approve leave", description: "Open the prototype leave approval queue.", kind: "secondary", target: { moduleId: "hr", pageId: "leave-approval" } },
      { id: "hr-action-payroll", label: "Validate payroll", description: "Review payroll readiness without posting.", kind: "secondary", target: { moduleId: "hr", pageId: "payroll-validation" } },
    ],
    scorecard: [
      { id: "hr-score-attendance", label: "Attendance rate", value: "96.2%", target: "≥ 96.0%", variance: "+0.2 pts", status: "on-track" },
      { id: "hr-score-payroll", label: "Payroll validation", value: "94.8%", target: "≥ 95.0%", variance: "-0.2 pts", status: "watch" },
      { id: "hr-score-time", label: "Leave response within SLA", value: "91.0%", target: "≥ 95.0%", variance: "-4.0 pts", status: "at-risk" },
      { id: "hr-score-turnover", label: "Rolling turnover", value: "8.6%", target: "≤ 10.0%", variance: "1.4 pts favourable", status: "on-track" },
    ],
  },

  "purchasing-manager-dashboard": {
    pageId: "purchasing-manager-dashboard",
    roleId: "purchase-manager",
    eyebrow: "Procure to pay",
    title: "Purchasing Manager Overview",
    description: "Commitments, requisitions, sourcing, purchase orders, supplier delivery, quality, and invoice matching.",
    contextNote: "Mock purchasing control centre; buyer, approver, receiver, matcher, and payment roles remain separate.",
    kpis: [
      { id: "pur-commitments", label: "Open commitments", value: "$214.7K", delta: "+$18.3K", comparison: "vs last week", tone: "info", target: { moduleId: "purchases", pageId: "purchase-orders" } },
      { id: "pur-pr-age", label: "PR approval cycle", value: "1.8 days", delta: "-0.4 days", comparison: "vs target", tone: "positive", target: { moduleId: "purchases", pageId: "purchase-requisitions" } },
      { id: "pur-sourcing", label: "Sourcing cycle", value: "6.4 days", delta: "-0.8 days", comparison: "vs prior month", tone: "positive", target: { moduleId: "purchases", pageId: "rfqs" } },
      { id: "pur-overdue", label: "Overdue purchase orders", value: "4", delta: "$81.6K", comparison: "2 production-critical", tone: "danger", target: { moduleId: "purchases", pageId: "purchase-orders" } },
      { id: "pur-delivery", label: "Supplier on-time delivery", value: "92.4%", delta: "+1.6 pts", comparison: "vs prior month", tone: "positive", target: { moduleId: "purchases", pageId: "procurement-reports" } },
      { id: "pur-match", label: "Match exceptions", value: "3", delta: "$32.6K", comparison: "1 quality-blocked", tone: "warning", target: { moduleId: "purchases", pageId: "match-exceptions" } },
    ],
    chart: {
      title: "Procurement cycle time",
      subtitle: "Monthly requisition-to-order days compared with target",
      unit: "days",
      months,
      primary: { label: "Actual cycle", values: [9.4, 9.1, 8.8, 8.6, 8.2, 8.0, 7.8, 7.4, 7.2, 6.9, 6.6, 6.4] },
      comparison: { label: "Target", values: [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7] },
      accessibleSummary: "Requisition-to-order cycle time improves from 9.4 to 6.4 days and moves 0.6 days better than the seven-day target in August.",
      target: { moduleId: "purchases", pageId: "procurement-reports" },
    },
    priorities: [
      { id: "pur-priority-po", title: "Expedite PO-2026-1836", detail: "Enclosure order is only 45% received and on quality hold.", due: "Today", priority: "urgent", status: "At risk", target: { moduleId: "purchases", pageId: "purchase-order-detail" } },
      { id: "pur-priority-rfq", title: "Complete servo-drive bid comparison", detail: "Three compliant quotations are ready for evaluation.", due: "Tomorrow", priority: "high", status: "Evaluation", target: { moduleId: "purchases", pageId: "bid-comparison" } },
      { id: "pur-priority-match", title: "Resolve BILL-2026-0899", detail: "$32,625 bill cannot match until receipt disposition.", due: "05 Sep", priority: "high", status: "Blocked", target: { moduleId: "purchases", pageId: "match-exceptions" } },
      { id: "pur-priority-supplier", title: "Review supplier bank change", detail: "Independent verification is required before payment use.", due: "06 Sep", priority: "normal", status: "Pending", target: { moduleId: "suppliers", pageId: "bank-verification" } },
    ],
    exceptions: [
      { id: "pur-exception-overdue", title: "Production-critical PO overdue", detail: "A material delivery now threatens the Atlas production plan.", severity: "critical", owner: "Senior Buyer", target: { moduleId: "purchases", pageId: "purchase-orders" } },
      { id: "pur-exception-quality", title: "Supplier receipt on quality hold", detail: "Forty-five enclosures await inspection disposition.", severity: "high", owner: "Quality Engineer", target: { moduleId: "purchases", pageId: "quality-handoff" } },
      { id: "pur-exception-source", title: "Single-source request", detail: "One urgent requisition lacks approved sourcing rationale.", severity: "medium", owner: "Category Manager", target: { moduleId: "purchases", pageId: "supplier-evaluation" } },
      { id: "pur-exception-budget", title: "Commitment above budget", detail: "Technology cloud request exceeds the monthly category allowance.", severity: "medium", owner: "Budget Owner", target: { moduleId: "purchases", pageId: "budget-check" } },
    ],
    quickActions: [
      { id: "pur-action-pr", label: "New requisition", description: "Open the local prototype requisition form.", kind: "primary", target: { moduleId: "purchases", pageId: "add-requisition" } },
      { id: "pur-action-rfq", label: "Create RFQ", description: "Start a mock competitive sourcing event.", kind: "secondary", target: { moduleId: "purchases", pageId: "add-rfq" } },
      { id: "pur-action-po", label: "Create purchase order", description: "Open the mock purchase-order editor.", kind: "secondary", target: { moduleId: "purchases", pageId: "add-purchase-order" } },
      { id: "pur-action-match", label: "Resolve match exceptions", description: "Review 2/3-way matching blockers.", kind: "secondary", target: { moduleId: "purchases", pageId: "match-exceptions" } },
    ],
    scorecard: [
      { id: "pur-score-otd", label: "Supplier on-time delivery", value: "92.4%", target: "≥ 95.0%", variance: "-2.6 pts", status: "at-risk" },
      { id: "pur-score-savings", label: "Negotiated savings", value: "6.8%", target: "≥ 5.0%", variance: "+1.8 pts", status: "on-track" },
      { id: "pur-score-match", label: "First-pass match", value: "94.1%", target: "≥ 95.0%", variance: "-0.9 pts", status: "watch" },
      { id: "pur-score-quality", label: "Receipt acceptance", value: "97.2%", target: "≥ 98.0%", variance: "-0.8 pts", status: "watch" },
    ],
  },

  "sales-manager-dashboard": {
    pageId: "sales-manager-dashboard",
    roleId: "sales-manager",
    eyebrow: "Lead to cash",
    title: "Sales Manager Revenue Workspace",
    description: "Pipeline, forecast, orders, margin, fulfilment, credit, receivables, and customer priorities.",
    contextNote: "Mock commercial view; pricing and credit overrides remain approval-controlled visual flows.",
    kpis: [
      { id: "sales-pipeline", label: "Weighted pipeline", value: "$3.18M", delta: "+12.4%", comparison: "vs prior month", tone: "positive", target: { moduleId: "crm", pageId: "opportunities" } },
      { id: "sales-coverage", label: "Forecast coverage", value: "3.2×", delta: "+0.3×", comparison: "vs 3.0× target", tone: "positive", target: { moduleId: "crm", pageId: "sales-forecast" } },
      { id: "sales-conversion", label: "Quote-to-order conversion", value: "38.6%", delta: "+2.1 pts", comparison: "vs prior quarter", tone: "positive", target: { moduleId: "sales", pageId: "quotations" } },
      { id: "sales-intake", label: "Order intake MTD", value: "$289.3K", delta: "+11.2%", comparison: "vs target", tone: "positive", target: { moduleId: "sales", pageId: "sales-orders" } },
      { id: "sales-margin", label: "Gross margin", value: "28.7%", delta: "+1.9 pts", comparison: "vs plan", tone: "positive", target: { moduleId: "sales", pageId: "sales-reports" } },
      { id: "sales-credit", label: "Credit / delivery blocks", value: "5", delta: "$123.5K", comparison: "2 urgent", tone: "danger", target: { moduleId: "sales", pageId: "sales-approvals" } },
    ],
    chart: {
      title: "Sales performance",
      subtitle: "Monthly order intake compared with target — USD",
      unit: "currency",
      months,
      primary: { label: "Order intake", values: [188000, 201000, 196000, 219000, 224000, 231000, 228000, 246000, 239000, 258000, 267000, 289300] },
      comparison: { label: "Target", values: [195000, 200000, 205000, 215000, 220000, 225000, 230000, 235000, 240000, 250000, 255000, 260000] },
      accessibleSummary: "Order intake rises from $188,000 to $289,300 and exceeds the monthly target from April onward, finishing August $29,300 above target.",
      target: { moduleId: "sales", pageId: "sales-reports" },
    },
    priorities: [
      { id: "sales-priority-credit", title: "Resolve Atlas credit increase", detail: "$75,000 temporary limit request is awaiting CFO review.", due: "Overdue", priority: "urgent", status: "Blocked", target: { moduleId: "customers", pageId: "credit-limit-review" } },
      { id: "sales-priority-order", title: "Advance SO-2026-1057", detail: "$28,400 service order remains pending approval.", due: "Today", priority: "high", status: "Pending approval", target: { moduleId: "sales", pageId: "sales-order-detail" } },
      { id: "sales-priority-project", title: "Recover Crescent milestone", detail: "Delivery risk could delay the next invoice milestone.", due: "05 Sep", priority: "high", status: "At risk", target: { moduleId: "projects", pageId: "project-detail" } },
      { id: "sales-priority-forecast", title: "Commit September forecast", detail: "Three high-value opportunities need manager confidence review.", due: "06 Sep", priority: "normal", status: "Review", target: { moduleId: "crm", pageId: "sales-forecast" } },
    ],
    exceptions: [
      { id: "sales-exception-credit", title: "Customer credit breach", detail: "Atlas order exposure exceeds the approved temporary limit.", severity: "high", owner: "Sales Manager", target: { moduleId: "customers", pageId: "credit-limit-review" } },
      { id: "sales-exception-stock", title: "Delivery stock shortage", detail: "Control-panel availability is below the committed delivery quantity.", severity: "high", owner: "Inventory Manager", target: { moduleId: "inventory", pageId: "stock-position" } },
      { id: "sales-exception-margin", title: "Low-margin quotation", detail: "One quotation is 3.2 points below the approval floor.", severity: "medium", owner: "Commercial Manager", target: { moduleId: "sales", pageId: "sales-approvals" } },
      { id: "sales-exception-ar", title: "Customer invoice overdue", detail: "$48,500 Crescent balance is past due.", severity: "medium", owner: "Collections Lead", target: { moduleId: "customers", pageId: "ar-ageing" } },
    ],
    quickActions: [
      { id: "sales-action-quote", label: "New quotation", description: "Open the prototype quotation form.", kind: "primary", target: { moduleId: "sales", pageId: "add-quotation" } },
      { id: "sales-action-order", label: "New sales order", description: "Create a local mock sales-order draft.", kind: "secondary", target: { moduleId: "sales", pageId: "add-sales-order" } },
      { id: "sales-action-pipeline", label: "Opportunity pipeline", description: "Review deal stages, next actions, and risk.", kind: "secondary", target: { moduleId: "crm", pageId: "opportunities" } },
      { id: "sales-action-forecast", label: "Review forecast", description: "Open the mock sales forecast report.", kind: "secondary", target: { moduleId: "crm", pageId: "sales-forecast" } },
    ],
    scorecard: [
      { id: "sales-score-conversion", label: "Quote-to-order conversion", value: "38.6%", target: "≥ 36.0%", variance: "+2.6 pts", status: "on-track" },
      { id: "sales-score-margin", label: "Gross margin", value: "28.7%", target: "≥ 28.0%", variance: "+0.7 pts", status: "on-track" },
      { id: "sales-score-fulfilment", label: "On-time fulfilment", value: "93.0%", target: "≥ 95.0%", variance: "-2.0 pts", status: "at-risk" },
      { id: "sales-score-overdue", label: "Overdue AR ratio", value: "6.5%", target: "≤ 5.0%", variance: "+1.5 pts", status: "watch" },
    ],
  },

  "accountant-workspace": {
    pageId: "accountant-workspace",
    roleId: "accountant",
    eyebrow: "Daily accounting",
    title: "Accountant Workbench",
    description: "Draft journals, corrections, recurring work, bank matching, evidence, and ledger drill-down.",
    contextNote: "Mock work queue; posted records remain view-only and self-approval is never implied.",
    kpis: [
      { id: "acc-drafts", label: "My draft journals", value: "6", delta: "$42.8K", comparison: "2 older than 3 days", tone: "warning", target: { moduleId: "finance", pageId: "journal-register" } },
      { id: "acc-returned", label: "Returned for correction", value: "2", delta: "1 due today", comparison: "action required", tone: "danger", target: { moduleId: "finance", pageId: "journal-register" } },
      { id: "acc-unmatched", label: "Unmatched bank lines", value: "3", delta: "$46.9K", comparison: "1 suggested match", tone: "warning", target: { moduleId: "banking", pageId: "statement-matching" } },
      { id: "acc-recurring", label: "Recurring drafts due", value: "4", delta: "September cycle", comparison: "0 failed", tone: "info", target: { moduleId: "finance", pageId: "recurring-journals" } },
      { id: "acc-evidence", label: "Evidence incomplete", value: "3", delta: "2 missing documents", comparison: "1 missing dimension", tone: "warning", target: { moduleId: "finance", pageId: "journal-register" } },
      { id: "acc-throughput", label: "Posted today", value: "18", delta: "$286.4K", comparison: "balanced debit / credit", tone: "positive", target: { moduleId: "finance", pageId: "general-ledger" } },
    ],
    chart: {
      title: "Reconciliation completion",
      subtitle: "Monthly bank lines reconciled compared with target",
      unit: "percent",
      months,
      primary: { label: "Reconciled", values: [91.8, 92.6, 93.1, 94.0, 94.4, 95.2, 95.8, 96.1, 96.7, 97.2, 97.8, 98.7] },
      comparison: { label: "Target", values: [99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99] },
      accessibleSummary: "Reconciliation completion improves steadily from 91.8% to 98.7%, leaving a 0.3-point gap to the 99% target in August.",
      target: { moduleId: "banking", pageId: "bank-reconciliation" },
    },
    priorities: [
      { id: "acc-priority-journal", title: "Correct returned journal", detail: "Allocation journal needs a supporting dimension.", due: "Today, 11:00 AM", priority: "urgent", status: "Returned", target: { moduleId: "finance", pageId: "journal-detail" } },
      { id: "acc-priority-bank", title: "Match operating-bank receipt", detail: "$46,820 suggested match needs confirmation.", due: "Today", priority: "high", status: "Suggested", target: { moduleId: "banking", pageId: "statement-matching" } },
      { id: "acc-priority-recurring", title: "Review September recurring drafts", detail: "Four generated drafts await evidence review.", due: "05 Sep", priority: "normal", status: "Ready", target: { moduleId: "finance", pageId: "recurring-journals" } },
      { id: "acc-priority-ar", title: "Allocate customer receipt", detail: "$120,000 receipt requires final allocation review.", due: "06 Sep", priority: "normal", status: "Open", target: { moduleId: "customers", pageId: "receipt-allocation" } },
    ],
    exceptions: [
      { id: "acc-exception-reference", title: "Possible duplicate source reference", detail: "One draft shares a supplier reference with a posted document.", severity: "high", owner: "Accountant", target: { moduleId: "finance", pageId: "journal-register" } },
      { id: "acc-exception-dimension", title: "Required dimension missing", detail: "Two journal lines need a cost-centre selection.", severity: "medium", owner: "Accountant", target: { moduleId: "finance", pageId: "journal-detail" } },
      { id: "acc-exception-period", title: "Prior period is closed", detail: "A draft posting date must be moved or escalated.", severity: "high", owner: "Finance Manager", target: { moduleId: "finance", pageId: "fiscal-periods" } },
      { id: "acc-exception-bank", title: "Unmatched bank charge", detail: "$85 charge has no supporting account classification.", severity: "low", owner: "Treasury Accountant", target: { moduleId: "banking", pageId: "statement-matching" } },
    ],
    quickActions: [
      { id: "acc-action-journal", label: "New journal", description: "Open a mock draft journal form.", kind: "primary", target: { moduleId: "finance", pageId: "manual-journal" } },
      { id: "acc-action-drafts", label: "Resume my drafts", description: "Filter the Journal Register to draft work.", kind: "secondary", target: { moduleId: "finance", pageId: "journal-register" } },
      { id: "acc-action-import", label: "Import bank statement", description: "Open the prototype statement import form.", kind: "secondary", target: { moduleId: "banking", pageId: "import-statement" } },
      { id: "acc-action-ledger", label: "General Ledger", description: "Drill into posted account activity.", kind: "secondary", target: { moduleId: "finance", pageId: "general-ledger" } },
    ],
    scorecard: [
      { id: "acc-score-drafts", label: "Drafts completed within SLA", value: "96.0%", target: "≥ 95.0%", variance: "+1.0 pt", status: "on-track" },
      { id: "acc-score-recon", label: "Bank lines reconciled", value: "98.7%", target: "≥ 99.0%", variance: "-0.3 pts", status: "watch" },
      { id: "acc-score-return", label: "Journal return rate", value: "2.8%", target: "≤ 2.0%", variance: "+0.8 pts", status: "at-risk" },
      { id: "acc-score-evidence", label: "Complete evidence", value: "97.6%", target: "≥ 98.0%", variance: "-0.4 pts", status: "watch" },
    ],
  },
  ...extendedRoleDashboards,
} satisfies Record<RoleDashboardPageId, RoleDashboardDefinition>;

export const roleIdToDashboardPageId = {
  "chief-executive": "ceo-executive-dashboard",
  "chief-financial-officer": "cfo-dashboard",
  "finance-manager": "finance-manager-dashboard",
  "production-manager": "production-manager-dashboard",
  "hr-manager": "hr-manager-dashboard",
  "purchase-manager": "purchasing-manager-dashboard",
  "sales-manager": "sales-manager-dashboard",
  accountant: "accountant-workspace",
  "sales-executive": "sales-executive-dashboard",
  "procurement-officer": "procurement-officer-dashboard",
  "inventory-manager": "inventory-manager-dashboard",
  "warehouse-user": "warehouse-dashboard",
  "project-manager": "project-manager-dashboard",
  administrator: "admin-dashboard",
  "crm-manager": "crm-manager-dashboard",
  "ar-manager": "ar-manager-dashboard",
  "ap-manager": "ap-manager-dashboard",
  "tax-manager": "tax-manager-dashboard",
  auditor: "auditor-dashboard",
} as const satisfies Record<RoleDashboardRoleId, RoleDashboardPageId>;

export function getRoleDashboard(pageId: string): RoleDashboardDefinition | undefined {
  if (!Object.prototype.hasOwnProperty.call(roleDashboardDefinitions, pageId)) return undefined;
  return roleDashboardDefinitions[pageId as RoleDashboardPageId];
}
