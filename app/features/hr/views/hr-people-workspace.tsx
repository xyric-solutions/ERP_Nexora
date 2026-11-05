"use client";

import type { ReactNode } from "react";
import { HrBackButton } from "../components/hr-icon-buttons";
import { HrNavCard } from "../components/hr-nav-card";
import { Button } from "@/components/ui/button";
import { peopleGroups, peoplePages } from "../model/people-navigation";

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
  const dashboardHasHeading = pageId === "hr-dashboard" || pageId === "finance-payroll-dashboard";
  const currentGroup = peopleGroups.find((group) => group.pages.some((page) => page.id === pageId));
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {active ? <HrBackButton label="Back to all people" onClick={() => go("people-workspace")} /> : null}
          {!dashboardHasHeading ? (
            <h1 className="m-0! min-w-0 text-2xl font-bold tracking-tight">{active?.label ?? "People"}</h1>
          ) : null}
        </div>
        {pageId === "employees" ? <Button onClick={() => go("add-employee")}>+ Add Employee</Button> : null}
      </div>
      {active && currentGroup ? (
        <>
          <nav aria-label="People sections" className="mb-2 flex flex-wrap gap-1">
            {peopleGroups.map((group) => (
              <Button
                key={group.id}
                variant={currentGroup.id === group.id ? "secondary" : "ghost"}
                onClick={() => go(group.pages[0].id)}
                aria-current={currentGroup.id === group.id ? "true" : undefined}
              >
                {group.label}
              </Button>
            ))}
          </nav>
          <nav aria-label="People pages" className="mb-4 flex gap-2 overflow-x-auto border-b border-border pb-2">
            {currentGroup.pages
              .filter((page) => page.id !== "employee-record" || employeeId)
              .map((page) => (
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
          {children}
        </>
      ) : (
        <>
          <div className="space-y-6">
            {peopleGroups.map((group) => (
              <section key={group.id} aria-label={group.label}>
                <div className="mb-3">
                  <h2 className="m-0! text-lg font-semibold">{group.label}</h2>
                  <p className="mb-0! mt-1! text-sm text-muted-foreground">{group.description}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.cards.map((card) => (
                    <HrNavCard
                      key={card.id}
                      icon={card.icon}
                      label={card.label}
                      description={card.description}
                      onClick={() => go(card.id)}
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
