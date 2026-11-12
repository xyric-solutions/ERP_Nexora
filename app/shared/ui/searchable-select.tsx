"use client";

import { useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  /** Placeholder of the search box inside the list. */
  searchPlaceholder?: string;
  /** Controlled search text, e.g. to search the server; filtering by label still applies. */
  search?: string;
  onSearchChange?: (search: string) => void;
  /** Id for an external `<label htmlFor>`. */
  id?: string;
  className?: string;
  footer?: React.ReactNode;
  /** Optional shorter text for the closed trigger, e.g. a calling code instead of the full country name. */
  valueLabel?: (option: SearchableSelectOption) => string;
}

/**
 * A dropdown whose search box sits at the top of its list: open it, type a name or
 * code, pick a row. Matches the shared dropdown look (tinted chosen row, neutral
 * highlight, glowing open border). The chosen row keeps its label while a search
 * hides it from the list.
 */
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
  searchPlaceholder = "Search by code or name…",
  search,
  onSearchChange,
  id,
  className,
  footer,
  valueLabel,
}: SearchableSelectProps) {
  const [localSearch, setLocalSearch] = useState("");
  const query = search ?? localSearch;
  const input = useRef<HTMLInputElement>(null);
  const found = options.find((item) => item.value === value) ?? null;
  // Remember the chosen option so its label survives a search or reload that omits it.
  const [remembered, setRemembered] = useState<SearchableSelectOption | null>(found);
  if (found && (found.value !== remembered?.value || found.label !== remembered.label)) setRemembered(found);
  const selected = found ?? (value && remembered?.value === value ? remembered : null);
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
        if (loading || item?.disabled) return;
        if (item) setRemembered(item);
        onValueChange(item?.value ?? "");
        if (query) changeSearch("");
      }}
      disabled={disabled}
    >
      <Combobox.Trigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              "group h-10 w-full min-w-0 justify-between gap-2 rounded-md border-input bg-background px-3 text-left text-sm font-normal text-foreground shadow-none",
              "hover:border-primary/50 hover:bg-background hover:text-foreground aria-invalid:border-destructive",
              "data-popup-open:border-primary data-popup-open:bg-background data-popup-open:ring-3 data-popup-open:ring-(--nx-focus-ring)",
              className,
            )}
          />
        }
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        data-value={value}
        title={selected?.label}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>
          {selected ? (valueLabel ? valueLabel(selected) : selected.label) : placeholder}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-popup-open:rotate-180 group-data-popup-open:text-(--nx-brand)"
        />
      </Combobox.Trigger>
      <Combobox.Portal>
        {/* Above HR drawers (z 1301/1401) and confirmation dialogs (z 1501) that host these dropdowns. */}
        <Combobox.Positioner sideOffset={6} align="start" collisionPadding={8} className="isolate z-[1600]">
          <Combobox.Popup
            initialFocus={input}
            className="w-(--anchor-width) min-w-64 max-w-(--available-width) rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
          >
            <Combobox.Input
              ref={input}
              render={<Input className="h-9" />}
              aria-label={searchLabel}
              placeholder={searchPlaceholder}
              maxLength={160}
              autoComplete="off"
            />
            <Combobox.List className="mt-1.5 max-h-[min(18rem,calc(var(--available-height)-3.5rem))] overflow-y-auto">
              {(item: SearchableSelectOption) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  disabled={item.disabled || loading}
                  className="flex min-h-9 cursor-default items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-semibold outline-none data-highlighted:bg-foreground/9 data-selected:bg-(--nx-brand-soft) data-selected:text-(--nx-brand) data-disabled:opacity-50"
                >
                  <span className="min-w-0 wrap-anywhere">{item.label}</span>
                  <Combobox.ItemIndicator>
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            {loading ? (
              <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
                Loading options…
              </p>
            ) : (
              <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground">No matching options.</Combobox.Empty>
            )}
            {footer}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
