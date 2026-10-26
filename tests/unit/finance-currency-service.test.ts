import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount } from "@nexora/auth";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { FinanceCurrencyService } from "../../server/api/src/modules/finance/currencies/service.js";
import type { SourceFinanceCurrencyRepository } from "../../server/api/src/modules/finance/currencies/source-repository.js";

const actor: AuthenticatedAccount = {
  tenantId: "tenant-a",
  organizationName: "Tenant A",
  userId: "user-a",
  email: "user-a@example.test",
  displayName: "User A",
  roles: [],
  permissions: [
    "platform.currency.read",
    "platform.currency.manage",
    "finance.company_currency_profile.read",
    "finance.company_currency_profile.manage",
    "finance.company_currency.read",
    "finance.company_currency.manage",
    "finance.company_currency_rate.read",
    "finance.company_currency_rate.manage",
  ],
  sessionVersion: 1,
};
const context: BankingActorContext = { tenantId: "tenant-a", actor };

describe("FinanceCurrencyService", () => {
  it("delegates catalog adoption, governed rates, and Transfer FX policy operations", async () => {
    const repository = {
      listCatalog: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      listCurrencies: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      adopt: vi.fn().mockResolvedValue({ id: "USD", version: 1, audit_event_id: "audit-1", replayed: false }),
      changeCurrencyStatus: vi.fn(),
      listRates: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      createRate: vi.fn(),
      correctRate: vi.fn(),
      changeRateStatus: vi.fn(),
      getPolicy: vi.fn(),
      upsertPolicy: vi.fn(),
      listCountryCurrencies: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      getCompanyCurrencyProfile: vi.fn().mockResolvedValue({
        id: "profile-a",
        company_id: "company-a",
        base_currency: "PKR",
        base_currency_name: "Pakistani Rupee",
        base_country_code: "PK",
        base_country_name: "Pakistan",
        status: "active",
        locked: false,
        locked_at: null,
        version: 1,
        created_at: "2026-10-26T00:00:00.000Z",
        updated_at: "2026-10-26T00:00:00.000Z",
      }),
      configureCompanyCurrencyProfile: vi.fn(),
      listCompanyCurrencies: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      activateCompanyCurrency: vi.fn().mockResolvedValue({
        id: "company-currency-usd",
        version: 1,
        audit_event_id: "audit-company-currency-usd",
        replayed: false,
      }),
      changeCompanyCurrencyStatus: vi.fn(),
      listCompanyCurrencyRates: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      createCompanyCurrencyRate: vi.fn(),
      correctCompanyCurrencyRate: vi.fn(),
      changeCompanyCurrencyRateStatus: vi.fn(),
      resolveCompanyCurrencyRate: vi.fn(),
    } satisfies Pick<
      SourceFinanceCurrencyRepository,
      | "listCatalog"
      | "listCurrencies"
      | "adopt"
      | "changeCurrencyStatus"
      | "listRates"
      | "createRate"
      | "correctRate"
      | "changeRateStatus"
      | "getPolicy"
      | "upsertPolicy"
      | "listCountryCurrencies"
      | "getCompanyCurrencyProfile"
      | "configureCompanyCurrencyProfile"
      | "listCompanyCurrencies"
      | "activateCompanyCurrency"
      | "changeCompanyCurrencyStatus"
      | "listCompanyCurrencyRates"
      | "createCompanyCurrencyRate"
      | "correctCompanyCurrencyRate"
      | "changeCompanyCurrencyRateStatus"
      | "resolveCompanyCurrencyRate"
    >;
    const service = new FinanceCurrencyService(repository);

    await expect(service.listCatalog(context, { limit: 100 })).resolves.toEqual({ items: [], next_cursor: null });
    await expect(service.adopt(context, { code: "USD" }, "idem-1", "correlation-1")).resolves.toMatchObject({
      id: "USD",
    });
    await expect(service.listRates(context, { limit: 50 })).resolves.toEqual({ items: [], next_cursor: null });
    await expect(service.listCountryCurrencies(context, { limit: 50 })).resolves.toEqual({
      items: [],
      next_cursor: null,
    });
    await expect(service.getCompanyCurrencyProfile(context, "company-a")).resolves.toMatchObject({
      company_id: "company-a",
      base_currency: "PKR",
    });
    await expect(
      service.activateCompanyCurrency(
        context,
        {
          company_id: "company-a",
          country_code: "US",
          currency_code: "USD",
          rate: "275",
          effective_date: "2026-10-26",
        },
        "idem-company-currency",
        "correlation-company-currency",
      ),
    ).resolves.toMatchObject({ id: "company-currency-usd" });
    expect(repository.adopt).toHaveBeenCalledWith(context, { code: "USD" }, "idem-1", "correlation-1");
    expect(repository.activateCompanyCurrency).toHaveBeenCalledWith(
      context,
      {
        company_id: "company-a",
        country_code: "US",
        currency_code: "USD",
        rate: "275",
        effective_date: "2026-10-26",
      },
      "idem-company-currency",
      "correlation-company-currency",
    );
  });
});
