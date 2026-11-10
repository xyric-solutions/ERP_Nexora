"use client";
import { useEffect, useId, useState } from "react";
import type { ProductLookupDirectory, ProductLookupKind, InventorySurface } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabeledField } from "@/shared/ui/labeled-field";
import { productError } from "../model/products";
import { ChevronDown } from "lucide-react";

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
  return (
    <div className="min-w-0">
      <LabeledField label={label}>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full justify-between whitespace-normal text-left font-normal"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={`${id}-options`}
          onClick={() => setOpen(!open)}
        >
          <span className="truncate">{value ? (name ?? value) : "Select…"}</span>
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
      </LabeledField>
      {open ? (
        <section
          id={`${id}-options`}
          aria-label={`Choose ${label.toLowerCase()}`}
          className="mt-2 space-y-2 rounded-lg border border-border bg-background p-3"
        >
          <Input
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder="Search by code or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-52 overflow-y-auto">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                onChange(null, null);
                setOpen(false);
              }}
            >
              None
            </Button>
            {result.items.map((item) => (
              <Button
                type="button"
                key={item.id}
                variant="ghost"
                className="h-auto min-h-10 w-full justify-start whitespace-normal text-left"
                onClick={() => {
                  onChange(item.id, `${item.code} · ${item.name}`, item.unit);
                  setOpen(false);
                }}
              >
                {item.code} · {item.name}
              </Button>
            ))}
            {!busy && !result.items.length ? (
              <p className="py-2 text-sm text-muted-foreground">No eligible records. Try another search.</p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}{" "}
              <Button type="button" variant="link" onClick={() => setRetry((n) => n + 1)}>
                Retry
              </Button>
            </p>
          ) : null}
          {busy ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading choices…
            </p>
          ) : null}
          {result.next_cursor ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void more()}>
              Load more
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close choices
          </Button>
        </section>
      ) : null}
    </div>
  );
}
