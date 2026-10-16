export interface TenantSecurityPolicy {
  passwordMinimumLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  concurrentSessionLimit: number;
  loginMaximumFailures: number;
  loginWindowMs: number;
  loginBlockMs: number;
  delegationMaximumMs: number;
  impersonationMaximumMs: number;
}

export interface TenantSecurityPolicyAuthority {
  loadEffectiveSecurityPolicy(tenantId: string): Promise<TenantSecurityPolicy | null>;
}

export class CachedTenantSecurityPolicyAuthority implements TenantSecurityPolicyAuthority {
  private readonly cache = new Map<string, { expiresAt: number; value: TenantSecurityPolicy | null }>();
  constructor(
    private readonly source: TenantSecurityPolicyAuthority,
    private readonly ttlMs = 30_000,
    private readonly clock = () => Date.now(),
  ) {
    if (ttlMs < 1_000 || ttlMs > 60_000) throw new Error("Invalid security policy cache lifetime");
  }
  async loadEffectiveSecurityPolicy(tenantId: string): Promise<TenantSecurityPolicy | null> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > this.clock()) return cached.value;
    const value = await this.source.loadEffectiveSecurityPolicy(tenantId);
    if (this.cache.size >= 1_000) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(tenantId, { value, expiresAt: this.clock() + this.ttlMs });
    return value;
  }
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
