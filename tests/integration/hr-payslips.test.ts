import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createPayslipFixture, payslipActor, payslipPermissions } from "./hr-payslips-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
run("Independent immutable payslip publication without Banking", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createPayslipFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(posted = true) {
    const f = await createPayslipFixture(pool, posted);
    fixtures.push(f);
    return f;
  }
  it("previews the normal production executor, releases exact results, freezes labels and leaves payment state posted", async () => {
    const f = await fixture(),
      w = await f.payslipRead();
    expect(w.blocked).toEqual([]);
    expect(w.can_release).toBe(true);
    expect(w.items[0]?.state).toBe("pending");
    const resultId = w.items[0]!.result_id,
      preview = await f.payslipDetail(resultId);
    expect(preview.release).toBeNull();
    expect(preview.document.lines.some((l) => l.kind === "earning")).toBe(true);
    const input = {
        ...f.query,
        result_ids: [resultId],
        source_hash: w.source_hash,
        reason: "Independent official publication of exact posted payslip",
      },
      key = randomUUID();
    await f.repo.releasePayslips(payslipActor(), input, key, "payslip-test");
    expect(await f.repo.releasePayslips(payslipActor(), input, key, "payslip-test")).toMatchObject({
      replayed: true,
      status: "released",
    });
    const published = await f.payslipDetail(resultId);
    expect(published.release?.publication_hash).toHaveLength(64);
    expect(published.document).toEqual(preview.document);
    await pool.query(`update employee set first_name='Changed later' where tenant_id=$1 and id=$2`, [
      tenant,
      published.document.employee.id,
    ]);
    expect((await f.payslipDetail(resultId)).document.employee.name).toBe(preview.document.employee.name);
    const after = await f.payslipRead();
    expect(after.counts.released).toBe(1);
    expect(after.period?.state).toBe("posted");
    expect(after.history[0]?.action).toBe("release");
    expect(
      (
        await pool.query(`select 1 from hr_payroll_payment_batch where tenant_id=$1 and company_id=$2`, [
          tenant,
          f.companyId,
        ])
      ).rowCount,
    ).toBe(0);
  });
  it("requires actual posted Payroll and prevents maker self-publication", async () => {
    const unposted = await fixture(false);
    expect((await unposted.payslipRead()).blocked.join(" ")).toContain("Post");
    await expect(unposted.release()).rejects.toMatchObject({ status: 409 });
    const f = await fixture();
    expect((await f.payslipRead("r06.maker")).can_release).toBe(false);
    await expect(f.release("r06.maker")).rejects.toMatchObject({ status: 403 });
  });
  it("rejects stale evidence, wrong-company results and duplicate publication atomically", async () => {
    const f = await fixture(),
      w = await f.payslipRead(),
      id = w.items[0]!.result_id;
    await expect(
      f.repo.releasePayslips(
        payslipActor(),
        { ...f.query, result_ids: [id], source_hash: "0".repeat(64), reason: "Stale evidence must fail" },
        randomUUID(),
        "payslip-test",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(f.release("r06.checker", [id, "foreign-result"])).rejects.toMatchObject({ status: 409 });
    expect((await f.payslipRead()).counts.released).toBe(0);
    await f.release();
    await expect(f.release("r06.checker", [id])).rejects.toMatchObject({ status: 409 });
  });
  it("rechecks company permission on replay and never lets a result ID bypass company access", async () => {
    const f = await fixture(),
      w = await f.payslipRead(),
      id = w.items[0]!.result_id,
      input = { ...f.query, result_ids: [id], source_hash: w.source_hash, reason: "Revocable publication authority" },
      key = randomUUID();
    await f.repo.releasePayslips(payslipActor(), input, key, "payslip-test");
    await pool.query(
      `delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-checker' and permission_key='hr.payroll.payslip.release' and scope_value=$2`,
      [tenant, f.companyId],
    );
    await expect(f.repo.releasePayslips(payslipActor(), input, key, "payslip-test")).rejects.toMatchObject({
      status: 403,
    });
    await expect(f.repo.getPayslipDetail(payslipActor("r06.other"), f.companyId, id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      f.repo.getPayslipWorkspace(
        payslipActor(
          "r06.checker",
          payslipPermissions.filter((p) => p !== "hr.payroll.result.read"),
        ),
        { ...f.query, search: "", state: "all", limit: 25, offset: 0 },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("keeps publication snapshots immutable and serializes competing releases", async () => {
    const f = await fixture(),
      w = await f.payslipRead(),
      id = w.items[0]!.result_id,
      input = { ...f.query, result_ids: [id], source_hash: w.source_hash, reason: "Concurrent publication only once" };
    const results = await Promise.allSettled(
      [1, 2].map(() => f.repo.releasePayslips(payslipActor(), input, randomUUID(), "payslip-test")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      pool.query(`update hr_payslip_release set publication_snapshot='{}' where tenant_id=$1 and company_id=$2`, [
        tenant,
        f.companyId,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query(`delete from hr_payslip_release where tenant_id=$1 and company_id=$2`, [tenant, f.companyId]),
    ).rejects.toThrow();
  });
  it("provides bounded search, release filtering and detail preview without changing Payroll", async () => {
    const f = await fixture(),
      w = await f.payslipRead();
    expect((await f.payslipRead("r06.checker", { search: "will-not-match" })).total).toBe(0);
    expect((await f.payslipRead("r06.checker", { state: "released" })).total).toBe(0);
    expect((await f.payslipRead("r06.checker", { limit: 1, offset: 1 })).items).toEqual([]);
    await f.release();
    expect((await f.payslipRead("r06.checker", { state: "pending" })).total).toBe(0);
    expect((await f.payslipRead("r06.checker", { search: w.items[0]!.employee_number, state: "released" })).total).toBe(
      1,
    );
  });
});
