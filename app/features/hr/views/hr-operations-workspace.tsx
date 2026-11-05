"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HrSectionHeader } from "../components/hr-section-header";
import { HrLandingPage } from "../components/hr-landing";
import { hrOperationsLandingSummaries } from "../model/hr-operations-landing-summaries";
import { HrOperationsScopeContext, type HrOperationsScope } from "../components/hr-operations-scope";

const noSummaries = {};

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
        <HrLandingPage
          title={definition.label}
          idPrefix={definition.id}
          groups={definition.groups}
          loaders={hrOperationsLandingSummaries[definition.id] ?? noSummaries}
          onOpen={go}
        />
      )}
    </section>
  );
}
