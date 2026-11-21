import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import { SourceManufacturingRepository } from "../../server/api/src/modules/manufacturing/source-repository.js";
import { SourceInventoryRepository } from "../../server/api/src/modules/inventory/source-repository.js";
import { SourceReferenceMasterRepository } from "../../server/api/src/modules/master-data/source-repository.js";
import { productInputSchema } from "../../packages/contracts/src/index.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import {
  ensureSourceAuthorizationFixture,
  sourceTestTenantId as tenant,
  sourceTestCompanyId as company,
} from "../integration/source-security-fixture.js";

/*
 * Simplified flow (13 Nov 2026): Production Planning (finished product + quantity) -> Save Production
 * Planning -> Convert to Manufacturing Order -> Confirm & Approve. Bill of Materials is its own screen.
 * Run: NEXORA_MANUFACTURING_E2E=true TEST_SOURCE_BOOTSTRAP_DATABASE_URL=<local test db> npx playwright test manufacturing-workflow
 */
test.describe("Persisted Manufacturing workflow", () => {
  test.skip(process.env.NEXORA_MANUFACTURING_E2E !== "true", "Explicit isolated local Manufacturing E2E run required.");
  test.describe.configure({ mode: "serial" });
  test.use({ actionTimeout: 15_000 });
  const permissions = [
    "manufacturing.bom.read",
    "manufacturing.bom.create",
    "manufacturing.bom.update",
    "manufacturing.plan.read",
    "manufacturing.plan.create",
    "manufacturing.plan.convert",
    "manufacturing.order.read",
    "manufacturing.order.create",
    "manufacturing.order.submit",
    "manufacturing.order.approve",
    "inventory.item.read",
    "inventory.item.create",
    "master_data.project.read",
    "master_data.project.manage",
    "master_data.location.read",
    "master_data.location.manage",
  ];
  const database = `manufacturing_browser_${randomUUID().replaceAll("-", "")}`;
  let bootstrap: DatabasePool, pool: DatabasePool, server: Server, apiUrl: string;
  test.beforeAll(async ({ baseURL }) => {
    test.setTimeout(180_000);
    const connection = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
    if (
      !connection ||
      !["127.0.0.1", "localhost"].includes(new URL(connection).hostname) ||
      !["127.0.0.1", "localhost"].includes(new URL(baseURL!).hostname)
    )
      throw new Error("Explicit local isolated database and web preview required.");
    bootstrap = createDatabasePool(connection);
    await bootstrap.query(`create database ${database}`);
    const target = new URL(connection);
    target.pathname = `/${database}`;
    pool = createDatabasePool(target.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
      for (const permission of permissions) {
        await pool.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [tenant, policy, permission],
        );
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [tenant, policy, permission, company],
        );
      }
    const account = (user: string) => ({
      tenantId: tenant,
      userId: user,
      organizationName: "Synthetic Manufacturing company",
      displayName: user,
      email: "manufacturing@example.invalid",
      roles: ["manufacturing_tester"],
      permissions,
      sessionVersion: 1,
    });
    const seed = { tenantId: tenant, actor: account("r06.maker") };
    const inventory = new SourceInventoryRepository(pool);
    for (const [name, manufacture] of [
      ["Synthetic motorcycle", true],
      ["Synthetic tyre", false],
      ["Synthetic seat", false],
    ] as const)
      await inventory.save(
        seed,
        null,
        productInputSchema.parse({
          category_id: "category-fixture-" + company,
          company_id: company,
          name,
          currency: "USD",
          manufacture_enabled: manufacture,
        }),
        randomUUID(),
        randomUUID(),
      );
    const masters = new SourceReferenceMasterRepository(pool);
    await masters.create(
      seed,
      "projects",
      { company_id: company, code: "PRJ-E2E", name: "Assembly line" },
      randomUUID(),
      randomUUID(),
    );
    await masters.create(
      seed,
      "locations",
      { company_id: company, code: "LOC-E2E", name: "Main plant" },
      randomUUID(),
      randomUUID(),
    );
    // Synthetic local sessions only; API routes, policy scope, SQL, lifecycle and audit are real.
    const session = (token: string) =>
      ["mfg-maker", "mfg-checker"].includes(token)
        ? {
            tenantId: tenant,
            userId: token === "mfg-maker" ? "r06.maker" : "r06.checker",
            sessionId: token,
            csrfToken: "c".repeat(43),
            // Sign-in now ends with a company choice; the synthetic session has already chosen one.
            activeCompanyId: company,
            idleExpiresAt: new Date("2099-01-01T00:00:00Z"),
            absoluteExpiresAt: new Date("2099-01-01T00:00:00Z"),
          }
        : null;
    const authentication = {
      loadAuthenticatedAccount: async (_tenant: string, user: string) => account(user),
    } as TenantAuthApiService;
    const sessions = {
      get: async (token: string) => session(token),
      authorizeMutation: async (token: string, csrf: string) =>
        csrf === "c".repeat(43) ? { status: "ok", session: session(token) } : { status: "invalid_csrf" },
    } as TenantSessionApiService;
    const app = createApp({
      config: { allowedOrigins: new Set([new URL(baseURL!).origin]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: authentication,
      sessionService: sessions,
      sessionCompanies: {
        listAccessibleCompanies: async () => [{ id: company, code: "R06", name: "Synthetic Manufacturing company" }],
      },
      manufacturingRepository: new SourceManufacturingRepository(pool),
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test listener unavailable");
    apiUrl = `http://127.0.0.1:${address.port}`;
  });
  test.afterAll(async () => {
    if (server)
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${database}`);
      await bootstrap.end();
    }
  });
  test.beforeEach(async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "nexora_session", value: "mfg-maker", url: baseURL! }]);
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: new URL(url.pathname + url.search, apiUrl).toString() });
      await route.fulfill({ response });
    });
  });
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "wait" });
  });
  async function choose(page: Page, label: string, search: string, option: string | RegExp) {
    await page.getByLabel(label, { exact: true }).click();
    await page.getByLabel(`Search ${label.toLowerCase()}`, { exact: true }).fill(search);
    await page.getByRole("option", { name: option }).click();
  }

  test("runs Production Planning -> Convert -> Confirm & Approve, with the BOM screen alongside", async ({ page }) => {
    test.setTimeout(180_000);
    // Save a real BOM and verify its calculated recipe through approval.
    await page.goto("/#/manufacturing/boms");
    await expect(page.getByRole("heading", { name: "Bill of Materials", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add Bill of Materials", exact: true }).first().click();
    await choose(page, "Finished product", "motorcycle", /Synthetic motorcycle/);
    await page.getByLabel("BOM output quantity", { exact: true }).fill("1");
    await choose(page, "Material 1", "tyre", /Synthetic tyre/);
    await page.getByLabel("Component quantity 1", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { name: "BOM-001", exact: true })).toBeVisible();

    // 1-4. Create Production Planning: finished product + production quantity, then Save Production Planning.
    await page.goto("/#/manufacturing/production-plans");
    await page.getByRole("button", { name: "Add Production Planning", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Convert to Manufacturing Order", exact: true })).toHaveCount(0);
    await choose(page, "Finished product", "motorcycle", /Synthetic motorcycle/);
    await page.getByLabel("Production quantity *", { exact: true }).fill("10");
    await page.getByRole("button", { name: "Save Production Planning", exact: true }).click();
    await expect(page.getByRole("heading", { name: "PP-001", exact: true })).toBeVisible();

    // 5. Convert to Manufacturing Order: one click creates the order and opens it.
    await page.getByRole("button", { name: "Convert to Manufacturing Order", exact: true }).click();
    await expect(page).toHaveURL(/#\/manufacturing\/add-production-order\/mo-/);
    await expect(page.getByRole("heading", { name: "MO-001", exact: true })).toBeVisible();
    await expect(page.getByText("Created from production plan PP-001.")).toBeVisible();
    await expect(page.getByLabel("Quantity *", { exact: true })).toHaveValue("10");

    // 6. Confirm & Approve in one step.
    await page.getByRole("button", { name: "Confirm & Approve", exact: true }).click();
    await expect(page.getByText(/^Approved by r06\.maker/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm & Approve", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Quantity *", { exact: true })).toBeDisabled();

    // The plan is converted and links to the approved order.
    await page.goto("/#/manufacturing/production-plans");
    await expect(page.getByRole("row").filter({ hasText: "PP-001" })).toContainText("MO-001");
    await page.goto("/#/manufacturing/production-orders");
    await expect(page.getByRole("row").filter({ hasText: "MO-001" })).toContainText("Approved");
  });
});
