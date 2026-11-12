"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
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
    pages: readonly { id: string; label: string; description: string; icon: LucideIcon; permission?: string }[];
  }[];
};

/** Hides pages whose permission the signed-in role lacks; the open page stays so its own access message shows. */
function visibleWorkspace(definition: Workspace, permissions: readonly string[], pageId: string): Workspace {
  return {
    ...definition,
    groups: definition.groups
      .map((group) => ({
        ...group,
        pages: group.pages.filter(
          (page) => !page.permission || page.id === pageId || permissions.includes(page.permission),
        ),
      }))
      .filter((group) => group.pages.length > 0),
  };
}

export function HrOperationsWorkspace({
  definition: fullDefinition,
  pageId,
  onNavigate,
  children,
}: {
  definition: Workspace;
  pageId: string;
  onNavigate: (module: string, page: string, reference?: string) => void;
  children?: ReactNode;
}) {
  const { session } = useSession();
  const permissions = session?.user.permissions;
  const definition = useMemo(
    () => visibleWorkspace(fullDefinition, permissions ?? [], pageId),
    [fullDefinition, permissions, pageId],
  );
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
