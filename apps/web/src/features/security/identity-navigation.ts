export type IdentityWorkspaceTab = "users" | "roles";
export type IdentitySection = "records" | "assignments" | "approvals" | "permissions" | "audit";
export type IdentityApprovalType = "user" | "role" | "assignment";
export interface IdentityLocation {
  tab: IdentityWorkspaceTab;
  section: IdentitySection;
  approvalType: IdentityApprovalType;
  userId: string | null;
  rolePolicyId: string | null;
}

export function identityLocation(search: Pick<URLSearchParams, "get">): IdentityLocation {
  const requested = search.get("tab");
  const requestedType = search.get("resource_type");
  const tab = requested === "users" || (requested === "approvals" && requestedType === "user") ? "users" : "roles";
  const sectionValue = requested === "users" || requested === "roles" ? search.get("section") : requested;
  const section: IdentitySection =
    sectionValue === "assignments" || sectionValue === "approvals" || sectionValue === "audit"
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
  };
}

export function identityHref(location: IdentityLocation): string {
  const query = new URLSearchParams({ tab: location.tab });
  if (location.section !== "records") query.set("section", location.section);
  if (location.section === "approvals") query.set("resource_type", location.approvalType);
  if (location.userId) query.set("user", location.userId);
  if (location.rolePolicyId) query.set("role", location.rolePolicyId);
  return `/admin/identity?${query}`;
}
