/** Display rounding only; never use this value for editing, saving or calculations. */
export function formatDecimalDisplay(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return "—";
  const fraction = (match[2] ?? "").padEnd(3, "0");
  const hundredths = BigInt(match[1]) * 100n + BigInt(fraction.slice(0, 2)) + (fraction[2] >= "5" ? 1n : 0n);
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}`;
}
