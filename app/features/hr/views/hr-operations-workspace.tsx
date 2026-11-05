"use client";

import { useState, type ReactNode } from "react";
import { Search, type LucideIcon } from "lucide-react";
import { HrBackButton } from "../components/hr-icon-buttons";
import { HrNavCard } from "../components/hr-nav-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HrOperationsScopeContext, type HrOperationsScope } from "../components/hr-operations-scope";

type Workspace = {
  id: string;
  label: string;
  /** false hides the landing-page search and section filter; every page is still listed. */
  finder?: boolean;
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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [scope, setScope] = useState<HrOperationsScope | null>(null);
  const activeGroup = definition.groups.find((group) => group.pages.some((page) => page.id === pageId));
  const active = activeGroup?.pages.find((page) => page.id === pageId);
  const go = (target: string) => onNavigate("hr", target, scope ? JSON.stringify(scope) : undefined);
  const filtered = definition.groups
    .filter((group) => category === "all" || group.id === category)
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) =>
        `${group.label} ${page.label} ${page.description}`.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.pages.length);
  return (
    <section className="min-w-0" aria-label={`${definition.label} workspace`}>
      <header className="mb-3 flex items-center gap-2">
        {active ? (
          <HrBackButton label={`Back to all ${definition.label.toLowerCase()}`} onClick={() => go(definition.id)} />
        ) : null}
        <h1 className="m-0! min-w-0 text-2xl font-bold tracking-tight">{active?.label ?? definition.label}</h1>
      </header>
      {activeGroup ? (
        <>
          <nav
            aria-label={`${definition.label} pages`}
            className="mb-4 flex gap-2 overflow-x-auto border-b border-border pb-2"
          >
            {activeGroup.pages.map((page) => (
              <Button
                key={page.id}
                variant={page.id === pageId ? "default" : "outline"}
                aria-current={page.id === pageId ? "page" : undefined}
                onClick={() => go(page.id)}
              >
                {page.label}
              </Button>
            ))}
          </nav>
          <HrOperationsScopeContext.Provider value={setScope}>{children}</HrOperationsScopeContext.Provider>
        </>
      ) : (
        <>
          {definition.finder === false ? null : (
            <div className="mb-5 grid gap-3 rounded-lg border border-border bg-card p-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  aria-label={`Find a ${definition.label} page`}
                  placeholder="Find a page or workflow..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-1" aria-label="Filter workspace sections">
                {[{ id: "all", label: "All pages" }, ...definition.groups].map((group) => (
                  <Button
                    key={group.id}
                    variant={category === group.id ? "default" : "ghost"}
                    aria-pressed={category === group.id}
                    onClick={() => setCategory(group.id)}
                  >
                    {group.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-6">
            {(definition.finder === false ? definition.groups : filtered).map((group) => (
              <section key={group.id} aria-label={group.label}>
                <h2 className="m-0! text-lg font-semibold">{group.label}</h2>
                <p className="mb-3! mt-1! text-sm text-muted-foreground">{group.description}</p>
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
          {definition.finder !== false && !filtered.length ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p>No pages match your search.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
