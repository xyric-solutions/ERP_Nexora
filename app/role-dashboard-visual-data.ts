/**
 * Supplemental visualization fixtures for the isolated Nexora ERP prototype.
 *
 * Every value is deterministic mock data. Drill-down targets resolve only to
 * screens in the prototype catalogue; there is no API, database, or Demo
 * Account dependency in this file.
 */

import type { RoleDashboardPageId, RoleDashboardTarget } from "./role-dashboard-data";
import type { ChartCategoricalTone } from "./role-dashboard-charts";
import { extendedRoleVisuals } from "./extended-role-experience.ts";

/**
 * Visual tones reuse the chart engine's categorical tones, so there is one
 * palette rather than two drifting lists. Previously this union carried its
 * own "green"/"amber" names that pointed at status colours.
 */
export type RoleDashboardVisualTone = ChartCategoricalTone;

/**
 * Insight tones are a STATUS channel, not series identity: an insight means
 * "opportunity", "watch item" or "recommended action", and the card renders an
 * icon and a label for each, so the meaning never rests on colour alone.
 */
export type RoleDashboardInsightTone = "good" | "warn" | "info";
export type RoleDashboardDriverStatus = "on-track" | "watch" | "at-risk";

export interface RoleDashboardDistributionSegment {
  id: string;
  label: string;
  value: number;
  display: string;
  tone: RoleDashboardVisualTone;
  target: RoleDashboardTarget;
}

export type RoleDashboardDistributionSegments = readonly [
  RoleDashboardDistributionSegment,
  RoleDashboardDistributionSegment,
  RoleDashboardDistributionSegment,
  RoleDashboardDistributionSegment,
];

export interface RoleDashboardDistribution {
  title: string;
  subtitle: string;
  centerValue: string;
  centerLabel: string;
  accessibleSummary: string;
  segments: RoleDashboardDistributionSegments;
}

export interface RoleDashboardDriverBar {
  id: string;
  label: string;
  value: number;
  max: number;
  valueLabel: string;
  benchmark: number;
  benchmarkLabel: string;
  status: RoleDashboardDriverStatus;
  target: RoleDashboardTarget;
}

export type RoleDashboardDriverBars = readonly [
  RoleDashboardDriverBar,
  RoleDashboardDriverBar,
  RoleDashboardDriverBar,
  RoleDashboardDriverBar,
  RoleDashboardDriverBar,
];

export interface RoleDashboardDrivers {
  title: string;
  subtitle: string;
  unit: string;
  accessibleSummary: string;
  bars: RoleDashboardDriverBars;
}

export interface RoleDashboardInsight {
  id: string;
  title: string;
  detail: string;
  tone: RoleDashboardInsightTone;
  target: RoleDashboardTarget;
}

export type RoleDashboardInsights = readonly [
  RoleDashboardInsight,
  RoleDashboardInsight,
  RoleDashboardInsight,
];

export interface RoleDashboardVisualDefinition {
  distribution: RoleDashboardDistribution;
  drivers: RoleDashboardDrivers;
  insights: RoleDashboardInsights;
}

export const roleDashboardVisuals = {
  "ceo-executive-dashboard": {
    distribution: {
      title: "Revenue mix by business unit",
      subtitle: "Year-to-date contribution to consolidated revenue",
      centerValue: "$8.42M",
      centerLabel: "Revenue YTD",
      accessibleSummary: "Manufacturing contributes 39%, projects and services 27%, commercial distribution 21%, and support contracts 13% of year-to-date revenue.",
      segments: [
        { id: "ceo-mix-manufacturing", label: "Manufacturing", value: 39, display: "$3.28M", tone: "blue", target: { moduleId: "manufacturing", pageId: "production-reports" } },
        { id: "ceo-mix-services", label: "Projects & services", value: 27, display: "$2.27M", tone: "cyan", target: { moduleId: "projects", pageId: "project-dashboard" } },
        { id: "ceo-mix-commercial", label: "Commercial distribution", value: 21, display: "$1.77M", tone: "teal", target: { moduleId: "sales", pageId: "sales-reports" } },
        { id: "ceo-mix-support", label: "Support contracts", value: 13, display: "$1.10M", tone: "violet", target: { moduleId: "reports", pageId: "report-viewer" } },
      ],
    },
    drivers: {
      title: "Strategic health",
      subtitle: "Enterprise outcomes against board-approved thresholds",
      unit: "Index / 100",
      accessibleSummary: "Customer retention and people readiness exceed target; cash resilience and delivery confidence require management attention.",
      bars: [
        { id: "ceo-health-growth", label: "Profitable growth", value: 91, max: 100, valueLabel: "91", benchmark: 88, benchmarkLabel: "Target 88", status: "on-track", target: { moduleId: "reports", pageId: "report-viewer" } },
        { id: "ceo-health-cash", label: "Cash resilience", value: 76, max: 100, valueLabel: "76", benchmark: 85, benchmarkLabel: "Target 85", status: "at-risk", target: { moduleId: "banking", pageId: "cash-forecast" } },
        { id: "ceo-health-customer", label: "Customer retention", value: 94, max: 100, valueLabel: "94", benchmark: 90, benchmarkLabel: "Target 90", status: "on-track", target: { moduleId: "crm", pageId: "crm-dashboard" } },
        { id: "ceo-health-delivery", label: "Delivery confidence", value: 82, max: 100, valueLabel: "82", benchmark: 90, benchmarkLabel: "Target 90", status: "watch", target: { moduleId: "manufacturing", pageId: "production-orders" } },
        { id: "ceo-health-people", label: "People readiness", value: 89, max: 100, valueLabel: "89", benchmark: 86, benchmarkLabel: "Target 86", status: "on-track", target: { moduleId: "hr", pageId: "hr-reports" } },
      ],
    },
    insights: [
      { id: "ceo-insight-margin", title: "Growth is converting to margin", detail: "Revenue is 14.8% ahead of last year while operating margin remains 1.7 points above plan.", tone: "good", target: { moduleId: "finance", pageId: "financial-statements" } },
      { id: "ceo-insight-cash", title: "Week-six liquidity needs action", detail: "The 13-week forecast falls $34K below the policy buffer; collection timing is the fastest recovery lever.", tone: "warn", target: { moduleId: "banking", pageId: "cash-forecast" } },
      { id: "ceo-insight-delivery", title: "One constraint links two risks", detail: "The enclosure quality hold affects both the Atlas delivery promise and manufacturing schedule adherence.", tone: "info", target: { moduleId: "quality", pageId: "quarantine-disposition" } },
    ],
  },

  "cfo-dashboard": {
    distribution: {
      title: "Working capital deployment",
      subtitle: "Share of gross current operating assets",
      centerValue: "$1.91M",
      centerLabel: "Operating assets",
      accessibleSummary: "Trade receivables represent 38%, inventory 31%, cash reserve 19%, and other current assets 12% of gross current operating assets.",
      segments: [
        { id: "cfo-wc-receivables", label: "Trade receivables", value: 38, display: "$726K", tone: "blue", target: { moduleId: "customers", pageId: "ar-ageing" } },
        { id: "cfo-wc-inventory", label: "Inventory", value: 31, display: "$592K", tone: "cyan", target: { moduleId: "inventory", pageId: "stock-position" } },
        { id: "cfo-wc-cash", label: "Cash reserve", value: 19, display: "$363K", tone: "teal", target: { moduleId: "banking", pageId: "account-balances" } },
        { id: "cfo-wc-other", label: "Other current assets", value: 12, display: "$229K", tone: "violet", target: { moduleId: "finance", pageId: "financial-statements" } },
      ],
    },
    drivers: {
      title: "Liquidity and control drivers",
      subtitle: "Current performance against finance policy",
      unit: "Normalised score",
      accessibleSummary: "Budget performance and close completion are strong; cash buffer coverage and overdue receivables are below policy expectations.",
      bars: [
        { id: "cfo-driver-buffer", label: "Cash buffer coverage", value: 76, max: 100, valueLabel: "0.94×", benchmark: 85, benchmarkLabel: "Policy 1.00×", status: "at-risk", target: { moduleId: "banking", pageId: "cash-forecast" } },
        { id: "cfo-driver-ar", label: "Receivables current", value: 84, max: 100, valueLabel: "93.5%", benchmark: 90, benchmarkLabel: "Target 95%", status: "watch", target: { moduleId: "customers", pageId: "ar-ageing" } },
        { id: "cfo-driver-inventory", label: "Inventory efficiency", value: 88, max: 100, valueLabel: "7.1 turns", benchmark: 85, benchmarkLabel: "Target 6.8", status: "on-track", target: { moduleId: "inventory", pageId: "inventory-reports" } },
        { id: "cfo-driver-budget", label: "Operating profit to budget", value: 94, max: 100, valueLabel: "+9.1%", benchmark: 88, benchmarkLabel: "Target 0%", status: "on-track", target: { moduleId: "budget", pageId: "budget-actual" } },
        { id: "cfo-driver-close", label: "Close completion", value: 82, max: 100, valueLabel: "18 / 22", benchmark: 80, benchmarkLabel: "Day-4 target 80%", status: "on-track", target: { moduleId: "finance", pageId: "period-close" } },
      ],
    },
    insights: [
      { id: "cfo-insight-collections", title: "Collections can protect the cash floor", detail: "Recovering the $48.5K strategic overdue balance would restore the forecast above the week-six policy buffer.", tone: "warn", target: { moduleId: "customers", pageId: "ar-ageing" } },
      { id: "cfo-insight-close", title: "Close is on pace, with concentration risk", detail: "Eighteen of twenty-two tasks are complete, but two remaining reconciliations sit with the same team.", tone: "info", target: { moduleId: "finance", pageId: "period-close" } },
      { id: "cfo-insight-margin", title: "Profit headroom supports reforecast", detail: "Operating profit is $126K favourable, providing room to absorb the materials forecast increase if approved.", tone: "good", target: { moduleId: "budget", pageId: "budget-actual" } },
    ],
  },

  "finance-manager-dashboard": {
    distribution: {
      title: "Close task status",
      subtitle: "August close work across owners and control stages",
      centerValue: "22",
      centerLabel: "Close tasks",
      accessibleSummary: "Fifty-four percent of close tasks are complete, 28% are in progress, 9% are blocked, and 9% have not started.",
      segments: [
        { id: "fm-close-complete", label: "Complete", value: 54, display: "12 tasks", tone: "teal", target: { moduleId: "finance", pageId: "period-close" } },
        { id: "fm-close-progress", label: "In progress", value: 28, display: "6 tasks", tone: "blue", target: { moduleId: "finance", pageId: "period-close" } },
        { id: "fm-close-blocked", label: "Blocked", value: 9, display: "2 tasks", tone: "sky", target: { moduleId: "finance", pageId: "accounting-events" } },
        { id: "fm-close-not-started", label: "Not started", value: 9, display: "2 tasks", tone: "violet", target: { moduleId: "finance", pageId: "period-close" } },
      ],
    },
    drivers: {
      title: "Financial control pulse",
      subtitle: "Readiness scores for core close controls",
      unit: "Control score / 100",
      accessibleSummary: "Trial balance and report freshness are on track; bank reconciliation and accounting-event clearance need intervention.",
      bars: [
        { id: "fm-control-tb", label: "Trial balance integrity", value: 100, max: 100, valueLabel: "$0 difference", benchmark: 100, benchmarkLabel: "Target zero", status: "on-track", target: { moduleId: "finance", pageId: "trial-balance" } },
        { id: "fm-control-bank", label: "Bank reconciliation", value: 72, max: 100, valueLabel: "3 open items", benchmark: 90, benchmarkLabel: "Target 90", status: "at-risk", target: { moduleId: "banking", pageId: "bank-reconciliation" } },
        { id: "fm-control-subledger", label: "Subledger certification", value: 82, max: 100, valueLabel: "2 open", benchmark: 90, benchmarkLabel: "Target 90", status: "watch", target: { moduleId: "finance", pageId: "period-close" } },
        { id: "fm-control-events", label: "Event clearance", value: 68, max: 100, valueLabel: "7 open", benchmark: 88, benchmarkLabel: "Target 88", status: "at-risk", target: { moduleId: "finance", pageId: "accounting-events" } },
        { id: "fm-control-reports", label: "Reporting freshness", value: 96, max: 100, valueLabel: "6 min lag", benchmark: 92, benchmarkLabel: "Target 92", status: "on-track", target: { moduleId: "reports", pageId: "reporting-admin" } },
      ],
    },
    insights: [
      { id: "fm-insight-critical-path", title: "Reconciliations define the critical path", detail: "AR, AP, and operating-bank certification account for three of the four remaining close tasks.", tone: "warn", target: { moduleId: "finance", pageId: "period-close" } },
      { id: "fm-insight-events", title: "One failed event needs priority", detail: "Clearing the failed accounting event unlocks two dependent certification steps and reduces manual review.", tone: "info", target: { moduleId: "finance", pageId: "accounting-events" } },
      { id: "fm-insight-quality", title: "Ledger integrity remains strong", detail: "The trial balance is at zero difference and reporting freshness remains inside the six-minute policy window.", tone: "good", target: { moduleId: "finance", pageId: "trial-balance" } },
    ],
  },

  "production-manager-dashboard": {
    distribution: {
      title: "Production order status",
      subtitle: "Fourteen active orders by current execution state",
      centerValue: "14",
      centerLabel: "Active orders",
      accessibleSummary: "Running orders represent 38%, released orders 26%, material-constrained orders 21%, and quality-held orders 15% of active production.",
      segments: [
        { id: "pm-orders-running", label: "Running", value: 38, display: "5 orders", tone: "teal", target: { moduleId: "manufacturing", pageId: "production-orders" } },
        { id: "pm-orders-released", label: "Released", value: 26, display: "4 orders", tone: "blue", target: { moduleId: "manufacturing", pageId: "release-production-order" } },
        { id: "pm-orders-constrained", label: "Material constrained", value: 21, display: "3 orders", tone: "sky", target: { moduleId: "manufacturing", pageId: "material-requirements" } },
        { id: "pm-orders-quality", label: "Quality hold", value: 15, display: "2 orders", tone: "violet", target: { moduleId: "quality", pageId: "quarantine-disposition" } },
      ],
    },
    drivers: {
      title: "Work-centre performance",
      subtitle: "Output efficiency against rated capacity",
      unit: "Utilisation percent",
      accessibleSummary: "Fabrication and final test are on target; Assembly Line B is at risk because of a material constraint, while Assembly Line A and packing require monitoring.",
      bars: [
        { id: "pm-centre-fabrication", label: "Fabrication", value: 88, max: 100, valueLabel: "88%", benchmark: 85, benchmarkLabel: "Target 85%", status: "on-track", target: { moduleId: "manufacturing", pageId: "capacity-planner" } },
        { id: "pm-centre-assembly-a", label: "Assembly Line A", value: 81, max: 100, valueLabel: "81%", benchmark: 85, benchmarkLabel: "Target 85%", status: "watch", target: { moduleId: "manufacturing", pageId: "work-centres" } },
        { id: "pm-centre-assembly-b", label: "Assembly Line B", value: 69, max: 100, valueLabel: "69%", benchmark: 85, benchmarkLabel: "Target 85%", status: "at-risk", target: { moduleId: "manufacturing", pageId: "capacity-planner" } },
        { id: "pm-centre-test", label: "Final test", value: 91, max: 100, valueLabel: "91%", benchmark: 85, benchmarkLabel: "Target 85%", status: "on-track", target: { moduleId: "quality", pageId: "inspection-queue" } },
        { id: "pm-centre-packing", label: "Packing & dispatch", value: 79, max: 100, valueLabel: "79%", benchmark: 82, benchmarkLabel: "Target 82%", status: "watch", target: { moduleId: "inventory", pageId: "stock-position" } },
      ],
    },
    insights: [
      { id: "pm-insight-bottleneck", title: "Assembly Line B is the bottleneck", detail: "The line is 16 points below target and contains the two production-critical constrained orders.", tone: "warn", target: { moduleId: "manufacturing", pageId: "capacity-planner" } },
      { id: "pm-insight-quality", title: "Quality is strong after release", detail: "First-pass yield is 97.8%; current delivery exposure originates in incoming material, not process quality.", tone: "good", target: { moduleId: "quality", pageId: "quality-dashboard" } },
      { id: "pm-insight-recovery", title: "One disposition could restore adherence", detail: "Releasing forty-five inspected enclosures would recover the Atlas order and improve schedule adherence by an estimated 2.4 points.", tone: "info", target: { moduleId: "quality", pageId: "quarantine-disposition" } },
    ],
  },

  "hr-manager-dashboard": {
    distribution: {
      title: "Workforce by department",
      subtitle: "Active headcount across operating groups",
      centerValue: "248",
      centerLabel: "Active people",
      accessibleSummary: "Operations represents 34%, production 29%, commercial 21%, and corporate functions 16% of active headcount.",
      segments: [
        { id: "hr-workforce-operations", label: "Operations", value: 34, display: "84 people", tone: "blue", target: { moduleId: "hr", pageId: "positions-org" } },
        { id: "hr-workforce-production", label: "Production", value: 29, display: "72 people", tone: "cyan", target: { moduleId: "hr", pageId: "employees" } },
        { id: "hr-workforce-commercial", label: "Commercial", value: 21, display: "52 people", tone: "teal", target: { moduleId: "hr", pageId: "hr-reports" } },
        { id: "hr-workforce-corporate", label: "Corporate functions", value: 16, display: "40 people", tone: "violet", target: { moduleId: "hr", pageId: "employees" } },
      ],
    },
    drivers: {
      title: "Workforce readiness",
      subtitle: "Leading indicators for capacity and employee operations",
      unit: "Readiness score / 100",
      accessibleSummary: "Attendance and retention are on track; payroll inputs and critical-role coverage need attention, with onboarding under watch.",
      bars: [
        { id: "hr-driver-attendance", label: "Attendance", value: 96, max: 100, valueLabel: "96.2%", benchmark: 95, benchmarkLabel: "Target 95%", status: "on-track", target: { moduleId: "hr", pageId: "attendance" } },
        { id: "hr-driver-payroll", label: "Payroll input readiness", value: 81, max: 100, valueLabel: "13 exceptions", benchmark: 95, benchmarkLabel: "Target 95%", status: "at-risk", target: { moduleId: "hr", pageId: "payroll-validation" } },
        { id: "hr-driver-onboarding", label: "Onboarding completion", value: 86, max: 100, valueLabel: "6 of 7 on plan", benchmark: 90, benchmarkLabel: "Target 90%", status: "watch", target: { moduleId: "hr", pageId: "onboarding" } },
        { id: "hr-driver-retention", label: "Retention health", value: 91, max: 100, valueLabel: "8.6% turnover", benchmark: 88, benchmarkLabel: "Target 88", status: "on-track", target: { moduleId: "hr", pageId: "hr-reports" } },
        { id: "hr-driver-coverage", label: "Critical-role coverage", value: 74, max: 100, valueLabel: "1 long vacancy", benchmark: 90, benchmarkLabel: "Target 90", status: "at-risk", target: { moduleId: "hr", pageId: "positions-org" } },
      ],
    },
    insights: [
      { id: "hr-insight-payroll", title: "Payroll risk is concentrated", detail: "Ten of thirteen validation exceptions belong to two departments, enabling focused manager follow-up today.", tone: "warn", target: { moduleId: "hr", pageId: "payroll-validation" } },
      { id: "hr-insight-capacity", title: "Production planning remains exposed", detail: "The critical planner role has been vacant for 42 days while production schedules are under constraint.", tone: "info", target: { moduleId: "hr", pageId: "positions-org" } },
      { id: "hr-insight-retention", title: "Retention is improving", detail: "Rolling turnover is 0.9 points below last year and attendance has strengthened for a second month.", tone: "good", target: { moduleId: "hr", pageId: "hr-reports" } },
    ],
  },

  "purchasing-manager-dashboard": {
    distribution: {
      title: "Open commitment by category",
      subtitle: "Purchase-order value awaiting delivery or completion",
      centerValue: "$214.7K",
      centerLabel: "Open commitments",
      accessibleSummary: "Raw materials represent 42%, automation components 27%, services 18%, and technology 13% of open purchase commitments.",
      segments: [
        { id: "pur-category-material", label: "Raw materials", value: 42, display: "$90.2K", tone: "blue", target: { moduleId: "purchases", pageId: "purchase-orders" } },
        { id: "pur-category-automation", label: "Automation components", value: 27, display: "$58.0K", tone: "cyan", target: { moduleId: "purchases", pageId: "purchase-order-detail" } },
        { id: "pur-category-services", label: "Services", value: 18, display: "$38.6K", tone: "teal", target: { moduleId: "purchases", pageId: "procurement-reports" } },
        { id: "pur-category-technology", label: "Technology", value: 13, display: "$27.9K", tone: "violet", target: { moduleId: "purchases", pageId: "budget-check" } },
      ],
    },
    drivers: {
      title: "Supplier performance",
      subtitle: "Top supplier delivery scorecard",
      unit: "OTIF percent",
      accessibleSummary: "Apex and Metro perform above target; Delta requires monitoring, while Northstar and Vertex are below the acceptable on-time-in-full threshold.",
      bars: [
        { id: "pur-supplier-apex", label: "Apex Automation", value: 97, max: 100, valueLabel: "97% OTIF", benchmark: 94, benchmarkLabel: "Target 94%", status: "on-track", target: { moduleId: "purchases", pageId: "procurement-reports" } },
        { id: "pur-supplier-metro", label: "Metro Industrial", value: 95, max: 100, valueLabel: "95% OTIF", benchmark: 94, benchmarkLabel: "Target 94%", status: "on-track", target: { moduleId: "purchases", pageId: "procurement-reports" } },
        { id: "pur-supplier-delta", label: "Delta Components", value: 91, max: 100, valueLabel: "91% OTIF", benchmark: 94, benchmarkLabel: "Target 94%", status: "watch", target: { moduleId: "purchases", pageId: "procurement-reports" } },
        { id: "pur-supplier-northstar", label: "Northstar Metals", value: 84, max: 100, valueLabel: "84% OTIF", benchmark: 94, benchmarkLabel: "Target 94%", status: "at-risk", target: { moduleId: "purchases", pageId: "supplier-evaluation" } },
        { id: "pur-supplier-vertex", label: "Vertex Enclosures", value: 78, max: 100, valueLabel: "78% OTIF", benchmark: 94, benchmarkLabel: "Target 94%", status: "at-risk", target: { moduleId: "purchases", pageId: "quality-handoff" } },
      ],
    },
    insights: [
      { id: "pur-insight-concentration", title: "Delivery risk is supplier-specific", detail: "Vertex represents only 12% of commitments but drives both production-critical overdue purchase orders.", tone: "warn", target: { moduleId: "purchases", pageId: "purchase-orders" } },
      { id: "pur-insight-source", title: "Servo sourcing can improve resilience", detail: "Three compliant quotations allow the team to reduce single-source exposure without delaying award.", tone: "info", target: { moduleId: "purchases", pageId: "bid-comparison" } },
      { id: "pur-insight-cycle", title: "Procurement cycle time is improving", detail: "Requisition and sourcing cycles are both faster than target, creating capacity for exception resolution.", tone: "good", target: { moduleId: "purchases", pageId: "procurement-reports" } },
    ],
  },

  "sales-manager-dashboard": {
    distribution: {
      title: "Weighted pipeline by stage",
      subtitle: "Qualified opportunity value by current sales stage",
      centerValue: "$3.18M",
      centerLabel: "Weighted pipeline",
      accessibleSummary: "Qualified opportunities represent 34%, proposals 29%, negotiations 23%, and commit-stage deals 14% of weighted pipeline.",
      segments: [
        { id: "sales-stage-qualified", label: "Qualified", value: 34, display: "$1.08M", tone: "blue", target: { moduleId: "crm", pageId: "opportunities" } },
        { id: "sales-stage-proposal", label: "Proposal", value: 29, display: "$922K", tone: "cyan", target: { moduleId: "sales", pageId: "quotations" } },
        { id: "sales-stage-negotiation", label: "Negotiation", value: 23, display: "$731K", tone: "violet", target: { moduleId: "crm", pageId: "opportunities" } },
        { id: "sales-stage-commit", label: "Commit", value: 14, display: "$445K", tone: "teal", target: { moduleId: "crm", pageId: "sales-forecast" } },
      ],
    },
    drivers: {
      title: "Commercial momentum",
      subtitle: "Funnel quality and revenue-conversion indicators",
      unit: "Normalised score",
      accessibleSummary: "Pipeline coverage, order intake, and gross margin are on track; conversion requires monitoring and delivery readiness is at risk.",
      bars: [
        { id: "sales-driver-coverage", label: "Pipeline coverage", value: 96, max: 100, valueLabel: "3.2×", benchmark: 90, benchmarkLabel: "Target 3.0×", status: "on-track", target: { moduleId: "crm", pageId: "sales-forecast" } },
        { id: "sales-driver-conversion", label: "Quote conversion", value: 83, max: 100, valueLabel: "38.6%", benchmark: 88, benchmarkLabel: "Target 41%", status: "watch", target: { moduleId: "sales", pageId: "quotations" } },
        { id: "sales-driver-intake", label: "Order intake", value: 93, max: 100, valueLabel: "$289.3K", benchmark: 90, benchmarkLabel: "Target $278K", status: "on-track", target: { moduleId: "sales", pageId: "sales-orders" } },
        { id: "sales-driver-margin", label: "Gross margin", value: 92, max: 100, valueLabel: "28.7%", benchmark: 89, benchmarkLabel: "Plan 27.9%", status: "on-track", target: { moduleId: "sales", pageId: "sales-reports" } },
        { id: "sales-driver-delivery", label: "Delivery readiness", value: 71, max: 100, valueLabel: "5 blocks", benchmark: 90, benchmarkLabel: "Target 90", status: "at-risk", target: { moduleId: "sales", pageId: "sales-approvals" } },
      ],
    },
    insights: [
      { id: "sales-insight-coverage", title: "Pipeline volume is sufficient", detail: "Coverage is above the 3.0× target, so forecast quality now depends more on stage discipline than lead volume.", tone: "good", target: { moduleId: "crm", pageId: "sales-forecast" } },
      { id: "sales-insight-blocks", title: "Commercial wins need operational release", detail: "Five credit or delivery blocks hold $123.5K of order value despite healthy demand and margin.", tone: "warn", target: { moduleId: "sales", pageId: "sales-approvals" } },
      { id: "sales-insight-conversion", title: "Proposal follow-up is the conversion lever", detail: "Moving two mature proposals to negotiation would lift projected conversion above the quarterly target.", tone: "info", target: { moduleId: "sales", pageId: "quotations" } },
    ],
  },

  "accountant-workspace": {
    distribution: {
      title: "Today's processing workload",
      subtitle: "Open accounting items by work type",
      centerValue: "33",
      centerLabel: "Open items",
      accessibleSummary: "Journals represent 36%, bank reconciliation 24%, receipt allocation 22%, and evidence or correction work 18% of today's open processing workload.",
      segments: [
        { id: "acc-work-journals", label: "Journals", value: 36, display: "12 items", tone: "blue", target: { moduleId: "finance", pageId: "journal-register" } },
        { id: "acc-work-bank", label: "Bank reconciliation", value: 24, display: "8 items", tone: "cyan", target: { moduleId: "banking", pageId: "statement-matching" } },
        { id: "acc-work-allocation", label: "Receipt allocation", value: 22, display: "7 items", tone: "teal", target: { moduleId: "customers", pageId: "receipt-allocation" } },
        { id: "acc-work-correction", label: "Evidence & corrections", value: 18, display: "6 items", tone: "sky", target: { moduleId: "finance", pageId: "journal-register" } },
      ],
    },
    drivers: {
      title: "Processing efficiency",
      subtitle: "Daily workflow completion against service targets",
      unit: "Completion percent",
      accessibleSummary: "Posting accuracy and journal throughput are on track; returned-work clearance and bank matching are at risk, while evidence completeness needs monitoring.",
      bars: [
        { id: "acc-driver-journals", label: "Journal throughput", value: 90, max: 100, valueLabel: "18 of 20", benchmark: 85, benchmarkLabel: "Target 85%", status: "on-track", target: { moduleId: "finance", pageId: "journal-register" } },
        { id: "acc-driver-bank", label: "Bank matching", value: 68, max: 100, valueLabel: "3 unmatched", benchmark: 90, benchmarkLabel: "Target 90%", status: "at-risk", target: { moduleId: "banking", pageId: "statement-matching" } },
        { id: "acc-driver-corrections", label: "Returned-work clearance", value: 60, max: 100, valueLabel: "2 open", benchmark: 90, benchmarkLabel: "Target 90%", status: "at-risk", target: { moduleId: "finance", pageId: "journal-register" } },
        { id: "acc-driver-evidence", label: "Evidence completeness", value: 82, max: 100, valueLabel: "3 incomplete", benchmark: 95, benchmarkLabel: "Target 95%", status: "watch", target: { moduleId: "finance", pageId: "journal-detail" } },
        { id: "acc-driver-accuracy", label: "First-pass posting accuracy", value: 97, max: 100, valueLabel: "97%", benchmark: 95, benchmarkLabel: "Target 95%", status: "on-track", target: { moduleId: "finance", pageId: "general-ledger" } },
      ],
    },
    insights: [
      { id: "acc-insight-sequence", title: "Start with the returned journal", detail: "Correcting its missing dimension removes the only item due before noon and improves first-pass workflow compliance.", tone: "warn", target: { moduleId: "finance", pageId: "journal-detail" } },
      { id: "acc-insight-match", title: "A suggested match clears most bank value", detail: "Confirming the $46.8K operating-bank receipt resolves nearly all currently unmatched value in one action.", tone: "info", target: { moduleId: "banking", pageId: "statement-matching" } },
      { id: "acc-insight-control", title: "Posting quality remains high", detail: "Eighteen balanced entries posted today with 97% first-pass accuracy and no debit-credit difference.", tone: "good", target: { moduleId: "finance", pageId: "general-ledger" } },
    ],
  },
  ...extendedRoleVisuals,
} satisfies Record<RoleDashboardPageId, RoleDashboardVisualDefinition>;

export function getRoleDashboardVisuals(pageId: string): RoleDashboardVisualDefinition | undefined {
  if (!(pageId in roleDashboardVisuals)) return undefined;
  return roleDashboardVisuals[pageId as RoleDashboardPageId];
}
