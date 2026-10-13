import type { PasswordChangeTicketRecord, PasswordChangeTicketStore } from "@nexora/auth";
import type { Redis } from "ioredis";

const consumeScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
redis.call('DEL', KEYS[1])
local record = cjson.decode(raw)
if record.bindingHash ~= ARGV[1] then return false end
return raw
`;

export class RedisPasswordChangeTicketStore implements PasswordChangeTicketStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "nexora:auth:password-change:v1",
  ) {}

  async create(ticketHash: string, record: PasswordChangeTicketRecord, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(this.key(ticketHash), JSON.stringify(record), "PX", ttlMs, "NX")) === "OK";
  }

  async consume(ticketHash: string, bindingHash: string): Promise<PasswordChangeTicketRecord | null> {
    const raw = await this.redis.eval(consumeScript, 1, this.key(ticketHash), bindingHash);
    return raw ? (JSON.parse(String(raw)) as PasswordChangeTicketRecord) : null;
  }

  async cancel(ticketHash: string): Promise<void> {
    await this.redis.del(this.key(ticketHash));
  }

  private key(ticketHash: string): string {
    return `${this.prefix}:${ticketHash}`;
  }
}
