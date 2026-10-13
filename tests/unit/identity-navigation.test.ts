import { describe, expect, it } from "vitest";
import { identityHref, identityLocation } from "../../apps/web/src/features/security/identity-navigation.js";

describe("two-tab Identity workspace deep links", () => {
  it.each([
    ["tab=roles", "roles", "records", "role"],
    ["tab=users&user=target", "users", "records", "user"],
    ["tab=permissions", "roles", "permissions", "role"],
    ["tab=assignments", "roles", "assignments", "role"],
    ["tab=approvals", "roles", "approvals", "role"],
    ["tab=approvals&resource_type=user", "users", "approvals", "user"],
    ["tab=users&section=approvals&resource_type=assignment", "users", "approvals", "assignment"],
    ["tab=audit", "roles", "audit", "role"],
  ])("preserves %s", (query, tab, section, approvalType) => {
    expect(identityLocation(new URLSearchParams(query))).toMatchObject({ tab, section, approvalType });
  });
  it("preserves contextual nested links and escapes identifiers", () => {
    const location = identityLocation(new URLSearchParams("tab=users&section=audit&user=target%26other"));
    expect(identityHref(location)).toBe("/admin/identity?tab=users&section=audit&user=target%26other");
    expect(identityLocation(new URLSearchParams(identityHref(location).split("?")[1]))).toEqual(location);
  });
  it("does not allow a user workspace to become an independent permission editor", () => {
    expect(identityLocation(new URLSearchParams("tab=users&section=permissions&resource_type=role"))).toMatchObject({
      section: "records",
      approvalType: "user",
      rolePolicyId: null,
    });
  });
});
