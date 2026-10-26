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
import { S3ObjectStorage } from "@nexora/domain/storage";
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
import { SourceBankTransferRepository } from "./modules/banking/transfers/source-repository.js";
import { SourceBankingRepository } from "./modules/banking/source-repository.js";
import { SourceBankStatementImportRepository } from "./modules/banking/statements/source-repository.js";
import { SourceBankReconciliationRepository } from "./modules/banking/reconciliations/source-repository.js";
import { SourceBankReconciliationAdjustmentRepository } from "./modules/banking/reconciliations/adjustment-repository.js";
import { SourceBankRevaluationRepository } from "./modules/banking/revaluations/source-repository.js";
import { createBankingFoundationReadiness } from "./modules/banking/readiness.js";
import { FinancePostingService } from "./modules/finance/posting/index.js";
import { SourceFinanceNominalRepository } from "./modules/finance/nominals/source-repository.js";
import { SourceFinanceCurrencyRepository } from "./modules/finance/currencies/source-repository.js";
import { SourceCoaHierarchyRepository } from "./modules/finance/coa-hierarchy-repository.js";
import { SourceChartTemplateRepository } from "./modules/finance/templates/source-repository.js";
import { SourceReferenceMasterRepository } from "./modules/master-data/source-repository.js";
import { SourceFiscalCalendarRepository } from "./modules/master-data/fiscal-calendars/source-repository.js";
import { SourceFinancePeriodRepository } from "./modules/finance/periods/source-repository.js";
import { SourceBankSelfApprovalRepository } from "./modules/security/bank-self-approval-repository.js";
import { SourceSecurityAdministrationRepository } from "./modules/security/source-administration-repository.js";
import { SourceHrRepository } from "./modules/hr/source-repository.js";

const config = loadConfig();
const logger = createLogger();
const metrics = createMetrics();
const pool = createDatabasePool(config.databaseUrl);
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
const objectStorage = new S3ObjectStorage({
  endpoint: config.s3Endpoint,
  region: config.s3Region,
  bucket: config.s3Bucket,
  accessKeyId: config.s3AccessKeyId,
  secretAccessKey: config.s3SecretAccessKey,
  forcePathStyle: config.s3ForcePathStyle,
});
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
  bankingTransferRepository: new SourceBankTransferRepository(pool, new FinancePostingService()),
  bankingStatementRepository: new SourceBankStatementImportRepository(pool),
  bankingStatementStorage: objectStorage,
  bankingReconciliationRepository: new SourceBankReconciliationRepository(pool),
  bankingReconciliationAdjustmentRepository: new SourceBankReconciliationAdjustmentRepository(
    pool,
    new FinancePostingService(),
  ),
  bankingRevaluationRepository: new SourceBankRevaluationRepository(pool, new FinancePostingService()),
  financeNominalRepository: new SourceFinanceNominalRepository(pool),
  financeCurrencyRepository: new SourceFinanceCurrencyRepository(pool),
  financeHierarchyRepository: new SourceCoaHierarchyRepository(pool),
  fiscalCalendarRepository: new SourceFiscalCalendarRepository(pool),
  financePeriodRepository: new SourceFinancePeriodRepository(pool),
  chartTemplateRepository: new SourceChartTemplateRepository(pool),
  referenceMasterRepository: new SourceReferenceMasterRepository(pool),
  bankSelfApprovalRepository: new SourceBankSelfApprovalRepository(pool),
  hrRepository: new SourceHrRepository(pool),
  readiness: {
    master_data_foundation: async () => {
      const result = await pool.query<{ available: boolean }>(
        `select to_regclass('public.erp_project') is not null
          and to_regclass('public.erp_location') is not null
          and to_regclass('public.erp_reference_master_event') is not null
          and exists(select 1 from nexora_schema_migration where module_name='master_data' and version=2) as available`,
      );
      if (!result.rows[0]?.available) throw new Error("Shared reference master migrations are required");
    },
    service: async () => {
      if (draining) throw new Error("service is draining");
    },
    database: () => checkDatabase(pool),
    redis: async () => {
      await redis.ping();
    },
    object_storage: () => objectStorage.checkReady(),
    hr_foundation: async () => {
      const result = await pool.query<{ available: boolean }>(
        "select to_regclass('public.employee') is not null and to_regclass('public.hr_master_record') is not null and to_regclass('public.hr_employee_draft_scope') is not null as available",
      );
      if (!result.rows[0]?.available) throw new Error("The current HR foundation migration is required");
    },
    banking_foundation: createBankingFoundationReadiness(pool),
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
  objectStorage.close();
  await Promise.allSettled([redis.quit(), pool.end()]);
  clearTimeout(force);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
