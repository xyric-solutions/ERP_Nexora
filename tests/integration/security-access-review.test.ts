import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SecurityAdministrationError,
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../../server/api/src/modules/security/source-administration-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

function context(userId: string, correlationId: string): SecurityActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: [],
    permissions: [],
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor, correlationId };
}

run("security access review", () => {
  const suffix = randomUUID();
  let pool: DatabasePool;
  let repository: SourceSecurityAdministrationRepository;
  let campaignId = "";
  let campaignVersion = 1;
  let items: Record<string, unknown>[] = [];

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    repository = new SourceSecurityAdministrationRepository(pool, "d".repeat(32));
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates a company-scoped campaign with an independent reviewer", async () => {
    const created = await repository.createAccessReviewCampaign(
      context("r06.maker", `access-review-create-${suffix}`),
      {
        name: `Quarterly access review ${suffix}`,
        description: "Synthetic production-path review",
        company_ids: ["nexora-r06-uat-company"],
        reviewer_ids: ["r06.checker"],
        review_starts_at: new Date(Date.now() - 60_000).toISOString(),
        review_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
      `access-review-create-${suffix}`,
    );
    campaignId = created.entity_id;
    expect(created.projection.new_state).toMatchObject({ lifecycle_state: "draft", row_version: "1" });
    const page = await repository.listAccessReviewCampaigns(context("r06.maker", `access-review-list-${suffix}`), {
      campaign_id: campaignId,
      cursor: 0,
      limit: 25,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ campaign_id: campaignId, company_ids: ["nexora-r06-uat-company"] });
  });

  it("enforces maker-checker and activates an immutable deterministic snapshot", async () => {
    const submitted = await repository.actOnAccessReviewCampaign(
      context("r06.maker", `access-review-submit-${suffix}`),
      { action: "submit", campaign_id: campaignId, expected_version: campaignVersion },
      `access-review-submit-${suffix}`,
    );
    campaignVersion = Number((submitted.projection.new_state as Record<string, unknown>).row_version);
    await expect(
      repository.actOnAccessReviewCampaign(
        context("r06.maker", `access-review-self-approve-${suffix}`),
        { action: "approve", campaign_id: campaignId, expected_version: campaignVersion },
        `access-review-self-approve-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" } satisfies Partial<SecurityAdministrationError>);
    const approved = await repository.actOnAccessReviewCampaign(
      context("r06.checker", `access-review-approve-${suffix}`),
      { action: "approve", campaign_id: campaignId, expected_version: campaignVersion },
      `access-review-approve-${suffix}`,
    );
    campaignVersion = Number((approved.projection.new_state as Record<string, unknown>).row_version);
    const activated = await repository.actOnAccessReviewCampaign(
      context("r06.maker", `access-review-activate-${suffix}`),
      { action: "activate", campaign_id: campaignId, expected_version: campaignVersion },
      `access-review-activate-${suffix}`,
    );
    campaignVersion = Number((activated.projection.new_state as Record<string, unknown>).row_version);
    const page = await repository.listAccessReviewItems(context("r06.checker", `access-review-items-${suffix}`), {
      campaign_id: campaignId,
      reviewer_id: "r06.checker",
      cursor: 0,
      limit: 100,
    });
    items = page.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.reviewer_id === "r06.checker")).toBe(true);
    await expect(
      pool.query("update security_access_review_item set snapshot='{}'::jsonb where tenant_id=$1 and item_id=$2", [
        sourceTestTenantId,
        items[0]!.item_id,
      ]),
    ).rejects.toThrow(/append-only/);
  });

  it("records immutable decisions and creates governed remediation requests", async () => {
    const revocable = items.find((item) => item.subject_user_id === "r06.restricted") ?? items[0]!;
    const decided = await repository.decideAccessReviewItem(
      context("r06.checker", `access-review-revoke-${suffix}`),
      {
        item_id: String(revocable.item_id),
        decision: "revoke",
        reason: "Access is no longer required",
        expected_version: 1,
      },
      `access-review-revoke-${suffix}`,
    );
    expect(decided.projection.new_state).toMatchObject({ decision: "revoke", remediation_resource_type: "assignment" });
    expect((decided.projection.new_state as Record<string, unknown>).remediation_request_id).toBeTruthy();
    await expect(
      repository.decideAccessReviewItem(
        context("r06.checker", `access-review-duplicate-${suffix}`),
        { item_id: String(revocable.item_id), decision: "retain", reason: null, expected_version: 1 },
        `access-review-duplicate-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 409, code: "ADMINISTRATION_CONFLICT" });
    for (const item of items.filter((candidate) => candidate.item_id !== revocable.item_id)) {
      await repository.decideAccessReviewItem(
        context("r06.checker", `access-review-retain-${item.item_id}`),
        { item_id: String(item.item_id), decision: "retain", reason: null, expected_version: 1 },
        `access-review-retain-${item.item_id}`,
      );
    }
  });

  it("closes only after every item has complete evidence and denies restricted actors", async () => {
    const closed = await repository.actOnAccessReviewCampaign(
      context("r06.maker", `access-review-close-${suffix}`),
      { action: "close", campaign_id: campaignId, expected_version: campaignVersion },
      `access-review-close-${suffix}`,
    );
    expect(closed.projection.new_state).toMatchObject({ lifecycle_state: "closed" });
    await expect(
      repository.listAccessReviewCampaigns(context("r06.restricted", `access-review-denied-${suffix}`), {
        cursor: 0,
        limit: 25,
      }),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
  });
});
