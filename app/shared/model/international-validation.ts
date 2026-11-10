/**
 * Format checks for international contact, address and banking details.
 *
 * Client-side guidance only: these checks help users enter well-formed data.
 * Any API that persists these values must repeat the validation server-side.
 * Every function returns an error message, or "" when the value is valid.
 */

import { countryName, findCountry } from "../constants/countries";

const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** National significant-number lengths (excluding the trunk "0") where they are well defined. */
const NATIONAL_LENGTH: Record<string, readonly [min: number, max: number]> = {
  PK: [9, 10],
  AE: [8, 9],
  SA: [8, 9],
  QA: [8, 8],
  OM: [8, 8],
  KW: [8, 8],
  BH: [8, 8],
  US: [10, 10],
  CA: [10, 10],
  GB: [9, 10],
  IN: [10, 10],
  CN: [9, 11],
  DE: [6, 11],
  FR: [9, 9],
  TR: [10, 10],
  BD: [8, 10],
  AF: [9, 9],
  AU: [9, 9],
  MY: [8, 10],
  SG: [8, 8],
};

/**
 * Validates a national number entered beside a calling-code selector.
 * Spaces, dashes, dots and brackets are allowed; a leading trunk "0" is ignored.
 */
export function phoneError(country: string, number: string): string {
  const value = number.trim();
  if (!value) return "";
  if (!findCountry(country)) return "Choose the country calling code.";
  if (!/^[\d\s().-]+$/.test(value)) return "Use digits only; the country code is chosen on the left.";
  const national = digitsOnly(value).replace(/^0+/, "");
  const dial = findCountry(country)!.dial;
  const [min, max] = NATIONAL_LENGTH[country] ?? [4, 14];
  if (national.length < min || national.length > max) {
    return min === max
      ? `${countryName(country)} numbers have ${min} digits after +${dial}.`
      : `${countryName(country)} numbers have ${min}–${max} digits after +${dial}.`;
  }
  if (dial.length + national.length > 15) return "International numbers cannot exceed 15 digits.";
  return "";
}

/** "+92 42 3575 1100" from a calling-code selection and a national number. */
export function formatPhone(country: string, number: string): string {
  const value = number.trim();
  if (!value) return "";
  const dial = findCountry(country)?.dial;
  const national = value.replace(/^0+/, "");
  return dial ? `+${dial} ${national}` : value;
}

/** Free-form number such as a mobile entered with or without its own "+code". */
export function loosePhoneError(number: string): string {
  const value = number.trim();
  if (!value) return "";
  if (!/^\+?[\d\s().-]+$/.test(value)) return "Use digits, spaces or dashes, optionally starting with +.";
  const count = digitsOnly(value).length;
  if (count < 7 || count > 15) return "Enter 7 to 15 digits.";
  return "";
}

export function emailError(value: string): string {
  if (!value.trim()) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) ? "" : "Enter a valid email, like name@company.com.";
}

export function websiteError(value: string): string {
  if (!value.trim()) return "";
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i.test(value.trim())
    ? ""
    : "Enter a web address, like www.company.com.";
}

/** Postal code patterns for countries with a fixed national format. */
const POSTAL: Record<string, readonly [pattern: RegExp, example: string]> = {
  PK: [/^\d{5}$/, "54000"],
  SA: [/^\d{5}(-\d{4})?$/, "12271"],
  US: [/^\d{5}(-\d{4})?$/, "10001 or 10001-1234"],
  CA: [/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i, "K1A 0B1"],
  GB: [/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, "SW1A 1AA"],
  IN: [/^\d{6}$/, "110001"],
  CN: [/^\d{6}$/, "100000"],
  DE: [/^\d{5}$/, "10115"],
  FR: [/^\d{5}$/, "75001"],
  IT: [/^\d{5}$/, "00118"],
  ES: [/^\d{5}$/, "28001"],
  TR: [/^\d{5}$/, "34000"],
  AU: [/^\d{4}$/, "2000"],
  NL: [/^\d{4} ?[A-Z]{2}$/i, "1011 AB"],
  BD: [/^\d{4}$/, "1000"],
  MY: [/^\d{5}$/, "50000"],
  SG: [/^\d{6}$/, "018956"],
  OM: [/^\d{3}$/, "112"],
  KW: [/^\d{5}$/, "13001"],
  BH: [/^\d{3,4}$/, "317"],
  JP: [/^\d{3}-?\d{4}$/, "100-0001"],
};

/** Countries that do not use postal codes; a P.O. Box may be entered instead. */
const NO_POSTAL = new Set(["AE", "QA", "HK", "IE"]);

export function postalHint(country: string): string {
  if (NO_POSTAL.has(country)) return `${countryName(country)} does not use postal codes. Optional P.O. Box.`;
  const rule = POSTAL[country];
  return rule ? `Format: ${rule[1]}` : "";
}

export function postalError(country: string, value: string): string {
  const code = value.trim();
  if (!code) return "";
  if (NO_POSTAL.has(country)) return /^[\w\s-]{1,10}$/.test(code) ? "" : "Use up to 10 letters or digits.";
  const rule = POSTAL[country];
  if (rule) return rule[0].test(code) ? "" : `Use the ${countryName(country)} format, e.g. ${rule[1]}.`;
  return /^[A-Z\d][A-Z\d\s-]{1,9}$/i.test(code) ? "" : "Use 2 to 10 letters, digits, spaces or dashes.";
}

/** IBAN lengths by country (ISO 13616 registry) for common trading partners. */
const IBAN_LENGTH: Record<string, number> = {
  PK: 24,
  AE: 23,
  SA: 24,
  QA: 29,
  KW: 30,
  BH: 22,
  OM: 23,
  JO: 30,
  TR: 26,
  EG: 29,
  GB: 22,
  IE: 22,
  DE: 22,
  FR: 27,
  IT: 27,
  ES: 24,
  NL: 18,
  BE: 16,
  CH: 21,
  AT: 20,
  SE: 24,
  NO: 15,
  DK: 18,
  FI: 18,
  PL: 28,
  PT: 25,
  GR: 27,
  LU: 20,
  CY: 28,
  MT: 31,
  AZ: 28,
  GE: 22,
  KZ: 20,
  UA: 29,
  LB: 28,
  IL: 23,
  PS: 29,
  IQ: 23,
  MU: 30,
  TN: 24,
};

export const normalizeIban = (value: string) => value.replace(/\s/g, "").toUpperCase();

/** Checks the country length (when known) and the ISO 7064 mod-97 check digits. */
export function ibanError(value: string): string {
  const iban = normalizeIban(value);
  if (!iban) return "";
  if (!/^[A-Z]{2}\d{2}[A-Z\d]{10,30}$/.test(iban))
    return "An IBAN starts with a 2-letter country code and 2 check digits.";
  const expected = IBAN_LENGTH[iban.slice(0, 2)];
  if (expected && iban.length !== expected)
    return `${countryName(iban.slice(0, 2))} IBANs have ${expected} characters.`;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const chunk = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of chunk) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1 ? "" : "This IBAN's check digits are not valid. Check for typing errors.";
}

export function swiftError(value: string): string {
  const code = value.replace(/\s/g, "").toUpperCase();
  if (!code) return "";
  return /^[A-Z]{4}[A-Z]{2}[A-Z\d]{2}([A-Z\d]{3})?$/.test(code)
    ? ""
    : "A SWIFT/BIC has 8 or 11 characters, e.g. MEZNPKKA.";
}

/** Shows only the last four characters of an account number or IBAN. */
export function maskAccount(value: string): string {
  const clean = value.replace(/\s/g, "");
  if (clean.length <= 4) return clean;
  return `•••• ${clean.slice(-4)}`;
}
