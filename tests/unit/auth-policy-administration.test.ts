import { describe, expect, it, vi } from "vitest";

import {
  PolicyAdministrationService,
  type PolicyAdministrationCommand,
  type PolicyAdministrationRepository,
} from "../../packages/auth/src/index.js";

const command: PolicyAdministrationCommand = {
  commandId: "40000000-0000-4000-8000-000000000001",
  operation: "role.create",
  targetScope: {
    scopeId: "40000000-0000-4000-8000-000000000002",
    scopeType: "enterprise",
    status: "active",
    enterpriseScopeId: "40000000-0000-4000-8000-000000000002",
    companyScopeId: null,
    ancestorScopeIds: [],
  },
  requestedFields: ["code", "displayName", "description"],
  data: { code: "auditor", displayName: "Auditor", description: "Read-only audit role" },
  evaluatedAt: new Date("2026-10-07T12:00:00.000Z"),
};

const actor = {
  userId: "40000000-0000-4000-8000-000000000003",
  sessionId: "40000000-0000-4000-8000-000000000004",
  assuranceLevel: "mfa" as const,
};

describe("policy administration service", () => {
  it("requires MFA before calling the repository", async () => {
    const executeAuthorized = vi.fn<PolicyAdministrationRepository["executeAuthorized"]>();
    const service = new PolicyAdministrationService({ executeAuthorized });
    await expect(service.execute({ ...actor, assuranceLevel: "password" }, command)).resolves.toEqual({
      ok: false,
      commandId: command.commandId,
      code: "mfa_required",
    });
    expect(executeAuthorized).not.toHaveBeenCalled();
  });

  it("returns an authorized atomic repository result", async () => {
    const result = {
      ok: true as const,
      commandId: command.commandId,
      entityId: "40000000-0000-4000-8000-000000000005",
      version: 1,
      replayed: false,
    };
    const executeAuthorized = vi.fn<PolicyAdministrationRepository["executeAuthorized"]>().mockResolvedValue(result);
    const service = new PolicyAdministrationService({ executeAuthorized });
    await expect(service.execute(actor, command)).resolves.toEqual(result);
    expect(executeAuthorized).toHaveBeenCalledWith(actor, command);
  });

  it("fails closed without leaking repository errors", async () => {
    const service = new PolicyAdministrationService({
      executeAuthorized: async () => {
        throw new Error("postgresql://secret@internal/policy");
      },
    });
    await expect(service.execute(actor, command)).resolves.toEqual({
      ok: false,
      commandId: command.commandId,
      code: "policy_unavailable",
    });
  });
});
