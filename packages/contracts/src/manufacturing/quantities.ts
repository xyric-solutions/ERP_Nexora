/**
 * Exact four-decimal quantity arithmetic for Manufacturing. Quantities travel as
 * decimal strings (for example "2", "0.5", "12.2500") and are computed as scaled
 * integers so the server and the browser always produce the same figures.
 */
export const QUANTITY_SCALE = 4;
const factor = 10n ** BigInt(QUANTITY_SCALE);
const pattern = /^(\d{1,16})(?:\.(\d{1,4}))?$/;

/** Parses a non-negative quantity of up to four decimals into ten-thousandths. */
export function parseQuantity(value: string): bigint {
  const match = pattern.exec(value.trim());
  if (!match) throw new RangeError("Use a quantity with up to 4 decimal places.");
  return BigInt(match[1]!) * factor + BigInt((match[2] ?? "").padEnd(QUANTITY_SCALE, "0"));
}

/** True when the text is a valid non-negative quantity. */
export function isQuantity(value: string): boolean {
  return pattern.test(value.trim());
}

/** Formats ten-thousandths as the shortest exact decimal ("2", "0.5", "1.0625"). */
export function formatQuantity(scaled: bigint): string {
  const negative = scaled < 0n,
    absolute = negative ? -scaled : scaled;
  const whole = absolute / factor,
    fraction = (absolute % factor).toString().padStart(QUANTITY_SCALE, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Normalises a quantity string, e.g. "2.5000" -> "2.5". */
export function normalizeQuantity(value: string): string {
  return formatQuantity(parseQuantity(value));
}

export function quantitiesEqual(left: string, right: string): boolean {
  return parseQuantity(left) === parseQuantity(right);
}

/**
 * Scales one Bill of Materials line to a target output:
 * `line quantity × target quantity ÷ BOM output quantity`, rounded half-up to 4 decimals.
 */
export function scaleQuantity(lineQuantity: string, bomOutputQuantity: string, targetQuantity: string): string {
  const line = parseQuantity(lineQuantity),
    output = parseQuantity(bomOutputQuantity),
    target = parseQuantity(targetQuantity);
  if (output <= 0n) throw new RangeError("The Bill of Materials output quantity must be greater than zero.");
  // (line/f) × (target/f) ÷ (output/f) = line×target ÷ (output×f); scaled by f again gives line×target ÷ output.
  return formatQuantity((2n * line * target + output) / (2n * output));
}

/** Scales every BOM component line to the target quantity, keeping all other line fields. */
export function scaleComponents<T extends { quantity: string }>(
  bomLines: readonly T[],
  bomOutputQuantity: string,
  targetQuantity: string,
): (T & { standard_quantity: string })[] {
  return bomLines.map((line) => ({
    ...line,
    standard_quantity: scaleQuantity(line.quantity, bomOutputQuantity, targetQuantity),
  }));
}

/** Difference between an order quantity and its standard, with the percentage (null when the standard is zero). */
export function quantityVariance(standardQuantity: string, orderQuantity: string) {
  const standard = parseQuantity(standardQuantity),
    actual = parseQuantity(orderQuantity),
    difference = actual - standard;
  const percent = standard === 0n ? null : Number((difference * 10000n * 100n) / standard) / 10000;
  return { difference: formatQuantity(difference), percent, changed: difference !== 0n };
}
