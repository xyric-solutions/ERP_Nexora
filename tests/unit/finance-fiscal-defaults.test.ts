import { describe, expect, it } from "vitest";
import type { FiscalCalendar } from "@nexora/contracts";
import { currentFiscalCalendar, defaultFiscalStart } from "../../app/features/finance/lib/finance-fiscal-defaults";

const year = (start: string, end: string): FiscalCalendar => ({
  id: start,
  company_id: "company",
  year: Number(start.slice(0, 4)),
  period_start: start,
  period_end: end,
  status: "active",
  version: 1,
});
describe("Finance fiscal-year defaults", () => {
  it("continues the stored July–June calendar rather than reverting to January", () => {
    expect(defaultFiscalStart([year("2026-07-01", "2027-06-30")], 1, "2026-11-17")).toBe("2027-07-01");
  });
  it("uses the latest stored end date regardless of directory order", () => {
    expect(
      defaultFiscalStart([year("2025-07-01", "2026-06-30"), year("2027-07-01", "2028-06-30")], 7, "2026-11-17"),
    ).toBe("2028-07-01");
  });
  it.each([
    ["2026-11-17", "2026-07-01"],
    ["2026-06-30", "2025-07-01"],
    ["2026-07-01", "2026-07-01"],
  ])("uses the saved July setup month for the first year on %s", (today, expected) => {
    expect(defaultFiscalStart([], 7, today)).toBe(expected);
  });
  it("preserves other configured year starts and leap-year endings", () => {
    expect(defaultFiscalStart([], 4, "2026-03-31")).toBe("2025-04-01");
    expect(defaultFiscalStart([year("2023-03-01", "2024-02-29")], undefined, "2024-01-01")).toBe("2024-03-01");
  });
  it("does not invent a January default when setup and calendars are unavailable", () => {
    expect(defaultFiscalStart([], undefined, "2026-11-17")).toBe("");
    expect(defaultFiscalStart([], 13, "2026-11-17")).toBe("");
  });
  it("selects the calendar covering the transaction date ahead of historical or future years", () => {
    const current = year("2026-07-01", "2027-06-30");
    expect(
      currentFiscalCalendar(
        [year("2024-07-01", "2025-06-30"), year("2027-07-01", "2028-06-30"), current],
        "2026-11-17",
      ),
    ).toBe(current);
  });
});
