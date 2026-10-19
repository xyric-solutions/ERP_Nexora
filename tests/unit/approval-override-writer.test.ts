import { describe, expect, it, vi } from "vitest";

import {
  ApprovalOverrideWriterError,
  writeApprovalOverrideEvent,
} from "../../server/api/src/modules/security/approval-override-writer.js";

const input = {
  tenantId: "tenant-a",
  account: {
    tenantId: "tenant-a",
    organizationName: "Tenant A",
    userId: "maker-a",
    email: "maker@example.test",
    displayName: "Maker",
    roles: ["super_administrator"],
    permissions: ["platform.approval.override", "banking.bank_account.approve"],
    sessionVersion: 1,
  },
  makerActorIds: ["maker-a"],
  normalDecisionPermission: "banking.bank_account.approve",
  resourceType: "banking.bank_account",
  resourceId: "account-a",
  decisionAction: "approve" as const,
  reason: "Controlled acceptance exception",
  correlationId: "correlation-a",
  idempotencyKey: "override-a",
};

describe("approval override event writer", () => {
  it("does not query the database for an independent approver", async () => {
    const client = { query: vi.fn() };
    await expect(
      writeApprovalOverrideEvent(client as never, {
        ...input,
        account: { ...input.account, userId: "checker-a" },
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_OVERRIDE_NOT_REQUIRED" });
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects impersonation before resolving authority", async () => {
    const client = { query: vi.fn() };
    await expect(writeApprovalOverrideEvent(client as never, { ...input, impersonated: true })).rejects.toMatchObject({
      code: "APPROVAL_OVERRIDE_FORBIDDEN",
    });
    expect(client.query).not.toHaveBeenCalled();
  });

  it("does not trust role and permission claims without an active database assignment", async () => {
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    await expect(writeApprovalOverrideEvent(client as never, input)).rejects.toMatchObject({
      code: "APPROVAL_OVERRIDE_AUTHORITY_UNAVAILABLE",
    });
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("rejects an empty reason before any evidence query", async () => {
    const client = { query: vi.fn() };
    await expect(writeApprovalOverrideEvent(client as never, { ...input, reason: "   " })).rejects.toBeInstanceOf(
      ApprovalOverrideWriterError,
    );
    expect(client.query).not.toHaveBeenCalled();
  });
});
