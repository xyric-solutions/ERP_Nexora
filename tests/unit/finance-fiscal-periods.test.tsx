// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { monthlyFiscalPeriods } from "@nexora/contracts";
const harness = vi.hoisted(() => ({
  setupMonth: undefined as number | undefined,
  api: { listFiscalCalendarCompanies: vi.fn(), listFiscalCalendars: vi.fn(), getFiscalCalendar: vi.fn() },
}));
vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    csrfToken: () => "csrf",
    session: {
      tenant_id: "tenant",
      user: {
        id: "admin",
        roles: ["super_administrator"],
        permissions: [
          "platform.fiscal_calendar.read",
          "platform.fiscal_calendar.create",
          "platform.accounting_period.read",
          "platform.approval.override",
        ],
      },
    },
  }),
}));
vi.mock("@/features/administration/model/organisation-setup", () => ({
  readOrganisationSetup: () => (harness.setupMonth ? { financial_year_start_month: harness.setupMonth } : null),
}));
vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => vi.fn() }));
import { FinanceFiscalPeriods } from "../../app/features/finance/views/finance-fiscal-periods";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const calendar = {
  id: "fy-july",
  company_id: "company",
  year: 2026,
  period_start: "2026-07-01",
  period_end: "2027-06-30",
  status: "active",
  version: 1,
};
let container: HTMLDivElement, root: Root;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  harness.setupMonth = undefined;
  harness.api.listFiscalCalendarCompanies.mockResolvedValue({
    items: [{ id: "company", code: "CO", name: "Company" }],
  });
  harness.api.listFiscalCalendars.mockResolvedValue({ items: [calendar], next_cursor: null });
  harness.api.getFiscalCalendar.mockResolvedValue({
    calendar,
    periods: monthlyFiscalPeriods(calendar.period_start).map((period) => ({
      ...period,
      id: `month-${period.period_number}`,
      company_id: "company",
      fiscal_calendar_id: calendar.id,
      status: "soft_close",
      version: 1,
    })),
    history: [],
    history_has_more: false,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});
describe("Finance fiscal setup defaults", () => {
  it("retains the stored July–June year and proposes its next year without writing periods", async () => {
    await act(async () => root.render(<FinanceFiscalPeriods />));
    await settle();
    await settle();
    expect(container.querySelector("#fiscal-year")).toHaveProperty("value", "fy-july");
    expect(container.querySelector("#fiscal-start")).toHaveProperty("value", "2027-07-01");
    expect(container.querySelector("#fiscal-end")).toHaveProperty("value", "2028-06-30");
    expect(container.textContent).toContain("2026-07-01");
    expect(container.textContent).toContain("Soft Closed");
  });
  it("uses the saved setup month when the company has no calendar", async () => {
    harness.setupMonth = 7;
    harness.api.listFiscalCalendars.mockResolvedValue({ items: [], next_cursor: null });
    await act(async () => root.render(<FinanceFiscalPeriods />));
    await settle();
    const input = container.querySelector("#fiscal-start");
    if (!(input instanceof HTMLInputElement)) throw Error("Missing fiscal date");
    expect(input.value.endsWith("-07-01")).toBe(true);
    expect(container.querySelector("#fiscal-end")?.getAttribute("readonly")).not.toBeNull();
  });
});
