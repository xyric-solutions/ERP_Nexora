import { expect, test } from "@playwright/test";

for (const canManage of [true, false]) {
  test(`missing Transfer policy setup: ${canManage ? "administrator" : "maker"}`, async ({ page }) => {
    await page.setViewportSize({ width: canManage ? 1440 : 390, height: 1000 });
    let configured = false;
    const writes: string[] = [];
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") {
        writes.push(path);
        return route.abort();
      }
      if (path === "/api/v1/auth/session")
        return route.fulfill({
          json: {
            status: "authenticated",
            tenant_id: "example-tenant",
            csrf_token: "c".repeat(43),
            idle_expires_at: "2099-01-01T00:00:00Z",
            absolute_expires_at: "2099-01-01T00:00:00Z",
            user: {
              id: "maker",
              email: "maker@example.invalid",
              display_name: "Bank Maker",
              roles: ["bank_maker"],
              permissions: [
                "banking.transfer.read",
                "banking.transfer.create",
                ...(canManage ? ["finance.transfer_fx_policy.manage"] : []),
              ],
            },
          },
        });
      if (path === "/api/v1/banking/companies")
        return route.fulfill({
          json: { items: [{ id: "company-one", code: "ONE", name: "Example Services Company" }] },
        });
      if (path.endsWith("/workflow_options"))
        return route.fulfill({ json: { items: [], selected: null, next_cursor: null } });
      if (path.endsWith("/options"))
        return route.fulfill({ json: { bank_accounts: [], transfer_modes: [], fx_policy_configured: configured } });
      return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
    });
    await page.goto("/#/banking/add-transfer/fx");
    await expect(page.getByText("Bank Transfer FX policy needs setup", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeDisabled();
    if (canManage) await expect(page.getByRole("button", { name: "Configure policy", exact: true })).toBeVisible();
    else {
      await expect(page.getByRole("button", { name: "Configure policy", exact: true })).toHaveCount(0);
      await expect(page.getByText("Ask an authorized Finance administrator to configure this policy.")).toBeVisible();
    }
    await page.getByLabel("Amount", { exact: true }).fill("125.00");
    await page.screenshot({
      path: `tmp/bank-transfer-menu-evidence/policy-setup-${canManage ? "admin" : "maker"}.png`,
    });
    configured = true;
    await page.getByRole("button", { name: "Refresh setup", exact: true }).click();
    await expect(page.getByText("Bank Transfer FX policy needs setup", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("125.00");
    expect(writes).toEqual([]);
  });
}
