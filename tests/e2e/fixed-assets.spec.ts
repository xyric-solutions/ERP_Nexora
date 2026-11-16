import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { mkdir } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupAssetFixture } from "../integration/fixed-assets-fixture.js";
import { createApp } from "../../server/api/src/app.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { SourceTenantAuthenticationRepository } from "../../server/api/src/modules/auth/source-repository.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { S3ObjectStorage } from "../../packages/domain/src/storage/s3-object-storage.js";
import { assetCategoryInputSchema } from "../../packages/contracts/src/index.js";

test.describe("PostgreSQL Fixed Assets browser acceptance", () => {
  test.skip(process.env.NEXORA_ASSETS_E2E !== "true", "Explicit isolated local acceptance run required.");
  test.describe.configure({ mode: "serial" });
  const storage = new S3ObjectStorage({
    endpoint: process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:59000",
    region: "us-east-1",
    bucket: "nexora-test",
    accessKeyId: "nexora-test",
    secretAccessKey: "nexora-test-secret",
    forcePathStyle: true,
  });
  let f: Awaited<ReturnType<typeof setupAssetFixture>>,
    close: () => Promise<void>,
    server: Server,
    apiUrl: string,
    sourceReference: string,
    assetId: string;
  test.beforeAll(async ({ baseURL }) => {
    test.setTimeout(120000);
    const connection = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
    if (
      !connection ||
      !["localhost", "127.0.0.1"].includes(new URL(connection).hostname) ||
      !["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname)
    )
      throw Error("A local isolated database and web preview are required.");
    const db = await createDisposableSourceDatabase(connection);
    close = db.close;
    f = await setupAssetFixture(db.pool, storage);
    const acquisition = await f.bankAcquisition();
    sourceReference = acquisition.posted.id;
    const session = (token: string) =>
      ["assets-maker", "assets-checker", "assets-poster"].includes(token)
        ? {
            tenantId: f.tenant,
            userId: token === "assets-maker" ? "r06.maker" : token === "assets-checker" ? "r06.checker" : "r06.target",
            sessionId: token,
            activeCompanyId: f.company,
            csrfToken: "a".repeat(43),
            idleExpiresAt: new Date("2099-01-01"),
            absoluteExpiresAt: new Date("2099-01-01"),
          }
        : null;
    // Only the cookie identity seam is synthetic. Live role scopes, CSRF routes,
    // repositories, audit writes, banking and financial posting use PostgreSQL.
    const authentication = {
      loadAuthenticatedAccount: async (_tenant: string, user: string) => f.actor(user).actor,
    } as TenantAuthApiService;
    const sessions = {
      get: async (token: string) => session(token),
      authorizeMutation: async (token: string, csrf: string) =>
        csrf === "a".repeat(43) ? { status: "ok", session: session(token) } : { status: "invalid_csrf" },
    } as TenantSessionApiService;
    const app = createApp({
      config: { allowedOrigins: new Set([new URL(baseURL!).origin]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: authentication,
      sessionService: sessions,
      sessionCompanies: new SourceTenantAuthenticationRepository(f.pool),
      fixedAssetsService: f.service,
      procurementRepository: f.procurement,
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Test API listener unavailable.");
    apiUrl = `http://127.0.0.1:${address.port}`;
  });
  test.afterAll(async () => {
    if (server)
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (f) {
      const rows = await f.pool.query<{ object_key: string }>(
        "select object_key from fixed_asset_attachment where tenant_id=$1 and company_id=$2 union select object_key from fixed_asset_staged_document where tenant_id=$1 and company_id=$2",
        [f.tenant, f.company],
      );
      for (const row of rows.rows) await storage.remove(row.object_key);
    }
    storage.close();
    await close?.();
  });
  test.beforeEach(async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "nexora_session", value: "assets-maker", url: baseURL! }]);
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: new URL(url.pathname + url.search, apiUrl).toString() });
      try {
        await route.fulfill({ response });
      } catch (error) {
        if (!(
          error instanceof Error &&
          error.message.includes("Route is already handled") &&
          route.request().failure()?.errorText === "net::ERR_ABORTED"
        ))
          throw error;
      }
    });
  });
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "wait" });
  });
  async function role(page: Page, baseURL: string, value: "maker" | "checker" | "poster") {
    await page.context().addCookies([{ name: "nexora_session", value: `assets-${value}`, url: baseURL }]);
    await page.reload();
  }
  test("registers, independently approves, activates, depreciates and reloads a real asset", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120000);
    await page.goto(`/#/assets/add-asset/${sourceReference}`);
    await expect(page.getByRole("heading", { name: "Register acquired assets", exact: true })).toBeVisible();
    await expect(page.getByLabel("Posted Purchase invoice or Bank Payment")).not.toHaveValue("");
    await page.getByLabel("Supplier", { exact: true }).selectOption(f.vendor.id);
    await page.getByLabel("Asset name", { exact: true }).fill("Acceptance laptop");
    await page.getByLabel("Unit 1 serial number", { exact: true }).fill("ACCEPTANCE-LAPTOP-001");
    await page.getByLabel("Unit 1 residual value", { exact: true }).fill("10000");
    await page.getByLabel("Available for use", { exact: true }).fill("2026-09-01");
    await page.getByLabel("Depreciation commencement", { exact: true }).fill("2026-09-01");
    await page.getByLabel("Registration reason", { exact: true }).fill("Controlled real acquisition acceptance");
    await page.getByRole("button", { name: "Save asset drafts", exact: true }).click();
    await expect(page).toHaveURL(/#\/assets\/asset-detail\/[a-f0-9-]{36}$/);
    assetId = page.url().split("/").at(-1)!;
    await expect(page.getByRole("heading", { name: /FA-001 · Acceptance laptop/ })).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(8);
    await page.getByRole("tab", { name: "Documents and Attachments", exact: true }).click();
    await page.getByLabel("Document title", { exact: true }).fill("Acquisition invoice");
    await page.getByLabel("Image or supporting document", { exact: true }).setInputFiles({
      name: "invoice.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\ncontrolled browser invoice\n%%EOF"),
    });
    await page.getByRole("button", { name: "Attach document", exact: true }).click();
    await expect(page.getByRole("button", { name: "Download Acquisition invoice", exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Documents and Attachments", exact: true }).click();
    await expect(page.getByRole("button", { name: "Download Acquisition invoice", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "General Information", exact: true }).click();
    await page.getByLabel("Action reason / approval remarks", { exact: true }).fill("Submit original source evidence");
    await page.getByRole("button", { name: "Submit asset", exact: true }).click();
    await expect(page.getByText("submitted · Computer equipment", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve asset", exact: true })).toHaveCount(0);
    await role(page, baseURL!, "checker");
    await page.getByLabel("Action reason / approval remarks", { exact: true }).fill("Independent acquisition review");
    await page.getByRole("button", { name: "Approve asset", exact: true }).click();
    await page.getByRole("button", { name: "Activate available asset", exact: true }).click();
    await expect(page.getByText("active · Computer equipment", { exact: true })).toBeVisible();
    await page.goto("/#/assets/depreciation-run");
    await page.getByLabel("Accounting period", { exact: true }).selectOption(`period-${f.company}-9`);
    await page.getByLabel("Action reason / approval remarks", { exact: true }).fill("September depreciation review");
    await page.getByRole("button", { name: "Generate preview", exact: true }).click();
    await expect(
      page.getByRole("table", { name: "Depreciation preview" }).getByText("5,000.00", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Action reason / approval remarks", { exact: true })
      .last()
      .fill("Submit September depreciation");
    await page.getByRole("button", { name: "Submit depreciation", exact: true }).click();
    // Checker prepared this run; the maker independently approves it.
    await role(page, baseURL!, "maker");
    await page.getByRole("button", { name: "Review DEP-001", exact: true }).click();
    await page
      .getByLabel("Action reason / approval remarks", { exact: true })
      .last()
      .fill("Independent monthly calculation review");
    await page.getByRole("button", { name: "Approve depreciation", exact: true }).click();
    await page.getByRole("button", { name: "Post depreciation journal", exact: true }).click();
    await expect(page.getByRole("heading", { name: "DEP-001 · posted", exact: true })).toBeVisible();
    await page.goto(`/#/assets/asset-detail/${assetId}`);
    await page.reload();
    await expect(page.getByText("5,000.00", { exact: true }).first()).toBeVisible();
    const detail = await f.service.detail(f.maker, f.company, assetId);
    expect(detail.asset.accumulated_depreciation).toBe("5000.00000000");
    expect(detail.schedule.rows[0]?.posted).toBe(true);
  });
  for (const theme of ["light", "dark"])
    for (const width of [1440, 768, 390])
      test(`register and dashboard ${theme} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto("/#/assets/assets");
        await page.locator("html").evaluate((element, theme) => {
          element.setAttribute("data-theme", theme);
          element.classList.toggle("dark", theme === "dark");
        }, theme);
        await expect(page.getByRole("button", { name: "Open FA-001", exact: true })).toBeVisible();
        expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await mkdir("tmp/fixed-assets/evidence", { recursive: true });
        await page.screenshot({ path: `tmp/fixed-assets/evidence/register-${theme}-${width}.png`, fullPage: true });
        await page.goto(`/#/assets/asset-detail/${assetId}`);
        await page.getByRole("tab", { name: "Depreciation Details", exact: true }).click();
        await expect(
          page.getByRole("region", { name: "Depreciation schedule scroll area", exact: true }),
        ).toHaveAttribute("tabindex", "0");
        expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `tmp/fixed-assets/evidence/detail-${theme}-${width}.png`, fullPage: true });
        await page.goto("/#/assets/asset-policies");
        await expect(page.getByRole("heading", { name: "Company Asset Policy", exact: true })).toBeVisible();
        expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `tmp/fixed-assets/evidence/policies-${theme}-${width}.png`, fullPage: true });
        await page.goto("/#/assets/assets-dashboard");
        await expect(page.getByRole("heading", { name: "Asset distribution", exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      });
  test("saves and reloads individual registration details on a real draft Purchase bill", async ({ page }) => {
    test.setTimeout(120000);
    let billId = "";
    const category = await f.service.repository.saveCategory(
      f.maker,
      null,
      assetCategoryInputSchema.strip().parse({
        ...f.category,
        expected_version: 0,
        name: "Browser vehicles",
        field_template: "vehicle",
        field_definitions: [
          { key: "vin", label: "VIN", type: "text", required: true },
          { key: "registration", label: "Registration", type: "document", required: true },
        ],
      }),
      randomUUID(),
    );
    await expect(
      f.purchase("20000", "2", true, "0", false, undefined, {
        groups: [{ category, amount: "20000", quantity: "2" }],
        beforeBillApproval: async (document) => {
          billId = document.id;
          throw new Error("Browser bill ready");
        },
      }),
    ).rejects.toThrow("Browser bill ready");
    await page.goto(`/#/purchases/add-purchase-bill/${billId}`);
    await expect(page.getByLabel("Line 1 nominal account", { exact: true })).toBeVisible();
    await page.getByLabel("Line 1 nominal account", { exact: true }).selectOption(f.accounts.asset!);
    await page.getByLabel("Line 1 asset category", { exact: true }).selectOption(category.id);
    await page.getByRole("checkbox", { name: "Create Fixed Asset", exact: true }).check();
    await page.getByRole("button", { name: "Add Asset Details", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add Asset Details", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Asset name", { exact: true }).fill("Browser acquisition unit one");
    await dialog.getByLabel("Serial number", { exact: true }).fill("BROWSER-UNIT-ONE");
    await dialog.getByLabel("VIN", { exact: true }).fill("BROWSER-VIN-ONE");
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/assets/staged-documents") && response.status() === 201,
      ),
      dialog.getByLabel("Upload Registration", { exact: true }).setInputFiles({
        name: "unit-one.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\nfirst vehicle\n%%EOF"),
      }),
    ]);
    await dialog.getByLabel("Individual asset", { exact: true }).selectOption("1");
    await dialog.getByLabel("Asset name", { exact: true }).fill("Browser acquisition unit two");
    await dialog.getByLabel("Serial number", { exact: true }).fill("BROWSER-UNIT-TWO");
    await dialog.getByLabel("VIN", { exact: true }).fill("BROWSER-VIN-TWO");
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/assets/staged-documents") && response.status() === 201,
      ),
      dialog.getByLabel("Upload Registration", { exact: true }).setInputFiles({
        name: "unit-two.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\nsecond vehicle\n%%EOF"),
      }),
    ]);
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await dialog.getByRole("button", { name: "Save Asset Details", exact: true }).click();
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page.getByText("2 individual asset details saved", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Edit Asset Details", exact: true }).click();
    await expect(dialog.getByLabel("Asset name", { exact: true })).toHaveValue("Browser acquisition unit one");
    await dialog.getByLabel("Individual asset", { exact: true }).selectOption("1");
    await expect(dialog.getByLabel("Serial number", { exact: true })).toHaveValue("BROWSER-UNIT-TWO");
    await mkdir("tmp/fixed-assets/evidence", { recursive: true });
    await page.screenshot({ path: "tmp/fixed-assets/evidence/purchase-asset-details.png", fullPage: true });
    expect(
      (
        await f.pool.query(
          "select count(*)::int as count from fixed_asset_purchase_origin where tenant_id=$1 and document_id=$2",
          [f.tenant, billId],
        )
      ).rows[0].count,
    ).toBe(0);
  });
});
