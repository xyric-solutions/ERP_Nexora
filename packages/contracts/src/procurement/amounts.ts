// Decimal transport helpers shared by the API and its client-side preview.
import { decimal } from "../finance/exact-money.js";

/** Source forms accept cents. Floor a higher-precision AP remainder so a form
 * never offers more than is actually outstanding after other reservations. */
export function purchaseAvailableAmount(document: {
  total_amount: string;
  reserved_amount: string;
  outstanding_amount?: string | undefined;
}) {
  const available =
    decimal(document.outstanding_amount ?? document.total_amount, 8) - decimal(document.reserved_amount, 8);
  return money(available > 0n ? available / 1000000n : 0n);
}
export function scaled(value: string, places: number): bigint {
  if (!new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(value)) throw new RangeError("Enter a valid decimal amount.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}
export function money(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
interface AmountLine {
  id?: string | undefined;
  source_line_id?: string | null | undefined;
  quantity: string;
  unit_price: string;
  tax_percent: string;
  discount_amount?: string | undefined;
  allocated_discount_amount?: string | undefined;
}
interface AmountCharge {
  id: string;
  amount: string;
  tax_percent: string;
}
interface Adjustments {
  discount_amount?: string | undefined;
  additional_charges?: readonly AmountCharge[] | undefined;
}
const limit = 99999999999999n;
const rounded = (value: bigint, denominator: bigint) => (value + denominator / 2n) / denominator;

/** Largest-remainder allocation: exact total, stable ties, no floating point. */
export function allocatePurchaseAmount(
  amount: bigint,
  weights: readonly bigint[],
  identities: readonly string[],
): bigint[] {
  const basis = weights.reduce((sum, weight) => sum + weight, 0n);
  if (amount < 0n || weights.some((weight) => weight < 0n) || (amount > 0n && basis === 0n))
    throw new RangeError("The purchase allocation needs a positive basis.");
  if (!basis) return weights.map(() => 0n);
  const shares = weights.map((weight) => (amount * weight) / basis);
  let remaining = amount - shares.reduce((sum, share) => sum + share, 0n);
  const order = weights
    .map((weight, index) => ({ index, remainder: (amount * weight) % basis, id: identities[index] ?? String(index) }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (const item of order) {
    if (!remaining) break;
    shares[item.index] = shares[item.index]! + 1n;
    remaining--;
  }
  return shares;
}

/** Authoritative cents-based breakdown shared by preview, procurement and AP. */
export function purchaseTotals(lines: readonly AmountLine[], adjustments: Adjustments = {}) {
  const bases = lines.map((line) => rounded(scaled(line.quantity, 4) * scaled(line.unit_price, 2), 10000n));
  const discounts = lines.map((line, index) => {
    const discount = scaled(line.discount_amount ?? "0", 2);
    if (discount > bases[index]!) throw new RangeError("Line discount cannot exceed the line subtotal.");
    return discount;
  });
  const weights = bases.map((basis, index) => basis - discounts[index]!);
  const overall = scaled(adjustments.discount_amount ?? "0", 2);
  if (overall > weights.reduce((sum, weight) => sum + weight, 0n))
    throw new RangeError("Purchase discount cannot exceed the amount after line discounts.");
  const inherited = lines.some((line) => line.allocated_discount_amount !== undefined);
  const shares = inherited
    ? lines.map((line) => scaled(line.allocated_discount_amount ?? "0", 2))
    : allocatePurchaseAmount(
        overall,
        weights,
        lines.map((line, index) => line.source_line_id ?? line.id ?? String(index)),
      );
  if (
    shares.reduce((sum, share) => sum + share, 0n) !== overall ||
    shares.some((share, index) => share > weights[index]!)
  )
    throw new RangeError("Allocated purchase discounts must match the document discount and line bases.");
  const lineAmounts = lines.map((line, index) => {
    const net = weights[index]! - shares[index]!;
    const rate = scaled(line.tax_percent, 2);
    if (rate > 10000n) throw new RangeError("Tax rate cannot exceed 100%.");
    const tax = rounded(net * rate, 10000n);
    return {
      id: line.id,
      subtotal: money(bases[index]!),
      line_discount: money(discounts[index]!),
      document_discount: money(shares[index]!),
      net: money(net),
      tax: money(tax),
      total: money(net + tax),
    };
  });
  const charges = (adjustments.additional_charges ?? []).map((charge) => {
    const net = scaled(charge.amount, 2),
      rate = scaled(charge.tax_percent, 2);
    if (rate > 10000n) throw new RangeError("Tax rate cannot exceed 100%.");
    const tax = rounded(net * rate, 10000n);
    return { id: charge.id, net: money(net), tax: money(tax), total: money(net + tax) };
  });
  const sum = (values: readonly string[]) => values.reduce((total, value) => total + scaled(value, 2), 0n);
  const subtotal = bases.reduce((total, value) => total + value, 0n);
  const discount = overall + discounts.reduce((total, value) => total + value, 0n);
  const additional = sum(charges.map((charge) => charge.net));
  const tax = sum([...lineAmounts, ...charges].map((line) => line.tax));
  const net = subtotal - discount + additional,
    total = net + tax;
  if ([subtotal, discount, additional, tax, net, total].some((amount) => amount > limit))
    throw new RangeError("The document amount exceeds the supported limit.");
  return {
    subtotal: money(subtotal),
    discount: money(discount),
    tax: money(tax),
    additional_charges: money(additional),
    net: money(net),
    total: money(total),
    lines: lineAmounts,
    charges,
  };
}
export function lineTotal(line: AmountLine): bigint {
  return scaled(purchaseTotals([line], { discount_amount: line.allocated_discount_amount }).total, 2);
}
export function documentTotal(lines: readonly AmountLine[], adjustments: Adjustments = {}): string {
  return purchaseTotals(lines, adjustments).total;
}

/** Format supported purchase currencies without converting large decimals to Number. */
export function formatPurchaseMoney(value: string): string {
  const [whole, fraction] = money(scaled(value, 2)).split(".");
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

interface SourceCharge extends AmountCharge {
  source_charge_id?: string | null | undefined;
}
export interface PurchaseConsumption {
  lines: readonly { source_line_id: string; quantity: string; line_discount: string; document_discount: string }[];
  charges: readonly { source_charge_id: string; amount: string }[];
}

/** Cumulative allocation leaves the final partial document the exact remaining cents. */
export function inheritPurchaseAdjustments<T extends AmountLine, C extends SourceCharge>(
  source: {
    discount_amount?: string | undefined;
    lines: readonly AmountLine[];
    additional_charges?: readonly C[] | undefined;
  },
  selected: readonly T[],
  consumed: PurchaseConsumption = { lines: [], charges: [] },
) {
  const original = purchaseTotals(source.lines, source);
  const inheritedLines = selected.map((line) => {
    const sourceIndex = source.lines.findIndex((item) => item.id === line.source_line_id);
    if (sourceIndex < 0) throw new RangeError("Every line must reference its approved source.");
    const sourceLine = source.lines[sourceIndex]!,
      basis = original.lines[sourceIndex]!;
    const quantity = scaled(line.quantity, 4),
      full = scaled(sourceLine.quantity, 4);
    const usedLines = consumed.lines.filter((item) => item.source_line_id === sourceLine.id);
    const usedQuantity = usedLines.reduce((sum, item) => sum + scaled(item.quantity, 4), 0n);
    if (full <= 0n || quantity + usedQuantity > full)
      throw new RangeError("The quantity exceeds the approved source remaining quantity.");
    const portion = (total: string, field: "line_discount" | "document_discount") => {
      const used = usedLines.reduce((sum, item) => sum + scaled(item[field], 2), 0n);
      const result = rounded(scaled(total, 2) * (usedQuantity + quantity), full) - used;
      if (result < 0n) throw new RangeError("Refresh the source allocation before saving.");
      return money(result);
    };
    return {
      ...line,
      discount_amount: portion(basis.line_discount, "line_discount"),
      allocated_discount_amount: portion(basis.document_discount, "document_discount"),
    };
  });
  // Quantity-weighted source bases as exact rational numbers; no premature rounding.
  const gcd = (a: bigint, b: bigint): bigint => {
    while (b) {
      const next = a % b;
      a = b;
      b = next;
    }
    return a;
  };
  let weightNumerator = 0n,
    weightDenominator = 1n;
  let chargeBases = original.lines.map((line) => scaled(line.net, 2));
  if (chargeBases.every((basis) => basis === 0n)) chargeBases = original.lines.map((line) => scaled(line.subtotal, 2));
  if (chargeBases.every((basis) => basis === 0n)) chargeBases = source.lines.map((line) => scaled(line.quantity, 4));
  const sourceNet = chargeBases.reduce((sum, basis) => sum + basis, 0n);
  for (const [index, line] of source.lines.entries()) {
    const full = scaled(line.quantity, 4);
    const quantity = [...consumed.lines, ...selected]
      .filter((item) => item.source_line_id === line.id)
      .reduce((sum, item) => sum + scaled(item.quantity, 4), 0n);
    if (!full || quantity > full) throw new RangeError("The quantity exceeds the approved source remaining quantity.");
    const basis = chargeBases[index]!;
    weightNumerator = weightNumerator * full + basis * quantity * weightDenominator;
    weightDenominator *= full;
    const divisor = gcd(weightNumerator, weightDenominator);
    weightNumerator /= divisor;
    weightDenominator /= divisor;
  }
  const charges = (source.additional_charges ?? []).map((charge) => {
    const used = consumed.charges
      .filter((item) => item.source_charge_id === charge.id)
      .reduce((sum, item) => sum + scaled(item.amount, 2), 0n);
    if (!sourceNet && scaled(charge.amount, 2))
      throw new RangeError("Charges require a positive product/service allocation basis.");
    const cumulative = sourceNet
      ? rounded(scaled(charge.amount, 2) * weightNumerator, sourceNet * weightDenominator)
      : 0n;
    if (cumulative < used) throw new RangeError("Refresh the source charge allocation before saving.");
    return { ...charge, source_charge_id: charge.id, amount: money(cumulative - used) };
  });
  return {
    lines: inheritedLines,
    discount_amount: money(inheritedLines.reduce((sum, line) => sum + scaled(line.allocated_discount_amount, 2), 0n)),
    additional_charges: charges,
  };
}
