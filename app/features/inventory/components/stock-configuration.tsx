"use client";
import { useEffect, useRef, useState } from "react";
import type { StockPolicy, StockPolicyInput, StockValuation } from "@nexora/contracts";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/shared/ui/labeled-field";
import { StockLookup } from "./stock-lookup";
import { productSelectClass } from "../model/products";

const mappings = [
  { key: "receipt_accrual_account_id", label: "Goods received, not invoiced", type: "liability" },
  { key: "opening_account_id", label: "Opening stock offset", type: "equity" },
  { key: "wip_account_id", label: "Work in progress", type: "asset" },
  { key: "variance_account_id", label: "Purchase price / exchange variance", type: "expense" },
] as const;
const empty = { receipt_accrual_account_id: "", opening_account_id: "", wip_account_id: "", variance_account_id: "" };
export function StockConfiguration({
  company,
  policy,
  onSaved,
  onDirtyChange,
}: {
  company: string;
  policy: StockPolicy | null;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, csrfToken } = useSession();
  const [accounts, setAccounts] = useState(() =>
      policy
        ? {
            receipt_accrual_account_id: policy.receipt_accrual_account_id,
            opening_account_id: policy.opening_account_id,
            wip_account_id: policy.wip_account_id,
            variance_account_id: policy.variance_account_id,
          }
        : empty,
    ),
    [reason, setReason] = useState("");
  const [product, setProduct] = useState(""),
    [valuation, setValuation] = useState<StockValuation | null>(null);
  const [method, setMethod] = useState<"" | "fifo" | "weighted_average">(""),
    [valuationReason, setValuationReason] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [valuationLoading, setValuationLoading] = useState(false);
  const [valuationReady, setValuationReady] = useState(false);
  const lock = useRef(false),
    retry = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (!product) return;
    let active = true;
    const query = new URLSearchParams({
      company_id: company,
      as_of: new Date().toLocaleDateString("en-CA"),
      product_id: product,
    });
    api
      .getStockWorkspace(`?${query}`)
      .then((result) => {
        if (active) {
          const current = result.valuations[0] ?? null;
          setValuation(current);
          setMethod(current?.method ?? "");
          setValuationReady(true);
        }
      })
      .catch(() => {
        if (active) setError("Could not load the current valuation. Reselect the product before saving.");
      })
      .finally(() => {
        if (active) setValuationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, company, product]);
  function selectProduct(id: string) {
    setProduct(id);
    setValuation(null);
    setMethod("");
    setValuationReason("");
    setValuationReady(false);
    setValuationLoading(!!id);
  }
  async function save(kind: "policy" | "valuation") {
    if (lock.current || valuationLoading || (kind === "valuation" && !valuationReady)) return;
    const input =
      kind === "policy"
        ? { company_id: company, expected_version: policy?.version ?? 0, ...accounts, reason }
        : {
            company_id: company,
            product_id: product,
            expected_version: valuation?.version ?? 0,
            method,
            reason: valuationReason,
          };
    const body = JSON.stringify({ kind, input });
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "policy") {
        const input: StockPolicyInput = {
          company_id: company,
          expected_version: policy?.version ?? 0,
          ...accounts,
          reason,
        };
        await api.configureStockPolicy(input, csrfToken(), retry.current.key);
      } else {
        if (!method) throw new Error("Choose a reviewed valuation method.");
        const updated = await api.configureStockValuation(
          {
            company_id: company,
            product_id: product,
            expected_version: valuation?.version ?? 0,
            method,
            reason: valuationReason,
          },
          csrfToken(),
          retry.current.key,
        );
        setValuation(updated);
        setValuationReason("");
      }
      retry.current = null;
      onDirtyChange?.(false);
      onSaved();
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error.message
          : "The configuration was not saved. Review all required values and retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5" onChange={() => onDirtyChange?.(true)}>
      <p className="m-0 text-sm text-muted-foreground">
        Choose accounts and valuation methods supported by approved business evidence. No mappings or opening stock are
        created automatically.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save("policy");
        }}
      >
        <fieldset disabled={busy} className="m-0 space-y-4 rounded-lg border border-border p-4">
          <legend className="px-1 font-medium">Company stock accounting · version {policy?.version ?? 0}</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {mappings.map((mapping) => (
              <StockLookup
                key={mapping.key}
                company={company}
                kind="account"
                label={mapping.label}
                accountType={mapping.type}
                value={accounts[mapping.key]}
                onChange={(id) => setAccounts((current) => ({ ...current, [mapping.key]: id }))}
              />
            ))}
          </div>
          <LabeledField label="Evidence / reason">
            <Textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </LabeledField>
          <Button type="submit" disabled={busy || mappings.some((mapping) => !accounts[mapping.key])}>
            Save reviewed mappings
          </Button>
        </fieldset>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save("valuation");
        }}
      >
        <fieldset disabled={busy} className="m-0 space-y-4 rounded-lg border border-border p-4">
          <legend className="px-1 font-medium">Product valuation</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <StockLookup
              company={company}
              kind="product"
              label="Tracked product"
              value={product}
              onChange={selectProduct}
            />
            <LabeledField label={`Valuation method · version ${valuation?.version ?? 0}`}>
              <select
                className={productSelectClass}
                value={method}
                disabled={valuationLoading || !product}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "fifo" || value === "weighted_average" || value === "") setMethod(value);
                }}
              >
                <option value="">Select the approved method</option>
                <option value="fifo">FIFO</option>
                <option value="weighted_average">Weighted average</option>
              </select>
            </LabeledField>
          </div>
          <p className="m-0 text-sm text-muted-foreground">
            The product must already have its real stock asset account. The valuation method is protected once stock has
            been posted.
          </p>
          <LabeledField label="Valuation evidence / reason">
            <Textarea
              required
              minLength={3}
              maxLength={500}
              value={valuationReason}
              onChange={(event) => setValuationReason(event.target.value)}
            />
          </LabeledField>
          <Button type="submit" disabled={busy || valuationLoading || !valuationReady || !product || !method}>
            Save reviewed valuation
          </Button>
        </fieldset>
      </form>
    </div>
  );
}
