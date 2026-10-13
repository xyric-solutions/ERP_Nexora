import { createHmac, randomBytes } from "node:crypto";

import type { PasswordVerifiedAccount } from "./tenant-authentication.js";

export interface TenantSelectionContext {
  sourceIp: string;
  userAgent?: string;
}

export interface TenantSelectionRecord {
  bindingHash: string;
  expiresAt: string;
  choices: ReadonlyArray<{
    id: string;
    tenantId: string;
    userId: string;
    organizationName: string;
    mustChangePassword: boolean;
    passwordVersion: number;
  }>;
}

export interface TenantSelectionStore {
  create(ticket: string, record: TenantSelectionRecord, ttlMs: number): Promise<boolean>;
  consume(
    ticket: string,
    choiceId: string,
    bindingHash: string,
  ): Promise<
    | {
        status: "selected";
        tenantId: string;
        userId: string;
        mustChangePassword: boolean;
        passwordVersion: number;
      }
    | { status: "invalid" }
  >;
  cancel(ticket: string): Promise<void>;
}

export interface TenantSelectionChallenge {
  ticket: string;
  expiresAt: Date;
  choices: ReadonlyArray<{ id: string; organizationName: string }>;
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

export class TenantSelectionService {
  private readonly bindingSecret: Buffer;

  constructor(
    private readonly store: TenantSelectionStore,
    bindingSecret: string,
    private readonly ttlMs = 5 * 60 * 1_000,
    private readonly clock: () => Date = () => new Date(),
  ) {
    if (Buffer.byteLength(bindingSecret, "utf8") < 32) {
      throw new Error("Tenant-selection binding secret must contain at least 32 bytes");
    }
    this.bindingSecret = Buffer.from(bindingSecret, "utf8");
  }

  async issue(
    accounts: readonly PasswordVerifiedAccount[],
    context: TenantSelectionContext,
  ): Promise<TenantSelectionChallenge> {
    if (accounts.length < 2 || accounts.length > 16) {
      throw new Error("Tenant selection requires between two and sixteen verified memberships");
    }
    const expiresAt = new Date(this.clock().getTime() + this.ttlMs);
    const choices = accounts.map((account) => ({
      id: token(),
      tenantId: account.tenantId,
      userId: account.userId,
      organizationName: account.organizationName,
      mustChangePassword: account.mustChangePassword,
      passwordVersion: account.passwordVersion,
    }));
    const record: TenantSelectionRecord = {
      bindingHash: this.bindingHash(context),
      expiresAt: expiresAt.toISOString(),
      choices,
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ticket = token();
      if (await this.store.create(ticket, record, this.ttlMs)) {
        return {
          ticket,
          expiresAt,
          choices: choices.map(({ id, organizationName }) => ({ id, organizationName })),
        };
      }
    }
    throw new Error("Unable to allocate an opaque tenant-selection ticket");
  }

  consume(ticket: string, choiceId: string, context: TenantSelectionContext) {
    return this.store.consume(ticket, choiceId, this.bindingHash(context));
  }

  cancel(ticket: string): Promise<void> {
    return this.store.cancel(ticket);
  }

  private bindingHash(context: TenantSelectionContext): string {
    return createHmac("sha256", this.bindingSecret)
      .update(`tenant-selection\0${context.sourceIp}\0${context.userAgent ?? ""}`, "utf8")
      .digest("hex");
  }
}
