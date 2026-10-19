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

  it("writes governed posting override evidence with the bounded post action", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ role_policy_id: "policy-a", assignment_id: "assignment-a", assignment_version: "1" }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ event_id: "override-post-a" }], rowCount: 1 }),
    };

    await expect(
      writeApprovalOverrideEvent(client as never, {
        ...input,
        account: {
          ...input.account,
          permissions: ["platform.approval.override", "banking.payment.post"],
        },
        normalDecisionPermission: "banking.payment.post",
        resourceType: "banking.payment",
        resourceId: "payment-a",
        decisionAction: "post",
      }),
    ).resolves.toEqual({ eventId: "override-post-a", replayed: false });

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[1]?.[1]?.[4]).toBe("post");
  });

  it("rejects unsupported runtime actions before resolving database authority", async () => {
    const client = { query: vi.fn() };
    await expect(
      writeApprovalOverrideEvent(client as never, {
        ...input,
        decisionAction: "delete" as never,
      }),
    ).rejects.toMatchObject({ code: "INVALID_APPROVAL_OVERRIDE_EVIDENCE" });
    expect(client.query).not.toHaveBeenCalled();
  });
});
