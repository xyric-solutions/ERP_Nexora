import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import pg from "pg";
import { z } from "zod";
import {
  sessionResponseSchema,
  productMutationSchema,
  warehouseMutationSchema,
  stockPolicySchema,
  stockValuationSchema,
  stockOperationSchema,
  stockWorkspaceSchema,
  manufacturingOrderMutationSchema,
  referenceMasterMutationSchema,
  subledgerPartySchema,
  subledgerPartyConfigurationSchema,
  subledgerWorkspaceSchema,
  subledgerOperationSchema,
  subledgerReportSchema,
  supplierMutationSchema,
  purchaseMutationSchema,
  savePurchaseInputSchema,
  salesDetailSchema,
  salesLookupDirectorySchema,
  salesDirectorySchema,
  bankReconciliationMutationResultSchema,
  bankReconciliationDetailSchema,
  bankReconciliationManualSelectionMutationResultSchema,
  bankAccountDetailSchema,
  decimal,
  type StockOperation,
  type SubledgerOperation,
  type PurchaseDocument,
  type PurchaseKind,
  type SalesDetail,
  type SalesKind,
} from "../../packages/contracts/src/index.js";

const company = "nexora-currency-browser",
  date = "2026-11-20",
  api = `http://127.0.0.1:${process.env.NEXORA_BANK_CONTEXT_E2E_PORT}/api/v1`;
type Actor = { page: Page; context: BrowserContext };
async function signIn(browser: Browser, username: string): Promise<Actor> {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL }),
    page = await context.newPage();
  context.setDefaultTimeout(20000);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(process.env.NEXORA_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: `Open ${company}`, exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  return { page, context };
}
async function get<T>(actor: Actor, path: string, schema: z.ZodType<T>) {
  const response = await actor.context.request.get(`${api}${path}`, { headers: { "x-company-id": company } });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  return schema.parse(await response.json());
}
async function post<T>(
  actor: Actor,
  path: string,
  data: unknown,
  schema: z.ZodType<T>,
  version?: number,
  key = randomUUID(),
) {
  const session = await get(actor, "/auth/session", sessionResponseSchema);
  const response = await actor.context.request.post(`${api}${path}`, {
    data,
    headers: {
      "x-company-id": company,
      "x-csrf-token": session.csrf_token,
      "idempotency-key": key,
      origin: process.env.PLAYWRIGHT_BASE_URL!,
      ...(version === undefined ? {} : { "if-match": `"${version}"` }),
    },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return schema.parse(await response.json());
}
async function finishStock(actors: Actor[], op: StockOperation) {
  for (const [i, action] of ["submit", "approve", "post"].entries())
    op = await post(
      actors[i]!,
      `/inventory/stock/operations/${op.id}/actions`,
      {
        company_id: company,
        expected_version: op.version,
        action,
        reason: "Independent authenticated physical evidence review",
      },
      stockOperationSchema,
      op.version,
    );
  return op;
}
async function finishFinance(actors: Actor[], op: SubledgerOperation) {
  for (const [i, action] of ["submit", "approve", "post"].entries())
    op = await post(
      actors[i]!,
      `/finance/subledger/operations/${op.id}/actions`,
      {
        company_id: company,
        expected_version: op.version,
        action,
        reason: "Independent authenticated accounting review",
      },
      subledgerOperationSchema,
      op.version,
    );
  return op;
}
async function pick(page: Page, label: string, needle: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByLabel(`Search ${label.toLowerCase()}`, { exact: true }).fill(needle);
  await page.getByRole("option").filter({ hasText: needle }).first().click();
}
async function saveSales(page: Page) {
  const response = page.waitForResponse(
    (response) => response.url() === `${api}/sales/documents` && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await response;
  expect(saved.ok(), await saved.text()).toBe(true);
  return salesDetailSchema.parse(await saved.json());
}
async function confirmSales(page: Page, label: string) {
  await page.getByLabel("Action reason", { exact: true }).fill("Explicit authenticated commercial confirmation");
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/actions") &&
      response.url().includes("/sales/") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: label, exact: true }).click();
  const result = await response;
  expect(result.ok(), await result.text()).toBe(true);
  return salesDetailSchema.parse(await result.json());
}
async function deriveSales(page: Page, label: string, target: SalesKind) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByLabel("New document date", { exact: true }).fill(date);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`New .*${target === "invoice" ? "invoice" : target === "order" ? "sales order" : "delivery"}`),
    }),
  ).toBeVisible();
  if (target === "invoice") await page.getByLabel("Due date", { exact: true }).fill("2026-12-20");
  return saveSales(page);
}
async function finishFinanceUI(actors: Actor[], source: SalesDetail, op: SubledgerOperation) {
  for (const [i, label] of ["Submit", "Approve", "Post"].entries()) {
    const actor = actors[i]!;
    await actor.page.goto(`/#/sales/invoices/accounting:${source.record.id}`);
    await actor.page.getByRole("button", { name: "Refresh", exact: true }).click();
    const row = actor.page.getByRole("row").filter({ hasText: op.code });
    await expect(row).toBeVisible();
    const result = actor.page.waitForResponse(
      (response) =>
        response.url() === `${api}/finance/subledger/operations/${op.id}/actions` &&
        response.request().method() === "POST",
    );
    await row.getByRole("button", { name: label, exact: true }).click();
    const response = await result;
    expect(response.ok(), await response.text()).toBe(true);
    op = subledgerOperationSchema.parse(await response.json());
  }
  return op;
}

test.describe("Authenticated complete operational Sales integration", () => {
  test.skip(process.env.NEXORA_SALES_E2E !== "true", "Requires the fresh isolated PostgreSQL/auth/browser harness.");
  test("purchase receipt and supplier payment -> actual production -> Sales delivery/invoice -> receipt -> reconciliation", async ({
    browser,
  }) => {
    test.setTimeout(360000);
    const actors = [
        await signIn(browser, "r06.maker"),
        await signIn(browser, "r06.checker"),
        await signIn(browser, "r06.target"),
      ],
      maker = actors[0]!,
      checker = actors[1]!,
      page = maker.page;
    try {
      const unauthenticated = await browser.newContext();
      expect(
        (await unauthenticated.request.get(`${api}/sales/documents?company_id=${company}&kind=quotation`)).status(),
      ).toBe(401);
      await unauthenticated.close();
      const warehouse = (
        await post(
          maker,
          "/inventory/warehouses",
          { company_id: company, name: "Actual integrated acceptance warehouse" },
          warehouseMutationSchema,
        )
      ).record;
      const project = (
        await post(
          maker,
          "/master_data/projects",
          { company_id: company, name: "Actual integrated customer project" },
          referenceMasterMutationSchema,
        )
      ).record;
      const location = (
        await post(
          maker,
          "/master_data/locations",
          { company_id: company, name: "Actual integrated customer location" },
          referenceMasterMutationSchema,
        )
      ).record;
      const customer = await post(
        maker,
        "/finance/subledger/parties",
        {
          company_id: company,
          kind: "customer",
          name: "Actual integrated acceptance customer",
          default_currency: "PKR",
        },
        subledgerPartySchema,
      );
      await post(
        maker,
        `/finance/subledger/parties/${customer.id}/configuration`,
        {
          company_id: company,
          expected_version: 0,
          payment_term: null,
          credit_limit: "10000",
          reason: "Explicit finite isolated customer credit with manual invoice due dates",
        },
        subledgerPartyConfigurationSchema,
        0,
      );
      await post(
        maker,
        "/inventory/stock/policy",
        {
          company_id: company,
          expected_version: 0,
          receipt_accrual_account_id: "stock-browser-GRNI",
          opening_account_id: "stock-browser-Opening",
          wip_account_id: "stock-browser-WIP",
          variance_account_id: "stock-browser-Variance",
          reason: "Explicit reviewed isolated stock mappings",
        },
        stockPolicySchema,
        0,
      );
      const products = [];
      for (const manufacture_enabled of [false, true]) {
        const product = (
          await post(
            maker,
            "/inventory/products",
            {
              company_id: company,
              name: manufacture_enabled ? "Actual integrated manufactured product" : "Actual integrated component",
              currency: "PKR",
              unit: "Each",
              sale_price: manufacture_enabled ? "30" : "10",
              cost: "10",
              manufacture_enabled,
              stock_account_id: "stock-browser-Stock",
              income_account_id: `${company}-revenue`,
              expense_account_id: `${company}-expense`,
              invoice_policy: "delivered",
            },
            productMutationSchema,
          )
        ).record;
        await post(
          maker,
          "/inventory/stock/valuation",
          {
            company_id: company,
            product_id: product.id,
            expected_version: 0,
            method: "fifo",
            reason: "Explicit isolated FIFO decision",
          },
          stockValuationSchema,
          0,
        );
        products.push(product);
      }
      const component = products[0]!,
        finished = products[1]!;
      const supplier = (
        await post(
          maker,
          "/procurement/suppliers",
          { company_id: company, name: "Actual integrated acceptance supplier" },
          supplierMutationSchema,
        )
      ).record;
      const supplierParty = await post(
        maker,
        "/finance/subledger/parties",
        {
          company_id: company,
          kind: "supplier",
          name: supplier.name,
          default_currency: "PKR",
          source_supplier_id: supplier.id,
        },
        subledgerPartySchema,
      );
      await post(
        maker,
        `/finance/subledger/parties/${supplierParty.id}/configuration`,
        {
          company_id: company,
          expected_version: 0,
          payment_term: "immediate",
          credit_limit: null,
          reason: "Explicit isolated supplier terms",
        },
        subledgerPartyConfigurationSchema,
        0,
      );
      async function purchase(kind: PurchaseKind, source?: PurchaseDocument) {
        let record = (
          await post(
            maker,
            "/procurement/documents",
            savePurchaseInputSchema.parse({
              company_id: company,
              kind,
              supplier_id: kind === "request" ? null : supplier.id,
              source_id: source?.id,
              document_date: date,
              currency: "PKR",
              reference: kind === "bill" ? "ACTUAL-ACCEPTANCE-BILL" : "",
              lines: [
                {
                  ...(source?.lines[0] ?? {
                    product_id: component.id,
                    description: component.name,
                    uom: "Each",
                    unit_price: "10",
                    tax_percent: "0",
                  }),
                  id: undefined,
                  source_line_id: source?.lines[0]?.id,
                  quantity: "4",
                },
              ],
            }),
            purchaseMutationSchema,
          )
        ).record;
        for (const [i, action] of ["submit", "approve"].entries())
          record = (
            await post(
              actors[i]!,
              `/procurement/documents/${record.id}/actions`,
              {
                company_id: company,
                expected_version: record.version,
                action,
                reason: "Independent actual purchase approval",
              },
              purchaseMutationSchema,
              record.version,
            )
          ).record;
        return record;
      }
      const request = await purchase("request"),
        order = await purchase("order", request),
        received = await purchase("receipt", order),
        bill = await purchase("bill", order);
      const stockReceipt = await finishStock(
        actors,
        await post(
          maker,
          "/inventory/stock/operations",
          {
            company_id: company,
            kind: "receipt",
            source_id: received.id,
            warehouse_id: warehouse.id,
            date,
            reason: "Actually received components",
          },
          stockOperationSchema,
        ),
      );
      const payable = await finishFinance(
        actors,
        await post(
          maker,
          `/finance/subledger/purchase/${bill.id}/prepare`,
          { company_id: company, expected_version: bill.version },
          subledgerOperationSchema,
          bill.version,
        ),
      );
      const workspace = await get(
          maker,
          `/finance/subledger/workspace?company_id=${company}&as_of=${date}`,
          subledgerWorkspaceSchema,
        ),
        bank = workspace.banks.find((bank) => bank.currency === "PKR")!;
      const paid = await finishFinance(
        actors,
        await post(
          maker,
          "/finance/subledger/operations",
          {
            company_id: company,
            type: "settlement",
            side: "payable",
            party_id: supplierParty.id,
            bank_account_id: bank.id,
            date,
            payment_amount: "40",
            bank_fee: "0",
            reference: bill.code,
            reason: "Actual supplier settlement",
            allocations: [{ item_id: payable.id, amount: "40" }],
            dimensions: { project: project.id, location: location.id },
          },
          subledgerOperationSchema,
        ),
      );
      expect(
        decimal((await get(maker, `/banking/accounts/${bank.id}`, bankAccountDetailSchema)).ledger_balance, 8, true),
      ).toBe(-decimal("40", 8));
      let production = (
        await post(
          maker,
          "/manufacturing/orders",
          {
            company_id: company,
            product_id: finished.id,
            quantity: "2",
            order_date: date,
            project_id: project.id,
            location_id: location.id,
          },
          manufacturingOrderMutationSchema,
        )
      ).record;
      production = (
        await post(
          checker,
          `/manufacturing/orders/${production.id}/actions`,
          { company_id: company, expected_version: production.version, action: "approve" },
          manufacturingOrderMutationSchema,
          production.version,
        )
      ).record;
      const issued = await finishStock(
        actors,
        await post(
          maker,
          "/inventory/stock/operations",
          {
            company_id: company,
            kind: "manufacturing_issue",
            source_id: production.id,
            date,
            quantity: "2",
            reason: "Actual component consumption",
            lines: [{ product_id: component.id, warehouse_id: warehouse.id, quantity: "4" }],
          },
          stockOperationSchema,
        ),
      );
      const completed = await finishStock(
        actors,
        await post(
          maker,
          "/inventory/stock/operations",
          {
            company_id: company,
            kind: "manufacturing_completion",
            source_id: issued.id,
            date,
            quantity: "2",
            warehouse_id: warehouse.id,
            reason: "Actual finished output",
          },
          stockOperationSchema,
        ),
      );
      const catalogue = await get(
        maker,
        `/sales/lookups?company_id=${company}&kind=product&warehouse_id=${warehouse.id}&search=${finished.id}`,
        salesLookupDirectorySchema,
      );
      expect(catalogue.items[0]).toMatchObject({ id: finished.id, quantity: "2.0000", price: "30", currency: "PKR" });
      expect(
        (await get(maker, `/sales/documents?company_id=${company}&kind=quotation`, salesDirectorySchema)).total,
      ).toBe(0);
      await page.goto("/#/sales/quotations");
      await expect(page.getByText("No quotations found", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "View sample sales workflow", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Add New", exact: true }).click();
      await pick(page, "Customer", customer.name);
      await pick(page, "Currency", "PKR");
      await page.getByLabel("Document date", { exact: true }).fill(date);
      await pick(page, "Project", project.code);
      await pick(page, "Location", location.code);
      await pick(page, "Warehouse", warehouse.code);
      await pick(page, "Approver (optional)", "r06.checker");
      await pick(page, "Product / Service 1", finished.code);
      await page.getByLabel("Quantity 1", { exact: true }).fill("2");
      await expect(page.getByLabel("Unit price 1", { exact: true })).toHaveValue("30");
      await page.getByRole("tab", { name: "Other details", exact: true }).click();
      await page
        .getByLabel("Untaxed treatment reason", { exact: true })
        .fill("Explicit approved untaxed isolated acceptance scenario");
      let quotation = await saveSales(page);
      quotation = await confirmSales(page, "Submit for approval");
      await checker.page.goto(`/#/sales/quotations/${quotation.record.id}`);
      quotation = await confirmSales(checker.page, "Approve");
      await page.goto(`/#/sales/quotations/${quotation.record.id}`);
      await expect(page.getByText(quotation.record.code, { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      let saleOrder = await deriveSales(page, "Confirm order", "order");
      saleOrder = await confirmSales(page, "Confirm order");
      let delivery = await deriveSales(page, "Confirm delivery", "delivery");
      delivery = await confirmSales(page, "Confirm delivery / return");
      await page.getByLabel("Action reason", { exact: true }).fill("Actual shipment of manufactured output");
      await page.getByLabel("Stock posting date", { exact: true }).fill(date);
      const preparation = page.waitForResponse(
        (response) =>
          response.url() === `${api}/sales/documents/${delivery.record.id}/stock` &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Prepare stock accounting", exact: true }).click();
      let shipped = stockOperationSchema.parse(await (await preparation).json());
      shipped = await finishStock(actors, shipped);
      await page.goto(`/#/sales/sales-orders/${saleOrder.record.id}`);
      let invoice = await deriveSales(page, "Create invoice", "invoice");
      invoice = await confirmSales(page, "Approve");
      await page.getByLabel("Action reason", { exact: true }).fill("Recognize actual manufactured-goods sale");
      const accounting = page.waitForResponse(
        (response) =>
          response.url() === `${api}/sales/documents/${invoice.record.id}/accounting` &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Prepare accounting", exact: true }).click();
      let ar = subledgerOperationSchema.parse(await (await accounting).json());
      ar = await finishFinanceUI(actors, invoice, ar);
      await page.goto(`/#/sales/invoices/${invoice.record.id}`);
      await page.getByRole("button", { name: "Receive payment", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Allocate a receipt or payment", exact: true })).toBeVisible();
      await page.getByLabel("Posting date", { exact: true }).fill(date);
      await page.getByLabel("Reference", { exact: true }).fill(invoice.record.code);
      await page.getByLabel("Reason", { exact: true }).fill("Actual customer receipt against delivered invoice");
      await page.getByLabel("Bank account", { exact: true }).selectOption(bank.id);
      await page.getByLabel("Payment amount before bank fee", { exact: true }).fill("60");
      await page.getByLabel(`Allocate ${ar.code}`, { exact: true }).fill("60");
      const savedReceipt = page.waitForResponse(
        (response) =>
          response.url() === `${api}/finance/subledger/operations` && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Save settlement draft", exact: true }).click();
      let receipt = subledgerOperationSchema.parse(await (await savedReceipt).json());
      receipt = await finishFinanceUI(actors, invoice, receipt);
      expect(
        decimal((await get(maker, `/banking/accounts/${bank.id}`, bankAccountDetailSchema)).ledger_balance, 8, true),
      ).toBe(decimal("20", 8));
      const restored = await get(
        maker,
        `/sales/documents/${invoice.record.id}?company_id=${company}`,
        salesDetailSchema,
      );
      expect(restored.record).toMatchObject({
        posting_state: "posted",
        outstanding: "0.00000000",
        financial_operation_id: ar.id,
      });
      expect(
        (
          await get(
            maker,
            `/inventory/stock/workspace?company_id=${company}&as_of=${date}&product_id=${finished.id}`,
            stockWorkspaceSchema,
          )
        ).balances[0],
      ).toMatchObject({ quantity: "0.0000", value: "0.00000000" });
      const second = await post(
        maker,
        `/sales/documents/${invoice.record.id}/accounting`,
        {
          company_id: company,
          expected_version: invoice.record.version,
          reason: "Reopen existing source-owned review",
        },
        subledgerOperationSchema,
        invoice.record.version,
      );
      expect(second.id).toBe(ar.id);
      let reconciliation = await post(
        maker,
        "/banking/reconciliations",
        {
          company_id: company,
          bank_account_id: bank.id,
          method: "manual_tick",
          reconciliation_date: date,
          statement_date: date,
          period_start: date,
          period_end: date,
          statement_reference: "ACTUAL-INTEGRATED-ACCEPTANCE",
          closing_statement_balance: "20",
        },
        bankReconciliationMutationResultSchema,
      );
      let recon = await get(maker, `/banking/reconciliations/${reconciliation.id}`, bankReconciliationDetailSchema);
      for (const journal of [paid.journal_id, receipt.journal_id]) {
        const movement = recon.ledger_candidates.find((line) => line.journal_id === journal);
        expect(movement).toBeDefined();
        const selected = await post(
          maker,
          `/banking/reconciliations/${reconciliation.id}/manual_selections`,
          { expected_version: recon.version, journal_line_id: movement!.journal_line_id, selected: true },
          bankReconciliationManualSelectionMutationResultSchema,
          recon.version,
        );
        recon = await get(maker, `/banking/reconciliations/${reconciliation.id}`, bankReconciliationDetailSchema);
        expect(recon.version).toBe(selected.reconciliation_version);
      }
      expect(decimal(recon.balances.difference, 8, true)).toBe(0n);
      reconciliation = await post(
        maker,
        `/banking/reconciliations/${reconciliation.id}/submit`,
        { expected_version: recon.version },
        bankReconciliationMutationResultSchema,
        recon.version,
      );
      reconciliation = await post(
        checker,
        `/banking/reconciliations/${reconciliation.id}/decision`,
        { expected_version: reconciliation.version, action: "approve" },
        bankReconciliationMutationResultSchema,
        reconciliation.version,
      );
      expect(reconciliation.state).toBe("approved");
      const report = await get(
        maker,
        `/finance/subledger/reports?company_id=${company}&as_of=${date}&report=trial_balance`,
        subledgerReportSchema,
      );
      expect(report.debit).toBe(report.credit);
      expect(report.reconciliation.every((row) => decimal(row.difference, 8, true) === 0n)).toBe(true);
      const dbName = process.env.NEXORA_BANK_CONTEXT_E2E_DATABASE!;
      if (!/^nexora_bank_context_e2e_isolated_[a-f0-9]{24}$/.test(dbName))
        throw Error("Unsafe acceptance evidence database");
      const url = new URL(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
      url.pathname = `/${dbName}`;
      const pool = new pg.Pool({ connectionString: url.href });
      try {
        const journals = [stockReceipt, issued, completed, shipped, payable, paid, ar, receipt].map(
          (op) => op.journal_id,
        );
        const evidence = (
          await pool.query(
            "select l.account_id,sum(l.base_debit-l.base_credit)::text amount from journal_line l join journal_entry j on(j.tenant_id,j.id)=(l.tenant_id,l.journal_id) where j.company_id=$1 group by l.account_id order by l.account_id",
            [company],
          )
        ).rows;
        const amount = (account: string) =>
          decimal(evidence.find((row) => row.account_id === account)?.amount ?? "0", 8, true);
        expect(amount("stock-browser-Stock")).toBe(0n);
        expect(amount("stock-browser-WIP")).toBe(0n);
        expect(amount("stock-browser-GRNI")).toBe(0n);
        expect(amount(`${company}-expense`)).toBe(decimal("40", 8));
        expect(amount(`${company}-revenue`)).toBe(-decimal("60", 8));
        expect(amount(`${company}-receivable`)).toBe(0n);
        expect(amount(`${company}-payable`)).toBe(0n);
        const bankAccount = (
          await pool.query("select account_id from bank_account where company_id=$1 and id=$2", [company, bank.id])
        ).rows[0].account_id;
        expect(amount(bankAccount)).toBe(decimal("20", 8));
        expect(
          (
            await pool.query(
              "select count(*)::int n from(select journal_id from journal_line where journal_id=any($1::text[]) group by journal_id having sum(base_debit-base_credit)=0) balanced",
              [journals],
            )
          ).rows[0].n,
        ).toBe(8);
        expect(
          (
            await pool.query(
              "select count(*)::int n from finance_subledger_audit where company_id=$1 and operation_id=any($2::text[])",
              [company, [payable.id, paid.id, ar.id, receipt.id]],
            )
          ).rows[0].n,
        ).toBe(16);
        await mkdir("tmp/operational-sales-acceptance", { recursive: true });
        await writeFile(
          "tmp/operational-sales-acceptance/database-evidence.json",
          JSON.stringify(
            {
              company,
              journals,
              evidence,
              quotation: quotation.record.id,
              order: saleOrder.record.id,
              delivery: delivery.record.id,
              invoice: invoice.record.id,
              reconciliation: reconciliation.id,
            },
            null,
            2,
          ),
        );
      } finally {
        await pool.end();
      }
      await page.goto(`/#/sales/invoices/${invoice.record.id}`);
      await page.reload();
      await expect(page.getByRole("heading", { name: invoice.record.code, exact: true }).last()).toBeVisible();
      await expect(page.locator("table table")).toHaveCount(0);
      await expect(page.getByText("Customer balance settled", { exact: true })).toBeVisible();
      for (const theme of ["light", "dark"] as const) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        for (const [name, width, height] of [
          ["desktop", 1440, 1000],
          ["tablet", 800, 1000],
          ["mobile", 390, 844],
        ] as const) {
          await page.setViewportSize({ width, height });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: `tmp/operational-sales-acceptance/${name}-${theme}.png`, fullPage: true });
        }
        const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
        expect(
          accessibility.violations.filter((item) => item.impact === "critical" || item.impact === "serious"),
        ).toEqual([]);
      }
    } finally {
      for (const actor of actors) await actor.context.close();
    }
  });
});
