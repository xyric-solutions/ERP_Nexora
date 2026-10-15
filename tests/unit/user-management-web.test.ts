import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, NexoraApiClient } from "../../app/lib/api/generated.js";
import { buildSecurityUserListQuery } from "../../app/features/security/users/user-list-query.js";
import {
  clearUserWizardDraft,
  loadUserWizardDraft,
  saveUserWizardDraft,
  userWizardDraftKey,
  userWizardSubmissionKey,
  type DraftStorage,
  type UserWizardDraft,
} from "../../app/features/security/users/user-wizard-draft.js";

class MemoryStorage implements DraftStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const draft: UserWizardDraft = {
  version: 1,
  draftId: "draft-123",
  step: 2,
  displayName: "New User",
  username: "new.user",
  email: "new.user@example.test",
  employeeId: "employee-1",
  companyIds: ["company-1"],
  defaultCompanyId: "company-1",
  roleIds: ["role-1"],
};

describe("user management web behavior", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds explicit employee-linked and not-linked PostgreSQL query filters", () => {
    expect(buildSecurityUserListQuery({ search: "", status: "", employeeLink: "true" })).toBe("?employee_linked=true");
    expect(buildSecurityUserListQuery({ search: "A&B", status: "active", employeeLink: "false" })).toBe(
      "?search=A%26B&status=active&employee_linked=false",
    );
  });

  it("filters soft-deleted users explicitly without changing unfiltered query behavior", () => {
    expect(buildSecurityUserListQuery({ search: "", status: "", employeeLink: "", archived: "false" })).toBe(
      "?archived=false",
    );
    expect(buildSecurityUserListQuery({ search: "", status: "", employeeLink: "", archived: "true" })).toBe(
      "?archived=true",
    );
    expect(buildSecurityUserListQuery({ search: "", status: "", employeeLink: "" })).toBe("");
  });

  it("stores, restores, and clears a tenant-and-user scoped browser draft", () => {
    const storage = new MemoryStorage();
    const key = userWizardDraftKey("tenant/a", "admin@example.test");

    saveUserWizardDraft(storage, key, draft);
    expect(key).toContain("tenant%2Fa");
    expect(loadUserWizardDraft(storage, key)).toEqual(draft);
    clearUserWizardDraft(storage, key);
    expect(loadUserWizardDraft(storage, key)).toBeNull();
  });

  it("ignores malformed browser draft data", () => {
    const storage = new MemoryStorage();
    storage.setItem("draft", JSON.stringify({ version: 1, displayName: "Incomplete" }));
    expect(loadUserWizardDraft(storage, "draft")).toBeNull();
  });

  it("preserves the explicit account type and keeps older drafts compatible", () => {
    const storage = new MemoryStorage();
    saveUserWizardDraft(storage, "employee", { ...draft, accountType: "employee" });
    expect(loadUserWizardDraft(storage, "employee")?.accountType).toBe("employee");
    saveUserWizardDraft(storage, "older", draft);
    expect(loadUserWizardDraft(storage, "older")).toEqual(draft);
    storage.setItem("invalid", JSON.stringify({ ...draft, accountType: "administrator" }));
    expect(loadUserWizardDraft(storage, "invalid")).toBeNull();
  });

  it("keeps retries idempotent while using a new key for changed draft content", () => {
    const first = { requested_action: "create", proposal: { username: "new.user" } };
    const changed = { requested_action: "create", proposal: { username: "changed.user" } };
    expect(userWizardSubmissionKey(draft.draftId, first)).toBe(userWizardSubmissionKey(draft.draftId, first));
    expect(userWizardSubmissionKey(draft.draftId, first)).not.toBe(userWizardSubmissionKey(draft.draftId, changed));
  });

  it("surfaces safe API problem details instead of a generic create-user error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: 409,
              detail: "The username or email is already in use.",
              code: "ADMINISTRATION_CONFLICT",
              correlationId: "correlation-1",
            }),
            { status: 409, headers: { "content-type": "application/problem+json" } },
          ),
      ),
    );

    const request = new NexoraApiClient("http://localhost:4200").listSecurityUsers();
    await expect(request).rejects.toMatchObject({
      status: 409,
      code: "ADMINISTRATION_CONFLICT",
      correlationId: "correlation-1",
      message: "The username or email is already in use.",
    } satisfies Partial<ApiError>);
  });

  it("bounds a stalled request and returns a retryable timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
              once: true,
            });
          }),
      ),
    );

    const request = new NexoraApiClient("http://localhost:4200", 5).listSecurityUsers();
    await expect(request).rejects.toMatchObject({ status: 408, code: "REQUEST_TIMEOUT" } satisfies Partial<ApiError>);
  });
});
