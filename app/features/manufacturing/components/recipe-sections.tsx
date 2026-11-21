"use client";
import { useEffect, useRef, useState } from "react";
import {
  quantitiesEqual,
  type ManufacturingRecipe,
  type ManufacturingSurface,
  type RequirementsPreview,
  type ManufacturingOrderInput,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkTable } from "@/shared/ui/work-table";
import { manufacturingError } from "../model/manufacturing";
const table =
  "w-full border-collapse text-left text-sm [&_th]:whitespace-nowrap [&_th]:bg-muted [&_th]:p-2 [&_td]:border-b [&_td]:border-border [&_td]:p-2";
export function RecipeSections({
  recipe,
  availability,
  actualLines,
  onMaterialChange,
}: {
  recipe: ManufacturingRecipe;
  availability?: RequirementsPreview["availability"];
  actualLines?: ManufacturingOrderInput["lines"];
  onMaterialChange?: (lines: NonNullable<ManufacturingOrderInput["lines"]>) => void;
}) {
  function material(index: number, patch: { quantity?: string; remark?: string }) {
    const lines = recipe.lines.map((line, i) => ({
      product_id: line.product_id,
      quantity: actualLines?.find((l) => l.product_id === line.product_id)?.quantity ?? line.quantity,
      remark: actualLines?.find((l) => l.product_id === line.product_id)?.remark ?? line.remark,
      ...(i === index ? patch : {}),
    }));
    onMaterialChange?.(lines);
  }
  return (
    <div className="grid min-w-0 gap-4">
      <p className="m-0 text-sm text-muted-foreground">
        {recipe.bom_code} · {recipe.template_name} · revision {recipe.bom_version}
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Finished Goods</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkTable tableId="recipe-output" tools={false} keyboardScroll className={table}>
            <thead>
              <tr>
                <th>Product / Services</th>
                <th>Description</th>
                <th>Quantity</th>
                <th>Base unit</th>
                <th>Cost share</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{recipe.product_code}</td>
                <td>{recipe.product_name}</td>
                <td>{recipe.quantity}</td>
                <td>{recipe.unit}</td>
                <td>100%</td>
              </tr>
            </tbody>
          </WorkTable>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Raw Material</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkTable tableId="recipe-materials" tools={false} keyboardScroll className={table}>
            <thead>
              <tr>
                <th>Product / Services</th>
                <th>Description</th>
                <th>Category</th>
                <th>Warehouse</th>
                <th>Unit</th>
                <th>Stock in hand</th>
                <th>BOM quantity</th>
                <th>Qty required</th>
                {onMaterialChange ? (
                  <>
                    <th>Order quantity</th>
                    <th>Variance reason</th>
                  </>
                ) : null}
                <th>Shortage</th>
              </tr>
            </thead>
            <tbody>
              {recipe.lines.map((line, index) => {
                const live = availability?.find((row) => row.product_id === line.product_id),
                  actual = actualLines?.find((l) => l.product_id === line.product_id);
                return (
                  <tr key={line.product_id}>
                    <td>{line.product_code}</td>
                    <td>{line.description}</td>
                    <td>{line.category || "Unmapped"}</td>
                    <td>{line.warehouse_name ?? "Select warehouse"}</td>
                    <td>{line.unit}</td>
                    <td>{live?.on_hand ?? "Not checked"}</td>
                    <td>
                      {line.bom_quantity} per {recipe.output_quantity} {recipe.unit}
                    </td>
                    <td>
                      {onMaterialChange ? line.standard_quantity : line.quantity}
                      {!onMaterialChange && !quantitiesEqual(line.quantity, line.standard_quantity) ? (
                        <p className="m-0 text-xs text-muted-foreground">
                          BOM standard: {line.standard_quantity} / {line.remark}
                        </p>
                      ) : null}
                    </td>
                    {onMaterialChange ? (
                      <>
                        <td>
                          <Input
                            aria-label={`Order quantity ${line.product_code}`}
                            inputMode="decimal"
                            value={actual?.quantity ?? line.quantity}
                            onChange={(e) => material(index, { quantity: e.target.value })}
                          />
                        </td>
                        <td>
                          <Input
                            aria-label={`Variance reason ${line.product_code}`}
                            maxLength={500}
                            value={actual?.remark ?? line.remark}
                            onChange={(e) => material(index, { remark: e.target.value })}
                          />
                        </td>
                      </>
                    ) : null}
                    <td>{live?.shortage ?? "Not checked"}</td>
                  </tr>
                );
              })}
            </tbody>
          </WorkTable>
          <p className="mt-2 text-xs text-muted-foreground">
            Posted stock is shown as of {availability?.[0]?.as_of ?? "the selected review date"}. Planning does not
            reserve materials.
          </p>
        </CardContent>
      </Card>
      {(["non_stock", "expense"] as const).map((kind) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle>{kind === "non_stock" ? "Non Stock" : "Expenses"}</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkTable tableId={`recipe-${kind}`} tools={false} keyboardScroll className={table}>
              <thead>
                <tr>
                  <th>{kind === "non_stock" ? "Product" : "Expense"}</th>
                  <th>Details</th>
                  <th>Quantity</th>
                  <th>Estimated rate</th>
                  <th>Estimated amount</th>
                </tr>
              </thead>
              <tbody>
                {recipe.charges
                  .filter((line) => line.kind === kind)
                  .map((line, index) => (
                    <tr key={index}>
                      <td>{line.product_name ?? line.account_name}</td>
                      <td>{line.description}</td>
                      <td>{line.quantity}</td>
                      <td>
                        {recipe.currency} {line.rate}
                      </td>
                      <td>
                        {recipe.currency} {line.amount}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </WorkTable>
            {!recipe.charges.some((line) => line.kind === kind) ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No {kind === "expense" ? "expenses" : "non-stock inputs"} estimated.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
      {recipe.notes ? <p className="m-0 whitespace-pre-wrap text-sm">Template notes: {recipe.notes}</p> : null}
      <p className="m-0 text-sm">
        Estimated additional charges: {recipe.currency} {recipe.estimated_charges}. Actual cost requires reviewed posted
        source allocations.
      </p>
    </div>
  );
}
export function TemplateRequirements({
  company,
  product,
  quantity,
  surface,
  bomVersion,
  warehouse,
  snapshot,
  frozen = false,
  legacy = false,
  onPreview,
  actualLines,
  onMaterialChange,
}: {
  company: string;
  product: string;
  quantity: string;
  surface: ManufacturingSurface;
  bomVersion?: number;
  warehouse?: string | null;
  snapshot?: ManufacturingRecipe | null;
  frozen?: boolean;
  legacy?: boolean;
  onPreview: (recipe: ManufacturingRecipe) => void;
  actualLines?: ManufacturingOrderInput["lines"];
  onMaterialChange?: (lines: NonNullable<ManufacturingOrderInput["lines"]>) => void;
}) {
  const { api } = useSession(),
    [preview, setPreview] = useState<RequirementsPreview | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [explicit, setExplicit] = useState(false),
    [attach, setAttach] = useState(false),
    callback = useRef(onPreview);
  useEffect(() => {
    callback.current = onPreview;
  }, [onPreview]);
  useEffect(() => {
    if (frozen || (legacy && !attach) || !product || !/^\d+(\.\d{1,4})?$/.test(quantity) || !/[1-9]/.test(quantity))
      return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      setPreview(null);
      api
        .getManufacturingRequirements(
          `?${new URLSearchParams({ company_id: company, surface, product_id: product, quantity, ...(warehouse ? { warehouse_id: warehouse } : {}), ...(!explicit && bomVersion ? { bom_version: String(bomVersion) } : {}) })}`,
        )
        .then((value) => {
          if (active) {
            setPreview(value);
            setExplicit(false);
            callback.current(value.recipe);
          }
        })
        .catch((e) => {
          if (active) setError(manufacturingError(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, company, product, quantity, surface, warehouse, bomVersion, frozen, legacy, attach, refresh, explicit]);
  if (!product)
    return <p className="text-sm text-muted-foreground">Select a finished product to load its BOM template.</p>;
  if (legacy && !attach)
    return (
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          Legacy record: no BOM snapshot was saved. Existing history is retained.
        </p>
        {!frozen ? (
          <Button type="button" variant="outline" onClick={() => setAttach(true)}>
            Attach BOM template
          </Button>
        ) : null}
      </div>
    );
  const shown = frozen
    ? snapshot
    : preview?.recipe.product_id === product && preview.recipe.quantity === quantity
      ? preview.recipe
      : null;
  return (
    <div className="grid gap-3">
      {!frozen ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => {
              setExplicit(true);
              setRefresh((n) => n + 1);
            }}
          >
            Refresh from BOM
          </Button>
          <span role="status" className="text-sm text-muted-foreground">
            {loading ? "Calculating material requirements…" : "Requirements are calculated on the server."}
          </span>
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {shown ? (
        <RecipeSections
          recipe={shown}
          availability={frozen ? undefined : preview?.availability}
          actualLines={actualLines}
          onMaterialChange={onMaterialChange}
        />
      ) : frozen ? (
        <p className="text-sm text-muted-foreground">
          Legacy order: no recipe snapshot was recorded. Review explicit actual consumption before posting.
        </p>
      ) : null}
    </div>
  );
}
