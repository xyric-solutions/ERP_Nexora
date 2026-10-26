import { expect, test } from "@playwright/test";
const username = process.env.NEXORA_BANKING_SUPER_ADMIN_USERNAME,
  password = process.env.NEXORA_SHOAIB_PASSWORD;
const company = "nexora-r06-uat-company";
test("adopts the approved Excel chart for the existing UAT company and reloads its persisted drafts", async ({
  page,
  baseURL,
}) => {
  test.skip(
    !username || !password || process.env.NEXORA_CHART_APPLY_UAT !== "true",
    "Explicit controlled local draft-adoption opt-in required.",
  );
  test.setTimeout(120000);
  expect(["127.0.0.1", "localhost", "[::1]"]).toContain(new URL(baseURL!).hostname);
  await page.goto("/login");
  await page.getByLabel("Username or email", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  const login = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/auth/login") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await (await login).json()).tenant_id).toBe("nexora-r06-uat");
  await expect(page).not.toHaveURL(/\/login$/);
  const forbidden: string[] = [];
  await page.route("**/api/v1/**", (route) => {
    const request = route.request();
    if (/\/api\/v1\/(finance|banking)\//.test(request.url()) && !["GET", "HEAD"].includes(request.method())) {
      if (
        !request.url().endsWith("/company_adoption") ||
        request.method() !== "POST" ||
        request.postDataJSON().company_id !== company
      ) {
        forbidden.push(request.url());
        return route.abort();
      }
    }
    return route.continue();
  });
  await page.goto("/#/finance/central-chart-template");
  await page.getByRole("button", { name: "Preview company setup", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Preview company", { exact: true }).selectOption(company);
  await expect(dialog.getByLabel("Preview account currency", { exact: true })).toHaveValue("USD");
  const response = page.waitForResponse((response) => response.url().includes("/company_preview?"));
  await dialog.getByRole("button", { name: "Run company preview", exact: true }).click();
  const preview = await (await response).json();
  expect(preview.blocked).toBe(false);
  if (!preview.adoption_id) {
    expect(preview.totals).toMatchObject({ nominal_drafts_to_create: 227, bank_references: 7, conflicts: 0 });
    const apply = dialog.getByRole("button", { name: "Create company drafts", exact: true });
    await expect(apply).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    const saved = page.waitForResponse(
      (response) => response.url().endsWith("/company_adoption") && response.request().method() === "POST",
    );
    await apply.click();
    const result = await saved;
    expect(result.status()).toBe(201);
    expect(await result.json()).toMatchObject({ created_nominals: 227, bank_references: 7, replayed: false });
    await expect(dialog.getByText(/Company Chart of Accounts saved: 227 nominal drafts created/)).toBeVisible();
  }
  await expect(dialog.getByText(/This catalog has already been adopted/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create company drafts", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close preview", exact: true }).click();
  await page.goto("/#/finance/chart-of-accounts");
  await page.getByLabel("Nominal company", { exact: true }).selectOption(company);
  await page.getByLabel("Search nominals", { exact: true }).fill("740101");
  await page.getByRole("button", { name: "740101", exact: true }).click();
  await expect(page).toHaveURL(/finance\/nominal-detail\/nominal-/);
  await expect(page.getByText("740101 · Income Tax", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Nominal posting review" })).toContainText("review required");
  await expect(page.getByRole("button", { name: "Submit for approval", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Posting classification", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save posting review", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("740101 · Income Tax", { exact: true })).toBeVisible();
  await expect(page.locator(".nx-prototype-toolbar")).toContainText("Live Finance API");
  await expect(page.locator(".nx-context-summary")).not.toContainText("Nexora Services");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Posting classification", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "tmp/bank-readiness-20261020/adopted-nominal-posting-review-mobile.png",
    fullPage: true,
  });
  expect(forbidden).toEqual([]);
});
