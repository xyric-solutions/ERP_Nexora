import { BarChart3, BriefcaseBusiness, ClipboardCheck, FileClock, UserPlus, Users, Wallet } from "lucide-react";

export const peopleGroups = [
  {
    id: "records",
    label: "Employee Records",
    description: "Find a person and manage their employee information.",
    pages: [
      { id: "employees", label: "Employee Directory" },
      { id: "employee-record", label: "Employee Overview" },
      { id: "employee-contacts", label: "Contacts" },
      { id: "employee-emergency-contacts", label: "Emergency Contacts" },
      { id: "employee-documents", label: "Documents" },
      { id: "employee-assignments", label: "Assignments" },
      { id: "employee-status-history", label: "History" },
    ],
    cards: [
      {
        id: "employees",
        label: "Employee Directory",
        description:
          "Employee overview, contacts, emergency contacts, documents, assignments and history in one workspace.",
        icon: Users,
      },
    ],
  },
  {
    id: "joining",
    label: "Joining & Approvals",
    description: "Create employee drafts and manage their review.",
    pages: [
      { id: "add-employee", label: "Add Employee" },
      { id: "employee-drafts", label: "Employee Drafts" },
      { id: "employee-approvals", label: "Employee Approvals" },
    ],
    cards: [
      {
        id: "add-employee",
        label: "Add Employee",
        description: "Create a new employee draft for review.",
        icon: UserPlus,
      },
      {
        id: "employee-drafts",
        label: "Employee Drafts",
        description: "Complete draft records and submit them for approval.",
        icon: FileClock,
      },
      {
        id: "employee-approvals",
        label: "Employee Approvals",
        description: "Review employee submissions and personal data corrections.",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    id: "insights",
    label: "Workforce & Insights",
    description: "View organisational placement and workforce dashboards.",
    pages: [
      { id: "positions-org", label: "Positions & Organisation" },
      { id: "hr-dashboard", label: "HR Dashboard" },
      { id: "finance-payroll-dashboard", label: "Finance / Payroll Dashboard" },
    ],
    cards: [
      {
        id: "positions-org",
        label: "Positions & Organisation",
        description: "Understand employees, positions and organisational placement.",
        icon: BriefcaseBusiness,
      },
      {
        id: "hr-dashboard",
        label: "HR Dashboard",
        description: "Review workforce activity and HR actions.",
        icon: BarChart3,
      },
      {
        id: "finance-payroll-dashboard",
        label: "Finance / Payroll Dashboard",
        description: "Review payroll readiness and finance-facing workforce information.",
        icon: Wallet,
      },
    ],
  },
] as const;

export const peoplePages = peopleGroups.flatMap((group) => [...group.pages]);
export const isPeoplePage = (id: string) => id === "people-workspace" || peoplePages.some((page) => page.id === id);
