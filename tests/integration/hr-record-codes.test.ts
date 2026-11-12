import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { allocateHrCode, type HrCodeKind } from "../../server/api/src/modules/hr/record-codes.js";
import { SourceHrRepository, type HrActorContext } from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
const company = "nexora-r06-uat-company";
run("Transactional HR automatic record codes", () => {
  let pool: DatabasePool;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });

  async function allocate(scope: string, rollback = false) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      const code = await allocateHrCode(client, sourceTestTenantId, scope, "designation", "AUTO");
      await client.query(rollback ? "rollback" : "commit");
      return code;
    } finally {
      client.release();
    }
  }

  it("serializes concurrent allocation and isolates company counters", async () => {
    const scope = `codes-${randomUUID()}`;
    const codes = await Promise.all(Array.from({ length: 8 }, () => allocate(scope)));
    expect(new Set(codes).size).toBe(8);
    expect(codes.sort()).toEqual(Array.from({ length: 8 }, (_, n) => `DSG-${String(n + 1).padStart(3, "0")}`));
    expect(await allocate(`codes-${randomUUID()}`)).toBe("DSG-001");
    expect(await allocate(scope, true)).toBe("DSG-009");
    expect(await allocate(scope)).toBe("DSG-009");
  });

  it.each([
    ["employee", "EMP"],
    ["shift", "SHF"],
    ["leave", "LT"],
    ["component", "PAY"],
    ["structure", "SAL"],
    ["loan", "LN"],
    ["lifecycle", "LCP"],
    ["programme", "TRN"],
    ["overtime", "OTP"],
    ["designation", "DSG"],
    ["job_grade", "GRD"],
    ["job", "JOB"],
    ["cost_center", "CC"],
    ["work_location", "LOC"],
    ["employment_setup", "ES"],
    ["employment_type", "ET"],
    ["employee_category", "EC"],
    ["business_unit", "BU"],
    ["division", "DIV"],
    ["branch", "BR"],
    ["department", "DEPT"],
    ["warehouse", "WH"],
  ])("reads all historical %s identifiers when allocating", async (kind, prefix) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      expect(await allocateHrCode(client, sourceTestTenantId, company, kind as HrCodeKind, "AUTO")).toMatch(
        new RegExp(`^${prefix}-\\d{3,}$`),
      );
      expect(await allocateHrCode(client, sourceTestTenantId, company, kind as HrCodeKind, "HISTORICAL-42")).toBe(
        "HISTORICAL-42",
      );
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("creates and replays through the authorized repository without changing historical codes", async () => {
    const repo = new SourceHrRepository(pool);
    const context: HrActorContext = {
      tenantId: sourceTestTenantId,
      actor: {
        tenantId: sourceTestTenantId,
        userId: "r06.maker",
        email: "r06.maker@example.test",
        displayName: "Maker",
        organizationName: "Code tests",
        roles: ["hr_manager"],
        permissions: ["hr.master.create", "hr.master.read"],
        sessionVersion: 1,
      },
    };
    const input = {
      company_id: company,
      type: "designation" as const,
      code: "AUTO",
      name: `Automatic code ${randomUUID()}`,
      description: "Integration verification",
    };
    const key = `code-${randomUUID()}`;
    const result = await repo.createMaster(context, input, key, "hr-auto-code-test");
    expect(input.code).toBe("AUTO");
    const row = await pool.query<{ code: string }>("select code from hr_master_record where tenant_id=$1 and id=$2", [
      sourceTestTenantId,
      result.id,
    ]);
    expect(row.rows[0]!.code).toMatch(/^DSG-\d{3,}$/);
    const replay = await repo.createMaster(context, input, key, "hr-auto-code-test");
    expect(replay.id).toBe(result.id);
    expect(replay.replayed).toBe(true);
  });

  it("creates branches and departments through the authorized repository with automatic codes", async () => {
    const repo = new SourceHrRepository(pool);
    const context: HrActorContext = {
      tenantId: sourceTestTenantId,
      actor: {
        tenantId: sourceTestTenantId,
        userId: "r06.maker",
        email: "r06.maker@example.test",
        displayName: "Maker",
        organizationName: "Code tests",
        roles: ["hr_manager"],
        permissions: ["hr.organization.update"],
        sessionVersion: 1,
      },
    };
    const branch = await repo.createOrganizationUnit(
      context,
      {
        company_id: company,
        parent_id: company,
        type: "branch",
        code: "AUTO",
        name: `Automatic branch ${randomUUID()}`,
      },
      `branch-code-${randomUUID()}`,
      "hr-auto-branch-code-test",
    );
    const department = await repo.createOrganizationUnit(
      context,
      {
        company_id: company,
        parent_id: branch.id,
        type: "department",
        code: "AUTO",
        name: `Automatic department ${randomUUID()}`,
      },
      `department-code-${randomUUID()}`,
      "hr-auto-department-code-test",
    );
    const rows = await pool.query<{ id: string; code: string; parent_id: string }>(
      "select id,code,parent_id from organization_unit where tenant_id=$1 and id=any($2::text[]) order by id",
      [sourceTestTenantId, [branch.id, department.id]],
    );
    expect(rows.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: branch.id, code: expect.stringMatching(/^BR-\d{3,}$/), parent_id: company }),
        expect.objectContaining({
          id: department.id,
          code: expect.stringMatching(/^DEPT-\d{3,}$/),
          parent_id: branch.id,
        }),
      ]),
    );
  });

  it("includes inactive records and rolls allocation back with the mutation", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query(
        "insert into hr_master_record(id,tenant_id,company_id,master_type,code,name,status,created_by,deactivated_by,deactivated_at) values($1,$2,$3,'designation','DSG-999999999',$4,'inactive','r06.maker','r06.maker',now())",
        [`code-history-${randomUUID()}`, sourceTestTenantId, company, `Retained code ${randomUUID()}`],
      );
      expect(await allocateHrCode(client, sourceTestTenantId, company, "designation", "AUTO")).toBe("DSG-1000000000");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
