import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "app_user",
  {
    id: uuid("id").primaryKey(),
    loginIdentifier: text("login_identifier").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
    bootstrapAdministrator: boolean("bootstrap_administrator").notNull().default(false),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_user_login_identifier_uq").on(table.loginIdentifier),
    uniqueIndex("app_user_bootstrap_administrator_uq")
      .on(table.bootstrapAdministrator)
      .where(sql`${table.bootstrapAdministrator} = true`),
    index("app_user_status_idx").on(table.status),
  ],
);

export const passwordCredentials = pgTable("password_credential", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "restrict" }),
  passwordHash: text("password_hash").notNull(),
  hashAlgorithm: text("hash_algorithm").notNull().default("argon2id"),
  mustChange: boolean("must_change").notNull().default(false),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const passwordHistory = pgTable(
  "password_history",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    passwordHash: text("password_hash").notNull(),
    hashAlgorithm: text("hash_algorithm").notNull().default("argon2id"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("password_history_user_changed_idx").on(table.userId, table.changedAt)],
);

export const authenticationThrottles = pgTable(
  "authentication_throttle",
  {
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    failureCount: integer("failure_count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.keyHash], name: "authentication_throttle_pk" }),
    index("authentication_throttle_blocked_idx").on(table.blockedUntil),
  ],
);

export const securityBootstrapState = pgTable("security_bootstrap_state", {
  singleton: boolean("singleton").primaryKey().default(true),
  administratorUserId: uuid("administrator_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSessions = pgTable(
  "user_session",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    assuranceLevel: text("assurance_level").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    rotatedFromId: uuid("rotated_from_id").references((): AnyPgColumn => userSessions.id, {
      onDelete: "restrict",
    }),
    userAgentHash: text("user_agent_hash"),
    sourceIpHash: text("source_ip_hash"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    version: bigint("version", { mode: "number" }).notNull().default(1),
  },
  (table) => [
    uniqueIndex("user_session_token_hash_uq").on(table.tokenHash),
    index("user_session_user_active_idx").on(table.userId, table.createdAt),
    index("user_session_expiry_idx").on(table.idleExpiresAt, table.absoluteExpiresAt),
    index("user_session_rotated_from_idx").on(table.rotatedFromId),
  ],
);

export const mfaCredentials = pgTable(
  "mfa_credential",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    secretCiphertext: text("secret_ciphertext").notNull(),
    secretIv: text("secret_iv").notNull(),
    secretAuthTag: text("secret_auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    algorithm: text("algorithm").notNull().default("sha1"),
    digits: integer("digits").notNull().default(6),
    periodSeconds: integer("period_seconds").notNull().default(30),
    lastUsedStep: bigint("last_used_step", { mode: "number" }),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    enrollmentStartedAt: timestamp("enrollment_started_at", { withTimezone: true }).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    resetAt: timestamp("reset_at", { withTimezone: true }),
    version: bigint("version", { mode: "number" }).notNull().default(1),
  },
  (table) => [
    index("mfa_credential_status_idx").on(table.status),
    index("mfa_credential_blocked_idx").on(table.blockedUntil),
  ],
);

export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_code",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => mfaCredentials.userId, { onDelete: "restrict" }),
    codeHash: text("code_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("mfa_recovery_code_hash_uq").on(table.userId, table.codeHash),
    index("mfa_recovery_code_active_idx").on(table.userId),
  ],
);

export const mfaResetRequests = pgTable(
  "mfa_reset_request",
  {
    id: uuid("id").primaryKey(),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestSessionId: uuid("request_session_id")
      .notNull()
      .references(() => userSessions.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("pending"),
    reason: text("reason").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    decisionSessionId: uuid("decision_session_id").references(() => userSessions.id, { onDelete: "restrict" }),
    version: bigint("version", { mode: "number" }).notNull().default(1),
  },
  (table) => [index("mfa_reset_request_pending_idx").on(table.requestedAt)],
);

export const mfaSecurityEvents = pgTable(
  "mfa_security_event",
  {
    id: uuid("id").primaryKey(),
    eventType: text("event_type").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => userSessions.id, { onDelete: "restrict" }),
    resetRequestId: uuid("reset_request_id").references(() => mfaResetRequests.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [
    index("mfa_security_event_subject_time_idx").on(table.subjectUserId, table.occurredAt),
    index("mfa_security_event_actor_time_idx").on(table.actorUserId, table.occurredAt),
  ],
);

export const securityScopes = pgTable(
  "security_scope",
  {
    id: uuid("id").primaryKey(),
    scopeType: text("scope_type").notNull(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    normalizedDisplayName: text("normalized_display_name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => securityScopes.id, { onDelete: "restrict" }),
    enterpriseScopeId: uuid("enterprise_scope_id")
      .notNull()
      .references((): AnyPgColumn => securityScopes.id, { onDelete: "restrict" }),
    companyScopeId: uuid("company_scope_id").references((): AnyPgColumn => securityScopes.id, {
      onDelete: "restrict",
    }),
    status: text("status").notNull().default("active"),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("security_scope_parent_idx").on(table.parentId),
    index("security_scope_company_status_idx").on(table.companyScopeId, table.status),
  ],
);

export const securityPermissions = pgTable(
  "security_permission",
  {
    id: uuid("id").primaryKey(),
    permissionKey: text("permission_key").notNull(),
    module: text("module").notNull(),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
    description: text("description").notNull(),
    requiredAssurance: text("required_assurance").notNull(),
    fieldBearing: boolean("field_bearing").notNull(),
    stateContextRequired: boolean("state_context_required").notNull(),
    sensitivity: text("sensitivity").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("security_permission_key_uq").on(table.permissionKey),
    index("security_permission_resource_idx").on(table.module, table.resource, table.action),
  ],
);

export const securityPermissionStates = pgTable(
  "security_permission_state",
  {
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => securityPermissions.id, { onDelete: "restrict" }),
    sourceState: text("source_state").notNull(),
  },
  (table) => [primaryKey({ columns: [table.permissionId, table.sourceState] })],
);

export const securityPermissionFields = pgTable(
  "security_permission_field",
  {
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => securityPermissions.id, { onDelete: "restrict" }),
    fieldPath: text("field_path").notNull(),
  },
  (table) => [primaryKey({ columns: [table.permissionId, table.fieldPath] })],
);

export const securityRoles = pgTable(
  "security_role",
  {
    id: uuid("id").primaryKey(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("active"),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("security_role_code_uq").on(table.code), index("security_role_status_idx").on(table.status)],
);

export const securityRolePermissions = pgTable(
  "security_role_permission",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => securityRoles.id, { onDelete: "restrict" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => securityPermissions.id, { onDelete: "restrict" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const securityFieldGrants = pgTable(
  "security_field_grant",
  {
    roleId: uuid("role_id").notNull(),
    permissionId: uuid("permission_id").notNull(),
    fieldPath: text("field_path").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId, table.fieldPath] }),
    foreignKey({
      columns: [table.roleId, table.permissionId],
      foreignColumns: [securityRolePermissions.roleId, securityRolePermissions.permissionId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.permissionId, table.fieldPath],
      foreignColumns: [securityPermissionFields.permissionId, securityPermissionFields.fieldPath],
    }).onDelete("restrict"),
  ],
);

export const securityRoleAssignments = pgTable(
  "security_role_assignment",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => securityRoles.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    assignedByUserId: uuid("assigned_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("security_role_assignment_user_time_idx").on(table.userId, table.validFrom, table.validUntil),
    index("security_role_assignment_role_status_idx").on(table.roleId, table.status),
  ],
);

export const securityAssignmentScopes = pgTable(
  "security_assignment_scope",
  {
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => securityRoleAssignments.id, { onDelete: "restrict" }),
    scopeId: uuid("scope_id")
      .notNull()
      .references(() => securityScopes.id, { onDelete: "restrict" }),
    includeDescendants: boolean("include_descendants").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.assignmentId, table.scopeId] }),
    index("security_assignment_scope_scope_idx").on(table.scopeId, table.assignmentId),
  ],
);

export const securitySodPolicies = pgTable(
  "security_sod_policy",
  {
    id: uuid("id").primaryKey(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    policyKind: text("policy_kind").notNull(),
    firstRoleId: uuid("first_role_id").references(() => securityRoles.id, { onDelete: "restrict" }),
    secondRoleId: uuid("second_role_id").references(() => securityRoles.id, { onDelete: "restrict" }),
    protectedPermissionId: uuid("protected_permission_id").references(() => securityPermissions.id, {
      onDelete: "restrict",
    }),
    actorRelation: text("actor_relation"),
    applicableSourceStates: text("applicable_source_states").array().notNull().default([]),
    status: text("status").notNull().default("active"),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("security_sod_policy_code_uq").on(table.code)],
);

export const securityPolicyEvents = pgTable(
  "security_policy_event",
  {
    id: uuid("id").primaryKey(),
    eventType: text("event_type").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id").references(() => userSessions.id, { onDelete: "restrict" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    beforeSummary: jsonb("before_summary"),
    afterSummary: jsonb("after_summary"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [
    index("security_policy_event_entity_time_idx").on(table.entityType, table.entityId, table.occurredAt),
    index("security_policy_event_actor_time_idx").on(table.actorUserId, table.occurredAt),
  ],
);

export const securityPolicyCommands = pgTable(
  "security_policy_command",
  {
    id: uuid("id").primaryKey(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    operation: text("operation").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    result: jsonb("result").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => securityPolicyEvents.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("security_policy_command_event_uq").on(table.eventId),
    index("security_policy_command_actor_time_idx").on(table.actorUserId, table.createdAt),
  ],
);
