import { expect, test } from "@playwright/test";

const banks = ["Operating", "Reserve"].map((name, index) => ({
  id: `bank-${index}`,
  reference: `BA-00${index + 1}`,
  account_name: `${name} USD`,
  bank_name: "Example Bank",
  account_number_masked: `•••• 100${index}`,
  currency: "USD",
  ledger_account_code: `101${index}`,
  ledger_account_name: `${name} Bank`,
}));

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 768, 390]) {
    for (const kind of ["payment", "receipt", "transfer"] as const) {
      test(`compact ${kind} form: ${theme}, ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
        const writes: string[] = [],
          errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/api/v1/**", (route) => {
          const request = route.request(),
            url = new URL(request.url()),
            path = url.pathname;
          if (request.method() !== "GET") {
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
                  permissions: ["read", "create", "update", "submit"].map((action) => `banking.${kind}.${action}`),
                },
              },
            });
          if (path === "/api/v1/banking/companies")
            return route.fulfill({
              json: {
                items: [{ id: "company-one", code: "ONE", name: "Example Services Company" }],
              },
            });
          if (path.endsWith("/workflow_options"))
            return route.fulfill({
              json: {
                items: [{ id: "reviewer", code: null, name: "Finance Reviewer", eligible: true, self_approval: false }],
                selected: null,
                next_cursor: null,
              },
            });
          if (path.endsWith("/nominal_accounts"))
            return route.fulfill({
              json: {
                items: [
                  {
                    id: "nominal-one",
                    code: "6010",
                    name: "Travel expenses",
                    account_type: "expense",
                    required_dimensions: [],
                  },
                ],
                availability: {
                  eligible_count: 101,
                  matching_count: 101,
                  returned_count: 1,
                  has_more: true,
                  pending_approval_count: 0,
                  inactive_count: 0,
                  protected_count: 0,
                },
              },
            });
          if (path.endsWith("/options")) return route.fulfill({ json: { bank_accounts: banks, transfer_modes: [] } });
          return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
        });
        await page.goto(`/#/banking/${kind === "transfer" ? "add-transfer" : `add-bank-${kind}`}`);
        const heading = page.getByRole("heading", {
          level: 1,
          name: kind === "transfer" ? "Add Transfer" : `Add Bank ${kind === "payment" ? "Payment" : "Receipt"}`,
          exact: true,
        });
        await expect(heading).toBeVisible();
        const controls = page.getByRole("region", {
          name: `${kind[0].toUpperCase()}${kind.slice(1)} controls`,
          exact: true,
        });
        await expect(controls).toBeVisible();
        await expect(page.getByRole("combobox", { name: "Approver", exact: true })).toBeEnabled();
        const headerBox = await heading.locator("../..").boundingBox();
        expect(headerBox!.height).toBeLessThan(width === 390 ? 125 : 85);
        if (width === 1440) {
          const box = await controls.boundingBox();
          expect(box!.height).toBeLessThan(130);
          const dates =
            kind === "transfer"
              ? page.locator("#transfer-posting-date")
              : page.getByLabel("Posting date", { exact: true });
          const bank =
            kind === "transfer"
              ? page.locator("#transfer-company")
              : page.getByLabel(kind === "payment" ? "Pay through" : "Receive into", { exact: true });
          expect(Math.abs((await dates.boundingBox())!.y - (await bank.boundingBox())!.y)).toBeLessThan(3);
        }
        const grid =
          kind === "transfer"
            ? page.getByRole("region", { name: "Transfer lines", exact: true }).locator("table")
            : page.locator(`[aria-labelledby="${kind}-lines-heading"] table`);
        await expect(grid.locator("tbody tr")).toHaveCount(1);
        await page.getByRole("button", { name: "+ Add More", exact: true }).click();
        await expect(grid.locator("tbody tr")).toHaveCount(2);
        if (kind !== "transfer") {
          await page.getByLabel("Line 1 amount", { exact: true }).fill("10.25");
          await page.getByLabel("Line 2 amount", { exact: true }).fill("2.50");
          await expect(grid.locator("tfoot")).toContainText("12.75");
          await page.getByLabel("Remove line 2", { exact: true }).click();
          await expect(grid.locator("tfoot")).toContainText("10.25");
          const notice = page.getByLabel("Nominal account availability");
          await expect(notice).toBeVisible();
          if (width === 1440) expect((await notice.boundingBox())!.height).toBeLessThan(60);
        } else {
          await page.getByRole("button", { name: "Delete transfer line", exact: true }).last().click();
        }
        await expect(grid.locator("tbody tr")).toHaveCount(1);
        await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeEnabled();
        await expect(page.getByRole("button", { name: "Submit for Approval", exact: true })).toBeEnabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
          1,
        );
        await grid.evaluate((element) => {
          element.parentElement!.scrollLeft = 0;
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `tmp/bank-compact-evidence/${kind}-${theme}-${width}.png`, fullPage: true });
        expect(errors).toEqual([]);
        expect(writes).toEqual([]);
      });
    }
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 768, 390]) {
    test(`other Bank entry forms: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      const writes: string[] = [];
      await page.route("**/api/v1/**", (route) => {
        if (route.request().method() !== "GET") {
          writes.push(route.request().url());
          return route.abort();
        }
        if (new URL(route.request().url()).pathname === "/api/v1/auth/session")
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
                permissions: [],
              },
            },
          });
        return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
      });
      for (const route of ["add-deposit", "add-bank-charge", "add-bank-interest", "issue-cheque", "receive-cheque"]) {
        await page.goto(`/#/banking/${route}`);
        const heading = page.getByRole("heading", { name: "Transaction details", exact: true });
        await expect(heading).toBeVisible();
        expect((await heading.locator("..").boundingBox())!.height).toBeLessThan(width === 390 ? 110 : 85);
        await expect(page.locator("#txn-date")).toBeVisible();
        await expect(page.locator("#txn-amount")).toBeVisible();
        await page.locator("#txn-amount").fill("25.50");
        await expect(page.getByRole("heading", { name: "Double entry preview", exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
          1,
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `tmp/bank-compact-evidence/${route}-${theme}-${width}.png`, fullPage: true });
      }
      expect(writes).toEqual([]);
    });
  }
}
