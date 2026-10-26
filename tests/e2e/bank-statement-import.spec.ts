import { expect, test, type Page } from "@playwright/test";

import { createMinimalXlsx } from "../unit/bank-statement-xlsx-fixture.js";

const maker = process.env.NEXORA_BANKING_MAKER_USERNAME;
const password = process.env.NEXORA_E2E_PASSWORD;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(maker!);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function waitForBank(page: Page) {
  const bank = page.getByRole("combobox", { name: "Bank", exact: true });
  await expect(bank).toBeVisible();
  await expect(bank).not.toHaveValue("");
}

test.describe.serial("Bank Statement Import browser acceptance", () => {
  test.skip(!maker || !password, "Isolated Bank Reconciliation maker credentials are required.");

  test("uploads, validates and finalizes a standard CSV, then reloads its persisted reconciliation", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto("/#/banking/import-statement");
    await expect(page.getByRole("heading", { level: 1, name: "Import Statement" })).toBeVisible();
    await waitForBank(page);

    const reference = `E2E-CSV-${Date.now()}`;
    const filename = `${reference}.csv`;
    const date = new Date().toISOString().slice(0, 10);
    const csv = [
      "Date,Payment,Receipt,Transaction Type,Account,Payment Mode,Ref No.,Detail",
      `${date},,125.00,Receipt,Synthetic customer,ACH,${reference},Synthetic CSV receipt`,
    ].join("\r\n");
    await page.getByRole("combobox", { name: "Date format" }).selectOption("yyyy-MM-dd");
    await page.getByRole("textbox", { name: "Statement reference" }).fill(reference);
    await page
      .getByLabel("Statement file")
      .setInputFiles({ name: filename, mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "Upload", exact: true }).click();

    await expect(page.getByText(filename, { exact: true })).toBeVisible();
    await expect(page.getByText("Synthetic CSV receipt", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Statement validation counts")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Synthetic CSV receipt", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Validate Statement", exact: true }).click();
    const finalize = page.getByRole("button", { name: "Post to Reconciliation and Close", exact: true });
    await expect(finalize).toBeEnabled();
    await finalize.click();
    await expect(page.getByRole("heading", { level: 1, name: "New Bank Reconciliation" })).toBeVisible();
    await page.getByLabel("Opening statement balance").fill("0.00");
    await page.getByLabel("Closing statement balance").fill("125.00");
    await page.getByRole("button", { name: "Save reconciliation", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Bank Reconciliation", exact: true })).toBeVisible();
    await expect(page.getByText("Synthetic CSV receipt", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Bank Reconciliation", exact: true })).toBeVisible();
    await expect(page.getByText(reference, { exact: true }).first()).toBeVisible();
  });

  test("imports Excel and reuses a saved bank mapping for a second native file", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await page.goto("/#/banking/import-statement");
    await waitForBank(page);

    const stamp = Date.now();
    const date = new Date().toISOString().slice(0, 10);
    const profileName = `Synthetic XLSX mapping ${stamp}`;
    const firstReference = `E2E-XLSX-${stamp}-A`;
    const first = createMinimalXlsx({
      rows: [
        ["Date", "Payment", "Receipt", "Transaction Type", "Account", "Payment Mode", "Ref No.", "Detail"],
        [date, "15.00", "", "Fee", "Synthetic bank", "Debit", firstReference, "Synthetic Excel fee"],
      ],
    });
    await page.getByRole("combobox", { name: "Date format" }).selectOption("yyyy-MM-dd");
    await page.getByRole("textbox", { name: "Statement reference" }).fill(firstReference);
    await page.getByLabel("Statement file").setInputFiles({
      name: `${firstReference}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: first,
    });
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByText("Synthetic Excel fee", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit mapping", exact: true }).click();
    await page.getByRole("textbox", { name: "Mapping profile name" }).fill(profileName);
    await page.getByRole("button", { name: "Save mapping", exact: true }).click();
    await expect(
      page.getByText("Column mapping saved and the statement was parsed again.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Validate Statement", exact: true }).click();
    await page.getByRole("button", { name: "Post to Reconciliation and Close", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "New Bank Reconciliation" })).toBeVisible();

    await page.goto("/#/banking/import-statement");
    await waitForBank(page);
    await page.getByRole("combobox", { name: "Saved bank mapping" }).selectOption({ label: profileName });
    const secondReference = `E2E-XLSX-${stamp}-B`;
    const second = createMinimalXlsx({
      rows: [
        ["Date", "Payment", "Receipt", "Transaction Type", "Account", "Payment Mode", "Ref No.", "Detail"],
        [date, "16.00", "", "Fee", "Synthetic bank", "Debit", secondReference, "Reused mapping Excel fee"],
      ],
    });
    await page.getByRole("combobox", { name: "Date format" }).selectOption("yyyy-MM-dd");
    await page.getByRole("textbox", { name: "Statement reference" }).fill(secondReference);
    await page.getByLabel("Statement file").setInputFiles({
      name: `${secondReference}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: second,
    });
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByText("Reused mapping Excel fee", { exact: true })).toBeVisible();
  });
});
