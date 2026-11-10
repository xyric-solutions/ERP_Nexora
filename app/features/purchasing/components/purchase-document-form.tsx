"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  savePurchaseRequestSchema,
  documentTotal,
  scaled,
  money,
  type SavePurchaseRequest,
  type PurchaseDocument,
  type PurchaseKind,
  type PurchaseLine,
  type ProcurementOptions,
  type Supplier,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LabeledField } from "@/shared/ui/labeled-field";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { purchaseSteps, purchaseSelectClass, nextPurchaseStep } from "../model/purchase-workflow";
import { purchaseError } from "../api/purchasing-api";
import { usePurchaseDirectory } from "./use-purchase-directory";
import { downloadPurchaseCsv, PURCHASE_EXPORT_EVENT } from "../model/purchase-export";
import { usePurchaseFlow } from "./use-purchase-flow";
import { PurchaseFlowHeader } from "./purchase-flow-header";
import { PurchaseDocumentActions, type PurchaseFormAction } from "./purchase-document-actions";
import { PurchaseRfqSupplier } from "./purchase-rfq-supplier";
import { purchaseStateLabels } from "../model/purchase-flow";
import { paymentEntries, PurchasePaymentDetailsForm } from "./purchase-payment-details";

const newLine = (): PurchaseLine => ({
  id: `line-${crypto.randomUUID()}`,
  source_line_id: null,
  item_code: "",
  product_id: null,
  product_name: "",
  description: "",
  quantity: "1",
  uom: "Each",
  unit_price: "0.00",
  tax_percent: "0",
});
export function PurchaseDocumentForm({
  company,
  kind,
  reference,
  options,
  suppliers,
  onMoreSuppliers,
  onClose,
  onNavigate,
  onDirtyChange,
}: {
  company: string;
  kind: PurchaseKind;
  reference?: string;
  options: ProcurementOptions;
  suppliers: Supplier[];
  onMoreSuppliers?: () => void;
  onClose: () => void;
  onNavigate: (page: string, reference?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, csrfToken, session } = useSession(),
    notify = useActionFeedback(),
    step = purchaseSteps.find((item) => item.kind === kind)!;
  const payment = kind === "payment" || kind === "multi_payment";
  const [record, setRecord] = useState<PurchaseDocument | null>(null);
  const [selectedPaymentSupplier, setSelectedPaymentSupplier] = useState<Supplier | null>(null);
  const [input, setInput] = useState<SavePurchaseRequest>({
    company_id: company,
    kind,
    supplier_id: null,
    approver_id: null,
    invited_supplier_ids: [],
    source_id: null,
    document_date: new Date().toLocaleDateString("en-CA"),
    due_date: null,
    currency: options.currencies[0]?.code ?? "",
    reference: "",
    notes: "",
    lines: kind === "request" ? [newLine()] : [],
    allocations: [],
    payment_details: payment ? { bank_account_id: "", entries: [] } : null,
  });
  const [sources, setSources] = useState<PurchaseDocument[]>([]),
    [sourceCursors, setSourceCursors] = useState<Partial<Record<PurchaseKind, string | null>>>({});
  const [sourceSearch, setSourceSearch] = useState(""),
    [loadedSearch, setLoadedSearch] = useState("");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!!reference),
    [loadFailed, setLoadFailed] = useState(false),
    [sourcesLoading, setSourcesLoading] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [reason, setReason] = useState("");
  const [reload, setReload] = useState(0);
  const [pendingAction, setPendingAction] = useState<"reject" | "cancel" | null>(null);
  const review = reference?.startsWith("review:") ?? false;
  const [approverName, setApproverName] = useState("");
  const selectedInput = useRef(input);
  useEffect(() => {
    selectedInput.current = input;
  }, [input]);
  const recordReference = useRef(reference);
  const operation = useRef(false),
    retries = useRef(new Map<string, { body: string; key: string }>());
  const permissions = session?.user.permissions ?? [];
  const editable = (!record || ["draft", "rejected"].includes(record.state)) && !session?.impersonation;
  const canSave =
    editable && permissions.includes(record ? "procurement.document.action" : "procurement.document.create");
  const canSubmit = editable && permissions.includes("procurement.document.submit");
  const canDecide =
    record?.state === "submitted" && permissions.includes("procurement.document.approve") && !session?.impersonation;
  const ownRecord =
    record?.created_by === session?.user.id ||
    record?.events.some(
      (event) => ["created", "saved", "submit"].includes(event.action) && event.actor_id === session?.user.id,
    );
  const canOverride =
    !!session?.user.roles.includes("super_administrator") && permissions.includes("platform.approval.override");
  const effectiveApprover = record?.request_approver_id ?? record?.approver_id ?? input.approver_id;
  const mayDecide =
    canDecide &&
    (!effectiveApprover || effectiveApprover === session?.user.id || (canOverride && ownRecord)) &&
    (!ownRecord || options.can_self_approve || canOverride);
  const assignedSelf = !!session && input.approver_id === session.user.id;
  const canSaveApprove =
    !payment &&
    canSubmit &&
    canSave &&
    assignedSelf &&
    permissions.includes("procurement.document.approve") &&
    !!(options.can_self_approve || canOverride);
  const next = nextPurchaseStep(kind);
  const canContinue =
    !!next &&
    ["request", "rfq", "order", "receipt"].includes(kind) &&
    permissions.includes("procurement.document.create") &&
    !session?.impersonation;
  const loadProducts = useCallback((query: string) => api.listPurchaseProducts(query), [api]);
  const loadApprovers = useCallback((query: string) => api.listPurchaseApprovers(query), [api]);
  const products = usePurchaseDirectory(company, loadProducts, canSave && kind === "request" && !loading);
  const approvers = usePurchaseDirectory(
    company,
    loadApprovers,
    (kind === "request" || payment) && canSave && !loading,
  );
  const flowReference = reference?.startsWith("from:")
    ? reference.slice(5)
    : reference?.startsWith("review:")
      ? reference.slice(7)
      : reference;
  const flow = usePurchaseFlow(
    company,
    payment || loading ? null : (record?.id ?? input.source_id ?? flowReference ?? null),
    (record?.version ?? 0) + reload,
  );
  useEffect(() => {
    const exportRecord = () => {
      if (!record || dirty || busy || loading) {
        setError("Save the document and wait for changes to finish before exporting.");
        return;
      }
      downloadPurchaseCsv([record], `${record.code}.csv`);
    };
    window.addEventListener(PURCHASE_EXPORT_EVENT, exportRecord);
    return () => window.removeEventListener(PURCHASE_EXPORT_EVENT, exportRecord);
  }, [record, dirty, busy, loading]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const fromSource = useCallback(
    (source: PurchaseDocument) => {
      setSources((current) => (current.some((item) => item.id === source.id) ? current : [source, ...current]));
      setInput((current) => ({
        ...current,
        approver_id: payment ? current.approver_id : (source.request_approver_id ?? source.approver_id ?? null),
        source_id: payment ? null : kind === "bill" && source.kind === "receipt" ? source.source_id : source.id,
        currency: source.currency,
        supplier_id:
          kind === "rfq"
            ? current.supplier_id
            : (source.supplier_id ??
              (source.kind === "rfq" && source.invited_supplier_ids.length === 1
                ? source.invited_supplier_ids[0]
                : null)),
        lines: payment
          ? []
          : source.lines.map((line) => ({
              ...line,
              id: `line-${crypto.randomUUID()}`,
              source_line_id: kind === "bill" && source.kind === "receipt" ? line.source_line_id : (line.id ?? null),
            })),
        allocations: payment
          ? [{ bill_id: source.id, amount: money(scaled(source.total_amount, 2) - scaled(source.reserved_amount, 2)) }]
          : [],
      }));
    },
    [kind, payment],
  );
  useEffect(() => {
    const target = recordReference.current;
    if (!target) return;
    let active = true;
    api
      .getPurchaseDocument(
        target.startsWith("from:") ? target.slice(5) : target.startsWith("review:") ? target.slice(7) : target,
        company,
      )
      .then(async (result) => {
        if (!active) return;
        if (target.startsWith("from:")) {
          fromSource(result);
          if (kind === "bill" && result.kind === "receipt" && result.source_id) {
            const parent = await api.getPurchaseDocument(result.source_id, company);
            if (active) setSources((current) => [parent, ...current.filter((item) => item.id !== parent.id)]);
          }
          setDirty(true);
        } else {
          if (result.kind !== kind) throw new Error("Wrong Purchase form");
          setRecord(result);
          setApproverName(result.approver_name ?? "");
          setInput({
            company_id: company,
            kind,
            supplier_id: result.supplier_id,
            approver_id: result.request_approver_id ?? result.approver_id ?? null,
            source_id: result.source_id,
            invited_supplier_ids: result.invited_supplier_ids,
            document_date: result.document_date,
            due_date: result.due_date,
            currency: result.currency,
            reference: result.reference,
            notes: result.notes,
            lines: result.lines,
            allocations: result.allocations,
            payment_details: result.payment_details ?? null,
            expected_version: result.version,
          });
          const ids = [result.source_id, ...result.allocations.map((item) => item.bill_id)].filter(
            (id): id is string => !!id,
          );
          const linked = await Promise.all([...new Set(ids)].map((id) => api.getPurchaseDocument(id, company)));
          if (active)
            setSources((current) => [
              ...linked,
              ...current.filter((item) => !linked.some((existing) => existing.id === item.id)),
            ]);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(purchaseError(caught));
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, company, reference, kind, reload, fromSource]);
  useEffect(() => {
    if (kind === "request") return;
    let active = true;
    const timer = setTimeout(() => {
      setSourcesLoading(true);
      Promise.all(
        step.source.map((source) =>
          api
            .listPurchaseDocuments(
              `?${new URLSearchParams({ company_id: company, kind: source, state: "approved", search: sourceSearch, limit: "100" })}`,
            )
            .then((result) => ({ kind: source, result })),
        ),
      )
        .then((results) => {
          if (!active) return;
          setSources((current) => {
            const selected = new Set([
              selectedInput.current.source_id,
              ...selectedInput.current.allocations.map((item) => item.bill_id),
            ]);
            const incoming = results.flatMap((item) => item.result.items);
            return [
              ...current.filter((item) => selected.has(item.id) && !incoming.some((other) => other.id === item.id)),
              ...incoming,
            ];
          });
          setSourceCursors(Object.fromEntries(results.map((item) => [item.kind, item.result.next_cursor])));
          setLoadedSearch(sourceSearch);
        })
        .catch((caught) => {
          if (active) setError(purchaseError(caught));
        })
        .finally(() => {
          if (active) setSourcesLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, company, kind, step, sourceSearch, reload]);
  function change(patch: Partial<SavePurchaseRequest>) {
    setInput((current) => ({ ...current, ...patch }));
    setDirty(true);
  }
  function updateLine(index: number, patch: Partial<PurchaseLine>) {
    change({ lines: input.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  }
  function retryKey(action: string, payload: unknown) {
    const body = JSON.stringify(payload),
      previous = retries.current.get(action);
    if (previous?.body === body) return previous.key;
    const key = `purchase-${action}-${crypto.randomUUID()}`;
    retries.current.set(action, { body, key });
    return key;
  }
  async function persist() {
    if (kind === "rfq" && !input.invited_supplier_ids.length) {
      setError("Select a supplier for the Request for Quotation.");
      return null;
    }
    const parsed = savePurchaseRequestSchema.safeParse({ ...input, payment_details: details });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" "));
      return null;
    }
    const result = await api.savePurchaseDocument(
      record?.id ?? null,
      parsed.data,
      csrfToken(),
      retryKey("save", { id: record?.id ?? null, input: parsed.data }),
    );
    recordReference.current = result.record.id;
    window.history.replaceState(null, "", `#/purchases/${step.form}/${encodeURIComponent(result.record.id)}`);
    retries.current.delete("save");
    setRecord(result.record);
    setInput((current) => ({
      ...current,
      expected_version: result.record.version,
      lines: result.record.lines,
      approver_id: result.record.approver_id ?? null,
      payment_details: result.record.payment_details ?? null,
    }));
    setDirty(false);
    onDirtyChange?.(false);
    return result.record;
  }
  async function perform(action: PurchaseFormAction, continueFlow = false) {
    if (operation.current || loading) return;
    if (action === "save" && !canSave) return;
    if (action === "submit" && !canSubmit) return;
    if (action === "save_approve" && !canSaveApprove) return;
    if ((action === "approve" || action === "reject") && !mayDecide) return;
    if (action === "submit" && continueFlow && (kind === "request" || payment) && !input.approver_id) {
      setError("Select an approver before continuing.");
      return;
    }
    if ((action === "reject" || action === "cancel") && !reason.trim()) {
      setPendingAction(action);
      return;
    }
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      let current = record;
      if (action === "save" || action === "submit" || action === "save_approve") {
        if (dirty || !current) {
          current = await persist();
          if (!current) return;
        }
        if (action === "save") {
          notify(`${current.code} saved.`);
          return;
        }
      }
      if (!current) return;
      const decisionAction = action === "save_approve" ? "approve" : action;
      if (action === "save_approve") {
        const submission = {
          company_id: company,
          expected_version: current.version,
          action: "submit" as const,
          reason: "Submitted for Purchase approval.",
        };
        const submitted = await api.actOnPurchaseDocument(
          current.id,
          submission,
          csrfToken(),
          retryKey("submit", { id: current.id, payload: submission }),
        );
        retries.current.delete("submit");
        current = submitted.record;
        // Retain the persisted submission when approval fails so retrying cannot
        // create or submit a duplicate document.
        setRecord(current);
        setInput((previous) => ({ ...previous, expected_version: submitted.record.version }));
      }
      const payload = {
        company_id: company,
        expected_version: current.version,
        action: decisionAction,
        reason:
          decisionAction === "approve"
            ? ""
            : reason.trim() ||
              (decisionAction === "submit"
                ? "Submitted for Purchase approval."
                : "Assigned creator approval via Purchase workflow."),
      };
      const result = await api.actOnPurchaseDocument(
        current.id,
        payload,
        csrfToken(),
        retryKey(decisionAction, { id: current.id, payload }),
      );
      retries.current.delete(decisionAction);
      setRecord(result.record);
      setInput((previous) => ({ ...previous, expected_version: result.record.version }));
      setDirty(false);
      onDirtyChange?.(false);
      setReason("");
      setPendingAction(null);
      notify(`${result.record.code} ${result.record.state}.`);
      if (action === "submit" && continueFlow) {
        if (result.record.approver_id === session?.user.id) onNavigate(step.form, `review:${result.record.id}`);
      }
      if (decisionAction === "approve") {
        if (continueFlow && canContinue && next) onNavigate(next.form, `from:${result.record.id}`);
        else if (!continueFlow) onClose();
      }
    } catch (caught) {
      setError(purchaseError(caught));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function moreSources() {
    if (sourcesLoading || loadedSearch !== sourceSearch) return;
    setSourcesLoading(true);
    try {
      const result = await Promise.all(
        step.source
          .filter((source) => sourceCursors[source])
          .map((source) =>
            api
              .listPurchaseDocuments(
                `?${new URLSearchParams({ company_id: company, kind: source, state: "approved", search: loadedSearch, limit: "100", cursor: sourceCursors[source]! })}`,
              )
              .then((result) => ({ kind: source, result })),
          ),
      );
      setSources((current) => [
        ...current,
        ...result
          .flatMap((item) => item.result.items)
          .filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setSourceCursors((current) => ({
        ...current,
        ...Object.fromEntries(result.map((item) => [item.kind, item.result.next_cursor])),
      }));
    } catch (caught) {
      setError(purchaseError(caught));
    } finally {
      setSourcesLoading(false);
    }
  }
  let total = "—";
  const paymentSuppliers = selectedPaymentSupplier
    ? [selectedPaymentSupplier, ...suppliers.filter((supplier) => supplier.id !== selectedPaymentSupplier.id)]
    : suppliers;
  const details =
    payment && input.payment_details
      ? { ...input.payment_details, entries: paymentEntries(input, sources, paymentSuppliers) }
      : null;
  try {
    total = payment
      ? money(
          details
            ? details.entries.reduce((sum, entry) => sum + scaled(entry.amount, 2), 0n)
            : input.allocations.reduce((sum, item) => sum + scaled(item.amount, 2), 0n),
        )
      : documentTotal(input.lines);
  } catch {
    /* Incomplete inputs are validated before saving. */
  }
  const source = sources.find((item) => item.id === input.source_id);
  const sourceSupplier =
    source?.supplier_id ??
    (source?.kind === "rfq" && source.invited_supplier_ids.length === 1 ? source.invited_supplier_ids[0] : null);
  const sourceLocked = kind === "receipt" || kind === "bill";
  const currentSupplier = record?.supplier_id && !suppliers.some((item) => item.id === record.supplier_id);
  const paymentBills = sources.filter(
    (bill) =>
      bill.kind === "bill" &&
      bill.currency === input.currency &&
      (kind === "multi_payment" || bill.supplier_id === input.supplier_id),
  );
  if (loading) return <p role="status">Loading the persisted Purchase form…</p>;
  if (loadFailed)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}{" "}
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setLoading(true);
              setLoadFailed(false);
              setError("");
              setReload((value) => value + 1);
            }}
          >
            Retry loading record
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </AlertDescription>
      </Alert>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void perform("save");
      }}
      className="grid min-w-0 gap-3"
      aria-label={`${step.label} form`}
      aria-busy={busy}
    >
      {!payment ? (
        <PurchaseFlowHeader
          flow={flow.flow}
          kind={kind}
          record={record}
          loading={flow.loading}
          error={flow.error}
          disabled={busy || dirty}
          canCreate={permissions.includes("procurement.document.create") && !session?.impersonation}
          onNavigate={onNavigate}
          onMore={() => void flow.more()}
          moreBusy={flow.moreBusy}
          onRetry={flow.retry}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-base">
          {step.label} ·{" "}
          {review ? `Review ${record?.code ?? "document"}` : (record?.code ?? "New draft · code assigned when saved")}
        </strong>
        <Badge variant="outline" className="capitalize">
          {record?.state ?? "draft"}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <PurchaseDocumentActions
          kind={kind}
          record={record}
          canSave={canSave}
          canSubmit={canSubmit}
          canDecide={canDecide}
          mayDecide={!!mayDecide}
          canSaveApprove={canSaveApprove}
          approvalReasonRequired={false}
          deferActionReason
          canContinue={canContinue}
          canCancel={
            !!record &&
            ["draft", "rejected", "submitted"].includes(record.state) &&
            permissions.includes("procurement.document.action") &&
            !session?.impersonation
          }
          busy={busy}
          dirty={dirty}
          reason={reason}
          onAction={(action, continueFlow) => {
            if (action === "reject" || action === "cancel") {
              setPendingAction(action);
              setReason("");
            } else void perform(action, continueFlow);
          }}
        />
        <ol aria-label="Document status" className="m-0 flex list-none flex-wrap gap-1 p-0 text-xs">
          {(["draft", "submitted", "approved"] as const).map((state) => (
            <li
              key={state}
              aria-current={(record?.state ?? "draft") === state ? "step" : undefined}
              className={`rounded-md border px-2 py-1 ${(record?.state ?? "draft") === state ? "border-primary bg-accent font-semibold text-accent-foreground" : "border-border text-muted-foreground"}`}
            >
              {purchaseStateLabels[state]}
            </li>
          ))}
          {record && ["rejected", "cancelled"].includes(record.state) ? (
            <li className="rounded-md border border-border px-2 py-1 font-semibold" aria-current="step">
              {purchaseStateLabels[record.state]}
            </li>
          ) : null}
        </ol>
        {record ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="print:hidden"
            disabled={busy || dirty}
            onClick={() => {
              setLoading(true);
              setLoadFailed(false);
              setError("");
              setReload((value) => value + 1);
            }}
          >
            Refresh status
          </Button>
        ) : null}
      </div>
      {pendingAction ? (
        <div className="grid gap-2 print:hidden">
          <LabeledField label={pendingAction === "reject" ? "Reason for rejection *" : "Reason for cancellation *"}>
            <Input
              maxLength={512}
              value={reason}
              disabled={busy || !!session?.impersonation}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Enter a reason for this action"
            />
          </LabeledField>
          {pendingAction ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || dirty || !reason.trim()}
                onClick={() => void perform(pendingAction)}
              >
                {pendingAction === "reject" ? "Confirm rejection" : "Confirm cancellation"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setPendingAction(null);
                  setReason("");
                }}
              >
                Keep document
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {record?.state === "submitted" && effectiveApprover ? (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          {effectiveApprover === session?.user.id
            ? !mayDecide
              ? "Self-approval access is required to approve your own document."
              : "You are the assigned approver. You can approve when ready."
            : `Awaiting approval from ${record.request_approver_name ?? record.approver_name ?? "the assigned approver"}.`}
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {reference ? (
              <Button
                type="button"
                variant="link"
                disabled={busy}
                onClick={() => {
                  if (!dirty || window.confirm("Reload and discard unsaved changes?")) {
                    setDirty(false);
                    setLoading(true);
                    setLoadFailed(false);
                    setError("");
                    setReload((value) => value + 1);
                  }
                }}
              >
                Reload persisted record
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!editable || busy} className="contents">
        <div className="grid items-start gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
          {(kind === "request" && canSave) || payment ? (
            <div className="grid min-w-0 gap-2 sm:col-span-2">
              <span className="text-sm font-medium">Approver</span>
              <SearchableSelect
                label="Purchase approver"
                value={input.approver_id ?? ""}
                placeholder="Select approver"
                disabled={!canSave || busy}
                options={[
                  ...approvers.items.map((item) => ({
                    value: item.id,
                    label: item.id === session?.user.id ? `${item.name} (you)` : item.name,
                    disabled: item.id === session?.user.id && !options.can_self_approve && !canOverride,
                  })),
                  ...(input.approver_id && !approvers.items.some((item) => item.id === input.approver_id)
                    ? [
                        {
                          value: input.approver_id,
                          label: approverName || record?.approver_name || "Selected approver",
                        },
                      ]
                    : []),
                ]}
                search={approvers.search}
                onSearchChange={approvers.setSearch}
                loading={approvers.busy}
                onValueChange={(value) => {
                  setApproverName(approvers.items.find((item) => item.id === value)?.name ?? "");
                  change({ approver_id: value || null });
                }}
                footer={
                  <div className="grid gap-1 text-sm">
                    {approvers.error ? (
                      <p role="alert" className="text-destructive">
                        {approvers.error}{" "}
                        <Button type="button" variant="link" onClick={approvers.retry}>
                          Retry
                        </Button>
                      </p>
                    ) : null}
                    {approvers.cursor ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={approvers.busy}
                        onClick={() => void approvers.more()}
                      >
                        Load more approvers
                      </Button>
                    ) : null}
                  </div>
                }
              />
            </div>
          ) : null}
          <LabeledField label="Document date *">
            <Input
              required
              type="date"
              value={input.document_date}
              onChange={(event) => change({ document_date: event.target.value })}
            />
          </LabeledField>
          <LabeledField label="Due / expected date">
            <Input
              type="date"
              value={input.due_date ?? ""}
              onChange={(event) => change({ due_date: event.target.value || null })}
            />
          </LabeledField>
          <LabeledField label="Currency *">
            <select
              className={purchaseSelectClass}
              value={input.currency}
              onChange={(event) =>
                change({
                  currency: event.target.value,
                  ...(payment
                    ? {
                        allocations: [],
                        payment_details: input.payment_details ? { bank_account_id: "", entries: [] } : null,
                      }
                    : {}),
                })
              }
            >
              <option value="">Select currency</option>
              {options.currencies.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} · {item.name}
                </option>
              ))}
              {input.currency && !options.currencies.some((item) => item.code === input.currency) ? (
                <option value={input.currency}>{input.currency} · saved currency</option>
              ) : null}
            </select>
          </LabeledField>
          <LabeledField label={kind === "bill" ? "Supplier invoice reference *" : "External reference"}>
            <Input
              required={kind === "bill"}
              maxLength={128}
              value={input.reference}
              onChange={(event) => change({ reference: event.target.value })}
            />
          </LabeledField>
          {kind === "payment" ? (
            <div className="grid min-w-0 gap-1.5 lg:col-span-2">
              <span className="text-sm font-medium">Supplier *</span>
              <PurchaseRfqSupplier
                company={company}
                value={input.supplier_id ?? ""}
                name={record?.supplier_name ?? null}
                suppliers={suppliers}
                disabled={!canSave || busy}
                onValueChange={(supplier_id, supplier) => {
                  setSelectedPaymentSupplier(supplier ?? null);
                  change({
                    supplier_id: supplier_id || null,
                    allocations: [],
                    payment_details: input.payment_details ? { ...input.payment_details, entries: [] } : null,
                  });
                }}
              />
            </div>
          ) : null}
          {["order", "receipt", "bill"].includes(kind) ? (
            <LabeledField label="Supplier *" className="lg:col-span-2">
              <select
                className={purchaseSelectClass}
                required
                disabled={sourceLocked || !!sourceSupplier}
                value={input.supplier_id ?? ""}
                onChange={(event) =>
                  change({ supplier_id: event.target.value || null, allocations: payment ? [] : input.allocations })
                }
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option
                    key={supplier.id}
                    value={supplier.id}
                    disabled={supplier.status !== "active" || supplier.risk_status === "blocked"}
                  >
                    {supplier.code} · {supplier.name}
                    {supplier.status !== "active" ? " · inactive" : ""}
                  </option>
                ))}
                {currentSupplier ? (
                  <option value={record!.supplier_id!}>{record!.supplier_name ?? "Saved supplier"}</option>
                ) : null}
                {input.supplier_id && !suppliers.some((item) => item.id === input.supplier_id) && !currentSupplier ? (
                  <option value={input.supplier_id}>{source?.supplier_name ?? "Selected supplier"}</option>
                ) : null}
              </select>
            </LabeledField>
          ) : null}
          {kind === "rfq" ? (
            <div className="grid min-w-0 gap-1.5 lg:col-span-2">
              <span className="text-sm font-medium">Supplier *</span>
              <PurchaseRfqSupplier
                company={company}
                value={
                  input.supplier_id ?? (input.invited_supplier_ids.length === 1 ? input.invited_supplier_ids[0] : "")
                }
                name={record?.supplier_name ?? null}
                suppliers={suppliers}
                disabled={!canSave || busy}
                onValueChange={(value) =>
                  change({ supplier_id: value || null, invited_supplier_ids: value ? [value] : [] })
                }
              />
              {input.invited_supplier_ids.length > 1 ? (
                <p className="m-0 text-xs text-muted-foreground">
                  Saved suppliers:{" "}
                  {input.invited_supplier_ids
                    .map((id) => suppliers.find((supplier) => supplier.id === id)?.name ?? id)
                    .join(", ")}
                  . Select one supplier to replace these saved selections.
                </p>
              ) : null}
            </div>
          ) : null}
          {kind !== "request" && kind !== "rfq" ? (
            <LabeledField
              label={payment ? "Search approved bills" : "Search approved source records"}
              className="lg:col-span-2"
            >
              <Input
                placeholder="Code, supplier or reference"
                value={sourceSearch}
                onChange={(event) => setSourceSearch(event.target.value)}
              />
            </LabeledField>
          ) : null}
          {kind === "rfq" ? (
            <div className="grid min-w-0 gap-1.5 sm:col-span-2 lg:col-span-2">
              <span className="text-sm font-medium">Purchase Request *</span>
              <SearchableSelect
                label="Purchase Request *"
                required
                value={input.source_id ?? ""}
                placeholder="Select an approved Purchase Request"
                disabled={!canSave || busy}
                searchLabel="Search approved Purchase Requests"
                search={sourceSearch}
                onSearchChange={setSourceSearch}
                loading={sourcesLoading}
                options={sources
                  .filter((item) => item.kind === "request")
                  .map((item) => ({ value: item.id, label: `${item.code} · ${item.reference || item.document_date}` }))}
                onValueChange={(value) => {
                  const selected = sources.find((item) => item.id === value);
                  if (selected) {
                    fromSource(selected);
                    setDirty(true);
                  }
                }}
                footer={
                  Object.values(sourceCursors).some(Boolean) ? (
                    <Button type="button" variant="link" disabled={sourcesLoading} onClick={() => void moreSources()}>
                      Load more Purchase Requests
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : null}
          {kind !== "request" && kind !== "rfq" && !payment ? (
            <LabeledField label="Approved source *" className="sm:col-span-2 lg:col-span-2">
              <select
                className={purchaseSelectClass}
                value={input.source_id ?? ""}
                onChange={(event) => {
                  const selected = sources.find((item) => item.id === event.target.value);
                  if (selected) {
                    fromSource(selected);
                    setDirty(true);
                  } else change({ source_id: null, lines: [], supplier_id: null });
                }}
              >
                <option value="">
                  {sourcesLoading ? "Loading approved records…" : "Select source to copy its lines"}
                </option>
                {sources
                  .filter((item) => step.source.some((source) => source === item.kind))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {(item.supplier_name ?? item.reference) || item.document_date}
                    </option>
                  ))}
              </select>
            </LabeledField>
          ) : null}
          {kind !== "rfq" && (onMoreSuppliers || Object.values(sourceCursors).some(Boolean)) ? (
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
              {onMoreSuppliers ? (
                <Button type="button" size="sm" variant="outline" onClick={onMoreSuppliers}>
                  Load more suppliers
                </Button>
              ) : null}
              {Object.values(sourceCursors).some(Boolean) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={sourcesLoading}
                  onClick={() => void moreSources()}
                >
                  Load more source records
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </fieldset>
      {details ? (
        <PurchasePaymentDetailsForm
          input={input}
          value={details}
          bills={sources}
          suppliers={paymentSuppliers}
          options={options}
          disabled={!canSave || busy}
          onChange={(payment_details) => change({ payment_details })}
        />
      ) : payment && canSave ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => change({ payment_details: { bank_account_id: "", entries: [] } })}
        >
          Add bank and WHT details
        </Button>
      ) : null}
      {payment ? (
        <section
          className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
          aria-label="Bill allocations"
        >
          <div className="border-b border-border px-3 py-2 text-sm font-semibold">Outstanding bills</div>
          {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- WCAG 2.1.1: labelled read-only scroll regions need keyboard focus even when fieldset controls are disabled. */}
          <div
            role="region"
            aria-label="Bill allocations table"
            tabIndex={0}
            className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
            <fieldset disabled={!editable || busy} className="m-0 min-w-0 border-0 p-0">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    {[
                      "Include",
                      "Date",
                      "Bill ID",
                      "Bill No.",
                      "Due date",
                      "Supplier",
                      "Original amount",
                      "Open balance",
                      "Discount",
                      "Payment",
                      "Total",
                    ].map((label) => (
                      <th key={label} scope="col" className="px-3 py-2 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paymentBills.map((bill) => {
                    const allocation = input.allocations.find((item) => item.bill_id === bill.id);
                    const available = money(scaled(bill.total_amount, 2) - scaled(bill.reserved_amount, 2));
                    return (
                      <tr key={bill.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <Checkbox
                            aria-label={`Include ${bill.code}`}
                            checked={!!allocation}
                            disabled={!allocation && available === "0.00"}
                            onCheckedChange={(checked) =>
                              change({
                                allocations: checked
                                  ? [...input.allocations, { bill_id: bill.id, amount: available }]
                                  : input.allocations.filter((item) => item.bill_id !== bill.id),
                              })
                            }
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{bill.document_date}</td>
                        <td className="px-3 py-2">{bill.code}</td>
                        <td className="px-3 py-2">{bill.reference || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{bill.due_date ?? "—"}</td>
                        <td className="px-3 py-2">{bill.supplier_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{bill.total_amount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{available}</td>
                        <td className="px-3 py-2">
                          <Input
                            className="min-w-24"
                            aria-label={`Discount ${bill.code}`}
                            inputMode="decimal"
                            disabled={!allocation}
                            value={allocation?.discount ?? (allocation ? "0.00" : "")}
                            onChange={(event) =>
                              change({
                                allocations: input.allocations.map((item) =>
                                  item.bill_id === bill.id ? { ...item, discount: event.target.value } : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            className="min-w-28"
                            aria-label={`Allocate ${bill.code}`}
                            inputMode="decimal"
                            disabled={!allocation}
                            value={allocation?.amount ?? ""}
                            onChange={(event) =>
                              change({
                                allocations: input.allocations.map((item) =>
                                  item.bill_id === bill.id ? { ...item, amount: event.target.value } : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {(() => {
                            try {
                              return allocation
                                ? money(scaled(allocation.amount, 2) + scaled(allocation.discount ?? "0", 2))
                                : "0.00";
                            } catch {
                              return "—";
                            }
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                  {!paymentBills.length ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
                        {sourcesLoading
                          ? "Loading outstanding bills…"
                          : "No matching approved bills. Select a supplier or adjust the search."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot className="border-t border-border bg-muted font-medium">
                  <tr>
                    <td colSpan={8} className="px-3 py-2">
                      Totals · {input.currency}
                    </td>
                    {["discount", "amount", "total"].map((field) => (
                      <td key={field} className="px-3 py-2 text-right tabular-nums">
                        {(() => {
                          try {
                            return money(
                              input.allocations.reduce(
                                (sum, item) =>
                                  sum +
                                  (field === "discount"
                                    ? scaled(item.discount ?? "0", 2)
                                    : field === "amount"
                                      ? scaled(item.amount, 2)
                                      : scaled(item.amount, 2) + scaled(item.discount ?? "0", 2)),
                                0n,
                              ),
                            );
                          } catch {
                            return "—";
                          }
                        })()}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </fieldset>
          </div>
          <p className="m-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Select approved bills in one currency. A multi-vendor payment requires at least two suppliers.
          </p>
        </section>
      ) : (
        <section
          className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
          aria-label="Purchase lines"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h2 className="m-0 text-sm font-semibold">Products and services</h2>
            {kind === "request" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!editable || busy || input.lines.length >= 100}
                onClick={() => change({ lines: [...input.lines, newLine()] })}
              >
                Add line
              </Button>
            ) : null}
          </div>
          {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- WCAG 2.1.1: labelled read-only scroll regions need keyboard focus even when fieldset controls are disabled. */}
          <div
            role="region"
            aria-label="Products and services table"
            tabIndex={0}
            className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
            <fieldset disabled={!editable || busy} className="m-0 min-w-0 border-0 p-0">
              <table
                data-print-lines
                className="w-full min-w-[940px] table-fixed border-collapse text-sm print:min-w-0 print:table-auto"
              >
                <colgroup className="print:hidden">
                  <col className="w-[25%]" />
                  <col className="w-[20%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[13%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead className="bg-muted text-left">
                  <tr>
                    <th scope="col" className="hidden px-2 py-2 font-medium print:table-cell">
                      Product Code
                    </th>
                    <th scope="col" className="hidden px-2 py-2 font-medium print:table-cell">
                      Product Name
                    </th>
                    {[
                      "Product code · name",
                      "Description *",
                      "Quantity *",
                      "Unit *",
                      "Unit price",
                      "Tax %",
                      "Actions",
                    ].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className={`px-2 py-2 font-medium ${label === "Product code · name" || label === "Actions" ? "print:hidden" : ""}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {input.lines.map((line, index) => (
                    <tr key={line.id} className="border-t border-border align-top">
                      <td className="hidden p-2 print:table-cell">{line.item_code}</td>
                      <td className="hidden p-2 print:table-cell">{line.product_name ?? ""}</td>
                      <td className="p-2 print:hidden">
                        {kind === "request" ? (
                          <div className="grid gap-2">
                            <SearchableSelect
                              label={`Line ${index + 1} product`}
                              value={line.product_id ?? ""}
                              placeholder="Select product or service"
                              disabled={!canSave || busy}
                              options={[
                                { value: "", label: "Custom product / service" },
                                ...products.items.map((item) => ({
                                  value: item.id,
                                  label: `${item.code} · ${item.name}`,
                                })),
                                ...(line.product_id && !products.items.some((item) => item.id === line.product_id)
                                  ? [
                                      {
                                        value: line.product_id,
                                        label: `${line.item_code} · ${line.product_name ?? ""}`,
                                      },
                                    ]
                                  : []),
                              ]}
                              search={products.search}
                              onSearchChange={products.setSearch}
                              loading={products.busy}
                              onValueChange={(value) => {
                                const selected = products.items.find((item) => item.id === value);
                                if (selected)
                                  updateLine(index, {
                                    product_id: selected.id,
                                    item_code: selected.code,
                                    product_name: selected.name,
                                    uom: selected.uom,
                                    description: line.description || selected.name,
                                  });
                                else if (!value)
                                  updateLine(index, { product_id: null, item_code: "", product_name: "" });
                              }}
                              footer={
                                <div className="grid gap-1 text-sm">
                                  {products.error ? (
                                    <p role="alert" className="text-destructive">
                                      {products.error}{" "}
                                      <Button type="button" variant="link" onClick={products.retry}>
                                        Retry
                                      </Button>
                                    </p>
                                  ) : null}
                                  {products.cursor ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={products.busy}
                                      onClick={() => void products.more()}
                                    >
                                      Load more products
                                    </Button>
                                  ) : null}
                                </div>
                              }
                            />
                            {!line.product_id ? (
                              <div className="grid gap-2">
                                <Input
                                  aria-label={`Line ${index + 1} item code`}
                                  placeholder="Custom code"
                                  maxLength={64}
                                  value={line.item_code}
                                  onChange={(event) => updateLine(index, { item_code: event.target.value })}
                                />
                                <Input
                                  aria-label={`Line ${index + 1} product name`}
                                  placeholder="Product / service name"
                                  maxLength={200}
                                  value={line.product_name ?? ""}
                                  onChange={(event) => updateLine(index, { product_name: event.target.value })}
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="block break-words py-2">
                            {[line.item_code, line.product_name].filter(Boolean).join(" · ") || "Custom service"}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <Input
                          aria-label={`Line ${index + 1} description`}
                          required
                          maxLength={500}
                          value={line.description}
                          onChange={(event) => updateLine(index, { description: event.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          aria-label={`Line ${index + 1} quantity`}
                          required
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) => updateLine(index, { quantity: event.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          aria-label={`Line ${index + 1} unit`}
                          required
                          disabled={kind !== "request" || !!line.product_id}
                          maxLength={32}
                          value={line.uom}
                          onChange={(event) => updateLine(index, { uom: event.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          aria-label={`Line ${index + 1} unit price`}
                          disabled={sourceLocked}
                          inputMode="decimal"
                          value={line.unit_price}
                          onChange={(event) => updateLine(index, { unit_price: event.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          aria-label={`Line ${index + 1} tax percent`}
                          disabled={sourceLocked}
                          inputMode="decimal"
                          value={line.tax_percent}
                          onChange={(event) => updateLine(index, { tax_percent: event.target.value })}
                        />
                      </td>
                      <td className="p-2 print:hidden">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove line ${index + 1}`}
                          disabled={input.lines.length === 1}
                          onClick={() => change({ lines: input.lines.filter((_, i) => i !== index) })}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>
          </div>
          {!input.lines.length ? (
            <p className="m-0 px-3 py-6 text-sm text-muted-foreground">
              Select an approved source document to load its products.
            </p>
          ) : null}
        </section>
      )}
      <LabeledField label="Notes / business purpose">
        <Textarea
          rows={2}
          disabled={!editable || busy}
          maxLength={2000}
          value={input.notes}
          onChange={(event) => change({ notes: event.target.value })}
        />
      </LabeledField>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-y border-border py-3">
        <span className="text-sm text-muted-foreground">
          {payment
            ? `${input.allocations.length} bill allocation(s)`
            : `${input.lines.length} product / service line(s)`}
        </span>
        <strong className="text-lg tabular-nums">
          Total {input.currency} {record && !dirty ? record.total_amount : total}
        </strong>
      </div>
      {kind === "receipt" || kind === "bill" ? (
        <p className="m-0 text-xs text-muted-foreground">
          {kind === "receipt"
            ? "Record partial deliveries against the approved order. Approval rechecks the remaining ordered quantity. This receipt does not post a stock or accounting ledger entry."
            : "Approval matches this bill to the approved order and products already received. It does not post an accounts-payable journal."}
        </p>
      ) : null}
      {payment ? (
        <p className="m-0 text-xs text-muted-foreground">
          This is a payment instruction. Approval reserves these allocations; it does not transfer funds or mark the
          bills paid.
        </p>
      ) : null}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 print:hidden">
        {record ? (
          <Button
            type="button"
            variant="outline"
            disabled={dirty || busy}
            onClick={() => downloadPurchaseCsv([record], `${record.code}.csv`)}
          >
            Export CSV
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </footer>
      {record?.events.length ? (
        <details className="rounded-lg border border-border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">Record history</summary>
          <ol className="mt-3 grid gap-2 pl-5 text-xs text-muted-foreground">
            {record.events.map((event, index) => (
              <li key={index}>
                {event.action} · {event.actor_id} · {event.occurred_at}
                <span className="block">{event.reason}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {record?.source_id ? (
        <Button
          className="w-fit"
          type="button"
          variant="link"
          onClick={() => {
            const source = sources.find((item) => item.id === record.source_id);
            if (source) {
              const route = purchaseSteps.find((step) => step.kind === source.kind)!;
              onNavigate(route.form, source.id);
            }
          }}
        >
          Open source {record.source_code}
        </Button>
      ) : null}
    </form>
  );
}
