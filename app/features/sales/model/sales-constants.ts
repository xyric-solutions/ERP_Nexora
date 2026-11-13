import type { MoneyDocType, SalesDocumentKind } from "./sales-types";

export const SALES_TERMS = ["Due on receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90"] as const;
export const SALES_TERM_DAYS: Record<string, number> = {
  "Due on receipt": 0,
  "Net 7": 7,
  "Net 15": 15,
  "Net 30": 30,
  "Net 45": 45,
  "Net 60": 60,
  "Net 90": 90,
};

/* ------------------------------------------------------- customer options */

export const CUSTOM_TERMS = "Custom terms";
export const CUSTOMER_TERMS = [...SALES_TERMS, CUSTOM_TERMS] as const;
export const CUSTOMER_TYPES = ["Company", "Individual", "Partnership", "Sole proprietor", "Government", "Non-profit"] as const;
export const TAX_REGISTRATIONS = ["Registered", "Unregistered", "Exempt", "Non-resident"] as const;
export const TAX_TREATMENTS = [
  "Standard-rated",
  "Reduced rate",
  "Zero-rated (export)",
  "Exempt supplies",
  "Reverse charge",
  "Outside the scope of tax",
] as const;
export const IDENTIFICATION_TYPES = [
  "CNIC",
  "National identity number",
  "Passport",
  "Business registration number",
  "Trade licence",
  "Other government-issued ID",
] as const;
export const CREDIT_STATUSES = ["Good standing", "Under review", "On hold", "Blocked"] as const;
export const ADVANCE_OPTIONS = ["Not required", "Partial advance", "Full advance"] as const;
export const BANK_ACCOUNT_TYPES = ["Current", "Savings", "Business", "Foreign currency", "Escrow", "Other"] as const;
export const CUSTOMER_ATTACHMENT_CATEGORIES = [
  "Tax registration certificate",
  "Identification document",
  "Digital signature",
  "Contract or agreement",
  "Other supporting document",
] as const;
export const SALES_WAREHOUSES = ["Main Warehouse · Lahore", "Karachi Depot"] as const;
export const RECEIPT_ACCOUNTS = ["Meezan Bank · Current 0101-2231", "HBL · Collections 4412-0098"] as const;
export const RECEIPT_METHODS = ["Bank transfer", "Cheque", "Cash", "Online payment"] as const;
export const SALESPEOPLE = ["Sana Malik", "Usman Tariq", "Ali Raza"] as const;
/** Capacities a reviewer can approve a quotation in. Recorded as "Approved by <name> (<role>)". */
export const APPROVER_ROLES = ["CEO", "Sales Manager", "Finance Manager", "Director"] as const;
export const PRICE_LISTS = ["Standard", "Distributor", "Key account"] as const;

export interface CatalogItem {
  sku: string;
  name: string;
  uom: string;
  rate: number;
  tax: number;
}

/** Standard price list. Sales tax: 18% goods, 16% services. */
export const SALES_CATALOG: readonly CatalogItem[] = [
  { sku: "SRV-220", name: "Industrial Servo Motor SM-220", uom: "Each", rate: 185000, tax: 18 },
  { sku: "CPA-110", name: "Control Panel Assembly CP-110", uom: "Each", rate: 420000, tax: 18 },
  { sku: "HPM-045", name: "Hydraulic Pump HP-45", uom: "Each", rate: 96500, tax: 18 },
  { sku: "INS-HRS", name: "Installation & Commissioning", uom: "Hour", rate: 6500, tax: 16 },
  { sku: "AMC-STD", name: "Annual Maintenance Contract", uom: "Year", rate: 360000, tax: 16 },
];

export interface SalesKindMeta {
  label: string;
  plural: string;
  pageId: string;
  prefix: string;
  date1: string;
  date2: string;
  date2Days: number;
  referenceLabel: string;
  lifecycle: readonly string[];
  saveLabel: string;
  statuses: readonly string[];
  description: string;
}

export const SALES_KINDS: Record<SalesDocumentKind, SalesKindMeta> = {
  quotation: {
    label: "Quotation",
    plural: "Quotations",
    pageId: "quotations",
    prefix: "QTN",
    date1: "Quotation date",
    date2: "Valid until",
    date2Days: 30,
    referenceLabel: "Customer RFQ / reference",
    lifecycle: ["Draft", "Approved", "Order confirmed"],
    saveLabel: "Save",
    statuses: ["Draft", "Pending approval", "Changes requested", "Approved", "Rejected", "Ordered"],
    description:
      "A quotation is a price offered to a customer, not yet an order. Choose an approver to send it for approval, or leave the approver empty and approve it yourself. Open an approved quotation and click Confirm Order when the customer orders.",
  },
  order: {
    label: "Sales Order",
    plural: "Sales Orders",
    pageId: "sales-orders",
    prefix: "SO",
    date1: "Order date",
    date2: "Delivery date",
    date2Days: 14,
    referenceLabel: "Customer PO number",
    lifecycle: ["Draft", "Confirmed"],
    saveLabel: "Save",
    statuses: ["Draft", "Confirmed"],
    description: "Orders the customer has confirmed. Confirm Order on an approved quotation creates one; direct orders are confirmed here. Fulfilment then moves through Delivery and Invoice.",
  },
  invoice: {
    label: "Invoice",
    plural: "Invoices",
    pageId: "invoices",
    prefix: "INV",
    date1: "Invoice date",
    date2: "Due date",
    date2Days: 30,
    referenceLabel: "Customer PO / reference",
    lifecycle: ["Issued", "Paid"],
    saveLabel: "Save invoice",
    statuses: ["Unpaid", "Partially paid", "Overdue", "Paid"],
    description: "Sales tax invoices. Click an invoice to see its details, payment history and returns. Add New › Sale Return records goods returned against an invoice. Payments are recorded in Receipts, where outstanding invoices are listed automatically for allocation.",
  },
};

/** Page ids owned by the sales feature, per prototype module. */
export const SALES_MODULE_PAGES: Record<string, readonly string[]> = {
  sales: [
    "quotations",
    "sales-orders",
    "pick-pack-delivery",
    "invoices",
    "recurring-bills",
    "receipts",
    "customers",
  ],
};

/** Fulfilment progress of a confirmed sales order, shown beside its order status. */
export const FULFILMENT_STAGES = ["Not started", "Delivered", "Invoiced"] as const;

/* ---------------------------------------------------- receipts & payments */

export interface MoneyDocMeta {
  type: MoneyDocType;
  /** Menu and title label. */
  label: string;
  plural: string;
  prefix: string;
  description: string;
  /** Wording for the money direction in forms, e.g. "Amount received". */
  amountLabel: string;
}

/** Add New on the Receipts page. Codes keep RCT- for receipts and add new prefixes for the rest. */
export const MONEY_DOC_TYPES: readonly MoneyDocMeta[] = [
  {
    type: "Receipt",
    label: "Receipt",
    plural: "Receipts",
    prefix: "RCT",
    description: "Money received from a customer, allocated against their outstanding invoices. Anything not allocated stays on account.",
    amountLabel: "Amount received",
  },
  {
    type: "Customer payment",
    label: "Customer Payment",
    plural: "Customer Payments",
    prefix: "CPY",
    description: "Money paid to a customer, such as a security deposit, an advance or a tender fee.",
    amountLabel: "Amount paid",
  },
  {
    type: "Return receipt",
    label: "Return Receipt",
    plural: "Return Receipts",
    prefix: "RRC",
    description: "Refunds or reverses part or all of a posted receipt, for example a refund or a bounced cheque. Reversed allocations reopen the invoice balances.",
    amountLabel: "Amount returned",
  },
  {
    type: "Return payment",
    label: "Return Payment",
    plural: "Return Payments",
    prefix: "RPY",
    description: "The customer returns part or all of a customer payment, for example a refunded security deposit.",
    amountLabel: "Amount returned",
  },
];

export const moneyDocMeta = (type: MoneyDocType): MoneyDocMeta => MONEY_DOC_TYPES.find((meta) => meta.type === type) ?? MONEY_DOC_TYPES[0];

export const PAYMENT_PURPOSES = ["Security deposit", "Advance", "Tender fee", "Refund of overpayment", "Other"] as const;
