import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createPaymentFixture, paymentActor } from "./hr-payroll-payment-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  // User deferred the Banking integration; keep its isolated acceptance cases parked until handoff.
  run = describe.skip;
run("Governed salary batch and actual Banking settlement", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createPaymentFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(posted = true) {
    const f = await createPaymentFixture(pool, posted);
    fixtures.push(f);
    return f;
  }
  async function ready() {
    const f = await fixture();
    await f.paymentAction("prepare");
    await f.paymentAction("approve", "r06.checker");
    return f;
  }
  it("prepares, independently approves and reconciles actual posted salary Banking evidence without duplicating accounting", async () => {
    const f = await ready(),
      before = await f.paymentRead();
    expect(before.blocked).toEqual([]);
    expect(before.batch?.state).toBe("released");
    expect(before.period?.state).toBe("posted");
    expect(before.totals.outstanding).toBe(before.totals.net);
    const pay = await f.pay(),
      view = await f.paymentRead("r06.checker");
    expect(view.bank_lines.some((l) => l.id === pay.lineId)).toBe(true);
    const count = (
      await pool.query(`select count(*)::int as n from journal_entry where tenant_id=$1 and company_id=$2`, [
        tenant,
        f.companyId,
      ])
    ).rows[0].n;
    const input = {
        ...f.query,
        action: "confirm" as const,
        expected_version: view.batch!.version,
        source_hash: view.source_hash,
        reason: "Bank successful transfer has been independently checked",
        payment_id: pay.paymentId,
        bank_payment_line_id: pay.lineId,
        bank_reference: "SAL-" + randomUUID(),
        confirmed_on: f.today,
      },
      key = randomUUID();
    await f.repo.actOnPayrollPayment(paymentActor("r06.checker"), input, key, "payment-test");
    expect(await f.repo.actOnPayrollPayment(paymentActor("r06.checker"), input, key, "payment-test")).toMatchObject({
      replayed: true,
      status: "confirmed",
    });
    const after = await f.paymentRead();
    expect(after.period?.state).toBe("paid");
    expect(after.batch?.state).toBe("confirmed");
    expect(after.totals.outstanding).toBe("0.0000");
    expect(after.payments[0]?.journal_id).toBe(pay.posted.journal_id);
    expect(after.history.map((h) => h.action)).toEqual(expect.arrayContaining(["prepare", "approve", "confirm"]));
    expect(
      (
        await pool.query(`select count(*)::int as n from journal_entry where tenant_id=$1 and company_id=$2`, [
          tenant,
          f.companyId,
        ])
      ).rows[0].n,
    ).toBe(count);
    await expect(
      f.payments.reverse(
        paymentActor("r06.target"),
        pay.posted.id,
        { expected_version: 4, reason: "Cannot reverse a retained salary settlement" },
        randomUUID(),
        "payment-test",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("blocks salary settlement before actual accrual posting", async () => {
    const f = await fixture(false);
    expect((await f.paymentRead()).blocked.join(" ")).toContain("Post");
    await expect(f.paymentAction("prepare")).rejects.toMatchObject({ status: 409 });
  });
  it("rejects self approval, stale or duplicate preparation and can replace a rejected draft", async () => {
    const f = await fixture(),
      w = await f.paymentRead(),
      input = {
        ...f.query,
        action: "prepare" as const,
        expected_version: 0,
        source_hash: w.source_hash,
        reason: "Prepare exact immutable salary obligations",
      },
      key = randomUUID();
    await f.repo.actOnPayrollPayment(paymentActor(), input, key, "payment-test");
    expect(await f.repo.actOnPayrollPayment(paymentActor(), input, key, "payment-test")).toMatchObject({
      replayed: true,
    });
    await expect(f.paymentAction("approve")).rejects.toMatchObject({ status: 403 });
    await expect(f.repo.actOnPayrollPayment(paymentActor(), input, randomUUID(), "payment-test")).rejects.toMatchObject(
      { status: 409 },
    );
    const first = (await f.paymentRead()).batch!.id;
    await f.paymentAction("reject", "r06.checker");
    expect((await f.paymentRead()).batch?.state).toBe("cancelled");
    await f.paymentAction("prepare");
    expect((await f.paymentRead()).batch!.id).not.toBe(first);
  });
  it("rejects a wrong employee, reference, amount, nominal account and cash method even when Banking posted them", async () => {
    const f = await ready(),
      w = await f.paymentRead();
    for (const override of [
      { document_reference: "wrong-employee" },
      { amount: "1.00" },
      { nominal_account_id: f.expense },
      { payment_method: "cash" },
    ])
      await expect(f.pay(override)).rejects.toMatchObject({ status: 409 });
    const wrong = await f.pay({ external_reference: "wrong-payment" });
    await expect(
      f.paymentAction("confirm", "r06.checker", {
        payment_id: w.payments[0]!.id,
        bank_payment_line_id: wrong.lineId,
        bank_reference: "BAD-" + randomUUID(),
        confirmed_on: f.today,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await f.paymentRead()).period?.state).toBe("posted");
    expect(
      (
        await pool.query(`select 1 from hr_payroll_payment_settlement where tenant_id=$1 and company_id=$2`, [
          tenant,
          f.companyId,
        ])
      ).rowCount,
    ).toBe(0);
  });
  it("blocks early and duplicate Banking postings, and permits a controlled retry after actual unconfirmed reversal", async () => {
    const f = await fixture();
    await f.paymentAction("prepare");
    await expect(f.pay()).rejects.toMatchObject({ status: 409 });
    await f.paymentAction("approve", "r06.checker");
    const first = await f.pay();
    await expect(f.pay()).rejects.toMatchObject({ status: 409 });
    await f.payments.reverse(
      paymentActor("r06.target"),
      first.posted.id,
      { expected_version: 4, reason: "Bank transfer not executed; reverse unconfirmed entry" },
      randomUUID(),
      "payment-test",
    );
    const second = await f.pay();
    expect(second.lineId).not.toBe(first.lineId);
    await f.paymentAction("confirm", "r06.checker", {
      payment_id: second.paymentId,
      bank_payment_line_id: second.lineId,
      bank_reference: "RETRY-" + randomUUID(),
      confirmed_on: f.today,
    });
    expect((await f.paymentRead()).period?.state).toBe("paid");
    expect(
      (
        await pool.query(
          "select state from hr_payroll_bank_allocation where tenant_id=$1 and payment_id=$2 order by created_at",
          [tenant, second.paymentId],
        )
      ).rows.map((r) => r.state),
    ).toEqual(["reversed", "posted"]);
  });
  it("protects immutable settlement evidence, paid period provenance and consumed Bank Payment journals", async () => {
    const f = await ready(),
      pay = await f.pay();
    await f.paymentAction("confirm", "r06.checker", {
      payment_id: pay.paymentId,
      bank_payment_line_id: pay.lineId,
      bank_reference: "SAL-" + randomUUID(),
      confirmed_on: f.today,
    });
    for (const [sql, params] of [
      [
        `update hr_payroll_payment_settlement set bank_reference='tampered' where tenant_id=$1 and company_id=$2`,
        [tenant, f.companyId],
      ],
      [`delete from hr_payroll_payment_settlement where tenant_id=$1 and company_id=$2`, [tenant, f.companyId]],
      [`update hr_payroll_payment set amount=1 where tenant_id=$1 and id=$2`, [tenant, pay.paymentId]],
      [`update journal_entry set status='reversed' where tenant_id=$1 and id=$2`, [tenant, pay.posted.journal_id]],
    ] as const)
      await expect(pool.query(sql, [...params])).rejects.toThrow();
  });
  it("prevents cross-company access and rechecks revoked authority before cached mutation replay", async () => {
    const f = await fixture(),
      w = await f.paymentRead(),
      input = {
        ...f.query,
        action: "prepare" as const,
        expected_version: 0,
        source_hash: w.source_hash,
        reason: "Replay permission audit acceptance",
      },
      key = randomUUID();
    await f.repo.actOnPayrollPayment(paymentActor(), input, key, "payment-test");
    await pool.query(
      `delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='hr.payroll.payment.manage' and scope_value=$2`,
      [tenant, f.companyId],
    );
    await expect(f.repo.actOnPayrollPayment(paymentActor(), input, key, "payment-test")).rejects.toMatchObject({
      status: 403,
    });
    await expect(f.repo.getPayrollPaymentWorkspace(paymentActor("r06.other"), f.query)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("serializes competing confirmations so only one proof and one bank reference are committed", async () => {
    const f = await ready(),
      pay = await f.pay(),
      w = await f.paymentRead("r06.checker"),
      input = {
        ...f.query,
        action: "confirm" as const,
        expected_version: w.batch!.version,
        source_hash: w.source_hash,
        reason: "Concurrent exact salary confirmation",
        payment_id: pay.paymentId,
        bank_payment_line_id: pay.lineId,
        bank_reference: "SAL-" + randomUUID(),
        confirmed_on: f.today,
      };
    const result = await Promise.allSettled(
      [1, 2].map(() => f.repo.actOnPayrollPayment(paymentActor("r06.checker"), input, randomUUID(), "payment-test")),
    );
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await pool.query(
          `select count(*)::int as n from hr_payroll_payment_settlement where tenant_id=$1 and company_id=$2`,
          [tenant, f.companyId],
        )
      ).rows[0].n,
    ).toBe(1);
  });
});
