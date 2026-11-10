/**
 * Sample sales records for the prototype. Invented fixtures only: they are
 * never sent to the API and reset when the browser session reloads.
 */

import { RECEIPT_ACCOUNTS, SALES_CATALOG, SALES_WAREHOUSES } from "./sales-constants";
import { blankCustomer, emptyAddress, newBankAccount } from "./customer-model";
import type { ApprovalEntry, CustomerBankAccount, PostalAddress, SalesCustomer, SalesHistoryEntry, SalesLine, SalesState } from "./sales-types";

function customer(fields: Partial<SalesCustomer>): SalesCustomer {
  return { ...blankCustomer(), ...fields };
}

function address(line1: string, city: string, region: string, postal: string, line2 = ""): PostalAddress {
  return { ...emptyAddress("PK"), line1, line2, city, region, postal };
}

function bank(id: string, bankName: string, holder: string, iban: string, swift: string, branchName: string): CustomerBankAccount {
  return { ...newBankAccount(holder), id, bankName, iban, swift, branchName, accountNumber: iban.slice(-16) };
}

function line(sku: string, qty: number): SalesLine {
  const item = SALES_CATALOG.find((candidate) => candidate.sku === sku);
  if (!item) throw new Error(`Unknown catalogue item ${sku}`);
  return { sku, desc: item.name, qty, rate: item.rate, tax: item.tax, uom: item.uom };
}

function history(...rows: [string, string, string, string?][]): SalesHistoryEntry[] {
  return rows.map(([step, at, by, note]) => ({ step, at, by, note: note ?? "" }));
}

function approval(...rows: [ApprovalEntry["action"], string, string, string, string?][]): ApprovalEntry[] {
  return rows.map(([action, at, by, role, note]) => ({ action, at, by, role, note: note ?? "" }));
}

const SANA = "Sana Malik";
const USMAN = "Usman Tariq";
const ALI = "Ali Raza";
const HIRA = "Hira Qureshi";
const BILAL = "Bilal Ahmed";
const IMRAN = "Imran Sheikh";
const FARAH = "Farah Khan";
const [LAHORE, KARACHI] = SALES_WAREHOUSES;

export function createSalesSeed(): SalesState {
  return {
    notifications: [
      { id: "n2", to: ALI, title: "Changes requested on QTN-007", message: "Farah Khan (Sales Manager) on 09 Nov 2026 asked for changes: Add installation hours and confirm delivery lead time.", code: "QTN-007", tone: "warning", at: "09 Nov 2026, 17:25", read: false },
      { id: "n1", to: SANA, title: "QTN-006 approved", message: "Approved by Imran Sheikh (CEO) on 09 Nov 2026. Sales order SO-007 for Atlas Engineering is confirmed and in Pick, Pack & Delivery.", code: "QTN-006", tone: "success", at: "09 Nov 2026, 10:05", read: false },
    ],
    customers: [
      customer({
        id: "c1", code: "CUS-001", name: "Atlas Engineering (Pvt) Ltd", display: "Atlas Engineering",
        industry: "Industrial manufacturing", salesperson: SANA, contactName: "Kamran Javed", contactRole: "Procurement Manager",
        email: "procurement@atlas-eng.example", phone: "42 3575 1100", mobile: "+92 300 845 1120", website: "atlas-eng.example",
        billing: address("Plot 14, Sundar Industrial Estate", "Lahore", "Punjab", "54000"),
        taxRegistration: "Registered", ntn: "4512876-3", strn: "03-01-9876-543-21", withholding: true,
        terms: "Net 30", dueDays: 30, priceList: "Key account", creditLimit: 5000000, creditReview: "2027-03-31",
        creditNote: "Limit reviewed with the CFO in Sep 2026.",
        banks: [bank("b1", "Meezan Bank", "Atlas Engineering (Pvt) Ltd", "PK75MEZN0001020103456789", "MEZNPKKA", "Gulberg Branch, Lahore")],
        instructions: "Deliveries before 2 pm only.", history: history(["Created", "02 Feb 2026, 11:20", SANA]),
      }),
      customer({
        id: "c2", code: "CUS-002", name: "Crescent Holdings Ltd", display: "Crescent Holdings",
        industry: "Trading & distribution", salesperson: SANA, contactName: "Ayesha Siddiqui", contactRole: "Finance Controller",
        email: "accounts@crescent.example", phone: "21 3456 7788", mobile: "+92 321 220 4410", website: "crescent.example",
        billing: address("Office 702, Ocean Tower", "Karachi", "Sindh", "75600", "Clifton Block 9"),
        shipSame: false, shipping: address("Warehouse 4, Port Qasim Industrial Zone", "Karachi", "Sindh", "75020"),
        taxRegistration: "Registered", ntn: "3398120-6", strn: "32-77-8761-221-90", withholding: true,
        terms: "Net 45", dueDays: 45, priceList: "Distributor", creditLimit: 1500000, openingBalance: 185000, openingBalanceDate: "2026-07-01",
        creditStatus: "Under review", creditReview: "2026-12-31", creditNote: "Temporary increase requested; not approved.",
        banks: [bank("b2", "HBL", "Crescent Holdings Ltd", "PK72HABB0012345678901234", "HABBPKKA", "Clifton Branch, Karachi")],
        requirements: "Customer PO number must appear on every invoice.", history: history(["Created", "14 Mar 2026, 09:05", USMAN, "Opening balance PKR 185,000.00"]),
      }),
      customer({
        id: "c3", code: "CUS-003", name: "Indus Textile Mills Ltd", display: "Indus Textile",
        industry: "Textiles", salesperson: ALI, contactName: "Faisal Rana", contactRole: "Plant Engineer",
        email: "engineering@industex.example", phone: "41 871 2290",
        billing: address("Sargodha Road, Industrial Area", "Faisalabad", "Punjab", "38000"),
        taxRegistration: "Registered", ntn: "2287345-1", strn: "17-00-3344-556-77", withholding: true,
        terms: "Net 30", dueDays: 30, creditLimit: 3000000, creditReview: "2027-01-31",
        banks: [bank("b3", "UBL", "Indus Textile Mills Ltd", "PK67UNIL0109000212345678", "UNILPKKA", "Faisalabad Main")],
        history: history(["Created", "21 Apr 2026, 15:42", ALI]),
      }),
      customer({
        id: "c4", code: "CUS-004", name: "Margalla Foods (Pvt) Ltd", display: "Margalla Foods",
        industry: "Food processing", salesperson: USMAN, contactName: "Nadia Hussain", contactRole: "Operations Head",
        email: "ops@margallafoods.example", phone: "51 260 1188", mobile: "+92 333 510 7720", website: "margallafoods.example",
        billing: address("Plot 31, I-9/2 Industrial Area", "Islamabad", "Islamabad Capital Territory", "44000"),
        taxRegistration: "Registered", ntn: "5530987-2", terms: "Net 15", dueDays: 15, creditLimit: 1200000, creditReview: "2027-06-30",
        banks: [bank("b4", "Bank Alfalah", "Margalla Foods (Pvt) Ltd", "PK25ALFH0034001006543210", "ALFHPKKA", "I-9 Markaz, Islamabad")],
        notes: "Maintenance contract customer, billed monthly.", history: history(["Created", "05 Jun 2026, 10:10", USMAN]),
      }),
    ],
    quotation: [
      { id: "q1", code: "QTN-001", kind: "quotation", customerId: "c1", owner: SANA, date: "2026-10-20", date2: "2026-11-19", terms: "Net 30", reference: "RFQ AE-2210", warehouse: LAHORE, lines: [line("SRV-220", 4), line("INS-HRS", 16)], notes: "", status: "Ordered", links: { order: "SO-001", invoice: "INV-001" },
        approval: approval(["Submitted", "20 Oct 2026, 10:10", SANA, ""], ["Approved", "21 Oct 2026, 09:30", IMRAN, "CEO", "Key account pricing confirmed."]),
        history: history(["Saved", "20 Oct 2026, 10:05", SANA], ["Pending approval", "20 Oct 2026, 10:10", SANA, "Submitted for approval"], ["Approved", "21 Oct 2026, 09:30", IMRAN, "By Imran Sheikh (CEO)"], ["Ordered", "23 Oct 2026, 15:12", SANA, "Sales order SO-001"]) },
      { id: "q2", code: "QTN-002", kind: "quotation", customerId: "c2", owner: SANA, date: "2026-10-24", date2: "2026-11-23", terms: "Net 45", reference: "PO CH-5490", warehouse: LAHORE, lines: [line("CPA-110", 2)], notes: "", status: "Ordered", links: { order: "SO-002" },
        approval: approval(["Submitted", "24 Oct 2026, 12:35", SANA, ""], ["Approved", "25 Oct 2026, 11:05", FARAH, "Sales Manager"]),
        history: history(["Saved", "24 Oct 2026, 12:30", SANA], ["Pending approval", "24 Oct 2026, 12:35", SANA, "Submitted for approval"], ["Approved", "25 Oct 2026, 11:05", FARAH, "By Farah Khan (Sales Manager)"], ["Ordered", "27 Oct 2026, 10:44", SANA, "Sales order SO-002"]) },
      { id: "q3", code: "QTN-003", kind: "quotation", customerId: "c3", owner: ALI, date: "2026-10-28", date2: "2026-11-27", terms: "Net 30", reference: "RFQ IT-118", warehouse: LAHORE, lines: [line("HPM-045", 6), line("INS-HRS", 10)], notes: "", status: "Ordered", links: { order: "SO-003" },
        approval: approval(["Submitted", "28 Oct 2026, 14:45", ALI, ""], ["Changes requested", "29 Oct 2026, 10:20", FARAH, "Sales Manager", "Reduce commissioning to 10 hours."], ["Submitted", "29 Oct 2026, 16:00", ALI, ""], ["Approved", "30 Oct 2026, 09:15", IMRAN, "CEO"]),
        history: history(["Saved", "28 Oct 2026, 14:40", ALI], ["Pending approval", "28 Oct 2026, 14:45", ALI, "Submitted for approval"], ["Changes requested", "29 Oct 2026, 10:20", FARAH, "By Farah Khan (Sales Manager) · Reduce commissioning to 10 hours."], ["Edited", "29 Oct 2026, 15:55", ALI], ["Pending approval", "29 Oct 2026, 16:00", ALI, "Resubmitted after changes"], ["Approved", "30 Oct 2026, 09:15", IMRAN, "By Imran Sheikh (CEO)"], ["Ordered", "03 Nov 2026, 11:08", ALI, "Sales order SO-003"]) },
      { id: "q4", code: "QTN-004", kind: "quotation", customerId: "c4", owner: USMAN, date: "2026-11-04", date2: "2026-12-04", terms: "Net 15", reference: "Email of 04 Nov", warehouse: LAHORE, lines: [line("SRV-220", 1), line("INS-HRS", 8)], notes: "Includes on-site commissioning at the I-9 plant.", status: "Pending approval", links: {},
        approval: approval(["Submitted", "04 Nov 2026, 16:40", USMAN, ""]),
        history: history(["Saved", "04 Nov 2026, 16:31", USMAN], ["Pending approval", "04 Nov 2026, 16:40", USMAN, "Submitted for approval"]) },
      { id: "q5", code: "QTN-005", kind: "quotation", customerId: "c2", owner: SANA, date: "2026-11-07", date2: "2026-12-07", terms: "Net 45", reference: "RFQ CH-5531", warehouse: LAHORE, lines: [line("CPA-110", 1), line("SRV-220", 2)], notes: "", status: "Open", links: {}, history: history(["Saved", "07 Nov 2026, 10:15", SANA]) },
      { id: "q6", code: "QTN-006", kind: "quotation", customerId: "c1", owner: SANA, date: "2026-11-08", date2: "2026-12-08", terms: "Net 30", reference: "RFQ AE-2264", warehouse: LAHORE, lines: [line("HPM-045", 2), line("INS-HRS", 6)], notes: "", status: "Ordered", links: { order: "SO-007" },
        approval: approval(["Submitted", "08 Nov 2026, 11:20", SANA, ""], ["Approved", "09 Nov 2026, 10:05", IMRAN, "CEO"]),
        history: history(["Saved", "08 Nov 2026, 11:12", SANA], ["Pending approval", "08 Nov 2026, 11:20", SANA, "Submitted for approval"], ["Approved", "09 Nov 2026, 10:05", IMRAN, "By Imran Sheikh (CEO)"], ["Ordered", "09 Nov 2026, 10:05", IMRAN, "Sales order SO-007 confirmed"]) },
      { id: "q7", code: "QTN-007", kind: "quotation", customerId: "c3", owner: ALI, date: "2026-11-09", date2: "2026-12-09", terms: "Net 30", reference: "RFQ IT-131", warehouse: LAHORE, lines: [line("SRV-220", 3)], notes: "", status: "Changes requested", links: {},
        approval: approval(["Submitted", "09 Nov 2026, 12:00", ALI, ""], ["Changes requested", "09 Nov 2026, 17:25", FARAH, "Sales Manager", "Add installation hours and confirm delivery lead time."]),
        history: history(["Saved", "09 Nov 2026, 11:48", ALI], ["Pending approval", "09 Nov 2026, 12:00", ALI, "Submitted for approval"], ["Changes requested", "09 Nov 2026, 17:25", FARAH, "By Farah Khan (Sales Manager) · Add installation hours and confirm delivery lead time."]) },
    ],
    order: [
      { id: "o1", code: "SO-001", kind: "order", customerId: "c1", owner: SANA, date: "2026-10-23", date2: "2026-10-29", terms: "Net 30", reference: "RFQ AE-2210", warehouse: LAHORE, lines: [line("SRV-220", 4), line("INS-HRS", 16)], notes: "", status: "Invoiced", links: { quotation: "QTN-001", invoice: "INV-001" }, pickPack: { packages: 3, packedBy: HIRA, notes: "", at: "27 Oct 2026, 17:40", by: HIRA }, delivery: { no: "DLV-001", date: "2026-10-28", warehouse: LAHORE, receivedBy: "Kamran Javed", notes: "", at: "28 Oct 2026, 13:10", by: HIRA }, history: history(["Confirmed", "23 Oct 2026, 15:12", SANA, "From QTN-001"], ["Packed", "27 Oct 2026, 17:40", HIRA, "3 package(s)"], ["Delivered", "28 Oct 2026, 13:10", HIRA, "Delivery DLV-001"], ["Invoiced", "30 Oct 2026, 10:02", BILAL, "Invoice INV-001"]) },
      { id: "o2", code: "SO-002", kind: "order", customerId: "c2", owner: SANA, date: "2026-10-27", date2: "2026-11-08", terms: "Net 45", reference: "PO CH-5490", warehouse: KARACHI, lines: [line("CPA-110", 2)], notes: "", status: "Delivered", links: { quotation: "QTN-002" }, pickPack: { packages: 2, packedBy: HIRA, notes: "Crated", at: "07 Nov 2026, 15:10", by: HIRA }, delivery: { no: "DLV-002", date: "2026-11-08", warehouse: KARACHI, receivedBy: "Ayesha Siddiqui", notes: "Delivered to Port Qasim warehouse.", at: "08 Nov 2026, 16:20", by: HIRA }, history: history(["Confirmed", "27 Oct 2026, 10:44", SANA, "From QTN-002"], ["Packed", "07 Nov 2026, 15:10", HIRA, "2 package(s)"], ["Delivered", "08 Nov 2026, 16:20", HIRA, "Delivery DLV-002"]) },
      { id: "o3", code: "SO-003", kind: "order", customerId: "c3", owner: ALI, date: "2026-11-03", date2: "2026-11-17", terms: "Net 30", reference: "RFQ IT-118", warehouse: LAHORE, lines: [line("HPM-045", 6), line("INS-HRS", 10)], notes: "", status: "Confirmed", links: { quotation: "QTN-003" }, history: history(["Confirmed", "03 Nov 2026, 11:08", ALI, "From QTN-003"]) },
      { id: "o4", code: "SO-004", kind: "order", customerId: "c2", owner: SANA, date: "2026-11-06", date2: "2026-11-20", terms: "Net 45", reference: "PO CH-5512", warehouse: KARACHI, lines: [line("HPM-045", 3)], notes: "", status: "Confirmed", links: {}, history: history(["Saved", "06 Nov 2026, 09:50", SANA], ["Confirmed", "06 Nov 2026, 10:02", SANA]) },
      { id: "o5", code: "SO-005", kind: "order", customerId: "c4", owner: USMAN, date: "2026-10-30", date2: "2026-11-04", terms: "Net 15", reference: "PO MF-0911", warehouse: LAHORE, lines: [line("SRV-220", 1), line("INS-HRS", 6)], notes: "", status: "Invoiced", links: { invoice: "INV-002" }, pickPack: { packages: 1, packedBy: HIRA, notes: "", at: "03 Nov 2026, 16:00", by: HIRA }, delivery: { no: "DLV-003", date: "2026-11-04", warehouse: LAHORE, receivedBy: "Nadia Hussain", notes: "", at: "04 Nov 2026, 11:50", by: HIRA }, history: history(["Saved", "30 Oct 2026, 11:00", USMAN], ["Confirmed", "30 Oct 2026, 11:05", USMAN], ["Packed", "03 Nov 2026, 16:00", HIRA, "1 package(s)"], ["Delivered", "04 Nov 2026, 11:50", HIRA, "Delivery DLV-003"], ["Invoiced", "04 Nov 2026, 15:30", BILAL, "Invoice INV-002"]) },
      { id: "o6", code: "SO-006", kind: "order", customerId: "c3", owner: ALI, date: "2026-11-09", date2: "2026-11-23", terms: "Net 30", reference: "PO IT-2290", warehouse: LAHORE, lines: [line("HPM-045", 2)], notes: "", status: "Saved", links: {}, history: history(["Saved", "09 Nov 2026, 17:10", ALI]) },
      { id: "o7", code: "SO-007", kind: "order", customerId: "c1", owner: SANA, date: "2026-11-09", date2: "2026-11-23", terms: "Net 30", reference: "RFQ AE-2264", warehouse: LAHORE, lines: [line("HPM-045", 2), line("INS-HRS", 6)], notes: "", status: "Packed", links: { quotation: "QTN-006" }, pickPack: { packages: 2, packedBy: HIRA, notes: "Pumps on one pallet", at: "10 Nov 2026, 09:40", by: HIRA }, history: history(["Confirmed", "09 Nov 2026, 10:05", IMRAN, "From QTN-006 · approved by Imran Sheikh (CEO)"], ["Packed", "10 Nov 2026, 09:40", HIRA, "2 package(s) · packed by Hira Qureshi"]) },
    ],
    invoice: [
      { id: "i1", code: "INV-001", kind: "invoice", customerId: "c1", owner: BILAL, date: "2026-10-30", date2: "2026-11-29", terms: "Net 30", reference: "RFQ AE-2210", warehouse: LAHORE, lines: [line("SRV-220", 4), line("INS-HRS", 16)], notes: "", status: "Unpaid", links: { order: "SO-001", quotation: "QTN-001" }, history: history(["Issued", "30 Oct 2026, 10:02", BILAL, "From SO-001"]) },
      { id: "i2", code: "INV-002", kind: "invoice", customerId: "c4", owner: BILAL, date: "2026-11-04", date2: "2026-11-19", terms: "Net 15", reference: "PO MF-0911", warehouse: LAHORE, lines: [line("SRV-220", 1), line("INS-HRS", 6)], notes: "", status: "Paid", links: { order: "SO-005" }, history: history(["Issued", "04 Nov 2026, 15:30", BILAL, "From SO-005"], ["Paid", "09 Nov 2026, 12:40", BILAL, "Receipt RCT-001"]) },
      { id: "i3", code: "INV-003", kind: "invoice", customerId: "c3", owner: BILAL, date: "2026-10-02", date2: "2026-11-01", terms: "Net 30", reference: "Service visit Sep 2026", warehouse: LAHORE, lines: [line("INS-HRS", 20)], notes: "", status: "Partially paid", links: {}, history: history(["Issued", "02 Oct 2026, 09:15", BILAL], ["Partially paid", "20 Oct 2026, 11:00", BILAL, "Receipt RCT-002"]) },
    ],
    receipt: [
      { id: "r1", code: "RCT-001", customerId: "c4", owner: BILAL, date: "2026-11-09", method: "Bank transfer", account: RECEIPT_ACCOUNTS[0], reference: "IBFT 88231", amount: 263540, alloc: [{ inv: "INV-002", amount: 263540 }], status: "Recorded", history: history(["Recorded", "09 Nov 2026, 12:40", BILAL]) },
      { id: "r2", code: "RCT-002", customerId: "c3", owner: BILAL, date: "2026-10-20", method: "Cheque", account: RECEIPT_ACCOUNTS[1], reference: "Cheque 004471", amount: 100000, alloc: [{ inv: "INV-003", amount: 100000 }], status: "Recorded", history: history(["Recorded", "20 Oct 2026, 11:00", BILAL]) },
    ],
    returns: [
      { id: "sr1", code: "SR-001", customerId: "c1", invoice: "INV-001", date: "2026-11-06", item: "Industrial Servo Motor SM-220", qty: 1, reason: "Damaged in transit", status: "Pending approval", history: history(["Received", "06 Nov 2026, 10:20", HIRA]) },
      { id: "sr2", code: "SR-002", customerId: "c4", invoice: "INV-002", date: "2026-11-07", item: "Installation & Commissioning", qty: 2, reason: "Hours not used", status: "Approved", history: history(["Received", "07 Nov 2026, 09:00", USMAN], ["Approved", "07 Nov 2026, 14:00", USMAN]) },
    ],
    recurring: [
      { id: "rb1", code: "RB-001", customerId: "c4", desc: "Maintenance contract · monthly instalment", sku: "AMC-STD", qty: 1, rate: 30000, tax: 16, frequency: "Monthly", next: "2026-11-15", status: "Active" },
      { id: "rb2", code: "RB-002", customerId: "c1", desc: "Quarterly preventive maintenance visit", sku: "INS-HRS", qty: 24, rate: 6500, tax: 16, frequency: "Quarterly", next: "2026-12-01", status: "Active" },
      { id: "rb3", code: "RB-003", customerId: "c3", desc: "Monthly calibration visit", sku: "INS-HRS", qty: 8, rate: 6500, tax: 16, frequency: "Monthly", next: "2026-11-20", status: "Paused" },
    ],
  };
}
