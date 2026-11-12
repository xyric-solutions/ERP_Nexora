"use client";

import { HrEmployeeDraftsWorkspace } from "./hr-employee-drafts-workspace";

/**
 * Add Employee page: company, search and the employees added so far; the
 * four-step form opens only from "+ Add Employee" (and later from Edit).
 */
export function HrAddEmployeeWorkspace({
  onAction,
}: {
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string) => void;
}) {
  return <HrEmployeeDraftsWorkspace onAction={onAction} allowAdd />;
}
