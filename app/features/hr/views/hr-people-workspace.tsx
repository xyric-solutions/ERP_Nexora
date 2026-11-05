"use client";

import type { ReactNode } from "react";
import { HrSectionHeader } from "../components/hr-section-header";
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
      {active && currentGroup ? (
        <>
          <HrSectionHeader
            title={currentGroup.label}
            backLabel="Back to all people"
            onBack={() => go("people-workspace")}
            pages={currentGroup.pages.filter((page) => page.id !== "employee-record" || employeeId)}
            activeId={active.id}
            onSelect={go}
            navLabel={`${currentGroup.label} pages`}
            actions={
              pageId === "employees" ? (
                <Button type="button" onClick={() => go("add-employee")}>
                  + Add Employee
                </Button>
              ) : null
            }
          />
          {children}
        </>
      ) : (
        <>
          <h1 className="mb-3! mt-0! min-w-0 text-2xl font-bold tracking-tight">People</h1>
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
