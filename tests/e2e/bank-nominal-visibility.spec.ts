import { expect, test } from "@playwright/test";
import type { BankAccountSummary } from "@nexora/contracts";

const company = { id: "nominal-bank-company", code: "NBC", name: "Nominal Bank Company" };
const cash: BankAccountSummary = {
  id: "bank-cash",
  reference: "230901",
  account_name: "Cash on hand",
  account_type: "current",
  identity_mode: "nominal_only",
  bank_name: null,
  branch: null,
  account_number_masked: null,
  currency: "PKR",
  ledger_account_id: "nominal-cash",
  ledger_account_code: "230901",
  ledger_account_name: "Cash on hand",
  ledger_balance: "0",
  available_balance: null,
  unreconciled_count: null,
  last_movement_on: null,
  state: "active",
  version: 2,
};

for (const theme of ["light", "dark"] as const) {
  for (const width of [390, 768, 1440]) {
    test(`nominal-created Bank accounts at ${width}px in ${theme} mode`, async ({ page }, testInfo) => {
      const bankQueries: string[] = [];
      let created = false;
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      await page.route("**/api/v1/**", (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        if (path === "/api/v1/auth/session")
          return route.fulfill({
            json: {
              status: "authenticated",
              tenant_id: "nominal-bank-tenant",
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              active_company: company,
              user: {
                id: "nominal-bank-user",
                email: "nominal-bank@example.invalid",
                display_name: "Nominal Bank User",
                roles: ["super_administrator"],
                permissions: [
                  "finance.nominal.read",
                  "finance.nominal.create",
                  "banking.bank_account.read",
                  "banking.bank_account.create",
                  "platform.approval.override",
                ],
              },
            },
          });
        if (path.endsWith("/companies")) return route.fulfill({ json: { items: [company] } });
        if (path === "/api/v1/finance/nominals/options")
          return route.fulfill({
            json: {
              companies: [company],
              categories: [{ id: "assets", code: "23", name: "Current Assets" }],
              sections: [
                {
                  id: "cash-bank",
                  code: "2309",
                  name: "Cash and Bank",
                  type: "asset",
                  category_id: "assets",
                  section_role: "cash_and_bank",
                  creation_enabled: true,
                },
              ],
              currencies: [{ code: "PKR", name: "Pakistan Rupee", decimal_places: 2, is_base: true }],
              setup: { cash_and_bank_configured: true, code_policy_configured: true },
            },
          });
        if (path === "/api/v1/finance/nominals" && request.method() === "POST") {
          expect(request.postDataJSON()).toMatchObject({
            nominal_kind: "bank",
            section_id: "cash-bank",
            name: "Cash on hand",
            currency: "PKR",
            company_id: company.id,
          });
          created = true;
          return route.fulfill({
            status: 201,
            json: {
              id: cash.ledger_account_id,
              code: cash.reference,
              bank_account_id: cash.id,
              state: "active",
              version: 2,
              replayed: false,
            },
          });
        }
        if (path === "/api/v1/banking/accounts/summary")
          return route.fulfill({
            json: { items: [{ currency: "PKR", ledger_balance: "0", account_count: created ? 1 : 0 }] },
          });
        if (path === "/api/v1/banking/accounts") {
          const bank = url.searchParams.get("bank");
          if (bank) bankQueries.push(bank);
          return route.fulfill({
            json: { items: created && (!bank || bank === cash.account_name) ? [cash] : [], next_cursor: null },
          });
        }
        if (path === `/api/v1/banking/accounts/${cash.id}`) return route.fulfill({ json: cash });
        if (path === `/api/v1/finance/nominals/${cash.ledger_account_id}`)
          return route.fulfill({
            json: {
              id: cash.ledger_account_id,
              company_id: company.id,
              code: cash.reference,
              name: cash.account_name,
              description: null,
              currency: cash.currency,
              type: "asset",
              is_header: false,
              account_status: "active",
              state: "active",
              version: 2,
              bank_account_id: cash.id,
              banking_available: true,
              category: { id: "assets", code: "23", name: "Current Assets" },
              section: { id: "cash-bank", code: "2309", name: "Cash and Bank" },
              capabilities: {},
              events: [],
            },
          });
        return route.fulfill({ json: { items: [] } });
      });

      await page.goto("/#/finance/add-nominal");
      await page.getByLabel("Nominal account name *", { exact: true }).fill("Cash on hand");
      await page.getByLabel("Currency *", { exact: true }).selectOption("PKR");
      await page.getByRole("button", { name: "Save & Activate", exact: true }).click();
      await expect.poll(() => created).toBe(true);
      await page.goto("/#/banking/bank-accounts");
      const row = page.getByRole("row").filter({ hasText: "Cash on hand" });
      await expect(row).toBeVisible();
      await expect(row).toContainText("230901");
      await page.getByRole("combobox", { name: "Bank", exact: true }).selectOption("Cash on hand");
      await expect.poll(() => bankQueries).toContain("Cash on hand");
      await expect(row).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("bank-nominal-visible.png"), fullPage: true });
      await row.getByRole("button", { name: "Open Cash on hand", exact: true }).first().click();
      await expect(page).toHaveURL(/banking\/bank-account-detail\/bank-cash/);
      await expect(page.getByText("230901 · Cash on hand", { exact: true }).first()).toBeVisible();
      await page.goto("/#/banking/account-balances");
      await expect(page.getByRole("row").filter({ hasText: "Cash on hand" })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("row").filter({ hasText: "Cash on hand" })).toBeVisible();
    });
  }
}
