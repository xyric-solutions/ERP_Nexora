import {
  Award,
  BadgeDollarSign,
  BanknoteArrowDown,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  ListChecks,
  LogOut,
  NotebookTabs,
  ReceiptText,
  Repeat2,
  Scale,
  Sparkles,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";

import { attendanceLeaveWorkspace } from "./time-workspace-navigation";

export const payrollWorkspace = {
  id: "payroll-workspace",
  label: "Payroll",
  groups: [
    {
      id: "design",
      label: "Pay Design",
      description: "Maintain the controlled building blocks used by payroll.",
      pages: [
        {
          id: "payroll-setup",
          label: "Pay Components",
          description: "Define earnings, deductions, calculation methods and posting controls.",
          icon: BadgeDollarSign,
        },
        {
          id: "salary-structures",
          label: "Salary Structures",
          description: "Compose reusable compensation structures from approved pay components.",
          icon: WalletCards,
        },
        {
          id: "salary-revisions",
          label: "Salary Revisions",
          description: "Prepare and approve effective-dated salary changes.",
          icon: Repeat2,
        },
      ],
    },
    {
      id: "process",
      label: "Process & Review",
      description: "Prepare inputs, calculate payroll and complete independent review.",
      pages: [
        {
          id: "payroll-inputs",
          label: "Payroll Inputs",
          description: "Capture governed adjustments and employee payroll inputs.",
          icon: FileSpreadsheet,
        },
        {
          id: "payroll-runs",
          label: "Payroll Runs",
          description: "Calculate period payroll and inspect controlled run states.",
          icon: CircleDollarSign,
        },
        {
          id: "payroll-validation",
          label: "Payroll Review & Approval",
          description: "Review calculated results and record authorized decisions.",
          icon: ClipboardCheck,
        },
      ],
    },
    {
      id: "settle",
      label: "Settle & Publish",
      description: "Manage recoveries, Finance accrual, payment evidence and payslips.",
      pages: [
        {
          id: "employee-loans",
          label: "Loans & Advances",
          description: "Maintain approved advances and scheduled payroll recoveries.",
          icon: HandCoins,
        },
        {
          id: "payroll-journal",
          label: "Payroll Journal",
          description: "Accrue approved payroll into Finance through a balanced journal.",
          icon: Landmark,
        },
        {
          id: "payment-batch",
          label: "Payment Batch",
          description: "Prepare salary obligations and confirm independently posted Bank Payments.",
          icon: BanknoteArrowDown,
        },
        {
          id: "payslips",
          label: "Payslips",
          description: "Publish controlled employee payslips after payroll approval.",
          icon: ReceiptText,
        },
      ],
    },
  ],
} as const;

export const lifecycleWorkspace = {
  id: "employee-lifecycle-workspace",
  label: "Employee Lifecycle",
  groups: [
    {
      id: "join",
      label: "Policy & Joining",
      description: "Govern lifecycle rules and guide new employees through confirmation.",
      pages: [
        {
          id: "lifecycle-policies",
          label: "Lifecycle Policies",
          description: "Maintain controlled onboarding, probation and exit policies.",
          icon: NotebookTabs,
        },
        {
          id: "onboarding",
          label: "Onboarding",
          description: "Track joining tasks, documents, ownership and readiness.",
          icon: UserRoundCheck,
        },
        {
          id: "probation-reviews",
          label: "Probation Reviews",
          description: "Review probation evidence and record the authorized outcome.",
          icon: FileCheck2,
        },
      ],
    },
    {
      id: "move",
      label: "Employee Changes",
      description: "Manage effective-dated employment and organization movements.",
      pages: [
        {
          id: "employee-movements",
          label: "Transfers",
          description: "Employee transfers and movements.",
          icon: BriefcaseBusiness,
        },
        {
          id: "employee-promotions",
          label: "Promotions",
          description: "Employee promotions.",
          icon: Award,
        },
      ],
    },
    {
      id: "benefits",
      label: "Loan Benefits",
      description: "Employee loan and advance requests.",
      pages: [
        {
          id: "loans-benefits",
          label: "Loan Requests",
          description: "Employee loan requests and recoveries.",
          icon: HandCoins,
        },
        {
          id: "advance-requests",
          label: "Advance Requests",
          description: "Employee salary advance requests.",
          icon: Sparkles,
        },
      ],
    },
    {
      id: "exit",
      label: "Resignations & Offboarding",
      description: "Resignations, terminations and exit clearance.",
      pages: [
        {
          id: "resignations",
          label: "Resignations",
          description: "Employee-initiated exits and notice periods.",
          icon: LogOut,
        },
        {
          id: "terminations",
          label: "Termination",
          description: "Employer-initiated exit cases.",
          icon: Scale,
        },
        {
          id: "clearance",
          label: "Exit Clearance",
          description: "Departmental clearance, assets and obligations.",
          icon: ListChecks,
        },
      ],
    },
  ],
} as const;

export const hrSectionWorkspaces = [payrollWorkspace, lifecycleWorkspace] as const;

export const findHrSectionWorkspace = (pageId: string) =>
  hrSectionWorkspaces.find((workspace) => workspace.id === pageId);

/** The operations hub that owns an inner page, so it opens under its parent section's header. */
export const findHrSectionWorkspaceForPage = (pageId: string) =>
  hrSectionWorkspaces.find((workspace) =>
    workspace.groups.some((group) => group.pages.some((page) => page.id === pageId)),
  );

export const compactHrWorkspaces: Record<string, string> = {
  organisation: "organisation-masters",
  people: "people-workspace",
  recruitment: "recruitment-workspace",
  "attendance-leave": attendanceLeaveWorkspace.id,
  payroll: payrollWorkspace.id,
  "employee-lifecycle": lifecycleWorkspace.id,
};
