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
      "/hr/employees",
      "/hr/companies",
      "/hr/employees/{employeeId}",
      "/hr/employee_drafts",
      "/hr/employee_drafts/{employeeId}",
      "/hr/employee_drafts/{employeeId}/submit",
      "/hr/employee_draft_approvals",
      "/hr/employee_draft_approvals/{employeeId}",
      "/hr/employee_drafts/{employeeId}/approval_decision",
      "/hr/employees/{employeeId}/profile_draft_assignment",
      "/hr/employees/{employeeId}/contacts",
      "/hr/employees/{employeeId}/emergency_contacts",
      "/hr/employees/{employeeId}/documents",
      "/hr/employees/{employeeId}/assignments",
      "/hr/employees/{employeeId}/status_history",
      "/hr/masters",
      "/hr/jobs",
      "/hr/employees/{employeeId}/hire_requests",
      "/hr/employees/{employeeId}/hire_requests/{requestId}/decision",
      "/hr/employment_lifecycle_policies",
      "/hr/employment_lifecycle_policies/{policyId}/submit",
      "/hr/employment_lifecycle_policies/{policyId}/approval_decision",
      "/hr/employment_lifecycle_policies/{policyId}/activate",
      "/health/live",
      "/health/ready",
      "/jobs/sample",
    ]);
  });
});
