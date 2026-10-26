import { expect, test, type Browser, type Page } from "@playwright/test";

const makerUsername = process.env.NEXORA_BANK_REVALUATION_MAKER_USERNAME;
const approverUsername = process.env.NEXORA_BANK_REVALUATION_APPROVER_USERNAME;
const posterUsername = process.env.NEXORA_BANK_REVALUATION_POSTER_USERNAME;
const password = process.env.NEXORA_E2E_PASSWORD;
const currency = process.env.NEXORA_BANK_REVALUATION_CURRENCY;
const revaluationDate = process.env.NEXORA_BANK_REVALUATION_DATE;

async function authenticatedPage(browser: Browser, username: string) {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3200" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  return { context, page };
}

async function openPersisted(page: Page, route: string) {
  await page.goto(route);
  await expect(page.getByRole("heading", { level: 1, name: /^BRV-/ })).toBeVisible();
}

test.describe("Bank Revaluation governed lifecycle", () => {
  test.skip(
    !makerUsername ||
      !approverUsername ||
      !posterUsername ||
      !password ||
      !currency ||
      !revaluationDate ||
      makerUsername === approverUsername,
    "Distinct local FX revaluation actors and an eligible disposable-data currency/date are required.",
  );

  test("creates, independently approves, posts and reloads persisted journal evidence", async ({ browser }) => {
    const maker = await authenticatedPage(browser, makerUsername!);
    await maker.page.goto("/#/banking/revaluation");
    await expect(maker.page.getByRole("heading", { level: 1, name: "Bank Revaluation" })).toBeVisible();
    await maker.page.getByRole("button", { name: "Add New" }).click();
    await maker.page.locator("#revaluation-currency").selectOption(currency!);
    await maker.page.locator("#revaluation-date").fill(revaluationDate!);
    await maker.page.getByRole("button", { name: "Apply" }).click();
    await expect(maker.page.getByText(new RegExp(`1 ${currency} =`))).toBeVisible();
    await maker.page.locator("#revaluation-reference").fill(`E2E-${Date.now()}`);
    await maker.page.locator("#revaluation-narration").fill("Disposable FX revaluation browser acceptance");
    await maker.page.locator("#revaluation-approver").selectOption("r06.checker");
    await maker.page.getByRole("button", { name: "Save draft" }).click();
    await expect(maker.page.getByRole("heading", { level: 1, name: /^BRV-/ })).toBeVisible();
    await maker.page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(maker.page.getByText("Waiting for approval", { exact: true })).toBeVisible();
    const persistedRoute = maker.page.url();
    await maker.context.close();

    const approver = await authenticatedPage(browser, approverUsername!);
    await openPersisted(approver.page, persistedRoute);
    await approver.page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(approver.page.getByText("Approved", { exact: true })).toBeVisible();
    await approver.context.close();

    const poster = await authenticatedPage(browser, posterUsername!);
    await openPersisted(poster.page, persistedRoute);
    await poster.page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(poster.page.getByText("Posted", { exact: true })).toBeVisible();
    await expect(poster.page.getByText("2026-11-01", { exact: true })).toBeVisible();
    await expect(poster.page.getByText("Not posted", { exact: true })).toBeVisible();
    await poster.page.reload();
    await expect(poster.page.getByRole("heading", { level: 1, name: /^BRV-/ })).toBeVisible();
    await expect(poster.page.getByText("Posted", { exact: true })).toBeVisible();
    await expect(poster.page.getByText("2026-11-01", { exact: true })).toBeVisible();
    await poster.context.close();
  });
});
