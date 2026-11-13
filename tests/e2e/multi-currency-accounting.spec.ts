import { test, expect, type Browser, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const enabled = process.env.NEXORA_SUBLEDGER_E2E === "true";
const password = process.env.NEXORA_E2E_PASSWORD;
async function signIn(browser: Browser, username: string) {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3200" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Open nexora-currency-browser", exact: true }).click();
  await page.goto("/#/finance/multi-currency");
  await expect(page.getByRole("heading", { name: "Currencies & Transfer FX", exact: true })).toBeVisible();
  const reportingGroup = page.getByRole("button", { name: "Reporting Master Data", exact: true });
  if ((await reportingGroup.getAttribute("aria-expanded")) !== "true") await reportingGroup.click();
  await expect(page.locator(".nx-submenu-link span").filter({ hasText: /^Currencies & Transfer FX$/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Multi-currency Accounting", exact: true })).toHaveCount(0);
  await page.getByLabel("Balances as of", { exact: true }).fill("2026-11-30");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  return { page, context };
}
async function chooseCustomer(page: Page) {
  await expect(
    page.getByLabel("Customer / supplier").locator("option").filter({ hasText: "Currency Browser Customer" }),
  ).toHaveCount(1);
  await page.getByLabel("Customer / supplier").selectOption({ label: "CUS-001 · Currency Browser Customer" });
  await page.getByLabel("Original currency", { exact: true }).selectOption("USD");
  await expect(page.getByRole("table").first()).toBeVisible();
}
async function finish(browser: Browser, maker: Page, code: string) {
  const row = maker.getByRole("row").filter({ has: maker.getByRole("button", { name: code, exact: true }) });
  await row.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(row.getByText("submitted", { exact: true })).toBeVisible();
  const checker = await signIn(browser, "r06.checker");
  const review = checker.page
    .getByRole("row")
    .filter({ has: checker.page.getByRole("button", { name: code, exact: true }) });
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(review.getByText("approved", { exact: true })).toBeVisible();
  await checker.context.close();
  const poster = await signIn(browser, "r06.target");
  const posting = poster.page
    .getByRole("row")
    .filter({ has: poster.page.getByRole("button", { name: code, exact: true }) });
  await posting.getByRole("button", { name: "Post", exact: true }).click();
  await expect(posting.getByText("posted", { exact: true })).toBeVisible();
  await poster.context.close();
  await maker.getByRole("button", { name: "Refresh", exact: true }).click();
}

test.describe("persistent multi-currency accounting", () => {
  test.skip(!enabled || !password, "Run through the isolated multi-currency browser harness.");
  test("invoice -> partial receipt -> valuation -> final receipt -> historical report and reload", async ({
    browser,
  }) => {
    test.setTimeout(300000);
    const maker = await signIn(browser, "r06.maker");
    try {
      const apiOrigin = `http://127.0.0.1:${process.env.NEXORA_BANK_CONTEXT_E2E_PORT}`;
      const crossCompany = await maker.context.request.get(
        `${apiOrigin}/api/v1/finance/subledger/workspace?company_id=unpermitted-company&as_of=2026-11-30`,
        { headers: { "x-company-id": "nexora-currency-browser" } },
      );
      expect(crossCompany.status()).toBe(403);
      const badCsrf = await maker.context.request.post(`${apiOrigin}/api/v1/finance/subledger/parties`, {
        headers: { "x-company-id": "nexora-currency-browser", "idempotency-key": "reject-bad-csrf" },
        data: {
          company_id: "nexora-currency-browser",
          kind: "customer",
          name: "Must not be created",
          default_currency: "USD",
        },
      });
      expect(badCsrf.status()).toBe(403);
      await maker.page.getByRole("button", { name: "Currencies & transfer rules", exact: true }).click();
      await expect(maker.page).toHaveURL(/#\/finance\/currencies-fx$/);
      await expect(maker.page.getByText("Financial reporting base", { exact: true })).toBeVisible();
      await expect(maker.page.getByText("Bank Transfer FX policy", { exact: true })).toBeVisible();
      await maker.page.getByRole("button", { name: "Balances & transactions", exact: true }).click();
      await expect(maker.page).toHaveURL(/#\/finance\/currencies-fx\/accounting$/);
      await chooseCustomer(maker.page);
      await maker.page.getByRole("button", { name: "Invoices & credits", exact: true }).click();
      await maker.page.getByLabel("Amount in original currency").fill("1000");
      await maker.page.getByLabel("Posting date", { exact: true }).fill("2026-09-20");
      await maker.page.getByLabel("Due date", { exact: true }).fill("2026-09-30");
      await maker.page.getByLabel("Reason", { exact: true }).fill("Verified browser invoice");
      await maker.page.getByRole("button", { name: "Save financial draft", exact: true }).click();
      await expect(maker.page.getByRole("button", { name: "ARI-001", exact: true })).toBeVisible();
      await finish(browser, maker.page, "ARI-001");

      await maker.page.getByRole("button", { name: "Receipts & payments", exact: true }).click();
      await maker.page.getByLabel("Posting date", { exact: true }).fill("2026-10-02");
      await maker.page.getByLabel("Payment currency", { exact: true }).selectOption("USD");
      await maker.page.getByLabel("Bank account", { exact: true }).selectOption({ label: "USD · USD" });
      await maker.page.getByLabel("Payment amount before bank fee").fill("500");
      await maker.page.getByLabel("Allocate ARI-001", { exact: true }).fill("500");
      await maker.page.getByRole("button", { name: "Save settlement draft", exact: true }).click();
      await expect(maker.page.getByRole("button", { name: "SET-001", exact: true })).toBeVisible();
      await finish(browser, maker.page, "SET-001");

      await maker.page.getByRole("button", { name: "Outstanding balance valuation", exact: true }).click();
      await maker.page.getByLabel("Posting date", { exact: true }).fill("2026-10-31");
      await maker.page.getByRole("button", { name: "Calculate valuation draft", exact: true }).click();
      await expect(maker.page.getByRole("button", { name: "FXR-001", exact: true })).toBeVisible();
      await finish(browser, maker.page, "FXR-001");

      await maker.page.getByRole("button", { name: "Receipts & payments", exact: true }).click();
      await maker.page.getByLabel("Posting date", { exact: true }).fill("2026-11-02");
      await maker.page.getByLabel("Allocate ARI-001", { exact: true }).fill("500");
      await maker.page.getByRole("button", { name: "Save settlement draft", exact: true }).click();
      await expect(maker.page.getByRole("button", { name: "SET-002", exact: true })).toBeVisible();
      await finish(browser, maker.page, "SET-002");

      await maker.page.reload();
      await expect(maker.page.getByRole("heading", { name: "Currencies & Transfer FX", exact: true })).toBeVisible();
      await chooseCustomer(maker.page);
      await maker.page.getByLabel("Balances as of", { exact: true }).fill("2026-10-31");
      await expect(maker.page.getByText("USD 500.00", { exact: true }).first()).toBeVisible();
      await expect(maker.page.getByText("PKR 142,500.00", { exact: true }).first()).toBeVisible();
      await maker.page.getByLabel("Balances as of", { exact: true }).fill("2026-11-30");
      await maker.page.getByRole("button", { name: "Statements & financial reports", exact: true }).click();
      await maker.page.getByLabel("Report", { exact: true }).selectOption("trial_balance");
      await maker.page.getByRole("button", { name: "Run posted report", exact: true }).click();
      await expect(maker.page.getByText(/Control reconciliation/).first()).toContainText("difference PKR 0.00");
      const fx = maker.page
        .getByRole("row")
        .filter({ has: maker.page.getByRole("cell", { name: "realized_gain", exact: true }) });
      await expect(fx).toContainText("PKR -6,000.00");
      await mkdir("tmp/multi-currency-evidence", { recursive: true });
      await maker.page.screenshot({ path: "tmp/multi-currency-evidence/desktop-light.png", fullPage: true });
      await maker.page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      await maker.page.screenshot({ path: "tmp/multi-currency-evidence/desktop-dark.png", fullPage: true });
      await maker.page.setViewportSize({ width: 820, height: 1180 });
      await maker.page.screenshot({ path: "tmp/multi-currency-evidence/tablet-dark.png", fullPage: true });
      await maker.page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() =>
          maker.page.locator("#nexora-navigation").evaluate((element) => element.getBoundingClientRect().right),
        )
        .toBeLessThanOrEqual(0);
      await expect(maker.page.getByRole("heading", { name: "Currencies & Transfer FX", exact: true })).toBeVisible();
      await maker.page.screenshot({ path: "tmp/multi-currency-evidence/mobile-dark.png", fullPage: true });
      await maker.page.evaluate(() => {
        document.documentElement.dataset.theme = "light";
      });
      await maker.page.screenshot({ path: "tmp/multi-currency-evidence/mobile-light.png", fullPage: true });
    } finally {
      await maker.context.close();
    }
  });
});
