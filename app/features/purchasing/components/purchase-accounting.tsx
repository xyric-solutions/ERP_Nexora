"use client";
import { useEffect, useId, useState } from "react";
import type { PurchaseDocument, SubledgerWorkspace, TaxDefinition, PurchaseAccountingPrepare } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/session/session-provider";
import { purchaseError } from "../api/purchasing-api";
import { purchaseSelectClass } from "../model/purchase-workflow";

export function PurchaseAccounting({
  record,
  onReview,
  disabled,
}: {
  record: PurchaseDocument;
  onReview: () => void;
  disabled: boolean;
}) {
  const { api, session, csrfToken } = useSession();
  const labelId = useId();
  const [workspace, setWorkspace] = useState<SubledgerWorkspace | null>(null);
  const [taxes, setTaxes] = useState<TaxDefinition[]>([]);
  const [mapping, setMapping] = useState<Partial<PurchaseAccountingPrepare>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(record.finance_state ?? "");
  const [operationVersion, setOperationVersion] = useState<number>();
  const [canRevise, setCanRevise] = useState(false);
  const canManage = session?.user.permissions.includes("finance.subledger.manage") ?? false;
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    const asOf = record.bill_date ?? record.document_date;
    void api
      .getSubledgerWorkspace(
        `?company_id=${encodeURIComponent(record.company_id)}&as_of=${asOf}&side=payable&source_document_id=${encodeURIComponent(record.id)}&limit=100`,
      )
      .then((value) => {
        if (active) {
          setWorkspace(value);
          const operation =
            value.operations.find((item) => item.id === record.finance_operation_id) ??
            value.operations.find((item) => item.state === "posted") ??
            value.operations[0];
          if (operation) {
            setOperationVersion(operation.version);
            setCanRevise(operation.maker_id === session?.user.id);
            setPrepared(record.finance_state === "reversed" ? "reversed" : operation.state);
            if (operation.input.type === "purchase_payment") {
              const input = operation.input;
              setMapping({
                discount_account_id: input.discount_account_id,
                advance_account_id: input.advance_account_id,
                advance_monetary: input.advance_monetary,
                tax_definition_id: input.tax_definition_id,
                additional_tax_definition_id: input.additional_tax_definition_id,
                bank_fee: input.bank_fee,
              });
            } else if (operation.input.type === "recognition")
              setMapping({ tax_account_id: operation.input.tax_account_id });
          }
        }
      })
      .catch((caught) => {
        if (active) setError(purchaseError(caught));
      });
    if (session?.user.permissions.includes("finance.tax.read"))
      void api
        .getTaxes(
          `?${new URLSearchParams({ company_id: record.company_id, module: "purchases", party: "supplier", as_of: asOf, status: "active", limit: "100" })}`,
        )
        .then((value) => {
          if (active) setTaxes(value.items);
        })
        .catch((caught) => {
          if (active) setError(purchaseError(caught));
        });
    return () => {
      active = false;
    };
  }, [
    api,
    canManage,
    record.id,
    record.finance_operation_id,
    record.finance_state,
    record.company_id,
    record.document_date,
    record.bill_date,
    session,
  ]);
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const operation = await api.preparePurchaseAccounting(
        record.id,
        {
          ...mapping,
          company_id: record.company_id,
          expected_version: record.version,
          ...(prepared && canRevise && operationVersion ? { expected_operation_version: operationVersion } : {}),
        },
        csrfToken(),
        `purchase-accounting:${record.id}:${record.version}:${crypto.randomUUID()}`,
      );
      setPrepared(operation.state);
      setOperationVersion(operation.version);
      setCanRevise(operation.maker_id === session?.user.id);
    } catch (caught) {
      setError(purchaseError(caught));
    } finally {
      setBusy(false);
    }
  }
  const accountFields = [
    { key: "tax_account_id", label: "Bill input tax account", type: "asset" },
    { key: "discount_account_id", label: "Settlement discount account", type: "revenue" },
    { key: "advance_account_id", label: "Supplier advance account", type: "asset" },
  ] as const;
  return (
    <section aria-labelledby={labelId} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={labelId} className="m-0 font-medium">
          Accounting: {prepared || "Not prepared — no Bank or AP posting"}
        </p>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || busy}
            onClick={prepared ? onReview : prepare}
          >
            {prepared ? "Review accounting" : busy ? "Preparing…" : "Prepare accounting"}
          </Button>
        ) : null}
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        Purchase approval reserves allocations. Bank cash and supplier outstanding change only after independent Finance
        approval and posting.
      </p>
      {!canManage ? (
        <p className="m-0 text-xs">
          A company administrator must assign Finance subledger read/manage access and an independent approver with
          approve/post authority. Existing instructions remain unposted.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-destructive">
          {error}
        </p>
      ) : null}
      {canManage && (!prepared || (["draft", "rejected"].includes(prepared) && canRevise)) && workspace ? (
        <details>
          <summary className="cursor-pointer text-xs">Accounting mappings and recorded Bank fee</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {accountFields.map((field) => (
              <label key={field.key} className="grid gap-1 text-xs">
                {field.label}
                <select
                  className={purchaseSelectClass}
                  value={mapping[field.key] ?? ""}
                  onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value || undefined })}
                >
                  <option value="">Select when applicable</option>
                  {workspace.accounts
                    .filter((account) => account.type === field.type)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            {(["tax_definition_id", "additional_tax_definition_id"] as const).map((key, index) => (
              <label key={key} className="grid gap-1 text-xs">
                {index ? "Additional withholding definition" : "Withholding definition"}
                <select
                  className={purchaseSelectClass}
                  value={mapping[key] ?? ""}
                  onChange={(event) => setMapping({ ...mapping, [key]: event.target.value || undefined })}
                >
                  <option value="">Select when applicable</option>
                  {taxes
                    .filter((tax) => tax.trigger === "settlement" && tax.treatment === "withholding")
                    .map((tax) => (
                      <option key={tax.id} value={tax.id}>
                        {tax.code} · {tax.print_label || tax.name} · {tax.name} · {tax.rate}%
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <label htmlFor={`${labelId}-fee`} className="grid gap-1 text-xs">
              Recorded Bank fee
              <Input
                id={`${labelId}-fee`}
                inputMode="decimal"
                value={mapping.bank_fee ?? "0"}
                onChange={(event) => setMapping({ ...mapping, bank_fee: event.target.value })}
              />
            </label>
            <label className="grid gap-1 text-xs">
              Advance classification
              <select
                className={purchaseSelectClass}
                value={mapping.advance_monetary === undefined ? "" : String(mapping.advance_monetary)}
                onChange={(event) =>
                  setMapping({
                    ...mapping,
                    advance_monetary: event.target.value === "" ? undefined : event.target.value === "true",
                  })
                }
              >
                <option value="">Select when an advance exists</option>
                <option value="true">Refundable monetary advance</option>
                <option value="false">Goods/services prepayment</option>
              </select>
            </label>
          </div>
          <p className="mb-0 text-xs text-muted-foreground">
            Finance Accounting setup must contain the linked supplier and AP policy. Tax definitions must match the
            instruction exactly; no rates or accounts are inferred.
          </p>
          {prepared && canRevise ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={disabled || busy}
              onClick={prepare}
            >
              Update accounting draft
            </Button>
          ) : null}
        </details>
      ) : null}
      {record.finance_journal_id ? <p className="m-0 font-mono text-xs">Journal {record.finance_journal_id}</p> : null}
    </section>
  );
}
