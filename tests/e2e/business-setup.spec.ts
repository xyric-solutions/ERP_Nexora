import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const company = { id: "setup-browser-company", code: "CO-001", name: "Synthetic Existing Company" };
const permissions = [
  "platform.approval.override",
  "security.authorization.administer",
  "hr.organization.read",
  "finance.nominal.read",
  "finance.nominal.create",
  "finance.nominal.update",
  "finance.chart_template.read",
  "finance.chart_template.admin",
  "finance.chart_template.adopt",
  "finance.chart_template.classify",
  "finance.currency.read",
];
for (const theme of ["light", "dark"] as const)
  for (const [width, height] of [
    [1440, 1000],
    [834, 1112],
    [390, 844],
  ] as const) {
    test(`company setup uses API definitions at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      let submitted: Record<string, unknown> | null = null;
      await page.route("**/api/v1/**", async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname;
        if (path === "/api/v1/auth/session")
          return route.fulfill({
            json: {
              status: "authenticated",
              tenant_id: "setup-browser-tenant",
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              user: {
                id: "synthetic-owner",
                email: "owner@example.invalid",
                display_name: "Synthetic Owner",
                roles: ["super_administrator"],
                permissions,
              },
              active_company: company,
            },
          });
        if (path === "/api/v1/hr/companies") return route.fulfill({ json: { items: [company] } });
        if (path === "/api/v1/finance/business_setup/natures")
          return route.fulfill({
            json: {
              items: [
                { key: "it_software", name: "IT & Software — API definition" },
                { key: "non_profit", name: "Non-Profit — API definition" },
              ],
            },
          });
        if (path === "/api/v1/master-data/countries")
          return route.fulfill({
            json: {
              items: [
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
              ],
              next_cursor: null,
            },
          });
        if (path === "/api/v1/finance/business_setup" && req.method() === "POST") {
          submitted = req.postDataJSON();
          expect(req.headers()["x-csrf-token"]).toBe("c".repeat(43));
          expect(req.headers()["idempotency-key"]).toBeTruthy();
          return route.fulfill({
            status: 201,
            json: {
              setup: {
                ...submitted,
                company_id: "created-company",
                template_id: "published-template",
                initialized_at: "2026-11-27T00:00:00.000Z",
              },
              audit_event_id: "created-audit",
              replayed: false,
            },
          });
        }
        if (path === "/api/v1/finance/business_setup") return route.fulfill({ json: { setup: null } });
        return route.fulfill({ status: 404, json: { detail: "No unrelated browser fixture" } });
      });
      await page.goto("/#/administration/companies");
      await expect(page.getByRole("heading", { name: "Companies", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Create company", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByLabel("Business nature")).toBeEnabled();
      await dialog.getByLabel("Company name").fill("Synthetic New IT Business");
      await dialog.getByLabel("Business nature").selectOption("it_software");
      await expect(dialog.getByLabel("Base currency")).toHaveValue("PKR");
      await mkdir("tmp/business-setup-evidence", { recursive: true });
      await page.screenshot({ path: `tmp/business-setup-evidence/${theme}-${width}.png`, fullPage: true });
      if (width === 1440 && theme === "light") {
        const accessibility = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        expect(accessibility.violations).toEqual([]);
      }
      await dialog.getByRole("button", { name: "Create company", exact: true }).click();
      await expect(dialog.getByRole("status")).toContainText(
        "Accounting defaults are saved for Synthetic New IT Business",
      );
      expect(submitted).toMatchObject({
        company_name: "Synthetic New IT Business",
        business_nature_key: "it_software",
        base_currency: "PKR",
      });
      expect(submitted).not.toHaveProperty("tenant_id");
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
      await expect(dialog).not.toBeVisible();
    });
  }
