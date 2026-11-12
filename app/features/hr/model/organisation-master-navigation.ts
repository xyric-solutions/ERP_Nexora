import { BriefcaseBusiness, GraduationCap, Layers3, MapPin, Network, Wallet } from "lucide-react";

export const organisationMasterGroups = [
  {
    id: "organisation",
    label: "Organisation",
    description: "Define your structure and where your people work.",
    items: [
      {
        id: "org-structure",
        label: "Organisation Structure",
        description: "Company, projects, locations and departments in one hierarchy.",
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
        description: "Employee positions, such as Software Engineer or Community Handler.",
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
        description: "Job titles linked to the department they belong to.",
        icon: Layers3,
        type: "job",
      },
    ],
  },
] as const;

export const organisationMasterPages = organisationMasterGroups.flatMap((group) => [...group.items]);
export type OrganisationMasterPage = (typeof organisationMasterPages)[number];

/** Former page IDs that now open a merged page, so saved links keep working. */
const legacyMasterPageAliases: Readonly<Record<string, string>> = {
  "employment-types": "cost-centres",
  "employee-categories": "cost-centres",
  // Employment Setup merged into Cost Centre (HR149).
  "employment-setup": "cost-centres",
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
