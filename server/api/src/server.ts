import { createServer } from "node:http";

import { Redis } from "ioredis";

import {
  PasswordChangeService,
  TenantAuthenticationService,
  TenantSelectionService,
  TenantSessionService,
} from "@nexora/auth";
import { checkDatabase, createDatabasePool, migrateSourceSchema } from "@nexora/db";
import { createLogger, createMetrics } from "@nexora/observability";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { RedisLoginThrottleStore } from "./modules/auth/redis-throttle-store.js";
import { RedisPasswordChangeTicketStore } from "./modules/auth/redis-password-change-store.js";
import { RedisTenantSessionStore } from "./modules/auth/redis-session-store.js";
import { RedisTenantSelectionStore } from "./modules/auth/redis-tenant-selection-store.js";
import { SourceTenantAuthenticationRepository } from "./modules/auth/source-repository.js";
import { SourceSecurityAdministrationRepository } from "./modules/security/source-administration-repository.js";

const config = loadConfig();
const logger = createLogger();
const metrics = createMetrics();
const pool = createDatabasePool(config.databaseUrl);
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
if (config.databaseAutoMigrate) await migrateSourceSchema(pool);
const authRepository = new SourceTenantAuthenticationRepository(pool);
const authService = await TenantAuthenticationService.create({
  repository: authRepository,
  throttleStore: new RedisLoginThrottleStore(redis),
  throttleSecret: config.authThrottleSecret,
  loginDirectorySecret: config.authLoginDirectorySecret,
});
const tenantSelectionService = new TenantSelectionService(
  new RedisTenantSelectionStore(redis),
  config.authLoginDirectorySecret,
);
const passwordChangeService = new PasswordChangeService(
  new RedisPasswordChangeTicketStore(redis),
  config.authSessionSecret,
);
const sessionService = new TenantSessionService(
  new RedisTenantSessionStore(redis),
  config.authSessionSecret,
  {
    idleTimeoutMs: config.authSessionIdleMs,
    absoluteTimeoutMs: config.authSessionAbsoluteMs,
  },
  authRepository,
);
let draining = false;
const app = createApp({
  config,
  logger,
  metrics,
  authService,
  tenantSelectionService,
  passwordChangeService,
  sessionService,
  securityRepository: new SourceSecurityAdministrationRepository(pool, config.authLoginDirectorySecret),
  readiness: {
    service: async () => {
      if (draining) throw new Error("service is draining");
    },
    database: () => checkDatabase(pool),
    redis: async () => {
      await redis.ping();
    },
    object_storage: async () => {
      const response = await fetch(new URL("/minio/health/ready", config.s3Endpoint), {
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) throw new Error("object storage is unavailable");
    },
  },
});
const server = createServer(app);
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;

server.once("error", (error) => {
  logger.fatal({ error }, "API server failed");
  process.exitCode = 1;
});
server.listen(config.port, config.host, () => logger.info({ host: config.host, port: config.port }, "API listening"));

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  draining = true;
  logger.info({ signal }, "API shutdown started");
  const force = setTimeout(() => process.exit(1), 15_000).unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([redis.quit(), pool.end()]);
  clearTimeout(force);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
