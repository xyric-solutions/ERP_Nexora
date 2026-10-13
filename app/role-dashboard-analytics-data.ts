/**
 * Advanced analytical fixtures for the isolated Nexora UI/UX prototype.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency. These fixtures
 * cover the visuals that cannot be derived from the existing role fixtures
 * (bridge, funnel, heatmap, scatter); radar, treemap, gauges, composition and
 * trend visuals are derived from the role's own data so every role stays
 * internally consistent.
 */

import type { ChartTone, FunnelStage, HeatmapCell, ScatterPoint, WaterfallStep } from "./role-dashboard-charts";
import { extendedRoleAnalytics } from "./extended-role-experience.ts";
import type { RoleDashboardPageId } from "./role-dashboard-data";

export type AnalyticsUnit = "currency" | "percent" | "number" | "days";

export interface BridgeDefinition {
  title: string;
  subtitle: string;
  unit: AnalyticsUnit;
  steps: readonly WaterfallStep[];
  accessibleSummary: string;
  note: string;
}

export interface FunnelDefinition {
  title: string;
  subtitle: string;
  stages: readonly FunnelStage[];
  accessibleSummary: string;
}

export interface HeatmapDefinition {
  title: string;
  subtitle: string;
  unit: AnalyticsUnit;
  tone: ChartTone;
  rows: readonly string[];
  columns: readonly string[];
  cells: readonly HeatmapCell[];
  accessibleSummary: string;
}

export interface ScatterDefinition {
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  xUnit: AnalyticsUnit;
  yUnit: AnalyticsUnit;
  points: readonly ScatterPoint[];
  accessibleSummary: string;
}

export interface RoleAnalyticsDefinition {
  bridge: BridgeDefinition;
  funnel: FunnelDefinition;
  heatmap: HeatmapDefinition;
  scatter: ScatterDefinition;
}

function grid(rows: readonly string[], columns: readonly string[], values: readonly (readonly number[])[]): HeatmapCell[] {
  return rows.flatMap((row, rowIndex) =>
    columns.map((column, columnIndex) => ({ row, column, value: values[rowIndex]?.[columnIndex] ?? 0 })),
  );
}

const quarters = ["Q1", "Q2", "Q3", "Q4"] as const;
const sixMonths = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"] as const;

export const roleDashboardAnalytics = {
  "ceo-executive-dashboard": {
    bridge: {
      title: "Operating profit bridge",
      subtitle: "How group revenue converts to operating profit this year.",
      unit: "currency",
      steps: [
        { id: "ceo-bridge-revenue", label: "Revenue", value: 8420000 },
        { id: "ceo-bridge-cogs", label: "Cost of sales", value: -4980000 },
        { id: "ceo-bridge-people", label: "People cost", value: -1640000 },
        { id: "ceo-bridge-opex", label: "Operating expense", value: -720000 },
        { id: "ceo-bridge-other", label: "Other income", value: 138000 },
        { id: "ceo-bridge-result", label: "Operating profit", value: 1218000, isTotal: true },
      ],
      accessibleSummary:
        "Group revenue of $8.42M reduces through cost of sales, people cost and operating expense, with other income added, leaving $1.22M operating profit.",
      note: "Cost of sales absorbs 59% of revenue; a one-point improvement there is worth about $84K to operating profit.",
    },
    funnel: {
      title: "Enterprise growth funnel",
      subtitle: "Weighted opportunity flow across the group portfolio.",
      stages: [
        { id: "ceo-funnel-pipeline", label: "Qualified pipeline", value: 14200000, display: "$14.2M" },
        { id: "ceo-funnel-proposal", label: "Proposal issued", value: 8600000, display: "$8.6M" },
        { id: "ceo-funnel-negotiation", label: "In negotiation", value: 4900000, display: "$4.9M" },
        { id: "ceo-funnel-won", label: "Committed", value: 2850000, display: "$2.85M" },
        { id: "ceo-funnel-delivered", label: "Delivered & billed", value: 2310000, display: "$2.31M" },
      ],
      accessibleSummary:
        "Qualified pipeline of $14.2M converts through proposal, negotiation and commitment to $2.31M delivered and billed, a 16% end-to-end conversion.",
    },
    heatmap: {
      title: "Business unit performance density",
      subtitle: "Margin percentage by business unit and quarter.",
      unit: "percent",
      tone: "blue",
      rows: ["Manufacturing", "Projects", "Distribution", "Support"],
      columns: [...quarters],
      cells: grid(
        ["Manufacturing", "Projects", "Distribution", "Support"],
        [...quarters],
        [
          [18, 21, 19, 23],
          [26, 24, 28, 27],
          [12, 14, 11, 15],
          [34, 36, 33, 38],
        ],
      ),
      accessibleSummary:
        "Support contracts hold the highest margin at 33 to 38 percent across quarters, while distribution stays lowest between 11 and 15 percent.",
    },
    scatter: {
      title: "Unit revenue against margin",
      subtitle: "Bubble size shows headcount deployed in each unit.",
      xLabel: "Revenue",
      yLabel: "Margin %",
      xUnit: "currency",
      yUnit: "percent",
      points: [
        { id: "ceo-sc-mfg", label: "Manufacturing", x: 3280000, y: 20, size: 148, tone: "blue" },
        { id: "ceo-sc-proj", label: "Projects & services", x: 2270000, y: 26, size: 96, tone: "cyan" },
        { id: "ceo-sc-dist", label: "Commercial distribution", x: 1770000, y: 13, size: 64, tone: "teal" },
        { id: "ceo-sc-support", label: "Support contracts", x: 1100000, y: 35, size: 38, tone: "violet" },
      ],
      accessibleSummary:
        "Manufacturing carries the largest revenue and headcount at moderate margin, while support contracts deliver the highest margin from the smallest team.",
    },
  },

  "cfo-dashboard": {
    bridge: {
      title: "Cash movement bridge",
      subtitle: "Opening to closing cash for the reporting period.",
      unit: "currency",
      steps: [
        { id: "cfo-bridge-open", label: "Opening cash", value: 1840000 },
        { id: "cfo-bridge-collections", label: "Collections", value: 2960000 },
        { id: "cfo-bridge-suppliers", label: "Supplier payments", value: -2180000 },
        { id: "cfo-bridge-payroll", label: "Payroll", value: -890000 },
        { id: "cfo-bridge-tax", label: "Tax & duty", value: -274000 },
        { id: "cfo-bridge-close", label: "Closing cash", value: 1456000, isTotal: true },
      ],
      accessibleSummary:
        "Opening cash of $1.84M receives $2.96M collections then reduces through supplier payments, payroll and tax to a closing position of $1.46M.",
      note: "Closing cash sits $34K under the policy buffer; collection timing is the fastest available lever.",
    },
    funnel: {
      title: "Order-to-cash conversion",
      subtitle: "Value progressing from billed to cleared funds.",
      stages: [
        { id: "cfo-funnel-billed", label: "Billed", value: 3420000, display: "$3.42M" },
        { id: "cfo-funnel-acknowledged", label: "Acknowledged", value: 3180000, display: "$3.18M" },
        { id: "cfo-funnel-due", label: "Due for payment", value: 2740000, display: "$2.74M" },
        { id: "cfo-funnel-collected", label: "Collected", value: 2290000, display: "$2.29M" },
        { id: "cfo-funnel-cleared", label: "Cleared funds", value: 2140000, display: "$2.14M" },
      ],
      accessibleSummary:
        "Of $3.42M billed, $2.14M has cleared as funds, with the largest single drop occurring between due for payment and collected.",
    },
    heatmap: {
      title: "Receivable ageing density",
      subtitle: "Outstanding balance in thousands by entity and ageing bucket.",
      unit: "number",
      tone: "sky",
      rows: ["Nexora Ltd", "Nexora MFG", "Nexora Services", "Nexora Trading"],
      columns: ["Current", "1-30", "31-60", "61-90", "90+"],
      cells: grid(
        ["Nexora Ltd", "Nexora MFG", "Nexora Services", "Nexora Trading"],
        ["Current", "1-30", "31-60", "61-90", "90+"],
        [
          [420, 180, 74, 26, 12],
          [316, 142, 96, 48, 34],
          [248, 88, 42, 18, 6],
          [174, 126, 88, 62, 58],
        ],
      ),
      accessibleSummary:
        "Nexora Trading carries the heaviest late-stage exposure with $58K past ninety days, while Nexora Services is almost entirely current.",
    },
    scatter: {
      title: "Cost centre budget discipline",
      subtitle: "Budget against actual spend; bubble size shows commitment value.",
      xLabel: "Budget",
      yLabel: "Actual %",
      xUnit: "currency",
      yUnit: "percent",
      points: [
        { id: "cfo-sc-ops", label: "Operations", x: 1240000, y: 103, size: 92, tone: "sky" },
        { id: "cfo-sc-sales", label: "Sales & marketing", x: 860000, y: 96, size: 64, tone: "blue" },
        { id: "cfo-sc-tech", label: "Technology", x: 640000, y: 112, size: 78, tone: "plum" },
        { id: "cfo-sc-support", label: "Corporate", x: 410000, y: 88, size: 34, tone: "teal" },
        { id: "cfo-sc-facility", label: "Facilities", x: 280000, y: 94, size: 22, tone: "cyan" },
      ],
      accessibleSummary:
        "Technology is the most overspent centre at 112 percent of budget, while corporate and facilities remain below plan.",
    },
  },

  "finance-manager-dashboard": {
    bridge: {
      title: "Period result bridge",
      subtitle: "Movement from last period result to the current position.",
      unit: "currency",
      steps: [
        { id: "fm-bridge-prior", label: "Prior period", value: 962000 },
        { id: "fm-bridge-volume", label: "Volume", value: 184000 },
        { id: "fm-bridge-price", label: "Price & mix", value: 96000 },
        { id: "fm-bridge-cost", label: "Cost inflation", value: -128000 },
        { id: "fm-bridge-accrual", label: "Accrual release", value: 44000 },
        { id: "fm-bridge-current", label: "Current period", value: 1158000, isTotal: true },
      ],
      accessibleSummary:
        "The prior period result of $962K improves to $1.16M, with volume the largest positive contributor and cost inflation the largest offset.",
      note: "Volume and price together add $280K, comfortably absorbing $128K of cost inflation.",
    },
    funnel: {
      title: "Month-end close progression",
      subtitle: "Close tasks moving from sub-ledger cut-off to sign-off.",
      stages: [
        { id: "fm-funnel-subledger", label: "Sub-ledgers closed", value: 48, display: "48 tasks" },
        { id: "fm-funnel-recon", label: "Reconciled", value: 41, display: "41 tasks" },
        { id: "fm-funnel-adjust", label: "Adjustments posted", value: 34, display: "34 tasks" },
        { id: "fm-funnel-review", label: "Reviewed", value: 27, display: "27 tasks" },
        { id: "fm-funnel-signoff", label: "Signed off", value: 21, display: "21 tasks" },
      ],
      accessibleSummary:
        "Of 48 closed sub-ledger tasks, 21 have reached sign-off; the largest queue sits between review and sign-off.",
    },
    heatmap: {
      title: "Reconciliation status density",
      subtitle: "Open reconciling items by account class and close week.",
      unit: "number",
      tone: "cyan",
      rows: ["Bank", "Receivables", "Payables", "Inventory", "Accruals"],
      columns: ["W1", "W2", "W3", "W4"],
      cells: grid(
        ["Bank", "Receivables", "Payables", "Inventory", "Accruals"],
        ["W1", "W2", "W3", "W4"],
        [
          [6, 3, 1, 0],
          [14, 11, 7, 4],
          [9, 8, 5, 3],
          [12, 13, 9, 6],
          [4, 4, 2, 1],
        ],
      ),
      accessibleSummary:
        "Receivables and inventory carry the most open reconciling items throughout the close, while bank clears fully by week four.",
    },
    scatter: {
      title: "Account balance against open items",
      subtitle: "Bubble size shows journal volume touching each account class.",
      xLabel: "Balance",
      yLabel: "Open items",
      xUnit: "currency",
      yUnit: "number",
      points: [
        { id: "fm-sc-ar", label: "Receivables", x: 1420000, y: 36, size: 210, tone: "sky" },
        { id: "fm-sc-ap", label: "Payables", x: 980000, y: 25, size: 168, tone: "blue" },
        { id: "fm-sc-inv", label: "Inventory", x: 1180000, y: 40, size: 142, tone: "plum" },
        { id: "fm-sc-bank", label: "Bank", x: 1456000, y: 4, size: 96, tone: "teal" },
        { id: "fm-sc-accrual", label: "Accruals", x: 320000, y: 11, size: 54, tone: "cyan" },
      ],
      accessibleSummary:
        "Inventory and receivables combine large balances with the highest open item counts, while bank is nearly clean despite a large balance.",
    },
  },

  "production-manager-dashboard": {
    bridge: {
      title: "Output loss bridge",
      subtitle: "Planned output reduced by recorded losses to actual output.",
      unit: "number",
      steps: [
        { id: "pm-bridge-plan", label: "Planned units", value: 24000 },
        { id: "pm-bridge-downtime", label: "Downtime", value: -2100 },
        { id: "pm-bridge-changeover", label: "Changeover", value: -1240 },
        { id: "pm-bridge-scrap", label: "Scrap", value: -860 },
        { id: "pm-bridge-rework", label: "Rework recovered", value: 420 },
        { id: "pm-bridge-actual", label: "Actual units", value: 20220, isTotal: true },
      ],
      accessibleSummary:
        "Planned output of 24,000 units reduces through downtime, changeover and scrap to 20,220 actual units, with rework recovering 420 units.",
      note: "Downtime alone accounts for 55% of total loss; the enclosure line is the dominant contributor.",
    },
    funnel: {
      title: "Work order progression",
      subtitle: "Order count moving from planned to completed.",
      stages: [
        { id: "pm-funnel-planned", label: "Planned", value: 186, display: "186 orders" },
        { id: "pm-funnel-released", label: "Released", value: 164, display: "164 orders" },
        { id: "pm-funnel-progress", label: "In progress", value: 132, display: "132 orders" },
        { id: "pm-funnel-qc", label: "In quality check", value: 108, display: "108 orders" },
        { id: "pm-funnel-complete", label: "Completed", value: 94, display: "94 orders" },
      ],
      accessibleSummary:
        "Of 186 planned work orders, 94 have completed; the largest hold is between in progress and quality check.",
    },
    heatmap: {
      title: "Line efficiency density",
      subtitle: "Overall equipment effectiveness by line and shift.",
      unit: "percent",
      tone: "teal",
      rows: ["Enclosure", "Assembly", "Finishing", "Packing"],
      columns: ["Shift A", "Shift B", "Shift C"],
      cells: grid(
        ["Enclosure", "Assembly", "Finishing", "Packing"],
        ["Shift A", "Shift B", "Shift C"],
        [
          [72, 68, 61],
          [88, 86, 79],
          [84, 81, 77],
          [91, 89, 85],
        ],
      ),
      accessibleSummary:
        "Packing sustains the highest effectiveness at 85 to 91 percent, while the enclosure line on shift C is weakest at 61 percent.",
    },
    scatter: {
      title: "Work centre utilisation against efficiency",
      subtitle: "Bubble size shows units produced at each work centre.",
      xLabel: "Utilisation %",
      yLabel: "Efficiency %",
      xUnit: "percent",
      yUnit: "percent",
      points: [
        { id: "pm-sc-enclosure", label: "Enclosure", x: 94, y: 67, size: 4200, tone: "plum" },
        { id: "pm-sc-assembly", label: "Assembly", x: 86, y: 84, size: 6800, tone: "blue" },
        { id: "pm-sc-finishing", label: "Finishing", x: 78, y: 81, size: 5100, tone: "cyan" },
        { id: "pm-sc-packing", label: "Packing", x: 72, y: 88, size: 7400, tone: "teal" },
        { id: "pm-sc-subassembly", label: "Sub-assembly", x: 68, y: 76, size: 3300, tone: "violet" },
      ],
      accessibleSummary:
        "The enclosure work centre runs hottest at 94 percent utilisation yet lowest efficiency at 67 percent, marking it as the constraint.",
    },
  },

  "hr-manager-dashboard": {
    bridge: {
      title: "Headcount movement bridge",
      subtitle: "Opening to closing headcount across the period.",
      unit: "number",
      steps: [
        { id: "hr-bridge-open", label: "Opening", value: 412 },
        { id: "hr-bridge-hires", label: "New hires", value: 38 },
        { id: "hr-bridge-transfer", label: "Transfers in", value: 9 },
        { id: "hr-bridge-exit", label: "Voluntary exits", value: -24 },
        { id: "hr-bridge-end", label: "Contract ends", value: -11 },
        { id: "hr-bridge-close", label: "Closing", value: 424, isTotal: true },
      ],
      accessibleSummary:
        "Opening headcount of 412 grows to 424 after 38 hires and 9 transfers, offset by 24 voluntary exits and 11 contract endings.",
      note: "Net growth of 12 people is positive, but voluntary exits remain above the 4% annualised target.",
    },
    funnel: {
      title: "Recruitment funnel",
      subtitle: "Candidate progression across all open requisitions.",
      stages: [
        { id: "hr-funnel-applied", label: "Applicants", value: 1240, display: "1,240" },
        { id: "hr-funnel-screened", label: "Screened", value: 420, display: "420" },
        { id: "hr-funnel-interview", label: "Interviewed", value: 168, display: "168" },
        { id: "hr-funnel-offer", label: "Offers made", value: 52, display: "52" },
        { id: "hr-funnel-joined", label: "Joined", value: 38, display: "38" },
      ],
      accessibleSummary:
        "1,240 applicants reduce to 38 joiners, a 3 percent end-to-end conversion, with the sharpest drop at initial screening.",
    },
    heatmap: {
      title: "Absence density",
      subtitle: "Absence rate percentage by department and month.",
      unit: "percent",
      tone: "violet",
      rows: ["Production", "Engineering", "Commercial", "Corporate"],
      columns: [...sixMonths],
      cells: grid(
        ["Production", "Engineering", "Commercial", "Corporate"],
        [...sixMonths],
        [
          [6, 7, 8, 9, 7, 6],
          [3, 3, 4, 4, 3, 3],
          [4, 5, 4, 6, 5, 4],
          [2, 2, 3, 3, 2, 2],
        ],
      ),
      accessibleSummary:
        "Production absence peaks at 9 percent in June and stays roughly triple the corporate rate throughout the period.",
    },
    scatter: {
      title: "Department size against people cost",
      subtitle: "Bubble size shows open requisitions in each department.",
      xLabel: "Headcount",
      yLabel: "Cost per head",
      xUnit: "number",
      yUnit: "currency",
      points: [
        { id: "hr-sc-production", label: "Production", x: 186, y: 52000, size: 14, tone: "blue" },
        { id: "hr-sc-engineering", label: "Engineering", x: 84, y: 88000, size: 9, tone: "violet" },
        { id: "hr-sc-commercial", label: "Commercial", x: 96, y: 71000, size: 6, tone: "cyan" },
        { id: "hr-sc-corporate", label: "Corporate", x: 58, y: 64000, size: 3, tone: "teal" },
      ],
      accessibleSummary:
        "Engineering carries the highest cost per head at $88K with nine open requisitions, while production is largest by headcount.",
    },
  },

  "purchasing-manager-dashboard": {
    bridge: {
      title: "Spend variance bridge",
      subtitle: "Baseline spend adjusted to the current committed position.",
      unit: "currency",
      steps: [
        { id: "pu-bridge-baseline", label: "Baseline spend", value: 3120000 },
        { id: "pu-bridge-volume", label: "Volume growth", value: 268000 },
        { id: "pu-bridge-price", label: "Price increases", value: 184000 },
        { id: "pu-bridge-negotiated", label: "Negotiated savings", value: -212000 },
        { id: "pu-bridge-consolidation", label: "Supplier consolidation", value: -96000 },
        { id: "pu-bridge-current", label: "Committed spend", value: 3264000, isTotal: true },
      ],
      accessibleSummary:
        "Baseline spend of $3.12M rises with volume and price pressure, partly offset by $308K of negotiated savings and consolidation, ending at $3.26M.",
      note: "Negotiated savings and consolidation recovered $308K, covering 68% of volume and price pressure.",
    },
    funnel: {
      title: "Procure-to-receive pipeline",
      subtitle: "Document count progressing from requisition to receipt.",
      stages: [
        { id: "pu-funnel-req", label: "Requisitions", value: 248, display: "248 documents" },
        { id: "pu-funnel-rfq", label: "RFQ issued", value: 186, display: "186 documents" },
        { id: "pu-funnel-eval", label: "Evaluated", value: 142, display: "142 documents" },
        { id: "pu-funnel-po", label: "Purchase orders", value: 118, display: "118 documents" },
        { id: "pu-funnel-receipt", label: "Received", value: 94, display: "94 documents" },
      ],
      accessibleSummary:
        "248 requisitions convert to 94 receipts, with the largest single drop between requisition and RFQ issue.",
    },
    heatmap: {
      title: "Supplier delivery density",
      subtitle: "On-time delivery percentage by category and month.",
      unit: "percent",
      tone: "blue",
      rows: ["Raw material", "Components", "Packaging", "Services"],
      columns: [...sixMonths],
      cells: grid(
        ["Raw material", "Components", "Packaging", "Services"],
        [...sixMonths],
        [
          [92, 90, 88, 84, 87, 91],
          [78, 74, 71, 68, 72, 76],
          [96, 95, 97, 94, 96, 95],
          [88, 86, 89, 85, 87, 90],
        ],
      ),
      accessibleSummary:
        "Component suppliers are the weakest link, dropping to 68 percent on-time in June, while packaging holds above 94 percent throughout.",
    },
    scatter: {
      title: "Supplier spend against reliability",
      subtitle: "Bubble size shows purchase order count for each supplier.",
      xLabel: "Annual spend",
      yLabel: "On-time %",
      xUnit: "currency",
      yUnit: "percent",
      points: [
        { id: "pu-sc-atlas", label: "Atlas Metals", x: 862000, y: 71, size: 84, tone: "plum" },
        { id: "pu-sc-vertex", label: "Vertex Components", x: 624000, y: 88, size: 62, tone: "blue" },
        { id: "pu-sc-lumen", label: "Lumen Packaging", x: 318000, y: 96, size: 48, tone: "teal" },
        { id: "pu-sc-orbit", label: "Orbit Services", x: 274000, y: 84, size: 26, tone: "cyan" },
        { id: "pu-sc-nova", label: "Nova Chemicals", x: 196000, y: 79, size: 18, tone: "sky" },
      ],
      accessibleSummary:
        "Atlas Metals combines the largest spend with the weakest 71 percent on-time performance, making it the priority supplier review.",
    },
  },

  "sales-manager-dashboard": {
    bridge: {
      title: "Revenue movement bridge",
      subtitle: "Prior year revenue bridged to the current position.",
      unit: "currency",
      steps: [
        { id: "sm-bridge-prior", label: "Prior year", value: 4180000 },
        { id: "sm-bridge-new", label: "New business", value: 862000 },
        { id: "sm-bridge-expansion", label: "Expansion", value: 344000 },
        { id: "sm-bridge-churn", label: "Churn", value: -286000 },
        { id: "sm-bridge-discount", label: "Discounting", value: -118000 },
        { id: "sm-bridge-current", label: "Current year", value: 4982000, isTotal: true },
      ],
      accessibleSummary:
        "Prior year revenue of $4.18M grows to $4.98M, with new business adding $862K against $286K of churn and $118K of discounting.",
      note: "New business and expansion add $1.21M, but churn and discounting give back a third of that gain.",
    },
    funnel: {
      title: "Sales pipeline funnel",
      subtitle: "Opportunity value by stage across the active pipeline.",
      stages: [
        { id: "sm-funnel-lead", label: "Leads", value: 6800000, display: "$6.8M" },
        { id: "sm-funnel-qualified", label: "Qualified", value: 4120000, display: "$4.12M" },
        { id: "sm-funnel-proposal", label: "Proposal", value: 2480000, display: "$2.48M" },
        { id: "sm-funnel-negotiation", label: "Negotiation", value: 1360000, display: "$1.36M" },
        { id: "sm-funnel-won", label: "Closed won", value: 842000, display: "$842K" },
      ],
      accessibleSummary:
        "A $6.8M lead pool converts to $842K closed won, a 12 percent value conversion, with the steepest fall between qualified and proposal.",
    },
    heatmap: {
      title: "Territory attainment density",
      subtitle: "Quota attainment percentage by territory and month.",
      unit: "percent",
      tone: "cyan",
      rows: ["North", "South", "East", "West"],
      columns: [...sixMonths],
      cells: grid(
        ["North", "South", "East", "West"],
        [...sixMonths],
        [
          [104, 98, 112, 108, 96, 102],
          [88, 84, 79, 82, 86, 90],
          [96, 101, 99, 104, 108, 112],
          [72, 76, 68, 74, 78, 81],
        ],
      ),
      accessibleSummary:
        "East territory improves steadily to 112 percent attainment, while West stays below target all period, peaking at 81 percent.",
    },
    scatter: {
      title: "Account value against win rate",
      subtitle: "Bubble size shows the number of open opportunities.",
      xLabel: "Pipeline value",
      yLabel: "Win rate %",
      xUnit: "currency",
      yUnit: "percent",
      points: [
        { id: "sm-sc-enterprise", label: "Enterprise", x: 2840000, y: 28, size: 34, tone: "blue" },
        { id: "sm-sc-midmarket", label: "Mid-market", x: 1960000, y: 41, size: 58, tone: "cyan" },
        { id: "sm-sc-smb", label: "Small business", x: 940000, y: 52, size: 96, tone: "teal" },
        { id: "sm-sc-public", label: "Public sector", x: 1060000, y: 22, size: 21, tone: "sky" },
      ],
      accessibleSummary:
        "Small business converts best at 52 percent from the smallest pipeline, while enterprise and public sector hold large value at low win rates.",
    },
  },

  "accountant-workspace": {
    bridge: {
      title: "Ledger balance bridge",
      subtitle: "Opening trial balance movement through to the current position.",
      unit: "currency",
      steps: [
        { id: "ac-bridge-open", label: "Opening balance", value: 2410000 },
        { id: "ac-bridge-journals", label: "Posted journals", value: 486000 },
        { id: "ac-bridge-accrual", label: "Accruals raised", value: 128000 },
        { id: "ac-bridge-reversal", label: "Reversals", value: -94000 },
        { id: "ac-bridge-adjust", label: "Adjustments", value: -62000 },
        { id: "ac-bridge-close", label: "Current balance", value: 2868000, isTotal: true },
      ],
      accessibleSummary:
        "The opening balance of $2.41M moves through posted journals, accruals, reversals and adjustments to a current balance of $2.87M.",
      note: "Reversals and adjustments together net $156K; each is supported by an approved journal reference.",
    },
    funnel: {
      title: "Journal lifecycle",
      subtitle: "Journal count progressing from draft to reconciled.",
      stages: [
        { id: "ac-funnel-draft", label: "Drafted", value: 312, display: "312 journals" },
        { id: "ac-funnel-review", label: "Reviewed", value: 284, display: "284 journals" },
        { id: "ac-funnel-approved", label: "Approved", value: 262, display: "262 journals" },
        { id: "ac-funnel-posted", label: "Posted", value: 248, display: "248 journals" },
        { id: "ac-funnel-reconciled", label: "Reconciled", value: 214, display: "214 journals" },
      ],
      accessibleSummary:
        "312 drafted journals reduce to 214 reconciled, with 34 posted journals still awaiting reconciliation.",
    },
    heatmap: {
      title: "Posting activity density",
      subtitle: "Journal entries posted by weekday and close week.",
      unit: "number",
      tone: "blue",
      rows: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      columns: ["W1", "W2", "W3", "W4"],
      cells: grid(
        ["Mon", "Tue", "Wed", "Thu", "Fri"],
        ["W1", "W2", "W3", "W4"],
        [
          [12, 14, 18, 34],
          [16, 15, 22, 41],
          [14, 17, 24, 38],
          [18, 19, 28, 46],
          [9, 11, 16, 27],
        ],
      ),
      accessibleSummary:
        "Posting concentrates sharply in week four, peaking at 46 entries on Thursday, indicating a close-period workload spike.",
    },
    scatter: {
      title: "Account activity against exceptions",
      subtitle: "Bubble size shows the number of lines posted to each account class.",
      xLabel: "Entries posted",
      yLabel: "Open exceptions",
      xUnit: "number",
      yUnit: "number",
      points: [
        { id: "ac-sc-bank", label: "Bank", x: 84, y: 2, size: 210, tone: "teal" },
        { id: "ac-sc-ar", label: "Receivables", x: 126, y: 14, size: 340, tone: "sky" },
        { id: "ac-sc-ap", label: "Payables", x: 98, y: 9, size: 268, tone: "blue" },
        { id: "ac-sc-inventory", label: "Inventory", x: 72, y: 16, size: 184, tone: "plum" },
        { id: "ac-sc-payroll", label: "Payroll", x: 46, y: 3, size: 120, tone: "cyan" },
      ],
      accessibleSummary:
        "Receivables carries both the highest posting volume and the most open exceptions, while bank stays clean at two exceptions.",
    },
  },
  ...extendedRoleAnalytics,
} as const satisfies Record<RoleDashboardPageId, RoleAnalyticsDefinition>;

export function getRoleAnalytics(pageId: string): RoleAnalyticsDefinition | null {
  return (roleDashboardAnalytics as Record<string, RoleAnalyticsDefinition>)[pageId] ?? null;
}
