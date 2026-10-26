import { expect, test } from "@playwright/test";

const username = process.env.NEXORA_BANKING_SUPER_ADMIN_USERNAME;
const password = process.env.NEXORA_SHOAIB_PASSWORD;

test.describe("Bank entry workspace — read-only browser acceptance", () => {
  test.skip(!username || !password, "Controlled local Bank super-admin credentials are required.");
  for (const kind of ["payment", "receipt"] as const) {
    test(`${kind} uses live directories and the compact entry workspace without writing transactions`, async ({
      page,
      baseURL,
    }) => {
      test.setTimeout(90_000);
      expect(["127.0.0.1", "localhost", "[::1]"]).toContain(new URL(baseURL!).hostname);
      // This visual acceptance must not create, submit, approve or post business data.
      const writes: string[] = [];
      await page.route("**/api/v1/banking/**", (route) => {
        if (route.request().method() !== "GET") {
          writes.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      await page.goto("/login");
      await page.getByLabel("Username or email", { exact: true }).fill(username!);
      await page.getByLabel("Password", { exact: true }).fill(password!);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).not.toHaveURL(/\/login$/, { timeout: 20_000 });
      await page.goto(`/#/banking/add-bank-${kind}`);
      const bank = page.getByLabel(kind === "payment" ? "Pay through" : "Receive into", { exact: true });
      await expect(bank).toBeVisible();
      await expect(bank).toBeEnabled();
      const grid = page.locator(`[aria-labelledby="${kind}-lines-heading"] table`);
      await expect(grid.getByRole("columnheader")).toHaveText([
        "Date *",
        kind === "payment" ? "Ref. No. *" : "Ref. No.",
        "Mode *",
        "Nominal Account *",
        "Details *",
        "Amount *",
        "Remove",
      ]);
      await expect(page.getByLabel("Company", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Posting date", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Value date", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Line 1 document reference", { exact: true })).toHaveCount(0);
      const details = page.getByLabel(kind === "payment" ? "Line 1 narration" : "Line 1 details", { exact: true });
      await expect(details).toBeVisible();
      await details.fill("Synthetic description — no transaction saved");
      await expect(details).toHaveValue("Synthetic description — no transaction saved");
      await expect(
        page.getByLabel(kind === "payment" ? "Payment reference" : "Receipt reference", { exact: true }),
      ).toBeHidden();
      if (kind === "receipt") {
        await expect(page.getByLabel("Line 1 received from", { exact: true })).toHaveCount(0);
        await expect(page.getByLabel("Line 1 narration", { exact: true })).toHaveCount(0);
      }
      await page.getByLabel("Line 1 amount", { exact: true }).fill("10.25");
      await page.getByRole("button", { name: "+ Add More", exact: true }).click();
      await page.getByLabel("Line 2 amount", { exact: true }).fill("2.50");
      await expect(grid.locator("tfoot")).toContainText("12.75");
      await page.getByLabel("Remove line 2", { exact: true }).click();
      await expect(grid.locator("tbody tr")).toHaveCount(1);
      await expect(grid.locator("tfoot")).toContainText("10.25");
      await page.getByRole("button", { name: "More transaction actions", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Save Draft", exact: true })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Submit for Approval", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Approve & Close", exact: true })).toBeVisible();
      await page.screenshot({ path: `tmp/bank-readiness-20261020/${kind}-entry-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(bank).toBeVisible();
      await expect(page.getByRole("button", { name: "More transaction actions", exact: true })).toBeVisible();
      await page.screenshot({ path: `tmp/bank-readiness-20261020/${kind}-entry-mobile.png`, fullPage: true });
      expect(writes).toEqual([]);
    });
  }
});
