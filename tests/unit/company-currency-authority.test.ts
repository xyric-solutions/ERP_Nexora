import { describe, expect, it, vi } from "vitest";

import {
  CompanyCurrencyAuthorityError,
  resolveCompanyCurrencyAuthority,
} from "../../server/api/src/modules/finance/currencies/company-authority.js";

function client(rowsByMarker: Record<string, unknown[]>) {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      const marker = Object.keys(rowsByMarker).find((candidate) => sql.includes(candidate));
      return { rows: marker ? rowsByMarker[marker] : [], rowCount: marker ? rowsByMarker[marker]!.length : 0, values };
    }),
  };
}

describe("company currency authority", () => {
  it("resolves the company base instead of the tenant legacy base", async () => {
    const database = client({
      "from company_currency_profile profile": [{ code: "PKR", decimal_places: 2 }],
      "from company_currency company_currency": [{ decimal_places: 2 }],
    });
    await expect(
      resolveCompanyCurrencyAuthority(database, {
        tenantId: "tenant-a",
        companyId: "company-a",
        sourceCurrency: "PKR",
        effectiveOnOrBefore: "2026-10-26",
      }),
    ).resolves.toEqual({
      baseCurrency: "PKR",
      baseDecimalPlaces: 2,
      sourceDecimalPlaces: 2,
      rateId: null,
      rateValue: "1.000000000000000000",
      rateEffectiveDate: null,
    });
  });

  it("selects only a same-company active dated rate", async () => {
    const database = client({
      "from company_currency_profile profile": [{ code: "PKR", decimal_places: 2 }],
      "from company_currency company_currency": [{ decimal_places: 2 }],
      "from currency_rate": [{ id: "rate-a", rate: "275.000000000000000000", effective_date: "2026-10-25" }],
    });
    await expect(
      resolveCompanyCurrencyAuthority(database, {
        tenantId: "tenant-a",
        companyId: "company-a",
        sourceCurrency: "USD",
        effectiveOnOrBefore: "2026-10-26",
      }),
    ).resolves.toMatchObject({
      baseCurrency: "PKR",
      sourceDecimalPlaces: 2,
      rateId: "rate-a",
      rateValue: "275.000000000000000000",
      rateEffectiveDate: "2026-10-25",
    });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining("company_id=$2"), [
      "tenant-a",
      "company-a",
      "USD",
      "PKR",
      "2026-10-26",
    ]);
  });

  it("rejects inactive company currencies and missing company rates", async () => {
    const inactive = client({
      "from company_currency_profile profile": [{ code: "PKR", decimal_places: 2 }],
    });
    await expect(
      resolveCompanyCurrencyAuthority(inactive, {
        tenantId: "tenant-a",
        companyId: "company-a",
        sourceCurrency: "USD",
        effectiveOnOrBefore: "2026-10-26",
      }),
    ).rejects.toMatchObject({ code: "COMPANY_CURRENCY_INACTIVE" });

    const missingRate = client({
      "from company_currency_profile profile": [{ code: "PKR", decimal_places: 2 }],
      "from company_currency company_currency": [{ decimal_places: 2 }],
    });
    await expect(
      resolveCompanyCurrencyAuthority(missingRate, {
        tenantId: "tenant-a",
        companyId: "company-a",
        sourceCurrency: "USD",
        effectiveOnOrBefore: "2026-10-26",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CompanyCurrencyAuthorityError>>({ code: "COMPANY_CURRENCY_RATE_MISSING" }),
    );
  });
});
