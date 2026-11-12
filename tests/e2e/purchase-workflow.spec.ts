import { randomUUID, randomBytes } from "node:crypto";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";
import { PassThrough } from "node:stream";
import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SourceInventoryRepository } from "../../server/api/src/modules/inventory/source-repository.js";
import { productInputSchema } from "../../packages/contracts/src/index.js";
import { readFile } from "node:fs/promises";
import { purchasePaymentBankFixture } from "../integration/purchase-payment-fixture.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import {
  ensureSourceAuthorizationFixture,
  sourceTestTenantId as tenant,
  sourceTestCompanyId as company,
} from "../integration/source-security-fixture.js";

test.describe("Persisted unified Purchase workflow", () => {
  test.skip(process.env.NEXORA_PURCHASE_E2E !== "true", "Explicit isolated local Purchase E2E run required.");
  test.describe.configure({ mode: "serial" });
  test.use({ actionTimeout: 15_000 });
  const permissions = [
    "procurement.document.read",
    "procurement.document.create",
    "procurement.document.action",
    "procurement.document.submit",
    "procurement.document.approve",
    "procurement.vendor.read",
    "procurement.vendor.create",
  ];
  const database = `purchase_browser_${randomUUID().replaceAll("-", "")}`;
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
    expect(database).toMatch(/^purchase_browser_[a-f0-9]{32}$/);
    bootstrap = createDatabasePool(connection);
    await bootstrap.query(`create database ${database}`);
    const target = new URL(connection);
    target.pathname = `/${database}`;
    pool = createDatabasePool(target.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
    await purchasePaymentBankFixture(pool);
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
    // Synthetic local sessions only; API routes, policy scope, SQL, lifecycle and audit are real.
    const session = (token: string) =>
      ["purchase-maker", "purchase-checker"].includes(token)
        ? {
            tenantId: tenant,
            userId: token === "purchase-maker" ? "r06.maker" : "r06.checker",
            sessionId: token,
            csrfToken: "c".repeat(43),
            idleExpiresAt: new Date("2099-01-01T00:00:00Z"),
            absoluteExpiresAt: new Date("2099-01-01T00:00:00Z"),
          }
        : null;
    const authentication = {
      loadAuthenticatedAccount: async (_tenant: string, user: string) => ({
        tenantId: tenant,
        userId: user,
        organizationName: "Synthetic Purchase company",
        displayName: user,
        email: "purchase@example.invalid",
        roles: [user === "r06.maker" ? "purchase_maker" : "purchase_checker"],
        permissions,
        sessionVersion: 1,
      }),
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
      procurementRepository: new SourceProcurementRepository(
        pool,
        new SupplierProfileCrypto(randomBytes(32).toString("base64"), "test-v1"),
      ),
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
    await page.context().addCookies([{ name: "nexora_session", value: "purchase-maker", url: baseURL! }]);
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: new URL(url.pathname + url.search, apiUrl).toString() });
      await route.fulfill({ response });
    });
  });
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "wait" });
  });
  async function actor(page: Page, baseURL: string, role: "maker" | "checker") {
    await page.context().addCookies([{ name: "nexora_session", value: `purchase-${role}`, url: baseURL }]);
    await page.reload();
  }
  async function approve(page: Page, baseURL: string) {
    await expect(page.getByText("submitted", { exact: true })).toBeVisible();
    await actor(page, baseURL, "checker");
    await expect(page.getByLabel("Approval / action reason", { exact: true })).toHaveCount(0);
    const receiving = /\/purchases\/add-goods-receipt\//.test(page.url());
    await page
      .getByRole("group", { name: "Purchase document actions", exact: true })
      .getByRole("button", { name: receiving ? "Receive & Close" : "Approve & Close", exact: true })
      .click();
    await expect(page).toHaveURL(
      /#\/purchases\/(purchase-requisitions|rfqs|purchase-orders|goods-receipts|purchase-bills|payments|multi-vendor-payments)$/,
    );
    await expect(page.getByRole("table")).toBeVisible();
    await actor(page, baseURL, "maker");
  }
  async function submit(page: Page) {
    await page.getByRole("button", { name: "Submit for Approval", exact: true }).click();
    await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  }
  async function requestToOrder(page: Page, baseURL: string, vendor: "A" | "B") {
    await page.goto("/#/purchases/add-requisition");
    await page.getByLabel("Line 1 description", { exact: true }).fill(`Synthetic product ${vendor}`);
    await page.getByLabel("Line 1 item code", { exact: true }).fill(`ITEM-${vendor}`);
    await page.getByLabel("Line 1 quantity", { exact: true }).fill("10");
    await page.getByLabel("Line 1 unit price", { exact: true }).fill("10.00");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page).toHaveURL(/add-requisition\/purchase-/);
    await page.reload();
    await expect(page.getByLabel("Line 1 description", { exact: true })).toHaveValue(`Synthetic product ${vendor}`);
    await submit(page);
    await approve(page, baseURL);
    const reqRow = page.getByRole("row").filter({ hasText: vendor === "A" ? "PRQ-001" : "PRQ-002" });
    await reqRow.getByRole("button", { name: "Request for Quotation", exact: true }).click();
    await page.getByLabel("Supplier *", { exact: true }).click();
    await page.getByLabel("Search suppliers", { exact: true }).fill(`vendor ${vendor}`);
    await page
      .getByRole("option", { name: `SUP-00${vendor === "A" ? 1 : 2} · Synthetic vendor ${vendor}`, exact: true })
      .click();
    await submit(page);
    await approve(page, baseURL);
    const rfqRow = page.getByRole("row").filter({ hasText: vendor === "A" ? "RFQ-001" : "RFQ-002" });
    await rfqRow.getByRole("button", { name: "Purchase Order", exact: true }).click();
    await expect(page.getByLabel("Supplier *", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Supplier *", { exact: true }).locator("option:checked")).toHaveText(
      `SUP-00${vendor === "A" ? 1 : 2} · Synthetic vendor ${vendor}`,
    );
    await submit(page);
    await approve(page, baseURL);
    const code = vendor === "A" ? "PO-001" : "PO-002";
    await expect(
      page.getByRole("row").filter({ hasText: code }).getByRole("button", { name: "Receive Products", exact: true }),
    ).toBeVisible();
    return code;
  }
  test("creates suppliers and runs the connected workflow through single and multi-vendor payment approval", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/#/purchases/purchase-requisitions");
    await expect(page.locator(".nx-module-button").filter({ hasText: "Suppliers" })).toHaveCount(0);
    await expect(page.locator(".nx-submenu-link span")).toHaveText([
      "Purchase Request",
      "Request for Quotation",
      "Purchase Order",
      "Receive Products",
      "Bills",
      "Payment",
      "Multi-vendor Payment",
      "Suppliers",
    ]);
    await page.getByRole("button", { name: "Suppliers", exact: true }).last().click();
    for (const vendor of ["A", "B"]) {
      await page.getByRole("button", { name: "Add Supplier", exact: true }).click();
      await page.getByLabel("Supplier name *", { exact: true }).fill(`Synthetic vendor ${vendor}`);
      if (vendor === "A") {
        await page.getByRole("tab", { name: "Contacts & Addresses", exact: true }).click();
        await page.getByLabel("Contact full name", { exact: true }).fill("Synthetic contact");
        await page.getByLabel("Billing city", { exact: true }).fill("Karachi");
        await page.getByRole("tab", { name: "Bank Accounts", exact: true }).click();
        await page.getByRole("button", { name: "Add Bank Account", exact: true }).click();
        await page.getByLabel("Bank name *", { exact: true }).fill("Synthetic Bank");
        await page.getByLabel("Account title *", { exact: true }).fill("Synthetic vendor A");
        await page.getByLabel("IBAN", { exact: true }).fill("PK36SCBL0000001123456702");
      }
      await page.getByRole("button", { name: "Save Supplier", exact: true }).click();
      await expect(page.getByRole("cell", { name: `Synthetic vendor ${vendor}`, exact: true })).toBeVisible();
    }
    await page.reload();
    await page.getByRole("button", { name: "Edit SUP-001", exact: true }).click();
    await page.getByRole("tab", { name: /Bank Accounts/ }).click();
    await expect(page.getByLabel("IBAN", { exact: true })).toHaveValue("PK36SCBL0000001123456702");
    await page.getByRole("tab", { name: "Contacts & Addresses", exact: true }).click();
    await expect(page.getByLabel("Billing city", { exact: true })).toHaveValue("Karachi");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const po = await requestToOrder(page, baseURL!, "A");
    await page
      .getByRole("row")
      .filter({ hasText: po })
      .getByRole("button", { name: "Receive Products", exact: true })
      .click();
    await page.getByLabel("Line 1 quantity", { exact: true }).fill("4");
    await submit(page);
    await approve(page, baseURL!);
    await page
      .getByRole("row")
      .filter({ hasText: "GRN-001" })
      .getByRole("button", { name: "Bills", exact: true })
      .click();
    await expect(page.getByLabel("Line 1 quantity", { exact: true })).toHaveValue("4");
    await page.getByLabel("Supplier invoice reference *", { exact: true }).fill("SYNTHETIC-INV-A");
    await submit(page);
    await approve(page, baseURL!);
    await page
      .getByRole("row")
      .filter({ hasText: "BILL-001" })
      .getByRole("button", { name: "Payment", exact: true })
      .click();
    await page.getByLabel("Allocate BILL-001", { exact: true }).fill("10.00");
    await expect(page.getByLabel("Mailing address", { exact: true })).toHaveValue("Karachi");
    await page.getByLabel("Bank *", { exact: true }).click();
    await page.getByRole("option", { name: "Purchase USD account · •••• 1234 · USD", exact: true }).click();
    await page.getByLabel("WHT rate 1", { exact: true }).fill("2.5");
    await page.getByLabel("Additional WHT 1", { exact: true }).fill("0.25");
    await expect(page.getByText("Net bank amount: 9.50 USD", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page).toHaveURL(/add-payment\/purchase-/);
    await page.reload();
    await expect(page.getByLabel("WHT rate 1", { exact: true })).toHaveValue("2.5");
    await expect(page.getByLabel("Additional WHT 1", { exact: true })).toHaveValue("0.25");
    await expect(page.getByLabel("Mailing address", { exact: true })).toHaveValue("Karachi");
    await submit(page);
    await approve(page, baseURL!);
    const second = await requestToOrder(page, baseURL!, "B");
    await page
      .getByRole("row")
      .filter({ hasText: second })
      .getByRole("button", { name: "Receive Products", exact: true })
      .click();
    await submit(page);
    await approve(page, baseURL!);
    await page
      .getByRole("row")
      .filter({ hasText: "GRN-002" })
      .getByRole("button", { name: "Bills", exact: true })
      .click();
    await page.getByLabel("Supplier invoice reference *", { exact: true }).fill("SYNTHETIC-INV-B");
    await submit(page);
    await approve(page, baseURL!);
    await page.goto("/#/purchases/add-multi-vendor-payment");
    await page.getByRole("checkbox", { name: "Include BILL-001", exact: true }).check();
    await page.getByRole("checkbox", { name: "Include BILL-002", exact: true }).check();
    await expect(page.getByLabel("Allocate BILL-001", { exact: true })).toHaveValue("30.00");
    await page.getByLabel("Bank *", { exact: true }).click();
    await page.getByRole("option", { name: "Purchase USD account · •••• 1234 · USD", exact: true }).click();
    await page.getByLabel("WHT rate 2", { exact: true }).fill("1");
    await expect(page.getByText("Net bank amount: 99.00 USD", { exact: true })).toBeVisible();
    await submit(page);
    await approve(page, baseURL!);
    await expect(page.getByRole("row").filter({ hasText: "MVP-001" })).toContainText("130.00");
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: "MVP-001" })).toContainText("approved");
    const posted = await pool.query(
      "select (select count(*) from bank_payment where tenant_id=$1)+(select count(*) from journal_entry where tenant_id=$1) as count",
      [tenant],
    );
    expect(Number(posted.rows[0]?.count)).toBe(0);
  });
  test("direct supplier creation returns to the directory on cancel and save", async ({ page }) => {
    await page.goto("/#/purchases/add-supplier");
    await page.getByLabel("Supplier name *", { exact: true }).fill("Cancelled synthetic supplier");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(/#\/purchases\/suppliers$/);
    await expect(page.getByRole("cell", { name: "Cancelled synthetic supplier", exact: true })).toHaveCount(0);
    await page.goto("/#/purchases/add-supplier");
    await page.getByLabel("Supplier name *", { exact: true }).fill("Synthetic direct supplier");
    await page.getByRole("button", { name: "Save Supplier", exact: true }).click();
    await expect(page).toHaveURL(/#\/purchases\/suppliers$/);
    await expect(page.getByRole("cell", { name: "Synthetic direct supplier", exact: true })).toBeVisible();
  });
  test("guides an authorized creator through review, RFQ, order, receipt and bill with separate export fields", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const selfPermission = "procurement.document.self_approve",
      createProduct = "inventory.item.create",
      policy = "r06-uat-policy-maker";
    for (const permission of [selfPermission, createProduct]) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all')",
        [tenant, policy, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4)",
        [tenant, policy, permission, company],
      );
    }
    permissions.push(selfPermission);
    try {
      const product = (
        await new SourceInventoryRepository(pool).save(
          {
            tenantId: tenant,
            actor: {
              tenantId: tenant,
              userId: "r06.maker",
              organizationName: "Synthetic",
              displayName: "Maker",
              email: "maker@example.invalid",
              roles: ["purchase_maker"],
              permissions: [...permissions, createProduct],
              sessionVersion: 1,
            },
          },
          null,
          productInputSchema.parse({ company_id: company, name: "Guided purchase valve", currency: "USD" }),
          randomUUID(),
          randomUUID(),
        )
      ).record;
      const makerName = (
        await pool.query(
          "select coalesce(nullif(btrim(display_name),''),id) as name from security_user_account where tenant_id=$1 and id='r06.maker'",
          [tenant],
        )
      ).rows[0].name;
      await page.goto("/#/purchases/add-requisition");
      await page.getByLabel("Line 1 product", { exact: true }).click();
      await page.getByRole("option", { name: `${product.code} · Guided purchase valve`, exact: true }).click();
      await expect(page.getByLabel("Line 1 product", { exact: true })).toContainText(
        `${product.code} · Guided purchase valve`,
      );
      await page.getByLabel("Line 1 unit price", { exact: true }).fill("10.00");
      for (const stage of ["request", "rfq", "order", "receipt", "bill"]) {
        await expect(page.getByRole("heading", { name: "Purchase workflow", exact: true })).toBeVisible();
        const progress = page.getByRole("region", { name: "Purchase workflow progress", exact: true });
        await expect(progress).toBeVisible();
        await expect(progress.locator('ol[aria-label="Purchase stages"] > li')).toHaveCount(5);
        if (stage === "rfq") {
          await page.getByLabel("Supplier *", { exact: true }).click();
          await page.getByRole("option", { name: "SUP-001 · Synthetic vendor A", exact: true }).click();
        }
        if (stage === "order") {
          await expect(page.getByLabel("Supplier *", { exact: true })).toBeDisabled();
          await expect(page.getByLabel("Supplier *", { exact: true }).locator("option:checked")).toHaveText(
            "SUP-001 · Synthetic vendor A",
          );
        }
        if (stage === "bill") {
          await page.getByLabel("Supplier invoice reference *", { exact: true }).fill("GUIDED-SYNTHETIC-INVOICE");
          await page.getByLabel("Bill date *", { exact: true }).fill("2026-11-01");
          await page.getByLabel("Payment term", { exact: true }).selectOption("days_30");
          await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-01");
        }
        if (stage === "request") {
          await page.getByLabel("Purchase approver", { exact: true }).click();
          await page.getByRole("option", { name: `${makerName} (you)`, exact: true }).click();
        } else await expect(page.getByLabel("Purchase approver", { exact: true })).toHaveCount(0);
        if (stage === "request") {
          // The secondary action still submits without approving. The same
          // creator can then decide immediately without typing a routine reason.
          await page.getByRole("button", { name: "Submit for Approval", exact: true }).click();
          await expect(page.getByRole("button", { name: "Approve & Continue", exact: true })).toBeEnabled();
        } else {
          await page
            .getByRole("group", { name: "Purchase document actions", exact: true })
            .getByRole("button", {
              name: stage === "receipt" ? "Receive Products" : "Save, Approve & Continue",
              exact: true,
            })
            .click();
          if (stage === "rfq") await expect(page).toHaveURL(/\/add-purchase-order\/from%3Apurchase-/);
          else if (stage === "order") await expect(page).toHaveURL(/\/add-goods-receipt\/from%3Apurchase-/);
          else if (stage === "receipt") await expect(page).toHaveURL(/\/add-purchase-bill\/from%3Apurchase-/);
          else
            await expect(page.locator('[aria-label="Document status"] [aria-current="step"]')).toHaveText("Approved");
        }
        const reference = decodeURIComponent(new URL(page.url()).hash.split("/").at(-1)!);
        const id = reference.startsWith("from:") ? reference.slice(5) : reference;
        const pending = (
          await pool.query("select state,approver_id,lines from procurement_document where tenant_id=$1 and id=$2", [
            tenant,
            id,
          ])
        ).rows[0];
        expect(pending.state).toBe(stage === "request" ? "submitted" : "approved");
        expect(pending.approver_id).toBe("r06.maker");
        expect(pending.lines[0]).toMatchObject({ item_code: product.code, product_name: product.name });
        if (stage === "request") {
          const download = page.waitForEvent("download");
          await page.getByRole("button", { name: "Export CSV", exact: true }).click();
          const file = await download,
            path = await file.path();
          const csv = await readFile(path!, "utf8");
          expect(csv).toContain('"Product Code","Product Name","Description"');
          expect(csv).toContain(`"${product.code}","Guided purchase valve"`);
          await page.emulateMedia({ media: "print" });
          await expect(page.getByRole("columnheader", { name: "Product Code", exact: true })).toBeVisible();
          await expect(page.getByRole("columnheader", { name: "Product Name", exact: true })).toBeVisible();
          await page.emulateMedia({ media: "screen" });
        }
        if (stage === "request") await page.getByRole("button", { name: "Approve & Continue", exact: true }).click();
        await expect
          .poll(
            async () =>
              (await pool.query("select state from procurement_document where tenant_id=$1 and id=$2", [tenant, id]))
                .rows[0].state,
          )
          .toBe("approved");
        if (stage !== "bill") await expect(page.getByLabel("Line 1 quantity", { exact: true })).toHaveValue("1");
      }
      await expect(page).toHaveURL(/#\/purchases\/add-purchase-bill\/purchase-/);
      await page.reload();
      await expect(page.getByLabel("Bill date *", { exact: true })).toHaveValue("2026-11-01");
      await expect(page.getByLabel("Payment term", { exact: true })).toHaveValue("days_30");
      await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-01");
      const progress = page.getByRole("region", { name: "Purchase workflow progress", exact: true });
      await expect(page.locator('[aria-label="Document status"] [aria-current="step"]')).toHaveText("Approved");
      await expect(progress).toContainText("Latest stage with records: Bill");
      await progress.getByRole("button", { name: /Open Purchase Request/ }).click();
      await expect(page.getByRole("form", { name: "Purchase Request form", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Purchase workflow", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Purchase workflow progress" })).toContainText(
        "Latest stage with records: Bill",
      );
      await page
        .getByRole("region", { name: "Purchase workflow progress" })
        .getByRole("button", { name: /Open Bill/ })
        .click();
      await expect(page.getByRole("form", { name: "Bills form", exact: true })).toBeVisible();
    } finally {
      permissions.splice(permissions.indexOf(selfPermission), 1);
      for (const permission of [selfPermission, createProduct]) {
        await pool.query(
          "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id=$2 and permission_key=$3",
          [tenant, policy, permission],
        );
        await pool.query(
          "delete from security_role_permission_grant where tenant_id=$1 and role_policy_id=$2 and permission_key=$3",
          [tenant, policy, permission],
        );
      }
    }
  });
  for (const theme of ["light", "dark"] as const)
    for (const width of [1440, 768, 390]) {
      test(`Purchase workflow and forms: ${theme}, ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript((theme) => localStorage.setItem("nexora-theme-preference-v1", theme), theme);
        await page.goto("/#/purchases/add-supplier");
        await expect(page.getByRole("form", { name: "Supplier form", exact: true })).toBeVisible();
        await expect(page.getByLabel("Supplier code", { exact: true })).toHaveAttribute("readonly", "");
        await page.screenshot({
          path: `tmp/purchase-workflow-evidence/supplier-overview-${theme}-${width}.png`,
          fullPage: true,
        });
        await page.getByRole("tab", { name: "Bank Accounts", exact: true }).click();
        await page.getByRole("button", { name: "Add Bank Account", exact: true }).click();
        await expect(page.getByLabel("Bank name *", { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
          1,
        );
        await page.screenshot({
          path: `tmp/purchase-workflow-evidence/supplier-bank-${theme}-${width}.png`,
          fullPage: true,
        });
        await expect(page.getByRole("button", { name: "Set as default", exact: true })).toBeDisabled();
        await page.getByRole("button", { name: "Save Supplier", exact: true }).click();
        await expect(page.getByLabel("Supplier name *", { exact: true })).toHaveAttribute("aria-invalid", "true");
        await page.getByRole("tab", { name: /Bank Accounts/ }).click();
        await expect(page.getByLabel("Bank name *", { exact: true })).toHaveAttribute("aria-invalid", "true");
        const accessibility = await new AxeBuilder({ page }).include('form[aria-label="Supplier form"]').analyze();
        expect(accessibility.violations).toEqual([]);
        await page.screenshot({
          path: `tmp/purchase-workflow-evidence/supplier-errors-${theme}-${width}.png`,
          fullPage: true,
        });
        page.once("dialog", (dialog) => dialog.accept());
        await page.goto("/#/purchases/purchase-orders");
        await expect(page.getByRole("heading", { name: "Purchase Order", exact: true })).toBeVisible();
        await expect(
          page
            .getByRole("row")
            .filter({ hasText: "PO-001" })
            .getByRole("button", { name: "Receive Products", exact: true }),
        ).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
          1,
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `tmp/purchase-workflow-evidence/orders-${theme}-${width}.png`, fullPage: true });
        await page.goto("/#/purchases/add-requisition");
        await page.getByLabel("Line 1 description", { exact: true }).fill("Responsive synthetic draft — not saved");
        await page.getByLabel("Line 1 product", { exact: true }).click();
        await page.getByRole("option", { name: /PRD-.*Guided purchase valve/ }).click();
        await page.getByLabel("Purchase approver", { exact: true }).click();
        await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();
        await page.keyboard.press("Escape");
        const requestAccessibility = await new AxeBuilder({ page })
          .include('form[aria-label="Purchase Request form"]')
          .analyze();
        expect(requestAccessibility.violations).toEqual([]);
        await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
          1,
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole("table").evaluate((table) => {
          if (table.parentElement) table.parentElement.scrollLeft = 0;
        });
        await page.screenshot({ path: `tmp/purchase-workflow-evidence/request-${theme}-${width}.png`, fullPage: true });
        page.once("dialog", (dialog) => dialog.accept());
        await page.goto("/#/purchases/add-rfq");
        await expect(page.getByText("Invite suppliers", { exact: true })).toHaveCount(0);
        await expect(page.getByLabel("Search approved source records", { exact: true })).toHaveCount(0);
        await expect(page.getByLabel("Search suppliers", { exact: true })).toHaveCount(0);
        await page.getByLabel("Supplier *", { exact: true }).click();
        await page.getByLabel("Search suppliers", { exact: true }).fill("vendor B");
        await page.getByRole("option", { name: "SUP-002 · Synthetic vendor B", exact: true }).click();
        await expect(page.getByLabel("Supplier *", { exact: true })).toContainText("SUP-002 · Synthetic vendor B");
        await page.getByLabel("Purchase Request *", { exact: true }).click();
        await page.getByLabel("Search approved Purchase Requests", { exact: true }).fill("PRQ-001");
        await page.getByRole("option", { name: /^PRQ-001 ·/ }).click();
        await expect(page.getByLabel("Supplier *", { exact: true })).toContainText("SUP-002 · Synthetic vendor B");
        await expect(page.getByLabel("Line 1 description", { exact: true })).toHaveValue("Synthetic product A");
        await page.getByLabel("Supplier *", { exact: true }).click();
        await page.getByLabel("Search suppliers", { exact: true }).fill("vendor A");
        await page.getByRole("option", { name: "SUP-001 · Synthetic vendor A", exact: true }).click();
        await expect(page.getByLabel("Supplier *", { exact: true })).toContainText("SUP-001 · Synthetic vendor A");
        expect(
          (await new AxeBuilder({ page }).include('form[aria-label="Request for Quotation form"]').analyze())
            .violations,
        ).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
          1,
        );
        await page.screenshot({
          path: `tmp/purchase-workflow-evidence/rfq-supplier-${theme}-${width}.png`,
          fullPage: true,
        });
        const paymentId = (
          await pool.query(
            "select id from procurement_document where tenant_id=$1 and company_id=$2 and kind='multi_payment' order by code limit 1",
            [tenant, company],
          )
        ).rows[0]?.id;
        expect(paymentId).toBeTruthy();
        page.once("dialog", (dialog) => dialog.accept());
        await page.goto(`/#/purchases/add-multi-vendor-payment/${paymentId}`);
        await expect(page.getByLabel("Bank *", { exact: true })).toContainText("Purchase USD account");
        await expect(page.getByLabel("WHT rate 2", { exact: true })).toHaveValue("1");
        await expect(page.getByLabel("WHT rate 2", { exact: true })).toBeDisabled();
        expect(
          (await new AxeBuilder({ page }).include('form[aria-label="Multi-vendor Payment form"]').analyze()).violations,
        ).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
          1,
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `tmp/purchase-workflow-evidence/payment-${theme}-${width}.png`, fullPage: true });
      });
    }
});
