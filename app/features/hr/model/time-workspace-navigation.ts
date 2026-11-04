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

/**
 * Attendance & Leave: the former "Attendance & Shifts" and "Time & Leave" areas, merged. Every page keeps its
 * route; the duplicate Time & Leave "Attendance" page (same screen as Daily Attendance) and the old landing page
 * are hidden aliases (see timePageAliases).
 */
export const attendanceLeaveWorkspace = {
  id: "attendance-workspace",
  label: "Attendance & Leave",
  finder: false,
  groups: [
    {
      id: "shift-setup",
      label: "Shift Setup",
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
      id: "leave-setup",
      label: "Leave Setup",
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
      id: "daily-attendance",
      label: "Daily Attendance",
      description: "Review attendance, corrections and overtime evidence.",
      pages: [
        {
          id: "daily-attendance",
          label: "Daily Attendance",
          description: "Review daily attendance, punches and exceptions.",
          icon: CalendarCheck,
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
      id: "leave-requests",
      label: "Leave Requests",
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
      id: "month-end",
      label: "Month-end & Payroll",
      description: "Review the month, close it and prepare payroll inputs.",
      pages: [
        {
          id: "monthly-attendance",
          label: "Monthly Attendance",
          description: "Inspect employee attendance across the month.",
          icon: CalendarDays,
        },
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

/** Former page IDs kept so saved links and existing cross-links keep opening the right screen. */
const timePageAliases: Readonly<Record<string, string>> = {
  "time-leave-workspace": "attendance-workspace",
  attendance: "daily-attendance",
};
export const resolveTimePageId = (pageId: string) => timePageAliases[pageId] ?? pageId;

export const timeWorkspaces = [attendanceLeaveWorkspace];
export const findTimeWorkspace = (pageId: string) => {
  const resolved = resolveTimePageId(pageId);
  return timeWorkspaces.find(
    (workspace) =>
      workspace.id === resolved || workspace.groups.some((group) => group.pages.some((page) => page.id === resolved)),
  );
};
