import { describe, expect, it } from "vitest";

import type { SessionResponse } from "@nexora/contracts";

import { createAdminSeed } from "../../app/features/administration/model/admin-fixtures";
import {
  AdminRuleError,
  applyUserAction,
  createUser,
  dashboardSummary,
  generateTemporaryPassword,
  updateTenant,
  updateUser,
  type AdminState,
} from "../../app/features/administration/model/admin-workflow";
import { isModuleVisible } from "../../app/shell/config/module-access";

const now = "2026-11-12T10:00:00.000Z";
const session = {
  status: "authenticated",
  tenant_id: "tenant-1",
  user: {
    id: "USR-001",
    email: "owner@example.com",
    display_name: "Owner",
    roles: [],
    permissions: ["security.authorization.administer"],
  },
  csrf_token: "x".repeat(43),
  idle_expires_at: now,
  absolute_expires_at: now,
  active_company: { id: "co-1", code: "CO-001", name: "Acme" },
} satisfies SessionResponse;
const actor = { id: "USR-001", name: "Owner" };
const seed = (): AdminState => createAdminSeed(session, now);
const request = {
  display_name: "New Person",
  email: "new.person@example.com",
  username: "new.person",
  employee_id: null,
  credential: { generate: true as const },
  companies: [{ company_id: "co-1", is_default: true }],
  super_admin: false,
  access: { hr: "user" as const, sales: "none" as const },
};

describe("administration workflow", () => {
  it("seeds the signed-in Super Admin", () => {
    const state = seed();
    expect(state.users[0]).toMatchObject({ id: "USR-001", super_admin: true, status: "active" });
  });

  it("creates users with a generated code, forced password change and an audit entry", () => {
    const state = seed();
    const { user, oneTimePassword } = createUser(state, request, actor, now);
    expect(user.id).toMatch(/^USR-\d{3}$/);
    expect(user.must_change_password).toBe(true);
    expect(user.access).toEqual({ hr: "user" });
    expect(oneTimePassword.length).toBeGreaterThanOrEqual(12);
    expect(state.audit[0]).toMatchObject({ action: "user.create", targetId: user.id, before: null });
  });

  it("rejects duplicate emails and usernames", () => {
    const state = seed();
    createUser(state, request, actor, now);
    expect(() => createUser(state, request, actor, now)).toThrow(AdminRuleError);
  });

  it("clears module levels for Super Admins", () => {
    const state = seed();
    const { user } = createUser(state, { ...request, super_admin: true }, actor, now);
    expect(user.access).toEqual({});
  });

  it("refuses to demote, deactivate or resign the last active Super Admin", () => {
    const state = seed();
    expect(() =>
      updateUser(state, "USR-001", { super_admin: false, confirm_self_demotion: true }, 1, actor, now),
    ).toThrow(/at least one active Super Admin/);
    expect(() => applyUserAction(state, "USR-001", { action: "deactivate", reason: "test" }, actor, now)).toThrow(
      /at least one active Super Admin/,
    );
    expect(() =>
      applyUserAction(
        state,
        "USR-001",
        { action: "mark_resigned", end_date: "2026-12-31", reason: "test" },
        actor,
        now,
      ),
    ).toThrow(/at least one active Super Admin/);
  });

  it("requires explicit confirmation to remove your own Super Admin access", () => {
    const state = seed();
    createUser(state, { ...request, super_admin: true }, actor, now);
    expect(() => updateUser(state, "USR-001", { super_admin: false }, 1, actor, now)).toThrow(
      expect.objectContaining({ code: "SELF_DEMOTION_NOT_CONFIRMED" }),
    );
    const updated = updateUser(state, "USR-001", { super_admin: false, confirm_self_demotion: true }, 1, actor, now);
    expect(updated.super_admin).toBe(false);
    expect(state.audit[0]).toMatchObject({
      action: "user.update",
      before: { super_admin: true },
      after: { super_admin: false },
    });
  });

  it("detects concurrent edits", () => {
    const state = seed();
    expect(() => updateUser(state, "USR-901", { display_name: "Changed" }, 99, actor, now)).toThrow(
      expect.objectContaining({ code: "VERSION_CONFLICT" }),
    );
  });

  it("resets passwords, deactivates and reactivates with audit", () => {
    const state = seed();
    const reset = applyUserAction(
      state,
      "USR-902",
      { action: "reset_password", credential: { generate: true } },
      actor,
      now,
    );
    expect(reset.oneTimePassword).toBeTruthy();
    expect(reset.user.must_change_password).toBe(true);
    applyUserAction(state, "USR-902", { action: "deactivate", reason: "Left team" }, actor, now);
    expect(state.users.find((user) => user.id === "USR-902")?.status).toBe("inactive");
    applyUserAction(state, "USR-902", { action: "reactivate" }, actor, now);
    expect(state.users.find((user) => user.id === "USR-902")?.status).toBe("active");
    expect(state.audit.map((entry) => entry.action)).toEqual([
      "user.reactivate",
      "user.deactivate",
      "user.reset_password",
    ]);
  });

  it("refuses a financial-year change while the calendar has postings", () => {
    const state = seed();
    expect(() => updateTenant(state, { financial_year_start_month: 1 }, 1, actor, now, true)).toThrow(
      expect.objectContaining({ code: "FINANCIAL_YEAR_LOCKED" }),
    );
    expect(
      updateTenant(state, { financial_year_start_month: 1 }, 1, actor, now, false).financial_year_start_month,
    ).toBe(1);
  });

  it("summarises users and module levels for the dashboard", () => {
    const summary = dashboardSummary(seed(), now);
    expect(summary.users).toMatchObject({ total: 4, active: 3, inactive: 1, pending_first_login: 1 });
    expect(summary.modules.find((entry) => entry.module_id === "hr")).toMatchObject({ admin: 1 });
    // Inactive users are not counted against module levels.
    expect(summary.modules.find((entry) => entry.module_id === "purchases")).toMatchObject({ user: 0 });
  });

  it("generates temporary passwords that pass the server minimum", () => {
    const password = generateTemporaryPassword();
    expect(password.length).toBeGreaterThanOrEqual(12);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
  });
});

describe("navigation visibility", () => {
  it("does not filter when no permission list is supplied", () => {
    expect(isModuleVisible("administration", undefined)).toBe(true);
  });

  it("shows every module to a Super Admin", () => {
    const permissions = new Set(["security.authorization.administer"]);
    expect(isModuleVisible("administration", permissions)).toBe(true);
    expect(isModuleVisible("hr", permissions)).toBe(true);
  });

  it("shows live modules only when the user holds one of their permissions", () => {
    const permissions = new Set(["hr.employee.read"]);
    expect(isModuleVisible("hr", permissions)).toBe(true);
    expect(isModuleVisible("banking", permissions)).toBe(false);
    expect(isModuleVisible("finance", permissions)).toBe(false);
    expect(isModuleVisible("finance", new Set(["master_data.project.read"]))).toBe(true);
  });

  it("hides Administration from everyone except Super Admins and keeps the dashboard", () => {
    const permissions = new Set(["hr.employee.read", "security.user_account.read"]);
    expect(isModuleVisible("administration", permissions)).toBe(false);
    expect(isModuleVisible("dashboard", permissions)).toBe(true);
  });

  it("keeps mock modules visible until module access records exist", () => {
    expect(isModuleVisible("sales", new Set(["hr.employee.read"]))).toBe(true);
  });
});
