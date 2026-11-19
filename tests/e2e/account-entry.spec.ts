import { expect, test } from "@playwright/test";
import { superAdminPermissionKey } from "@nexora/contracts";

test("an existing Super Admin chooses a company without setting up the organisation", async ({ page }) => {
  const company = { id: "entry-company", code: "ENT", name: "Existing Company" };
  const session = {
    status: "authenticated",
    tenant_id: "entry-tenant",
    csrf_token: "c".repeat(43),
    idle_expires_at: "2099-01-01T00:00:00Z",
    absolute_expires_at: "2099-01-01T00:00:00Z",
    user: {
      id: "entry-admin",
      email: "admin@example.invalid",
      display_name: "Existing Admin",
      roles: ["super_administrator"],
      permissions: [superAdminPermissionKey],
    },
    active_company: null,
  };
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/login") return route.fulfill({ json: session });
    if (path === "/api/v1/auth/companies") return route.fulfill({ json: { items: [company] } });
    if (path === "/api/v1/auth/session/company") {
      return route.fulfill({ json: { ...session, active_company: company } });
    }
    return route.fulfill({ status: 401, json: { detail: "No session" } });
  });

  await page.goto("/login");
  await page.getByLabel("Username or email", { exact: true }).fill("entry-admin");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Choose a company" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set up your organisation" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Existing Company", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".nx-sidebar")).toBeVisible();
});

test("Create an account opens organisation setup", async ({ page }) => {
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ status: 401 }));
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account", exact: true }).click();

  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "Set up your organisation" })).toBeVisible();
  await expect(page.getByLabel("Organisation name", { exact: true })).toBeVisible();
});
