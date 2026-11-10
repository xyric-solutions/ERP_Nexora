"use client";

import type { ReactNode } from "react";
import type { FinanceNominalSummary } from "@nexora/contracts";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function FinanceMasterRow({
  title,
  subtitle,
  metadata,
  actions,
  expanded,
  controls,
  onOpen,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  expanded?: boolean;
  controls?: string;
  onOpen: () => void;
  children?: ReactNode;
}) {
  return (
    <section data-slot="finance-master-row" className="overflow-hidden rounded-md border border-border bg-card">
      <div
        data-finance-master-header=""
        className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-card px-2 py-1 text-foreground"
      >
        <Button
          type="button"
          variant="ghost"
          data-finance-master-trigger=""
          className="h-auto min-h-8 w-full min-w-0 flex-none justify-start gap-2 rounded-sm px-1.5 py-1 text-left whitespace-normal text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-foreground dark:hover:bg-muted sm:w-auto sm:flex-1"
          aria-expanded={expanded}
          aria-controls={controls}
          onClick={onOpen}
        >
          {expanded ? <ChevronDown data-icon="inline-start" /> : <ChevronRight data-icon="inline-start" />}
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <strong className="break-words text-sm font-medium">{title}</strong>
            {subtitle && <span className="text-xs">{subtitle}</span>}
          </span>
        </Button>
        {metadata && (
          <div className="flex flex-wrap items-center gap-1.5 [&_[data-slot=badge]]:border-border [&_[data-slot=badge]]:text-foreground">
            {metadata}
          </div>
        )}
        {actions && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5 [&_[data-slot=button]]:border-border [&_[data-slot=button]]:bg-transparent [&_[data-slot=button]]:text-foreground [&_[data-slot=button]]:hover:border-border [&_[data-slot=button]]:hover:bg-muted">
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export function FinanceNominalRow({
  nominal,
  onOpen,
  onEdit,
  showBanking = false,
}: {
  nominal: FinanceNominalSummary;
  onOpen: (id: string) => void;
  onEdit?: (id: string) => void;
  showBanking?: boolean;
}) {
  const needsReview = ["draft", "pending_approval"].includes(nominal.state ?? nominal.account_status);
  return (
    <FinanceMasterRow
      title={nominal.name}
      subtitle={
        <>
          <span className="font-mono">{nominal.code}</span>
          {showBanking && (
            <>
              {" "}
              ·{" "}
              {nominal.banking_available
                ? "Available for Banking"
                : nominal.bank_account_id
                  ? "Banking not active"
                  : "Not a Bank account"}
            </>
          )}
        </>
      }
      onOpen={() => (onEdit && !needsReview ? onEdit(nominal.id) : onOpen(nominal.id))}
      metadata={
        <>
          <Badge variant="outline">{nominal.currency ?? "—"}</Badge>
          <Badge variant="outline">{(nominal.state ?? nominal.account_status).replaceAll("_", " ")}</Badge>
        </>
      }
      actions={
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpen(nominal.id)}>
            {needsReview ? "Review" : "Open"}
          </Button>
          {onEdit && (
            <Button type="button" size="sm" variant="outline" onClick={() => onEdit(nominal.id)}>
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          )}
        </>
      }
    />
  );
}
