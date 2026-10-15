import { Router, type Request } from "express";

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
  passwordLoginRequestSchema,
  selectTenantRequestSchema,
  type PasswordLoginResponse,
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

function responseForSession(session: TenantSessionView, account: AuthenticatedAccount): SessionResponse {
  return {
    status: "authenticated",
    tenant_id: session.tenantId,
    user: {
      id: account.userId,
      email: account.email,
      display_name: account.displayName,
      roles: [...account.roles],
      permissions: [...account.permissions],
    },
    csrf_token: session.csrfToken,
    idle_expires_at: session.idleExpiresAt.toISOString(),
    absolute_expires_at: session.absoluteExpiresAt.toISOString(),
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

  router.get("/session", async (req, res) => {
    const token = requireSessionToken(req, secureCookies);
    const session = await sessions.get(token);
    if (!session) {
      res.setHeader("set-cookie", clearSessionCookie(secureCookies));
      throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    }
    const account = await authentication.loadAuthenticatedAccount(session.tenantId, session.userId);
    if (!account) {
      await sessions.revokeToken(token);
      res.setHeader("set-cookie", clearSessionCookie(secureCookies));
      throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    }
    res.setHeader("set-cookie", serializeSessionCookie(token, session.idleExpiresAt, new Date(), secureCookies));
    res.json(responseForSession(session, account));
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
    res.json(responseForSession(result, account));
  });

  router.post("/logout", async (req, res) => {
    requireTrustedOrigin(req, allowedOrigins);
    const token = requireSessionToken(req, secureCookies);
    const result = await sessions.logout(token, req.get("x-csrf-token") ?? "");
    if (result.status !== "ok") handleMutationFailure(result.status);
    res.setHeader("set-cookie", clearSessionCookie(secureCookies));
    res.status(204).end();
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
