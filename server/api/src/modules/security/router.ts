import { Router, type Request } from "express";
import { z } from "zod";

import type { TenantAuthApiService, TenantSessionApiService } from "../auth/tenant-router.js";
import {
  createSecurityAssignmentRequestSchema,
  createSecurityAccessReviewCampaignSchema,
  createSecurityDelegationSchema,
  createSecurityImpersonationSchema,
  createSecurityRoleRequestSchema,
  createSecurityUserRequestSchema,
  securityApprovalActionSchema,
  securityAccessReviewCampaignActionSchema,
  securityAccessReviewDecisionSchema,
  securityAccessReviewListQuerySchema,
  securityDelegationActionSchema,
  securityDelegationListQuerySchema,
  securityImpersonationActionSchema,
  securityImpersonationListQuerySchema,
  securityAssignmentRequestActionSchema,
  securityRoleActionRequestSchema,
  securityUserEmergencyActionSchema,
  securityUserRequestActionSchema,
} from "@nexora/contracts";

import { currentRequestContext } from "../../http/request-context.js";
import { HttpError } from "../../http/errors.js";
import { readSessionCookie } from "../auth/cookies.js";
import { SecurityAdministrationError, type SecurityActorContext } from "./source-administration-repository.js";

export interface SecurityAdministrationApiRepository {
  listPermissions: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listPermissions"];
  listCapabilities: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listCapabilities"];
  listRoles: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listRoles"];
  listAssignments: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listAssignments"];
  listApprovals: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listApprovals"];
  listAudit: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listAudit"];
  createRole: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["createRole"];
  actOnRole: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["actOnRole"];
  createAssignmentRequest: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["createAssignmentRequest"];
  actOnAssignmentRequest: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["actOnAssignmentRequest"];
  decideApproval: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["decideApproval"];
  listUsers: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listUsers"];
  getUser: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["getUser"];
  listUserOptions: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listUserOptions"];
  createUserRequest: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["createUserRequest"];
  actOnUserRequest: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["actOnUserRequest"];
  actOnUserEmergency: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["actOnUserEmergency"];
  listAccessReviewCampaigns: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listAccessReviewCampaigns"];
  listAccessReviewItems: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listAccessReviewItems"];
  createAccessReviewCampaign: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["createAccessReviewCampaign"];
  actOnAccessReviewCampaign: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["actOnAccessReviewCampaign"];
  decideAccessReviewItem: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["decideAccessReviewItem"];
  listDelegations: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listDelegations"];
  createDelegation: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["createDelegation"];
  actOnDelegation: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["actOnDelegation"];
  listImpersonations: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["listImpersonations"];
  createImpersonation: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["createImpersonation"];
  actOnImpersonation: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["actOnImpersonation"];
  failImpersonationActivation: import("./source-administration-repository.js").SourceSecurityAdministrationRepository["failImpersonationActivation"];
}

const querySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  lifecycle_state: z.string().optional(),
  request_state: z.string().optional(),
  resource_type: z.enum(["role", "assignment", "user"]).optional(),
  user_id: z.string().min(1).max(128).optional(),
  role_policy_id: z.string().min(1).max(128).optional(),
  workspace: z.enum(["users", "roles"]).optional(),
  entity_type: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .optional(),
  entity_id: z.string().min(1).max(128).optional(),
});

const userQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["active", "inactive", "locked"]).optional(),
  company_id: z.string().min(1).max(128).optional(),
  role_policy_id: z.string().min(1).max(128).optional(),
  employee_linked: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  archived: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export interface SecurityRouterDependencies {
  repository: SecurityAdministrationApiRepository;
  authentication: TenantAuthApiService;
  sessions: TenantSessionApiService;
  secureCookies: boolean;
  allowedOrigins: ReadonlySet<string>;
}

function trustedOrigin(req: Request, allowed: ReadonlySet<string>): void {
  const origin = req.get("origin");
  if (origin && !allowed.has(origin))
    throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
}

function idempotencyKey(req: Request): string {
  const key = req.get("idempotency-key");
  if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
  return key;
}

export function createSecurityRouter(dependencies: SecurityRouterDependencies): Router {
  const router = Router();

  async function sessionContextForRequest(req: Request, mutation: boolean) {
    const token = readSessionCookie(req.get("cookie"), dependencies.secureCookies);
    if (!token) throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    const session = mutation
      ? await dependencies.sessions.authorizeMutation(token, req.get("x-csrf-token") ?? "")
      : { status: "ok" as const, session: await dependencies.sessions.get(token) };
    if (session.status !== "ok" || !session.session) {
      const code = session.status === "invalid_csrf" ? "CSRF_VALIDATION_FAILED" : "INVALID_SESSION";
      throw new HttpError(
        code === "CSRF_VALIDATION_FAILED" ? 403 : 401,
        code,
        code === "CSRF_VALIDATION_FAILED" ? "CSRF validation failed." : "The session is missing or no longer valid.",
      );
    }
    const tenantHeader = req.get("x-tenant-id");
    if (tenantHeader && tenantHeader !== session.session.tenantId)
      throw new HttpError(403, "TENANT_ACCESS_DENIED", "The tenant boundary was rejected.");
    const actor = await dependencies.authentication.loadAuthenticatedAccount(
      session.session.tenantId,
      session.session.userId,
    );
    if (!actor) throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
    return { token, session: session.session, actor };
  }

  async function context(req: Request, mutation: boolean): Promise<SecurityActorContext> {
    const resolved = await sessionContextForRequest(req, mutation);
    if (resolved.session.impersonation)
      throw new HttpError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Identity and Access operations are disabled during impersonation.",
      );
    return {
      tenantId: resolved.session.tenantId,
      actor: resolved.actor,
      correlationId: currentRequestContext().correlationId,
    };
  }

  const handle = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SecurityAdministrationError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  };

  async function cleanRevokedSessions(
    tenantId: string,
    result: { entity_id: string; projection: Record<string, unknown>; replayed: boolean },
  ): Promise<void> {
    const previous = result.projection.previous_state as Record<string, unknown> | null;
    const next = result.projection.new_state as Record<string, unknown> | null;
    if (previous?.session_version === next?.session_version) return;
    if (next?.session_version === undefined) return;
    await dependencies.sessions.revokeAllForUser(tenantId, result.entity_id);
  }

  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  router.get("/permissions", async (req, res) =>
    res.json(await handle(async () => dependencies.repository.listPermissions(await context(req, false)))),
  );
  router.get("/capabilities", async (req, res) =>
    res.json(await handle(async () => dependencies.repository.listCapabilities(await context(req, false)))),
  );
  router.get("/roles", async (req, res) => {
    const query = querySchema.parse(req.query);
    res.json(
      await handle(async () =>
        dependencies.repository.listRoles(await context(req, false), query.cursor, query.limit, query.lifecycle_state),
      ),
    );
  });
  router.get("/assignments", async (req, res) => {
    const query = querySchema.parse(req.query);
    res.json(
      await handle(async () =>
        dependencies.repository.listAssignments(
          await context(req, false),
          query.cursor,
          query.limit,
          query.lifecycle_state,
          query.user_id,
          query.role_policy_id,
        ),
      ),
    );
  });
  router.get("/approvals", async (req, res) => {
    const query = querySchema.parse(req.query);
    if (!query.resource_type)
      throw new HttpError(400, "RESOURCE_TYPE_REQUIRED", "The approval resource type is required.");
    res.json(
      await handle(async () =>
        dependencies.repository.listApprovals(
          await context(req, false),
          query.resource_type!,
          query.cursor,
          query.limit,
          query.request_state,
          {
            ...(query.user_id ? { userId: query.user_id } : {}),
            ...(query.role_policy_id ? { rolePolicyId: query.role_policy_id } : {}),
          },
        ),
      ),
    );
  });
  router.get("/audit_events", async (req, res) => {
    const query = querySchema.parse(req.query);
    res.json(
      await handle(async () =>
        dependencies.repository.listAudit(
          await context(req, false),
          query.cursor,
          query.limit,
          query.entity_type,
          query.entity_id,
          {
            ...(query.workspace ? { workspace: query.workspace } : {}),
            ...(query.user_id ? { userId: query.user_id } : {}),
            ...(query.role_policy_id ? { rolePolicyId: query.role_policy_id } : {}),
          },
        ),
      ),
    );
  });
  router.get("/users", async (req, res) => {
    const query = userQuerySchema.parse(req.query);
    res.json(await handle(async () => dependencies.repository.listUsers(await context(req, false), query)));
  });
  router.get("/users/:userId", async (req, res) => {
    const userId = z.string().min(1).max(128).parse(req.params.userId);
    res.json(await handle(async () => dependencies.repository.getUser(await context(req, false), userId)));
  });
  router.get("/user_options", async (req, res) =>
    res.json(await handle(async () => dependencies.repository.listUserOptions(await context(req, false)))),
  );
  router.get("/access_review_campaigns", async (req, res) => {
    const query = securityAccessReviewListQuerySchema.parse(req.query);
    res.json(
      await handle(async () => dependencies.repository.listAccessReviewCampaigns(await context(req, false), query)),
    );
  });
  router.get("/access_review_items", async (req, res) => {
    const query = securityAccessReviewListQuerySchema
      .extend({ campaign_id: z.string().min(1).max(128) })
      .parse(req.query);
    res.json(await handle(async () => dependencies.repository.listAccessReviewItems(await context(req, false), query)));
  });
  router.get("/delegations", async (req, res) => {
    const query = securityDelegationListQuerySchema.parse(req.query);
    res.json(await handle(async () => dependencies.repository.listDelegations(await context(req, false), query)));
  });
  router.get("/impersonations", async (req, res) => {
    const query = securityImpersonationListQuerySchema.parse(req.query);
    res.json(await handle(async () => dependencies.repository.listImpersonations(await context(req, false), query)));
  });

  router.post("/roles", async (req, res) => {
    const body: unknown = req.body;
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = createSecurityRoleRequestSchema.parse(body);
    res
      .status(201)
      .json(await handle(async () => dependencies.repository.createRole(actorContext, input, idempotencyKey(req))));
  });
  router.post("/role_actions", async (req, res) => {
    const body: unknown = req.body;
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = securityRoleActionRequestSchema.parse(body);
    res.json(await handle(async () => dependencies.repository.actOnRole(actorContext, input, idempotencyKey(req))));
  });
  router.post("/assignment_requests", async (req, res) => {
    const body: unknown = req.body;
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = createSecurityAssignmentRequestSchema.parse(body);
    res
      .status(201)
      .json(
        await handle(async () =>
          dependencies.repository.createAssignmentRequest(actorContext, input, idempotencyKey(req)),
        ),
      );
  });
  router.post("/assignment_request_actions", async (req, res) => {
    const body: unknown = req.body;
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = securityAssignmentRequestActionSchema.parse(body);
    res.json(
      await handle(async () =>
        dependencies.repository.actOnAssignmentRequest(actorContext, input, idempotencyKey(req)),
      ),
    );
  });
  router.post("/approval_actions", async (req, res) => {
    const body: unknown = req.body;
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = securityApprovalActionSchema.parse(body);
    const result = await handle(async () =>
      dependencies.repository.decideApproval(actorContext, input, idempotencyKey(req)),
    );
    if (input.resource_type === "user" && input.decision === "approved") {
      await cleanRevokedSessions(actorContext.tenantId, result);
    }
    res.json(result);
  });
  router.post("/user_requests", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = createSecurityUserRequestSchema.parse(req.body);
    res
      .status(201)
      .json(
        await handle(async () => dependencies.repository.createUserRequest(actorContext, input, idempotencyKey(req))),
      );
  });
  router.post("/user_request_actions", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = securityUserRequestActionSchema.parse(req.body);
    res.json(
      await handle(async () => dependencies.repository.actOnUserRequest(actorContext, input, idempotencyKey(req))),
    );
  });
  router.post("/user_emergency_actions", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = securityUserEmergencyActionSchema.parse(req.body);
    const result = await handle(async () =>
      dependencies.repository.actOnUserEmergency(actorContext, input, idempotencyKey(req)),
    );
    await dependencies.sessions.revokeAllForUser(actorContext.tenantId, input.target_user_id);
    res.json(result);
  });
  router.post("/access_review_campaigns", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = createSecurityAccessReviewCampaignSchema.parse(req.body);
    res
      .status(201)
      .json(
        await handle(async () =>
          dependencies.repository.createAccessReviewCampaign(actorContext, input, idempotencyKey(req)),
        ),
      );
  });
  router.post("/access_review_campaign_actions", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = securityAccessReviewCampaignActionSchema.parse(req.body);
    res.json(
      await handle(async () =>
        dependencies.repository.actOnAccessReviewCampaign(actorContext, input, idempotencyKey(req)),
      ),
    );
  });
  router.post("/access_review_decisions", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = securityAccessReviewDecisionSchema.parse(req.body);
    res.json(
      await handle(async () =>
        dependencies.repository.decideAccessReviewItem(actorContext, input, idempotencyKey(req)),
      ),
    );
  });
  router.post("/delegations", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = createSecurityDelegationSchema.parse(req.body);
    res
      .status(201)
      .json(await handle(async () => dependencies.repository.createDelegation(actorContext, input, idempotencyKey(req))));
  });
  router.post("/delegation_actions", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = securityDelegationActionSchema.parse(req.body);
    res.json(await handle(async () => dependencies.repository.actOnDelegation(actorContext, input, idempotencyKey(req))));
  });
  router.post("/impersonations", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const actorContext = await context(req, true);
    const input = createSecurityImpersonationSchema.parse(req.body);
    res
      .status(201)
      .json(await handle(async () => dependencies.repository.createImpersonation(actorContext, input, idempotencyKey(req))));
  });
  router.post("/impersonation_actions", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = securityImpersonationActionSchema.parse(req.body);
    const resolved = await sessionContextForRequest(req, true);
    if (resolved.session.impersonation && (input.action !== "end" || resolved.session.impersonation.requestId !== input.request_id))
      throw new HttpError(403, "IMPERSONATION_RESTRICTED", "Only the current impersonation session can be ended.");
    const actorContext: SecurityActorContext = {
      tenantId: resolved.session.tenantId,
      actor: resolved.actor,
      correlationId: currentRequestContext().correlationId,
    };
    const result = await handle(async () =>
      dependencies.repository.actOnImpersonation(
        actorContext,
        input,
        idempotencyKey(req),
        resolved.session.sessionId,
      ),
    );
    const next = result.projection.new_state as Record<string, unknown>;
    if (input.action === "activate" || input.action === "emergency_activate") {
      if (!dependencies.sessions.startImpersonation) {
        await dependencies.repository.failImpersonationActivation(actorContext, input.request_id, resolved.session.sessionId);
        throw new HttpError(503, "IMPERSONATION_SESSION_UNAVAILABLE", "The impersonation session could not be established.");
      }
      const started = await dependencies.sessions.startImpersonation(resolved.token, {
        requestId: input.request_id,
        requestVersion: Number(next.row_version),
        targetUserId: String(next.target_user_id),
        targetSessionVersion: Number(next.target_session_version),
        expiresAt: new Date(String(next.expires_at)),
      });
      if (!started) {
        await dependencies.repository.failImpersonationActivation(actorContext, input.request_id, resolved.session.sessionId);
        throw new HttpError(503, "IMPERSONATION_SESSION_UNAVAILABLE", "The impersonation session could not be established.");
      }
    } else if (input.action === "end") {
      const activeSessionId = String(next.active_session_id ?? resolved.session.sessionId);
      if (!dependencies.sessions.endImpersonation || !(await dependencies.sessions.endImpersonation(activeSessionId)))
        throw new HttpError(503, "IMPERSONATION_SESSION_UNAVAILABLE", "The impersonation session could not be cleared.");
    }
    res.json(result);
  });
  return router;
}
