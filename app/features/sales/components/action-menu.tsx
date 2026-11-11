"use client";

import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface ActionMenuOption {
  label: string;
  run: () => void;
  disabled?: boolean;
}

/**
 * Hover-opened action menu (also opens on click or keyboard), as in the
 * reference screenshots: "Add New ▾" on Invoices and Receipts, "Batch ▾" on
 * Receipts.
 */
export function ActionMenu({ label, options, tone = "primary" }: { label: string; options: readonly ActionMenuOption[]; tone?: "primary" | "secondary" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        openOnHover
        delay={60}
        closeDelay={120}
        render={
          <Button
            type="button"
            variant={tone === "primary" ? "default" : "secondary"}
            className="rounded-full px-4 data-popup-open:ring-3 data-popup-open:ring-ring/50"
          />
        }
      >
        {label}
        <ChevronDownIcon data-icon="inline-end" aria-hidden className="transition-transform duration-150 group-data-popup-open/button:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-auto min-w-60 p-1.5">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.label}
            disabled={option.disabled}
            className="rounded-none border-b border-border px-3 py-2.5 text-sm last:border-b-0 focus:rounded-md focus:text-[var(--nx-brand)]"
            onClick={option.run}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
