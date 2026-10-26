import { hrOfferDetailSchema, type HrOfferActionRequest } from "../../packages/contracts/src/hr/index.js";
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
    "hr.payroll.salary.read",
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

run("Live offer management", () => {
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
        positions_requested: 999,
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
          positions_requested: 100,
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

  const shift = (day: string, n: number) =>
    new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const selectedApplication = async (customOpening = openingId) => {
    const original = openingId;
    openingId = customOpening;
    let row;
    try {
      row = await shortlist();
    } finally {
      openingId = original;
    }
    const interviewId = await complete(row.id);
    await evaluate(row.id, interviewId, "r06.maker");
    await evaluate(row.id, interviewId, "r06.checker");
    await repo.changeApplicationStage(
      actor(),
      row.id,
      { company_id: company, expected_stage: "interview", stage: "evaluation", reason: "Evidence ready" },
      key(),
      corr,
    );
    await repo.performInterviewAction(
      actor("r06.checker"),
      { company_id: company, application_id: row.id, action: "select", reason: "All evidence verified" },
      key(),
      corr,
    );
    return row;
  };
  const terms = async (appId: string, gross = "150.0000") => {
    const ctx = await repo.getOfferContext(actor(), { company_id: company, application_id: appId });
    return {
      company_id: company,
      application_id: appId,
      proposed_gross: gross,
      joining_on: shift(ctx.today, 30),
      valid_until: shift(ctx.today, 7),
      probation_months: 3,
      notice_days: 30,
      cost_center_id: "r06-uat-cost-center",
      work_location_id: "r06-uat-location",
      employee_category_id: "r06-uat-category",
      reporting_manager_id: null,
      note: "Controlled integration offer",
      range_exception_reason: "",
    };
  };
  const draft = async () => {
    const app = await selectedApplication();
    return repo.createOffer(actor(), await terms(app.id), key(), corr);
  };
  const offer = async (id: string) => repo.getOffer(actor(), company, id);
  const action = async (
    id: string,
    command: HrOfferActionRequest["action"],
    who = "r06.maker",
    extra: Partial<HrOfferActionRequest> = {},
  ) => {
    const row = await offer(id);
    return repo.performOfferAction(
      actor(who),
      id,
      {
        company_id: company,
        expected_version: row.version,
        action: command,
        reason: "Controlled offer action",
        approve_range_exception: false,
        evidence_reference: "",
        ...extra,
      },
      key(),
      corr,
    );
  };

  it("enforces compensation read permissions, company and tenant scope, and selected applications", async () => {
    const app = await application();
    await expect(
      repo.getOfferContext(actor("r06.maker", ["hr.employee.read"]), { company_id: company, application_id: app.id }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.listOffers(actor("r06.restricted"), { company_id: otherCompany, limit: 50, offset: 0 }),
    ).rejects.toMatchObject({ status: 403 });
    const foreign = actor();
    foreign.tenantId = "foreign";
    foreign.actor.tenantId = "foreign";
    await expect(repo.listOffers(foreign, { company_id: company, limit: 50, offset: 0 })).rejects.toMatchObject({
      status: 403,
    });
    await expect(repo.createOffer(actor(), await terms(app.id), key(), corr)).rejects.toMatchObject({
      code: "HR_OFFER_AUTHORITY_INVALID",
    });
  });
  it("derives authority from requisitions, supports exact decimal drafts, and handles concurrent retries", async () => {
    const app = await selectedApplication(),
      input = await terms(app.id, "150.1234"),
      token = key();
    const results = await Promise.all([
      repo.createOffer(actor(), input, token, corr),
      repo.createOffer(actor(), input, token, corr),
    ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    const view = await offer(results[0]!.id);
    expect(view.proposed_gross).toBe("150.1234");
    expect(view.context.salary_minimum).toBe("100.0000");
    expect(hrOfferDetailSchema.safeParse(view).success).toBe(true);
    await expect(repo.createOffer(actor(), input, key(), corr)).rejects.toMatchObject({ status: 409 });
    await expect(repo.createOffer(actor(), { ...input, proposed_gross: "151" }, token, corr)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await expect(
      repo.updateOffer(
        actor(),
        view.id,
        { ...input, expected_version: view.version, cost_center_id: "missing-master" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_OFFER_MASTER_INVALID" });
  });
  it("version-checks draft edits and freezes terms after submission", async () => {
    const row = await draft(),
      view = await offer(row.id),
      input = { ...(await terms(view.application_id)), expected_version: view.version, proposed_gross: "160" };
    await repo.updateOffer(actor(), row.id, input, key(), corr);
    await expect(repo.updateOffer(actor(), row.id, input, key(), corr)).rejects.toMatchObject({
      code: "HR_OFFER_STALE",
    });
    await action(row.id, "submit");
    const submitted = await offer(row.id);
    await expect(
      repo.updateOffer(actor(), row.id, { ...input, expected_version: submitted.version }, key(), corr),
    ).rejects.toMatchObject({ code: "HR_OFFER_TERMS_FROZEN" });
    await expect(
      pool.query("update hr_recruitment_offer set proposed_gross=170,version=version+1 where tenant_id=$1 and id=$2", [
        sourceTestTenantId,
        row.id,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(action(row.id, "approve")).rejects.toMatchObject({ code: "HR_SELF_APPROVAL_FORBIDDEN" });
    expect((await action(row.id, "approve", "r06.checker")).state).toBe("approved");
    await expect(
      repo.changeApplicationStage(
        actor(),
        view.application_id,
        { company_id: company, expected_stage: "selected", stage: "withdrawn", reason: "Close with live offer" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_OFFER_APPLICATION_IN_USE" });
  });
  it("requires explicit salary-authority approval for out-of-range compensation", async () => {
    const app = await selectedApplication(),
      input = await terms(app.id, "200.0001");
    await expect(repo.createOffer(actor(), input, key(), corr)).rejects.toMatchObject({
      code: "HR_OFFER_EXCEPTION_REASON_REQUIRED",
    });
    const row = await repo.createOffer(
      actor(),
      { ...input, range_exception_reason: "Scarce specialist skills; compensation review requested" },
      key(),
      corr,
    );
    await action(row.id, "submit");
    await expect(action(row.id, "approve", "r06.checker")).rejects.toMatchObject({
      code: "HR_OFFER_EXCEPTION_APPROVAL_REQUIRED",
    });
    await expect(action(row.id, "approve", "r06.checker", { approve_range_exception: true })).rejects.toMatchObject({
      code: "HR_OFFER_EXCEPTION_APPROVAL_REQUIRED",
    });
    const checker = actor("r06.checker");
    checker.actor.permissions.push("hr.payroll.salary.approve");
    const before = await offer(row.id);
    await repo.performOfferAction(
      checker,
      row.id,
      {
        company_id: company,
        expected_version: before.version,
        action: "approve",
        reason: "Explicit specialist compensation exception approval",
        approve_range_exception: true,
        evidence_reference: "",
      },
      key(),
      corr,
    );
    expect(await offer(row.id)).toMatchObject({
      state: "approved",
      exception_approved_by: "r06.checker",
      outside_range: true,
    });
  });
  it("generates immutable letters, records delivery and response evidence without creating employment", async () => {
    const row = await draft();
    const employeesBefore = await pool.query<{ n: number }>(
      "select count(*)::int as n from employee where tenant_id=$1",
      [sourceTestTenantId],
    );
    await expect(action(row.id, "generate")).rejects.toMatchObject({ code: "HR_OFFER_TRANSITION_INVALID" });
    await action(row.id, "submit");
    await action(row.id, "approve", "r06.checker");
    await expect(
      action(row.id, "record_sent", undefined, { evidence_reference: "Email receipt" }),
    ).rejects.toMatchObject({ code: "HR_OFFER_TRANSITION_INVALID" });
    await action(row.id, "generate");
    const generated = await offer(row.id);
    expect(generated.document_text).toContain("EMPLOYMENT OFFER");
    expect(generated.document_text).toContain("PKR 150.0000");
    await expect(
      pool.query(
        "update hr_recruitment_offer set document_text='Altered',version=version+1 where tenant_id=$1 and id=$2",
        [sourceTestTenantId, row.id],
      ),
    ).rejects.toThrow(/immutable/);
    await action(row.id, "record_sent", undefined, { evidence_reference: "Email delivery receipt SENT-001" });
    const sent = await offer(row.id);
    await expect(
      action(row.id, "accept", undefined, {
        evidence_reference: "Signed offer",
        responded_on: shift(sent.context.today, 1),
      }),
    ).rejects.toMatchObject({ code: "HR_OFFER_RESPONSE_DATE_INVALID" });
    const accepted = await action(row.id, "accept", undefined, {
      evidence_reference: "Signed offer SIGNED-001",
      responded_on: sent.context.today,
    });
    const final = await offer(row.id);
    expect(final).toMatchObject({
      state: "accepted",
      response_reference: "Signed offer SIGNED-001",
      document_text: generated.document_text,
    });
    expect(hrOfferDetailSchema.safeParse(final).success).toBe(true);
    await expect(action(row.id, "withdraw")).rejects.toMatchObject({ code: "HR_OFFER_TRANSITION_INVALID" });
    await expect(
      pool.query("update hr_recruitment_offer set version=version+1 where tenant_id=$1 and id=$2", [
        sourceTestTenantId,
        row.id,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query("delete from hr_recruitment_offer_event where tenant_id=$1 and offer_id=$2", [
        sourceTestTenantId,
        row.id,
      ]),
    ).rejects.toThrow(/immutable/);
    expect(
      (
        await pool.query<{ n: number }>("select count(*)::int as n from employee where tenant_id=$1", [
          sourceTestTenantId,
        ])
      ).rows[0]!.n,
    ).toBe(employeesBefore.rows[0]!.n);
    expect(
      (
        await pool.query(
          "select id from platform_admin_audit_event where tenant_id=$1 and id=$2 and action='hr.offer.action'",
          [sourceTestTenantId, accepted.audit_event_id],
        )
      ).rowCount,
    ).toBe(1);
  });
  it("serializes competing approvals against one authorized opening", async () => {
    const parent = await pool.query<{ requisition_id: string }>(
      "select requisition_id from hr_job_opening where tenant_id=$1 and id=$2",
      [sourceTestTenantId, openingId],
    );
    const limited = await repo.createJobOpening(
      actor(),
      {
        company_id: company,
        requisition_id: parent.rows[0]!.requisition_id,
        title: "One-position concurrency test",
        positions_requested: 1,
        channels: ["Tests"],
      },
      key(),
      corr,
    );
    const offers = [];
    for (let n = 0; n < 2; n++) {
      const app = await selectedApplication(limited.id);
      const row = await repo.createOffer(actor(), await terms(app.id), key(), corr);
      await action(row.id, "submit");
      offers.push(row);
    }
    const results = await Promise.allSettled(offers.map((row) => action(row.id, "approve", "r06.checker")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "HR_OFFER_HEADCOUNT_EXCEEDED" },
    });
  });
  it("tracks expiry, permits replacement after withdrawal/rejection and bounds searches", async () => {
    const row = await draft();
    await expect(action(row.id, "expire")).rejects.toMatchObject({ code: "HR_OFFER_NOT_EXPIRED" });
    await pool.query(
      "update hr_recruitment_offer set valid_until=current_date-1,version=version+1 where tenant_id=$1 and id=$2",
      [sourceTestTenantId, row.id],
    );
    expect((await offer(row.id)).is_overdue).toBe(true);
    await expect(action(row.id, "submit")).rejects.toMatchObject({ code: "HR_OFFER_EXPIRED" });
    await action(row.id, "expire");
    const old = await offer(row.id);
    const replacement = await repo.createOffer(actor(), await terms(old.application_id), key(), corr);
    await action(replacement.id, "submit");
    await action(replacement.id, "reject_approval", "r06.checker");
    const next = await repo.createOffer(actor(), await terms(old.application_id), key(), corr);
    await action(next.id, "withdraw");
    const list = await repo.listOffers(actor(), { company_id: company, search: row.reference, offset: 0, limit: 1 });
    expect(list.total).toBe(1);
    expect(list.items[0]!.id).toBe(row.id);
    expect(
      (await repo.listOffers(actor(), { company_id: company, search: row.reference, offset: 1, limit: 1 })).items,
    ).toHaveLength(0);
  });
  it("validates HTTP actions and enforces cookies, CSRF and trusted origin", async () => {
    const session = {
      sessionId: "offers-session",
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
    const row = await draft();
    const endpoint = `/api/v1/hr/recruitment_offers/${row.id}`;
    expect((await request(app).get(endpoint + `?company_id=${company}`)).status).toBe(401);
    const read = await request(app)
      .get(endpoint + `?company_id=${company}`)
      .set("cookie", "nexora_session=test");
    expect(read.status).toBe(200);
    expect(hrOfferDetailSchema.safeParse(read.body).success).toBe(true);
    const send = (origin: string, csrf: string, data: object) =>
      request(app)
        .post(endpoint + "/actions")
        .set("cookie", "nexora_session=test")
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key())
        .send(data);
    const input = { company_id: company, expected_version: 1, action: "submit", reason: "Review the complete terms" };
    expect((await send("https://hr.example.test", "bad", input)).status).toBe(403);
    expect((await send("https://evil.example", session.csrfToken, input)).status).toBe(403);
    expect((await send("https://hr.example.test", session.csrfToken, { ...input, action: "accept" })).status).toBe(400);
    expect((await send("https://hr.example.test", session.csrfToken, input)).status).toBe(200);
  });
});
