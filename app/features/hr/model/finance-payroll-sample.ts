import type { HrFinancePayrollDashboard } from "@nexora/contracts";

type PeriodSummary = HrFinancePayrollDashboard["recent_periods"][number];

/**
 * Layout preview only. Shown in local development when a company has no
 * payroll periods, always labelled "Sample data", never sent to the API and
 * never included in a production build. Remove once demo payroll periods are
 * seeded through the governed payroll workflow.
 */
export const showFinancePayrollSample = process.env.NODE_ENV === "development";

const row = (
  month: string,
  state: PeriodSummary["state"],
  employees: number,
  gross: number,
  deductions: number,
  journal: PeriodSummary["journal_state"],
  payment: string | null,
  confirmed: number,
): PeriodSummary => {
  const net = gross - deductions;
  return {
    id: `sample-${month}`,
    month,
    state,
    run_number: 1,
    currency_code: "PKR",
    employee_count: employees,
    gross: gross.toFixed(2),
    deductions: deductions.toFixed(2),
    net: net.toFixed(2),
    warning_count: state === "under_review" ? 3 : 0,
    journal_state: journal,
    journal_balanced: journal ? true : null,
    payment_state: payment,
    payment_count: payment ? employees : 0,
    confirmed_payment_count: confirmed,
    payment_total: payment ? net.toFixed(2) : "0.00",
  };
};

export const financePayrollSamplePeriods: readonly PeriodSummary[] = [
  row("2026-10-01", "under_review", 52, 11_846_500, 1_472_310, null, null, 0),
  row("2026-09-01", "approved", 51, 11_602_000, 1_438_640, "prepared", null, 0),
  row("2026-08-01", "posted", 50, 11_395_250, 1_410_980, "posted", "approved", 0),
  row("2026-07-01", "paid", 49, 11_120_800, 1_377_420, "posted", "confirmed", 49),
  row("2026-06-01", "closed", 48, 10_904_600, 1_351_070, "posted", "confirmed", 48),
  row("2026-05-01", "closed", 48, 10_872_300, 1_348_115, "posted", "confirmed", 48),
];
