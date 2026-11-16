"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ManufacturingLookupKind, ManufacturingSurface } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { manufacturingError } from "../model/manufacturing";

export interface LookupChoice {
  id: string;
  label: string;
  unit?: string | null;
}

/**
 * Search-select backed by `/api/v1/manufacturing/lookups`. Results are
 * searched on the server, so long product lists never load in full; values are never typed.
 */
export function ManufacturingLookup({
  company,
  surface,
  kind,
  label,
  value,
  selectedLabel,
  onChange,
  disabled,
  invalid,
  required,
  exclude = [],
  describe,
  id,
}: {
  company: string;
  surface: ManufacturingSurface;
  kind: ManufacturingLookupKind;
  label: string;
  value: string;
  selectedLabel?: string | null;
  onChange: (choice: LookupChoice | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  /** Ids that cannot be chosen here (for example components already on other lines). */
  exclude?: readonly string[];
  describe?: (choice: LookupChoice) => { label?: string; disabled?: boolean };
  /** Set by `LabeledField` so its label points at the trigger. */
  id?: string;
}) {
  const { api } = useSession();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [items, setItems] = useState<LookupChoice[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const fetchPage = useCallback(
    async (after?: string) => {
      const params = new URLSearchParams({ company_id: company, surface, search, limit: "30" });
      if (after) params.set("cursor", after);
      params.set("kind", kind);
      const page = await api.listManufacturingLookups(`?${params}`);
      return {
        items: page.items.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}`, unit: item.unit })),
        next: page.next_cursor,
      };
    },
    [api, company, surface, search, kind],
  );
  useEffect(() => {
    if (!open || disabled) return;
    const token = ++generation.current;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      fetchPage()
        .then((page) => {
          if (token !== generation.current) return;
          setItems(page.items);
          setCursor(page.next);
        })
        .catch((e) => token === generation.current && setError(manufacturingError(e)))
        .finally(() => token === generation.current && setBusy(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, disabled, fetchPage, retry]);
  async function more() {
    if (!cursor || busy) return;
    const token = generation.current;
    setBusy(true);
    try {
      const page = await fetchPage(cursor);
      if (token !== generation.current) return;
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((c) => c.id === item.id))]);
      setCursor(page.next);
    } catch (e) {
      if (token === generation.current) setError(manufacturingError(e));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  const options = items
    .filter((item) => item.id === value || !exclude.includes(item.id))
    .map((item) => {
      const extra = describe?.(item);
      return { value: item.id, label: extra?.label ?? item.label, disabled: extra?.disabled };
    });
  if (value && !options.some((option) => option.value === value))
    options.unshift({ value, label: selectedLabel || "Selected record", disabled: false });
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
        searchPlaceholder="Search by code or name…"
        options={options}
        search={search}
        onSearchChange={setSearch}
        onValueChange={(next) => {
          if (next === value) return;
          onChange(next ? (items.find((item) => item.id === next) ?? null) : null);
        }}
        footer={
          error || cursor ? (
            <div className="grid gap-1 text-sm">
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}{" "}
                  <Button type="button" variant="link" onClick={() => setRetry((n) => n + 1)}>
                    Retry
                  </Button>
                </p>
              ) : null}
              {cursor ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void more()}>
                  Load more
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}
