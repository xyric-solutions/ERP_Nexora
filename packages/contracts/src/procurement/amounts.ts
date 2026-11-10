// Decimal transport helpers shared by the API and its client-side preview.
export function scaled(value: string, places: number): bigint {
  if (!new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(value)) throw new RangeError("Enter a valid decimal amount.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}
export function money(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
export function lineTotal(line: { quantity: string; unit_price: string; tax_percent: string }): bigint {
  const net = (scaled(line.quantity, 4) * scaled(line.unit_price, 2) + 5000n) / 10000n;
  return net + (net * scaled(line.tax_percent, 2) + 5000n) / 10000n;
}
export function documentTotal(lines: readonly { quantity: string; unit_price: string; tax_percent: string }[]): string {
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0n);
  if (total > 99999999999999n) throw new RangeError("The document amount exceeds the supported limit.");
  return money(total);
}
