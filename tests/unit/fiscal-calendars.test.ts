import { describe, it, expect } from "vitest";
import {
  monthlyFiscalPeriods,
  createFiscalCalendarSchema,
  changeFiscalPeriodsSchema,
} from "../../packages/contracts/src/finance/periods.js";
describe("regular company fiscal calendars", () => {
  it.each(["2026-01-01", "2026-07-01", "2027-04-01", "2023-03-01", "2024-02-01"])(
    "generates exactly twelve contiguous inclusive months from %s",
    (start) => {
      const rows = monthlyFiscalPeriods(start);
      expect(rows).toHaveLength(12);
      expect(rows[0]?.period_start).toBe(start);
      for (let i = 0; i < 12; i++) {
        expect(rows[i]!.period_number).toBe(i + 1);
        expect(rows[i]!.period_start.endsWith("-01")).toBe(true);
        if (i > 0) {
          const prior = new Date(`${rows[i - 1]!.period_end}T00:00:00Z`);
          prior.setUTCDate(prior.getUTCDate() + 1);
          expect(prior.toISOString().slice(0, 10)).toBe(rows[i]!.period_start);
        }
      }
    },
  );
  it("supports July–June and leap years without local timezone arithmetic", () => {
    expect(monthlyFiscalPeriods("2026-07-01")[11]?.period_end).toBe("2027-06-30");
    expect(monthlyFiscalPeriods("2023-03-01")[11]?.period_end).toBe("2024-02-29");
    expect(monthlyFiscalPeriods("2024-01-01")[1]?.period_end).toBe("2024-02-29");
  });
  it.each(["2026-01-15", "2026-02-30", "2026-13-01", "1899-01-01", "2999-02-01", "", "01/07/2026"])(
    "rejects invalid/nonstandard date %s",
    (start) => {
      expect(() => monthlyFiscalPeriods(start)).toThrow(RangeError);
      expect(createFiscalCalendarSchema.safeParse({ company_id: "company", period_start: start }).success).toBe(false);
    },
  );
  it("allows the supported final year only when it fits in the database range", () =>
    expect(monthlyFiscalPeriods("2999-01-01")[11]?.period_end).toBe("2999-12-31"));
  it("requires explicit bounded period selections and reasons for opening/locking", () => {
    const input = { company_id: "company", periods: [{ id: "one", expected_version: 1 }], status: "open" };
    expect(changeFiscalPeriodsSchema.safeParse(input).success).toBe(false);
    expect(changeFiscalPeriodsSchema.safeParse({ ...input, reason: "Approved test setup" }).success).toBe(true);
    expect(changeFiscalPeriodsSchema.safeParse({ ...input, status: "soft_close" }).success).toBe(true);
    expect(
      changeFiscalPeriodsSchema.safeParse({ ...input, periods: [...input.periods, ...input.periods], reason: "Test" })
        .success,
    ).toBe(false);
    expect(changeFiscalPeriodsSchema.safeParse({ ...input, reason: "Test", bypass: true }).success).toBe(false);
  });
});
