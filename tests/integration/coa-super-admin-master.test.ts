import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import request from "supertest";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { importChartTemplateRequestSchema } from "../../packages/contracts/src/index.js";
import {
  SourceFinanceNominalRepository,
  type FinanceNominalActorContext,
} from "../../server/api/src/modules/finance/nominals/source-repository.js";
import { SourceCoaHierarchyRepository } from "../../server/api/src/modules/finance/coa-hierarchy-repository.js";
import { SourceChartTemplateRepository } from "../../server/api/src/modules/finance/templates/source-repository.js";
import { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";
import { SourceBankReceiptRepository } from "../../server/api/src/modules/banking/receipts/source-repository.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createApp } from "../../server/api/src/app.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  key = () => randomUUID(),
  company = `coa-direct-${key()}`;
const perms = [
  "platform.approval.override",
  "finance.nominal.read",
  "finance.nominal.create",
  "finance.nominal.update",
  "finance.nominal.status",
  "finance.nominal.submit",
  "finance.nominal.approve",
  "finance.chart_template.read",
  "finance.chart_template.admin",
  "finance.chart_template.adopt",
  "finance.chart_template.classify",
  "banking.payment.read",
  "banking.receipt.read",
];
const admin: FinanceNominalActorContext = {
  tenantId: tenant,
  actor: {
    tenantId: tenant,
    userId: "r06.override-admin",
    displayName: "Synthetic Super Admin",
    email: "admin@example.invalid",
    organizationName: "Synthetic",
    roles: ["super_administrator"],
    permissions: perms,
    sessionVersion: 1,
  },
};
const ordinary: FinanceNominalActorContext = {
  ...admin,
  actor: { ...admin.actor, userId: "r06.maker", roles: ["banking_test"] },
};
(url ? describe : describe.skip)("Direct Super Admin Chart of Accounts masters", () => {
  let pool: DatabasePool,
    nominals: SourceFinanceNominalRepository,
    headers: SourceCoaHierarchyRepository,
    category: string,
    section: string;
  // Existing regression scenarios need active parents; create them through the real approval workflow.
  const changeMaster: SourceCoaHierarchyRepository["change"] = async (...args) => {
    const result = await headers.change(...args);
    if (args[2] || !("company_id" in args[3])) return result;
    const pending = await headers.change(
      args[0],
      args[1],
      result.id,
      { expected_version: result.version, action: "submit" },
      key(),
      key(),
    );
    return headers.change(
      args[0],
      args[1],
      result.id,
      { expected_version: pending.version, action: "approve" },
      key(),
      key(),
    );
  };
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.includes("chart_template_ct01"))
      throw Error("Explicit isolated database required");
    pool = createDatabasePool(url);
    await ensureSourceSuperAdministratorFixture(pool);
    nominals = new SourceFinanceNominalRepository(pool);
    headers = new SourceCoaHierarchyRepository(pool);
    await pool.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic direct CoA','active')",
      [tenant, company],
    );
    for (const user of ["r06.override-admin", "r06.maker"])
      await pool.query(
        "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,$3,$4,false,'r06.override-admin','governed_administration','synthetic-direct-coa')",
        [tenant, key(), user, company],
      );
    for (const policy of ["r06-uat-policy-approval-override", "r06-uat-policy-maker"])
      for (const permission of perms) {
        await pool.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [tenant, policy, permission],
        );
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'tenant',$1) on conflict do nothing",
          [tenant, policy, permission],
        );
      }
    await pool.query(
      "insert into currency(tenant_id,code,name,decimal_places,is_base,status) select $1,'USD','Synthetic USD',2,not exists(select 1 from currency where tenant_id=$1 and is_base),'active' on conflict do nothing",
      [tenant],
    );
    await pool.query(
      "insert into company_currency_profile(tenant_id,company_id,id,base_currency,base_country_code,status,row_version,created_by,updated_by) values($1,$2,$3,'USD','US','active',1,'r06.override-admin','r06.override-admin') on conflict(tenant_id,company_id) do nothing",
      [tenant, company, `currency-profile-${company}`.slice(0, 128)],
    );
    await pool.query(
      "insert into company_currency(tenant_id,company_id,id,currency_code,selected_country_code,is_base,status,row_version,created_by,updated_by) values($1,$2,$3,'USD','US',true,'active',1,'r06.override-admin','r06.override-admin') on conflict(tenant_id,company_id,currency_code) do nothing",
      [tenant, company, `currency-${company}-usd`.slice(0, 128)],
    );
    const createdCategory = await changeMaster(
      admin,
      company,
      undefined,
      { company_id: company, type: "expense", name: "Direct test expenses" },
      key(),
      key(),
    );
    expect(createdCategory.code).toBe("CAT-001");
    category = createdCategory.id;
    const createdSection = await changeMaster(
      admin,
      company,
      undefined,
      { company_id: company, type: "expense", name: "Direct test services", parent_id: category },
      key(),
      key(),
    );
    expect(createdSection.code).toBe("5001");
    section = createdSection.id;
  });
  afterAll(async () => {
    await pool?.end();
  });
  const input = () => ({
    nominal_kind: "general" as const,
    company_id: company,
    category_id: category,
    section_id: section,
    name: `Direct ordinary ${key()}`,
    currency: "USD",
  });
  it("allocates immutable sequential codes and does not reuse an inactive Category number", async () => {
    const firstCategory = await changeMaster(
      admin,
      company,
      undefined,
      { company_id: company, type: "equity", name: `Automatic equity ${key()}` },
      key(),
      key(),
    );
    expect(firstCategory.code).toBe("CAT-002");
    const inactive = await changeMaster(
      admin,
      company,
      firstCategory.id,
      { expected_version: firstCategory.version, action: "deactivate" },
      key(),
      key(),
    );
    expect(inactive).toMatchObject({ code: "CAT-002", status: "inactive" });
    const secondCategory = await changeMaster(
      admin,
      company,
      undefined,
      { company_id: company, type: "equity", name: `Automatic equity ${key()}` },
      key(),
      key(),
    );
    expect(secondCategory.code).toBe("CAT-003");
    const [firstSection, secondSection] = await Promise.all([
      changeMaster(
        admin,
        company,
        undefined,
        {
          company_id: company,
          type: "equity",
          name: `Automatic equity Section ${key()}`,
          parent_id: secondCategory.id,
        },
        key(),
        key(),
      ),
      changeMaster(
        admin,
        company,
        undefined,
        {
          company_id: company,
          type: "equity",
          name: `Automatic equity Section ${key()}`,
          parent_id: secondCategory.id,
        },
        key(),
        key(),
      ),
    ]);
    expect([firstSection.code, secondSection.code].sort()).toEqual(["3001", "3002"]);
    const concurrentCategories = await Promise.all([
      changeMaster(
        admin,
        company,
        undefined,
        { company_id: company, type: "revenue", name: `Automatic revenue ${key()}` },
        key(),
        key(),
      ),
      changeMaster(
        admin,
        company,
        undefined,
        { company_id: company, type: "revenue", name: `Automatic revenue ${key()}` },
        key(),
        key(),
      ),
    ]);
    expect(concurrentCategories.map((item) => item.code).sort()).toEqual(["CAT-004", "CAT-005"]);
  });
  it("denies ordinary master mutations even with every nominal permission and a stale Super Admin claim", async () => {
    await expect(nominals.create(ordinary, input(), key(), key())).rejects.toMatchObject({ status: 403 });
    await expect(
      changeMaster(
        ordinary,
        company,
        undefined,
        { company_id: company, type: "expense", name: "Denied" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      nominals.create(
        { ...ordinary, actor: { ...ordinary.actor, roles: ["super_administrator"] } },
        input(),
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("creates active nominals atomically, with truthful activation evidence and no submission or decision", async () => {
    const request = input(),
      retry = key(),
      created = await nominals.create(admin, request, retry, key());
    expect(created).toMatchObject({ state: "active", version: 2 });
    expect(await nominals.create(admin, request, retry, key())).toMatchObject({ ...created, replayed: true });
    const profile = (
      await pool.query(
        "select state,submitted_by,decided_by,approval_override_event_id,coa_change_id from finance_general_nominal where tenant_id=$1 and nominal_id=$2",
        [tenant, created.id],
      )
    ).rows[0];
    expect(profile).toMatchObject({
      state: "active",
      submitted_by: null,
      decided_by: null,
      approval_override_event_id: null,
    });
    expect(profile.coa_change_id).toBeTruthy();
    const detail = await nominals.get(admin, created.id);
    expect(detail.events.map((e) => e.event_type)).toEqual(["activated", "created"]);
    expect(detail.capabilities).toMatchObject({ submit: false, decide: false, update: true, deactivate: true });
    for (const bank of [new SourceBankPaymentRepository(pool), new SourceBankReceiptRepository(pool)])
      expect(
        (await bank.listNominalAccounts(admin, { company_id: company, search: created.code, limit: 100 })).items.map(
          (x) => x.id,
        ),
      ).toContain(created.id);
    await expect(
      nominals.submit(
        admin,
        created.id,
        { expected_version: created.version, reason: "No approval required" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 410 });
  });
  it("edits, deactivates and reactivates without approval; rejects stale versions, company mismatch and impersonation", async () => {
    const created = await nominals.create(admin, input(), key(), key());
    const updated = await nominals.update(
      admin,
      created.id,
      { expected_version: created.version, description: "Direct Super Admin update" },
      key(),
      key(),
    );
    const inactive = await nominals.changeStatus(
      admin,
      created.id,
      { expected_version: updated.version, action: "deactivate", reason: "Synthetic controlled deactivation" },
      key(),
      key(),
    );
    const active = await nominals.changeStatus(
      admin,
      created.id,
      { expected_version: inactive.version, action: "activate", reason: "Synthetic controlled activation" },
      key(),
      key(),
    );
    expect(active.state).toBe("active");
    await expect(
      nominals.update(admin, created.id, { expected_version: created.version, name: "Stale" }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(nominals.create({ ...admin, realActorId: "r06.maker" }, input(), key(), key())).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      nominals.create(admin, { ...input(), company_id: "not-authorized" }, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      nominals.changeStatus(
        ordinary,
        created.id,
        { expected_version: active.version, action: "deactivate", reason: "Denied ordinary change" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("protects immutable master evidence, header dependencies and code/parent identities", async () => {
    const created = await nominals.create(admin, input(), key(), key());
    await expect(
      pool.query("delete from finance_coa_master_change where tenant_id=$1 and account_id=$2", [tenant, created.id]),
    ).rejects.toThrow();
    await expect(
      pool.query("update account set code='FORGED' where tenant_id=$1 and id=$2", [tenant, created.id]),
    ).rejects.toThrow();
    const directory = await headers.list(admin, { company_id: company, limit: 100 }),
      row = directory.items.find((x) => x.id === section)!,
      categoryRow = directory.items.find((x) => x.id === category)!,
      expectedNominals = (
        await pool.query<{ count: number }>(
          "select count(*)::integer as count from account where tenant_id=$1 and company_id=$2 and parent_id=$3 and not is_header",
          [tenant, company, section],
        )
      ).rows[0]!.count;
    expect(categoryRow).toMatchObject({ section_count: 1, nominal_count: expectedNominals });
    expect(row).toMatchObject({ section_count: 0, nominal_count: expectedNominals });
    await expect(
      changeMaster(admin, company, section, { expected_version: row.version, action: "deactivate" }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("serializes duplicate header names and directly deactivates/reactivates an unused category", async () => {
    const body = { company_id: company, name: `Concurrent header ${key()}`, type: "expense" as const };
    const results = await Promise.allSettled([
      changeMaster(admin, company, undefined, body, key(), key()),
      changeMaster(admin, company, undefined, { ...body, name: body.name.toUpperCase() }, key(), key()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const item = (await headers.list(admin, { company_id: company, limit: 100 })).items.find(
      (r) => r.name.toLowerCase() === body.name.toLowerCase(),
    )!;
    const inactive = await changeMaster(
      admin,
      company,
      item.id,
      { expected_version: item.version, action: "deactivate" },
      key(),
      key(),
    );
    expect(inactive.status).toBe("inactive");
    const active = await changeMaster(
      admin,
      company,
      item.id,
      { expected_version: inactive.version, action: "activate" },
      key(),
      key(),
    );
    expect(active).toMatchObject({ id: item.id, code: item.code, name: item.name, status: "active" });
    const cursor = (await headers.list(admin, { company_id: company, limit: 1 })).next_cursor!;
    await expect(
      headers.list(admin, {
        company_id: company,
        cursor: Buffer.from(JSON.stringify({ tenant: "other", company, id: item.id })).toString("base64url"),
        limit: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(cursor).toBeTruthy();
  });
  it("returns a governed conflict when an automatic Section code band is exhausted", async () => {
    await changeMaster(
      admin,
      company,
      undefined,
      {
        company_id: company,
        type: "expense",
        name: `Final expense Section ${key()}`,
        parent_id: category,
        code: "7999",
      },
      key(),
      key(),
    );
    await expect(
      changeMaster(
        admin,
        company,
        undefined,
        { company_id: company, type: "expense", name: `Overflow expense Section ${key()}`, parent_id: category },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 409, code: "COA_SECTION_CODE_EXHAUSTED" });
  });
  it("enforces HTTP authentication, CSRF, origin, preconditions, bounds, live Super Admin and company scope", async () => {
    let actor = admin.actor;
    const session = {
      sessionId: "synthetic-coa-session",
      tenantId: tenant,
      userId: actor.userId,
      csrfToken: "c".repeat(43),
      idleExpiresAt: new Date("2099-01-01"),
      absoluteExpiresAt: new Date("2099-01-01"),
    };
    // Mock only cookie/session resolution; authorization and all master queries use PostgreSQL.
    const auth = { loadAuthenticatedAccount: async () => actor } as unknown as TenantAuthApiService;
    const sessions = {
      get: async () => ({ ...session, userId: actor.userId }),
      authorizeMutation: async (_token: string, csrf: string) =>
        csrf === session.csrfToken
          ? { status: "ok", session: { ...session, userId: actor.userId } }
          : { status: "invalid_csrf" },
    } as unknown as TenantSessionApiService;
    const app = createApp({
      config: { allowedOrigins: new Set(["https://coa.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: auth,
      sessionService: sessions,
      financeNominalRepository: nominals,
      financeHierarchyRepository: headers,
    });
    expect((await request(app).get(`/api/v1/finance/hierarchy?company_id=${company}`)).status).toBe(401);
    expect(
      (
        await request(app)
          .get(`/api/v1/finance/hierarchy?company_id=${company}&limit=101`)
          .set("cookie", "nexora_session=synthetic")
      ).status,
    ).toBe(400);
    const body = { company_id: company, name: `HTTP ${key()}`, type: "expense" };
    const send = (csrf = session.csrfToken, origin = "https://coa.example.test", requestKey = key()) =>
      request(app)
        .post("/api/v1/finance/hierarchy")
        .set("cookie", "nexora_session=synthetic")
        .set("x-csrf-token", csrf)
        .set("origin", origin)
        .set("idempotency-key", requestKey)
        .send(body);
    expect((await send("wrong")).status).toBe(403);
    expect((await send(session.csrfToken, "https://hostile.example.test")).status).toBe(403);
    actor = ordinary.actor;
    expect((await send()).status).toBe(403);
    actor = admin.actor;
    const requestKey = key(),
      created = await send(session.csrfToken, "https://coa.example.test", requestKey);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "inactive", state: "draft" });
    expect((await send(session.csrfToken, "https://coa.example.test", requestKey)).body).toEqual(created.body);
    const patch = (companyId: string, etag?: string) => {
      const r = request(app)
        .patch(`/api/v1/finance/hierarchy/${created.body.id}?company_id=${companyId}`)
        .set("cookie", "nexora_session=synthetic")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", key());
      if (etag) r.set("if-match", etag);
      return r.send({ expected_version: created.body.version, name: `HTTP revised ${key()}` });
    };
    expect((await patch(company)).status).toBe(412);
    expect((await patch("outside-company", `"${created.body.version}"`)).status).toBe(403);
    expect((await patch(company, `"${created.body.version}"`)).status).toBe(200);
  });
  it("leaves all imported review_required drafts inactive, excludes module controls, and directly activates only an explicitly classified ordinary nominal", async () => {
    const source = importChartTemplateRequestSchema.parse(
        JSON.parse(
          await readFile(new URL("../../packages/db/catalogs/approved-chart-20261020.json", import.meta.url), "utf8"),
        ),
      ),
      templates = new SourceChartTemplateRepository(pool);
    const imported = await templates.import(admin, { ...source, revision: `direct-${key()}` }, key(), key());
    await templates.publish(admin, imported.template.id, { expected_version: 1 }, key(), key());
    const preview = await templates.companyPreview(admin, imported.template.id, {
      company_id: company,
      currency: "USD",
      limit: 100,
    });
    await templates.adoptCompany(
      admin,
      imported.template.id,
      { company_id: company, currency: "USD", expected_template_version: 2, preview_sha256: preview.preview_sha256 },
      key(),
      key(),
    );
    const rows = await pool.query(
      "select a.id,a.code,g.state,n.posting_classification from account a join finance_general_nominal g on g.tenant_id=a.tenant_id and g.nominal_id=a.id join finance_chart_company_node n on n.tenant_id=a.tenant_id and n.account_id=a.id where a.tenant_id=$1 and a.company_id=$2",
      [tenant, company],
    );
    expect(rows.rows).toHaveLength(227);
    expect(rows.rows.every((r) => r.state === "draft" && r.posting_classification === "review_required")).toBe(true);
    const stock = rows.rows.find((r) => r.code === "230101")!,
      ordinaryRow = rows.rows.find((r) => r.code === "711301")!;
    await expect(
      nominals.changeStatus(
        admin,
        stock.id,
        { expected_version: 1, action: "activate", reason: "Do not infer classification" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "NOMINAL_POSTING_REVIEW_REQUIRED" });
    await templates.classifyNominal(
      admin,
      stock.id,
      { expected_version: 1, classification: "module_controlled", reason: "Synthetic inventory-owner classification" },
      key(),
      key(),
    );
    await expect(
      nominals.changeStatus(
        admin,
        stock.id,
        { expected_version: 2, action: "activate", reason: "Still restricted" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "NOMINAL_POSTING_REVIEW_REQUIRED" });
    await templates.classifyNominal(
      admin,
      ordinaryRow.id,
      { expected_version: 1, classification: "ordinary", reason: "Explicit synthetic ordinary classification" },
      key(),
      key(),
    );
    await nominals.changeStatus(
      admin,
      ordinaryRow.id,
      { expected_version: 2, action: "activate", reason: "Direct synthetic master activation" },
      key(),
      key(),
    );
    for (const bank of [new SourceBankPaymentRepository(pool), new SourceBankReceiptRepository(pool)]) {
      expect(
        (await bank.listNominalAccounts(admin, { company_id: company, search: "711301", limit: 100 })).items.map(
          (r) => r.id,
        ),
      ).toContain(ordinaryRow.id);
      expect(
        (await bank.listNominalAccounts(admin, { company_id: company, search: "230101", limit: 100 })).items,
      ).toHaveLength(0);
    }
  });
  it("moves an unused nominal between same-type company Sections with stable code, replay and immutable evidence", async () => {
    const targetCategory = await changeMaster(
      admin,
      company,
      undefined,
      { company_id: company, type: "expense", name: `Reassignment expenses ${key()}` },
      key(),
      key(),
    );
    const targetSection = await changeMaster(
      admin,
      company,
      undefined,
      {
        company_id: company,
        type: "expense",
        name: `Reassignment services ${key()}`,
        parent_id: targetCategory.id,
        code: "7998",
      },
      key(),
      key(),
    );
    const created = await nominals.create(admin, input(), key(), key());
    const request = { expected_version: created.version, section_id: targetSection.id, name: `Renamed ${key()}` },
      requestKey = key();
    const changed = await nominals.update(admin, created.id, request, requestKey, key());
    expect(changed).toMatchObject({ code: created.code, state: "active", version: created.version + 1 });
    expect(await nominals.get(admin, created.id)).toMatchObject({
      name: request.name,
      type: "expense",
      category: { id: targetCategory.id },
      section: { id: targetSection.id },
    });
    expect(await nominals.update(admin, created.id, request, requestKey, key())).toMatchObject({
      ...changed,
      replayed: true,
    });
    await expect(
      nominals.update(admin, created.id, { ...request, section_id: section }, key(), key()),
    ).rejects.toMatchObject({ code: "NOMINAL_VERSION_CONFLICT" });
    const proof = (
      await pool.query("select section_id,before_state from finance_coa_master_change where tenant_id=$1 and id=$2", [
        tenant,
        changed.audit_event_id,
      ])
    ).rows[0];
    expect(proof.section_id).toBe(targetSection.id);
    expect(proof.before_state.parent_id).toBe(section);
    await expect(
      pool.query("update account set parent_id=$3 where tenant_id=$1 and id=$2", [tenant, created.id, section]),
    ).rejects.toThrow();
    await expect(
      nominals.update(admin, created.id, { expected_version: changed.version, section_id: category }, key(), key()),
    ).rejects.toMatchObject({ code: "COA_SECTION_INVALID" });
    await expect(
      nominals.update(
        admin,
        created.id,
        { expected_version: changed.version, section_id: "outside-company-section" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "COA_SECTION_INVALID" });
    const duplicate = await nominals.create(admin, { ...input(), name: request.name }, key(), key());
    await expect(
      nominals.update(
        admin,
        duplicate.id,
        { expected_version: duplicate.version, section_id: targetSection.id },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "NOMINAL_DUPLICATE" });
    const journalId = `usage-${key()}`;
    const assetSection = (
      await pool.query(
        "select s.id from account s join finance_general_nominal_policy p on p.tenant_id=s.tenant_id and p.company_id=s.company_id and p.section_id=s.id where s.tenant_id=$1 and s.company_id=$2 and s.type='asset' limit 1",
        [tenant, company],
      )
    ).rows[0];
    await expect(
      nominals.update(
        admin,
        created.id,
        { expected_version: changed.version, section_id: assetSection.id },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "COA_SECTION_INVALID" });
    await pool.query(
      "insert into journal_entry(id,tenant_id,company_id,created_by,posting_date,source_type,source_id,status,created_at) values($1,$2,$3,'r06.maker','2026-11-04','synthetic.nominal_edit',$1,'draft',clock_timestamp())",
      [journalId, tenant, company],
    );
    await pool.query(
      "insert into journal_line(id,journal_id,tenant_id,line_number,account_id,debit,credit,currency,fx_rate,base_debit,base_credit,dimensions) values($1,$2,$3,1,$4,1,0,'USD',1,1,0,'{}')",
      [`line-${key()}`, journalId, tenant, created.id],
    );
    await expect(
      nominals.update(admin, created.id, { expected_version: changed.version, section_id: section }, key(), key()),
    ).rejects.toMatchObject({ code: "COA_SECTION_IN_USE" });
  });
  it("edits an adopted control nominal's company name/Section without rewriting its catalog or posting classification", async () => {
    const stock = (
      await nominals.list(admin, {
        company_id: company,
        search: "230101",
        limit: 100,
        sort_by: "code",
        sort_direction: "asc",
      })
    ).items.find((item) => item.code === "230101")!;
    const category = await changeMaster(
      admin,
      company,
      undefined,
      { company_id: company, type: "asset", name: `Inventory presentation ${key()}` },
      key(),
      key(),
    );
    const target = await changeMaster(
      admin,
      company,
      undefined,
      { company_id: company, type: "asset", name: `Inventory holdings ${key()}`, parent_id: category.id },
      key(),
      key(),
    );
    const snapshot = (
      await pool.query(
        "select n.template_id,n.node_key,s.name,s.parent_key from finance_chart_company_node n join finance_chart_template_node s on s.tenant_id=n.tenant_id and s.template_id=n.template_id and s.node_key=n.node_key where n.tenant_id=$1 and n.account_id=$2",
        [tenant, stock.id],
      )
    ).rows[0];
    const edited = await nominals.update(
      admin,
      stock.id,
      { expected_version: stock.version!, name: "Inventory control display", section_id: target.id },
      key(),
      key(),
    );
    expect(await nominals.get(admin, stock.id)).toMatchObject({
      code: "230101",
      name: "Inventory control display",
      state: "draft",
      posting_classification: "module_controlled",
      category: { id: category.id },
      section: { id: target.id },
    });
    const templates = new SourceChartTemplateRepository(pool);
    await templates.classifyNominal(
      admin,
      stock.id,
      {
        expected_version: edited.version,
        classification: "module_controlled",
        reason: "Retain inventory module ownership after presentation edit",
      },
      key(),
      key(),
    );
    const source = (
      await pool.query(
        "select name,parent_key from finance_chart_template_node where tenant_id=$1 and template_id=$2 and node_key=$3",
        [tenant, snapshot.template_id, snapshot.node_key],
      )
    ).rows[0];
    expect(source).toEqual({ name: snapshot.name, parent_key: snapshot.parent_key });
    await expect(
      nominals.changeStatus(
        admin,
        stock.id,
        { expected_version: edited.version + 1, action: "activate", reason: "Must remain blocked" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "NOMINAL_POSTING_REVIEW_REQUIRED" });
  });
  it("keeps new Categories/Sections inactive until approval and records governed self decisions", async () => {
    const financialBefore = (
      await pool.query("select count(*)::int as count from journal_entry where tenant_id=$1 and company_id=$2", [
        tenant,
        company,
      ])
    ).rows[0].count;
    const draft = await headers.change(
      admin,
      company,
      undefined,
      { company_id: company, type: "asset", name: `Workflow category ${key()}` },
      key(),
      key(),
    );
    expect(draft).toMatchObject({ status: "inactive", state: "draft", version: 2 });
    const command = (
      id: string,
      version: number,
      action: "submit" | "approve" | "activate" | "reject",
      requestKey = key(),
    ) => headers.change(admin, company, id, { expected_version: version, action }, requestKey, key());
    await expect(command(draft.id, draft.version, "approve")).rejects.toMatchObject({ code: "COA_STATE_CONFLICT" });
    await expect(command(draft.id, draft.version, "activate")).rejects.toMatchObject({ code: "COA_STATE_CONFLICT" });
    await expect(
      headers.change(
        admin,
        company,
        undefined,
        { company_id: company, type: "asset", name: `Unapproved child ${key()}`, parent_id: draft.id },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "COA_CATEGORY_INVALID" });
    const pending = await command(draft.id, draft.version, "submit");
    expect(pending).toMatchObject({
      status: "inactive",
      state: "pending_approval",
      version: 3,
      self_decision_requires_override: true,
    });
    await expect(
      headers.change(
        admin,
        company,
        draft.id,
        { expected_version: pending.version, name: "Tampered pending" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "COA_STATE_CONFLICT" });
    await expect(command(draft.id, draft.version, "approve")).rejects.toMatchObject({
      code: "NOMINAL_VERSION_CONFLICT",
    });
    const denied = {
      ...admin,
      actor: { ...admin.actor, permissions: perms.filter((p) => p !== "finance.nominal.approve") },
    };
    await expect(
      headers.change(denied, company, draft.id, { expected_version: pending.version, action: "approve" }, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      headers.change(
        { ...admin, realActorId: "r06.maker" },
        company,
        draft.id,
        { expected_version: pending.version, action: "approve" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      headers.change(
        admin,
        "outside-company",
        draft.id,
        { expected_version: pending.version, action: "approve" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      headers.change(
        { ...admin, tenantId: "outside-tenant" },
        company,
        draft.id,
        { expected_version: pending.version, action: "approve" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      pool.query("update account set status='active' where tenant_id=$1 and id=$2", [tenant, draft.id]),
    ).rejects.toThrow();
    const retry = key();
    const results = await Promise.all([
      command(draft.id, pending.version, "approve", retry),
      command(draft.id, pending.version, "approve", retry),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toMatchObject({ status: "active", state: "active", version: 4, code: draft.code });
    const history = (
      await pool.query(
        "select w.action,w.state,w.approval_override_event_id,a.approval_reference from finance_coa_hierarchy_workflow w join platform_admin_audit_event a on a.tenant_id=w.tenant_id and a.id=w.change_id where w.tenant_id=$1 and w.account_id=$2 order by w.record_version",
        [tenant, draft.id],
      )
    ).rows;
    expect(history.map((row) => [row.action, row.state])).toEqual([
      ["created", "draft"],
      ["submitted", "pending_approval"],
      ["approved", "active"],
    ]);
    expect(history[2].approval_override_event_id).toBeTruthy();
    expect(history[2].approval_reference).toBe(history[2].approval_override_event_id);
    const sectionDraft = await headers.change(
      admin,
      company,
      undefined,
      { company_id: company, type: "asset", name: `Workflow Section ${key()}`, parent_id: draft.id },
      key(),
      key(),
    );
    expect(sectionDraft).toMatchObject({ status: "inactive", state: "draft" });
    const sectionPending = await command(sectionDraft.id, sectionDraft.version, "submit");
    const approvedSection = await command(sectionDraft.id, sectionPending.version, "approve");
    expect(approvedSection).toMatchObject({
      status: "active",
      state: "active",
      code: sectionDraft.code,
      parent_id: draft.id,
    });
    await expect(
      pool.query("delete from finance_coa_hierarchy_workflow where tenant_id=$1 and account_id=$2", [tenant, draft.id]),
    ).rejects.toThrow();
    await expect(
      pool.query("update finance_coa_hierarchy_workflow set state='active' where tenant_id=$1 and account_id=$2", [
        tenant,
        draft.id,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query("update account set code='CAT-ALTERED' where tenant_id=$1 and id=$2", [tenant, draft.id]),
    ).rejects.toThrow();
    expect(
      (
        await pool.query("select count(*)::int as count from journal_entry where tenant_id=$1 and company_id=$2", [
          tenant,
          company,
        ])
      ).rows[0].count,
    ).toBe(financialBefore);
  });
  it("requires rejection reasons, keeps rejected records inactive and rolls back failed approval evidence", async () => {
    const draft = await headers.change(
      admin,
      company,
      undefined,
      { company_id: company, type: "equity", name: `Rejected workflow ${key()}` },
      key(),
      key(),
    );
    const pending = await headers.change(
      admin,
      company,
      draft.id,
      { expected_version: draft.version, action: "submit" },
      key(),
      key(),
    );
    await expect(
      headers.change(admin, company, draft.id, { expected_version: pending.version, action: "reject" }, key(), key()),
    ).rejects.toMatchObject({ code: "COA_REJECTION_REASON_REQUIRED" });
    const rejected = await headers.change(
      admin,
      company,
      draft.id,
      { expected_version: pending.version, action: "reject", reason: "Duplicate classification after review" },
      key(),
      key(),
    );
    expect(rejected).toMatchObject({ status: "inactive", state: "rejected" });
    await expect(
      headers.change(
        admin,
        company,
        draft.id,
        { expected_version: rejected.version, action: "activate" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "COA_STATE_CONFLICT" });
    const next = await headers.change(
      admin,
      company,
      undefined,
      { company_id: company, type: "equity", name: `Approval rollback ${key()}` },
      key(),
      key(),
    );
    const submitted = await headers.change(
      admin,
      company,
      next.id,
      { expected_version: next.version, action: "submit" },
      key(),
      key(),
    );
    const trigger = `hierarchy_failure_${key().replaceAll("-", "")}`;
    await pool.query(
      `create function ${trigger}() returns trigger language plpgsql as $$ begin if NEW.account_id='${next.id}' and NEW.action='approved' then raise exception 'Synthetic approval evidence failure'; end if; return NEW; end $$; create trigger ${trigger} before insert on finance_coa_hierarchy_workflow for each row execute function ${trigger}()`,
    );
    try {
      await expect(
        headers.change(
          admin,
          company,
          next.id,
          { expected_version: submitted.version, action: "approve" },
          key(),
          key(),
        ),
      ).rejects.toThrow("Synthetic approval evidence failure");
      expect(
        (await headers.list(admin, { company_id: company, limit: 100 })).items.find((row) => row.id === next.id),
      ).toMatchObject({ status: "inactive", state: "pending_approval", version: submitted.version });
      expect(
        (
          await pool.query(
            "select count(*)::int as count from approval_override_event where tenant_id=$1 and resource_type='finance.hierarchy' and resource_id=$2",
            [tenant, next.id],
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await pool.query(`drop trigger ${trigger} on finance_coa_hierarchy_workflow; drop function ${trigger}()`);
    }
    expect(
      (
        await headers.change(
          admin,
          company,
          next.id,
          { expected_version: submitted.version, action: "approve" },
          key(),
          key(),
        )
      ).state,
    ).toBe("active");
  });
});
