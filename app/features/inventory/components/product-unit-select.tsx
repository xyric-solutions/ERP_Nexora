"use client";
import { useEffect, useState } from "react";
import { convertUnitQuantity, type ProductUnits } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { productSelectClass } from "../model/products";
import { Button } from "@/components/ui/button";

/** Choices come from the workflow-authorized API, including product pack contents. */
export function ProductUnitSelect({
  company,
  product,
  quantity,
  value,
  fallback,
  label,
  disabled,
  surface = "products",
  onChange,
}: {
  company: string;
  product: string;
  quantity: string;
  value?: string;
  fallback: string;
  label: string;
  disabled?: boolean;
  onChange: (id: string, name: string) => void;
  surface?: "products" | "purchases" | "transfers";
}) {
  const { api } = useSession();
  const [data, setData] = useState<{ product: string; choices: ProductUnits } | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .getProductUnits(company, product, surface)
      .then((choices) => {
        if (active) {
          setData({ product, choices });
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("Units could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [api, company, product, surface, retry]);
  const choices = data?.product === product ? data.choices : null;
  const selected = choices?.items.find((c) => c.unit.id === (value ?? choices.base.id));
  let equivalent = "";
  if (selected && choices) {
    try {
      const result = convertUnitQuantity(quantity, selected, 4);
      equivalent = `${result.exact ? "" : "Approximately "}${result.quantity} ${choices.base.name}${result.exact ? "" : "; exceeds base precision"}`;
    } catch {
      /* Quantity input validation is shown by the parent form. */
    }
  }
  return (
    <div className="min-w-0 space-y-1">
      <select
        aria-label={label}
        className={productSelectClass}
        disabled={disabled || !choices}
        value={selected?.unit.id ?? ""}
        onChange={(e) => {
          const choice = choices?.items.find((c) => c.unit.id === e.target.value);
          if (choice) onChange(choice.unit.id, choice.unit.name);
        }}
      >
        {!selected ? <option value="">{fallback || "Loading units…"}</option> : null}
        {choices?.items.map((c) => (
          <option key={c.unit.id} value={c.unit.id}>
            {c.unit.name} ({c.unit.symbol})
          </option>
        ))}
      </select>
      {equivalent ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {equivalent}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}{" "}
          <Button type="button" variant="link" size="sm" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </Button>
        </p>
      ) : null}
    </div>
  );
}
