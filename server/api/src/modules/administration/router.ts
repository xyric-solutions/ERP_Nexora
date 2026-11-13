import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
  adminUserActionSchema,
  adminUserListQuerySchema,
  createAdminCompanyRequestSchema,
  createAdminUserRequestSchema,
  updateAdminCompanyRequestSchema,
  updateAdminUserRequestSchema,
  updateTenantProfileRequestSchema,
} from "@nexora/contracts";

import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { readSessionCookie } from "../auth/cookies.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../auth/tenant-router.js";
import {
  AdministrationError,
  type AdministrationActorContext,
  type AdministrationCredentialMailer,
  type AdministrationRepository,
} from "./repository.js";
import {
  administrationModuleCatalogueResponse,
  AdministrationService,
  requireAdministrationAdmin,
  requireSuperAdmin,
} from "./service.js";

export interface AdministrationRouterDependencies {
  authentication: TenantAuthApiService;
  sessions: TenantSessionApiService;
  secureCookies: boolean;
  allowedOrigins: ReadonlySet<string>;
}

export interface AdministrationFullRouterDependencies extends AdministrationRouterDependencies {
  repository: AdministrationRepository;
  mailer?: AdministrationCredentialMailer;
}

const recordId = z.string().trim().min(1).max(128);
const idempotencyKey = z.string().trim().min(8).max(128);

/** Resolves tenant and actor from the session cookie; writes also need a trusted origin and the CSRF token. */
async function loadAdministrationContext(
  req: Request,
  dependencies: AdministrationRouterDependencies,
  mutation = false,
): Promise<AdministrationActorContext> {
  if (mutation) {
    const origin = req.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin)) {
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    }
  }
  const token = readSessionCookie(req.get("cookie"), dependencies.secureCookies);
  if (!token) throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
  const authorized = mutation
    ? await dependencies.sessions.authorizeMutation(token, req.get("x-csrf-token") ?? "")
    : { status: "ok" as const, session: await dependencies.sessions.get(token) };
  if (authorized.status !== "ok" || !authorized.session) {
    const csrf = authorized.status === "invalid_csrf";
    throw new HttpError(
      csrf ? 403 : 401,
      csrf ? "CSRF_VALIDATION_FAILED" : "INVALID_SESSION",
      csrf ? "CSRF validation failed." : "The session is missing or no longer valid.",
    );
  }
  const session = authorized.session;
  const tenantHeader = req.get("x-tenant-id");
  if (tenantHeader && tenantHeader !== session.tenantId) {
    throw new HttpError(403, "TENANT_ACCESS_DENIED", "The tenant boundary was rejected.");
  }
  // Administration acts as the real signed-in user only; impersonated sessions can neither read nor change access.
  if (session.impersonation) {
    throw new HttpError(403, "IMPERSONATION_RESTRICTED", "Administration is unavailable during impersonation.");
  }
  const actor = await dependencies.authentication.loadAuthenticatedAccount(session.tenantId, session.userId);
  if (!actor) throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
  return { tenantId: session.tenantId, actor, correlationId: currentRequestContext().correlationId };
}

function requireIdempotencyKey(req: Request): string {
  const parsed = idempotencyKey.safeParse(req.get("idempotency-key") ?? "");
  if (!parsed.success) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid idempotency key is required.");
  return parsed.data;
}

function requireExpectedVersion(req: Request): number {
  const match = /^"(\d{1,15})"$/.exec(req.get("if-match") ?? "");
  if (!match) {
    throw new HttpError(428, "PRECONDITION_REQUIRED", "Supply the quoted current row version in If-Match.");
  }
  return Number(match[1]);
}

function sendVersioned(res: Response, value: { row_version: number }): void {
  res.setHeader("etag", `"${value.row_version}"`);
  res.json(value);
}

function baseRouter(): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  return router;
}

/** Maps service errors to problem+json; anything else falls through to the generic handler. */
async function handle<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AdministrationError) throw new HttpError(error.status, error.code, error.message);
    throw error;
  }
}

/**
 * `GET /admin/modules` only. It needs no persistence, so it is mounted in the running API before the
 * plan Phase 2 tables exist.
 */
export function createAdministrationCatalogueRouter(dependencies: AdministrationRouterDependencies): Router {
  const router = baseRouter();
  router.get("/modules", async (req, res) => {
    const context = await loadAdministrationContext(req, dependencies);
    await handle(async () => requireAdministrationAdmin(context));
    res.json(administrationModuleCatalogueResponse());
  });
  return router;
}

/**
 * Full Administration API (plan Phase 3). Mounted only when a repository is supplied; every rule (Super Admin
 * only writes, last-Super-Admin guard, self-demotion confirmation, audit) lives in `AdministrationService`.
 */
export function createAdministrationRouter(dependencies: AdministrationFullRouterDependencies): Router {
  const service = new AdministrationService({
    repository: dependencies.repository,
    ...(dependencies.mailer ? { mailer: dependencies.mailer } : {}),
  });
  const router = baseRouter();
  const read = (req: Request) => loadAdministrationContext(req, dependencies);
  /** Every `/admin/*` write is Super Admin only; refuse before validating the body so nothing leaks. */
  const write = async (req: Request) => {
    const context = await loadAdministrationContext(req, dependencies, true);
    await handle(async () => requireSuperAdmin(context));
    return context;
  };

  router.get("/modules", async (req, res) => {
    const context = await read(req);
    res.json(await handle(async () => service.modules(context)));
  });

  router.get("/dashboard", async (req, res) => {
    const context = await read(req);
    res.json(await handle(() => service.dashboard(context)));
  });

  router.get("/tenant", async (req, res) => {
    const context = await read(req);
    sendVersioned(res, await handle(() => service.tenant(context)));
  });

  router.patch("/tenant", async (req, res) => {
    const context = await write(req);
    const input = updateTenantProfileRequestSchema.parse(req.body);
    const options = { idempotencyKey: requireIdempotencyKey(req), expectedVersion: requireExpectedVersion(req) };
    sendVersioned(res, await handle(() => service.updateTenant(context, input, options)));
  });

  router.get("/companies", async (req, res) => {
    const context = await read(req);
    res.json(await handle(() => service.companies(context)));
  });

  router.post("/companies", async (req, res) => {
    const context = await write(req);
    const input = createAdminCompanyRequestSchema.parse(req.body);
    const options = { idempotencyKey: requireIdempotencyKey(req) };
    const company = await handle(() => service.createCompany(context, input, options));
    res.status(201);
    sendVersioned(res, company);
  });

  router.patch("/companies/:companyId", async (req, res) => {
    const context = await write(req);
    const companyId = recordId.parse(req.params.companyId);
    const input = updateAdminCompanyRequestSchema.parse(req.body);
    const options = { idempotencyKey: requireIdempotencyKey(req), expectedVersion: requireExpectedVersion(req) };
    sendVersioned(res, await handle(() => service.updateCompany(context, companyId, input, options)));
  });

  router.get("/users", async (req, res) => {
    const context = await read(req);
    const query = adminUserListQuerySchema.parse(req.query);
    res.json(await handle(() => service.users(context, query)));
  });

  router.get("/users/:userId", async (req, res) => {
    const context = await read(req);
    const userId = recordId.parse(req.params.userId);
    sendVersioned(res, await handle(() => service.user(context, userId)));
  });

  router.post("/users", async (req, res) => {
    const context = await write(req);
    const input = createAdminUserRequestSchema.parse(req.body);
    const options = { idempotencyKey: requireIdempotencyKey(req) };
    const result = await handle(() => service.createUser(context, input, options));
    res.status(201).setHeader("etag", `"${result.user.row_version}"`);
    res.json(result);
  });

  router.patch("/users/:userId", async (req, res) => {
    const context = await write(req);
    const userId = recordId.parse(req.params.userId);
    const input = updateAdminUserRequestSchema.parse(req.body);
    const options = { idempotencyKey: requireIdempotencyKey(req), expectedVersion: requireExpectedVersion(req) };
    sendVersioned(res, await handle(() => service.updateUser(context, userId, input, options)));
  });

  router.post("/users/:userId/actions", async (req, res) => {
    const context = await write(req);
    const userId = recordId.parse(req.params.userId);
    const input = adminUserActionSchema.parse(req.body);
    const options = { idempotencyKey: requireIdempotencyKey(req), expectedVersion: requireExpectedVersion(req) };
    const result = await handle(() => service.actOnUser(context, userId, input, options));
    res.setHeader("etag", `"${result.user.row_version}"`);
    res.json(result);
  });

  return router;
}
