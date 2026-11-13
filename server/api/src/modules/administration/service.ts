import { randomInt } from "node:crypto";

import { hashPassword, validatePassword } from "@nexora/auth";
import {
  accessLevelDescriptions,
  administrationModuleCatalogue,
  classifyPermissionAction,
  expandModuleAccessToPermissionKeys,
  isSuperAdmin,
  isSuperAdminOnlyPermission,
  parsePermissionKey,
  referenceReadPermissionKeys,
  type AdminCompany,
  type AdminCompanyDirectory,
  type AdminDashboardSummary,
  type AdminModuleCatalogueResponse,
  type AdminUser,
  type AdminUserAction,
  type AdminUserCredentialResult,
  type AdminUserListQuery,
  type AdminUserListResponse,
  type CreateAdminCompanyRequest,
  type CreateAdminUserRequest,
  type ModuleAccessMap,
  type TenantProfile,
  type UpdateAdminCompanyRequest,
  type UpdateAdminUserRequest,
  type UpdateTenantProfileRequest,
} from "@nexora/contracts";

import {
  AdministrationError,
  type AdministrationActorContext,
  type AdministrationCredentialMailer,
  type AdministrationRepository,
  type UpdateAdministeredUser,
} from "./repository.js";

/**
 * The single Super Admin decision for the Administration API. Until plan Phase 2 adds the Super Admin role flag,
 * a Super Admin is whoever holds `security.authorization.administer` (shared with the UI via contracts).
 */
export function isAdministrationSuperAdmin(permissions: Iterable<string>): boolean {
  return isSuperAdmin(permissions);
}

/** "Any Admin" (plan Phase 3): a Super Admin or a Module Admin, i.e. holds at least one admin-tier key. */
export function isAdministrationAdmin(permissions: readonly string[]): boolean {
  if (isAdministrationSuperAdmin(permissions)) return true;
  return permissions.some((key) => {
    const parts = parsePermissionKey(key);
    return parts !== null && classifyPermissionAction(parts.action) === "admin";
  });
}

/** Module catalogue + level descriptions; needs no persistence, so it is served before Phase 2 lands. */
export function administrationModuleCatalogueResponse(): AdminModuleCatalogueResponse {
  return {
    modules: administrationModuleCatalogue.map((module) => ({ id: module.id, label: module.label, live: module.live })),
    levels: accessLevelDescriptions.map((entry) => ({ ...entry })),
  };
}

export function requireAdministrationAdmin(context: AdministrationActorContext): void {
  if (!isAdministrationAdmin(context.actor.permissions)) {
    throw new AdministrationError(403, "ADMINISTRATION_FORBIDDEN", "Administration access is required.");
  }
}

export function requireSuperAdmin(context: AdministrationActorContext): void {
  if (!isAdministrationSuperAdmin(context.actor.permissions)) {
    throw new AdministrationError(403, "SUPER_ADMIN_REQUIRED", "Only a Super Admin can perform this operation.");
  }
}

const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const passwordSymbols = "!@#$%*?-_";

/** 16-character one-time password containing every character class, so any configured policy accepts it. */
export function generateTemporaryPassword(length = 16): string {
  const pick = (source: string) => source[randomInt(source.length)]!;
  const characters = [
    pick("ABCDEFGHJKLMNPQRSTUVWXYZ"),
    pick("abcdefghijkmnopqrstuvwxyz"),
    pick("23456789"),
    pick(passwordSymbols),
  ];
  while (characters.length < length) characters.push(pick(passwordAlphabet));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [characters[index], characters[swap]] = [characters[swap]!, characters[index]!];
  }
  return characters.join("");
}

export interface AdministrationServiceOptions {
  repository: AdministrationRepository;
  mailer?: AdministrationCredentialMailer;
  hash?: (password: string) => Promise<string>;
  generatePassword?: (length: number) => string;
}

export interface AdministrationWriteOptions {
  idempotencyKey: string;
  expectedVersion?: number;
}

export class AdministrationService {
  private readonly repository: AdministrationRepository;
  private readonly mailer: AdministrationCredentialMailer | undefined;
  private readonly hash: (password: string) => Promise<string>;
  private readonly generatePassword: (length: number) => string;

  constructor(options: AdministrationServiceOptions) {
    this.repository = options.repository;
    this.mailer = options.mailer;
    this.hash = options.hash ?? hashPassword;
    this.generatePassword = options.generatePassword ?? generateTemporaryPassword;
  }

  modules(context: AdministrationActorContext): AdminModuleCatalogueResponse {
    requireAdministrationAdmin(context);
    return administrationModuleCatalogueResponse();
  }

  async dashboard(context: AdministrationActorContext): Promise<AdminDashboardSummary> {
    requireSuperAdmin(context);
    return this.repository.loadDashboard(context.tenantId);
  }

  async tenant(context: AdministrationActorContext): Promise<TenantProfile> {
    requireAdministrationAdmin(context);
    return this.found(await this.repository.getTenantProfile(context.tenantId), "TENANT_NOT_FOUND", "Organisation");
  }

  async updateTenant(
    context: AdministrationActorContext,
    change: UpdateTenantProfileRequest,
    write: Required<AdministrationWriteOptions>,
  ): Promise<TenantProfile> {
    requireSuperAdmin(context);
    const before = await this.tenant(context);
    this.checkVersion(before.row_version, write.expectedVersion);
    if (
      change.financial_year_start_month !== undefined &&
      change.financial_year_start_month !== before.financial_year_start_month &&
      (await this.repository.currentFiscalCalendarHasPostings(context.tenantId))
    ) {
      throw new AdministrationError(
        409,
        "FINANCIAL_YEAR_LOCKED",
        "The financial year start cannot change while the current fiscal calendar has postings.",
      );
    }
    return this.repository.updateTenantProfile(context, change, {
      ...write,
      audit: {
        action: "administration.tenant.updated",
        entityType: "tenant",
        entityId: context.tenantId,
        before,
        after: { ...before, ...change },
      },
    });
  }

  async companies(context: AdministrationActorContext): Promise<AdminCompanyDirectory> {
    requireSuperAdmin(context);
    return this.repository.listCompanies(context.tenantId);
  }

  async createCompany(
    context: AdministrationActorContext,
    input: CreateAdminCompanyRequest,
    write: AdministrationWriteOptions,
  ): Promise<AdminCompany> {
    requireSuperAdmin(context);
    return this.repository.createCompany(context, input, {
      idempotencyKey: write.idempotencyKey,
      audit: {
        action: "administration.company.created",
        entityType: "organization_unit",
        entityId: "new",
        before: null,
        after: input,
      },
    });
  }

  async updateCompany(
    context: AdministrationActorContext,
    companyId: string,
    change: UpdateAdminCompanyRequest,
    write: Required<AdministrationWriteOptions>,
  ): Promise<AdminCompany> {
    requireSuperAdmin(context);
    const before = this.found(
      await this.repository.getCompany(context.tenantId, companyId),
      "COMPANY_NOT_FOUND",
      "Company",
    );
    this.checkVersion(before.row_version, write.expectedVersion);
    return this.repository.updateCompany(context, companyId, change, {
      ...write,
      audit: {
        action: "administration.company.updated",
        entityType: "organization_unit",
        entityId: companyId,
        before,
        after: { ...before, ...change },
      },
    });
  }

  async users(context: AdministrationActorContext, query: AdminUserListQuery): Promise<AdminUserListResponse> {
    requireSuperAdmin(context);
    return this.repository.listUsers(context.tenantId, query);
  }

  async user(context: AdministrationActorContext, userId: string): Promise<AdminUser> {
    requireSuperAdmin(context);
    return this.found(await this.repository.getUser(context.tenantId, userId), "USER_NOT_FOUND", "User");
  }

  async createUser(
    context: AdministrationActorContext,
    input: CreateAdminUserRequest,
    write: AdministrationWriteOptions,
  ): Promise<AdminUserCredentialResult> {
    requireSuperAdmin(context);
    const { credential, access, ...request } = input;
    const permissionKeys = await this.permissionKeysFor(access);
    const password = await this.initialPassword(context.tenantId, credential, input.email);
    const user = await this.repository.createUser(
      context,
      { request, permissionKeys, passwordHash: await this.hash(password) },
      {
        idempotencyKey: write.idempotencyKey,
        audit: {
          action: "administration.user.created",
          entityType: "security_user_account",
          entityId: input.username,
          before: null,
          after: { ...request, access, permission_keys: permissionKeys },
        },
      },
    );
    return {
      user,
      one_time_password: credential.generate ? password : null,
      email_status: await this.sendCredentials(context, user, "account_created", password),
    };
  }

  async updateUser(
    context: AdministrationActorContext,
    userId: string,
    input: UpdateAdminUserRequest,
    write: Required<AdministrationWriteOptions>,
  ): Promise<AdminUser> {
    requireSuperAdmin(context);
    const before = await this.user(context, userId);
    this.checkVersion(before.row_version, write.expectedVersion);
    const change: UpdateAdministeredUser = {};
    const details = {
      ...(input.display_name !== undefined ? { display_name: input.display_name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.employee_id !== undefined ? { employee_id: input.employee_id } : {}),
    };
    if (Object.keys(details).length) change.details = details;
    if (input.companies) change.companies = input.companies;
    if (input.access) change.permissionKeys = await this.permissionKeysFor(input.access);
    if (input.super_admin !== undefined && input.super_admin !== before.super_admin) {
      if (!input.super_admin) {
        if (userId === context.actor.userId && input.confirm_self_demotion !== true) {
          throw new AdministrationError(
            409,
            "SELF_DEMOTION_CONFIRMATION_REQUIRED",
            "Removing your own Super Admin role needs confirm_self_demotion: true.",
          );
        }
        await this.guardLastSuperAdmin(context.tenantId, userId);
      }
      change.superAdmin = input.super_admin;
    }
    if (!Object.keys(change).length) return before;
    return this.repository.updateUser(context, userId, change, {
      ...write,
      audit: {
        action: "administration.user.updated",
        entityType: "security_user_account",
        entityId: userId,
        before,
        after: {
          ...before,
          ...details,
          ...(input.companies ? { companies: input.companies } : {}),
          ...(input.access ? { access: input.access, permission_keys: change.permissionKeys } : {}),
          ...(change.superAdmin !== undefined ? { super_admin: change.superAdmin } : {}),
        },
      },
    });
  }

  async actOnUser(
    context: AdministrationActorContext,
    userId: string,
    input: AdminUserAction,
    write: Required<AdministrationWriteOptions>,
  ): Promise<AdminUserCredentialResult> {
    requireSuperAdmin(context);
    const before = await this.user(context, userId);
    this.checkVersion(before.row_version, write.expectedVersion);
    const audit = {
      action: `administration.user.${input.action}`,
      entityType: "security_user_account" as const,
      entityId: userId,
      before,
    };
    if (input.action === "reset_password") {
      const password = await this.initialPassword(context.tenantId, input.credential, before.email);
      const user = await this.repository.actOnUser(
        context,
        userId,
        { action: "reset_password", passwordHash: await this.hash(password) },
        { ...write, audit: { ...audit, after: { ...before, must_change_password: true } } },
      );
      return {
        user,
        one_time_password: input.credential.generate ? password : null,
        email_status: await this.sendCredentials(context, user, "password_reset", password),
      };
    }
    if (input.action === "deactivate" || input.action === "mark_resigned") {
      if (userId === context.actor.userId) {
        throw new AdministrationError(
          409,
          "SELF_DEACTIVATION_FORBIDDEN",
          "You cannot deactivate your own account. Ask another Super Admin.",
        );
      }
      if (before.super_admin) await this.guardLastSuperAdmin(context.tenantId, userId);
    }
    const status = input.action === "reactivate" ? "active" : input.action === "deactivate" ? "inactive" : "resigned";
    const user = await this.repository.actOnUser(context, userId, input, {
      ...write,
      audit: {
        ...audit,
        after: { ...before, status, ...(input.action === "mark_resigned" ? { end_date: input.end_date } : {}) },
      },
    });
    return { user, one_time_password: null, email_status: "not_configured" };
  }

  /**
   * Module access map → grant keys. Super Admin-only keys (`security.*`, `administration.*`, platform writes) never
   * leave here; only the allow-listed `platform.*.read` reference keys used by pickers may.
   */
  private async permissionKeysFor(access: ModuleAccessMap): Promise<string[]> {
    const keys = expandModuleAccessToPermissionKeys(access, await this.repository.listAvailablePermissionKeys());
    const reference = new Set<string>(referenceReadPermissionKeys);
    const leaked = keys.filter((key) => isSuperAdminOnlyPermission(key) && !reference.has(key));
    if (leaked.length) {
      throw new AdministrationError(500, "ACCESS_EXPANSION_INVALID", "Module access expanded to reserved keys.");
    }
    return keys;
  }

  private async guardLastSuperAdmin(tenantId: string, userId: string): Promise<void> {
    const remaining = (await this.repository.listActiveSuperAdminIds(tenantId)).filter((id) => id !== userId);
    if (remaining.length < 1) {
      throw new AdministrationError(
        409,
        "LAST_SUPER_ADMIN_PROTECTED",
        "The organisation must keep at least one active Super Admin.",
      );
    }
  }

  /** Generated (long enough for the tenant policy) or Super Admin-entered, and checked against the policy. */
  private async initialPassword(
    tenantId: string,
    credential: CreateAdminUserRequest["credential"],
    email: string,
  ): Promise<string> {
    const policy = await this.repository.loadSecurityPolicy?.(tenantId);
    const password = credential.generate
      ? this.generatePassword(Math.max(16, policy?.passwordMinimumLength ?? 0))
      : credential.password;
    try {
      validatePassword(
        password,
        email,
        policy
          ? {
              minimumLength: policy.passwordMinimumLength,
              requireUppercase: policy.passwordRequireUppercase,
              requireLowercase: policy.passwordRequireLowercase,
              requireNumber: policy.passwordRequireNumber,
              requireSymbol: policy.passwordRequireSymbol,
            }
          : undefined,
      );
    } catch (error) {
      const violations = (error as { violations?: unknown }).violations;
      if (Array.isArray(violations)) {
        throw new AdministrationError(
          400,
          "PASSWORD_POLICY_REJECTED",
          `The password does not meet the security policy (${violations.join(", ")}).`,
        );
      }
      throw error;
    }
    return password;
  }

  private async sendCredentials(
    context: AdministrationActorContext,
    user: AdminUser,
    kind: "account_created" | "password_reset",
    temporaryPassword: string,
  ): Promise<"queued" | "not_configured"> {
    if (!this.mailer) return "not_configured";
    await this.mailer.queueCredentialEmail({
      tenantId: context.tenantId,
      userId: user.id,
      kind,
      email: user.email,
      displayName: user.display_name,
      temporaryPassword,
      correlationId: context.correlationId,
    });
    return "queued";
  }

  private checkVersion(current: number, expected: number): void {
    if (current !== expected) {
      throw new AdministrationError(
        412,
        "ADMINISTRATION_PRECONDITION_FAILED",
        "The record changed since it was read. Reload and try again.",
      );
    }
  }

  private found<T>(value: T | null, code: string, label: string): T {
    if (!value) throw new AdministrationError(404, code, `${label} not found.`);
    return value;
  }
}
