import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor, subledgerPermissions } from "./subledger-fixture.js";
import { SourceInventoryRepository } from "../../server/api/src/modules/inventory/source-repository.js";
import { SourceManufacturingRepository } from "../../server/api/src/modules/manufacturing/source-repository.js";
import {
  productInputSchema,
  warehouseInputSchema,
  bomInputSchema,
  productionPlanInputSchema,
  manufacturingOrderInputSchema,
} from "../../packages/contracts/src/index.js";
const permissions = [
    ...subledgerPermissions,
    "inventory.item.read",
    "inventory.item.create",
    "inventory.category.manage",
    "inventory.bin.create",
    "inventory.bin.read",
    "manufacturing.bom.read",
    "manufacturing.bom.create",
    "manufacturing.bom.update",
    "manufacturing.plan.read",
    "manufacturing.plan.create",
    "manufacturing.plan.convert",
    "manufacturing.order.read",
    "manufacturing.order.create",
    "manufacturing.order.approve",
  ],
  key = () => randomUUID();
const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("Managed categories and frozen BOM material requirements", () => {
  let db: Awaited<ReturnType<typeof createDisposableSourceDatabase>>,
    fixture: Awaited<ReturnType<typeof setupSubledgerFixture>>,
    inventory: SourceInventoryRepository,
    mfg: SourceManufacturingRepository,
    raw: string,
    finished: string,
    warehouse: string;
  const actor = () => ({
    ...subledgerActor("r06.maker"),
    actor: { ...subledgerActor("r06.maker").actor, permissions },
  });
  beforeAll(async () => {
    db = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    fixture = await setupSubledgerFixture(db.pool, undefined, "USD");
    inventory = new SourceInventoryRepository(db.pool);
    mfg = new SourceManufacturingRepository(db.pool);
    for (const permission of permissions) {
      await db.pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-maker',$2,'all') on conflict do nothing",
        [fixture.tenant, permission],
      );
      await db.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker',$2,'company',$3) on conflict do nothing",
        [fixture.tenant, permission, fixture.company],
      );
    }
    for (const manufacture of [false, true]) {
      const p = (
        await inventory.save(
          actor(),
          null,
          productInputSchema.parse({
            company_id: fixture.company,
            category_id: `category-fixture-${fixture.company}`,
            name: manufacture ? "Reviewed finished output" : "Reviewed raw material",
            currency: "USD",
            manufacture_enabled: manufacture,
          }),
          key(),
          key(),
        )
      ).record;
      if (manufacture) finished = p.id;
      else raw = p.id;
    }
    warehouse = (
      await inventory.saveWarehouse(
        actor(),
        null,
        warehouseInputSchema.parse({ company_id: fixture.company, name: "Material requirement warehouse" }),
        key(),
        key(),
      )
    ).record.id;
  }, 120000);
  afterAll(async () => {
    await db?.close();
  });
  it("requires actual categories, prevents duplicate identities, preserves inactive references and rejects forged company links", async () => {
    const input = {
        company_id: fixture.company,
        name: "Finished Goods",
        status: "active" as const,
        reason: "Owner-authorized acceptance setup",
      },
      request = key();
    const saved = await inventory.categories.save(actor(), null, input, request, key());
    expect(saved.record.code).toBe("CAT-002");
    expect((await inventory.categories.save(actor(), null, input, request, key())).record.id).toBe(saved.record.id);
    await expect(
      inventory.categories.save(actor(), null, { ...input, name: " finished   goods " }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      inventory.save(
        actor(),
        null,
        productInputSchema.parse({ company_id: fixture.company, name: "Missing category", currency: "USD" }),
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_CATEGORY_REQUIRED" });
    await expect(
      inventory.save(
        actor(),
        null,
        productInputSchema.parse({
          company_id: fixture.company,
          name: "Foreign category",
          currency: "USD",
          category_id: "category-fixture-nexora-r06-uat-company",
        }),
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_CATEGORY_INVALID" });
    const product = (
      await inventory.save(
        actor(),
        null,
        productInputSchema.parse({
          company_id: fixture.company,
          name: "Categorized output",
          currency: "USD",
          category_id: saved.record.id,
        }),
        key(),
        key(),
      )
    ).record;
    const inactive = await inventory.categories.save(
      actor(),
      saved.record.id,
      { ...input, status: "inactive", expected_version: 1 },
      key(),
      key(),
    );
    expect(inactive.record.status).toBe("inactive");
    await expect(
      inventory.save(
        actor(),
        null,
        productInputSchema.parse({
          company_id: fixture.company,
          name: "Inactive category",
          currency: "USD",
          category_id: saved.record.id,
        }),
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_CATEGORY_INVALID" });
    const {
      id,
      code,
      version,
      preferred_supplier_name,
      stock_account_name,
      income_account_name,
      expense_account_name,
      location_name,
      default_warehouse_name,
      on_hand_quantity,
      created_at,
      updated_at,
      ...fields
    } = product;
    void code;
    void preferred_supplier_name;
    void stock_account_name;
    void income_account_name;
    void expense_account_name;
    void location_name;
    void default_warehouse_name;
    void on_hand_quantity;
    void created_at;
    void updated_at;
    expect(
      (
        await inventory.save(
          actor(),
          id,
          productInputSchema.parse({ ...fields, expected_version: version, name: "Retained inactive reference" }),
          key(),
          key(),
        )
      ).record.category_id,
    ).toBe(saved.record.id);
    expect(
      (
        await inventory.list(actor(), {
          company_id: fixture.company,
          search: "",
          category_id: saved.record.id,
          limit: 30,
        })
      ).items.map((p) => p.id),
    ).toEqual([id]);
    const noGrant = { ...actor(), actor: { ...actor().actor, userId: "r06.target" } };
    await expect(
      inventory.categories.save(noGrant, null, { ...input, name: "Forged live permission" }, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    const runtimeRole = `bom_read_${key().replaceAll("-", "")}`;
    await db.pool.query(`create role ${runtimeRole} nologin nosuperuser nobypassrls`);
    await db.pool.query(`grant select on inventory_product_category,security_user_company_access to ${runtimeRole}`);
    const connection = await db.pool.connect();
    try {
      await connection.query("begin");
      await connection.query(`set local role ${runtimeRole}`);
      await connection.query(
        "select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','unassigned-user',true)",
        [fixture.tenant],
      );
      expect((await connection.query("select count(*)::int n from inventory_product_category")).rows[0].n).toBe(0);
      await connection.query("rollback");
    } finally {
      await connection.query("rollback");
      connection.release();
      await db.pool.query(
        `revoke select on inventory_product_category,security_user_company_access from ${runtimeRole}`,
      );
      await db.pool.query(`drop role ${runtimeRole}`);
    }
  });
  it("fetches proportional requirements and stock shortages then preserves the exact snapshot through conversion and approval", async () => {
    const bom = (
      await mfg.saveBom(
        actor(),
        null,
        bomInputSchema.parse({
          company_id: fixture.company,
          product_id: finished,
          template_name: "Approved recipe layout",
          warehouse_id: warehouse,
          output_quantity: "10",
          lines: [{ product_id: raw, quantity: "4" }],
        }),
        key(),
        key(),
      )
    ).record;
    expect(
      await mfg.materialBalance(actor(), {
        company_id: fixture.company,
        surface: "boms",
        product_id: raw,
        warehouse_id: warehouse,
      }),
    ).toMatchObject({ category: "Acceptance category", unit: "Each", on_hand: "0" });
    const preview = await mfg.requirements(actor(), {
      company_id: fixture.company,
      surface: "plans",
      product_id: finished,
      quantity: "30",
    });
    expect(preview.recipe.lines[0]).toMatchObject({ quantity: "12", standard_quantity: "12", warehouse_id: warehouse });
    expect(preview.availability[0]).toMatchObject({ on_hand: "0", shortage: "12.0000" });
    const plan = (
      await mfg.savePlan(
        actor(),
        null,
        productionPlanInputSchema.parse({
          company_id: fixture.company,
          product_id: finished,
          planned_quantity: "30",
          bom_version: bom.version,
        }),
        key(),
        key(),
      )
    ).record;
    expect(plan.recipe).toEqual(preview.recipe);
    const conversionKey = key(),
      input = { company_id: fixture.company, expected_version: plan.version };
    const converted = await mfg.convertPlan(actor(), plan.id, input, conversionKey, key());
    expect(converted.order.recipe).toEqual(plan.recipe);
    expect((await mfg.convertPlan(actor(), plan.id, input, conversionKey, key())).order.id).toBe(converted.order.id);
    const approved = (
      await mfg.action(
        actor(),
        converted.order.id,
        { company_id: fixture.company, expected_version: converted.order.version, action: "approve" },
        key(),
        key(),
      )
    ).record;
    await mfg.saveBom(
      actor(),
      bom.id,
      bomInputSchema.parse({
        company_id: fixture.company,
        product_id: finished,
        output_quantity: "10",
        lines: [{ product_id: raw, quantity: "9" }],
        expected_version: bom.version,
      }),
      key(),
      key(),
    );
    expect((await mfg.getOrder(actor(), fixture.company, approved.id)).recipe).toEqual(plan.recipe);
    expect(
      (await db.pool.query("select count(*)::int n from inventory_stock_entry where company_id=$1", [fixture.company]))
        .rows[0].n,
    ).toBe(0);
    await expect(
      mfg.saveOrder(
        actor(),
        approved.id,
        manufacturingOrderInputSchema.parse({
          company_id: fixture.company,
          product_id: finished,
          quantity: "30",
          order_date: "2026-11-20",
          expected_version: approved.version,
        }),
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "ORDER_NOT_EDITABLE" });
  });
  it("requires explicit refresh after a BOM change and a reason for an order material variance", async () => {
    const bom = await mfg.bomByProduct(actor(), fixture.company, finished, "plans");
    const plan = (
      await mfg.savePlan(
        actor(),
        null,
        productionPlanInputSchema.parse({
          company_id: fixture.company,
          product_id: finished,
          planned_quantity: "10",
          bom_version: bom.version,
        }),
        key(),
        key(),
      )
    ).record;
    const changed = (
      await mfg.saveBom(
        actor(),
        bom.id,
        bomInputSchema.parse({
          company_id: fixture.company,
          product_id: finished,
          output_quantity: "10",
          lines: [{ product_id: raw, quantity: "3" }],
          expected_version: bom.version,
        }),
        key(),
        key(),
      )
    ).record;
    await expect(
      mfg.convertPlan(actor(), plan.id, { company_id: fixture.company, expected_version: plan.version }, key(), key()),
    ).rejects.toMatchObject({ code: "BOM_VERSION_CONFLICT" });
    const request = manufacturingOrderInputSchema.parse({
      company_id: fixture.company,
      product_id: finished,
      quantity: "10",
      order_date: "2026-11-20",
      bom_version: changed.version,
      lines: [{ product_id: raw, quantity: "4", remark: "" }],
    });
    await expect(mfg.saveOrder(actor(), null, request, key(), key())).rejects.toMatchObject({
      code: "ORDER_VARIANCE_REASON_REQUIRED",
    });
    const saved = await mfg.saveOrder(
      actor(),
      null,
      { ...request, lines: [{ product_id: raw, quantity: "4", remark: "Reviewed additional consumption" }] },
      key(),
      key(),
    );
    expect(saved.record.recipe?.lines[0]).toMatchObject({
      standard_quantity: "3",
      quantity: "4",
      remark: "Reviewed additional consumption",
    });
  });
  it("converts material units and scales non-stock and expense estimates without posting them", async () => {
    const createProduct = async (fields: Record<string, unknown>) =>
      (
        await inventory.save(
          actor(),
          null,
          productInputSchema.parse({
            company_id: fixture.company,
            category_id: `category-fixture-${fixture.company}`,
            currency: "USD",
            ...fields,
          }),
          key(),
          key(),
        )
      ).record;
    const mass = await createProduct({ name: "Measured raw input", unit: "Kg" }),
      service = await createProduct({
        name: "Production service estimate",
        type: "service",
        track_inventory: false,
        unit: "Hour",
      });
    const units = await mfg.productUnits(actor(), fixture.company, mass.id, "boms"),
      gram = units.items.find((item) => item.unit.name === "Gram");
    if (!gram) throw Error("The actual gram conversion is unavailable");
    const current = await mfg.bomByProduct(actor(), fixture.company, finished, "boms");
    const saved = await mfg.saveBom(
      actor(),
      current.id,
      bomInputSchema.parse({
        company_id: fixture.company,
        product_id: finished,
        expected_version: current.version,
        output_quantity: "10",
        warehouse_id: warehouse,
        lines: [{ product_id: mass.id, quantity: "1000", unit_id: gram.unit.id }],
        charges: [
          {
            kind: "non_stock",
            product_id: service.id,
            description: "Actual service estimate",
            quantity: "2",
            rate: "3.25",
          },
          {
            kind: "expense",
            expense_account_id: `${fixture.company}-expense`,
            description: "Reviewed other production cost",
            quantity: "1",
            rate: "2",
          },
        ],
      }),
      key(),
      key(),
    );
    expect(saved.record.lines[0]).toMatchObject({
      quantity: "1",
      unit_snapshot: { entered_quantity: "1000", base_quantity: "1" },
    });
    const preview = await mfg.requirements(actor(), {
      company_id: fixture.company,
      surface: "plans",
      product_id: finished,
      quantity: "20",
    });
    expect(preview.recipe.lines[0]).toMatchObject({ quantity: "2", unit: "Kg" });
    expect(preview.recipe.charges.map((line) => line.amount)).toEqual(["13.00", "4.00"]);
    expect(preview.recipe.estimated_charges).toBe("17.00");
    expect((await db.pool.query("select count(*)::int n from inventory_production_cost_allocation")).rows[0].n).toBe(0);
  });
});
