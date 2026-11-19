import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import { supplierInputSchema } from "../../packages/contracts/src/index.js";
import { SourceFleetRepository, type FleetContext } from "../../server/api/src/modules/fleet/source-repository.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";
import {
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId as tenant,
  sourceTestCompanyId as company,
} from "./source-security-fixture.js";

const bootstrapUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const suite = bootstrapUrl ? describe : describe.skip;
const database = `fleet_workflow_${randomUUID().replaceAll("-", "")}`;
const permissions = [
  "fleet.vehicle.read",
  "fleet.vehicle.create",
  "fleet.vehicle.update",
  "fleet.driver.read",
  "fleet.driver.create",
  "fleet.driver.update",
  "fleet.fuel.read",
  "fleet.fuel.create",
  "fleet.maintenance.read",
  "fleet.maintenance.create",
  "procurement.vendor.read",
  "procurement.vendor.create",
];
function context(user = "r06.maker", granted = permissions): FleetContext {
  return {
    tenantId: tenant,
    actor: {
      tenantId: tenant,
      userId: user,
      organizationName: "Synthetic Fleet company",
      displayName: user,
      email: "fleet@example.invalid",
      roles: ["fleet_tester"],
      permissions: granted,
      sessionVersion: 1,
    },
  };
}
const maker = context(),
  key = () => randomUUID();
// Seeded by the shared security fixture: active employees assigned to the test company.
const employeeA = "r06-uat-employee-target",
  employeeB = "r06-uat-employee-candidate";

suite("Database-backed Fleet workflow", () => {
  let bootstrap: DatabasePool, pool: DatabasePool, repo: SourceFleetRepository, supplier: string;
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
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"]) {
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
    repo = new SourceFleetRepository(pool);
    const procurement = new SourceProcurementRepository(
      pool,
      new SupplierProfileCrypto(randomBytes(32).toString("base64"), "test-v1"),
    );
    supplier = (
      await procurement.saveSupplier(
        maker as never,
        null,
        supplierInputSchema.parse({ company_id: company, name: "Synthetic fuel station" }),
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

  const vehicleInput = (registration: string, extra: Record<string, unknown> = {}) => ({
    company_id: company,
    registration_no: registration,
    asset_number: "FA-10214",
    make_model: "Toyota Hilux Revo 2.8",
    category: "Light commercial",
    ownership: "owned" as const,
    fuel_type: "diesel" as const,
    opening_odometer: "84260",
    ...extra,
  });

  it("adds HR employees as drivers, assigns one to a vehicle and refuses double assignment", async () => {
    const employees = await repo.lookups(maker, { company_id: company, kind: "employee", search: "", limit: 30 });
    expect(employees.items.map((item) => item.id)).toEqual(expect.arrayContaining([employeeA, employeeB]));

    const driver = await repo.saveDriver(
      maker,
      null,
      {
        company_id: company,
        employee_id: employeeA,
        licence_number: "LTV-KHI-88341",
        licence_class: "LTV",
        licence_expires_on: "2027-04-18",
      },
      key(),
      key(),
    );
    expect(driver.record).toMatchObject({
      code: "DRV-001",
      employee_name: "Target Employee",
      payment_route: "payroll",
    });
    await expect(
      repo.saveDriver(
        maker,
        null,
        {
          company_id: company,
          employee_id: employeeA,
          licence_number: "X",
          licence_class: "LTV",
          licence_expires_on: "2027-01-01",
        },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "FLEET_DUPLICATE_DRIVER" });
    await expect(
      repo.saveDriver(
        maker,
        null,
        {
          company_id: company,
          employee_id: "not-an-employee",
          licence_number: "X",
          licence_class: "LTV",
          licence_expires_on: "2027-01-01",
        },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "FLEET_EMPLOYEE_INELIGIBLE" });

    const vehicle = await repo.saveVehicle(
      maker,
      null,
      vehicleInput("khi-6296", { current_driver_id: driver.record.id }),
      key(),
      key(),
    );
    expect(vehicle.record).toMatchObject({
      code: "VEH-001",
      registration_no: "KHI-6296",
      current_driver_name: "Target Employee",
      current_odometer: "84260",
      tool_count: 0,
    });
    await expect(
      repo.saveVehicle(maker, null, vehicleInput("LHR-8421", { current_driver_id: driver.record.id }), key(), key()),
    ).rejects.toMatchObject({ code: "FLEET_DRIVER_ASSIGNED" });
    await expect(repo.saveVehicle(maker, null, vehicleInput("KHI-6296"), key(), key())).rejects.toMatchObject({
      code: "FLEET_DUPLICATE_VEHICLE",
    });
    const reloaded = await repo.getDriver(maker, company, driver.record.id);
    expect(reloaded.assigned_vehicle_registration).toBe("KHI-6296");
  });

  it("records tools and replaces a damaged one", async () => {
    const vehicle = (await repo.vehicles(maker, { company_id: company, search: "KHI-6296", limit: 30 })).items[0]!;
    const extinguisher = await repo.saveTool(
      maker,
      vehicle.id,
      null,
      { company_id: company, name: "Fire extinguisher", recorded_on: "2026-11-16" },
      key(),
      key(),
    );
    await repo.saveTool(
      maker,
      vehicle.id,
      null,
      { company_id: company, name: "Wrench", quantity: 2, recorded_on: "2026-11-16" },
      key(),
      key(),
    );
    // A tool in good condition cannot be replaced.
    await expect(
      repo.saveTool(
        maker,
        vehicle.id,
        null,
        {
          company_id: company,
          name: "Fire extinguisher",
          recorded_on: "2026-11-16",
          replaces_tool_id: extinguisher.record.id,
        },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "FLEET_VALIDATION_FAILED" });
    const damaged = await repo.saveTool(
      maker,
      vehicle.id,
      extinguisher.record.id,
      {
        company_id: company,
        name: "Fire extinguisher",
        condition: "damaged",
        recorded_on: "2026-11-16",
        expected_version: 1,
      },
      key(),
      key(),
    );
    expect(damaged.record.version).toBe(2);
    const replacement = await repo.saveTool(
      maker,
      vehicle.id,
      null,
      {
        company_id: company,
        name: "Fire extinguisher",
        recorded_on: "2026-11-16",
        replaces_tool_id: extinguisher.record.id,
      },
      key(),
      key(),
    );
    expect(replacement.record).toMatchObject({ replaces_tool_name: "Fire extinguisher", condition: "good" });
    const tools = await repo.tools(maker, company, vehicle.id);
    expect(tools.items.find((tool) => tool.id === extinguisher.record.id)?.replaced_by_tool_id).toBe(
      replacement.record.id,
    );
    expect((await repo.getVehicle(maker, company, vehicle.id)).tool_count).toBe(3); // 1 extinguisher + 2 wrenches
  });

  it("calculates km per litre from consecutive odometer readings and rejects a lower reading", async () => {
    const vehicle = (await repo.vehicles(maker, { company_id: company, search: "KHI-6296", limit: 30 })).items[0]!;
    const first = await repo.createFuel(
      maker,
      {
        company_id: company,
        vehicle_id: vehicle.id,
        entry_date: "2026-11-15",
        odometer: "84723",
        litres: "42.85",
        rate: "350",
        supplier_id: supplier,
        supplier_invoice_ref: "PSO-8842",
      },
      key(),
      key(),
    );
    // (84723 - 84260) / 42.85 = 10.805 -> 10.81
    expect(first.record).toMatchObject({
      code: "FUE-0001",
      previous_odometer: "84260",
      distance: "463",
      km_per_litre: "10.81",
      amount: "14997.50",
      driver_name: "Target Employee",
      supplier_name: "Synthetic fuel station",
      billing_status: "pending",
    });
    const second = await repo.createFuel(
      maker,
      {
        company_id: company,
        vehicle_id: vehicle.id,
        entry_date: "2026-11-16",
        odometer: "85243",
        litres: "40",
        rate: "348.50",
      },
      key(),
      key(),
    );
    expect(second.record).toMatchObject({
      previous_odometer: "84723",
      km_per_litre: "13.00",
      billing_status: "not_applicable",
    });
    await expect(
      repo.createFuel(
        maker,
        {
          company_id: company,
          vehicle_id: vehicle.id,
          entry_date: "2026-11-16",
          odometer: "85243",
          litres: "10",
          rate: "350",
        },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "FLEET_ODOMETER_NOT_INCREASING" });
    const updated = await repo.getVehicle(maker, company, vehicle.id);
    // (463 + 520) / (42.85 + 40) = 11.8648 -> 11.86
    expect(updated).toMatchObject({ current_odometer: "85243", average_km_per_litre: "11.86" });
    const report = await repo.fuelEfficiency(maker, { company_id: company, from: "2026-11-01", to: "2026-11-30" });
    expect(report.rows.find((row) => row.vehicle_id === vehicle.id)).toMatchObject({
      entries: 2,
      distance: "983",
      litres: "82.85",
      km_per_litre: "11.86",
    });
    // The opening reading is fixed once fuel exists.
    await expect(
      repo.saveVehicle(
        maker,
        vehicle.id,
        vehicleInput("KHI-6296", {
          opening_odometer: "80000",
          current_driver_id: updated.current_driver_id,
          expected_version: updated.version,
        }),
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "FLEET_VALIDATION_FAILED" });
  });

  it("records in-house and outsourced maintenance", async () => {
    const vehicle = (await repo.vehicles(maker, { company_id: company, search: "KHI-6296", limit: 30 })).items[0]!;
    const inHouse = await repo.createMaintenance(
      maker,
      {
        company_id: company,
        vehicle_id: vehicle.id,
        entry_date: "2026-11-16",
        work_description: "Battery replacement",
        labour_amount: "1500",
        parts_amount: "26900",
      },
      key(),
      key(),
    );
    expect(inHouse.record).toMatchObject({
      code: "MNT-0001",
      total_amount: "28400.00",
      billing_status: "not_applicable",
    });
    const outsourced = await repo.createMaintenance(
      maker,
      {
        company_id: company,
        vehicle_id: vehicle.id,
        entry_date: "2026-11-16",
        work_description: "80,000 km service",
        labour_amount: "12000",
        parts_amount: "50000",
        is_external: true,
        supplier_id: supplier,
        supplier_invoice_ref: "TOY-2231",
      },
      key(),
      key(),
    );
    expect(outsourced.record).toMatchObject({ supplier_name: "Synthetic fuel station", billing_status: "pending" });
    const list = await repo.maintenance(maker, { company_id: company, search: "", vehicle_id: vehicle.id, limit: 30 });
    expect(list.items.map((item) => item.code)).toEqual(["MNT-0002", "MNT-0001"]);
  });

  it("replays an idempotent request and enforces permissions", async () => {
    const requestKey = key();
    const input = vehicleInput("ISB-1174", { make_model: "Honda City 1.5", category: "Passenger car" });
    const first = await repo.saveVehicle(maker, null, input, requestKey, key());
    const again = await repo.saveVehicle(maker, null, input, requestKey, key());
    expect(again.record.id).toBe(first.record.id);
    await expect(
      repo.saveVehicle(maker, null, { ...input, make_model: "Different" }, requestKey, key()),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const reader = context("r06.maker", ["fleet.vehicle.read"]);
    await expect(repo.saveVehicle(reader, null, vehicleInput("ISB-9999"), key(), key())).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    const changes = await pool.query<{ count: string }>(
      "select count(*)::text as count from fleet_change where tenant_id=$1 and entity_type='vehicle'",
      [tenant],
    );
    expect(Number(changes.rows[0]!.count)).toBeGreaterThanOrEqual(2);
  });
});
