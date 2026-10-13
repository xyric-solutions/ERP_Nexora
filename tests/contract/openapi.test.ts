import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";

describe("OpenAPI contract", () => {
  it("matches the committed snapshot and versioned paths", async () => {
    const generated = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
    expect(await readFile(new URL("../../openapi-v1.json", import.meta.url), "utf8")).toBe(generated);
    expect(Object.keys(buildOpenApiDocument().paths)).toEqual([
      "/auth/login",
      "/auth/session",
      "/auth/change-initial-password",
      "/auth/select-tenant",
      "/auth/cancel-tenant-selection",
      "/auth/session/rotate",
      "/auth/logout",
      "/auth/logout-all",
      "/security/permissions",
      "/security/capabilities",
      "/security/roles",
      "/security/role_actions",
      "/security/assignments",
      "/security/assignment_requests",
      "/security/assignment_request_actions",
      "/security/approvals",
      "/security/approval_actions",
      "/security/audit_events",
      "/security/users",
      "/security/users/{userId}",
      "/security/user_options",
      "/security/user_requests",
      "/security/user_request_actions",
      "/security/user_emergency_actions",
      "/health/live",
      "/health/ready",
      "/jobs/sample",
    ]);
  });
});
