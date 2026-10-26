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
      "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','Synthetic USD',2,true,'active') on conflict do nothing",
      [tenant],
    );
    category = (
      await headers.change(
        admin,
        company,
        undefined,
        { company_id: company, type: "expense", name: "Direct test expenses" },
        key(),
        key(),
      )
    ).id;
    section = (
      await headers.change(
        admin,
        company,
        undefined,
        { company_id: company, type: "expense", name: "Direct test services", parent_id: category, code: "9001" },
        key(),
        key(),
      )
    ).id;
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
  it("denies ordinary master mutations even with every nominal permission and a stale Super Admin claim", async () => {
    await expect(nominals.create(ordinary, input(), key(), key())).rejects.toMatchObject({ status: 403 });
    await expect(
      headers.change(
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
    const row = (await headers.list(admin, { company_id: company, limit: 100 })).items.find((x) => x.id === section)!;
    await expect(
      headers.change(admin, company, section, { expected_version: row.version, action: "deactivate" }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("serializes duplicate header names and directly deactivates/reactivates an unused category", async () => {
    const body = { company_id: company, name: `Concurrent header ${key()}`, type: "expense" as const };
    const results = await Promise.allSettled([
      headers.change(admin, company, undefined, body, key(), key()),
      headers.change(admin, company, undefined, { ...body, name: body.name.toUpperCase() }, key(), key()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const item = (await headers.list(admin, { company_id: company, limit: 100 })).items.find(
      (r) => r.name.toLowerCase() === body.name.toLowerCase(),
    )!;
    const inactive = await headers.change(
      admin,
      company,
      item.id,
      { expected_version: item.version, action: "deactivate" },
      key(),
      key(),
    );
    expect(inactive.status).toBe("inactive");
    const active = await headers.change(
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
    expect(created.body.status).toBe("active");
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
});
