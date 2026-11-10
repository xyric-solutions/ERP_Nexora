import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 768, 559, 390, 320]) {
    test(`full Journal form: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 978 });
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
              tenant_id: "journal-layout-tenant",
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              user: {
                id: "journal-maker",
                email: "maker@example.invalid",
                display_name: "Journal Maker",
                roles: ["super_administrator"],
                permissions: ["finance.journal.read", "finance.journal.create"],
              },
            },
          });
        if (path === "/api/v1/finance/journals/options")
          return route.fulfill({
            json: {
              companies: [{ id: "company-one", code: "ONE", name: "Synthetic Journal company" }],
              selected_company_id: "company-one",
              base_currency: "PKR",
              decimal_places: 2,
              nominals: [
                {
                  id: "expense-one",
                  code: "6001",
                  name: "Office expenses",
                  kind: "general",
                  required_dimensions: ["cost_centre"],
                },
              ],
            },
          });
        if (path === "/api/v1/finance/journals") return route.fulfill({ json: { items: [], next_cursor: null } });
        return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
      });
      await page.goto("/#/finance/journal-register");
      const workspaceHeader = page.locator('header[aria-label="Journal workspace"]');
      await expect(workspaceHeader.getByRole("heading", { name: "Journals", exact: true })).toBeVisible();
      await expect(workspaceHeader.getByLabel("Company", { exact: true })).toHaveValue("company-one");
      await expect(workspaceHeader.getByText("Home / Finance / Journals", { exact: true })).toHaveCount(0);
      const headerBox = await workspaceHeader.boundingBox();
      expect(headerBox!.height).toBeLessThanOrEqual(width >= 1024 ? 48 : width >= 640 ? 80 : 124);
      await workspaceHeader.getByLabel("Display decimals", { exact: true }).selectOption("4");
      await expect(workspaceHeader.getByLabel("Display decimals", { exact: true })).toHaveValue("4");
      await workspaceHeader.getByLabel("Display decimals", { exact: true }).selectOption("2");
      const headerAccessibility = await new AxeBuilder({ page })
        .include('header[aria-label="Journal workspace"]')
        .analyze();
      expect(headerAccessibility.violations).toEqual([]);
      await page.screenshot({ path: `tmp/journal-layout-evidence/header-${theme}-${width}.png`, fullPage: true });
      await workspaceHeader.getByRole("button", { name: "＋ New Journal", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "New Manual Journal", exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Close", exact: true }).click({ trial: true });
      const box = await dialog.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(Math.min(width * 0.95, 1280));
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      const nominal = page.getByLabel("Nominal account line 1", { exact: true });
      await nominal.click();
      await page.getByRole("option", { name: "6001 · Office expenses", exact: true }).click();
      await page.getByLabel("Description line 1", { exact: true }).fill("Synthetic layout check");
      await page.getByLabel("cost centre dimension line 1", { exact: true }).fill("CC-001");
      await page.getByLabel("Debit line 1", { exact: true }).fill("123.45");
      await page.getByLabel("Credit line 2", { exact: true }).fill("123.45");
      for (const label of [
        "Nominal account line 1",
        "Description line 1",
        "cost centre dimension line 1",
        "Debit line 1",
        "Credit line 1",
        "Debit line 2",
        "Credit line 2",
      ]) {
        const field = page.getByLabel(label, { exact: true });
        await field.scrollIntoViewIfNeeded();
        const fieldBox = await field.boundingBox();
        expect(fieldBox!.x).toBeGreaterThanOrEqual(box!.x);
        expect(fieldBox!.x + fieldBox!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
      }
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      const overflow = await dialog.locator("table").evaluate((table) => table.scrollWidth - table.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.getByRole("button", { name: "＋ Add More", exact: true }).click();
      await expect(page.getByLabel("Debit line 3", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Remove", exact: true }).last().click();
      await expect(page.getByLabel("Debit line 3", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Description line 1", { exact: true })).toHaveValue("Synthetic layout check");
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Review the Journal form" })).toBeVisible();
      expect(writes).toEqual([]);
      const accessibility = await new AxeBuilder({ page }).include('[data-slot="sheet-content"]').analyze();
      expect(accessibility.violations).toEqual([]);
      await page.getByRole("button", { name: "Save draft", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `tmp/journal-layout-evidence/journal-${theme}-${width}.png`, fullPage: true });
      await page.getByLabel("Date *", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `tmp/journal-layout-evidence/journal-top-${theme}-${width}.png`, fullPage: true });
      page.once("dialog", (confirmation) => confirmation.accept());
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
