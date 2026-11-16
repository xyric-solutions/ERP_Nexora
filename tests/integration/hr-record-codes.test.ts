import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { allocateHrCode, hrCodeKinds, previewHrCode, type HrCodeKind } from "../../server/api/src/modules/hr/record-codes.js";
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
    ["division", "LCN"],
    ["branch", "PRJ"],
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
    // Hierarchy (HR140): company → division (Location) → branch (Project) → department.
    const division = await repo.createOrganizationUnit(
      context,
      { company_id: company, parent_id: company, type: "division", code: "AUTO", name: `Automatic location ${randomUUID()}` },
      `division-code-${randomUUID()}`,
      "hr-auto-division-code-test",
    );
    const branch = await repo.createOrganizationUnit(
      context,
      {
        company_id: company,
        parent_id: division.id,
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
        expect.objectContaining({ id: branch.id, code: expect.stringMatching(/^PRJ-\d{3,}$/), parent_id: division.id }),
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
  // HR154: every Add / New / Create form allocates a sequential, unique code.
  it.each([
    ["requisition", "MRQ"], ["opening", "JOP"], ["candidate", "CAN"], ["application", "APL"], ["offer", "OFR"],
    ["interview", "INT"], ["assessment", "ASM"], ["shift_allocation", "SAS"], ["leave_request", "LVR"],
    ["leave_posting", "LBP"], ["correction", "ACR"], ["overtime_request", "OT"], ["overtime_rule", "OTR"],
    ["transfer", "TRF"], ["promotion", "PRM"], ["manager_change", "RMC"], ["work_location_change", "WLC"],
    ["placement_change", "OPC"], ["assignment", "ASG"], ["hire", "HIR"], ["onboarding", "ONB"], ["probation", "PRB"],
    ["resignation", "RSG"], ["termination", "TRM"], ["clearance", "CLR"], ["settlement", "STL"], ["contact", "CON"],
    ["emergency_contact", "EMC"], ["document", "DOC"], ["employment_history", "EMH"], ["salary", "SLA"],
    ["adjustment", "ADJ"], ["ot_arrangement", "OTA"], ["statutory_setup", "STS"], ["payroll_policy", "PPL"],
    ["payroll_period", "PRD"],
  ])("previews and allocates sequential %s codes", async (kind, prefix) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      const preview = await previewHrCode(client, sourceTestTenantId, company, kind as HrCodeKind);
      expect(preview).toMatch(new RegExp(`^${prefix}-[0-9]{3,}$`));
      const first = await allocateHrCode(client, sourceTestTenantId, company, kind as HrCodeKind, "AUTO");
      expect(first).toBe(preview);
      const second = await allocateHrCode(client, sourceTestTenantId, company, kind as HrCodeKind, "AUTO");
      expect(Number(second.split("-")[1])).toBe(Number(first.split("-")[1]) + 1);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("covers every record code kind exposed to the forms", () => {
    expect(hrCodeKinds.length).toBeGreaterThanOrEqual(59);
    expect(new Set(hrCodeKinds).size).toBe(hrCodeKinds.length);
  });

  it("ignores historical random references when numbering new requisitions", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      const scope = `codes-${randomUUID()}`;
      // A legacy year-random reference never looks like a sequence number.
      expect(await allocateHrCode(client, sourceTestTenantId, scope, "requisition", "AUTO")).toBe("MRQ-001");
      expect(await allocateHrCode(client, sourceTestTenantId, scope, "overtime_request", "AUTO")).toBe("OT-001");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("serves the read-only code preview through the authorized repository", async () => {
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
        permissions: ["hr.employee.read"],
        sessionVersion: 1,
      },
    };
    const preview = await repo.previewRecordCode(context, { company_id: company, kind: "requisition" });
    expect(preview).toEqual({ kind: "requisition", code: expect.stringMatching(/^MRQ-\d{3,}$/) });
    const outsider: HrActorContext = { ...context, actor: { ...context.actor, permissions: ["finance.journal.read"] } };
    await expect(repo.previewRecordCode(outsider, { company_id: company, kind: "requisition" })).rejects.toMatchObject({ status: 403 });
  });
});
