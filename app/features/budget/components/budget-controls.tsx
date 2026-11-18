"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LabeledField } from "@/shared/ui/labeled-field";
import { workSelectClass } from "@/shared/ui/work-table";
import { decimal, decimalText, type BudgetDimensions, type BudgetOptions } from "@nexora/contracts";

export const budgetPanel = "min-w-0 rounded-xl border border-border bg-card";
export const budgetCell = "border-b border-border px-3 py-2 text-left text-sm";
export const budgetHead =
  "border-b border-border bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground";
export function BudgetField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <LabeledField label={label} hint={hint}>
      {children}
    </LabeledField>
  );
}
export function BudgetSelect({
  label,
  value,
  onChange,
  options,
  empty = "All",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { id: string; name: string; code?: string }[];
  empty?: string;
  disabled?: boolean;
}) {
  return (
    <BudgetField label={label}>
      <select className={workSelectClass} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{empty}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.code ? `${o.code} · ` : ""}
            {o.name}
          </option>
        ))}
      </select>
    </BudgetField>
  );
}
export function BudgetDimensionsFields({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: BudgetDimensions;
  onChange: (value: BudgetDimensions) => void;
  options: BudgetOptions;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {(
        [
          ["department", "Department", options.departments],
          ["project", "Project", options.projects],
          ["cost_centre", "Cost centre", options.cost_centres],
          ["branch", "Branch", options.branches],
        ] as const
      ).map(([key, label, items]) => (
        <BudgetSelect
          key={key}
          label={label}
          value={value[key] ?? ""}
          options={items}
          empty="Unrestricted"
          disabled={disabled}
          onChange={(selected) => {
            const next = { ...value };
            if (selected) next[key] = selected;
            else delete next[key];
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}
export function BudgetPager({
  offset,
  total,
  onChange,
  busy = false,
}: {
  offset: number;
  total: number;
  onChange: (offset: number) => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span>{total ? `${offset + 1}–${Math.min(offset + 50, total)} of ${total}` : "No records"}</span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || offset === 0}
          onClick={() => onChange(Math.max(0, offset - 50))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || offset + 50 >= total}
          onClick={() => onChange(offset + 50)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
export function budgetDisplay(value: string, scale = 2) {
  try {
    const n = decimal(value, 8, true),
      factor = 10n ** BigInt(8 - scale),
      text = decimalText(n / factor, scale);
    const [whole, fraction] = text.split(".");
    return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
  } catch {
    return value;
  }
}
export function downloadBudgetFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
