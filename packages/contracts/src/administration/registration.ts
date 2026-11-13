import { z } from "zod";

import {
  countryCodeSchema,
  currencyCodeSchema,
  financialYearStartMonthSchema,
  organisationTypeSchema,
} from "./tenant-profile.js";

/**
 * Public organisation sign-up (`POST /auth/register`, plan D5). Creates the
 * organisation, its first company and the registering person as Super Admin.
 * Employees cannot self-register.
 */
export const registerOrganisationRequestSchema = z
  .strictObject({
    organisation_type: organisationTypeSchema,
    organisation_name: z.string().trim().min(2).max(200),
    country_code: countryCodeSchema,
    financial_year_start_month: financialYearStartMonthSchema,
    base_currency: currencyCodeSchema.optional(),
    admin_full_name: z.string().trim().min(1).max(200),
    admin_email: z.email().trim().max(320),
    admin_password: z.string().min(8).max(1_024),
    admin_password_confirmation: z.string().min(8).max(1_024),
  })
  .refine((body) => body.admin_password === body.admin_password_confirmation, {
    message: "passwords do not match",
    path: ["admin_password_confirmation"],
  });
export type RegisterOrganisationRequest = z.infer<typeof registerOrganisationRequestSchema>;

/**
 * Deliberately identical whether or not the email already exists, so the
 * endpoint never reveals registered addresses.
 */
export const registerOrganisationResponseSchema = z.strictObject({
  status: z.literal("accepted"),
  next: z.literal("login"),
});
export type RegisterOrganisationResponse = z.infer<typeof registerOrganisationResponseSchema>;
