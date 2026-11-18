import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { JournalDetail } from "@nexora/contracts";

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 768, 559, 390, 320]) {
    test(`full Journal form: ${theme}, ${width}px`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 978 });
      await page.addInitScript((value) => localStorage.setItem("nexora-theme-preference-v1", value), theme);
      const writes: string[] = [],
        errors: string[] = [];
      let journalState: JournalDetail["state"] = "submitted";
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
              active_company: { id: "company-one", code: "ONE", name: "Synthetic Journal company" },
              csrf_token: "c".repeat(43),
              idle_expires_at: "2099-01-01T00:00:00Z",
              absolute_expires_at: "2099-01-01T00:00:00Z",
              user: {
                id: "journal-maker",
                email: "maker@example.invalid",
                display_name: "Journal Maker",
                roles: ["super_administrator"],
                permissions: [
                  "finance.journal.read",
                  "finance.journal.create",
                  "finance.journal.submit",
                  "finance.journal.approve",
                  "finance.journal.self_approve",
                  "finance.recurring_journal.read",
                  "finance.recurring_journal.manage",
                ],
              },
            },
          });
        if (path === "/api/v1/auth/companies")
          return route.fulfill({
            json: { items: [{ id: "company-one", code: "ONE", name: "Synthetic Journal company" }] },
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
        if (path === "/api/v1/finance/journals/posting_eligibility")
          return route.fulfill({
            json: {
              company_id: "company-1",
              journal_date: new URL(request.url()).searchParams.get("journal_date"),
              eligible: false,
              blocker: {
                code: "FINANCE_PERIOD_CLOSED_POST_BLOCKED",
                message: "November is Soft Closed. An authorized period manager must open it before posting.",
              },
              period: null,
            },
          });
        if (path === "/api/v1/finance/journals") return route.fulfill({ json: { items: [], next_cursor: null } });
        if (path === "/api/v1/finance/recurring-journals")
          return route.fulfill({ json: { items: [], next_cursor: null } });
        if (path === "/api/v1/finance/journals/journal-layout-record") {
          const detail: JournalDetail = {
            id: "journal-layout-record",
            company_id: "company-one",
            display_number: "MJ-2026-000001",
            journal_date: "2026-11-17",
            reference_number: "Layout regression",
            source: "manual",
            source_label: "Manual Journal",
            state: journalState,
            currency: "PKR",
            total: "123.45",
            version: 2,
            maker_user_id: "journal-maker",
            submitted_at: "2026-11-17T00:00:00Z",
            can_open_owner_workflow: true,
            base_decimal_places: 2,
            approval_note: null,
            rejection_reason: null,
            posted_entry_number: journalState === "posted" ? "JE-001" : null,
            lines: [
              {
                id: "debit",
                line_number: 1,
                account_id: "expense-one",
                account_code: "6001",
                account_name: "Office expenses",
                description: "Layout check",
                debit: "123.45",
                credit: "0",
                dimensions: { cost_centre: "CC-001" },
              },
              {
                id: "credit",
                line_number: 2,
                account_id: "capital",
                account_code: "3100",
                account_name: "Capital",
                description: "Layout check",
                debit: "0",
                credit: "123.45",
                dimensions: {},
              },
            ],
            events: [],
            capabilities: {
              update: false,
              delete_draft: false,
              submit: false,
              approve: journalState === "submitted",
              reject: journalState === "submitted",
              reverse: journalState === "posted",
              self_approval_required: true,
              super_admin_override_available: false,
            },
          };
          return route.fulfill({ json: detail });
        }
        return route.fulfill({ status: 404, json: { detail: "No fixture for this endpoint" } });
      });
      await page.goto("/#/finance/journal-register");
      const workspaceHeader = page.locator('header[aria-label="Journal workspace"]');
      await expect(workspaceHeader.getByRole("heading", { name: "Journals", exact: true })).toBeVisible();
      await expect(workspaceHeader.getByLabel("Company", { exact: true })).toHaveCount(0);
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
      const filters = page.locator('[aria-label="Journal filters"]');
      for (const label of ["Reference search", "State", "Source", "Nominal account", "Date from", "Date to"]) {
        const control = filters.getByLabel(label, { exact: true });
        expect((await control.boundingBox())!.width).toBeGreaterThan(80);
        expect((await control.boundingBox())!.height).toBeLessThanOrEqual(36);
      }
      await page.screenshot({ path: `tmp/journal-layout-evidence/header-${theme}-${width}.png`, fullPage: true });
      await workspaceHeader.getByRole("button", { name: "＋ New Journal", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "New Manual Journal", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Draft \u2014 not posted", { exact: true })).toBeVisible();
      await expect(dialog.getByText(/November is Soft Closed/)).toBeVisible();
      await expect(dialog.getByRole("columnheader", { name: "Required Dimensions", exact: true })).toHaveCount(0);
      await expect(dialog.locator('footer[aria-label="Manual Journal actions"] button')).toHaveText([
        "Save Draft",
        "Approve & Close",
      ]);
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "Approve & Close", exact: true })).toBeEnabled();
      const heading = dialog.locator('[data-slot="sheet-header"]');
      expect((await heading.boundingBox())!.height).toBeLessThan(width >= 768 ? 90 : 120);
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
      await page.getByRole("button", { name: "Approve & Close", exact: true }).click();
      await expect(dialog.getByRole("alert").filter({ hasText: "Review the Journal form" })).toContainText(
        "Confirm the final review",
      );
      await expect(dialog.locator("#manual-journal-validation")).toBeFocused();
      await page.getByRole("button", { name: "Save Draft", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Review the Journal form" })).toBeVisible();
      expect(writes).toEqual([]);
      const accessibility = await new AxeBuilder({ page }).include('[data-slot="sheet-content"]').analyze();
      expect(accessibility.violations).toEqual([]);
      await page.getByRole("button", { name: "Save Draft", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `tmp/journal-layout-evidence/journal-${theme}-${width}.png`, fullPage: true });
      await page.getByLabel("Date *", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `tmp/journal-layout-evidence/journal-top-${theme}-${width}.png`, fullPage: true });
      page.once("dialog", (confirmation) => confirmation.accept());
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await page.goto("/#/finance/journal-detail/journal-layout-record");
      const detail = page.getByRole("dialog", { name: "Journal Details", exact: true });
      await expect(detail).toBeVisible();
      await expect(detail.locator("table th")).toHaveText(["Nominal Account", "Description", "Debit", "Credit"]);
      await detail.getByRole("button", { name: "Final review", exact: true }).click();
      const review = page.getByRole("dialog", { name: "Review and Post Journal", exact: true });
      await expect(review).toBeVisible();
      await expect(review.locator("table th")).toHaveText(["Nominal Account", "Description", "Debit", "Credit"]);
      await expect(review.getByRole("button", { name: "Approve and Post", exact: true })).toBeDisabled();
      await review.getByRole("checkbox", { name: /Final review confirmed/ }).check();
      await expect(review.getByRole("button", { name: "Approve and Post", exact: true })).toBeEnabled();
      await page.evaluate(async () => {
        await Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      expect((await new AxeBuilder({ page }).include('[data-slot="sheet-content"]').analyze()).violations).toEqual([]);
      await page.screenshot({ path: `tmp/journal-layout-evidence/approval-${theme}-${width}.png`, fullPage: true });
      await review.getByRole("button", { name: "Close", exact: true }).click();
      journalState = "posted";
      await page.goto("/?posted-layout-check=1#/finance/journal-detail/journal-layout-record");
      const posted = page.getByRole("dialog", { name: "Journal Details", exact: true });
      await expect(posted.locator("table th")).toHaveText(["Nominal Account", "Description", "Debit", "Credit"]);
      await posted.getByRole("button", { name: "Reverse", exact: true }).click();
      const reversal = page.getByRole("dialog", { name: "Reverse Journal", exact: true });
      await expect(reversal.locator("table th")).toHaveText(["Nominal Account", "Description", "Debit", "Credit"]);
      await expect(reversal.getByRole("button", { name: "Post compensating reversal", exact: true })).toBeDisabled();
      expect((await new AxeBuilder({ page }).include('[data-slot="sheet-content"]').analyze()).violations).toEqual([]);
      await reversal.getByRole("button", { name: "Close", exact: true }).click();
      await page.goto("/#/finance/recurring-journals");
      await page.getByRole("button", { name: "＋ New template", exact: true }).click();
      const recurring = page.getByRole("dialog", { name: "New recurring template", exact: true });
      await expect(recurring).toBeVisible();
      await expect(recurring.getByLabel("Name", { exact: true })).toBeVisible();
      await expect(recurring.getByLabel("Schedule", { exact: true })).toBeVisible();
      await expect(recurring.getByRole("columnheader", { name: /Dimensions/ })).toHaveCount(0);
      expect(await recurring.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      expect((await new AxeBuilder({ page }).include('[data-slot="sheet-content"]').analyze()).violations).toEqual([]);
      await page.screenshot({ path: `tmp/journal-layout-evidence/recurring-${theme}-${width}.png`, fullPage: true });
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
