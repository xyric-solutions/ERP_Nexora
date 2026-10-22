import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  createHrLocalizationSchema,
  type HrLocalizationTerms,
  hrLocalizationWorkspaceSchema,
} from "../../packages/contracts/src/hr/index.js";
import { createPublishedContextFixture } from "./hr-published-context-fixture.js";
import { createJurisdictionFixture, grantJurisdictionFixtureAuthority } from "./hr-payroll-jurisdiction-fixture.js";
import { publisherActor } from "./hr-payroll-publisher-fixture.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Category-scoped employee Payroll jurisdiction authority", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createJurisdictionFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  const fixture = async (context = false, crossBranch = false) => {
    const f = await createJurisdictionFixture(pool, context, crossBranch);
    fixtures.push(f);
    return f;
  };
  const setupQuery = (f: Awaited<ReturnType<typeof fixture>>, kind: HrLocalizationTerms["kind"]) => ({
    company_id: f.companyId,
    kind,
    on_date: f.month,
    search: "",
    limit: 25,
    offset: 0,
  });
  it("selects the approved category jurisdiction, retains immutable legal evidence and passes independent Payroll review", async () => {
    const f = await fixture();
    await f.addPack("pk-national", "0", "unrelated", true);
    const id = await f.approve(f.terms);
    await f.run("calculate");
    const w = await f.repo.getPayrollRunWorkspace(publisherActor(), f.query);
    expect(w.blocked).toEqual([]);
    expect(w.employees[0]!.deductions).toBe("6200.0000");
    expect(w.employees[0]!.statutory!.jurisdiction_overrides).toMatchObject([
      { id, rule_scope: "fixture", jurisdiction_id: f.other },
    ]);
    const e = await f.evidence(),
      stat = e.execution_evidence.statutory;
    expect(e.override_evidence_json).toMatchObject([
      { id, legal_basis: f.terms.legal_basis, evidence_reference: f.terms.evidence_reference },
    ]);
    expect(stat.outputs).toHaveLength(2);
    expect(
      stat.outputs.find(
        (o: { rule: { rule_scope: string }; sources: { jurisdiction_context: { override_id: string | null } } }) =>
          o.rule.rule_scope === "fixture",
      ).sources.jurisdiction_context.override_id,
    ).toBe(id);
    expect(
      stat.outputs.find(
        (o: { rule: { rule_scope: string }; sources: { jurisdiction_context: { override_id: string | null } } }) =>
          o.rule.rule_scope === "unrelated",
      ).sources.jurisdiction_context.override_id,
    ).toBeNull();
    expect(stat.packs).toHaveLength(2);
    await f.run("submit");
    await f.run("approve", {}, "r06.checker");
  });
  it("uses reviewed allocation for a mid-month override without charging both regions for the full month", async () => {
    const f = await fixture(true);
    const split = f.month.slice(0, 8) + "15";
    await f.approve({ ...f.terms, effective_from: split });
    await f.run("calculate");
    const w = await f.repo.getPayrollRunWorkspace(publisherActor(), f.query);
    expect(w.blocked).toEqual([]);
    expect(w.employees[0]!.deductions).toBe("4800.0000");
    expect(w.employees[0]!.statutory!.contexts).toHaveLength(2);
    const e = await f.evidence();
    expect(e.execution_evidence.statutory.overrides).toHaveLength(1);
    expect(e.execution_evidence.statutory.outputs).toHaveLength(2);
  });
  it("blocks mid-month overrides when no reviewed context allocation policy exists", async () => {
    const f = await fixture();
    await f.approve({ ...f.terms, effective_from: f.month.slice(0, 8) + "15" });
    await f.run("calculate");
    expect((await f.repo.getPayrollRunWorkspace(publisherActor(), f.query)).employees[0]!.warnings.join(" ")).toContain(
      "calendar-weighted",
    );
  });
  it("supports different same-country legal/work branches only through explicit category approval", async () => {
    const f = await fixture(false, true);
    await f.run("calculate");
    expect((await f.repo.getPayrollRunWorkspace(publisherActor(), f.query)).employees[0]!.warnings.join(" ")).toContain(
      "approved override",
    );
    await f.approve(f.terms);
    await f.run("calculate");
    expect((await f.repo.getPayrollRunWorkspace(publisherActor(), f.query)).blocked).toEqual([]);
  });
  it("requires independent approval and blocks maker or bound-employee self-review even with admin override", async () => {
    const f = await fixture(),
      made = await f.create(f.terms);
    await f.act("jurisdiction_override", made.id, "submit");
    const row = await f.row("jurisdiction_override", made.id);
    expect(row.allowed_actions).not.toContain("approve");
    await expect(
      f.repo.decidePayrollLocalization(
        publisherActor(),
        made.id,
        {
          company_id: f.companyId,
          action: "approve",
          expected_version: row.version,
          source_hash: row.source_hash,
          confirm_override: true,
          reason: "Self approval must remain blocked",
        },
        randomUUID(),
        "jurisdiction-self-test",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await f.act("jurisdiction_override", made.id, "approve", "r06.checker");
    await expect(
      pool.query("update hr_employee_jurisdiction_override set legal_basis=$3 where tenant_id=$1 and id=$2", [
        tenant,
        made.id,
        "Changed without independent review",
      ]),
    ).rejects.toThrow("immutable");
  });
  it("replays once and rejects revoked normalized company authority before replay", async () => {
    const f = await fixture(),
      input = createHrLocalizationSchema.parse({
        company_id: f.companyId,
        terms: f.terms,
        source_reference: "Isolated category-override source",
        reason: "Replay scoped setup authorization",
      }),
      key = randomUUID();
    const first = await f.repo.createPayrollLocalization(publisherActor(), input, key, "jurisdiction-replay");
    expect(await f.repo.createPayrollLocalization(publisherActor(), input, key, "jurisdiction-replay")).toMatchObject({
      ...first,
      replayed: true,
    });
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key='hr.payroll.salary.manage' and scope_kind='company' and scope_value=$2",
      [tenant, f.companyId],
    );
    await expect(
      f.repo.createPayrollLocalization(publisherActor(), input, key, "jurisdiction-replay"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects cross-company placements, unsupported categories, cross-country context and overlapping approved scopes", async () => {
    const f = await fixture(),
      other = await fixture();
    for (const changes of [
      { employee_assignment_id: other.person.assignmentId },
      { rule_scope: "not.published" },
      { country_code: "US" },
    ])
      await expect(f.create({ ...f.terms, ...changes })).rejects.toMatchObject({ status: 409 });
    await f.approve(f.terms);
    await expect(f.create(f.terms)).rejects.toMatchObject({ status: 409 });
  });
  it("separately reviews revocation, preserves original evidence and requires recalculation before submission", async () => {
    const f = await fixture(),
      id = await f.approve(f.terms);
    await f.run("calculate");
    const old = await f.evidence();
    await f.revoke(id);
    expect(await f.row("jurisdiction_override", id)).toMatchObject({
      status: "approved",
      materialized_state: "revoked",
    });
    expect((await f.repo.getPayrollRunWorkspace(publisherActor(), f.query)).blocked.join(" ")).toContain(
      "setup changed",
    );
    await expect(f.run("submit")).rejects.toMatchObject({ status: 409 });
    await f.run("calculate");
    const w = await f.repo.getPayrollRunWorkspace(publisherActor(), f.query);
    expect(w.blocked).toEqual([]);
    expect(w.employees[0]!.deductions).toBe("3100.0000");
    expect(w.employees[0]!.statutory!.jurisdiction_overrides).toEqual([]);
    expect(
      (
        await pool.query(
          "select override_evidence_json from hr_payroll_statutory_snapshot where tenant_id=$1 and id=$2",
          [tenant, old.snapshot_id],
        )
      ).rows[0].override_evidence_json,
    ).toEqual(old.override_evidence_json);
  });
  it("blocks revocation against submitted Payroll and keeps unauthorized company reference options private", async () => {
    const f = await fixture(),
      id = await f.approve(f.terms);
    await f.run("calculate");
    await f.run("submit");
    await expect(f.revoke(id)).rejects.toMatchObject({ status: 409 });
    await expect(
      f.repo.getPayrollLocalization(publisherActor("r06.restricted"), setupQuery(f, "jurisdiction_override")),
    ).rejects.toMatchObject({ status: 403 });
    const w = hrLocalizationWorkspaceSchema.parse(
      await f.repo.getPayrollLocalization(publisherActor(), setupQuery(f, "jurisdiction_override")),
    );
    expect(w.options.assignments.some((a) => a.id === f.person.assignmentId)).toBe(true);
    expect(w.options.rule_scopes).toContainEqual({ id: "fixture", label: "fixture" });
  });
  it("treats employee, placement and revocation lookup characters as literal text", async () => {
    const f = await fixture();
    const read = (kind: HrLocalizationTerms["kind"], search: string) =>
      f.repo.getPayrollLocalization(publisherActor(), { ...setupQuery(f, kind), search });
    const number = (
      await pool.query("select employee_number from employee where tenant_id=$1 and id=$2", [
        tenant,
        f.person.employeeId,
      ])
    ).rows[0].employee_number;
    const matching = await read("jurisdiction_override", number);
    expect(matching.options.employees.map((e) => e.id)).toContain(f.person.employeeId);
    expect(matching.options.assignments.map((a) => a.id)).toContain(f.person.assignmentId);
    const id = await f.approve(f.terms);
    expect((await read("jurisdiction_override_revocation", number)).options.overrides.map((o) => o.id)).toContain(id);
    for (const search of ["%", "_", "\\"]) {
      const employee = await read("jurisdiction_override", search);
      expect(employee.options.employees).toEqual([]);
      expect(employee.options.assignments).toEqual([]);
      expect((await read("jurisdiction_override_revocation", search)).options.overrides).toEqual([]);
    }
    await pool.query("update employee set first_name=$3 where tenant_id=$1 and id=$2", [
      tenant,
      f.person.employeeId,
      "Lookup_%!\\Test",
    ]);
    for (const search of ["%", "_", "!", "\\"]) {
      const employee = await read("jurisdiction_override", search);
      expect(employee.options.employees.map((e) => e.id)).toContain(f.person.employeeId);
      expect(employee.options.assignments.map((a) => a.id)).toContain(f.person.assignmentId);
      expect((await read("jurisdiction_override_revocation", search)).options.overrides.map((o) => o.id)).toContain(id);
    }
  });
  it("rejects missing canonical override evidence at commit under rollback-only fault injection", async () => {
    const f = await fixture();
    await f.approve(f.terms);
    await f.run("calculate");
    const e = await f.evidence(),
      c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(
        "alter table hr_payroll_statutory_snapshot disable trigger hr_payroll_statutory_snapshot_immutable",
      );
      await c.query(
        "update hr_payroll_statutory_snapshot set override_evidence_json='[]' where tenant_id=$1 and id=$2",
        [tenant, e.snapshot_id],
      );
      await expect(c.query("set constraints all immediate")).rejects.toThrow(
        "every applicable approved jurisdiction override",
      );
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
  it("accepts continuous published category coverage across mid-month rule versions", async () => {
    const f = await createPublishedContextFixture(pool);
    try {
      await grantJurisdictionFixtureAuthority(pool, f.companyId);
      const end = (await pool.query("select ($1::date+interval '1 month - 1 day')::date::text as value", [f.month]))
        .rows[0].value;
      await f.approve({
        kind: "jurisdiction_override",
        employee_id: f.person.employeeId,
        employee_assignment_id: f.person.assignmentId,
        rule_scope: "fixture",
        country_code: "PK",
        jurisdiction_id: f.jurisdiction,
        effective_from: f.month,
        effective_to: end,
        legal_basis: "Reviewed synthetic version-coverage specification",
        evidence_reference: "urn:test:continuous-published-coverage",
      });
      await f.run("calculate");
      const w = await f.repo.getPayrollRunWorkspace(publisherActor(), f.query);
      expect(w.blocked).toEqual([]);
      expect(w.employees[0]!.statutory!.contexts).toHaveLength(2);
      expect(w.employees[0]!.statutory!.jurisdiction_overrides).toHaveLength(1);
    } finally {
      await f.dispose();
    }
  });
  it("blocks a separately authorized bound employee from reviewing their own override", async () => {
    const f = await fixture(),
      user = "jurisdiction-self-" + randomUUID(),
      assignment = randomUUID();
    await pool.query(
      "insert into security_user_account(tenant_id,id,identity_subject,email,display_name,status,mfa_state,created_at)values($1,$2,$2,$3,'Isolated subject reviewer','active','disabled',now())",
      [tenant, user, user + "@test.invalid"],
    );
    await pool.query(
      "insert into security_user_role_assignment(tenant_id,user_id,role_policy_id,assigned_by,assigned_at,assignment_id,lifecycle_state,valid_from)values($1,$2,'r06-uat-policy-checker','r06.last-admin-a',now(),$3,'active',now())",
      [tenant, user, assignment],
    );
    await pool.query(
      "insert into security_user_role_assignment_version(tenant_id,assignment_id,version,user_id,role_policy_id,lifecycle_state,valid_from,assigned_by,source_kind,source_reference)values($1,$2,1,$3,'r06-uat-policy-checker','active',now(),'r06.last-admin-a','legacy_backfill','isolated-jurisdiction-self-review')",
      [tenant, assignment, user],
    );
    await pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)values($1,$2,$3,$4,true,'r06.last-admin-a','governed_administration','isolated-subject-review')",
      [tenant, randomUUID(), user, f.companyId],
    );
    await pool.query(
      "insert into employee_user_binding(tenant_id,id,user_id,employee_id,effective_from,reason,created_by)values($1,$2,$3,$4,current_date,'Isolated subject self-review test','r06.last-admin-a')",
      [tenant, randomUUID(), user, f.person.employeeId],
    );
    const made = await f.create(f.terms);
    await f.act("jurisdiction_override", made.id, "submit");
    const row = await f.row("jurisdiction_override", made.id);
    await expect(
      f.repo.decidePayrollLocalization(
        publisherActor(user),
        made.id,
        {
          company_id: f.companyId,
          action: "approve",
          expected_version: row.version,
          source_hash: row.source_hash,
          confirm_override: true,
          reason: "Subject must not approve personal jurisdiction",
        },
        randomUUID(),
        "subject-jurisdiction-test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a forged override reference in a scoped output at the deferred database boundary", async () => {
    const f = await fixture();
    await f.approve(f.terms);
    await f.run("calculate");
    const e = await f.evidence(),
      c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(
        "alter table hr_payroll_statutory_snapshot disable trigger hr_payroll_statutory_snapshot_immutable",
      );
      await c.query(
        "alter table hr_payroll_statutory_snapshot_line disable trigger hr_payroll_statutory_snapshot_line_immutable",
      );
      await c.query(
        `update hr_payroll_statutory_snapshot_line set input_evidence_json=jsonb_set(input_evidence_json,'{sources,jurisdiction_context,override_id}','"not-this-employee-approval"'::jsonb) where tenant_id=$1 and snapshot_id=$2`,
        [tenant, e.snapshot_id],
      );
      await c.query("update hr_payroll_statutory_snapshot set state=state where tenant_id=$1 and id=$2", [
        tenant,
        e.snapshot_id,
      ]);
      await expect(c.query("set constraints all immediate")).rejects.toThrow(
        "cannot borrow another category or employee override",
      );
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
