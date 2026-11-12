import { z } from "zod";

import {
  type AccessLevel,
  accessLevelSchema,
  isSuperAdminOnlyPermission,
  levelIncludesAction,
  parsePermissionKey,
  referenceReadPermissionKeys,
} from "./access-levels.js";

/**
 * Single source for the access matrix, the navigation filter and the server
 * grant presets (plan Phase 1). `id` is the UI module id in
 * `app/shell/config/prototype-data.ts`; a unit test keeps the two in step.
 *
 * `permissionPrefixes` are `module.` or `module.resource.` prefixes of
 * `security_permission_definition.permission_key`. `sharedAdminKeys` are exact
 * cross-module keys a Module Admin of this module needs (for example the payroll
 * workflow approval keys). Modules with `live: false` are still mock screens:
 * they have no server permissions yet, so their access level only controls
 * navigation visibility.
 *
 * Dashboard is visible to every signed-in user and Administration is reserved for
 * Super Admins, so neither appears in this catalogue.
 */
export interface AdministrationModuleDefinition {
  id: string;
  label: string;
  permissionPrefixes: readonly string[];
  sharedAdminKeys?: readonly string[];
  live: boolean;
}

export const administrationModuleCatalogue = [
  { id: "banking", label: "Banking & Treasury", permissionPrefixes: ["banking."], live: true },
  { id: "sales", label: "Sales & Billing", permissionPrefixes: [], live: false },
  { id: "purchases", label: "Purchases", permissionPrefixes: ["procurement."], live: true },
  { id: "inventory", label: "Inventory", permissionPrefixes: ["inventory."], live: true },
  { id: "costing", label: "Costing & Landed Cost", permissionPrefixes: [], live: false },
  {
    id: "finance",
    label: "Accounting",
    permissionPrefixes: ["finance.", "master_data."],
    live: true,
  },
  { id: "tax", label: "Taxation & Compliance", permissionPrefixes: [], live: false },
  { id: "operations", label: "Operations", permissionPrefixes: [], live: false },
  { id: "fleet", label: "Fleet Management", permissionPrefixes: [], live: false },
  { id: "manufacturing", label: "Production / Manufacturing", permissionPrefixes: [], live: false },
  { id: "quality", label: "Quality Management", permissionPrefixes: [], live: false },
  { id: "crm", label: "CRM", permissionPrefixes: [], live: false },
  { id: "projects", label: "Projects & Professional Services", permissionPrefixes: [], live: false },
  { id: "resources", label: "Resource Management & Utilisation", permissionPrefixes: [], live: false },
  { id: "support", label: "Helpdesk / Support / AMC", permissionPrefixes: [], live: false },
  {
    id: "hr",
    label: "HR & Payroll",
    permissionPrefixes: ["hr."],
    sharedAdminKeys: ["workflow.approval.approve", "workflow.approval.reject"],
    live: true,
  },
  { id: "assets", label: "Fixed Assets & Leases", permissionPrefixes: [], live: false },
  { id: "expenses", label: "Expense Management", permissionPrefixes: [], live: false },
  { id: "documents", label: "Document Management", permissionPrefixes: [], live: false },
  { id: "budget", label: "Budget & Planning", permissionPrefixes: [], live: false },
  { id: "reports", label: "Reports & Analytics", permissionPrefixes: [], live: false },
  { id: "portals", label: "Portals", permissionPrefixes: [], live: false },
  { id: "configuration", label: "System Configuration & Extensibility", permissionPrefixes: [], live: false },
  { id: "approvals", label: "Workflow / Approvals / SoD", permissionPrefixes: [], live: false },
  { id: "notifications", label: "Notifications", permissionPrefixes: [], live: false },
  { id: "integrations", label: "Integrations", permissionPrefixes: [], live: false },
  { id: "ai", label: "AI Assistant", permissionPrefixes: [], live: false },
  { id: "audit", label: "Audit & Compliance", permissionPrefixes: [], live: false },
  { id: "migration", label: "Data Migration & Cutover", permissionPrefixes: [], live: false },
  { id: "mobile", label: "Mobile", permissionPrefixes: [], live: false },
] as const satisfies readonly AdministrationModuleDefinition[];

export type AdministrationModuleId = (typeof administrationModuleCatalogue)[number]["id"];

export const administrationModuleIds = administrationModuleCatalogue.map((module) => module.id) as unknown as readonly [
  AdministrationModuleId,
  ...AdministrationModuleId[],
];

export const administrationModuleIdSchema = z.enum(administrationModuleIds);

/** Module access chosen by a Super Admin. Omitted modules mean `none`. */
export const moduleAccessMapSchema = z.partialRecord(administrationModuleIdSchema, accessLevelSchema);
export type ModuleAccessMap = z.infer<typeof moduleAccessMapSchema>;

export function findAdministrationModule(id: string): AdministrationModuleDefinition | undefined {
  return (administrationModuleCatalogue as readonly AdministrationModuleDefinition[]).find(
    (module) => module.id === id,
  );
}

/** True when the permission key belongs to the catalogue module (by prefix). */
export function permissionBelongsToModule(module: AdministrationModuleDefinition, key: string): boolean {
  return module.permissionPrefixes.some((prefix) => key.startsWith(prefix));
}

/**
 * Turns a module access map into the exact permission keys to grant, using the
 * permission keys that actually exist (`security_permission_definition`).
 * Never returns a Super-Admin-only key other than the shared reference reads.
 */
export function expandModuleAccessToPermissionKeys(
  access: ModuleAccessMap,
  availablePermissionKeys: readonly string[],
): string[] {
  const granted = new Set<string>();
  const available = new Set(availablePermissionKeys);
  let anyModuleAccess = false;

  for (const entry of administrationModuleCatalogue as readonly AdministrationModuleDefinition[]) {
    const level: AccessLevel = access[entry.id as AdministrationModuleId] ?? "none";
    if (level === "none") continue;
    anyModuleAccess = true;

    for (const key of availablePermissionKeys) {
      if (!permissionBelongsToModule(entry, key) || isSuperAdminOnlyPermission(key)) continue;
      const parts = parsePermissionKey(key);
      if (parts && levelIncludesAction(level, parts.action)) granted.add(key);
    }
    if (level === "admin") {
      for (const key of entry.sharedAdminKeys ?? []) {
        if (available.has(key) && !isSuperAdminOnlyPermission(key)) granted.add(key);
      }
    }
  }

  if (anyModuleAccess) {
    for (const key of referenceReadPermissionKeys) if (available.has(key)) granted.add(key);
  }
  return [...granted].sort();
}

/**
 * Derives the level a user effectively holds for a module from their current
 * permission keys. Returns `custom` when the keys match no preset exactly (for
 * example users created before the Administration module existed).
 */
export function deriveModuleAccessLevel(
  module: AdministrationModuleDefinition,
  heldPermissionKeys: readonly string[],
  availablePermissionKeys: readonly string[],
): AccessLevel | "custom" {
  if (!module.live) return "custom";
  const held = new Set(
    heldPermissionKeys.filter((key) => permissionBelongsToModule(module, key) || module.sharedAdminKeys?.includes(key)),
  );
  for (const level of ["admin", "user", "view", "none"] as const) {
    const expected = expandModuleAccessToPermissionKeys({ [module.id]: level }, availablePermissionKeys).filter(
      (key) => permissionBelongsToModule(module, key) || module.sharedAdminKeys?.includes(key),
    );
    if (expected.length === held.size && expected.every((key) => held.has(key))) return level;
  }
  return "custom";
}
