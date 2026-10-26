import { expect, test } from "@playwright/test";

const username = process.env.NEXORA_BANKING_SUPER_ADMIN_USERNAME;
const password = process.env.NEXORA_SHOAIB_PASSWORD;
const company = "nexora-r06-uat-company";

test.describe("Bank action confirmations", () => {
  test.skip(!username || !password, "Controlled local Bank super-admin credentials are required.");
  test("keeps success feedback across navigation and approves without a reason while requiring rejection reasons", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    expect(["127.0.0.1", "localhost", "[::1]"]).toContain(new URL(baseURL!).hostname);
    await page.goto("/login");
    await page.getByLabel("Username or email", { exact: true }).fill(username!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    const login = page.waitForResponse(
      (response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const loginResponse = await login;
    expect(loginResponse.status()).toBe(200);
    expect((await loginResponse.json()).tenant_id).toBe("nexora-r06-uat");
    await expect(page).not.toHaveURL(/\/login$/, { timeout: 20000 });
    const notices = page.getByRole("region", { name: "Action notifications" });
    const name = `Synthetic Bank feedback ${Date.now()}`;
    await page.goto("/#/banking/add-bank-account");
    const companyControl = page.getByLabel("Company", { exact: true });
    await expect(companyControl.locator(`option[value="${company}"]`)).toHaveCount(1);
    await companyControl.selectOption(company);
    await expect(page.getByLabel("Section", { exact: true })).toHaveValue(/.+/);
    await expect(page.getByLabel("Currency")).toHaveValue(/^[A-Z]{3}$/);
    await page.getByLabel("Nominal account name").fill(name);
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page).toHaveURL(/bank-account-detail\/nominal-/);
    await expect(notices.getByText("New bank account created successfully.")).toBeVisible();
    await page.getByRole("button", { name: "Edit draft", exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Synthetic feedback acceptance");
    const nominalId = page.url().match(/nominal-[a-f0-9-]{36}/)![0];
    await page.route(
      `**/api/v1/finance/nominals/${nominalId}`,
      (route) =>
        route.fulfill({
          status: 403,
          contentType: "application/problem+json",
          body: JSON.stringify({
            type: "https://nexora.example/problems/test-denial",
            title: "Forbidden",
            status: 403,
            detail: "Synthetic update denied.",
            code: "PERMISSION_DENIED",
          }),
        }),
      { times: 1 },
    );
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page.getByText("Synthetic update denied.", { exact: true })).toBeVisible();
    await expect(notices.getByText("Bank account updated successfully.")).toHaveCount(0);
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(notices.getByText("Bank account updated successfully.")).toBeVisible();
    await page.getByRole("button", { name: "Submit for approval", exact: true }).click();
    await page.getByRole("button", { name: "Confirm submit", exact: true }).click();
    await expect(notices.getByText("Bank account submitted for approval successfully.")).toBeVisible();
    await expect(page.getByText("Your super-admin approval will be recorded in the audit history.")).toBeVisible();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    const rejection = page.getByRole("dialog");
    await expect(rejection.getByLabel("Rejection reason")).toBeVisible();
    await expect(rejection.getByRole("button", { name: "Confirm reject", exact: true })).toBeDisabled();
    await rejection.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const approval = page.getByRole("dialog");
    await expect(approval.getByRole("textbox")).toHaveCount(0);
    const accepted = page.waitForResponse(
      (response) => response.url().includes("/decision") && response.request().method() === "POST",
    );
    await approval.getByRole("button", { name: "Approve & Close", exact: true }).click();
    expect((await accepted).status()).toBe(200);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(notices.getByText("Bank account approved successfully.")).toBeVisible();
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    // Retain immutable test history but do not leave the synthetic account active.
    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    await page.getByRole("button", { name: "Confirm deactivate", exact: true }).click();
    await expect(notices.getByText("Bank account deactivated successfully.")).toBeVisible();
    await expect(page.getByText("Not active", { exact: true })).toBeVisible();
    await page.goto("/#/banking/add-bank-account");
    await page.getByLabel("Company", { exact: true }).selectOption(company);
    await expect(page.getByLabel("Section", { exact: true })).toHaveValue(/.+/);
    await expect(page.getByLabel("Currency")).toHaveValue(/^[A-Z]{3}$/);
    await page.getByLabel("Nominal account name").fill(`${name} rejection`);
    await page.getByRole("button", { name: "Save & Submit", exact: true }).click();
    await expect(notices.getByText("Bank account submitted for approval successfully.")).toBeVisible();
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await page.getByLabel("Rejection reason").fill("Synthetic rejection acceptance");
    await page.getByRole("button", { name: "Confirm reject", exact: true }).click();
    await expect(notices.getByText("Bank account rejected successfully.")).toBeVisible();
    await expect(page.getByText("Not active", { exact: true })).toBeVisible();
  });
});
