"use client";

import { HrLandingPage } from "../components/hr-landing";
import { recruitmentLandingSummaries } from "../model/hr-landing-summaries";

import type { ReactNode } from "react";
import { HrSectionHeader } from "../components/hr-section-header";
import { recruitmentGroups, recruitmentPages } from "../model/recruitment-navigation";

export function HrRecruitmentWorkspace({
  pageId,
  onNavigate,
  children,
}: {
  pageId: string;
  onNavigate: (moduleId: string, pageId: string) => void;
  children?: ReactNode;
}) {
  const active = recruitmentPages.find((page) => page.id === pageId);
  const group = recruitmentGroups.find((item) => item.pages.some((page) => page.id === pageId));
  const go = (target: string) => onNavigate("hr", target);

  return (
    <section aria-label="Recruitment workspace" className="min-w-0">
      {active && group ? (
        <>
          <HrSectionHeader
            title={group.label}
            backLabel="Back to all recruitment"
            onBack={() => go("recruitment-workspace")}
            pages={group.pages}
            activeId={active.id}
            onSelect={go}
            navLabel={`${group.label} pages`}
          />
          {children}
        </>
      ) : (
        <HrLandingPage
          title="Recruitment"
          idPrefix="recruitment-hub"
          groups={recruitmentGroups}
          loaders={recruitmentLandingSummaries}
          onOpen={go}
        />
      )}
    </section>
  );
}
