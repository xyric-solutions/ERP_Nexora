import { createHash } from "node:crypto";

import type { Redis } from "ioredis";

import type { TenantSelectionRecord, TenantSelectionStore } from "@nexora/auth";

const consumeScript = `
local value = redis.call('GET', KEYS[1])
if not value then return {'invalid'} end
redis.call('DEL', KEYS[1])
local record = cjson.decode(value)
if record.bindingHash ~= ARGV[1] then return {'invalid'} end
for _, choice in ipairs(record.choices) do
  if choice.id == ARGV[2] then
    return {'selected', choice.tenantId, choice.userId, tostring(choice.mustChangePassword), tostring(choice.passwordVersion)}
  end
end
return {'invalid'}
`;

function ticketDigest(ticket: string): string {
  return createHash("sha256").update(ticket, "utf8").digest("hex");
}

export class RedisTenantSelectionStore implements TenantSelectionStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "nexora:auth:tenant-selection",
  ) {}

  async create(ticket: string, record: TenantSelectionRecord, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(this.key(ticket), JSON.stringify(record), "PX", ttlMs, "NX");
    return result === "OK";
  }

  async consume(
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
  > {
    const result = (await this.redis.eval(consumeScript, 1, this.key(ticket), bindingHash, choiceId)) as string[];
    if (result[0] !== "selected" || !result[1] || !result[2]) return { status: "invalid" };
    const passwordVersion = Number(result[4]);
    if (!Number.isSafeInteger(passwordVersion) || passwordVersion < 1) return { status: "invalid" };
    return {
      status: "selected",
      tenantId: result[1],
      userId: result[2],
      mustChangePassword: result[3] === "true",
      passwordVersion,
    };
  }

  async cancel(ticket: string): Promise<void> {
    await this.redis.del(this.key(ticket));
  }

  private key(ticket: string): string {
    return `${this.prefix}:${ticketDigest(ticket)}`;
  }
}
