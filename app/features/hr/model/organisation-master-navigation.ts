import { BriefcaseBusiness, GraduationCap, Layers3, MapPin, Network, Users, Wallet } from "lucide-react";

export const organisationMasterGroups = [
  {
    id: "organisation",
    label: "Organisation",
    description: "Define your structure and where your people work.",
    items: [
      {
        id: "org-structure",
        label: "Organisation Structure",
        description: "Companies, branches and departments in one hierarchy.",
        icon: Network,
        type: null,
      },
      {
        id: "work-locations",
        label: "Work Locations",
        description: "Offices, remote locations and working arrangements.",
        icon: MapPin,
        type: "work_location",
      },
      {
        id: "cost-centres",
        label: "Cost Centres",
        description: "Connect people and expenses to the right business area.",
        icon: Wallet,
        type: "cost_center",
      },
    ],
  },
  {
    id: "job-structure",
    label: "Job Structure",
    description: "Organise roles, titles and progression levels.",
    items: [
      {
        id: "designations",
        label: "Designations",
        description: "Standard titles used across employee assignments.",
        icon: BriefcaseBusiness,
        type: "designation",
      },
      {
        id: "job-grades",
        label: "Job Grades",
        description: "Grade levels and optional compensation bands.",
        icon: GraduationCap,
        type: "job_grade",
      },
      {
        id: "jobs",
        label: "Jobs",
        description: "Reusable job definitions for hiring and placement.",
        icon: Layers3,
        type: "job",
      },
    ],
  },
  {
    id: "employment",
    label: "Employment Setup",
    description: "Set the payment route and pay cycle behind each employment arrangement.",
    items: [
      {
        id: "employment-setup",
        label: "Employment Setup",
        description: "Payment route and pay cycle for each employment arrangement.",
        icon: Users,
        type: "employment_setup",
      },
    ],
  },
] as const;

export const organisationMasterPages = organisationMasterGroups.flatMap((group) => [...group.items]);
export type OrganisationMasterPage = (typeof organisationMasterPages)[number];

/** Former page IDs that now open a merged page, so saved links keep working. */
const legacyMasterPageAliases: Readonly<Record<string, string>> = {
  "employment-types": "employment-setup",
  "employee-categories": "employment-setup",
};
export const resolveOrganisationMasterPageId = (pageId: string) => legacyMasterPageAliases[pageId] ?? pageId;
export const isOrganisationMasterPage = (pageId: string) => {
  const resolved = resolveOrganisationMasterPageId(pageId);
  return resolved === "organisation-masters" || organisationMasterPages.some((page) => page.id === resolved);
};

const companyStorageKey = "nexora.hr.master.company";
export function rememberMasterCompany(companyId: string) {
  try {
    sessionStorage.setItem(companyStorageKey, companyId);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function preferredMasterCompany(companies: readonly { id: string }[]): string {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(companyStorageKey);
  } catch {
    /* Use the first authorized company. */
  }
  return companies.find((company) => company.id === saved)?.id ?? companies[0]?.id ?? "";
}
