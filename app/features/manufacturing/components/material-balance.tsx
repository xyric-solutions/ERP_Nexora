"use client";
import { useEffect, useState } from "react";
import type { MaterialBalance } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { manufacturingError } from "../model/manufacturing";

export function MaterialBalanceCell(props: Parameters<typeof ScopedMaterialBalanceCell>[0]) {
  return <ScopedMaterialBalanceCell key={`${props.company}:${props.product}:${props.warehouse ?? ""}`} {...props} />;
}
function ScopedMaterialBalanceCell({
  company,
  product,
  warehouse,
}: {
  company: string;
  product: string;
  warehouse?: string | null;
}) {
  const { api } = useSession(),
    [balance, setBalance] = useState<MaterialBalance | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (product) {
      const query = new URLSearchParams({ company_id: company, surface: "boms", product_id: product });
      if (warehouse) query.set("warehouse_id", warehouse);
      api
        .getManufacturingMaterialBalance(`?${query}`)
        .then((value) => {
          if (active) setBalance(value);
        })
        .catch((e) => {
          if (active) setError(manufacturingError(e));
        });
    }
    return () => {
      active = false;
    };
  }, [api, company, product, warehouse]);
  return (
    <div className="grid min-w-32 gap-1 text-sm">
      {balance ? (
        <>
          <span>{balance.category}</span>
          <span>{balance.on_hand === null ? "Select warehouse" : `${balance.on_hand} ${balance.unit} on hand`}</span>
          <span className="text-xs text-muted-foreground">As of {balance.as_of} · no reservation</span>
        </>
      ) : (
        <span>{product ? "Loading balance…" : "Select material"}</span>
      )}
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
