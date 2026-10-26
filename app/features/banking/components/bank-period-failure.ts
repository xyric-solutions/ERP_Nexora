import { ApiError } from "@/lib/api/generated";

/** Submission can fail after a successful draft save; do not misreport lost data. */
export function bankPeriodFailure(error: unknown, draftReference: string): string | null {
  if (!(error instanceof ApiError) || !draftReference || !/^(PAYMENT|RECEIPT)_PERIOD_LOCKED$/.test(error.code))
    return null;
  return `Draft ${draftReference} is saved. Submission/approval is blocked because the Finance period for this posting date is not open. Choose a date in an open period or ask Finance to configure it. Nothing was approved or posted by this action.${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`;
}
