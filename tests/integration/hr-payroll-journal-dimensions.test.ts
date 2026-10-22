import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { journalActor } from "./hr-payroll-journal-fixture.js";
import {
  hrPayrollJournalActionSchema,
  hrPayrollJournalWorkspaceSchema,
} from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Governed whole-account Payroll cost-centre mappings", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createProductionJournalFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createProductionJournalFixture(pool);
    fixtures.push(f);
    const cc = (
      await pool.query(
        "select id,code,name from hr_master_record where tenant_id=$1 and company_id=$2 and master_type='cost_center' and status='active' order by id limit 1",
        [tenant, f.companyId],
      )
    ).rows[0];
    if (!cc) throw Error("The source company fixture needs an active canonical cost centre.");
    await pool.query(
      `update account set required_dimensions='["cost_center"]'::jsonb where tenant_id=$1 and company_id=$2 and id=$3`,
      [tenant, f.companyId, f.expense],
    );
    const act = async (
      action: "prepare" | "accept" | "post" | "reject",
      who = "r06.maker",
      mapping: unknown = undefined,
      key = randomUUID(),
    ) => {
      const w = await f.journalRead(who);
      const input = hrPayrollJournalActionSchema.parse({
        ...f.query,
        posting_date: w.posting_date,
        expected_version: w.proposal?.version ?? 0,
        source_hash: w.source_hash,
        action,
        reason: "Reviewed whole-account cost-centre integration test",
        ...(mapping !== undefined ? { cost_center_mappings: mapping } : {}),
      });
      return f.repo.actOnPayrollJournal(journalActor(who), input, key, "payroll-dimensions-test");
    };
    return { ...f, cc, act, mapping: [{ account_id: f.expense, cost_center_id: cc.id }] };
  }
  it("freezes canonical mappings, independently accepts and posts exact Finance dimensions through the normal executor", async () => {
    const f = await fixture(),
      before = hrPayrollJournalWorkspaceSchema.parse(await f.journalRead());
    expect(before.dimension_requirements).toEqual([
      { account_id: f.expense, account_code: expect.any(String), required_dimensions: ["cost_center"] },
    ]);
    expect(before.cost_centres).toContainEqual(f.cc);
    expect(before.allowed_actions).toContain("prepare");
    await expect(f.act("prepare")).rejects.toMatchObject({ status: 409 });
    await f.act("prepare", "r06.maker", f.mapping);
    let w = await f.journalRead();
    expect(w.totals).toEqual(before.totals);
    expect(w.lines.find((l) => l.account_id === f.expense)).toMatchObject({
      dimensions: { cost_center: f.cc.id },
      cost_center_label: f.cc.code + " · " + f.cc.name,
    });
    expect(w.proposal?.source_evidence.cost_center_mappings).toEqual(f.mapping);
    await expect(f.act("accept")).rejects.toMatchObject({ status: 403 });
    await f.act("accept", "r06.checker");
    await f.act("post", "r06.target");
    w = await f.journalRead();
    expect(w.period?.state).toBe("posted");
    const actual = (
      await pool.query(
        "select account_id,debit::text,credit::text,dimensions from journal_line where tenant_id=$1 and journal_id=$2",
        [tenant, w.proposal!.external_journal_id],
      )
    ).rows;
    expect(actual.filter((l) => l.account_id === f.expense).every((l) => l.dimensions.cost_center === f.cc.id)).toBe(
      true,
    );
    expect(actual.filter((l) => l.account_id !== f.expense).every((l) => Object.keys(l.dimensions).length === 0)).toBe(
      true,
    );
  });
  it("rejects cross-company, non-cost-centre, extra-account and inactive mappings without retaining a partial proposal", async () => {
    const f = await fixture(),
      other = await fixture();
    for (const mapping of [
      [{ account_id: f.expense, cost_center_id: other.cc.id }],
      [{ account_id: f.expense, cost_center_id: "not-a-cost-centre" }],
      [{ account_id: f.liability, cost_center_id: f.cc.id }],
    ])
      await expect(f.act("prepare", "r06.maker", mapping)).rejects.toMatchObject({ status: 409 });
    expect((await f.journalRead()).proposal).toBeNull();
    await pool.query(
      "update hr_master_record set status='inactive',deactivated_by='r06.maker',deactivated_at=now() where tenant_id=$1 and id=$2",
      [tenant, f.cc.id],
    );
    await expect(f.act("prepare", "r06.maker", f.mapping)).rejects.toMatchObject({ status: 409 });
  });
  it("requires a new reviewed revision when authority changes, while preserving rejection and immutable original lines", async () => {
    const f = await fixture();
    await f.act("prepare", "r06.maker", f.mapping);
    const original = (await f.journalRead()).proposal!;
    await pool.query("update hr_master_record set name=name||' revised' where tenant_id=$1 and id=$2", [
      tenant,
      f.cc.id,
    ]);
    expect((await f.journalRead()).blocked.join(" ")).toContain("retained proposal differs");
    expect((await f.journalRead()).lines.find((l) => l.account_id === f.expense)?.cost_center_label).toBe(
      f.cc.code + " · " + f.cc.name,
    );
    await expect(f.act("accept", "r06.checker")).rejects.toMatchObject({ status: 409 });
    await f.act("reject", "r06.checker");
    await f.act("prepare", "r06.maker", f.mapping);
    expect((await f.journalRead()).proposal?.revision).toBe(2);
    const frozen = (
      await pool.query(
        "select dimensions from hr_payroll_journal_line where tenant_id=$1 and proposal_id=$2 and account_id=$3",
        [tenant, original.id, f.expense],
      )
    ).rows;
    expect(frozen.every((l) => l.dimensions.cost_center === f.cc.id)).toBe(true);
  });
  it("blocks unsupported dimensions and permits rejecting after required dimensions change", async () => {
    const f = await fixture();
    await f.act("prepare", "r06.maker", f.mapping);
    await pool.query(`update account set required_dimensions='["department"]'::jsonb where tenant_id=$1 and id=$2`, [
      tenant,
      f.expense,
    ]);
    const w = await f.journalRead();
    expect(w.blocked.join(" ")).toContain("unsupported accounting dimensions");
    await expect(f.act("accept", "r06.checker")).rejects.toMatchObject({ status: 409 });
    await f.act("reject", "r06.checker");
    expect((await f.journalRead()).proposal?.state).toBe("rejected");
  });
  it("retains legacy dimension-free source hashes and canonical empty dimensions", async () => {
    const f = await createProductionJournalFixture(pool);
    fixtures.push(f);
    await f.journalAction("prepare");
    expect((await f.journalRead()).proposal?.source_evidence.assembly_version).toBe("payroll_accrual_v1");
    await f.journalAction("accept", "r06.checker");
    await f.journalAction("post", "r06.target");
    expect((await f.journalRead()).lines.every((l) => Object.keys(l.dimensions).length === 0)).toBe(true);
  });
  it("protects mapping immutability at the database boundary and checks exact reviewed dimensions at commit", async () => {
    const f = await fixture();
    await f.act("prepare", "r06.maker", f.mapping);
    const w = await f.journalRead();
    await expect(
      pool.query(`update hr_payroll_journal_line set dimensions='{}' where tenant_id=$1 and proposal_id=$2`, [
        tenant,
        w.proposal!.id,
      ]),
    ).rejects.toThrow("immutable");
    await expect(
      pool.query(
        `update hr_payroll_journal_proposal set source_evidence=source_evidence-'cost_center_mappings' where tenant_id=$1 and id=$2`,
        [tenant, w.proposal!.id],
      ),
    ).rejects.toThrow();
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      // Fault injection in the isolated DB: simulate a defective writer while leaving the deferred integrity trigger enabled.
      await c.query("alter table hr_payroll_journal_proposal disable trigger hr_payroll_journal_governed");
      await c.query("alter table hr_payroll_journal_proposal disable trigger hr_payroll_journal_provenance");
      await c.query("alter table hr_payroll_journal_line disable trigger hr_payroll_journal_line_immutable");
      await c.query(`update hr_payroll_journal_line set dimensions='{}' where tenant_id=$1 and proposal_id=$2`, [
        tenant,
        w.proposal!.id,
      ]);
      await c.query("update hr_payroll_journal_proposal set state=state where tenant_id=$1 and id=$2", [
        tenant,
        w.proposal!.id,
      ]);
      await expect(c.query("set constraints all immediate")).rejects.toThrow(
        "Payroll line dimensions must match immutable reviewed mappings",
      );
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
  it("bounds and escapes company catalogue searches and rejects forged mapping shapes", async () => {
    const f = await fixture();
    const w = await f.repo.getPayrollJournalWorkspace(journalActor(), { ...f.query, cost_center_search: "%_!" });
    expect(w.cost_centres).toEqual([]);
    expect(w.cost_centres_truncated).toBe(false);
    for (const extra of [
      { action: "prepare", cost_center_mappings: [...f.mapping, ...f.mapping] },
      { action: "accept", cost_center_mappings: f.mapping },
      { action: "prepare", cost_center_mappings: [{ ...f.mapping[0], dimensions: { project: "forged" } }] },
    ]) {
      const v = await f.journalRead();
      expect(
        hrPayrollJournalActionSchema.safeParse({
          ...f.query,
          posting_date: v.posting_date,
          expected_version: 0,
          source_hash: v.source_hash,
          reason: "Invalid mapping contract test",
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
  it("replays frozen mappings once, rejects changed terms and rechecks normalized authority before replay", async () => {
    const f = await fixture(),
      w = await f.journalRead(),
      key = randomUUID();
    const input = hrPayrollJournalActionSchema.parse({
      ...f.query,
      posting_date: w.posting_date,
      action: "prepare",
      expected_version: 0,
      source_hash: w.source_hash,
      reason: "Idempotent reviewed cost-centre preparation",
      cost_center_mappings: f.mapping,
    });
    const first = await f.repo.actOnPayrollJournal(journalActor(), input, key, "dimension-replay");
    expect(await f.repo.actOnPayrollJournal(journalActor(), input, key, "dimension-replay")).toMatchObject({
      ...first,
      replayed: true,
    });
    await expect(
      f.repo.actOnPayrollJournal(journalActor(), { ...input, cost_center_mappings: [] }, key, "dimension-replay"),
    ).rejects.toMatchObject({ status: 409 });
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='finance.journal.create' and scope_kind='company' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(f.repo.actOnPayrollJournal(journalActor(), input, key, "dimension-replay")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects missing required dimensions at commit even when an isolated defective writer omits both mappings and line dimensions", async () => {
    const f = await fixture();
    await f.act("prepare", "r06.maker", f.mapping);
    const w = await f.journalRead(),
      c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      await c.query("alter table hr_payroll_journal_proposal disable trigger hr_payroll_journal_governed");
      await c.query("alter table hr_payroll_journal_proposal disable trigger hr_payroll_journal_provenance");
      await c.query("alter table hr_payroll_journal_line disable trigger hr_payroll_journal_line_immutable");
      await c.query("update hr_payroll_journal_line set dimensions='{}' where tenant_id=$1 and proposal_id=$2", [
        tenant,
        w.proposal!.id,
      ]);
      await c.query(
        "update hr_payroll_journal_proposal set source_evidence=(source_evidence-ARRAY['cost_center_mappings','cost_center_authority'])||jsonb_build_object('assembly_version','payroll_accrual_v1') where tenant_id=$1 and id=$2",
        [tenant, w.proposal!.id],
      );
      await expect(c.query("set constraints all immediate")).rejects.toThrow(
        "Every required Payroll dimension needs a supported reviewed mapping",
      );
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
