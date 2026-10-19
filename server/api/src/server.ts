import { createServer } from "node:http";

import { Redis } from "ioredis";

import {
  PasswordChangeService,
  CachedTenantSecurityPolicyAuthority,
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
import { BankingIdentifierCrypto } from "./modules/banking/crypto.js";
import { SourceBankPaymentRepository } from "./modules/banking/payments/source-repository.js";
import { SourceBankReceiptRepository } from "./modules/banking/receipts/source-repository.js";
import { SourceBankingRepository } from "./modules/banking/source-repository.js";
import { FinancePostingService } from "./modules/finance/posting/index.js";
import { SourceSecurityAdministrationRepository } from "./modules/security/source-administration-repository.js";
import { SourceHrRepository } from "./modules/hr/source-repository.js";

const config = loadConfig();
const logger = createLogger();
const metrics = createMetrics();
const pool = createDatabasePool(config.databaseUrl);
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
if (config.databaseAutoMigrate) await migrateSourceSchema(pool);
const authRepository = new SourceTenantAuthenticationRepository(pool);
const securityRepository = new SourceSecurityAdministrationRepository(pool, config.authLoginDirectorySecret);
const securityPolicyAuthority = new CachedTenantSecurityPolicyAuthority(securityRepository);
const authService = await TenantAuthenticationService.create({
  repository: authRepository,
  throttleStore: new RedisLoginThrottleStore(redis),
  throttleSecret: config.authThrottleSecret,
  loginDirectorySecret: config.authLoginDirectorySecret,
  securityPolicyAuthority,
});
const tenantSelectionService = new TenantSelectionService(
  new RedisTenantSelectionStore(redis),
  config.authLoginDirectorySecret,
);
const passwordChangeService = new PasswordChangeService(
  new RedisPasswordChangeTicketStore(redis),
  config.authSessionSecret,
  undefined,
  undefined,
  securityPolicyAuthority,
);
const sessionService = new TenantSessionService(
  new RedisTenantSessionStore(redis),
  config.authSessionSecret,
  {
    idleTimeoutMs: config.authSessionIdleMs,
    absoluteTimeoutMs: config.authSessionAbsoluteMs,
  },
  authRepository,
  undefined,
  securityRepository,
  securityPolicyAuthority,
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
  securityRepository,
  invalidateSecurityPolicy: (tenantId) => securityPolicyAuthority.invalidate(tenantId),
  bankingRepository: new SourceBankingRepository(
    pool,
    new BankingIdentifierCrypto(config.bankingDataEncryptionKey, config.bankingDataEncryptionKeyVersion),
  ),
  bankingPaymentRepository: new SourceBankPaymentRepository(pool, new FinancePostingService()),
  bankingReceiptRepository: new SourceBankReceiptRepository(pool, new FinancePostingService()),
  hrRepository: new SourceHrRepository(pool),
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
    hr_foundation: async () => {
      const result = await pool.query<{ available: boolean }>(
        "select to_regclass('public.employee') is not null and to_regclass('public.hr_master_record') is not null and to_regclass('public.hr_employee_draft_scope') is not null as available",
      );
      if (!result.rows[0]?.available) throw new Error("The current HR foundation migration is required");
    },
    banking_foundation: async () => {
      const result = await pool.query<{ available: boolean }>(
        `select to_regclass('public.bank_account') is not null
          and to_regclass('public.bank_account_event') is not null
          and to_regclass('public.bank_payment') is not null
          and to_regclass('public.bank_payment_line') is not null
          and to_regclass('public.bank_payment_event') is not null
          and to_regclass('public.bank_receipt') is not null
          and to_regclass('public.bank_receipt_line') is not null
          and to_regclass('public.bank_receipt_event') is not null
          and to_regclass('public.accounting_event') is not null
          and to_regclass('public.journal_entry') is not null
          and to_regclass('public.journal_line') is not null as available`,
      );
      if (!result.rows[0]?.available) throw new Error("The current Banking foundation migration is required");
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
