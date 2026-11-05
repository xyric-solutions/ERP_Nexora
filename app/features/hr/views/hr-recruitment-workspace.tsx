"use client";

import type { ReactNode } from "react";
import { HrBackButton } from "../components/hr-icon-buttons";
import { HrNavCard } from "../components/hr-nav-card";
import { Button } from "@/components/ui/button";
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
      <header className="mb-3 flex items-center gap-2">
        {active ? <HrBackButton label="Back to all recruitment" onClick={() => go("recruitment-workspace")} /> : null}
        <h1 className="m-0! min-w-0 text-2xl font-bold tracking-tight">{active?.label ?? "Recruitment"}</h1>
      </header>
      {active && group ? (
        <>
          <nav aria-label="Recruitment pages" className="mb-4 flex gap-2 overflow-x-auto border-b border-border pb-2">
            {group.pages.map((page) => (
              <Button
                key={page.id}
                variant={page.id === pageId ? "secondary" : "ghost"}
                aria-current={page.id === pageId ? "page" : undefined}
                onClick={() => go(page.id)}
              >
                {page.label}
              </Button>
            ))}
          </nav>
          {children}
        </>
      ) : (
        <>
          <div className="space-y-6">
            {recruitmentGroups.map((item) => (
              <section key={item.id} aria-label={item.label}>
                <h2 className="m-0! text-lg font-semibold">{item.label}</h2>
                <p className="mb-3! mt-1! text-sm text-muted-foreground">{item.description}</p>
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
