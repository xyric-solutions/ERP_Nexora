import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { z } from "zod";
import AxeBuilder from "@axe-core/playwright";
import {
  sessionResponseSchema,
  productMutationSchema,
  productSchema,
  warehouseMutationSchema,
  stockPolicySchema,
  stockValuationSchema,
  stockOperationSchema,
  stockWorkspaceSchema,
  manufacturingOrderMutationSchema,
  bomMutationSchema,
  productionPlanMutationSchema,
  convertProductionPlanResultSchema,
  productCategoryMutationSchema,
  subledgerPartySchema,
  subledgerOperationSchema,
  stockLookupDirectorySchema,
  type StockOperation,
  type StockMovementInput,
} from "../../packages/contracts/src/index.js";

const company = "nexora-currency-browser",
  date = "2026-11-20";
const api = `http://127.0.0.1:${process.env.NEXORA_BANK_CONTEXT_E2E_PORT}/api/v1`;
type Actor = { context: BrowserContext; page: Page };
async function signIn(browser: Browser, username: string): Promise<Actor> {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(process.env.NEXORA_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: `Open ${company}`, exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 30000 });
  return { context, page };
}
async function read<T>(actor: Actor, path: string, schema: z.ZodType<T>) {
  const response = await actor.context.request.get(`${api}${path}`, { headers: { "x-company-id": company } });
  expect(response.status(), await response.text()).toBe(200);
  return schema.parse(await response.json());
}
async function write<T>(actor: Actor, path: string, data: unknown, schema: z.ZodType<T>, version?: number) {
  const session = await read(actor, "/auth/session", sessionResponseSchema);
  const response = await actor.context.request.post(`${api}${path}`, {
    data,
    headers: {
      "x-company-id": company,
      "x-csrf-token": session.csrf_token,
      "idempotency-key": randomUUID(),
      origin: process.env.PLAYWRIGHT_BASE_URL!,
      ...(version === undefined ? {} : { "if-match": `"${version}"` }),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return schema.parse(await response.json());
}
async function finish(actors: Actor[], operation: StockOperation) {
  for (const [index, action] of ["submit", "approve", "post"].entries())
    operation = await write(
      actors[index]!,
      `/inventory/stock/operations/${operation.id}/actions`,
      {
        company_id: company,
        expected_version: operation.version,
        action,
        reason: "Authenticated actual stock acceptance decision",
      },
      stockOperationSchema,
      operation.version,
    );
  return operation;
}
test.describe("Authenticated actual stock and manufacturing", () => {
  test.skip(process.env.NEXORA_STOCK_E2E !== "true", "Requires the fresh isolated PostgreSQL/auth/browser harness.");
  test("reviewed opening, independent approval, actual consumption and finished output reach the catalog and GL", async ({
    browser,
  }) => {
    test.setTimeout(240000);
    const actors = [
      await signIn(browser, "r06.maker"),
      await signIn(browser, "r06.checker"),
      await signIn(browser, "r06.target"),
    ];
    const [maker, checker, poster] = actors;
    const page = maker!.page;
    try {
      const warehouse = (
        await write(
          maker!,
          "/inventory/warehouses",
          { company_id: company, name: "Actual acceptance warehouse" },
          warehouseMutationSchema,
        )
      ).record;
      await page.goto("/#/inventory/products");
      await page.getByRole("tab", { name: "Configuration", exact: true }).click();
      await page.getByRole("button", { name: "Add category", exact: true }).click();
      await page.getByLabel("Category name", { exact: true }).fill("Finished Goods");
      await page.getByLabel("Reason", { exact: true }).fill("Authenticated category configuration acceptance");
      const categorySaved = page.waitForResponse(
        (response) => response.url() === `${api}/inventory/categories` && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Save category", exact: true }).click();
      const category = productCategoryMutationSchema.parse(await (await categorySaved).json()).record;
      await expect(page.getByRole("row").filter({ hasText: category.code })).toContainText("Finished Goods");
      const products = [];
      for (const name of ["Actual component", "Actual manufactured product"])
        products.push(
          (
            await write(
              maker!,
              "/inventory/products",
              {
                category_id: category.id,
                company_id: company,
                name,
                currency: "PKR",
                unit: "Each",
                stock_account_id: "stock-browser-Stock",
                manufacture_enabled: name.includes("manufactured"),
              },
              productMutationSchema,
            )
          ).record,
        );
      const [component, finished] = products;
      await page.goto("/#/inventory/stock-movements");
      await expect(page.getByRole("heading", { name: "Stock movements & valuation", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Configuration", exact: true }).click();
      for (const [label, id] of [
        ["Goods received, not invoiced", "GRNI"],
        ["Opening stock offset", "Opening"],
        ["Work in progress", "WIP"],
        ["Purchase price / exchange variance", "Variance"],
      ]) {
        await expect(
          page.getByLabel(label!, { exact: true }).locator(`option[value="stock-browser-${id}"]`),
        ).toHaveCount(1);
        await page.getByLabel(label!, { exact: true }).selectOption(`stock-browser-${id}`);
      }
      await page
        .getByLabel("Evidence / reason", { exact: true })
        .fill("Reviewed isolated acceptance configuration, no live company values");
      const savedPolicy = page.waitForResponse(
        (response) => response.url() === `${api}/inventory/stock/policy` && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Save reviewed mappings", exact: true }).click();
      expect(stockPolicySchema.parse(await (await savedPolicy).json()).version).toBe(1);
      await expect(page.getByText("Company stock accounting · version 1", { exact: true })).toBeVisible();
      for (const product of products) {
        await expect(
          page.getByLabel("Tracked product", { exact: true }).locator(`option[value="${product.id}"]`),
        ).toHaveCount(1);
        await page.getByLabel("Tracked product", { exact: true }).selectOption(product.id);
        const method = page.getByLabel(/Valuation method/);
        await expect(method).toBeEnabled();
        await method.selectOption("fifo");
        await page
          .getByLabel("Valuation evidence / reason", { exact: true })
          .fill("Explicit FIFO for isolated actual stock acceptance");
        const saved = page.waitForResponse(
          (response) => response.url() === `${api}/inventory/stock/valuation` && response.request().method() === "POST",
        );
        await page.getByRole("button", { name: "Save reviewed valuation", exact: true }).click();
        expect(stockValuationSchema.parse(await (await saved).json()).method).toBe("fifo");
        await expect(page.getByLabel("Valuation evidence / reason", { exact: true })).toHaveValue("");
      }
      await page.getByRole("button", { name: "New movement", exact: true }).click();
      await page.getByLabel("Posting date", { exact: true }).fill(date);
      await expect(page.getByLabel("Line 1 product", { exact: true })).toBeEnabled();
      await page.getByLabel("Line 1 product", { exact: true }).selectOption(component!.id);
      await expect(page.getByLabel("Line 1 warehouse", { exact: true })).toBeEnabled();
      await page.getByLabel("Line 1 warehouse", { exact: true }).selectOption(warehouse.id);
      await page.getByLabel("Line 1 base quantity", { exact: true }).fill("10");
      await page.getByLabel("Line 1 total value", { exact: true }).fill("100");
      await page
        .getByLabel("Business reason", { exact: true })
        .fill("Reviewed actual opening quantity and value in isolated PostgreSQL");
      const created = page.waitForResponse(
        (response) => response.url() === `${api}/inventory/stock/operations` && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create draft for review", exact: true }).click();
      let opening = stockOperationSchema.parse(await (await created).json());
      await expect(page.getByRole("heading", { name: `${opening.code} · opening`, exact: true })).toBeVisible();
      await page.getByLabel("Decision reason", { exact: true }).fill("Submit independently reviewed opening evidence");
      await page.getByRole("button", { name: "Submit for review", exact: true }).click();
      await expect(page.getByText("submitted · version 2", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Approve evidence", exact: true })).toHaveCount(0);
      for (const [actor, label, state] of [
        [checker!, "Approve evidence", "approved · version 3"],
        [poster!, "Post stock & accounting", "posted · version 4"],
      ] as const) {
        await actor.page.goto(`/#/inventory/stock-movements/${opening.id}`);
        await expect(actor.page.getByRole("heading", { name: "Accounting preview", exact: true })).toBeVisible();
        await actor.page
          .getByLabel("Decision reason", { exact: true })
          .fill("Independent authenticated stock accounting review");
        await actor.page.getByRole("button", { name: label, exact: true }).click();
        await expect(actor.page.getByText(state, { exact: true })).toBeVisible();
      }
      opening = await read(
        maker!,
        `/inventory/stock/operations/${opening.id}?company_id=${company}`,
        stockOperationSchema,
      );
      expect(opening.state).toBe("posted");
      expect(
        (await read(maker!, `/inventory/products/${component!.id}?company_id=${company}`, productSchema))
          .on_hand_quantity,
      ).toBe("10.0000");
      async function choose(label: string, search: string, option: RegExp) {
        await page.getByLabel(label, { exact: true }).click();
        await page.getByLabel(`Search ${label.toLowerCase()}`, { exact: true }).fill(search);
        await page.getByRole("option", { name: option }).click();
      }
      await page.goto("/#/manufacturing/boms");
      await page.getByRole("button", { name: "Add Bill of Materials", exact: true }).first().click();
      await page.getByLabel("Template name", { exact: true }).fill("Authenticated actual product recipe");
      await choose("Finished product", "Actual manufactured", /Actual manufactured product/);
      await page.getByLabel("BOM output quantity", { exact: true }).fill("2");
      await choose("Material 1", "Actual component", /Actual component/);
      await page.getByLabel("Component quantity 1", { exact: true }).fill("4");
      await choose("Default material warehouse", "Actual acceptance", /Actual acceptance warehouse/);
      await expect(page.getByText(/10.0000 Each on hand/)).toBeVisible();
      const bomSaved = page.waitForResponse(
        (response) => response.url() === `${api}/manufacturing/boms` && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const bom = bomMutationSchema.parse(await (await bomSaved).json()).record;
      await expect(page.getByRole("heading", { name: bom.code, exact: true })).toBeVisible();
      for (const name of ["Finished Goods", "Raw Material", "Non Stock", "Expenses"])
        await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
      await mkdir("tmp/bom-template-e2e", { recursive: true });
      await page.screenshot({ path: "tmp/bom-template-e2e/bom-desktop.png", fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: "tmp/bom-template-e2e/bom-mobile.png", fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/#/manufacturing/production-plans");
      await page.getByRole("button", { name: "Add Production Planning", exact: true }).first().click();
      await choose("Finished product", "Actual manufactured", /Actual manufactured product/);
      await page.getByLabel("Production quantity *", { exact: true }).fill("2");
      await expect(
        page.getByText(new RegExp(`${bom.code}.*Authenticated actual product recipe.*revision 1`)),
      ).toBeVisible();
      const planSaved = page.waitForResponse(
        (response) => response.url() === `${api}/manufacturing/plans` && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Save Production Planning", exact: true }).click();
      const plan = productionPlanMutationSchema.parse(await (await planSaved).json()).record;
      await expect(page.getByRole("heading", { name: plan.code, exact: true })).toBeVisible();
      const converted = page.waitForResponse(
        (response) => response.url() === `${api}/manufacturing/plans/${plan.id}/convert`,
      );
      await page.getByRole("button", { name: "Convert to Manufacturing Order", exact: true }).click();
      let order = convertProductionPlanResultSchema.parse(await (await converted).json()).order;
      expect(order.recipe).toEqual(plan.recipe);
      expect(order.recipe?.lines[0]?.quantity).toBe("4");
      await expect(page.getByRole("heading", { name: order.code, exact: true })).toBeVisible();
      await page.getByLabel("Order date *", { exact: true }).fill(date);
      const orderSaved = page.waitForResponse(
        (response) =>
          response.url() === `${api}/manufacturing/orders/${order.id}` && response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Save Draft", exact: true }).click();
      order = manufacturingOrderMutationSchema.parse(await (await orderSaved).json()).record;

      order = (
        await write(
          checker!,
          `/manufacturing/orders/${order.id}/actions`,
          { company_id: company, expected_version: order.version, action: "approve" },
          manufacturingOrderMutationSchema,
          order.version,
        )
      ).record;
      const move = async (input: StockMovementInput) =>
        finish(actors, await write(maker!, "/inventory/stock/operations", input, stockOperationSchema));
      await page.goto("/#/inventory/stock-movements");
      await page.getByRole("button", { name: "New movement", exact: true }).click();
      await page.getByLabel("Movement type", { exact: true }).selectOption("manufacturing_issue");
      await expect(page.getByLabel("Approved source", { exact: true })).toBeEnabled();
      await page.getByLabel("Approved source", { exact: true }).selectOption(order.id);
      await page.getByLabel("Output quantity planned for this actual batch", { exact: true }).fill("2");
      await expect(page.getByLabel("Line 1 base quantity", { exact: true })).toHaveValue("4");
      await expect(page.getByLabel("Line 1 warehouse", { exact: true })).toHaveValue(warehouse.id);
      await page.getByLabel("Line 1 base quantity", { exact: true }).fill("6");
      await page
        .getByLabel("Material variance reason 1", { exact: true })
        .fill("Reviewed additional actual consumption");
      await page.getByLabel("Posting date", { exact: true }).fill(date);
      await page.getByLabel("Business reason", { exact: true }).fill("Actual approved recipe material consumption");
      const issueSaved = page.waitForResponse(
        (response) => response.url() === `${api}/inventory/stock/operations` && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create draft for review", exact: true }).click();
      const issue = await finish(actors, stockOperationSchema.parse(await (await issueSaved).json()));
      const supplier = await write(
        maker!,
        "/finance/subledger/parties",
        {
          company_id: company,
          name: "Authenticated production expense supplier",
          kind: "supplier",
          default_currency: "PKR",
        },
        subledgerPartySchema,
      );
      let expenseBill = await write(
        maker!,
        "/finance/subledger/operations",
        {
          company_id: company,
          type: "recognition",
          party_id: supplier.id,
          side: "payable",
          kind: "invoice",
          currency: "PKR",
          amount: "10",
          date,
          due_date: date,
          monetary: true,
          reference: "Production charge evidence",
          reason: "Actual posted production service",
        },
        subledgerOperationSchema,
      );
      for (const [index, action] of ["submit", "approve", "post"].entries())
        expenseBill = await write(
          actors[index]!,
          `/finance/subledger/operations/${expenseBill.id}/actions`,
          {
            company_id: company,
            expected_version: expenseBill.version,
            action,
            reason: "Independent authenticated expense approval",
          },
          subledgerOperationSchema,
          expenseBill.version,
        );
      const expenses = await read(
        maker!,
        `/inventory/stock/lookups?company_id=${company}&kind=production_expense&limit=20&offset=0`,
        stockLookupDirectorySchema,
      );
      expect(expenses.items).toHaveLength(1);
      await page.goto("/#/inventory/stock-movements");
      await page.getByRole("button", { name: "New movement", exact: true }).click();
      await page.getByLabel("Movement type", { exact: true }).selectOption("manufacturing_charge");
      await expect(page.getByLabel("Approved source", { exact: true })).toBeEnabled();
      await page.getByLabel("Approved source", { exact: true }).selectOption(issue.id);
      await expect(page.getByLabel("Posted expense source 1", { exact: true })).toBeEnabled();
      await page.getByLabel("Posted expense source 1", { exact: true }).selectOption(expenses.items[0]!.id);
      await page.getByLabel("Actual base amount 1", { exact: true }).fill("10");
      await page.getByLabel("Posting date", { exact: true }).fill(date);
      await page.getByLabel("Business reason", { exact: true }).fill("Allocate evidenced actual production expense");
      const chargeSaved = page.waitForResponse(
        (response) => response.url() === `${api}/inventory/stock/operations` && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create draft for review", exact: true }).click();
      const charge = await finish(actors, stockOperationSchema.parse(await (await chargeSaved).json()));
      const completion = await move({
        company_id: company,
        kind: "manufacturing_completion",
        source_id: issue.id,
        quantity: "2",
        warehouse_id: warehouse.id,
        date,
        reason: "Actual finished units received from isolated production",
        reference: "",
        dimensions: {},
      });
      const state = await read(
        maker!,
        `/inventory/stock/workspace?company_id=${company}&as_of=${date}`,
        stockWorkspaceSchema,
      );
      expect(state.balances.find((row) => row.product_id === finished!.id)).toMatchObject({
        quantity: "2.0000",
        value: "70.00000000",
      });
      expect(
        (await read(maker!, `/inventory/products/${finished!.id}?company_id=${company}`, productSchema))
          .on_hand_quantity,
      ).toBe("2.0000");
      const url = new URL(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
      url.pathname = `/${process.env.NEXORA_BANK_CONTEXT_E2E_DATABASE}`;
      const pool = new pg.Pool({ connectionString: url.href });
      try {
        const journal = (
          await pool.query(
            "select count(distinct journal_id)::int journals,sum(base_debit)::text debit,sum(base_credit)::text credit from journal_line where journal_id=any($1::text[])",
            [[opening.journal_id, issue.journal_id, charge.journal_id, completion.journal_id]],
          )
        ).rows[0];
        expect(journal).toEqual({ journals: 4, debit: "240.00000000", credit: "240.00000000" });
        expect(
          (
            await pool.query(
              "select sum(base_debit-base_credit)::text balance from journal_line where account_id='stock-browser-WIP'",
            )
          ).rows[0].balance,
        ).toBe("0.00000000");
        expect(
          (
            await pool.query(
              "select count(*)::int n from inventory_stock_audit where entity_type='operation' and entity_id=any($1::text[])",
              [[opening.id, issue.id, charge.id, completion.id]],
            )
          ).rows[0].n,
        ).toBe(16);
      } finally {
        await pool.end();
      }
      await page.goto("/#/inventory/stock-movements");
      await page.getByRole("button", { name: "Stock balances", exact: true }).click();
      await page.getByLabel("As of", { exact: true }).fill(date);
      await expect(page.getByRole("row").filter({ hasText: "Actual manufactured product" })).toContainText("2.0000");
      await mkdir("tmp/posted-stock-acceptance", { recursive: true });
      for (const theme of ["light", "dark"] as const) {
        await page.getByLabel("Change appearance", { exact: true }).click();
        await page.getByRole("menuitemradio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        for (const [name, width, height] of [
          ["desktop", 1440, 1000],
          ["tablet", 800, 1000],
          ["mobile", 390, 844],
        ] as const) {
          await page.setViewportSize({ width, height });
          const closeNavigation = page.getByRole("button", { name: "Close navigation", exact: true });
          if (await closeNavigation.isVisible()) await closeNavigation.click();
          if (width < 768) await expect(page.locator("aside.nx-sidebar")).not.toBeInViewport();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          await page.screenshot({ path: `tmp/posted-stock-acceptance/${name}-${theme}.png`, fullPage: true });
        }
        const accessibility = await new AxeBuilder({ page }).include("main").analyze();
        expect(
          accessibility.violations.filter(
            (violation) => violation.impact === "serious" || violation.impact === "critical",
          ),
        ).toEqual([]);
      }
      await page.reload();
      await expect(page.getByRole("heading", { name: "Stock movements & valuation", exact: true })).toBeVisible();
    } finally {
      await Promise.all(actors.map((actor) => actor.context.close()));
    }
  });
});
