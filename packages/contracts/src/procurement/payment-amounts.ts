import { money, scaled } from "./amounts.js";

/** Transaction-entered percentage of gross; round half up to the currency cent. */
export function paymentTotals(entry: { amount: string; wht_rate: string; additional_wht: string }, allocated: string) {
  const gross = scaled(entry.amount, 2);
  const rate = scaled(entry.wht_rate, 2);
  if (rate > 10000n) throw new RangeError("WHT rate cannot exceed 100%.");
  const withholding = (gross * rate + 5000n) / 10000n;
  const additional = scaled(entry.additional_wht, 2);
  const unallocated = gross - scaled(allocated, 2);
  const net = gross - withholding - additional;
  if (unallocated < 0n) throw new RangeError("Payment allocations exceed the gross amount.");
  if (net < 0n) throw new RangeError("Withholding exceeds the gross amount.");
  if (gross > 99999999999999n) throw new RangeError("The payment amount exceeds the supported limit.");
  return {
    gross: money(gross),
    wht: money(withholding),
    additional_wht: money(additional),
    net: money(net),
    unallocated: money(unallocated),
  };
}
