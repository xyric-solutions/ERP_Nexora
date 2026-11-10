/**
 * Sales prototype types. Records live only in the browser session (see
 * sales-store.ts); no Sales, Customer or Revenue API exists yet. The
 * customer shape below is the target for a future Customer API contract.
 */

export type SalesDocumentKind = "quotation" | "order" | "invoice";

/**
 * Quotation lifecycle: Open → Pending approval → Approved → Ordered.
 * A reviewer can instead reject it or send it back with Changes requested.
 */
export type QuotationStatus = "Open" | "Pending approval" | "Changes requested" | "Approved" | "Rejected" | "Ordered";
/** Saved (direct orders only) → Confirmed → Packed → Delivered → Invoiced. No order-level approval. */
export type OrderStatus = "Saved" | "Confirmed" | "Packed" | "Delivered" | "Invoiced";
export type InvoiceStatus = "Unpaid" | "Partially paid" | "Paid";
export type SalesDocumentStatus = QuotationStatus | OrderStatus | InvoiceStatus;

export interface SalesLine {
  sku: string;
  desc: string;
  qty: number;
  rate: number;
  /** Sales tax percentage applied to the line. */
  tax: number;
  uom: string;
}

export interface SalesHistoryEntry {
  step: string;
  at: string;
  by: string;
  note?: string;
}

export type ApprovalDecision = "Approved" | "Rejected" | "Changes requested";

/** One entry in a quotation's approval history: a submission or a reviewer's decision. */
export interface ApprovalEntry {
  action: "Submitted" | ApprovalDecision;
  /** Person who submitted or decided. */
  by: string;
  /** Capacity they acted in, e.g. CEO or Sales Manager. Empty for submissions. */
  role: string;
  at: string;
  note: string;
}

/** Pick & pack record for an order, saved before (or together with) the delivery. */
export interface SalesPickPack {
  packages: number;
  packedBy: string;
  notes: string;
  at: string;
  by: string;
}

export interface SalesDelivery {
  no: string;
  date: string;
  warehouse: string;
  receivedBy: string;
  notes: string;
  at: string;
  by: string;
}

export interface SalesDocumentLinks {
  quotation?: string;
  order?: string;
  invoice?: string;
  recurring?: string;
}

export interface SalesDocument {
  id: string;
  code: string;
  kind: SalesDocumentKind;
  customerId: string;
  owner: string;
  /** Quotation, order or invoice date (ISO). */
  date: string;
  /** Valid until, delivery date or due date (ISO). */
  date2: string;
  terms: string;
  reference: string;
  warehouse: string;
  lines: SalesLine[];
  notes: string;
  status: SalesDocumentStatus;
  links: SalesDocumentLinks;
  pickPack?: SalesPickPack;
  delivery?: SalesDelivery;
  /** Quotations only: submissions and approval decisions, oldest first. */
  approval?: ApprovalEntry[];
  history: SalesHistoryEntry[];
}

/**
 * A document attached in the browser. Prototype only: the file stays in this
 * browser session (object URL) and is never uploaded to the files service.
 */
export interface CustomerAttachment {
  id: string;
  /** What the file is, e.g. "Tax registration certificate". */
  category: string;
  name: string;
  size: number;
  type: string;
  url: string;
  addedAt: string;
  addedBy: string;
}

export interface CustomerBankAccount {
  id: string;
  bankName: string;
  holder: string;
  accountNumber: string;
  iban: string;
  swift: string;
  branchName: string;
  branchCode: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  address: string;
  /** ISO 4217. */
  currency: string;
  accountType: string;
}

export interface PostalAddress {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

export interface CustomerIdentification {
  id: string;
  type: string;
  number: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** ISO date; empty when the document does not expire. */
  expiry: string;
}

export type CustomerType = "Company" | "Individual" | "Partnership" | "Sole proprietor" | "Government" | "Non-profit";
export type TaxRegistration = "Registered" | "Unregistered" | "Exempt" | "Non-resident";
export type CreditStatus = "Good standing" | "Under review" | "On hold" | "Blocked";

export interface SalesCustomer {
  id: string;
  code: string;
  /* Overview: the only mandatory section. */
  name: string;
  display: string;
  type: CustomerType;
  status: "Active" | "Inactive";
  industry: string;
  salesperson: string;
  /* Contact details (optional). */
  contactName: string;
  contactRole: string;
  email: string;
  /** ISO alpha-2 of the phone's calling code. */
  phoneCountry: string;
  /** National number, without the calling code. */
  phone: string;
  /** Free-form; may include its own +code. */
  mobile: string;
  website: string;
  /* Addresses (optional). */
  billing: PostalAddress;
  shipSame: boolean;
  shipping: PostalAddress;
  /* Tax details (optional). */
  taxRegistration: TaxRegistration;
  ntn: string;
  strn: string;
  tin: string;
  vatNumber: string;
  withholding: boolean;
  taxExemption: string;
  identifications: CustomerIdentification[];
  /* Payment terms & credit (optional). */
  terms: string;
  customTerms: string;
  dueDays: number;
  priceList: string;
  /** Base-currency (PKR) credit limit; 0 means no limit set. */
  creditLimit: number;
  /** Receivable carried in from before Nexora, in PKR. Counts in the open balance. */
  openingBalance: number;
  openingBalanceDate: string;
  paymentMethod: string;
  currency: string;
  advance: "Not required" | "Partial advance" | "Full advance";
  advancePercent: number;
  lateTerms: string;
  earlyDiscountPercent: number;
  earlyDiscountDays: number;
  taxTreatment: string;
  creditStatus: CreditStatus;
  creditReview: string;
  creditNote: string;
  banks: CustomerBankAccount[];
  /* Notes (optional). */
  notes: string;
  internalComments: string;
  instructions: string;
  requirements: string;
  importantInfo: string;
  attachments: CustomerAttachment[];
  history: SalesHistoryEntry[];
}

export interface ReceiptAllocation {
  inv: string;
  amount: number;
}

export interface CustomerReceipt {
  id: string;
  code: string;
  customerId: string;
  owner: string;
  date: string;
  method: string;
  account: string;
  reference: string;
  amount: number;
  alloc: ReceiptAllocation[];
  status: "Recorded";
  history: SalesHistoryEntry[];
}

export interface SalesReturn {
  id: string;
  code: string;
  customerId: string;
  invoice: string;
  date: string;
  item: string;
  qty: number;
  reason: string;
  status: "Pending approval" | "Approved" | "Rejected";
  history: SalesHistoryEntry[];
}

export interface RecurringBill {
  id: string;
  code: string;
  customerId: string;
  desc: string;
  sku: string;
  qty: number;
  rate: number;
  tax: number;
  frequency: "Monthly" | "Quarterly" | "Annually";
  next: string;
  status: "Active" | "Paused";
}

export interface SalesNotification {
  id: string;
  /** Person the notification is for (the quotation creator). */
  to: string;
  title: string;
  message: string;
  /** Record the notification opens. */
  code: string;
  tone: "success" | "warning" | "danger" | "info";
  at: string;
  read: boolean;
}

export interface SalesState {
  customers: SalesCustomer[];
  quotation: SalesDocument[];
  order: SalesDocument[];
  invoice: SalesDocument[];
  receipt: CustomerReceipt[];
  returns: SalesReturn[];
  recurring: RecurringBill[];
  /** In-app notifications, e.g. telling a quotation's creator who approved it. */
  notifications: SalesNotification[];
}
