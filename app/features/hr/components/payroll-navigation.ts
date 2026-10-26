import { hrPayrollJournalQuerySchema } from "@nexora/contracts";

/** Deep links select context only; every destination API still checks company access. */
export function payrollNavigationContext(reference?: string | undefined) {
  try {
    const parsed = hrPayrollJournalQuerySchema.safeParse(JSON.parse(reference ?? "{}"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
