import { expect, test } from "@playwright/test";

const username = process.env.NEXORA_E2E_USERNAME;
const password = process.env.NEXORA_E2E_PASSWORD;

test.describe("governed employee Hire, Transfer, and Promotion workspaces", () => {
  test.skip(!username || !password, "Local synthetic Nexora credentials are required.");

  test("loads the live maker and checker surfaces through the API", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Username or email" }).fill(username!);
    await page.getByRole("textbox", { name: "Password", exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login$/);

    await page.goto("/#/hr/employee-assignments");
    await expect(page.getByRole("heading", { level: 1, name: "Employment Assignments" })).toBeVisible();
    const company = page.getByRole("combobox", { name: "Company", exact: true });
    const companyValue = await company.locator("option").evaluateAll((options) => {
      const target = options.find((option) => option.textContent?.includes("Company Two"));
      return target instanceof HTMLOptionElement ? target.value : "";
    });
    expect(companyValue).not.toBe("");
    await company.selectOption(companyValue);
    const employee = page.getByRole("combobox", { name: "Employee", exact: true });
    await expect(employee).toBeEnabled();
    const candidateValue = await employee.locator("option").evaluateAll((options) => {
      const candidate = options.find((option) => option.textContent?.includes("Candidate"));
      return candidate instanceof HTMLOptionElement ? candidate.value : "";
    });
    expect(candidateValue).not.toBe("");
    await employee.selectOption(candidateValue);
    await expect(page.getByRole("heading", { name: "Prepare governed Hire" })).toBeVisible();
    await expect(page.getByText(/independent approval/i).first()).toBeVisible();
    await expect(page.getByText(/Request governed Transfer|Active assignment required/).first()).toBeVisible();
    await expect(page.getByText(/Request governed Promotion|Active assignment required/).first()).toBeVisible();

    await page.goto("/#/hr/employee-approvals");
    await expect(page.getByRole("heading", { level: 1, name: "Employee Approvals" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hire approvals" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh Hire queue" })).toBeEnabled();
    await expect(page.getByText(/No prototype Hire records are shown/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Transfer approvals" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh Transfer queue" })).toBeEnabled();
    await expect(page.getByText(/No prototype Transfer records are shown/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Promotion approvals" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh Promotion queue" })).toBeEnabled();
    await expect(page.getByText(/No prototype Promotion records are shown/)).toHaveCount(0);
  });
});
