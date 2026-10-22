import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createLearningFixture, learningActor } from "./hr-learning-fixture.js";
import { hrLearningActionSchema, hrLearningSessionTermsSchema } from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Learning and Development governed ERP delivery", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createLearningFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createLearningFixture(pool);
    fixtures.push(f);
    return f;
  }
  it("requires ordered, non-overlapping lessons and rejects arbitrary certificate creation", () => {
    expect(
      hrLearningSessionTermsSchema.safeParse({
        kind: "session",
        programme_id: "p",
        title: "Course",
        trainer: "Trainer",
        location: "Room",
        capacity: 2,
        slots: [{ starts_at: "2026-10-22T11:00:00Z", ends_at: "2026-10-22T10:00:00Z" }],
      }).success,
    ).toBe(false);
    expect(
      hrLearningActionSchema.safeParse({
        action: "create",
        company_id: "c",
        expected_version: 0,
        terms: { kind: "completion", certificate_id: "fake" },
        reason: "Attempt arbitrary certificate creation",
      }).success,
    ).toBe(false);
  });
  it("publishes independently and freezes programme rules", async () => {
    const f = await fixture();
    await expect(
      f.act({
        action: "update",
        id: f.programme.id,
        expected_version: f.programme.version,
        terms: f.programmeTerms,
        reason: "Attempt to edit published learning rules",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const draft = await f.act({
      action: "create",
      expected_version: 0,
      terms: { ...f.programmeTerms, code: "DRAFT-" + randomUUID().slice(0, 12) },
      reason: "Create an independent learning policy draft",
    });
    await expect(f.transition(draft.id, "activate")).rejects.toMatchObject({ status: 403 });
    await f.transition(draft.id, "activate", "r06.checker");
    expect((await f.read()).total).toBe(2);
  });
  it("routes an employee request through the actual manager and a separate HR decision", async () => {
    const f = await fixture(),
      r = await f.request();
    expect(r.state).toBe("approved");
    expect(r.manager_user_id).toBe(f.managerId);
    expect(r.manager_decided_by).toBe(f.managerId);
    const own = await f.read("requests", r.id, "mine");
    expect(own.selected?.employee_id).toBe(f.person.employeeId);
    expect(own.can_manage).toBe(false);
  });
  it("prohibits other employee selectors on personal requests and cross-company reads", async () => {
    const f = await fixture();
    await expect(
      f.ownAct({
        action: "create",
        expected_version: 0,
        employee_id: f.manager.employeeId,
        terms: {
          kind: "request",
          programme_id: f.programme.id,
          justification: "Attempt another employee training request",
          goal_id: null,
          outcome_id: null,
        },
        reason: "Attempt another employee personal action",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.getLearning(f.own(), {
        company_id: "unassigned",
        mode: "mine",
        section: "requests",
        search: "",
        state: "all",
        limit: 10,
        offset: 0,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("checks request state, programme match and capacity before enrolment", async () => {
    const f = await fixture(),
      r = await f.request(),
      s = await f.session(true, 1),
      p = await f.enroll(r, s);
    expect(p.status).toBe("enrolled");
    await expect(f.enroll(r, s)).rejects.toMatchObject({ status: 409 });
    await expect(f.transition(s.id, "cancel")).rejects.toMatchObject({ status: 409 });
    await f.transition(p.id, "withdraw");
    expect((await f.row(p.id)).state).toBe("withdrawn");
    await f.enroll(r, s);
  });
  it("does not record attendance before a lesson is finished", async () => {
    const f = await fixture(),
      r = await f.request(),
      s = await f.session(),
      p = await f.enroll(r, s);
    await expect(f.attendance(p.id)).rejects.toMatchObject({ status: 409 });
  });
  it("requires complete evidence and independently certifies actual attendance and assessment", async () => {
    const f = await fixture(),
      r = await f.request(),
      s = await f.session(true),
      p = await f.enroll(r, s);
    await expect(f.transition(p.id, "propose_completion")).rejects.toMatchObject({ status: 409 });
    await f.attendance(p.id);
    const proposal = await f.transition(p.id, "propose_completion");
    await expect(f.transition(proposal.id, "finalize")).rejects.toMatchObject({ status: 403 });
    const result = await f.transition(proposal.id, "finalize", "r06.checker");
    expect(result.status).toBe("issued");
    expect((await f.row(p.id)).state).toBe("completed");
    expect((await f.row(r.id)).state).toBe("fulfilled");
    const cert = await f.repo.getLearningCertificate(f.own(), f.companyId, result.id);
    expect(cert.record.terms.kind).toBe("completion");
    expect((await f.read("completions")).gap_total).toBe(1);
    await f.transition(s.id, "close");
    expect((await f.row(s.id)).state).toBe("closed");
  });
  it("records failed learning without issuing a downloadable certificate", async () => {
    const f = await fixture(),
      r = await f.request(),
      s = await f.session(true),
      p = await f.enroll(r, s);
    await f.attendance(p.id, 30, 20);
    const c = await f.transition(p.id, "propose_completion");
    expect((await f.transition(c.id, "finalize", "r06.checker")).status).toBe("failed");
    await expect(f.repo.getLearningCertificate(f.own(), f.companyId, c.id)).rejects.toMatchObject({ status: 409 });
  });
  it("returns submitted evidence for correction without erasing its history", async () => {
    const f = await fixture(),
      r = await f.request(),
      s = await f.session(true),
      p = await f.enroll(r, s);
    await f.attendance(p.id);
    const first = await f.transition(p.id, "propose_completion");
    await expect(f.attendance(p.id, 10)).rejects.toMatchObject({ status: 409 });
    await f.transition(first.id, "void", "r06.checker");
    await f.attendance(p.id, 45, 60);
    const second = await f.transition(p.id, "propose_completion");
    expect(second.id).not.toBe(first.id);
    expect((await f.row(first.id)).state).toBe("voided");
  });
  it("revokes a certificate, restores the mandatory gap and permits a renewal request", async () => {
    const f = await fixture(),
      r = await f.request(),
      s = await f.session(true),
      p = await f.enroll(r, s);
    await f.attendance(p.id);
    const c = await f.transition(p.id, "propose_completion");
    await f.transition(c.id, "finalize", "r06.checker");
    await f.transition(c.id, "revoke", "r06.checker");
    await expect(f.repo.getLearningCertificate(f.own(), f.companyId, c.id)).rejects.toMatchObject({ status: 409 });
    expect((await f.read("completions")).gap_total).toBe(2);
    const renewed = await f.request();
    expect(renewed.id).not.toBe(r.id);
  });
  it("requires valid prerequisite certificates and validates performance ownership", async () => {
    const f = await fixture();
    const draft = await f.act({
      action: "create",
      expected_version: 0,
      terms: { ...f.programmeTerms, code: "PREREQ-" + randomUUID().slice(0, 12), prerequisite_ids: [f.programme.id] },
      reason: "Create advanced learning programme with prerequisite",
    });
    await f.transition(draft.id, "activate", "r06.checker");
    const r = await f.ownAct({
      action: "create",
      expected_version: 0,
      terms: {
        kind: "request",
        programme_id: draft.id,
        justification: "Advanced learning need with required prerequisite",
        goal_id: null,
        outcome_id: null,
      },
      reason: "Request prerequisite governed company learning",
    });
    await expect(
      f.ownAct({
        action: "submit",
        id: r.id,
        expected_version: 1,
        reason: "Submit advanced learning before completing prerequisite",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.act({
        action: "create",
        employee_id: f.person.employeeId,
        expected_version: 0,
        terms: {
          kind: "request",
          programme_id: f.programme.id,
          justification: "Link arbitrary employee performance outcome",
          goal_id: "another-company-goal",
          outcome_id: null,
        },
        reason: "Attempt mismatched performance ownership reference",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rechecks access and ownership before idempotent replay", async () => {
    const f = await fixture(),
      key = randomUUID(),
      input = {
        action: "create",
        expected_version: 0,
        terms: {
          kind: "request",
          programme_id: f.programme.id,
          justification: "Personal development request with retry protection",
          goal_id: null,
          outcome_id: null,
        },
        reason: "Create personal training with idempotent retry",
      };
    const first = await f.ownAct(input, key),
      second = await f.ownAct(input, key);
    expect(second.replayed).toBe(true);
    expect(second.id).toBe(first.id);
    await pool.query(
      "update security_user_company_access set revoked_at=now(),revoked_by='r06.last-admin-a',revocation_reason='Isolated learning access revocation' where tenant_id=$1 and company_id=$2 and user_id=$3 and revoked_at is null",
      [tenant, f.companyId, f.user],
    );
    await expect(f.ownAct(input, key)).rejects.toMatchObject({ status: 403 });
  });
  it("protects state, evidence and tenant isolation in the persistence layer", async () => {
    const f = await fixture();
    await expect(
      pool.query("delete from hr_learning_record where tenant_id=$1 and id=$2", [tenant, f.programme.id]),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      pool.query("delete from hr_learning_event where tenant_id=$1 and record_id=$2", [tenant, f.programme.id]),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      pool.query("update hr_learning_record set state='archived',version=version+1 where tenant_id=$1 and id=$2", [
        tenant,
        f.programme.id,
      ]),
    ).rejects.toMatchObject({ code: "P0001" });
    const role = (await pool.query("select relforcerowsecurity from pg_class where oid='hr_learning_record'::regclass"))
      .rows[0];
    expect(role.relforcerowsecurity).toBe(true);
  });
  it("denies impersonated writes and forged permission snapshots", async () => {
    const f = await fixture();
    const input = hrLearningActionSchema.parse({
      action: "archive",
      company_id: f.companyId,
      id: f.programme.id,
      expected_version: f.programme.version,
      reason: "Attempt impersonated learning policy change",
    });
    await expect(
      f.repo.actOnLearning(
        { ...learningActor(), impersonationRequestId: "impersonated" },
        input,
        randomUUID(),
        "impersonated",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.actOnLearning(learningActor(f.user), input, randomUUID(), "forged-snapshot"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("certifies the same UTC completion date in a database session west of UTC", async () => {
    const otherURL = new URL(url!);
    otherURL.searchParams.set("options", "-c timezone=Pacific/Niue");
    const other = createDatabasePool(otherURL.toString());
    let f: Awaited<ReturnType<typeof createLearningFixture>> | undefined;
    try {
      f = await createLearningFixture(other);
      const r = await f.request(),
        s = await f.session(true),
        p = await f.enroll(r, s);
      await f.attendance(p.id);
      const c = await f.transition(p.id, "propose_completion");
      expect((await f.transition(c.id, "finalize", "r06.checker")).status).toBe("issued");
      const certificate = await f.repo.getLearningCertificate(f.own(), f.companyId, c.id);
      expect(certificate.record.terms.kind === "completion" && certificate.record.terms.completed_on).toBe(
        s.terms.kind === "session" ? new Date(s.terms.slots.at(-1)!.ends_at).toISOString().slice(0, 10) : "",
      );
    } finally {
      await f?.dispose();
      await other.end();
    }
  });
  it("replays a routed manager decision after its state has advanced without a second decision", async () => {
    const f = await fixture();
    const r = await f.ownAct({
      action: "create",
      expected_version: 0,
      terms: {
        kind: "request",
        programme_id: f.programme.id,
        justification: "Personal development request for retry testing",
        goal_id: null,
        outcome_id: null,
      },
      reason: "Create manager approval retry acceptance",
    });
    await f.ownAct({
      action: "submit",
      id: r.id,
      expected_version: 1,
      reason: "Submit the reviewed manager approval retry request",
    });
    const key = randomUUID(),
      input = {
        action: "manager_approve",
        id: r.id,
        expected_version: 2,
        reason: "Manager independently approves the employee development need",
      };
    const first = await f.act(input, f.managerId, key),
      second = await f.act(input, f.managerId, key);
    expect(second.replayed).toBe(true);
    expect(second.audit_event_id).toBe(first.audit_event_id);
    expect((await f.row(r.id)).version).toBe(3);
  });
  it("replays certification using immutable assessor evidence after participation is completed", async () => {
    const f = await fixture(),
      r = await f.request(),
      s = await f.session(true),
      p = await f.enroll(r, s);
    await f.attendance(p.id);
    const c = await f.transition(p.id, "propose_completion"),
      key = randomUUID(),
      input = {
        action: "finalize",
        id: c.id,
        expected_version: 1,
        reason: "Independently certify reviewed attendance and assessment evidence",
      };
    const first = await f.act(input, "r06.checker", key),
      second = await f.act(input, "r06.checker", key);
    expect(second.replayed).toBe(true);
    expect(second.audit_event_id).toBe(first.audit_event_id);
    expect((await f.row(p.id)).version).toBe(3);
    expect((await f.row(c.id)).version).toBe(2);
  });
});
