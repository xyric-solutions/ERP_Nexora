/**
 * Customer master rules for the sales prototype: defaults, display helpers
 * and validation. Only the Overview section is mandatory; every other
 * section is optional, but anything entered must be well formed.
 *
 * Runs in the browser against session data. When the Customer API is built
 * these rules move server-side with the same field contract.
 */

import { countryName } from "@/shared/constants/countries";
import {
  emailError,
  formatPhone,
  ibanError,
  loosePhoneError,
  normalizeIban,
  phoneError,
  postalError,
  swiftError,
  websiteError,
} from "@/shared/model/international-validation";
import { CUSTOM_TERMS, SALES_TERM_DAYS, SALES_TERMS } from "./sales-constants";
import type { CustomerBankAccount, CustomerIdentification, PostalAddress, SalesCustomer } from "./sales-types";

export type CustomerSection = "overview" | "contact" | "address" | "tax" | "terms" | "banks" | "notes";

export const CUSTOMER_SECTIONS: readonly (readonly [CustomerSection, string])[] = [
  ["overview", "Overview"],
  ["contact", "Contact details"],
  ["address", "Addresses"],
  ["tax", "Tax details"],
  ["terms", "Payment terms & credit"],
  ["banks", "Bank accounts"],
  ["notes", "Notes"],
];

export const emptyAddress = (country = "PK"): PostalAddress => ({ line1: "", line2: "", city: "", region: "", postal: "", country });

const localId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const newBankAccount = (holder = ""): CustomerBankAccount => ({
  id: localId(),
  bankName: "",
  holder,
  accountNumber: "",
  iban: "",
  swift: "",
  branchName: "",
  branchCode: "",
  country: "PK",
  address: "",
  currency: "PKR",
  accountType: "Current",
});

export const newIdentification = (): CustomerIdentification => ({ id: localId(), type: "CNIC", number: "", country: "PK", expiry: "" });

/** A customer with every optional section empty. Callers set id, code and the overview. */
export function blankCustomer(): SalesCustomer {
  return {
    id: "", code: "", name: "", display: "", type: "Company", status: "Active", industry: "", salesperson: "",
    contactName: "", contactRole: "", email: "", phoneCountry: "PK", phone: "", mobile: "", website: "",
    billing: emptyAddress(), shipSame: true, shipping: emptyAddress(),
    taxRegistration: "Unregistered", ntn: "", strn: "", tin: "", vatNumber: "", withholding: false, taxExemption: "", identifications: [],
    terms: "Net 30", customTerms: "", dueDays: 30, priceList: "Standard", creditLimit: 0, openingBalance: 0, openingBalanceDate: "",
    paymentMethod: "Bank transfer", currency: "PKR", advance: "Not required", advancePercent: 0, lateTerms: "",
    earlyDiscountPercent: 0, earlyDiscountDays: 0, taxTreatment: "Standard-rated", creditStatus: "Good standing",
    creditReview: "", creditNote: "", banks: [],
    notes: "", internalComments: "", instructions: "", requirements: "", importantInfo: "", attachments: [], history: [],
  };
}

/** Orders and approvals stop for a customer on hold or blocked. */
export const onCreditHold = (customer: SalesCustomer | undefined) =>
  customer?.creditStatus === "On hold" || customer?.creditStatus === "Blocked";

export const customerPhone = (customer: SalesCustomer | undefined) =>
  customer ? formatPhone(customer.phoneCountry, customer.phone) || customer.mobile : "";

/** Address as display lines, e.g. ["Plot 14, Sundar Industrial Estate", "Lahore, Punjab 54000", "Pakistan"]. */
export function addressLines(address: PostalAddress | undefined): string[] {
  if (!address) return [];
  const street = [address.line1, address.line2].filter((part) => part.trim()).join(", ");
  const locality = [address.city, [address.region, address.postal].filter(Boolean).join(" ")].filter((part) => part.trim()).join(", ");
  const hasAny = Boolean(street || locality);
  return [street, locality, hasAny ? countryName(address.country) : ""].filter(Boolean);
}

export const shippingAddress = (customer: SalesCustomer) =>
  customer.shipSame || !customer.shipping.line1.trim() ? customer.billing : customer.shipping;

/** Payment terms for a new sales document: custom terms map to the nearest standard term. */
export function documentTermsFor(customer: SalesCustomer | undefined): string {
  if (!customer) return "Net 30";
  if (customer.terms !== CUSTOM_TERMS) return customer.terms;
  let best: string = SALES_TERMS[0];
  for (const term of SALES_TERMS) {
    if (Math.abs(SALES_TERM_DAYS[term] - customer.dueDays) < Math.abs(SALES_TERM_DAYS[best] - customer.dueDays)) best = term;
  }
  return best;
}

export const termsLabel = (customer: SalesCustomer) =>
  customer.terms === CUSTOM_TERMS ? customer.customTerms || `Custom · ${customer.dueDays} days` : customer.terms;

/* ------------------------------------------------------------ validation */

export type CustomerErrors = Record<string, string>;

const SECTION_BY_FIELD: Record<string, CustomerSection> = {
  name: "overview", type: "overview", salesperson: "overview",
  contactName: "contact", email: "contact", phone: "contact", mobile: "contact", website: "contact",
  billing: "address", shipping: "address",
  ntn: "tax", strn: "tax", tin: "tax", vatNumber: "tax", identifications: "tax",
  customTerms: "terms", dueDays: "terms", creditLimit: "terms", openingBalance: "terms", advancePercent: "terms",
  earlyDiscountPercent: "terms", earlyDiscountDays: "terms",
  banks: "banks",
};

/** Section holding an error key such as "billing.postal" or "banks.0.iban". */
export const sectionOfError = (key: string): CustomerSection | undefined => SECTION_BY_FIELD[key.split(".")[0]];

const isBlankBank = (bank: CustomerBankAccount) =>
  ![bank.bankName, bank.accountNumber, bank.iban, bank.swift, bank.branchName, bank.branchCode, bank.address].some((value) => value.trim());

function checkAddress(errors: CustomerErrors, prefix: "billing" | "shipping", address: PostalAddress) {
  const postal = postalError(address.country, address.postal);
  if (postal) errors[`${prefix}.postal`] = postal;
}

const ID_PATTERNS: Record<string, readonly [RegExp, string]> = {
  CNIC: [/^\d{5}-\d{7}-\d$/, "Use the CNIC format 35202-1234567-1."],
  Passport: [/^[A-Z0-9]{6,20}$/i, "Passport numbers have 6 to 20 letters or digits."],
};

export function validateCustomer(draft: SalesCustomer): CustomerErrors {
  const errors: CustomerErrors = {};
  // Overview: mandatory.
  if (!draft.name.trim()) errors.name = "Enter the legal name.";
  if (!draft.type) errors.type = "Choose the customer type.";
  if (!draft.salesperson) errors.salesperson = "Choose the salesperson.";

  // Contact: optional, validated when entered.
  const contact: [string, string][] = [
    ["email", emailError(draft.email)],
    ["phone", phoneError(draft.phoneCountry, draft.phone)],
    ["mobile", loosePhoneError(draft.mobile)],
    ["website", websiteError(draft.website)],
  ];
  for (const [key, message] of contact) if (message) errors[key] = message;

  // Addresses: optional.
  checkAddress(errors, "billing", draft.billing);
  if (!draft.shipSame) checkAddress(errors, "shipping", draft.shipping);

  // Tax: optional.
  if (draft.ntn.trim() && !/^\d{7}-\d$/.test(draft.ntn.trim())) errors.ntn = "Use the NTN format 1234567-8.";
  if (draft.strn.trim() && !/^[\d-]{11,17}$/.test(draft.strn.trim())) errors.strn = "Use digits and dashes, e.g. 03-01-9876-543-21.";
  if (draft.tin.trim() && !/^[A-Z\d][A-Z\d\s./-]{3,29}$/i.test(draft.tin.trim())) errors.tin = "Use 4 to 30 letters, digits or separators.";
  if (draft.vatNumber.trim() && !/^[A-Z\d][A-Z\d\s./-]{3,29}$/i.test(draft.vatNumber.trim())) errors.vatNumber = "Use 4 to 30 letters, digits or separators.";
  draft.identifications.forEach((item, index) => {
    if (!item.number.trim()) return;
    const rule = ID_PATTERNS[item.type];
    if (rule && !rule[0].test(item.number.trim())) errors[`identifications.${index}.number`] = rule[1];
  });

  // Payment terms & credit: optional.
  if (draft.terms === CUSTOM_TERMS && !(Number.isInteger(Number(draft.dueDays)) && draft.dueDays >= 0 && draft.dueDays <= 365))
    errors.dueDays = "Enter 0 to 365 days.";
  if (!(Number(draft.creditLimit) >= 0)) errors.creditLimit = "Credit limit cannot be negative.";
  if (!Number.isFinite(Number(draft.openingBalance))) errors.openingBalance = "Enter an amount.";
  if (draft.advance === "Partial advance" && !(draft.advancePercent > 0 && draft.advancePercent < 100))
    errors.advancePercent = "Enter a percentage between 1 and 99.";
  if (!(draft.earlyDiscountPercent >= 0 && draft.earlyDiscountPercent <= 100)) errors.earlyDiscountPercent = "Enter 0 to 100%.";
  else if (draft.earlyDiscountPercent > 0 && !(draft.earlyDiscountDays > 0)) errors.earlyDiscountDays = "Enter how many days the discount applies.";

  // Bank accounts: optional; a started account needs a bank and an account number or IBAN.
  draft.banks.forEach((bank, index) => {
    if (isBlankBank(bank)) return;
    if (!bank.bankName.trim()) errors[`banks.${index}.bankName`] = "Enter the bank name.";
    if (!bank.accountNumber.trim() && !bank.iban.trim()) errors[`banks.${index}.accountNumber`] = "Enter an account number or IBAN.";
    const iban = ibanError(bank.iban);
    if (iban) errors[`banks.${index}.iban`] = iban;
    const swift = swiftError(bank.swift);
    if (swift) errors[`banks.${index}.swift`] = swift;
  });
  return errors;
}

/** Trims text, drops empty optional rows and normalises bank identifiers before saving. */
export function normalizeCustomer(draft: SalesCustomer): SalesCustomer {
  const isStandard = draft.terms !== CUSTOM_TERMS;
  return {
    ...draft,
    name: draft.name.trim(),
    display: draft.display.trim() || draft.name.trim(),
    dueDays: isStandard ? SALES_TERM_DAYS[draft.terms] ?? 30 : Number(draft.dueDays) || 0,
    customTerms: isStandard ? "" : draft.customTerms.trim(),
    creditLimit: Number(draft.creditLimit) || 0,
    openingBalance: Math.round((Number(draft.openingBalance) || 0) * 100) / 100,
    advancePercent: draft.advance === "Partial advance" ? Number(draft.advancePercent) || 0 : draft.advance === "Full advance" ? 100 : 0,
    shipping: draft.shipSame ? emptyAddress(draft.billing.country) : draft.shipping,
    identifications: draft.identifications.filter((item) => item.number.trim()),
    banks: draft.banks
      .filter((bank) => !isBlankBank(bank))
      .map((bank) => ({ ...bank, iban: normalizeIban(bank.iban), swift: bank.swift.replace(/\s/g, "").toUpperCase() })),
  };
}
