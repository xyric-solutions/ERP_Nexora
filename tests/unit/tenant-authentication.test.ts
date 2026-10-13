import { pbkdf2Sync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  encodePbkdf2Sha256Credential,
  TenantAuthenticationService,
  type LoginThrottleStore,
  type TenantAuthenticationRepository,
} from "../../packages/auth/src/index.js";

function legacyCredential(password: string): string {
  const salt = Buffer.from("0123456789abcdef", "utf8");
  return encodePbkdf2Sha256Credential(310_000, salt, pbkdf2Sync(password, salt, 310_000, 32, "sha256"));
}

function throttle(): LoginThrottleStore {
  return {
    findBlockedUntil: vi.fn(async () => null),
    recordFailure: vi.fn(async () => null),
    clear: vi.fn(async () => undefined),
  };
}

describe("tenant password authentication", () => {
  it("accepts a legacy credential, loads live authorization, and upgrades only after success", async () => {
    const encodedPasswordHash = legacyCredential("correct legacy phrase");
    const repository: TenantAuthenticationRepository = {
      resolveLoginCandidates: vi.fn(async () => [{ tenantId: "tenant-a", userId: "user-a" }]),
      findPasswordCredential: vi.fn(async () => ({
        tenantId: "tenant-a",
        userId: "user-a",
        status: "active",
        encodedPasswordHash,
        mustChangePassword: false,
        passwordVersion: 1,
      })),
      loadAuthenticatedAccount: vi.fn(async () => ({
        tenantId: "tenant-a",
        organizationName: "Tenant A",
        userId: "user-a",
        email: "user@example.test",
        displayName: "Test User",
        roles: ["operator"],
        permissions: ["security.authorization.permission.read"],
        sessionVersion: 1,
      })),
      upgradePasswordHash: vi.fn(async () => true),
      appendAuthenticationEvent: vi.fn(async () => undefined),
    };
    const service = await TenantAuthenticationService.create({
      repository,
      throttleStore: throttle(),
      throttleSecret: "t".repeat(32),
      loginDirectorySecret: "d".repeat(32),
      dummyPasswordHash: encodedPasswordHash,
    });

    await expect(
      service.verifyPasswordCredentials({
        identifier: "USER@EXAMPLE.TEST",
        password: "correct legacy phrase",
        sourceIp: "127.0.0.1",
        correlationId: "correlation-a",
      }),
    ).resolves.toMatchObject({ status: "verified", accounts: [{ userId: "user-a" }] });
    expect(repository.upgradePasswordHash).toHaveBeenCalledOnce();
  });

  it("returns the same safe result for an unknown identity and a wrong password", async () => {
    const encodedPasswordHash = legacyCredential("correct legacy phrase");
    const repository: TenantAuthenticationRepository = {
      resolveLoginCandidates: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ tenantId: "tenant-a", userId: "user-a" }]),
      findPasswordCredential: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        tenantId: "tenant-a",
        userId: "user-a",
        status: "active",
        encodedPasswordHash,
        mustChangePassword: false,
        passwordVersion: 1,
      }),
      loadAuthenticatedAccount: vi.fn(async () => null),
      upgradePasswordHash: vi.fn(async () => true),
      appendAuthenticationEvent: vi.fn(async () => undefined),
    };
    const service = await TenantAuthenticationService.create({
      repository,
      throttleStore: throttle(),
      throttleSecret: "t".repeat(32),
      loginDirectorySecret: "d".repeat(32),
      dummyPasswordHash: encodedPasswordHash,
    });
    const input = {
      identifier: "user@example.test",
      password: "wrong credential phrase",
      sourceIp: "127.0.0.1",
      correlationId: "correlation-b",
    };

    await expect(service.verifyPasswordCredentials(input)).resolves.toEqual({ status: "invalid" });
    await expect(service.verifyPasswordCredentials(input)).resolves.toEqual({ status: "invalid" });
    expect(repository.upgradePasswordHash).not.toHaveBeenCalled();
  });

  it("evaluates every bounded candidate and returns only memberships with the verified password", async () => {
    const matchingHash = legacyCredential("shared password phrase");
    const otherHash = legacyCredential("different password phrase");
    const candidates = [
      { tenantId: "tenant-a", userId: "user-a" },
      { tenantId: "tenant-b", userId: "user-b" },
      { tenantId: "tenant-c", userId: "user-c" },
    ];
    const repository: TenantAuthenticationRepository = {
      resolveLoginCandidates: vi.fn(async () => candidates),
      findPasswordCredential: vi.fn(async (tenantId, userId) => ({
        tenantId,
        userId,
        status: "active",
        encodedPasswordHash: userId === "user-c" ? otherHash : matchingHash,
        mustChangePassword: false,
        passwordVersion: 1,
      })),
      loadAuthenticatedAccount: vi.fn(async (tenantId, userId) => ({
        tenantId,
        organizationName: `Organization ${tenantId}`,
        userId,
        email: "shared@example.test",
        displayName: "Shared User",
        roles: [],
        permissions: [],
        sessionVersion: 1,
      })),
      upgradePasswordHash: vi.fn(async () => true),
      appendAuthenticationEvent: vi.fn(async () => undefined),
    };
    const service = await TenantAuthenticationService.create({
      repository,
      throttleStore: throttle(),
      throttleSecret: "t".repeat(32),
      loginDirectorySecret: "d".repeat(32),
      dummyPasswordHash: otherHash,
    });

    await expect(
      service.verifyPasswordCredentials({
        identifier: "shared@example.test",
        password: "shared password phrase",
        sourceIp: "127.0.0.1",
        correlationId: "correlation-c",
      }),
    ).resolves.toMatchObject({
      status: "verified",
      accounts: [{ tenantId: "tenant-a" }, { tenantId: "tenant-b" }],
    });
    expect(repository.findPasswordCredential).toHaveBeenCalledTimes(3);
    expect(repository.loadAuthenticatedAccount).toHaveBeenCalledTimes(2);
  });
});
