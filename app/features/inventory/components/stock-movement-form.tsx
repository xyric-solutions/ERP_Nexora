"use client";
import { useEffect, useRef, useState } from "react";
import {
  stockMovementInputSchema,
  expectedBatchMaterials,
  parseQuantity,
  type ManufacturingOrder,
  type StockMovementInput,
  type StockOperation,
  type StockLookupQuery,
} from "@nexora/contracts";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/shared/ui/labeled-field";
import { productSelectClass } from "../model/products";
import { StockLookup } from "./stock-lookup";

const kinds = [
  "opening",
  "receipt",
  "transfer",
  "manufacturing_issue",
  "manufacturing_completion",
  "manufacturing_charge",
  "reversal",
] as const;
type Kind = (typeof kinds)[number];
const labels: Record<Kind, string> = {
  opening: "Opening stock",
  receipt: "Purchase receipt",
  transfer: "Warehouse transfer",
  manufacturing_issue: "Actual manufacturing consumption",
  manufacturing_completion: "Actual finished output",
  manufacturing_charge: "Allocate approved actual production charges",
  reversal: "Reverse a posted movement",
};
const sources: Partial<Record<Kind, StockLookupQuery["kind"]>> = {
  receipt: "receipt",
  transfer: "transfer",
  manufacturing_issue: "manufacturing_order",
  manufacturing_completion: "manufacturing_issue",
  manufacturing_charge: "manufacturing_issue",
  reversal: "reversal",
};
const emptyLine = () => ({ product_id: "", warehouse_id: "", quantity: "", value: "", variance_reason: "" });
export function StockMovementForm({
  company,
  onCreated,
  onDirtyChange,
}: {
  company: string;
  onCreated: (record: StockOperation) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, csrfToken } = useSession();
  const [kind, setKind] = useState<Kind>("opening"),
    [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [source, setSource] = useState(""),
    [warehouse, setWarehouse] = useState(""),
    [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState(""),
    [reason, setReason] = useState("");
  const [lines, setLines] = useState([emptyLine()]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [recipeResult, setRecipeResult] = useState<{
    source: string;
    order: ManufacturingOrder | null;
    error: string;
  } | null>(null);
  const recipeOrder = recipeResult?.source === source ? recipeResult.order : null,
    recipeError = recipeResult?.source === source ? recipeResult.error : "",
    recipeBusy = kind === "manufacturing_issue" && !!source && recipeResult?.source !== source;
  const quantityRef = useRef(quantity);
  const [allocations, setAllocations] = useState([{ journal_line_id: "", amount: "" }]),
    [chargeReview, setChargeReview] = useState("");
  const retry = useRef<{ body: string; key: string } | null>(null),
    lock = useRef(false);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  function fillMaterials(order: ManufacturingOrder | null, value: string) {
    if (!order?.recipe) return;
    try {
      if (parseQuantity(value) <= 0n) return;
      setLines(
        expectedBatchMaterials(order.recipe, order.issued_quantity ?? "0", value).map((line) => ({
          product_id: line.product_id,
          warehouse_id: line.warehouse_id ?? "",
          quantity: line.quantity,
          value: "",
          variance_reason: "",
        })),
      );
    } catch {
      /* The form reports incomplete quantities. */
    }
  }
  useEffect(() => {
    let active = true;
    if (kind === "manufacturing_issue" && source)
      api
        .getManufacturingOrder(source, company)
        .then((order) => {
          if (active) {
            setRecipeResult({ source, order, error: "" });
            fillMaterials(order, quantityRef.current);
          }
        })
        .catch((e) => {
          if (active)
            setRecipeResult({
              source,
              order: null,
              error: e instanceof ApiError ? e.message : "Could not load the approved material recipe.",
            });
        });
    return () => {
      active = false;
    };
  }, [api, kind, source, company]);
  async function submit() {
    if (lock.current || recipeBusy || recipeError) return;
    const common = { company_id: company, kind, date, reference, reason };
    const candidate =
      kind === "opening"
        ? { ...common, lines }
        : kind === "manufacturing_issue"
          ? {
              ...common,
              source_id: source,
              quantity,
              lines: lines.map(({ product_id, warehouse_id, quantity, variance_reason }) => ({
                product_id,
                warehouse_id,
                quantity,
                variance_reason,
              })),
            }
          : kind === "manufacturing_charge"
            ? { ...common, source_id: source, allocations }
            : kind === "reversal"
              ? { ...common, operation_id: source }
              : kind === "transfer"
                ? { ...common, source_id: source }
                : kind === "receipt"
                  ? { ...common, source_id: source, warehouse_id: warehouse }
                  : {
                      ...common,
                      source_id: source,
                      warehouse_id: warehouse,
                      quantity,
                      charges_review_reason: chargeReview,
                    };
    const parsed = stockMovementInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" "));
      return;
    }
    const input: StockMovementInput = parsed.data,
      body = JSON.stringify(input);
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const record = await api.createStockMovement(input, csrfToken(), retry.current.key);
      retry.current = null;
      onDirtyChange?.(false);
      onCreated(record);
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error.message
          : "The draft could not be created. Retry to retain the request identity.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-4"
      onChange={() => onDirtyChange?.(true)}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={busy} className="m-0 space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 font-medium">New stock movement</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <LabeledField label="Movement type">
            <select
              className={productSelectClass}
              value={kind}
              onChange={(event) => {
                const found = kinds.find((value) => value === event.target.value);
                if (found) {
                  setKind(found);
                  setRecipeResult(null);
                  setSource("");
                  setLines([emptyLine()]);
                  setAllocations([{ journal_line_id: "", amount: "" }]);
                }
              }}
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {labels[kind]}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Posting date">
            <Input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          </LabeledField>
          {sources[kind] ? (
            <StockLookup
              key={kind}
              company={company}
              kind={sources[kind]!}
              label="Approved source"
              value={source}
              onChange={(id) => {
                setRecipeResult(null);
                setSource(id);
                setLines([emptyLine()]);
              }}
            />
          ) : null}
          {kind === "receipt" || kind === "manufacturing_completion" ? (
            <StockLookup
              company={company}
              kind="warehouse"
              label="Receiving warehouse"
              value={warehouse}
              onChange={setWarehouse}
            />
          ) : null}
          {kind === "manufacturing_issue" || kind === "manufacturing_completion" ? (
            <LabeledField
              label={
                kind === "manufacturing_issue"
                  ? "Output quantity planned for this actual batch"
                  : "Actual finished quantity"
              }
            >
              <Input
                inputMode="decimal"
                value={quantity}
                required
                onChange={(event) => {
                  quantityRef.current = event.target.value;
                  setQuantity(event.target.value);
                  fillMaterials(recipeOrder, event.target.value);
                }}
              />
            </LabeledField>
          ) : null}
          <LabeledField label="Reference">
            <Input value={reference} maxLength={160} onChange={(event) => setReference(event.target.value)} />
          </LabeledField>
        </div>
        {kind === "manufacturing_charge" ? (
          <div className="grid gap-3">
            <p className="m-0 text-sm text-muted-foreground">
              Allocate eligible posted expense amounts in the company functional currency. Separate approval moves
              expense to WIP; the source payable remains unchanged. Allocation creates no stock quantity.
            </p>
            {allocations.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-3">
                <StockLookup
                  company={company}
                  kind="production_expense"
                  label={`Posted expense source ${index + 1}`}
                  value={line.journal_line_id}
                  onChange={(id) =>
                    setAllocations((items) =>
                      items.map((item, i) => (i === index ? { ...item, journal_line_id: id } : item)),
                    )
                  }
                />
                <LabeledField label={`Actual base amount ${index + 1}`}>
                  <Input
                    required
                    inputMode="decimal"
                    value={line.amount}
                    onChange={(e) =>
                      setAllocations((items) =>
                        items.map((item, i) => (i === index ? { ...item, amount: e.target.value } : item)),
                      )
                    }
                  />
                </LabeledField>
                <Button
                  type="button"
                  variant="outline"
                  disabled={allocations.length === 1}
                  onClick={() => setAllocations((items) => items.filter((_, i) => i !== index))}
                >
                  Remove charge {index + 1}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={allocations.length >= 100}
              onClick={() => setAllocations((items) => [...items, { journal_line_id: "", amount: "" }])}
            >
              Add posted expense
            </Button>
          </div>
        ) : null}
        {kind === "manufacturing_completion" ? (
          <LabeledField label="Actual charge review">
            <Textarea
              value={chargeReview}
              maxLength={500}
              onChange={(e) => setChargeReview(e.target.value)}
              placeholder="Confirm actual approved charges, or explain why estimated charges do not apply to this batch."
            />
          </LabeledField>
        ) : null}
        {recipeBusy ? <p role="status">Loading approved material recipe?</p> : null}
        {recipeError ? (
          <p role="alert" className="text-destructive">
            {recipeError}
          </p>
        ) : null}
        {recipeOrder?.recipe ? (
          <p className="text-sm text-muted-foreground">
            {recipeOrder.recipe.bom_code} ? revision {recipeOrder.recipe.bom_version}. Materials are calculated for this
            batch from the approved order. Explain actual quantity differences.
          </p>
        ) : kind === "manufacturing_issue" && recipeOrder ? (
          <p className="text-sm text-muted-foreground">
            Legacy order without a saved BOM recipe. Enter and review actual materials explicitly.
          </p>
        ) : null}
        {kind === "opening" || kind === "manufacturing_issue" ? (
          <div className="space-y-3">
            <p className="m-0 text-sm text-muted-foreground">
              Enter actual quantities in the product&apos;s base unit.
              {kind === "opening"
                ? " Opening value is the total functional-currency value, not a unit rate."
                : " Consumption uses posted stock costs; order approval alone creates no stock."}
            </p>
            {lines.map((line, index) => (
              <div
                key={index}
                className="grid items-start gap-3 rounded-lg border border-border p-3 md:grid-cols-2 xl:grid-cols-4"
              >
                <StockLookup
                  company={company}
                  kind="product"
                  label={`Line ${index + 1} product`}
                  disabled={kind === "manufacturing_issue" && Boolean(recipeOrder?.recipe)}
                  value={line.product_id}
                  onChange={(id) =>
                    setLines((items) => items.map((item, i) => (i === index ? { ...item, product_id: id } : item)))
                  }
                />
                <StockLookup
                  company={company}
                  kind="warehouse"
                  label={`Line ${index + 1} warehouse`}
                  disabled={
                    kind === "manufacturing_issue" &&
                    Boolean(
                      recipeOrder?.recipe?.lines.find((material) => material.product_id === line.product_id)
                        ?.warehouse_id,
                    )
                  }
                  value={line.warehouse_id}
                  onChange={(id) =>
                    setLines((items) => items.map((item, i) => (i === index ? { ...item, warehouse_id: id } : item)))
                  }
                />
                <LabeledField label={`Line ${index + 1} base quantity`}>
                  <Input
                    inputMode="decimal"
                    required
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((items) =>
                        items.map((item, i) => (i === index ? { ...item, quantity: event.target.value } : item)),
                      )
                    }
                  />
                </LabeledField>
                {kind === "manufacturing_issue" ? (
                  <LabeledField label={`Material variance reason ${index + 1}`}>
                    <Textarea
                      maxLength={500}
                      value={line.variance_reason}
                      onChange={(e) =>
                        setLines((items) =>
                          items.map((item, i) => (i === index ? { ...item, variance_reason: e.target.value } : item)),
                        )
                      }
                    />
                  </LabeledField>
                ) : null}
                {kind === "opening" ? (
                  <LabeledField label={`Line ${index + 1} total value`}>
                    <Input
                      inputMode="decimal"
                      required
                      value={line.value}
                      onChange={(event) =>
                        setLines((items) =>
                          items.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)),
                        )
                      }
                    />
                  </LabeledField>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={lines.length === 1 || (kind === "manufacturing_issue" && Boolean(recipeOrder?.recipe))}
                  onClick={() => setLines((items) => items.filter((_, i) => i !== index))}
                >
                  Remove line {index + 1}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={
                lines.length >= (kind === "manufacturing_issue" ? 200 : 100) ||
                (kind === "manufacturing_issue" && Boolean(recipeOrder?.recipe))
              }
              onClick={() => setLines((items) => [...items, emptyLine()])}
            >
              Add actual line
            </Button>
          </div>
        ) : null}
        <LabeledField label="Business reason">
          <Textarea
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </LabeledField>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || recipeBusy || !!recipeError}>
        {busy ? "Creating…" : "Create draft for review"}
      </Button>
    </form>
  );
}
