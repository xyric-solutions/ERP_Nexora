import {
  BadgeDollarSign,
  BanknoteArrowDown,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarCheck2,
  ChartNoAxesCombined,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileArchive,
  FileCheck2,
  FileClock,
  FileSpreadsheet,
  GraduationCap,
  HandCoins,
  Landmark,
  ListChecks,
  LogOut,
  NotebookTabs,
  ReceiptText,
  Repeat2,
  Scale,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { attendanceWorkspace, leaveWorkspace } from "./time-workspace-navigation";

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

export const performanceWorkspace = {
  id: "performance-workspace",
  label: "Performance Management",
  groups: [
    {
      id: "plan",
      label: "Plan & Align",
      description: "Set the review cycle and align employee goals with measurable outcomes.",
      pages: [
        {
          id: "performance-cycles",
          label: "Performance Cycles",
          description: "Create governed review periods, dates and rating controls.",
          icon: CalendarCheck2,
        },
        {
          id: "goals-kpis",
          label: "Goals & KPIs",
          description: "Agree weighted employee goals, targets and supporting evidence.",
          icon: Target,
        },
      ],
    },
    {
      id: "review",
      label: "Review & Outcomes",
      description: "Complete reviews and govern the resulting development or recognition actions.",
      pages: [
        {
          id: "performance-reviews",
          label: "Performance Reviews",
          description: "Assess approved goals and submit evidence-backed employee reviews.",
          icon: ClipboardList,
        },
        {
          id: "performance-outcomes",
          label: "Performance Outcomes",
          description: "Approve and follow through development, recognition and promotion outcomes.",
          icon: ChartNoAxesCombined,
        },
      ],
    },
  ],
} as const;

export const learningWorkspace = {
  id: "learning-workspace",
  label: "Learning & Development",
  groups: [
    {
      id: "plan",
      label: "Plan Learning",
      description: "Maintain the learning catalogue and review employee development requests.",
      pages: [
        {
          id: "training-programs",
          label: "Training Programmes",
          description: "Define governed programmes, attendance rules, assessments and providers.",
          icon: GraduationCap,
        },
        {
          id: "training-requests",
          label: "Training Requests",
          description: "Prepare and approve employee participation requests.",
          icon: Send,
        },
      ],
    },
    {
      id: "deliver",
      label: "Deliver & Complete",
      description: "Schedule cohorts, record attendance and issue controlled completion evidence.",
      pages: [
        {
          id: "training-sessions",
          label: "Training Sessions",
          description: "Schedule programme sessions, facilitators and participant capacity.",
          icon: UsersRound,
        },
        {
          id: "training-completions",
          label: "Completion & Certificates",
          description: "Record results and produce verified completion certificates.",
          icon: BookOpenCheck,
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
          label: "Transfers, Promotions & Movements",
          description: "Prepare and approve governed employee placement changes.",
          icon: BriefcaseBusiness,
        },
      ],
    },
    {
      id: "exit",
      label: "Exit & Settlement",
      description: "Coordinate resignation, termination, clearance, settlement and offboarding.",
      pages: [
        {
          id: "resignations",
          label: "Resignations",
          description: "Record employee-initiated exits and notice-period evidence.",
          icon: LogOut,
        },
        {
          id: "terminations",
          label: "Termination Cases",
          description: "Manage employer-initiated exit cases with controlled approval.",
          icon: Scale,
        },
        {
          id: "clearance",
          label: "Exit Clearance",
          description: "Track departmental clearance, assets and unresolved obligations.",
          icon: ListChecks,
        },
        {
          id: "final-settlements",
          label: "Final Settlements",
          description: "Review governed entitlements, deductions and final payroll settlement.",
          icon: CircleDollarSign,
        },
        {
          id: "offboarding",
          label: "Offboarding Control Centre",
          description: "Monitor end-to-end exit readiness and outstanding controls.",
          icon: FileClock,
        },
      ],
    },
  ],
} as const;

export const benefitsWorkspace = {
  id: "benefits-self-service-workspace",
  label: "Benefits & Self-service",
  groups: [
    {
      id: "rewards",
      label: "Benefits & Deductions",
      description: "Review employee benefits and maintain statutory deduction controls.",
      pages: [
        {
          id: "loans-benefits",
          label: "Loans, Benefits & Gratuity",
          description: "Review employee benefit membership, balances and gratuity information.",
          icon: Sparkles,
        },
        {
          id: "statutory-deductions",
          label: "Statutory Deductions",
          description: "Maintain governed statutory tax and contribution settings.",
          icon: ShieldCheck,
        },
      ],
    },
    {
      id: "service",
      label: "Employee Service & Reports",
      description: "Give employees a controlled service view and open HR reporting.",
      pages: [
        {
          id: "employee-self-service",
          label: "Employee Self-service",
          description: "Review personal employment, pay, leave and request information.",
          icon: UsersRound,
        },
        {
          id: "hr-report-centre",
          label: "HR & Payroll Report Centre",
          description: "Run authorized operational and statutory HR reports.",
          icon: FileSpreadsheet,
        },
      ],
    },
  ],
} as const;

export const complianceWorkspace = {
  id: "hr-compliance-workspace",
  label: "Reporting, Compliance & Audit",
  groups: [
    {
      id: "govern",
      label: "Govern Disclosure",
      description: "Control report access, reviewed exports and immutable disclosure evidence.",
      pages: [
        {
          id: "hr-compliance-configuration",
          label: "Compliance Configuration",
          description: "Set permitted reports, row limits and authorization expiry.",
          icon: ShieldCheck,
        },
        {
          id: "hr-export-centre",
          label: "Secure Export Centre",
          description: "Create reviewed export receipts and authorize controlled downloads.",
          icon: FileArchive,
        },
        {
          id: "hr-report-audit-log",
          label: "Report Audit Log",
          description: "Inspect immutable policy, export and download events.",
          icon: ScrollText,
        },
      ],
    },
  ],
} as const;

export const hrSectionWorkspaces = [
  payrollWorkspace,
  performanceWorkspace,
  learningWorkspace,
  lifecycleWorkspace,
  benefitsWorkspace,
  complianceWorkspace,
] as const;

export const findHrSectionWorkspace = (pageId: string) =>
  hrSectionWorkspaces.find((workspace) => workspace.id === pageId);

export const compactHrWorkspaces: Record<string, string> = {
  organisation: "organisation-masters",
  people: "people-workspace",
  recruitment: "recruitment-workspace",
  "attendance-shifts": attendanceWorkspace.id,
  "time-leave": leaveWorkspace.id,
  payroll: payrollWorkspace.id,
  performance: performanceWorkspace.id,
  learning: learningWorkspace.id,
  "employee-lifecycle": lifecycleWorkspace.id,
  "benefits-self-service": benefitsWorkspace.id,
  "hr-compliance": complianceWorkspace.id,
};
