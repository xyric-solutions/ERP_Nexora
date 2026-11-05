"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HrGroupHeading, HrSectionHeader } from "../components/hr-section-header";
import { HrNavCard } from "../components/hr-nav-card";
import { HrOperationsScopeContext, type HrOperationsScope } from "../components/hr-operations-scope";

type Workspace = {
  id: string;
  label: string;
  groups: readonly {
    id: string;
    label: string;
    description: string;
    pages: readonly { id: string; label: string; description: string; icon: LucideIcon }[];
  }[];
};

export function HrOperationsWorkspace({
  definition,
  pageId,
  onNavigate,
  children,
}: {
  definition: Workspace;
  pageId: string;
  onNavigate: (module: string, page: string, reference?: string) => void;
  children?: ReactNode;
}) {
  const [scope, setScope] = useState<HrOperationsScope | null>(null);
  const activeGroup = definition.groups.find((group) => group.pages.some((page) => page.id === pageId));
  const active = activeGroup?.pages.find((page) => page.id === pageId);
  const go = (target: string) => onNavigate("hr", target, scope ? JSON.stringify(scope) : undefined);
  return (
    <section className="min-w-0" aria-label={`${definition.label} workspace`}>
      {activeGroup && active ? (
        <>
          <HrSectionHeader
            title={activeGroup.label}
            backLabel={`Back to all ${definition.label.toLowerCase()}`}
            onBack={() => go(definition.id)}
            pages={activeGroup.pages}
            activeId={active.id}
            onSelect={go}
            navLabel={`${activeGroup.label} pages`}
          />
          <HrOperationsScopeContext.Provider value={setScope}>{children}</HrOperationsScopeContext.Provider>
        </>
      ) : (
        <>
          <header className="mb-4 flex items-center gap-2">
            <h1 className="m-0! min-w-0 text-2xl font-bold tracking-tight">{definition.label}</h1>
          </header>
          <div className="space-y-6">
            {definition.groups.map((group, groupIndex) => (
              <section key={group.id} aria-label={group.label}>
                <HrGroupHeading number={groupIndex + 1} label={group.label} description={group.description} />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.pages.map((page) => (
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
