import { calculateHrSettlementMinor, type HrLifecycleCaseTerms } from "@nexora/contracts";
import { HrApiError } from "./source-repository.js";
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_LIFECYCLE_REVIEW_REQUIRED", message);
};
export function lifecycleSettlement(
  lines: Pick<
    Extract<HrLifecycleCaseTerms, { kind: "settlement" }>["lines"][number],
    "direction" | "amount_minor" | "calculation"
  >[],
) {
  let earnings = 0n,
    deductions = 0n;
  for (const l of lines) {
    if (l.calculation) {
      let calculated: string;
      try {
        calculated = calculateHrSettlementMinor(
          l.calculation.quantity,
          l.calculation.rate_minor,
          l.calculation.rate_divisor,
          l.calculation.rate_multiplier,
        );
      } catch {
        fail("Review the exact settlement quantity and rate.");
      }
      if (calculated! !== l.amount_minor || l.calculation.rounding !== "half_up")
        fail("The settlement line amount must equal its exact reviewed quantity and rate.");
    }
    if (!/^(0|[1-9][0-9]{0,14})$/.test(l.amount_minor)) fail("Use exact nonnegative minor currency units.");
    if (l.direction === "earning") earnings += BigInt(l.amount_minor);
    else deductions += BigInt(l.amount_minor);
  }
  return {
    earnings_minor: earnings.toString(),
    deductions_minor: deductions.toString(),
    net_minor: (earnings - deductions).toString(),
    payment_status: "not_paid",
    posting_status: "statement_only",
  };
}
