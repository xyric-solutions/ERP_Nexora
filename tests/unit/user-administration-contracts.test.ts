import { describe, expect, it } from "vitest";

import {
  changeInitialPasswordRequestSchema,
  createSecurityUserRequestSchema,
  passwordLoginResponseSchema,
  securityApprovalActionSchema,
  securityUserAdministrationResultSchema,
  securityUserEmergencyActionSchema,
} from "../../packages/contracts/src/index.js";

describe("governed user administration contracts", () => {
  it("requires exactly one default company and rejects browser-supplied tenant authority", () => {
    const valid = {
      requested_action: "create",
      proposal: {
        display_name: "UAT Target",
        username: "uat.target",
        email: "uat.target@uat.nexora.invalid",
        employee_id: null,
        companies: [{ company_id: "company-a", is_default: true }],
        initial_role_policy_ids: [],
      },
    };
    expect(createSecurityUserRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      createSecurityUserRequestSchema.safeParse({
        ...valid,
        tenant_id: "browser-controlled-tenant",
      }).success,
    ).toBe(false);
    expect(
      createSecurityUserRequestSchema.safeParse({
        ...valid,
        proposal: {
          ...valid.proposal,
          companies: [
            { company_id: "company-a", is_default: true },
            { company_id: "company-b", is_default: true },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("allows user approval and constrains emergency actions", () => {
    expect(
      securityApprovalActionSchema.safeParse({
        resource_type: "user",
        request_id: "request-1",
        decision: "approved",
        reason: null,
        expected_version: 1,
      }).success,
    ).toBe(true);
    expect(
      securityUserEmergencyActionSchema.safeParse({
        action: "lock",
        target_user_id: "target-1",
        expected_user_version: 2,
        reason: "Confirmed account compromise",
        tenant_id: "not-accepted",
      }).success,
    ).toBe(false);
  });

  it("models reset-required login without issuing a session", () => {
    const ticket = "t".repeat(43);
    expect(
      passwordLoginResponseSchema.parse({
        status: "password_change_required",
        ticket,
        expires_at: "2026-10-12T12:00:00.000Z",
      }),
    ).toMatchObject({ status: "password_change_required", ticket });
    expect(
      changeInitialPasswordRequestSchema.safeParse({
        ticket,
        new_password: "Admin.12",
      }).success,
    ).toBe(true);
    expect(changeInitialPasswordRequestSchema.safeParse({ ticket, new_password: "1234567" }).success).toBe(false);
  });

  it("permits one-time credential delivery only on a non-replayed response", () => {
    const base = {
      command_id: "command-1",
      operation: "security.user_account.approve",
      outcome: "completed",
      entity_type: "user_account",
      entity_id: "user-1",
      projection: {},
      audit_event_id: "audit-1",
    };
    expect(
      securityUserAdministrationResultSchema.safeParse({
        ...base,
        replayed: false,
        credential_delivery_available: true,
        credential_delivery: { one_time_password: "one-time-password-123" },
      }).success,
    ).toBe(true);
    expect(
      securityUserAdministrationResultSchema.safeParse({
        ...base,
        replayed: true,
        credential_delivery_available: true,
        credential_delivery: { one_time_password: "one-time-password-123" },
      }).success,
    ).toBe(false);
    expect(
      securityUserAdministrationResultSchema.safeParse({
        ...base,
        replayed: true,
        credential_delivery_available: false,
        credential_delivery: { one_time_password: "must-not-reappear" },
      }).success,
    ).toBe(false);
  });
});
