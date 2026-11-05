"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { HrBackButton } from "./hr-icon-buttons";

/**
 * Inner-page header shared by every HR & Payroll hub: the back icon, the parent
 * section's name and only that section's pages as tabs. The open page uses the
 * primary (yellow) button; the other tabs keep the outline style.
 */
export function HrSectionHeader({
  title,
  backLabel,
  onBack,
  pages,
  activeId,
  onSelect,
  navLabel,
  actions,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  pages: readonly { id: string; label: string }[];
  activeId: string;
  onSelect: (pageId: string) => void;
  navLabel: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <HrBackButton label={backLabel} onClick={onBack} />
          <h1 className="m-0! min-w-0 text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        {actions}
      </div>
      <nav aria-label={navLabel} className="mb-4 flex gap-2 overflow-x-auto border-b border-border pb-2">
        {pages.map((page) => (
          <Button
            key={page.id}
            type="button"
            variant={page.id === activeId ? "default" : "outline"}
            aria-current={page.id === activeId ? "page" : undefined}
            onClick={() => onSelect(page.id)}
          >
            {page.label}
          </Button>
        ))}
      </nav>
    </>
  );
}
