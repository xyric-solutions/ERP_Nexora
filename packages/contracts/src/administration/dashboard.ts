import { z } from "zod";

import { administrationModuleIdSchema } from "./module-catalogue.js";

const count = z.number().int().nonnegative();

export const adminDashboardSummarySchema = z.strictObject({
  users: z.strictObject({
    total: count,
    active: count,
    inactive: count,
    locked: count,
    resigned: count,
    pending_first_login: count,
  }),
  super_admins: z
    .strictObject({
      id: z.string().min(1).max(128),
      display_name: z.string().max(200),
      email: z.string().max(320),
      status: z.enum(["active", "inactive", "locked", "resigned"]),
    })
    .array(),
  modules: z
    .strictObject({
      module_id: administrationModuleIdSchema,
      label: z.string().max(200),
      live: z.boolean(),
      view: count,
      user: count,
      admin: count,
      custom: count,
    })
    .array(),
  generated_at: z.iso.datetime({ offset: true }),
});
export type AdminDashboardSummary = z.infer<typeof adminDashboardSummarySchema>;

export const adminModuleCatalogueResponseSchema = z.strictObject({
  modules: z
    .strictObject({
      id: administrationModuleIdSchema,
      label: z.string().max(200),
      live: z.boolean(),
    })
    .array(),
  levels: z
    .strictObject({
      level: z.enum(["view", "user", "admin"]),
      label: z.string().max(80),
      description: z.string().max(500),
    })
    .array(),
});
export type AdminModuleCatalogueResponse = z.infer<typeof adminModuleCatalogueResponseSchema>;

export const accessLevelDescriptions = [
  { level: "view", label: "View", description: "Read-only access to the module's records and reports." },
  {
    level: "user",
    label: "User",
    description: "Normal work: create, edit, submit and cancel records. Cannot approve or post.",
  },
  {
    level: "admin",
    label: "Admin",
    description:
      "Module Admin: everything a User can do plus approvals, posting and approval details in this module only. Cannot manage users or access.",
  },
] as const;
