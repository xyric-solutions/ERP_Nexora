export type IdentityWorkspaceTab = "users" | "roles";
export type IdentitySection =
  "records" | "assignments" | "approvals" | "permissions" | "audit" | "access-reviews" | "delegation" | "policies";
export type IdentityApprovalType = "user" | "role" | "assignment";
export type IdentityUserMode = "list" | "create";
export interface IdentityLocation {
  tab: IdentityWorkspaceTab;
  section: IdentitySection;
  approvalType: IdentityApprovalType;
  userId: string | null;
  rolePolicyId: string | null;
  userMode: IdentityUserMode;
  cursor: string;
}

export function identityLocation(search: Pick<URLSearchParams, "get">): IdentityLocation {
  const requested = search.get("tab");
  const requestedType = search.get("resource_type");
  const requestedCursor = Number(search.get("cursor") ?? "0");
  const tab = requested === "users" || (requested === "approvals" && requestedType === "user") ? "users" : "roles";
  const sectionValue = requested === "users" || requested === "roles" ? search.get("section") : requested;
  const section: IdentitySection =
    sectionValue === "assignments" ||
    sectionValue === "approvals" ||
    sectionValue === "audit" ||
    sectionValue === "access-reviews" ||
    sectionValue === "delegation" ||
    sectionValue === "policies"
      ? sectionValue
      : sectionValue === "permissions" && tab === "roles"
        ? "permissions"
        : "records";
  return {
    tab,
    section,
    approvalType: requestedType === "assignment" ? "assignment" : tab === "users" ? "user" : "role",
    userId: tab === "users" ? (search.get("user") ?? search.get("user_id")) : null,
    rolePolicyId: tab === "roles" ? (search.get("role") ?? search.get("role_policy_id")) : null,
    userMode: tab === "users" && search.get("mode") === "create" ? "create" : "list",
    cursor: String(Number.isSafeInteger(requestedCursor) && requestedCursor >= 0 ? requestedCursor : 0),
  };
}

export function identityHashLocation(hash: string): IdentityLocation {
  const normalized = hash.replace(/^#?\/?/, "");
  const [path, query = ""] = normalized.split("?", 2);
  if (path !== "identity/access") return identityLocation(new URLSearchParams("tab=users"));
  const params = new URLSearchParams(query);
  if (!params.has("tab")) {
    const section = params.get("section");
    params.set(
      "tab",
      section === "access-reviews" || section === "delegation" || section === "policies" ? "roles" : "users",
    );
  }
  return identityLocation(params);
}

export function identityHref(location: IdentityLocation): string {
  const query = new URLSearchParams({ tab: location.tab });
  if (location.section !== "records") query.set("section", location.section);
  if (location.section === "approvals") query.set("resource_type", location.approvalType);
  if (location.userId) query.set("user", location.userId);
  if (location.rolePolicyId) query.set("role", location.rolePolicyId);
  if (location.tab === "users" && location.userMode === "create") query.set("mode", "create");
  if (location.cursor !== "0") query.set("cursor", location.cursor);
  return `/#/identity/access?${query}`;
}
