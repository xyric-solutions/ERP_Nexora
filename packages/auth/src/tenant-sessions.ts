import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { TenantSecurityPolicyAuthority } from "./security-policy.js";

export interface TenantSessionRecord {
  id: string;
  tenantId: string;
  userId: string;
  sessionVersion: number;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  rotatedFromId: string | null;
  userAgentHash: string | null;
  sourceIpHash: string | null;
  impersonation?: TenantImpersonationContext;
}

export interface TenantImpersonationContext {
  requestId: string;
  requestVersion: number;
  targetUserId: string;
  targetSessionVersion: number;
  expiresAt: Date;
}

export interface TenantSessionStore {
  create(session: TenantSessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<TenantSessionRecord | null>;
  touch(id: string, now: Date, idleExpiresAt: Date): Promise<TenantSessionRecord | null>;
  rotate(previousId: string, replacement: TenantSessionRecord, now: Date): Promise<boolean>;
  revoke(id: string): Promise<boolean>;
  revokeByTokenHash(tokenHash: string): Promise<boolean>;
  revokeAll(tenantId: string, userId: string): Promise<number>;
  setImpersonation?(id: string, context: TenantImpersonationContext | null): Promise<boolean>;
  enforceConcurrentLimit?(tenantId: string, userId: string, maximum: number, keepId: string): Promise<void>;
}

export interface TenantSessionView {
  sessionId: string;
  tenantId: string;
  userId: string;
  sessionVersion: number;
  csrfToken: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  impersonation?: TenantImpersonationContext;
}

export interface IssuedTenantSession extends TenantSessionView {
  token: string;
}

export interface TenantSessionAuthority {
  loadSessionVersion(tenantId: string, userId: string): Promise<number | null>;
}

export interface TenantImpersonationAuthority {
  validateImpersonationContext(input: {
    tenantId: string;
    sessionId: string;
    realUserId: string;
    requestId: string;
    targetUserId: string;
  }): Promise<boolean>;
}

export type TenantSessionMutationResult = { status: "invalid_session" } | { status: "invalid_csrf" } | { status: "ok" };

export type TenantSessionRotationResult =
  { status: "invalid_session" } | { status: "invalid_csrf" } | ({ status: "ok" } & IssuedTenantSession);

const opaqueTokenPattern = /^[A-Za-z0-9_-]{64}$/;

function earlier(left: Date, right: Date): Date {
  return left < right ? left : right;
}

export class TenantSessionService {
  private readonly secret: Buffer;

  constructor(
    private readonly store: TenantSessionStore,
    secret: string,
    private readonly policy: { idleTimeoutMs: number; absoluteTimeoutMs: number },
    private readonly authority: TenantSessionAuthority,
    private readonly clock: () => Date = () => new Date(),
    private readonly impersonationAuthority?: TenantImpersonationAuthority,
    private readonly securityPolicyAuthority?: TenantSecurityPolicyAuthority,
  ) {
    if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("Session secret must contain at least 32 bytes");
    if (policy.idleTimeoutMs <= 0 || policy.absoluteTimeoutMs <= 0 || policy.idleTimeoutMs > policy.absoluteTimeoutMs) {
      throw new Error("Invalid session timeout policy");
    }
    this.secret = Buffer.from(secret, "utf8");
  }

  async issue(
    tenantId: string,
    userId: string,
    context: { sourceIp?: string; userAgent?: string } = {},
    presentedToken?: string,
  ): Promise<IssuedTenantSession> {
    if (presentedToken) await this.revokeToken(presentedToken);
    const now = this.clock();
    const effectivePolicy = await this.effectivePolicy(tenantId);
    const sessionVersion = await this.authority.loadSessionVersion(tenantId, userId);
    if (!sessionVersion || !Number.isSafeInteger(sessionVersion) || sessionVersion < 1) {
      throw new Error("SESSION_AUTHORITY_UNAVAILABLE");
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = randomBytes(48).toString("base64url");
      const record = this.buildRecord(
        tenantId,
        userId,
        sessionVersion,
        token,
        now,
        context,
        null,
        undefined,
        effectivePolicy,
      );
      try {
        await this.store.create(record);
        await this.store.enforceConcurrentLimit?.(tenantId, userId, effectivePolicy.concurrentSessionLimit, record.id);
        return this.issued(record, token);
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
    throw new Error("Unable to allocate a server session");
  }

  async get(token: string): Promise<TenantSessionView | null> {
    const record = await this.findAndTouch(token);
    return record ? this.view(record) : null;
  }

  async rotate(
    token: string,
    csrfToken: string,
    context: { sourceIp?: string; userAgent?: string } = {},
  ): Promise<TenantSessionRotationResult> {
    const current = await this.findAndTouch(token);
    if (!current) return { status: "invalid_session" };
    if (!this.matchesCsrf(current.id, csrfToken)) return { status: "invalid_csrf" };
    const now = this.clock();
    const effectivePolicy = await this.effectivePolicy(current.tenantId);
    const replacementToken = randomBytes(48).toString("base64url");
    const replacement = this.buildRecord(
      current.tenantId,
      current.userId,
      current.sessionVersion,
      replacementToken,
      now,
      context,
      current.id,
      current.absoluteExpiresAt,
      effectivePolicy,
    );
    if (!(await this.store.rotate(current.id, replacement, now))) return { status: "invalid_session" };
    return { status: "ok", ...this.issued(replacement, replacementToken) };
  }

  async authorizeMutation(
    token: string,
    csrfToken: string,
  ): Promise<TenantSessionMutationResult & { session?: TenantSessionView }> {
    const current = await this.findAndTouch(token);
    if (!current) return { status: "invalid_session" };
    if (!this.matchesCsrf(current.id, csrfToken)) return { status: "invalid_csrf" };
    return { status: "ok", session: this.view(current) };
  }

  async logout(token: string, csrfToken: string): Promise<TenantSessionMutationResult> {
    const current = await this.find(token);
    if (!current) return { status: "invalid_session" };
    if (!this.matchesCsrf(current.id, csrfToken)) return { status: "invalid_csrf" };
    return (await this.store.revoke(current.id)) ? { status: "ok" } : { status: "invalid_session" };
  }

  async logoutAll(token: string, csrfToken: string): Promise<TenantSessionMutationResult> {
    const current = await this.find(token);
    if (!current) return { status: "invalid_session" };
    if (!this.matchesCsrf(current.id, csrfToken)) return { status: "invalid_csrf" };
    await this.store.revokeAll(current.tenantId, current.userId);
    return { status: "ok" };
  }

  async revokeToken(token: string): Promise<boolean> {
    if (!opaqueTokenPattern.test(token)) return false;
    return this.store.revokeByTokenHash(this.digest("session-token", token));
  }

  revokeAllForUser(tenantId: string, userId: string): Promise<number> {
    return this.store.revokeAll(tenantId, userId);
  }

  async startImpersonation(token: string, context: TenantImpersonationContext): Promise<TenantSessionView | null> {
    if (!this.store.setImpersonation || !this.impersonationAuthority) return null;
    const current = await this.find(token);
    if (!current || current.impersonation) return null;
    const targetVersion = await this.authority.loadSessionVersion(current.tenantId, context.targetUserId);
    if (targetVersion !== context.targetSessionVersion || context.expiresAt <= this.clock()) return null;
    const valid = await this.impersonationAuthority.validateImpersonationContext({
      tenantId: current.tenantId,
      sessionId: current.id,
      realUserId: current.userId,
      requestId: context.requestId,
      targetUserId: context.targetUserId,
    });
    if (!valid || !(await this.store.setImpersonation(current.id, context))) return null;
    return this.view({ ...current, impersonation: context });
  }

  async endImpersonation(sessionId: string): Promise<boolean> {
    return this.store.setImpersonation ? this.store.setImpersonation(sessionId, null) : false;
  }

  private async findAndTouch(token: string): Promise<TenantSessionRecord | null> {
    const current = await this.find(token);
    if (!current) return null;
    const now = this.clock();
    const effectivePolicy = await this.effectivePolicy(current.tenantId);
    return this.store.touch(
      current.id,
      now,
      earlier(new Date(now.getTime() + effectivePolicy.idleTimeoutMs), current.absoluteExpiresAt),
    );
  }

  private async find(token: string): Promise<TenantSessionRecord | null> {
    if (!opaqueTokenPattern.test(token)) return null;
    const record = await this.store.findByTokenHash(this.digest("session-token", token));
    if (!record) return null;
    const sessionVersion = await this.authority.loadSessionVersion(record.tenantId, record.userId);
    if (sessionVersion === null || sessionVersion !== record.sessionVersion) {
      await this.store.revoke(record.id);
      return null;
    }
    const now = this.clock();
    if (now >= record.idleExpiresAt || now >= record.absoluteExpiresAt) {
      await this.store.revoke(record.id);
      return null;
    }
    if (record.impersonation) {
      let valid = false;
      try {
        const targetVersion = await this.authority.loadSessionVersion(
          record.tenantId,
          record.impersonation.targetUserId,
        );
        valid =
          targetVersion === record.impersonation.targetSessionVersion &&
          now < record.impersonation.expiresAt &&
          Boolean(this.impersonationAuthority) &&
          (await this.impersonationAuthority!.validateImpersonationContext({
            tenantId: record.tenantId,
            sessionId: record.id,
            realUserId: record.userId,
            requestId: record.impersonation.requestId,
            targetUserId: record.impersonation.targetUserId,
          }));
      } catch {
        valid = false;
      }
      if (!valid) {
        if (!this.store.setImpersonation || !(await this.store.setImpersonation(record.id, null))) {
          await this.store.revoke(record.id);
          return null;
        }
        delete record.impersonation;
      }
    }
    return record;
  }

  private buildRecord(
    tenantId: string,
    userId: string,
    sessionVersion: number,
    token: string,
    now: Date,
    context: { sourceIp?: string; userAgent?: string },
    rotatedFromId: string | null,
    inheritedAbsoluteExpiry?: Date,
    effectivePolicy = {
      idleTimeoutMs: this.policy.idleTimeoutMs,
      absoluteTimeoutMs: this.policy.absoluteTimeoutMs,
      concurrentSessionLimit: 20,
    },
  ): TenantSessionRecord {
    const absoluteExpiresAt = inheritedAbsoluteExpiry ?? new Date(now.getTime() + effectivePolicy.absoluteTimeoutMs);
    return {
      id: randomUUID(),
      tenantId,
      userId,
      sessionVersion,
      tokenHash: this.digest("session-token", token),
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt: earlier(new Date(now.getTime() + effectivePolicy.idleTimeoutMs), absoluteExpiresAt),
      absoluteExpiresAt,
      rotatedFromId,
      userAgentHash: context.userAgent ? this.digest("user-agent", context.userAgent) : null,
      sourceIpHash: context.sourceIp ? this.digest("source-ip", context.sourceIp) : null,
    };
  }

  private async effectivePolicy(tenantId: string) {
    if (!this.securityPolicyAuthority) return { ...this.policy, concurrentSessionLimit: 20 };
    try {
      const active = await this.securityPolicyAuthority.loadEffectiveSecurityPolicy(tenantId);
      return active
        ? {
            idleTimeoutMs: Math.min(this.policy.idleTimeoutMs, active.sessionIdleMs),
            absoluteTimeoutMs: Math.min(this.policy.absoluteTimeoutMs, active.sessionAbsoluteMs),
            concurrentSessionLimit: active.concurrentSessionLimit,
          }
        : { ...this.policy, concurrentSessionLimit: 20 };
    } catch {
      return { ...this.policy, concurrentSessionLimit: 20 };
    }
  }

  private issued(record: TenantSessionRecord, token: string): IssuedTenantSession {
    return { token, ...this.view(record) };
  }

  private view(record: TenantSessionRecord): TenantSessionView {
    return {
      sessionId: record.id,
      tenantId: record.tenantId,
      userId: record.userId,
      sessionVersion: record.sessionVersion,
      csrfToken: this.csrf(record.id),
      idleExpiresAt: record.idleExpiresAt,
      absoluteExpiresAt: record.absoluteExpiresAt,
      ...(record.impersonation ? { impersonation: record.impersonation } : {}),
    };
  }

  private csrf(sessionId: string): string {
    return createHmac("sha256", this.secret).update(`csrf\0${sessionId}`).digest("base64url");
  }

  private matchesCsrf(sessionId: string, supplied: string): boolean {
    const expected = Buffer.from(this.csrf(sessionId), "utf8");
    const actual = Buffer.from(supplied, "utf8");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private digest(purpose: string, value: string): string {
    return createHmac("sha256", this.secret).update(`${purpose}\0${value}`).digest("hex");
  }
}
