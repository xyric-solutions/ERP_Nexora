import { test, expect, type Browser } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { writeXlsx } from "../../server/api/src/files/xlsx.js";
import { budgetImportHeaders } from "../../server/api/src/modules/budget/files.js";

async function signIn(browser: Browser, user: string) {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL }),
    page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(user);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(process.env.NEXORA_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Open nexora-currency-browser", exact: true }).click();
  await page.goto("/#/budget/budget-entry");
  await expect(page.getByRole("heading", { name: "Dimensioned Budget Entry", exact: true })).toBeVisible();
  return { context, page };
}
test.describe("Connected Budget management", () => {
  test.skip(
    process.env.NEXORA_BUDGET_E2E !== "true" || !process.env.NEXORA_E2E_PASSWORD,
    "Use the isolated Budget browser harness.",
  );
  test("creates, reloads, independently approves and reports persisted budgets across all menus", async ({
    browser,
  }) => {
    test.setTimeout(300000);
    const maker = await signIn(browser, "r06.maker");
    let versionRoute = "";
    try {
      const surfaces = [
        ["planning-dashboard", "Planning cycle"],
        ["scenarios", "Best case"],
        ["budget-models", "Reusable allocation models"],
        ["budget-entry", "Build the first allocation workbook"],
        ["budget-import", "Validate, preview, commit"],
        ["budget-approval", "Version approval queue"],
        ["forecasts", "Forecast register"],
        ["commitment-control", "Purchase reservation ledger"],
        ["budget-availability", "Spending pool availability"],
        ["budget-actual", "Account variance analysis"],
        ["planning-reports", "Planning report library"],
      ] as const;
      for (const [id, heading] of surfaces) {
        await maker.page.goto(`/#/budget/${id}`);
        await expect(maker.page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
        if (!["planning-dashboard", "budget-entry"].includes(id))
          await expect(maker.page.getByRole("button", { name: "New budget", exact: true })).toHaveCount(0);
        if (
          ["scenarios", "forecasts", "budget-models", "budget-entry", "budget-import", "budget-approval"].includes(id)
        )
          await expect(maker.page.locator('[aria-label="Planning overview"]')).toHaveCount(0);
      }
      await maker.page.goto("/#/budget/budget-entry");
      await maker.page.getByRole("button", { name: "New budget", exact: true }).click();
      const dialog = maker.page.getByRole("dialog");
      await dialog.getByLabel("Budget name", { exact: true }).fill("Browser Operating Budget");
      await dialog.getByLabel("Reason", { exact: true }).fill("Isolated browser budget creation");
      await dialog.getByRole("button", { name: "Create plan", exact: true }).click();
      await expect(maker.page.getByRole("status")).toContainText("Budget plan created");
      await maker.page.getByLabel("Version name", { exact: true }).fill("Browser baseline");
      await maker.page.getByRole("button", { name: "Add account line", exact: true }).click();
      await maker.page.getByLabel("Account for line 1", { exact: true }).selectOption({ label: "expense · expense" });
      await maker.page.getByLabel("Line 1 2026-11 amount", { exact: true }).fill("120000.25");
      await maker.page.getByLabel("Change reason", { exact: true }).fill("Persist browser monthly allocations");
      await maker.page.getByRole("button", { name: "Save version", exact: true }).click();
      await expect(maker.page.getByRole("status")).toContainText("Budget version saved");
      versionRoute = new URL(maker.page.url()).hash;
      expect(versionRoute).toMatch(/budget-entry\/.+/);
      await maker.page.reload();
      await expect(maker.page.getByLabel("Line 1 2026-11 amount", { exact: true })).toHaveValue("120000.25000000");
      const versionId = decodeURIComponent(versionRoute.split("/").at(-1)!);
      await maker.page.goto(`/#/budget/budget-approval/${encodeURIComponent(versionId)}`);
      await maker.page
        .getByLabel("Decision / submission reason", { exact: true })
        .fill("Submit browser budget for independent review");
      await maker.page.getByLabel("Independent approver", { exact: true }).selectOption("r06.checker");
      await maker.page.getByRole("button", { name: "Submit for approval", exact: true }).click();
      await expect(maker.page.getByRole("status")).toContainText("Budget submitted");
      await maker.page.getByLabel("Decision / submission reason", { exact: true }).fill("Attempt self approval");
      await maker.page.getByRole("button", { name: "Approve version", exact: true }).click();
      await expect(maker.page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("independent");
      const checker = await signIn(browser, "r06.checker");
      try {
        await checker.page.goto(`/#/budget/budget-approval/${encodeURIComponent(versionId)}`);
        await checker.page
          .getByLabel("Decision / submission reason", { exact: true })
          .fill("Independent browser budget approval");
        await checker.page.getByRole("button", { name: "Approve version", exact: true }).click();
        await expect(checker.page.getByRole("status")).toContainText("Budget approved");
      } finally {
        await checker.context.close();
      }
      await maker.page.goto(`/${versionRoute}`);
      await maker.page.reload();
      await expect(maker.page.getByLabel("Line 1 2026-11 amount", { exact: true })).toBeDisabled();
      await mkdir("tmp/budget-evidence", { recursive: true });
      for (const [width, height, label] of [
        [1440, 1000, "desktop"],
        [900, 1000, "tablet"],
        [390, 844, "mobile"],
      ] as const) {
        await maker.page.setViewportSize({ width, height });
        for (const theme of ["light", "dark"] as const) {
          await maker.page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
          }, theme);
          expect(await maker.page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
          await maker.page.screenshot({ path: `tmp/budget-evidence/entry-${label}-${theme}.png`, fullPage: true });
        }
      }
      await maker.page.setViewportSize({ width: 1440, height: 1000 });
      const pages = [
        ["planning-dashboard", "Planning Dashboard"],
        ["scenarios", "Planning Scenarios"],
        ["budget-models", "Budget Models"],
        ["budget-entry", "Dimensioned Budget Entry"],
        ["budget-import", "Import & Spread"],
        ["budget-approval", "Budget Workflow"],
        ["forecasts", "Forecast & Reforecast"],
        ["commitment-control", "Commitment Control"],
        ["budget-availability", "Budget Availability"],
        ["budget-actual", "Budget vs Actual"],
        ["planning-reports", "Planning Reports"],
      ];
      for (const [id, title] of pages) {
        await maker.page.goto(`/#/budget/${id}/${encodeURIComponent(versionId)}`);
        await expect(maker.page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect(maker.page.locator('[aria-label="Planning filters"]')).toBeVisible();
        await expect(maker.page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
        await maker.page.screenshot({ path: `tmp/budget-evidence/page-${id}-desktop.png`, fullPage: true });
        if (id === "budget-availability") {
          await expect(
            maker.page.getByRole("columnheader", { name: "Current policy exposure", exact: true }),
          ).toBeVisible();
          await expect(maker.page.getByRole("columnheader", { name: "Variance", exact: true })).toHaveCount(0);
        }
        if (id === "budget-actual") {
          await expect(maker.page.getByRole("columnheader", { name: "Variance %", exact: true })).toBeVisible();
          await expect(
            maker.page.getByRole("columnheader", { name: "Current policy exposure", exact: true }),
          ).toHaveCount(0);
        }
      }
      for (const id of ["planning-dashboard", "scenarios", "budget-availability"]) {
        await maker.page.goto(`/#/budget/${id}/${encodeURIComponent(versionId)}`);
        await expect(maker.page.locator('[aria-label="Planning filters"]')).toBeVisible();
        await maker.page.setViewportSize({ width: 390, height: 844 });
        await maker.page.evaluate(() => {
          document.documentElement.dataset.theme = "dark";
        });
        expect(await maker.page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth)).toBe(true);
        await maker.page.screenshot({ path: `tmp/budget-evidence/page-${id}-mobile-dark.png`, fullPage: true });
      }
      await maker.page.setViewportSize({ width: 1440, height: 1000 });
      await maker.page.goto(`/#/budget/planning-reports/${encodeURIComponent(versionId)}`);
      const download = maker.page.waitForEvent("download");
      await maker.page.getByRole("button", { name: "Export XLSX", exact: true }).click();
      expect((await download).suggestedFilename()).toBe("budget-analysis.xlsx");
      const reader = await signIn(browser, "r06.target");
      try {
        await reader.page.goto(`/${versionRoute}`);
        await expect(reader.page.getByLabel("Line 1 2026-11 amount", { exact: true })).toBeDisabled();
        await expect(reader.page.getByRole("button", { name: "New budget", exact: true })).toHaveCount(0);
      } finally {
        await reader.context.close();
      }
      await maker.page.goto(`/${versionRoute}`);
      await maker.page.getByRole("button", { name: "Create revision", exact: true }).click();
      let form = maker.page.getByRole("dialog");
      await form.getByLabel("Version name", { exact: true }).fill("Browser working revision");
      await form.getByLabel("Reason and assumptions", { exact: true }).fill("Preserve approved browser baseline");
      await form.getByRole("button", { name: "Create draft revision", exact: true }).click();
      await expect(maker.page.getByRole("status")).toContainText("Budget draft generated");
      const revisionId = decodeURIComponent(new URL(maker.page.url()).hash.split("/").at(-1)!);
      await maker.page.goto(`/#/budget/scenarios/${encodeURIComponent(revisionId)}`);
      await maker.page.getByRole("button", { name: "Create worst case", exact: true }).click();
      form = maker.page.getByRole("dialog");
      await expect(form.getByLabel("Scenario", { exact: true })).toHaveValue("worst");
      await form.getByRole("textbox", { name: "Version name", exact: true }).fill("Browser downside case");
      await form.getByLabel("Reason and assumptions", { exact: true }).fill("Verify case-specific scenario creation");
      await form.getByRole("button", { name: "Create draft scenario", exact: true }).click();
      await expect(maker.page.getByRole("status")).toContainText("Budget draft generated");
      await maker.page.goto(`/#/budget/scenarios/${encodeURIComponent(revisionId)}`);
      await expect(maker.page.getByRole("button", { name: /Browser downside case/ })).toBeVisible();
      await maker.page.goto(`/#/budget/budget-models/${encodeURIComponent(revisionId)}`);
      await maker.page.getByRole("button", { name: "New model", exact: true }).click();
      form = maker.page.getByRole("dialog");
      await form.getByLabel("Model name", { exact: true }).fill("Browser annual expense model");
      await form.getByRole("button", { name: "Add model account", exact: true }).click();
      await form.getByLabel("Account", { exact: true }).selectOption({ label: "expense · expense" });
      await form.getByLabel("Annual amount", { exact: true }).fill("120000");
      await form.getByLabel("Reason", { exact: true }).fill("Create reusable browser fiscal model");
      await form.getByRole("button", { name: "Save model", exact: true }).click();
      await expect(maker.page.getByRole("status")).toContainText("Budget model saved");
      await maker.page
        .getByLabel("Model application reason", { exact: true })
        .fill("Apply browser model to current draft");
      await maker.page.getByRole("button", { name: "Apply to selected draft", exact: true }).click();
      await expect(maker.page.getByRole("status")).toContainText("Model applied to draft");
      await maker.page.goto(`/#/budget/budget-entry/${encodeURIComponent(revisionId)}`);
      await expect(maker.page.getByLabel("Line 1 2026-11 amount", { exact: true })).toHaveValue("10000.00000000");
      await maker.page.goto(`/#/budget/budget-import/${encodeURIComponent(revisionId)}`);
      await maker.page.getByLabel("Budget allocation file", { exact: true }).setInputFiles({
        name: "budget-acceptance.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: writeXlsx("Budget", budgetImportHeaders, [
          ["expense", "", "", "", "", "2026-11-01", "333.25", "Browser import"],
        ]),
      });
      await maker.page.getByRole("button", { name: "Validate file", exact: true }).click();
      await expect(maker.page.getByText("1 account lines · 0 errors", { exact: false })).toBeVisible();
      await maker.page.getByLabel("Import reason", { exact: true }).fill("Confirmed browser allocation replacement");
      await maker.page.getByRole("button", { name: "Confirm replacement and commit", exact: true }).click();
      await expect(maker.page.getByRole("status")).toContainText("Imported allocations committed");
      await maker.page.goto(`/#/budget/budget-entry/${encodeURIComponent(revisionId)}`);
      await maker.page.reload();
      await expect(maker.page.getByLabel("Line 1 2026-11 amount", { exact: true })).toHaveValue("333.25000000");
      await maker.page.goto(`/#/budget/forecasts/${encodeURIComponent(revisionId)}`);
      await maker.page.getByRole("button", { name: "Forecast / reforecast", exact: true }).click();
      form = maker.page.getByRole("dialog");
      await form.getByLabel("Version name", { exact: true }).fill("Browser expected forecast");
      await form.getByLabel("Actuals cutoff", { exact: true }).fill("2026-10-31");
      await form.getByLabel("Reason and assumptions", { exact: true }).fill("Create persisted browser reforecast");
      await form.getByRole("button", { name: "Create draft forecast", exact: true }).click();
      await expect(maker.page.getByRole("status")).toContainText("Budget draft generated");
      const forecastId = decodeURIComponent(new URL(maker.page.url()).hash.split("/").at(-1)!);
      await maker.page.goto(`/#/budget/forecasts/${encodeURIComponent(forecastId)}`);
      await expect(maker.page.getByText("Estimate at completion", { exact: true })).toBeVisible();
    } finally {
      await maker.context.close();
    }
  });
});
