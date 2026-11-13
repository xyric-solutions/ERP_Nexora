import type { OrganisationType } from "@nexora/contracts";

/** Labels shared by the Tenant Directory and the public /register page. */
export const organisationTypeLabels: Record<OrganisationType, string> = {
  sole_proprietorship: "Sole proprietorship",
  partnership: "Partnership",
  private_limited: "Private limited company",
  public_limited: "Public limited company",
  non_profit: "Non-profit",
  government: "Government",
  other: "Other",
};

export const monthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Common countries first; any other ISO 3166-1 alpha-2 code can be typed where a free field is offered. */
export const countryOptions: readonly { code: string; name: string }[] = [
  { code: "PK", name: "Pakistan" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "OM", name: "Oman" },
  { code: "BH", name: "Bahrain" },
  { code: "KW", name: "Kuwait" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "IN", name: "India" },
  { code: "BD", name: "Bangladesh" },
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
];

export function countryName(code: string): string {
  return countryOptions.find((country) => country.code === code)?.name ?? code;
}
