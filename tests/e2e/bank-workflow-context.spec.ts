import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createDatabasePool } from "../../packages/db/src/pool.js";
import { chooseBankDirectory as choose } from "./bank-directory-select.js";
const api = process.env.NEXORA_BANK_CONTEXT_E2E_API_URL;
const database = process.env.NEXORA_BANK_CONTEXT_E2E_DATABASE_URL;
const password = process.env.NEXORA_BANK_CONTEXT_E2E_PASSWORD;
test.describe("Real shared masters and Bank workflow context", () => {
  test.skip(!api || !database || !password, "Explicit isolated API/database and synthetic login required.");
  test.setTimeout(180_000);
  test.beforeEach(async ({ page }) => {
    const target = new URL(api!);
    expect(["127.0.0.1", "localhost"]).toContain(target.hostname);
    expect(Number(target.port)).toBeGreaterThanOrEqual(4011);
    expect(Number(target.port)).toBeLessThanOrEqual(4099);
    expect(new URL(database!).pathname).toMatch(/^\/nexora_bank_context_e2e_isolated_/);
    // Real HTTP forwarding to the isolated production API, not fixture responses.
    await page.route("**/api/v1/**", async (route) => {
      const original = new URL(route.request().url());
      const response = await route.fetch({ url: new URL(original.pathname + original.search, target).toString() });
      await route.fulfill({ response });
    });
  });
  async function signIn(page: Page, username: string) {
    await page.goto("/login");
    await page.getByLabel("Username or email", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login$/);
  }
  test("creates, views, edits and deactivates real company masters through Finance navigation", async ({ page }) => {
    await signIn(page, "r06.maker");
    await page.goto("/#/finance/reporting-projects");
    await expect(page.getByRole("button", { name: "Add Project", exact: true })).toBeEnabled();
    const code = `UI-${randomUUID().slice(0, 8)}`;
    await page.getByRole("button", { name: "Add Project", exact: true }).click();
    await page.getByLabel("Code", { exact: true }).fill(code);
    await page.getByLabel("Name", { exact: true }).fill("Synthetic browser project");
    await page.getByRole("button", { name: "Save reference", exact: true }).click();
    await expect(page.getByRole("button", { name: `View ${code}`, exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: `View ${code}`, exact: true }).click();
    await expect(page.getByLabel("Code", { exact: true })).toHaveValue(code);
    await page.getByRole("button", { name: "Edit reference", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Edited browser project");
    await page.getByRole("button", { name: "Save reference", exact: true }).click();
    await expect(page.locator("tbody tr").filter({ hasText: code })).toContainText("Edited browser project");
    await page.getByRole("button", { name: `View ${code}`, exact: true }).click();
    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    await page.getByRole("button", { name: "Confirm status change", exact: true }).click();
    await expect(page.locator("tbody tr").filter({ hasText: code })).toContainText("inactive");
    const pool = createDatabasePool(database!);
    try {
      expect((await pool.query("select status,row_version::int from erp_project where code=$1", [code])).rows).toEqual([
        { status: "inactive", row_version: 3 },
      ]);
    } finally {
      await pool.end();
    }
    const navigation = page.getByRole("navigation", { name: "All Nexora ERP modules" });
    const finance = navigation.locator("button.nx-module-button").filter({ hasText: "Finance" });
    if ((await finance.getAttribute("aria-expanded")) !== "true") await finance.click();
    await navigation.getByRole("button", { name: "Locations / Cities", exact: true }).click();
    await expect(page).toHaveURL(/finance\/reporting-locations/);
    await expect(page.getByRole("button", { name: "Add Location", exact: true })).toBeEnabled();
  });
  for (const kind of ["payment", "receipt"] as const) {
    test(`${kind} persists references across reload and routes to its selected independent checker`, async ({
      page,
    }) => {
      await signIn(page, "r06.maker");
      const suffix = randomUUID().slice(0, 8);
      for (const [path, label, code] of [
        ["reporting-projects", "Project", `PRJ-${suffix}`],
        ["reporting-locations", "Location", `LOC-${suffix}`],
      ]) {
        await page.goto(`/#/finance/${path}`);
        await page.getByRole("button", { name: `Add ${label}`, exact: true }).click();
        await page.getByLabel("Code", { exact: true }).fill(code!);
        await page.getByLabel("Name", { exact: true }).fill(`Synthetic ${label} ${suffix}`);
        await page.getByRole("button", { name: "Save reference", exact: true }).click();
        await expect(page.getByRole("button", { name: `View ${code}`, exact: true })).toBeVisible();
      }
      await page.goto(`/#/banking/add-bank-${kind}`);
      await choose(
        page,
        kind === "payment" ? "Pay through" : "Receive into",
        "Synthetic Bank Payment Operating Account",
      );
      const project = await choose(page, "Project", `PRJ-${suffix}`);
      const location = await choose(page, "Location / City", `LOC-${suffix}`);
      const approver = await choose(page, "Approver", "r06.checker");
      await page.getByLabel("Line 1 external reference", { exact: true }).fill(`REF-${suffix}`);
      await page
        .getByLabel(kind === "payment" ? "Line 1 payment method" : "Line 1 receipt method", { exact: true })
        .selectOption("bank_transfer");
      await choose(
        page,
        "Line 1 nominal account",
        kind === "payment" ? "Synthetic Bank Payment Expense" : "Synthetic Bank Receipt Income",
      );
      await page.getByLabel("Line 1 department", { exact: true }).fill("FINANCE");
      await page
        .getByLabel(kind === "payment" ? "Line 1 narration" : "Line 1 details", { exact: true })
        .fill(`Synthetic context ${suffix}`);
      await page.getByLabel("Line 1 amount", { exact: true }).fill("12.50");
      await page.getByRole("button", { name: "More transaction actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Save Draft", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`add-bank-${kind}/bank-${kind}-`));
      const transactionId = page.url().split("/").at(-1)!;
      await page.reload();
      await expect(page.getByLabel("Project", { exact: true })).toHaveAttribute("data-value", project);
      await expect(page.getByLabel("Location / City", { exact: true })).toHaveAttribute("data-value", location);
      await expect(page.getByLabel("Approver", { exact: true })).toHaveAttribute("data-value", approver);
      await page.getByRole("button", { name: "More transaction actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Submit for Approval", exact: true }).click();
      await expect(page.getByText(/submitted for approval successfully/).first()).toBeVisible();
      // A global administrator reassigns twice through the real detail control;
      // neither change may approve or post the transaction.
      await page.context().clearCookies();
      await signIn(page, "r06.override-admin");
      await page.goto(`/#/banking/transaction-detail/${transactionId}`);
      await page.getByRole("button", { name: "Reassign approver", exact: true }).click();
      await choose(page, "Reassigned approver", "Override Administrator");
      await page.getByRole("button", { name: "Confirm reassignment", exact: true }).click();
      await expect(page.getByText(/Bank approver reassigned successfully/).first()).toBeVisible();
      await expect(page.getByRole("list", { name: "Immutable approver history" })).toContainText("r06.override-admin");
      await page.getByRole("button", { name: "Reassign approver", exact: true }).click();
      await choose(page, "Reassigned approver", "r06.checker");
      await page.getByRole("button", { name: "Confirm reassignment", exact: true }).click();
      await expect(page.getByRole("list", { name: "Immutable approver history" }).getByRole("listitem")).toHaveCount(2);
      await page.context().clearCookies();
      await signIn(page, "r06.checker");
      await page.goto(`/#/banking/transaction-detail/${transactionId}`);
      await expect(page.getByText(`Synthetic Project ${suffix}`, { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: /Approve/, exact: false })
        .filter({ hasText: /Approve/ })
        .first()
        .click();
      await expect(page.getByText(/was approved/).first()).toBeVisible();
      const pool = createDatabasePool(database!);
      try {
        const result = await pool.query(
          `select state,project_id,location_id,approver_user_id,approved_by,original_journal_entry_id from bank_${kind} where id=$1`,
          [transactionId],
        );
        expect(result.rows).toEqual([
          {
            state: "approved",
            project_id: project,
            location_id: location,
            approver_user_id: approver,
            approved_by: "r06.checker",
            original_journal_entry_id: null,
          },
        ]);
      } finally {
        await pool.end();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const particulars = page
        .locator('[data-slot="card"]')
        .filter({ hasText: kind === "payment" ? "Payment particulars" : "Receipt particulars" });
      await expect.poll(async () => (await particulars.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(390);
      await page.screenshot({ path: `tmp/bank-context-20261021/${kind}-context-detail-mobile.png`, fullPage: true });
    });
  }
  test("a user without master permissions sees a denied state", async ({ page }) => {
    await signIn(page, "r06.restricted");
    await page.goto("/#/finance/reporting-projects");
    await expect(page.getByText(/do not have permission to read projects/)).toBeVisible();
  });
  for (const kind of ["payment", "receipt"] as const)
    test(`${kind} uses an Identity-issued self-approval grant and retains immutable history after revocation`, async ({
      page,
    }) => {
      await signIn(page, "r06.override-admin");
      await page.goto("/#/identity/access?tab=roles");
      await page.getByRole("button", { name: "Bank Self-approval", exact: true }).click();
      await expect(page.getByText("Bank self-approval grants", { exact: true })).toBeVisible();
      await page.getByLabel("Transaction kind", { exact: true }).selectOption(kind);
      await choose(page, "User", "r06.maker");
      await page.getByLabel("Administration reason", { exact: true }).fill("Synthetic browser approval grant");
      await expect(page.getByText("Loading persisted Bank grants…", { exact: true })).toHaveCount(0);
      const existing = page.getByRole("button", { name: "Revoke r06.maker", exact: true });
      if (await existing.count()) {
        await existing.click();
        await expect(page.locator("tbody tr").filter({ hasText: "r06.maker" })).toContainText("revoked");
        await choose(page, "User", "r06.maker");
        await page.getByLabel("Administration reason", { exact: true }).fill("Synthetic browser approval grant");
      }
      await page.getByRole("button", { name: "Issue self-approval grant", exact: true }).click();
      await expect(page.locator("tbody tr").filter({ hasText: "r06.maker" })).toContainText("active");
      await page.context().clearCookies();
      await signIn(page, "r06.maker");
      await page.goto(`/#/banking/add-bank-${kind}`);
      await choose(
        page,
        kind === "payment" ? "Pay through" : "Receive into",
        "Synthetic Bank Payment Operating Account",
      );
      await choose(page, "Approver", "r06.maker");
      const suffix = randomUUID().slice(0, 8);
      await page.getByLabel("Line 1 external reference", { exact: true }).fill(`SELF-${suffix}`);
      await page
        .getByLabel(kind === "payment" ? "Line 1 payment method" : "Line 1 receipt method", { exact: true })
        .selectOption("bank_transfer");
      await choose(
        page,
        "Line 1 nominal account",
        kind === "payment" ? "Synthetic Bank Payment Expense" : "Synthetic Bank Receipt Income",
      );
      await page.getByLabel("Line 1 department", { exact: true }).fill("FINANCE");
      await page
        .getByLabel(kind === "payment" ? "Line 1 narration" : "Line 1 details", { exact: true })
        .fill(`Synthetic self approval ${suffix}`);
      await page.getByLabel("Line 1 amount", { exact: true }).fill("15.00");
      await page.getByRole("button", { name: "Save Draft", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`add-bank-${kind}/bank-${kind}-`));
      const id = page.url().split("/").at(-1)!;
      await page.reload();
      await page.getByRole("button", { name: "Approve & Close", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`bank-${kind}s$`));
      const pool = createDatabasePool(database!);
      try {
        expect(
          (
            await pool.query(
              `select state,approved_by,delegated_decision_id,approval_override_event_id,original_journal_entry_id from bank_${kind} where id=$1`,
              [id],
            )
          ).rows[0],
        ).toEqual({
          state: "approved",
          approved_by: "r06.maker",
          delegated_decision_id: expect.any(String),
          approval_override_event_id: null,
          original_journal_entry_id: null,
        });
      } finally {
        await pool.end();
      }
      await page.context().clearCookies();
      await signIn(page, "r06.override-admin");
      await page.goto("/#/identity/access?tab=roles&section=bank-approval");
      await page.getByLabel("Transaction kind", { exact: true }).selectOption(kind);
      await page.getByLabel("Administration reason", { exact: true }).fill("Synthetic browser grant revocation");
      await page.getByRole("button", { name: "Revoke r06.maker", exact: true }).click();
      await expect(page.locator("tbody tr").filter({ hasText: "r06.maker" })).toContainText("revoked");
      await page.getByLabel("History", { exact: true }).selectOption("true");
      await expect
        .poll(() => page.locator("tbody tr").filter({ hasText: "r06.maker" }).count())
        .toBeGreaterThanOrEqual(2);
    });
});
