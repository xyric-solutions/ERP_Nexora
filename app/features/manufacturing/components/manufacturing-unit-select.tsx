"use client";
import { useEffect, useState } from "react";
import { convertUnitQuantity, type ManufacturingSurface, type ProductUnits } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { productSelectClass } from "@/features/inventory/model/products";
import { manufacturingError } from "../model/manufacturing";
export function ManufacturingUnitSelect(props: Parameters<typeof ScopedManufacturingUnitSelect>[0]) {
  return <ScopedManufacturingUnitSelect key={`${props.company}:${props.product}`} {...props} />;
}
function ScopedManufacturingUnitSelect({
  company,
  product,
  value,
  onChange,
  label,
  surface = "boms",
  disabled = false,
  quantity,
}: {
  company: string;
  product: string;
  value?: string;
  onChange: (id: string) => void;
  label: string;
  surface?: ManufacturingSurface;
  disabled?: boolean;
  quantity?: string;
}) {
  const { api } = useSession(),
    [choices, setChoices] = useState<ProductUnits | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (product)
      api
        .getManufacturingProductUnits(product, company, surface)
        .then((value) => {
          if (active) setChoices(value);
        })
        .catch((e) => {
          if (active) setError(manufacturingError(e));
        });
    return () => {
      active = false;
    };
  }, [api, product, company, surface]);
  let base = "";
  try {
    const selected = choices?.items.find((item) => item.unit.id === (value ?? choices.base.id));
    if (selected && quantity) base = `${convertUnitQuantity(quantity, selected, 4).quantity} ${choices!.base.name}`;
  } catch {
    /* Invalid input is reported by the form. */
  }
  return (
    <div className="grid min-w-32 gap-1">
      <select
        aria-label={label}
        disabled={disabled || !choices}
        className={productSelectClass}
        value={value ?? choices?.base.id ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {!choices ? (
          <option value="">{product ? "Loading units…" : "Select product"}</option>
        ) : (
          choices.items.map((item) => (
            <option key={item.unit.id} value={item.unit.id}>
              {item.unit.name}
            </option>
          ))
        )}
      </select>
      {base ? <p className="m-0 text-xs text-muted-foreground">Base quantity: {base}</p> : null}
      {error ? (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
