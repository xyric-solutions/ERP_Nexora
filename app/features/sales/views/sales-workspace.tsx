"use client";

/**
 * Sales, Revenue and Customers workspace (prototype).
 *
 * Follows the approved "Nexora Simple Sales" artifact and the Purchase module
 * pattern: one list per document with a single New button, a form with one
 * Save, and one next action on every record. Flow: New Quotation → Management
 * approval (confirms the order) → Pick & Pack → Delivery → Create Invoice →
 * Record Payment in the invoice panel. Data is session-only mock data;
 * no Sales, Customer or Revenue API exists yet.
 */

import { useMemo } from "react";
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
import { ApprovalsView, PricingView, ReportsView, ReturnsView } from "./sales-control-views";
import { RecurringBillsView } from "./sales-recurring-view";

export function isSalesWorkspacePage(moduleId: string, pageId: string): boolean {
  return SALES_MODULE_PAGES[moduleId]?.includes(pageId) ?? false;
}

interface SalesWorkspaceProps {
  context: { moduleId: string; pageId: string; recordRef?: string };
  onNavigate: (moduleId: string, pageId: string, recordRef?: string, options?: { replace?: boolean }) => void;
}

const NEW_KIND_BY_PAGE = { quotations: "quotation", "sales-orders": "order", invoices: "invoice" } as const;

export function SalesWorkspace({ context, onNavigate }: SalesWorkspaceProps) {
  const { session } = useSession();
  const notify = useActionFeedback();
  const { moduleId, pageId, recordRef } = context;

  const nav: SalesNav = useMemo(
    () => ({
      actor: session?.user.display_name ?? "You",
      notify,
      go: (target) => onNavigate(target === "customers" ? "customers" : target === "recurring-bills" ? "revenue" : "sales", target),
      back: () => onNavigate(moduleId, pageId),
      openNew: (target, preset) => onNavigate(target === "customers" ? "customers" : "sales", target, preset ? `new:${preset}` : "new"),
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
  // Saved invoices and customers return to their list with the side panel closed.
  const replaceWithList = (code: string) => {
    const kind = kindOfCode(code);
    if (kind) onNavigate(ROUTE_BY_KIND[kind][0], ROUTE_BY_KIND[kind][1], undefined, { replace: true });
  };

  if (recordRef) {
    if (recordRef === "new" || recordRef.startsWith("new:")) {
      const preset = recordRef.slice(4) || undefined;
      if (pageId in NEW_KIND_BY_PAGE) {
        const kind = NEW_KIND_BY_PAGE[pageId as keyof typeof NEW_KIND_BY_PAGE];
        return <DocumentEntry key={recordRef} kind={kind} customerCode={preset} nav={nav} onSaved={kind === "invoice" ? replaceWithList : replaceWith} />;
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
  }

  switch (pageId) {
    case "quotations":
      return <DocumentList kind="quotation" nav={nav} />;
    case "sales-orders":
      return <DocumentList kind="order" nav={nav} />;
    case "invoices":
      return <DocumentList kind="invoice" nav={nav} />;
    case "pick-pack-delivery":
      return <DeliveryView nav={nav} />;
    case "sales-returns":
      return <ReturnsView nav={nav} />;
    case "pricing":
      return <PricingView />;
    case "sales-approvals":
      return <ApprovalsView nav={nav} />;
    case "sales-reports":
      return <ReportsView />;
    case "recurring-bills":
      return <RecurringBillsView nav={nav} />;
    case "customers":
      return <CustomerList nav={nav} />;
    default:
      return null;
  }
}
