import { expect, test } from "@playwright/test";

const username = process.env.NEXORA_BANKING_SUPER_ADMIN_USERNAME;
const password = process.env.NEXORA_SHOAIB_PASSWORD;
const company = "nexora-r06-uat-company";
test("creates an ordinary nominal, approves it, and saves a Bank Payment using its persisted ID", async ({
  page,
  baseURL,
}) => {
  test.skip(!username || !password, "Controlled local credentials are required.");
  test.setTimeout(120_000);
  expect(["127.0.0.1", "localhost", "[::1]"]).toContain(new URL(baseURL!).hostname);
  await page.goto("/login");
  await page.getByLabel("Username or email", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  const login = page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await (await login).json()).tenant_id).toBe("nexora-r06-uat");
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto("/#/finance/chart-of-accounts");
  await expect(page.getByText("Chart of Accounts", { exact: true }).last()).toBeVisible();
  await page.getByLabel("Nominal company", { exact: true }).selectOption(company);
  await page.getByRole("button", { name: "Add Nominal", exact: true }).click();
  await page.getByLabel("Company", { exact: true }).selectOption(company);
  const category = page.getByLabel("Category", { exact: true });
  await expect(category.locator('option[value="r06-uat-general-expense-category"]')).toHaveCount(1);
  await category.selectOption("r06-uat-general-expense-category");
  await expect(page.getByLabel("Section", { exact: true })).toHaveValue("r06-uat-general-expense-section");
  const name = `Synthetic general nominal browser ${Date.now()}`;
  await page.getByLabel("Nominal account name", { exact: false }).fill(name);
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/finance/nominals") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save & Submit", exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const nominal = await response.json();
  expect(nominal.bank_account_id).toBeNull();
  await expect(page).toHaveURL(/finance\/nominal-detail\/nominal-/);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const approval = page.getByRole("dialog");
  await expect(approval.getByRole("textbox")).toHaveCount(0);
  await approval.getByRole("button", { name: "Approve & Close", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Action notifications" })
      .getByText("Nominal account approved successfully.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(nominal.code + " · " + name, { exact: true })).toBeVisible();
  await page.goto("/#/banking/add-bank-payment");
  await page.getByLabel("Company", { exact: true }).selectOption(company);
  const bank = page.getByLabel("Pay through", { exact: true });
  await expect(bank).toBeEnabled();
  const syntheticBank = await bank
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => ({ value: (option as HTMLOptionElement).value, label: option.textContent ?? "" }))
        .find((option) => option.value && /synthetic|test/i.test(option.label)),
    );
  expect(syntheticBank).toBeDefined();
  await bank.selectOption(syntheticBank!.value);
  await page.getByLabel("Search nominal accounts", { exact: true }).fill(nominal.code);
  const nominalControl = page.getByLabel("Line 1 nominal account", { exact: true });
  await expect(nominalControl.locator('option[value="' + nominal.id + '"]')).toHaveCount(1);
  await nominalControl.selectOption(nominal.id);
  await page.getByLabel("Line 1 external reference", { exact: true }).fill("SYNTHETIC-GENERAL-UAT");
  await page.getByLabel("Line 1 payment method", { exact: true }).selectOption("bank_transfer");
  await page
    .getByLabel("Line 1 narration", { exact: true })
    .fill("Synthetic nominal integration acceptance - no posting");
  await page.getByLabel("Line 1 amount", { exact: true }).fill("12.50");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/banking/payments") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  const savedResponse = await saved;
  expect(savedResponse.status()).toBe(201);
  const payment = await savedResponse.json();
  expect(payment.state).toBe("draft");
  await page.reload();
  await expect(page.getByLabel("Line 1 nominal account", { exact: true })).toHaveValue(nominal.id);
  await expect(page.getByLabel("Line 1 amount", { exact: true })).toHaveValue(/^12\.50(?:0+)?$/);
  await page.goto("/#/banking/add-bank-receipt");
  await page.getByLabel("Company", { exact: true }).selectOption(company);
  await page.getByLabel("Search nominal accounts", { exact: true }).fill(nominal.code);
  await expect(
    page.getByLabel("Line 1 nominal account", { exact: true }).locator('option[value="' + nominal.id + '"]'),
  ).toHaveCount(1);
  // Retain immutable synthetic history without leaving this acceptance nominal selectable.
  page.once("dialog", (dialog) => dialog.accept());
  await page.goto("/#/finance/nominal-detail/" + nominal.id);
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByRole("button", { name: "Confirm deactivate", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Action notifications" })
      .getByText("Nominal account deactivated successfully.", { exact: true }),
  ).toBeVisible();
});
