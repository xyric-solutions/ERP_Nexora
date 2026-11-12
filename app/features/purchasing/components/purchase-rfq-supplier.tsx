"use client";

import { useCallback, useState } from "react";
import type { Supplier } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { usePurchaseDirectory } from "./use-purchase-directory";

export function PurchaseRfqSupplier({
  company,
  value,
  name,
  suppliers,
  disabled,
  onValueChange,
}: {
  company: string;
  value: string;
  name: string | null;
  suppliers: Supplier[];
  disabled: boolean;
  onValueChange: (value: string, supplier?: Supplier) => void;
}) {
  const { api, session } = useSession();
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);
  const load = useCallback((query: string) => api.listPurchaseSuppliers(query), [api]);
  const directory = usePurchaseDirectory(
    company,
    load,
    !disabled && !!session?.user.permissions.includes("procurement.vendor.read"),
  );
  const saved = suppliers.find((supplier) => supplier.id === value);
  const savedLabel = selected?.id === value ? selected.label : saved ? `${saved.code} · ${saved.name}` : name;
  return (
    <SearchableSelect
      label="Supplier *"
      required
      value={value}
      disabled={disabled}
      placeholder="Select supplier"
      searchLabel="Search suppliers"
      search={directory.search}
      onSearchChange={directory.setSearch}
      loading={directory.busy}
      options={[
        ...directory.items.map((supplier) => ({
          value: supplier.id,
          label: `${supplier.code} · ${supplier.name}`,
          disabled: supplier.status !== "active" || supplier.risk_status === "blocked",
        })),
        ...(value && !directory.items.some((supplier) => supplier.id === value)
          ? [{ value, label: savedLabel || `Saved supplier (${value})` }]
          : []),
      ]}
      onValueChange={(id) => {
        const supplier = directory.items.find((item) => item.id === id);
        if (supplier) setSelected({ id, label: `${supplier.code} · ${supplier.name}` });
        onValueChange(id, supplier);
      }}
      footer={
        <>
          {directory.error ? (
            <div role="alert" className="p-2 text-sm text-destructive">
              {directory.error}
              <Button type="button" variant="link" onClick={directory.retry}>
                Retry supplier search
              </Button>
            </div>
          ) : null}
          {directory.cursor ? (
            <Button type="button" variant="link" disabled={directory.busy} onClick={() => void directory.more()}>
              Load more suppliers
            </Button>
          ) : null}
        </>
      }
    />
  );
}
