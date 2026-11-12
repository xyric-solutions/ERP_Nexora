import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { createActiveCompanyGuard } from "../../server/api/src/modules/auth/tenant-router.js";

const token = "t".repeat(64);

function request(path: string, input: { query?: Record<string, unknown>; body?: unknown; cookie?: boolean }) {
  return {
    path,
    query: input.query ?? {},
    body: input.body,
    get: (name: string) => (name.toLowerCase() === "cookie" && input.cookie !== false ? `nexora_session=${token}` : undefined),
  } as unknown as Request;
}

async function run(activeCompanyId: string | null, req: Request) {
  const guard = createActiveCompanyGuard({
    get: async () =>
      ({
        sessionId: "s",
        tenantId: "tenant-a",
        userId: "user-a",
        sessionVersion: 1,
        csrfToken: "c".repeat(43),
        idleExpiresAt: new Date(),
        absoluteExpiresAt: new Date(),
        activeCompanyId,
      }) as Awaited<ReturnType<Parameters<typeof createActiveCompanyGuard>[0]["get"]>>,
  });
  let passed: unknown = "not called";
  await guard(req, {} as Response, ((error?: unknown) => {
    passed = error;
  }) as NextFunction);
  return passed;
}

describe("active company guard", () => {
  it("allows requests for the chosen company and rejects any other company", async () => {
    expect(await run("company-1", request("/api/v1/hr/attendance", { query: { company_id: "company-1" } }))).toBeUndefined();
    const denied = await run("company-1", request("/api/v1/hr/attendance", { query: { company_id: "company-2" } }));
    expect(denied).toMatchObject({ status: 403, code: "COMPANY_SCOPE_MISMATCH" });
    const body = await run("company-1", request("/api/v1/banking/payments", { body: { company_id: "company-2" } }));
    expect(body).toMatchObject({ status: 403, code: "COMPANY_SCOPE_MISMATCH" });
  });

  it("leaves requests without a company, security administration and unchosen sessions to the modules", async () => {
    expect(await run("company-1", request("/api/v1/hr/companies", {}))).toBeUndefined();
    expect(
      await run("company-1", request("/api/v1/security/users", { body: { company_id: "company-2" } })),
    ).toBeUndefined();
    expect(await run(null, request("/api/v1/hr/attendance", { query: { company_id: "company-2" } }))).toBeUndefined();
  });
});
