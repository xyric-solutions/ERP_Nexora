"use client";
import { useEffect, useRef, useState } from "react";
import {
  stockMovementInputSchema,
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
  "reversal",
] as const;
type Kind = (typeof kinds)[number];
const labels: Record<Kind, string> = {
  opening: "Opening stock",
  receipt: "Purchase receipt",
  transfer: "Warehouse transfer",
  manufacturing_issue: "Actual manufacturing consumption",
  manufacturing_completion: "Actual finished output",
  reversal: "Reverse a posted movement",
};
const sources: Partial<Record<Kind, StockLookupQuery["kind"]>> = {
  receipt: "receipt",
  transfer: "transfer",
  manufacturing_issue: "manufacturing_order",
  manufacturing_completion: "manufacturing_issue",
  reversal: "reversal",
};
const emptyLine = () => ({ product_id: "", warehouse_id: "", quantity: "", value: "" });
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
  const retry = useRef<{ body: string; key: string } | null>(null),
    lock = useRef(false);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  async function submit() {
    if (lock.current) return;
    const common = { company_id: company, kind, date, reference, reason };
    const candidate =
      kind === "opening"
        ? { ...common, lines }
        : kind === "manufacturing_issue"
          ? {
              ...common,
              source_id: source,
              quantity,
              lines: lines.map(({ product_id, warehouse_id, quantity }) => ({ product_id, warehouse_id, quantity })),
            }
          : kind === "reversal"
            ? { ...common, operation_id: source }
            : kind === "transfer"
              ? { ...common, source_id: source }
              : kind === "receipt"
                ? { ...common, source_id: source, warehouse_id: warehouse }
                : { ...common, source_id: source, warehouse_id: warehouse, quantity };
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
                  setSource("");
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
              onChange={setSource}
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
                onChange={(event) => setQuantity(event.target.value)}
              />
            </LabeledField>
          ) : null}
          <LabeledField label="Reference">
            <Input value={reference} maxLength={160} onChange={(event) => setReference(event.target.value)} />
          </LabeledField>
        </div>
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
                  value={line.product_id}
                  onChange={(id) =>
                    setLines((items) => items.map((item, i) => (i === index ? { ...item, product_id: id } : item)))
                  }
                />
                <StockLookup
                  company={company}
                  kind="warehouse"
                  label={`Line ${index + 1} warehouse`}
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
                  disabled={lines.length === 1}
                  onClick={() => setLines((items) => items.filter((_, i) => i !== index))}
                >
                  Remove line {index + 1}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={lines.length >= 100}
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
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create draft for review"}
      </Button>
    </form>
  );
}
