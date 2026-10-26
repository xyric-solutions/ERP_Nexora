/** Exact currency text for HR screens. Never route monetary amounts through Number. */
export function formatHrMinor(value: unknown, precision: unknown = 2): string {
  const text = String(value ?? "0"),
    scale = Number(precision ?? 2);
  if (!/^-?\d+$/.test(text) || !Number.isInteger(scale) || scale < 0 || scale > 4) return "Unavailable";
  const negative = text.startsWith("-"),
    digits = (negative ? text.slice(1) : text).padStart(scale + 1, "0");
  return (negative ? "-" : "") + (scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits);
}
export function parseHrCurrency(value: string, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 4 || !/^\d{1,15}(\.\d{1,4})?$/.test(value))
    throw new Error("Enter a valid nonnegative currency amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale) throw new Error("The rate exceeds the selected currency precision.");
  const minor = (BigInt(whole!) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0") || "0")).toString();
  if (minor.length > 15) throw new Error("The rate exceeds the supported amount.");
  return minor;
}
