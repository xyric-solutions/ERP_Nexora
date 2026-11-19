import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  subledgerQuerySchema,
  subledgerReportQuerySchema,
  connectedReportQuerySchema,
  type SubledgerRequest,
  type SubledgerOperation,
  type SubledgerPartyConfigurationInput,
} from "../../packages/contracts/src/index.js";
import { SubledgerReports } from "../../server/api/src/modules/finance/subledger/reports.js";
import { ConnectedReports } from "../../server/api/src/modules/finance/subledger/connected-reports.js";
import { SourceReferenceMasterRepository } from "../../server/api/src/modules/master-data/source-repository.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor, configureCustomerCreditFixture } from "./subledger-fixture.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("AP/AR configuration and accounting readiness", () => {
  let close: () => Promise<void>;
  let f: Awaited<ReturnType<typeof setupSubledgerFixture>>;
  const maker = subledgerActor(),
    checker = subledgerActor("r06.checker"),
    poster = subledgerActor("r06.target");
  beforeAll(async () => {
    const db = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = db.close;
    f = await setupSubledgerFixture(db.pool);
  }, 60000);
  afterAll(async () => {
    await close?.();
  });
  async function finish(op: SubledgerOperation) {
    for (const [action, actor] of [
      ["submit", maker],
      ["approve", checker],
      ["post", poster],
    ] as const)
      op = await f.repository.action(
        actor,
        op.id,
        { company_id: f.company, expected_version: op.version, action, reason: "Reviewed accounting readiness test" },
        randomUUID(),
      );
    return op;
  }
  async function party(kind: "customer" | "supplier" = "customer") {
    return f.repository.createParty(
      maker,
      { company_id: f.company, kind, name: `Readiness ${randomUUID()}`, default_currency: "USD" },
      randomUUID(),
    );
  }
  const workspace = (party_id: string, as_of = "2026-11-30") =>
    f.repository.workspace(maker, subledgerQuerySchema.parse({ company_id: f.company, party_id, as_of }));
  const invoice = (
    party_id: string,
    rest: Partial<Extract<SubledgerRequest, { type: "recognition" }>> = {},
  ): SubledgerRequest => ({
    company_id: f.company,
    type: "recognition",
    side: "receivable",
    party_id,
    kind: "invoice",
    date: "2026-11-01",
    due_date: "2026-12-31",
    currency: "USD",
    amount: "100",
    monetary: true,
    reason: "Acceptance invoice",
    reference: "",
    ...rest,
  });
  const configuration = (
    credit_limit: string | null = "28000",
    expected_version = 0,
  ): SubledgerPartyConfigurationInput => ({
    company_id: f.company,
    expected_version,
    payment_term: "days_30",
    credit_limit,
    reason: "Reviewed financial settings",
  });
  const receipt = (
    party_id: string,
    item_id: string,
    payment_amount: string,
    side: "receivable" | "payable" = "receivable",
  ): SubledgerRequest => ({
    company_id: f.company,
    type: "settlement",
    side,
    party_id,
    bank_account_id: f.banks.USD!,
    date: "2026-11-30",
    payment_currency: "USD",
    payment_amount,
    bank_fee: "0",
    allocations: [{ item_id, amount: payment_amount }],
    reason: "Reviewed bank settlement",
    reference: "",
  });
  async function approved(input: SubledgerRequest) {
    let op = await f.repository.create(maker, input, randomUUID());
    for (const [action, actor] of [
      ["submit", maker],
      ["approve", checker],
    ] as const)
      op = await f.repository.action(
        actor,
        op.id,
        { company_id: f.company, expected_version: op.version, action, reason: "Independent review" },
        randomUUID(),
      );
    return op;
  }
  const postApproved = (op: SubledgerOperation, key = randomUUID()) =>
    f.repository.action(
      poster,
      op.id,
      { company_id: f.company, expected_version: op.version, action: "post", reason: "Post independent decision" },
      key,
    );

  it("ages the first installment separately and applies partial receipts to the oldest due amount", async () => {
    const customer = await party();
    await configureCustomerCreditFixture(f, customer.id);
    const op = await finish(
      await f.repository.create(
        maker,
        invoice(customer.id, { payment_term: "percent_30_now_balance_60_days" }),
        randomUUID(),
      ),
    );
    let data = await workspace(customer.id);
    expect(data.balances[0]).toMatchObject({ days_1_30: "30.00", current: "70.00", outstanding: "100.00" });
    await finish(
      await f.repository.create(
        maker,
        {
          company_id: f.company,
          type: "settlement",
          side: "receivable",
          party_id: customer.id,
          bank_account_id: f.banks.USD!,
          date: "2026-11-15",
          payment_currency: "USD",
          payment_amount: "20",
          bank_fee: "0",
          allocations: [{ item_id: op.id, amount: "20" }],
          reason: "Partial installment receipt",
          reference: "",
        },
        randomUUID(),
      ),
    );
    data = await workspace(customer.id);
    expect(data.balances[0]).toMatchObject({ days_1_30: "10.00", current: "70.00", outstanding: "80.00" });
    expect((await workspace(customer.id, "2026-11-10")).balances[0]).toMatchObject({
      days_1_30: "30.00",
      current: "70.00",
      outstanding: "100.00",
    });
  });

  it("requires explicit reviewed credit before any new customer invoice", async () => {
    const customer = await party();
    await expect(f.repository.create(maker, invoice(customer.id), randomUUID())).rejects.toMatchObject({
      code: "CUSTOMER_FINANCIAL_CONFIGURATION_REQUIRED",
    });
    expect((await workspace(customer.id)).items).toHaveLength(0);
  });

  it("persists versioned financial settings, exact idempotency and default due dates without financial effects", async () => {
    const customer = await party(),
      key = randomUUID();
    const count = async () =>
      (
        await f.pool.query(
          "select count(*)::integer as count from journal_entry where tenant_id=$1 and company_id=$2",
          [f.tenant, f.company],
        )
      ).rows[0].count;
    const before = await count();
    const saved = await f.repository.configureParty(maker, customer.id, configuration(), key);
    expect(saved).toMatchObject({
      version: 1,
      credit_limit: "28000.00",
      credit_currency: "PKR",
      payment_term: "days_30",
    });
    expect(await f.repository.configureParty(maker, customer.id, configuration(), key)).toEqual(saved);
    await expect(f.repository.configureParty(maker, customer.id, configuration(), randomUUID())).rejects.toMatchObject({
      code: "STALE_VERSION",
    });
    expect(await count()).toBe(before);
    const data = await workspace(customer.id);
    expect(data.parties.find((p) => p.id === customer.id)?.financial_configuration).toEqual(saved);
    expect(data.readiness?.policy_configured).toBe(true);
    const op = await f.repository.create(maker, invoice(customer.id, { due_date: undefined }), randomUUID());
    expect(op.input).toMatchObject({ due_date: "2026-12-01", payment_term: "days_30" });
    expect(op.preview?.party_configuration).toEqual(saved);
  });

  it("rejects zero/exceeded/over-precision credit and wrong-role settings", async () => {
    const customer = await party(),
      supplier = await party("supplier");
    await f.repository.configureParty(maker, customer.id, configuration("0"), randomUUID());
    await expect(
      f.repository.create(maker, invoice(customer.id, { amount: "0.01", due_date: undefined }), randomUUID()),
    ).rejects.toMatchObject({ code: "CUSTOMER_CREDIT_LIMIT_EXCEEDED" });
    await expect(
      f.repository.configureParty(maker, customer.id, configuration("0.001", 1), randomUUID()),
    ).rejects.toMatchObject({ code: "SUBLEDGER_AMOUNT_INVALID" });
    await expect(
      f.repository.configureParty(maker, supplier.id, configuration("100"), randomUUID()),
    ).rejects.toMatchObject({ code: "SUBLEDGER_VALIDATION_FAILED" });
    await expect(
      f.repository.configureParty(maker, customer.id, configuration(null, 1), randomUUID()),
    ).rejects.toMatchObject({ code: "SUBLEDGER_VALIDATION_FAILED" });
    await expect(
      f.repository.configureParty(
        { ...maker, actor: { ...maker.actor, permissions: [] } },
        customer.id,
        configuration("100", 1),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repository.configureParty(
        maker,
        customer.id,
        { ...configuration(), company_id: "unpermitted-company" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("includes all currencies and future-dated exposure and releases credit after a real receipt", async () => {
    const customer = await party();
    await f.repository.configureParty(maker, customer.id, configuration(), randomUUID());
    const first = await finish(
      await f.repository.create(maker, invoice(customer.id, { date: "2026-11-30", due_date: undefined }), randomUUID()),
    );
    await expect(
      f.repository.create(maker, invoice(customer.id, { amount: "1", due_date: undefined }), randomUUID()),
    ).rejects.toMatchObject({ code: "CUSTOMER_CREDIT_LIMIT_EXCEEDED" });
    await expect(
      f.repository.create(
        maker,
        invoice(customer.id, { amount: "0.01", currency: "EUR", due_date: undefined }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "CUSTOMER_CREDIT_LIMIT_EXCEEDED" });
    await finish(await f.repository.create(maker, receipt(customer.id, first.id, "20"), randomUUID()));
    await finish(
      await f.repository.create(
        maker,
        invoice(customer.id, { amount: "20", date: "2026-11-30", due_date: undefined }),
        randomUUID(),
      ),
    );
    expect((await workspace(customer.id)).balances[0]?.outstanding).toBe("100.00");
  });

  it("serializes concurrent invoice posting against one credit ceiling", async () => {
    const customer = await party();
    await f.repository.configureParty(maker, customer.id, configuration(), randomUUID());
    const a = await approved(invoice(customer.id, { amount: "70", due_date: undefined }));
    const b = await approved(invoice(customer.id, { amount: "70", due_date: undefined }));
    const results = await Promise.allSettled([postApproved(a), postApproved(b)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toMatchObject({ code: "CUSTOMER_CREDIT_LIMIT_EXCEEDED" });
    expect((await workspace(customer.id)).balances[0]?.outstanding).toBe("70.00");
  });

  it("requires fresh approval after settings change and preserves receipt/reversal rights after a lower limit", async () => {
    const customer = await party();
    await f.repository.configureParty(maker, customer.id, configuration(), randomUUID());
    const pending = await approved(invoice(customer.id, { amount: "50", due_date: undefined }));
    await f.repository.configureParty(maker, customer.id, configuration("56000", 1), randomUUID());
    await expect(postApproved(pending)).rejects.toMatchObject({ code: "SUBLEDGER_SNAPSHOT_CHANGED" });
    const posted = await finish(
      await f.repository.create(maker, invoice(customer.id, { due_date: undefined }), randomUUID()),
    );
    await f.repository.configureParty(maker, customer.id, configuration("0", 2), randomUUID());
    const settled = await finish(await f.repository.create(maker, receipt(customer.id, posted.id, "10"), randomUUID()));
    await finish(
      await f.repository.create(
        maker,
        {
          company_id: f.company,
          type: "reversal",
          operation_id: settled.id,
          date: "2026-11-30",
          reason: "Controlled historical receipt reversal",
          reference: "",
        },
        randomUUID(),
      ),
    );
    expect((await workspace(customer.id)).balances[0]?.outstanding).toBe("100.00");
  });

  it("protects financial settings with immutable evidence and rejects an unaudited direct insert", async () => {
    const customer = await party(),
      c = await f.pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id',$2,true)", [
        f.tenant,
        maker.actor.userId,
      ]);
      await c.query(
        "insert into finance_party_configuration(tenant_id,company_id,party_id,version,payment_term,credit_limit,credit_currency,reason,created_by) values($1,$2,$3,1,'immediate',100,'PKR','Unaudited settings','r06.maker')",
        [f.tenant, f.company, customer.id],
      );
      await expect(c.query("commit")).rejects.toMatchObject({ code: "23514" });
      await c.query("rollback");
    } finally {
      c.release();
    }
    expect(
      (await workspace(customer.id)).parties.find((p) => p.id === customer.id)?.financial_configuration,
    ).toBeNull();
    await f.repository.configureParty(maker, customer.id, configuration(), randomUUID());
    await expect(
      f.pool.query(
        "update finance_party_configuration set credit_limit=999999 where tenant_id=$1 and company_id=$2 and party_id=$3",
        [f.tenant, f.company, customer.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(f.pool.query("truncate finance_party_configuration")).rejects.toMatchObject({ code: "23514" });
  });

  it("posts supplier debit/credit notes, offsets, payment and exact reversal with zero control differences", async () => {
    const supplier = await party("supplier");
    await f.repository.configureParty(maker, supplier.id, configuration(null), randomUUID());
    const debit = await finish(
      await f.repository.create(
        maker,
        invoice(supplier.id, { side: "payable", document_type: "debit_note", due_date: undefined }),
        randomUUID(),
      ),
    );
    expect(debit.preview?.item?.original_amount).toBe("100.00");
    const credit = await finish(
      await f.repository.create(
        maker,
        invoice(supplier.id, {
          side: "payable",
          kind: "credit_note",
          document_type: "credit_note",
          amount: "20",
          due_date: "2026-11-01",
          original_item_id: debit.id,
        }),
        randomUUID(),
      ),
    );
    expect(credit.preview?.item?.original_amount).toBe("-20.00");
    await finish(
      await f.repository.create(
        maker,
        {
          company_id: f.company,
          type: "offset",
          side: "payable",
          party_id: supplier.id,
          date: "2026-11-30",
          allocations: [
            { item_id: debit.id, amount: "20" },
            { item_id: credit.id, amount: "20" },
          ],
          reason: "Apply supplier credit note",
          reference: "",
        },
        randomUUID(),
      ),
    );
    const payment = await finish(
      await f.repository.create(maker, receipt(supplier.id, debit.id, "80", "payable"), randomUUID()),
    );
    expect((await workspace(supplier.id)).balances[0]?.outstanding).toBe("0.00");
    await finish(
      await f.repository.create(
        maker,
        {
          company_id: f.company,
          type: "reversal",
          operation_id: payment.id,
          date: "2026-11-30",
          reason: "Reverse reviewed supplier payment",
          reference: "",
        },
        randomUUID(),
      ),
    );
    expect((await workspace(supplier.id)).balances[0]?.outstanding).toBe("80.00");
    const report = await new SubledgerReports(f.repository).run(
      maker,
      subledgerReportQuerySchema.parse({ company_id: f.company, report: "trial_balance", as_of: "2026-11-30" }),
    );
    expect(report.debit).toBe(report.credit);
    expect(report.reconciliation.every((row) => row.difference === "0.00")).toBe(true);
  });

  it("rejects foreign dimension IDs and source metadata before preparing financial evidence", async () => {
    const customer = await party();
    await expect(
      f.repository.create(maker, invoice(customer.id, { dimensions: { project: "foreign-project" } }), randomUUID()),
    ).rejects.toMatchObject({ code: "SUBLEDGER_CONFLICT" });
    await expect(
      f.repository.create(
        maker,
        invoice(customer.id, { dimensions: { purchase_line_id: "forged-line" } }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "SUBLEDGER_VALIDATION_FAILED" });
  });

  it("keeps supplier outstanding due dates aligned with the oldest unpaid installment", async () => {
    const supplier = await party("supplier");
    await f.repository.configureParty(
      maker,
      supplier.id,
      { ...configuration(null), payment_term: "percent_30_now_balance_60_days" },
      randomUUID(),
    );
    const op = await finish(await f.repository.create(maker, invoice(supplier.id, { side: "payable" }), randomUUID()));
    const report = async () =>
      new ConnectedReports(f.repository).run(
        maker,
        connectedReportQuerySchema.parse({
          company_id: f.company,
          report: "supplier-outstanding-report",
          supplier_id: supplier.source_supplier_id,
          as_of: "2026-11-30",
        }),
      );
    expect((await report()).rows.find((row) => row.id === op.id)?.values).toMatchObject({
      due: "2026-11-01",
      overdue_days: "29",
      outstanding: "100.00000000",
    });
    await finish(await f.repository.create(maker, receipt(supplier.id, op.id, "20", "payable"), randomUUID()));
    expect((await report()).rows.find((row) => row.id === op.id)?.values).toMatchObject({
      due: "2026-11-01",
      overdue_days: "29",
      outstanding: "80.00000000",
    });
    await finish(await f.repository.create(maker, receipt(supplier.id, op.id, "10", "payable"), randomUUID()));
    expect((await report()).rows.find((row) => row.id === op.id)?.values).toMatchObject({
      due: "2026-12-31",
      overdue_days: "0",
      outstanding: "70.00000000",
    });
    expect((await workspace(supplier.id)).balances[0]).toMatchObject({ current: "70.00", days_1_30: "0.00" });
  });

  it("propagates canonical dimensions and preserves their historical IDs through an inactive-master reversal", async () => {
    const permissions = ["master_data.project.manage", "master_data.project.read"];
    await f.pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,'r06-uat-policy-maker',p,'all' from unnest($2::text[]) p on conflict do nothing",
      [f.tenant, permissions],
    );
    await f.pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,'r06-uat-policy-maker',p,'company',$3 from unnest($2::text[]) p on conflict do nothing",
      [f.tenant, permissions, f.company],
    );
    const actor = { ...maker, actor: { ...maker.actor, permissions: [...maker.actor.permissions, ...permissions] } };
    const masters = new SourceReferenceMasterRepository(f.pool);
    const { record: project } = await masters.create(
      actor,
      "projects",
      { company_id: f.company, code: "APAR", name: "AP/AR dimension acceptance" },
      randomUUID(),
      randomUUID(),
    );
    const customer = await party();
    await configureCustomerCreditFixture(f, customer.id);
    const op = await finish(
      await f.repository.create(maker, invoice(customer.id, { dimensions: { project: project.id } }), randomUUID()),
    );
    const original = (
      await f.pool.query<{ dimensions: { project: string } }>(
        "select dimensions from journal_line where tenant_id=$1 and journal_id=$2",
        [f.tenant, op.journal_id],
      )
    ).rows;
    expect(original.length).toBeGreaterThan(0);
    expect(original.every((row) => row.dimensions.project === project.id)).toBe(true);
    await masters.status(
      actor,
      "projects",
      project.id,
      { company_id: f.company, expected_version: project.version, status: "inactive" },
      randomUUID(),
      randomUUID(),
    );
    const reversed = await finish(
      await f.repository.create(
        maker,
        {
          company_id: f.company,
          type: "reversal",
          operation_id: op.id,
          date: "2026-11-30",
          reason: "Preserve historical project dimensions",
          reference: "",
        },
        randomUUID(),
      ),
    );
    const history = (
      await f.pool.query<{ dimensions: { project: string } }>(
        "select dimensions from journal_line where tenant_id=$1 and journal_id=$2",
        [f.tenant, reversed.journal_id],
      )
    ).rows;
    expect(history.every((row) => row.dimensions.project === project.id)).toBe(true);
  });

  it("enforces financial configuration company/tenant RLS under a non-owner role", async () => {
    const customer = await party();
    await configureCustomerCreditFixture(f, customer.id);
    const role = `apar_rls_${randomUUID().replaceAll("-", "")}`,
      client = await f.pool.connect();
    try {
      await client.query(`create role ${role} nologin`);
      await client.query(`grant usage on schema public to ${role}`);
      await client.query(`grant select on finance_party_configuration,security_user_company_access to ${role}`);
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await client.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.restricted',true)",
        [f.tenant],
      );
      expect(
        (await client.query("select * from finance_party_configuration where company_id=$1", [f.company])).rowCount,
      ).toBe(0);
      await client.query("select set_config('nexora.user_id','r06.maker',true)");
      expect(
        (await client.query("select * from finance_party_configuration where party_id=$1", [customer.id])).rowCount,
      ).toBe(1);
      await client.query("select set_config('nexora.tenant_id','foreign-tenant',true)");
      expect((await client.query("select * from finance_party_configuration")).rowCount).toBe(0);
    } finally {
      await client.query("rollback");
      await client.query(`drop owned by ${role}`);
      await client.query(`drop role ${role}`);
      client.release();
    }
  });
});
