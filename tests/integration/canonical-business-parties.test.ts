import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  supplierInputSchema,
  savePurchaseInputSchema,
  subledgerQuerySchema,
  subledgerReportQuerySchema,
  subledgerSupplierQuerySchema,
  type SubledgerRequest,
} from "../../packages/contracts/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SubledgerReports } from "../../server/api/src/modules/finance/subledger/reports.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor } from "./subledger-fixture.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("Canonical business-party masters", () => {
  let f: Awaited<ReturnType<typeof setupSubledgerFixture>>;
  let close: () => Promise<void>;
  let purchasing: SourceProcurementRepository;
  const vendorPermissions = [
    "procurement.vendor.create",
    "procurement.vendor.read",
    "procurement.document.create",
    "procurement.document.read",
  ];
  const maker = () => {
    const actor = subledgerActor();
    actor.actor.permissions = [...actor.actor.permissions, ...vendorPermissions];
    return actor;
  };
  beforeAll(async () => {
    const db = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = db.close;
    f = await setupSubledgerFixture(db.pool, undefined, "USD");
    purchasing = new SourceProcurementRepository(db.pool);
    await db.pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,'r06-uat-policy-maker',p,'all' from unnest($2::text[]) p on conflict do nothing",
      [f.tenant, vendorPermissions],
    );
    await db.pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,'r06-uat-policy-maker',p,'company',$3 from unnest($2::text[]) p on conflict do nothing",
      [f.tenant, vendorPermissions, f.company],
    );
  }, 60000);
  afterAll(async () => {
    await close?.();
  });

  const financial = (
    name: string,
    kind: "customer" | "supplier" = "customer",
    source_supplier_id?: string,
    key = randomUUID(),
  ) =>
    f.repository.createParty(
      subledgerActor(),
      {
        company_id: f.company,
        name,
        kind,
        default_currency: "USD",
        ...(source_supplier_id ? { source_supplier_id } : {}),
      },
      key,
    );
  const vendor = async (name: string, tax_id = "") =>
    (
      await purchasing.saveSupplier(
        maker(),
        null,
        supplierInputSchema.parse({ company_id: f.company, name, tax_id }),
        randomUUID(),
        randomUUID(),
      )
    ).record;
  const workspace = () =>
    f.repository.workspace(
      subledgerActor(),
      subledgerQuerySchema.parse({ company_id: f.company, as_of: "2026-11-30" }),
    );

  it("creates a company-owned canonical customer and replays its exact master reference", async () => {
    const key = randomUUID();
    const customer = await financial("Canonical customer", "customer", undefined, key);
    expect(await financial("Canonical customer", "customer", undefined, key)).toEqual(customer);
    expect(customer.canonical_party_id).toBe(customer.id);
    expect(
      (
        await f.pool.query("select company_id,type,name from party where tenant_id=$1 and id=$2", [
          f.tenant,
          customer.canonical_party_id,
        ])
      ).rows[0],
    ).toEqual({ company_id: f.company, type: "customer", name: customer.name });
  });

  it("links an explicit Purchasing master once, including retries with a different key", async () => {
    const supplier = await vendor("Explicit supplier");
    const a = await financial(supplier.name, "supplier", supplier.id);
    const b = await financial(supplier.name, "supplier", supplier.id);
    expect(b).toEqual(a);
    expect(a.canonical_party_id).toBe(supplier.id);
    expect(a.source_supplier_id).toBe(supplier.id);
    expect(
      (
        await f.pool.query(
          "select count(*)::integer as n from finance_party_master_link where tenant_id=$1 and company_id=$2 and canonical_party_id=$3",
          [f.tenant, f.company, supplier.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("creates a reviewable inactive Purchasing profile without widening Finance permissions", async () => {
    const supplier = await financial("Finance-origin supplier", "supplier");
    const row = (
      await f.pool.query(
        "select id,name,status,row_version from procurement_supplier where tenant_id=$1 and company_id=$2 and id=$3",
        [f.tenant, f.company, supplier.canonical_party_id],
      )
    ).rows[0];
    expect(row).toMatchObject({ id: supplier.canonical_party_id, status: "inactive", row_version: 1 });
    await expect(
      purchasing.saveSupplier(
        subledgerActor("r06.target"),
        row.id,
        supplierInputSchema.parse({ company_id: f.company, name: row.name, status: "active", expected_version: 1 }),
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    await expect(
      purchasing.save(
        maker(),
        null,
        savePurchaseInputSchema.parse({
          company_id: f.company,
          kind: "order",
          document_date: "2026-10-20",
          currency: "USD",
          supplier_id: row.id,
          lines: [
            {
              description: "Synthetic service",
              item_code: "",
              quantity: "1",
              unit_price: "1",
              tax_percent: "0",
              uom: "Each",
              source_line_id: null,
            },
          ],
        }),
        randomUUID(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "SUPPLIER_INELIGIBLE" });
    const activated = await purchasing.saveSupplier(
      maker(),
      row.id,
      supplierInputSchema.parse({ company_id: f.company, name: row.name, status: "active", expected_version: 1 }),
      randomUUID(),
      randomUUID(),
    );
    expect(activated.record.id).toBe(supplier.canonical_party_id);
    expect(activated.record.status).toBe("active");
  });

  it("rejects case/whitespace duplicate customers without leaving additional records", async () => {
    await financial("Identity Match Customer");
    await expect(financial("identity   match customer")).rejects.toMatchObject({
      code: "PARTY_IDENTITY_EXISTS",
      status: 409,
    });
    expect(
      (
        await f.pool.query(
          "select count(*)::integer as n from party where tenant_id=$1 and company_id=$2 and type='customer' and erp_party_identity_key(name)='identity match customer'",
          [f.tenant, f.company],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("rejects cross-module duplicate suppliers and duplicate tax IDs", async () => {
    await financial("Shared identity vendor", "supplier");
    await expect(vendor("shared   IDENTITY vendor")).rejects.toMatchObject({ code: "PARTY_IDENTITY_EXISTS" });
    const existing = await vendor("Purchase-origin identity", "TAX-UNIQUE-1");
    await expect(financial(existing.name, "supplier")).rejects.toMatchObject({ code: "PARTY_IDENTITY_EXISTS" });
    await expect(vendor("Another legal display", "tax-unique-1")).rejects.toMatchObject({
      code: "PARTY_IDENTITY_EXISTS",
    });
    expect((await financial(existing.name, "supplier", existing.id)).canonical_party_id).toBe(existing.id);
  });

  it("allows only one identity under simultaneous Finance/Purchasing creation", async () => {
    const results = await Promise.allSettled([financial("Concurrent master", "supplier"), vendor("Concurrent master")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (
        await f.pool.query(
          "select count(*)::integer as n from party where tenant_id=$1 and company_id=$2 and name='Concurrent master'",
          [f.tenant, f.company],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it("returns bounded company supplier identities without exposing profiles", async () => {
    const supplier = await vendor("Search supplier 100% exact");
    const directory = await f.repository.supplierMasters(
      subledgerActor(),
      subledgerSupplierQuerySchema.parse({ company_id: f.company, search: "100% exact", limit: 1 }),
    );
    expect(directory.total).toBe(1);
    expect(directory.items).toEqual([
      { id: supplier.id, name: supplier.name, code: supplier.code, status: "active", risk_status: "normal" },
    ]);
    expect(JSON.stringify(directory)).not.toContain("bank_accounts");
    expect(
      (
        await f.repository.supplierMasters(
          subledgerActor(),
          subledgerSupplierQuerySchema.parse({ company_id: f.company, search: "100_ exact" }),
        )
      ).items,
    ).toEqual([]);
  });

  it("rejects unauthorized directory reads and forged company/role supplier references", async () => {
    await expect(
      f.repository.supplierMasters(
        subledgerActor(),
        subledgerSupplierQuerySchema.parse({ company_id: "unpermitted-company" }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const denied = subledgerActor();
    denied.actor.permissions = [];
    await expect(
      f.repository.supplierMasters(denied, subledgerSupplierQuerySchema.parse({ company_id: f.company })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(financial("Missing supplier", "supplier", "not-in-company")).rejects.toMatchObject({ status: 409 });
    const supplier = await vendor("Wrong role supplier");
    await expect(financial(supplier.name, "customer", supplier.id)).rejects.toMatchObject({ status: 409 });
  });

  it("keeps identity codes and duplicate candidates scoped to the company", async () => {
    const one = await financial("Shared display across companies");
    const other = await setupSubledgerFixture(f.pool, undefined, "USD");
    const two = await other.repository.createParty(
      subledgerActor(),
      { company_id: other.company, kind: "customer", name: one.name, default_currency: "USD" },
      randomUUID(),
    );
    expect(two.id).not.toBe(one.id);
    expect(two.code).toBe("CUS-001");
    expect((await workspace()).parties.some((p) => p.id === two.id)).toBe(false);
    const foreign = await other.repository.createParty(
      subledgerActor(),
      { company_id: other.company, kind: "supplier", name: "Foreign master", default_currency: "USD" },
      randomUUID(),
    );
    await expect(financial(foreign.name, "supplier", foreign.canonical_party_id)).rejects.toMatchObject({
      status: 409,
    });
  });

  async function post(input: SubledgerRequest) {
    let operation = await f.repository.create(subledgerActor(), input, randomUUID());
    for (const [actor, action] of [
      ["r06.maker", "submit"],
      ["r06.checker", "approve"],
      ["r06.target", "post"],
    ] as const) {
      operation = await f.repository.action(
        subledgerActor(actor),
        operation.id,
        { company_id: f.company, expected_version: operation.version, action, reason: "Canonical master regression" },
        randomUUID(),
      );
    }
    return operation;
  }

  it("projects supplier renames and status while retaining immutable financial snapshots and balanced reversals", async () => {
    let supplier = await vendor("Original master label");
    const account = await financial(supplier.name, "supplier", supplier.id);
    const input: SubledgerRequest = {
      company_id: f.company,
      type: "recognition",
      side: "payable",
      party_id: account.id,
      kind: "invoice",
      currency: "USD",
      amount: "25",
      date: "2026-10-20",
      due_date: "2026-11-20",
      monetary: true,
      reference: "Master reference invoice",
      reason: "Canonical identity accounting regression",
    };
    const invoice = await post(input);
    const journalBefore = (
      await f.pool.query(
        "select md5(jsonb_agg(to_jsonb(l) order by id)::text) as hash from journal_line l where tenant_id=$1 and journal_id=$2",
        [f.tenant, invoice.journal_id],
      )
    ).rows[0].hash;
    supplier = (
      await purchasing.saveSupplier(
        maker(),
        supplier.id,
        supplierInputSchema.parse({
          company_id: f.company,
          name: "Renamed shared supplier",
          status: "inactive",
          expected_version: supplier.version,
        }),
        randomUUID(),
        randomUUID(),
      )
    ).record;
    expect((await workspace()).parties.find((p) => p.id === account.id)).toMatchObject({
      name: supplier.name,
      status: "inactive",
      canonical_party_id: supplier.id,
    });
    expect(
      (
        await f.pool.query("select name from finance_subledger_party where tenant_id=$1 and company_id=$2 and id=$3", [
          f.tenant,
          f.company,
          account.id,
        ])
      ).rows[0].name,
    ).toBe("Original master label");
    expect(
      (
        await f.pool.query(
          "select md5(jsonb_agg(to_jsonb(l) order by id)::text) as hash from journal_line l where tenant_id=$1 and journal_id=$2",
          [f.tenant, invoice.journal_id],
        )
      ).rows[0].hash,
    ).toBe(journalBefore);
    await expect(f.repository.create(subledgerActor(), input, randomUUID())).rejects.toMatchObject({ status: 409 });
    await post({
      company_id: f.company,
      type: "reversal",
      operation_id: invoice.id,
      date: "2026-10-21",
      reference: "Inactive master reversal",
      reason: "Compensate the original journal",
    });
    const report = await new SubledgerReports(f.repository).run(
      subledgerActor(),
      subledgerReportQuerySchema.parse({ company_id: f.company, as_of: "2026-11-30", report: "trial_balance" }),
    );
    expect(report.reconciliation.every((row) => Number(row.difference) === 0)).toBe(true);
  });

  it("prevents reassigning a canonical binding or business company", async () => {
    const customer = await financial("Immutable binding customer");
    await expect(
      f.pool.query(
        "update finance_party_master_link set canonical_party_id=financial_party_id where tenant_id=$1 and financial_party_id=$2",
        [f.tenant, customer.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      f.pool.query("update party set company_id=null where tenant_id=$1 and id=$2", [
        f.tenant,
        customer.canonical_party_id,
      ]),
    ).rejects.toMatchObject({ code: "23514", constraint: "erp_party_identity" });
    expect(await migrateSourceSchema(f.pool)).toEqual([]);
  });
  it("enforces master and binding RLS under a non-owner database role", async () => {
    const role = `canonical_test_${randomUUID().replaceAll("-", "")}`;
    const client = await f.pool.connect();
    try {
      await client.query(`create role ${role} nologin`);
      await client.query(`grant usage on schema public to ${role}`);
      await client.query(`grant select on all tables in schema public to ${role}`);
      await client.query("begin");
      await client.query(`set local role ${role}`);
      await client.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.restricted',true)",
        [f.tenant],
      );
      expect((await client.query("select id from party where company_id=$1", [f.company])).rowCount).toBe(0);
      expect(
        (await client.query("select id from finance_party_directory where company_id=$1", [f.company])).rowCount,
      ).toBe(0);
      expect(
        (await client.query("select * from finance_party_master_link where company_id=$1", [f.company])).rowCount,
      ).toBe(0);
      await client.query("select set_config('nexora.user_id','r06.maker',true)");
      expect(
        (await client.query("select id from finance_party_directory where company_id=$1", [f.company])).rowCount,
      ).toBeGreaterThan(0);
      await client.query("select set_config('nexora.tenant_id','foreign-tenant',true)");
      expect((await client.query("select id from finance_party_directory")).rowCount).toBe(0);
    } finally {
      await client.query("rollback");
      await client.query(`drop owned by ${role}`);
      await client.query(`drop role ${role}`);
      client.release();
    }
  });
  it("rolls back unaudited financial supplier onboarding and rejects direct duplicate master inserts", async () => {
    const id = randomUUID();
    const client = await f.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.maker',true)",
        [f.tenant],
      );
      await client.query(
        "insert into finance_subledger_party(tenant_id,company_id,id,kind,code,name,default_currency,created_by) values($1,$2,$3,'supplier',$3,'Unaudited onboarding probe','USD','r06.maker')",
        [f.tenant, f.company, id],
      );
      await expect(client.query("commit")).rejects.toMatchObject({
        code: "23514",
        message: "Immutable purchase audit evidence required",
      });
    } finally {
      await client.query("rollback");
      client.release();
    }
    expect((await f.pool.query("select id from party where tenant_id=$1 and id=$2", [f.tenant, id])).rowCount).toBe(0);
    expect(
      (await f.pool.query("select id from finance_subledger_party where tenant_id=$1 and id=$2", [f.tenant, id]))
        .rowCount,
    ).toBe(0);
    await expect(
      f.pool.query(
        "insert into party(id,tenant_id,company_id,type,code,name,status,risk_status,created_at) values($1,$2,$3,'customer',$1,'canonical   CUSTOMER','active','normal',clock_timestamp())",
        [randomUUID(), f.tenant, f.company],
      ),
    ).rejects.toMatchObject({ code: "23514", constraint: "erp_party_duplicate" });
  });
});
