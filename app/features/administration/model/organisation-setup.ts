import {
  countryCodeSchema,
  currencyCodeSchema,
  financialYearStartMonthSchema,
  organisationTypeSchema,
  type OrganisationType,
  type TenantProfile,
} from "@nexora/contracts";
import { z } from "zod";

/**
 * First-login organisation setup for a Super Admin.
 *
 * PROTOTYPE STORAGE: the tenant profile tables are part of the deferred Administration
 * Phase 2 migrations, so the completed setup is kept in this browser (per organisation)
 * and seeds the Administration tenant profile. Swap `saveOrganisationSetup` /
 * `readOrganisationSetup` for the tenant profile API once it is mounted.
 */

/** Shown after the workspace name; change here when the real domain is decided. */
export const workspaceDomainSuffix = ".erp-system.com";

export const industryOptions = [
  "Retail",
  "Manufacturing",
  "Services",
  "Wholesale & Distribution",
  "Construction",
  "Healthcare",
  "Education",
  "Technology",
  "Hospitality",
  "Agriculture",
  "Logistics & Transport",
  "Financial Services",
  "Other",
] as const;
export type Industry = (typeof industryOptions)[number];

export const currencyOptions = [
  "PKR",
  "USD",
  "AED",
  "SAR",
  "QAR",
  "OMR",
  "BHD",
  "KWD",
  "GBP",
  "EUR",
  "INR",
  "BDT",
  "MYR",
  "SGD",
] as const;

/** Default base currency for each country offered in the country list. */
export const countryCurrency: Readonly<Record<string, string>> = {
  PK: "PKR",
  AE: "AED",
  SA: "SAR",
  QA: "QAR",
  OM: "OMR",
  BH: "BHD",
  KW: "KWD",
  GB: "GBP",
  US: "USD",
  IN: "INR",
  BD: "BDT",
  MY: "MYR",
  SG: "SGD",
};

export const accountingMethodSchema = z.enum(["accrual", "cash"]);
export type AccountingMethod = z.infer<typeof accountingMethodSchema>;
export const accountingMethodLabels: Record<AccountingMethod, string> = {
  accrual: "Accrual basis",
  cash: "Cash basis",
};

/** Business-type labels as owners usually say them. Values reuse the tenant profile enum. */
export const businessTypeLabels: Record<OrganisationType, string> = {
  sole_proprietorship: "Sole Proprietorship",
  partnership: "Partnership",
  private_limited: "Private Limited (LLC)",
  public_limited: "Public Limited / Corporation",
  non_profit: "Non-profit",
  government: "Government",
  other: "Other",
};

/** The month a 12-month financial year ends in, given the month it starts in (1–12). */
export function fiscalYearEndMonth(startMonth: number): number {
  return ((startMonth + 10) % 12) + 1;
}

/** The month a 12-month financial year starts in, given the month it ends in (1–12). */
export function fiscalYearStartMonth(endMonth: number): number {
  return (endMonth % 12) + 1;
}

/** Suggests a workspace name from the company name: lower case, letters, digits and hyphens. */
export function suggestWorkspaceSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** What the form submits. The password is handled separately and never stored. */
export const organisationSetupSchema = z.strictObject({
  admin_full_name: requiredText(200),
  admin_email: z.email().trim().max(320),
  admin_phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s()-]{6,19}$/),
  company_name: z.string().trim().min(2).max(200),
  business_type: organisationTypeSchema,
  industry: z.enum(industryOptions),
  workspace_slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/),
  country_code: countryCodeSchema,
  tax_registration_number: z.string().trim().max(40),
  financial_year_start_month: financialYearStartMonthSchema,
  base_currency: currencyCodeSchema,
  accounting_method: accountingMethodSchema,
});
export type OrganisationSetup = z.infer<typeof organisationSetupSchema>;
export type OrganisationSetupField = keyof OrganisationSetup;

const storedSetupSchema = organisationSetupSchema.extend({
  tenant_id: z.string().min(1).max(128),
  completed_by: z.string().min(1).max(128),
  completed_at: z.iso.datetime({ offset: true }),
});
export type StoredOrganisationSetup = z.infer<typeof storedSetupSchema>;

/** Plain-language message for each field that fails validation. */
export const setupFieldMessages: Record<OrganisationSetupField, string> = {
  admin_full_name: "Enter your full name.",
  admin_email: "Enter a valid work email.",
  admin_phone: "Enter a phone number with 7 to 20 digits, for example +92 300 1234567.",
  company_name: "Enter the business or company name.",
  business_type: "Choose a business type.",
  industry: "Choose a business category.",
  workspace_slug: "Use 3–63 lower-case letters, numbers or hyphens. It can't start or end with a hyphen.",
  country_code: "Choose a country or region.",
  tax_registration_number: "Use 40 characters or fewer.",
  financial_year_start_month: "Choose when your financial year starts.",
  base_currency: "Choose a base currency.",
  accounting_method: "Choose an accounting method.",
};

const storageKey = (tenantId: string) => `nexora.organisation-setup.v1:${tenantId}`;

export function readOrganisationSetup(tenantId: string): StoredOrganisationSetup | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(storageKey(tenantId));
    if (!raw) return null;
    const parsed = storedSetupSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.tenant_id === tenantId ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Saves the completed setup. Returns false when the browser refuses storage (private mode, blocked site data). */
export function saveOrganisationSetup(setup: StoredOrganisationSetup): boolean {
  try {
    window.localStorage.setItem(storageKey(setup.tenant_id), JSON.stringify(storedSetupSchema.parse(setup)));
    return true;
  } catch {
    return false;
  }
}

/** The Administration tenant profile fields this setup answers. */
export function tenantProfileFromSetup(
  setup: StoredOrganisationSetup,
): Pick<
  TenantProfile,
  "organisation_type" | "name" | "country_code" | "financial_year_start_month" | "base_currency" | "registered_at"
> {
  return {
    organisation_type: setup.business_type,
    name: setup.company_name,
    country_code: setup.country_code,
    financial_year_start_month: setup.financial_year_start_month,
    base_currency: setup.base_currency,
    registered_at: setup.completed_at,
  };
}
