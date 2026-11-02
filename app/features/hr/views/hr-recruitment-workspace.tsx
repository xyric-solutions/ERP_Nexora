"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [search, setSearch] = useState("");
  const active = recruitmentPages.find((page) => page.id === pageId);
  const group = recruitmentGroups.find((item) => item.pages.some((page) => page.id === pageId));
  const go = (target: string) => onNavigate("hr", target);
  const filtered = recruitmentGroups
    .map((item) => ({
      ...item,
      pages: item.pages.filter((page) =>
        `${item.label} ${page.label} ${page.description}`.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    }))
    .filter((item) => item.pages.length);

  return (
    <section aria-label="Recruitment workspace" className="min-w-0">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0! text-2xl font-bold tracking-tight">{active?.label ?? "Recruitment"}</h1>
        {active ? (
          <Button variant="ghost" onClick={() => go("recruitment-workspace")}>
            <ArrowLeft />
            All recruitment
          </Button>
        ) : null}
      </header>
      <nav aria-label="Recruitment stages" className="mb-3 flex flex-wrap gap-2">
        {recruitmentGroups.map((item, index) => (
          <Button
            key={item.id}
            variant={group?.id === item.id ? "default" : "outline"}
            aria-current={group?.id === item.id ? "true" : undefined}
            onClick={() => go(item.pages[0].id)}
          >
            <span className="opacity-70">0{index + 1}</span>
            {item.label}
          </Button>
        ))}
      </nav>
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
          <div className="relative mb-5 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Find a recruitment page"
              placeholder="Find vacancies, candidates, interviews or offers..."
              className="pl-10"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="space-y-6">
            {filtered.map((item) => (
              <section key={item.id} aria-label={item.label}>
                <h2 className="m-0! text-lg font-semibold">{item.label}</h2>
                <p className="mb-3! mt-1! text-sm text-muted-foreground">{item.description}</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {item.pages.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() => go(page.id)}
                      className="group flex flex-col rounded-xl border border-border bg-card p-4 text-left text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <page.icon className="mb-3 size-6 text-primary" />
                      <strong className="group-hover:text-primary">{page.label}</strong>
                      <span className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {page.description}
                      </span>
                      <ArrowRight className="mt-4 size-4 self-end text-primary" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {!filtered.length ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p>No recruitment pages match your search.</p>
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
