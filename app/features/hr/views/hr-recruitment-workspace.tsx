"use client";

import type { ReactNode } from "react";
import { HrNavCard } from "../components/hr-nav-card";
import { HrGroupHeading, HrSectionHeader } from "../components/hr-section-header";
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
        <>
          <h1 className="mb-3! mt-0! min-w-0 text-2xl font-bold tracking-tight">Recruitment</h1>
          <div className="space-y-6">
            {recruitmentGroups.map((item, itemIndex) => (
              <section key={item.id} aria-label={item.label}>
                <HrGroupHeading number={itemIndex + 1} label={item.label} description={item.description} />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {item.pages.map((page) => (
                    <HrNavCard
                      key={page.id}
                      icon={page.icon}
                      label={page.label}
                      description={page.description}
                      onClick={() => go(page.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
