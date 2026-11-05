"use client";

import type { ReactNode } from "react";
import { HrSectionHeader } from "../components/hr-section-header";
import { HrLandingPage, type HrLandingGroup } from "../components/hr-landing";
import { useSession } from "@/lib/session/session-provider";
import { organisationLandingSummaries } from "../model/hr-landing-summaries";
import {
  organisationMasterGroups,
  organisationMasterPages,
  resolveOrganisationMasterPageId,
} from "../model/organisation-master-navigation";

export function HrOrganisationMastersWorkspace({
  pageId,
  onNavigate,
  children,
}: {
  pageId: string;
  onNavigate: (moduleId: string, pageId: string) => void;
  children?: ReactNode;
}) {
  const resolvedPageId = resolveOrganisationMasterPageId(pageId);
  const active = organisationMasterPages.find((page) => page.id === resolvedPageId);
  const activeGroup = organisationMasterGroups.find((group) => group.items.some((page) => page.id === resolvedPageId));
  const navigate = (id: string) => onNavigate("hr", id);
  if (active && activeGroup)
    return (
      <section className="min-w-0" aria-label="Organisation & Masters workspace">
        <HrSectionHeader
          title={activeGroup.label}
          backLabel="Back to all masters"
          onBack={() => navigate("organisation-masters")}
          pages={activeGroup.items}
          activeId={active.id}
          onSelect={navigate}
          navLabel={`${activeGroup.label} pages`}
        />
        {children}
      </section>
    );
  return <MastersLanding onOpen={navigate} />;
}

function MastersLanding({ onOpen }: { onOpen: (pageId: string) => void }) {
  const { session } = useSession();
  const permissions = session?.user.permissions ?? [];
  const canReadMaster = permissions.includes("hr.master.read");
  const canReadOrganisation = permissions.includes("hr.organization.read");
  const groups: HrLandingGroup[] = organisationMasterGroups.map((group) => ({
    ...group,
    pages: group.items.map((page) => {
      const permitted = page.type === null ? canReadOrganisation : canReadMaster;
      return {
        id: page.id,
        label: page.label,
        icon: page.icon,
        disabled: !permitted,
        restriction: permitted ? undefined : "Access required",
      };
    }),
  }));
  return (
    <section className="min-w-0" aria-label="Organisation & Masters workspace">
      <HrLandingPage
        title="Organisation & Masters"
        idPrefix="masters-hub"
        groups={groups}
        loaders={organisationLandingSummaries}
        onOpen={onOpen}
      />
    </section>
  );
}
