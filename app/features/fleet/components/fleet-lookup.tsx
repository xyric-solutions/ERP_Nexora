"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FleetLookupItem, FleetLookupKind } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { fleetError } from "../model/fleet";

export interface FleetChoice {
  id: string;
  label: string;
  item: FleetLookupItem;
}

/**
 * Search-select backed by `/api/v1/fleet/lookups`: vehicles, Fleet drivers, HR employees who are not
 * yet drivers, and active suppliers. Results are searched on the server (top 30 matches).
 */
export function FleetLookup({
  company,
  kind,
  label,
  value,
  selectedLabel,
  onChange,
  disabled,
  invalid,
  required,
  id,
}: {
  company: string;
  kind: FleetLookupKind;
  label: string;
  value: string;
  selectedLabel?: string | null;
  onChange: (choice: FleetChoice | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  /** Set by `LabeledField` so its label points at the trigger. */
  id?: string;
}) {
  const { api } = useSession();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [items, setItems] = useState<FleetChoice[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams({ company_id: company, kind, search, limit: "30" });
    const page = await api.listFleetLookups(`?${params}`);
    return page.items.map((item) => ({
      id: item.id,
      label: [item.code, item.name, item.detail].filter(Boolean).join(" · "),
      item,
    }));
  }, [api, company, kind, search]);
  useEffect(() => {
    if (!open || disabled) return;
    const token = ++generation.current;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      fetchItems()
        .then((next) => token === generation.current && setItems(next))
        .catch((e) => token === generation.current && setError(fleetError(e)))
        .finally(() => token === generation.current && setBusy(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, disabled, fetchItems, retry]);
  const options = items.map((item) => ({ value: item.id, label: item.label }));
  if (value && !options.some((option) => option.value === value))
    options.unshift({ value, label: selectedLabel || "Selected record" });
  return (
    <div className="min-w-0" onFocusCapture={() => setOpen(true)} onPointerDownCapture={() => setOpen(true)}>
      <SearchableSelect
        id={id}
        label={label}
        value={value}
        required={required}
        invalid={invalid}
        disabled={disabled}
        loading={busy}
        placeholder={`Select ${label.replace(/\s*\*$/, "").toLowerCase()}`}
        searchPlaceholder="Search…"
        options={options}
        search={search}
        onSearchChange={setSearch}
        onValueChange={(next) => {
          if (next === value) return;
          onChange(next ? (items.find((item) => item.id === next) ?? null) : null);
        }}
        footer={
          error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}{" "}
              <Button type="button" variant="link" onClick={() => setRetry((n) => n + 1)}>
                Retry
              </Button>
            </p>
          ) : null
        }
      />
    </div>
  );
}
