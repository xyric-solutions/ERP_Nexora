import { describe, expect, it } from "vitest";
import {
  identityHashLocation,
  identityHref,
  identityLocation,
} from "../../app/features/security/identity-navigation.js";

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
    expect(identityHref(location)).toBe("/#/identity/access?tab=users&section=audit&user=target%26other");
    expect(identityHashLocation(identityHref(location).split("#")[1] ?? "")).toEqual(location);
  });

  it("uses the canonical Identity hash and keeps the base URL on Users", () => {
    expect(identityHashLocation("#/identity/access")).toEqual({
      tab: "users",
      section: "records",
      approvalType: "user",
      userId: null,
      rolePolicyId: null,
      userMode: "list",
      cursor: "0",
    });
    expect(identityHashLocation("#/identity/access?tab=users&mode=create")).toMatchObject({
      tab: "users",
      section: "records",
      userMode: "create",
    });
  });

  it("exposes connected workspace sections without inventing data", () => {
    expect(identityHashLocation("#/identity/access?tab=roles&section=assignments")).toMatchObject({
      tab: "roles",
      section: "assignments",
    });
    expect(identityHashLocation("#/identity/access?section=access-reviews")).toMatchObject({
      section: "access-reviews",
    });
    expect(identityHashLocation("#/identity/access?section=delegation")).toMatchObject({ section: "delegation" });
    expect(identityHashLocation("#/identity/access?section=policies")).toMatchObject({ section: "policies" });
  });
  it("does not allow a user workspace to become an independent permission editor", () => {
    expect(identityLocation(new URLSearchParams("tab=users&section=permissions&resource_type=role"))).toMatchObject({
      section: "records",
      approvalType: "user",
      rolePolicyId: null,
    });
  });
});
