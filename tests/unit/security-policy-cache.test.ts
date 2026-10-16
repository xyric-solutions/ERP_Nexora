import { describe, expect, it } from "vitest";
import { CachedTenantSecurityPolicyAuthority, type TenantSecurityPolicy } from "../../packages/auth/src/index.js";

const policy: TenantSecurityPolicy = {
  passwordMinimumLength: 12,
  passwordRequireUppercase: true,
  passwordRequireLowercase: true,
  passwordRequireNumber: true,
  passwordRequireSymbol: true,
  sessionIdleMs: 600_000,
  sessionAbsoluteMs: 7_200_000,
  concurrentSessionLimit: 2,
  loginMaximumFailures: 4,
  loginWindowMs: 900_000,
  loginBlockMs: 1_800_000,
  delegationMaximumMs: 604_800_000,
  impersonationMaximumMs: 900_000,
};

describe("tenant security policy cache", () => {
  it("bounds reads and supports activation invalidation", async () => {
    let reads = 0;
    let now = 0;
    const cache = new CachedTenantSecurityPolicyAuthority(
      {
        loadEffectiveSecurityPolicy: async () => {
          reads += 1;
          return policy;
        },
      },
      30_000,
      () => now,
    );
    await cache.loadEffectiveSecurityPolicy("tenant-a");
    await cache.loadEffectiveSecurityPolicy("tenant-a");
    expect(reads).toBe(1);
    cache.invalidate("tenant-a");
    await cache.loadEffectiveSecurityPolicy("tenant-a");
    expect(reads).toBe(2);
    now = 31_000;
    await cache.loadEffectiveSecurityPolicy("tenant-a");
    expect(reads).toBe(3);
  });
});
