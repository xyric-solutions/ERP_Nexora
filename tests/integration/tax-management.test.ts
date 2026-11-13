import { randomUUID, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { taxQuerySchema, type TaxInput } from "../../packages/contracts/src/finance/taxes.js";
import {
  savePurchaseRequestSchema,
  supplierInputSchema,
  type PurchaseDocument,
  type PurchaseKind,
} from "../../packages/contracts/src/procurement/index.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";
import type { SubledgerInput } from "../../packages/contracts/src/finance/subledger.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor } from "./subledger-fixture.js";
import { ensureSourceSuperAdministratorFixture } from "./source-security-fixture.js";
import { SourceTaxRepository } from "../../server/api/src/modules/finance/taxes/source-repository.js";
import { resolveTax } from "../../server/api/src/modules/finance/taxes/resolver.js";

const permissions = ["finance.tax.read", "finance.tax.manage", "finance.tax_mapping.admin"];
const actor = (admin = false) => ({
  ...subledgerActor(admin ? "r06.override-admin" : "r06.maker"),
  actor: {
    ...subledgerActor(admin ? "r06.override-admin" : "r06.maker").actor,
    roles: admin ? ["super_administrator"] : [],
    permissions: [...subledgerActor().actor.permissions, ...permissions],
  },
});
const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("unified tax configuration and accounting", () => {
  let f: Awaited<ReturnType<typeof setupSubledgerFixture>>, repo: SourceTaxRepository, close: () => Promise<void>;
  beforeAll(async () => {
    const database = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = database.close;
    f = await setupSubledgerFixture(database.pool);
    repo = new SourceTaxRepository(f.pool);
    await ensureSourceSuperAdministratorFixture(f.pool);
    await f.pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.override-admin',$3,false,'r06.last-admin-a','governed_administration','disposable-tax-fixture')",
      [f.tenant, randomUUID(), f.company],
    );
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-approval-override"]) {
      await f.pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, permissions],
      );
      await f.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$4 from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, permissions, f.company],
      );
    }
    for (const type of ["asset", "liability"])
      await f.pool.query(
        "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$4,$4,$5,false,'active',now())",
        [`${f.company}-tax-${type}`, f.tenant, f.company, `tax-${type}`, type],
      );
  }, 60000);
  afterAll(async () => {
    await close?.();
  });
  const input = (extra: Partial<TaxInput> = {}): TaxInput => ({
    company_id: f.company,
    name: "WHT supplies",
    tax_type: "WHT",
    rate: "5.50",
    description: "Synthetic test tax",
    module: "purchases",
    treatment: "withholding",
    trigger: "settlement",
    account_id: `${f.company}-tax-liability`,
    effective_date: "2026-09-01",
    status: "active",
    reason: "Configure isolated tax",
    ...extra,
  });
  async function post(input: SubledgerInput) {
    let op = await f.repository.create(subledgerActor(), input, randomUUID());
    for (const [action, user] of [
      ["submit", "r06.maker"],
      ["approve", "r06.checker"],
      ["post", "r06.target"],
    ] as const)
      op = await f.repository.action(
        subledgerActor(user),
        op.id,
        { company_id: f.company, expected_version: op.version, action, reason: "Independent tax test" },
        randomUUID(),
      );
    return op;
  }
  it("persists definitions, idempotency, immutable revisions and full filtered totals", async () => {
    const key = randomUUID(),
      created = await repo.save(actor(true), input(), key);
    expect(created.code).toBe("TAX-001");
    expect(await repo.save(actor(true), input(), key)).toEqual(created);
    await expect(repo.save(actor(true), input({ rate: "6" }), key)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    const updated = await repo.save(
      actor(true),
      { ...input({ rate: "6.00", effective_date: "2026-10-01" }), expected_version: 1 },
      randomUUID(),
      created.id,
    );
    expect(updated.history.map((row) => row.rate)).toEqual(["6.00", "5.50"]);
    await repo.save(actor(true), input({ name: "Second tax" }), randomUUID());
    const list = await repo.list(actor(), taxQuerySchema.parse({ company_id: f.company, limit: 1 }));
    expect(list.items).toHaveLength(1);
    expect(list.total).toBe(2);
    await expect(
      repo.save(actor(true), { ...input(), expected_version: 1 }, randomUUID(), created.id),
    ).rejects.toMatchObject({ code: "TAX_VERSION_CONFLICT" });
  });
  it("requires live admin authority and rejects wrong-role, company and control mappings", async () => {
    await expect(repo.save(actor(), input(), randomUUID())).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.save({ ...actor(), actor: { ...actor().actor, roles: ["super_administrator"] } }, input(), randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.save(actor(true), input({ account_id: f.policy.payable_account_id }), randomUUID()),
    ).rejects.toMatchObject({ code: "TAX_CONFLICT" });
    await expect(
      repo.save(actor(true), input({ account_id: `${f.company}-tax-asset` }), randomUUID()),
    ).rejects.toMatchObject({ code: "TAX_CONFLICT" });
    await expect(repo.list(actor(), taxQuerySchema.parse({ company_id: "different-company" }))).rejects.toMatchObject({
      status: 403,
    });
    expect((await repo.options(actor(), taxQuerySchema.parse({ company_id: f.company }))).can_manage).toBe(false);
  });
  it("resolves historical effective revisions and rejects inactive/context-mismatched taxes", async () => {
    const created = await repo.save(actor(true), input({ name: "Historical tax" }), randomUUID());
    await repo.save(
      actor(true),
      { ...input({ rate: "7.00", effective_date: "2026-10-01" }), expected_version: 1 },
      randomUUID(),
      created.id,
    );
    const resolve = (date: string, module: "sales" | "purchases" = "purchases") =>
      repo.transaction(actor(), f.company, false, (client) =>
        resolveTax(client, {
          tenant: f.tenant,
          company: f.company,
          definition: created.id,
          date,
          module,
          trigger: "settlement",
          currency: "USD",
          precision: 2,
          basis: "1000.00",
        }),
      );
    expect((await resolve("2026-09-20")).amount).toBe("55.00");
    expect((await resolve("2026-10-20")).amount).toBe("70.00");
    await expect(resolve("2026-09-20", "sales")).rejects.toMatchObject({ code: "TAX_VALIDATION_FAILED" });
    await repo.status(
      actor(true),
      created.id,
      { company_id: f.company, expected_version: 2, status: "inactive", reason: "Retire test definition" },
      randomUUID(),
    );
    await expect(resolve("2026-09-20")).rejects.toMatchObject({ code: "TAX_VALIDATION_FAILED" });
    expect((await repo.get(actor(), f.company, created.id)).history).toHaveLength(2);
  });
  it("posts governed sales/output and purchase/input taxes to real GL accounts with immutable applications", async () => {
    for (const side of ["receivable", "payable"] as const) {
      const tax = await repo.save(
        actor(true),
        input({
          module: side === "receivable" ? "sales" : "purchases",
          treatment: side === "receivable" ? "output" : "recoverable",
          trigger: "recognition",
          account_id: `${f.company}-tax-${side === "receivable" ? "liability" : "asset"}`,
        }),
        randomUUID(),
      );
      const party = await f.repository.createParty(
        subledgerActor(),
        {
          company_id: f.company,
          name: "Tax accounting party",
          kind: side === "receivable" ? "customer" : "supplier",
          default_currency: "USD",
        },
        randomUUID(),
      );
      const op = await post({
        type: "recognition",
        company_id: f.company,
        date: "2026-09-20",
        due_date: "2026-09-20",
        reference: "Governed tax",
        reason: "Test real tax accounting",
        side,
        kind: "invoice",
        party_id: party.id,
        currency: "USD",
        amount: "1000.00",
        monetary: true,
        tax_definition_id: tax.id,
      });
      expect(op.preview!.item!.original_amount).toBe("1055.00");
      const lines = await f.pool.query<{ debit: string; credit: string }>(
        "select debit::text,credit::text from journal_line where tenant_id=$1 and journal_id=$2 and account_id=$3",
        [f.tenant, op.journal_id, tax.account_id],
      );
      expect(Number(lines.rows[0]![side === "receivable" ? "credit" : "debit"])).toBe(55);
      expect(
        (
          await f.pool.query("select 1 from finance_tax_application where tenant_id=$1 and source_id=$2", [
            f.tenant,
            op.id,
          ])
        ).rowCount,
      ).toBe(1);
      await expect(
        repo.save(
          actor(true),
          {
            ...input({
              module: tax.module,
              treatment: tax.treatment,
              trigger: tax.trigger,
              account_id: tax.account_id,
            }),
            expected_version: 1,
          },
          randomUUID(),
          tax.id,
        ),
      ).rejects.toMatchObject({ code: "TAX_VALIDATION_FAILED" });
      await repo.status(
        actor(true),
        tax.id,
        { company_id: f.company, expected_version: 1, status: "inactive", reason: "Retire after use" },
        randomUUID(),
      );
      await post({
        type: "reversal",
        company_id: f.company,
        date: "2026-09-21",
        reference: "Reverse tax",
        reason: "Exact compensation",
        operation_id: op.id,
      });
      expect(
        (
          await f.pool.query<{ amount: string }>(
            "select sum(amount)::text as amount from finance_tax_application where tenant_id=$1 and definition_id=$2",
            [f.tenant, tax.id],
          )
        ).rows[0]!.amount,
      ).toMatch(/^0(?:\.0+)?$/);
    }
  });
  it("withholds 5.5% from a supplier settlement without reducing payable relief or double-counting FX", async () => {
    const tax = await repo.save(actor(true), input(), randomUUID());
    const party = await f.repository.createParty(
      subledgerActor(),
      { company_id: f.company, name: "Withholding supplier", kind: "supplier", default_currency: "USD" },
      randomUUID(),
    );
    const invoice = await post({
      type: "recognition",
      company_id: f.company,
      date: "2026-09-22",
      due_date: "2026-09-22",
      reference: "Gross supplier bill",
      reason: "Prepare withholding bill",
      side: "payable",
      kind: "invoice",
      party_id: party.id,
      currency: "USD",
      amount: "1000.00",
      monetary: true,
    });
    const settled = await post({
      type: "settlement",
      company_id: f.company,
      date: "2026-09-23",
      reference: "Net supplier payment",
      reason: "Withhold supplier tax",
      side: "payable",
      party_id: party.id,
      bank_account_id: f.banks.USD!,
      payment_currency: "USD",
      payment_amount: "945.00",
      bank_fee: "0",
      tax_definition_id: tax.id,
      allocations: [{ item_id: invoice.preview!.item!.id, amount: "1000.00" }],
    });
    expect(settled.preview!.taxes[0]!.amount).toBe("55.00");
    expect(settled.preview!.realized_gain).toBe("0.00");
    const lines = await f.pool.query<{ account_id: string; debit: string; credit: string }>(
      "select account_id,debit::text,credit::text from journal_line where tenant_id=$1 and journal_id=$2",
      [f.tenant, settled.journal_id],
    );
    expect(Number(lines.rows.find((row) => row.account_id === f.policy.payable_account_id)!.debit)).toBe(1000);
    expect(Number(lines.rows.find((row) => row.account_id === tax.account_id)!.credit)).toBe(55);
    expect(Number(lines.rows.find((row) => row.account_id === `${f.company}-bank-USD`)!.credit)).toBe(945);
  });
  it("reconciles cross-currency withholding, partial residuals and exact reversal", async () => {
    const tax = await repo.save(actor(true), input(), randomUUID());
    const party = await f.repository.createParty(
      subledgerActor(),
      { company_id: f.company, name: "Cross withholding supplier", kind: "supplier", default_currency: "USD" },
      randomUUID(),
    );
    const recognize = (amount: string, date: string) =>
      post({
        type: "recognition",
        company_id: f.company,
        date,
        due_date: date,
        reference: "Cross supplier bill",
        reason: "Governed tax currency test",
        side: "payable",
        kind: "invoice",
        party_id: party.id,
        currency: "USD",
        amount,
        monetary: true,
      });
    const invoice = await recognize("1000.00", "2026-09-24");
    const settlement = await post({
      type: "settlement",
      company_id: f.company,
      date: "2026-09-25",
      reference: "Cross bank payment",
      reason: "Tax and bank rates",
      side: "payable",
      party_id: party.id,
      bank_account_id: f.banks.EUR!,
      payment_currency: "EUR",
      payment_amount: "882.00",
      bank_fee: "0",
      tax_definition_id: tax.id,
      allocations: [{ item_id: invoice.preview!.item!.id, amount: "1000.00" }],
    });
    expect(settlement.preview!.realized_gain).toBe("0.00");
    const dealt = await recognize("100.00", "2026-09-25");
    const bankDeal = await post({
      type: "settlement",
      company_id: f.company,
      date: "2026-09-26",
      reference: "Quoted bank conversion",
      reason: "Withholding at an explicit bank deal",
      side: "payable",
      party_id: party.id,
      bank_account_id: f.banks.EUR!,
      payment_currency: "EUR",
      payment_amount: "85.05",
      bank_fee: "1",
      conversion_rate: "0.9",
      conversion_reference: "Synthetic bank deal evidence",
      tax_definition_id: tax.id,
      allocations: [{ item_id: dealt.preview!.item!.id, amount: "100.00" }],
    });
    expect(bankDeal.preview!.realized_gain).toBe("945.00");
    expect(bankDeal.preview!.rounding).toBe("0.00");
    expect(bankDeal.preview!.fx_by_item[0]!.realized).toBe("945.00");
    const small = await recognize("0.10", "2026-09-26");
    const halves = [];
    for (const date of ["2026-09-27", "2026-09-28"])
      halves.push(
        await post({
          type: "settlement",
          company_id: f.company,
          date,
          reference: "Partial tax",
          reason: "Cumulative withholding residue",
          side: "payable",
          party_id: party.id,
          bank_account_id: f.banks.USD!,
          payment_currency: "USD",
          payment_amount: date.endsWith("27") ? "0.05" : "0.04",
          bank_fee: "0",
          tax_definition_id: tax.id,
          allocations: [{ item_id: small.preview!.item!.id, amount: "0.05" }],
        }),
      );
    expect(halves.map((op) => op.preview!.taxes[0]!.amount)).toEqual(["0.00", "0.01"]);
    await post({
      type: "reversal",
      company_id: f.company,
      date: "2026-09-29",
      reference: "Reverse partial",
      reason: "Exact withholding compensation",
      operation_id: halves[1]!.id,
    });
    const application = (
      await f.pool.query<{ basis: string; amount: string }>(
        "select sum(basis)::text as basis,sum(amount)::text as amount from finance_tax_application where tenant_id=$1 and source_line=$2",
        [f.tenant, small.preview!.item!.id],
      )
    ).rows[0]!;
    expect(Number(application.basis)).toBe(0.05);
    expect(Number(application.amount)).toBe(0);
  });
  it("rejects direct non-admin mapping writes, immutable history edits and revoked live authority", async () => {
    const tax = await repo.save(actor(true), input({ name: "Security evidence tax" }), randomUUID());
    await expect(
      f.pool.query(
        `insert into finance_subledger_policy(tenant_id,company_id,version,receivable_account_id,payable_account_id,revenue_account_id,expense_account_id,realized_gain_account_id,realized_loss_account_id,unrealized_gain_account_id,unrealized_loss_account_id,created_by)
      select tenant_id,company_id,version+100,receivable_account_id,$3,revenue_account_id,expense_account_id,realized_gain_account_id,realized_loss_account_id,unrealized_gain_account_id,unrealized_loss_account_id,created_by from finance_subledger_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1`,
        [f.tenant, f.company, tax.account_id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const flags = (
      await f.pool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        "select relrowsecurity,relforcerowsecurity from pg_class where relname=any($1::text[])",
        [
          [
            "finance_tax_definition",
            "finance_tax_revision",
            "finance_tax_mapping_rule",
            "finance_tax_sequence",
            "finance_tax_audit",
            "finance_tax_idempotency",
            "finance_tax_application",
          ],
        ],
      )
    ).rows;
    expect(flags).toHaveLength(7);
    expect(flags.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const client = await f.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.maker',true)",
        [f.tenant],
      );
      await expect(
        client.query(
          "update finance_tax_definition set version=version+1 where tenant_id=$1 and company_id=$2 and id=$3",
          [f.tenant, f.company, tax.id],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback");
      await expect(
        client.query(
          "update finance_tax_revision set rate=9 where tenant_id=$1 and company_id=$2 and definition_id=$3",
          [f.tenant, f.company, tax.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        client.query("delete from finance_tax_audit where tenant_id=$1 and company_id=$2 and definition_id=$3", [
          f.tenant,
          f.company,
          tax.id,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("rollback");
      client.release();
    }
    await f.pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-approval-override' and permission_key='finance.tax_mapping.admin' and scope_kind='company' and scope_value=$2",
      [f.tenant, f.company],
    );
    try {
      await expect(
        repo.status(
          actor(true),
          tax.id,
          { company_id: f.company, expected_version: 1, status: "inactive", reason: "Reject revoked authority" },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await f.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override','finance.tax_mapping.admin','company',$2)",
        [f.tenant, f.company],
      );
    }
  });
  it("carries governed purchase-line mappings through request/order/receipt/bill and real supplier accounting", async () => {
    const tax = await repo.save(
      actor(true),
      input({
        name: "Governed input tax",
        rate: "10.00",
        treatment: "recoverable",
        trigger: "recognition",
        account_id: `${f.company}-tax-asset`,
      }),
      randomUUID(),
    );
    const permissions = [
      "procurement.document.read",
      "procurement.document.create",
      "procurement.document.action",
      "procurement.document.submit",
      "procurement.document.approve",
      "procurement.vendor.read",
      "procurement.vendor.create",
    ];
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"]) {
      await f.pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, permissions],
      );
      await f.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$4 from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, permissions, f.company],
      );
    }
    const prep = {
      ...subledgerActor(),
      actor: { ...subledgerActor().actor, permissions: [...subledgerActor().actor.permissions, ...permissions] },
    };
    const review = {
      ...subledgerActor("r06.checker"),
      actor: {
        ...subledgerActor("r06.checker").actor,
        permissions: [...subledgerActor().actor.permissions, ...permissions],
      },
    };
    const procurement = new SourceProcurementRepository(
      f.pool,
      new SupplierProfileCrypto(randomBytes(32).toString("base64"), "test-tax"),
    );
    const vendor = (
      await procurement.saveSupplier(
        prep,
        null,
        supplierInputSchema.parse({ company_id: f.company, name: "Governed bill vendor" }),
        randomUUID(),
        randomUUID(),
      )
    ).record;
    let source: PurchaseDocument | undefined, order: PurchaseDocument | undefined;
    for (const kind of ["request", "rfq", "order", "receipt", "bill"] as PurchaseKind[]) {
      let document = (
        await procurement.save(
          prep,
          null,
          savePurchaseRequestSchema.parse({
            company_id: f.company,
            kind,
            supplier_id: ["request", "rfq"].includes(kind) ? null : vendor.id,
            approver_id: "r06.checker",
            source_id: (kind === "bill" ? order : source)?.id ?? null,
            invited_supplier_ids: kind === "rfq" ? [vendor.id] : [],
            document_date: "2026-09-29",
            currency: "USD",
            reference: `GOV-${kind}`,
            lines: [
              {
                source_line_id: (kind === "bill" ? order : source)?.lines[0]?.id ?? null,
                item_code: "GOV-ITEM",
                description: "Governed exact line tax",
                quantity: "1.005",
                uom: "Each",
                unit_price: "1.00",
                tax_percent: "99",
                tax_definition_id: tax.id,
              },
            ],
          }),
          randomUUID(),
          randomUUID(),
        )
      ).record;
      expect(document.lines[0]!.tax_percent).toBe("10.00");
      expect(document.lines[0]!.tax_snapshot!.amount).toBe("0.10");
      for (const [who, action] of [
        [prep, "submit"],
        [review, "approve"],
      ] as const)
        document = (
          await procurement.action(
            who,
            document.id,
            { company_id: f.company, expected_version: document.version, action, reason: "Review governed tax source" },
            randomUUID(),
            randomUUID(),
          )
        ).record;
      source = document;
      if (kind === "order") order = document;
    }
    const party = await f.repository.createParty(
      subledgerActor(),
      {
        company_id: f.company,
        name: vendor.name,
        kind: "supplier",
        default_currency: "USD",
        source_supplier_id: vendor.id,
      },
      randomUUID(),
    );
    const operation = await post({
      type: "recognition",
      company_id: f.company,
      date: "2026-09-30",
      due_date: "2026-09-30",
      reference: "Governed approved bill",
      reason: "Preserve exact source tax mappings",
      side: "payable",
      kind: "invoice",
      party_id: party.id,
      currency: "USD",
      amount: "1.01",
      source_document_id: source!.id,
      monetary: true,
    });
    expect(operation.preview!.item!.original_amount).toBe("1.11");
    expect(operation.preview!.taxes[0]!.account_id).toBe(tax.account_id);
    expect(operation.preview!.taxes[0]!.amount).toBe("0.10");
    await expect(
      f.repository.create(
        subledgerActor(),
        {
          ...operation.input,
          type: "recognition",
          side: "payable",
          kind: "invoice",
          party_id: party.id,
          currency: "USD",
          amount: "1.01",
          due_date: "2026-09-30",
          monetary: true,
          source_document_id: source!.id,
          tax_amount: "0.10",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "SUBLEDGER_VALIDATION_FAILED" });
  });

  it("enforces tax RLS for a non-owner database role with wrong-company and wrong-tenant sessions", async () => {
    const role = `tax_rls_${randomUUID().replaceAll("-", "")}`;
    const client = await f.pool.connect();
    try {
      await client.query(`create role ${role} nologin noinherit nobypassrls`);
      await client.query(`grant usage on schema public to ${role}`);
      await client.query(`grant select on finance_tax_definition,security_user_company_access to ${role}`);
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await client.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.maker',true)",
        [f.tenant],
      );
      expect(
        (await client.query("select count(*)::integer as total from finance_tax_definition")).rows[0].total,
      ).toBeGreaterThan(0);
      await client.query("select set_config('nexora.user_id','r06.last-admin-b',true)");
      expect((await client.query("select count(*)::integer as total from finance_tax_definition")).rows[0].total).toBe(
        0,
      );
      await client.query(
        "select set_config('nexora.tenant_id','another-tenant',true),set_config('nexora.user_id','r06.maker',true)",
      );
      expect((await client.query("select count(*)::integer as total from finance_tax_definition")).rows[0].total).toBe(
        0,
      );
    } finally {
      await client.query("rollback");
      await client.query(`drop owned by ${role}`);
      await client.query(`drop role ${role}`);
      client.release();
    }
  });
  it("allocates unique codes concurrently and rejects a stale approved tax operation without financial effects", async () => {
    const definitions = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        repo.save(actor(true), input({ name: `Concurrent tax ${index}` }), randomUUID()),
      ),
    );
    expect(new Set(definitions.map((tax) => tax.code)).size).toBe(4);
    const key = randomUUID(),
      payload = input({ name: "Concurrent replay" });
    const replays = await Promise.all([repo.save(actor(true), payload, key), repo.save(actor(true), payload, key)]);
    expect(replays[0]!.id).toBe(replays[1]!.id);
    const tax = await repo.save(
      actor(true),
      input({ module: "sales", treatment: "output", trigger: "recognition", name: "Reviewed tax definition" }),
      randomUUID(),
    );
    const party = await f.repository.createParty(
      subledgerActor(),
      { company_id: f.company, name: "Stale tax customer", kind: "customer", default_currency: "USD" },
      randomUUID(),
    );
    let operation = await f.repository.create(
      subledgerActor(),
      {
        type: "recognition",
        company_id: f.company,
        date: "2026-10-01",
        due_date: "2026-10-01",
        reference: "Stale mapping test",
        reason: "Review tax authority",
        side: "receivable",
        kind: "invoice",
        party_id: party.id,
        currency: "USD",
        amount: "100",
        monetary: true,
        tax_definition_id: tax.id,
      },
      randomUUID(),
    );
    for (const [action, user] of [
      ["submit", "r06.maker"],
      ["approve", "r06.checker"],
    ] as const)
      operation = await f.repository.action(
        subledgerActor(user),
        operation.id,
        { company_id: f.company, action, expected_version: operation.version, reason: "Independent source review" },
        randomUUID(),
      );
    await repo.status(
      actor(true),
      tax.id,
      { company_id: f.company, expected_version: 1, status: "inactive", reason: "Revoke tax before posting" },
      randomUUID(),
    );
    await expect(
      f.repository.action(
        subledgerActor("r06.target"),
        operation.id,
        { company_id: f.company, action: "post", expected_version: operation.version, reason: "Reject stale mapping" },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "TAX_VALIDATION_FAILED" });
    expect(
      (
        await f.pool.query(
          "select 1 from finance_tax_application where tenant_id=$1 and company_id=$2 and source_id=$3",
          [f.tenant, f.company, operation.id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await f.pool.query(
          "select 1 from finance_subledger_item where tenant_id=$1 and company_id=$2 and operation_id=$3",
          [f.tenant, f.company, operation.id],
        )
      ).rowCount,
    ).toBe(0);
  });
  it("posts invoice-stage WHT once and prevents a second deduction at settlement", async () => {
    const tax = await repo.save(
      actor(true),
      input({ name: "Invoice-stage withholding", trigger: "recognition" }),
      randomUUID(),
    );
    const atSettlement = await repo.save(actor(true), input({ name: "Settlement-stage withholding" }), randomUUID());
    const party = await f.repository.createParty(
      subledgerActor(),
      { company_id: f.company, name: "Invoice WHT supplier", kind: "supplier", default_currency: "USD" },
      randomUUID(),
    );
    const invoice = await post({
      type: "recognition",
      company_id: f.company,
      date: "2026-10-03",
      due_date: "2026-10-03",
      reference: "Invoice-stage WHT",
      reason: "Map invoice-stage liability",
      side: "payable",
      kind: "invoice",
      party_id: party.id,
      currency: "USD",
      amount: "1000",
      monetary: true,
      tax_definition_id: tax.id,
    });
    expect(invoice.preview!.item!.original_amount).toBe("945.00");
    expect(invoice.preview!.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: f.policy.expense_account_id, debit: "1000.00" }),
        expect.objectContaining({ accountId: tax.account_id, credit: "55.00" }),
      ]),
    );
    const payment = {
      type: "settlement" as const,
      company_id: f.company,
      date: "2026-10-04",
      reference: "Pay net invoice",
      reason: "Do not withhold twice",
      side: "payable" as const,
      party_id: party.id,
      bank_account_id: f.banks.USD!,
      payment_currency: "USD",
      payment_amount: "945.00",
      bank_fee: "0",
      allocations: [{ item_id: invoice.preview!.item!.id, amount: "945.00" }],
    };
    await expect(
      f.repository.create(subledgerActor(), { ...payment, tax_definition_id: atSettlement.id }, randomUUID()),
    ).rejects.toMatchObject({ code: "SUBLEDGER_VALIDATION_FAILED" });
    expect((await post(payment)).preview!.realized_gain).toBe("0.00");
  });
});
