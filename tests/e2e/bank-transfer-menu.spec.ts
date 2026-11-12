import { expect, test } from "@playwright/test";

const banks = [
  { id: "bank-usd", account_name: "Operating USD", currency: "USD" },
  { id: "bank-reserve", account_name: "Reserve USD", currency: "USD" },
  { id: "bank-pkr", account_name: "Operating PKR", currency: "PKR" },
].map((bank, index) => ({
  ...bank,
  reference: `BA-00${index + 1}`,
  bank_name: "Example Bank",
  account_number_masked: `•••• 100${index}`,
  ledger_account_code: `101${index}`,
  ledger_account_name: bank.account_name,
}));

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 768, 390]) {
    test(`Transfer and FX menu: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      const writes: string[] = [],
        errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/v1/**", (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
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
                permissions: ["read", "create", "update", "submit"].map((action) => `banking.transfer.${action}`),
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
          return route.fulfill({ json: { items: [], selected: null, next_cursor: null } });
        if (path.endsWith("/options"))
          return route.fulfill({ json: { bank_accounts: banks, transfer_modes: [], fx_policy_configured: true } });
        if (path === "/api/v1/banking/transfers") return route.fulfill({ json: { items: [], next_cursor: null } });
        return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
      });

      for (const kind of ["transfer", "fx"] as const) {
        await page.goto(`/?entry=${kind}#/banking/transfers`);
        await expect(page.getByRole("heading", { name: "Bank Transfers", exact: true })).toBeVisible();
        const addNew = page.getByRole("button", { name: "Add New", exact: true });
        await addNew.focus();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByRole("menuitem", { name: "Transfer", exact: true })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "FX Transfer", exact: true })).toBeVisible();
        await page.screenshot({ path: `tmp/bank-transfer-menu-evidence/${theme}-${width}-menu.png` });
        await page.getByRole("menuitem", { name: kind === "fx" ? "FX Transfer" : "Transfer", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: kind === "fx" ? "Add FX Transfer" : "Add Transfer", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("combobox", { name: "To Bank", exact: true })).toBeDisabled();
        await page.getByRole("combobox", { name: "From Bank", exact: true }).click();
        await page.getByRole("option", { name: /Operating USD/ }).click();
        await page.getByRole("combobox", { name: "To Bank", exact: true }).click();
        await expect(page.getByRole("option", { name: kind === "fx" ? /Operating PKR/ : /Reserve USD/ })).toBeVisible();
        await expect(page.getByRole("option", { name: kind === "fx" ? /Reserve USD/ : /Operating PKR/ })).toHaveCount(
          0,
        );
        await page.getByRole("option", { name: kind === "fx" ? /Operating PKR/ : /Reserve USD/ }).click();
        if (kind === "fx") {
          await expect(page.getByLabel("Exchange rate", { exact: true })).toBeVisible();
          await expect(page.getByText("1 USD =", { exact: true })).toBeVisible();
          await page.getByLabel("Exchange rate", { exact: true }).fill("280.125");
          await page.getByLabel("Amount", { exact: true }).fill("1000");
          await page.getByLabel("Reference number", { exact: true }).fill("FX-QUOTE-001");
          await page.getByLabel("Transfer date", { exact: true }).fill("2026-11-06");
          await page.getByLabel("Transfer mode", { exact: true }).selectOption("wire_swift");
          await page.getByLabel("Details", { exact: true }).fill("Convert operating funds to PKR");
          await expect(page.getByLabel("Exchange rate", { exact: true })).toHaveValue("280.125");
          await expect(page.getByLabel("To Amount", { exact: true })).toHaveValue("280125.00");
          await expect(page.getByLabel("To Amount", { exact: true })).toHaveAttribute("readonly", "");
          await expect(page.getByText("1 PKR < 0.01 USD", { exact: true })).toHaveAttribute(
            "title",
            /^1 PKR = 0\.0035/,
          );
          const fxQuote = await page.locator('[data-slot="fx-quote"]').boundingBox();
          expect(fxQuote!.height).toBeLessThan(240);
          const workflow = page.getByRole("region", { name: "Workflow context", exact: true });
          await expect(workflow).toHaveCount(1);
          const workflowBox = await workflow.boundingBox();
          const fromBank = await page.getByRole("combobox", { name: "From Bank", exact: true }).boundingBox();
          expect(workflowBox!.y + workflowBox!.height).toBeLessThan(fxQuote!.y);
          expect(fxQuote!.y + fxQuote!.height).toBeLessThan(fromBank!.y);
          const fromAmount = await page.getByLabel("Amount", { exact: true }).boundingBox();
          const toAmount = await page.getByLabel("To Amount", { exact: true }).boundingBox();
          if (width >= 768) expect(Math.abs(fromAmount!.y - toAmount!.y)).toBeLessThan(4);
          else expect(toAmount!.y).toBeGreaterThan(fromAmount!.y + fromAmount!.height);
          await expect(
            page.getByText("Estimate only. The final receiving amount is confirmed when you save."),
          ).toBeVisible();
        } else {
          await expect(page.getByLabel("Exchange rate", { exact: true })).toHaveCount(0);
        }
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await page.screenshot({
          path: `tmp/bank-transfer-menu-evidence/${theme}-${width}-${kind}.png`,
          fullPage: true,
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
          1,
        );
      }
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
