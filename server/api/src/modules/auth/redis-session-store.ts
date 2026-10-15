import { createHash } from "node:crypto";

import type { TenantSessionRecord, TenantSessionStore } from "@nexora/auth";
import type { Redis } from "ioredis";

interface StoredSession {
  id: string;
  tenantId: string;
  userId: string;
  sessionVersion?: number;
  tokenHash: string;
  createdAt: number;
  lastSeenAt: number;
  idleExpiresAt: number;
  absoluteExpiresAt: number;
  rotatedFromId: string | null;
  userAgentHash: string | null;
  sourceIpHash: string | null;
}

const createScript = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[3], 'PX', ARGV[4])
redis.call('SADD', KEYS[3], ARGV[5])
redis.call('PEXPIRE', KEYS[3], ARGV[4])
return 1
`;

const touchScript = `
local identity = redis.call('GET', KEYS[1])
if not identity then return false end
local mapping = cjson.decode(identity)
local raw = redis.call('GET', ARGV[1] .. mapping.tokenHash)
if not raw then redis.call('DEL', KEYS[1]); return false end
local record = cjson.decode(raw)
local now = tonumber(ARGV[2])
if now >= tonumber(record.idleExpiresAt) or now >= tonumber(record.absoluteExpiresAt) then
  redis.call('DEL', ARGV[1] .. mapping.tokenHash)
  redis.call('DEL', KEYS[1])
  redis.call('SREM', mapping.userKey, mapping.tokenHash)
  return false
end
record.lastSeenAt = now
record.idleExpiresAt = math.min(tonumber(ARGV[3]), tonumber(record.absoluteExpiresAt))
redis.call('SET', ARGV[1] .. mapping.tokenHash, cjson.encode(record), 'PX', record.idleExpiresAt - now)
return cjson.encode(record)
`;

const revokeScript = `
local identity = redis.call('GET', KEYS[1])
if not identity then return 0 end
local mapping = cjson.decode(identity)
redis.call('DEL', ARGV[1] .. mapping.tokenHash)
redis.call('DEL', KEYS[1])
redis.call('SREM', mapping.userKey, mapping.tokenHash)
return 1
`;

const rotateScript = `
local identity = redis.call('GET', KEYS[1])
if not identity then return 0 end
local mapping = cjson.decode(identity)
local raw = redis.call('GET', ARGV[1] .. mapping.tokenHash)
if not raw then return 0 end
local current = cjson.decode(raw)
local now = tonumber(ARGV[2])
if now >= tonumber(current.idleExpiresAt) or now >= tonumber(current.absoluteExpiresAt) then return 0 end
if redis.call('EXISTS', KEYS[2]) == 1 or redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
redis.call('DEL', ARGV[1] .. mapping.tokenHash)
redis.call('DEL', KEYS[1])
redis.call('SREM', mapping.userKey, mapping.tokenHash)
redis.call('SET', KEYS[2], ARGV[3], 'PX', ARGV[4])
redis.call('SET', KEYS[3], ARGV[5], 'PX', ARGV[6])
redis.call('SADD', KEYS[4], ARGV[7])
redis.call('PEXPIRE', KEYS[4], ARGV[6])
return 1
`;

const revokeAllScript = `
local members = redis.call('SMEMBERS', KEYS[1])
local count = 0
for _, tokenHash in ipairs(members) do
  local raw = redis.call('GET', ARGV[1] .. tokenHash)
  if raw then
    local record = cjson.decode(raw)
    redis.call('DEL', ARGV[1] .. tokenHash)
    redis.call('DEL', ARGV[2] .. record.id)
    count = count + 1
  end
end
redis.call('DEL', KEYS[1])
return count
`;

function toStored(record: TenantSessionRecord): StoredSession {
  return {
    ...record,
    createdAt: record.createdAt.getTime(),
    lastSeenAt: record.lastSeenAt.getTime(),
    idleExpiresAt: record.idleExpiresAt.getTime(),
    absoluteExpiresAt: record.absoluteExpiresAt.getTime(),
  };
}

function fromStored(record: StoredSession): TenantSessionRecord {
  return {
    ...record,
    sessionVersion: record.sessionVersion ?? 1,
    createdAt: new Date(record.createdAt),
    lastSeenAt: new Date(record.lastSeenAt),
    idleExpiresAt: new Date(record.idleExpiresAt),
    absoluteExpiresAt: new Date(record.absoluteExpiresAt),
  };
}

export class RedisTenantSessionStore implements TenantSessionStore {
  private readonly sessionPrefix: string;
  private readonly idPrefix: string;
  private readonly userPrefix: string;

  constructor(
    private readonly redis: Redis,
    keyPrefix = "nexora:session:v2",
  ) {
    this.sessionPrefix = `${keyPrefix}:token:`;
    this.idPrefix = `${keyPrefix}:id:`;
    this.userPrefix = `${keyPrefix}:user:`;
  }

  async create(record: TenantSessionRecord): Promise<void> {
    const now = record.createdAt.getTime();
    const idleTtl = Math.max(1, record.idleExpiresAt.getTime() - now);
    const absoluteTtl = Math.max(1, record.absoluteExpiresAt.getTime() - now);
    const userKey = this.userKey(record.tenantId, record.userId);
    const created = Number(
      await this.redis.eval(
        createScript,
        3,
        this.sessionKey(record.tokenHash),
        this.idKey(record.id),
        userKey,
        JSON.stringify(toStored(record)),
        idleTtl,
        JSON.stringify({ tokenHash: record.tokenHash, userKey }),
        absoluteTtl,
        record.tokenHash,
      ),
    );
    if (created !== 1) throw new Error("SESSION_IDENTIFIER_COLLISION");
  }

  async findByTokenHash(tokenHash: string): Promise<TenantSessionRecord | null> {
    const raw = await this.redis.get(this.sessionKey(tokenHash));
    if (!raw) return null;
    return fromStored(JSON.parse(raw) as StoredSession);
  }

  async touch(id: string, now: Date, idleExpiresAt: Date): Promise<TenantSessionRecord | null> {
    const raw = await this.redis.eval(
      touchScript,
      1,
      this.idKey(id),
      this.sessionPrefix,
      now.getTime(),
      idleExpiresAt.getTime(),
    );
    if (!raw) return null;
    return fromStored(JSON.parse(String(raw)) as StoredSession);
  }

  async rotate(previousId: string, replacement: TenantSessionRecord, now: Date): Promise<boolean> {
    const idleTtl = Math.max(1, replacement.idleExpiresAt.getTime() - now.getTime());
    const absoluteTtl = Math.max(1, replacement.absoluteExpiresAt.getTime() - now.getTime());
    const userKey = this.userKey(replacement.tenantId, replacement.userId);
    const result = await this.redis.eval(
      rotateScript,
      4,
      this.idKey(previousId),
      this.sessionKey(replacement.tokenHash),
      this.idKey(replacement.id),
      userKey,
      this.sessionPrefix,
      now.getTime(),
      JSON.stringify(toStored(replacement)),
      idleTtl,
      JSON.stringify({ tokenHash: replacement.tokenHash, userKey }),
      absoluteTtl,
      replacement.tokenHash,
    );
    return Number(result) === 1;
  }

  async revoke(id: string): Promise<boolean> {
    return Number(await this.redis.eval(revokeScript, 1, this.idKey(id), this.sessionPrefix)) === 1;
  }

  async revokeByTokenHash(tokenHash: string): Promise<boolean> {
    const record = await this.findByTokenHash(tokenHash);
    return record ? this.revoke(record.id) : false;
  }

  async revokeAll(tenantId: string, userId: string): Promise<number> {
    return Number(
      await this.redis.eval(revokeAllScript, 1, this.userKey(tenantId, userId), this.sessionPrefix, this.idPrefix),
    );
  }

  private sessionKey(tokenHash: string): string {
    return `${this.sessionPrefix}${tokenHash}`;
  }

  private idKey(id: string): string {
    return `${this.idPrefix}${id}`;
  }

  private userKey(tenantId: string, userId: string): string {
    const digest = createHash("sha256").update(`${tenantId}\0${userId}`).digest("hex");
    return `${this.userPrefix}${digest}`;
  }
}
