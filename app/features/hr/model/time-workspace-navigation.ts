import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Layers3,
  LockKeyhole,
  Settings2,
  UserRoundCheck,
  Wallet,
} from "lucide-react";

export const attendanceWorkspace = {
  id: "attendance-workspace",
  label: "Attendance & Shifts",
  groups: [
    {
      id: "setup",
      label: "Shifts & Assignments",
      description: "Define working rules and assign effective schedules.",
      pages: [
        {
          id: "shifts",
          label: "Shifts & Rules",
          description: "Maintain shift rules, breaks, rotations and availability.",
          icon: Settings2,
        },
        {
          id: "shift-assignments",
          label: "Shift Assignments",
          description: "Allocate schedules to employees and organisational units.",
          icon: UserRoundCheck,
        },
      ],
    },
    {
      id: "attendance",
      label: "Attendance & Review",
      description: "Review attendance, corrections and overtime evidence.",
      pages: [
        {
          id: "daily-attendance",
          label: "Daily Attendance",
          description: "Review daily attendance, punches and exceptions.",
          icon: CalendarCheck,
        },
        {
          id: "monthly-attendance",
          label: "Monthly Attendance",
          description: "Inspect employee attendance across the month.",
          icon: CalendarDays,
        },
        {
          id: "attendance-corrections",
          label: "Attendance Corrections",
          description: "Prepare corrections and review their approval evidence.",
          icon: ClipboardCheck,
        },
        {
          id: "overtime",
          label: "Overtime",
          description: "Maintain operational rules and review overtime requests.",
          icon: Clock3,
        },
      ],
    },
    {
      id: "close",
      label: "Period Close & Inputs",
      description: "Review attendance before closing the month and preparing payroll inputs.",
      pages: [
        {
          id: "attendance-period",
          label: "Attendance Period Close",
          description: "Process and review the attendance month before locking it.",
          icon: LockKeyhole,
        },
        {
          id: "attendance-payroll-inputs",
          label: "Attendance → Payroll Inputs",
          description: "Inspect finalized attendance inputs and their source evidence.",
          icon: FileCheck2,
        },
      ],
    },
  ],
} as const;

export const leaveWorkspace = {
  id: "time-leave-workspace",
  label: "Time & Leave",
  groups: [
    {
      id: "policies",
      label: "Policies & Balances",
      description: "Maintain leave policies and review employee entitlements.",
      pages: [
        {
          id: "leave-types",
          label: "Leave Types",
          description: "Define leave types and effective policy versions.",
          icon: Layers3,
        },
        {
          id: "leave-balances",
          label: "Leave Balances",
          description: "Review balances, reservations and authorized ledger adjustments.",
          icon: Wallet,
        },
      ],
    },
    {
      id: "requests",
      label: "Requests & Approvals",
      description: "Prepare requests and manage the existing review process.",
      pages: [
        {
          id: "leave-requests",
          label: "Leave Requests",
          description: "Find leave requests and review their status and history.",
          icon: CalendarRange,
        },
        {
          id: "leave-request",
          label: "Add Leave Request",
          description: "Prepare a request using the employee's eligible leave policy.",
          icon: CalendarClock,
        },
        {
          id: "leave-approval",
          label: "Leave Approval",
          description: "Review request evidence and record authorized decisions.",
          icon: ClipboardCheck,
        },
      ],
    },
    {
      id: "attendance",
      label: "Attendance",
      description: "Check the attendance record alongside leave information.",
      pages: [
        {
          id: "attendance",
          label: "Attendance",
          description: "Open daily attendance and follow links to corrections and monthly review.",
          icon: CalendarCheck,
        },
      ],
    },
  ],
} as const;

export const timeWorkspaces = [attendanceWorkspace, leaveWorkspace];
export const findTimeWorkspace = (pageId: string) =>
  timeWorkspaces.find(
    (workspace) =>
      workspace.id === pageId || workspace.groups.some((group) => group.pages.some((page) => page.id === pageId)),
  );
