import { expect, test } from "@playwright/test";

const makerUsername = process.env.NEXORA_BANKING_MAKER_USERNAME;
const ordinaryPassword = process.env.NEXORA_E2E_PASSWORD;

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(makerUsername!);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(ordinaryPassword!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test.describe("bank transfers responsive acceptance", () => {
  test.skip(!makerUsername || !ordinaryPassword, "Local synthetic Banking maker credentials are required.");

  test("keeps the directory and screenshot-aligned entry usable at narrow width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto("/#/banking/bank-transfers");
    await expect(page.getByRole("heading", { level: 1, name: "Bank Transfers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add transfer" })).toBeVisible();
    await page.getByRole("button", { name: "Add transfer" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Add Transfer" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Workflow context" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Project", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Location / City", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Approver", exact: true })).toBeVisible();
    await expect(page.getByLabel("Details", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "+ Add More" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for Approval" })).toBeVisible();
  });
});
