import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { SourceHrRepository, type HrActorContext } from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
const company = "nexora-r06-uat-company";
const otherCompany = "nexora-r06-uat-company-two";
const actor = (
  userId = "r06.maker",
  permissions = [
    "hr.employee.read",
    "hr.employee.create",
    "hr.employee.update",
    "hr.employee.submit",
    "hr.employee.approve",
    "hr.master.create",
  ],
): HrActorContext => ({
  tenantId: sourceTestTenantId,
  actor: {
    tenantId: sourceTestTenantId,
    organizationName: "Recruitment tests",
    userId,
    email: `${userId}@example.test`,
    displayName: userId,
    roles: ["hr_manager"],
    permissions,
    sessionVersion: 1,
  },
});

run("Live recruitment pipeline", () => {
  let pool: DatabasePool;
  let repo: SourceHrRepository;
  let openingId: string;
  const corr = "pipeline-integration";
  const key = () => `pipeline-${randomUUID()}`;
  const candidate = (companyId = company) =>
    repo.createCandidate(
      actor(),
      {
        company_id: companyId,
        first_name: "Pipeline",
        last_name: randomUUID(),
        email: `pipeline-${randomUUID()}@example.test`,
        phone: "",
        source: "direct",
      },
      key(),
      corr,
    );
  const application = async () => {
    const person = await candidate();
    return repo.createApplication(
      actor(),
      { company_id: company, candidate_id: person.id, opening_id: openingId },
      key(),
      corr,
    );
  };
  const query = (extra = {}) => ({ company_id: company, limit: 100, offset: 0, ...extra });

  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
    const level = await pool.query<{ level: number }>(
      "select coalesce(max(grade_level),0)::int+1 as level from hr_job_grade_detail where tenant_id=$1 and company_id=$2",
      [sourceTestTenantId, company],
    );
    const grade = await repo.createJobGrade(
      actor(),
      {
        company_id: company,
        code: `PIPE-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: `Pipeline test grade ${randomUUID()}`,
        description: "Isolated integration fixture",
        grade_level: level.rows[0]!.level,
        currency_code: "PKR",
        band_minimum: "100",
        band_midpoint: "150",
        band_maximum: "200",
      },
      key(),
      corr,
    );
    const requisition = await repo.createManpowerRequisition(
      actor(),
      {
        company_id: company,
        job_title: "Pipeline integration vacancy",
        designation_id: "r06-uat-designation",
        job_grade_id: grade.id,
        employment_type_id: "r06-uat-employment-type",
        branch_id: "nexora-r06-uat-branch",
        department_id: "nexora-r06-uat-department",
        positions_requested: 2,
        position_type: "new_position",
        salary_minimum: "100",
        salary_maximum: "200",
        currency_code: "PKR",
        target_start_date: "2026-12-31",
        reason: "Isolated recruitment workflow verification",
        required_skills: [],
      },
      key(),
      corr,
    );
    await repo.submitManpowerRequisition(
      actor(),
      requisition.id,
      { reason: "Verify pipeline prerequisites" },
      key(),
      corr,
    );
    await repo.decideManpowerRequisition(
      actor("r06.checker"),
      requisition.id,
      { decision: "approved", reason: "Independent approval of integration fixture" },
      key(),
      corr,
    );
    openingId = (
      await repo.createJobOpening(
        actor(),
        {
          company_id: company,
          requisition_id: requisition.id,
          title: "Pipeline integration vacancy",
          positions_requested: 1,
          channels: ["Internal tests"],
        },
        key(),
        corr,
      )
    ).id;
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("creates once under concurrent retries and rejects duplicate applications", async () => {
    const person = await candidate();
    const input = { company_id: company, candidate_id: person.id, opening_id: openingId };
    const token = key();
    const results = await Promise.all([
      repo.createApplication(actor(), input, token, corr),
      repo.createApplication(actor(), input, token, corr),
    ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(results.map((item) => item.replayed).sort()).toEqual([false, true]);
    await expect(repo.createApplication(actor(), input, key(), corr)).rejects.toMatchObject({
      status: 409,
      code: "HR_APPLICATION_EXISTS",
    });
    await expect(
      repo.createApplication(actor(), { ...input, candidate_id: "another-candidate" }, token, corr),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rejects missing permissions, unauthorized company access, and another tenant", async () => {
    await expect(repo.listApplications(actor("r06.maker", []), query())).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.listApplications(actor("r06.restricted"), query({ company_id: otherCompany })),
    ).rejects.toMatchObject({ status: 403 });
    const foreign = actor();
    foreign.tenantId = "foreign-tenant";
    foreign.actor.tenantId = "foreign-tenant";
    await expect(repo.listApplications(foreign, query())).rejects.toMatchObject({ status: 403 });
    const person = await candidate();
    await expect(
      repo.createApplication(
        actor("r06.maker", ["hr.employee.read"]),
        { company_id: company, candidate_id: person.id, opening_id: openingId },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("requires an active candidate, an open vacancy, and company-consistent references", async () => {
    const person = await candidate();
    await repo.changeCandidateStatus(actor(), person.id, { company_id: company, status: "archived" }, key(), corr);
    await expect(
      repo.createApplication(
        actor(),
        { company_id: company, candidate_id: person.id, opening_id: openingId },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_CANDIDATE_UNAVAILABLE" });
    const other = await candidate(otherCompany);
    await expect(
      repo.createApplication(
        actor(),
        { company_id: company, candidate_id: other.id, opening_id: openingId },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_CANDIDATE_UNAVAILABLE" });
    const active = await candidate();
    await expect(
      repo.createApplication(
        actor(),
        { company_id: company, candidate_id: active.id, opening_id: "missing-opening" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_OPENING_UNAVAILABLE" });
  });
  it("enforces sequential stages, stale-decision protection and evidence gates", async () => {
    const row = await application();
    await expect(
      repo.changeApplicationStage(
        actor(),
        row.id,
        { company_id: company, expected_stage: "application", stage: "interview", reason: "Skip" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_APPLICATION_TRANSITION_INVALID" });
    const input = {
      company_id: company,
      expected_stage: "application" as const,
      stage: "screening" as const,
      reason: "Initial review started",
    };
    const token = key();
    const moved = await repo.changeApplicationStage(actor(), row.id, input, token, corr);
    expect((await repo.changeApplicationStage(actor(), row.id, input, token, corr)).replayed).toBe(true);
    await expect(repo.changeApplicationStage(actor(), row.id, input, key(), corr)).rejects.toMatchObject({
      code: "HR_APPLICATION_STALE",
    });
    expect(moved.stage).toBe("screening");
    for (const target of ["selected", "hired"] as const)
      await expect(
        repo.changeApplicationStage(
          actor(),
          row.id,
          { ...input, expected_stage: "screening", stage: target },
          key(),
          corr,
        ),
      ).rejects.toMatchObject({ code: "HR_RECRUITMENT_EVIDENCE_REQUIRED" });
    const projection = (await repo.listApplications(actor(), query({ search: row.reference }))).items[0]!;
    expect(projection.history.map((event) => event.to_stage)).toEqual(["application", "screening"]);
    const audit = await pool.query(
      "select id from platform_admin_audit_event where tenant_id=$1 and entity_id=$2 and action='hr.application.stage'",
      [sourceTestTenantId, row.id],
    );
    expect(audit.rowCount).toBe(1);
  });
  it("resolves concurrent decisions once and keeps terminal stages final", async () => {
    const row = await application();
    const decisions = await Promise.allSettled(
      ["rejected", "withdrawn"].map((stage) =>
        repo.changeApplicationStage(
          actor(),
          row.id,
          {
            company_id: company,
            expected_stage: "application",
            stage: stage as "rejected" | "withdrawn",
            reason: "Final decision",
          },
          key(),
          corr,
        ),
      ),
    );
    expect(decisions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const current = (await repo.listApplications(actor(), query({ search: row.reference }))).items[0]!;
    await expect(
      repo.changeApplicationStage(
        actor(),
        row.id,
        { company_id: company, expected_stage: current.stage, stage: "screening", reason: "Reopen" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_APPLICATION_TRANSITION_INVALID" });
    await expect(
      pool.query(
        "update hr_recruitment_application_event set reason='Changed' where tenant_id=$1 and application_id=$2",
        [sourceTestTenantId, row.id],
      ),
    ).rejects.toThrow(/immutable/);
  });
  it("paginates, searches, and filters live projections", async () => {
    const row = await application();
    const result = await repo.listApplications(actor(), query({ search: row.reference, limit: 1 }));
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect((await repo.listApplications(actor(), query({ search: row.reference, offset: 1 }))).items).toHaveLength(0);
    expect((await repo.listApplications(actor(), query({ search: row.reference, stage: "rejected" }))).total).toBe(0);
  });
  it("integrates authenticated HTTP reads and rejects invalid CSRF, origin and stage input", async () => {
    const session = {
      sessionId: "pipeline-session",
      tenantId: sourceTestTenantId,
      userId: "r06.maker",
      csrfToken: "c".repeat(43),
      idleExpiresAt: new Date("2099-01-01"),
      absoluteExpiresAt: new Date("2099-01-01"),
    };
    const app = createApp({
      config: { allowedOrigins: new Set(["https://hr.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      hrRepository: repo,
      authService: { loadAuthenticatedAccount: vi.fn(async () => actor().actor) } as unknown as TenantAuthApiService,
      sessionService: {
        get: vi.fn(async () => session),
        authorizeMutation: vi.fn(async (_token: string, csrf: string) =>
          csrf === session.csrfToken ? { status: "ok", session } : { status: "invalid_csrf" },
        ),
      } as unknown as TenantSessionApiService,
    });
    const row = await application();
    const read = await request(app)
      .get(`/api/v1/hr/applications?company_id=${company}&search=${row.reference}`)
      .set("cookie", "nexora_session=test");
    expect(read.status).toBe(200);
    expect(read.body.items[0].id).toBe(row.id);
    expect((await request(app).get(`/api/v1/hr/applications?company_id=${company}`)).status).toBe(401);
    const endpoint = `/api/v1/hr/applications/${row.id}/stage`;
    const send = (origin: string, csrf: string, body: object) =>
      request(app)
        .post(endpoint)
        .set("cookie", "nexora_session=test")
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key())
        .send(body);
    const body = { company_id: company, expected_stage: "application", stage: "screening", reason: "Review" };
    expect((await send("https://hr.example.test", "invalid", body)).status).toBe(403);
    expect((await send("https://untrusted.example.test", session.csrfToken, body)).status).toBe(403);
    expect((await send("https://hr.example.test", session.csrfToken, { ...body, reason: "" })).status).toBe(400);
    expect((await send("https://hr.example.test", session.csrfToken, body)).status).toBe(200);
  });
});
