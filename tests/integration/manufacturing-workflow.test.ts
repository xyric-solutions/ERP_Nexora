import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import {
  bomInputSchema,
  manufacturingOrderInputSchema,
  productInputSchema,
  productionPlanInputSchema,
  type ManufacturingOrder,
} from "../../packages/contracts/src/index.js";
import {
  SourceManufacturingRepository,
  type ManufacturingContext,
} from "../../server/api/src/modules/manufacturing/source-repository.js";
import { SourceInventoryRepository } from "../../server/api/src/modules/inventory/source-repository.js";
import { SourceReferenceMasterRepository } from "../../server/api/src/modules/master-data/source-repository.js";
import {
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId as tenant,
  sourceTestCompanyId as company,
} from "./source-security-fixture.js";

const bootstrapUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const suite = bootstrapUrl ? describe : describe.skip;
const database = `manufacturing_workflow_${randomUUID().replaceAll("-", "")}`;
const permissions = [
  "manufacturing.bom.read",
  "manufacturing.bom.create",
  "manufacturing.bom.update",
  "manufacturing.plan.read",
  "manufacturing.plan.create",
  "manufacturing.plan.convert",
  "manufacturing.order.read",
  "manufacturing.order.create",
  "manufacturing.order.submit",
  "manufacturing.order.approve",
  "inventory.item.read",
  "inventory.item.create",
  "master_data.project.read",
  "master_data.project.manage",
  "master_data.location.read",
  "master_data.location.manage",
];
function context(user = "r06.maker", extra: Partial<ManufacturingContext["actor"]> = {}): ManufacturingContext {
  return {
    tenantId: tenant,
    actor: {
      tenantId: tenant,
      userId: user,
      organizationName: "Synthetic Manufacturing company",
      displayName: user,
      email: "manufacturing@example.invalid",
      roles: ["manufacturing_tester"],
      permissions,
      sessionVersion: 1,
      ...extra,
    },
  };
}
const maker = context(),
  checker = context("r06.checker"),
  key = () => randomUUID();

suite("Database-backed Manufacturing workflow", () => {
  let bootstrap: DatabasePool, pool: DatabasePool, repo: SourceManufacturingRepository;
  let motorcycle: string, tyre: string, seat: string, plain: string, scooter: string, project: string, location: string;
  beforeAll(async () => {
    if (!bootstrapUrl || !["localhost", "127.0.0.1"].includes(new URL(bootstrapUrl).hostname))
      throw new Error("An explicit local test database is required");
    bootstrap = createDatabasePool(bootstrapUrl);
    await bootstrap.query(`create database ${database}`);
    const url = new URL(bootstrapUrl);
    url.pathname = `/${database}`;
    pool = createDatabasePool(url.toString());
    await migrateSourceSchema(pool);
    await ensureSourceSuperAdministratorFixture(pool);
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-approval-override"]) {
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
    }
    repo = new SourceManufacturingRepository(pool);
    const inventory = new SourceInventoryRepository(pool);
    const product = async (name: string, manufacture: boolean) =>
      (
        await inventory.save(
          maker,
          null,
          productInputSchema.parse({
            company_id: company,
            name,
            currency: "USD",
            unit: "Each",
            manufacture_enabled: manufacture,
          }),
          key(),
          key(),
        )
      ).record.id;
    motorcycle = await product("Synthetic motorcycle", true);
    tyre = await product("Synthetic tyre", false);
    seat = await product("Synthetic seat", false);
    plain = await product("Synthetic bought-in product", false);
    scooter = await product("Synthetic scooter", true);
    const masters = new SourceReferenceMasterRepository(pool);
    project = (
      await masters.create(
        maker,
        "projects",
        { company_id: company, code: "MFG-P", name: "Synthetic project" },
        key(),
        key(),
      )
    ).record.id;
    location = (
      await masters.create(
        maker,
        "locations",
        { company_id: company, code: "MFG-L", name: "Synthetic site" },
        key(),
        key(),
      )
    ).record.id;
  }, 180_000);
  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${database}`);
      await bootstrap.end();
    }
  });

  it("creates one Bill of Materials per finished product and validates it", async () => {
    const input = bomInputSchema.parse({
      company_id: company,
      product_id: motorcycle,
      output_quantity: "1",
      lines: [
        { product_id: tyre, quantity: "2" },
        { product_id: seat, quantity: "1" },
      ],
    });
    const created = await repo.saveBom(maker, null, input, key(), key());
    expect(created.record).toMatchObject({ code: "BOM-001", output_quantity: "1", component_count: 2, version: 1 });
    expect(created.record.lines.map((line) => line.quantity)).toEqual(["2", "1"]);
    await expect(repo.saveBom(maker, null, input, key(), key())).rejects.toMatchObject({ code: "BOM_ALREADY_EXISTS" });
    await expect(repo.saveBom(maker, null, { ...input, product_id: plain }, key(), key())).rejects.toMatchObject({
      code: "BOM_PRODUCT_INELIGIBLE",
    });
    const retry = key();
    const updated = await repo.saveBom(
      maker,
      created.record.id,
      { ...input, notes: "Rev", expected_version: 1 },
      retry,
      key(),
    );
    expect(updated.record.version).toBe(2);
    expect(
      (await repo.saveBom(maker, created.record.id, { ...input, notes: "Rev", expected_version: 1 }, retry, key()))
        .record.version,
    ).toBe(2);
    await expect(
      repo.saveBom(maker, created.record.id, { ...input, expected_version: 1 }, key(), key()),
    ).rejects.toMatchObject({ code: "BOM_VERSION_CONFLICT" });
    expect((await repo.bomByProduct(maker, company, motorcycle, "orders")).id).toBe(created.record.id);
  });

  it("saves a plan for a finished product without a BOM and converts it exactly once", async () => {
    await expect(
      repo.savePlan(
        maker,
        null,
        productionPlanInputSchema.parse({ company_id: company, product_id: plain, planned_quantity: "3" }),
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_INELIGIBLE" });
    // The scooter has no Bill of Materials: planning no longer needs one.
    const plan = await repo.savePlan(
      maker,
      null,
      productionPlanInputSchema.parse({ company_id: company, product_id: scooter, planned_quantity: "10" }),
      key(),
      key(),
    );
    expect(plan.record).toMatchObject({ code: "PP-001", state: "draft", planned_quantity: "10", unit: "Each" });
    const retry = key();
    const convert = { company_id: company, expected_version: plan.record.version };
    const converted = await repo.convertPlan(maker, plan.record.id, convert, retry, key());
    expect(converted.plan).toMatchObject({ state: "converted", manufacturing_order_id: converted.order.id });
    expect(converted.order).toMatchObject({
      state: "draft",
      quantity: "10",
      plan_id: plan.record.id,
      plan_code: "PP-001",
      project_id: null,
      location_id: null,
    });
    // A retried click with the same key returns the same order instead of creating another.
    expect((await repo.convertPlan(maker, plan.record.id, convert, retry, key())).order.id).toBe(converted.order.id);
    await expect(
      repo.convertPlan(maker, plan.record.id, { ...convert, expected_version: converted.plan.version }, key(), key()),
    ).rejects.toMatchObject({ code: "PLAN_ALREADY_CONVERTED" });
    await expect(
      repo.savePlan(
        maker,
        plan.record.id,
        {
          company_id: company,
          product_id: scooter,
          planned_quantity: "11",
          notes: "",
          expected_version: converted.plan.version,
        },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "PLAN_NOT_EDITABLE" });
    // Confirm & Approve the converted order in one step.
    const approved = await repo.action(
      checker,
      converted.order.id,
      { company_id: company, expected_version: converted.order.version, action: "approve" },
      key(),
      key(),
    );
    expect(approved.record).toMatchObject({ state: "approved", approved_by_name: "r06.checker" });
    expect(approved.record.events.map((event) => event.action)).toEqual(["created", "approve"]);
  });

  it("creates, edits and confirms a Manufacturing Order in one approval step", async () => {
    const base = manufacturingOrderInputSchema.parse({
      company_id: company,
      product_id: motorcycle,
      quantity: "5",
      order_date: "2026-11-13",
    });
    let order: ManufacturingOrder = (await repo.saveOrder(maker, null, base, key(), key())).record;
    expect(order).toMatchObject({ state: "draft", project_id: null, plan_id: null });
    order = (
      await repo.saveOrder(
        maker,
        order.id,
        { ...base, quantity: "6", project_id: project, location_id: location, expected_version: order.version },
        key(),
        key(),
      )
    ).record;
    expect(order).toMatchObject({ quantity: "6", project_name: "MFG-P · Synthetic project" });
    const confirm = (actor: ManufacturingContext) =>
      repo.action(
        actor,
        order.id,
        { company_id: company, expected_version: order.version, action: "approve" },
        key(),
        key(),
      );
    // Confirming needs the approval permission (Module Admin level).
    const userLevel = context("r06.maker", {
      permissions: permissions.filter((permission) => permission !== "manufacturing.order.approve"),
    });
    await expect(confirm(userLevel)).rejects.toMatchObject({ status: 403 });
    // One step: the person who prepared the order may confirm it when they hold approval access.
    order = (await confirm(maker)).record;
    expect(order).toMatchObject({ state: "approved", approved_by_name: "r06.maker" });
    await expect(confirm(checker)).rejects.toMatchObject({ code: "ORDER_STATE_CONFLICT" });
    await expect(
      repo.saveOrder(maker, order.id, { ...base, expected_version: order.version }, key(), key()),
    ).rejects.toMatchObject({ code: "ORDER_NOT_EDITABLE" });
    expect(order.events.map((event) => event.action)).toEqual(["created", "saved", "approve"]);
  });

  it("keeps Manufacturing records tenant isolated and immutable at the database", async () => {
    const other = { ...maker, tenantId: "another-tenant" };
    await expect(repo.boms(other, { company_id: company, search: "", limit: 30 })).rejects.toMatchObject({
      status: 403,
    });
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      await expect(client.query("delete from manufacturing_order where tenant_id=$1", [tenant])).rejects.toMatchObject({
        code: "23514",
      });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
