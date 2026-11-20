import { decimal, decimalText, divideRounded } from "../finance/exact-money.js";
import { parseQuantity } from "../manufacturing/quantities.js";

/** Native-currency minor-unit math. Persisted source/tax/GL amounts remain server owned. */
export function salesMinor(value: string, precision: number) {
  if (!Number.isInteger(precision) || precision < 0 || precision > 8)
    throw new RangeError("Unsupported Sales currency precision.");
  const amount = decimal(value, 8),
    unit = 10n ** BigInt(8 - precision);
  if (amount % unit !== 0n) throw new RangeError("Sales amount exceeds the document currency precision.");
  return amount / unit;
}
export function salesAmounts(
  lines: readonly { quantity: string; unit_price: string; discount_amount?: string }[],
  precision: number,
  discount = "0",
) {
  if (!Number.isInteger(precision) || precision < 0 || precision > 8 || lines.length < 1 || lines.length > 100)
    throw new RangeError("Unsupported Sales amount precision or line count.");
  const amounts = lines.map((line) => {
    const quantity = parseQuantity(line.quantity),
      price = salesMinor(line.unit_price, precision),
      discount = salesMinor(line.discount_amount ?? "0", precision);
    if (quantity <= 0n) throw new RangeError("Sales quantity must be positive.");
    const gross = divideRounded(quantity * price, 10000n);
    if (discount > gross) throw new RangeError("Line discount exceeds its agreed price.");
    return gross - discount;
  });
  const total = amounts.reduce((sum, value) => sum + value, 0n);
  let remainingDiscount = salesMinor(discount, precision),
    remainingNet = total;
  if (remainingDiscount > total) throw new RangeError("Document discount exceeds the line net amount.");
  const result = amounts.map((amount) => {
    const share =
      remainingNet === 0n
        ? 0n
        : amount === remainingNet
          ? remainingDiscount
          : divideRounded(remainingDiscount * amount, remainingNet);
    remainingNet -= amount;
    remainingDiscount -= share;
    return { net: decimalText(amount - share, precision), document_discount: decimalText(share, precision) };
  });
  if (remainingDiscount !== 0n) throw new RangeError("Sales discounts did not allocate exactly.");
  return { lines: result, net: decimalText(total - salesMinor(discount, precision), precision) };
}
