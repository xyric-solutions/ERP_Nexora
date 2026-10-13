import { PassThrough } from "node:stream";

import { expect, it, vi } from "vitest";
import request from "supertest";

import { createApp } from "../../apps/api/src/app.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { evaluatePolicy, type PolicySnapshot } from "../../packages/auth/src/index.js";

it("serves the in-process liveness endpoint within the foundation budget", async () => {
  const app = createApp({
    config: { allowedOrigins: new Set() },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    jobPublisher: { publishSample: vi.fn(async () => undefined) },
  });
  const started = performance.now();
  for (let count = 0; count < 25; count += 1) expect((await request(app).get("/api/v1/health/live")).status).toBe(200);
  expect(performance.now() - started).toBeLessThan(2_500);
});

it("evaluates a representative authorization matrix within a regression budget", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");
  const userId = "40000000-0000-4000-8000-000000000001";
  const companyId = "40000000-0000-4000-8000-000000000002";
  const snapshot: PolicySnapshot = {
    userId,
    userActive: true,
    assignments: Array.from({ length: 20 }, (_, index) => ({
      assignmentId: `40000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      roleId: `40000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`,
      status: "active" as const,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: null,
      scopeGrants: [{ scopeId: companyId, includeDescendants: true }],
      permissionGrants: Array.from({ length: 20 }, (_permission, permissionIndex) => ({
        permissionKey: `hr.resource_${permissionIndex}.read`,
        requiredAssurance: "password" as const,
        fieldBearing: true,
        stateContextRequired: false,
        allowedSourceStates: [],
        allowedFields: ["code", "displayName"],
      })),
    })),
    assignmentConflicts: [],
    transactionConflicts: [],
  };
  const request = {
    permissionKey: "hr.resource_19.read",
    targetScope: {
      scopeId: "40000000-0000-4000-8000-000000000003",
      scopeType: "branch" as const,
      status: "active" as const,
      enterpriseScopeId: "40000000-0000-4000-8000-000000000004",
      companyScopeId: companyId,
      ancestorScopeIds: ["40000000-0000-4000-8000-000000000004", companyId],
    },
    requestedFields: ["displayName"],
    evaluatedAt: now,
  };

  const started = performance.now();
  for (let count = 0; count < 1_000; count += 1) {
    expect(evaluatePolicy({ userId, assuranceLevel: "mfa" }, snapshot, request).allowed).toBe(true);
  }
  expect(performance.now() - started).toBeLessThan(1_000);
});
