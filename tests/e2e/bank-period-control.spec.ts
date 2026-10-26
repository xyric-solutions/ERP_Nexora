import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDatabasePool } from "../../packages/db/src/pool.js";
import { chooseBankDirectory as choose } from "./bank-directory-select.js";

const api = process.env.NEXORA_BANK_CONTEXT_E2E_API_URL;
const database = process.env.NEXORA_BANK_CONTEXT_E2E_DATABASE_URL;
const password = process.env.NEXORA_BANK_CONTEXT_E2E_PASSWORD;

test("closed Finance periods retain real Payment/Receipt drafts and block submission without posting", async ({
  page,
}) => {
  test.skip(!api || !database || !password, "Explicit isolated API/database and synthetic login required.");
  test.setTimeout(120_000);
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
  await page.goto("/login");
  await page.getByLabel("Username or email", { exact: true }).fill("r06.maker");
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  const pool = createDatabasePool(database!);
  const scope = ["nexora-r06-uat", "nexora-r06-uat-company"];
  const periods = await pool.query<{ id: string; status: string }>(
    "select id,status from financial_period where tenant_id=$1 and company_id=$2",
    scope,
  );
  expect(periods.rows).toHaveLength(1);
  const period = periods.rows[0]!;
  try {
    // Fixture-only closure; the source UAT Finance configuration is never changed.
    await pool.query("update financial_period set status='closed' where tenant_id=$1 and company_id=$2 and id=$3", [
      ...scope,
      period.id,
    ]);
    for (const kind of ["payment", "receipt"] as const) {
      await page.goto(`/#/banking/add-bank-${kind}`);
      await choose(
        page,
        kind === "payment" ? "Pay through" : "Receive into",
        "Synthetic Bank Payment Operating Account",
      );
      await choose(page, "Approver", "r06.checker");
      await choose(
        page,
        "Line 1 nominal account",
        kind === "payment" ? "Synthetic Bank Payment Expense" : "Synthetic Bank Receipt Income",
      );
      await page.getByLabel("Line 1 external reference", { exact: true }).fill(`PERIOD-${randomUUID()}`);
      await page.getByLabel(`Line 1 ${kind} method`, { exact: true }).selectOption("bank_transfer");
      await page.getByLabel("Line 1 department", { exact: true }).fill("FINANCE");
      await page
        .getByLabel(kind === "payment" ? "Line 1 narration" : "Line 1 details", { exact: true })
        .fill("Closed period draft regression");
      await page.getByLabel("Line 1 amount", { exact: true }).fill("8.25");
      await page.getByRole("button", { name: "More transaction actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Submit for Approval", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`add-bank-${kind}/bank-${kind}-`));
      const id = page.url().split("/").at(-1)!;
      await expect(page.getByText(/Draft .* is saved\. Submission\/approval is blocked/)).toBeVisible();
      const read = () =>
        pool.query(
          `select h.state,h.row_version::integer as version,h.original_journal_entry_id,(select count(*)::integer from bank_${kind}_event e where e.tenant_id=h.tenant_id and e.${kind}_id=h.id) as events from bank_${kind} h where h.tenant_id=$1 and h.company_id=$2 and h.id=$3`,
          [...scope, id],
        );
      const before = await read();
      expect(before.rows).toEqual([{ state: "draft", version: 1, original_journal_entry_id: null, events: 1 }]);
      await page.getByRole("button", { name: "More transaction actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Submit for Approval", exact: true }).click();
      await expect(page.getByText(/Nothing was approved or posted by this action/)).toBeVisible();
      expect((await read()).rows).toEqual(before.rows);
      await page.reload();
      await expect(page.getByLabel("Line 1 amount", { exact: true })).toHaveValue("8.25000000");
    }
  } finally {
    await pool.query("update financial_period set status=$4 where tenant_id=$1 and company_id=$2 and id=$3", [
      ...scope,
      period.id,
      period.status,
    ]);
    await pool.end();
  }
});
