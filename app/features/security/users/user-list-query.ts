export interface UserListFilters {
  search: string;
  status: "" | "active" | "inactive" | "locked";
  employeeLink: "" | "true" | "false";
  archived?: "" | "true" | "false";
}

export function buildSecurityUserListQuery(filters: UserListFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.employeeLink) params.set("employee_linked", filters.employeeLink);
  if (filters.archived) params.set("archived", filters.archived);
  const value = params.toString();
  return value ? `?${value}` : "";
}
