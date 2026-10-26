import { expect, test } from "@playwright/test";
const username = process.env.NEXORA_BANKING_SUPER_ADMIN_USERNAME;
const password = process.env.NEXORA_SHOAIB_PASSWORD;
test("browses central PostgreSQL master data through Finance navigation without financial writes", async ({
  page,
  baseURL,
}) => {
  test.skip(!username || !password, "Controlled local credentials required.");
  test.setTimeout(120_000);
  expect(["127.0.0.1", "localhost", "[::1]"]).toContain(new URL(baseURL!).hostname);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Username or email", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  const login = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await (await login).json()).tenant_id).toBe("nexora-r06-uat");
  await expect(page).not.toHaveURL(/\/login$/);
  const writes: string[] = [];
  await page.route("**/api/v1/**", (route) => {
    const req = route.request();
    if (/\/api\/v1\/(finance|banking)\//.test(req.url()) && !["GET", "HEAD"].includes(req.method())) {
      writes.push(req.url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/#/finance/chart-of-accounts");
  await page.getByRole("button", { name: "Central Master Data", exact: true }).last().click();
  await expect(page).toHaveURL(/finance\/central-chart-template/);
  await expect(page.getByRole("tab", { name: "Categories (14)", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sections (78)", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Nominals (234)", exact: true })).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(14);
  await expect(page.locator(".nx-context-summary")).toContainText("Central master data · no company selected");
  await page.getByRole("button", { name: "Preview company setup", exact: true }).click();
  const preview = page.getByRole("dialog");
  await preview.getByLabel("Preview company", { exact: true }).selectOption("nexora-r06-uat-company");
  await expect(preview.getByLabel("Preview account currency", { exact: true })).toHaveValue("USD");
  const previewResponse = page.waitForResponse((response) => response.url().includes("/company_preview?"));
  await preview.getByRole("button", { name: "Run company preview", exact: true }).click();
  const previewData = await (await previewResponse).json();
  expect(previewData).toMatchObject({
    blocked: false,
    totals: {
      categories_to_create: 0,
      sections_to_create: 0,
      exact_matches: 319,
      conflicts: 0,
      nominal_drafts_to_create: 0,
      bank_references: 7,
    },
  });
  await expect(preview.getByText("No code conflicts found", { exact: true })).toBeVisible();
  await expect(preview.getByRole("alert")).toHaveCount(0);
  expect(await preview.evaluate((element) => Number(getComputedStyle(element).zIndex))).toBeGreaterThan(1200);
  await page.screenshot({ path: "tmp/bank-readiness-20261020/company-chart-preview.png", fullPage: true });
  await preview.getByRole("button", { name: "Close preview", exact: true }).click();
  await page.screenshot({ path: "tmp/bank-readiness-20261020/central-master-data-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "View Current Assets", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Current Assets", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Browse sections", exact: true }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(9);
  await page.getByRole("button", { name: "View Cash and Bank", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Browse nominals", exact: true }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(7);
  await expect(page.getByLabel("Section", { exact: true })).toHaveValue("section:2309");
  await page.getByLabel("Category", { exact: true }).selectOption("");
  await expect(page.locator("table tbody tr")).toHaveCount(50);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByText("Page 2 · 50 definitions shown", { exact: true })).toBeVisible();
  await page.getByLabel("Search nominals", { exact: true }).fill("740101");
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table")).toContainText("Income Tax");
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "View Income Tax", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Screenshot 3, row 37");
  await page.getByRole("dialog").getByRole("button", { name: "Close details", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Categories (14)", exact: true })).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(14);
  await page.goto("/#/finance/section-management");
  await expect(page.getByRole("tab", { name: "Sections (78)", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("table tbody tr")).toHaveCount(50);
  await page.getByLabel("Search sections", { exact: true }).fill("Cash and Bank");
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("table")).toContainText("2309");
  const searchBox = await page.getByLabel("Search sections", { exact: true }).boundingBox();
  expect(searchBox).not.toBeNull();
  expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(390);
  expect(searchBox!.width).toBeGreaterThan(200);
  const tabsBox = await page.getByRole("tablist", { name: "Central catalog level" }).boundingBox();
  expect(tabsBox!.height).toBeLessThan(80);
  await page.screenshot({ path: "tmp/bank-readiness-20261020/central-master-data-mobile.png", fullPage: true });
  await page.goto("/#/banking/add-bank-account");
  await expect(page.locator(".nx-prototype-toolbar")).toContainText("Live Bank API");
  await page.getByLabel("Company", { exact: true }).selectOption("nexora-r06-uat-company");
  await expect(page.getByLabel("Section", { exact: true })).toHaveValue("r06-uat-bn-section");
  await expect(page.getByLabel("Section", { exact: true }).locator("option:checked")).toHaveText("Cash and Bank");
  await expect(page.getByLabel("Category", { exact: true }).locator("option:checked")).toHaveText("Current Assets");
  await expect(page.getByLabel("Nominal code", { exact: true })).toHaveValue("Generated when you save");
  await page.getByLabel("Approved Excel Bank definition", { exact: true }).selectOption("nominal:230901");
  await expect(page.getByLabel("Nominal code", { exact: true })).toHaveValue("230901");
  await expect(page.getByLabel("Nominal account name", { exact: false })).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Currency", { exact: false })).toHaveValue("");
  await page.screenshot({ path: "tmp/bank-readiness-20261020/bank-definition-setup-mobile.png", fullPage: true });
  expect(writes).toEqual([]);
});
