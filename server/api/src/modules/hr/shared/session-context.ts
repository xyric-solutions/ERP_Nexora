import type { Request } from "express";

import { HttpError } from "../../../http/errors.js";
import { readSessionCookie } from "../../auth/cookies.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../auth/tenant-router.js";
import type { HrActorContext } from "../source-repository.js";

export interface HrSessionContextDependencies {
  authentication: TenantAuthApiService;
  sessions: TenantSessionApiService;
  secureCookies: boolean;
}

export async function loadHrSessionContext(
  req: Request,
  dependencies: HrSessionContextDependencies,
  mutation = false,
): Promise<HrActorContext> {
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
  if (tenantHeader && tenantHeader !== session.tenantId)
    throw new HttpError(403, "TENANT_ACCESS_DENIED", "The tenant boundary was rejected.");
  if (mutation && session.impersonation)
    throw new HttpError(
      403,
      "IMPERSONATION_RESTRICTED",
      "Mutating HR operations are disabled during impersonation.",
    );
  const actorId = session.impersonation?.targetUserId ?? session.userId;
  const actor = await dependencies.authentication.loadAuthenticatedAccount(session.tenantId, actorId);
  if (!actor) throw new HttpError(401, "INVALID_SESSION", "The session is missing or no longer valid.");
  return {
    tenantId: session.tenantId,
    actor,
    ...(session.impersonation
      ? { realActorId: session.userId, impersonationRequestId: session.impersonation.requestId }
      : {}),
  };
}
