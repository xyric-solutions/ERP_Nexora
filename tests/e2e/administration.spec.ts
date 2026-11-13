import { expect, test, type Page } from "@playwright/test";

/**
 * Administration module (plan Phase 5) with a mocked API. User and access data is
 * prototype browser-session data until the Administration API tables exist, so the
 * spec also proves that no user write is sent to the server.
 */

const COMPANY = { id: "admin-e2e-company", code: "CO-001", name: "Synthetic Admin Company" };

async function signIn(page: Page, permissions: string[]) {
  const writes: string[] = [];
  await page.route("**/api/v1/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push(path);
      return route.abort();
    }
    if (path === "/api/v1/auth/session")
      return route.fulfill({
        json: {
          status: "authenticated",
          tenant_id: "admin-e2e-tenant",
          csrf_token: "c".repeat(43),
          idle_expires_at: "2099-01-01T00:00:00Z",
          absolute_expires_at: "2099-01-01T00:00:00Z",
          user: { id: "USR-001", email: "owner@example.invalid", display_name: "Owner", roles: [], permissions },
          active_company: COMPANY,
        },
      });
    if (path === "/api/v1/hr/companies") return route.fulfill({ json: { items: [COMPANY] } });
    return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
  });
  return writes;
}

test.describe("Administration", () => {
  test("Super Admin creates a user and receives a one-time password", async ({ page }) => {
    const writes = await signIn(page, ["security.authorization.administer"]);
    await page.goto("/#/administration/users");
    await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
    await expect(page.getByText("Prototype data")).toBeVisible();

    await page.getByRole("button", { name: "Create user" }).first().click();
    await page.getByLabel("Full name").fill("Ayesha Khan");
    await page.getByLabel("Email").fill("ayesha.khan@example.invalid");
    await expect(page.getByLabel("Username")).toHaveValue("ayesha.khan");
    await page.getByRole("radio", { name: "HR & Payroll: User" }).click();
    await page.getByRole("radio", { name: "Banking & Treasury: View" }).click();
    await page.getByRole("button", { name: "Create user" }).last().click();

    const dialog = page.getByRole("dialog", { name: "User created" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Email not sent — share securely")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    const row = page.getByRole("row", { name: /Ayesha Khan/ });
    await expect(row).toBeVisible();
    const access = row.getByRole("list", { name: "Module access" });
    await expect(access.getByRole("listitem").filter({ hasText: "HR & Payroll" })).toContainText("User");
    await expect(access.getByRole("listitem").filter({ hasText: "Banking & Treasury" })).toContainText("View");

    await page.goto("/#/administration/admin-audit");
    await expect(page.getByRole("cell", { name: "Created user" })).toBeVisible();
    expect(writes).toEqual([]);
  });

  test("the last Super Admin cannot be removed", async ({ page }) => {
    await signIn(page, ["security.authorization.administer"]);
    await page.goto("/#/administration/users");
    await page.getByRole("row", { name: /Owner/ }).getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("checkbox", { name: /Super Admin \(full access\)/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Deactivate" })).toBeDisabled();
  });

  test("a user sees only assigned modules and a blocked URL shows no access", async ({ page }) => {
    await signIn(page, ["hr.employee.read"]);
    await page.goto("/#/dashboard/ceo-executive-dashboard");
    const navigation = page.getByRole("navigation").first();
    await expect(navigation.getByRole("button", { name: /HR & Payroll/ })).toBeVisible();
    await expect(navigation.getByRole("button", { name: /^Bank$|Banking/ })).toHaveCount(0);
    await expect(navigation.getByRole("button", { name: /Administration/ })).toHaveCount(0);

    await page.goto("/#/administration/users");
    await expect(page.getByRole("alert").filter({ hasText: "You don’t have access" })).toBeVisible();
    await page.goto("/#/banking/bank-payments");
    await expect(page.getByRole("alert").filter({ hasText: "You don’t have access" })).toBeVisible();
  });

  test("organisation sign-up validates the form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Create your organisation" })).toBeVisible();
    await page.getByLabel("Organisation name").fill("Acme Traders");
    await page.getByLabel("Full name").fill("Owner");
    await page.getByLabel("Work email").fill("owner@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("Str0ng-Password");
    await page.getByLabel("Confirm password").fill("different-password");
    await page.getByRole("button", { name: "Create organisation" }).click();
    await expect(page.getByText("The passwords do not match.")).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).click();
    // The dev server may compile /login on first visit.
    await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
  });
});
