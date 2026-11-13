import { isSuperAdmin, type SessionResponse } from "@nexora/contracts";

import type { AdminState } from "./admin-workflow";

/**
 * Prototype seed: the signed-in user plus a few sample employees so the matrix,
 * dashboard and filters have something to show. Sample users are clearly fictional.
 */
export function createAdminSeed(session: SessionResponse, now: string): AdminState {
  const company = session.active_company ?? { id: "company", code: "CO-001", name: "Head office" };
  const companies = [{ id: company.id, code: company.code, name: company.name }];
  const companyAccess = [{ company_id: company.id, company_name: company.name, is_default: true }];
  const base = {
    employee_id: null,
    companies: companyAccess,
    last_login_at: null,
    end_date: null,
    created_at: now,
    updated_at: now,
    row_version: 1,
  };
  const username = session.user.email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, ".")
    .replace(/^[^a-z0-9]+/, "")
    .padEnd(3, "0");
  return {
    tenant: {
      tenant_id: session.tenant_id,
      organisation_type: "private_limited",
      name: company.name,
      country_code: "PK",
      financial_year_start_month: 7,
      base_currency: null,
      registered_at: null,
      row_version: 1,
    },
    companies,
    users: [
      {
        ...base,
        id: session.user.id,
        display_name: session.user.display_name,
        username,
        email: session.user.email,
        status: "active",
        super_admin: isSuperAdmin(session.user.permissions),
        must_change_password: false,
        access: {},
        last_login_at: now,
      },
      {
        ...base,
        id: "USR-901",
        display_name: "Sample Accountant",
        username: "sample.accountant",
        email: "sample.accountant@example.com",
        status: "active",
        super_admin: false,
        must_change_password: true,
        access: { finance: "user", banking: "view" },
      },
      {
        ...base,
        id: "USR-902",
        display_name: "Sample HR Manager",
        username: "sample.hr",
        email: "sample.hr@example.com",
        status: "active",
        super_admin: false,
        must_change_password: false,
        access: { hr: "admin" },
      },
      {
        ...base,
        id: "USR-903",
        display_name: "Sample Buyer",
        username: "sample.buyer",
        email: "sample.buyer@example.com",
        status: "inactive",
        super_admin: false,
        must_change_password: false,
        access: { purchases: "user", inventory: "view" },
      },
    ],
    audit: [],
  };
}
