import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  createHrLocalizationSchema,
  hrLocalizationWorkspaceSchema,
  type HrLocalizationTerms,
  type HrLocalizationRecord,
} from "../../packages/contracts/src/hr/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import { createPayrollRunFixture, runActor, runPermissions } from "./hr-payroll-run-fixture.js";
import { createStatutoryFixture } from "./hr-payroll-statutory-fixture.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Governed statutory company and employee setup", () => {
  let pool: DatabasePool, repo: SourceHrRepository;
  const fixtures: Awaited<ReturnType<typeof createPayrollRunFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createPayrollRunFixture(pool);
    fixtures.push(f);
    return f;
  }
  type F = Awaited<ReturnType<typeof fixture>>;
  const query = (f: F, kind: HrLocalizationTerms["kind"]) => ({
    company_id: f.companyId,
    kind,
    on_date: f.month,
    search: "",
    limit: 25,
    offset: 0,
  });
  async function create(f: F, terms: HrLocalizationTerms, r = repo, key = randomUUID()) {
    return r.createPayrollLocalization(
      runActor(),
      createHrLocalizationSchema.parse({
        company_id: f.companyId,
        terms,
        source_reference: "Synthetic reviewed source evidence only",
        reason: "Controlled statutory setup acceptance",
      }),
      key,
      "setup-test",
    );
  }
  async function row(f: F, kind: HrLocalizationTerms["kind"], id: string, r = repo) {
    const w = await r.getPayrollLocalization(runActor(), query(f, kind));
    hrLocalizationWorkspaceSchema.parse(w);
    return w.items.find((v) => v.id === id)!;
  }
  async function act(
    f: F,
    record: HrLocalizationRecord,
    action: "submit" | "approve" | "reject",
    who = "r06.maker",
    r = repo,
  ) {
    return r.decidePayrollLocalization(
      runActor(who),
      record.id,
      {
        company_id: f.companyId,
        action,
        expected_version: record.version,
        source_hash: record.source_hash,
        reason: "Independent reviewed statutory setup",
        confirm_override: false,
      },
      randomUUID(),
      "setup-test",
    );
  }
  async function approve(f: F, terms: HrLocalizationTerms, r = repo) {
    const created = await create(f, terms, r);
    await act(f, await row(f, terms.kind, created.id, r), "submit", "r06.maker", r);
    await act(f, await row(f, terms.kind, created.id, r), "approve", "r06.checker", r);
    return created.id;
  }
  const legal = (f: F): HrLocalizationTerms => ({
    kind: "legal_profile",
    country_code: "PK",
    jurisdiction_id: "pk-national",
    legal_entity_type_id: "pk-company",
    effective_from: f.month,
    effective_to: null,
  });
  const config = (f: F): HrLocalizationTerms => ({
    kind: "payroll_configuration",
    currency_code: "PKR",
    payroll_frequency: "monthly",
    effective_from: f.month,
    effective_to: null,
  });
  const declaration = (f: F): HrLocalizationTerms => ({
    kind: "declaration",
    employee_id: f.person.employeeId,
    jurisdiction_id: "pk-national",
    tax_year: Number(f.month.slice(0, 4)),
    effective_from: f.month,
    supersedes_declaration_id: null,
    currency_code: "PKR",
    estimated_annual_salary: "372000",
    prior_taxable_salary: "0",
    prior_salary_tax_withheld: "0",
    documented_tax_credit: "0",
    other_tax_withheld: "0",
    eobi_applicability: "not_applicable",
    provincial_social_security_status: "assessed_not_applicable",
  });
  const parameter = (f: F): HrLocalizationTerms => ({
    kind: "parameter",
    jurisdiction_id: "pk-national",
    scheme_code: "eobi",
    parameter_key: "contribution_base",
    amount: "1000",
    currency_code: "PKR",
    effective_from: f.month,
    effective_to: null,
  });
  it("does not apply drafts or submissions, requires independent review, and retains immutable source history", async () => {
    const f = await fixture(),
      created = await create(f, legal(f));
    expect(
      (await pool.query("select id from company_legal_profile where tenant_id=$1 and id=$2", [tenant, created.id]))
        .rowCount,
    ).toBe(0);
    const first = await row(f, "legal_profile", created.id);
    await act(f, first, "submit");
    const submitted = await row(f, "legal_profile", created.id);
    await expect(act(f, submitted, "approve")).rejects.toMatchObject({ status: 403 });
    await act(f, submitted, "approve", "r06.checker");
    expect(
      (
        await pool.query("select state,approved_by from company_legal_profile where tenant_id=$1 and id=$2", [
          tenant,
          created.id,
        ])
      ).rows[0],
    ).toMatchObject({ state: "approved", approved_by: "r06.checker" });
    expect((await row(f, "legal_profile", created.id)).history).toHaveLength(3);
    await expect(
      pool.query("update company_legal_profile set effective_to=current_date where tenant_id=$1 and id=$2", [
        tenant,
        created.id,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query(
        'update hr_payroll_localization_request set terms=terms||\'{"country_code":"US"}\'::jsonb where tenant_id=$1 and id=$2',
        [tenant, created.id],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query("delete from hr_payroll_localization_request where tenant_id=$1 and id=$2", [tenant, created.id]),
    ).rejects.toThrow();
  });
  it("approves all six setup kinds and feeds their canonical records into a verified synthetic Payroll run", async () => {
    const source = await createStatutoryFixture(pool);
    fixtures.push(source);
    const f = await fixture(),
      testRepo = new SourceHrRepository(pool, "test");
    const jurisdiction = (
      await pool.query(
        "select registered_jurisdiction_id as id from company_legal_profile where tenant_id=$1 and id=$2",
        [tenant, source.profile],
      )
    ).rows[0].id;
    const profile = await approve(f, { ...legal(f), kind: "legal_profile", jurisdiction_id: jurisdiction });
    await approve(f, config(f));
    await approve(f, {
      kind: "work_location",
      work_location_id: f.masters.work_location!,
      country_code: "PK",
      jurisdiction_id: jurisdiction,
      effective_from: f.month,
      effective_to: null,
    });
    await approve(f, parameter(f));
    await approve(f, declaration(f));
    const activation: HrLocalizationTerms = {
      kind: "activation",
      legal_profile_id: profile,
      jurisdiction_id: jurisdiction,
      pack_version_id: source.version,
      effective_from: f.month,
      effective_to: null,
    };
    await expect(create(f, activation)).rejects.toMatchObject({ status: 409 });
    const id = await approve(f, activation, testRepo);
    expect(
      (await pool.query("select state from company_localization_activation where tenant_id=$1 and id=$2", [tenant, id]))
        .rows[0].state,
    ).toBe("active");
    for (const [code, kind] of [
      ["SYN_TAX", "deduction"],
      ["SYN_EMP", "employer_contribution"],
    ])
      await pool.query(
        `insert into hr_pay_component(id,tenant_id,company_id,code,name,kind,method,taxable,prorated,expense_account_id,liability_account_id,position,status,created_by) values($1,$2,$3,$4,$4,$5,'fixed',false,false,$6,$7,10,'active','r06.maker')`,
        [
          randomUUID(),
          tenant,
          f.companyId,
          code,
          kind,
          kind === "employer_contribution" ? f.expense : null,
          f.liability,
        ],
      );
    await f.act("policy", {
      currency_code: "PKR",
      money_scale: 2,
      rounding_mode: "half_up",
      net_payable_account_id: f.liability,
    });
    let state = await testRepo.getPayrollRunWorkspace(runActor(), f.query);
    await f.act("open", { policy_id: state.policies[0]!.id });
    const run = async (action: "calculate" | "submit") => {
      state = await testRepo.getPayrollRunWorkspace(runActor(), f.query);
      return testRepo.actOnPayrollRun(
        runActor(),
        {
          ...f.query,
          action,
          reason: "Verify approved setup feeds Payroll",
          expected_version: state.period!.version,
          source_hash: state.source_hash,
          confirm_override: false,
        },
        randomUUID(),
        "setup-test",
      );
    };
    await run("calculate");
    state = await testRepo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.employees[0]!.net).toBe("27900.0000");
    expect(state.blocked).toEqual([]);
    const changed = { ...parameter(f), kind: "parameter" as const, jurisdiction_id: jurisdiction };
    const pending = await create(f, changed);
    expect((await testRepo.getPayrollRunWorkspace(runActor(), f.query)).blocked.join(" ")).toMatch(
      /pending statutory setup/,
    );
    await act(f, await row(f, "parameter", pending.id), "submit");
    await act(f, await row(f, "parameter", pending.id), "approve", "r06.checker");
    state = await testRepo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.blocked.join(" ")).toMatch(/changed after calculation/);
    await run("calculate");
    expect((await testRepo.getPayrollRunWorkspace(runActor(), f.query)).blocked).toEqual([]);
    await run("submit");
    await expect(create(f, legal(f))).rejects.toMatchObject({ status: 409 });
  });
  it("revalidates overlaps at approval and rolls back the canonical write and decision together", async () => {
    const f = await fixture(),
      a = await create(f, config(f)),
      b = await create(f, config(f));
    for (const id of [a.id, b.id]) await act(f, await row(f, "payroll_configuration", id), "submit");
    await act(f, await row(f, "payroll_configuration", a.id), "approve", "r06.checker");
    await expect(act(f, await row(f, "payroll_configuration", b.id), "approve", "r06.checker")).rejects.toMatchObject({
      status: 409,
    });
    expect((await row(f, "payroll_configuration", b.id)).status).toBe("submitted");
    expect(
      (await pool.query("select id from company_payroll_configuration where tenant_id=$1 and id=$2", [tenant, b.id]))
        .rowCount,
    ).toBe(0);
  });
  it("supports reviewed declaration successors without changing the previous authority", async () => {
    const f = await fixture(),
      first = await approve(f, declaration(f));
    const next = {
      ...declaration(f),
      kind: "declaration" as const,
      effective_from: f.month.slice(0, 8) + "02",
      supersedes_declaration_id: first,
    };
    const second = await approve(f, next);
    expect(
      (
        await pool.query(
          "select version_number,supersedes_declaration_id,evidence_hash from hr_employee_statutory_declaration where tenant_id=$1 and id=$2",
          [tenant, second],
        )
      ).rows[0],
    ).toMatchObject({
      version_number: 2,
      supersedes_declaration_id: first,
      evidence_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await expect(create(f, { ...next, effective_from: f.month.slice(0, 8) + "03" })).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      pool.query(
        "update hr_employee_statutory_declaration set estimated_annual_salary=0 where tenant_id=$1 and id=$2",
        [tenant, first],
      ),
    ).rejects.toThrow();
  });
  it("rejects stale decisions and replays draft creation without creating another request", async () => {
    const f = await fixture(),
      key = randomUUID(),
      a = await create(f, legal(f), repo, key),
      replay = await create(f, legal(f), repo, key);
    expect(replay).toMatchObject({ id: a.id, replayed: true });
    const stale = await row(f, "legal_profile", a.id);
    await act(f, stale, "submit");
    await expect(act(f, stale, "approve", "r06.checker")).rejects.toMatchObject({ status: 409 });
    await act(f, await row(f, "legal_profile", a.id), "reject", "r06.checker");
    expect(
      (await pool.query("select id from company_legal_profile where tenant_id=$1 and id=$2", [tenant, a.id])).rowCount,
    ).toBe(0);
  });
  it("requires salary permissions for declarations and limits the company scope", async () => {
    const f = await fixture(),
      weak = runActor(
        "r06.maker",
        runPermissions.filter((p) => !p.startsWith("hr.payroll.salary.")),
      );
    await expect(repo.getPayrollLocalization(weak, query(f, "declaration"))).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.createPayrollLocalization(
        weak,
        createHrLocalizationSchema.parse({
          company_id: f.companyId,
          terms: declaration(f),
          reason: "Unauthorized employee declaration",
          source_reference: "Synthetic authority",
        }),
        randomUUID(),
        "setup-test",
      ),
    ).rejects.toMatchObject({ status: 403 });
    const w = await repo.getPayrollLocalization(runActor(), query(f, "legal_profile"));
    expect(w.options.employees).toEqual([]);
    await expect(
      repo.getPayrollLocalization({ ...runActor(), tenantId: "other-tenant" }, query(f, "legal_profile")),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects foreign-company work locations and unsupported currency facts", async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(
      create(f, {
        kind: "work_location",
        work_location_id: other.masters.work_location!,
        country_code: "PK",
        jurisdiction_id: "pk-national",
        effective_from: f.month,
        effective_to: null,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      create(f, { ...config(f), kind: "payroll_configuration", currency_code: "ZZZ" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("filters bounded reference lookups by the selected country", async () => {
    const f = await fixture();
    const w = await repo.getPayrollLocalization(runActor(), { ...query(f, "legal_profile"), country_code: "PK" });
    expect(w.options.jurisdictions.length).toBeGreaterThan(0);
    expect(w.options.jurisdictions.every((j) => j.country_code === "PK")).toBe(true);
    const empty = await repo.getPayrollLocalization(runActor(), { ...query(f, "legal_profile"), country_code: "ZZ" });
    expect(empty.options.jurisdictions).toEqual([]);
  });
});
