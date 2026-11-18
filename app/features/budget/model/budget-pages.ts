export const budgetPages = {
  "planning-dashboard": {
    title: "Planning Dashboard",
    description: "Review the planning cycle, spending exposure and decisions awaiting review.",
    period: true,
    analysis: true,
    totals: true,
  },
  scenarios: {
    title: "Planning Scenarios",
    description: "Compare best, expected and worst cases using separate versions and recorded assumptions.",
    period: false,
    analysis: false,
    totals: false,
  },
  "budget-models": {
    title: "Budget Models",
    description: "Maintain reusable account allocations and spread rules, then apply them to a working draft.",
    period: false,
    analysis: false,
    totals: false,
  },
  "budget-entry": {
    title: "Dimensioned Budget Entry",
    description: "Build the account-by-period workbook, allocate amounts and save a controlled budget version.",
    period: false,
    analysis: false,
    totals: false,
  },
  "budget-import": {
    title: "Import & Spread",
    description: "Upload an allocation workbook, resolve validation errors and commit the preview to a draft.",
    period: false,
    analysis: false,
    totals: false,
  },
  "budget-approval": {
    title: "Budget Workflow",
    description: "Review submitted versions, decide requests and inspect the immutable approval history.",
    period: false,
    analysis: false,
    totals: false,
  },
  forecasts: {
    title: "Forecast & Reforecast",
    description: "Combine posted actuals through a cutoff with manual, historical or rolling estimates.",
    period: false,
    analysis: false,
    totals: false,
  },
  "commitment-control": {
    title: "Commitment Control",
    description: "Trace purchasing reservations, reconcile existing sources and govern residual exposure.",
    period: true,
    analysis: true,
    totals: false,
  },
  "budget-availability": {
    title: "Budget Availability",
    description: "Check the remaining allocation after posted actuals and open commitments for each spending pool.",
    period: true,
    analysis: true,
    totals: true,
  },
  "budget-actual": {
    title: "Budget vs Actual",
    description: "Investigate favorable and unfavorable variances, drill into posted GL and record commentary.",
    period: true,
    analysis: true,
    totals: true,
  },
  "planning-reports": {
    title: "Planning Reports",
    description: "Open a planning report or export the current company, version and period selection.",
    period: true,
    analysis: true,
    totals: false,
  },
} as const;
export type BudgetPage = keyof typeof budgetPages;
export function getBudgetPage(page: string) {
  return Object.entries(budgetPages).find(([key]) => key === page)?.[1] ?? budgetPages["budget-entry"];
}
