"use client";

import { useEffect, useRef } from "react";
import styles from "./identity-workspace.module.css";

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
      className={styles.actionSelect}
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
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function RecordDetails({ row, onClose }: { row: Record<string, unknown>; onClose(): void }) {
  return (
    <section className={styles.recordDetails} aria-label="Record details">
      <header>
        <h3>Record details</h3>
        <button onClick={onClose}>Close details</button>
      </header>
      <dl>
        {Object.entries(row).map(([key, value]) => (
          <div key={key}>
            <dt>{key.replaceAll("_", " ")}</dt>
            <dd>{value === null ? "—" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
