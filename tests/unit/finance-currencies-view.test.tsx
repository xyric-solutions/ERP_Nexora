// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  notify: vi.fn(),
  api: {
    listCurrencyCatalog: vi.fn(),
    listTenantCurrencies: vi.fn(),
    listCurrencyRates: vi.fn(),
    listBankingCompanies: vi.fn(),
    listFinanceNominals: vi.fn(),
    getTransferFxPolicy: vi.fn(),
    correctCurrencyRate: vi.fn(),
    listCountryCurrencies: vi.fn(),
    getCompanyCurrencyProfile: vi.fn(),
    listCompanyCurrencies: vi.fn(),
    listCompanyCurrencyRates: vi.fn(),
    activateCompanyCurrency: vi.fn(),
    configureCompanyCurrencyProfile: vi.fn(),
    correctCompanyCurrencyRate: vi.fn(),
  },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "finance-admin-1",
      email: "finance@example.test",
      roles: ["finance_admin"],
      permissions: [
        "platform.currency.read",
        "platform.currency.manage",
        "platform.currency_rate.read",
        "platform.currency_rate.manage",
        "finance.transfer_fx_policy.read",
        "finance.transfer_fx_policy.manage",
        "finance.company_currency_profile.read",
        "finance.company_currency_profile.manage",
        "finance.company_currency.read",
        "finance.company_currency.manage",
        "finance.company_currency_rate.read",
        "finance.company_currency_rate.manage",
      ],
    },
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    session: harness.session,
    loading: false,
    csrfToken: () => "csrf-token",
  }),
}));
vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => harness.notify }));

import { FinanceCurrencies } from "../../app/features/finance/views/company-currencies-workspace.js";
import { ApiError } from "../../app/lib/api/generated.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
  for (let index = 0; index < 3; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
}

function change(id: string, value: string) {
  const input = document.querySelector(`#${id}`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`Missing input: ${id}`);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("FinanceCurrencies", { timeout: 15_000 }, () => {
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 320, 40));
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (selector) {
      return selector.includes(":fullscreen") ? false : matches.call(this, selector);
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    harness.api.listCurrencyCatalog.mockResolvedValue({ items: [], next_cursor: null });
    harness.api.listTenantCurrencies.mockResolvedValue({
      items: [
        {
          code: "USD",
          name: "US Dollar",
          decimal_places: 2,
          is_base: true,
          status: "active",
          version: 1,
        },
        {
          code: "EUR",
          name: "Euro",
          decimal_places: 2,
          is_base: false,
          status: "active",
          version: 1,
        },
      ],
      next_cursor: null,
    });
    harness.api.listCurrencyRates.mockResolvedValue({
      items: [
        {
          id: "rate-1",
          source_currency: "EUR",
          target_currency: "USD",
          rate: "1.10000000",
          effective_date: "2026-10-22",
          status: "active",
          version: 3,
          supersedes_rate_id: null,
          created_by: "finance-admin-1",
          created_at: "2026-10-22T00:00:00.000Z",
          updated_at: "2026-10-22T00:00:00.000Z",
        },
      ],
      next_cursor: null,
    });
    harness.api.listBankingCompanies.mockResolvedValue({
      items: [{ id: "company-1", code: "C01", name: "Nexora" }],
    });
    harness.api.listFinanceNominals.mockResolvedValue({ items: [], next_cursor: null });
    harness.api.getTransferFxPolicy.mockRejectedValue({ status: 404 });
    harness.api.correctCurrencyRate.mockResolvedValue({});
    harness.api.listCountryCurrencies.mockResolvedValue({
      items: [
        {
          country_code: "US",
          country_name: "United States",
          currency_code: "USD",
          currency_name: "US Dollar",
          currency_symbol: "$",
          decimal_places: 2,
          is_primary: true,
          status: "active",
        },
        {
          country_code: "PK",
          country_name: "Pakistan",
          currency_code: "PKR",
          currency_name: "Pakistan Rupee",
          currency_symbol: "₨",
          decimal_places: 2,
          is_primary: true,
          status: "active",
        },
      ],
      next_cursor: null,
    });
    harness.api.getCompanyCurrencyProfile.mockResolvedValue({
      id: "profile-1",
      company_id: "company-1",
      base_currency: "PKR",
      base_currency_name: "Pakistan Rupee",
      base_country_code: "PK",
      base_country_name: "Pakistan",
      status: "active",
      locked: true,
      locked_at: "2026-10-22T00:00:00.000Z",
      version: 1,
      created_at: "2026-10-22T00:00:00.000Z",
      updated_at: "2026-10-22T00:00:00.000Z",
    });
    harness.api.listCompanyCurrencies.mockResolvedValue({
      items: [
        {
          id: "company-currency-eur",
          company_id: "company-1",
          currency_code: "EUR",
          currency_name: "Euro",
          selected_country_code: "DE",
          selected_country_name: "Germany",
          decimal_places: 2,
          is_base: false,
          status: "active",
          latest_rate: "305.10000000",
          latest_rate_effective_date: "2026-10-22",
          version: 2,
          created_at: "2026-10-22T00:00:00.000Z",
          updated_at: "2026-10-22T00:00:00.000Z",
        },
      ],
      next_cursor: null,
    });
    harness.api.listCompanyCurrencyRates.mockResolvedValue({
      items: [
        {
          id: "rate-1",
          company_id: "company-1",
          source_currency: "EUR",
          target_currency: "PKR",
          rate: "305.10000000",
          effective_date: "2026-10-22",
          status: "active",
          version: 3,
          supersedes_rate_id: null,
          created_by: "finance-admin-1",
          created_at: "2026-10-22T00:00:00.000Z",
          updated_at: "2026-10-22T00:00:00.000Z",
        },
      ],
      next_cursor: null,
    });
    harness.api.correctCompanyCurrencyRate.mockResolvedValue({});
    harness.api.activateCompanyCurrency.mockResolvedValue({});
    harness.api.configureCompanyCurrencyProfile.mockResolvedValue({});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("loads the selected company's governed currency profile, work page, and rate history", async () => {
    await act(async () => root.render(<FinanceCurrencies />));
    await settle();
    expect(harness.api.getCompanyCurrencyProfile).toHaveBeenCalledWith("company-1");
    expect(harness.api.listCompanyCurrencies).toHaveBeenCalledWith(expect.stringContaining("company_id=company-1"));
    expect(harness.api.listCompanyCurrencyRates).toHaveBeenCalledWith(expect.stringContaining("company_id=company-1"));
    expect(container.textContent).toContain("Company currencies");
    expect(container.textContent).toContain("PKR");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates an immutable rate correction with optimistic version and operator reason", async () => {
    await act(async () => root.render(<FinanceCurrencies />));
    await settle();
    const view = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "View");
    await act(async () => view?.click());
    await settle();
    const correct = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Correct",
    );
    await act(async () => correct?.click());
    change("corrected-currency-rate", "1.12500000");
    change("currency-rate-correction-reason", "Corrected from approved treasury quote");
    const save = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save correction",
    );
    await act(async () => save?.click());
    await settle();
    expect(harness.api.correctCompanyCurrencyRate).toHaveBeenCalledWith(
      "rate-1",
      {
        expected_version: 3,
        rate: "1.12500000",
        reason: "Corrected from approved treasury quote",
      },
      "csrf-token",
      expect.stringMatching(/^web-company-currency-correct-rate-rate-1-/),
    );
    expect(harness.notify).toHaveBeenCalledWith("Rate correction created as a new revision.");
  });

  it("searches countries, auto-fills the primary currency, and activates it with an explicit base rate", async () => {
    await act(async () => root.render(<FinanceCurrencies />));
    await settle();
    const add = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Add New"));
    await act(async () => add?.click());
    await settle();
    const country = document.querySelector('button[aria-label="Country"]') as HTMLButtonElement;
    await act(async () => country.click());
    await settle();
    const search = document.querySelector('[aria-label="Search country"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "United");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(harness.api.listCountryCurrencies).toHaveBeenLastCalledWith(expect.stringContaining("search=United"));
    const option = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.textContent?.includes("United States"),
    ) as HTMLElement;
    await act(async () => option.click());
    expect((document.querySelector("#company-currency-code") as HTMLSelectElement).value).toBe("USD");
    change("company-currency-rate", "275.125");
    const save = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save and Close",
    );
    await act(async () => save?.click());
    await settle();
    expect(harness.api.activateCompanyCurrency).toHaveBeenCalledWith(
      {
        company_id: "company-1",
        country_code: "US",
        currency_code: "USD",
        rate: "275.125",
        effective_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
      "csrf-token",
      expect.stringMatching(/^web-company-currency-activate-currency-/),
    );
  }, 15_000);

  it("retains the selected country and all mapped currencies after the search results reset", async () => {
    const pakistanMappings = [
      {
        country_code: "PK",
        country_name: "Pakistan",
        currency_code: "PKR",
        currency_name: "Pakistan Rupee",
        currency_symbol: "Rs",
        decimal_places: 2,
        is_primary: true,
        status: "active",
      },
      {
        country_code: "PK",
        country_name: "Pakistan",
        currency_code: "USD",
        currency_name: "US Dollar",
        currency_symbol: "$",
        decimal_places: 2,
        is_primary: false,
        status: "active",
      },
    ];
    harness.api.listCountryCurrencies.mockImplementation((query: string) =>
      Promise.resolve({
        items: query.includes("search=Pakistan")
          ? pakistanMappings
          : [
              {
                country_code: "US",
                country_name: "United States",
                currency_code: "USD",
                currency_name: "US Dollar",
                currency_symbol: "$",
                decimal_places: 2,
                is_primary: true,
                status: "active",
              },
            ],
        next_cursor: null,
      }),
    );

    await act(async () => root.render(<FinanceCurrencies />));
    await settle();
    const add = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Add New"));
    await act(async () => add?.click());
    await settle();
    const country = document.querySelector('button[aria-label="Country"]') as HTMLButtonElement;
    await act(async () => country.click());
    await settle();
    const search = document.querySelector('[aria-label="Search country"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "Pakistan");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    const option = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.textContent?.includes("Pakistan"),
    ) as HTMLElement;
    await act(async () => option.click());
    await settle();

    expect(harness.api.listCountryCurrencies).toHaveBeenLastCalledWith(expect.not.stringContaining("search="));
    expect(country.textContent).toContain("Pakistan (PK)");
    const currency = document.querySelector("#company-currency-code") as HTMLSelectElement;
    expect(currency.value).toBe("PKR");
    expect([...currency.options].map((item) => item.value)).toEqual(["PKR", "USD"]);

    change("company-currency-rate", "0.0036");
    expect((document.querySelector("#company-currency-rate") as HTMLInputElement).value).toBe("0.0036");
    const save = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save and Close",
    );
    expect(save).toBeDefined();
    expect(save?.disabled).toBe(false);
    await act(async () => save?.click());
    await settle();
    expect(harness.api.activateCompanyCurrency).toHaveBeenCalledWith(
      {
        company_id: "company-1",
        country_code: "PK",
        currency_code: "PKR",
        rate: "0.0036",
        effective_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
      "csrf-token",
      expect.stringMatching(/^web-company-currency-activate-currency-/),
    );
  }, 15_000);

  it("configures a missing base currency from its country mapping", async () => {
    harness.api.getCompanyCurrencyProfile.mockRejectedValueOnce(
      new ApiError(404, "Profile not configured", "COMPANY_CURRENCY_PROFILE_NOT_FOUND"),
    );
    await act(async () => root.render(<FinanceCurrencies />));
    await settle();
    const configure = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Configure base currency"),
    );
    expect(configure).toBeDefined();
    await act(async () => configure?.click());
    await settle();
    const country = document.querySelector('button[aria-label="Country"]') as HTMLButtonElement;
    await act(async () => country.click());
    await settle();
    const option = [...document.querySelectorAll('[role="option"]')].find((item) =>
      item.textContent?.includes("Pakistan"),
    ) as HTMLElement;
    await act(async () => option.click());
    const save = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save and Close",
    );
    await act(async () => save?.click());
    await settle();
    expect(harness.api.configureCompanyCurrencyProfile).toHaveBeenCalledWith(
      "company-1",
      { company_id: "company-1", base_country_code: "PK", base_currency: "PKR" },
      "csrf-token",
      expect.stringMatching(/^web-company-currency-configure-profile-/),
    );
  });

  it("keeps company currency mutations hidden from a read-only user", async () => {
    const original = [...harness.session.user.permissions];
    harness.session.user.permissions = original.filter((permission) => !permission.endsWith(".manage"));
    try {
      await act(async () => root.render(<FinanceCurrencies />));
      await settle();
      expect(container.textContent).toContain("Company currencies");
      expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Add New"))).toBe(
        false,
      );
      expect(
        [...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Deactivate")),
      ).toBe(false);
    } finally {
      harness.session.user.permissions = original;
    }
  });
});
