import type { BankTransferMode } from "@nexora/contracts";
import { formatDecimalDisplay } from "@/shared/lib/decimal-display";

export interface EditableTransferLine {
  id: string;
  date: string;
  fromBankId: string;
  reference: string;
  mode: BankTransferMode;
  toBankId: string;
  details: string;
  amount: string;
  exchangeRate: string;
  bankCharge: string;
  chargeExpanded: boolean;
}

export const transferModes: ReadonlyArray<{ value: BankTransferMode; label: string }> = [
  { value: "internal", label: "Internal" },
  { value: "local_bank", label: "Local bank" },
  { value: "wire_swift", label: "Wire / SWIFT" },
  { value: "standing_order", label: "Standing order" },
];

export const transferAmountPattern = /^(0|[1-9]\d{0,29})(?:\.\d{1,8})?$/;
export const transferRatePattern = /^(0|[1-9]\d{0,19})(?:\.\d{1,18})?$/;

function scaled(value: string, places: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}

function decimal(value: bigint, places: number): string {
  const scale = 10n ** BigInt(places);
  return `${value / scale}.${(value % scale).toString().padStart(places, "0")}`;
}

export function transferAmountUnits(value: string): bigint | null {
  return transferAmountPattern.test(value) ? scaled(value, 8) : null;
}

export function displayTransferTotal(value: bigint): string {
  const [whole, fraction] = formatDecimalDisplay(decimal(value, 8)).split(".");
  const groupedWhole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(BigInt(whole));
  const separator =
    new Intl.NumberFormat(undefined).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  return `${groupedWhole}${separator}${fraction}`;
}

/** Informational quote only: the API applies currency precision and confirms the saved amount. */
export function estimateFxTransferAmount(amount: string, rate: string): string | null {
  const units = transferAmountUnits(amount);
  if (units === null || units <= 0n || !transferRatePattern.test(rate) || !/[1-9]/.test(rate)) return null;
  return formatDecimalDisplay(decimal(units * scaled(rate, 18), 26));
}

export function reciprocalFxTransferRate(rate: string): string | null {
  if (!transferRatePattern.test(rate) || !/[1-9]/.test(rate)) return null;
  const divisor = scaled(rate, 18);
  return decimal((10n ** 36n + divisor / 2n) / divisor, 18);
}
