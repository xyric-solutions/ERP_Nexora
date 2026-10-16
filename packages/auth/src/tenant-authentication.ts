import { createHmac, randomBytes } from "node:crypto";

import { hashPassword, passwordHashNeedsUpgrade, verifyCompatiblePassword } from "./passwords.js";
import type { TenantSecurityPolicyAuthority } from "./security-policy.js";

export interface LoginThrottleKey {
  scope: "identifier" | "network";
  keyHash: string;
}

export interface LoginThrottlePolicy {
  maximumFailures: number;
  windowMs: number;
  blockMs: number;
}

export const defaultLoginThrottlePolicy: LoginThrottlePolicy = {
  maximumFailures: 5,
  windowMs: 15 * 60 * 1_000,
  blockMs: 15 * 60 * 1_000,
};

export interface AuthenticatedAccount {
  tenantId: string;
  organizationName: string;
  userId: string;
  email: string;
  displayName: string;
  roles: readonly string[];
  permissions: readonly string[];
  sessionVersion: number;
}

export interface PasswordVerifiedAccount extends AuthenticatedAccount {
  mustChangePassword: boolean;
  passwordVersion: number;
}

export interface TenantPasswordCredential {
  tenantId: string;
  userId: string;
  status: "active" | "inactive" | "locked";
  encodedPasswordHash: string;
  mustChangePassword: boolean;
  passwordVersion: number;
}

export interface LoginCandidate {
  tenantId: string;
  userId: string;
}

export type AuthenticationEventType =
  | "credential_verified"
  | "tenant_selection_required"
  | "tenant_selected"
  | "initial_password_changed"
  | "session_issued";

export interface TenantAuthenticationRepository {
  resolveLoginCandidates(input: {
    emailHmac: string;
    usernameHmac: string;
    limit: number;
  }): Promise<readonly LoginCandidate[]>;
  findPasswordCredential(tenantId: string, userId: string): Promise<TenantPasswordCredential | null>;
  loadAuthenticatedAccount(tenantId: string, userId: string, evaluatedAt: Date): Promise<AuthenticatedAccount | null>;
  upgradePasswordHash(input: {
    tenantId: string;
    userId: string;
    expectedEncodedHash: string;
    argon2Hash: string;
    updatedAt: Date;
  }): Promise<boolean>;
  appendAuthenticationEvent(input: {
    tenantId: string;
    userId: string;
    correlationId: string;
    eventType: AuthenticationEventType;
    occurredAt: Date;
  }): Promise<void>;
  changeInitialPassword(input: {
    tenantId: string;
    userId: string;
    expectedPasswordVersion: number;
    newPassword: string;
    argon2Hash: string;
    correlationId: string;
    changedAt: Date;
  }): Promise<boolean>;
}

export interface LoginThrottleStore {
  findBlockedUntil(keys: readonly LoginThrottleKey[], now: Date): Promise<Date | null>;
  recordFailure(keys: readonly LoginThrottleKey[], now: Date, policy: LoginThrottlePolicy): Promise<Date | null>;
  clear(keys: readonly LoginThrottleKey[]): Promise<void>;
}

export type TenantPasswordAuthenticationResult =
  | { status: "verified"; accounts: readonly PasswordVerifiedAccount[] }
  | { status: "invalid" }
  | { status: "throttled"; retryAfterSeconds: number };

export function normalizeLoginIdentifier(identifier: string): string {
  return identifier.trim().toLocaleLowerCase("en-US");
}

export function loginIdentifierHmac(secret: string | Buffer, kind: "email" | "username", identifier: string): string {
  return createHmac("sha256", secret)
    .update(`${kind}\0${normalizeLoginIdentifier(identifier)}`, "utf8")
    .digest("hex");
}

function throttleKey(secret: Buffer, scope: LoginThrottleKey["scope"], value: string): LoginThrottleKey {
  return {
    scope,
    keyHash: createHmac("sha256", secret).update(`${scope}\0${value}`, "utf8").digest("hex"),
  };
}

export class TenantAuthenticationService {
  private readonly throttleSecret: Buffer;
  private readonly loginDirectorySecret: Buffer;
  private static readonly maximumCandidates = 16;

  private constructor(
    private readonly repository: TenantAuthenticationRepository,
    private readonly throttleStore: LoginThrottleStore,
    throttleSecret: string,
    loginDirectorySecret: string,
    private readonly dummyPasswordHash: string,
    private readonly throttlePolicy: LoginThrottlePolicy,
    private readonly clock: () => Date,
    private readonly securityPolicyAuthority?: TenantSecurityPolicyAuthority,
  ) {
    if (Buffer.byteLength(throttleSecret, "utf8") < 32) {
      throw new Error("Authentication throttle secret must contain at least 32 bytes");
    }
    this.throttleSecret = Buffer.from(throttleSecret, "utf8");
    if (Buffer.byteLength(loginDirectorySecret, "utf8") < 32) {
      throw new Error("Login directory secret must contain at least 32 bytes");
    }
    this.loginDirectorySecret = Buffer.from(loginDirectorySecret, "utf8");
  }

  static async create(options: {
    repository: TenantAuthenticationRepository;
    throttleStore: LoginThrottleStore;
    throttleSecret: string;
    loginDirectorySecret: string;
    throttlePolicy?: LoginThrottlePolicy;
    clock?: () => Date;
    dummyPasswordHash?: string;
    securityPolicyAuthority?: TenantSecurityPolicyAuthority;
  }): Promise<TenantAuthenticationService> {
    return new TenantAuthenticationService(
      options.repository,
      options.throttleStore,
      options.throttleSecret,
      options.loginDirectorySecret,
      options.dummyPasswordHash ?? (await hashPassword(randomBytes(32).toString("base64url"))),
      options.throttlePolicy ?? defaultLoginThrottlePolicy,
      options.clock ?? (() => new Date()),
      options.securityPolicyAuthority,
    );
  }

  async verifyPasswordCredentials(input: {
    identifier: string;
    password: string;
    sourceIp: string;
    correlationId: string;
  }): Promise<TenantPasswordAuthenticationResult> {
    const now = this.clock();
    const identifier = normalizeLoginIdentifier(input.identifier);
    const keys = [
      throttleKey(this.throttleSecret, "identifier", identifier),
      throttleKey(this.throttleSecret, "network", input.sourceIp),
    ] as const;
    const blockedUntil = await this.throttleStore.findBlockedUntil(keys, now);
    if (blockedUntil) return this.throttled(blockedUntil, now);

    const candidates = await this.repository.resolveLoginCandidates({
      emailHmac: loginIdentifierHmac(this.loginDirectorySecret, "email", identifier),
      usernameHmac: loginIdentifierHmac(this.loginDirectorySecret, "username", identifier),
      limit: TenantAuthenticationService.maximumCandidates + 1,
    });
    let throttlePolicy = this.throttlePolicy;
    if (this.securityPolicyAuthority && candidates.length > 0) {
      try {
        const policies = (
          await Promise.all(
            [...new Set(candidates.map((candidate) => candidate.tenantId))].map((tenantId) =>
              this.securityPolicyAuthority!.loadEffectiveSecurityPolicy(tenantId),
            ),
          )
        ).filter((policy) => policy !== null);
        if (policies.length)
          throttlePolicy = {
            maximumFailures: Math.min(
              this.throttlePolicy.maximumFailures,
              ...policies.map((policy) => policy.loginMaximumFailures),
            ),
            windowMs: Math.max(this.throttlePolicy.windowMs, ...policies.map((policy) => policy.loginWindowMs)),
            blockMs: Math.max(this.throttlePolicy.blockMs, ...policies.map((policy) => policy.loginBlockMs)),
          };
      } catch {
        throttlePolicy = this.throttlePolicy;
      }
    }
    if (candidates.length > TenantAuthenticationService.maximumCandidates) {
      const newBlockedUntil = await this.throttleStore.recordFailure(keys, now, throttlePolicy);
      return newBlockedUntil ? this.throttled(newBlockedUntil, now) : { status: "invalid" };
    }
    if (candidates.length === 0) {
      await verifyCompatiblePassword(this.dummyPasswordHash, input.password);
      const newBlockedUntil = await this.throttleStore.recordFailure(keys, now, throttlePolicy);
      return newBlockedUntil ? this.throttled(newBlockedUntil, now) : { status: "invalid" };
    }

    const verified: Array<{ credential: TenantPasswordCredential; account: PasswordVerifiedAccount }> = [];
    for (const candidate of candidates) {
      const credential = await this.repository.findPasswordCredential(candidate.tenantId, candidate.userId);
      const passwordMatches = await verifyCompatiblePassword(
        credential?.encodedPasswordHash ?? this.dummyPasswordHash,
        input.password,
      );
      if (!credential || credential.status !== "active" || !passwordMatches) continue;
      const account = await this.repository.loadAuthenticatedAccount(candidate.tenantId, candidate.userId, now);
      if (account) {
        verified.push({
          credential,
          account: {
            ...account,
            mustChangePassword: credential.mustChangePassword,
            passwordVersion: credential.passwordVersion,
          },
        });
      }
    }
    const tenantIds = verified.map(({ account }) => account.tenantId);
    if (verified.length === 0 || new Set(tenantIds).size !== tenantIds.length) {
      await this.throttleStore.recordFailure(keys, now, throttlePolicy);
      return { status: "invalid" };
    }

    for (const { credential, account } of verified) {
      if (passwordHashNeedsUpgrade(credential.encodedPasswordHash)) {
        await this.repository.upgradePasswordHash({
          tenantId: account.tenantId,
          userId: credential.userId,
          expectedEncodedHash: credential.encodedPasswordHash,
          argon2Hash: await hashPassword(input.password),
          updatedAt: now,
        });
      }
      await this.repository.appendAuthenticationEvent({
        tenantId: account.tenantId,
        userId: account.userId,
        correlationId: input.correlationId,
        eventType: verified.length > 1 ? "tenant_selection_required" : "credential_verified",
        occurredAt: now,
      });
    }
    await this.throttleStore.clear(keys);
    return { status: "verified", accounts: verified.map(({ account }) => account) };
  }

  loadAuthenticatedAccount(tenantId: string, userId: string): Promise<AuthenticatedAccount | null> {
    return this.repository.loadAuthenticatedAccount(tenantId, userId, this.clock());
  }

  async loadPasswordVerifiedAccount(tenantId: string, userId: string): Promise<PasswordVerifiedAccount | null> {
    const [credential, account] = await Promise.all([
      this.repository.findPasswordCredential(tenantId, userId),
      this.repository.loadAuthenticatedAccount(tenantId, userId, this.clock()),
    ]);
    if (!credential || credential.status !== "active" || !account) return null;
    return {
      ...account,
      mustChangePassword: credential.mustChangePassword,
      passwordVersion: credential.passwordVersion,
    };
  }

  recordTrustedAuthenticationEvent(input: {
    tenantId: string;
    userId: string;
    correlationId: string;
    eventType: AuthenticationEventType;
  }): Promise<void> {
    return this.repository.appendAuthenticationEvent({ ...input, occurredAt: this.clock() });
  }

  async changeInitialPassword(input: {
    tenantId: string;
    userId: string;
    expectedPasswordVersion: number;
    newPassword: string;
    correlationId: string;
  }): Promise<AuthenticatedAccount | null> {
    const changed = await this.repository.changeInitialPassword({
      ...input,
      argon2Hash: await hashPassword(input.newPassword),
      changedAt: this.clock(),
    });
    if (!changed) return null;
    return this.repository.loadAuthenticatedAccount(input.tenantId, input.userId, this.clock());
  }

  private throttled(blockedUntil: Date, now: Date): TenantPasswordAuthenticationResult {
    return {
      status: "throttled",
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1_000)),
    };
  }
}
