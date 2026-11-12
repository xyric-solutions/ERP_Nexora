import type { AuthenticatedAccount, TenantSecurityPolicy } from "@nexora/auth";
import type {
  AdminCompany,
  AdminCompanyDirectory,
  AdminDashboardSummary,
  AdminUser,
  AdminUserAction,
  AdminUserListQuery,
  AdminUserListResponse,
  CreateAdminCompanyRequest,
  CreateAdminUserRequest,
  TenantProfile,
  UpdateAdminCompanyRequest,
  UpdateTenantProfileRequest,
} from "@nexora/contracts";

/** Who is acting, resolved on the server from the session (never from the request body). */
export interface AdministrationActorContext {
  tenantId: string;
  actor: AuthenticatedAccount;
  correlationId: string;
}

/**
 * Before/after snapshot the repository must write to the audit log (`security_audit_event` /
 * `platform_admin_audit_event`) in the same transaction as the change. Never contains password material.
 */
export interface AdministrationAuditEntry {
  action: string;
  entityType: "tenant" | "organization_unit" | "security_user_account";
  entityId: string;
  before: unknown;
  after: unknown;
}

/** Common to every write: replay protection and the audit entry. */
export interface AdministrationWrite {
  idempotencyKey: string;
  audit: AdministrationAuditEntry;
}

/** Optimistic concurrency for updates of an existing record (the `If-Match` row version). */
export interface AdministrationVersionedWrite extends AdministrationWrite {
  expectedVersion: number;
}

export interface CreateAdministeredUser {
  request: Omit<CreateAdminUserRequest, "credential" | "access">;
  /** Final permission keys from the module access map; never contains `security.*`/`platform.*` keys. */
  permissionKeys: readonly string[];
  /** Argon2id hash of the initial password; the user must change it on first login. */
  passwordHash: string;
}

export interface UpdateAdministeredUser {
  details?: { display_name?: string; email?: string; employee_id?: string | null };
  companies?: CreateAdminUserRequest["companies"];
  /** Replaces the user's module grants when present. */
  permissionKeys?: readonly string[];
  superAdmin?: boolean;
}

export type AdministeredUserAction =
  { action: "reset_password"; passwordHash: string } | Exclude<AdminUserAction, { action: "reset_password" }>;

/**
 * Persistence boundary of the Administration API. Every method is tenant-scoped and must run inside a
 * tenant transaction. Implementations that change access must write through
 * `security_user_role_assignment_version` (and the legacy JSON column), bump the target user's
 * `session_version`, and append the supplied audit entry atomically.
 *
 * No implementation exists yet: the tables from plan Phase 2 are still pending, so the full router is
 * mounted only when one is supplied.
 */
export interface AdministrationRepository {
  loadDashboard(tenantId: string): Promise<AdminDashboardSummary>;

  getTenantProfile(tenantId: string): Promise<TenantProfile | null>;
  /** True when the current fiscal calendar already has posted transactions. */
  currentFiscalCalendarHasPostings(tenantId: string): Promise<boolean>;
  updateTenantProfile(
    context: AdministrationActorContext,
    change: UpdateTenantProfileRequest,
    write: AdministrationVersionedWrite,
  ): Promise<TenantProfile>;

  listCompanies(tenantId: string): Promise<AdminCompanyDirectory>;
  getCompany(tenantId: string, companyId: string): Promise<AdminCompany | null>;
  createCompany(
    context: AdministrationActorContext,
    input: CreateAdminCompanyRequest,
    write: AdministrationWrite,
  ): Promise<AdminCompany>;
  updateCompany(
    context: AdministrationActorContext,
    companyId: string,
    change: UpdateAdminCompanyRequest,
    write: AdministrationVersionedWrite,
  ): Promise<AdminCompany>;

  /** Active permission definitions (`security_permission_definition.status = 'active'`). */
  listAvailablePermissionKeys(): Promise<readonly string[]>;
  /** Active Super Admins of the tenant (active account + active Super Admin grant). */
  listActiveSuperAdminIds(tenantId: string): Promise<readonly string[]>;
  loadSecurityPolicy?(tenantId: string): Promise<TenantSecurityPolicy | null>;

  listUsers(tenantId: string, query: AdminUserListQuery): Promise<AdminUserListResponse>;
  getUser(tenantId: string, userId: string): Promise<AdminUser | null>;
  createUser(
    context: AdministrationActorContext,
    input: CreateAdministeredUser,
    write: AdministrationWrite,
  ): Promise<AdminUser>;
  updateUser(
    context: AdministrationActorContext,
    userId: string,
    change: UpdateAdministeredUser,
    write: AdministrationVersionedWrite,
  ): Promise<AdminUser>;
  actOnUser(
    context: AdministrationActorContext,
    userId: string,
    action: AdministeredUserAction,
    write: AdministrationVersionedWrite,
  ): Promise<AdminUser>;
}

/** Queues credential emails (plan Phase 4). Absent until the `email_outbox` table exists. */
export interface AdministrationCredentialMailer {
  queueCredentialEmail(input: {
    tenantId: string;
    userId: string;
    kind: "account_created" | "password_reset";
    email: string;
    displayName: string;
    temporaryPassword: string;
    correlationId: string;
  }): Promise<void>;
}

export class AdministrationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
