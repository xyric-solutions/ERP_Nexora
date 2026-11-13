import { expect, test, type Page } from "@playwright/test";

/**
 * First-login organisation setup: a Super Admin whose organisation has not been set
 * up sees the setup form after signing in, and continues into the ERP once it is saved.
 * The setup is browser data (prototype); only the session and the password change
 * reach the API, and both are mocked here.
 */

const TENANT = "setup-e2e-tenant";

function session(permissions: string[]) {
  return {
    status: "authenticated",
    tenant_id: TENANT,
    csrf_token: "c".repeat(43),
    idle_expires_at: "2099-01-01T00:00:00Z",
    absolute_expires_at: "2099-01-01T00:00:00Z",
    user: { id: "owner", email: "owner@example.invalid", display_name: "Org Owner", roles: [], permissions },
    active_company: { id: "co-1", code: "CO-001", name: "Synthetic Traders" },
  };
}

async function mockApi(page: Page, permissions: string[]) {
  const passwordChanges: unknown[] = [];
  await page.route("**/api/v1/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/auth/session") return route.fulfill({ json: session(permissions) });
    if (path === "/api/v1/auth/change-password" && request.method() === "POST") {
      passwordChanges.push(request.postDataJSON());
      return route.fulfill({ json: session(permissions) });
    }
    return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
  });
  return { passwordChanges };
}

test("a Super Admin completes organisation setup before entering the ERP", async ({ page }) => {
  const { passwordChanges } = await mockApi(page, ["security.authorization.administer"]);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Set up your organisation" })).toBeVisible();
  await expect(page.getByLabel("Full Name")).toHaveValue("Org Owner");
  await expect(page.getByLabel("Work Email")).toHaveValue("owner@example.invalid");
  await expect(page.getByLabel("Business / Company Name")).toHaveValue("Synthetic Traders");
  await expect(page.getByLabel("Subdomain / Workspace URL")).toHaveValue("synthetic-traders");
  await page.screenshot({ path: "test-results/organisation-setup-empty.png", fullPage: true });

  await page.getByRole("button", { name: "Complete setup and continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Some details need attention" })).toBeVisible();
  await expect(page.getByText("Choose a business type.")).toBeVisible();
  await page.screenshot({ path: "test-results/organisation-setup-errors.png", fullPage: true });

  await page.getByLabel("Contact / Phone Number").fill("+92 300 1234567");
  await page.getByLabel("Password", { exact: true }).fill("NewSecret123!");
  // Reached from a restored session, so the current password is asked for once.
  await page.getByLabel("Current password").fill("OldSecret123!");
  await page.getByLabel("Business Type").selectOption("private_limited");
  await page.getByLabel("Business Category / Industry").selectOption("Retail");
  await page.getByLabel("Country / Region").selectOption("AE");
  await expect(page.getByLabel("Base Currency")).toHaveValue("AED");
  await page.getByLabel("Financial year starts").selectOption("1");
  await expect(page.getByLabel("Financial year ends")).toHaveValue("12");
  await page.getByLabel("Accounting Method").selectOption("accrual");
  await page.getByRole("button", { name: "Complete setup and continue" }).click();

  await expect(page).not.toHaveURL(/\/login/);
  expect(passwordChanges).toEqual([{ current_password: "OldSecret123!", new_password: "NewSecret123!" }]);
  const saved = await page.evaluate(
    (tenant) => window.localStorage.getItem(`nexora.organisation-setup.v1:${tenant}`),
    TENANT,
  );
  expect(JSON.parse(saved ?? "{}")).toMatchObject({
    company_name: "Synthetic Traders",
    country_code: "AE",
    base_currency: "AED",
    financial_year_start_month: 1,
  });
  expect(saved).not.toMatch(/Secret/);

  // Setup is asked for only once per organisation.
  await page.goto("/login");
  await expect(page).not.toHaveURL(/\/login/);
});

test("users who are not Super Admin never see organisation setup", async ({ page }) => {
  await mockApi(page, ["hr.employee.record.read"]);
  await page.goto("/login");
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Set up your organisation" })).toHaveCount(0);
});
