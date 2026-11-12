import {
  accessLevelSchema,
  administrationModuleCatalogue,
  type AccessLevel,
  type AdminDashboardSummary,
  type AdminUser,
  type AdminUserAction,
  type CreateAdminUserRequest,
  type ModuleAccessMap,
  type TenantProfile,
  type UpdateAdminUserRequest,
  type UpdateTenantProfileRequest,
} from "@nexora/contracts";

/**
 * Administration rules for the prototype adapter. They mirror the rules the
 * `/api/v1/admin` service enforces on the server (plan §2 D1–D3 and safety rules);
 * the UI never replaces that server check.
 */

export interface AdminAuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  targetName: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AdminState {
  tenant: TenantProfile;
  companies: { id: string; code: string; name: string }[];
  users: AdminUser[];
  audit: AdminAuditEntry[];
}

export interface AdminActor {
  id: string;
  name: string;
}

export class AdminRuleError extends Error {
  constructor(
    readonly code:
      | "LAST_SUPER_ADMIN"
      | "SELF_DEMOTION_NOT_CONFIRMED"
      | "DUPLICATE_EMAIL"
      | "DUPLICATE_USERNAME"
      | "USER_NOT_FOUND"
      | "VERSION_CONFLICT"
      | "FINANCIAL_YEAR_LOCKED",
    message: string,
  ) {
    super(message);
    this.name = "AdminRuleError";
  }
}

const isActive = (user: AdminUser) => user.status === "active";

export function activeSuperAdmins(users: readonly AdminUser[]): AdminUser[] {
  return users.filter((user) => user.super_admin && isActive(user));
}

/** True when `userId` is the only active Super Admin left. */
export function isLastActiveSuperAdmin(users: readonly AdminUser[], userId: string): boolean {
  const remaining = activeSuperAdmins(users);
  return remaining.length === 1 && remaining[0]!.id === userId;
}

/** Super Admins hold everything, so their stored per-module levels are cleared. */
export function normaliseAccess(access: ModuleAccessMap, superAdmin: boolean): ModuleAccessMap {
  if (superAdmin) return {};
  const result: ModuleAccessMap = {};
  for (const entry of administrationModuleCatalogue) {
    const level = access[entry.id];
    if (level && level !== "none") result[entry.id] = level;
  }
  return result;
}

const unreservedPasswordCharacters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** A readable 14-character temporary password with upper, lower, digit and symbol. */
export function generateTemporaryPassword(random: (size: number) => Uint8Array = defaultRandom): string {
  const bytes = random(12);
  const body = Array.from(bytes, (byte) => unreservedPasswordCharacters[byte % unreservedPasswordCharacters.length]);
  return `${body.slice(0, 6).join("")}-${body.slice(6).join("")}7a`.replace(/^./, (first) => first.toUpperCase());
}

function defaultRandom(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function audit(
  state: AdminState,
  actor: AdminActor,
  action: string,
  target: { id: string; name: string },
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  now: string,
) {
  state.audit.unshift({
    id: `AUD-${String(state.audit.length + 1).padStart(4, "0")}`,
    at: now,
    actorId: actor.id,
    actorName: actor.name,
    action,
    targetId: target.id,
    targetName: target.name,
    before,
    after,
  });
}

const accessSnapshot = (user: AdminUser) => ({
  status: user.status,
  super_admin: user.super_admin,
  access: user.access,
  companies: user.companies.map((company) => company.company_id),
});

function companiesWithNames(state: AdminState, companies: CreateAdminUserRequest["companies"]): AdminUser["companies"] {
  return companies.map((company) => ({
    ...company,
    company_name: state.companies.find((item) => item.id === company.company_id)?.name ?? company.company_id,
  }));
}

function requireUser(state: AdminState, userId: string): AdminUser {
  const user = state.users.find((item) => item.id === userId);
  if (!user) throw new AdminRuleError("USER_NOT_FOUND", "The user no longer exists.");
  return user;
}

export function createUser(
  state: AdminState,
  request: CreateAdminUserRequest,
  actor: AdminActor,
  now: string,
  password: string = request.credential.generate ? generateTemporaryPassword() : request.credential.password,
): { user: AdminUser; oneTimePassword: string } {
  const email = request.email.toLowerCase();
  if (state.users.some((user) => user.email.toLowerCase() === email))
    throw new AdminRuleError("DUPLICATE_EMAIL", "Another user already has this email address.");
  if (state.users.some((user) => user.username === request.username))
    throw new AdminRuleError("DUPLICATE_USERNAME", "Another user already has this username.");
  const nextNumber =
    state.users.reduce((max, user) => Math.max(max, Number(/^USR-(\d+)$/.exec(user.id)?.[1] ?? 0)), 0) + 1;
  const user: AdminUser = {
    id: `USR-${String(nextNumber).padStart(3, "0")}`,
    display_name: request.display_name,
    username: request.username,
    email: request.email,
    employee_id: request.employee_id,
    status: "active",
    super_admin: request.super_admin,
    must_change_password: true,
    companies: companiesWithNames(state, request.companies),
    access: normaliseAccess(request.access, request.super_admin),
    last_login_at: null,
    end_date: null,
    created_at: now,
    updated_at: now,
    row_version: 1,
  };
  state.users.push(user);
  audit(state, actor, "user.create", { id: user.id, name: user.display_name }, null, accessSnapshot(user), now);
  return { user, oneTimePassword: password };
}

export function updateUser(
  state: AdminState,
  userId: string,
  request: UpdateAdminUserRequest,
  expectedVersion: number,
  actor: AdminActor,
  now: string,
): AdminUser {
  const user = requireUser(state, userId);
  if (user.row_version !== expectedVersion)
    throw new AdminRuleError("VERSION_CONFLICT", "Someone else changed this user. Reload and try again.");
  if (request.super_admin === false && user.super_admin) {
    if (isLastActiveSuperAdmin(state.users, user.id))
      throw new AdminRuleError("LAST_SUPER_ADMIN", "The organisation must keep at least one active Super Admin.");
    if (user.id === actor.id && request.confirm_self_demotion !== true)
      throw new AdminRuleError(
        "SELF_DEMOTION_NOT_CONFIRMED",
        "Confirm that you want to remove your own Super Admin access.",
      );
  }
  if (request.email && request.email.toLowerCase() !== user.email.toLowerCase()) {
    const email = request.email.toLowerCase();
    if (state.users.some((other) => other.id !== user.id && other.email.toLowerCase() === email))
      throw new AdminRuleError("DUPLICATE_EMAIL", "Another user already has this email address.");
  }
  const before = accessSnapshot(user);
  const superAdmin = request.super_admin ?? user.super_admin;
  Object.assign(user, {
    display_name: request.display_name ?? user.display_name,
    email: request.email ?? user.email,
    employee_id: request.employee_id === undefined ? user.employee_id : request.employee_id,
    companies: request.companies ? companiesWithNames(state, request.companies) : user.companies,
    super_admin: superAdmin,
    access: normaliseAccess(request.access ?? (user.access as ModuleAccessMap), superAdmin),
    updated_at: now,
    row_version: user.row_version + 1,
  } satisfies Partial<AdminUser>);
  audit(state, actor, "user.update", { id: user.id, name: user.display_name }, before, accessSnapshot(user), now);
  return user;
}

export function applyUserAction(
  state: AdminState,
  userId: string,
  action: AdminUserAction,
  actor: AdminActor,
  now: string,
): { user: AdminUser; oneTimePassword: string | null } {
  const user = requireUser(state, userId);
  const before = accessSnapshot(user);
  let oneTimePassword: string | null = null;
  if (
    (action.action === "deactivate" || action.action === "mark_resigned") &&
    isLastActiveSuperAdmin(state.users, user.id)
  )
    throw new AdminRuleError("LAST_SUPER_ADMIN", "The organisation must keep at least one active Super Admin.");
  switch (action.action) {
    case "reset_password":
      oneTimePassword = action.credential.generate ? generateTemporaryPassword() : action.credential.password;
      user.must_change_password = true;
      break;
    case "deactivate":
      user.status = "inactive";
      break;
    case "reactivate":
      user.status = "active";
      user.end_date = null;
      break;
    case "mark_resigned":
      user.status = "resigned";
      user.end_date = action.end_date;
      break;
  }
  user.updated_at = now;
  user.row_version += 1;
  audit(
    state,
    actor,
    `user.${action.action}`,
    { id: user.id, name: user.display_name },
    before,
    accessSnapshot(user),
    now,
  );
  return { user, oneTimePassword };
}

export function updateTenant(
  state: AdminState,
  request: UpdateTenantProfileRequest,
  expectedVersion: number,
  actor: AdminActor,
  now: string,
  hasPostingsInCurrentCalendar = false,
): TenantProfile {
  if (state.tenant.row_version !== expectedVersion)
    throw new AdminRuleError(
      "VERSION_CONFLICT",
      "Someone else changed the organisation profile. Reload and try again.",
    );
  if (
    request.financial_year_start_month !== undefined &&
    request.financial_year_start_month !== state.tenant.financial_year_start_month &&
    hasPostingsInCurrentCalendar
  )
    throw new AdminRuleError(
      "FINANCIAL_YEAR_LOCKED",
      "The financial year start cannot change while the current calendar has postings. It applies to the next calendar.",
    );
  const before = { ...state.tenant };
  state.tenant = { ...state.tenant, ...request, row_version: state.tenant.row_version + 1 };
  audit(
    state,
    actor,
    "tenant.update",
    { id: state.tenant.tenant_id, name: state.tenant.name },
    before,
    { ...state.tenant },
    now,
  );
  return state.tenant;
}

/** Level counted for a module, or null when the user has no access to it. */
function levelFor(user: AdminUser, moduleId: string): AccessLevel | "custom" | null {
  const level = (user.access as Record<string, string | undefined>)[moduleId];
  if (!level || level === "none") return null;
  return level === "custom" ? "custom" : accessLevelSchema.parse(level);
}

export function dashboardSummary(state: AdminState, now: string): AdminDashboardSummary {
  const count = (predicate: (user: AdminUser) => boolean) => state.users.filter(predicate).length;
  return {
    users: {
      total: state.users.length,
      active: count((user) => user.status === "active"),
      inactive: count((user) => user.status === "inactive"),
      locked: count((user) => user.status === "locked"),
      resigned: count((user) => user.status === "resigned"),
      pending_first_login: count((user) => user.status === "active" && user.must_change_password),
    },
    super_admins: state.users
      .filter((user) => user.super_admin)
      .map(({ id, display_name, email, status }) => ({ id, display_name, email, status })),
    modules: administrationModuleCatalogue.map((entry) => {
      const levels = state.users
        .filter((user) => user.status === "active" && !user.super_admin)
        .map((user) => levelFor(user, entry.id));
      return {
        module_id: entry.id,
        label: entry.label,
        live: entry.live,
        view: levels.filter((level) => level === "view").length,
        user: levels.filter((level) => level === "user").length,
        admin: levels.filter((level) => level === "admin").length,
        custom: levels.filter((level) => level === "custom").length,
      };
    }),
    generated_at: now,
  };
}
