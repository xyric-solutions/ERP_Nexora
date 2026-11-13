import { PassThrough } from "node:stream";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { AdminUser } from "../../packages/contracts/src/index.js";
import {
  adminModuleCatalogueResponseSchema,
  administrationModuleCatalogue,
  superAdminPermissionKey,
} from "../../packages/contracts/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { AdministrationRepository } from "../../server/api/src/modules/administration/repository.js";
import {
  generateTemporaryPassword,
  isAdministrationAdmin,
  isAdministrationSuperAdmin,
} from "../../server/api/src/modules/administration/service.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";

const origin = "https://erp.example.test";
const csrf = "csrf-admin";
const cookie = "nexora_session=" + "a".repeat(64);

const superAdminPermissions = [superAdminPermissionKey, "security.authorization.permission.read"];
const moduleAdminPermissions = ["banking.payment.read", "banking.payment.approve"];
const plainUserPermissions = ["banking.payment.read", "banking.payment.create"];

const availablePermissionKeys = [
  "banking.payment.read",
  "banking.payment.create",
  "banking.payment.approve",
  "banking.payment.post",
  "hr.employee.read",
  "hr.employee.create",
  "security.authorization.administer",
  "security.user.manage",
  "platform.organization_unit.read",
  "platform.currency.read",
];

function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "user-b",
    display_name: "User B",
    username: "user.b",
    email: "user.b@example.test",
    employee_id: null,
    status: "active",
    super_admin: false,
    must_change_password: false,
    companies: [{ company_id: "company-a", company_name: "Company A", is_default: true }],
    access: {},
    last_login_at: null,
    end_date: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    row_version: 4,
    ...overrides,
  };
}

function repositoryDouble(users: Record<string, AdminUser>, superAdminIds: string[]) {
  const repository = {
    loadDashboard: vi.fn(),
    getTenantProfile: vi.fn(async () => null),
    currentFiscalCalendarHasPostings: vi.fn(async () => false),
    updateTenantProfile: vi.fn(),
    listCompanies: vi.fn(async () => ({ items: [] })),
    getCompany: vi.fn(async () => null),
    createCompany: vi.fn(),
    updateCompany: vi.fn(),
    listAvailablePermissionKeys: vi.fn(async () => availablePermissionKeys),
    listActiveSuperAdminIds: vi.fn(async () => superAdminIds),
    listUsers: vi.fn(async () => ({ items: Object.values(users), page: 1, page_size: 50, total: 1 })),
    getUser: vi.fn(async (_tenantId: string, userId: string) => users[userId] ?? null),
    createUser: vi.fn(async () => adminUser({ id: "user-new", must_change_password: true, row_version: 1 })),
    updateUser: vi.fn(async (_context, userId: string) => ({ ...users[userId]!, row_version: 5 })),
    actOnUser: vi.fn(async (_context, userId: string) => ({ ...users[userId]!, row_version: 5 })),
  };
  return repository as typeof repository & AdministrationRepository;
}

function application(
  options: {
    permissions?: string[];
    actorId?: string;
    repository?: AdministrationRepository;
  } = {},
) {
  const actorId = options.actorId ?? "user-a";
  const session = {
    sessionId: "session-a",
    tenantId: "tenant-a",
    userId: actorId,
    sessionVersion: 1,
    csrfToken: csrf,
    idleExpiresAt: new Date(Date.now() + 60_000),
    absoluteExpiresAt: new Date(Date.now() + 120_000),
    activeCompanyId: null,
  };
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: "tenant-a",
      organizationName: "Tenant A",
      userId: actorId,
      email: "actor@example.test",
      displayName: "Actor",
      roles: [],
      permissions: options.permissions ?? superAdminPermissions,
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, supplied: string) =>
      supplied === csrf ? { status: "ok", session } : { status: "invalid_csrf" },
    ),
  } as unknown as TenantSessionApiService;
  return createApp({
    config: { allowedOrigins: new Set([origin]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: authentication,
    sessionService: sessions,
    ...(options.repository ? { administrationRepository: options.repository } : {}),
  });
}

function mutate(
  app: ReturnType<typeof application>,
  method: "post" | "patch",
  path: string,
  headers: { version?: string | null; key?: string | null; csrf?: string } = {},
) {
  let call = request(app)[method](path).set("cookie", cookie).set("origin", origin);
  call = call.set("x-csrf-token", headers.csrf ?? csrf);
  if (headers.key !== null) call = call.set("idempotency-key", headers.key ?? "idem-key-0001");
  if (headers.version !== null && headers.version !== undefined) call = call.set("if-match", headers.version);
  return call;
}

describe("administration helpers", () => {
  it("decides Super Admin and any-Admin from permission keys", () => {
    expect(isAdministrationSuperAdmin(superAdminPermissions)).toBe(true);
    expect(isAdministrationSuperAdmin(moduleAdminPermissions)).toBe(false);
    expect(isAdministrationAdmin(moduleAdminPermissions)).toBe(true);
    expect(isAdministrationAdmin(plainUserPermissions)).toBe(false);
  });

  it("generates one-time passwords containing every character class", () => {
    const password = generateTemporaryPassword(20);
    expect(password).toHaveLength(20);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });
});

describe("GET /api/v1/admin/modules (mounted without a repository)", () => {
  it("requires a session and an Admin", async () => {
    const anonymous = await request(application()).get("/api/v1/admin/modules");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers["content-type"]).toContain("application/problem+json");
    const user = await request(application({ permissions: plainUserPermissions }))
      .get("/api/v1/admin/modules")
      .set("cookie", cookie);
    expect(user.status).toBe(403);
    expect(user.body).toMatchObject({ code: "ADMINISTRATION_FORBIDDEN", status: 403 });
  });

  it("returns the catalogue for Super Admins and Module Admins", async () => {
    for (const permissions of [superAdminPermissions, moduleAdminPermissions]) {
      const response = await request(application({ permissions })).get("/api/v1/admin/modules").set("cookie", cookie);
      expect(response.status).toBe(200);
      const body = adminModuleCatalogueResponseSchema.parse(response.body);
      expect(body.modules.map((module) => module.id)).toEqual(administrationModuleCatalogue.map((module) => module.id));
      expect(body.levels.map((level) => level.level)).toEqual(["view", "user", "admin"]);
    }
  });

  it("keeps every other /admin route unmounted until a repository exists", async () => {
    const app = application();
    expect((await request(app).get("/api/v1/admin/users").set("cookie", cookie)).status).toBe(404);
    expect((await mutate(app, "post", "/api/v1/admin/users").send({})).status).toBe(404);
  });
});

describe("full administration router (mocked repository)", () => {
  const validCreate = {
    display_name: "New User",
    email: "new.user@example.test",
    username: "new.user",
    credential: { generate: true },
    companies: [{ company_id: "company-a", is_default: true }],
    access: { banking: "admin", hr: "view" },
  };

  it("rejects anonymous calls, bad CSRF, untrusted origins and Module Admin access", async () => {
    const repository = repositoryDouble({ "user-b": adminUser() }, ["user-a"]);
    const app = application({ repository });
    expect((await request(app).get("/api/v1/admin/users")).status).toBe(401);
    expect((await mutate(app, "post", "/api/v1/admin/users", { csrf: "wrong" }).send(validCreate)).status).toBe(403);
    const hostile = await request(app)
      .post("/api/v1/admin/users")
      .set("cookie", cookie)
      .set("origin", "https://hostile.test")
      .set("x-csrf-token", csrf)
      .send(validCreate);
    expect(hostile.status).toBe(403);
    expect(hostile.body.code).toBe("ORIGIN_VALIDATION_FAILED");

    const moduleAdmin = application({ permissions: moduleAdminPermissions, repository });
    const forbiddenWrite = await mutate(moduleAdmin, "post", "/api/v1/admin/users").send({});
    expect(forbiddenWrite.status).toBe(403);
    expect(forbiddenWrite.body.code).toBe("SUPER_ADMIN_REQUIRED");
    expect((await request(moduleAdmin).get("/api/v1/admin/users").set("cookie", cookie)).status).toBe(403);
    const ownAccess = await mutate(moduleAdmin, "patch", "/api/v1/admin/users/user-a", { version: '"1"' }).send({
      access: { banking: "admin", hr: "admin" },
    });
    expect(ownAccess.status).toBe(403);
    expect(repository.createUser).not.toHaveBeenCalled();
    expect(repository.updateUser).not.toHaveBeenCalled();
  });

  it("validates bodies, idempotency keys and If-Match in problem format", async () => {
    const repository = repositoryDouble({ "user-b": adminUser() }, ["user-a"]);
    const app = application({ repository });
    for (const body of [{}, { ...validCreate, email: "not-an-email" }, { ...validCreate, unexpected: 1 }]) {
      const response = await mutate(app, "post", "/api/v1/admin/users").send(body);
      expect(response.status).toBe(400);
      expect(response.headers["content-type"]).toContain("application/problem+json");
      expect(response.body).toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    }
    expect((await mutate(app, "post", "/api/v1/admin/users", { key: null }).send(validCreate)).body.code).toBe(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    const missingVersion = await mutate(app, "patch", "/api/v1/admin/users/user-b").send({ display_name: "B" });
    expect(missingVersion.status).toBe(428);
    const staleVersion = await mutate(app, "patch", "/api/v1/admin/users/user-b", { version: '"3"' }).send({
      display_name: "B",
    });
    expect(staleVersion.status).toBe(412);
    expect((await request(app).get("/api/v1/admin/users?page_size=999").set("cookie", cookie)).status).toBe(400);
    expect(repository.createUser).not.toHaveBeenCalled();
    expect(repository.updateUser).not.toHaveBeenCalled();
  });

  it("creates a user with expanded grants that never include security.* or platform admin keys", async () => {
    const repository = repositoryDouble({ "user-b": adminUser() }, ["user-a"]);
    const response = await mutate(application({ repository }), "post", "/api/v1/admin/users").send(validCreate);
    expect(response.status).toBe(201);
    expect(response.body.email_status).toBe("not_configured");
    expect(response.body.one_time_password).toEqual(expect.any(String));
    const [, input, write] = repository.createUser.mock.calls[0] as unknown as [
      unknown,
      { permissionKeys: string[]; passwordHash: string },
      { idempotencyKey: string; audit: { action: string; after: unknown } },
    ];
    expect(input.permissionKeys).toEqual(
      expect.arrayContaining(["banking.payment.approve", "banking.payment.read", "hr.employee.read"]),
    );
    expect(input.permissionKeys).not.toContain("hr.employee.create");
    expect(input.permissionKeys.some((key) => key.startsWith("security."))).toBe(false);
    expect(input.permissionKeys.filter((key) => key.startsWith("platform."))).toEqual([
      "platform.currency.read",
      "platform.organization_unit.read",
    ]);
    expect(input.passwordHash).toMatch(/^\$argon2id\$/);
    expect(write).toMatchObject({ idempotencyKey: "idem-key-0001", audit: { action: "administration.user.created" } });
    expect(JSON.stringify(write.audit)).not.toContain(response.body.one_time_password);
  });

  it("protects the last active Super Admin from demotion and deactivation", async () => {
    const users = { "user-b": adminUser({ super_admin: true }) };
    const repository = repositoryDouble(users, ["user-b"]);
    const app = application({ repository });
    const demote = await mutate(app, "patch", "/api/v1/admin/users/user-b", { version: '"4"' }).send({
      super_admin: false,
    });
    expect(demote.status).toBe(409);
    expect(demote.body.code).toBe("LAST_SUPER_ADMIN_PROTECTED");
    const deactivate = await mutate(app, "post", "/api/v1/admin/users/user-b/actions", { version: '"4"' }).send({
      action: "deactivate",
      reason: "Left the organisation",
    });
    expect(deactivate.status).toBe(409);
    expect(deactivate.body.code).toBe("LAST_SUPER_ADMIN_PROTECTED");
    expect(repository.updateUser).not.toHaveBeenCalled();
    expect(repository.actOnUser).not.toHaveBeenCalled();

    const shared = repositoryDouble({ "user-b": adminUser({ super_admin: true }) }, ["user-a", "user-b"]);
    const allowed = await mutate(application({ repository: shared }), "patch", "/api/v1/admin/users/user-b", {
      version: '"4"',
    }).send({ super_admin: false });
    expect(allowed.status).toBe(200);
    expect(shared.updateUser).toHaveBeenCalledWith(
      expect.anything(),
      "user-b",
      { superAdmin: false },
      expect.objectContaining({
        expectedVersion: 4,
        audit: expect.objectContaining({
          before: expect.objectContaining({ super_admin: true }),
          after: expect.objectContaining({ super_admin: false }),
        }),
      }),
    );
  });

  it("requires explicit confirmation before a Super Admin removes their own role", async () => {
    const users = { "user-a": adminUser({ id: "user-a", super_admin: true }) };
    const repository = repositoryDouble(users, ["user-a", "user-c"]);
    const app = application({ repository });
    const unconfirmed = await mutate(app, "patch", "/api/v1/admin/users/user-a", { version: '"4"' }).send({
      super_admin: false,
    });
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.body.code).toBe("SELF_DEMOTION_CONFIRMATION_REQUIRED");
    expect(repository.updateUser).not.toHaveBeenCalled();
    const confirmed = await mutate(app, "patch", "/api/v1/admin/users/user-a", { version: '"4"' }).send({
      super_admin: false,
      confirm_self_demotion: true,
    });
    expect(confirmed.status).toBe(200);
    expect(repository.updateUser).toHaveBeenCalledOnce();
  });

  it("refuses self-deactivation and returns a reset password once", async () => {
    const users = { "user-a": adminUser({ id: "user-a", super_admin: true }), "user-b": adminUser() };
    const repository = repositoryDouble(users, ["user-a", "user-c"]);
    const app = application({ repository });
    const self = await mutate(app, "post", "/api/v1/admin/users/user-a/actions", { version: '"4"' }).send({
      action: "deactivate",
      reason: "Testing",
    });
    expect(self.status).toBe(409);
    expect(self.body.code).toBe("SELF_DEACTIVATION_FORBIDDEN");
    const reset = await mutate(app, "post", "/api/v1/admin/users/user-b/actions", { version: '"4"' }).send({
      action: "reset_password",
    });
    expect(reset.status).toBe(200);
    expect(reset.body.one_time_password).toEqual(expect.any(String));
    expect(repository.actOnUser).toHaveBeenCalledWith(
      expect.anything(),
      "user-b",
      { action: "reset_password", passwordHash: expect.stringMatching(/^\$argon2id\$/) },
      expect.objectContaining({ audit: expect.objectContaining({ action: "administration.user.reset_password" }) }),
    );
  });
});
