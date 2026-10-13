/**
 * Module-aware presentation blueprints for generic prototype forms.
 *
 * These values are deterministic UI fixtures only. They make each form read
 * like its business domain without implementing persistence or business logic.
 */

export type ModuleFormFamily =
  | "command"
  | "treasury"
  | "commercial"
  | "procurement"
  | "stock"
  | "finance"
  | "operations"
  | "services"
  | "people"
  | "assets"
  | "governance"
  | "platform";

export interface BlueprintField {
  label: string;
  value: string;
  type?: "text" | "date" | "select" | "textarea";
  options?: readonly string[];
  span?: 3 | 4 | 6 | 8 | 12;
  helper?: string;
  required?: boolean;
  automatic?: boolean;
}

export interface ModuleFormBlueprint {
  family: ModuleFormFamily;
  recordLabel: string;
  numberPrefix: string;
  dateLabel: string;
  partyLabel: string;
  partyOptions: readonly string[];
  headerFields: readonly BlueprintField[];
  lineLabel: string;
  lineOptions: readonly string[];
  dimensionLabel: string;
  dimensions: readonly string[];
  contextMetrics: readonly (readonly [string, string, string])[];
  checks: readonly (readonly [string, string])[];
  workflow: string;
}

export const moduleFormFamilies = {
  dashboard: "command",
  banking: "treasury",
  sales: "commercial",
  revenue: "commercial",
  customers: "commercial",
  purchases: "procurement",
  suppliers: "procurement",
  inventory: "stock",
  costing: "stock",
  finance: "finance",
  tax: "governance",
  operations: "operations",
  fleet: "operations",
  manufacturing: "operations",
  quality: "operations",
  crm: "commercial",
  projects: "services",
  resources: "services",
  support: "services",
  hr: "people",
  assets: "assets",
  expenses: "people",
  documents: "governance",
  budget: "governance",
  reports: "governance",
  portals: "platform",
  administration: "platform",
  configuration: "platform",
  approvals: "platform",
  notifications: "platform",
  integrations: "platform",
  ai: "platform",
  audit: "governance",
  migration: "platform",
  mobile: "platform",
} as const satisfies Readonly<Record<string, ModuleFormFamily>>;

const familyBlueprints: Readonly<Record<ModuleFormFamily, Omit<ModuleFormBlueprint, "numberPrefix" | "recordLabel">>> = {
  command: {
    family: "command",
    dateLabel: "Effective date",
    partyLabel: "Owner / audience",
    partyOptions: ["Executive committee", "Finance leadership", "Operations leadership"],
    headerFields: [
      { label: "Dashboard scope", value: "Enterprise performance", type: "select", options: ["Enterprise performance", "Company", "Business unit"], span: 4, required: true },
      { label: "Refresh cadence", value: "Daily", type: "select", options: ["Real time", "Daily", "Weekly", "Monthly"], span: 4 },
      { label: "Confidentiality", value: "Management", type: "select", options: ["Standard", "Management", "Restricted"], span: 4 },
    ],
    lineLabel: "KPI / decision metric",
    lineOptions: ["Revenue performance", "Cash position", "Operational exceptions"],
    dimensionLabel: "Management lens",
    dimensions: ["Company", "Business unit", "Department"],
    contextMetrics: [["Audience", "Executive", "Role-scoped visibility"], ["Refresh", "Daily", "Next at 06:00"], ["Measures", "18", "4 require ownership"]],
    checks: [["Metric ownership", "Every KPI has an accountable owner"], ["Data freshness", "Source refresh windows are declared"], ["Access scope", "Confidential measures follow the selected audience"]],
    workflow: "Owner review → Finance validation → Executive publication",
  },
  treasury: {
    family: "treasury",
    dateLabel: "Value date",
    partyLabel: "Bank / beneficiary",
    partyOptions: ["HBL Operating Account", "UBL Collection Account", "Meezan Payroll Account"],
    headerFields: [
      { label: "Payment method", value: "Bank transfer", type: "select", options: ["Bank transfer", "Cheque", "Online payment"], span: 4, required: true },
      { label: "Bank account", value: "HBL — PKR Operating", type: "select", options: ["HBL — PKR Operating", "UBL — USD Collection"], span: 4, required: true },
      { label: "Available balance", value: "PKR 18,420,500", span: 4, helper: "After uncleared commitments" },
    ],
    lineLabel: "Settlement purpose",
    lineOptions: ["Supplier settlement", "Expense reimbursement", "Inter-account funding"],
    dimensionLabel: "Cash-flow class",
    dimensions: ["Operating", "Investing", "Financing"],
    contextMetrics: [["Available", "PKR 18.42M", "Ledger balance PKR 19.08M"], ["Unreconciled", "4 items", "Oldest 3 days"], ["Bank cut-off", "15:30", "2h 18m remaining"]],
    checks: [["Bank balance", "Value remains within available funds"], ["Beneficiary control", "Verified bank details are selected"], ["Duplicate payment", "No same-party, same-value match detected"]],
    workflow: "Treasury preparation → Finance approval → Bank release → Reconciliation",
  },
  commercial: {
    family: "commercial",
    dateLabel: "Document date",
    partyLabel: "Customer / contract",
    partyOptions: ["Atlas Trading Co.", "Northstar Retail", "Crescent Services"],
    headerFields: [
      { label: "Payment terms", value: "Net 30", type: "select", options: ["Due on receipt", "Net 15", "Net 30", "Net 45"], span: 4, required: true },
      { label: "Price list", value: "Corporate PKR 2026", type: "select", options: ["Corporate PKR 2026", "Export USD 2026"], span: 4 },
      { label: "Credit available", value: "PKR 4,850,000", span: 4, helper: "Limit PKR 12.00M" },
    ],
    lineLabel: "Product / service",
    lineOptions: ["Managed support hours", "Implementation services", "Enterprise licence"],
    dimensionLabel: "Revenue stream",
    dimensions: ["Professional services", "Subscriptions", "Support"],
    contextMetrics: [["Customer balance", "PKR 7.15M", "PKR 2.10M overdue"], ["Gross margin", "34.8%", "Target 32.0%"], ["Last sale", "PKR 1.24M", "18 Aug 2026"]],
    checks: [["Credit control", "Transaction remains inside approved credit"], ["Margin floor", "All lines meet the 25% policy floor"], ["Commercial history", "Previous price and contract terms are visible"]],
    workflow: "Commercial preparation → Credit check → Manager approval → Fulfilment",
  },
  procurement: {
    family: "procurement",
    dateLabel: "Request date",
    partyLabel: "Supplier / sourcing event",
    partyOptions: ["Pak Industrial Supplies", "Global Office Solutions", "TechSource Pakistan"],
    headerFields: [
      { label: "Required by", value: "2026-09-30", type: "date", span: 4, required: true },
      { label: "Procurement method", value: "Competitive RFQ", type: "select", options: ["Competitive RFQ", "Framework agreement", "Single source"], span: 4, required: true },
      { label: "Budget available", value: "PKR 6,420,000", span: 4, helper: "Cost centre CC-220" },
    ],
    lineLabel: "Item / service requirement",
    lineOptions: ["Industrial raw material", "Professional service", "Office equipment"],
    dimensionLabel: "Spend category",
    dimensions: ["Direct material", "Indirect spend", "Capital expenditure"],
    contextMetrics: [["Last purchase", "PKR 865,000", "4.2% below current quote"], ["Open commitment", "PKR 3.20M", "Across 6 purchase orders"], ["Supplier score", "91 / 100", "Approved · low risk"]],
    checks: [["Budget control", "Request fits the available budget"], ["Supplier eligibility", "KYC, tax and bank verification are current"], ["Three-way match", "PO, receipt and bill controls are prepared"]],
    workflow: "Request → RFQ → Evaluation → PO approval → Receipt → Match",
  },
  stock: {
    family: "stock",
    dateLabel: "Movement date",
    partyLabel: "Warehouse / item",
    partyOptions: ["Karachi Central Warehouse", "Lahore Distribution Centre", "Production Store"],
    headerFields: [
      { label: "Movement type", value: "Stock transfer", type: "select", options: ["Stock receipt", "Stock issue", "Stock transfer", "Adjustment"], span: 4, required: true },
      { label: "Source location", value: "KHI-A-01", type: "select", options: ["KHI-A-01", "KHI-B-04", "LHR-C-02"], span: 4, required: true },
      { label: "Available stock", value: "1,248 units", span: 4, helper: "312 already reserved" },
    ],
    lineLabel: "Inventory item",
    lineOptions: ["RM-1004 — Steel sheet", "FG-2041 — Control panel", "PK-3012 — Export carton"],
    dimensionLabel: "Stock purpose",
    dimensions: ["Production", "Sales fulfilment", "Maintenance"],
    contextMetrics: [["On hand", "1,248", "Available 936"], ["Standard cost", "PKR 4,280", "Last receipt PKR 4,350"], ["Reorder point", "500", "No replenishment alert"]],
    checks: [["Availability", "Requested quantity is available by location"], ["Traceability", "Batch, serial and expiry requirements are known"], ["Valuation", "Costing method and posting class are assigned"]],
    workflow: "Entry → Warehouse check → Approval → Movement → Stock ledger",
  },
  finance: {
    family: "finance",
    dateLabel: "Posting date",
    partyLabel: "Nominal / source ledger",
    partyOptions: ["110101 — HBL Operating Account", "210201 — Trade Payables", "410101 — Service Revenue"],
    headerFields: [
      { label: "Financial period", value: "Sep 2026 · Open", type: "select", options: ["Sep 2026 · Open", "Aug 2026 · Adjustment only"], span: 4, required: true },
      { label: "Journal type", value: "Standard", type: "select", options: ["Standard", "Accrual", "Reclassification", "Adjustment"], span: 4 },
      { label: "Control total", value: "PKR 42,482.00", span: 4, helper: "Debit must equal credit" },
    ],
    lineLabel: "Nominal account",
    lineOptions: ["110101 — Bank", "210201 — Trade payables", "510201 — Supplies and materials"],
    dimensionLabel: "Accounting dimension",
    dimensions: ["Corporate", "Operations", "Professional services"],
    contextMetrics: [["Period", "Sep 2026", "Open for posting"], ["Control", "Balanced", "Variance PKR 0.00"], ["Evidence", "2 files", "Source trail complete"]],
    checks: [["Double entry", "Debits and credits balance"], ["Period control", "Posting date is inside an open period"], ["Account status", "All selected nominals are active and postable"]],
    workflow: "Preparation → Finance review → Approval → Posting → Ledger",
  },
  operations: {
    family: "operations",
    dateLabel: "Planned start",
    partyLabel: "Work centre / operation",
    partyOptions: ["Assembly Line 01", "Finishing Cell", "Quality Laboratory"],
    headerFields: [
      { label: "Priority", value: "Normal", type: "select", options: ["Low", "Normal", "High", "Critical"], span: 4, required: true },
      { label: "Shift", value: "Day shift", type: "select", options: ["Day shift", "Evening shift", "Night shift"], span: 4 },
      { label: "Capacity available", value: "82%", span: 4, helper: "14 productive hours available" },
    ],
    lineLabel: "Operation / material",
    lineOptions: ["Cutting and preparation", "Assembly operation", "Inspection checkpoint"],
    dimensionLabel: "Work centre",
    dimensions: ["Assembly", "Finishing", "Quality"],
    contextMetrics: [["Capacity", "82%", "Target utilisation 78%"], ["Material readiness", "96%", "1 shortage warning"], ["Quality gate", "Required", "Inspection plan QP-104"]],
    checks: [["Material readiness", "Required components are available or planned"], ["Capacity check", "Operations fit the selected shift"], ["Quality plan", "Mandatory control points are included"]],
    workflow: "Plan → Release → Execute → Inspect → Complete → Cost",
  },
  services: {
    family: "services",
    dateLabel: "Service date",
    partyLabel: "Project / client",
    partyOptions: ["PRJ-1042 — Atlas rollout", "PRJ-1088 — ERP support", "Internal capability"],
    headerFields: [
      { label: "Engagement type", value: "Time & materials", type: "select", options: ["Time & materials", "Fixed fee", "Retainer", "Internal"], span: 4, required: true },
      { label: "Project manager", value: "Sara Ahmed", type: "select", options: ["Sara Ahmed", "Omar Siddiqui"], span: 4 },
      { label: "Budget remaining", value: "PKR 3,180,000", span: 4, helper: "62% of approved budget" },
    ],
    lineLabel: "Activity / resource",
    lineOptions: ["Functional consulting", "Development", "Project management"],
    dimensionLabel: "Service stream",
    dimensions: ["Billable delivery", "Non-billable delivery", "Internal"],
    contextMetrics: [["Project margin", "29.4%", "Target 30.0%"], ["Unbilled WIP", "PKR 840K", "12 approved hours pending"], ["Utilisation", "76%", "Team target 74%"]],
    checks: [["Contract scope", "Activity is covered by the engagement"], ["Budget and WIP", "Planned value fits remaining budget"], ["Billing eligibility", "Rate, approval and evidence rules are clear"]],
    workflow: "Plan → Assign → Deliver → Approve time → Bill → Recognise",
  },
  people: {
    family: "people",
    dateLabel: "Effective date",
    partyLabel: "Employee / claimant",
    partyOptions: ["EMP-0184 — Ayesha Malik", "EMP-0217 — Bilal Khan", "EMP-0241 — Sara Ahmed"],
    headerFields: [
      { label: "Department", value: "Professional Services", type: "select", options: ["Professional Services", "Finance", "Operations"], span: 4, required: true },
      { label: "Policy", value: "Standard employee policy", type: "select", options: ["Standard employee policy", "Management policy"], span: 4 },
      { label: "Available entitlement", value: "14 days", span: 4, helper: "Or PKR 180,000 expense limit" },
    ],
    lineLabel: "Entitlement / expense item",
    lineOptions: ["Annual leave", "Business travel", "Medical reimbursement"],
    dimensionLabel: "People cost class",
    dimensions: ["Payroll", "Travel", "Benefits"],
    contextMetrics: [["Policy status", "Compliant", "No exception detected"], ["Available", "14 days", "3 requests pending"], ["Manager", "Omar Siddiqui", "Primary approver"]],
    checks: [["Policy eligibility", "Selected item is allowed for this employee"], ["Overlap and duplicate", "No conflicting request is detected"], ["Supporting evidence", "Required receipts or documents are declared"]],
    workflow: "Employee entry → Manager approval → HR/Finance review → Processing",
  },
  assets: {
    family: "assets",
    dateLabel: "Capitalisation date",
    partyLabel: "Asset / lessor",
    partyOptions: ["FA-10082 — CNC Machine", "FA-10214 — Delivery Vehicle", "Lease — Karachi Office"],
    headerFields: [
      { label: "Asset class", value: "Plant & machinery", type: "select", options: ["Plant & machinery", "Vehicles", "IT equipment", "Right-of-use asset"], span: 4, required: true },
      { label: "Depreciation method", value: "Straight line", type: "select", options: ["Straight line", "Reducing balance", "Units of production"], span: 4 },
      { label: "Useful life", value: "60 months", span: 4, helper: "Residual value PKR 250,000" },
    ],
    lineLabel: "Asset cost component",
    lineOptions: ["Purchase price", "Installation cost", "Site preparation"],
    dimensionLabel: "Asset location",
    dimensions: ["Karachi plant", "Lahore office", "Field operations"],
    contextMetrics: [["Capitalised cost", "PKR 8.45M", "3 eligible components"], ["Monthly charge", "PKR 136,667", "Starts Sep 2026"], ["Custodian", "Operations", "Physical verification current"]],
    checks: [["Capitalisation policy", "Every cost component is eligible"], ["Useful life", "Method and life match the asset class"], ["Custody evidence", "Location, owner and verification are assigned"]],
    workflow: "Acquisition → Capitalisation review → Approval → Asset register",
  },
  governance: {
    family: "governance",
    dateLabel: "Effective date",
    partyLabel: "Authority / control owner",
    partyOptions: ["Federal Board of Revenue", "Internal Audit", "Finance Control"],
    headerFields: [
      { label: "Control category", value: "Financial compliance", type: "select", options: ["Financial compliance", "Tax compliance", "Operational control"], span: 4, required: true },
      { label: "Review frequency", value: "Monthly", type: "select", options: ["Continuous", "Monthly", "Quarterly", "Annual"], span: 4 },
      { label: "Risk rating", value: "Medium", type: "select", options: ["Low", "Medium", "High", "Critical"], span: 4 },
    ],
    lineLabel: "Requirement / evidence",
    lineOptions: ["Control procedure", "Supporting evidence", "Remediation action"],
    dimensionLabel: "Compliance area",
    dimensions: ["Tax", "Financial reporting", "Information governance"],
    contextMetrics: [["Control status", "Effective", "Last tested 28 Aug"], ["Evidence", "8 items", "2 expiring this month"], ["Open actions", "3", "1 high priority"]],
    checks: [["Evidence completeness", "Mandatory support is attached or referenced"], ["Ownership", "Control and remediation owners are assigned"], ["Review calendar", "Next performance and testing dates are set"]],
    workflow: "Prepare → Owner review → Compliance validation → Approval → Monitor",
  },
  platform: {
    family: "platform",
    dateLabel: "Effective from",
    partyLabel: "System / responsible owner",
    partyOptions: ["Nexora platform", "Finance integration", "Mobile workforce"],
    headerFields: [
      { label: "Environment", value: "Prototype", type: "select", options: ["Prototype", "Test", "Production"], span: 4, required: true },
      { label: "Change type", value: "Configuration", type: "select", options: ["Configuration", "Integration", "Security", "Migration"], span: 4 },
      { label: "Impact level", value: "Standard", type: "select", options: ["Low", "Standard", "High", "Critical"], span: 4 },
    ],
    lineLabel: "Configuration / mapping",
    lineOptions: ["Business rule", "Field mapping", "Notification template"],
    dimensionLabel: "Platform area",
    dimensions: ["Core platform", "Integration", "User experience"],
    contextMetrics: [["Dependencies", "3", "All mapped"], ["Test coverage", "92%", "4 scenarios pending"], ["Rollback", "Prepared", "Owner assigned"]],
    checks: [["Dependency impact", "Affected modules and consumers are identified"], ["Security review", "Roles and sensitive data impact are documented"], ["Release readiness", "Test, owner and rollback evidence are present"]],
    workflow: "Draft → Technical review → Business approval → Test → Release",
  },
};

export function getModuleFormBlueprint(moduleId: string, moduleCode: string, pageLabel: string): ModuleFormBlueprint {
  const family = moduleFormFamilies[moduleId as keyof typeof moduleFormFamilies] ?? "platform";
  const base = familyBlueprints[family];
  const label = pageLabel.replace(/^(Add|Create|New|Edit)\s+/i, "") || "Record";
  const pageToken = label.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "REC";
  return {
    ...base,
    recordLabel: label,
    numberPrefix: moduleCode + "-" + pageToken + "-2026-000184",
  };
}
