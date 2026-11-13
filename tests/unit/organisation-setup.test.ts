// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  fiscalYearEndMonth,
  fiscalYearStartMonth,
  organisationSetupSchema,
  readOrganisationSetup,
  saveOrganisationSetup,
  suggestWorkspaceSlug,
  tenantProfileFromSetup,
  type StoredOrganisationSetup,
} from "../../app/features/administration/model/organisation-setup";

const valid = {
  admin_full_name: "Ayesha Khan",
  admin_email: "ayesha@example.com",
  admin_phone: "+92 300 1234567",
  company_name: "Khan Traders",
  business_type: "private_limited",
  industry: "Retail",
  workspace_slug: "khan-traders",
  country_code: "PK",
  tax_registration_number: "",
  financial_year_start_month: 7,
  base_currency: "PKR",
  accounting_method: "accrual",
} as const;

const stored = (tenantId = "tenant-a"): StoredOrganisationSetup => ({
  ...organisationSetupSchema.parse(valid),
  tenant_id: tenantId,
  completed_by: "user-1",
  completed_at: "2026-11-13T09:00:00.000Z",
});

afterEach(() => window.localStorage.clear());

describe("organisation setup", () => {
  it("links the fiscal year end month to the start month", () => {
    expect(fiscalYearEndMonth(1)).toBe(12);
    expect(fiscalYearEndMonth(7)).toBe(6);
    expect(fiscalYearStartMonth(6)).toBe(7);
    expect(fiscalYearStartMonth(12)).toBe(1);
    for (let month = 1; month <= 12; month += 1) expect(fiscalYearStartMonth(fiscalYearEndMonth(month))).toBe(month);
  });

  it("suggests a workspace name from the company name", () => {
    expect(suggestWorkspaceSlug("  Khan & Sons Traders (Pvt) Ltd. ")).toBe("khan-sons-traders-pvt-ltd");
    expect(organisationSetupSchema.shape.workspace_slug.safeParse("-bad").success).toBe(false);
    expect(organisationSetupSchema.shape.workspace_slug.safeParse("ok-name").success).toBe(true);
  });

  it("requires every field except the tax number", () => {
    expect(organisationSetupSchema.safeParse(valid).success).toBe(true);
    const result = organisationSetupSchema.safeParse({ ...valid, admin_phone: "abc", accounting_method: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["accounting_method", "admin_phone"]);
  });

  it("saves per organisation and never stores a password", () => {
    expect(readOrganisationSetup("tenant-a")).toBeNull();
    expect(saveOrganisationSetup(stored())).toBe(true);
    expect(readOrganisationSetup("tenant-a")?.company_name).toBe("Khan Traders");
    expect(readOrganisationSetup("tenant-b")).toBeNull();
    expect(JSON.stringify(window.localStorage)).not.toMatch(/password/i);
  });

  it("ignores a corrupted saved record", () => {
    window.localStorage.setItem("nexora.organisation-setup.v1:tenant-a", "{not json");
    expect(readOrganisationSetup("tenant-a")).toBeNull();
  });

  it("maps to the Administration tenant profile", () => {
    expect(tenantProfileFromSetup(stored())).toEqual({
      organisation_type: "private_limited",
      name: "Khan Traders",
      country_code: "PK",
      financial_year_start_month: 7,
      base_currency: "PKR",
      registered_at: "2026-11-13T09:00:00.000Z",
    });
  });
});
