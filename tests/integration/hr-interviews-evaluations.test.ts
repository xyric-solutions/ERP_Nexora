import { hrInterviewWorkspaceSchema, hrInterviewActionRequestSchema } from "../../packages/contracts/src/hr/index.js";
import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

run("Live interviews and evaluations", () => {
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

  const schedule = async (appId: string) => {
    const input = {
      company_id: company,
      application_id: appId,
      action: "schedule" as const,
      kind: "technical" as const,
      starts_at: new Date(Date.now() + 3600000).toISOString(),
      duration_minutes: 60,
      mode: "video" as const,
      location: "Isolated test meeting",
      panel_user_ids: ["r06.maker", "r06.checker"],
    };
    const result = await repo.performInterviewAction(actor(), input, key(), corr);
    return { input, result };
  };
  const shortlist = async () => {
    const row = await application();
    await repo.changeApplicationStage(
      actor(),
      row.id,
      { company_id: company, expected_stage: "application", stage: "screening", reason: "Screening started" },
      key(),
      corr,
    );
    await repo.changeApplicationStage(
      actor(),
      row.id,
      { company_id: company, expected_stage: "screening", stage: "shortlisted", reason: "Screening passed" },
      key(),
      corr,
    );
    return row;
  };
  const evidence = (id: string) => repo.getInterviewWorkspace(actor(), { company_id: company, application_id: id });
  const complete = async (appId: string) => {
    const scheduled = await schedule(appId);
    await repo.changeApplicationStage(
      actor(),
      appId,
      { company_id: company, expected_stage: "shortlisted", stage: "interview", reason: "Panel scheduled" },
      key(),
      corr,
    );
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(scheduled.input.starts_at) + 3600000);
    await repo.performInterviewAction(
      actor(),
      {
        company_id: company,
        application_id: appId,
        action: "complete",
        interview_id: scheduled.result.id,
        expected_version: 1,
        reason: "Interview held and completed",
      },
      key(),
      corr,
    );
    return scheduled.result.id;
  };
  const evaluate = (
    appId: string,
    interviewId: string,
    userId = "r06.maker",
    score = 4,
    recommendation: "hire" | "hold" = "hire",
  ) =>
    repo.performInterviewAction(
      actor(userId),
      {
        company_id: company,
        application_id: appId,
        action: "evaluate",
        interview_id: interviewId,
        scores: { depth: score, problem: score, practice: score, communication: score },
        recommendation,
        strengths: "Evidence-based technical discussion",
        concerns: "None material",
      },
      key(),
      corr,
    );
  afterEach(() => vi.restoreAllMocks());

  it("enforces permissions, company access, tenant isolation and application stage", async () => {
    const row = await application();
    await expect(
      repo.getInterviewWorkspace(actor("r06.maker", []), { company_id: company, application_id: row.id }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.listInterviewPanel(actor("r06.restricted"), { company_id: otherCompany, search: "", limit: 100 }),
    ).rejects.toMatchObject({ status: 403 });
    const foreign = actor();
    foreign.tenantId = "another-tenant";
    foreign.actor.tenantId = "another-tenant";
    await expect(
      repo.getInterviewWorkspace(foreign, { company_id: company, application_id: row.id }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(schedule(row.id)).rejects.toMatchObject({ code: "HR_INTERVIEW_STAGE_INVALID" });
    const panel = await repo.listInterviewPanel(actor(), { company_id: company, search: "", limit: 100 });
    expect(panel.items.map((p) => p.id)).toContain("r06.maker");
    expect(panel.items.every((p) => Object.keys(p).sort().join(",") === "id,name")).toBe(true);
  });
  it("rejects invalid panels and past schedules, and handles concurrent retries once", async () => {
    const row = await shortlist();
    const first = await schedule(row.id);
    await expect(
      repo.performInterviewAction(actor(), { ...first.input, starts_at: "2020-01-01T10:00:00Z" }, key(), corr),
    ).rejects.toMatchObject({ code: "HR_INTERVIEW_TIME_INVALID" });
    await expect(
      repo.performInterviewAction(
        actor(),
        { ...first.input, panel_user_ids: ["r06.maker", "not-a-company-user"] },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_INTERVIEW_PANEL_INVALID" });
    expect(
      hrInterviewActionRequestSchema.safeParse({ ...first.input, panel_user_ids: ["r06.maker", "r06.maker"] }).success,
    ).toBe(false);
    const token = key();
    const results = await Promise.all([
      repo.performInterviewAction(actor(), first.input, token, corr),
      repo.performInterviewAction(actor(), first.input, token, corr),
    ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    await expect(
      repo.performInterviewAction(actor(), { ...first.input, location: "Changed" }, token, corr),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const view = await evidence(row.id);
    expect(view.interviews).toHaveLength(2);
    expect(hrInterviewWorkspaceSchema.safeParse(view).success).toBe(true);
  });
  it("requires scheduled and completed interview evidence at pipeline gates", async () => {
    const row = await shortlist();
    await expect(
      repo.changeApplicationStage(
        actor(),
        row.id,
        { company_id: company, expected_stage: "shortlisted", stage: "interview", reason: "No interview" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_RECRUITMENT_EVIDENCE_REQUIRED" });
    const { result } = await schedule(row.id);
    await repo.changeApplicationStage(
      actor(),
      row.id,
      { company_id: company, expected_stage: "shortlisted", stage: "interview", reason: "Scheduled" },
      key(),
      corr,
    );
    await expect(
      repo.changeApplicationStage(
        actor(),
        row.id,
        { company_id: company, expected_stage: "interview", stage: "evaluation", reason: "Not completed" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_RECRUITMENT_EVIDENCE_REQUIRED" });
    await expect(
      repo.performInterviewAction(
        actor(),
        {
          company_id: company,
          application_id: row.id,
          interview_id: result.id,
          action: "complete",
          expected_version: 1,
          reason: "Too early",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_INTERVIEW_NOT_STARTED" });
  });
  it("reschedules with version checks and retains cancelled/no-show activity", async () => {
    const row = await shortlist(),
      { input, result } = await schedule(row.id);
    await repo.performInterviewAction(
      actor(),
      {
        company_id: company,
        application_id: row.id,
        action: "reschedule",
        interview_id: result.id,
        expected_version: 1,
        starts_at: new Date(Date.parse(input.starts_at) + 3600000).toISOString(),
        duration_minutes: 45,
        mode: "telephone",
        location: "Phone panel",
        reason: "Panel availability",
      },
      key(),
      corr,
    );
    await expect(
      repo.performInterviewAction(
        actor(),
        {
          company_id: company,
          application_id: row.id,
          action: "cancel",
          interview_id: result.id,
          expected_version: 1,
          reason: "Stale cancellation",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_INTERVIEW_STALE" });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(input.starts_at) + 7200000);
    await repo.performInterviewAction(
      actor(),
      {
        company_id: company,
        application_id: row.id,
        action: "no_show",
        interview_id: result.id,
        expected_version: 2,
        reason: "Candidate did not attend",
      },
      key(),
      corr,
    );
    await repo.performInterviewAction(
      actor(),
      {
        company_id: company,
        application_id: row.id,
        action: "cancel",
        interview_id: result.id,
        expected_version: 3,
        reason: "Close this round; arrange a replacement",
      },
      key(),
      corr,
    );
    const view = await evidence(row.id);
    expect(view.interviews[0]).toMatchObject({ status: "cancelled", version: 4 });
    expect(view.history.map((e) => e.action)).toEqual(["schedule", "reschedule", "no_show", "cancel"]);
  });
  it("accepts only each signed-in panel member's complete immutable scorecard", async () => {
    const row = await shortlist(),
      interviewId = await complete(row.id);
    await expect(evaluate(row.id, interviewId, "r06.target")).rejects.toMatchObject({
      status: 403,
      code: "HR_INTERVIEW_PANEL_REQUIRED",
    });
    await expect(
      repo.performInterviewAction(
        actor(),
        {
          company_id: company,
          application_id: row.id,
          action: "evaluate",
          interview_id: interviewId,
          scores: { depth: 4 },
          recommendation: "hire",
          strengths: "Good",
          concerns: "None",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_INTERVIEW_SCORES_INVALID" });
    await evaluate(row.id, interviewId);
    await expect(evaluate(row.id, interviewId)).rejects.toMatchObject({ code: "HR_INTERVIEW_EVALUATION_EXISTS" });
    const view = await evidence(row.id);
    expect(view.interviews[0]!.evaluations[0]).toMatchObject({ user_id: "r06.maker", weighted_score: 80 });
    expect(view.readiness.ready).toBe(false);
    await expect(
      pool.query(
        "update hr_recruitment_interview_evaluation set weighted_score=100 where tenant_id=$1 and interview_id=$2",
        [sourceTestTenantId, interviewId],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query("delete from hr_recruitment_interview_event where tenant_id=$1 and application_id=$2", [
        sourceTestTenantId,
        row.id,
      ]),
    ).rejects.toThrow(/immutable/);
  });
  it("blocks low scores, hold recommendations and failed mandatory assessments", async () => {
    const row = await shortlist(),
      interviewId = await complete(row.id);
    await evaluate(row.id, interviewId, "r06.maker", 2);
    await evaluate(row.id, interviewId, "r06.checker", 4, "hold");
    const check = await repo.performInterviewAction(
      actor(),
      {
        company_id: company,
        application_id: row.id,
        action: "assessment_add",
        title: "Reference check",
        mandatory: true,
        reason: "Required before selection",
      },
      key(),
      corr,
    );
    await repo.performInterviewAction(
      actor(),
      {
        company_id: company,
        application_id: row.id,
        action: "assessment_decide",
        assessment_id: check.id,
        outcome: "failed",
        reason: "Reference could not be verified",
      },
      key(),
      corr,
    );
    await expect(
      repo.performInterviewAction(
        actor(),
        {
          company_id: company,
          application_id: row.id,
          action: "assessment_decide",
          assessment_id: check.id,
          outcome: "passed",
          reason: "Overwrite failed outcome",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_ASSESSMENT_NOT_PENDING" });
    const view = await evidence(row.id);
    expect(view.readiness.average_score).toBe(60);
    expect(view.readiness.blockers.join(" ")).toMatch(/65%/);
    expect(view.readiness.blockers.join(" ")).toMatch(/Hold/);
    expect(view.readiness.blockers.join(" ")).toMatch(/mandatory/);
  });
  it("selects only with all panel and assessment evidence and HR approval permission", async () => {
    const row = await shortlist(),
      interviewId = await complete(row.id);
    await evaluate(row.id, interviewId, "r06.maker");
    await evaluate(row.id, interviewId, "r06.checker");
    await repo.changeApplicationStage(
      actor(),
      row.id,
      { company_id: company, expected_stage: "interview", stage: "evaluation", reason: "Interview completed" },
      key(),
      corr,
    );
    const check = await repo.performInterviewAction(
      actor(),
      {
        company_id: company,
        application_id: row.id,
        action: "assessment_add",
        title: "Background check",
        mandatory: true,
        reason: "Verify credentials",
      },
      key(),
      corr,
    );
    const input = {
      company_id: company,
      application_id: row.id,
      action: "select" as const,
      reason: "Panel evidence and required checks reviewed",
    };
    await expect(repo.performInterviewAction(actor(), input, key(), corr)).rejects.toMatchObject({
      code: "HR_RECRUITMENT_EVIDENCE_REQUIRED",
    });
    await repo.performInterviewAction(
      actor(),
      {
        company_id: company,
        application_id: row.id,
        action: "assessment_decide",
        assessment_id: check.id,
        outcome: "passed",
        reason: "Credentials verified against source",
      },
      key(),
      corr,
    );
    await expect(
      repo.performInterviewAction(actor("r06.maker", ["hr.employee.update"]), input, key(), corr),
    ).rejects.toMatchObject({ status: 403 });
    const token = key(),
      selected = await repo.performInterviewAction(actor("r06.checker"), input, token, corr);
    expect(await repo.performInterviewAction(actor("r06.checker"), input, token, corr)).toEqual({
      ...selected,
      replayed: true,
    });
    const view = await evidence(row.id);
    expect(view.application.stage).toBe("selected");
    expect(view.readiness.ready).toBe(true);
    expect(hrInterviewWorkspaceSchema.safeParse(view).success).toBe(true);
    await expect(
      repo.performInterviewAction(
        actor(),
        {
          company_id: company,
          application_id: row.id,
          action: "assessment_add",
          title: "Late alteration",
          mandatory: true,
          reason: "Should be blocked",
        },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_INTERVIEW_STAGE_INVALID" });
    await expect(
      repo.changeApplicationStage(
        actor(),
        row.id,
        { company_id: company, expected_stage: "selected", stage: "hired", reason: "Cannot bypass offer" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_RECRUITMENT_EVIDENCE_REQUIRED" });
    const history = (await repo.listApplications(actor(), query({ search: row.reference }))).items[0]!.history;
    expect(history.filter((e) => e.to_stage === "selected")).toHaveLength(1);
    const audits = await pool.query(
      "select id from platform_admin_audit_event where tenant_id=$1 and id=$2 and action='hr.interview.action'",
      [sourceTestTenantId, selected.audit_event_id],
    );
    expect(audits.rowCount).toBe(1);
  });
  it("enforces authenticated HTTP, CSRF/origin and action validation", async () => {
    const session = {
      sessionId: "interview-test",
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
    const row = await shortlist();
    const endpoint = `/api/v1/hr/recruitment_interviews?company_id=${company}&application_id=${row.id}`;
    expect((await request(app).get(endpoint)).status).toBe(401);
    const read = await request(app).get(endpoint).set("cookie", "nexora_session=test");
    expect(read.status).toBe(200);
    expect(hrInterviewWorkspaceSchema.safeParse(read.body).success).toBe(true);
    const input = {
      company_id: company,
      application_id: row.id,
      action: "schedule",
      kind: "technical",
      starts_at: new Date(Date.now() + 3600000).toISOString(),
      duration_minutes: 60,
      mode: "video",
      location: "HTTP test room",
      panel_user_ids: ["r06.maker", "r06.checker"],
    };
    const send = (origin: string, csrf: string, payload: object) =>
      request(app)
        .post("/api/v1/hr/recruitment_interviews/actions")
        .set("cookie", "nexora_session=test")
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key())
        .send(payload);
    expect((await send("https://hr.example.test", "invalid", input)).status).toBe(403);
    expect((await send("https://untrusted.example.test", session.csrfToken, input)).status).toBe(403);
    expect(
      (await send("https://hr.example.test", session.csrfToken, { ...input, panel_user_ids: ["r06.maker"] })).status,
    ).toBe(400);
    expect((await send("https://hr.example.test", session.csrfToken, input)).status).toBe(200);
  });
});
