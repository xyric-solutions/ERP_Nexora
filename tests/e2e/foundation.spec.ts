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

test("System, Light, and Dark apply globally and persist across routes", async ({ page }) => {
  const storageKey = "nexora-theme-preference-v1";
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await page.evaluate((key) => window.localStorage.removeItem(key), storageKey);
  await page.reload();

  const loginTheme = page.getByLabel("Appearance");
  await expect(loginTheme).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await loginTheme.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBe("light");

  await page.goto("/");
  const shellTheme = page.getByLabel("Theme");
  await expect(shellTheme).toHaveValue("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await shellTheme.selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await shellTheme.selectOption("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Theme")).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const darkResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    darkResults.violations.flatMap((violation) =>
      violation.nodes.map((node) => `${violation.id}: ${node.target.join(" ")}`),
    ),
  ).toEqual([]);
});
