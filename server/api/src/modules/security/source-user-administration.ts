import { randomBytes } from "node:crypto";

import type { CreateSecurityUserRequest } from "@nexora/contracts";

export const userIdentityFields = ["display_name", "username", "email"] as const;
export const userCompanyFields = ["companies"] as const;
export const userEmployeeFields = ["employee_id"] as const;

export function permissionForUserRequest(action: CreateSecurityUserRequest["requested_action"]): string {
  switch (action) {
    case "create":
      return "security.user_account.create";
    case "edit":
    case "employee_link":
      return "security.user_account.edit";
    case "activate":
    case "unlock":
      return "security.user_account.activate";
    case "archive":
      return "security.user_account.archive";
    case "reset_password":
      return "security.user_account.reset_password";
    case "company_access":
      return "security.user_account.company_access";
  }
}

export function fieldsForUserRequest(action: CreateSecurityUserRequest["requested_action"]): readonly string[] {
  switch (action) {
    case "create":
      return [...userIdentityFields, ...userCompanyFields, ...userEmployeeFields, "initial_role_policy_ids"];
    case "edit":
      return userIdentityFields;
    case "company_access":
      return userCompanyFields;
    case "employee_link":
      return userEmployeeFields;
    default:
      return [];
  }
}

export function generateOneTimePassword(): string {
  return randomBytes(24).toString("base64url");
}
