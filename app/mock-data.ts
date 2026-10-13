/**
 * NEXORA ERP UI/UX PROTOTYPE FIXTURES
 *
 * This file contains invented, deterministic display data for the isolated
 * prototype. It is not connected to the Nexora Demo Account, production APIs,
 * databases, posting services, or accounting logic. Monetary values and
 * balances are presentation fixtures only; no business calculation should be
 * inferred from them.
 */

export const PROTOTYPE_FIXTURE_NOTICE =
  "Prototype-only mock data — no production or Demo Account records";

export const prototypeAsOf = "2026-08-31T10:30:00+05:00";

export type CompanyMode = "service" | "trading" | "manufacturing";
export type CurrencyCode = "USD" | "PKR" | "GBP" | "EUR";
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
export type RoleDashboardPageId =
  | "ceo-executive-dashboard"
  | "cfo-dashboard"
  | "finance-manager-dashboard"
  | "production-manager-dashboard"
  | "hr-manager-dashboard"
  | "purchasing-manager-dashboard"
  | "sales-manager-dashboard"
  | "accountant-workspace"
  | "sales-executive-dashboard"
  | "procurement-officer-dashboard"
  | "inventory-manager-dashboard"
  | "warehouse-dashboard"
  | "project-manager-dashboard"
  | "admin-dashboard"
  | "crm-manager-dashboard"
  | "ar-manager-dashboard"
  | "ap-manager-dashboard"
  | "tax-manager-dashboard"
  | "auditor-dashboard";

export interface CompanyModeOption {
  id: CompanyMode;
  label: string;
  shortLabel: string;
  description: string;
  navigationFocus: readonly string[];
}

export interface CompanyFixture {
  id: string;
  name: string;
  shortName: string;
  legalName: string;
  mode: CompanyMode;
  industry: string;
  currency: CurrencyCode;
  country: string;
  city: string;
  fiscalYear: string;
  accent: string;
}

export interface RoleOption {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  dashboardPageId: RoleDashboardPageId;
  visibleModuleIds: readonly string[] | "all";
}

export const companyModeOptions = [
  {
    id: "service",
    label: "Service company",
    shortLabel: "Services",
    description: "Projects, time, billing, resources and customer delivery.",
    navigationFocus: ["sales", "projects", "resources", "expenses", "support"],
  },
  {
    id: "trading",
    label: "Trading company",
    shortLabel: "Trading",
    description: "Sales, purchasing, warehousing, distribution and margins.",
    navigationFocus: ["sales", "purchases", "inventory", "banking", "logistics"],
  },
  {
    id: "manufacturing",
    label: "Production / manufacturing",
    shortLabel: "Manufacturing",
    description: "Demand, planning, materials, production, quality and maintenance.",
    navigationFocus: ["manufacturing", "inventory", "quality", "maintenance", "costing"],
  },
] as const satisfies readonly CompanyModeOption[];

export const companies = [
  {
    id: "CO-SVC-001",
    name: "Nexora Services",
    shortName: "NS",
    legalName: "Nexora Services (Private) Limited",
    mode: "service",
    industry: "Technology consulting",
    currency: "USD",
    country: "Pakistan",
    city: "Islamabad",
    fiscalYear: "FY 2026",
    accent: "#2563eb",
  },
  {
    id: "CO-TRD-001",
    name: "Nexora Distribution",
    shortName: "ND",
    legalName: "Nexora Distribution (Private) Limited",
    mode: "trading",
    industry: "Industrial distribution",
    currency: "USD",
    country: "Pakistan",
    city: "Lahore",
    fiscalYear: "FY 2026",
    accent: "#0f766e",
  },
  {
    id: "CO-MFG-001",
    name: "Nexora Manufacturing",
    shortName: "NM",
    legalName: "Nexora Manufacturing (Private) Limited",
    mode: "manufacturing",
    industry: "Industrial automation",
    currency: "USD",
    country: "Pakistan",
    city: "Karachi",
    fiscalYear: "FY 2026",
    accent: "#7c3aed",
  },
] as const satisfies readonly CompanyFixture[];

const financeModules = ["dashboard", "finance", "banking", "reports", "approvals"];
const salesModules = ["dashboard", "crm", "sales", "customers", "reports", "approvals"];
const purchaseModules = ["dashboard", "purchases", "suppliers", "inventory", "reports", "approvals"];
const inventoryModules = ["dashboard", "inventory", "warehousing", "purchases", "fleet", "reports"];
const productionModules = ["dashboard", "manufacturing", "inventory", "quality", "maintenance", "fleet", "reports"];
const projectModules = ["dashboard", "projects", "resources", "time", "expenses", "reports"];
const peopleModules = ["dashboard", "hr", "payroll", "time", "expenses", "reports"];
const warehouseModules = ["dashboard", "inventory", "warehousing", "purchases", "sales", "quality", "fleet", "reports"];
const crmModules = ["dashboard", "crm", "sales", "customers", "reports"];
const receivablesModules = ["dashboard", "customers", "sales", "banking", "finance", "reports"];
const payablesModules = ["dashboard", "suppliers", "purchases", "banking", "finance", "reports"];
const taxModules = ["dashboard", "tax", "finance", "sales", "purchases", "reports", "audit"];
const auditModules = ["dashboard", "audit", "finance", "approvals", "reports"];

export const roleOptions = [
  {
    id: "chief-executive",
    label: "Chief Executive Officer",
    shortLabel: "CEO",
    description: "Enterprise performance, risks, approvals and strategic views.",
    dashboardPageId: "ceo-executive-dashboard",
    visibleModuleIds: "all",
  },
  {
    id: "chief-financial-officer",
    label: "Chief Financial Officer",
    shortLabel: "CFO",
    description: "Finance, treasury, planning, controls and executive reporting.",
    dashboardPageId: "cfo-dashboard",
    visibleModuleIds: financeModules,
  },
  {
    id: "finance-manager",
    label: "Finance Manager",
    shortLabel: "Finance",
    description: "Ledgers, periods, receivables, payables and approvals.",
    dashboardPageId: "finance-manager-dashboard",
    visibleModuleIds: financeModules,
  },
  {
    id: "accountant",
    label: "Accountant",
    shortLabel: "Accountant",
    description: "Day-to-day journals, documents, reconciliations and reports.",
    dashboardPageId: "accountant-workspace",
    visibleModuleIds: financeModules,
  },
  {
    id: "sales-manager",
    label: "Sales Manager",
    shortLabel: "Sales",
    description: "Pipeline, orders, invoicing, customers and sales performance.",
    dashboardPageId: "sales-manager-dashboard",
    visibleModuleIds: salesModules,
  },
  {
    id: "sales-executive",
    label: "Sales Executive",
    shortLabel: "Sales Rep",
    description: "Personal pipeline, customer follow-ups, quotations and conversion.",
    dashboardPageId: "sales-executive-dashboard",
    visibleModuleIds: salesModules,
  },
  {
    id: "purchase-manager",
    label: "Purchasing Manager",
    shortLabel: "Purchasing",
    description: "Requisitions, sourcing, orders, receipts and suppliers.",
    dashboardPageId: "purchasing-manager-dashboard",
    visibleModuleIds: purchaseModules,
  },
  {
    id: "procurement-officer",
    label: "Procurement Officer",
    shortLabel: "Procurement",
    description: "Sourcing events, supplier quotations, orders and delivery follow-up.",
    dashboardPageId: "procurement-officer-dashboard",
    visibleModuleIds: purchaseModules,
  },
  {
    id: "inventory-manager",
    label: "Inventory Manager",
    shortLabel: "Inventory",
    description: "Stock availability, transfers, counts and warehouse operations.",
    dashboardPageId: "inventory-manager-dashboard",
    visibleModuleIds: inventoryModules,
  },
  {
    id: "warehouse-user",
    label: "Warehouse Operations",
    shortLabel: "Warehouse",
    description: "Inbound, put-away, picking, dispatch, counts and exceptions.",
    dashboardPageId: "warehouse-dashboard",
    visibleModuleIds: warehouseModules,
  },
  {
    id: "production-manager",
    label: "Production Manager",
    shortLabel: "Production",
    description: "Production plans, work orders, materials, quality and capacity.",
    dashboardPageId: "production-manager-dashboard",
    visibleModuleIds: productionModules,
  },
  {
    id: "project-manager",
    label: "Project Manager",
    shortLabel: "Projects",
    description: "Delivery plans, resources, time, budgets and milestones.",
    dashboardPageId: "project-manager-dashboard",
    visibleModuleIds: projectModules,
  },
  {
    id: "hr-manager",
    label: "HR Manager",
    shortLabel: "HR",
    description: "People, attendance, leave, payroll and development.",
    dashboardPageId: "hr-manager-dashboard",
    visibleModuleIds: peopleModules,
  },
  {
    id: "administrator",
    label: "Administrator",
    shortLabel: "Admin",
    description: "Prototype configuration, users, integrations and audit views.",
    dashboardPageId: "admin-dashboard",
    visibleModuleIds: "all",
  },
  {
    id: "crm-manager",
    label: "CRM Manager",
    shortLabel: "CRM",
    description: "Pipeline quality, campaign response, activities and customer growth.",
    dashboardPageId: "crm-manager-dashboard",
    visibleModuleIds: crmModules,
  },
  {
    id: "ar-manager",
    label: "Accounts Receivable Manager",
    shortLabel: "AR",
    description: "Collections, ageing, disputes, credit exposure and customer balances.",
    dashboardPageId: "ar-manager-dashboard",
    visibleModuleIds: receivablesModules,
  },
  {
    id: "ap-manager",
    label: "Accounts Payable Manager",
    shortLabel: "AP",
    description: "Supplier liabilities, payment planning, matching and due-date control.",
    dashboardPageId: "ap-manager-dashboard",
    visibleModuleIds: payablesModules,
  },
  {
    id: "tax-manager",
    label: "Tax Manager",
    shortLabel: "Tax",
    description: "Tax positions, returns, reconciliations, deadlines and compliance risk.",
    dashboardPageId: "tax-manager-dashboard",
    visibleModuleIds: taxModules,
  },
  {
    id: "auditor",
    label: "Auditor",
    shortLabel: "Auditor",
    description: "Read-only control assurance, evidence, exceptions and audit trails.",
    dashboardPageId: "auditor-dashboard",
    visibleModuleIds: auditModules,
  },
  {
    id: "viewer",
    label: "Read-only Viewer",
    shortLabel: "Viewer",
    description: "Read-only dashboards, lists, details and reports.",
    dashboardPageId: "ceo-executive-dashboard",
    visibleModuleIds: ["dashboard", "reports"],
  },
] as const satisfies readonly RoleOption[];

export interface AddressFixture {
  line1: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
}

export interface CustomerFixture {
  id: string;
  companyId: string;
  name: string;
  code: string;
  segment: "Enterprise" | "Mid-market" | "Growth";
  industry: string;
  contactName: string;
  email: string;
  phone: string;
  currency: CurrencyCode;
  creditLimit: number;
  paymentTerms: string;
  receivableBalance: number;
  status: "Active" | "On hold" | "Prospect";
  address: AddressFixture;
}

export const customers = [
  {
    id: "CUS-1001",
    companyId: "CO-MFG-001",
    name: "Atlas Retail Group",
    code: "ATLAS-001",
    segment: "Enterprise",
    industry: "Retail and distribution",
    contactName: "Mariam Khan",
    email: "mariam.khan@example.test",
    phone: "+92 51 555 0101",
    currency: "USD",
    creditLimit: 250000,
    paymentTerms: "Net 30",
    receivableBalance: 66300,
    status: "Active",
    address: { line1: "18 Constitution Avenue", city: "Islamabad", region: "ICT", country: "Pakistan", postalCode: "44000" },
  },
  {
    id: "CUS-1002",
    companyId: "CO-SVC-001",
    name: "Crescent Health Network",
    code: "CRES-014",
    segment: "Enterprise",
    industry: "Healthcare",
    contactName: "Dr. Hira Saeed",
    email: "hira.saeed@example.test",
    phone: "+92 42 555 0140",
    currency: "USD",
    creditLimit: 150000,
    paymentTerms: "Net 30",
    receivableBalance: 48500,
    status: "Active",
    address: { line1: "44 Canal View", city: "Lahore", region: "Punjab", country: "Pakistan", postalCode: "54000" },
  },
  {
    id: "CUS-1003",
    companyId: "CO-SVC-001",
    name: "Meridian Properties",
    code: "MER-028",
    segment: "Mid-market",
    industry: "Property management",
    contactName: "Ali Raza",
    email: "ali.raza@example.test",
    phone: "+92 21 555 0280",
    currency: "USD",
    creditLimit: 90000,
    paymentTerms: "Net 15",
    receivableBalance: 28400,
    status: "Active",
    address: { line1: "7 Harbour Road", city: "Karachi", region: "Sindh", country: "Pakistan", postalCode: "74000" },
  },
  {
    id: "CUS-1004",
    companyId: "CO-TRD-001",
    name: "Northstar Foods",
    code: "NST-041",
    segment: "Growth",
    industry: "Food processing",
    contactName: "Zoya Ahmed",
    email: "zoya.ahmed@example.test",
    phone: "+92 41 555 0410",
    currency: "USD",
    creditLimit: 60000,
    paymentTerms: "Net 30",
    receivableBalance: 17640,
    status: "Active",
    address: { line1: "22 Industrial Estate", city: "Faisalabad", region: "Punjab", country: "Pakistan", postalCode: "38000" },
  },
  {
    id: "CUS-1005",
    companyId: "CO-MFG-001",
    name: "Orion Mobility",
    code: "ORI-056",
    segment: "Mid-market",
    industry: "Fleet technology",
    contactName: "Sameer Qureshi",
    email: "sameer.qureshi@example.test",
    phone: "+92 51 555 0560",
    currency: "USD",
    creditLimit: 120000,
    paymentTerms: "Net 45",
    receivableBalance: 0,
    status: "Prospect",
    address: { line1: "12 Innovation Park", city: "Rawalpindi", region: "Punjab", country: "Pakistan", postalCode: "46000" },
  },
] as const satisfies readonly CustomerFixture[];

export interface SupplierFixture {
  id: string;
  companyId: string;
  name: string;
  code: string;
  category: string;
  contactName: string;
  email: string;
  phone: string;
  currency: CurrencyCode;
  paymentTerms: string;
  openBalance: number;
  onTimeDelivery: number;
  qualityScore: number;
  risk: "Low" | "Medium" | "High";
  status: "Approved" | "Under review" | "Inactive";
}

export const suppliers = [
  {
    id: "SUP-2001",
    companyId: "CO-MFG-001",
    name: "Pak Industrial Metals",
    code: "PIM-001",
    category: "Raw materials",
    contactName: "Usman Tariq",
    email: "usman.tariq@example.test",
    phone: "+92 21 555 2001",
    currency: "USD",
    paymentTerms: "Net 30",
    openBalance: 72500,
    onTimeDelivery: 94,
    qualityScore: 97,
    risk: "Low",
    status: "Approved",
  },
  {
    id: "SUP-2002",
    companyId: "CO-TRD-001",
    name: "Nova Packaging Works",
    code: "NPW-017",
    category: "Packaging",
    contactName: "Iqra Mahmood",
    email: "iqra.mahmood@example.test",
    phone: "+92 42 555 2017",
    currency: "USD",
    paymentTerms: "Net 30",
    openBalance: 18400,
    onTimeDelivery: 89,
    qualityScore: 92,
    risk: "Medium",
    status: "Approved",
  },
  {
    id: "SUP-2003",
    companyId: "CO-SVC-001",
    name: "Vertex Cloud Systems",
    code: "VCS-024",
    category: "Technology",
    contactName: "Laiba Hassan",
    email: "laiba.hassan@example.test",
    phone: "+92 51 555 2024",
    currency: "USD",
    paymentTerms: "Net 15",
    openBalance: 9600,
    onTimeDelivery: 99,
    qualityScore: 98,
    risk: "Low",
    status: "Approved",
  },
  {
    id: "SUP-2004",
    companyId: "CO-TRD-001",
    name: "Alpine Logistics",
    code: "ALP-033",
    category: "Freight and logistics",
    contactName: "Hamid Nawaz",
    email: "hamid.nawaz@example.test",
    phone: "+92 42 555 2033",
    currency: "USD",
    paymentTerms: "Net 30",
    openBalance: 14320,
    onTimeDelivery: 86,
    qualityScore: 90,
    risk: "Medium",
    status: "Under review",
  },
  {
    id: "SUP-2005",
    companyId: "CO-MFG-001",
    name: "Precision Components",
    code: "PRC-046",
    category: "Automation components",
    contactName: "Saad Mirza",
    email: "saad.mirza@example.test",
    phone: "+92 21 555 2046",
    currency: "USD",
    paymentTerms: "Net 30",
    openBalance: 46820,
    onTimeDelivery: 96,
    qualityScore: 95,
    risk: "Low",
    status: "Approved",
  },
] as const satisfies readonly SupplierFixture[];

export interface ProductFixture {
  id: string;
  companyId: string;
  sku: string;
  name: string;
  category: string;
  type: "Finished good" | "Raw material" | "Component" | "Trading item";
  unit: string;
  listPrice: number;
  standardCost: number;
  preferredSupplierId?: string;
  status: "Active" | "Draft" | "Discontinued";
}

export const products = [
  { id: "PRD-PANEL-01", companyId: "CO-MFG-001", sku: "FG-ACP-120", name: "Automation Control Panel 120", category: "Control systems", type: "Finished good", unit: "each", listPrice: 12500, standardCost: 7900, status: "Active" },
  { id: "PRD-SERVO-02", companyId: "CO-MFG-001", sku: "CP-SRV-220", name: "Servo Drive Controller 220V", category: "Drives", type: "Component", unit: "each", listPrice: 2850, standardCost: 1850, preferredSupplierId: "SUP-2005", status: "Active" },
  { id: "PRD-SENSOR-04", companyId: "CO-MFG-001", sku: "CP-SEN-P04", name: "Proximity Sensor P04", category: "Sensors", type: "Component", unit: "each", listPrice: 340, standardCost: 205, preferredSupplierId: "SUP-2005", status: "Active" },
  { id: "PRD-ENCLOSURE-06", companyId: "CO-MFG-001", sku: "RM-ENC-600", name: "Powder-coated Enclosure 600", category: "Fabrication", type: "Raw material", unit: "each", listPrice: 980, standardCost: 640, preferredSupplierId: "SUP-2001", status: "Active" },
  { id: "PRD-CABLE-08", companyId: "CO-MFG-001", sku: "RM-CBL-8C", name: "Shielded Control Cable 8-core", category: "Electrical", type: "Raw material", unit: "metre", listPrice: 8.5, standardCost: 5.2, preferredSupplierId: "SUP-2001", status: "Active" },
  { id: "PRD-SCANNER-11", companyId: "CO-TRD-001", sku: "TR-SCN-X11", name: "Industrial Barcode Scanner X11", category: "Warehouse technology", type: "Trading item", unit: "each", listPrice: 890, standardCost: 535, preferredSupplierId: "SUP-2005", status: "Active" },
] as const satisfies readonly ProductFixture[];

export interface ServiceFixture {
  id: string;
  companyId: string;
  code: string;
  name: string;
  category: string;
  billingUnit: "hour" | "day" | "fixed" | "month";
  rate: number;
  revenueAccountId: string;
  status: "Active" | "Draft";
}

export const services = [
  { id: "SVC-IMPLEMENT-01", companyId: "CO-MFG-001", code: "SVC-IMP", name: "Installation and commissioning", category: "Implementation", billingUnit: "fixed", rate: 22500, revenueAccountId: "ACC-REV-SERV", status: "Active" },
  { id: "SVC-CONSULT-02", companyId: "CO-SVC-001", code: "SVC-CNS", name: "Business process consulting", category: "Advisory", billingUnit: "day", rate: 1250, revenueAccountId: "ACC-REV-CONS", status: "Active" },
  { id: "SVC-SUPPORT-03", companyId: "CO-SVC-001", code: "SVC-SUP", name: "Managed application support", category: "Support", billingUnit: "month", rate: 48500, revenueAccountId: "ACC-REV-SERV", status: "Active" },
  { id: "SVC-TRAIN-04", companyId: "CO-SVC-001", code: "SVC-TRN", name: "User enablement workshop", category: "Training", billingUnit: "day", rate: 1800, revenueAccountId: "ACC-REV-CONS", status: "Active" },
] as const satisfies readonly ServiceFixture[];

export interface AccountFixture {
  id: string;
  companyId: string;
  code: string;
  name: string;
  category: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
  section: string;
  normalBalance: "Debit" | "Credit";
  displayBalance: number;
  currency: CurrencyCode;
  status: "Active" | "Restricted";
}

export const accounts = [
  { id: "ACC-BANK-USD", companyId: "CO-MFG-001", code: "1010-01", name: "Operating Bank — USD", category: "Asset", section: "Cash and cash equivalents", normalBalance: "Debit", displayBalance: 724800, currency: "USD", status: "Active" },
  { id: "ACC-AR-TRADE", companyId: "CO-MFG-001", code: "1120-01", name: "Trade receivables", category: "Asset", section: "Current assets", normalBalance: "Debit", displayBalance: 312420, currency: "USD", status: "Active" },
  { id: "ACC-INV-RAW", companyId: "CO-MFG-001", code: "1210-01", name: "Raw materials inventory", category: "Asset", section: "Inventory", normalBalance: "Debit", displayBalance: 186700, currency: "USD", status: "Active" },
  { id: "ACC-INV-FG", companyId: "CO-MFG-001", code: "1230-01", name: "Finished goods inventory", category: "Asset", section: "Inventory", normalBalance: "Debit", displayBalance: 248300, currency: "USD", status: "Active" },
  { id: "ACC-AP-TRADE", companyId: "CO-MFG-001", code: "2010-01", name: "Trade payables", category: "Liability", section: "Current liabilities", normalBalance: "Credit", displayBalance: 248160, currency: "USD", status: "Active" },
  { id: "ACC-TAX-OUT", companyId: "CO-MFG-001", code: "2050-02", name: "Output tax payable", category: "Liability", section: "Tax liabilities", normalBalance: "Credit", displayBalance: 38420, currency: "USD", status: "Restricted" },
  { id: "ACC-EQUITY", companyId: "CO-MFG-001", code: "3010-01", name: "Issued capital", category: "Equity", section: "Shareholders' equity", normalBalance: "Credit", displayBalance: 500000, currency: "USD", status: "Restricted" },
  { id: "ACC-REV-PROD", companyId: "CO-MFG-001", code: "4010-01", name: "Product revenue", category: "Revenue", section: "Operating revenue", normalBalance: "Credit", displayBalance: 1260000, currency: "USD", status: "Active" },
  { id: "ACC-REV-SERV", companyId: "CO-MFG-001", code: "4020-01", name: "Service revenue", category: "Revenue", section: "Operating revenue", normalBalance: "Credit", displayBalance: 580000, currency: "USD", status: "Active" },
  { id: "ACC-REV-CONS", companyId: "CO-SVC-001", code: "4030-01", name: "Consulting revenue", category: "Revenue", section: "Operating revenue", normalBalance: "Credit", displayBalance: 840000, currency: "USD", status: "Active" },
  { id: "ACC-COGS", companyId: "CO-MFG-001", code: "5010-01", name: "Cost of goods sold", category: "Expense", section: "Direct costs", normalBalance: "Debit", displayBalance: 735000, currency: "USD", status: "Active" },
  { id: "ACC-OPEX", companyId: "CO-MFG-001", code: "6010-01", name: "Operating expenses", category: "Expense", section: "Operating expenses", normalBalance: "Debit", displayBalance: 418000, currency: "USD", status: "Active" },
] as const satisfies readonly AccountFixture[];

export interface DocumentLineFixture {
  id: string;
  itemId: string;
  itemType: "product" | "service" | "charge";
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  displayLineAmount: number;
}

export interface SalesOrderFixture {
  id: string;
  companyId: string;
  customerId: string;
  projectId?: string;
  orderDate: string;
  requestedDate: string;
  ownerEmployeeId: string;
  currency: CurrencyCode;
  displaySubtotal: number;
  displayTax: number;
  displayTotal: number;
  fulfillment: number;
  status: "Draft" | "Pending approval" | "Confirmed" | "In progress" | "Fulfilled";
  lines: readonly DocumentLineFixture[];
}

export const salesOrders = [
  {
    id: "SO-2026-1048",
    companyId: "CO-MFG-001",
    customerId: "CUS-1001",
    projectId: "PRJ-2026-011",
    orderDate: "2026-08-04",
    requestedDate: "2026-09-18",
    ownerEmployeeId: "EMP-022",
    currency: "USD",
    displaySubtotal: 172500,
    displayTax: 13800,
    displayTotal: 186300,
    fulfillment: 68,
    status: "In progress",
    lines: [
      { id: "SO1048-L1", itemId: "PRD-PANEL-01", itemType: "product", description: "Automation Control Panel 120", quantity: 12, unit: "each", unitPrice: 12500, taxRate: 8, displayLineAmount: 150000 },
      { id: "SO1048-L2", itemId: "SVC-IMPLEMENT-01", itemType: "service", description: "Installation and commissioning", quantity: 1, unit: "fixed", unitPrice: 22500, taxRate: 8, displayLineAmount: 22500 },
    ],
  },
  {
    id: "SO-2026-1052",
    companyId: "CO-SVC-001",
    customerId: "CUS-1002",
    projectId: "PRJ-2026-014",
    orderDate: "2026-08-12",
    requestedDate: "2026-10-01",
    ownerEmployeeId: "EMP-022",
    currency: "USD",
    displaySubtotal: 74600,
    displayTax: 0,
    displayTotal: 74600,
    fulfillment: 35,
    status: "Confirmed",
    lines: [
      { id: "SO1052-L1", itemId: "SVC-CONSULT-02", itemType: "service", description: "Business process consulting", quantity: 40, unit: "day", unitPrice: 1250, taxRate: 0, displayLineAmount: 50000 },
      { id: "SO1052-L2", itemId: "SVC-TRAIN-04", itemType: "service", description: "User enablement workshops", quantity: 6, unit: "day", unitPrice: 1800, taxRate: 0, displayLineAmount: 10800 },
      { id: "SO1052-L3", itemId: "SVC-SUPPORT-03", itemType: "service", description: "Transition support package", quantity: 1, unit: "fixed", unitPrice: 13800, taxRate: 0, displayLineAmount: 13800 },
    ],
  },
  {
    id: "SO-2026-1057",
    companyId: "CO-SVC-001",
    customerId: "CUS-1003",
    orderDate: "2026-08-27",
    requestedDate: "2026-09-30",
    ownerEmployeeId: "EMP-022",
    currency: "USD",
    displaySubtotal: 28400,
    displayTax: 0,
    displayTotal: 28400,
    fulfillment: 0,
    status: "Pending approval",
    lines: [
      { id: "SO1057-L1", itemId: "SVC-CONSULT-02", itemType: "service", description: "Process discovery sprint", quantity: 16, unit: "day", unitPrice: 1250, taxRate: 0, displayLineAmount: 20000 },
      { id: "SO1057-L2", itemId: "SVC-TRAIN-04", itemType: "service", description: "Team enablement", quantity: 4, unit: "day", unitPrice: 1800, taxRate: 0, displayLineAmount: 7200 },
      { id: "SO1057-L3", itemId: "SVC-CONSULT-02", itemType: "charge", description: "Travel allowance", quantity: 1, unit: "fixed", unitPrice: 1200, taxRate: 0, displayLineAmount: 1200 },
    ],
  },
] as const satisfies readonly SalesOrderFixture[];

export interface InvoiceFixture {
  id: string;
  companyId: string;
  customerId: string;
  salesOrderId?: string;
  projectId?: string;
  invoiceDate: string;
  dueDate: string;
  ownerEmployeeId: string;
  currency: CurrencyCode;
  displaySubtotal: number;
  displayTax: number;
  displayTotal: number;
  displayPaid: number;
  displayBalance: number;
  status: "Draft" | "Pending approval" | "Posted" | "Partially paid" | "Paid" | "Overdue";
  lines: readonly DocumentLineFixture[];
}

export const invoices = [
  {
    id: "INV-2026-0821",
    companyId: "CO-MFG-001",
    customerId: "CUS-1001",
    salesOrderId: "SO-2026-1048",
    projectId: "PRJ-2026-011",
    invoiceDate: "2026-08-18",
    dueDate: "2026-09-17",
    ownerEmployeeId: "EMP-022",
    currency: "USD",
    displaySubtotal: 172500,
    displayTax: 13800,
    displayTotal: 186300,
    displayPaid: 120000,
    displayBalance: 66300,
    status: "Partially paid",
    lines: salesOrders[0].lines,
  },
  {
    id: "INV-2026-0814",
    companyId: "CO-SVC-001",
    customerId: "CUS-1002",
    projectId: "PRJ-2026-014",
    invoiceDate: "2026-08-01",
    dueDate: "2026-08-31",
    ownerEmployeeId: "EMP-022",
    currency: "USD",
    displaySubtotal: 48500,
    displayTax: 0,
    displayTotal: 48500,
    displayPaid: 0,
    displayBalance: 48500,
    status: "Overdue",
    lines: [{ id: "INV0814-L1", itemId: "SVC-SUPPORT-03", itemType: "service", description: "Managed application support — August", quantity: 1, unit: "month", unitPrice: 48500, taxRate: 0, displayLineAmount: 48500 }],
  },
  {
    id: "INV-2026-0827",
    companyId: "CO-TRD-001",
    customerId: "CUS-1004",
    invoiceDate: "2026-08-22",
    dueDate: "2026-09-21",
    ownerEmployeeId: "EMP-022",
    currency: "USD",
    displaySubtotal: 17640,
    displayTax: 0,
    displayTotal: 17640,
    displayPaid: 0,
    displayBalance: 17640,
    status: "Posted",
    lines: [{ id: "INV0827-L1", itemId: "PRD-SCANNER-11", itemType: "product", description: "Industrial Barcode Scanner X11", quantity: 20, unit: "each", unitPrice: 882, taxRate: 0, displayLineAmount: 17640 }],
  },
  {
    id: "INV-2026-0833",
    companyId: "CO-SVC-001",
    customerId: "CUS-1003",
    salesOrderId: "SO-2026-1057",
    invoiceDate: "2026-08-29",
    dueDate: "2026-09-13",
    ownerEmployeeId: "EMP-022",
    currency: "USD",
    displaySubtotal: 28400,
    displayTax: 0,
    displayTotal: 28400,
    displayPaid: 0,
    displayBalance: 28400,
    status: "Draft",
    lines: salesOrders[2].lines,
  },
] as const satisfies readonly InvoiceFixture[];

export interface PurchaseRequisitionFixture {
  id: string;
  companyId: string;
  requesterEmployeeId: string;
  department: string;
  requiredDate: string;
  purpose: string;
  currency: CurrencyCode;
  displayEstimatedTotal: number;
  status: "Draft" | "Pending approval" | "Approved" | "Converted" | "Rejected";
  purchaseOrderId?: string;
  lines: readonly DocumentLineFixture[];
}

export const purchaseRequisitions = [
  {
    id: "PR-2026-0038",
    companyId: "CO-MFG-001",
    requesterEmployeeId: "EMP-031",
    department: "Production",
    requiredDate: "2026-09-05",
    purpose: "Materials for Atlas control-panel production run",
    currency: "USD",
    displayEstimatedTotal: 45200,
    status: "Converted",
    purchaseOrderId: "PO-2026-1842",
    lines: [
      { id: "PR0038-L1", itemId: "PRD-SERVO-02", itemType: "product", description: "Servo Drive Controller 220V", quantity: 20, unit: "each", unitPrice: 1850, taxRate: 0, displayLineAmount: 37000 },
      { id: "PR0038-L2", itemId: "PRD-SENSOR-04", itemType: "product", description: "Proximity Sensor P04", quantity: 40, unit: "each", unitPrice: 205, taxRate: 0, displayLineAmount: 8200 },
    ],
  },
  {
    id: "PR-2026-0041",
    companyId: "CO-SVC-001",
    requesterEmployeeId: "EMP-019",
    department: "Technology",
    requiredDate: "2026-09-15",
    purpose: "Cloud test environments for delivery teams",
    currency: "USD",
    displayEstimatedTotal: 9600,
    status: "Pending approval",
    lines: [{ id: "PR0041-L1", itemId: "SVC-CLOUD-01", itemType: "service", description: "Cloud test environments — annual plan", quantity: 1, unit: "year", unitPrice: 9600, taxRate: 0, displayLineAmount: 9600 }],
  },
  {
    id: "PR-2026-0044",
    companyId: "CO-TRD-001",
    requesterEmployeeId: "EMP-027",
    department: "Warehousing",
    requiredDate: "2026-09-20",
    purpose: "Additional scanners for Lahore distribution centre",
    currency: "USD",
    displayEstimatedTotal: 10680,
    status: "Draft",
    lines: [{ id: "PR0044-L1", itemId: "PRD-SCANNER-11", itemType: "product", description: "Industrial Barcode Scanner X11", quantity: 12, unit: "each", unitPrice: 890, taxRate: 0, displayLineAmount: 10680 }],
  },
] as const satisfies readonly PurchaseRequisitionFixture[];

export interface PurchaseOrderFixture {
  id: string;
  companyId: string;
  requisitionId?: string;
  supplierId: string;
  buyerEmployeeId: string;
  orderDate: string;
  expectedDate: string;
  currency: CurrencyCode;
  displaySubtotal: number;
  displayTax: number;
  displayTotal: number;
  receivedPercent: number;
  status: "Draft" | "Pending approval" | "Approved" | "Sent" | "Partially received" | "Received" | "Closed";
  lines: readonly DocumentLineFixture[];
}

export const purchaseOrders = [
  {
    id: "PO-2026-1842",
    companyId: "CO-MFG-001",
    requisitionId: "PR-2026-0038",
    supplierId: "SUP-2005",
    buyerEmployeeId: "EMP-014",
    orderDate: "2026-08-19",
    expectedDate: "2026-09-02",
    currency: "USD",
    displaySubtotal: 46820,
    displayTax: 0,
    displayTotal: 46820,
    receivedPercent: 100,
    status: "Received",
    lines: [
      { id: "PO1842-L1", itemId: "PRD-SERVO-02", itemType: "product", description: "Servo Drive Controller 220V", quantity: 20, unit: "each", unitPrice: 1850, taxRate: 0, displayLineAmount: 37000 },
      { id: "PO1842-L2", itemId: "PRD-SENSOR-04", itemType: "product", description: "Proximity Sensor P04", quantity: 40, unit: "each", unitPrice: 205, taxRate: 0, displayLineAmount: 8200 },
      { id: "PO1842-L3", itemId: "CHG-FREIGHT", itemType: "charge", description: "Inbound freight and handling", quantity: 1, unit: "fixed", unitPrice: 1620, taxRate: 0, displayLineAmount: 1620 },
    ],
  },
  {
    id: "PO-2026-1836",
    companyId: "CO-MFG-001",
    supplierId: "SUP-2001",
    buyerEmployeeId: "EMP-014",
    orderDate: "2026-08-14",
    expectedDate: "2026-09-06",
    currency: "USD",
    displaySubtotal: 72500,
    displayTax: 0,
    displayTotal: 72500,
    receivedPercent: 45,
    status: "Partially received",
    lines: [{ id: "PO1836-L1", itemId: "PRD-ENCLOSURE-06", itemType: "product", description: "Powder-coated Enclosure 600", quantity: 100, unit: "each", unitPrice: 725, taxRate: 0, displayLineAmount: 72500 }],
  },
  {
    id: "PO-2026-1849",
    companyId: "CO-SVC-001",
    requisitionId: "PR-2026-0041",
    supplierId: "SUP-2003",
    buyerEmployeeId: "EMP-014",
    orderDate: "2026-08-30",
    expectedDate: "2026-09-03",
    currency: "USD",
    displaySubtotal: 9600,
    displayTax: 0,
    displayTotal: 9600,
    receivedPercent: 0,
    status: "Pending approval",
    lines: purchaseRequisitions[1].lines,
  },
] as const satisfies readonly PurchaseOrderFixture[];

export interface GoodsReceiptFixture {
  id: string;
  companyId: string;
  purchaseOrderId: string;
  supplierId: string;
  warehouseId: string;
  receiptDate: string;
  receivedByEmployeeId: string;
  inspectionStatus: "Not required" | "Pending" | "Passed" | "Failed";
  status: "Draft" | "Received" | "Quality hold" | "Completed";
  lines: readonly {
    id: string;
    productId: string;
    ordered: number;
    received: number;
    accepted: number;
    rejected: number;
    unit: string;
  }[];
}

export const goodsReceipts = [
  {
    id: "GRN-2026-0771",
    companyId: "CO-MFG-001",
    purchaseOrderId: "PO-2026-1842",
    supplierId: "SUP-2005",
    warehouseId: "WH-KHI-01",
    receiptDate: "2026-08-29",
    receivedByEmployeeId: "EMP-027",
    inspectionStatus: "Passed",
    status: "Completed",
    lines: [
      { id: "GRN0771-L1", productId: "PRD-SERVO-02", ordered: 20, received: 20, accepted: 20, rejected: 0, unit: "each" },
      { id: "GRN0771-L2", productId: "PRD-SENSOR-04", ordered: 40, received: 40, accepted: 40, rejected: 0, unit: "each" },
    ],
  },
  {
    id: "GRN-2026-0764",
    companyId: "CO-MFG-001",
    purchaseOrderId: "PO-2026-1836",
    supplierId: "SUP-2001",
    warehouseId: "WH-KHI-01",
    receiptDate: "2026-08-25",
    receivedByEmployeeId: "EMP-027",
    inspectionStatus: "Pending",
    status: "Quality hold",
    lines: [{ id: "GRN0764-L1", productId: "PRD-ENCLOSURE-06", ordered: 100, received: 45, accepted: 0, rejected: 0, unit: "each" }],
  },
] as const satisfies readonly GoodsReceiptFixture[];

export interface PurchaseBillFixture {
  id: string;
  companyId: string;
  supplierId: string;
  purchaseOrderId?: string;
  goodsReceiptId?: string;
  supplierReference: string;
  billDate: string;
  dueDate: string;
  currency: CurrencyCode;
  displaySubtotal: number;
  displayTax: number;
  displayTotal: number;
  displayPaid: number;
  displayBalance: number;
  matchStatus: "Matched" | "Variance" | "Not matched";
  status: "Draft" | "Pending approval" | "Approved" | "Scheduled" | "Paid" | "Overdue";
}

export const purchaseBills = [
  {
    id: "BILL-2026-0912",
    companyId: "CO-MFG-001",
    supplierId: "SUP-2005",
    purchaseOrderId: "PO-2026-1842",
    goodsReceiptId: "GRN-2026-0771",
    supplierReference: "PC-INV-8841",
    billDate: "2026-08-29",
    dueDate: "2026-09-28",
    currency: "USD",
    displaySubtotal: 46820,
    displayTax: 0,
    displayTotal: 46820,
    displayPaid: 0,
    displayBalance: 46820,
    matchStatus: "Matched",
    status: "Approved",
  },
  {
    id: "BILL-2026-0899",
    companyId: "CO-MFG-001",
    supplierId: "SUP-2001",
    purchaseOrderId: "PO-2026-1836",
    goodsReceiptId: "GRN-2026-0764",
    supplierReference: "PIM-6729",
    billDate: "2026-08-25",
    dueDate: "2026-09-24",
    currency: "USD",
    displaySubtotal: 32625,
    displayTax: 0,
    displayTotal: 32625,
    displayPaid: 0,
    displayBalance: 32625,
    matchStatus: "Not matched",
    status: "Draft",
  },
  {
    id: "BILL-2026-0876",
    companyId: "CO-SVC-001",
    supplierId: "SUP-2003",
    supplierReference: "VCS-2026-0811",
    billDate: "2026-08-01",
    dueDate: "2026-08-16",
    currency: "USD",
    displaySubtotal: 9600,
    displayTax: 0,
    displayTotal: 9600,
    displayPaid: 0,
    displayBalance: 9600,
    matchStatus: "Matched",
    status: "Overdue",
  },
] as const satisfies readonly PurchaseBillFixture[];

export interface BankTransactionFixture {
  id: string;
  companyId: string;
  bankAccountId: string;
  transactionDate: string;
  valueDate: string;
  type: "Receipt" | "Payment" | "Transfer" | "Bank charge";
  reference: string;
  counterparty: string;
  relatedDocumentId?: string;
  currency: CurrencyCode;
  displayAmount: number;
  direction: "In" | "Out";
  reconciliationStatus: "Matched" | "Suggested match" | "Unmatched" | "Excluded";
  status: "Cleared" | "Pending" | "Reversed";
}

export const bankTransactions = [
  { id: "BTX-2026-5318", companyId: "CO-MFG-001", bankAccountId: "ACC-BANK-USD", transactionDate: "2026-08-26", valueDate: "2026-08-26", type: "Receipt", reference: "ATL-0826-120K", counterparty: "Atlas Retail Group", relatedDocumentId: "INV-2026-0821", currency: "USD", displayAmount: 120000, direction: "In", reconciliationStatus: "Matched", status: "Cleared" },
  { id: "BTX-2026-5326", companyId: "CO-MFG-001", bankAccountId: "ACC-BANK-USD", transactionDate: "2026-08-30", valueDate: "2026-08-31", type: "Payment", reference: "PAY-PC-0912", counterparty: "Precision Components", relatedDocumentId: "BILL-2026-0912", currency: "USD", displayAmount: 46820, direction: "Out", reconciliationStatus: "Suggested match", status: "Pending" },
  { id: "BTX-2026-5294", companyId: "CO-MFG-001", bankAccountId: "ACC-BANK-USD", transactionDate: "2026-08-19", valueDate: "2026-08-19", type: "Bank charge", reference: "BANK-FEE-0819", counterparty: "Summit Commercial Bank", currency: "USD", displayAmount: 85, direction: "Out", reconciliationStatus: "Unmatched", status: "Cleared" },
  { id: "BTX-2026-5280", companyId: "CO-SVC-001", bankAccountId: "ACC-BANK-USD", transactionDate: "2026-08-15", valueDate: "2026-08-15", type: "Receipt", reference: "CHN-MILESTONE-02", counterparty: "Crescent Health Network", currency: "USD", displayAmount: 26100, direction: "In", reconciliationStatus: "Matched", status: "Cleared" },
] as const satisfies readonly BankTransactionFixture[];

export interface InventoryFixture {
  id: string;
  companyId: string;
  productId: string;
  warehouseId: string;
  warehouseName: string;
  location: string;
  lot?: string;
  onHand: number;
  allocated: number;
  available: number;
  reorderPoint: number;
  unit: string;
  inventoryStatus: "Healthy" | "Low stock" | "Reorder" | "Quality hold" | "Out of stock";
  lastMovement: string;
}

export const inventory = [
  { id: "STK-PANEL-KHI", companyId: "CO-MFG-001", productId: "PRD-PANEL-01", warehouseId: "WH-KHI-01", warehouseName: "Karachi Main Warehouse", location: "FG-A-02", onHand: 18, allocated: 12, available: 6, reorderPoint: 8, unit: "each", inventoryStatus: "Low stock", lastMovement: "2026-08-30" },
  { id: "STK-SERVO-KHI", companyId: "CO-MFG-001", productId: "PRD-SERVO-02", warehouseId: "WH-KHI-01", warehouseName: "Karachi Main Warehouse", location: "CMP-B-14", lot: "SRV-260829", onHand: 44, allocated: 24, available: 20, reorderPoint: 16, unit: "each", inventoryStatus: "Healthy", lastMovement: "2026-08-29" },
  { id: "STK-SENSOR-KHI", companyId: "CO-MFG-001", productId: "PRD-SENSOR-04", warehouseId: "WH-KHI-01", warehouseName: "Karachi Main Warehouse", location: "CMP-B-21", lot: "SEN-260829", onHand: 96, allocated: 52, available: 44, reorderPoint: 40, unit: "each", inventoryStatus: "Healthy", lastMovement: "2026-08-29" },
  { id: "STK-ENC-KHI", companyId: "CO-MFG-001", productId: "PRD-ENCLOSURE-06", warehouseId: "WH-KHI-01", warehouseName: "Karachi Main Warehouse", location: "QH-01", lot: "ENC-260825", onHand: 45, allocated: 0, available: 0, reorderPoint: 30, unit: "each", inventoryStatus: "Quality hold", lastMovement: "2026-08-25" },
  { id: "STK-CABLE-KHI", companyId: "CO-MFG-001", productId: "PRD-CABLE-08", warehouseId: "WH-KHI-01", warehouseName: "Karachi Main Warehouse", location: "RM-C-08", lot: "CBL-260701", onHand: 820, allocated: 460, available: 360, reorderPoint: 500, unit: "metre", inventoryStatus: "Reorder", lastMovement: "2026-08-28" },
  { id: "STK-SCAN-LHE", companyId: "CO-TRD-001", productId: "PRD-SCANNER-11", warehouseId: "WH-LHE-01", warehouseName: "Lahore Distribution Centre", location: "A-03-07", onHand: 62, allocated: 32, available: 30, reorderPoint: 24, unit: "each", inventoryStatus: "Healthy", lastMovement: "2026-08-30" },
] as const satisfies readonly InventoryFixture[];

export interface EmployeeFixture {
  id: string;
  companyId: string;
  employeeNumber: string;
  name: string;
  initials: string;
  jobTitle: string;
  department: string;
  managerId?: string;
  email: string;
  location: string;
  joinDate: string;
  employmentType: "Permanent" | "Contract" | "Part-time";
  availability: number;
  status: "Active" | "On leave" | "Notice period";
}

export const employees = [
  { id: "EMP-001", companyId: "CO-SVC-001", employeeNumber: "NX-0001", name: "Ayesha Malik", initials: "AM", jobTitle: "Chief Executive Officer", department: "Executive", email: "ayesha.malik@example.test", location: "Islamabad", joinDate: "2021-01-11", employmentType: "Permanent", availability: 40, status: "Active" },
  { id: "EMP-006", companyId: "CO-MFG-001", employeeNumber: "NX-0006", name: "Bilal Rahman", initials: "BR", jobTitle: "Chief Financial Officer", department: "Finance", managerId: "EMP-001", email: "bilal.rahman@example.test", location: "Karachi", joinDate: "2021-03-08", employmentType: "Permanent", availability: 25, status: "Active" },
  { id: "EMP-009", companyId: "CO-MFG-001", employeeNumber: "NX-0009", name: "Mehwish Noor", initials: "MN", jobTitle: "Finance Manager", department: "Finance", managerId: "EMP-006", email: "mehwish.noor@example.test", location: "Karachi", joinDate: "2022-02-14", employmentType: "Permanent", availability: 55, status: "Active" },
  { id: "EMP-014", companyId: "CO-MFG-001", employeeNumber: "NX-0014", name: "Omar Farooq", initials: "OF", jobTitle: "Purchase Manager", department: "Procurement", managerId: "EMP-006", email: "omar.farooq@example.test", location: "Karachi", joinDate: "2022-06-20", employmentType: "Permanent", availability: 62, status: "Active" },
  { id: "EMP-018", companyId: "CO-MFG-001", employeeNumber: "NX-0018", name: "Rida Abbas", initials: "RA", jobTitle: "Senior Accountant", department: "Finance", managerId: "EMP-009", email: "rida.abbas@example.test", location: "Karachi", joinDate: "2023-01-09", employmentType: "Permanent", availability: 70, status: "Active" },
  { id: "EMP-019", companyId: "CO-SVC-001", employeeNumber: "NX-0019", name: "Danish Akram", initials: "DA", jobTitle: "Technology Lead", department: "Technology", managerId: "EMP-001", email: "danish.akram@example.test", location: "Islamabad", joinDate: "2023-02-13", employmentType: "Permanent", availability: 35, status: "Active" },
  { id: "EMP-022", companyId: "CO-SVC-001", employeeNumber: "NX-0022", name: "Sana Iqbal", initials: "SI", jobTitle: "Sales Manager", department: "Sales", managerId: "EMP-001", email: "sana.iqbal@example.test", location: "Islamabad", joinDate: "2023-05-15", employmentType: "Permanent", availability: 48, status: "Active" },
  { id: "EMP-027", companyId: "CO-MFG-001", employeeNumber: "NX-0027", name: "Waqas Ahmed", initials: "WA", jobTitle: "Inventory Manager", department: "Warehousing", managerId: "EMP-031", email: "waqas.ahmed@example.test", location: "Karachi", joinDate: "2023-09-04", employmentType: "Permanent", availability: 58, status: "Active" },
  { id: "EMP-031", companyId: "CO-MFG-001", employeeNumber: "NX-0031", name: "Hamza Ali", initials: "HA", jobTitle: "Production Manager", department: "Production", managerId: "EMP-001", email: "hamza.ali@example.test", location: "Karachi", joinDate: "2024-01-08", employmentType: "Permanent", availability: 42, status: "Active" },
  { id: "EMP-034", companyId: "CO-SVC-001", employeeNumber: "NX-0034", name: "Nadia Javed", initials: "NJ", jobTitle: "Project Manager", department: "Professional Services", managerId: "EMP-019", email: "nadia.javed@example.test", location: "Islamabad", joinDate: "2024-03-11", employmentType: "Permanent", availability: 31, status: "Active" },
  { id: "EMP-041", companyId: "CO-MFG-001", employeeNumber: "NX-0041", name: "Arham Shah", initials: "AS", jobTitle: "Quality Engineer", department: "Quality", managerId: "EMP-031", email: "arham.shah@example.test", location: "Karachi", joinDate: "2024-08-19", employmentType: "Permanent", availability: 66, status: "On leave" },
] as const satisfies readonly EmployeeFixture[];

export interface ProjectFixture {
  id: string;
  companyId: string;
  customerId: string;
  salesOrderId?: string;
  name: string;
  projectManagerId: string;
  startDate: string;
  endDate: string;
  displayBudget: number;
  displayActual: number;
  completion: number;
  health: "On track" | "At risk" | "Off track";
  status: "Planned" | "Active" | "On hold" | "Completed";
  nextMilestone: string;
}

export const projects = [
  { id: "PRJ-2026-011", companyId: "CO-MFG-001", customerId: "CUS-1001", salesOrderId: "SO-2026-1048", name: "Atlas Warehouse Automation", projectManagerId: "EMP-034", startDate: "2026-08-10", endDate: "2026-10-16", displayBudget: 186300, displayActual: 112480, completion: 61, health: "On track", status: "Active", nextMilestone: "Factory acceptance test — 18 Sep" },
  { id: "PRJ-2026-014", companyId: "CO-SVC-001", customerId: "CUS-1002", salesOrderId: "SO-2026-1052", name: "Crescent Finance Transformation", projectManagerId: "EMP-034", startDate: "2026-08-18", endDate: "2026-11-20", displayBudget: 74600, displayActual: 24820, completion: 34, health: "At risk", status: "Active", nextMilestone: "Design sign-off — 05 Sep" },
  { id: "PRJ-2026-008", companyId: "CO-SVC-001", customerId: "CUS-1003", name: "Meridian Service Desk Rollout", projectManagerId: "EMP-034", startDate: "2026-05-04", endDate: "2026-08-28", displayBudget: 52200, displayActual: 50140, completion: 100, health: "On track", status: "Completed", nextMilestone: "Closure review — 04 Sep" },
] as const satisfies readonly ProjectFixture[];

export interface ProductionOrderFixture {
  id: string;
  companyId: string;
  productId: string;
  salesOrderId?: string;
  projectId?: string;
  workCentre: string;
  plannedStart: string;
  plannedFinish: string;
  plannedQuantity: number;
  completedQuantity: number;
  unit: string;
  progress: number;
  priority: "Low" | "Normal" | "High" | "Critical";
  qualityStatus: "Not started" | "In process" | "Passed" | "Hold";
  status: "Planned" | "Released" | "In progress" | "Paused" | "Completed";
  materials: readonly {
    productId: string;
    required: number;
    issued: number;
    unit: string;
  }[];
}

export const productionOrders = [
  {
    id: "MO-2026-0047",
    companyId: "CO-MFG-001",
    productId: "PRD-PANEL-01",
    salesOrderId: "SO-2026-1048",
    projectId: "PRJ-2026-011",
    workCentre: "Assembly Line A",
    plannedStart: "2026-08-24",
    plannedFinish: "2026-09-12",
    plannedQuantity: 12,
    completedQuantity: 7,
    unit: "each",
    progress: 58,
    priority: "High",
    qualityStatus: "In process",
    status: "In progress",
    materials: [
      { productId: "PRD-SERVO-02", required: 24, issued: 14, unit: "each" },
      { productId: "PRD-SENSOR-04", required: 48, issued: 28, unit: "each" },
      { productId: "PRD-ENCLOSURE-06", required: 12, issued: 7, unit: "each" },
      { productId: "PRD-CABLE-08", required: 480, issued: 280, unit: "metre" },
    ],
  },
  {
    id: "MO-2026-0049",
    companyId: "CO-MFG-001",
    productId: "PRD-PANEL-01",
    workCentre: "Assembly Line B",
    plannedStart: "2026-09-14",
    plannedFinish: "2026-09-28",
    plannedQuantity: 8,
    completedQuantity: 0,
    unit: "each",
    progress: 0,
    priority: "Normal",
    qualityStatus: "Not started",
    status: "Planned",
    materials: [
      { productId: "PRD-SERVO-02", required: 16, issued: 0, unit: "each" },
      { productId: "PRD-SENSOR-04", required: 32, issued: 0, unit: "each" },
      { productId: "PRD-ENCLOSURE-06", required: 8, issued: 0, unit: "each" },
      { productId: "PRD-CABLE-08", required: 320, issued: 0, unit: "metre" },
    ],
  },
] as const satisfies readonly ProductionOrderFixture[];

export interface ApprovalFixture {
  id: string;
  companyId: string;
  module: string;
  entityType: string;
  entityId: string;
  title: string;
  requestedByEmployeeId: string;
  assignedRoleId: string;
  submittedAt: string;
  dueAt: string;
  displayAmount?: number;
  currency?: CurrencyCode;
  priority: "Low" | "Normal" | "High" | "Urgent";
  step: string;
  status: "Pending" | "Approved" | "Rejected" | "Returned";
}

export const approvals = [
  { id: "APR-2026-0714", companyId: "CO-MFG-001", module: "Purchases", entityType: "Purchase order", entityId: "PO-2026-1842", title: "Automation components for Atlas order", requestedByEmployeeId: "EMP-014", assignedRoleId: "chief-financial-officer", submittedAt: "2026-08-19T14:24:00+05:00", dueAt: "2026-08-31T15:00:00+05:00", displayAmount: 46820, currency: "USD", priority: "Urgent", step: "CFO approval", status: "Pending" },
  { id: "APR-2026-0719", companyId: "CO-SVC-001", module: "Expenses", entityType: "Expense claim", entityId: "EXP-2026-0917", title: "Client workshop travel expenses", requestedByEmployeeId: "EMP-034", assignedRoleId: "finance-manager", submittedAt: "2026-08-28T09:10:00+05:00", dueAt: "2026-08-31T17:00:00+05:00", displayAmount: 2485, currency: "USD", priority: "High", step: "Finance review", status: "Pending" },
  { id: "APR-2026-0721", companyId: "CO-MFG-001", module: "Finance", entityType: "Journal entry", entityId: "JE-2026-00482", title: "Month-end allocation journal", requestedByEmployeeId: "EMP-018", assignedRoleId: "finance-manager", submittedAt: "2026-08-29T16:40:00+05:00", dueAt: "2026-09-01T12:00:00+05:00", displayAmount: 18600, currency: "USD", priority: "Normal", step: "Manager review", status: "Pending" },
  { id: "APR-2026-0725", companyId: "CO-MFG-001", module: "Sales", entityType: "Credit limit", entityId: "CR-2026-0128", title: "Atlas temporary credit increase", requestedByEmployeeId: "EMP-022", assignedRoleId: "chief-financial-officer", submittedAt: "2026-08-30T11:18:00+05:00", dueAt: "2026-09-01T10:00:00+05:00", displayAmount: 75000, currency: "USD", priority: "High", step: "Risk approval", status: "Pending" },
  { id: "APR-2026-0704", companyId: "CO-SVC-001", module: "Sales", entityType: "Sales order", entityId: "SO-2026-1052", title: "Crescent transformation engagement", requestedByEmployeeId: "EMP-022", assignedRoleId: "chief-executive", submittedAt: "2026-08-12T10:05:00+05:00", dueAt: "2026-08-13T17:00:00+05:00", displayAmount: 74600, currency: "USD", priority: "Normal", step: "Executive approval", status: "Approved" },
] as const satisfies readonly ApprovalFixture[];

export interface NotificationFixture {
  id: string;
  companyId: string;
  recipientEmployeeId: string;
  type: "Approval" | "Exception" | "Reminder" | "Information";
  title: string;
  message: string;
  entityId?: string;
  createdAt: string;
  read: boolean;
  tone: Tone;
}

export const notifications = [
  { id: "NOT-1001", companyId: "CO-MFG-001", recipientEmployeeId: "EMP-001", type: "Approval", title: "Purchase order needs approval", message: "PO-2026-1842 for $46,820 is waiting for CFO approval.", entityId: "PO-2026-1842", createdAt: "2026-08-31T09:42:00+05:00", read: false, tone: "warning" },
  { id: "NOT-1002", companyId: "CO-SVC-001", recipientEmployeeId: "EMP-001", type: "Exception", title: "Project milestone at risk", message: "Crescent Finance Transformation design sign-off may slip by three days.", entityId: "PRJ-2026-014", createdAt: "2026-08-31T08:15:00+05:00", read: false, tone: "danger" },
  { id: "NOT-1003", companyId: "CO-MFG-001", recipientEmployeeId: "EMP-001", type: "Information", title: "Goods receipt completed", message: "GRN-2026-0771 was received and passed visual quality inspection.", entityId: "GRN-2026-0771", createdAt: "2026-08-30T16:30:00+05:00", read: false, tone: "success" },
  { id: "NOT-1004", companyId: "CO-MFG-001", recipientEmployeeId: "EMP-001", type: "Reminder", title: "Month-end review tomorrow", message: "The August close readiness review starts at 10:00 AM.", createdAt: "2026-08-30T14:00:00+05:00", read: true, tone: "info" },
] as const satisfies readonly NotificationFixture[];

export interface AuditEventFixture {
  id: string;
  companyId: string;
  timestamp: string;
  actorEmployeeId: string;
  module: string;
  action: "Created" | "Updated" | "Submitted" | "Approved" | "Rejected" | "Viewed" | "Exported";
  entityType: string;
  entityId: string;
  summary: string;
  source: "Prototype UI";
  outcome: "Success" | "Mock only";
}

export const auditEvents = [
  { id: "AUD-2026-8801", companyId: "CO-MFG-001", timestamp: "2026-08-31T10:16:00+05:00", actorEmployeeId: "EMP-018", module: "Finance", action: "Submitted", entityType: "Journal entry", entityId: "JE-2026-00482", summary: "Submitted month-end allocation journal for visual approval.", source: "Prototype UI", outcome: "Mock only" },
  { id: "AUD-2026-8798", companyId: "CO-MFG-001", timestamp: "2026-08-31T09:42:00+05:00", actorEmployeeId: "EMP-014", module: "Purchases", action: "Submitted", entityType: "Purchase order", entityId: "PO-2026-1842", summary: "Requested CFO approval for prototype purchase order.", source: "Prototype UI", outcome: "Mock only" },
  { id: "AUD-2026-8787", companyId: "CO-MFG-001", timestamp: "2026-08-30T16:30:00+05:00", actorEmployeeId: "EMP-027", module: "Inventory", action: "Updated", entityType: "Goods receipt", entityId: "GRN-2026-0771", summary: "Marked all received quantities as accepted in prototype state.", source: "Prototype UI", outcome: "Mock only" },
  { id: "AUD-2026-8772", companyId: "CO-SVC-001", timestamp: "2026-08-30T11:18:00+05:00", actorEmployeeId: "EMP-022", module: "Sales", action: "Created", entityType: "Credit request", entityId: "CR-2026-0128", summary: "Created temporary customer credit request for review.", source: "Prototype UI", outcome: "Mock only" },
  { id: "AUD-2026-8748", companyId: "CO-SVC-001", timestamp: "2026-08-29T13:06:00+05:00", actorEmployeeId: "EMP-034", module: "Projects", action: "Updated", entityType: "Project", entityId: "PRJ-2026-014", summary: "Updated delivery risk and next milestone.", source: "Prototype UI", outcome: "Success" },
] as const satisfies readonly AuditEventFixture[];

export interface ChartPointFixture {
  label: string;
  value: number;
  comparison?: number;
}

export interface ChartSeriesFixture {
  id: string;
  title: string;
  subtitle: string;
  format: "currency" | "number" | "percent";
  currency?: CurrencyCode;
  primaryLabel: string;
  comparisonLabel?: string;
  points: readonly ChartPointFixture[];
}

export const chartSeries = [
  {
    id: "revenue-trend",
    title: "Revenue trend",
    subtitle: "Monthly recognized revenue — prototype display",
    format: "currency",
    currency: "USD",
    primaryLabel: "FY 2026",
    comparisonLabel: "FY 2025",
    points: [
      { label: "Sep", value: 510000, comparison: 455000 },
      { label: "Oct", value: 580000, comparison: 492000 },
      { label: "Nov", value: 545000, comparison: 510000 },
      { label: "Dec", value: 670000, comparison: 552000 },
      { label: "Jan", value: 640000, comparison: 570000 },
      { label: "Feb", value: 715000, comparison: 603000 },
      { label: "Mar", value: 688000, comparison: 625000 },
      { label: "Apr", value: 760000, comparison: 650000 },
      { label: "May", value: 735000, comparison: 668000 },
      { label: "Jun", value: 810000, comparison: 702000 },
      { label: "Jul", value: 785000, comparison: 720000 },
      { label: "Aug", value: 982000, comparison: 756000 },
    ],
  },
  {
    id: "cash-position",
    title: "Cash position",
    subtitle: "Available cash across prototype entities",
    format: "currency",
    currency: "USD",
    primaryLabel: "Available cash",
    points: [
      { label: "Services", value: 286400 },
      { label: "Trading", value: 178600 },
      { label: "Manufacturing", value: 259800 },
    ],
  },
  {
    id: "order-fulfillment",
    title: "Order fulfillment",
    subtitle: "Completed on time — prototype KPI",
    format: "percent",
    primaryLabel: "On-time fulfillment",
    points: [
      { label: "Mar", value: 86 },
      { label: "Apr", value: 89 },
      { label: "May", value: 88 },
      { label: "Jun", value: 92 },
      { label: "Jul", value: 94 },
      { label: "Aug", value: 93 },
    ],
  },
  {
    id: "production-output",
    title: "Production output",
    subtitle: "Planned and completed units",
    format: "number",
    primaryLabel: "Completed",
    comparisonLabel: "Planned",
    points: [
      { label: "W1", value: 42, comparison: 48 },
      { label: "W2", value: 51, comparison: 52 },
      { label: "W3", value: 47, comparison: 50 },
      { label: "W4", value: 58, comparison: 60 },
    ],
  },
] as const satisfies readonly ChartSeriesFixture[];

export interface GenericTableRow {
  id: string;
  reference: string;
  name: string;
  description: string;
  owner: string;
  date: string;
  status: "Draft" | "Pending" | "Approved" | "Active" | "Completed" | "On hold";
  tone: Tone;
  displayAmount: number;
  currency: CurrencyCode;
  progress: number;
}

export interface GenericRowOptions {
  moduleId: string;
  moduleLabel: string;
  count?: number;
  companyId?: string;
  currency?: CurrencyCode;
  startNumber?: number;
}

const genericStatuses = ["Active", "Pending", "Approved", "Draft", "Completed", "On hold"] as const;
const genericTones: Record<GenericTableRow["status"], Tone> = {
  Active: "success",
  Pending: "warning",
  Approved: "info",
  Draft: "neutral",
  Completed: "success",
  "On hold": "danger",
};
const genericOwners = ["Ayesha Malik", "Bilal Rahman", "Sana Iqbal", "Omar Farooq", "Nadia Javed", "Hamza Ali"] as const;

/** Creates stable, presentation-only list rows for prototype pages without a dedicated dataset. */
export function makeGenericRows({
  moduleId,
  moduleLabel,
  count = 8,
  currency = "USD",
  startNumber = 1,
}: GenericRowOptions): GenericTableRow[] {
  const safeModule = moduleId.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "ITEM";

  return Array.from({ length: count }, (_, index) => {
    const sequence = startNumber + index;
    const status = genericStatuses[index % genericStatuses.length];
    const padded = String(sequence).padStart(4, "0");

    return {
      id: `${safeModule}-${padded}`,
      reference: `${safeModule}-${padded}`,
      name: `${moduleLabel} ${sequence}`,
      description: `Prototype ${moduleLabel.toLowerCase()} record for layout and interaction review.`,
      owner: genericOwners[index % genericOwners.length],
      date: `2026-08-${String(31 - (index % 20)).padStart(2, "0")}`,
      status,
      tone: genericTones[status],
      displayAmount: 1250 + index * 875,
      currency,
      progress: Math.min(100, 18 + index * 11),
    };
  });
}

/** Produces directory-style rows with zero display values for master-data screens. */
export function makeDirectoryRows(moduleId: string, moduleLabel: string, count = 10): GenericTableRow[] {
  return makeGenericRows({ moduleId, moduleLabel, count }).map((row) => ({
    ...row,
    displayAmount: 0,
    progress: row.status === "Completed" ? 100 : row.progress,
  }));
}

/** Produces report rows with completed/active visual states for report catalogues. */
export function makeReportRows(moduleId: string, moduleLabel: string, count = 6): GenericTableRow[] {
  return makeGenericRows({ moduleId: `${moduleId}-report`, moduleLabel, count }).map((row, index) => ({
    ...row,
    name: `${moduleLabel} ${["Summary", "Detail", "Exceptions", "Trends", "Audit", "Forecast"][index % 6]}`,
    status: index % 2 === 0 ? "Active" : "Completed",
    tone: "success",
    displayAmount: 0,
    progress: 100,
  }));
}

export const genericRowGenerators = {
  list: makeGenericRows,
  directory: makeDirectoryRows,
  reports: makeReportRows,
} as const;

export const prototypeFixtures = {
  notice: PROTOTYPE_FIXTURE_NOTICE,
  asOf: prototypeAsOf,
  companyModeOptions,
  roleOptions,
  companies,
  customers,
  suppliers,
  products,
  services,
  accounts,
  invoices,
  salesOrders,
  purchaseRequisitions,
  purchaseOrders,
  goodsReceipts,
  purchaseBills,
  bankTransactions,
  inventory,
  projects,
  employees,
  productionOrders,
  approvals,
  notifications,
  auditEvents,
  chartSeries,
  genericRowGenerators,
} as const;
