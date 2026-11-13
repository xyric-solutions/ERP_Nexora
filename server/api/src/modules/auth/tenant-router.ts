import { Router, type NextFunction, type Request, type Response } from "express";

import type {
  AuthenticatedAccount,
  PasswordChangeService,
  TenantAuthenticationService,
  TenantSelectionService,
  TenantSessionService,
  TenantSessionView,
} from "@nexora/auth";
import {
  cancelTenantSelectionRequestSchema,
  changeInitialPasswordRequestSchema,
  changePasswordRequestSchema,
  passwordLoginRequestSchema,
  selectSessionCompanyRequestSchema,
  selectTenantRequestSchema,
  type PasswordLoginResponse,
  type SessionCompany,
  type SessionCompanyDirectory,
  type SessionResponse,
} from "@nexora/contracts";

import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { clearSessionCookie, readSessionCookie, serializeSessionCookie } from "./cookies.js";

export interface TenantAuthApiService {
  verifyPasswordCredentials: TenantAuthenticationService["verifyPasswordCredentials"];
  loadAuthenticatedAccount: TenantAuthenticationService["loadAuthenticatedAccount"];
  loadPasswordVerifiedAccount: TenantAuthenticationService["loadPasswordVerifiedAccount"];
  recordTrustedAuthenticationEvent: TenantAuthenticationService["recordTrustedAuthenticationEvent"];
  changeInitialPassword: TenantAuthenticationService["changeInitialPassword"];
  /** Self-service password change; absent in older test doubles, in which case the route answers 503. */
  changePassword?: TenantAuthenticationService["changePassword"];
}

export interface TenantSelectionApiService {
  issue: TenantSelectionService["issue"];
  consume: TenantSelectionService["consume"];
  cancel: TenantSelectionService["cancel"];
}

export interface TenantSessionApiService {
  issue: TenantSessionService["issue"];
  get: TenantSessionService["get"];
  rotate: TenantSessionService["rotate"];
  authorizeMutation: TenantSessionService["authorizeMutation"];
  logout: TenantSessionService["logout"];
  logoutAll: TenantSessionService["logoutAll"];
  revokeToken: TenantSessionService["revokeToken"];
  revokeAllForUser: TenantSessionService["revokeAllForUser"];
  startImpersonation?: TenantSessionService["startImpersonation"];
  endImpersonation?: TenantSessionService["endImpersonation"];
  setActiveCompany?: TenantSessionService["setActiveCompany"];
}

/** Companies a user may sign in to (their unrevoked company access grants). */
export interface SessionCompanyApiService {
  listAccessibleCompanies(tenantId: string, userId: string): Promise<SessionCompany[]>;
}

export interface PasswordChangeApiService {
  issue: PasswordChangeService["issue"];
  consume: PasswordChangeService["consume"];
  cancel: PasswordChangeService["cancel"];
}

export interface TenantAuthRouterDependencies {
  authentication?: TenantAuthApiService;
  sessions?: TenantSessionApiService;
  tenantSelection?: TenantSelectionApiService;
  passwordChanges?: PasswordChangeApiService;
  companies?: SessionCompanyApiService;
  secureCookies?: boolean;
  allowedOrigins?: ReadonlySet<string>;
}

const unavailableAuthentication: TenantAuthApiService = {
  async verifyPasswordCredentials() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async loadAuthenticatedAccount() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async loadPasswordVerifiedAccount() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async recordTrustedAuthenticationEvent() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async changeInitialPassword() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
};

const unavailablePasswordChanges: PasswordChangeApiService = {
  async issue() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async consume() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async cancel() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
};

const unavailableTenantSelection: TenantSelectionApiService = {
  async issue() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async consume() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async cancel() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
};

const unavailableSessions: TenantSessionApiService = {
  async issue() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async get() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async rotate() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async authorizeMutation() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async logout() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async logoutAll() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async revokeToken() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
  async revokeAllForUser() {
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Authentication is not available.");
  },
};

function sessionContext(req: Request) {
  const userAgent = req.get("user-agent");
  return {
    sourceIp: req.ip || req.socket.remoteAddress || "unknown",
    ...(userAgent ? { userAgent } : {}),
  };
}

function userResponse(account: AuthenticatedAccount) {
  return {
    id: account.userId,
    email: account.email,
    display_name: account.displayName,
    roles: [...account.roles],
    permissions: [...account.permissions],
  };
}

function responseForSession(
  session: TenantSessionView,
  realAccount: AuthenticatedAccount,
  effectiveAccount: AuthenticatedAccount = realAccount,
  activeCompany: SessionCompany | null = null,
): SessionResponse {
  return {
    status: "authenticated",
    active_company: activeCompany,
    tenant_id: session.tenantId,
    user: userResponse(effectiveAccount),
    csrf_token: session.csrfToken,
    idle_expires_at: session.idleExpiresAt.toISOString(),
    absolute_expires_at: session.absoluteExpiresAt.toISOString(),
    ...(session.impersonation
      ? {
          impersonation: {
            request_id: session.impersonation.requestId,
            expected_version: session.impersonation.requestVersion,
            real_user: userResponse(realAccount),
            expires_at: session.impersonation.expiresAt.toISOString(),
          },
        }
      : {}),
  };
}

function requireSessionToken(req: Request, secureCookies: boolean): string {
  const token = readSessionCookie(req.get("cookie"), secureCookies);
  if (!token) throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
  return token;
}

function requireTrustedOrigin(req: Request, allowedOrigins: ReadonlySet<string>): void {
  const origin = req.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
  }
}

/** Violations of a `PasswordPolicyError` (matched structurally so duplicate module copies still map to a 400). */
function passwordPolicyViolations(error: unknown): string[] | null {
  if (!(error instanceof Error) || (error as { code?: unknown }).code !== "PASSWORD_POLICY_REJECTED") return null;
  const violations = (error as { violations?: unknown }).violations;
  return Array.isArray(violations) ? violations.filter((value): value is string => typeof value === "string") : [];
}

function handleMutationFailure(status: "invalid_session" | "invalid_csrf"): never {
  if (status === "invalid_csrf") {
    throw new HttpError(403, "CSRF_VALIDATION_FAILED", "CSRF validation failed.");
  }
  throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
}

export function createTenantAuthRouter(dependencies: TenantAuthRouterDependencies = {}): Router {
  const authentication = dependencies.authentication ?? unavailableAuthentication;
  const sessions = dependencies.sessions ?? unavailableSessions;
  const tenantSelection = dependencies.tenantSelection ?? unavailableTenantSelection;
  const passwordChanges = dependencies.passwordChanges ?? unavailablePasswordChanges;
  const secureCookies = dependencies.secureCookies ?? false;
  const allowedOrigins = dependencies.allowedOrigins ?? new Set<string>();
  const router = Router();

  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });

  router.post("/login", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const input = passwordLoginRequestSchema.parse(req.body);
    const context = sessionContext(req);
    const result = await authentication.verifyPasswordCredentials({
      identifier: input.identifier,
      password: input.password,
      sourceIp: context.sourceIp,
      correlationId: currentRequestContext().correlationId,
    });
    if (result.status === "throttled") {
      res.setHeader("retry-after", String(result.retryAfterSeconds));
      throw new HttpError(429, "LOGIN_THROTTLED", "Too many authentication attempts. Try again later.");
    }
    if (result.status === "invalid") {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
    }
    if (result.accounts.length > 1) {
      const existingToken = readSessionCookie(req.get("cookie"), secureCookies);
      if (existingToken) {
        await sessions.revokeToken(existingToken);
        res.setHeader("set-cookie", clearSessionCookie(secureCookies));
      }
      const challenge = await tenantSelection.issue(result.accounts, context);
      const response: PasswordLoginResponse = {
        status: "tenant_selection_required",
        ticket: challenge.ticket,
        expires_at: challenge.expiresAt.toISOString(),
        choices: challenge.choices.map((choice) => ({
          id: choice.id,
          organization_name: choice.organizationName,
        })),
      };
      res.json(response);
      return;
    }
    const account = result.accounts[0];
    if (!account) throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
    if (account.mustChangePassword) {
      const existingToken = readSessionCookie(req.get("cookie"), secureCookies);
      if (existingToken) {
        await sessions.revokeToken(existingToken);
        res.setHeader("set-cookie", clearSessionCookie(secureCookies));
      }
      const challenge = await passwordChanges.issue({
        tenantId: account.tenantId,
        userId: account.userId,
        passwordVersion: account.passwordVersion,
        context,
      });
      const response: PasswordLoginResponse = {
        status: "password_change_required",
        ticket: challenge.ticket,
        expires_at: challenge.expiresAt.toISOString(),
      };
      res.json(response);
      return;
    }
    const issued = await sessions.issue(
      account.tenantId,
      account.userId,
      context,
      readSessionCookie(req.get("cookie"), secureCookies) ?? undefined,
    );
    try {
      await authentication.recordTrustedAuthenticationEvent({
        tenantId: account.tenantId,
        userId: account.userId,
        correlationId: currentRequestContext().correlationId,
        eventType: "session_issued",
      });
    } catch (error) {
      await sessions.revokeToken(issued.token);
      throw error;
    }
    res.setHeader("set-cookie", serializeSessionCookie(issued.token, issued.idleExpiresAt, new Date(), secureCookies));
    const response: PasswordLoginResponse = responseForSession(issued, account);
    res.json(response);
  });

  router.post("/select-tenant", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const input = selectTenantRequestSchema.parse(req.body);
    const context = sessionContext(req);
    const selection = await tenantSelection.consume(input.ticket, input.choice_id, context);
    if (selection.status !== "selected") {
      throw new HttpError(401, "INVALID_TENANT_SELECTION", "The organization selection is invalid or expired.");
    }
    const account = await authentication.loadPasswordVerifiedAccount(selection.tenantId, selection.userId);
    if (!account) {
      throw new HttpError(401, "INVALID_TENANT_SELECTION", "The organization selection is invalid or expired.");
    }
    await authentication.recordTrustedAuthenticationEvent({
      tenantId: account.tenantId,
      userId: account.userId,
      correlationId: currentRequestContext().correlationId,
      eventType: "tenant_selected",
    });
    if (account.mustChangePassword) {
      const challenge = await passwordChanges.issue({
        tenantId: account.tenantId,
        userId: account.userId,
        passwordVersion: account.passwordVersion,
        context,
      });
      res.json({
        status: "password_change_required",
        ticket: challenge.ticket,
        expires_at: challenge.expiresAt.toISOString(),
      });
      return;
    }
    const issued = await sessions.issue(
      account.tenantId,
      account.userId,
      context,
      readSessionCookie(req.get("cookie"), secureCookies) ?? undefined,
    );
    try {
      await authentication.recordTrustedAuthenticationEvent({
        tenantId: account.tenantId,
        userId: account.userId,
        correlationId: currentRequestContext().correlationId,
        eventType: "session_issued",
      });
    } catch (error) {
      await sessions.revokeToken(issued.token);
      throw error;
    }
    res.setHeader("set-cookie", serializeSessionCookie(issued.token, issued.idleExpiresAt, new Date(), secureCookies));
    res.json(responseForSession(issued, account));
  });

  router.post("/cancel-tenant-selection", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const input = cancelTenantSelectionRequestSchema.parse(req.body);
    await tenantSelection.cancel(input.ticket);
    res.status(204).end();
  });

  router.post("/change-initial-password", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const input = changeInitialPasswordRequestSchema.parse(req.body);
    const context = sessionContext(req);
    const consumed = await passwordChanges.consume({
      ticket: input.ticket,
      newPassword: input.new_password,
      context,
    });
    if (!consumed) {
      throw new HttpError(401, "INVALID_PASSWORD_CHANGE", "The password-change request is invalid or expired.");
    }
    const account = await authentication.changeInitialPassword({
      tenantId: consumed.tenantId,
      userId: consumed.userId,
      expectedPasswordVersion: consumed.passwordVersion,
      newPassword: consumed.newPassword,
      correlationId: currentRequestContext().correlationId,
    });
    if (!account) {
      throw new HttpError(401, "INVALID_PASSWORD_CHANGE", "The password-change request is invalid or expired.");
    }
    const issued = await sessions.issue(
      account.tenantId,
      account.userId,
      context,
      readSessionCookie(req.get("cookie"), secureCookies) ?? undefined,
    );
    try {
      await authentication.recordTrustedAuthenticationEvent({
        tenantId: account.tenantId,
        userId: account.userId,
        correlationId: currentRequestContext().correlationId,
        eventType: "session_issued",
      });
    } catch (error) {
      await sessions.revokeToken(issued.token);
      throw error;
    }
    res.setHeader("set-cookie", serializeSessionCookie(issued.token, issued.idleExpiresAt, new Date(), secureCookies));
    res.json(responseForSession(issued, account));
  });

  /**
   * Any signed-in user changes their own password. Requires a trusted origin, the session cookie and its CSRF token.
   * A successful change bumps the user's session version, which ends every existing session (including this one),
   * so a fresh session is issued and returned in its place.
   */
  router.post("/change-password", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const token = requireSessionToken(req, secureCookies);
    const authorized = await sessions.authorizeMutation(token, req.get("x-csrf-token") ?? "");
    if (authorized.status !== "ok") handleMutationFailure(authorized.status);
    if (!authorized.session) handleMutationFailure("invalid_session");
    const session = authorized.session;
    if (session.impersonation) {
      throw new HttpError(403, "IMPERSONATION_FORBIDDEN", "Passwords cannot be changed while impersonating a user.");
    }
    const input = changePasswordRequestSchema.parse(req.body);
    if (!authentication.changePassword) {
      throw new HttpError(503, "AUTH_UNAVAILABLE", "Password change is not available.");
    }
    const correlationId = currentRequestContext().correlationId;
    let result: Awaited<ReturnType<NonNullable<TenantAuthApiService["changePassword"]>>>;
    try {
      result = await authentication.changePassword({
        tenantId: session.tenantId,
        userId: session.userId,
        currentPassword: input.current_password,
        newPassword: input.new_password,
        correlationId,
      });
    } catch (error) {
      const violations = passwordPolicyViolations(error);
      if (violations) {
        throw new HttpError(
          400,
          "PASSWORD_POLICY_REJECTED",
          `The new password does not meet the security policy (${violations.join(", ")}).`,
        );
      }
      throw error;
    }
    if (result.status === "throttled") {
      res.setHeader("retry-after", String(result.retryAfterSeconds));
      throw new HttpError(429, "PASSWORD_CHANGE_THROTTLED", "Too many password-change attempts. Try again later.");
    }
    if (result.status === "invalid_current_password") {
      throw new HttpError(400, "INVALID_CURRENT_PASSWORD", "The current password is incorrect.");
    }
    await sessions.revokeAllForUser(session.tenantId, session.userId);
    const issued = await sessions.issue(session.tenantId, session.userId, sessionContext(req));
    try {
      await authentication.recordTrustedAuthenticationEvent({
        tenantId: session.tenantId,
        userId: session.userId,
        correlationId,
        eventType: "session_issued",
      });
    } catch (error) {
      await sessions.revokeToken(issued.token);
      throw error;
    }
    let current: TenantSessionView = issued;
    if (session.activeCompanyId && sessions.setActiveCompany) {
      const kept = await sessions.setActiveCompany(issued.token, issued.csrfToken, session.activeCompanyId);
      if (kept.status === "ok" && kept.session) current = kept.session;
    }
    res.setHeader("set-cookie", serializeSessionCookie(issued.token, issued.idleExpiresAt, new Date(), secureCookies));
    res.json(responseForSession(current, result.account, result.account, await activeCompanyOf(current)));
  });

  router.get("/session", async (req, res) => {
    const token = requireSessionToken(req, secureCookies);
    const session = await sessions.get(token);
    if (!session) {
      res.setHeader("set-cookie", clearSessionCookie(secureCookies));
      throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    }
    const realAccount = await authentication.loadAuthenticatedAccount(session.tenantId, session.userId);
    if (!realAccount) {
      await sessions.revokeToken(token);
      res.setHeader("set-cookie", clearSessionCookie(secureCookies));
      throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    }
    const effectiveAccount = session.impersonation
      ? await authentication.loadAuthenticatedAccount(session.tenantId, session.impersonation.targetUserId)
      : realAccount;
    if (!effectiveAccount) {
      await sessions.revokeToken(token);
      res.setHeader("set-cookie", clearSessionCookie(secureCookies));
      throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    }
    res.setHeader("set-cookie", serializeSessionCookie(token, session.idleExpiresAt, new Date(), secureCookies));
    res.json(responseForSession(session, realAccount, effectiveAccount, await activeCompanyOf(session)));
  });

  router.post("/session/rotate", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const token = requireSessionToken(req, secureCookies);
    const result = await sessions.rotate(token, req.get("x-csrf-token") ?? "", sessionContext(req));
    if (result.status !== "ok") handleMutationFailure(result.status);
    const account = await authentication.loadAuthenticatedAccount(result.tenantId, result.userId);
    if (!account) {
      await sessions.revokeToken(result.token);
      throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    }
    res.setHeader("set-cookie", serializeSessionCookie(result.token, result.idleExpiresAt, new Date(), secureCookies));
    res.json(responseForSession(result, account, account, await activeCompanyOf(result)));
  });

  router.post("/logout", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const token = requireSessionToken(req, secureCookies);
    const result = await sessions.logout(token, req.get("x-csrf-token") ?? "");
    if (result.status !== "ok") handleMutationFailure(result.status);
    res.setHeader("set-cookie", clearSessionCookie(secureCookies));
    res.status(204).end();
  });

  /** The session's company, if it is still one of the effective user's accessible companies. */
  async function activeCompanyOf(session: TenantSessionView): Promise<SessionCompany | null> {
    if (!session.activeCompanyId || !dependencies.companies) return null;
    const userId = session.impersonation?.targetUserId ?? session.userId;
    const companies = await dependencies.companies.listAccessibleCompanies(session.tenantId, userId);
    return companies.find((company) => company.id === session.activeCompanyId) ?? null;
  }
  async function signedInSession(req: Request) {
    const token = requireSessionToken(req, secureCookies);
    const session = await sessions.get(token);
    if (!session) throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    return { token, session };
  }
  async function sessionAccounts(session: TenantSessionView) {
    const realAccount = await authentication.loadAuthenticatedAccount(session.tenantId, session.userId);
    const effectiveAccount =
      realAccount && session.impersonation
        ? await authentication.loadAuthenticatedAccount(session.tenantId, session.impersonation.targetUserId)
        : realAccount;
    if (!realAccount || !effectiveAccount)
      throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    return { realAccount, effectiveAccount };
  }

  router.get("/companies", async (req, res) => {
    const { session } = await signedInSession(req);
    if (!dependencies.companies) throw new HttpError(503, "AUTH_UNAVAILABLE", "Company selection is not available.");
    const userId = session.impersonation?.targetUserId ?? session.userId;
    const response: SessionCompanyDirectory = {
      items: await dependencies.companies.listAccessibleCompanies(session.tenantId, userId),
    };
    res.json(response);
  });

  router.put("/session/company", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const input = selectSessionCompanyRequestSchema.parse(req.body);
    const { token, session } = await signedInSession(req);
    if (!dependencies.companies || !sessions.setActiveCompany)
      throw new HttpError(503, "AUTH_UNAVAILABLE", "Company selection is not available.");
    const userId = session.impersonation?.targetUserId ?? session.userId;
    const company = (await dependencies.companies.listAccessibleCompanies(session.tenantId, userId)).find(
      (item) => item.id === input.company_id,
    );
    if (!company) throw new HttpError(403, "COMPANY_ACCESS_DENIED", "You do not have access to this company.");
    const result = await sessions.setActiveCompany(token, req.get("x-csrf-token") ?? "", company.id);
    if (result.status !== "ok") handleMutationFailure(result.status);
    if (!result.session) handleMutationFailure("invalid_session");
    const { realAccount, effectiveAccount } = await sessionAccounts(result.session);
    res.json(responseForSession(result.session, realAccount, effectiveAccount, company));
  });

  router.delete("/session/company", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const { token } = await signedInSession(req);
    if (!sessions.setActiveCompany) throw new HttpError(503, "AUTH_UNAVAILABLE", "Company selection is not available.");
    const result = await sessions.setActiveCompany(token, req.get("x-csrf-token") ?? "", null);
    if (result.status !== "ok") handleMutationFailure(result.status);
    if (!result.session) handleMutationFailure("invalid_session");
    const { realAccount, effectiveAccount } = await sessionAccounts(result.session);
    res.json(responseForSession(result.session, realAccount, effectiveAccount, null));
  });

  router.post("/logout-all", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const token = requireSessionToken(req, secureCookies);
    const result = await sessions.logoutAll(token, req.get("x-csrf-token") ?? "");
    if (result.status !== "ok") handleMutationFailure(result.status);
    res.setHeader("set-cookie", clearSessionCookie(secureCookies));
    res.status(204).end();
  });

  return router;
}

/** company_id values a request names in its query string or JSON body. */
function requestedCompanyIds(req: Request): string[] {
  const values: unknown[] = [];
  const query = req.query?.company_id;
  if (Array.isArray(query)) values.push(...query);
  else if (query !== undefined) values.push(query);
  const body = req.body as { company_id?: unknown } | undefined;
  if (body && typeof body === "object" && !Array.isArray(body) && body.company_id !== undefined)
    values.push(body.company_id);
  return values.filter((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * Keeps every company-scoped request inside the company chosen after sign-in. Company access grants are still
 * checked by each module; this only stops a signed-in session from reaching a different company without signing out
 * and choosing it. Security administration manages grants across companies and is exempt.
 */
export function createActiveCompanyGuard(sessions: Pick<TenantSessionApiService, "get">, secureCookies = false) {
  const exempt = ["/api/v1/auth", "/api/v1/security", "/api/v1/health", "/api/v1/jobs"];
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (exempt.some((prefix) => req.path === prefix || req.path.startsWith(prefix + "/"))) return next();
      const ids = requestedCompanyIds(req);
      if (!ids.length) return next();
      const token = readSessionCookie(req.get("cookie"), secureCookies);
      if (!token) return next();
      const session = await sessions.get(token);
      if (session?.activeCompanyId && ids.some((id) => id !== session.activeCompanyId))
        throw new HttpError(
          403,
          "COMPANY_SCOPE_MISMATCH",
          "This request is for a different company than the one you signed in to. Sign out and choose that company.",
        );
      next();
    } catch (error) {
      next(error);
    }
  };
}
