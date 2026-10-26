"use client";

import { useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SearchableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export interface SearchableSelectProps {
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onValueChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  invalid?: boolean;
  required?: boolean;
  searchLabel?: string;
  search?: string;
  onSearchChange?: (search: string) => void;
  footer?: React.ReactNode;
}

/** A bounded directory selector. The search input exists only inside its popup. */
export function SearchableSelect({
  label,
  value,
  options,
  onValueChange,
  placeholder,
  disabled = false,
  loading = false,
  invalid = false,
  required = false,
  searchLabel = `Search ${label.toLowerCase()}`,
  search,
  onSearchChange,
  footer,
}: SearchableSelectProps) {
  const [localSearch, setLocalSearch] = useState("");
  const query = search ?? localSearch;
  const input = useRef<HTMLInputElement>(null);
  const selected = options.find((item) => item.value === value) ?? null;
  const visible = options.filter(
    (item) => !query.trim() || item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  function changeSearch(next: string) {
    setLocalSearch(next);
    onSearchChange?.(next);
  }
  return (
    <Combobox.Root<SearchableSelectOption>
      items={options}
      filteredItems={loading ? [] : visible}
      filter={null}
      value={selected}
      inputValue={query}
      isItemEqualToValue={(a, b) => a.value === b.value}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      onInputValueChange={(next, detail) => {
        if (detail.reason === "input-change" || detail.reason === "input-clear") changeSearch(next);
      }}
      onValueChange={(item) => {
        if (!loading && !item?.disabled) onValueChange(item?.value ?? "");
      }}
      disabled={disabled}
    >
      <Combobox.Trigger
        render={<Button type="button" variant="outline" className="h-10 w-full min-w-0 justify-between" />}
        aria-label={label}
        aria-invalid={invalid}
        aria-required={required}
        data-value={value}
        title={selected?.label}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDownIcon data-icon="inline-end" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="isolate z-50">
          <Combobox.Popup
            initialFocus={input}
            className="w-[var(--anchor-width)] min-w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md"
          >
            <Combobox.Input
              ref={input}
              render={<Input className="h-10" />}
              aria-label={searchLabel}
              placeholder="Search by code or name…"
              maxLength={160}
              autoComplete="off"
            />
            <Combobox.List className="mt-2 max-h-64 overflow-y-auto">
              {(item: SearchableSelectOption) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  disabled={item.disabled || loading}
                  className="flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-2 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50"
                >
                  <span>{item.label}</span>
                  <Combobox.ItemIndicator>
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            {loading ? (
              <p role="status" className="p-2 text-sm text-muted-foreground">
                Loading options…
              </p>
            ) : (
              <Combobox.Empty className="p-2 text-sm text-muted-foreground">No matching options.</Combobox.Empty>
            )}
            {footer}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
