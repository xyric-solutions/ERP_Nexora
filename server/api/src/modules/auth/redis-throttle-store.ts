import type { LoginThrottleKey, LoginThrottlePolicy, LoginThrottleStore } from "@nexora/auth";
import type { Redis } from "ioredis";

const recordFailureScript = `
local raw = redis.call('GET', KEYS[1])
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maximum = tonumber(ARGV[3])
local block = tonumber(ARGV[4])
local count = 0
local started = now
local blocked = 0
if raw then
  local current = cjson.decode(raw)
  count = tonumber(current.count) or 0
  started = tonumber(current.started) or now
  blocked = tonumber(current.blocked) or 0
  if now - started >= window then
    count = 0
    started = now
    blocked = 0
  end
end
count = count + 1
if blocked <= now and count >= maximum then blocked = now + block end
local ttl = math.max(window, blocked > now and (blocked - now) or 0)
redis.call('SET', KEYS[1], cjson.encode({count=count, started=started, blocked=blocked}), 'PX', ttl)
return blocked
`;

export class RedisLoginThrottleStore implements LoginThrottleStore {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = "nexora:auth:throttle:v2",
  ) {}

  async findBlockedUntil(keys: readonly LoginThrottleKey[], now: Date): Promise<Date | null> {
    const values = await this.redis.mget(keys.map((key) => this.key(key)));
    let latest = 0;
    for (const raw of values) {
      if (!raw) continue;
      try {
        const blocked = Number((JSON.parse(raw) as { blocked?: unknown }).blocked ?? 0);
        if (Number.isFinite(blocked) && blocked > now.getTime()) latest = Math.max(latest, blocked);
      } catch {
        // A malformed throttle record cannot grant access; treat it as unavailable.
        throw new Error("AUTHENTICATION_THROTTLE_UNAVAILABLE");
      }
    }
    return latest > 0 ? new Date(latest) : null;
  }

  async recordFailure(keys: readonly LoginThrottleKey[], now: Date, policy: LoginThrottlePolicy): Promise<Date | null> {
    let latest = 0;
    for (const key of [...keys].sort((left, right) => this.key(left).localeCompare(this.key(right)))) {
      const blocked = Number(
        await this.redis.eval(
          recordFailureScript,
          1,
          this.key(key),
          now.getTime(),
          policy.windowMs,
          policy.maximumFailures,
          policy.blockMs,
        ),
      );
      if (Number.isFinite(blocked)) latest = Math.max(latest, blocked);
    }
    return latest > now.getTime() ? new Date(latest) : null;
  }

  async clear(keys: readonly LoginThrottleKey[]): Promise<void> {
    if (keys.length > 0) await this.redis.del(...keys.map((key) => this.key(key)));
  }

  private key(key: LoginThrottleKey): string {
    return `${this.keyPrefix}:${key.scope}:${key.keyHash}`;
  }
}
