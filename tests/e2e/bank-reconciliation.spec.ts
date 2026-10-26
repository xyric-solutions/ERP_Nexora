import { expect, test, type Page } from "@playwright/test";

const maker = process.env.NEXORA_BANKING_MAKER_USERNAME;
const checker = process.env.NEXORA_BANKING_CHECKER_USERNAME;
const password = process.env.NEXORA_E2E_PASSWORD;

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test.describe("Bank Reconciliation lifecycle browser acceptance", () => {
  test.skip(!maker || !checker || !password, "Isolated Bank Reconciliation credentials are required.");

  test("persists a balanced manual reconciliation and requires a separate approver", async ({ browser }) => {
    test.setTimeout(120_000);
    const makerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const makerPage = await makerContext.newPage();
    await signIn(makerPage, maker!);
    await makerPage.goto("/#/banking/bank-reconciliation/new");
    await expect(makerPage.getByRole("heading", { level: 1, name: "New Bank Reconciliation" })).toBeVisible();
    await expect(makerPage.getByRole("combobox", { name: "Bank account" })).not.toHaveValue("");
    await makerPage.getByRole("combobox", { name: "Reconciliation method" }).selectOption("manual_tick");
    const reference = `E2E-MANUAL-${Date.now()}`;
    await makerPage.getByRole("textbox", { name: "Statement reference" }).fill(reference);
    await makerPage.getByRole("textbox", { name: "Opening statement balance" }).fill("0.00");
    await makerPage.getByRole("textbox", { name: "Closing statement balance" }).fill("0.00");
    await makerPage.getByRole("button", { name: "Save reconciliation", exact: true }).click();
    await expect(makerPage.getByRole("heading", { level: 1, name: "Bank Reconciliation", exact: true })).toBeVisible();
    await expect(makerPage).toHaveURL(/bank-reconciliation-[a-f0-9-]{36}$/);
    const detailUrl = makerPage.url();
    await makerPage.reload();
    await expect(makerPage.getByText(reference, { exact: true })).toBeVisible();
    const submit = makerPage.getByRole("button", { name: "Submit for Approval", exact: true });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(
      makerPage.getByText("Reconciliation submitted for independent approval.", { exact: true }),
    ).toBeVisible();
    await expect(makerPage.getByRole("button", { name: "Approve & Close", exact: true }).first()).toBeDisabled();

    const checkerContext = await browser.newContext();
    const checkerPage = await checkerContext.newPage();
    await signIn(checkerPage, checker!);
    await checkerPage.goto(detailUrl);
    await expect(checkerPage.getByText(reference, { exact: true })).toBeVisible();
    const approve = checkerPage.getByRole("button", { name: "Approve & Close", exact: true }).first();
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(checkerPage).toHaveURL(/#\/banking\/bank-reconciliation$/);
    const approvedRow = checkerPage.getByRole("row").filter({ hasText: reference });
    await expect(approvedRow).toBeVisible();
    await expect(approvedRow.getByText("Approved", { exact: true })).toBeVisible();
    await checkerContext.close();
    await makerContext.close();
  });
});
