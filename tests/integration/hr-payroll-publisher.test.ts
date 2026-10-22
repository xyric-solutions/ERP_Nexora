import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { hrLocalizationWorkspaceSchema } from "../../packages/contracts/src/hr/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { publishApprovedStatutoryPack as publish } from "../../server/api/src/modules/hr/payroll-statutory-publisher.js";
import { statutoryBundleIdentity } from "../../server/api/src/modules/hr/payroll-statutory-bundle.js";
import { createPublisherFixture, publisherActor } from "./hr-payroll-publisher-fixture.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Privileged statutory rule publication", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createPublisherFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createPublisherFixture(pool);
    fixtures.push(f);
    return f;
  }
  it("imports the exact independently approved synthetic artifact with immutable publication evidence and replay", async () => {
    const f = await fixture(),
      input = await f.proposal();
    await expect(publish(pool, input)).rejects.toThrow(/allow-synthetic/);
    const result = await publish(pool, { ...input, allowSynthetic: true });
    expect(result.replayed).toBe(false);
    expect((await publish(pool, { ...input, allowSynthetic: true })).replayed).toBe(true);
    const workspace = await f.repo.getPayrollLocalization(publisherActor(), f.query("pack_release"));
    hrLocalizationWorkspaceSchema.parse(workspace);
    expect(workspace.items[0]!.publication).toMatchObject({
      artifact_hash: input.artifactHash,
      pack_version_id: result.pack_version_id,
    });
    await expect(
      pool.query("update localization_import_release set report_json='{}' where artifact_hash=$1", [
        input.artifactHash,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query("delete from hr_statutory_pack_publication where tenant_id=$1 and request_id=$2", [
        tenant,
        input.requestId,
      ]),
    ).rejects.toThrow();
    const r = (
      await pool.query("select report_json from localization_import_release where artifact_hash=$1", [
        input.artifactHash,
      ])
    ).rows[0].report_json;
    expect(r).toMatchObject({
      classification: "synthetic",
      maker: "r06.maker",
      reviewer: "r06.checker",
      engine_validation: "reviewed_vectors_v1",
    });
  });
  it("rejects unapproved bundles, mismatched fingerprints and company/tenant substitution", async () => {
    const f = await fixture(),
      draft = await f.create(f.bundle),
      hash = statutoryBundleIdentity(tenant, f.bundle).artifact_hash;
    await expect(
      publish(pool, { tenant, company: f.companyId, requestId: draft.id, artifactHash: hash, allowSynthetic: true }),
    ).rejects.toThrow(/approved/);
    await f.act("pack_release", draft.id, "submit");
    await expect(f.act("pack_release", draft.id, "approve")).rejects.toMatchObject({ status: 403 });
    await f.act("pack_release", draft.id, "approve", "r06.checker");
    const input = { tenant, company: f.companyId, requestId: draft.id, artifactHash: hash, allowSynthetic: true };
    await expect(publish(pool, { ...input, artifactHash: "0".repeat(64) })).rejects.toThrow(/fingerprint/);
    await expect(publish(pool, { ...input, company: "foreign-company" })).rejects.toThrow(/approved/);
    await expect(publish(pool, { ...input, tenant: "foreign-tenant" })).rejects.toThrow(/approved/);
    expect((await pool.query("select id from localization_pack_version where artifact_hash=$1", [hash])).rowCount).toBe(
      0,
    );
  });
  it("requires publishing permission and rejects non-reproducing reviewed vectors before creating a draft", async () => {
    const f = await fixture(),
      bad = structuredClone(f.bundle);
    bad.rules[0]!.vectors[0]!.expected.amount = "999";
    await expect(f.create(bad)).rejects.toMatchObject({ status: 409 });
    const weak = {
      ...publisherActor(),
      actor: {
        ...publisherActor().actor,
        permissions: publisherActor().actor.permissions.filter((p) => p !== "platform.localization.activate"),
      },
    };
    await expect(
      f.repo.createPayrollLocalization(
        weak,
        {
          company_id: f.companyId,
          terms: f.bundle,
          source_reference: "Isolated fixture",
          reason: "Missing explicit publisher authority",
        },
        randomUUID(),
        "publisher-test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("publishes production-classification test data and finalizes a real Payroll HTTP approval through the normal executor", async () => {
    // This classification-path fixture lives only in the isolated test DB. No legal rates are asserted or deployed.
    const f = await fixture(),
      bundle = { ...f.bundle, classification: "production" as const },
      profile = await f.prepareCompany(),
      input = await f.proposal(bundle),
      published = await publish(pool, input);
    await f.approve({
      kind: "activation",
      legal_profile_id: profile,
      jurisdiction_id: f.jurisdiction,
      pack_version_id: published.pack_version_id,
      effective_from: f.month,
      effective_to: null,
    });
    // Company fixture policy/open helpers still use the same persisted repository.
    const runAction = async (
      action: "policy" | "open" | "calculate" | "submit",
      extra: Record<string, unknown> = {},
    ) => {
      const state = await f.repo.getPayrollRunWorkspace(publisherActor(), { company_id: f.companyId, month: f.month });
      return f.repo.actOnPayrollRun(
        publisherActor(),
        {
          company_id: f.companyId,
          month: f.month,
          action,
          reason: "Isolated production-classification path acceptance",
          expected_version: state.period?.version ?? 0,
          source_hash: state.source_hash,
          confirm_override: false,
          ...extra,
        },
        randomUUID(),
        "publisher-test",
      );
    };
    await runAction("policy", {
      currency_code: "PKR",
      money_scale: 2,
      rounding_mode: "half_up",
      net_payable_account_id: f.liability,
    });
    let state = await f.repo.getPayrollRunWorkspace(publisherActor(), { company_id: f.companyId, month: f.month });
    await runAction("open", { policy_id: state.policies[0]!.id });
    await runAction("calculate");
    state = await f.repo.getPayrollRunWorkspace(publisherActor(), { company_id: f.companyId, month: f.month });
    expect(state.employees[0]!.net).toBe("27900.0000");
    expect(state.blocked).toEqual([]);
    await runAction("submit");
    const actor = publisherActor("r06.checker").actor,
      csrf = "p".repeat(43),
      session = {
        sessionId: "publisher-http-review",
        tenantId: tenant,
        userId: "r06.checker",
        csrfToken: csrf,
        idleExpiresAt: new Date("2099-01-01"),
        absoluteExpiresAt: new Date("2099-01-01"),
      };
    const app = createApp({
      config: { allowedOrigins: new Set(["https://publisher.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      hrRepository: f.repo,
      authService: { loadAuthenticatedAccount: vi.fn(async () => actor) } as unknown as TenantAuthApiService,
      sessionService: {
        get: vi.fn(async () => session),
        authorizeMutation: vi.fn(async (_token: string, value: string) =>
          value === csrf ? { status: "ok", session } : { status: "invalid_csrf" },
        ),
      } as unknown as TenantSessionApiService,
    });
    state = await f.repo.getPayrollRunWorkspace(publisherActor("r06.checker"), {
      company_id: f.companyId,
      month: f.month,
    });
    const body = {
        company_id: f.companyId,
        month: f.month,
        action: "approve",
        reason: "Independent reviewed HTTP final approval",
        expected_version: state.period!.version,
        source_hash: state.source_hash,
        confirm_override: false,
      },
      key = randomUUID();
    const approved = await request(app)
      .post("/api/v1/hr/payroll_runs/actions")
      .set("cookie", "nexora_session=publisher-http")
      .set("origin", "https://publisher.example.test")
      .set("x-csrf-token", csrf)
      .set("idempotency-key", key)
      .send(body);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");
    const replay = await request(app)
      .post("/api/v1/hr/payroll_runs/actions")
      .set("cookie", "nexora_session=publisher-http")
      .set("origin", "https://publisher.example.test")
      .set("x-csrf-token", csrf)
      .set("idempotency-key", key)
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
  });
  it("refuses duplicate published versions and rolls back invalid catalog identities", async () => {
    const f = await fixture(),
      input = await f.proposal();
    await publish(pool, { ...input, allowSynthetic: true });
    await expect(f.create(f.bundle)).rejects.toMatchObject({ status: 409 });
    const next = { ...f.bundle, semantic_version: "1.0.1", country_code: "US" };
    await expect(f.create(next)).rejects.toMatchObject({ status: 409 });
  });
  it("does not grant catalog publishing authority to an ordinary database login", async () => {
    const role = "stat_unpriv_" + randomUUID().replaceAll("-", "");
    await pool.query('create role "' + role + '" login');
    let limited: DatabasePool | undefined;
    try {
      const target = new URL(url!);
      target.username = role;
      target.password = "";
      limited = createDatabasePool(target.toString());
      await expect(
        publish(limited, { tenant, company: "none", requestId: "none", artifactHash: "a".repeat(64) }),
      ).rejects.toThrow(/registered localization publisher/);
    } finally {
      await limited?.end();
      await pool.query('drop role "' + role + '"');
    }
  });
  it("publishes through a registered non-owner login with only the required catalog and audit grants", async () => {
    const f = await fixture(),
      input = await f.proposal(),
      role = "stat_publisher_" + randomUUID().replaceAll("-", "");
    const selects =
      "hr_payroll_localization_request,country,jurisdiction,currency,localization_pack,localization_pack_version,hr_statutory_rule,hr_statutory_rule_version,hr_statutory_rule_test_vector,localization_import_release,hr_statutory_pack_publication";
    const inserts =
      "localization_pack,localization_pack_version,hr_statutory_rule,hr_statutory_rule_version,hr_statutory_rule_test_vector,localization_import_release,hr_statutory_pack_publication,hr_payroll_workspace_event";
    const all = [...new Set((selects + "," + inserts).split(","))].join(",");
    let publisher: DatabasePool | undefined;
    await pool.query('create role "' + role + '" login');
    try {
      await pool.query(
        "insert into localization_publisher_principal(role_name,status,registered_by) values($1,$2,$3)",
        [role, "active", "isolated-publisher-test"],
      );
      await pool.query("grant select on " + selects + ' to "' + role + '"');
      await pool.query("grant insert on " + inserts + ' to "' + role + '"');
      await pool.query('grant update on localization_pack_version to "' + role + '"');
      const target = new URL(url!);
      target.username = role;
      target.password = "";
      publisher = createDatabasePool(target.toString());
      const result = await publish(publisher, { ...input, allowSynthetic: true });
      expect(result.publisher_name).toBe(role);
      expect(
        (
          await pool.query("select imported_by from localization_import_release where artifact_hash=$1", [
            input.artifactHash,
          ])
        ).rows[0].imported_by,
      ).toBe(role);
    } finally {
      await publisher?.end();
      await pool.query("delete from localization_publisher_principal where role_name=$1", [role]);
      await pool.query("revoke all on " + all + ' from "' + role + '"');
      await pool.query('drop role "' + role + '"');
    }
  });
});
