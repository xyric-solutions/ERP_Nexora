import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
import { z } from "zod";
import {
  sessionResponseSchema,
  subledgerWorkspaceSchema,
  subledgerPartySchema,
  subledgerOperationSchema,
  subledgerPartyConfigurationSchema,
  subledgerReportSchema,
  supplierMutationSchema,
  purchaseMutationSchema,
  savePurchaseInputSchema,
  bankReconciliationMutationResultSchema,
  bankReconciliationDetailSchema,
  bankReconciliationManualSelectionMutationResultSchema,
  decimal,
  type SubledgerOperation,
  type SubledgerRequest,
  type PurchaseDocument,
} from "../../packages/contracts/src/index.js";

const company = "nexora-currency-browser";
const api = `http://127.0.0.1:${process.env.NEXORA_BANK_CONTEXT_E2E_PORT}`;
type Actor = { page: Page; context: BrowserContext };
async function signIn(browser: Browser, username: string): Promise<Actor> {
  const context = await browser.newContext();
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(process.env.NEXORA_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: `Open ${company}`, exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  return { context, page };
}
async function get<T>(actor: Actor, path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await actor.context.request.get(`${api}/api/v1${path}`, { headers: { "x-company-id": company } });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  return schema.parse(await response.json());
}
async function mutate<T>(
  actor: Actor,
  path: string,
  data: unknown,
  schema: z.ZodType<T>,
  version?: number,
  key = randomUUID(),
): Promise<T> {
  const session = await get(actor, "/auth/session", sessionResponseSchema);
  const response = await actor.context.request.post(`${api}/api/v1${path}`, {
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
const workspace = (actor: Actor) =>
  get(actor, `/finance/subledger/workspace?company_id=${company}&as_of=2026-11-30&limit=100`, subledgerWorkspaceSchema);
async function finish(actors: Actor[], op: SubledgerOperation) {
  for (const [index, action] of ["submit", "approve", "post"].entries())
    op = await mutate(
      actors[index]!,
      `/finance/subledger/operations/${op.id}/actions`,
      { company_id: company, expected_version: op.version, action, reason: "Authenticated acceptance decision" },
      subledgerOperationSchema,
      op.version,
    );
  return op;
}
async function approvePurchase(actors: Actor[], document: PurchaseDocument) {
  for (const [index, action] of ["submit", "approve"].entries())
    document = (
      await mutate(
        actors[index]!,
        `/procurement/documents/${document.id}/actions`,
        { company_id: company, expected_version: document.version, action, reason: "Authenticated purchase decision" },
        purchaseMutationSchema,
        document.version,
      )
    ).record;
  return document;
}
async function reconcile(actors: Actor[], operation: SubledgerOperation, bank: string, date: string, closing: string) {
  let state = await mutate(
    actors[0]!,
    "/banking/reconciliations",
    {
      company_id: company,
      bank_account_id: bank,
      method: "manual_tick",
      reconciliation_date: date,
      statement_date: date,
      period_start: date,
      period_end: date,
      statement_reference: `ACCEPT-${operation.code}`,
      closing_statement_balance: closing,
    },
    bankReconciliationMutationResultSchema,
  );
  const path = `/banking/reconciliations/${state.id}`;
  let detail = await get(actors[0]!, path, bankReconciliationDetailSchema);
  const movement = detail.ledger_candidates.find((line) => line.journal_id === operation.journal_id);
  expect(movement, "The actual posted settlement must reach reconciliation").toBeDefined();
  expect(decimal(movement!.amount, 8)).toBe(decimal("100", 8));
  const selected = await mutate(
    actors[0]!,
    `${path}/manual_selections`,
    { expected_version: detail.version, journal_line_id: movement!.journal_line_id, selected: true },
    bankReconciliationManualSelectionMutationResultSchema,
    detail.version,
  );
  expect(decimal(selected.balances.difference, 8, true)).toBe(0n);
  state = await mutate(
    actors[0]!,
    `${path}/submit`,
    { expected_version: selected.reconciliation_version },
    bankReconciliationMutationResultSchema,
    selected.reconciliation_version,
  );
  expect(state.state).toBe("submitted");
  state = await mutate(
    actors[1]!,
    `${path}/decision`,
    { action: "approve", expected_version: state.version },
    bankReconciliationMutationResultSchema,
    state.version,
  );
  expect(state.state).toBe("approved");
  detail = await get(actors[1]!, path, bankReconciliationDetailSchema);
  expect(decimal(detail.balances.ledger_balance_at_cutoff, 8, true)).toBe(decimal(closing, 8, true));
  expect(detail.balances.unmatched_ledger_count).toBe(0);
  expect(detail.approved_by).not.toBe(detail.prepared_by);
  await actors[1]!.page.goto(`/#/banking/bank-reconciliation/${state.id}`);
  await expect(actors[1]!.page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await actors[1]!.page.reload();
  await expect(actors[1]!.page.getByText(`ACCEPT-${operation.code}`, { exact: true })).toBeVisible();
  return state.id;
}
async function verifyEvidence(
  actor: Actor,
  party: string,
  operations: SubledgerOperation[],
  reconciliation: string,
  label: string,
) {
  const data = await workspace(actor);
  expect(
    data.balances
      .filter((b) => b.party_id === party)
      .every((b) => decimal(b.outstanding, 8, true) === 0n && decimal(b.carrying, 8, true) === 0n),
  ).toBe(true);
  const report = await get(
    actor,
    `/finance/subledger/reports?company_id=${company}&as_of=2026-11-30&report=trial_balance`,
    subledgerReportSchema,
  );
  expect(report.debit).toBe(report.credit);
  expect(report.reconciliation.length).toBeGreaterThan(0);
  expect(report.reconciliation.every((row) => decimal(row.difference, 8, true) === 0n)).toBe(true);
  for (const name of ["statement", "general_ledger", "profit_loss", "balance_sheet"])
    await get(
      actor,
      `/finance/subledger/reports?company_id=${company}&as_of=2026-11-30&report=${name}`,
      subledgerReportSchema,
    );
  const database = process.env.NEXORA_BANK_CONTEXT_E2E_DATABASE!;
  if (!/^nexora_bank_context_e2e_isolated_[a-f0-9]{24}$/.test(database)) throw new Error("Unsafe evidence database");
  const url = new URL(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55433")
    throw new Error("Only the isolated test service may supply evidence");
  url.pathname = `/${database}`;
  const pool = new pg.Pool({ connectionString: url.href }),
    client = await pool.connect();
  try {
    await client.query("begin read only");
    await client.query(
      "select set_config('nexora.tenant_id','nexora-r06-uat',true),set_config('nexora.user_id','r06.maker',true)",
    );
    const journals = await client.query<{
      id: string;
      debit: string;
      credit: string;
      native_debit: string;
      native_credit: string;
    }>(
      `select j.id,sum(l.base_debit)::text as debit,sum(l.base_credit)::text as credit,sum(l.debit)::text as native_debit,sum(l.credit)::text as native_credit
       from journal_entry j join journal_line l on (l.tenant_id,l.journal_id)=(j.tenant_id,j.id)
       where j.tenant_id='nexora-r06-uat' and j.company_id=$1 and j.id=any($2::text[]) and j.status='posted' group by j.id`,
      [company, operations.map((op) => op.journal_id)],
    );
    expect(journals.rows).toHaveLength(operations.length);
    for (const journal of journals.rows) {
      expect(journal.debit).toBe(journal.credit);
      expect(journal.native_debit).toBe(journal.native_credit);
    }
    const ledgerTotals = (
      await client.query<{ debit: string; credit: string }>(
        "select coalesce(sum(l.base_debit),0)::text as debit,coalesce(sum(l.base_credit),0)::text as credit from journal_entry j join journal_line l on (l.tenant_id,l.journal_id)=(j.tenant_id,j.id) where j.tenant_id='nexora-r06-uat' and j.company_id=$1 and j.status in ('posted','reversed') and j.posting_date<='2026-11-30'",
        [company],
      )
    ).rows[0]!;
    expect(decimal(ledgerTotals.debit, 8)).toBeGreaterThan(0n);
    expect(decimal(report.debit, 8)).toBe(decimal(ledgerTotals.debit, 8));
    expect(decimal(report.credit, 8)).toBe(decimal(ledgerTotals.credit, 8));
    const audits = await client.query<{ operation_id: string; actors: number; events: number }>(
      "select operation_id,count(distinct actor_id)::integer as actors,count(*)::integer as events from finance_subledger_audit where tenant_id='nexora-r06-uat' and company_id=$1 and operation_id=any($2::text[]) group by operation_id",
      [company, operations.map((op) => op.id)],
    );
    expect(audits.rows).toHaveLength(operations.length);
    expect(audits.rows.every((row) => row.actors === 3 && row.events >= 4)).toBe(true);
    const nativeControls = await client.query<{ account: string; currency: string; difference: string }>(
      `with controls as (select distinct control_account_id from finance_subledger_item where tenant_id='nexora-r06-uat' and company_id=$1),
       ledger as (select l.account_id,l.currency,sum(l.debit-l.credit) as balance from journal_entry j join journal_line l on (l.tenant_id,l.journal_id)=(j.tenant_id,j.id)
        where j.tenant_id='nexora-r06-uat' and j.company_id=$1 and j.status in ('posted','reversed') and j.posting_date<='2026-11-30' and l.account_id in(select control_account_id from controls) group by l.account_id,l.currency),
       subledger as (select i.control_account_id,i.currency,sum(e.foreign_delta*case when i.side='receivable' then 1 else -1 end) as balance
        from finance_subledger_item i join finance_subledger_item_event e on (e.tenant_id,e.company_id,e.item_id)=(i.tenant_id,i.company_id,i.id)
        where i.tenant_id='nexora-r06-uat' and i.company_id=$1 and e.event_date<='2026-11-30' group by i.control_account_id,i.currency)
       select coalesce(l.account_id,s.control_account_id) as account,coalesce(l.currency,s.currency) as currency,(coalesce(l.balance,0)-coalesce(s.balance,0))::text as difference
       from ledger l full join subledger s on (s.control_account_id,s.currency)=(l.account_id,l.currency)`,
      [company],
    );
    expect(nativeControls.rows.length).toBeGreaterThan(0);
    expect(nativeControls.rows.every((row) => decimal(row.difference, 8, true) === 0n)).toBe(true);
    const effects = await client.query<{ count: number }>(
      "select count(*)::integer as count from accounting_event e join finance_subledger_operation o on o.tenant_id=e.tenant_id and o.id=e.source_id where e.tenant_id='nexora-r06-uat' and o.company_id=$1 and e.source_type='currency_subledger' and e.source_id=any($2::text[]) and e.state='posted' and e.event_type='currency_subledger.posted' group by e.source_id",
      [company, operations.map((op) => op.id)],
    );
    expect(effects.rows).toHaveLength(operations.length);
    expect(effects.rows.every((row) => row.count === 1)).toBe(true);
    await client.query("rollback");
    await mkdir("tmp/ap-ar-readiness-phase2/evidence", { recursive: true });
    await writeFile(
      `tmp/ap-ar-readiness-phase2/evidence/${label}.json`,
      JSON.stringify(
        {
          authenticated: true,
          company,
          operations: operations.map((op) => ({ id: op.id, journal_id: op.journal_id })),
          reconciliation,
          journals: journals.rows,
          audits: audits.rows,
          controlDifferences: report.reconciliation,
          nativeControlDifferences: nativeControls.rows,
          postedEffects: effects.rows,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

test.describe.serial("authenticated AP/AR posting to bank reconciliation", () => {
  test.skip(process.env.NEXORA_AP_AR_E2E !== "true", "Use the isolated AP/AR harness.");
  let actors: Actor[] = [];
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000);
    for (const username of ["r06.maker", "r06.checker", "r06.target"]) actors.push(await signIn(browser, username));
  });
  test.afterAll(async () => {
    for (const actor of actors) await actor.context.close();
    actors = [];
  });
  test("customer creation, reviewed credit/terms, invoice, independent posting, receipt and reconciliation", async () => {
    test.setTimeout(180000);
    const maker = actors[0]!;
    await maker.page.goto("/#/sales/customers");
    await maker.page.getByRole("button", { name: "Add customer", exact: true }).click();
    await maker.page.getByLabel("Original currency", { exact: true }).selectOption("USD");
    await maker.page.getByLabel("Name", { exact: true }).fill("Authenticated acceptance customer");
    await maker.page.getByRole("button", { name: "Create financial party", exact: true }).click();
    await expect(
      maker.page.getByText("Shared master account saved with its stable reference.", { exact: true }),
    ).toBeVisible();
    const customer = (await workspace(maker)).parties.find((p) => p.name === "Authenticated acceptance customer")!;
    const initialSession = await get(maker, "/auth/session", sessionResponseSchema);
    const unconfigured = await maker.context.request.post(`${api}/api/v1/finance/subledger/operations`, {
      headers: { "x-company-id": company, "x-csrf-token": initialSession.csrf_token, "idempotency-key": randomUUID() },
      data: {
        company_id: company,
        type: "recognition",
        side: "receivable",
        kind: "invoice",
        party_id: customer.id,
        date: "2026-11-18",
        due_date: "2026-11-18",
        currency: "USD",
        amount: "100",
        reason: "Reject unreviewed customer credit",
      },
    });
    expect(unconfigured.status()).toBe(409);
    expect(await unconfigured.json()).toMatchObject({ code: "CUSTOMER_FINANCIAL_CONFIGURATION_REQUIRED" });
    await maker.page.getByLabel("Financial customer / supplier").selectOption(customer.id);
    await maker.page.getByLabel(/^Customer credit limit/).fill("30000");
    await maker.page.getByLabel("Default payment terms").selectOption("days_30");
    await maker.page.getByLabel("Financial setup reason").fill("Approved acceptance credit and terms");
    await maker.page.getByRole("button", { name: "Save financial terms", exact: true }).click();
    await expect(maker.page.getByText("Reviewed financial terms saved.", { exact: true })).toBeVisible();
    expect((await workspace(maker)).parties.find((p) => p.id === customer.id)?.financial_configuration?.version).toBe(
      1,
    );
    await mkdir("tmp/ap-ar-readiness-phase2/evidence", { recursive: true });
    for (const [width, height] of [
      [1440, 1000],
      [820, 1180],
      [390, 844],
    ]) {
      await maker.page.setViewportSize({ width, height });
      for (const theme of ["light", "dark"]) {
        await maker.page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await maker.page.screenshot({
          path: `tmp/ap-ar-readiness-phase2/evidence/financial-setup-${width}-${theme}.png`,
          fullPage: true,
        });
      }
    }
    const invoice = await finish(
      actors,
      await mutate(
        maker,
        "/finance/subledger/operations",
        {
          company_id: company,
          type: "recognition",
          side: "receivable",
          kind: "invoice",
          party_id: customer.id,
          date: "2026-11-18",
          currency: "USD",
          amount: "100",
          monetary: true,
          reason: "Authenticated customer invoice",
          reference: "AR-ACCEPT",
        } satisfies SubledgerRequest,
        subledgerOperationSchema,
      ),
    );
    expect(invoice.input).toMatchObject({ due_date: "2026-12-18", payment_term: "days_30" });
    const bank = (await workspace(maker)).banks.find((b) => b.currency === "USD")!.id;
    const receipt = await finish(
      actors,
      await mutate(
        maker,
        "/finance/subledger/operations",
        {
          company_id: company,
          type: "settlement",
          side: "receivable",
          party_id: customer.id,
          date: "2026-11-18",
          bank_account_id: bank,
          payment_amount: "100",
          bank_fee: "0",
          allocations: [{ item_id: invoice.id, amount: "100" }],
          reason: "Authenticated customer receipt",
          reference: "AR-BANK",
        } satisfies SubledgerRequest,
        subledgerOperationSchema,
      ),
    );
    const replayKey = randomUUID();
    const replayPayload = {
      company_id: company,
      expected_version: receipt.version - 1,
      action: "post",
      reason: "Authenticated acceptance decision",
    };
    // A fresh key cannot post an already terminal operation again.
    const session = await get(maker, "/auth/session", sessionResponseSchema);
    const duplicate = await actors[2]!.context.request.post(
      `${api}/api/v1/finance/subledger/operations/${receipt.id}/actions`,
      {
        headers: {
          "x-csrf-token": (await get(actors[2]!, "/auth/session", sessionResponseSchema)).csrf_token,
          "x-company-id": company,
          "idempotency-key": replayKey,
          "if-match": `"${replayPayload.expected_version}"`,
        },
        data: replayPayload,
      },
    );
    expect(duplicate.status()).toBe(409);
    expect(session.active_company?.id).toBe(company);
    const reconciliation = await reconcile(actors, receipt, bank, "2026-11-18", "100");
    await verifyEvidence(maker, customer.id, [invoice, receipt], reconciliation, "receivables");
  });

  test("supplier creation, approved purchase bill, AP posting, approved payment and reconciliation", async () => {
    test.setTimeout(180000);
    const maker = actors[0]!;
    const vendor = (
      await mutate(
        maker,
        "/procurement/suppliers",
        { company_id: company, name: "Authenticated acceptance supplier" },
        supplierMutationSchema,
      )
    ).record;
    const supplier = await mutate(
      maker,
      "/finance/subledger/parties",
      {
        company_id: company,
        kind: "supplier",
        source_supplier_id: vendor.id,
        name: vendor.name,
        default_currency: "USD",
      },
      subledgerPartySchema,
    );
    await mutate(
      maker,
      `/finance/subledger/parties/${supplier.id}/configuration`,
      {
        company_id: company,
        expected_version: 0,
        payment_term: "days_15",
        credit_limit: null,
        reason: "Approved supplier financial terms",
      },
      subledgerPartyConfigurationSchema,
      0,
    );
    let previous: PurchaseDocument | undefined, order: PurchaseDocument | undefined;
    for (const kind of ["request", "rfq", "order", "receipt", "bill"] as const) {
      const source = kind === "bill" ? order : previous;
      let document = (
        await mutate(
          maker,
          "/procurement/documents",
          savePurchaseInputSchema.parse({
            company_id: company,
            kind,
            supplier_id: ["request", "rfq"].includes(kind) ? null : vendor.id,
            invited_supplier_ids: kind === "rfq" ? [vendor.id] : [],
            source_id: source?.id ?? null,
            approver_id: "r06.checker",
            document_date: "2026-11-19",
            currency: "USD",
            reference: `AP-ACCEPT-${kind}`,
            lines: [
              {
                source_line_id: source?.lines[0]?.id ?? null,
                item_code: "SERVICE",
                description: "Acceptance service invoice",
                quantity: "1",
                uom: "Each",
                unit_price: "100",
                tax_percent: "0",
              },
            ],
          }),
          purchaseMutationSchema,
        )
      ).record;
      document = await approvePurchase(actors, document);
      previous = document;
      if (kind === "order") order = document;
    }
    const bill = previous!;
    expect(bill.payment_term).toBe("days_15");
    expect(bill.due_date).toBe("2026-12-04");
    const invoice = await finish(
      actors,
      await mutate(
        maker,
        `/finance/subledger/purchase/${bill.id}/prepare`,
        { company_id: company, expected_version: bill.version },
        subledgerOperationSchema,
        bill.version,
      ),
    );
    const bank = (await workspace(maker)).banks.find((b) => b.currency === "USD")!.id;
    let instruction = (
      await mutate(
        maker,
        "/procurement/documents",
        savePurchaseInputSchema.parse({
          company_id: company,
          kind: "payment",
          supplier_id: vendor.id,
          approver_id: "r06.checker",
          document_date: "2026-11-19",
          currency: "USD",
          reference: "AP-BANK",
          allocations: [{ bill_id: bill.id, amount: "100" }],
          payment_details: {
            bank_account_id: bank,
            entries: [
              {
                supplier_id: vendor.id,
                amount: "100",
                mode: "bank_transfer",
                reference: "AP-BANK",
                wht_rate: "0",
                additional_wht: "0",
              },
            ],
          },
        }),
        purchaseMutationSchema,
      )
    ).record;
    instruction = await approvePurchase(actors, instruction);
    const payment = await finish(
      actors,
      await mutate(
        maker,
        `/finance/subledger/purchase/${instruction.id}/prepare`,
        { company_id: company, expected_version: instruction.version },
        subledgerOperationSchema,
        instruction.version,
      ),
    );
    const reconciliation = await reconcile(actors, payment, bank, "2026-11-19", "0");
    await verifyEvidence(maker, supplier.id, [invoice, payment], reconciliation, "payables");
  });
});
