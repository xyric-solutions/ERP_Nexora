import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { createServer, type Server } from "node:http";
import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import { productInputSchema, supplierInputSchema } from "../../packages/contracts/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import { SourceInventoryRepository } from "../../server/api/src/modules/inventory/source-repository.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SourceReferenceMasterRepository } from "../../server/api/src/modules/master-data/source-repository.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import {
  ensureSourceAuthorizationFixture,
  sourceTestTenantId as tenant,
  sourceTestCompanyId as company,
} from "../integration/source-security-fixture.js";

test.describe("Persisted Inventory product catalog", () => {
  test.skip(process.env.NEXORA_INVENTORY_E2E !== "true", "Explicit isolated local Inventory E2E run required.");
  test.describe.configure({ mode: "serial" });
  test.use({ actionTimeout: 15_000 });
  const permissions = [
      "inventory.item.read",
      "inventory.item.create",
      "procurement.vendor.create",
      "inventory.bin.read",
      "inventory.bin.create",
      "inventory.stock.read",
      "master_data.location.manage",
    ],
    database = `inventory_browser_${randomUUID().replaceAll("-", "")}`;
  let bootstrap: DatabasePool, pool: DatabasePool, server: Server, apiUrl: string;
  test.beforeAll(async ({ baseURL }) => {
    test.setTimeout(120_000);
    const connection = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
    if (
      !connection ||
      !["127.0.0.1", "localhost"].includes(new URL(connection).hostname) ||
      !["127.0.0.1", "localhost"].includes(new URL(baseURL!).hostname)
    )
      throw new Error("Explicit local isolated database and web preview required.");
    expect(database).toMatch(/^inventory_browser_[a-f0-9]{32}$/);
    bootstrap = createDatabasePool(connection);
    await bootstrap.query(`create database ${database}`);
    const target = new URL(connection);
    target.pathname = `/${database}`;
    pool = createDatabasePool(target.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
    for (const permission of permissions) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-maker',$2,'all') on conflict do nothing",
        [tenant, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker',$2,'company',$3) on conflict do nothing",
        [tenant, permission, company],
      );
    }
    await pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-checker','inventory.item.read','all') on conflict do nothing",
      [tenant],
    );
    await pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-checker','inventory.item.read','company',$2) on conflict do nothing",
      [tenant, company],
    );
    const account = {
      tenantId: tenant,
      userId: "r06.maker",
      organizationName: "Synthetic Inventory company",
      displayName: "Maker",
      email: "inventory@example.invalid",
      roles: ["inventory_maker"],
      permissions,
      sessionVersion: 1,
    };
    const context = { tenantId: tenant, actor: account };
    await new SourceReferenceMasterRepository(pool).create(
      context,
      "locations",
      { company_id: company, name: "Synthetic city" },
      randomUUID(),
      randomUUID(),
    );
    for (const [id, type] of [
      ["INV-INCOME", "revenue"],
      ["INV-EXPENSE", "expense"],
    ])
      await pool.query(
        "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$1,$1,$4,false,'active',now())",
        [id, tenant, company, type],
      );
    await new SourceProcurementRepository(pool).saveSupplier(
      context,
      null,
      supplierInputSchema.parse({ company_id: company, name: "Synthetic preferred vendor" }),
      randomUUID(),
      randomUUID(),
    );
    const products = new SourceInventoryRepository(pool);
    for (let n = 1; n <= 36; n++)
      await products.save(
        context,
        null,
        productInputSchema.parse({
          company_id: company,
          name: `Catalog item ${String(n).padStart(2, "0")}`,
          currency: "USD",
          category: "Supplies",
          sale_price: "12.50",
        }),
        randomUUID(),
        randomUUID(),
      );
    const session = {
      tenantId: tenant,
      userId: account.userId,
      sessionId: "inventory-maker",
      csrfToken: "c".repeat(43),
      idleExpiresAt: new Date("2099-01-01T00:00:00Z"),
      absoluteExpiresAt: new Date("2099-01-01T00:00:00Z"),
    };
    // Session restoration is synthetic. Product routes, company policies, SQL and audit writes are real.
    const authentication = {
      loadAuthenticatedAccount: async (_tenant: string, user: string) =>
        user === "r06.checker" ? { ...account, userId: user, permissions: ["inventory.item.read"] } : account,
    } as TenantAuthApiService;
    const sessions = {
      get: async (token: string) =>
        token === "inventory-viewer"
          ? { ...session, userId: "r06.checker", sessionId: token }
          : token === "inventory-maker"
            ? session
            : null,
      authorizeMutation: async (token: string, csrf: string) =>
        token === "inventory-maker" && csrf === session.csrfToken
          ? { status: "ok", session }
          : { status: "invalid_csrf" },
    } as TenantSessionApiService;
    const app = createApp({
      config: { allowedOrigins: new Set([new URL(baseURL!).origin]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: authentication,
      sessionService: sessions,
      inventoryRepository: products,
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test listener unavailable");
    apiUrl = `http://127.0.0.1:${address.port}`;
    await mkdir("tmp/inventory-products-evidence", { recursive: true });
    await mkdir("tmp/inventory-operations-evidence", { recursive: true });
  });
  test.afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${database}`);
      await bootstrap.end();
    }
  });
  test.beforeEach(async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "nexora_session", value: "inventory-maker", url: baseURL! }]);
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: new URL(url.pathname + url.search, apiUrl).toString() });
      await route.fulfill({ response });
    });
  });
  test("creates, reloads and edits the combined form with real persistence", async ({ page }) => {
    await page.goto("/#/inventory/products");
    await expect(page.getByText("30 products loaded", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Load more products", exact: true }).click();
    await expect(page.getByText("36 products", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add New", exact: true }).first().click();
    await expect(page.getByLabel("Product code", { exact: true })).toHaveAttribute("readonly", "");
    await page.getByLabel("Product name *", { exact: true }).fill("Browser valve");
    await page.getByLabel("Category", { exact: true }).fill("Valves");
    await page.getByLabel("Barcode", { exact: true }).fill("BROWSER-VALVE");
    await page.getByRole("checkbox", { name: "Manufacture", exact: true }).check();
    await page.getByLabel("Location / City", { exact: true }).click();
    await page.getByRole("button", { name: /Synthetic city$/, exact: false }).click();
    await page.getByLabel("Income account", { exact: true }).click();
    await page.getByRole("button", { name: "INV-INCOME · INV-INCOME", exact: true }).click();
    await page.getByLabel("Expense account", { exact: true }).click();
    await page.getByRole("button", { name: "INV-EXPENSE · INV-EXPENSE", exact: true }).click();
    await page.getByLabel("Preferred supplier", { exact: true }).click();
    await page.getByRole("button", { name: "SUP-001 · Synthetic preferred vendor", exact: true }).click();
    await page.getByRole("tab", { name: "Pricing", exact: true }).click();
    await page.getByLabel("Sale price / unit", { exact: true }).fill("25.75");
    await page.getByLabel("Cost / unit", { exact: true }).fill("10.25");
    await page.getByLabel("Sales GST (%)", { exact: true }).fill("18");
    await page.getByRole("tab", { name: "Inventory", exact: true }).click();
    await page.getByText("Opening stock plan", { exact: true }).click();
    await page.getByLabel("Opening quantity", { exact: true }).fill("5.2500");
    await page.getByLabel("Opening rate", { exact: true }).fill("10.25");
    await page.getByLabel("Low stock level", { exact: true }).fill("2");
    await page.getByLabel("Bin location", { exact: true }).fill("A-02");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByLabel("Product code", { exact: true })).toHaveValue("PRD-037");
    await page.reload();
    await expect(page.getByLabel("Product name *", { exact: true })).toHaveValue("Browser valve");
    await expect(page.getByRole("checkbox", { name: "Manufacture", exact: true })).toBeChecked();
    await expect(page.getByLabel("Income account", { exact: true })).toContainText("INV-INCOME");
    await expect(page.getByLabel("Expense account", { exact: true })).toContainText("INV-EXPENSE");
    await expect(page.getByLabel("Location / City", { exact: true })).toContainText("Synthetic city");
    await page.getByRole("tab", { name: "Pricing", exact: true }).click();
    await expect(page.getByLabel("Sale price / unit", { exact: true })).toHaveValue("25.75");
    await page.getByLabel("Sale price / unit", { exact: true }).fill("29.50");
    await page.getByRole("button", { name: "Save & Close", exact: true }).click();
    await expect(page).toHaveURL(/#\/inventory\/products$/);
    await page.getByLabel("Search products", { exact: true }).fill("BROWSER-VALVE");
    await expect(page.getByRole("heading", { name: "Browser valve", exact: true })).toBeVisible();
    await expect(page.getByText("USD 29.50", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: "Browser valve" })).toContainText("PRD-037");
    const result = await pool.query(
      "select p.row_version,p.details->>'opening_quantity' as opening,e.count from inventory_product p join lateral(select count(*)::int as count from inventory_product_change e where e.tenant_id=p.tenant_id and e.product_id=p.id) e on true where p.tenant_id=$1 and p.barcode='BROWSER-VALVE'",
      [tenant],
    );
    expect(result.rows[0]).toEqual({ row_version: 2, opening: "5.2500", count: 2 });
    expect((await pool.query("select count(*)::int as count from journal_entry")).rows[0].count).toBe(0);
  });
  test("validates hidden-tab fields, preserves edits on failure and protects unsaved changes", async ({ page }) => {
    await page.goto("/#/inventory/add-product");
    await page.getByLabel("Product name *", { exact: true }).fill("Validation service");
    await page.getByLabel("Product type", { exact: true }).selectOption("service");
    await page.getByRole("tab", { name: "Inventory", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Track inventory by quantity", exact: true })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Track inventory by quantity", exact: true })).toBeDisabled();
    await page.getByRole("tab", { name: "Pricing", exact: true }).click();
    await page.getByLabel("Sales GST (%)", { exact: true }).fill("101");
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Pricing", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("alert").filter({ hasText: "Check the highlighted" })).toBeVisible();
    await page.getByLabel("Sales GST (%)", { exact: true }).fill("0");
    await page.route("**/api/v1/inventory/products", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({
          title: "Unavailable",
          status: 503,
          detail: "Synthetic temporary save failure",
          code: "UNAVAILABLE",
        }),
      }),
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Synthetic temporary save failure" })).toBeVisible();
    await page.getByRole("tab", { name: "General", exact: true }).click();
    await expect(page.getByLabel("Product name *", { exact: true })).toHaveValue("Validation service");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(page).toHaveURL(/add-product$/);
  });
  test("keeps every product tab accessible to an authorized read-only user", async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "nexora_session", value: "inventory-viewer", url: baseURL! }]);
    await page.goto("/#/inventory/products");
    await page.getByRole("heading", { name: "Catalog item 01", exact: true }).click();
    await expect(page.getByLabel("Product name *", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Pricing", exact: true }).click();
    await expect(page.getByLabel("Cost / unit", { exact: true })).toBeDisabled();
    await page.getByRole("tab", { name: "Inventory", exact: true }).click();
    await expect(page.getByLabel("Low stock level", { exact: true })).toBeDisabled();
    await page.getByRole("tab", { name: "Accounting", exact: true }).click();
    await expect(page.getByLabel("Stock asset account", { exact: true })).toBeDisabled();
  });
  test("does not turn a missing product into a writable new form", async ({ page }) => {
    await page.goto("/#/inventory/product-detail/missing-product");
    await expect(page.getByRole("alert").filter({ hasText: "The product was not found" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  });
  test("creates warehouses and prepares an audited transfer draft through the work pages", async ({ page }) => {
    for (const name of ["Browser main warehouse", "Browser branch warehouse"]) {
      await page.goto("/#/inventory/warehouses");
      await page.getByRole("button", { name: "Add New", exact: true }).first().click();
      await page.getByLabel("Warehouse name *", { exact: true }).fill(name);
      await page.getByLabel("Location / City", { exact: true }).click();
      await page.getByRole("button", { name: /Synthetic city$/ }).click();
      await page.getByLabel("Address", { exact: true }).fill("Synthetic storage address");
      await page.getByRole("button", { name: "Save & Close", exact: true }).click();
      await expect(page).toHaveURL(/#\/inventory\/warehouses$/);
      await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
    }
    await page
      .getByRole("row")
      .filter({ hasText: "Browser main warehouse" })
      .getByRole("button", { name: /WH-/ })
      .click();
    await page.reload();
    await expect(page.getByLabel("Warehouse name *", { exact: true })).toHaveValue("Browser main warehouse");
    await page.getByLabel("Notes", { exact: true }).fill("Saved warehouse edit");
    await page.getByRole("button", { name: "Save & Close", exact: true }).click();
    await expect(page).toHaveURL(/#\/inventory\/warehouses$/);
    await page.goto("/#/inventory/products");
    await page.getByLabel("Search products", { exact: true }).fill("BROWSER-VALVE");
    await page.getByRole("heading", { name: "Browser valve", exact: true }).click();
    await page.getByLabel("Default warehouse", { exact: true }).click();
    await page.getByRole("button", { name: /Browser main warehouse$/ }).click();
    await page.getByRole("button", { name: "Save & Close", exact: true }).click();
    await expect(page).toHaveURL(/#\/inventory\/products$/);
    await page.goto("/#/inventory/stock-transfers");
    await page.getByRole("button", { name: "Add New", exact: true }).first().click();
    await page.getByLabel("From warehouse *", { exact: true }).click();
    await page.getByRole("button", { name: /Browser main warehouse$/ }).click();
    await page.getByLabel("To warehouse *", { exact: true }).click();
    await page.getByRole("button", { name: /Browser main warehouse$/ }).click();
    await page.getByLabel("Line 1 product *", { exact: true }).click();
    await page.getByLabel("Search line 1 product *", { exact: true }).fill("Browser valve");
    await page.getByRole("button", { name: /Browser valve$/ }).click();
    await page.getByLabel("Line 1 quantity *", { exact: true }).fill("1.2500");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Choose a different destination" })).toBeVisible();
    await page.getByLabel("To warehouse *", { exact: true }).click();
    await page.getByRole("button", { name: /Browser branch warehouse$/ }).click();
    await page.getByLabel("Reference", { exact: true }).fill("Browser relocation");
    await page.getByRole("button", { name: "Save Draft & Close", exact: true }).click();
    await expect(page).toHaveURL(/#\/inventory\/stock-transfers$/);
    await expect(page.getByRole("row").filter({ hasText: "ST-001" })).toContainText("Draft · Not posted");
    await page.getByRole("button", { name: "ST-001", exact: true }).click();
    await page.reload();
    await expect(page.getByLabel("Line 1 quantity *", { exact: true })).toHaveValue("1.2500");
    await expect(page.getByLabel("Line 1 unit", { exact: true })).toHaveValue("Each");
    await page.getByLabel("Line 1 quantity *", { exact: true }).fill("2.5");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeDisabled();
    const transfer = (
      await pool.query(
        "select t.state,l.quantity::text, (select count(*)::int from inventory_operation_change e where e.tenant_id=t.tenant_id and e.entity_id=t.id) as events from inventory_transfer t join inventory_transfer_line l on l.tenant_id=t.tenant_id and l.transfer_id=t.id where t.tenant_id=$1 and t.code='ST-001'",
        [tenant],
      )
    ).rows[0];
    expect(transfer).toEqual({ state: "draft", quantity: "2.5000", events: 2 });
    expect((await pool.query("select count(*)::int as count from journal_entry")).rows[0].count).toBe(0);
  });
  for (const theme of ["light", "dark"] as const)
    for (const width of [1440, 768, 390])
      test(`${theme} products and form at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((theme) => {
          localStorage.setItem("nexora-theme", theme);
          document.documentElement.dataset.theme = theme;
        }, theme);
        await page.goto("/#/inventory/products");
        await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: /Catalog item/ }).first()).toBeVisible();
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          window.scrollTo(0, 0);
        }, theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({
          path: `tmp/inventory-products-evidence/${theme}-${width}-products.png`,
          fullPage: true,
        });
        await page.getByRole("button", { name: "Add New", exact: true }).first().click();
        await expect(page.getByLabel("Product name *", { exact: true })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: `tmp/inventory-products-evidence/${theme}-${width}-form.png`, fullPage: true });
        await page.getByRole("tab", { name: "Accounting", exact: true }).click();
        await expect(page.getByLabel("Stock asset account", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        for (const entry of [
          { page: "warehouses", label: "Warehouse name *", name: "warehouse" },
          { page: "stock-transfers", label: "From warehouse *", name: "transfer" },
        ]) {
          await page.goto(`/#/inventory/${entry.page}`);
          await expect(page.getByRole("table")).toBeVisible();
          await expect(
            page.getByRole("row").filter({ hasText: entry.name === "warehouse" ? "Browser main warehouse" : "ST-001" }),
          ).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          await page.screenshot({
            path: `tmp/inventory-operations-evidence/${theme}-${width}-${entry.name}-workpage.png`,
            fullPage: true,
          });
          await page.getByRole("button", { name: "Add New", exact: true }).first().click();
          await expect(page.getByLabel(entry.label, { exact: true })).toBeVisible();
          await page.evaluate(() => window.scrollTo(0, 0));
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          await page.screenshot({
            path: `tmp/inventory-operations-evidence/${theme}-${width}-${entry.name}.png`,
            fullPage: true,
          });
        }
      });
});
