import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository, type HrActorContext } from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
const company = "nexora-r06-uat-company";

run("HR job-grade currencies synced from Finance company currencies", () => {
  let pool: DatabasePool;
  let repo: SourceHrRepository;
  const actor = (permissions: string[], userId = "r06.maker"): HrActorContext => ({
    tenantId: sourceTestTenantId,
    actor: {
      tenantId: sourceTestTenantId,
      userId,
      email: `${userId}@example.test`,
      displayName: "Maker",
      organizationName: "Job-grade currency tests",
      roles: ["hr_manager"],
      permissions,
      sessionVersion: 1,
    },
  });
  const context = actor(["hr.master.create", "hr.master.update", "hr.master.read"]);
  const key = () => `job-grade-currency-${randomUUID()}`;
  const corr = "hr-job-grade-currencies-test";

  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });

  async function freeLevel(): Promise<number> {
    const result = await pool.query<{ level: number }>(
      `select level::int from generate_series(1,999) level
        where not exists (
          select 1 from hr_job_grade_detail where tenant_id=$1 and company_id=$2 and grade_level=level
        )
        order by level limit 1`,
      [sourceTestTenantId, company],
    );
    if (!result.rows[0]) throw new Error("No free job-grade level remains for the test company.");
    return result.rows[0].level;
  }
  async function grade(currency_code: string) {
    return {
      company_id: company,
      code: "AUTO",
      name: `Currency grade ${randomUUID().slice(0, 8)}`,
      description: "",
      grade_level: await freeLevel(),
      currency_code,
      band_minimum: "100000",
      band_midpoint: "125000",
      band_maximum: "150000",
    };
  }
  async function storedCurrency(id: string) {
    return (
      await pool.query<{ currency_code: string }>(
        "select currency_code from hr_job_grade_detail where tenant_id=$1 and master_record_id=$2",
        [sourceTestTenantId, id],
      )
    ).rows[0]?.currency_code;
  }

  it("lists the company's active currencies with the base currency first", async () => {
    const result = await repo.listJobGradeCurrencies(context, company);
    const expected = await pool.query<{ currency_code: string; is_base: boolean }>(
      `select currency_code,is_base from company_currency
        where tenant_id=$1 and company_id=$2 and status='active'
        order by is_base desc,currency_code,id`,
      [sourceTestTenantId, company],
    );
    expect(result.items.map(({ currency_code, is_base }) => ({ currency_code, is_base }))).toEqual(expected.rows);
    expect(result.items[0]).toMatchObject({ currency_code: "USD", is_base: true });
    expect(result.items.map((item) => item.currency_code)).toContain("PKR");
    for (const item of result.items) expect(item.currency_name.length).toBeGreaterThan(0);
  });

  it("requires HR master read permission and company access", async () => {
    await expect(repo.listJobGradeCurrencies(actor(["hr.employee.read"]), company)).rejects.toMatchObject({
      status: 403,
      code: "PERMISSION_DENIED",
    });
    await expect(
      repo.listJobGradeCurrencies(actor(["hr.master.read"], "r06.no-company-access"), company),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" });
  });

  it("creates a job grade in a configured company currency", async () => {
    const created = await repo.createJobGrade(context, await grade("PKR"), key(), corr);
    expect(created).toMatchObject({ company_id: company, replayed: false });
    expect(await storedCurrency(created.id)).toBe("PKR");
  });

  it("rejects a currency that is not configured for the company", async () => {
    const input = await grade("EUR");
    await expect(repo.createJobGrade(context, input, key(), corr)).rejects.toMatchObject({
      status: 409,
      code: "HR_JOB_GRADE_CURRENCY_NOT_CONFIGURED",
      message: "Choose a currency configured for this company under Finance → Company currencies.",
    });
    const persisted = await pool.query("select 1 from hr_master_record where tenant_id=$1 and name=$2", [
      sourceTestTenantId,
      input.name,
    ]);
    expect(persisted.rowCount).toBe(0);
  });

  it("keeps an unchanged legacy currency editable but rejects changing to an unconfigured one", async () => {
    const input = await grade("PKR");
    const created = await repo.createJobGrade(context, input, key(), corr);
    const code = (
      await pool.query<{ code: string }>("select code from hr_master_record where tenant_id=$1 and id=$2", [
        sourceTestTenantId,
        created.id,
      ])
    ).rows[0]!.code;
    // Simulate a grade saved before currencies were synced from Finance.
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query(
        "update hr_job_grade_detail set currency_code='EUR' where tenant_id=$1 and master_record_id=$2",
        [sourceTestTenantId, created.id],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const renamed = { ...input, code, name: `${input.name} renamed`, currency_code: "EUR" };
    await expect(repo.updateJobGrade(context, created.id, renamed, key(), corr)).resolves.toMatchObject({
      id: created.id,
      replayed: false,
    });
    expect(await storedCurrency(created.id)).toBe("EUR");

    await expect(
      repo.updateJobGrade(context, created.id, { ...renamed, currency_code: "GBP" }, key(), corr),
    ).rejects.toMatchObject({ status: 409, code: "HR_JOB_GRADE_CURRENCY_NOT_CONFIGURED" });
    expect(await storedCurrency(created.id)).toBe("EUR");

    await repo.updateJobGrade(context, created.id, { ...renamed, currency_code: "USD" }, key(), corr);
    expect(await storedCurrency(created.id)).toBe("USD");
  });
});
