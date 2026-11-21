"use client";
import { useEffect, useId, useState } from "react";
import type { ProductLookupDirectory, ProductLookupKind, InventorySurface } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { LabeledField } from "@/shared/ui/labeled-field";
import { productError } from "../model/products";

export function ProductLookup({
  company,
  kind,
  label,
  value,
  name,
  onChange,
  disabled,
  surface = "products",
}: {
  company: string;
  kind: ProductLookupKind;
  label: string;
  value: string | null;
  name: string | null;
  onChange: (id: string | null, name: string | null, unit?: string) => void;
  disabled?: boolean;
  surface?: InventorySurface;
}) {
  const { api } = useSession(),
    id = useId();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [result, setResult] = useState<ProductLookupDirectory>({ items: [], next_cursor: null }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      setResult({ items: [], next_cursor: null });
      api
        .listProductLookups(`?${new URLSearchParams({ company_id: company, kind, surface, search, limit: "30" })}`)
        .then((r) => {
          if (active) setResult(r);
        })
        .catch((e) => {
          if (active) setError(productError(e));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, company, kind, surface, search, open, retry]);
  async function more() {
    if (busy || !result.next_cursor) return;
    setBusy(true);
    try {
      const r = await api.listProductLookups(
        `?${new URLSearchParams({ company_id: company, kind, surface, search, limit: "30", cursor: result.next_cursor })}`,
      );
      setResult((current) => ({ items: [...current.items, ...r.items], next_cursor: r.next_cursor }));
    } catch (e) {
      setError(productError(e));
    } finally {
      setBusy(false);
    }
  }
  const options = [
    { value: "", label: "None" },
    ...result.items.map((item) => ({ value: item.id, label: `${item.code} \u00b7 ${item.name}` })),
  ];
  if (value && !options.some((item) => item.value === value)) options.push({ value, label: name ?? value });
  return (
    <div className="min-w-0">
      <LabeledField label={label}>
        <SearchableSelect
          id={id}
          label={label}
          value={value ?? ""}
          options={options}
          placeholder="Select..."
          disabled={disabled}
          loading={busy}
          search={search}
          onSearchChange={setSearch}
          onOpenChange={setOpen}
          onValueChange={(selected) => {
            const item = result.items.find((item) => item.id === selected);
            if (item) onChange(item.id, `${item.code} \u00b7 ${item.name}`, item.unit);
            else if (!selected) onChange(null, null);
            setSearch("");
          }}
          footer={
            <>
              {error ? (
                <p role="alert" className="px-3 py-2 text-sm text-destructive">
                  {error}{" "}
                  <Button type="button" variant="link" onClick={() => setRetry((n) => n + 1)}>
                    Retry
                  </Button>
                </p>
              ) : null}
              {result.next_cursor ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void more()}>
                  Load more
                </Button>
              ) : null}
            </>
          }
        />
      </LabeledField>
    </div>
  );
}
