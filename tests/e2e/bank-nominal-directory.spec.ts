import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabasePool } from "../../packages/db/src/pool.js";
import { chooseBankDirectory as choose } from "./bank-directory-select.js";

const api = process.env.NEXORA_BANK_CONTEXT_E2E_API_URL;
const database = process.env.NEXORA_BANK_CONTEXT_E2E_DATABASE_URL;
const password = process.env.NEXORA_BANK_CONTEXT_E2E_PASSWORD;
test("Super Admin directly activates a classified catalog nominal which persists in Payment and Receipt", async ({
  page,
}) => {
  test.skip(
    !api || !database || !password || process.env.NEXORA_BANK_NOMINAL_E2E_CATALOG !== "true",
    "Explicit fresh isolated catalog harness required.",
  );
  test.setTimeout(180_000);
  const target = new URL(api!);
  expect(["127.0.0.1", "localhost"]).toContain(target.hostname);
  expect(Number(target.port)).toBeGreaterThanOrEqual(4011);
  expect(Number(target.port)).toBeLessThanOrEqual(4099);
  expect(new URL(database!).pathname).toMatch(/^\/nexora_bank_context_e2e_isolated_/);
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: new URL(url.pathname + url.search, target).toString() });
    await route.fulfill({ response });
  });
  async function login(username: string) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Username or email", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login$/);
  }
  await login("r06.maker");
  for (const kind of ["payment", "receipt"] as const) {
    const response = page.waitForResponse((r) => r.url().includes(`/banking/${kind}s/nominal_accounts?`));
    await page.goto(`/#/banking/add-bank-${kind}`);
    const directory = await response;
    expect(directory.status()).toBe(200);
    expect(await directory.json()).toMatchObject({
      items: [],
      availability: { eligible_count: 0, pending_approval_count: 227 },
    });
    await expect(page.getByRole("status", { name: "Nominal account availability" })).toContainText(
      "227 awaiting Super Admin review/activation",
    );
    await page.getByLabel("Line 1 nominal account", { exact: true }).click();
    await expect(page.getByLabel("Search nominal accounts", { exact: true })).toBeVisible();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  await page.screenshot({ path: "tmp/bank-context-20261021/nominals-pending-approval.png", fullPage: true });
  await page.getByRole("button", { name: "Review Chart of Accounts", exact: true }).click();
  await expect(page).toHaveURL(/finance\/chart-of-accounts/);
  await page.getByLabel("Search nominals", { exact: true }).fill("711301");
  await page.getByRole("button", { name: "711301", exact: true }).click();
  const nominalId = page.url().split("/").at(-1)!;
  await expect(page.getByRole("region", { name: "Nominal posting review" })).toContainText("review required");
  await expect(page.getByRole("button", { name: "Save posting review", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Activate now", exact: true })).toHaveCount(0);
  await login("r06.override-admin");
  await page.goto(`/#/finance/nominal-detail/${nominalId}`);
  await page.getByLabel("Posting classification", { exact: true }).selectOption("ordinary");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save posting review", exact: true }).click();
  await expect(page.getByRole("region", { name: "Nominal posting review" })).toContainText("Posting review: ordinary");
  await expect(page.getByRole("button", { name: "Submit for approval", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Activate now", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm activate", exact: true }).click();
  await expect(page.getByText("active", { exact: true }).first()).toBeVisible();

  await login("r06.maker");
  const pool = createDatabasePool(database!);
  try {
    for (const kind of ["payment", "receipt"] as const) {
      await page.goto(`/#/banking/add-bank-${kind}`);
      await expect(page.getByLabel("Line 1 document reference", { exact: true })).toHaveCount(0);
      const nominal = page.getByLabel("Line 1 nominal account", { exact: true });
      await expect(page.getByLabel("Search nominal accounts", { exact: true })).toHaveCount(0);
      for (const label of [
        "document date",
        "external reference",
        `${kind} method`,
        "nominal account",
        kind === "payment" ? "narration" : "details",
        "amount",
      ]) {
        const control = page.getByLabel(`Line 1 ${label}`, { exact: true });
        const height = await control.evaluate((element) => element.getBoundingClientRect().height);
        expect(height, `${kind} ${label} control height`).toBeCloseTo(40, 0);
      }
      expect(await choose(page, "Line 1 nominal account", "711301")).toBe(nominalId);
      await expect(nominal).toContainText("711301 · Subscriptions");
      await choose(page, "Approver", "r06.checker");
      await page.getByLabel("Line 1 external reference", { exact: true }).fill(`NOM-${randomUUID().slice(0, 8)}`);
      await page.getByLabel(`Line 1 ${kind} method`, { exact: true }).selectOption("bank_transfer");
      await page
        .getByLabel(kind === "payment" ? "Line 1 narration" : "Line 1 details", { exact: true })
        .fill(`Catalog nominal regression ${randomUUID()}`);
      await page.getByLabel("Line 1 amount", { exact: true }).fill("10.25");
      await page.getByRole("button", { name: "More transaction actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Save Draft", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`add-bank-${kind}/bank-${kind}-`));
      const id = page.url().split("/").at(-1)!;
      await page.reload();
      await expect(nominal).toHaveAttribute("data-value", nominalId);
      await expect(nominal).toContainText("711301 · Subscriptions");
      await nominal.click();
      await page.getByLabel("Search nominal accounts", { exact: true }).fill("NoSuchNominal");
      await expect(page.getByRole("status", { name: "Nominal account availability" })).toContainText(
        "No matching nominal accounts",
      );
      await expect(nominal).toHaveAttribute("data-value", nominalId);
      await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
      await page.getByLabel("Search nominal accounts", { exact: true }).fill("Subscriptions");
      await expect(nominal).toBeEnabled();
      await expect(
        page.getByRole("listbox").getByRole("option", { name: "711301 · Subscriptions", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByLabel("Search nominal accounts", { exact: true })).toHaveCount(0);
      await expect(nominal).toContainText("711301 · Subscriptions");
      const result = await pool.query(
        `select h.state,l.nominal_account_id,l.amount::text,h.original_journal_entry_id from bank_${kind} h join bank_${kind}_line l on l.tenant_id=h.tenant_id and l.${kind}_id=h.id and l.company_id=h.company_id where h.tenant_id=$1 and h.company_id=$2 and h.id=$3`,
        ["nexora-r06-uat", "nexora-r06-uat-company", id],
      );
      expect(result.rows).toEqual([
        { state: "draft", nominal_account_id: nominalId, amount: "10.25000000", original_journal_entry_id: null },
      ]);
      await page.goto(`/#/banking/transaction-detail/${id}`);
      await expect(page.getByText("711301", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Subscriptions", { exact: true }).first()).toBeVisible();
    }
    const audit = await pool.query(
      "select state,(select count(*)::integer from finance_general_nominal_event e where e.tenant_id=g.tenant_id and e.nominal_id=g.nominal_id) as events from finance_general_nominal g where tenant_id=$1 and nominal_id=$2",
      ["nexora-r06-uat", nominalId],
    );
    expect(audit.rows).toEqual([{ state: "active", events: 3 }]);
    const facts = await pool.query(
      "select submitted_by,decided_by from finance_general_nominal where tenant_id=$1 and nominal_id=$2",
      ["nexora-r06-uat", nominalId],
    );
    expect(facts.rows).toEqual([{ submitted_by: null, decided_by: null }]);
  } finally {
    await pool.end();
  }
});

test("company hierarchy management is direct, audited and read-only to ordinary users", async ({ page }) => {
  test.skip(
    !api || !database || !password || process.env.NEXORA_BANK_NOMINAL_E2E_CATALOG !== "true",
    "Explicit isolated catalog harness required.",
  );
  test.setTimeout(120_000);
  expect(new URL(database!).pathname).toMatch(/^\/nexora_bank_context_e2e_isolated_/);
  const target = new URL(api!);
  expect(target.hostname).toBe("127.0.0.1");
  expect(Number(target.port)).toBeGreaterThanOrEqual(4011);
  expect(Number(target.port)).toBeLessThanOrEqual(4099);
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: new URL(url.pathname + url.search, target).toString() });
    await route.fulfill({ response });
  });
  async function login(user: string) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Username or email", { exact: true }).fill(user);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    await page.goto("/#/finance/section-management");
  }
  await login("r06.override-admin");
  const original = `Synthetic hierarchy ${randomUUID()}`,
    revised = `${original} revised`;
  await page.getByLabel("Master name", { exact: true }).fill(original);
  await page.getByRole("button", { name: "Create & Activate", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: original });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("active");
  await row.getByRole("button").click();
  await page.getByLabel("Master name", { exact: true }).fill(revised);
  await page.getByRole("button", { name: "Save master changes", exact: true }).click();
  await expect(row).toContainText(revised);
  await row.getByRole("button").click();
  await page.getByRole("button", { name: "Deactivate master", exact: true }).click();
  await expect(row).toContainText("inactive");
  await row.getByRole("button").click();
  await page.getByRole("button", { name: "Activate master", exact: true }).click();
  await page.reload();
  await expect(row).toContainText("active");
  await login("r06.maker");
  await expect(page.getByText("Read-only. Only a global Super Admin", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create & Activate", exact: true })).toHaveCount(0);
  const pool = createDatabasePool(database!);
  try {
    const result = await pool.query(
      "select a.name,a.status,a.coa_version::integer as version,array_agg(m.action order by m.record_version) as actions from account a join finance_coa_master_change m on m.tenant_id=a.tenant_id and m.account_id=a.id where a.tenant_id=$1 and a.company_id=$2 and a.name=$3 group by a.id,a.name,a.status,a.coa_version",
      ["nexora-r06-uat", "nexora-r06-uat-company", revised],
    );
    expect(result.rows).toEqual([
      { name: revised, status: "active", version: 5, actions: ["created", "updated", "deactivated", "activated"] },
    ]);
  } finally {
    await pool.end();
  }
});
