import { BriefcaseBusiness, GraduationCap, Layers3, MapPin, Network, Tags, Users, Wallet } from "lucide-react";

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
    description: "Set the employment categories behind your policies.",
    items: [
      {
        id: "employment-types",
        label: "Employment Types",
        description: "Permanent, contract, internship and other arrangements.",
        icon: Users,
        type: "employment_type",
      },
      {
        id: "employee-categories",
        label: "Employee Categories",
        description: "Group employees for policies, benefits and pay cycles.",
        icon: Tags,
        type: "employee_category",
      },
    ],
  },
] as const;

export const organisationMasterPages = organisationMasterGroups.flatMap((group) => [...group.items]);
export const isOrganisationMasterPage = (pageId: string) =>
  pageId === "organisation-masters" || organisationMasterPages.some((page) => page.id === pageId);

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
