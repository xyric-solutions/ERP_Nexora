"use client";

import {
  createAdminUserRequestSchema,
  updateAdminUserRequestSchema,
  updateTenantProfileRequestSchema,
  adminUserActionSchema,
  type AdminUser,
  type AdminUserAction,
  type CreateAdminUserRequest,
  type SessionResponse,
  type TenantProfile,
  type UpdateAdminUserRequest,
  type UpdateTenantProfileRequest,
} from "@nexora/contracts";

import type { NexoraApiClient } from "../../../lib/api/generated";
import { createAdminSeed } from "../model/admin-fixtures";
import { commitAdmin, ensureAdminState } from "../model/admin-store";
import { applyUserAction, createUser, updateTenant, updateUser, type AdminActor } from "../model/admin-workflow";

/**
 * Administration data adapter (plan Phase 5).
 *
 * MOCK FALLBACK: the `/api/v1/admin` user, tenant and dashboard endpoints depend on
 * the deferred Phase 2 tables, so writes go to the in-memory prototype store and
 * nothing is saved on the server. Companies are read live from the HR company
 * directory. Swap each method to the generated client once the API is mounted;
 * the views only depend on this class.
 */
export const administrationDataMode = "prototype" as const;

export interface CredentialResult {
  user: AdminUser;
  oneTimePassword: string | null;
  emailStatus: "queued" | "not_configured";
}

export class AdministrationClient {
  private readonly actor: AdminActor;

  constructor(
    private readonly api: NexoraApiClient,
    private readonly session: SessionResponse,
  ) {
    this.actor = { id: session.user.id, name: session.user.display_name };
    ensureAdminState(session.tenant_id, () => createAdminSeed(session, new Date().toISOString()));
  }

  /** Live: every company the signed-in user can access, from the HR company directory. */
  async companies() {
    const directory = await this.api.listHrCompanies();
    commitAdmin((draft) => {
      draft.companies = directory.items.map(({ id, code, name }) => ({ id, code, name }));
    });
    return directory.items;
  }

  async createUser(input: CreateAdminUserRequest): Promise<CredentialResult> {
    const request = createAdminUserRequestSchema.parse(input);
    const result = commitAdmin((draft) => createUser(draft, request, this.actor, new Date().toISOString()));
    return { user: result.user, oneTimePassword: result.oneTimePassword, emailStatus: "not_configured" };
  }

  async updateUser(userId: string, input: UpdateAdminUserRequest, expectedVersion: number): Promise<AdminUser> {
    const request = updateAdminUserRequestSchema.parse(input);
    return commitAdmin((draft) =>
      updateUser(draft, userId, request, expectedVersion, this.actor, new Date().toISOString()),
    );
  }

  async userAction(userId: string, input: AdminUserAction): Promise<CredentialResult> {
    const action = adminUserActionSchema.parse(input);
    const result = commitAdmin((draft) => applyUserAction(draft, userId, action, this.actor, new Date().toISOString()));
    return { user: result.user, oneTimePassword: result.oneTimePassword, emailStatus: "not_configured" };
  }

  async updateTenant(input: UpdateTenantProfileRequest, expectedVersion: number): Promise<TenantProfile> {
    const request = updateTenantProfileRequestSchema.parse(input);
    return commitAdmin((draft) => updateTenant(draft, request, expectedVersion, this.actor, new Date().toISOString()));
  }
}
