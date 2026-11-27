import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceChartTemplateRepository } from "../../server/api/src/modules/finance/templates/source-repository.js";
import {
  SourceFinanceNominalRepository,
  type FinanceNominalActorContext,
} from "../../server/api/src/modules/finance/nominals/source-repository.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import type { BusinessSetupInput, BusinessSetupResult } from "../../packages/contracts/src/index.js";
import {
  supplierInputSchema,
  subledgerQuerySchema,
  subledgerReportQuerySchema,
  type SubledgerRequest,
} from "../../packages/contracts/src/index.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SourceSubledgerRepository } from "../../server/api/src/modules/finance/subledger/source-repository.js";
import { SubledgerReports } from "../../server/api/src/modules/finance/subledger/reports.js";
import { SourceBankTransferRepository } from "../../server/api/src/modules/banking/transfers/source-repository.js";
import { SourceFinanceCurrencyRepository } from "../../server/api/src/modules/finance/currencies/source-repository.js";
import { importChartTemplateRequestSchema, businessSetupInputSchema } from "../../packages/contracts/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";

const url = process.env.TEST_BUSINESS_SETUP_DATABASE_URL;
const run = url ? describe : describe.skip;
run("business-nature company accounting initialization in PostgreSQL", () => {
  let pool: DatabasePool, repo: SourceChartTemplateRepository, ctx: FinanceNominalActorContext;
  const companies = new Map<string, BusinessSetupResult>();
  const input = (nature: string): BusinessSetupInput => ({
    company_name: `Synthetic ${nature} ${randomUUID()}`,
    business_nature_key: nature,
    organisation_type: nature === "non_profit" ? "non_profit" : "private_limited",
    country_code: "PK",
    base_currency: "PKR",
    financial_year_start_month: 7,
    accounting_method: "accrual",
  });
  beforeAll(async () => {
    if (!url || !/^\/nexora_business_setup_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
      throw new Error("Explicit isolated business-setup test database required");
    pool = createDatabasePool(url);
    await migrateSourceSchema(pool);
    await ensureSourceSuperAdministratorFixture(pool);
    await pool.query("select sync_super_administrator_permissions()");
    const permissions = (
      await pool.query<{ permission_key: string }>(
        "select permission_key from security_permission_definition where status='active'",
      )
    ).rows.map((r) => r.permission_key);
    ctx = {
      tenantId: tenant,
      actor: {
        tenantId: tenant,
        userId: "r06.override-admin",
        email: "setup@example.invalid",
        displayName: "Synthetic setup admin",
        organizationName: "Synthetic",
        roles: ["super_administrator"],
        permissions,
        sessionVersion: 1,
      },
    };
    repo = new SourceChartTemplateRepository(pool);
  }, 60000);
  afterAll(async () => {
    await pool?.end();
  });
  it.each(["it_software", "non_profit", "corporate"])(
    "initializes %s masters and controls without financial postings or bank facilities",
    async (nature) => {
      const request = input(nature),
        key = randomUUID();
      const created = await repo.initializeBusiness(ctx, request, key, randomUUID());
      companies.set(nature, created);
      const company = created.setup.company_id;
      expect(created.setup.business_nature_key).toBe(nature);
      expect((await repo.initializeBusiness(ctx, request, key, randomUUID())).replayed).toBe(true);
      const counts = (
        await pool.query(
          `select count(*) filter(where is_header and parent_id is null)::int as categories,
      count(*) filter(where is_header and parent_id is not null)::int as sections,
      count(*) filter(where not is_header)::int as nominals from account where tenant_id=$1 and company_id=$2`,
          [tenant, company],
        )
      ).rows[0];
      expect(counts).toEqual({ categories: 5, sections: 9, nominals: 14 });
      const policy = (
        await pool.query(
          `select p.rounding_tolerance::text,p.row_version::int,g.code gain,l.code loss,r.code rounding,b.code charge,
          (select count(*)::int from bank_transfer_fx_policy_event e where e.tenant_id=p.tenant_id and e.policy_id=p.id) events
          from bank_transfer_fx_policy p
          join account g on g.tenant_id=p.tenant_id and g.id=p.fx_gain_nominal_id
          join account l on l.tenant_id=p.tenant_id and l.id=p.fx_loss_nominal_id
          join account r on r.tenant_id=p.tenant_id and r.id=p.rounding_nominal_id
          join account b on b.tenant_id=p.tenant_id and b.id=p.bank_charge_nominal_id
          where p.tenant_id=$1 and p.company_id=$2`,
          [tenant, company],
        )
      ).rows[0];
      expect(policy).toEqual({
        rounding_tolerance: "0.00000000",
        row_version: 1,
        gain: "400201",
        loss: "500201",
        rounding: "500302",
        charge: "500301",
        events: 1,
      });
      expect(
        (
          await pool.query(
            "select count(*)::int n from finance_subledger_policy where tenant_id=$1 and company_id=$2",
            [tenant, company],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await pool.query("select count(*)::int n from journal_entry where tenant_id=$1 and company_id=$2", [
            tenant,
            company,
          ])
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await pool.query("select count(*)::int n from bank_account where tenant_id=$1 and company_id=$2", [
            tenant,
            company,
          ])
        ).rows[0].n,
      ).toBe(0);
      expect((await new SourceChartTemplateRepository(pool).businessSetup(ctx, company)).setup).toEqual(created.setup);
      const names = (
        await pool.query("select name from account where tenant_id=$1 and company_id=$2 and code='400101'", [
          tenant,
          company,
        ])
      ).rows.map((r) => r.name);
      expect(names).toEqual([
        nature === "it_software"
          ? "Software and Service Revenue"
          : nature === "non_profit"
            ? "Donations and Grants"
            : "Sales Revenue",
      ]);
    },
  );
  it("repeated setup under a fresh key preserves identities and prevents nature replacement", async () => {
    const first = companies.get("it_software")!;
    const request = businessSetupInputSchema.strip().parse(first.setup);
    const before = (
      await pool.query(
        "select id,code,parent_id,status from account where tenant_id=$1 and company_id=$2 order by id",
        [tenant, request.company_id],
      )
    ).rows;
    expect((await repo.initializeBusiness(ctx, request, randomUUID(), randomUUID())).replayed).toBe(true);
    await expect(
      repo.initializeBusiness(ctx, { ...request, business_nature_key: "non_profit" }, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await pool.query(
          "select id,code,parent_id,status from account where tenant_id=$1 and company_id=$2 order by id",
          [tenant, request.company_id],
        )
      ).rows,
    ).toEqual(before);
  });
  it("supports ordinary manual nominals and filters their section/category relationships", async () => {
    const company = companies.get("it_software")!.setup.company_id;
    const nominalRepo = new SourceFinanceNominalRepository(pool);
    const parents = (
      await pool.query(
        "select s.id as section_id,s.parent_id as category_id from account s where s.tenant_id=$1 and s.company_id=$2 and s.code='5001'",
        [tenant, company],
      )
    ).rows[0];
    const created = await nominalRepo.create(
      ctx,
      {
        nominal_kind: "general",
        company_id: company,
        ...parents,
        name: "Synthetic additional expense",
        currency: "PKR",
      },
      randomUUID(),
      randomUUID(),
    );
    expect(created.state).toBe("active");
    const detail = await nominalRepo.get(ctx, created.id);
    expect(detail.section?.id).toBe(parents.section_id);
    expect(detail.category?.id).toBe(parents.category_id);
    const other = companies.get("non_profit")!.setup.company_id;
    const wrong = (
      await pool.query("select id from account where tenant_id=$1 and company_id=$2 and code='5001'", [tenant, other])
    ).rows[0].id;
    await expect(
      nominalRepo.create(
        ctx,
        {
          nominal_kind: "general",
          company_id: company,
          ...parents,
          section_id: wrong,
          name: "Cross company",
          currency: "PKR",
        },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("creates a bank nominal only on explicit request and binds its adopted definition exactly once", async () => {
    const company = companies.get("corporate")!.setup.company_id;
    const template = companies.get("corporate")!.setup.template_id;
    const parents = (
      await pool.query(
        "select id as section_id,parent_id as category_id from account where tenant_id=$1 and company_id=$2 and code='2309'",
        [tenant, company],
      )
    ).rows[0];
    const nominals = new SourceFinanceNominalRepository(pool);
    const created = await nominals.create(
      ctx,
      {
        nominal_kind: "bank",
        company_id: company,
        ...parents,
        name: "Bank Accounts",
        currency: "PKR",
        chart_template_id: template,
        chart_node_key: "nominal:230902",
      },
      randomUUID(),
      randomUUID(),
    );
    expect(created.bank_account_id).toBeTruthy();
    expect(created.state).toBe("active");
    expect(
      (
        await pool.query("select account_id from bank_account where tenant_id=$1 and company_id=$2 and id=$3", [
          tenant,
          company,
          created.bank_account_id,
        ])
      ).rows[0].account_id,
    ).toBe(created.id);
    await expect(
      nominals.create(
        ctx,
        {
          nominal_kind: "bank",
          company_id: company,
          ...parents,
          name: "Bank Accounts",
          currency: "PKR",
          chart_template_id: template,
          chart_node_key: "nominal:230902",
        },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back invalid setup atomically and rejects impersonation and non-admins", async () => {
    const request = input("it_software");
    await expect(
      repo.initializeBusiness(ctx, { ...request, base_currency: "ZZZ" }, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await pool.query("select 1 from organization_unit where tenant_id=$1 and name=$2", [
          tenant,
          request.company_name,
        ])
      ).rowCount,
    ).toBe(0);
    await expect(
      repo.initializeBusiness({ ...ctx, actor: { ...ctx.actor, roles: [] } }, request, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.initializeBusiness({ ...ctx, realActorId: "someone" }, request, randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.initializeBusiness(
        {
          ...ctx,
          actor: {
            ...ctx.actor,
            permissions: ctx.actor.permissions.filter((p) => p !== "finance.transfer_fx_policy.manage"),
          },
        },
        request,
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await pool.query("select 1 from organization_unit where tenant_id=$1 and name=$2", [
          tenant,
          request.company_name,
        ])
      ).rowCount,
    ).toBe(0);
  });
  it("automatically links Purchasing suppliers and posts AP/AR invoices and bank settlements through the same GL", async () => {
    const company = companies.get("corporate")!.setup.company_id;
    for (const [user, policy] of [
      ["r06.checker", "r06-uat-policy-checker"],
      ["r06.target", "r06-uat-policy-payment-poster"],
    ]) {
      await pool.query(
        `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
        select $1,$2,permission_key,'all' from security_permission_definition where status='active' and (permission_key like 'finance.subledger.%' or permission_key in ('banking.transfer.read','banking.transfer.approve','banking.transfer.post')) on conflict do nothing`,
        [tenant, policy],
      );
      await pool.query(
        `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
        select $1,$2,permission_key,'company',$3 from security_permission_definition where status='active' and (permission_key like 'finance.subledger.%' or permission_key in ('banking.transfer.read','banking.transfer.approve','banking.transfer.post')) on conflict do nothing`,
        [tenant, policy, company],
      );
      await pool.query(
        `insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
        values($1,$2,$3,$4,false,'r06.override-admin','governed_administration','isolated-business-setup-test')`,
        [tenant, randomUUID(), user, company],
      );
    }
    await pool.query(
      "insert into fiscal_calendar(id,tenant_id,company_id,year,period_start,period_end,status) values($1,$2,$3,2026,'2026-01-01','2026-12-31','active')",
      [`cal-${company}`, tenant, company],
    );
    await pool.query(
      "insert into financial_period(id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at) values($1,$2,$3,$4,11,'2026-11-01','2026-11-30','open',clock_timestamp())",
      [`period-${company}`, tenant, company, `cal-${company}`],
    );
    const subledger = new SourceSubledgerRepository(pool),
      procurement = new SourceProcurementRepository(pool);
    const supplier = (
      await procurement.saveSupplier(
        ctx,
        null,
        supplierInputSchema.parse({ company_id: company, name: `Synthetic automatic supplier ${randomUUID()}` }),
        randomUUID(),
        randomUUID(),
      )
    ).record;
    const financialSupplier = (
      await pool.query(
        "select id from finance_party_directory where tenant_id=$1 and company_id=$2 and source_supplier_id=$3",
        [tenant, company, supplier.id],
      )
    ).rows[0];
    expect(financialSupplier?.id).toBeTruthy();
    const customer = await subledger.createParty(
      ctx,
      { company_id: company, name: `Synthetic customer ${randomUUID()}`, kind: "customer", default_currency: "PKR" },
      randomUUID(),
    );
    await subledger.configureParty(
      ctx,
      customer.id,
      {
        company_id: company,
        expected_version: 0,
        payment_term: null,
        credit_limit: "10000",
        reason: "Finite reviewed synthetic customer credit",
      },
      randomUUID(),
    );
    const actor = (userId: string): FinanceNominalActorContext => ({
      ...ctx,
      actor: { ...ctx.actor, userId, roles: [] },
    });
    async function post(input: SubledgerRequest) {
      let op = await subledger.create(ctx, input, randomUUID());
      op = await subledger.action(
        ctx,
        op.id,
        {
          company_id: company,
          action: "submit",
          expected_version: op.version,
          reason: "Submit isolated accounting test",
        },
        randomUUID(),
      );
      await expect(
        subledger.action(
          ctx,
          op.id,
          {
            company_id: company,
            action: "approve",
            expected_version: op.version,
            reason: "Maker cannot decide own financial posting",
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 403 });
      op = await subledger.action(
        actor("r06.checker"),
        op.id,
        {
          company_id: company,
          action: "approve",
          expected_version: op.version,
          reason: "Independent accounting test review",
        },
        randomUUID(),
      );
      return subledger.action(
        actor("r06.target"),
        op.id,
        { company_id: company, action: "post", expected_version: op.version, reason: "Post reviewed accounting test" },
        randomUUID(),
      );
    }
    const common = {
      company_id: company,
      date: "2026-11-20",
      reference: "",
      reason: "Isolated company initialization integration",
    };
    const receivable = await post({
      ...common,
      type: "recognition",
      party_id: customer.id,
      side: "receivable",
      kind: "invoice",
      currency: "PKR",
      amount: "1000",
      due_date: "2026-11-30",
      monetary: true,
    });
    const bank = (
      await pool.query(
        "select id,account_id from bank_account where tenant_id=$1 and company_id=$2 and status='active'",
        [tenant, company],
      )
    ).rows[0];
    const customerItem = (
      await subledger.workspace(
        ctx,
        subledgerQuerySchema.parse({ company_id: company, as_of: "2026-11-30", party_id: customer.id }),
      )
    ).items.find((item) => item.journal_id === receivable.journal_id)!;
    await post({
      ...common,
      type: "settlement",
      party_id: customer.id,
      side: "receivable",
      bank_account_id: bank.id,
      payment_currency: "PKR",
      payment_amount: "600",
      bank_fee: "0",
      allocations: [{ item_id: customerItem.id, amount: "600" }],
    });
    const payable = await post({
      ...common,
      type: "recognition",
      party_id: financialSupplier.id,
      side: "payable",
      kind: "invoice",
      currency: "PKR",
      amount: "500",
      due_date: "2026-11-30",
      monetary: true,
    });
    const supplierItem = (
      await subledger.workspace(
        ctx,
        subledgerQuerySchema.parse({ company_id: company, as_of: "2026-11-30", party_id: financialSupplier.id }),
      )
    ).items.find((item) => item.journal_id === payable.journal_id)!;
    await post({
      ...common,
      type: "settlement",
      party_id: financialSupplier.id,
      side: "payable",
      bank_account_id: bank.id,
      payment_currency: "PKR",
      payment_amount: "200",
      bank_fee: "0",
      allocations: [{ item_id: supplierItem.id, amount: "200" }],
    });
    const workspace = await subledger.workspace(
      ctx,
      subledgerQuerySchema.parse({ company_id: company, as_of: "2026-11-30", limit: 100 }),
    );
    expect(workspace.items.find((item) => item.id === customerItem.id)?.outstanding).toBe("400.00");
    expect(workspace.items.find((item) => item.id === supplierItem.id)?.outstanding).toBe("300.00");
    const balance = (
      await pool.query(
        `select coalesce(sum(l.base_debit-l.base_credit),0)::numeric(38,2)::text balance from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id
      where j.tenant_id=$1 and j.company_id=$2 and l.account_id=$3 and j.status in('posted','reversed')`,
        [tenant, company, bank.account_id],
      )
    ).rows[0].balance;
    expect(balance).toBe("400.00");
    const report = await new SubledgerReports(subledger).run(
      ctx,
      subledgerReportQuerySchema.parse({ company_id: company, as_of: "2026-11-30", report: "trial_balance" }),
    );
    expect(report.reconciliation.every((row) => row.difference === "0.00")).toBe(true);
    const postedBefore = (
      await pool.query(
        "select l.* from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id where j.tenant_id=$1 and j.company_id=$2 order by l.id",
        [tenant, company],
      )
    ).rows;
    const configured = businessSetupInputSchema.strip().parse(companies.get("corporate")!.setup);
    expect((await repo.initializeBusiness(ctx, configured, randomUUID(), randomUUID())).replayed).toBe(true);
    expect(
      (
        await pool.query(
          "select l.* from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id where j.tenant_id=$1 and j.company_id=$2 order by l.id",
          [tenant, company],
        )
      ).rows,
    ).toEqual(postedBefore);
  });
  it("uses the initialized treasury policy for independently approved transfers and reconciles both bank nominals", async () => {
    const company = companies.get("corporate")!.setup.company_id;
    const source = (
      await pool.query(
        "select id,account_id from bank_account where tenant_id=$1 and company_id=$2 and status='active'",
        [tenant, company],
      )
    ).rows[0];
    const parents = (
      await pool.query(
        "select id section_id,parent_id category_id from account where tenant_id=$1 and company_id=$2 and code='2309'",
        [tenant, company],
      )
    ).rows[0];
    const destination = await new SourceFinanceNominalRepository(pool).create(
      ctx,
      { nominal_kind: "bank", company_id: company, ...parents, name: "Synthetic transfer reserve", currency: "PKR" },
      randomUUID(),
      randomUUID(),
    );
    const transfers = new SourceBankTransferRepository(pool);
    expect((await transfers.options(ctx, { company_id: company })).fx_policy_configured).toBe(true);
    let op = await transfers.create(
      ctx,
      {
        company_id: company,
        approver_user_id: "r06.checker",
        posting_date: "2026-11-20",
        lines: [
          {
            line_order: 1,
            document_date: "2026-11-20",
            from_bank_account_id: source.id,
            to_bank_account_id: destination.bank_account_id!,
            external_reference: randomUUID(),
            transfer_mode: "internal",
            details: "Isolated initialized-company transfer",
            source_amount: "100.00",
            bank_charge_amount: "0",
          },
        ],
      },
      randomUUID(),
      randomUUID(),
    );
    op = await transfers.submit(ctx, op.id, { expected_version: op.version }, randomUUID(), randomUUID());
    await expect(
      transfers.decide(
        ctx,
        op.id,
        { action: "approve", expected_version: op.version, reason: "Maker cannot self approve" },
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const actor = (userId: string): FinanceNominalActorContext => ({
      ...ctx,
      actor: { ...ctx.actor, userId, roles: [] },
    });
    op = await transfers.decide(
      actor("r06.checker"),
      op.id,
      { action: "approve", expected_version: op.version, reason: "Independent transfer review" },
      randomUUID(),
      randomUUID(),
    );
    op = await transfers.post(actor("r06.target"), op.id, { expected_version: op.version }, randomUUID(), randomUUID());
    expect(op.state).toBe("posted");
    const balances = (
      await pool.query(
        `select l.account_id,sum(l.base_debit-l.base_credit)::numeric(38,2)::text balance from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed') and l.account_id=any($3::text[]) group by l.account_id order by l.account_id`,
        [tenant, company, [source.account_id, destination.id]],
      )
    ).rows;
    expect(new Map(balances.map((r) => [r.account_id, r.balance]))).toEqual(
      new Map([
        [source.account_id, "300.00"],
        [destination.id, "100.00"],
      ]),
    );
    const report = await new SubledgerReports(new SourceSubledgerRepository(pool)).run(
      ctx,
      subledgerReportQuerySchema.parse({ company_id: company, as_of: "2026-11-30", report: "trial_balance" }),
    );
    expect(report.reconciliation.every((row) => row.difference === "0.00")).toBe(true);
  });
  it("preserves a subsequently governed treasury policy exactly when setup is repeated", async () => {
    const setup = companies.get("non_profit")!.setup;
    const current = (
      await pool.query("select * from bank_transfer_fx_policy where tenant_id=$1 and company_id=$2", [
        tenant,
        setup.company_id,
      ])
    ).rows[0];
    await new SourceFinanceCurrencyRepository(pool).upsertPolicy(
      ctx,
      {
        company_id: setup.company_id,
        expected_version: 1,
        fx_gain_nominal_id: current.fx_gain_nominal_id,
        fx_loss_nominal_id: current.fx_loss_nominal_id,
        rounding_nominal_id: current.rounding_nominal_id,
        bank_charge_nominal_id: current.bank_charge_nominal_id,
        rounding_tolerance: "0.01",
        reason: "Explicit synthetic treasury review",
      },
      randomUUID(),
      randomUUID(),
    );
    const before = (
      await pool.query("select * from bank_transfer_fx_policy where tenant_id=$1 and company_id=$2", [
        tenant,
        setup.company_id,
      ])
    ).rows[0];
    await repo.initializeBusiness(ctx, businessSetupInputSchema.strip().parse(setup), randomUUID(), randomUUID());
    expect(
      (
        await pool.query("select * from bank_transfer_fx_policy where tenant_id=$1 and company_id=$2", [
          tenant,
          setup.company_id,
        ])
      ).rows[0],
    ).toEqual(before);
  });
  it("retains a pre-existing treasury policy unchanged during first-time company initialization", async () => {
    const company = `treasury-preserved-${randomUUID()}`;
    const request = { ...input("corporate"), company_id: company };
    await pool.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,$3,'active')",
      [tenant, company, request.company_name],
    );
    await pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.override-admin',$3,false,'r06.override-admin','governed_administration','isolated-treasury-preservation-test')",
      [tenant, randomUUID(), company],
    );
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      await pool.query(
        "insert into account(tenant_id,company_id,id,code,name,type,is_header,status,manual_posting_allowed,created_at) values($1,$2,$3,$4,$4,$5,false,'active',true,clock_timestamp())",
        [tenant, company, id, `LEGACY-${index}`, index === 0 ? "revenue" : "expense"],
      );
    }
    const before = (
      await pool.query(
        "insert into bank_transfer_fx_policy(tenant_id,company_id,id,fx_gain_nominal_id,fx_loss_nominal_id,rounding_nominal_id,bank_charge_nominal_id,rounding_tolerance,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,0.02,'r06.override-admin','r06.override-admin') returning *",
        [tenant, company, randomUUID(), ...ids],
      )
    ).rows[0];
    await repo.initializeBusiness(ctx, request, randomUUID(), randomUUID());
    expect(
      (
        await pool.query("select * from bank_transfer_fx_policy where tenant_id=$1 and company_id=$2", [
          tenant,
          company,
        ])
      ).rows,
    ).toEqual([before]);
    expect(
      (await pool.query("select 1 from journal_entry where tenant_id=$1 and company_id=$2", [tenant, company]))
        .rowCount,
    ).toBe(0);
  });
  it("preserves existing header IDs and supports a database-configured 2002 Cash & Bank section", async () => {
    const raw: unknown = JSON.parse(
      await readFile(new URL("../../packages/db/catalogs/business-natures-v1.json", import.meta.url), "utf8"),
    );
    if (!Array.isArray(raw)) throw new Error("Invalid test catalogue");
    const original = raw
      .map((item) => importChartTemplateRequestSchema.parse(item))
      .find((item) => item.business_nature_key === "it_software")!;
    const manifest = importChartTemplateRequestSchema.parse({
      ...original,
      revision: `bank-2002-${randomUUID()}`,
      initialization_roles: { ...original.initialization_roles, cash_and_bank_section: "2002" },
      sections: original.sections.map((section) => (section.code === "2309" ? { ...section, code: "2002" } : section)),
      nominals: original.nominals.map((nominal) =>
        nominal.section_code === "2309"
          ? { ...nominal, section_code: "2002", code: "2002" + nominal.code.slice(4) }
          : nominal,
      ),
    });
    const imported = await repo.import(ctx, manifest, randomUUID(), randomUUID());
    await repo.publish(ctx, imported.template.id, { expected_version: 1 }, randomUUID(), randomUUID());
    const company = `preserved-${randomUUID()}`,
      category = `existing-category-${randomUUID()}`,
      section = `existing-section-${randomUUID()}`;
    await pool.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic existing chart','active')",
      [tenant, company],
    );
    await pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.override-admin',$3,false,'r06.override-admin','governed_administration','isolated-preservation-test')",
      [tenant, randomUUID(), company],
    );
    await pool.query(
      `insert into account(tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at)
      values($1,$2,$3,'CAT-987','Current Assets','asset',null,true,'active',false,now()),($1,$2,$4,'2002','Cash and Bank','asset',$3,true,'active',false,now())`,
      [tenant, company, category, section],
    );
    const request = { ...input("it_software"), company_id: company, company_name: "Synthetic existing chart" };
    const concurrent = await Promise.all([
      repo.initializeBusiness(ctx, request, randomUUID(), randomUUID()),
      repo.initializeBusiness(ctx, request, randomUUID(), randomUUID()),
    ]);
    expect(concurrent.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(
      (
        await pool.query("select id from account where tenant_id=$1 and company_id=$2 and name='Current Assets'", [
          tenant,
          company,
        ])
      ).rows,
    ).toEqual([{ id: category }]);
    expect(
      (
        await pool.query("select id from account where tenant_id=$1 and company_id=$2 and code='2002'", [
          tenant,
          company,
        ])
      ).rows,
    ).toEqual([{ id: section }]);
    const bank = await new SourceFinanceNominalRepository(pool).create(
      ctx,
      {
        nominal_kind: "bank",
        company_id: company,
        category_id: category,
        section_id: section,
        name: "Bank Accounts",
        currency: "PKR",
        chart_template_id: imported.template.id,
        chart_node_key: "nominal:200202",
      },
      randomUUID(),
      randomUUID(),
    );
    expect(bank.code).toBe("200202");
    expect(bank.state).toBe("active");
    const custom = await new SourceFinanceNominalRepository(pool).create(
      ctx,
      {
        nominal_kind: "bank",
        company_id: company,
        category_id: category,
        section_id: section,
        name: "Synthetic additional bank",
        currency: "PKR",
      },
      randomUUID(),
      randomUUID(),
    );
    expect(custom.code).toBe("200204");
  });
  it("enforces company and tenant RLS under a non-bypass database role", async () => {
    const role = `business_setup_rls_${randomUUID().replaceAll("-", "")}`;
    if (!/^business_setup_rls_[a-f0-9]{32}$/.test(role)) throw new Error("Invalid isolated test role");
    const client = await pool.connect();
    try {
      await pool.query(`create role ${role} nologin nosuperuser nobypassrls`);
      await pool.query(`grant select on finance_company_business_setup,security_user_company_access to ${role}`);
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await client.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.override-admin',true)",
        [tenant],
      );
      expect(
        (await client.query("select company_id from finance_company_business_setup")).rowCount,
      ).toBeGreaterThanOrEqual(3);
      await client.query("select set_config('nexora.user_id','r06.restricted',true)");
      expect((await client.query("select company_id from finance_company_business_setup")).rowCount).toBe(0);
      await client.query(
        "select set_config('nexora.tenant_id','foreign-business-test-tenant',true),set_config('nexora.user_id','r06.override-admin',true)",
      );
      expect((await client.query("select company_id from finance_company_business_setup")).rowCount).toBe(0);
      await client.query("rollback");
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
      await pool.query(`revoke all on finance_company_business_setup,security_user_company_access from ${role}`);
      await pool.query(`drop role ${role}`);
    }
  });
  it("persists setup through the HTTP API and serves the same chart through Finance", async () => {
    const session = {
      sessionId: "isolated-api-session",
      tenantId: tenant,
      userId: ctx.actor.userId,
      csrfToken: "t".repeat(43),
      idleExpiresAt: new Date("2099-01-01"),
      absoluteExpiresAt: new Date("2099-01-01"),
    };
    // Authentication transport is synthetic; all live company permissions,
    // repositories, constraints, chart writes and HTTP contracts are real.
    const authentication = { loadAuthenticatedAccount: async () => ctx.actor } as unknown as TenantAuthApiService;
    const sessions = {
      get: async () => session,
      authorizeMutation: async (_token: string, csrf: string) =>
        csrf === session.csrfToken ? { status: "ok" as const, session } : { status: "invalid_csrf" as const },
    } as unknown as TenantSessionApiService;
    const app = createApp({
      config: { allowedOrigins: new Set(["https://isolated-business.example.invalid"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: authentication,
      sessionService: sessions,
      businessSetupRepository: repo,
      financeNominalRepository: new SourceFinanceNominalRepository(pool),
    });
    const body = input("non_profit"),
      key = randomUUID();
    const created = await request(app)
      .post("/api/v1/finance/business_setup")
      .set("cookie", "nexora_session=isolated")
      .set("origin", "https://isolated-business.example.invalid")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", key)
      .send(body);
    expect(created.status).toBe(201);
    const setup = created.body.setup;
    expect(
      (
        await request(app)
          .get(`/api/v1/finance/business_setup?company_id=${encodeURIComponent(setup.company_id)}`)
          .set("cookie", "nexora_session=isolated")
      ).body.setup,
    ).toEqual(setup);
    const chart = await request(app)
      .get(`/api/v1/finance/nominals?company_id=${encodeURIComponent(setup.company_id)}`)
      .set("cookie", "nexora_session=isolated");
    expect(chart.status).toBe(200);
    expect(chart.body.items.some((nominal: { name: string }) => nominal.name === "Donations and Grants")).toBe(true);
    expect(
      (
        await pool.query("select count(*)::int n from account where tenant_id=$1 and company_id=$2 and is_header", [
          tenant,
          setup.company_id,
        ])
      ).rows[0].n,
    ).toBe(14);
  });
});
