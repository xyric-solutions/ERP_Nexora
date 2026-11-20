"use client";
import { useEffect, useState } from "react";
import type { StockLookupQuery, StockLookupDirectory } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LabeledField } from "@/shared/ui/labeled-field";
import { productSelectClass } from "../model/products";

type StockLookupProps = {
  company: string;
  kind: StockLookupQuery["kind"];
  label: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  accountType?: StockLookupQuery["account_type"];
};
export function StockLookup(props: StockLookupProps) {
  return <ScopedStockLookup key={`${props.company}:${props.kind}:${props.accountType ?? ""}`} {...props} />;
}
function ScopedStockLookup({ company, kind, label, value, onChange, disabled, accountType }: StockLookupProps) {
  const { api } = useSession();
  const [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ scope: string; directory: StockLookupDirectory | null; error: string } | null>(
    null,
  );
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const scope = JSON.stringify({ company, kind, accountType, search, offset });
  const current = result?.scope === scope ? result : null,
    directory = current?.directory ?? null,
    error = current?.error ?? "",
    busy = !current;
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ company_id: company, kind, search, offset: String(offset), limit: "20" });
      if (accountType) query.set("account_type", accountType);
      api
        .getStockLookups(`?${query}`)
        .then((result) => {
          if (active) setResult({ scope, directory: result, error: "" });
        })
        .catch(() => {
          if (active) setResult({ scope, directory: null, error: "Could not load this directory. Retry your search." });
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, company, kind, accountType, search, offset, scope]);
  const items = directory?.items ?? [];
  return (
    <div className="min-w-0 space-y-1.5">
      <Input
        aria-label={`Search ${label}`}
        placeholder={`Search ${label.toLowerCase()}`}
        value={search}
        disabled={disabled}
        onChange={(event) => {
          setSearch(event.target.value);
          setOffset(0);
        }}
      />
      <LabeledField label={label}>
        <select
          className={productSelectClass}
          value={value}
          disabled={disabled || busy}
          onChange={(event) => {
            const item = items.find((item) => item.id === event.target.value);
            setSelected(item ? { id: item.id, name: `${item.code} · ${item.name}` } : null);
            onChange(event.target.value);
          }}
        >
          <option value="">{busy ? "Loading…" : "Select a record"}</option>
          {value && !items.some((item) => item.id === value) ? (
            <option value={value}>{selected?.id === value ? selected.name : "Selected record"}</option>
          ) : null}
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.name || item.type}
            </option>
          ))}
        </select>
      </LabeledField>
      {error ? (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {directory && directory.total > 20 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy || !offset}
            onClick={() => setOffset((n) => n - 20)}
          >
            Previous
          </Button>
          <span>
            {offset + 1}–{Math.min(offset + 20, directory.total)} of {directory.total}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy || offset + 20 >= directory.total}
            onClick={() => setOffset((n) => n + 20)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
