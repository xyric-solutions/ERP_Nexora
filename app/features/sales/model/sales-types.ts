/**
 * Sales prototype types. Records live only in the browser session (see
 * sales-store.ts); no Sales, Customer or Revenue API exists yet. The
 * customer shape below is the target for a future Customer API contract.
 */

export type SalesDocumentKind = "quotation" | "order" | "invoice";

/**
 * Quotation lifecycle (meeting of 11 Nov 2026):
 * Draft → (optional) Pending approval → Approved → Ordered (Confirm Order).
 * A named approver can instead reject it or send it back with Changes requested.
 * Without an approver the creator approves it. Only drafts can be deleted;
 * approved, rejected or returned quotations go back to Draft with Reset to Draft.
 */
export type QuotationStatus = "Draft" | "Pending approval" | "Changes requested" | "Approved" | "Rejected" | "Ordered";
/**
 * A sales order only shows whether the customer's order is confirmed. Delivery
 * and invoicing are fulfilment progress (see FulfilmentStage), not order statuses.
 */
export type OrderStatus = "Draft" | "Confirmed";
/** Fulfilment progress of a confirmed order, derived from its delivery and invoice. Items are delivered directly; there is no separate pick & pack. */
export type FulfilmentStage = "Not started" | "Delivered" | "Invoiced";
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

/**
 * A company Project or Location master record (Master Data › Projects /
 * Locations, `/api/v1/master-data/{projects|locations}`), with the code and name
 * captured when it was chosen so lists and documents can show it later.
 */
export interface SalesReference {
  id: string;
  code: string;
  name: string;
}

/**
 * Project and Location required on every Sales transaction (12 Nov 2026).
 * Records created before the rule have neither; they must be given both
 * before they are saved, posted or used to create another transaction.
 */
export interface SalesContextFields {
  project?: SalesReference;
  location?: SalesReference;
}

export interface SalesDelivery extends SalesContextFields {
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

export interface SalesDocument extends SalesContextFields {
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
  /** ISO 4217 currency of the amounts. Missing means the base currency (PKR). */
  currency?: string;
  /** PKR per 1 unit of `currency` (1 for PKR). Converts amounts for customer balances and credit. */
  fxRate?: number;
  lines: SalesLine[];
  notes: string;
  status: SalesDocumentStatus;
  links: SalesDocumentLinks;
  delivery?: SalesDelivery;
  /** Quotations only: optional named approver. Empty means the creator approves it. */
  approver?: string;
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

export type ReceiptSource = "Invoice" | "Manual" | "Batch";

/**
 * Money documents on the Receipts page (Add New menu):
 * - Receipt (RCT-): money received from a customer, allocated to invoices;
 *   any amount not allocated stays on account.
 * - Customer payment (CPY-): money paid to a customer, e.g. a security deposit,
 *   an advance or a tender fee.
 * - Return receipt (RRC-): refunds or reverses part of a posted receipt.
 * - Return payment (RPY-): the customer returns part of a customer payment.
 */
export type MoneyDocType = "Receipt" | "Customer payment" | "Return receipt" | "Return payment";
export type MoneyDocStatus = "Draft" | "Posted";

export interface CustomerReceipt extends SalesContextFields {
  id: string;
  code: string;
  type: MoneyDocType;
  customerId: string;
  owner: string;
  date: string;
  method: string;
  account: string;
  reference: string;
  /** Amount in `currency`. */
  amount: number;
  /** ISO 4217 currency of the amount and allocations; allocations go only to invoices in the same currency. Missing means the base currency (PKR). */
  currency?: string;
  /** PKR per 1 unit of `currency` (1 for PKR). Converts amounts for customer balances and credit. */
  fxRate?: number;
  /**
   * Receipt: amounts applied to invoices. Return receipt: allocations it
   * reverses (the rest of its amount comes off the on-account balance).
   */
  alloc: ReceiptAllocation[];
  /** Return receipt / return payment: the receipt or customer payment it returns. */
  against?: string;
  /** Customer payment: why the money was paid, e.g. Security deposit. */
  purpose?: string;
  note?: string;
  /** Only posted documents change invoice balances. */
  status: MoneyDocStatus;
  /**
   * Where the document was recorded: "Invoice" for receipts created from an
   * invoice, "Manual" on the Receipts page, "Batch" from a Batch entry.
   */
  source?: ReceiptSource;
  history: SalesHistoryEntry[];
}

/** One returned line of a sales return, priced as on the invoice. */
export interface SalesReturnLine {
  sku: string;
  desc: string;
  qty: number;
  rate: number;
  tax: number;
  uom: string;
}

/** Sale Return recorded from an opened invoice. Its value is credited to that invoice. */
export interface SalesReturn extends SalesContextFields {
  id: string;
  code: string;
  customerId: string;
  invoice: string;
  date: string;
  lines: SalesReturnLine[];
  reason: string;
  status: "Recorded";
  history: SalesHistoryEntry[];
}

/**
 * New templates are Weekly or Monthly. Quarterly and Annually remain only so
 * existing schedules keep working.
 */
export type RecurringFrequency = "Weekly" | "Monthly" | "Quarterly" | "Annually";
/** Single: one customer. Batch: one template invoicing several customers with the same lines. */
export type RecurringScope = "Single" | "Batch";

/**
 * Recurring invoice template (RB-). Create Invoice opens the normal invoice
 * form prefilled from it; Save and Post issues the invoice. When every
 * customer on the template has been invoiced for the current period, the
 * next invoice date moves on by one week or month.
 */
export interface RecurringBill extends SalesContextFields {
  id: string;
  code: string;
  scope: RecurringScope;
  /** What is billed, e.g. "Maintenance contract · monthly instalment". */
  name: string;
  /** One customer for a Single template; one or more for a Batch template. */
  customerIds: string[];
  lines: SalesLine[];
  /** ISO 4217 currency of the line rates. Missing means the base currency (PKR). */
  currency?: string;
  /** PKR per 1 unit of `currency` (1 for PKR). */
  fxRate?: number;
  /** Copied to each invoice's customer reference, followed by the period date. */
  reference: string;
  /** Printed on each invoice. */
  notes: string;
  frequency: RecurringFrequency;
  /** Invoice date of the current (next due) period, ISO. */
  next: string;
  status: "Active" | "Paused";
  /** Customers already invoiced for the current period: customer id → invoice code. */
  billed: Record<string, string>;
  history: SalesHistoryEntry[];
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
