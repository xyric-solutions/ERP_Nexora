import { expect, test, type Browser, type Page } from "@playwright/test";

const makerUsername = process.env.NEXORA_BANKING_MAKER_USERNAME;
const checkerUsername = process.env.NEXORA_BANKING_CHECKER_USERNAME;
const posterUsername = process.env.NEXORA_BANKING_POSTER_USERNAME;
const superAdminUsername = process.env.NEXORA_BANKING_SUPER_ADMIN_USERNAME;
const ordinaryPassword = process.env.NEXORA_E2E_PASSWORD;
const superAdminPassword = process.env.NEXORA_SHOAIB_PASSWORD;
const restrictedUsername = process.env.NEXORA_BANKING_RESTRICTED_USERNAME ?? "r06.restricted";

const requiredEnvironment = [
  makerUsername,
  checkerUsername,
  posterUsername,
  superAdminUsername,
  ordinaryPassword,
  superAdminPassword,
];

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function authenticatedPage(browser: Browser, username: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, username, password);
  return { context, page };
}

async function choosePersistedOption(page: Page, label: string, optionText: string) {
  const select = page.getByRole("combobox", { name: label, exact: true });
  await expect(select).toBeEnabled();
  await expect.poll(() => select.locator("option").count()).toBeGreaterThan(1);
  const value = await select.locator("option").evaluateAll((options, expectedText) => {
    const option = options.find((candidate) => candidate.textContent?.includes(expectedText));
    return option instanceof HTMLOptionElement ? option.value : "";
  }, optionText);
  expect(value, `${label} option containing ${optionText}`).not.toBe("");
  await select.selectOption(value);
}

async function fillLine(page: Page, line: number, suffix: string, amount: string) {
  await page.getByLabel(`Line ${line} external reference`).fill(`E2E-${suffix}-${line}`);
  await page.getByLabel(`Line ${line} document reference`).fill(`DOC-${suffix}-${line}`);
  await page.getByLabel(`Line ${line} payment method`).selectOption("bank_transfer");
  await choosePersistedOption(page, `Line ${line} nominal account`, "Synthetic Bank Payment Expense");
  await page.getByLabel(`Line ${line} department`).fill("SERVICES");
  await page.getByLabel(`Line ${line} narration`).fill(`Bank Payment acceptance ${suffix} line ${line}`);
  await page.getByLabel(`Line ${line} amount`).fill(amount);
}

async function preparePayment(page: Page, suffix: string, multiLine: boolean) {
  await page.goto("/#/banking/add-bank-payment");
  await expect(page.getByRole("heading", { level: 1, name: "Add Bank Payment" })).toBeVisible();
  await choosePersistedOption(page, "Pay through", "Synthetic Bank Payment Operating Account");
  await fillLine(page, 1, suffix, "125.25");
  if (multiLine) {
    await page.getByRole("button", { name: "+ Add More" }).click();
    await fillLine(page, 2, suffix, "74.75");
  }
}

function paymentIdFromUrl(page: Page): string {
  const match = page.url().match(/bank-payment-[0-9a-f-]{36}/i);
  if (!match) throw new Error(`Persisted Bank Payment ID is missing from ${page.url()}`);
  return match[0];
}

test.describe("bank payments governed lifecycle", () => {
  test.skip(
    requiredEnvironment.some((value) => !value),
    "Local synthetic Bank Payment credentials are required.",
  );

  test("persists, approves, posts and reverses with independent actors", async ({ browser }) => {
    test.setTimeout(120_000);
    const suffix = Date.now().toString(36).toUpperCase();
    const maker = await authenticatedPage(browser, makerUsername!, ordinaryPassword!);
    await preparePayment(maker.page, suffix, true);

    await maker.page.getByRole("button", { name: "Save Draft" }).click();
    await expect(maker.page.getByRole("status").getByText("Saved successfully")).toBeVisible();
    const reference = await maker.page.getByLabel("Payment reference").inputValue();
    expect(reference).toMatch(/^BP-/);
    const paymentId = paymentIdFromUrl(maker.page);
    const detailUrl = `/#/banking/transaction-detail/${paymentId}`;

    await maker.page.reload();
    await expect(maker.page.getByLabel("Payment reference")).toHaveValue(reference);
    await expect(maker.page.getByLabel("Line 1 narration")).toHaveValue(`Bank Payment acceptance ${suffix} line 1`);
    await expect(maker.page.getByLabel("Line 2 narration")).toHaveValue(`Bank Payment acceptance ${suffix} line 2`);

    await maker.page.getByRole("button", { name: "Submit for Approval" }).click();
    await expect(maker.page).toHaveURL(new RegExp(`transaction-detail/${paymentId}$`));
    await expect(maker.page.getByText("Submitted", { exact: true })).toBeVisible();
    await expect(maker.page.getByText("Independent checker required")).toBeVisible();
    await expect(maker.page.getByRole("button", { name: "Edit draft" })).toHaveCount(0);
    await expect(maker.page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await maker.context.close();

    const checker = await authenticatedPage(browser, checkerUsername!, ordinaryPassword!);
    await checker.page.goto(detailUrl);
    await expect(checker.page.getByRole("heading", { level: 1, name: reference })).toBeVisible();
    await expect(checker.page.getByText("Accounting preview", { exact: true })).toBeVisible();
    await expect(checker.page.getByText("Recorded accounting linkage")).toHaveCount(0);
    await expect(checker.page.getByLabel(/Decision reason|Rejection reason/)).toHaveCount(0);
    await checker.page.getByRole("button", { name: "Approve" }).click();
    await expect(checker.page.getByText("Approved", { exact: true })).toBeVisible();
    await expect(checker.page.getByText("Accounting preview", { exact: true })).toBeVisible();
    await checker.context.close();

    const poster = await authenticatedPage(browser, posterUsername!, ordinaryPassword!);
    await poster.page.goto(detailUrl);
    await poster.page.getByRole("button", { name: "Prepare posting" }).click();
    await expect(poster.page.getByText("Confirm Finance posting")).toBeVisible();
    await poster.page.getByRole("button", { name: "Confirm post" }).click();
    await expect(poster.page.getByText("Posted", { exact: true })).toBeVisible();
    await expect(poster.page.getByText("Recorded accounting linkage", { exact: true })).toBeVisible();
    const originalEntry = poster.page
      .getByText("Original posting", { exact: true })
      .locator("..")
      .locator("dd")
      .first();
    await expect(originalEntry).not.toHaveText("Unavailable");
    const originalEntryNumber = await originalEntry.textContent();

    await poster.page.getByLabel("Reversal reason").fill("Acceptance compensating reversal");
    await poster.page.getByRole("button", { name: "Review reversal" }).click();
    await poster.page.getByRole("button", { name: "Confirm reverse" }).click();
    await expect(poster.page.getByText("Reversed", { exact: true })).toBeVisible();
    await expect(poster.page.getByText("Compensating reversal", { exact: true })).toBeVisible();
    await expect(originalEntry).toHaveText(originalEntryNumber ?? "");
    const reversalEntry = poster.page
      .getByText("Compensating reversal", { exact: true })
      .locator("..")
      .locator("dd")
      .first();
    await expect(reversalEntry).not.toHaveText("Unavailable");
    await expect(reversalEntry).not.toHaveText(originalEntryNumber ?? "");

    await poster.page.reload();
    await expect(poster.page.getByText("Reversed", { exact: true })).toBeVisible();
    await expect(poster.page.getByText("Compensating reversal", { exact: true })).toBeVisible();
    await poster.context.close();
  });

  test("records the governed shoaib self-approval override", async ({ browser }) => {
    test.setTimeout(90_000);
    const suffix = `OVERRIDE-${Date.now().toString(36).toUpperCase()}`;
    const admin = await authenticatedPage(browser, superAdminUsername!, superAdminPassword!);
    await preparePayment(admin.page, suffix, false);
    await admin.page.getByRole("button", { name: "Submit for Approval" }).click();
    await expect(admin.page).toHaveURL(/transaction-detail\/bank-payment-[0-9a-f-]{36}$/i);
    const paymentId = paymentIdFromUrl(admin.page);
    await expect(admin.page.getByText("Super-admin override")).toBeVisible();
    await expect(admin.page.getByLabel(/Decision reason|Rejection reason/)).toHaveCount(0);
    await admin.page.getByRole("button", { name: "Approve" }).click();
    await expect(admin.page.getByText("Approved", { exact: true })).toBeVisible();
    await expect(admin.page.getByText("Controlled UAT maker-checker override")).toBeVisible();

    await admin.page.reload();
    await expect(admin.page).toHaveURL(new RegExp(`transaction-detail/${paymentId}$`));
    await expect(admin.page.getByText("Controlled UAT maker-checker override")).toBeVisible();
    await admin.context.close();
  });

  test("fails closed for restricted sessions and remains usable at narrow width", async ({ browser }) => {
    const restricted = await authenticatedPage(browser, restrictedUsername, ordinaryPassword!);
    await restricted.page.goto("/#/banking/bank-payments");
    await expect(restricted.page.getByText("Permission required")).toBeVisible();
    await expect(restricted.page.getByText("BP-2026-", { exact: false })).toHaveCount(0);
    await restricted.context.close();

    const maker = await authenticatedPage(browser, makerUsername!, ordinaryPassword!);
    await maker.page.setViewportSize({ width: 390, height: 844 });
    await maker.page.goto("/#/banking/bank-payments");
    await expect(maker.page.getByRole("heading", { level: 1, name: "Bank Payments" })).toBeVisible();
    await expect(maker.page.getByRole("button", { name: "Add bank payment" })).toBeVisible();
    await maker.context.close();
  });
});
