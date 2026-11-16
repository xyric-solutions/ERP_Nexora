import { describe, expect, it } from "vitest";
import {
  assetCategorySchema,
  fixedAssetSchema,
  assetDetailsSchema,
  assetAssignmentSchema,
} from "../../packages/contracts/src/index.js";
import {
  depreciationForPeriod,
  minor,
  monthEnd,
  money,
  nextDay,
  dailyEntitlement,
} from "../../server/api/src/modules/fixed-assets/calculations.js";
import { assetFileMediaType } from "../../server/api/src/modules/fixed-assets/attachments.js";

function asset() {
  const category = assetCategorySchema.parse({
    id: "category",
    company_id: "company",
    code: "FAC-001",
    version: 1,
    name: "Computers",
    active: true,
    asset_account_id: "asset",
    accumulated_account_id: "accumulated",
    expense_account_id: "expense",
    gain_account_id: "gain",
    loss_account_id: "loss",
    impairment_account_id: "impairment",
    useful_life_months: 48,
    method: "straight_line",
    annual_rate_percent: 25,
    residual_percent: 4,
    convention: "full_month",
    capitalization_threshold: "0",
  });
  return fixedAssetSchema.parse({
    id: "asset",
    company_id: "company",
    code: "FA-001",
    category_id: category.id,
    category_name: category.name,
    category,
    supplier_id: "supplier",
    source_line_id: "source",
    acquisition_date: "2026-09-01",
    base_currency: "PKR",
    decimal_places: 2,
    cost: "250000",
    residual_value: "10000",
    accumulated_depreciation: "0",
    impairment: "0",
    net_book_value: "250000",
    useful_life_months: 48,
    method: "straight_line",
    annual_rate_percent: 25,
    in_service_date: "2026-09-01",
    depreciation_start: "2026-09-01",
    last_depreciation_end: null,
    last_financial_date: "2026-09-01",
    assignment: assetAssignmentSchema.parse({}),
    assignment_date: "2026-09-01",
    details: assetDetailsSchema.parse({ name: "Laptop", condition: "new" }),
    status: "active",
    version: 4,
    created_by: "maker",
    approved_by: "checker",
    created_at: "2026-09-01T00:00:00Z",
  });
}
describe("Exact governed asset depreciation", () => {
  const dailyAsset = () => ({
    ...asset(),
    cost: "1000000",
    residual_value: "0",
    useful_life_months: 60,
    in_service_date: "2027-01-01",
    depreciation_start: "2027-01-01",
    last_financial_date: "2027-01-01",
    category: { ...asset().category, calculation_basis: "actual_actual" as const },
    method: "reducing_balance" as const,
    annual_rate_percent: 15,
  });
  it("accrues the requested 15% WDV example using actual days rather than a monthly percentage", () => {
    const a = {
      ...dailyAsset(),
      depreciation_start: "2026-11-01",
      in_service_date: "2026-11-01",
      last_financial_date: "2026-11-01",
    };
    expect(dailyEntitlement(a, "2026-11-30")).toBe(1232877n);
    expect(dailyEntitlement(a, "2026-12-31")).toBe(2506849n);
  });
  it("keeps the annual WDV basis stable and applies the rate to the following year's opening value", () => {
    const a = dailyAsset();
    expect(dailyEntitlement(a, "2027-12-31")).toBe(15000000n);
    expect(dailyEntitlement(a, "2028-12-31")).toBe(27750000n);
    expect(dailyEntitlement({ ...a, method: "double_declining" }, "2027-12-31")).toBe(40000000n);
    expect(dailyEntitlement({ ...a, method: "double_declining" }, "2028-12-31")).toBe(64000000n);
  });
  it("uses 366 days in leap years and preserves the residual floor at useful-life end", () => {
    const a = { ...dailyAsset(), depreciation_start: "2028-01-01" };
    expect(dailyEntitlement(a, "2028-02-29")).toBe(2459016n);
    expect(dailyEntitlement({ ...a, residual_value: "100000" }, "2040-01-01")).toBe(90000000n);
  });
  it("makes separately posted monthly accruals reconcile to the same cumulative daily entitlement", () => {
    let a = { ...dailyAsset(), method: "double_declining" as const },
      total = 0n,
      start = "2027-01-01";
    for (let month = 0; month < 24; month++) {
      const end = monthEnd(start),
        detail = depreciationForPeriod(a, start, end);
      expect(detail.skip_reason).toBeNull();
      total += minor(detail.amount, 2);
      a = { ...a, accumulated_depreciation: money(total, 2), last_depreciation_end: end };
      start = nextDay(end);
    }
    expect(total).toBe(64000000n);
  });
  it("rebases prospectively after a governed impairment without charging historical depreciation again", () => {
    const a = {
      ...dailyAsset(),
      impairment: "400000",
      accumulated_depreciation: "100000",
      last_depreciation_end: "2027-06-30",
      last_financial_date: "2027-06-30",
      accrual_basis: { start: "2027-07-01", opening_carrying: "500000", opening_accumulated: "100000" },
    };
    expect(depreciationForPeriod(a, "2027-07-01", "2027-07-31").amount).toBe("6369.86");
  });
  it("calculates the requested PKR 250,000 laptop over four years at PKR 5,000 per month", () => {
    const a = asset();
    expect(depreciationForPeriod(a, "2026-09-01", "2026-09-30")).toMatchObject({
      amount: "5000.00",
      closing_carrying: "245000.00",
      skip_reason: null,
    });
  });
  it("reconciles every month to the residual floor without rounding drift", () => {
    let a = asset(),
      start = "2026-09-01",
      total = 0n;
    for (let i = 0; i < 48; i++) {
      const end = monthEnd(start),
        row = depreciationForPeriod(a, start, end);
      expect(row.skip_reason).toBeNull();
      total += minor(row.amount, 2);
      a = { ...a, accumulated_depreciation: money(total, 2), last_depreciation_end: end };
      start = nextDay(end);
    }
    expect(total).toBe(24000000n);
    expect(depreciationForPeriod(a, start, monthEnd(start)).amount).toBe("0.00");
  });
  it.each(["draft", "submitted", "approved", "fully_depreciated", "returned", "disposed"] as const)(
    "never depreciates a %s asset",
    (status) => {
      expect(depreciationForPeriod({ ...asset(), status }, "2026-09-01", "2026-09-30").amount).toBe("0.00");
    },
  );
  it("rejects missing earlier periods, commencement violations and duplicated periods", () => {
    const a = asset();
    expect(depreciationForPeriod(a, "2026-10-01", "2026-10-31").skip_reason).toMatch(/preceding/);
    expect(depreciationForPeriod(a, "2026-08-01", "2026-08-31").skip_reason).toMatch(/not commenced/);
    expect(
      depreciationForPeriod({ ...a, last_depreciation_end: "2026-09-30" }, "2026-09-01", "2026-09-30").skip_reason,
    ).toMatch(/already/);
  });
  it("prorates actual first-month days and finishes at the useful-life anniversary", () => {
    let a = {
        ...asset(),
        category: { ...asset().category, convention: "actual_days" as const },
        in_service_date: "2026-09-16",
        depreciation_start: "2026-09-16",
      },
      start = "2026-09-01",
      total = 0n,
      months = 0;
    expect(depreciationForPeriod(a, start, monthEnd(start)).amount).toBe("2500.00");
    for (let i = 0; i < 50; i++) {
      const end = monthEnd(start),
        row = depreciationForPeriod(a, start, end);
      if (row.skip_reason) break;
      total += minor(row.amount, 2);
      months++;
      a = { ...a, accumulated_depreciation: money(total, 2), last_depreciation_end: end };
      start = nextDay(end);
    }
    expect(months).toBe(49);
    expect(total).toBe(24000000n);
  });
  it("calculates reducing balance with an exact configured annual rate and residual cap", () => {
    let a = { ...asset(), method: "reducing_balance" as const, annual_rate_percent: 24 };
    const first = depreciationForPeriod(a, "2026-09-01", "2026-09-30");
    expect(first.amount).toBe("5000.00");
    a = { ...a, accumulated_depreciation: first.amount, last_depreciation_end: "2026-09-30" };
    expect(depreciationForPeriod(a, "2026-10-01", "2026-10-31").amount).toBe("4900.00");
  });
  it("rebases remaining depreciation after impairment and refuses retrospective financial effects", () => {
    const a = {
      ...asset(),
      impairment: "48000",
      accumulated_depreciation: "5000",
      last_depreciation_end: "2026-09-30",
      last_financial_date: "2026-10-01",
    };
    const row = depreciationForPeriod(a, "2026-10-01", "2026-10-31");
    expect(row.amount).toBe("3978.72");
    expect(
      depreciationForPeriod({ ...a, last_financial_date: "2026-11-01" }, "2026-10-01", "2026-10-31").skip_reason,
    ).toMatch(/later financial/);
  });
  it("does not lose large-value minor units and rejects unsupported precision", () => {
    expect(minor("99999999999999999999.99", 2)).toBe(9999999999999999999999n);
    expect(() => minor("1.001", 2)).toThrow(/precision/);
    expect(minor("1.23400000", 3)).toBe(1234n);
  });
  it("records full-month convention from the configured commencement date without an earlier interval", () => {
    const a = { ...asset(), depreciation_start: "2026-09-16" };
    expect(depreciationForPeriod(a, "2026-09-01", "2026-09-30")).toMatchObject({
      start: "2026-09-16",
      end: "2026-09-30",
      amount: "5000.00",
    });
  });
  it("continues a partial actual-day month without overlapping or losing depreciation", () => {
    const a = { ...asset(), category: { ...asset().category, convention: "actual_days" as const } };
    const first = depreciationForPeriod(a, "2026-09-01", "2026-09-03");
    expect(first).toMatchObject({ start: "2026-09-01", end: "2026-09-03", amount: "500.00" });
    const rest = depreciationForPeriod(
      { ...a, accumulated_depreciation: first.amount, last_depreciation_end: first.end },
      "2026-09-01",
      "2026-09-30",
    );
    expect(rest).toMatchObject({ start: "2026-09-04", end: "2026-09-30", amount: "4500.00" });
  });
  it("depreciates a capital improvement over the remaining useful life", () => {
    const a = {
      ...asset(),
      cost: "297000",
      accumulated_depreciation: "5000",
      last_depreciation_end: "2026-09-30",
      last_financial_date: "2026-10-01",
    };
    expect(depreciationForPeriod(a, "2026-10-01", "2026-10-31").amount).toBe("6000.00");
  });
});
describe("Asset document content validation", () => {
  it("accepts PDF and image signatures, not filename or declared type alone", () => {
    expect(assetFileMediaType("invoice.pdf", Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(assetFileMediaType("photo.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image/png");
    expect(assetFileMediaType("photo.jpg", Buffer.from([255, 216, 255]))).toBe("image/jpeg");
    expect(() => assetFileMediaType("invoice.pdf", Buffer.from("<script>"))).toThrow(/contents/);
    expect(() => assetFileMediaType("unsafe.html", Buffer.from("<script>"))).toThrow(/contents/);
    expect(() => assetFileMediaType("empty.pdf", Buffer.alloc(0))).toThrow(/non-empty/);
  });
});
describe("Actual daily zero rounding", () => {
  it("permits skipping only preceding intervals whose cumulative currency entitlement is zero", () => {
    const a = {
      ...asset(),
      cost: "0.01",
      residual_value: "0",
      method: "straight_line" as const,
      useful_life_months: 12,
      category: { ...asset().category, calculation_basis: "actual_actual" as const },
      accrual_basis: { start: "2026-09-01", opening_carrying: "0.01", opening_accumulated: "0" },
    };
    expect(depreciationForPeriod(a, "2026-09-01", "2026-09-30").skip_reason).toMatch(/rounds to zero/);
    expect(depreciationForPeriod(a, "2027-03-01", "2027-03-31").amount).toBe("0.01");
    expect(depreciationForPeriod(a, "2027-05-01", "2027-05-31").skip_reason).toMatch(/preceding/);
  });
});
