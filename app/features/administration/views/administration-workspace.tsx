"use client";

import { HrOrganizationStructureSheetWorkspace } from "@prototype/features/hr/views/hr-organization-structure-sheet-workspace";

import { AdminPage } from "../components/admin-page";
import { AccessLevelsView } from "./access-levels";
import { AdminActivityLogView } from "./admin-activity-log";
import { AdminCompaniesView } from "./admin-companies";
import { AdminDashboardView } from "./admin-dashboard";
import { AdminUsersView } from "./admin-users";
import { TenantDirectoryView } from "./tenant-directory";

export const administrationPageIds = [
  "admin-dashboard",
  "tenants",
  "companies",
  "structure",
  "users",
  "access-levels",
  "admin-audit",
] as const;

export function isAdministrationPage(pageId: string): boolean {
  return (administrationPageIds as readonly string[]).includes(pageId);
}

/** Administration module pages (plan §3 target menu). */
export function AdministrationWorkspace({
  pageId,
  recordRef,
  onNavigate,
}: {
  pageId: string;
  recordRef?: string;
  onNavigate: (moduleId: string, pageId: string) => void;
}) {
  switch (pageId) {
    case "admin-dashboard":
      return <AdminDashboardView onOpenUsers={() => onNavigate("administration", "users")} />;
    case "tenants":
      return <TenantDirectoryView />;
    case "companies":
      return <AdminCompaniesView onOpenStructure={() => onNavigate("administration", "structure")} />;
    case "structure":
      // Same organisation units and codes as HR (plan D8); embedded, not copied.
      return (
        <AdminPage
          title="Structure"
          description="Locations, projects and departments under each company. These are the same records HR and Accounting use."
        >
          <HrOrganizationStructureSheetWorkspace />
        </AdminPage>
      );
    case "users":
      return <AdminUsersView key={recordRef ?? "list"} recordRef={recordRef} />;
    case "access-levels":
      return <AccessLevelsView />;
    case "admin-audit":
      return <AdminActivityLogView />;
    default:
      return null;
  }
}
