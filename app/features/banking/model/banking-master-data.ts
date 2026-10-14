/**
 * Banking master data for the isolated Nexora UI/UX prototype.
 *
 * Chart of Accounts, bank account master and FX rates used by the banking
 * transaction-entry screens. Deterministic presentation data only: no API,
 * database, Demo Account, authorization, posting, or business-transaction
 * dependency.
 */

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type NormalSide = "debit" | "credit";
export type BankCurrency = "USD" | "EUR" | "GBP" | "PKR";

export interface NominalAccount {
  code: string;
  name: string;
  type: AccountType;
  section: string;
  /** Header accounts organise the tree and cannot be posted to. */
  isHeader?: boolean;
  /** Bank/cash control accounts are reserved for bank account mapping. */
  isBankControl?: boolean;
}

export const BASE_CURRENCY: BankCurrency = "USD";

function normalSideFor(type: AccountType): NormalSide {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

export function accountNormalSide(account: NominalAccount): NormalSide {
  return normalSideFor(account.type);
}

/** Mirrors the demo numbering convention: section-group-sequence. */
export const chartOfAccounts: readonly NominalAccount[] = [
  { code: "10-00-00000", name: "Current Assets", type: "asset", section: "Assets", isHeader: true },
  { code: "10-01-00100", name: "Petty Cash", type: "asset", section: "Cash & bank", isBankControl: true },
  { code: "10-01-00200", name: "Bank — Operating USD", type: "asset", section: "Cash & bank", isBankControl: true },
  { code: "10-01-00210", name: "Bank — Payroll USD", type: "asset", section: "Cash & bank", isBankControl: true },
  { code: "10-01-00220", name: "Bank — Collections EUR", type: "asset", section: "Cash & bank", isBankControl: true },
  { code: "10-01-00230", name: "Bank — Reserve Deposit USD", type: "asset", section: "Cash & bank", isBankControl: true },
  { code: "10-01-00240", name: "Bank — Sterling Trade GBP", type: "asset", section: "Cash & bank", isBankControl: true },
  { code: "10-01-00250", name: "Bank — Local Operations PKR", type: "asset", section: "Cash & bank", isBankControl: true },
  { code: "10-01-00260", name: "Bank — Escrow USD", type: "asset", section: "Cash & bank", isBankControl: true },
  { code: "10-01-00300", name: "Undeposited Funds", type: "asset", section: "Cash & bank" },
  { code: "10-01-00310", name: "Cheques in Hand", type: "asset", section: "Cash & bank" },
  { code: "10-01-00320", name: "Cash in Transit", type: "asset", section: "Cash & bank" },
  { code: "10-02-00100", name: "Accounts Receivable — Trade", type: "asset", section: "Receivables" },
  { code: "10-02-00200", name: "Other Receivables", type: "asset", section: "Receivables" },
  { code: "10-02-00300", name: "Prepaid Expenses", type: "asset", section: "Receivables" },
  { code: "10-03-00100", name: "Inventory — Raw Material", type: "asset", section: "Inventory" },
  { code: "10-03-00200", name: "Inventory — Finished Goods", type: "asset", section: "Inventory" },
  { code: "10-04-00100", name: "Property, Plant & Equipment", type: "asset", section: "Fixed assets" },

  { code: "20-00-00000", name: "Liabilities", type: "liability", section: "Liabilities", isHeader: true },
  { code: "20-01-00100", name: "Accounts Payable — Trade", type: "liability", section: "Payables" },
  { code: "20-01-00200", name: "Accrued Expenses", type: "liability", section: "Payables" },
  { code: "20-02-00100", name: "Payroll Liabilities", type: "liability", section: "Payables" },
  { code: "20-03-00100", name: "Sales Tax Payable", type: "liability", section: "Tax" },
  { code: "20-03-00200", name: "Withholding Tax Payable", type: "liability", section: "Tax" },
  { code: "20-04-00100", name: "Accrued Rent", type: "liability", section: "Payables" },
  { code: "20-05-00100", name: "Bank Loan — Current", type: "liability", section: "Borrowings" },
  { code: "20-05-00200", name: "Bank Overdraft Facility", type: "liability", section: "Borrowings" },
  { code: "20-06-00100", name: "Cheques Payable — Unpresented", type: "liability", section: "Payables" },

  { code: "30-00-00000", name: "Equity", type: "equity", section: "Equity", isHeader: true },
  { code: "30-01-00100", name: "Share Capital", type: "equity", section: "Equity" },
  { code: "30-02-00100", name: "Retained Earnings", type: "equity", section: "Equity" },
  { code: "30-03-00100", name: "Opening Balance Equity", type: "equity", section: "Equity" },

  { code: "40-00-00000", name: "Revenue", type: "revenue", section: "Revenue", isHeader: true },
  { code: "40-01-00100", name: "Custom Software Development", type: "revenue", section: "Revenue" },
  { code: "40-02-00100", name: "Product Sales", type: "revenue", section: "Revenue" },
  { code: "40-03-00100", name: "Support & Maintenance", type: "revenue", section: "Revenue" },
  { code: "40-04-00100", name: "Interest Income", type: "revenue", section: "Other income" },
  { code: "40-04-00200", name: "FX Revaluation Gain", type: "revenue", section: "Other income" },
  { code: "40-04-00300", name: "Other Income", type: "revenue", section: "Other income" },

  { code: "50-00-00000", name: "Cost of Sales", type: "expense", section: "Cost of sales", isHeader: true },
  { code: "50-01-00100", name: "Cloud Hosting Costs", type: "expense", section: "Cost of sales" },
  { code: "50-02-00100", name: "Direct Materials", type: "expense", section: "Cost of sales" },
  { code: "50-03-00100", name: "Subcontractor Costs", type: "expense", section: "Cost of sales" },

  { code: "60-00-00000", name: "Operating Expenses", type: "expense", section: "Operating expenses", isHeader: true },
  { code: "60-01-00100", name: "Salaries & Wages", type: "expense", section: "Operating expenses" },
  { code: "60-02-00100", name: "IT Consulting", type: "expense", section: "Operating expenses" },
  { code: "60-03-00100", name: "Utilities", type: "expense", section: "Operating expenses" },
  { code: "60-04-00100", name: "Contractor Services", type: "expense", section: "Operating expenses" },
  { code: "60-05-00100", name: "Office Rent", type: "expense", section: "Operating expenses" },
  { code: "60-06-00100", name: "Travel & Entertainment", type: "expense", section: "Operating expenses" },
  { code: "60-07-00100", name: "Professional Fees", type: "expense", section: "Operating expenses" },
  { code: "70-01-00100", name: "Bank Charges & Commission", type: "expense", section: "Finance costs" },
  { code: "70-01-00200", name: "Interest Expense", type: "expense", section: "Finance costs" },
  { code: "70-01-00300", name: "FX Revaluation Loss", type: "expense", section: "Finance costs" },
];

export const postableAccounts = chartOfAccounts.filter((account) => !account.isHeader);

export function findAccount(code: string): NominalAccount | undefined {
  return chartOfAccounts.find((account) => account.code === code);
}

export function accountLabel(code: string): string {
  const account = findAccount(code);
  return account ? `${account.code} · ${account.name}` : code;
}

export interface BankAccountFixture {
  id: string;
  name: string;
  bank: string;
  branch: string;
  number: string;
  iban: string;
  swift: string;
  type: "Current" | "Deposit" | "Escrow" | "Cash";
  currency: BankCurrency;
  glCode: string;
  ledgerBalance: number;
  availableBalance: number;
  overdraftLimit: number;
  signatories: readonly string[];
  status: "Active" | "Restricted" | "Closed";
  openedOn: string;
  lastMovement: string;
  unreconciled: number;
}

export const bankAccounts: readonly BankAccountFixture[] = [
  { id: "BA-4471", name: "Operating USD", bank: "First Meridian Bank", branch: "Downtown", number: "•••• 4471", iban: "US44 FMER 0000 0000 4471", swift: "FMERUS33", type: "Current", currency: "USD", glCode: "10-01-00200", ledgerBalance: 612480, availableBalance: 598140, overdraftLimit: 250000, signatories: ["Omar Siddiqui", "Mariam Ali", "Bilal Khan"], status: "Active", openedOn: "14 Mar 2021", lastMovement: "31 Aug 2026", unreconciled: 21 },
  { id: "BA-4472", name: "Payroll USD", bank: "First Meridian Bank", branch: "Downtown", number: "•••• 4472", iban: "US44 FMER 0000 0000 4472", swift: "FMERUS33", type: "Current", currency: "USD", glCode: "10-01-00210", ledgerBalance: 92360, availableBalance: 92360, overdraftLimit: 0, signatories: ["Omar Siddiqui", "Sana Iqbal"], status: "Active", openedOn: "14 Mar 2021", lastMovement: "29 Aug 2026", unreconciled: 0 },
  { id: "BA-8814", name: "Collections EUR", bank: "Continental Trust", branch: "Frankfurt", number: "•••• 8814", iban: "DE89 CONT 0000 0088 14", swift: "CONTDEFF", type: "Current", currency: "EUR", glCode: "10-01-00220", ledgerBalance: 468220, availableBalance: 441900, overdraftLimit: 100000, signatories: ["Mariam Ali", "Bilal Khan", "Omar Siddiqui"], status: "Active", openedOn: "02 Sep 2022", lastMovement: "31 Aug 2026", unreconciled: 8 },
  { id: "BA-4480", name: "Reserve Deposit USD", bank: "First Meridian Bank", branch: "Downtown", number: "•••• 4480", iban: "US44 FMER 0000 0000 4480", swift: "FMERUS33", type: "Deposit", currency: "USD", glCode: "10-01-00230", ledgerBalance: 244000, availableBalance: 244000, overdraftLimit: 0, signatories: ["Omar Siddiqui", "Mariam Ali", "Bilal Khan", "Sana Iqbal"], status: "Restricted", openedOn: "18 Jan 2023", lastMovement: "12 Aug 2026", unreconciled: 0 },
  { id: "BA-2260", name: "Sterling Trade GBP", bank: "Northgate Bank", branch: "London", number: "•••• 2260", iban: "GB29 NRTG 0000 0022 60", swift: "NRTGGB2L", type: "Current", currency: "GBP", glCode: "10-01-00240", ledgerBalance: 128640, availableBalance: 121200, overdraftLimit: 50000, signatories: ["Mariam Ali", "Bilal Khan"], status: "Active", openedOn: "07 Jun 2023", lastMovement: "30 Aug 2026", unreconciled: 3 },
  { id: "BA-9902", name: "Local Operations PKR", bank: "Indus Commercial", branch: "Karachi", number: "•••• 9902", iban: "PK36 INDC 0000 0099 02", swift: "INDCPKKA", type: "Current", currency: "PKR", glCode: "10-01-00250", ledgerBalance: 18420000, availableBalance: 18420000, overdraftLimit: 0, signatories: ["Bilal Khan", "Sana Iqbal"], status: "Active", openedOn: "21 Nov 2024", lastMovement: "28 Aug 2026", unreconciled: 2 },
  { id: "BA-7731", name: "Escrow — Atlas Project", bank: "Continental Trust", branch: "Frankfurt", number: "•••• 7731", iban: "DE89 CONT 0000 0077 31", swift: "CONTDEFF", type: "Escrow", currency: "USD", glCode: "10-01-00260", ledgerBalance: 186000, availableBalance: 0, overdraftLimit: 0, signatories: ["Omar Siddiqui", "Mariam Ali", "Bilal Khan", "Sana Iqbal"], status: "Restricted", openedOn: "14 Aug 2026", lastMovement: "18 Aug 2026", unreconciled: 0 },
  { id: "BA-CASH", name: "Petty Cash — Head Office", bank: "Cash on hand", branch: "Head office", number: "n/a", iban: "n/a", swift: "n/a", type: "Cash", currency: "USD", glCode: "10-01-00100", ledgerBalance: 4850, availableBalance: 4850, overdraftLimit: 0, signatories: ["Sana Iqbal"], status: "Active", openedOn: "14 Mar 2021", lastMovement: "27 Aug 2026", unreconciled: 0 },
];

export function findBankAccount(id: string): BankAccountFixture | undefined {
  return bankAccounts.find((account) => account.id === id);
}

/** Indicative mid-market rates against the USD base currency. */
export const exchangeRates: Readonly<Record<BankCurrency, number>> = {
  USD: 1,
  EUR: 1.084,
  GBP: 1.271,
  PKR: 0.00359,
};

export const currencyOptions: readonly BankCurrency[] = ["USD", "EUR", "GBP", "PKR"];

const currencySymbols: Readonly<Record<BankCurrency, string>> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  PKR: "₨",
};

export function formatMoney(amount: number, currency: BankCurrency = BASE_CURRENCY): string {
  const value = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}${currencySymbols[currency]}${value}`;
}

export const paymentMethods = ["Wire transfer", "ACH", "SEPA", "Faster Payment", "Cheque", "Cash", "Card", "Standing order"] as const;
export const receiptMethods = ["Wire transfer", "ACH", "SEPA", "Cheque", "Cash", "Card", "Direct debit"] as const;

export const costCentres = ["Operations", "Technology", "Commercial", "Corporate", "Facilities"] as const;

export const approvalRoutes = [
  "Finance review → Final approval",
  "Single approver (under $25,000)",
  "Dual signature (over $250,000)",
  "Treasury committee",
] as const;
