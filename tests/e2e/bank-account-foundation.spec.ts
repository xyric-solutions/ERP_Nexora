import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createDatabasePool } from "../../packages/db/src/index.js";

const makerUsername = process.env.NEXORA_BANKING_MAKER_USERNAME;
const checkerUsername = process.env.NEXORA_BANKING_CHECKER_USERNAME;
const password = process.env.NEXORA_E2E_PASSWORD;
const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const tenantId = "nexora-r06-uat";
const companyId = "nexora-r06-uat-company";

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test.describe("bank account foundation", () => {
  test.setTimeout(90_000);
  test.skip(
    !makerUsername || !checkerUsername || !password || !databaseUrl,
    "Synthetic Banking maker/checker credentials and the isolated database are required.",
  );

  test("creates, independently approves, masks, and persists a bank account", async ({ page }) => {
    const suffix = randomUUID().slice(0, 8);
    const ledgerId = `bank-e2e-ledger-${suffix}`;
    const accountName = `E2E Operating ${suffix}`;
    const accountNumber = `9900${suffix.replaceAll("-", "")}7812`;
    const pool = createDatabasePool(databaseUrl!);
    await pool.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,status,manual_posting_allowed,
         is_system_account,reconciliation_required,created_at)
       values ($1,$2,$3,$4,$5,'asset',false,'active',true,false,true,now())`,
      [ledgerId, tenantId, companyId, `E2E-${suffix}`, `E2E Bank Control ${suffix}`],
    );

    try {
      await login(page, makerUsername!);
      await page.goto("/#/banking/add-bank-account");
      await expect(page.getByRole("heading", { level: 1, name: "Bank Account Setup" })).toBeVisible();
      await expect(page.getByText("Backend Connected", { exact: true })).toBeVisible();
      await page.getByRole("combobox", { name: "Company", exact: true }).selectOption(companyId);
      await expect(page.getByRole("combobox", { name: "Mapped nominal account" })).toBeEnabled();
      await page.getByLabel("Account name").fill(accountName);
      await page.getByLabel("Bank", { exact: true }).fill("Synthetic Acceptance Bank");
      await page.getByLabel("Branch").fill("Karachi Test Branch");
      await page.getByLabel("Account number").fill(accountNumber);
      await page.getByLabel("IBAN (optional)").fill(`PK00E2E${suffix.toUpperCase()}`);
      await page.getByLabel("SWIFT / BIC (optional)").fill("SYNTPKKA");
      await page.getByRole("combobox", { name: "Mapped nominal account" }).selectOption(ledgerId);
      await page.getByRole("button", { name: "Save and submit" }).click();
      await expect(page.getByText(/persisted as pending approval/i)).toBeVisible();

      await page.context().clearCookies();
      await login(page, checkerUsername!);
      await page.goto("/#/banking/bank-account-approvals");
      await expect(page.getByRole("heading", { level: 1, name: "Bank Account Approvals" })).toBeVisible();
      const pendingRow = page.getByRole("row").filter({ hasText: accountName });
      await expect(pendingRow).toBeVisible();
      await pendingRow.getByRole("button", { name: "Review" }).click();
      await expect(page.getByText(accountName).last()).toBeVisible();
      await expect(page.getByRole("definition").filter({ hasText: "•••• 7812" })).toBeVisible();
      await page.getByRole("button", { name: "Approve and activate" }).click();
      await expect(page.getByText(/activated/i)).toBeVisible();

      await page.context().clearCookies();
      await login(page, makerUsername!);
      await page.goto("/#/banking/account-balances");
      await expect(page.getByRole("heading", { level: 1, name: "Account Balances" })).toBeVisible();
      await page.getByRole("textbox", { name: "Search bank accounts" }).fill(accountName);
      const activeRow = page.getByRole("row").filter({ hasText: accountName });
      await expect(activeRow).toContainText("Active");
      await expect(activeRow).toContainText("•••• 7812");
      await page.reload();
      await expect(page.getByRole("row").filter({ hasText: accountName })).toContainText("Active");

      const persisted = await pool.query<{
        status: string;
        account_number_ciphertext: Buffer;
        account_number_masked: string;
        event_count: string;
      }>(
        `select bank.status,bank.account_number_ciphertext,bank.account_number_masked,
                (select count(*)::text from bank_account_event event
                  where event.tenant_id=bank.tenant_id and event.account_id=bank.id) event_count
           from bank_account bank
          where bank.tenant_id=$1 and bank.account_name=$2`,
        [tenantId, accountName],
      );
      expect(persisted.rows[0]).toMatchObject({
        status: "active",
        account_number_masked: "•••• 7812",
        event_count: "3",
      });
      expect(persisted.rows[0]?.account_number_ciphertext.toString("utf8")).not.toContain(accountNumber);
    } finally {
      await pool.end();
    }
  });
});
