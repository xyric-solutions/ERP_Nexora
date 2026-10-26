import { expect, test, type Page } from "@playwright/test";

const maker = process.env.NEXORA_BANKING_MAKER_USERNAME;
const checker = process.env.NEXORA_BANKING_CHECKER_USERNAME;
const password = process.env.NEXORA_E2E_PASSWORD;
const companyId = "nexora-r06-uat-company";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
async function createDraft(page: Page, route: string, name: string) {
  await page.goto(route);
  const company = page.getByLabel("Company", { exact: true });
  await expect(company.locator(`option[value="${companyId}"]`)).toHaveCount(1);
  await company.selectOption(companyId);
  await expect(page.getByLabel("Section", { exact: true })).toHaveValue(/.+/);
  await page.getByLabel("Nominal account name").fill(name);
  await expect(page.getByLabel("Currency")).toHaveValue(/^[A-Z]{3}$/);
  await expect(page.getByLabel("Nominal code")).toHaveValue("Generated when you save");
  await expect(page.getByLabel(/IBAN|SWIFT|Branch|Account number/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page).toHaveURL(/nominal-[a-f0-9-]{36}/);
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
  return page.url();
}

test.describe("Bank nominal master-data integration", () => {
  test.skip(!maker || !checker || !password, "Isolated Bank Nominal UAT credentials are required.");

  test("shares the form across Bank and Finance, persists sessions, and independently approves", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const makerContext = await browser.newContext(),
      makerPage = await makerContext.newPage();
    const name = `Synthetic Bank Nominal ${Date.now()}`;
    await signIn(makerPage, maker!);
    const detailUrl = await createDraft(makerPage, "/#/banking/add-bank-account", name);
    await makerPage.reload();
    await expect(makerPage.getByText(name, { exact: false }).first()).toBeVisible();
    await makerPage.getByRole("button", { name: "Submit for approval", exact: true }).click();
    await expect(makerPage.getByLabel(/reason/i)).toHaveCount(0);
    await makerPage.getByRole("button", { name: "Confirm submit", exact: true }).click();
    await expect(makerPage.getByText("An independent checker must decide this request.")).toBeVisible();
    await expect(makerPage.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    const checkerContext = await browser.newContext(),
      checkerPage = await checkerContext.newPage();
    await signIn(checkerPage, checker!);
    await checkerPage.goto(detailUrl);
    await checkerPage.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(checkerPage.getByLabel(/reason/i)).toHaveCount(0);
    await checkerPage.getByRole("button", { name: "Approve & Close", exact: true }).click();
    await expect(checkerPage.getByText("Available", { exact: true })).toBeVisible();
    await makerContext.close();
    const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const freshPage = await freshContext.newPage();
    await signIn(freshPage, maker!);
    await freshPage.goto(detailUrl);
    await expect(freshPage.getByText("Available", { exact: true })).toBeVisible();
    await createDraft(freshPage, "/#/finance/add-nominal", `${name} second`);
    await checkerContext.close();
    await freshContext.close();
  });
});
