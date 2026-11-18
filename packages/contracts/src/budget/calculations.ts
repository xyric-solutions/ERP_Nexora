import { decimal, decimalText, divideRounded } from "../finance/exact-money.js";

/** Deterministic spread: preserve every minor unit, including the final remainder. */
export function spreadBudget(amount: string, weights: readonly string[], scale: number): string[] {
  if (!weights.length || weights.length > 36) throw new Error("Select between one and 36 periods.");
  const total = decimal(amount, scale),
    values = weights.map((v) => decimal(v, 4));
  const denominator = values.reduce((a, b) => a + b, 0n);
  if (!denominator) throw new Error("At least one spread weight must be positive.");
  let remaining = total;
  const last = values.findLastIndex((v) => v > 0n);
  return values.map((weight, index) => {
    const value = index === last ? remaining : (total * weight) / denominator;
    remaining -= value;
    return decimalText(value, scale);
  });
}
export function budgetPercent(numerator: bigint, denominator: bigint): string | null {
  return denominator === 0n
    ? null
    : decimalText(divideRounded(numerator * 10000n, denominator < 0n ? -denominator : denominator), 2);
}
export function budgetDimensionKey(dimensions: Readonly<Record<string, string | undefined>>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(dimensions)
        .filter(([, v]) => v)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}
export function budgetPoolsOverlap(
  a: Readonly<Record<string, string | undefined>>,
  b: Readonly<Record<string, string | undefined>>,
): boolean {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => !a[key] || !b[key] || a[key] === b[key]);
}
export function budgetPoolMatches(
  pool: Readonly<Record<string, string | undefined>>,
  movement: Readonly<Record<string, string | undefined>>,
): boolean {
  return Object.entries(pool).every(([key, value]) => !value || movement[key] === value);
}
