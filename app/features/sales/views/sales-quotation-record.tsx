"use client";

/**
 * Quotation record (prototype): the full quotation-to-payment workflow.
 *
 * Meeting of 11 Nov 2026: a quotation is a price offer, not an order. The
 * approver is optional: with a named approver it is submitted and only that
 * person can approve, reject or request changes (a reason only for the last
 * two); without one the creator approves it. Approved shows "Approved" until
 * Confirm Order creates the sales order. Only drafts can be deleted; Reset to
 * Draft reopens an approved, rejected or pending quotation. Download and
 * Print give the PDF; there is no email option.
 *
 * Runs against the session store only; there is no Sales API, so nothing
 * here is a posted or audited record yet.
 */

import { useState } from "react";
import { Check, Download, FileText, Minus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import {
  ActivityList,
  Card,
  EmptyState,
  LinkButton,
  NextActionBar,
  PageHead,
  StatusPill,
  tableClass,
  TotalsSummary,
} from "../components/sales-ui";
import { DeleteDraftDialog, QuotationDecisionButtons, QuotationDecisionDialog } from "../components/sales-dialogs";
import { InvoicePdfViewer } from "../components/invoice-viewer";
import { contextRows, ProjectLocationDialog } from "../components/project-location-fields";
import type { SalesNav } from "../components/sales-nav";
import { downloadInvoicePdf } from "../model/invoice-pdf";
import { moneyWhole } from "../model/sales-format";
import { currencySummary, docMoney, toBase } from "../model/sales-currency";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  approvalBlocker,
  approvalSummary,
  approveOwnQuotation,
  approverName,
  confirmQuotation,
  creditCheck,
  decideQuotation,
  deleteQuotation,
  documentTotal,
  EDITABLE_QUOTATION_STATUSES,
  findCustomer,
  findDocument,
  hasContext,
  isApproverOf,
  lineAmount,
  lineTotals,
  nextActionFor,
  quotationStages,
  RESETTABLE_QUOTATION_STATUSES,
  resetQuotationToDraft,
  submitQuotation,
  type QuotationStage,
} from "../model/sales-workflow";
import type { ApprovalDecision, SalesContextFields } from "../model/sales-types";
import { DocumentEntry } from "./sales-document-entry";

const STAGE_MARK: Record<QuotationStage["state"], string> = {
  done: "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]",
  current: "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_var(--nx-focus-ring)]",
  waiting: "border-border bg-card text-muted-foreground",
  blocked: "border-dashed border-[var(--nx-danger-border)] bg-card text-[var(--nx-danger)]",
};

function StageCard({ stage, index, onOpen }: { stage: QuotationStage; index: number; onOpen?: () => void }) {
  return (
    <li
      aria-current={stage.state === "current" ? "step" : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-3.5",
        stage.state === "current" ? "border-primary ring-2 ring-ring/20" : "border-border",
      )}
    >
      <div className="flex items-center gap-2.5">
        <i className={cn("grid size-7.5 shrink-0 place-items-center rounded-full border text-xs font-bold not-italic", STAGE_MARK[stage.state])}>
          {stage.state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : stage.state === "blocked" ? <Minus className="size-3.5" aria-hidden="true" /> : index + 1}
        </i>
        <div className="min-w-0">
          <strong className="block text-sm font-bold text-foreground">{stage.label}</strong>
          {stage.code ? (
            onOpen ? (
              <LinkButton mono onClick={onOpen}>{stage.code}</LinkButton>
            ) : (
              <span className="font-mono text-xs font-semibold text-muted-foreground">{stage.code}</span>
            )
          ) : null}
        </div>
      </div>
      <div><StatusPill status={stage.status} /></div>
      {stage.details.length ? (
        <dl className="m-0 grid gap-1.5 text-xs">
          {stage.details.map(([label, value]) => (
            <div key={label} className="grid min-w-0 gap-0.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0 font-semibold break-words text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="m-0 text-xs text-muted-foreground">{stage.state === "blocked" ? "Stopped: the quotation was rejected." : "Starts after the previous stage."}</p>
      )}
    </li>
  );
}

export function QuotationRecord({ code, nav }: { code: string; nav: SalesNav }) {
  const state = useSalesState();
  const doc = findDocument(state, "quotation", code);
  const [editing, setEditing] = useState(false);
  const [deciding, setDeciding] = useState<ApprovalDecision | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pdf, setPdf] = useState<"view" | "print" | null>(null);
  const [choosingContext, setChoosingContext] = useState(false);

  if (!doc) {
    return (
      <EmptyState
        title={`${code} was not found`}
        hint="Sample records reset when the page reloads. Deleted drafts are removed."
        action={<Button type="button" variant="outline" size="sm" onClick={nav.back}>Back to list</Button>}
      />
    );
  }

  if (editing) {
    return <DocumentEntry kind="quotation" existing={doc} nav={nav} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  }

  const customer = findCustomer(state, doc.customerId);
  const next = nextActionFor(state, doc);
  const totals = lineTotals(doc.lines);
  const stages = quotationStages(state, doc);
  const canEdit = EDITABLE_QUOTATION_STATUSES.includes(doc.status);
  const canReset = RESETTABLE_QUOTATION_STATUSES.includes(doc.status);
  const isApprover = isApproverOf(doc, nav.actor);
  const approvalEntries = (doc.approval ?? []).map((entry) => ({
    step: entry.action === "Submitted" ? "Submitted for approval" : entry.action,
    at: entry.at,
    by: entry.action === "Submitted" ? entry.by : approverName(entry),
    note: entry.note,
  }));
  const pdfInput = { invoice: doc, customer, deliveryNo: "", received: 0, balance: 0 };

  const run = (change: () => string) => {
    try {
      nav.notify(change());
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "That action could not be completed.");
    }
  };

  const runAction = () => {
    if (next.type !== "action") return;
    if (next.action === "submitApproval") {
      run(() => {
        commitSales((sales) => submitQuotation(sales, doc.code, nav.actor));
        return `${doc.code} sent to ${doc.approver} for approval. It stays in your drafts until they decide.`;
      });
    } else if (next.action === "approveSelf") {
      run(() => {
        commitSales((sales) => approveOwnQuotation(sales, doc.code, nav.actor));
        return `${doc.code} approved. Click Confirm Order when the customer orders.`;
      });
    } else if (next.action === "confirmOrder") {
      // Quotations saved before Project and Location were required ask for them first.
      if (!hasContext(doc)) setChoosingContext(true);
      else confirmWith();
    }
  };

  const confirmWith = (chosen?: SalesContextFields) =>
    run(() => {
      const orderCode = commitSales((sales) => confirmQuotation(sales, doc.code, nav.actor, chosen));
      setChoosingContext(false);
      return `Order confirmed. Sales order ${orderCode} is now in Delivery.`;
    });

  const decide = (note: string) => {
    if (!deciding) return;
    const decision = deciding;
    setDeciding(null);
    run(() => {
      commitSales((sales) => decideQuotation(sales, doc.code, decision, nav.actor, note));
      return decision === "Approved"
        ? `${doc.code} approved. The creator can now confirm the order.`
        : decision === "Rejected"
          ? `${doc.code} rejected.`
          : `Changes requested on ${doc.code}.`;
    });
  };

  const resetToDraft = () =>
    run(() => {
      commitSales((sales) => resetQuotationToDraft(sales, doc.code, nav.actor));
      return `${doc.code} is a draft again. You can edit or delete it.`;
    });

  const remove = () => {
    setDeleting(false);
    run(() => {
      commitSales((sales) => deleteQuotation(sales, doc.code));
      nav.go("quotations");
      return `Draft ${doc.code} deleted.`;
    });
  };

  const openStage = (stage: QuotationStage) => {
    if (!stage.code || stage.key === "quotation") return undefined;
    const target = stage.key === "delivery" ? doc.links.order : stage.code;
    return target ? () => nav.open(target) : undefined;
  };

  const credit = creditCheck(state, doc.customerId, toBase(documentTotal(doc), doc));
  const approvalWarning = credit.over
    ? `Approving takes ${customer?.display ?? "the customer"} over the credit limit by ${moneyWhole(credit.overBy)}. You can still approve.`
    : undefined;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Quotation"
        title={`Quotation · ${doc.code}`}
        status={<StatusPill status={doc.status} />}
        description={`${customer?.display ?? "—"} · ${approvalSummary(doc)}`}
        actions={
          <>
            <Button type="button" variant="outline" onClick={nav.back}>Back to list</Button>
            <Button type="button" variant="outline" onClick={() => setPdf("view")}><FileText /> Preview</Button>
            <Button type="button" variant="outline" onClick={() => downloadInvoicePdf(pdfInput)}><Download /> Download PDF</Button>
            <Button type="button" variant="outline" onClick={() => setPdf("print")}><Printer /> Print</Button>
            {canEdit ? <Button type="button" variant="outline" onClick={() => setEditing(true)}>Edit</Button> : null}
            {canReset ? <Button type="button" variant="outline" onClick={resetToDraft}><RotateCcw /> Reset to Draft</Button> : null}
            {doc.status === "Draft" ? <Button type="button" variant="destructive" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button> : null}
          </>
        }
      />

      <section
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-[var(--nx-info-border)] bg-[var(--nx-info-soft)] px-3 py-2 text-[0.8125rem]"
        aria-label="Document type"
      >
        <strong className="text-[var(--nx-info)]">Quotation · price offer</strong>
        <span className="text-muted-foreground">Not an order yet. It becomes a sales order only when you click Confirm Order on the approved quotation.</span>
      </section>

      {next.type === "action" ? (
        <NextActionBar tone="action" eyebrow="Next action" title={next.label} text={next.text}>
          <Button type="button" className="h-10 px-4.5" onClick={runAction}>{next.label}</Button>
        </NextActionBar>
      ) : next.type === "wait" ? (
        <NextActionBar
          tone="wait"
          eyebrow="Approval"
          title={isApprover ? "Waiting for your decision" : `Waiting for ${doc.approver || "the approver"}`}
          text={isApprover ? "You are the approver. Approve the price, request changes or reject it. A reason is needed only to reject or request changes." : next.text}
        >
          {next.approval && isApprover ? <QuotationDecisionButtons size="default" onDecide={setDeciding} /> : null}
        </NextActionBar>
      ) : next.type === "stopped" ? (
        <NextActionBar tone="stopped" eyebrow="Rejected" title="This quotation is closed" text={next.text}>
          {customer ? <Button type="button" variant="outline" onClick={() => nav.openNew("quotations", customer.code)}>New Quotation for {customer.display}</Button> : null}
        </NextActionBar>
      ) : (
        <NextActionBar tone="done" eyebrow="Converted" title="Order confirmed" text={next.text}>
          {next.link ? <Button type="button" variant="outline" onClick={() => nav.open(next.link!.code)}>{next.link.label}</Button> : null}
        </NextActionBar>
      )}

      <Card title="Workflow" aside={<span className="text-xs text-muted-foreground">Quotation → Approval → Confirm Order → Delivery → Invoice → Payment</span>}>
        <ol className="m-0 grid list-none grid-cols-1 gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Quotation workflow">
          {stages.map((stage, index) => (
            <StageCard key={stage.key} stage={stage} index={index} onOpen={openStage(stage)} />
          ))}
        </ol>
      </Card>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="Products and services" aside={doc.reference ? <span className="text-xs text-muted-foreground">Reference {doc.reference}</span> : undefined}>
          <div className="relative overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product / service</th>
                  <th className="text-right!">Qty</th>
                  <th>Unit</th>
                  <th className="text-right!">Rate</th>
                  <th className="text-right!">Tax</th>
                  <th className="text-right!">Amount</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((item, index) => (
                  <tr key={`${item.sku}-${index}`}>
                    <td className="text-muted-foreground">{index + 1}</td>
                    <td><strong>{item.desc}</strong><small>{item.sku || "Other charge"}</small></td>
                    <td className="text-right tabular-nums">{item.qty}</td>
                    <td>{item.uom || "Each"}</td>
                    <td className="text-right tabular-nums">{docMoney(item.rate, doc)}</td>
                    <td className="text-right tabular-nums">{item.tax}%</td>
                    <td className="text-right font-semibold tabular-nums">{docMoney(lineAmount(item), doc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="grid grid-cols-1 gap-4 rounded-b-lg border-t border-border bg-muted p-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)]">
            {doc.notes ? (
              <div><span className="text-xs font-semibold text-muted-foreground">Notes</span><p className="mt-1 mb-0 text-[0.8125rem]">{doc.notes}</p></div>
            ) : (
              <span className="text-xs text-muted-foreground">No notes on this quotation.</span>
            )}
            <TotalsSummary
              rows={[
                ...contextRows(doc),
                ["Currency", currencySummary(doc)],
                ["Untaxed amount", docMoney(totals.sub, doc)],
                ["Sales tax", docMoney(totals.tax, doc)],
              ]}
              total={["Total", docMoney(totals.total, doc)]}
            />
          </footer>
        </Card>

        <aside className="grid min-w-0 content-start gap-3.5">
          <Card title="Approval" aside={doc.status === "Pending approval" ? <StatusPill status="Pending approval" /> : undefined}>
            <p className="m-0 border-b border-border px-4 py-3 text-[0.8125rem]">
              {doc.approver ? (
                <>
                  Approver: <strong>{doc.approver}</strong>
                  {isApprover ? " (you)" : ""}
                </>
              ) : (
                "No approver. The creator approves it."
              )}
            </p>
            {approvalEntries.length ? (
              <ActivityList entries={approvalEntries} />
            ) : (
              <p className="m-0 p-4 text-[0.8125rem] text-muted-foreground">Not approved yet.</p>
            )}
          </Card>
          <Card title="Activity"><ActivityList entries={doc.history} /></Card>
        </aside>
      </div>

      <QuotationDecisionDialog
        key={deciding ?? "closed"}
        quotation={deciding ? doc : null}
        decision={deciding ?? "Approved"}
        customerName={customer?.display ?? ""}
        total={totals.total}
        reviewer={nav.actor}
        blocker={approvalBlocker(state, doc)}
        warning={approvalWarning}
        onClose={() => setDeciding(null)}
        onConfirm={decide}
      />
      <DeleteDraftDialog code={deleting ? doc.code : null} onClose={() => setDeleting(false)} onConfirm={remove} />
      {choosingContext ? (
        <ProjectLocationDialog
          open
          title={`Confirm Order · ${doc.code}`}
          description={`${doc.code} was saved before Project and Location were required. Choose them for the sales order.`}
          confirmLabel="Confirm Order"
          onClose={() => setChoosingContext(false)}
          onConfirm={confirmWith}
        />
      ) : null}
      {pdf ? (
        <InvoicePdfViewer input={pdfInput} customerLabel={customer?.display ?? ""} autoPrint={pdf === "print"} onClose={() => setPdf(null)} />
      ) : null}
    </div>
  );
}
