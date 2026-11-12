import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import request from "supertest";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import {
  productInputSchema,
  productQuerySchema,
  productLookupQuerySchema,
  supplierInputSchema,
  warehouseInputSchema,
  stockTransferInputSchema,
  inventoryDirectoryQuerySchema,
} from "../../packages/contracts/src/index.js";
import {
  SourceInventoryRepository,
  type InventoryContext,
} from "../../server/api/src/modules/inventory/source-repository.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SourceReferenceMasterRepository } from "../../server/api/src/modules/master-data/source-repository.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import {
  ensureSourceAuthorizationFixture,
  sourceTestTenantId as tenant,
  sourceTestCompanyId as company,
} from "./source-security-fixture.js";

const bootstrapUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  suite = bootstrapUrl ? describe : describe.skip,
  database = `inventory_products_${randomUUID().replaceAll("-", "")}`;
const permissions = [
  "inventory.item.read",
  "inventory.item.create",
  "procurement.vendor.create",
  "inventory.bin.read",
  "inventory.bin.create",
  "inventory.stock.read",
  "master_data.location.manage",
];
const ctx: InventoryContext = {
  tenantId: tenant,
  actor: {
    tenantId: tenant,
    userId: "r06.maker",
    organizationName: "Synthetic company",
    displayName: "Maker",
    email: "inventory@example.invalid",
    roles: ["inventory_tester"],
    permissions,
    sessionVersion: 1,
  },
};
const key = () => randomUUID(),
  input = (name = "Synthetic valve") =>
    productInputSchema.parse({
      company_id: company,
      name,
      currency: "USD",
      sale_price: "12.50",
      opening_quantity: "3.2500",
      opening_rate: "2.50",
      opening_date: "2026-11-05",
    });
suite("Persisted Inventory products", () => {
  let bootstrap: DatabasePool, pool: DatabasePool, repo: SourceInventoryRepository;
  let locationId: string, warehouseA: string, warehouseB: string, stockProduct: string;
  beforeAll(async () => {
    if (!bootstrapUrl || !["127.0.0.1", "localhost"].includes(new URL(bootstrapUrl).hostname))
      throw new Error("Explicit local test database required");
    expect(database).toMatch(/^inventory_products_[a-f0-9]{32}$/);
    bootstrap = createDatabasePool(bootstrapUrl);
    await bootstrap.query(`create database ${database}`);
    const target = new URL(bootstrapUrl);
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
    for (const [id, type] of [
      ["inventory-stock", "asset"],
      ["inventory-income", "revenue"],
      ["inventory-expense", "expense"],
    ])
      await pool.query(
        "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,$1,$1,$4,false,'active',now()) on conflict do nothing",
        [id, tenant, company, type],
      );
    repo = new SourceInventoryRepository(pool);
    locationId = (
      await new SourceReferenceMasterRepository(pool).create(
        ctx,
        "locations",
        { company_id: company, name: "Synthetic city" },
        key(),
        key(),
      )
    ).record.id;
  }, 120_000);
  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${database}`);
      await bootstrap.end();
    }
  });
  it("persists the complete combined form, automatic code and exact decimals without posting stock or GL", async () => {
    const vendor = (
      await new SourceProcurementRepository(pool).saveSupplier(
        ctx,
        null,
        supplierInputSchema.parse({ company_id: company, name: "Synthetic preferred vendor" }),
        key(),
        key(),
      )
    ).record;
    const result = await repo.save(
      ctx,
      null,
      {
        ...input(),
        category: "Valves",
        barcode: "VALVE-001",
        unit: "Pcs",
        preferred_supplier_id: vendor.id,
        stock_account_id: "inventory-stock",
        income_account_id: "inventory-income",
        expense_account_id: "inventory-expense",
        sales_description: "Sale details",
        purchase_description: "Purchase details",
        notes: "Internal notes",
        low_stock_level: "2.5",
        bin_location: "A-01",
        sales_tax: "18",
        purchase_tax: "17",
        non_filer_tax: "20",
        sale_discount: "2",
        purchase_discount: "3",
        weight: "0.2500",
        large_pack_size: "12",
        small_pack_size: "1",
      },
      key(),
      key(),
    );
    expect(result.record.code).toBe("PRD-001");
    expect(result.record.version).toBe(1);
    expect(result.record.on_hand_quantity).toBeNull();
    expect(result.record.preferred_supplier_name).toBe(vendor.name);
    expect(result.record.opening_quantity).toBe("3.2500");
    expect((await repo.get(ctx, company, result.record.id)).barcode).toBe("VALVE-001");
    expect((await pool.query("select count(*)::int as count from journal_entry")).rows[0].count).toBe(0);
    expect(
      (
        await pool.query("select count(*)::int as count from inventory_product_change where product_id=$1", [
          result.record.id,
        ])
      ).rows[0].count,
    ).toBe(1);
  });
  it("replays identical requests and rejects reusing a key with changed data", async () => {
    const idempotency = key(),
      payload = input("Replay product"),
      created = await repo.save(ctx, null, payload, idempotency, key());
    expect(await repo.save(ctx, null, payload, idempotency, key())).toEqual(created);
    await expect(repo.save(ctx, null, { ...payload, name: "Changed" }, idempotency, key())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
  it("serializes concurrent code allocation and never reuses inactive codes", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, n) => repo.save(ctx, null, input(`Concurrent ${n}`), key(), key())),
    );
    expect(new Set(results.map((r) => r.record.code)).size).toBe(4);
    const first = results[0]!.record;
    await repo.save(
      ctx,
      first.id,
      { ...input(first.name), status: "inactive", expected_version: first.version },
      key(),
      key(),
    );
    const next = (await repo.save(ctx, null, input("After inactive"), key(), key())).record;
    expect(Number(next.code.slice(4))).toBeGreaterThan(Math.max(...results.map((r) => Number(r.record.code.slice(4)))));
  });
  it("rejects stale updates and retains identity on edit", async () => {
    const before = (await repo.save(ctx, null, input("Edit product"), key(), key())).record;
    const updated = await repo.save(ctx, before.id, { ...input("Edited product"), expected_version: 1 }, key(), key());
    expect(updated.record.code).toBe(before.code);
    expect(updated.record.version).toBe(2);
    await expect(repo.save(ctx, before.id, { ...input(), expected_version: 1 }, key(), key())).rejects.toMatchObject({
      code: "PRODUCT_VERSION_CONFLICT",
    });
  });
  it("enforces barcode uniqueness, valid references, account role and company currency", async () => {
    await expect(repo.save(ctx, null, { ...input(), barcode: "valve-001" }, key(), key())).rejects.toMatchObject({
      code: "PRODUCT_DUPLICATE",
    });
    for (const patch of [
      { preferred_supplier_id: "missing-vendor" },
      { stock_account_id: "r06-uat-bank-operating-usd" },
      { income_account_id: "inventory-stock" },
      { expense_account_id: "missing-account" },
      { currency: "EUR" },
    ])
      await expect(repo.save(ctx, null, { ...input(), ...patch }, key(), key())).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await repo.lookups(ctx, productLookupQuerySchema.parse({ company_id: company, kind: "stock_account" }))
      ).items.map((a) => a.id),
    ).not.toContain("r06-uat-bank-operating-usd");
  });
  it("bounds searches and binds continuation to tenant, company and filters", async () => {
    const page = await repo.list(ctx, productQuerySchema.parse({ company_id: company, limit: 2 }));
    expect(page.items).toHaveLength(2);
    expect(page.next_cursor).toBeTruthy();
    const second = await repo.list(
      ctx,
      productQuerySchema.parse({ company_id: company, limit: 2, cursor: page.next_cursor }),
    );
    expect(second.items.some((p) => page.items.some((first) => first.id === p.id))).toBe(false);
    await expect(
      repo.list(
        ctx,
        productQuerySchema.parse({ company_id: company, limit: 2, search: "other", cursor: page.next_cursor }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect((await repo.list(ctx, productQuerySchema.parse({ company_id: company, search: "%" }))).items).toHaveLength(
      0,
    );
  });
  it("checks live company policy, tenant identity and impersonation on every request including retries", async () => {
    await expect(
      repo.list({ ...ctx, tenantId: "different" }, productQuerySchema.parse({ company_id: company })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.list(ctx, productQuerySchema.parse({ company_id: "nexora-r06-uat-company-two" })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.save({ ...ctx, realActorId: "admin" }, null, input(), key(), key())).rejects.toMatchObject({
      code: "IMPERSONATION_RESTRICTED",
    });
    const retryKey = key(),
      payload = input("Revoked retry");
    await repo.save(ctx, null, payload, retryKey, key());
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='inventory.item.create'",
      [tenant],
    );
    try {
      await expect(repo.save(ctx, null, payload, retryKey, key())).rejects.toMatchObject({ status: 403 });
    } finally {
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker','inventory.item.create','company',$2)",
        [tenant, company],
      );
    }
  });
  it("requires immutable audit evidence and prevents deletion", async () => {
    const product = (await repo.save(ctx, null, input("Audit product"), key(), key())).record;
    await expect(
      pool.query("delete from inventory_product where tenant_id=$1 and id=$2", [tenant, product.id]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query("update inventory_product_change set action='saved' where tenant_id=$1 and product_id=$2", [
        tenant,
        product.id,
      ]),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      pool.query(
        "update inventory_product set name='Unaudited',row_version=row_version+1 where tenant_id=$1 and id=$2",
        [tenant, product.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("protects API writes with session, CSRF, origin, If-Match and strict contracts", async () => {
    const session = {
      tenantId: tenant,
      userId: ctx.actor.userId,
      sessionId: "synthetic-inventory",
      csrfToken: "synthetic-csrf",
      idleExpiresAt: new Date(),
      absoluteExpiresAt: new Date(),
    };
    // Only session restoration is simulated; policy authorization and all product persistence use real PostgreSQL.
    const authentication = { loadAuthenticatedAccount: async () => ctx.actor } as TenantAuthApiService;
    const sessions = {
      get: async () => session,
      authorizeMutation: async (_token: string, csrf: string) =>
        csrf === session.csrfToken ? { status: "ok", session } : { status: "invalid_csrf" },
    } as TenantSessionApiService;
    const app = createApp({
      config: { allowedOrigins: new Set(["https://erp.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: authentication,
      sessionService: sessions,
      inventoryRepository: repo,
    });
    expect((await request(app).get(`/api/v1/inventory/products?company_id=${company}`)).status).toBe(401);
    expect(
      (
        await request(app)
          .get(`/api/v1/inventory/products?company_id=${company}&unexpected=true`)
          .set("cookie", "nexora_session=synthetic")
      ).status,
    ).toBe(400);
    const post = () =>
      request(app)
        .post("/api/v1/inventory/products")
        .set("cookie", "nexora_session=synthetic")
        .set("idempotency-key", key());
    expect((await post().send(input())).status).toBe(403);
    expect(
      (await post().set("origin", "https://untrusted.invalid").set("x-csrf-token", session.csrfToken).send(input()))
        .status,
    ).toBe(403);
    const created = await post().set("x-csrf-token", session.csrfToken).send(input("API product"));
    expect(created.status).toBe(201);
    const update = () =>
      request(app)
        .patch(`/api/v1/inventory/products/${created.body.record.id}`)
        .set("cookie", "nexora_session=synthetic")
        .set("idempotency-key", key())
        .set("x-csrf-token", session.csrfToken);
    expect((await update().send({ ...input(), expected_version: 1 })).status).toBe(412);
    expect(
      (
        await update()
          .set("if-match", '"1"')
          .send({ ...input("API edited"), expected_version: 1 })
      ).status,
    ).toBe(200);
    for (const resource of ["warehouses", "transfers"]) {
      expect((await request(app).get(`/api/v1/inventory/${resource}?company_id=${company}`)).status).toBe(401);
      expect(
        (
          await request(app)
            .get(`/api/v1/inventory/${resource}?company_id=${company}`)
            .set("cookie", "nexora_session=synthetic")
        ).status,
      ).toBe(200);
    }
  });
  it("creates audited warehouses linked to organization identity and real location", async () => {
    const payload = warehouseInputSchema.parse({
        company_id: company,
        name: "Main warehouse",
        location_id: locationId,
        address: "Synthetic address",
        contact_name: "Store keeper",
      }),
      requestKey = key();
    const first = await repo.saveWarehouse(ctx, null, payload, requestKey, key());
    warehouseA = first.record.id;
    expect(first.record.code).toMatch(/^WH-\d{3,}$/);
    expect(first.record.location_name).toBe("Synthetic city");
    expect(await repo.saveWarehouse(ctx, null, payload, requestKey, key())).toEqual(first);
    warehouseB = (
      await repo.saveWarehouse(
        ctx,
        null,
        warehouseInputSchema.parse({ company_id: company, name: "Second warehouse" }),
        key(),
        key(),
      )
    ).record.id;
    const organization = (
      await pool.query("select type,parent_id,code,name from organization_unit where tenant_id=$1 and id=$2", [
        tenant,
        warehouseA,
      ])
    ).rows[0];
    expect(organization).toEqual({
      type: "warehouse",
      parent_id: company,
      code: first.record.code,
      name: "Main warehouse",
    });
    await expect(
      repo.saveWarehouse(ctx, warehouseA, { ...payload, expected_version: 99 }, key(), key()),
    ).rejects.toMatchObject({ code: "WAREHOUSE_VERSION_CONFLICT" });
    const changed = await repo.saveWarehouse(
      ctx,
      warehouseA,
      { ...payload, name: "Updated main warehouse", expected_version: 1 },
      key(),
      key(),
    );
    expect(changed.record.version).toBe(2);
    expect((await repo.getWarehouse(ctx, company, warehouseA)).name).toBe("Updated main warehouse");
    expect(
      (
        await repo.warehouses(
          ctx,
          inventoryDirectoryQuerySchema.parse({ company_id: company, search: "Synthetic city" }),
        )
      ).items.map((w) => w.id),
    ).toContain(warehouseA);
  });
  it("persists manufacture, location, warehouse and income/expense defaults", async () => {
    const record = (
      await repo.save(
        ctx,
        null,
        {
          ...input("Manufactured stock product"),
          manufacture_enabled: true,
          location_id: locationId,
          default_warehouse_id: warehouseA,
          income_account_id: "inventory-income",
          expense_account_id: "inventory-expense",
        },
        key(),
        key(),
      )
    ).record;
    stockProduct = record.id;
    expect(record.manufacture_enabled).toBe(true);
    expect(record.location_name).toBe("Synthetic city");
    expect(record.default_warehouse_name).toBe("Updated main warehouse");
    expect(record.income_account_id).toBe("inventory-income");
    expect((await repo.get(ctx, company, record.id)).expense_account_id).toBe("inventory-expense");
    await expect(repo.save(ctx, null, { ...input(), location_id: "missing" }, key(), key())).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      repo.save(ctx, null, { ...input(), default_warehouse_id: "missing" }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("saves and edits exact transfer quantities as unposted drafts with immutable line evidence", async () => {
    const payload = stockTransferInputSchema.parse({
        company_id: company,
        from_warehouse_id: warehouseA,
        to_warehouse_id: warehouseB,
        transfer_date: "2026-11-05",
        lines: [{ product_id: stockProduct, quantity: "2.1250" }],
      }),
      requestKey = key();
    const saved = await repo.saveTransfer(ctx, null, payload, requestKey, key());
    expect(saved.record.code).toBe("ST-001");
    expect(saved.record.posted).toBe(false);
    expect(saved.record.lines[0]?.quantity).toBe("2.1250");
    expect(await repo.saveTransfer(ctx, null, payload, requestKey, key())).toEqual(saved);
    const edited = await repo.saveTransfer(
      ctx,
      saved.record.id,
      { ...payload, lines: [{ product_id: stockProduct, quantity: "1.5000" }], expected_version: 1 },
      key(),
      key(),
    );
    expect(edited.record.version).toBe(2);
    expect((await repo.getTransfer(ctx, company, saved.record.id)).lines[0]?.quantity).toBe("1.5000");
    await expect(
      repo.saveTransfer(ctx, saved.record.id, { ...payload, expected_version: 1 }, key(), key()),
    ).rejects.toMatchObject({ code: "TRANSFER_VERSION_CONFLICT" });
    await expect(
      pool.query("update inventory_transfer_line set quantity=9 where tenant_id=$1 and transfer_id=$2", [
        tenant,
        saved.record.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    expect((await pool.query("select count(*)::int as count from journal_entry")).rows[0].count).toBe(0);
    expect(
      (await repo.transfers(ctx, inventoryDirectoryQuerySchema.parse({ company_id: company, search: "ST-001" }))).items,
    ).toHaveLength(1);
  });
  it("rejects invalid warehouses, service lines and missing stock authority", async () => {
    const payload = stockTransferInputSchema.parse({
      company_id: company,
      from_warehouse_id: warehouseA,
      to_warehouse_id: warehouseB,
      transfer_date: "2026-11-05",
      lines: [{ product_id: stockProduct, quantity: "1" }],
    });
    await expect(
      repo.saveTransfer(ctx, null, { ...payload, to_warehouse_id: "missing" }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
    const service = (
      await repo.save(
        ctx,
        null,
        {
          ...input("Service product"),
          type: "service",
          track_inventory: false,
          opening_quantity: "0",
          manufacture_enabled: false,
        },
        key(),
        key(),
      )
    ).record;
    await expect(
      repo.saveTransfer(ctx, null, { ...payload, lines: [{ product_id: service.id, quantity: "1" }] }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      repo.saveTransfer(
        {
          ...ctx,
          actor: { ...ctx.actor, permissions: ctx.actor.permissions.filter((p) => p !== "inventory.stock.read") },
        },
        null,
        payload,
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.getWarehouse(ctx, "nexora-r06-uat-company-two", warehouseA)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      Promise.resolve().then(() =>
        repo.lookups(
          ctx,
          productLookupQuerySchema.parse({ company_id: company, surface: "warehouses", kind: "income_account" }),
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await repo.saveWarehouse(
      ctx,
      warehouseB,
      warehouseInputSchema.parse({
        company_id: company,
        name: "Second warehouse",
        status: "inactive",
        expected_version: 1,
      }),
      key(),
      key(),
    );
    await expect(repo.saveTransfer(ctx, null, payload, key(), key())).rejects.toMatchObject({ status: 409 });
    await expect(
      pool.query("update organization_unit set name='Unaudited' where tenant_id=$1 and id=$2", [tenant, warehouseA]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
