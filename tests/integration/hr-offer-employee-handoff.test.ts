import {
  createHrOfferEmployeeRequestSchema,
  hrOfferEmployeeWorkspaceSchema,
} from "../../packages/contracts/src/hr/index.js";
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
    "hr.employee_assignment.create",
    "hr.employee_assignment.read",
    "hr.employment_lifecycle.action",
    "hr.employment_relationship.create",
    "hr.employment_lifecycle.approve",
    "hr.employment_lifecycle_policy.manage",
    "hr.employment_lifecycle_policy.approve",
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

run("Accepted offer employee handoff", () => {
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

  const accepted = async () => {
    const row = await draft();
    vi.restoreAllMocks();
    await action(row.id, "submit");
    await action(row.id, "approve", "r06.checker");
    await action(row.id, "generate");
    await action(row.id, "record_sent", undefined, { evidence_reference: "Integration delivery receipt" });
    const current = await offer(row.id);
    await action(row.id, "accept", undefined, {
      evidence_reference: "Signed integration acceptance",
      responded_on: current.context.today,
    });
    return offer(row.id);
  };
  const input = (version: number) => ({
    company_id: company,
    expected_version: version,
    employee_number: `O${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`,
    reason: "Prepare approved recruitment employee profile",
  });
  const assignment = (o: Awaited<ReturnType<typeof offer>>) => ({
    company_id: company,
    branch_id: o.context.branch_id,
    department_id: o.context.department_id,
    designation_id: o.context.designation_id,
    job_grade_id: o.context.job_grade_id,
    cost_center_id: o.cost_center_id,
    work_location_id: o.work_location_id,
    employment_type_id: o.context.employment_type_id,
    employee_category_id: o.employee_category_id,
    reporting_manager_id: o.reporting_manager_id ?? undefined,
    effective_from: o.joining_on,
  });

  it("requires salary visibility, employee creation, company and tenant scope", async () => {
    const o = await accepted();
    await expect(
      repo.getOfferEmployeeWorkspace(actor("r06.maker", ["hr.employee.read"]), company, o.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.createOfferEmployee(
        actor("r06.maker", ["hr.employee.read", "hr.payroll.salary.read"]),
        o.id,
        input(o.version),
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.getOfferEmployeeWorkspace(actor("r06.restricted"), otherCompany, o.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(repo.getOfferEmployeeWorkspace(actor(), otherCompany, o.id)).rejects.toMatchObject({ status: 404 });
    const foreign = actor();
    foreign.tenantId = "foreign";
    foreign.actor.tenantId = "foreign";
    await expect(repo.getOfferEmployeeWorkspace(foreign, company, o.id)).rejects.toMatchObject({ status: 403 });
  });
  it("requires accepted evidence and rejects stale or extra client-supplied terms", async () => {
    const d = await draft();
    vi.restoreAllMocks();
    await expect(repo.createOfferEmployee(actor(), d.id, input(d.version), key(), corr)).rejects.toMatchObject({
      code: "HR_OFFER_HANDOFF_NOT_READY",
    });
    const o = await accepted();
    await expect(repo.createOfferEmployee(actor(), o.id, input(o.version - 1), key(), corr)).rejects.toMatchObject({
      code: "HR_OFFER_STALE",
    });
    expect(
      createHrOfferEmployeeRequestSchema.safeParse({ ...input(o.version), proposed_gross: "1", company_id: company })
        .success,
    ).toBe(false);
  });
  it("atomically creates one source-linked draft on concurrent replay without employment or payroll", async () => {
    const o = await accepted(),
      fields = input(o.version),
      token = key();
    const before = await pool.query<{ n: number }>(
      "select count(*)::int as n from hr_employment_relationship where tenant_id=$1",
      [sourceTestTenantId],
    );
    const results = await Promise.all([
      repo.createOfferEmployee(actor(), o.id, fields, token, corr),
      repo.createOfferEmployee(actor(), o.id, fields, token, corr),
    ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    const view = await repo.getOfferEmployeeWorkspace(actor(), company, o.id);
    expect(hrOfferEmployeeWorkspaceSchema.safeParse(view).success).toBe(true);
    expect(view).toMatchObject({
      application_stage: "selected",
      handoff: {
        employee_id: results[0]!.id,
        employee_status: "draft",
        profile_approval: "draft",
        assignment_id: null,
        hire_state: null,
      },
    });
    const profile = await pool.query(
      "select first_name,last_name,joined_on::text,personal_email,work_email from employee where tenant_id=$1 and id=$2",
      [sourceTestTenantId, results[0]!.id],
    );
    expect(profile.rows[0]).toEqual({
      first_name: view.candidate.first_name,
      last_name: view.candidate.last_name,
      joined_on: o.joining_on,
      personal_email: view.candidate.email,
      work_email: "",
    });
    expect((await offer(o.id)).document_text).toBe(o.document_text);
    expect((await offer(o.id)).proposed_gross).toBe(o.proposed_gross);
    expect(
      (
        await pool.query<{ n: number }>(
          "select count(*)::int as n from hr_employment_relationship where tenant_id=$1",
          [sourceTestTenantId],
        )
      ).rows[0]!.n,
    ).toBe(before.rows[0]!.n);
    await expect(repo.createOfferEmployee(actor(), o.id, fields, key(), corr)).rejects.toMatchObject({
      code: "HR_OFFER_EMPLOYEE_EXISTS",
    });
    await expect(
      repo.createOfferEmployee(actor(), o.id, { ...fields, employee_number: "CHANGED" }, token, corr),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      pool.query("delete from hr_offer_employee_handoff where tenant_id=$1 and offer_id=$2", [
        sourceTestTenantId,
        o.id,
      ]),
    ).rejects.toThrow(/immutable/);
  });
  it("rolls back duplicate employee numbers and detects existing employee identities", async () => {
    const o = await accepted(),
      fields = { ...input(o.version), employee_number: "R06-UAT-001" };
    await expect(repo.createOfferEmployee(actor(), o.id, fields, key(), corr)).rejects.toMatchObject({
      code: "HR_EMPLOYEE_ALREADY_EXISTS",
    });
    expect((await repo.getOfferEmployeeWorkspace(actor(), company, o.id)).handoff).toBeNull();
    const view = await repo.getOfferEmployeeWorkspace(actor(), company, o.id);
    await repo.createEmployeeDraft(
      actor(),
      {
        company_id: company,
        employee_number: input(1).employee_number,
        first_name: "Existing",
        last_name: "Identity",
        joined_on: o.joining_on,
        work_email: view.candidate.email,
      },
      key(),
      corr,
    );
    await expect(repo.createOfferEmployee(actor(), o.id, input(o.version), key(), corr)).rejects.toMatchObject({
      code: "HR_EMPLOYEE_IDENTITY_EXISTS",
    });
    expect((await repo.getOfferEmployeeWorkspace(actor(), company, o.id)).handoff).toBeNull();
  });
  it("preserves profile approval and accepted assignment terms, then advances recruitment only on hire approval", async () => {
    const o = await accepted(),
      employee = await repo.createOfferEmployee(actor(), o.id, input(o.version), key(), corr),
      terms = assignment(o);
    await expect(repo.createProfileDraftAssignment(actor(), employee.id, terms, key(), corr)).rejects.toMatchObject({
      code: "HR_ASSIGNMENT_NOT_ALLOWED",
    });
    await expect(
      repo.updateEmployeeDraft(actor(), employee.id, { joined_on: shift(o.joining_on, 1) }, key(), corr),
    ).rejects.toMatchObject({ code: "HR_OFFER_JOINING_DATE_MISMATCH" });
    await repo.submitEmployeeDraft(
      actor(),
      employee.id,
      { reason: "Profile independently checked for onboarding" },
      key(),
      corr,
    );
    await expect(
      repo.decideEmployeeDraftApproval(
        actor(),
        employee.id,
        { decision: "approved", reason: "Independent review required" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await repo.decideEmployeeDraftApproval(
      actor("r06.checker"),
      employee.id,
      { decision: "approved", reason: "Profile independently approved for onboarding" },
      key(),
      corr,
    );
    await expect(
      repo.createProfileDraftAssignment(
        actor(),
        employee.id,
        { ...terms, effective_from: shift(o.joining_on, 1) },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_OFFER_ASSIGNMENT_MISMATCH" });

    const a = await repo.createProfileDraftAssignment(actor(), employee.id, terms, key(), corr);
    const futureAssignments = await repo.listEmployeeAssignments(actor(), employee.id);
    expect(futureAssignments.items.some((row) => row.id === a.id && row.effective_from === o.joining_on)).toBe(true);
    await expect(repo.listEmployeeAssignments(actor("unassigned-user"), employee.id)).rejects.toMatchObject({
      status: 404,
    });
    const existing = await pool.query<{ id: string }>(
      "select id from hr_employment_lifecycle_policy where tenant_id=$1 and legal_employer_id=$2 and status='active' and effective_from<=$3 and (effective_to is null or effective_to>=$3)",
      [sourceTestTenantId, company, o.joining_on],
    );
    if (!existing.rowCount) {
      const policy = await repo.createEmploymentLifecyclePolicy(
        actor(),
        {
          company_id: company,
          code: `OH-${randomUUID().slice(0, 8).toUpperCase()}`,
          name: "Offer handoff hire policy",
          effective_from: o.context.today,
        },
        key(),
        corr,
      );
      await repo.submitEmploymentLifecyclePolicy(
        actor(),
        policy.id,
        { reason: "Policy for independent hire governance" },
        key(),
        corr,
      );
      await repo.approveEmploymentLifecyclePolicy(
        actor("r06.checker"),
        policy.id,
        { reason: "Independent policy approval" },
        key(),
        corr,
      );
      await repo.activateEmploymentLifecyclePolicy(
        actor("r06.checker"),
        policy.id,
        { reason: "Activate independently approved policy" },
        key(),
        corr,
      );
    }
    const job = await repo.createJob(
      actor(),
      {
        company_id: company,
        code: `OH-${randomUUID().slice(0, 8).toUpperCase()}`,
        name: `Offer handoff approved job ${randomUUID()}`,
        description: "Integration hire authority",
      },
      key(),
      corr,
    );
    const hireInput = {
      company_id: company,
      job_id: job.id,
      profile_draft_assignment_id: a.id,
      effective_on: o.joining_on,
      reason: "Hire according to accepted offer terms",
    };
    await expect(
      repo.createEmployeeHireRequest(
        actor(),
        employee.id,
        { ...hireInput, effective_on: shift(o.joining_on, 1) },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ code: "HR_OFFER_HIRE_MISMATCH" });
    const hire = await repo.createEmployeeHireRequest(actor(), employee.id, hireInput, key(), corr);
    expect((await repo.getOfferEmployeeWorkspace(actor(), company, o.id)).application_stage).toBe("selected");
    await expect(
      repo.decideEmployeeHireRequest(
        actor(),
        employee.id,
        hire.id,
        { decision: "approved", reason: "Independent decision required" },
        key(),
        corr,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const openingBefore = await repo.listJobOpenings(actor(), {
      company_id: company,
      search: o.context.opening_reference,
      limit: 50,
    });
    const filledBefore = openingBefore.items[0]!.filled_positions;
    const token = key();
    await repo.decideEmployeeHireRequest(
      actor("r06.checker"),
      employee.id,
      hire.id,
      { decision: "approved", reason: "Hire independently approved with accepted offer evidence" },
      token,
      corr,
    );
    expect(await repo.getOfferEmployeeWorkspace(actor(), company, o.id)).toMatchObject({
      application_stage: "hired",
      handoff: { hire_state: "approved", employee_status: "active" },
    });
    const openingAfter = await repo.listJobOpenings(actor(), {
      company_id: company,
      search: o.context.opening_reference,
      limit: 50,
    });
    expect(openingAfter.items[0]!.filled_positions).toBe(filledBefore + 1);
    expect(openingAfter.items[0]!.remaining_positions).toBe(
      openingAfter.items[0]!.positions_requested - openingAfter.items[0]!.filled_positions,
    );
    expect(
      (
        await pool.query(
          "select id from hr_recruitment_application_event where tenant_id=$1 and application_id=$2 and to_stage='hired'",
          [sourceTestTenantId, o.application_id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await repo.decideEmployeeHireRequest(
          actor("r06.checker"),
          employee.id,
          hire.id,
          { decision: "approved", reason: "Hire independently approved with accepted offer evidence" },
          token,
          corr,
        )
      ).replayed,
    ).toBe(true);
  });
  it("enforces HTTP authentication, CSRF, trusted origin and strict validation", async () => {
    const session = {
      sessionId: "handoff-session",
      tenantId: sourceTestTenantId,
      userId: "r06.maker",
      csrfToken: "c".repeat(43),
      idleExpiresAt: new Date("2099-01-01"),
      absoluteExpiresAt: new Date("2099-01-01"),
    };
    const api = createApp({
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
    const o = await accepted(),
      endpoint = `/api/v1/hr/recruitment_offers/${o.id}/employee`,
      fields = input(o.version);
    expect((await request(api).get(`${endpoint}?company_id=${company}`)).status).toBe(401);
    expect(
      (await request(api).get(`${endpoint}?company_id=${company}`).set("cookie", "nexora_session=test")).status,
    ).toBe(200);
    const send = (origin: string, csrf: string, body: object) =>
      request(api)
        .post(endpoint)
        .set("cookie", "nexora_session=test")
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key())
        .send(body);
    expect((await send("https://evil.example", session.csrfToken, fields)).status).toBe(403);
    expect((await send("https://hr.example.test", "bad", fields)).status).toBe(403);
    expect((await send("https://hr.example.test", session.csrfToken, { ...fields, proposed_gross: "1" })).status).toBe(
      400,
    );
    const result = await send("https://hr.example.test", session.csrfToken, fields);
    expect(result.status).toBe(201);
    expect(result.body.status).toBe("draft");
  });
});
