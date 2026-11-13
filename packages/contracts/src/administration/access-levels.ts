import { z } from "zod";

/**
 * Per-module access levels chosen by a Super Admin (plan decision D4).
 *
 * - none:  module hidden and every API refused.
 * - view:  read-only.
 * - user:  normal work (create, edit, submit, cancel, maintain).
 * - admin: Module Admin = user + approvals/posting inside that module only.
 *
 * Super Admin is not a level: it is a separate flag that grants everything.
 */
export const accessLevelSchema = z.enum(["none", "view", "user", "admin"]);
export type AccessLevel = z.infer<typeof accessLevelSchema>;

export const accessLevelRank: Readonly<Record<AccessLevel, number>> = {
  none: 0,
  view: 1,
  user: 2,
  admin: 3,
};

/** Tier a permission action belongs to, or "super_admin" when no module level may hold it. */
export type PermissionActionTier = "view" | "user" | "admin" | "super_admin";

/**
 * Every permission action that exists in `security_permission_definition`
 * (inventory: docs/plans/administration-permission-inventory.md) is classified here.
 * An action missing from this table is never granted by a module level, so a new
 * action added by a later migration fails closed until it is classified.
 */
export const permissionActionTiers: Readonly<Record<string, PermissionActionTier>> = {
  // view — read only
  read: "view",
  list: "view",
  export: "view",
  download: "view",
  drilldown: "view",
  audit_read: "view",

  // user — normal work
  create: "user",
  update: "user",
  edit: "user",
  submit: "user",
  cancel: "user",
  request: "user",
  manage: "user",
  delete_draft: "user",
  match: "user",
  finalize: "user",
  reassign: "user",
  adjust: "user",
  attendance: "user",
  change: "user",
  transfer: "user",
  manager_change: "user",
  organization_change: "user",
  work_location_change: "user",
  allocate: "user",

  // admin — Module Admin: approvals, posting and lifecycle decisions in its module
  approve: "admin",
  reject: "admin",
  decide: "admin",
  manager_approve: "admin",
  manager_reject: "admin",
  manager_decide: "admin",
  hr_approve: "admin",
  hr_reject: "admin",
  hr_decide: "admin",
  review: "admin",
  post: "admin",
  reverse: "admin",
  lock: "admin",
  close: "admin",
  reopen: "admin",
  release: "admin",
  confirm: "admin",
  publish: "admin",
  certify: "admin",
  terminate: "admin",
  rehire: "admin",
  recalculate: "admin",
  status: "admin",
  activate: "admin",
  archive: "admin",
  delete: "admin",
  consolidate: "admin",
  configure: "admin",
  admin: "admin",
  adopt: "admin",
  classify: "admin",
  action: "admin",

  // Super Admin only — bypasses segregation of duties or administers access
  self_approve: "super_admin",
  override: "super_admin",
  administer: "super_admin",
  revoke: "super_admin",
  end: "super_admin",
  emergency_activate: "super_admin",
  company_access: "super_admin",
  reset_password: "super_admin",
  revoke_sessions: "super_admin",
};

/**
 * Permission namespaces reserved for Super Admins (plan §Phase 1). No module level
 * may ever produce a key in these namespaces, except the explicit reference reads in
 * `referenceReadPermissionKeys`.
 */
export const superAdminOnlyPermissionModules = ["security", "platform", "administration"] as const;

/**
 * Non-sensitive shared reference reads that business screens need for pickers
 * (organisation units, currencies, fiscal calendars and periods). Granted to any
 * user who holds at least one module at `view` or higher.
 */
export const referenceReadPermissionKeys = [
  "platform.accounting_period.read",
  "platform.currency.read",
  "platform.currency_rate.read",
  "platform.fiscal_calendar.read",
  "platform.localization.read",
  "platform.organization_unit.read",
] as const;

export interface PermissionKeyParts {
  module: string;
  resource: string;
  action: string;
}

/** Splits `module.resource[.sub].action`; the last segment is always the action. */
export function parsePermissionKey(key: string): PermissionKeyParts | null {
  const segments = key.split(".");
  if (segments.length < 3 || segments.some((segment) => !/^[a-z][a-z0-9_]*$/.test(segment))) return null;
  return {
    module: segments[0]!,
    resource: segments.slice(1, -1).join("."),
    action: segments[segments.length - 1]!,
  };
}

export function classifyPermissionAction(action: string): PermissionActionTier | null {
  return Object.prototype.hasOwnProperty.call(permissionActionTiers, action) ? permissionActionTiers[action]! : null;
}

export function isSuperAdminOnlyPermission(key: string): boolean {
  const parts = parsePermissionKey(key);
  if (!parts) return true;
  if ((superAdminOnlyPermissionModules as readonly string[]).includes(parts.module)) return true;
  return classifyPermissionAction(parts.action) === "super_admin";
}

/** True when a permission with this action is included at the given level. */
export function levelIncludesAction(level: AccessLevel, action: string): boolean {
  const tier = classifyPermissionAction(action);
  if (tier === null || tier === "super_admin" || level === "none") return false;
  return accessLevelRank[tier] <= accessLevelRank[level];
}

/**
 * Until the Super Admin role flag exists (plan Phase 2, deferred), a Super Admin is
 * anyone holding this key. Server and UI both decide through `isSuperAdmin`.
 */
export const superAdminPermissionKey = "security.authorization.administer";

export function isSuperAdmin(permissions: Iterable<string>): boolean {
  for (const key of permissions) if (key === superAdminPermissionKey) return true;
  return false;
}
