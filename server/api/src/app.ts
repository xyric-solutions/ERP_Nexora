import { createHash, timingSafeEqual } from "node:crypto";

import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Logger } from "pino";

import type { HealthStatus } from "@nexora/contracts";
import { buildOpenApiDocument } from "@nexora/contracts/openapi";
import type { Metrics } from "@nexora/observability";

import type { ApiConfig } from "./config.js";
import { errorHandler, notFound } from "./http/errors.js";
import { requestContext } from "./http/request-context.js";
import { requestLogging } from "./http/request-logging.js";
import {
  createTenantAuthRouter,
  type TenantAuthApiService,
  type PasswordChangeApiService,
  type TenantSelectionApiService,
  type TenantSessionApiService,
} from "./modules/auth/tenant-router.js";
import { createJobsRouter, type JobPublisher } from "./modules/jobs/router.js";
import {
  createBankingRouter,
  type BankingPaymentRepository,
  type BankingReceiptRepository,
  type BankingTransferRepository,
  type BankingRepository,
} from "./modules/banking/router.js";
import type { BankReconciliationAdjustmentRepository } from "./modules/banking/reconciliations/adjustment-service.js";
import type { BankingReconciliationRepository } from "./modules/banking/reconciliations/service.js";
import type { BankingRevaluationRepository } from "./modules/banking/revaluations/service.js";
import type { BankingStatementStorage } from "./modules/banking/statement-reconciliation-router.js";
import type { BankingStatementImportRepository } from "./modules/banking/statements/service.js";
import { createHrRouter } from "./modules/hr/router.js";
import {
  createFinanceRouter,
  type FinanceCurrencyRepository,
  type FinanceNominalRepository,
} from "./modules/finance/router.js";
import { createCompanyCurrencyRouter } from "./modules/finance/currencies/company-router.js";
import { createChartTemplateRouter } from "./modules/finance/templates/router.js";
import type { ChartTemplateRepository } from "./modules/finance/templates/service.js";
import { createReferenceMasterRouter } from "./modules/master-data/router.js";
import {
  createFiscalCalendarRouter,
  type FiscalCalendarApiRepository,
  type FinancePeriodApiRepository,
} from "./modules/master-data/fiscal-calendars/router.js";
import type { ReferenceMasterRepository } from "./modules/master-data/service.js";
import type { SourceHrRepository } from "./modules/hr/source-repository.js";
import { createSecurityRouter } from "./modules/security/router.js";
import type { SecurityAdministrationApiRepository } from "./modules/security/router.js";
import {
  createBankSelfApprovalRouter,
  type BankSelfApprovalRepository,
} from "./modules/security/bank-self-approval-router.js";

export interface AppDependencies {
  config: Pick<ApiConfig, "allowedOrigins"> &
    Partial<Pick<ApiConfig, "nodeEnv" | "trustProxyHops" | "metricsBearerToken">>;
  logger: Logger;
  metrics: Metrics;
  authService?: TenantAuthApiService;
  tenantSelectionService?: TenantSelectionApiService;
  passwordChangeService?: PasswordChangeApiService;
  sessionService?: TenantSessionApiService;
  securityRepository?: SecurityAdministrationApiRepository;
  invalidateSecurityPolicy?: (tenantId: string) => void;
  bankingRepository?: BankingRepository;
  bankingPaymentRepository?: BankingPaymentRepository;
  bankingReceiptRepository?: BankingReceiptRepository;
  bankingTransferRepository?: BankingTransferRepository;
  bankingStatementRepository?: BankingStatementImportRepository;
  bankingStatementStorage?: BankingStatementStorage;
  bankingReconciliationRepository?: BankingReconciliationRepository;
  bankingReconciliationAdjustmentRepository?: BankReconciliationAdjustmentRepository;
  bankingRevaluationRepository?: BankingRevaluationRepository;
  financeNominalRepository?: FinanceNominalRepository;
  financeCurrencyRepository?: FinanceCurrencyRepository;
  financeHierarchyRepository?: import("./modules/finance/coa-hierarchy-repository.js").SourceCoaHierarchyRepository;
  chartTemplateRepository?: ChartTemplateRepository;
  referenceMasterRepository?: ReferenceMasterRepository;
  fiscalCalendarRepository?: FiscalCalendarApiRepository;
  financePeriodRepository?: FinancePeriodApiRepository;
  bankSelfApprovalRepository?: BankSelfApprovalRepository;
  hrRepository?: Pick<
    SourceHrRepository,
    | "listCompanies"
    | "listOrganizationUnits"
    | "listEmployees"
    | "getEmployee"
    | "listEmployeeDrafts"
    | "getEmployeeDraft"
    | "listEmployeeDraftApprovals"
    | "getEmployeeDraftApproval"
    | "listMasters"
    | "createEmployeeDraft"
    | "updateEmployeeDraft"
    | "submitEmployeeDraft"
    | "decideEmployeeDraftApproval"
    | "createProfileDraftAssignment"
    | "listEmployeeContacts"
    | "createEmployeeContact"
    | "listEmployeeEmergencyContacts"
    | "createEmployeeEmergencyContact"
    | "listEmployeeDocuments"
    | "listEmployeeAssignments"
    | "listEmployeeStatusHistory"
    | "listEmployeeLifecycleEvents"
    | "listEmployeeProfileHistory"
    | "listEmploymentLifecyclePolicies"
    | "createEmploymentLifecyclePolicy"
    | "submitEmploymentLifecyclePolicy"
    | "approveEmploymentLifecyclePolicy"
    | "activateEmploymentLifecyclePolicy"
    | "createJob"
    | "listEmployeeHireRequests"
    | "getEmployeeHireRequest"
    | "createEmployeeHireRequest"
    | "decideEmployeeHireRequest"
    | "listEmployeeTransferRequests"
    | "getEmployeeTransferRequest"
    | "createEmployeeTransferRequest"
    | "decideEmployeeTransferRequest"
    | "listEmployeePromotionRequests"
    | "getEmployeePromotionRequest"
    | "createEmployeePromotionRequest"
    | "decideEmployeePromotionRequest"
    | "listEmployeeManagerChangeRequests"
    | "getEmployeeManagerChangeRequest"
    | "createEmployeeManagerChangeRequest"
    | "decideEmployeeManagerChangeRequest"
    | "listEmployeeWorkLocationChangeRequests"
    | "getEmployeeWorkLocationChangeRequest"
    | "createEmployeeWorkLocationChangeRequest"
    | "decideEmployeeWorkLocationChangeRequest"
    | "listEmployeeOrganizationPlacementChangeRequests"
    | "getEmployeeOrganizationPlacementChangeRequest"
    | "createEmployeeOrganizationPlacementChangeRequest"
    | "decideEmployeeOrganizationPlacementChangeRequest"
  >;
  jobPublisher?: JobPublisher;
  readiness: Record<string, () => Promise<void>>;
  version?: string;
}

function status(version: string, checks?: HealthStatus["checks"]): HealthStatus {
  return {
    status: "ok",
    service: "nexora-api",
    version,
    timestamp: new Date().toISOString(),
    ...(checks ? { checks } : {}),
  };
}

export function createApp(dependencies: AppDependencies): Express {
  const bankingRepositoryCount = [
    dependencies.bankingRepository,
    dependencies.bankingPaymentRepository,
    dependencies.bankingReceiptRepository,
  ].filter(Boolean).length;
  if (bankingRepositoryCount !== 0 && bankingRepositoryCount !== 3) {
    throw new Error("Banking account, payment, and receipt repositories must be configured together.");
  }
  const statementReconciliationDependencyCount = [
    dependencies.bankingStatementRepository,
    dependencies.bankingStatementStorage,
    dependencies.bankingReconciliationRepository,
    dependencies.bankingReconciliationAdjustmentRepository,
  ].filter(Boolean).length;
  if (statementReconciliationDependencyCount !== 0 && statementReconciliationDependencyCount !== 4) {
    throw new Error(
      "Statement import, storage, reconciliation, and adjustment repositories must be configured together.",
    );
  }
  if (statementReconciliationDependencyCount > 0 && bankingRepositoryCount !== 3) {
    throw new Error("Statement and reconciliation routes require the Banking API foundation.");
  }
  if (dependencies.bankingRevaluationRepository && bankingRepositoryCount !== 3) {
    throw new Error("Bank Revaluation routes require the Banking API foundation.");
  }
  const app = express();
  app.disable("x-powered-by");
  if (dependencies.config.trustProxyHops) app.set("trust proxy", dependencies.config.trustProxyHops);
  app.use(requestContext);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        callback(null, !origin || dependencies.config.allowedOrigins.has(origin));
      },
    }),
  );
  app.use(express.json({ limit: "1mb", strict: true }));
  app.use(requestLogging(dependencies.logger, dependencies.metrics));

  if (
    dependencies.fiscalCalendarRepository &&
    dependencies.financePeriodRepository &&
    dependencies.authService &&
    dependencies.sessionService
  ) {
    app.use(
      "/api/v1",
      createFiscalCalendarRouter({
        calendars: dependencies.fiscalCalendarRepository,
        periods: dependencies.financePeriodRepository,
        authentication: dependencies.authService,
        sessions: dependencies.sessionService,
        secureCookies: dependencies.config.nodeEnv === "production",
        allowedOrigins: dependencies.config.allowedOrigins,
      }),
    );
  }

  if (dependencies.financeNominalRepository && dependencies.authService && dependencies.sessionService) {
    app.use(
      "/api/v1/finance",
      createFinanceRouter({
        repository: dependencies.financeNominalRepository,
        ...(dependencies.financeCurrencyRepository ? { currencies: dependencies.financeCurrencyRepository } : {}),
        ...(dependencies.financeHierarchyRepository ? { hierarchy: dependencies.financeHierarchyRepository } : {}),
        authentication: dependencies.authService,
        sessions: dependencies.sessionService,
        secureCookies: dependencies.config.nodeEnv === "production",
        allowedOrigins: dependencies.config.allowedOrigins,
      }),
    );
  }

  if (dependencies.financeCurrencyRepository && dependencies.authService && dependencies.sessionService) {
    app.use(
      "/api/v1",
      createCompanyCurrencyRouter({
        repository: dependencies.financeCurrencyRepository,
        authentication: dependencies.authService,
        sessions: dependencies.sessionService,
        secureCookies: dependencies.config.nodeEnv === "production",
        allowedOrigins: dependencies.config.allowedOrigins,
      }),
    );
  }

  if (dependencies.chartTemplateRepository && dependencies.authService && dependencies.sessionService) {
    app.use(
      "/api/v1/finance/chart_templates",
      createChartTemplateRouter({
        repository: dependencies.chartTemplateRepository,
        authentication: dependencies.authService,
        sessions: dependencies.sessionService,
        secureCookies: dependencies.config.nodeEnv === "production",
        allowedOrigins: dependencies.config.allowedOrigins,
      }),
    );
  }
  if (dependencies.referenceMasterRepository && dependencies.authService && dependencies.sessionService) {
    app.use(
      "/api/v1/master_data",
      createReferenceMasterRouter({
        repository: dependencies.referenceMasterRepository,
        authentication: dependencies.authService,
        sessions: dependencies.sessionService,
        secureCookies: dependencies.config.nodeEnv === "production",
        allowedOrigins: dependencies.config.allowedOrigins,
      }),
    );
  }
  if (dependencies.bankSelfApprovalRepository && dependencies.authService && dependencies.sessionService) {
    app.use(
      "/api/v1/security",
      createBankSelfApprovalRouter({
        repository: dependencies.bankSelfApprovalRepository,
        authentication: dependencies.authService,
        sessions: dependencies.sessionService,
        secureCookies: dependencies.config.nodeEnv === "production",
        allowedOrigins: dependencies.config.allowedOrigins,
      }),
    );
  }
  if (dependencies.securityRepository && dependencies.authService && dependencies.sessionService) {
    app.use(
      "/api/v1/security",
      createSecurityRouter({
        repository: dependencies.securityRepository,
        authentication: dependencies.authService,
        sessions: dependencies.sessionService,
        secureCookies: dependencies.config.nodeEnv === "production",
        allowedOrigins: dependencies.config.allowedOrigins,
        ...(dependencies.invalidateSecurityPolicy
          ? { invalidateSecurityPolicy: dependencies.invalidateSecurityPolicy }
          : {}),
      }),
    );
  }
  if (dependencies.hrRepository && dependencies.authService && dependencies.sessionService) {
    app.use(
      "/api/v1/hr",
      createHrRouter({
        repository: dependencies.hrRepository,
        authentication: dependencies.authService,
        sessions: dependencies.sessionService,
        secureCookies: dependencies.config.nodeEnv === "production",
        allowedOrigins: dependencies.config.allowedOrigins,
      }),
    );
  }
  if (
    dependencies.bankingRepository &&
    dependencies.bankingPaymentRepository &&
    dependencies.bankingReceiptRepository &&
    dependencies.authService &&
    dependencies.sessionService
  ) {
    app.use(
      "/api/v1/banking",
      createBankingRouter({
        repository: dependencies.bankingRepository,
        paymentRepository: dependencies.bankingPaymentRepository,
        receiptRepository: dependencies.bankingReceiptRepository,
        ...(dependencies.bankingTransferRepository
          ? { transferRepository: dependencies.bankingTransferRepository }
          : {}),
        ...(dependencies.bankingStatementRepository &&
        dependencies.bankingStatementStorage &&
        dependencies.bankingReconciliationRepository &&
        dependencies.bankingReconciliationAdjustmentRepository
          ? {
              statementRepository: dependencies.bankingStatementRepository,
              statementStorage: dependencies.bankingStatementStorage,
              reconciliationRepository: dependencies.bankingReconciliationRepository,
              adjustmentRepository: dependencies.bankingReconciliationAdjustmentRepository,
            }
          : {}),
        ...(dependencies.bankingRevaluationRepository
          ? { revaluationRepository: dependencies.bankingRevaluationRepository }
          : {}),
        authentication: dependencies.authService,
        sessions: dependencies.sessionService,
        secureCookies: dependencies.config.nodeEnv === "production",
        allowedOrigins: dependencies.config.allowedOrigins,
      }),
    );
  }

  const version = dependencies.version ?? "0.1.0";
  app.get("/api/v1/health/live", (_req, res) => res.json(status(version)));
  app.get("/api/v1/health/ready", async (_req, res) => {
    const checks: Record<string, "ok" | "unavailable"> = {};
    await Promise.all(
      Object.entries(dependencies.readiness).map(async ([name, check]) => {
        try {
          await check();
          checks[name] = "ok";
        } catch {
          checks[name] = "unavailable";
        }
      }),
    );
    if (Object.values(checks).some((value) => value === "unavailable")) {
      res
        .status(503)
        .type("application/problem+json")
        .json({
          type: "https://nexora.example/problems/not-ready",
          title: "Service unavailable",
          status: 503,
          detail: "One or more required dependencies are unavailable.",
          instance: "/api/v1/health/ready",
          correlationId: res.getHeader("x-correlation-id"),
          code: "NOT_READY",
        });
      return;
    }
    res.json(status(version, checks));
  });
  app.get("/api/v1/openapi.json", (_req, res) => res.json(buildOpenApiDocument()));
  app.get("/metrics", async (req, res) => {
    const configured = dependencies.config.metricsBearerToken;
    const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const configuredDigest = createHash("sha256")
      .update(configured ?? "")
      .digest();
    const suppliedDigest = createHash("sha256").update(supplied).digest();
    if (!configured || !timingSafeEqual(configuredDigest, suppliedDigest)) {
      res
        .status(401)
        .type("application/problem+json")
        .json({
          type: "https://nexora.example/problems/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Operational authentication is required.",
          instance: "/metrics",
          correlationId: res.getHeader("x-correlation-id"),
          code: "OPERATIONAL_AUTH_REQUIRED",
        });
      return;
    }
    res.type(dependencies.metrics.registry.contentType).send(await dependencies.metrics.registry.metrics());
  });
  app.use(
    "/api/v1/auth",
    createTenantAuthRouter({
      ...(dependencies.authService ? { authentication: dependencies.authService } : {}),
      ...(dependencies.tenantSelectionService ? { tenantSelection: dependencies.tenantSelectionService } : {}),
      ...(dependencies.passwordChangeService ? { passwordChanges: dependencies.passwordChangeService } : {}),
      ...(dependencies.sessionService ? { sessions: dependencies.sessionService } : {}),
      secureCookies: dependencies.config.nodeEnv === "production",
      allowedOrigins: dependencies.config.allowedOrigins,
    }),
  );
  if (dependencies.jobPublisher) app.use("/api/v1/jobs", createJobsRouter(dependencies.jobPublisher));
  app.use(notFound);
  app.use(errorHandler(dependencies.logger));
  return app;
}
