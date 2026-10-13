import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the frozen Nexora shell runs under standard Next.js", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Nexora ERP/i);
  await expect(page.getByRole("main")).toBeVisible();
  await page.goto("/#/hr/payroll-runs");
  await expect(page.getByRole("heading", { level: 1, name: "Payroll Runs" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("the email and password login is responsive and accessible without an active session", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/Nexora ERP.*Enterprise Operations/i);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Username or email" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tenant" })).toHaveCount(0);
  await expect(page.getByLabel("Password")).toBeVisible();

  const desktopResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(desktopResults.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("main")).toBeVisible();
  const mobileResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(mobileResults.violations).toEqual([]);
});
