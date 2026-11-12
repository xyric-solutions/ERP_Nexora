import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  for (const inputMethod of ["typed", "restored"] as const) {
    test(`Save and Close PKR rate without a country field: ${theme}, ${inputMethod}`, async ({ page }) => {
      await page.setViewportSize({ width: theme === "light" ? 1440 : 390, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      let saved = false;
      const writes: unknown[] = [],
        countryLookups: string[] = [];
      await page.route("**/api/v1/**", (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
        if (path === "/api/v1/finance/company-currency-rates" && request.method() === "POST") {
          writes.push(request.postDataJSON());
          saved = true;
          return route.fulfill({ status: 201, json: {} });
        }
        if (request.method() !== "GET") return route.abort();
        if (path === "/api/v1/auth/session")
          return route.fulfill({
            json: {
              status: "authenticated",
              tenant_id: "example-tenant",
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              user: {
                id: "rate-manager",
                email: "rate-manager@example.invalid",
                display_name: "Rate Manager",
                roles: ["finance_admin"],
                permissions: [
                  "finance.company_currency_profile.read",
                  "finance.company_currency.read",
                  "finance.company_currency_rate.read",
                  "finance.company_currency_rate.manage",
                ],
              },
            },
          });
        if (path === "/api/v1/banking/companies")
          return route.fulfill({ json: { items: [{ id: "company-one", code: "ONE", name: "Example Company" }] } });
        if (path.endsWith("/currency-profile"))
          return route.fulfill({
            json: {
              id: "profile-one",
              company_id: "company-one",
              base_currency: "USD",
              base_currency_name: "US Dollar",
              base_country_code: "US",
              base_country_name: "United States",
              locked: false,
              status: "active",
              version: 1,
            },
          });
        if (path === "/api/v1/finance/company-currencies")
          return route.fulfill({
            json: {
              items: [
                {
                  id: "pkr-one",
                  company_id: "company-one",
                  currency_code: "PKR",
                  currency_name: "Pakistan Rupee",
                  selected_country_code: "PK",
                  selected_country_name: "Pakistan",
                  is_base: false,
                  status: "active",
                  version: 1,
                  latest_rate: saved ? "0.003600000000000000" : null,
                  latest_rate_effective_date: saved ? "2026-11-06" : null,
                },
              ],
              next_cursor: null,
            },
          });
        if (path === "/api/v1/finance/company-currency-rates")
          return route.fulfill({ json: { items: [], next_cursor: null } });
        if (path.includes("countr")) countryLookups.push(path);
        return route.fulfill({ status: 403, json: { detail: "This rate manager does not manage country mappings." } });
      });
      await page.goto("/#/finance/currencies-fx");
      await page.getByRole("button", { name: "Add rate", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Add PKR rate", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Country", { exact: true })).toHaveCount(0);
      await dialog.getByLabel("Effective date", { exact: false }).fill("2026-11-06");
      const rateInput = dialog.getByLabel("Exchange rate", { exact: false });
      if (inputMethod === "typed") {
        await rateInput.fill("0.0036");
      } else {
        // Restore the visible value without dispatching any React input/change event.
        await rateInput.evaluate((element) => {
          if (!(element instanceof HTMLInputElement)) throw new Error("Expected a rate input");
          element.value = "0.0036";
        });
      }
      const save = dialog.getByRole("button", { name: "Save and Close", exact: true });
      await expect(save).toBeEnabled();
      await page.screenshot({ path: `tmp/currency-rate-save-evidence/${theme}-${inputMethod}-ready.png` });
      await save.click();
      await expect(dialog).toHaveCount(0);
      expect(writes).toEqual([
        { company_id: "company-one", source_currency: "PKR", rate: "0.0036", effective_date: "2026-11-06" },
      ]);
      await page.reload();
      const displayedRate = page.getByRole("cell", { name: "0.00", exact: true });
      await expect(displayedRate).toBeVisible();
      await expect(displayedRate).toHaveAttribute("title", "0.003600000000000000");
      await displayedRate.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `tmp/currency-display-evidence/${theme}-${inputMethod}.png` });
      expect(countryLookups).toEqual([]);
    });
  }
}
