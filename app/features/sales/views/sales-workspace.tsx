"use client";

/**
 * Sales, Revenue and Customers workspace (prototype).
 *
 * Follows the Purchase module pattern: one list per document with a single
 * New button, a form with one Save, and one next action on every record.
 * Flow (meeting of 11 Nov 2026): Quotation (optional approver) → Approved →
 * Confirm Order → Delivery → Create Invoice → Receipts. Sale
 * Return is recorded from an opened invoice; the separate Returns & Control
 * pages were removed. Data is session-only mock data; no Sales, Customer or
 * Revenue API exists yet.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { MultiCurrencyWorkspace } from "@/features/finance/views/multi-currency-workspace";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { kindOfCode, ROUTE_BY_KIND, type SalesNav } from "../components/sales-nav";
import { SALES_MODULE_PAGES } from "../model/sales-constants";
import { CustomerForm, CustomerList } from "./sales-customers-view";
import { DeliveryView } from "./sales-delivery-view";
import { DocumentEntry } from "./sales-document-entry";
import { DocumentList } from "./sales-document-list";
import { DocumentRecord } from "./sales-document-record";
import { QuotationRecord } from "./sales-quotation-record";
import { ReceiptList } from "./sales-receipts-view";
import { RecurringBillsView } from "./sales-recurring-view";

export function isSalesWorkspacePage(moduleId: string, pageId: string): boolean {
  return SALES_MODULE_PAGES[moduleId]?.includes(pageId) ?? false;
}

interface SalesWorkspaceProps {
  context: { moduleId: string; pageId: string; recordRef?: string };
  onNavigate: (moduleId: string, pageId: string, recordRef?: string, options?: { replace?: boolean }) => void;
}

const NEW_KIND_BY_PAGE = { quotations: "quotation", "sales-orders": "order", invoices: "invoice" } as const;

/** Financial pages use the persistent API. Legacy sample flows require an explicit prototype route. */
export function SalesWorkspace(props: SalesWorkspaceProps) {
  const { context, onNavigate } = props;
  const financial =
    (context.moduleId === "sales" && ["invoices", "receipts"].includes(context.pageId)) ||
    // Customers moved into the Sales module; old Customers-module links stay recognised.
    (["sales", "customers"].includes(context.moduleId) && context.pageId === "customers");
  const prototype = context.recordRef?.startsWith("prototype:") ?? false;
  if (financial && !prototype)
    return (
      <div className="grid gap-3">
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onNavigate(context.moduleId, context.pageId, "prototype:")}
          >
            View sample sales workflow
          </Button>
        </div>
        <MultiCurrencyWorkspace
          key={context.pageId}
          initialTab={
            context.pageId === "invoices" ? "documents" : context.pageId === "receipts" ? "settlement" : "balances"
          }
        />
      </div>
    );
  const prototypeContext = prototype
    ? { ...context, recordRef: context.recordRef?.slice("prototype:".length) || undefined }
    : context;
  const prototypeNavigate: SalesWorkspaceProps["onNavigate"] = (moduleId, pageId, reference, options) => {
    const targetFinancial =
      (moduleId === "sales" && ["invoices", "receipts"].includes(pageId)) ||
      (["sales", "customers"].includes(moduleId) && pageId === "customers");
    onNavigate(moduleId, pageId, targetFinancial ? `prototype:${reference ?? ""}` : reference, options);
  };
  return (
    <div className="grid gap-3">
      {financial && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
          <span>Sample workflow only. These records do not change posted balances or financial reports.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onNavigate(context.moduleId, context.pageId)}
          >
            Open persistent currency accounts
          </Button>
        </div>
      )}
      <PrototypeSalesWorkspace context={prototypeContext} onNavigate={prototypeNavigate} />
    </div>
  );
}

function PrototypeSalesWorkspace({ context, onNavigate }: SalesWorkspaceProps) {
  const { session } = useSession();
  const notify = useActionFeedback();
  const { moduleId, pageId, recordRef } = context;

  const nav: SalesNav = useMemo(
    () => ({
      actor: session?.user.display_name ?? "You",
      notify,
      // Recurring Bills and Customers live in the Sales module (12 Nov 2026).
      go: (target) => onNavigate("sales", target),
      back: () => onNavigate(moduleId, pageId),
      openNew: (target, preset) => onNavigate("sales", target, preset ? `new:${preset}` : "new"),
      open: (code, keepPage) => {
        const kind = kindOfCode(code);
        if (!kind) return;
        if (keepPage) onNavigate(moduleId, pageId, code);
        else onNavigate(ROUTE_BY_KIND[kind][0], ROUTE_BY_KIND[kind][1], code);
      },
    }),
    [moduleId, notify, onNavigate, pageId, session?.user.display_name],
  );

  const replaceWith = (code: string) => {
    const kind = kindOfCode(code);
    if (kind) onNavigate(ROUTE_BY_KIND[kind][0], ROUTE_BY_KIND[kind][1], code, { replace: true });
  };
  // Saved invoices, receipts and customers return to their list with the side panel closed.
  const replaceWithList = (code: string) => {
    const kind = kindOfCode(code);
    if (kind) onNavigate(ROUTE_BY_KIND[kind][0], ROUTE_BY_KIND[kind][1], undefined, { replace: true });
  };

  if (recordRef) {
    if (recordRef === "new" || recordRef.startsWith("new:")) {
      const preset = recordRef.slice(4) || undefined;
      // Add New / Batch / Receive Payment open a sheet over the Receipts list.
      if (pageId === "receipts") return <ReceiptList nav={nav} creating preset={preset} onSaved={replaceWithList} />;
      // Recurring Bills: new / new:batch open the template form; new:RB-… opens Create Invoices for a batch template.
      if (pageId === "recurring-bills") {
        if (preset && kindOfCode(preset) === "recurring") return <RecurringBillsView nav={nav} generating={preset} />;
        return <RecurringBillsView nav={nav} creating={preset === "batch" ? "Batch" : "Single"} />;
      }
      // Create Invoice on a recurring template opens the invoice form prefilled from it (new:RB-… or new:RB-…@customerId).
      const [templateCode, templateCustomer] = (preset ?? "").split("@");
      if (pageId === "invoices" && templateCode && kindOfCode(templateCode) === "recurring") {
        const backToTemplates = () => onNavigate("sales", "recurring-bills", undefined, { replace: true });
        return (
          <DocumentEntry
            key={recordRef}
            kind="invoice"
            fromTemplate={{ code: templateCode, customerId: templateCustomer || undefined }}
            nav={nav}
            onSaved={backToTemplates}
            onCancel={() => onNavigate("sales", "recurring-bills")}
          />
        );
      }
      if (pageId in NEW_KIND_BY_PAGE) {
        const kind = NEW_KIND_BY_PAGE[pageId as keyof typeof NEW_KIND_BY_PAGE];
        // Create Invoice on a delivered order opens the invoice form prefilled from it (new:SO-…).
        const fromOrder = kind === "invoice" && preset && kindOfCode(preset) === "order" ? preset : undefined;
        return (
          <DocumentEntry
            key={recordRef}
            kind={kind}
            customerCode={fromOrder ? undefined : preset}
            fromOrder={fromOrder}
            nav={nav}
            onSaved={kind === "invoice" ? replaceWithList : replaceWith}
            onCancel={fromOrder ? () => nav.open(fromOrder) : undefined}
          />
        );
      }
      if (pageId === "customers") return <CustomerForm key={recordRef} nav={nav} onSaved={replaceWithList} />;
    }
    const kind = kindOfCode(recordRef);
    // Customers open in the right-side customer panel over the Customers list.
    if (kind === "customer") return <CustomerList nav={nav} selected={recordRef} />;
    if (kind === "quotation") return <QuotationRecord key={recordRef} code={recordRef} nav={nav} />;
    if (kind === "order") return <DocumentRecord key={recordRef} code={recordRef} nav={nav} />;
    // Invoices open in the right-side invoice panel over the Invoices list.
    if (kind === "invoice") return <DocumentList kind="invoice" nav={nav} selected={recordRef} />;
    // Receipts open in the right-side receipt panel over the Receipts list.
    if (kind === "receipt") return <ReceiptList nav={nav} selected={recordRef} onSaved={replaceWithList} />;
    // Recurring templates open in the template side sheet over the Recurring Bills list.
    if (kind === "recurring") return <RecurringBillsView nav={nav} selected={recordRef} />;
  }

  switch (pageId) {
    case "quotations":
      return <DocumentList kind="quotation" nav={nav} />;
    case "sales-orders":
      return <DocumentList kind="order" nav={nav} />;
    case "invoices":
      return <DocumentList kind="invoice" nav={nav} />;
    case "receipts":
      return <ReceiptList nav={nav} onSaved={replaceWithList} />;
    case "pick-pack-delivery":
      return <DeliveryView nav={nav} />;
    case "recurring-bills":
      return <RecurringBillsView nav={nav} />;
    case "customers":
      return <CustomerList nav={nav} />;
    default:
      return null;
  }
}
