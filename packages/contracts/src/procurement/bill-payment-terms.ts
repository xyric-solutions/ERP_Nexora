import { z } from "zod";
import { decimal, decimalText } from "../finance/exact-money.js";

export const billPaymentTermSchema = z.enum([
  "immediate",
  "days_15",
  "days_21",
  "days_30",
  "days_45",
  "end_following_month",
  "days_10_after_end_next_month",
  "percent_30_now_balance_60_days",
]);
export type BillPaymentTerm = z.infer<typeof billPaymentTermSchema>;
export const billPaymentTerms: readonly { value: BillPaymentTerm; label: string }[] = [
  { value: "immediate", label: "Immediate Payment" },
  { value: "days_15", label: "15 Days" },
  { value: "days_21", label: "21 Days" },
  { value: "days_30", label: "30 Days" },
  { value: "days_45", label: "45 Days" },
  { value: "end_following_month", label: "End of Following Month" },
  { value: "days_10_after_end_next_month", label: "10 Days after End of Next Month" },
  { value: "percent_30_now_balance_60_days", label: "30% Now, Balance 60 Days" },
];

/** Calendar dates use UTC exclusively; amounts retain exact cent arithmetic. */
export function financialPaymentSchedule(
  billDate: string,
  term: BillPaymentTerm,
  total: string,
  decimalPlaces: number,
) {
  z.iso.date().parse(billDate);
  billPaymentTermSchema.parse(term);
  z.number().int().min(0).max(8).parse(decimalPlaces);
  if (!/^\d{1,30}(\.\d{1,8})?$/.test(total)) throw new Error("Enter a valid bill total.");
  const amount = decimal(total, decimalPlaces);
  const date = new Date(`${billDate}T00:00:00Z`);
  const formatted = () => z.iso.date().parse(date.toISOString().slice(0, 10));
  if (term === "percent_30_now_balance_60_days") {
    const first = (amount * 30n + 50n) / 100n;
    date.setUTCDate(date.getUTCDate() + 60);
    return [
      { due_date: billDate, amount: decimalText(first, decimalPlaces) },
      { due_date: formatted(), amount: decimalText(amount - first, decimalPlaces) },
    ];
  }
  if (term === "end_following_month" || term === "days_10_after_end_next_month") {
    date.setUTCMonth(date.getUTCMonth() + 2, 0);
    if (term === "days_10_after_end_next_month") date.setUTCDate(date.getUTCDate() + 10);
  } else if (term !== "immediate") {
    const days = { days_15: 15, days_21: 21, days_30: 30, days_45: 45 };
    date.setUTCDate(date.getUTCDate() + days[term]);
  }
  return [{ due_date: formatted(), amount: decimalText(amount, decimalPlaces) }];
}

/** Purchase source forms retain their existing cent precision and amount bound. */
export function billPaymentSchedule(billDate: string, term: BillPaymentTerm, total: string) {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(total)) throw new Error("Enter a valid bill total.");
  return financialPaymentSchedule(billDate, term, total.replace(/^0+(?=\d)/, ""), 2);
}
