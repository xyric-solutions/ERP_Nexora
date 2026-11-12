"use client";

import { HrLandingPage } from "../components/hr-landing";
import { peopleLandingSummaries } from "../model/hr-landing-summaries";

import type { ReactNode } from "react";
import { HrSectionHeader } from "../components/hr-section-header";
import { peopleGroups, peoplePages } from "../model/people-navigation";

/** Landing cards are the People entry points; inner tabs use each group's pages. */
const peopleLandingGroups = peopleGroups.map((group) => ({ ...group, pages: group.cards }));

export function HrPeopleWorkspace({
  pageId,
  employeeId,
  onNavigate,
  children,
}: {
  pageId: string;
  employeeId?: string;
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
  children?: ReactNode;
}) {
  const active = peoplePages.find((page) => page.id === pageId);
  const currentGroup = peopleGroups.find((group) => group.pages.some((page) => page.id === pageId));
  // Groups with `tabs` show only those pages as tabs; `tools` become header actions.
  const groupTabs: readonly string[] | undefined =
    currentGroup && "tabs" in currentGroup ? currentGroup.tabs : undefined;
  const groupTools: readonly string[] = currentGroup && "tools" in currentGroup ? currentGroup.tools : [];
  const sectionTabs = (currentGroup?.pages ?? []).filter((page) =>
    groupTabs ? groupTabs.includes(page.id) : page.id !== "employee-record" || employeeId,
  );
  const groupToolsTab = currentGroup && "toolsTab" in currentGroup ? currentGroup.toolsTab : undefined;
  const go = (target: string) =>
    onNavigate(
      "hr",
      target,
      target.startsWith("employee-") && target !== "employee-drafts" && target !== "employee-approvals"
        ? employeeId
        : undefined,
    );

  return (
    <section aria-label="People workspace" className="min-w-0">
      {active && currentGroup ? (
        <>
          <HrSectionHeader
            title={currentGroup.label}
            backLabel="Back to all people"
            onBack={() => go("people-workspace")}
            pages={sectionTabs}
            activeId={
              sectionTabs.some((page) => page.id === pageId)
                ? pageId
                : groupTools.includes(pageId) && groupToolsTab
                  ? groupToolsTab
                  : (sectionTabs[0]?.id ?? pageId)
            }
            onSelect={go}
            navLabel={`${currentGroup.label} pages`}
          />
          {children}
        </>
      ) : (
        <HrLandingPage
          title="People"
          idPrefix="people-hub"
          groups={peopleLandingGroups}
          loaders={peopleLandingSummaries}
          onOpen={go}
        />
      )}
    </section>
  );
}
