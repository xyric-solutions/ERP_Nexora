import { findAdministrationModule, isSuperAdmin, permissionBelongsToModule } from "@nexora/contracts";

/**
 * Navigation visibility from the signed-in user's permissions (Administration plan D7).
 *
 * This only hides menu entries and pages; every API still enforces its own
 * permissions on the server.
 *
 * - No permission list (`undefined`): no filtering. Used by isolated renders/tests.
 * - Super Admin: every module.
 * - Dashboard: every signed-in user.
 * - Administration: Super Admin only.
 * - Live catalogue modules: visible when the user holds any permission of that module.
 * - Mock modules (no server permissions yet): visible to everyone until per-user
 *   module access records exist (deferred with the plan's Phase 2 migrations).
 */
export function isModuleVisible(moduleId: string, permissions: ReadonlySet<string> | undefined): boolean {
  if (!permissions) return true;
  if (isSuperAdmin(permissions)) return true;
  if (moduleId === "dashboard") return true;
  if (moduleId === "administration") return false;
  const entry = findAdministrationModule(moduleId);
  if (!entry || !entry.live) return true;
  for (const key of permissions) {
    if (permissionBelongsToModule(entry, key) || entry.sharedAdminKeys?.includes(key)) return true;
  }
  return false;
}
