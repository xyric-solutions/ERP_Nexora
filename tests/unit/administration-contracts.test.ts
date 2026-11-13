import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  administrationModuleCatalogue,
  adminUserActionSchema,
  classifyPermissionAction,
  createAdminUserRequestSchema,
  deriveModuleAccessLevel,
  expandModuleAccessToPermissionKeys,
  findAdministrationModule,
  isSuperAdminOnlyPermission,
  parsePermissionKey,
  referenceReadPermissionKeys,
  registerOrganisationRequestSchema,
  updateAdminUserRequestSchema,
  updateTenantProfileRequestSchema,
  type ModuleAccessMap,
} from "../../packages/contracts/src/administration/index.js";
import { prototypeModules } from "../../app/shell/config/prototype-data";

const inventory = readFileSync(
  fileURLToPath(new URL("../../docs/plans/administration-permission-inventory.md", import.meta.url)),
  "utf8",
);
const permissionKeys = (inventory.split("## All keys")[1] ?? "")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(line));

const actionOf = (key: string) => parsePermissionKey(key)!.action;

describe("administration permission inventory", () => {
  it("is loaded from the Phase 0 inventory document", () => {
    expect(permissionKeys.length).toBeGreaterThan(300);
  });

  it("classifies every action that exists today", () => {
    const unclassified = [...new Set(permissionKeys.map(actionOf))].filter(
      (action) => classifyPermissionAction(action) === null,
    );
    expect(unclassified).toEqual([]);
  });

  it("fails closed for an unknown action", () => {
    expect(classifyPermissionAction("nuke")).toBeNull();
    expect(expandModuleAccessToPermissionKeys({ hr: "admin" }, ["hr.employee.nuke"])).toEqual([]);
  });
});

describe("module catalogue", () => {
  it("matches the grantable modules in prototype-data", () => {
    const grantable = prototypeModules
      .map((module) => module.id)
      .filter((id) => id !== "dashboard" && id !== "administration")
      .sort();
    expect(administrationModuleCatalogue.map((module) => module.id).sort()).toEqual(grantable);
  });

  it("only marks modules live when they own server permissions", () => {
    for (const entry of administrationModuleCatalogue) {
      const owned = permissionKeys.filter((key) =>
        (entry.permissionPrefixes as readonly string[]).some((prefix) => key.startsWith(prefix)),
      );
      expect(owned.length > 0, entry.id).toBe(entry.live);
    }
  });

  it("labels finance as Accounting (D10)", () => {
    expect(findAdministrationModule("finance")?.label).toBe("Accounting");
  });
});

describe("access level expansion", () => {
  const hr = (level: ModuleAccessMap["hr"]) =>
    expandModuleAccessToPermissionKeys({ hr: level }, permissionKeys).filter((key) => key.startsWith("hr."));

  it("view grants only read-tier actions", () => {
    const keys = hr("view");
    expect(keys).toContain("hr.employee.read");
    expect(keys.map(actionOf).every((action) => classifyPermissionAction(action) === "view")).toBe(true);
  });

  it("user adds normal work but no approvals or posting", () => {
    const keys = hr("user");
    expect(keys).toEqual(expect.arrayContaining(["hr.employee.read", "hr.employee.create", "hr.employee.submit"]));
    expect(keys).not.toContain("hr.employee.approve");
    expect(keys).not.toContain("hr.payroll.payslip.release");
  });

  it("admin adds approvals plus the module's shared approval keys", () => {
    const keys = expandModuleAccessToPermissionKeys({ hr: "admin" }, permissionKeys);
    expect(keys).toEqual(
      expect.arrayContaining(["hr.employee.approve", "hr.leave.request.hr_approve", "workflow.approval.approve"]),
    );
  });

  it("levels are strictly cumulative", () => {
    const view = new Set(hr("view"));
    const user = new Set(hr("user"));
    const admin = new Set(hr("admin"));
    expect([...view].every((key) => user.has(key))).toBe(true);
    expect([...user].every((key) => admin.has(key))).toBe(true);
    expect(admin.size).toBeGreaterThan(user.size);
    expect(user.size).toBeGreaterThan(view.size);
  });

  it("never grants keys of another module", () => {
    const keys = expandModuleAccessToPermissionKeys({ banking: "admin" }, permissionKeys);
    expect(keys.filter((key) => !key.startsWith("banking.") && !key.startsWith("platform."))).toEqual([]);
  });

  it("grants reference reads only when some module is assigned", () => {
    expect(expandModuleAccessToPermissionKeys({}, permissionKeys)).toEqual([]);
    expect(expandModuleAccessToPermissionKeys({ hr: "none" }, permissionKeys)).toEqual([]);
    expect(expandModuleAccessToPermissionKeys({ sales: "view" }, permissionKeys)).toEqual(
      [...referenceReadPermissionKeys].sort(),
    );
  });
});

describe("Super Admin only permissions never leak into a module preset", () => {
  const everything: ModuleAccessMap = Object.fromEntries(
    administrationModuleCatalogue.map((module) => [module.id, "admin"]),
  );
  const granted = expandModuleAccessToPermissionKeys(everything, permissionKeys);

  it("contains no security.* or administration.* keys", () => {
    expect(granted.filter((key) => key.startsWith("security.") || key.startsWith("administration."))).toEqual([]);
  });

  it("contains only the allow-listed platform reference reads", () => {
    expect(granted.filter((key) => key.startsWith("platform."))).toEqual(
      [...referenceReadPermissionKeys].filter((key) => permissionKeys.includes(key)).sort(),
    );
  });

  it("contains no self-approval or override keys", () => {
    expect(granted.filter((key) => isSuperAdminOnlyPermission(key) && !key.startsWith("platform."))).toEqual([]);
    expect(granted).not.toContain("finance.journal.self_approve");
    expect(granted).not.toContain("procurement.document.self_approve");
  });
});

describe("derived access level", () => {
  const banking = findAdministrationModule("banking")!;

  it("recognises each preset", () => {
    for (const level of ["none", "view", "user", "admin"] as const) {
      const held = expandModuleAccessToPermissionKeys({ banking: level }, permissionKeys);
      expect(deriveModuleAccessLevel(banking, held, permissionKeys)).toBe(level);
    }
  });

  it("reports custom for a non-preset combination", () => {
    expect(deriveModuleAccessLevel(banking, ["banking.payment.read", "banking.payment.approve"], permissionKeys)).toBe(
      "custom",
    );
  });
});

describe("request schemas", () => {
  const baseUser = {
    display_name: "Ayesha Khan",
    email: "ayesha@example.com",
    username: "ayesha.khan",
    companies: [{ company_id: "co-1", is_default: true }],
  };

  it("accepts a generated or entered initial password", () => {
    expect(createAdminUserRequestSchema.safeParse({ ...baseUser, credential: { generate: true } }).success).toBe(true);
    expect(
      createAdminUserRequestSchema.safeParse({ ...baseUser, credential: { password: "Temp-Pass-123" } }).success,
    ).toBe(true);
  });

  it("rejects unknown modules and levels", () => {
    expect(
      createAdminUserRequestSchema.safeParse({ ...baseUser, credential: { generate: true }, access: { nope: "view" } })
        .success,
    ).toBe(false);
    expect(
      createAdminUserRequestSchema.safeParse({ ...baseUser, credential: { generate: true }, access: { hr: "owner" } })
        .success,
    ).toBe(false);
  });

  it("requires at least one changed field on update", () => {
    expect(updateAdminUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAdminUserRequestSchema.safeParse({ confirm_self_demotion: true }).success).toBe(false);
    expect(updateAdminUserRequestSchema.safeParse({ super_admin: false, confirm_self_demotion: true }).success).toBe(
      true,
    );
    expect(updateTenantProfileRequestSchema.safeParse({}).success).toBe(false);
  });

  it("validates user actions", () => {
    expect(adminUserActionSchema.safeParse({ action: "reset_password" }).success).toBe(true);
    expect(adminUserActionSchema.safeParse({ action: "deactivate" }).success).toBe(false);
    expect(
      adminUserActionSchema.safeParse({ action: "mark_resigned", end_date: "2026-12-31", reason: "Resigned" }).success,
    ).toBe(true);
  });

  it("requires matching registration passwords", () => {
    const registration = {
      organisation_type: "private_limited",
      organisation_name: "Acme Traders",
      country_code: "PK",
      financial_year_start_month: 7,
      admin_full_name: "Owner",
      admin_email: "owner@example.com",
      admin_password: "Str0ng-Password",
      admin_password_confirmation: "Str0ng-Password",
    };
    expect(registerOrganisationRequestSchema.safeParse(registration).success).toBe(true);
    expect(
      registerOrganisationRequestSchema.safeParse({ ...registration, admin_password_confirmation: "other-password" })
        .success,
    ).toBe(false);
    expect(
      registerOrganisationRequestSchema.safeParse({ ...registration, financial_year_start_month: 13 }).success,
    ).toBe(false);
  });
});
