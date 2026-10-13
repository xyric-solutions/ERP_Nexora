/**
 * Banking transaction type definitions for the isolated Nexora UI/UX prototype.
 *
 * Each type declares which inputs appear, which are required, and how the
 * double entry is composed. The form derives its layout and its journal
 * preview from this single definition, so the fields shown and the accounting
 * effect can never drift apart.
 *
 * Deterministic presentation logic only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import type { BankCurrency } from "./banking-master-data";

export type BankingTransactionTypeId =
  | "bank-account-setup"
  | "bank-payment"
  | "bank-receipt"
  | "bank-transfer"
  | "bank-deposit"
  | "bank-charges"
  | "bank-interest"
  | "cheque-issued"
  | "cheque-received"
  | "bank-revaluation";

export type PartyKind = "supplier" | "customer" | "bank" | "none";

/** Which side of the entry the selected bank account posts to. */
export type BankSide = "debit" | "credit" | "either";

export interface TransactionDirectionOption {
  id: string;
  label: string;
  /** Bank side when this direction is chosen. */
  bankSide: "debit" | "credit";
  /** Default contra account for this direction. */
  contraAccount: string;
  helper: string;
}

export interface BankingTransactionType {
  id: BankingTransactionTypeId;
  label: string;
  shortLabel: string;
  group: "Money out" | "Money in" | "Internal" | "Adjustment" | "Master data";
  prefix: string;
  description: string;
  /** Money-in/out framing used across the form and detail view. */
  bankSide: BankSide;
  partyKind: PartyKind;
  partyLabel: string;
  /** Label used for the non-bank side of the entry. */
  contraLabel: string;
  contraHelper: string;
  /** Accounts offered first in the contra selector. */
  suggestedContraAccounts: readonly string[];
  defaultContraAccount: string;
  methodLabel?: string;
  methodOptions?: readonly string[];
  /** Optional second bank account (transfers). */
  needsCounterBank?: boolean;
  counterBankLabel?: string;
  /** Cheque-specific inputs. */
  needsChequeDetails?: boolean;
  /** Revaluation-specific inputs. */
  needsRevaluation?: boolean;
  /** Directional types (interest received vs paid, gain vs loss). */
  directions?: readonly TransactionDirectionOption[];
  /** Master-data types capture an account record rather than a payment. */
  isMasterData?: boolean;
  /** Bank charges can be added as a second expense line. */
  allowsBankCharge?: boolean;
  amountLabel: string;
  documentHint: string;
}

export const bankingTransactionTypes: readonly BankingTransactionType[] = [
  {
    id: "bank-account-setup",
    label: "Bank Account Setup",
    shortLabel: "Account setup",
    group: "Master data",
    prefix: "BA",
    description: "Register a bank or cash account, map it to a nominal control account and record its opening balance.",
    bankSide: "debit",
    partyKind: "bank",
    partyLabel: "Bank",
    contraLabel: "Opening balance account",
    contraHelper: "The opening balance is posted against this account. Leave the amount at zero for a new account with no history.",
    suggestedContraAccounts: ["30-03-00100", "30-02-00100", "20-05-00100"],
    defaultContraAccount: "30-03-00100",
    isMasterData: true,
    amountLabel: "Opening balance",
    documentHint: "Account code is generated when the record is saved.",
  },
  {
    id: "bank-payment",
    label: "Bank Payment",
    shortLabel: "Payment",
    group: "Money out",
    prefix: "PAY",
    description: "Pay a supplier or settle an expense directly from a bank account.",
    bankSide: "credit",
    partyKind: "supplier",
    partyLabel: "Paid to",
    contraLabel: "Expense or payable account",
    contraHelper: "The account charged for this payment. Settling a supplier bill normally debits Accounts Payable.",
    suggestedContraAccounts: ["20-01-00100", "60-05-00100", "60-02-00100", "60-07-00100", "50-01-00100"],
    defaultContraAccount: "20-01-00100",
    methodLabel: "Payment method",
    methodOptions: ["Wire transfer", "ACH", "SEPA", "Faster Payment", "Standing order", "Card"],
    allowsBankCharge: true,
    amountLabel: "Payment amount",
    documentHint: "Sequential payment reference.",
  },
  {
    id: "bank-receipt",
    label: "Bank Receipt",
    shortLabel: "Receipt",
    group: "Money in",
    prefix: "RCP",
    description: "Record funds received from a customer or other payer into a bank account.",
    bankSide: "debit",
    partyKind: "customer",
    partyLabel: "Received from",
    contraLabel: "Receivable or income account",
    contraHelper: "The account credited by this receipt. Settling a customer invoice normally credits Accounts Receivable.",
    suggestedContraAccounts: ["10-02-00100", "40-01-00100", "40-02-00100", "40-03-00100", "40-04-00300"],
    defaultContraAccount: "10-02-00100",
    methodLabel: "Receipt method",
    methodOptions: ["Wire transfer", "ACH", "SEPA", "Direct debit", "Card", "Cash"],
    allowsBankCharge: true,
    amountLabel: "Receipt amount",
    documentHint: "Sequential receipt reference.",
  },
  {
    id: "bank-transfer",
    label: "Bank Transfer",
    shortLabel: "Transfer",
    group: "Internal",
    prefix: "TRF",
    description: "Move funds between two of your own bank or cash accounts.",
    bankSide: "credit",
    partyKind: "none",
    partyLabel: "Party",
    contraLabel: "Destination account",
    contraHelper: "Funds leave the source account and arrive in the destination account. Both sides post to bank control accounts.",
    suggestedContraAccounts: [],
    defaultContraAccount: "",
    needsCounterBank: true,
    counterBankLabel: "Transfer to account",
    methodLabel: "Transfer method",
    methodOptions: ["Internal transfer", "Wire transfer", "Standing order"],
    allowsBankCharge: true,
    amountLabel: "Transfer amount",
    documentHint: "Sequential transfer reference.",
  },
  {
    id: "bank-deposit",
    label: "Bank Deposit",
    shortLabel: "Deposit",
    group: "Money in",
    prefix: "DEP",
    description: "Bank cash or cheques held on hand and clear them into a bank account.",
    bankSide: "debit",
    partyKind: "none",
    partyLabel: "Depositor",
    contraLabel: "Source of funds",
    contraHelper: "Undeposited funds and cheques in hand are cleared when the deposit is banked.",
    suggestedContraAccounts: ["10-01-00300", "10-01-00310", "10-01-00100", "10-01-00320"],
    defaultContraAccount: "10-01-00300",
    methodLabel: "Deposit type",
    methodOptions: ["Cash deposit", "Cheque deposit", "Mixed deposit"],
    amountLabel: "Deposit amount",
    documentHint: "Sequential deposit slip reference.",
  },
  {
    id: "bank-charges",
    label: "Bank Charges",
    shortLabel: "Charges",
    group: "Money out",
    prefix: "CHG",
    description: "Record fees, commission or facility charges applied by the bank.",
    bankSide: "credit",
    partyKind: "bank",
    partyLabel: "Charged by",
    contraLabel: "Charge account",
    contraHelper: "Bank charges are an expense of the period in which the bank applies them.",
    suggestedContraAccounts: ["70-01-00100", "70-01-00200", "60-07-00100"],
    defaultContraAccount: "70-01-00100",
    methodLabel: "Charge type",
    methodOptions: ["Transaction fee", "FX margin", "Facility fee", "Account maintenance", "Commission"],
    amountLabel: "Charge amount",
    documentHint: "Sequential charge reference.",
  },
  {
    id: "bank-interest",
    label: "Bank Interest",
    shortLabel: "Interest",
    group: "Adjustment",
    prefix: "INT",
    description: "Record interest earned on deposits or interest charged on borrowings.",
    bankSide: "either",
    partyKind: "bank",
    partyLabel: "Bank",
    contraLabel: "Interest account",
    contraHelper: "Interest earned credits income; interest charged debits finance costs.",
    suggestedContraAccounts: ["40-04-00100", "70-01-00200"],
    defaultContraAccount: "40-04-00100",
    directions: [
      { id: "received", label: "Interest received", bankSide: "debit", contraAccount: "40-04-00100", helper: "Funds are credited to the bank account and interest income is recognised." },
      { id: "paid", label: "Interest charged", bankSide: "credit", contraAccount: "70-01-00200", helper: "The bank debits the account and interest expense is recognised." },
    ],
    amountLabel: "Interest amount",
    documentHint: "Sequential interest reference.",
  },
  {
    id: "cheque-issued",
    label: "Cheque Issued",
    shortLabel: "Cheque out",
    group: "Money out",
    prefix: "CHQ",
    description: "Issue a cheque to a supplier and track it until it is presented and cleared.",
    bankSide: "credit",
    partyKind: "supplier",
    partyLabel: "Payee",
    contraLabel: "Expense or payable account",
    contraHelper: "An issued cheque reduces the payable or charges the expense immediately; the bank clears when presented.",
    suggestedContraAccounts: ["20-01-00100", "60-05-00100", "60-04-00100", "60-07-00100"],
    defaultContraAccount: "20-01-00100",
    needsChequeDetails: true,
    methodLabel: "Cheque type",
    methodOptions: ["Current dated", "Post dated", "Certified", "Bank draft"],
    amountLabel: "Cheque amount",
    documentHint: "Cheque number from the issued book.",
  },
  {
    id: "cheque-received",
    label: "Cheque Received",
    shortLabel: "Cheque in",
    group: "Money in",
    prefix: "RCQ",
    description: "Log a customer cheque into cheques in hand before it is deposited and cleared.",
    bankSide: "debit",
    partyKind: "customer",
    partyLabel: "Received from",
    contraLabel: "Receivable or income account",
    contraHelper: "A received cheque is held in Cheques in Hand until it is deposited, so the bank account is not debited yet.",
    suggestedContraAccounts: ["10-02-00100", "40-02-00100", "40-03-00100"],
    defaultContraAccount: "10-02-00100",
    needsChequeDetails: true,
    methodLabel: "Cheque type",
    methodOptions: ["Current dated", "Post dated", "Certified", "Bank draft"],
    amountLabel: "Cheque amount",
    documentHint: "Cheque number as printed by the payer.",
  },
  {
    id: "bank-revaluation",
    label: "Bank Revaluation",
    shortLabel: "Revaluation",
    group: "Adjustment",
    prefix: "REV",
    description: "Restate a foreign-currency bank balance at the closing rate and post the unrealised difference.",
    bankSide: "either",
    partyKind: "none",
    partyLabel: "Party",
    contraLabel: "Revaluation account",
    contraHelper: "An increase in the base-currency value posts a gain; a decrease posts a loss.",
    suggestedContraAccounts: ["40-04-00200", "70-01-00300"],
    defaultContraAccount: "40-04-00200",
    needsRevaluation: true,
    directions: [
      { id: "gain", label: "Revaluation gain", bankSide: "debit", contraAccount: "40-04-00200", helper: "The base-currency value of the balance has increased." },
      { id: "loss", label: "Revaluation loss", bankSide: "credit", contraAccount: "70-01-00300", helper: "The base-currency value of the balance has decreased." },
    ],
    amountLabel: "Revaluation difference",
    documentHint: "Sequential revaluation reference.",
  },
];

export function findTransactionType(id: string): BankingTransactionType | undefined {
  return bankingTransactionTypes.find((type) => type.id === id);
}

/* ------------------------------------------------------------------ */
/* Draft model + journal derivation                                     */
/* ------------------------------------------------------------------ */

export interface BankingDraft {
  typeId: BankingTransactionTypeId;
  reference: string;
  transactionDate: string;
  valueDate: string;
  bankAccountId: string;
  counterBankAccountId: string;
  partyId: string;
  currency: BankCurrency;
  exchangeRate: string;
  amount: string;
  contraAccount: string;
  directionId: string;
  method: string;
  description: string;
  notes: string;
  costCentre: string;
  approvalRoute: string;
  attachmentName: string;
  bankChargeAmount: string;
  bankChargeAccount: string;
  chequeNumber: string;
  chequeDate: string;
  chequeBank: string;
  revaluedRate: string;
  /** Bank Account Setup only. */
  accountName: string;
  accountNumber: string;
  bankName: string;
  branch: string;
  iban: string;
  swift: string;
  accountKind: string;
  glCode: string;
  overdraftLimit: string;
}

export interface JournalLine {
  id: string;
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
}

export interface JournalPreview {
  lines: readonly JournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  baseCurrencyAmount: number;
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveBankSide(type: BankingTransactionType, draft: BankingDraft): "debit" | "credit" {
  if (type.directions) {
    const direction = type.directions.find((option) => option.id === draft.directionId) ?? type.directions[0];
    return direction.bankSide;
  }
  return type.bankSide === "either" ? "debit" : type.bankSide;
}

/**
 * Builds the double entry from the draft. Both sides are derived from the same
 * amount, so a saved transaction is balanced by construction; the preview still
 * reports totals explicitly so the effect is visible before submitting.
 */
export function buildJournalPreview(
  type: BankingTransactionType,
  draft: BankingDraft,
  bankGlCode: string,
  counterBankGlCode: string,
): JournalPreview {
  const amount = toNumber(draft.amount);
  const charge = type.allowsBankCharge ? toNumber(draft.bankChargeAmount) : 0;
  const bankSide = resolveBankSide(type, draft);
  const lines: JournalLine[] = [];

  if (type.id === "bank-transfer") {
    lines.push({ id: "line-to", accountCode: counterBankGlCode, description: "Funds received on transfer", debit: amount, credit: 0 });
    lines.push({ id: "line-from", accountCode: bankGlCode, description: "Funds sent on transfer", debit: 0, credit: amount + charge });
    if (charge > 0) {
      lines.push({ id: "line-charge", accountCode: draft.bankChargeAccount || "70-01-00100", description: "Transfer charge", debit: charge, credit: 0 });
    }
  } else if (type.id === "cheque-received") {
    // A received cheque is held in Cheques in Hand until deposited.
    lines.push({ id: "line-bank", accountCode: "10-01-00310", description: "Cheque held pending deposit", debit: amount, credit: 0 });
    lines.push({ id: "line-contra", accountCode: draft.contraAccount, description: draft.description || type.label, debit: 0, credit: amount });
  } else {
    const contraCode = draft.contraAccount;
    if (bankSide === "debit") {
      lines.push({ id: "line-bank", accountCode: bankGlCode, description: draft.description || type.label, debit: amount, credit: 0 });
      lines.push({ id: "line-contra", accountCode: contraCode, description: draft.description || type.label, debit: 0, credit: amount });
      if (charge > 0) {
        lines.push({ id: "line-charge", accountCode: draft.bankChargeAccount || "70-01-00100", description: "Bank charge on receipt", debit: charge, credit: 0 });
        lines.push({ id: "line-charge-bank", accountCode: bankGlCode, description: "Bank charge deducted", debit: 0, credit: charge });
      }
    } else {
      lines.push({ id: "line-contra", accountCode: contraCode, description: draft.description || type.label, debit: amount, credit: 0 });
      lines.push({ id: "line-bank", accountCode: bankGlCode, description: draft.description || type.label, debit: 0, credit: amount + charge });
      if (charge > 0) {
        lines.push({ id: "line-charge", accountCode: draft.bankChargeAccount || "70-01-00100", description: "Bank charge on payment", debit: charge, credit: 0 });
      }
    }
  }

  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
  const rate = toNumber(draft.exchangeRate) || 1;

  return {
    lines,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0,
    baseCurrencyAmount: amount * rate,
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                           */
/* ------------------------------------------------------------------ */

export type ValidationErrors = Readonly<Record<string, string>>;

export function validateDraft(
  type: BankingTransactionType,
  draft: BankingDraft,
  preview: JournalPreview,
  baseCurrency: BankCurrency,
): ValidationErrors {
  const errors: Record<string, string> = {};
  const amount = toNumber(draft.amount);

  if (!draft.reference.trim()) errors.reference = "A transaction reference is required.";
  if (!draft.transactionDate) errors.transactionDate = "Transaction date is required.";

  if (type.isMasterData) {
    if (!draft.accountName.trim()) errors.accountName = "Account name is required.";
    if (!draft.bankName.trim()) errors.bankName = "Bank name is required.";
    if (!draft.accountNumber.trim()) errors.accountNumber = "Account number is required.";
    if (!draft.glCode) errors.glCode = "Select the nominal control account for this bank account.";
    if (amount < 0) errors.amount = "Opening balance cannot be negative.";
    if (amount > 0 && !draft.contraAccount) errors.contraAccount = "Select the account to post the opening balance against.";
    return errors;
  }

  if (!draft.bankAccountId) errors.bankAccountId = "Select the bank account.";
  if (amount <= 0) errors.amount = "Enter an amount greater than zero.";

  if (type.needsCounterBank) {
    if (!draft.counterBankAccountId) errors.counterBankAccountId = "Select the destination account.";
    else if (draft.counterBankAccountId === draft.bankAccountId) {
      errors.counterBankAccountId = "The destination account must differ from the source account.";
    }
  } else if (!draft.contraAccount) {
    errors.contraAccount = `Select the ${type.contraLabel.toLowerCase()}.`;
  }

  if (type.partyKind !== "none" && !draft.partyId.trim()) {
    errors.partyId = `${type.partyLabel} is required.`;
  }

  if (draft.currency !== baseCurrency) {
    const rate = toNumber(draft.exchangeRate);
    if (rate <= 0) errors.exchangeRate = "Enter the exchange rate used for this transaction.";
  }

  if (type.needsChequeDetails) {
    if (!draft.chequeNumber.trim()) errors.chequeNumber = "Cheque number is required.";
    if (!draft.chequeDate) errors.chequeDate = "Cheque date is required.";
  }

  if (type.needsRevaluation && !draft.revaluedRate.trim()) {
    errors.revaluedRate = "Enter the closing rate used for revaluation.";
  }

  if (type.allowsBankCharge && toNumber(draft.bankChargeAmount) > 0 && !draft.bankChargeAccount) {
    errors.bankChargeAccount = "Select the account for the bank charge.";
  }

  // The same account on both sides would post a meaningless entry.
  const bankLine = preview.lines.find((line) => line.id === "line-bank");
  const contraLine = preview.lines.find((line) => line.id === "line-contra");
  if (bankLine && contraLine && bankLine.accountCode && bankLine.accountCode === contraLine.accountCode) {
    errors.contraAccount = "Debit and credit accounts must be different.";
  }

  if (!preview.balanced) {
    errors.journal = "The journal is not balanced. Review the amounts before submitting.";
  }

  return errors;
}

export function nextReference(prefix: string, sequence: number): string {
  return `${prefix}-2026-${String(sequence).padStart(4, "0")}`;
}
