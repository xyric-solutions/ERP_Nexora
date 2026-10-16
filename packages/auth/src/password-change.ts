import { createHmac, randomBytes } from "node:crypto";

import { validatePassword } from "./passwords.js";
import type { TenantSecurityPolicyAuthority } from "./security-policy.js";

export interface PasswordChangeContext {
  sourceIp: string;
  userAgent?: string;
}

export interface PasswordChangeTicketRecord {
  tenantId: string;
  userId: string;
  passwordVersion: number;
  bindingHash: string;
  expiresAt: string;
}

export interface PasswordChangeTicketStore {
  create(ticketHash: string, record: PasswordChangeTicketRecord, ttlMs: number): Promise<boolean>;
  consume(ticketHash: string, bindingHash: string): Promise<PasswordChangeTicketRecord | null>;
  cancel(ticketHash: string): Promise<void>;
}

export interface PasswordChangeChallenge {
  ticket: string;
  expiresAt: Date;
}

export interface ConsumedPasswordChange {
  tenantId: string;
  userId: string;
  passwordVersion: number;
  newPassword: string;
}

const ticketPattern = /^[A-Za-z0-9_-]{43}$/;

export class PasswordChangeService {
  private readonly secret: Buffer;

  constructor(
    private readonly store: PasswordChangeTicketStore,
    secret: string,
    private readonly ttlMs = 5 * 60 * 1_000,
    private readonly clock: () => Date = () => new Date(),
    private readonly securityPolicyAuthority?: TenantSecurityPolicyAuthority,
  ) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("Password-change secret must contain at least 32 bytes");
    }
    if (ttlMs < 30_000 || ttlMs > 15 * 60 * 1_000) {
      throw new Error("Invalid password-change ticket lifetime");
    }
    this.secret = Buffer.from(secret, "utf8");
  }

  async issue(input: {
    tenantId: string;
    userId: string;
    passwordVersion: number;
    context: PasswordChangeContext;
  }): Promise<PasswordChangeChallenge> {
    if (!Number.isSafeInteger(input.passwordVersion) || input.passwordVersion < 1) {
      throw new Error("Invalid credential version");
    }
    const expiresAt = new Date(this.clock().getTime() + this.ttlMs);
    const record: PasswordChangeTicketRecord = {
      tenantId: input.tenantId,
      userId: input.userId,
      passwordVersion: input.passwordVersion,
      bindingHash: this.bindingHash(input.context),
      expiresAt: expiresAt.toISOString(),
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ticket = randomBytes(32).toString("base64url");
      if (await this.store.create(this.ticketHash(ticket), record, this.ttlMs)) return { ticket, expiresAt };
    }
    throw new Error("Unable to allocate an opaque password-change ticket");
  }

  async consume(input: {
    ticket: string;
    newPassword: string;
    context: PasswordChangeContext;
  }): Promise<ConsumedPasswordChange | null> {
    if (!ticketPattern.test(input.ticket)) return null;
    validatePassword(input.newPassword);
    const record = await this.store.consume(this.ticketHash(input.ticket), this.bindingHash(input.context));
    if (!record || new Date(record.expiresAt) <= this.clock()) return null;
    const policy = await this.securityPolicyAuthority?.loadEffectiveSecurityPolicy(record.tenantId);
    validatePassword(
      input.newPassword,
      undefined,
      policy
        ? {
            minimumLength: policy.passwordMinimumLength,
            requireUppercase: policy.passwordRequireUppercase,
            requireLowercase: policy.passwordRequireLowercase,
            requireNumber: policy.passwordRequireNumber,
            requireSymbol: policy.passwordRequireSymbol,
          }
        : undefined,
    );
    return {
      tenantId: record.tenantId,
      userId: record.userId,
      passwordVersion: record.passwordVersion,
      newPassword: input.newPassword,
    };
  }

  cancel(ticket: string): Promise<void> {
    if (!ticketPattern.test(ticket)) return Promise.resolve();
    return this.store.cancel(this.ticketHash(ticket));
  }

  private ticketHash(ticket: string): string {
    return createHmac("sha256", this.secret).update(`password-change-ticket\0${ticket}`).digest("hex");
  }

  private bindingHash(context: PasswordChangeContext): string {
    return createHmac("sha256", this.secret)
      .update(`password-change-binding\0${context.sourceIp}\0${context.userAgent ?? ""}`)
      .digest("hex");
  }
}
