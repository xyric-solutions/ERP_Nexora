import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  createHrPayrollRecordSchema,
  reviseHrPayrollLoanSchema,
  type HrPayrollItem,
} from "../../packages/contracts/src/hr/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createLoanFixture, loanActor } from "./hr-payroll-loans-fixture.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;

run("Draft loan and advance revision (HR153)", () => {
  let pool: DatabasePool;
  let f: Awaited<ReturnType<typeof createLoanFixture>>;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    f = await createLoanFixture(pool);
  });
  afterAll(async () => {
    await f?.dispose();
    await pool?.end();
  });

  const loans = async (state?: "draft" | "submitted" | "approved" | "rejected") =>
    (
      await f.repo.getPayrollWorkspace(loanActor(), {
        company_id: f.companyId,
        section: "loans",
        month: f.month,
        search: "",
        ...(state ? { state } : {}),
        limit: 50,
        offset: 0,
      })
    ).items;
  const draft = async (kind: "loan" | "advance" = "advance") =>
    f.repo.createPayrollRecord(
      loanActor(),
      createHrPayrollRecordSchema.parse({
        kind: "loan",
        loan_kind: kind,
        company_id: f.companyId,
        reason: "Revision acceptance",
        employee_id: f.person.employeeId,
        component_id: f.component.id,
        reference: "REV-" + randomUUID(),
        currency_code: "PKR",
        start_month: f.month,
        principal: "50.00",
        instalment_count: 1,
      }),
      randomUUID(),
      "loan-revision-test",
    );
  const revision = (row: HrPayrollItem, terms: Partial<{ principal: string; instalment_count: number }> = {}) =>
    reviseHrPayrollLoanSchema.parse({
      company_id: f.companyId,
      action: "revise",
      reason: "Agreed amount changed",
      expected_version: row.version,
      source_hash: row.source_hash,
      employee_id: row.employee_id,
      component_id: f.component.id,
      currency_code: "PKR",
      start_month: f.month,
      principal: terms.principal ?? "80.00",
      instalment_count: terms.instalment_count ?? 2,
    });

  it("lets the preparer revise draft terms once per version and keeps the code and kind", async () => {
    const created = await draft();
    const before = (await loans()).find((r) => r.id === created.id)!;
    const key = randomUUID();
    const result = await f.repo.revisePayrollLoan(loanActor(), created.id, revision(before), key, "loan-revision-test");
    expect(result).toMatchObject({ status: "draft", version: 2, replayed: false });
    const after = (await loans()).find((r) => r.id === created.id)!;
    expect(Number(after.amount)).toBe(80);
    expect(after.details.instalment_count).toBe("2");
    expect(after.reference).toBe(before.reference);
    expect(after.details.loan_kind).toBe("advance");
    expect(after.history.some((h) => h.action === "revise")).toBe(true);
    // Same key and body replays; the stale version is refused.
    expect(
      await f.repo.revisePayrollLoan(loanActor(), created.id, revision(before), key, "loan-revision-test"),
    ).toMatchObject({ replayed: true });
    await expect(
      f.repo.revisePayrollLoan(loanActor(), created.id, revision(before), randomUUID(), "loan-revision-test"),
    ).rejects.toMatchObject({ code: "HR_PAYROLL_REVIEW_REQUIRED" });
  });

  it("refuses revision by anyone other than the preparer and validates the new terms", async () => {
    const created = await draft("loan");
    const row = (await loans()).find((r) => r.id === created.id)!;
    await expect(
      f.repo.revisePayrollLoan(loanActor("r06.checker"), created.id, revision(row), randomUUID(), "loan-revision-test"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.revisePayrollLoan(
        loanActor(),
        created.id,
        { ...revision(row), component_id: "missing-component" },
        randomUUID(),
        "loan-revision-test",
      ),
    ).rejects.toBeTruthy();
    expect(() => revision(row, { principal: "0" })).toThrow();
    expect((await loans()).find((r) => r.id === created.id)!.version).toBe(1);
  });

  it("refuses revision of submitted and approved loans in the service and the database", async () => {
    const approved = await f.row();
    expect(approved.status).toBe("approved");
    await expect(
      f.repo.revisePayrollLoan(loanActor(), approved.id, revision(approved), randomUUID(), "loan-revision-test"),
    ).rejects.toMatchObject({ code: "HR_PAYROLL_REVIEW_REQUIRED" });
    await expect(
      pool.query("update hr_employee_loan set principal=1,version=version+1 where tenant_id=$1 and id=$2", [
        tenant,
        approved.id,
      ]),
    ).rejects.toThrow(/immutable/);
    const created = await draft();
    await pool.query(
      "update hr_employee_loan set state='submitted',submitted_by='r06.maker',submitted_at=now(),version=version+1 where tenant_id=$1 and id=$2",
      [tenant, created.id],
    );
    await expect(
      pool.query("update hr_employee_loan set principal=1,version=version+1 where tenant_id=$1 and id=$2", [
        tenant,
        created.id,
      ]),
    ).rejects.toThrow(/immutable/);
  });

  it("filters loans by state, with approved including disbursed loans", async () => {
    const all = await loans();
    for (const state of ["draft", "submitted", "approved", "rejected"] as const) {
      const expected = all.filter((r) =>
        (state === "approved" ? ["approved", "active", "settled"] : [state]).includes(r.status),
      );
      expect((await loans(state)).map((r) => r.id).sort()).toEqual(expected.map((r) => r.id).sort());
    }
    expect((await loans("draft")).length).toBeGreaterThan(0);
  });
});
