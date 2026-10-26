import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createDatabasePool } from "../../packages/db/src/pool.js";
import { chooseBankDirectory } from "./bank-directory-select.js";
const api = process.env.NEXORA_BANK_CONTEXT_E2E_API_URL,
  database = process.env.NEXORA_BANK_CONTEXT_E2E_DATABASE_URL,
  password = process.env.NEXORA_BANK_CONTEXT_E2E_PASSWORD;
test.describe("Live company fiscal calendars", () => {
  test.use({ actionTimeout: 30_000 });
  test.skip(
    !api || !database || !password || process.env.NEXORA_FINANCE_CALENDAR_E2E !== "true",
    "Explicit isolated calendar harness required.",
  );
  test.setTimeout(180_000);
  test.beforeEach(async ({ page }) => {
    const target = new URL(api!);
    expect(target.hostname).toBe("127.0.0.1");
    expect(Number(target.port)).toBeGreaterThanOrEqual(4011);
    expect(Number(target.port)).toBeLessThanOrEqual(4099);
    expect(new URL(database!).pathname).toMatch(/^\/nexora_bank_context_e2e_isolated_/);
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({
        url: new URL(url.pathname + url.search, target).toString(),
        maxRetries: route.request().method() === "GET" ? 2 : 0,
      });
      await route.fulfill({ response });
    });
  });
  async function login(page: Page, user: string) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Username or email", { exact: true }).fill(user);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login$/);
  }
  const table = (page: Page) => page.getByRole("table", { name: "Persisted monthly Finance periods" });
  async function confirm(page: Page, reason?: string, locked = false) {
    const dialog = page.getByRole("dialog");
    if (reason) await dialog.getByLabel(/Reason/).fill(reason);
    if (locked)
      await dialog
        .getByRole("checkbox", { name: "I confirm Super Admin reopening of locked periods.", exact: true })
        .check();
    await dialog.getByRole("button", { name: "Confirm calendar action", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Loading persisted calendar data…", { exact: true })).toHaveCount(0);
  }
  async function unusedYear() {
    const pool = createDatabasePool(database!);
    try {
      const result = await pool.query<{ start: string }>(
        "select make_date(y,7,1)::text as start from generate_series(2027,2090) y where not exists(select 1 from fiscal_calendar c where tenant_id='nexora-r06-uat' and company_id='nexora-r06-uat-company' and daterange(c.period_start,c.period_end,'[]') && daterange(make_date(y,7,1),make_date(y+1,6,30),'[]')) order by y limit 1",
      );
      return result.rows[0]!.start;
    } finally {
      await pool.end();
    }
  }
  test("creates July–June, enforces scoped close/lock/reopen, and persists real audit history", async ({ page }) => {
    await login(page, "r06.override-admin");
    await page.goto("/#/finance/fiscal-periods");
    const start = await unusedYear();
    await page.getByLabel("Fiscal year start", { exact: true }).fill(start);
    await page.getByRole("button", { name: "Preview new fiscal year", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(`${Number(start.slice(0, 4)) + 1}-06-30`);
    await confirm(page);
    await expect(table(page).locator("tbody tr")).toHaveCount(12);
    await expect(table(page).getByText("Soft Closed", { exact: true })).toHaveCount(12);
    const calendar = await page.getByLabel("Fiscal year", { exact: true }).inputValue();
    await page.getByLabel("Select period 1", { exact: true }).check();
    await page.getByRole("button", { name: "Open selected periods", exact: true }).click();
    await confirm(page, "Synthetic July testing period");
    await expect(table(page).locator("tbody tr").first()).toContainText("Open");
    await login(page, "r06.maker");
    await page.goto("/#/finance/fiscal-periods");
    await page.getByLabel("Fiscal year", { exact: true }).selectOption(calendar);
    await expect(page.getByRole("button", { name: "Preview new fiscal year", exact: true })).toHaveCount(0);
    await page.getByLabel("Select period 1", { exact: true }).check();
    await page.getByRole("button", { name: "Soft close selected", exact: true }).click();
    await confirm(page);
    await expect(table(page).locator("tbody tr").first()).toContainText("Soft Closed");
    await page.getByLabel("Select period 1", { exact: true }).check();
    await page.getByRole("button", { name: "Lock selected periods", exact: true }).click();
    await confirm(page, "Synthetic close review complete");
    await expect(table(page).locator("tbody tr").first()).toContainText("Locked");
    await page.getByLabel("Select period 1", { exact: true }).check();
    await expect(page.getByRole("button", { name: "Open selected periods", exact: true })).toBeDisabled();
    await login(page, "r06.override-admin");
    await page.goto("/#/finance/period-close");
    await page.getByLabel("Fiscal year", { exact: true }).selectOption(calendar);
    await page.getByLabel("Select period 1", { exact: true }).check();
    await page.getByRole("button", { name: "Open selected periods", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel(/Reason/)
      .fill("Explicit synthetic locked-period reopening");
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Confirm calendar action", exact: true }),
    ).toBeDisabled();
    await confirm(page, "Explicit synthetic locked-period reopening", true);
    await page.reload();
    await expect(table(page).locator("tbody tr").first()).toContainText("Open");
    const pool = createDatabasePool(database!);
    try {
      expect(
        (
          await pool.query(
            "select status,row_version::integer as version from financial_period where tenant_id='nexora-r06-uat' and company_id='nexora-r06-uat-company' and fiscal_calendar_id=$1 and period_number=1",
            [calendar],
          )
        ).rows,
      ).toEqual([{ status: "open", version: 5 }]);
      const events = await pool.query(
        "select action,actor_id from fiscal_calendar_event where tenant_id='nexora-r06-uat' and calendar_id=$1 and period_id=(select id from financial_period where tenant_id='nexora-r06-uat' and fiscal_calendar_id=$1 and period_number=1) order by occurred_at",
        [calendar],
      );
      expect(events.rows.map((e) => e.action)).toEqual(["period_created", "opened", "soft_closed", "locked", "opened"]);
    } finally {
      await pool.end();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(table(page)).toBeVisible();
    await page.screenshot({ path: "tmp/finance-calendars-20261022/calendar-mobile.png", fullPage: true });
  });
  test("Bank drafts survive soft-closed periods and submit after deliberate reopening", async ({ page }) => {
    await login(page, "r06.override-admin");
    await page.goto("/#/finance/fiscal-periods");
    const start = await unusedYear();
    await page.getByLabel("Fiscal year start", { exact: true }).fill(start);
    await page.getByRole("button", { name: "Preview new fiscal year", exact: true }).click();
    await confirm(page);
    await expect(table(page).locator("tbody tr")).toHaveCount(12);
    const year = await page.getByLabel("Fiscal year", { exact: true }).inputValue();
    await page.getByLabel("Select period 2", { exact: true }).check();
    await page.getByRole("button", { name: "Open selected periods", exact: true }).click();
    await confirm(page, "Synthetic August bank workflow testing");
    await login(page, "r06.maker");
    for (const kind of ["payment", "receipt"] as const) {
      const month = kind === "payment" ? 3 : 4,
        date = `${start.slice(0, 4)}-${kind === "payment" ? "09" : "10"}-02`;
      await page.goto(`/#/banking/add-bank-${kind}`);
      // Wait for the real bounded account directory, including under concurrent
      // local build/test load. This is not a posting-performance benchmark.
      await expect(page.getByLabel(kind === "payment" ? "Pay through" : "Receive into", { exact: true })).toBeEnabled({
        timeout: 15_000,
      });
      await chooseBankDirectory(
        page,
        kind === "payment" ? "Pay through" : "Receive into",
        "Synthetic Bank Payment Operating Account",
      );
      await chooseBankDirectory(page, "Approver", "r06.checker");
      await chooseBankDirectory(
        page,
        "Line 1 nominal account",
        kind === "payment" ? "Synthetic Bank Payment Expense" : "Synthetic Bank Receipt Income",
      );
      await page.getByLabel("Posting date", { exact: true }).fill(date);
      await page.getByLabel("Line 1 document date", { exact: true }).fill(date);
      await page.getByLabel("Line 1 external reference", { exact: true }).fill(`FY-${randomUUID()}`);
      await page.getByLabel(`Line 1 ${kind} method`, { exact: true }).selectOption("bank_transfer");
      await page.getByLabel("Line 1 department", { exact: true }).fill("FINANCE");
      await page
        .getByLabel(kind === "payment" ? "Line 1 narration" : "Line 1 details", { exact: true })
        .fill("Fiscal calendar end-to-end regression");
      await page.getByLabel("Line 1 amount", { exact: true }).fill("11.25");
      await page.getByRole("button", { name: "More transaction actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Submit for Approval", exact: true }).click();
      await expect(page.getByText(/Draft .* is saved\. Submission\/approval is blocked/)).toBeVisible();
      const transaction = page.url().split("/").at(-1)!;
      // Scoped Finance user can explicitly reopen an ordinary soft-closed month.
      await page.goto("/#/finance/fiscal-periods");
      await page.getByLabel("Fiscal year", { exact: true }).selectOption(year);
      await page.getByLabel(`Select period ${month}`, { exact: true }).check();
      await page.getByRole("button", { name: "Open selected periods", exact: true }).click();
      await confirm(page, "Authorized synthetic bank testing dates");
      await page.goto(`/#/banking/add-bank-${kind}/${transaction}`);
      await page.getByRole("button", { name: "More transaction actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Submit for Approval", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`transaction-detail/${transaction}`));
      const pool = createDatabasePool(database!);
      try {
        expect(
          (
            await pool.query(
              `select state,original_journal_entry_id from bank_${kind} where tenant_id='nexora-r06-uat' and id=$1`,
              [transaction],
            )
          ).rows,
        ).toEqual([{ state: "submitted", original_journal_entry_id: null }]);
      } finally {
        await pool.end();
      }
      if (kind === "payment") {
        // Reuse a different soft-closed month for Receipt so both exercise the guard.
        await page.goto("/#/finance/fiscal-periods");
        await page.getByLabel("Fiscal year", { exact: true }).selectOption(year);
        await page.getByLabel("Select period 3", { exact: true }).check();
        await page.getByRole("button", { name: "Soft close selected", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: "Confirm calendar action", exact: true }).click();
        await expect(page.getByRole("dialog").getByRole("alert")).toContainText("incomplete accounting/Bank workflows");
        await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
        // The second iteration uses a separate month below.
      }
    }
  });
  test("ordinary users without calendar permissions see a denied state", async ({ page }) => {
    await login(page, "r06.restricted");
    await page.goto("/#/finance/fiscal-periods");
    await expect(page.getByText("Permission required: platform.fiscal_calendar.read.", { exact: true })).toBeVisible();
  });
});
