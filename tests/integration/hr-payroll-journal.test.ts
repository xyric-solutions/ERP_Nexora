import { PassThrough } from "node:stream";
import request from "supertest";
import { vi } from "vitest";
import { createApp } from "../../server/api/src/app.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createJournalFixture, journalActor, journalPermissions } from "./hr-payroll-journal-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
run("Payroll accrual review and actual Finance posting", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createJournalFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(options: Parameters<typeof createJournalFixture>[1] = {}) {
    const f = await createJournalFixture(pool, options);
    fixtures.push(f);
    return f;
  }
  it("reconciles salary, tax, employer contributions, loan receivables and net pay through actual Finance posting", async () => {
    const f = await fixture();
    let w = await f.journalRead();
    expect(w.blocked).toEqual([]);
    expect(w.allowed_actions).toContain("prepare");
    expect(w.totals.debit).toBe("32550.0000");
    expect(w.totals.credit).toBe(w.totals.debit);
    expect(w.lines.find((l) => l.account_id === f.receivable)?.credit).toBe("33.3400");
    await f.journalAction("prepare");
    w = await f.journalRead("r06.checker");
    expect(w.proposal?.state).toBe("prepared");
    expect(w.allowed_actions).toContain("accept");
    await f.journalAction("accept", "r06.checker");
    expect((await f.journalRead()).period?.state).toBe("posting_ready");
    await f.journalAction("post", "r06.target");
    w = await f.journalRead();
    expect(w.proposal?.state).toBe("posted");
    expect(w.period?.state).toBe("posted");
    expect(w.proposal?.external_entry_number).toBeTruthy();
    const actual = (
      await pool.query(`select status from journal_entry where tenant_id=$1 and id=$2`, [
        tenant,
        w.proposal!.external_journal_id,
      ])
    ).rows[0];
    expect(actual.status).toBe("posted");
    const sums = (
      await pool.query(
        `select sum(debit)::text as debit,sum(credit)::text as credit from journal_line where tenant_id=$1 and journal_id=$2`,
        [tenant, w.proposal!.external_journal_id],
      )
    ).rows[0];
    expect(sums.debit).toBe("32550.00000000");
    expect(sums.credit).toBe(sums.debit);
    expect((await f.row()).details.recovered).toBe("33.3400");
    expect(w.history.map((h) => h.action)).toEqual(expect.arrayContaining(["prepare", "accept", "post"]));
  });
  it("rejects unapproved sources and independently reviews without maker/approver self-posting overrides", async () => {
    const unfinished = await fixture({ approve: false });
    expect((await unfinished.journalRead()).blocked.join(" ")).toContain("approve");
    await expect(unfinished.journalAction("prepare")).rejects.toMatchObject({ status: 409 });
    const f = await fixture();
    await f.journalAction("prepare");
    await expect(f.journalAction("accept")).rejects.toMatchObject({ status: 403 });
    await expect(f.journalAction("post", "r06.target")).rejects.toMatchObject({ status: 409 });
    await f.journalAction("accept", "r06.checker");
    await expect(f.journalAction("post", "r06.checker")).rejects.toMatchObject({ status: 403 });
  });
  it("replays preparation and posting once while rejecting stale fingerprints and revoked authority", async () => {
    const f = await fixture(),
      w = await f.journalRead(),
      input = {
        ...f.query,
        posting_date: w.posting_date,
        action: "prepare" as const,
        expected_version: 0,
        source_hash: w.source_hash,
        reason: "Idempotent exact accrual preparation",
      },
      key = randomUUID();
    const first = await f.repo.actOnPayrollJournal(journalActor(), input, key, "journal-test");
    expect(await f.repo.actOnPayrollJournal(journalActor(), input, key, "journal-test")).toMatchObject({
      ...first,
      replayed: true,
    });
    await expect(f.repo.actOnPayrollJournal(journalActor(), input, randomUUID(), "journal-test")).rejects.toMatchObject(
      { status: 409 },
    );
    await f.journalAction("accept", "r06.checker");
    const ready = await f.journalRead("r06.target"),
      post = {
        ...f.query,
        posting_date: ready.posting_date,
        action: "post" as const,
        expected_version: ready.proposal!.version,
        source_hash: ready.source_hash,
        reason: "Idempotent actual Finance posting",
      },
      postKey = randomUUID();
    await f.repo.actOnPayrollJournal(journalActor("r06.target"), post, postKey, "journal-test");
    expect(await f.repo.actOnPayrollJournal(journalActor("r06.target"), post, postKey, "journal-test")).toMatchObject({
      status: "posted",
      replayed: true,
    });
    await expect(
      f.repo.actOnPayrollJournal(
        journalActor(
          "r06.target",
          journalPermissions.filter((p) => p !== "finance.journal.read"),
        ),
        post,
        postKey,
        "journal-test",
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await pool.query(
          `select count(*)::int as n from accounting_event where tenant_id=$1 and source_type='hr.payroll' and source_id=$2`,
          [tenant, ready.period!.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("retains rejected revisions and can return accepted terms before preparing a new review", async () => {
    const f = await fixture();
    await f.journalAction("prepare");
    const first = (await f.journalRead()).proposal!.id;
    await f.journalAction("accept", "r06.checker");
    await f.journalAction("reject", "r06.checker");
    expect((await f.journalRead()).period!.state).toBe("approved");
    await f.journalAction("prepare");
    expect((await f.journalRead()).proposal!.revision).toBe(2);
    expect(
      (await pool.query(`select state from hr_payroll_journal_proposal where tenant_id=$1 and id=$2`, [tenant, first]))
        .rows[0].state,
    ).toBe("rejected");
  });
  it("blocks closed Finance periods, required dimensions and changed account roles", async () => {
    const f = await fixture();
    await pool.query(`update financial_period set status='closed' where tenant_id=$1 and company_id=$2`, [
      tenant,
      f.companyId,
    ]);
    expect((await f.journalRead()).blocked.join(" ")).toContain("open Finance period");
    await expect(f.journalAction("prepare")).rejects.toMatchObject({ status: 409 });
    await pool.query(`update financial_period set status='open' where tenant_id=$1 and company_id=$2`, [
      tenant,
      f.companyId,
    ]);
    await pool.query(`update account set required_dimensions='["cost_center"]'::jsonb where tenant_id=$1 and id=$2`, [
      tenant,
      f.expense,
    ]);
    expect((await f.journalRead()).dimension_requirements).toEqual([
      { account_id: f.expense, account_code: expect.any(String), required_dimensions: ["cost_center"] },
    ]);
    await expect(f.journalAction("prepare")).rejects.toMatchObject({ status: 409 });
    await pool.query(
      `update account set required_dimensions='[]'::jsonb,status='inactive' where tenant_id=$1 and id=$2`,
      [tenant, f.expense],
    );
    expect((await f.journalRead()).blocked.join(" ")).toContain("inactive");
  });
  it("enforces company/role scopes and cannot promote or edit a managed proposal directly", async () => {
    const f = await fixture();
    await expect(f.repo.getPayrollJournalWorkspace(journalActor("r06.restricted"), f.query)).rejects.toMatchObject({
      status: 403,
    });
    await expect(f.repo.getPayrollJournalWorkspace(journalActor("r06.target"), f.query)).resolves.toMatchObject({
      allowed_actions: [],
    });
    await f.journalAction("prepare");
    const w = await f.journalRead();
    await expect(
      pool.query(
        `update hr_payroll_journal_proposal set source_results_hash=$3,version=version+1 where tenant_id=$1 and id=$2`,
        [tenant, w.proposal!.id, "a".repeat(64)],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(`update hr_payroll_period set state='posted',version=version+1 where tenant_id=$1 and id=$2`, [
        tenant,
        w.period!.id,
      ]),
    ).rejects.toThrow();
  });
  it("posts through the normal statutory executor and actual HTTP authority, with CSRF and permission boundaries", async () => {
    const f = await createProductionJournalFixture(pool);
    try {
      const csrf = "j".repeat(43),
        session = {
          sessionId: "journal-http",
          tenantId: tenant,
          userId: "r06.maker",
          csrfToken: csrf,
          idleExpiresAt: new Date("2099-01-01"),
          absoluteExpiresAt: new Date("2099-01-01"),
        };
      const app = createApp({
        config: { allowedOrigins: new Set(["https://journal.example.test"]) },
        logger: createLogger(new PassThrough()),
        metrics: createMetrics(),
        readiness: {},
        hrRepository: f.repo,
        authService: {
          loadAuthenticatedAccount: vi.fn(async () => journalActor(session.userId).actor),
        } as unknown as TenantAuthApiService,
        sessionService: {
          get: vi.fn(async () => session),
          authorizeMutation: vi.fn(async (_token: string, value: string) =>
            value === csrf ? { status: "ok", session } : { status: "invalid_csrf" },
          ),
        } as unknown as TenantSessionApiService,
      });
      expect((await request(app).get("/api/v1/hr/payroll_journal").query(f.query)).status).toBe(401);
      let view = await f.journalRead();
      const body = {
        ...f.query,
        posting_date: view.posting_date,
        action: "prepare",
        expected_version: 0,
        source_hash: view.source_hash,
        reason: "Normal executor HTTP accrual acceptance",
      };
      expect(
        (
          await request(app)
            .post("/api/v1/hr/payroll_journal/actions")
            .set("cookie", "nexora_session=journal-http")
            .set("idempotency-key", randomUUID())
            .send(body)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post("/api/v1/hr/payroll_journal/actions")
            .set("cookie", "nexora_session=journal-http")
            .set("x-csrf-token", csrf)
            .set("idempotency-key", randomUUID())
            .send({ ...body, lines: [] })
        ).status,
      ).toBe(400);
      for (const [action, user] of [
        ["prepare", "r06.maker"],
        ["accept", "r06.checker"],
        ["post", "r06.target"],
      ] as const) {
        session.userId = user;
        view = await f.journalRead(user);
        const input = { ...body, action, expected_version: view.proposal?.version ?? 0, source_hash: view.source_hash },
          key = randomUUID();
        const response = await request(app)
          .post("/api/v1/hr/payroll_journal/actions")
          .set("cookie", "nexora_session=journal-http")
          .set("origin", "https://journal.example.test")
          .set("x-csrf-token", csrf)
          .set("idempotency-key", key)
          .send(input);
        expect(response.status, response.text).toBe(200);
        if (action === "post") {
          const replay = await request(app)
            .post("/api/v1/hr/payroll_journal/actions")
            .set("cookie", "nexora_session=journal-http")
            .set("origin", "https://journal.example.test")
            .set("x-csrf-token", csrf)
            .set("idempotency-key", key)
            .send(input);
          expect(replay.status).toBe(200);
          expect(replay.body.replayed).toBe(true);
        }
      }
      view = await f.journalRead();
      expect(view.proposal!.state).toBe("posted");
      expect(view.totals.debit).toBe("31000.0000");
      expect(view.proposal!.external_journal_id).toBeTruthy();
    } finally {
      await f.dispose();
    }
  });
  it("serializes competing post requests and preserves the exact remaining loan receivable", async () => {
    const f = await fixture();
    await f.journalAction("prepare");
    await f.journalAction("accept", "r06.checker");
    const ready = await f.journalRead("r06.target"),
      input = {
        ...f.query,
        posting_date: ready.posting_date,
        action: "post" as const,
        expected_version: ready.proposal!.version,
        source_hash: ready.source_hash,
        reason: "Concurrent duplicate-post prevention acceptance",
      };
    const attempts = await Promise.allSettled([
      f.repo.actOnPayrollJournal(journalActor("r06.target"), input, randomUUID(), "journal-test"),
      f.repo.actOnPayrollJournal(journalActor("r06.target"), input, randomUUID(), "journal-test"),
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((r) => r.status === "rejected")).toHaveLength(1);
    const balance = (
      await pool.query(
        "select (sum(debit)-sum(credit))::text as balance from journal_line where tenant_id=$1 and account_id=$2",
        [tenant, f.receivable],
      )
    ).rows[0].balance;
    expect(balance).toBe("66.66000000");
    const posted = await f.journalRead();
    await expect(
      pool.query("update journal_entry set status='reversed' where tenant_id=$1 and id=$2", [
        tenant,
        posted.proposal!.external_journal_id,
      ]),
    ).rejects.toThrow();
  });
  it("does not post after a Finance period closes and preserves accepted evidence for recovery", async () => {
    const f = await fixture();
    await f.journalAction("prepare");
    await f.journalAction("accept", "r06.checker");
    await pool.query("update financial_period set status='closed' where tenant_id=$1 and company_id=$2", [
      tenant,
      f.companyId,
    ]);
    await expect(f.journalAction("post", "r06.target")).rejects.toMatchObject({ status: 409 });
    expect((await f.journalRead()).proposal!.state).toBe("accepted");
    expect(
      (
        await pool.query(
          "select count(*)::int as n from accounting_event where tenant_id=$1 and source_type='hr.payroll' and source_id=$2",
          [tenant, (await f.journalRead()).period!.id],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("rejects balanced duplicate lines and appending lines after independent acceptance", async () => {
    const f = await fixture();
    await f.journalAction("prepare");
    let w = await f.journalRead();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      await client.query(
        "insert into hr_payroll_journal_line(id,tenant_id,proposal_id,account_id,debit,credit,position) select id||'-duplicate',tenant_id,proposal_id,account_id,debit,credit,position+1000 from hr_payroll_journal_line where tenant_id=$1 and proposal_id=$2",
        [tenant, w.proposal!.id],
      );
      await expect(client.query("commit")).rejects.toThrow();
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
    expect((await f.journalRead()).lines).toHaveLength(w.lines.length);
    await f.journalAction("accept", "r06.checker");
    w = await f.journalRead();
    await expect(
      pool.query(
        "insert into hr_payroll_journal_line(id,tenant_id,proposal_id,account_id,debit,credit,position) select id||'-late',tenant_id,proposal_id,account_id,debit,credit,position+1000 from hr_payroll_journal_line where tenant_id=$1 and proposal_id=$2",
        [tenant, w.proposal!.id],
      ),
    ).rejects.toThrow();
  });
  it("preserves historical proposals without posting dates as read-only accounting evidence", async () => {
    const f = await fixture(),
      before = await f.journalRead(),
      id = "historical-" + randomUUID(),
      client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      await client.query(
        "insert into hr_payroll_journal_proposal(id,tenant_id,company_id,period_id,created_by) values($1,$2,$3,$4,'r06.maker')",
        [id, tenant, f.companyId, before.period!.id],
      );
      for (const [i, l] of before.lines.entries())
        await client.query(
          "insert into hr_payroll_journal_line(id,tenant_id,proposal_id,account_id,debit,credit,position) values($1,$2,$3,$4,$5,$6,$7)",
          [randomUUID(), tenant, id, l.account_id, l.debit, l.credit, i + 1],
        );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    const after = await f.journalRead();
    expect(after.proposal!.workflow_managed).toBe(false);
    expect(after.allowed_actions).toEqual([]);
    expect(after.lines).toEqual(before.lines);
    expect(after.blocked.join(" ")).toContain("historical");
  });
});
