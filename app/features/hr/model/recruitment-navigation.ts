import { BriefcaseBusiness, CalendarDays, ClipboardCheck, FileCheck2, GitBranch, UserPlus, Users } from "lucide-react";

export const recruitmentGroups = [
  {
    id: "planning",
    label: "Plan & Publish",
    description: "Approve staffing needs and open roles for hiring.",
    pages: [
      {
        id: "manpower-requisitions",
        label: "Manpower Requisitions",
        description: "Prepare and review staffing requests before opening a role.",
        icon: ClipboardCheck,
      },
      {
        id: "job-openings",
        label: "Job Openings",
        description: "Manage approved vacancies and their publication status.",
        icon: BriefcaseBusiness,
      },
    ],
  },
  {
    id: "selection",
    label: "Candidates & Selection",
    description: "Manage applicants from first contact through evaluation.",
    pages: [
      {
        id: "candidates",
        label: "Candidate Directory",
        description: "Maintain candidate profiles, contact details and sources.",
        icon: Users,
      },
      {
        id: "recruitment-pipeline",
        label: "Recruitment Pipeline",
        description: "Track applications and move candidates through hiring stages.",
        icon: GitBranch,
      },
      {
        id: "interviews",
        label: "Interviews & Evaluations",
        description: "Schedule interviews and capture evaluation outcomes.",
        icon: CalendarDays,
      },
    ],
  },
  {
    id: "hiring",
    label: "Offer & Join",
    description: "Review offers and prepare approved hires for employee onboarding.",
    pages: [
      {
        id: "offers",
        label: "Offer Management",
        description: "Prepare, approve and track candidate offers.",
        icon: FileCheck2,
      },
      {
        id: "create-employee-from-offer",
        label: "Create Employee from Offer",
        description: "Convert an eligible accepted offer into an employee draft.",
        icon: UserPlus,
      },
    ],
  },
] as const;

export const recruitmentPages = recruitmentGroups.flatMap((group) => [...group.pages]);
export const isRecruitmentPage = (id: string) =>
  id === "recruitment-workspace" || recruitmentPages.some((page) => page.id === id);
