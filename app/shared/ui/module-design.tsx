"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useWorkForm } from "./work-surface-context";

const ModuleDesignContext = createContext(false);
export const useModuleDesign = () => useContext(ModuleDesignContext);

/** Shared presentation for the approved Sales, Administration and Manufacturing review.
 * Important utilities isolate these surfaces from the still-active legacy cascade.
 * Domain state, permissions and action handlers stay in their owning features.
 */
export const moduleDesignClass = cn(
  "min-w-0 text-sm text-foreground [--nx-radius-lg:10px] [--nx-radius-md:7px] [--nx-radius-sm:6px]",
  "[&_h1]:m-0! [&_h1]:text-[1.625rem]! [&_h1]:leading-tight! [&_h1]:font-semibold! [&_h1]:tracking-tight!",
  "[&_h2]:text-base! [&_h2]:font-semibold! [&_h3]:text-sm! [&_h3]:font-semibold!",
  "[&_button[data-slot=button]]:rounded-[7px]! [&_button[data-slot=button]]:text-[13px]! [&_button[data-slot=button]]:font-semibold!",
  "[&_[data-slot=badge]]:rounded-[5px]! [&_[data-slot=badge]]:text-xs!",
  "[&_input:not([type=checkbox]):not([type=radio])]:rounded-md! [&_select]:rounded-md! [&_textarea]:rounded-md!",
  "[&_input:not([type=checkbox]):not([type=radio])]:text-[13px]! [&_select]:text-[13px]! [&_textarea]:text-[13px]!",
  "[&_table]:w-full! [&_table]:border-collapse! [&_table]:text-[13px]!",
  "[&_th]:bg-muted! [&_th]:px-4! [&_th]:py-3! [&_th]:text-xs! [&_th]:font-medium! [&_th]:normal-case! [&_th]:tracking-normal! [&_th]:text-muted-foreground! [&_th]:border-border!",
  "[&_td]:px-4! [&_td]:py-4! [&_td]:align-middle! [&_td]:border-border! [&_tbody_tr_td]:bg-card! [&_tbody_tr:hover_td]:bg-muted/50!",
  "[&_td_small]:mt-1! [&_td_small]:text-xs! [&_td_strong]:font-medium!",
  "[&_table:has(input:not([type=checkbox]):not([type=radio]))_td]:px-2! [&_table:has(input:not([type=checkbox]):not([type=radio]))_td]:py-2! [&_table:has(input:not([type=checkbox]):not([type=radio]))_th]:px-2!",
  "[&_table:has(select)_td]:px-2! [&_table:has(select)_td]:py-2! [&_table:has(select)_th]:px-2!",
  "[&_.nx-card]:rounded-[10px]! [&_.nx-card]:border-border! [&_.nx-card]:bg-card! [&_.nx-card]:shadow-none!",
  "[&_.nx-page-intro]:mb-5! [&_.nx-page-intro]:border-0! [&_.nx-page-intro]:bg-transparent! [&_.nx-page-intro]:p-0!",
  "[&_.nx-section-title]:border-border! [&_.nx-section-title]:bg-card! [&_.nx-section-title]:text-foreground! [&_.nx-section-title]:shadow-none!",
  "[&_.nx-section-title>span]:hidden! [&_.nx-section-title>em]:hidden!",
  "[&_.nx-data-table]:min-w-[640px]! [&_.nx-table-wrap]:overflow-x-auto!",
  "[&_.nx-status]:rounded-[5px]! [&_.nx-status]:font-semibold! [&_.nx-status]:text-xs!",
  "[&_.nx-tabs]:border-border! [&_.nx-tabs]:bg-card! [&_.nx-tabs_button]:rounded-none! [&_.nx-tabs_button]:text-[13px]!",
  "[&_.nx-kpi]:rounded-[10px]! [&_.nx-kpi]:border-border! [&_.nx-kpi]:bg-card! [&_.nx-kpi]:shadow-none! [&_.nx-kpi>strong]:text-[1.625rem]! [&_.nx-kpi>strong]:font-semibold!",
  "[&_.nx-filter-bar]:border-border! [&_.nx-filter-bar]:bg-card! [&_.nx-filter-bar]:p-4!",
  "[&_.nx-premium-viewbar]:border-border! [&_.nx-premium-viewbar]:bg-card! [&_.nx-premium-viewbar]:shadow-none!",
);

export function ModuleDesignSurface({ moduleId, children }: { moduleId: string; children: ReactNode }) {
  const enabled = ["sales", "administration", "manufacturing"].includes(moduleId);
  return (
    <ModuleDesignContext.Provider value={enabled}>
      {enabled ? (
        <div data-module-design={moduleId} className={moduleDesignClass}>
          {children}
        </div>
      ) : (
        children
      )}
    </ModuleDesignContext.Provider>
  );
}

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  const inWorkForm = useWorkForm();
  return (
    <header className="flex flex-col items-start justify-between gap-4 pb-1 sm:flex-row sm:gap-6">
      <div className="min-w-0">
        <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--nx-brand)]">
          {eyebrow}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-[1.625rem] leading-tight font-semibold tracking-tight">{title}</h1>
          {status}
        </div>
        {description && !inWorkForm ? (
          <p className="m-0 mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{actions}</div> : null}
    </header>
  );
}
