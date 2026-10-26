import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Fiscal calendar database safeguards", () => {
  let pool: DatabasePool;
  beforeAll(() => {
    if (!url || !/^\/nexora_(bank_context_e2e_isolated_|chart_template_ct01)/.test(new URL(url).pathname))
      throw Error("Explicit isolated database required");
    pool = createDatabasePool(url);
  });
  afterAll(async () => {
    await pool?.end();
  });
  it("forces tenant isolation on fiscal years, periods and immutable history", async () => {
    const result = await pool.query(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class where oid=any(array['fiscal_calendar'::regclass,'financial_period'::regclass,'fiscal_calendar_event'::regclass]) order by relname",
    );
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
  });
  it("installs company, overlap, immutable-identity and append-only evidence guards", async () => {
    const constraints = await pool.query(
      "select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conname in ('financial_period_calendar_company_fk','financial_period_no_overlap') order by conname",
    );
    expect(constraints.rows).toHaveLength(2);
    expect(constraints.rows[0].definition).toContain("tenant_id, fiscal_calendar_id, company_id");
    const triggers = await pool.query(
      "select tgname from pg_trigger where tgname=any(array['fiscal_calendar_identity_guard','financial_period_boundaries_guard','fiscal_calendar_event_immutable']) and not tgisinternal",
    );
    expect(triggers.rows).toHaveLength(3);
    const event = (await pool.query("select tenant_id,id from fiscal_calendar_event limit 1")).rows[0];
    expect(event).toBeTruthy();
    await expect(
      pool.query("delete from fiscal_calendar_event where tenant_id=$1 and id=$2", [event.tenant_id, event.id]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
