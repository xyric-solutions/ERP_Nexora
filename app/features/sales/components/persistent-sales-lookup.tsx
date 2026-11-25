"use client";
import { useEffect, useState } from "react";
import type { SalesLookupDirectory, SalesLookupQuery } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { SearchableSelect, type SearchableSelectOption } from "@/shared/ui/searchable-select";
import { salesQuery, salesError } from "../model/persistent-sales";
export type SalesChoice = SalesLookupDirectory["items"][number];
export function PersistentSalesLookup({
  company,
  kind,
  label,
  value,
  selectedLabel,
  onChange,
  required = false,
  disabled = false,
  warehouse,
  currency,
  date,
  sourceKind,
  tableCell = false,
}: {
  company: string;
  kind: SalesLookupQuery["kind"];
  label: string;
  value: string;
  selectedLabel?: string;
  onChange: (choice: SalesChoice | null) => void;
  required?: boolean;
  disabled?: boolean;
  warehouse?: string;
  currency?: string;
  date?: string;
  sourceKind?: SalesLookupQuery["source_kind"];
  tableCell?: boolean;
}) {
  const { api, session } = useSession(),
    [search, setSearch] = useState("");
  const scope = salesQuery({
    company_id: company,
    kind,
    search,
    warehouse_id: warehouse,
    currency,
    as_of: date,
    source_kind: sourceKind,
    limit: 25,
  });
  const [loaded, setLoaded] = useState<{ scope: string; items: SalesChoice[]; total: number; error: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        api
          .getSalesLookups(scope)
          .then((result) => {
            if (active) setLoaded({ scope, ...result, error: "" });
          })
          .catch((error) => {
            if (active) setLoaded({ scope, items: [], total: 0, error: salesError(error) });
          }),
      150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, scope]);
  const data = loaded?.scope === scope ? loaded : null;
  const options: SearchableSelectOption[] = (data?.items ?? [])
    .filter((choice) => kind !== "approver" || choice.id !== session?.user.id)
    .map((choice) => ({
      value: choice.id,
      label: `${choice.code} · ${choice.name}${kind === "product" && choice.quantity !== null ? ` · ${choice.quantity} ${choice.unit ?? ""} posted` : ""}${choice.tax_rate ? ` · ${choice.tax_rate}%` : ""}`,
    }));
  if (value && !options.some((option) => option.value === value))
    options.unshift({
      value,
      label: selectedLabel || value,
      disabled: kind === "approver" && value === session?.user.id,
    });
  if (!required) options.unshift({ value: "", label: kind === "approver" ? "Creator approval (no reviewer)" : "None" });
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <span className={tableCell ? "sr-only" : "text-sm font-medium leading-tight text-foreground"}>
        {label}
        {required ? " *" : ""}
      </span>
      <SearchableSelect
        label={label}
        value={value}
        options={options}
        placeholder={`Choose ${label.toLowerCase()}`}
        required={required}
        disabled={disabled}
        loading={!data}
        search={search}
        onSearchChange={setSearch}
        onValueChange={(id) => {
          if (!id) {
            onChange(null);
            return;
          }
          const found = data?.items.find((item) => item.id === id);
          if (found && (kind !== "approver" || found.id !== session?.user.id)) onChange(found);
        }}
        footer={
          data && data.total > data.items.length ? (
            <span className="text-xs text-muted-foreground">
              Showing {data.items.length} of {data.total}. Search by code or name.
            </span>
          ) : undefined
        }
      />
      {data?.error ? (
        <p role="alert" className="m-0 text-xs text-destructive">
          {data.error}
        </p>
      ) : null}
    </div>
  );
}
