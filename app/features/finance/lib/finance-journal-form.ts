import type { JournalLineInput } from "@nexora/contracts";

export type JournalFormValidation = {
  debit: bigint;
  credit: bigint;
  errors: string[];
};

const amountPattern = /^(0|[1-9][0-9]{0,29})(?:\.([0-9]{1,8}))?$/;

export function parseJournalAmount(value: string, decimalPlaces: number): bigint | null {
  const match = amountPattern.exec(value);
  if (!match) return null;
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  if (fraction.length > decimalPlaces && /[1-9]/.test(fraction.slice(decimalPlaces))) return null;
  const scale = 10n ** BigInt(decimalPlaces);
  return BigInt(whole) * scale + BigInt((fraction + "0".repeat(decimalPlaces)).slice(0, decimalPlaces) || "0");
}

export function formatJournalAmount(value: bigint, decimalPlaces: number): string {
  if (decimalPlaces === 0) return value.toString();
  const scale = 10n ** BigInt(decimalPlaces);
  return `${value / scale}.${(value % scale).toString().padStart(decimalPlaces, "0")}`;
}

export function validateJournalLines(lines: readonly JournalLineInput[], decimalPlaces: number): JournalFormValidation {
  const errors: string[] = [];
  let debit = 0n;
  let credit = 0n;

  if (lines.length < 2) errors.push("Add at least two Journal lines.");
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (!line.account_id) errors.push(`Line ${lineNumber}: select a nominal account.`);
    if (!line.description.trim()) errors.push(`Line ${lineNumber}: enter a description.`);
    const debitValue = parseJournalAmount(line.debit || "0", decimalPlaces);
    const creditValue = parseJournalAmount(line.credit || "0", decimalPlaces);
    if (debitValue === null || creditValue === null) {
      errors.push(`Line ${lineNumber}: use no more than ${decimalPlaces} base-currency decimal places.`);
      return;
    }
    if (!((debitValue > 0n && creditValue === 0n) || (creditValue > 0n && debitValue === 0n)))
      errors.push(`Line ${lineNumber}: enter one positive debit or credit amount.`);
    debit += debitValue;
    credit += creditValue;
  });
  if (debit <= 0n || debit !== credit) errors.push("Total debits and credits must be equal and greater than zero.");
  return { debit, credit, errors: [...new Set(errors)] };
}
