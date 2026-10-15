"use client";

import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/button";

export interface RowAction {
  value: string;
  label: string;
}

export function ActionSelect({
  label,
  actions,
  disabled,
  onAction,
}: {
  label: string;
  actions: readonly RowAction[];
  disabled: boolean;
  onAction(action: string): void;
}) {
  return (
    <select
      className="min-h-8 min-w-37.5 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={label}
      value=""
      disabled={disabled || actions.length === 0}
      onChange={(event) => onAction(event.target.value)}
    >
      <option value="">Choose action</option>
      {actions.map((action) => (
        <option key={action.value} value={action.value}>
          {action.label}
        </option>
      ))}
    </select>
  );
}

export function SelectionCheckbox({
  label,
  checked,
  mixed = false,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  disabled: boolean;
  onChange(checked: boolean): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="size-4 accent-primary"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function RecordDetails({ row, onClose }: { row: Record<string, unknown>; onClose(): void }) {
  return (
    <section className="border-b border-border bg-muted/50 px-5 py-5" aria-label="Record details">
      <header className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Record details</h3>
        <Button variant="outline" size="sm" onClick={onClose}>Close details</Button>
      </header>
      <dl className="mt-5 grid gap-3">
        {Object.entries(row).map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs capitalize text-muted-foreground">{key.replaceAll("_", " ")}</dt>
            <dd className="mt-1 overflow-wrap-anywhere whitespace-pre-wrap text-sm">{value === null ? "—" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
