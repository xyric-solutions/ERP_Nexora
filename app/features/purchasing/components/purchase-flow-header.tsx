"use client";

import { useState } from "react";
import type { PurchaseDocument, PurchaseFlow, PurchaseKind } from "@nexora/contracts";
import { ArrowRight, LockKeyhole, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { purchaseSteps } from "../model/purchase-workflow";
import { purchaseFlowStages, purchaseStageStatus, purchaseStateLabels } from "../model/purchase-flow";

export function PurchaseFlowHeader({
  flow,
  kind,
  record,
  loading,
  error,
  disabled,
  canCreate,
  onNavigate,
  onMore,
  moreBusy,
  onRetry,
}: {
  flow: PurchaseFlow | null;
  kind: PurchaseKind;
  record: PurchaseDocument | null;
  loading: boolean;
  error: string;
  disabled: boolean;
  canCreate: boolean;
  onNavigate: (page: string, reference?: string) => void;
  onMore: () => void;
  moreBusy: boolean;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState<PurchaseKind | null>(null);
  const [choosingSource, setChoosingSource] = useState(false);
  const reached = [...purchaseFlowStages]
    .reverse()
    .find((stage) => flow?.stages.some((count) => count.kind === stage.kind && count.total > 0));
  function sources(target: PurchaseKind) {
    const stage = purchaseFlowStages.find((item) => item.kind === target)!;
    const allowed: readonly PurchaseKind[] = stage.sources;
    const choices = (flow?.items ?? []).filter((item) => item.state === "approved" && allowed.includes(item.kind));
    if (record?.state === "approved" && allowed.includes(record.kind)) return [record];
    return choices;
  }
  function create(target: PurchaseKind) {
    const choices = sources(target),
      route = purchaseSteps.find((step) => step.kind === target)!;
    if (choices.length === 1) onNavigate(route.form, `from:${choices[0].id}`);
    else {
      setChoosingSource(true);
      setExpanded(target);
    }
  }
  const selectedStage = purchaseFlowStages.find((stage) => stage.kind === expanded);
  const selectedItems =
    choosingSource && expanded ? sources(expanded) : (flow?.items ?? []).filter((item) => item.kind === expanded);
  return (
    <section aria-label="Purchase workflow progress" className="min-w-0 border-y border-border py-2 print:hidden">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="m-0 text-sm font-semibold">{flow ? `Purchase flow · ${flow.root_code}` : "Purchase flow"}</h2>
        <p className="m-0 text-xs text-muted-foreground" role="status">
          {error
            ? "Workflow status unavailable"
            : loading
              ? "Loading linked stages…"
              : reached
                ? `Latest stage with records: ${reached.label}`
                : "Create a request to begin"}
        </p>
      </div>
      <ol className="m-0 grid min-w-0 list-none grid-cols-2 gap-2 p-0 md:grid-cols-5" aria-label="Purchase stages">
        {purchaseFlowStages.map((stage) => {
          const count = flow?.stages.find((item) => item.kind === stage.kind);
          const documents = flow?.items.filter((item) => item.kind === stage.kind) ?? [];
          const allowed: readonly PurchaseKind[] = stage.sources;
          const availableSource =
            flow?.stages.some((item) => allowed.includes(item.kind) && item.approved > 0) ||
            (record?.state === "approved" && allowed.includes(record.kind));
          const current = stage.kind === kind;
          const unavailable = disabled || loading || !!error;
          return (
            <li
              key={stage.kind}
              aria-current={current ? "step" : undefined}
              className={`min-w-0 rounded-md border p-2 ${stage.kind === "bill" ? "col-span-2 md:col-span-1" : ""} ${current ? "border-primary bg-accent text-accent-foreground" : "border-border text-foreground"}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{stage.label}</span>
                {current ? <ArrowRight aria-hidden="true" className="size-4 shrink-0" /> : null}
              </div>
              <p className="m-0 text-xs text-muted-foreground">
                {current && !record
                  ? "New draft"
                  : loading
                    ? "Loading…"
                    : error && !flow
                      ? "Unavailable"
                      : purchaseStageStatus(count)}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-1">
                {count?.total ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 min-w-0 flex-1 justify-start whitespace-normal px-0 text-left text-xs"
                    aria-label={`Open ${stage.label}${count.total > 1 ? ` (${count.total})` : documents[0] ? ` · ${documents[0].code}` : ""}`}
                    disabled={unavailable}
                    onClick={() => {
                      if (count.total === 1 && documents.length === 1)
                        onNavigate(purchaseSteps.find((step) => step.kind === stage.kind)!.form, documents[0].id);
                      else {
                        setExpanded(stage.kind);
                        setChoosingSource(false);
                      }
                    }}
                  >
                    Open{" "}
                    {count.total > 1 ? (
                      `documents (${count.total})`
                    ) : documents[0] ? (
                      <span className="whitespace-nowrap">{documents[0].code}</span>
                    ) : (
                      "documents"
                    )}
                  </Button>
                ) : null}
                {stage.kind !== "request" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={count?.total ? "size-8 shrink-0 p-0" : "h-8 w-full whitespace-normal text-xs"}
                    aria-label={stage.create}
                    disabled={!canCreate || !availableSource || unavailable}
                    title={
                      !canCreate
                        ? "Creation access is required"
                        : !availableSource
                          ? "Approve the source document first"
                          : disabled
                            ? "Save your changes before switching stages"
                            : stage.create
                    }
                    onClick={() => create(stage.kind)}
                  >
                    {!availableSource ? <LockKeyhole aria-hidden="true" className="size-3" /> : null}
                    {count?.total ? <Plus aria-hidden="true" className="size-3" /> : stage.create}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>
            {error}{" "}
            <Button type="button" variant="link" onClick={onRetry}>
              Retry workflow
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {selectedStage ? (
        <div className="mt-3 border-t border-border pt-3" aria-label="Linked stage documents">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-sm font-semibold">
              {choosingSource
                ? `Choose an approved source for ${selectedStage.label}`
                : `${selectedStage.label} documents`}
            </h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(null)}>
              Hide linked documents
            </Button>
          </div>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {selectedItems.map((item) => (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-10 w-full flex-wrap justify-between gap-2 text-left"
                  disabled={disabled || moreBusy}
                  onClick={() =>
                    onNavigate(
                      purchaseSteps.find((step) => step.kind === (choosingSource ? expanded : item.kind))!.form,
                      choosingSource ? `from:${item.id}` : item.id,
                    )
                  }
                >
                  <span>
                    {choosingSource ? "Use " : ""}
                    {item.code} · {purchaseStateLabels[item.state]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.supplier_name ?? item.document_date}
                    {item.source_code ? ` · ${item.source_code}` : ""}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          {!selectedItems.length ? (
            <p className="text-sm text-muted-foreground">
              {flow?.next_cursor ? "Load more linked documents to find this stage." : "No matching linked documents."}
            </p>
          ) : null}
          {flow?.next_cursor ? (
            <Button type="button" variant="outline" className="mt-2" disabled={moreBusy || disabled} onClick={onMore}>
              {moreBusy ? "Loading…" : "Load more linked documents"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
