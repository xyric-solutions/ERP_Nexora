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
  type BankingRepository,
} from "./modules/banking/router.js";
import { createHrRouter } from "./modules/hr/router.js";
import type { SourceHrRepository } from "./modules/hr/source-repository.js";
import { createSecurityRouter } from "./modules/security/router.js";
import type { SecurityAdministrationApiRepository } from "./modules/security/router.js";

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
  if (Boolean(dependencies.bankingRepository) !== Boolean(dependencies.bankingPaymentRepository)) {
    throw new Error("Banking account and payment repositories must be configured together.");
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
    dependencies.authService &&
    dependencies.sessionService
  ) {
    app.use(
      "/api/v1/banking",
      createBankingRouter({
        repository: dependencies.bankingRepository,
        paymentRepository: dependencies.bankingPaymentRepository,
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
