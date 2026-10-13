/**
 * Complete role coverage for the isolated Nexora prototype.
 * All records are deterministic visual fixtures and never touch Demo data.
 */
import type { RoleDashboardDefinition, RoleDashboardPageId, RoleDashboardRoleId, RoleDashboardTarget } from "./role-dashboard-data";
import type { RoleDashboardVisualDefinition } from "./role-dashboard-visual-data";
import type { RoleAnalyticsDefinition } from "./role-dashboard-analytics-data";

type SixStrings = readonly [string, string, string, string, string, string];
type FourStrings = readonly [string, string, string, string];

interface ExtendedRoleConfig {
  pageId: RoleDashboardPageId;
  roleId: RoleDashboardRoleId;
  eyebrow: string;
  title: string;
  description: string;
  focus: string;
  target: RoleDashboardTarget;
  kpis: SixStrings;
  values: SixStrings;
  priorities: FourStrings;
  exceptions: FourStrings;
  actions: FourStrings;
  scoreTargets: FourStrings;
  seed: number;
}

const target = (moduleId: string, pageId: string): RoleDashboardTarget => ({ moduleId, pageId });

const configs: readonly ExtendedRoleConfig[] = [
  {
    pageId: "sales-executive-dashboard", roleId: "sales-executive", eyebrow: "Personal selling workspace",
    title: "Sales Executive Daily Cockpit", description: "Personal pipeline, follow-ups, quotations, orders, collections and customer commitments.",
    focus: "selling activity", target: target("crm", "opportunities"),
    kpis: ["My pipeline", "Weighted forecast", "Target achieved", "Quotes awaiting follow-up", "Orders blocked", "Overdue customer actions"],
    values: ["$486K", "$214K", "82.4%", "7", "2", "5"],
    priorities: ["Follow up Atlas proposal", "Resolve order credit block", "Prepare Crescent quotation", "Confirm Northstar delivery date"],
    exceptions: ["Opportunity has no next action", "Quotation expires tomorrow", "Customer credit review overdue", "Promise date is at risk"],
    actions: ["New opportunity", "New quotation", "Log customer activity", "Open my pipeline"],
    scoreTargets: ["≥ $450K", "≥ $225K", "≥ 85%", "≤ 5"], seed: 64,
  },
  {
    pageId: "procurement-officer-dashboard", roleId: "procurement-officer", eyebrow: "Daily sourcing workspace",
    title: "Procurement Officer Workbench", description: "Assigned requisitions, RFQs, supplier quotations, comparisons and purchase-order preparation.",
    focus: "procurement throughput", target: target("purchases", "purchase-requisitions"),
    kpis: ["Assigned requisitions", "RFQs closing this week", "Quotes awaiting capture", "Average sourcing cycle", "Price variance", "Documents needing action"],
    values: ["18", "6", "11", "4.8 days", "-2.6%", "9"],
    priorities: ["Issue servo-drive RFQ", "Complete bid comparison", "Chase missing supplier quote", "Prepare award recommendation"],
    exceptions: ["Single-source justification missing", "Supplier certificate expires soon", "Quote received after deadline", "Budget code requires review"],
    actions: ["Create RFQ", "Capture quotation", "Open bid comparison", "View assigned requisitions"],
    scoreTargets: ["≤ 20", "100%", "≤ 8", "≤ 5 days"], seed: 58,
  },
  {
    pageId: "inventory-manager-dashboard", roleId: "inventory-manager", eyebrow: "Inventory control tower",
    title: "Inventory Manager Command Centre", description: "Stock value, availability, ageing, replenishment, counts and valuation exceptions.",
    focus: "inventory health", target: target("inventory", "stock-position"),
    kpis: ["Stock value", "Available inventory", "Below reorder", "Slow-moving value", "Count accuracy", "Stock exceptions"],
    values: ["$864K", "$726K", "38 items", "$96.4K", "98.7%", "12"],
    priorities: ["Release cable replenishment", "Review slow-moving stock", "Approve count variance", "Resolve negative availability"],
    exceptions: ["Safety stock breached", "Batch expires within 30 days", "Count variance above tolerance", "Uncosted receipt remains open"],
    actions: ["Open stock position", "Start cycle count", "Create stock transfer", "Run valuation"],
    scoreTargets: ["≤ $900K", "≥ 92%", "≤ 25", "≤ $75K"], seed: 72,
  },
  {
    pageId: "warehouse-dashboard", roleId: "warehouse-user", eyebrow: "Warehouse execution",
    title: "Warehouse Operations Board", description: "Receiving, put-away, picking, packing, dispatch, bin capacity and shift priorities.",
    focus: "warehouse execution", target: target("inventory", "pick-tasks"),
    kpis: ["Inbound due today", "Put-away waiting", "Pick tasks open", "Dispatches due", "On-time completion", "Blocked movements"],
    values: ["14", "9", "26", "11", "94.2%", "4"],
    priorities: ["Receive PO-2026-1842", "Complete priority pick wave", "Move quality-cleared stock", "Close dispatch manifest"],
    exceptions: ["Receiving bay congestion", "Bin capacity exceeded", "Serial number missing", "Dispatch document incomplete"],
    actions: ["Receive goods", "Open pick queue", "Create stock transfer", "Print dispatch list"],
    scoreTargets: ["100%", "≤ 5", "≤ 20", "≥ 96%"], seed: 76,
  },
  {
    pageId: "project-manager-dashboard", roleId: "project-manager", eyebrow: "Project delivery command centre",
    title: "Project Manager Delivery Cockpit", description: "Milestones, revenue, cost, margin, utilisation, WIP and billing readiness.",
    focus: "project delivery", target: target("projects", "project-dashboard"),
    kpis: ["Active project value", "Revenue recognised", "Gross margin", "Milestones at risk", "Unbilled WIP", "Team utilisation"],
    values: ["$313K", "$184K", "31.2%", "3", "$46.8K", "78.4%"],
    priorities: ["Recover Crescent design sign-off", "Approve August timesheets", "Prepare Atlas milestone bill", "Resolve resource conflict"],
    exceptions: ["Milestone forecast is late", "Margin below approved baseline", "Billable time not submitted", "Change request remains unpriced"],
    actions: ["Open project board", "Review timesheets", "Create change request", "Prepare billing"],
    scoreTargets: ["≥ $300K", "≥ $175K", "≥ 30%", "≤ 2"], seed: 68,
  },
  {
    pageId: "admin-dashboard", roleId: "administrator", eyebrow: "Platform administration",
    title: "Administrator Control Centre", description: "Users, access, configuration, integrations, jobs, security and environment health.",
    focus: "platform governance", target: target("administration", "admin-dashboard"),
    kpis: ["Active users", "Pending access requests", "Integration health", "Failed background jobs", "Configuration changes", "Security exceptions"],
    values: ["148", "6", "98.9%", "3", "12", "2"],
    priorities: ["Review privileged access", "Resolve integration failure", "Publish approved configuration", "Complete user offboarding"],
    exceptions: ["Dormant privileged account", "Integration token expires soon", "Failed scheduled export", "Role has conflicting permissions"],
    actions: ["Add user", "Review access", "Open integrations", "View system audit"],
    scoreTargets: ["≥ 95%", "≤ 4", "≥ 99.5%", "0"], seed: 88,
  },
  {
    pageId: "crm-manager-dashboard", roleId: "crm-manager", eyebrow: "Customer growth command centre",
    title: "CRM Manager Growth Dashboard", description: "Lead quality, opportunity pipeline, activity discipline, conversion and retention signals.",
    focus: "customer growth", target: target("crm", "crm-dashboard"),
    kpis: ["Qualified pipeline", "Pipeline coverage", "Lead conversion", "Opportunities at risk", "Activities overdue", "Retention watchlist"],
    values: ["$1.26M", "3.4×", "28.6%", "8", "17", "6"],
    priorities: ["Reassign inactive opportunities", "Review weekly forecast", "Launch retention playbook", "Clean duplicate accounts"],
    exceptions: ["High-value deal has no activity", "Lead response SLA breached", "Forecast confidence changed", "Customer health score declined"],
    actions: ["Add lead", "Add opportunity", "Open pipeline", "Review customer health"],
    scoreTargets: ["≥ $1.2M", "≥ 3.0×", "≥ 30%", "≤ 6"], seed: 66,
  },
  {
    pageId: "ar-manager-dashboard", roleId: "ar-manager", eyebrow: "Receivables control tower",
    title: "Accounts Receivable Dashboard", description: "Customer balances, ageing, collections, allocation, disputes and credit exposure.",
    focus: "receivables performance", target: target("customers", "ar-ageing"),
    kpis: ["Total receivables", "Overdue receivables", "DSO", "Unallocated receipts", "Disputed value", "Credit-limit breaches"],
    values: ["$312K", "$48.5K", "38 days", "$26.4K", "$18.2K", "3"],
    priorities: ["Allocate Atlas receipt", "Call Crescent collections", "Resolve invoice dispute", "Review temporary credit request"],
    exceptions: ["Receipt remains unallocated", "Promise to pay was missed", "Customer exceeds credit limit", "Dispute lacks an owner"],
    actions: ["Record receipt", "Open ageing", "Create collection task", "Review credit limits"],
    scoreTargets: ["≤ $300K", "≤ $35K", "≤ 35 days", "≤ $10K"], seed: 62,
  },
  {
    pageId: "ap-manager-dashboard", roleId: "ap-manager", eyebrow: "Payables control tower",
    title: "Accounts Payable Dashboard", description: "Open bills, due dates, payment proposals, holds, matching and supplier risk.",
    focus: "payables performance", target: target("suppliers", "ap-ageing"),
    kpis: ["Total payables", "Due in 7 days", "Overdue payables", "Match exceptions", "Bills on hold", "Discount opportunity"],
    values: ["$248K", "$64.2K", "$18.6K", "7", "5", "$4.8K"],
    priorities: ["Prepare weekly payment proposal", "Resolve BILL-2026-0899", "Verify supplier bank change", "Review overdue supplier credit"],
    exceptions: ["Potential duplicate invoice", "Three-way match outside tolerance", "Supplier bank details changed", "Invoice due date is missing"],
    actions: ["Capture bill", "Open payment proposal", "Review match exceptions", "Run AP ageing"],
    scoreTargets: ["≤ $260K", "100% planned", "≤ $10K", "≤ 4"], seed: 70,
  },
  {
    pageId: "tax-manager-dashboard", roleId: "tax-manager", eyebrow: "Tax and statutory control",
    title: "Tax Manager Compliance Dashboard", description: "Registrations, transaction tax, withholding, returns, e-invoicing and reconciliation.",
    focus: "tax compliance", target: target("tax", "tax-overview"),
    kpis: ["Tax payable", "Input tax recoverable", "Returns due", "E-invoice acceptance", "Tax exceptions", "Certificates pending"],
    values: ["$38.4K", "$26.8K", "3", "99.1%", "11", "7"],
    priorities: ["Review monthly GST return", "Resolve rejected e-invoices", "Reconcile output tax", "Issue withholding certificates"],
    exceptions: ["Customer tax registration invalid", "Tax code conflicts with item", "Return balance differs from GL", "Certificate delivery overdue"],
    actions: ["Open return workbench", "Review exceptions", "Run reconciliation", "Open e-invoice monitor"],
    scoreTargets: ["100% funded", "≥ 95%", "0 overdue", "≥ 99.5%"], seed: 82,
  },
  {
    pageId: "auditor-dashboard", roleId: "auditor", eyebrow: "Independent assurance",
    title: "Auditor Evidence Dashboard", description: "Control exceptions, audit trail, access reviews, sample status and unresolved findings.",
    focus: "audit assurance", target: target("audit", "audit-dashboard"),
    kpis: ["Open audit findings", "High-risk exceptions", "Samples completed", "Evidence coverage", "Access conflicts", "Overdue remediation"],
    values: ["18", "4", "76%", "94.8%", "3", "6"],
    priorities: ["Review revenue sample", "Test supplier bank control", "Complete access certification", "Follow up overdue finding"],
    exceptions: ["Approval evidence incomplete", "Privileged access conflict", "Manual journal outside pattern", "Remediation date was missed"],
    actions: ["Open audit plan", "Review control exceptions", "Search audit trail", "Export evidence pack"],
    scoreTargets: ["≤ 15", "0 critical", "≥ 80%", "≥ 98%"], seed: 92,
  },
] as const;

function twelve(seed: number, offset = 0): RoleDashboardDefinition["chart"]["primary"]["values"] {
  return Array.from({ length: 12 }, (_, index) => Math.round(seed + offset + index * (1.8 + seed / 100) + (index % 3) * 2.4)) as unknown as RoleDashboardDefinition["chart"]["primary"]["values"];
}

function buildDashboard(config: ExtendedRoleConfig): RoleDashboardDefinition {
  const tones = ["info", "positive", "positive", "warning", "warning", "danger"] as const;
  const kpis = config.kpis.map((label, index) => ({
    id: `${config.roleId}-kpi-${index + 1}`, label, value: config.values[index], delta: index % 2 ? "+2.4%" : "Current",
    comparison: index < 3 ? "against role target" : "requires attention", tone: tones[index], target: config.target,
  })) as unknown as RoleDashboardDefinition["kpis"];
  const priorities = config.priorities.map((title, index) => ({
    id: `${config.roleId}-priority-${index + 1}`, title,
    detail: `Role-specific ${config.focus} item with source-document context and a clear next action.`,
    due: index === 0 ? "Today · 11:00 AM" : index === 1 ? "Today" : index === 2 ? "Tomorrow" : "This week",
    priority: index === 0 ? "urgent" as const : index < 3 ? "high" as const : "normal" as const,
    status: index === 0 ? "Action required" : "Open", target: config.target,
  })) as unknown as RoleDashboardDefinition["priorities"];
  const exceptions = config.exceptions.map((title, index) => ({
    id: `${config.roleId}-exception-${index + 1}`, title,
    detail: `A ${config.focus} control signal requires evidence, ownership and resolution.`,
    severity: index === 0 ? "high" as const : index === 1 ? "medium" as const : index === 2 ? "medium" as const : "low" as const,
    owner: config.title.replace(/ Dashboard| Command Centre| Workbench| Daily Cockpit| Delivery Cockpit| Operations Board| Growth Dashboard| Compliance Dashboard| Evidence Dashboard/g, ""),
    target: config.target,
  })) as unknown as RoleDashboardDefinition["exceptions"];
  const quickActions = config.actions.map((label, index) => ({
    id: `${config.roleId}-action-${index + 1}`, label,
    description: `Open the role-specific ${config.focus} workspace.`, kind: index === 0 ? "primary" as const : "secondary" as const,
    target: config.target,
  })) as unknown as RoleDashboardDefinition["quickActions"];
  const scorecard = config.kpis.slice(0, 4).map((label, index) => ({
    id: `${config.roleId}-score-${index + 1}`, label, value: config.values[index], target: config.scoreTargets[index],
    variance: index % 3 === 0 ? "Review" : "Within range", status: index === 0 ? "watch" as const : index === 3 ? "at-risk" as const : "on-track" as const,
  })) as unknown as RoleDashboardDefinition["scorecard"];
  return {
    pageId: config.pageId, roleId: config.roleId, eyebrow: config.eyebrow, title: config.title, description: config.description,
    contextNote: `Role-scoped ${config.focus} view using deterministic mock data; no live records or transactions.`,
    kpis,
    chart: {
      title: `${config.title.replace(/ Dashboard| Command Centre| Workbench| Daily Cockpit| Delivery Cockpit| Operations Board| Growth Dashboard| Compliance Dashboard| Evidence Dashboard/g, "")} performance trend`,
      subtitle: `Twelve-month ${config.focus} actual compared with target`, unit: "percent",
      months: ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
      primary: { label: "Actual", values: twelve(config.seed, 0) },
      comparison: { label: "Target", values: twelve(config.seed, 8) },
      accessibleSummary: `Twelve-month ${config.focus} trend for ${config.title}, comparing the current actual series with the role target and highlighting the latest management position.`,
      target: config.target,
    },
    priorities, exceptions, quickActions, scorecard,
  };
}

function buildVisuals(config: ExtendedRoleConfig): RoleDashboardVisualDefinition {
  const slug = config.roleId;
  return {
    distribution: {
      title: `${config.title} workload mix`, subtitle: `Current ${config.focus} distribution by control state`, centerValue: "100%", centerLabel: "Role workload",
      accessibleSummary: `${config.title} workload is distributed across ready work, work in progress, items needing review, and blocked exceptions for a complete current-state view.`,
      segments: [
        { id: `${slug}-mix-ready`, label: "Ready", value: 34, display: "34%", tone: "teal", target: config.target },
        { id: `${slug}-mix-progress`, label: "In progress", value: 29, display: "29%", tone: "blue", target: config.target },
        { id: `${slug}-mix-review`, label: "Needs review", value: 23, display: "23%", tone: "sky", target: config.target },
        { id: `${slug}-mix-blocked`, label: "Blocked", value: 14, display: "14%", tone: "violet", target: config.target },
      ],
    },
    drivers: {
      title: `${config.title} performance drivers`, subtitle: `Five operational drivers behind ${config.focus}`, unit: "Index / 100",
      accessibleSummary: `${config.title} driver view compares throughput, quality, timeliness, control compliance and follow-up discipline with role benchmarks.`,
      bars: [
        { id: `${slug}-driver-throughput`, label: "Throughput", value: 88, max: 100, valueLabel: "88", benchmark: 85, benchmarkLabel: "Target 85", status: "on-track", target: config.target },
        { id: `${slug}-driver-quality`, label: "Quality", value: 94, max: 100, valueLabel: "94", benchmark: 92, benchmarkLabel: "Target 92", status: "on-track", target: config.target },
        { id: `${slug}-driver-time`, label: "Timeliness", value: 78, max: 100, valueLabel: "78", benchmark: 90, benchmarkLabel: "Target 90", status: "at-risk", target: config.target },
        { id: `${slug}-driver-control`, label: "Control compliance", value: 91, max: 100, valueLabel: "91", benchmark: 95, benchmarkLabel: "Target 95", status: "watch", target: config.target },
        { id: `${slug}-driver-action`, label: "Follow-up discipline", value: 84, max: 100, valueLabel: "84", benchmark: 88, benchmarkLabel: "Target 88", status: "watch", target: config.target },
      ],
    },
    insights: [
      { id: `${slug}-insight-positive`, title: `${config.focus} is progressing`, detail: "Throughput and quality are above their current management benchmarks.", tone: "good", target: config.target },
      { id: `${slug}-insight-watch`, title: "Timeliness needs attention", detail: "The oldest open items should be cleared before new work is accepted.", tone: "warn", target: config.target },
      { id: `${slug}-insight-action`, title: "One connected action has leverage", detail: "Opening the priority queue reveals the source record, owner, evidence and recommended next step.", tone: "info", target: config.target },
    ],
  };
}

function buildAnalytics(config: ExtendedRoleConfig): RoleAnalyticsDefinition {
  const slug = config.roleId;
  const rows = ["Ready", "In progress", "Review", "Blocked"];
  const columns = ["W1", "W2", "W3", "W4"];
  return {
    bridge: {
      title: `${config.title} outcome bridge`, subtitle: `How activity converts to controlled ${config.focus}`, unit: "number",
      steps: [
        { id: `${slug}-bridge-start`, label: "Starting workload", value: 100 },
        { id: `${slug}-bridge-complete`, label: "Completed", value: 38 },
        { id: `${slug}-bridge-new`, label: "New work", value: 24 },
        { id: `${slug}-bridge-hold`, label: "Blocked / returned", value: -12 },
        { id: `${slug}-bridge-total`, label: "Closing workload", value: 74, isTotal: true },
      ],
      accessibleSummary: `${config.title} bridge starts with one hundred workload units, adds new work, removes completed and blocked items, and closes with seventy-four active units.`,
      note: "Timely clearance of blocked work provides the fastest improvement to the closing position.",
    },
    funnel: {
      title: `${config.title} workflow funnel`, subtitle: `Progression through the core ${config.focus} stages`,
      stages: [
        { id: `${slug}-funnel-1`, label: "Identified", value: 120, display: "120" },
        { id: `${slug}-funnel-2`, label: "Qualified", value: 88, display: "88" },
        { id: `${slug}-funnel-3`, label: "In progress", value: 61, display: "61" },
        { id: `${slug}-funnel-4`, label: "Completed", value: 43, display: "43" },
      ],
      accessibleSummary: `${config.title} workflow narrows from one hundred and twenty identified items to forty-three completed outcomes, with the largest drop before qualification.`,
    },
    heatmap: {
      title: `${config.title} workload density`, subtitle: "Activity by control state and week", unit: "number", tone: "blue", rows, columns,
      cells: rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => ({ row, column, value: 8 + config.seed % 11 + rowIndex * 5 + columnIndex * 4 }))),
      accessibleSummary: `${config.title} heatmap shows activity increasing through the month, with review and blocked work most concentrated in week four.`,
    },
    scatter: {
      title: `${config.title} effort and risk`, subtitle: "Relationship between processing effort and open exceptions", xLabel: "Processing effort", yLabel: "Open risk", xUnit: "number", yUnit: "number",
      points: [
        { id: `${slug}-scatter-1`, label: "Routine", x: 28, y: 8, size: 90, tone: "teal" },
        { id: `${slug}-scatter-2`, label: "Priority", x: 48, y: 18, size: 140, tone: "blue" },
        { id: `${slug}-scatter-3`, label: "Review", x: 64, y: 34, size: 170, tone: "sky" },
        { id: `${slug}-scatter-4`, label: "Exception", x: 76, y: 52, size: 210, tone: "plum" },
      ],
      accessibleSummary: `${config.title} relationship view shows exception work carrying the highest effort and risk, while routine work remains low risk.`,
    },
  };
}

export const extendedRoleDashboards = Object.fromEntries(configs.map((config) => [config.pageId, buildDashboard(config)])) as Record<Exclude<RoleDashboardPageId,
  "ceo-executive-dashboard" | "cfo-dashboard" | "finance-manager-dashboard" | "production-manager-dashboard" | "hr-manager-dashboard" | "purchasing-manager-dashboard" | "sales-manager-dashboard" | "accountant-workspace">, RoleDashboardDefinition>;

export const extendedRoleVisuals = Object.fromEntries(configs.map((config) => [config.pageId, buildVisuals(config)])) as Record<keyof typeof extendedRoleDashboards, RoleDashboardVisualDefinition>;
export const extendedRoleAnalytics = Object.fromEntries(configs.map((config) => [config.pageId, buildAnalytics(config)])) as Record<keyof typeof extendedRoleDashboards, RoleAnalyticsDefinition>;
