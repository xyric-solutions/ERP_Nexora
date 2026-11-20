"use client";
import { useEffect, useState } from "react";
import { salesKindSchema, type SalesDetail, type SalesDocumentInput, type SalesKind } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { MultiCurrencyWorkspace } from "@/features/finance/views/multi-currency-workspace";
import { PersistentSalesForm } from "../components/persistent-sales-form";
import { PersistentSalesRecord, type SalesNavigate } from "../components/persistent-sales-record";
import { salesLayer } from "../components/sales-ui";
import { salesPages, salesToday, salesError } from "../model/persistent-sales";
import { PersistentSalesList } from "./persistent-sales-list";

export function PersistentSalesWorkspace({
  context,
  onNavigate,
  onDirtyChange,
}: {
  context: { moduleId: string; pageId: string; recordRef?: string };
  onNavigate: SalesNavigate;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { activeCompany, session, loading } = useSession();
  if (loading) return <p role="status">Loading your session…</p>;
  if (!activeCompany) return <p role="alert">Choose your authorized company before opening Sales.</p>;
  if (context.pageId === "customers")
    return (
      <MultiCurrencyWorkspace
        operational
        initialTab="balances"
        initialSide="receivable"
        initialPartyId={
          context.recordRef?.startsWith("ledger?")
            ? (new URLSearchParams(context.recordRef.slice(7)).get("party") ?? undefined)
            : undefined
        }
      />
    );
  if (context.pageId === "receipts")
    return context.recordRef?.startsWith("receive:") ? (
      <SalesFinancialFocus
        key={`${activeCompany.id}:${context.recordRef}`}
        id={context.recordRef.slice(8)}
        company={activeCompany.id}
        receipt
        onNavigate={onNavigate}
      />
    ) : (
      <MultiCurrencyWorkspace operational initialTab="settlement" initialSide="receivable" />
    );
  if (context.recordRef === "accounting")
    return <MultiCurrencyWorkspace operational initialTab="documents" initialSide="receivable" />;
  if (context.recordRef?.startsWith("accounting:"))
    return (
      <SalesFinancialFocus
        key={`${activeCompany.id}:${context.recordRef}`}
        id={context.recordRef.slice(11)}
        company={activeCompany.id}
        onNavigate={onNavigate}
      />
    );
  if (!session?.user.permissions.includes("sales.document.read"))
    return <p role="alert">Sales read access is required for this company.</p>;
  const kind: SalesKind =
    context.pageId === "sales-orders"
      ? "order"
      : context.pageId === "pick-pack-delivery"
        ? "delivery"
        : context.pageId === "invoices"
          ? "invoice"
          : context.pageId === "recurring-bills"
            ? "recurring"
            : "quotation";
  return (
    <CompanySalesWorkspace
      key={`${activeCompany.id}:${context.pageId}:${context.recordRef ?? ""}`}
      company={activeCompany.id}
      kind={kind}
      reference={context.recordRef}
      onNavigate={onNavigate}
      onDirtyChange={onDirtyChange}
    />
  );
}

function CompanySalesWorkspace({
  company,
  kind,
  reference,
  onNavigate,
  onDirtyChange,
}: {
  company: string;
  kind: SalesKind;
  reference?: string;
  onNavigate: SalesNavigate;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, csrfToken } = useSession();
  const [listKind, setListKind] = useState(kind),
    [attempt, setAttempt] = useState(0);
  const params = new URLSearchParams(reference?.startsWith("new?") ? reference.slice(4) : "");
  const creating = reference === "new" || reference?.startsWith("new?") === true;
  const parsedKind = salesKindSchema.safeParse(params.get("kind") ?? kind),
    newKind = parsedKind.success ? parsedKind.data : kind;
  const source = params.get("source"),
    editing = reference?.startsWith("edit:") ?? false,
    id = editing ? reference?.slice(5) : creating ? undefined : reference;
  const version = params.get("version"),
    documentDate = params.get("date") ?? salesToday(),
    customer = params.get("customer"),
    period = params.get("period");
  const [loaded, setLoaded] = useState<{ record?: SalesDetail; draft?: SalesDocumentInput; error?: string } | null>(
    null,
  );
  useEffect(() => {
    if (!id && !source) return;
    let active = true;
    const work = id
      ? api.getSalesDocument(id, company)
      : api.getSalesDocument(source!, company).then((detail) =>
          api
            .deriveSalesDocument(
              detail.record.id,
              {
                company_id: company,
                expected_version: Number(version ?? detail.record.version),
                kind: newKind,
                document_date: documentDate,
                ...(customer ? { customer_id: customer } : {}),
                ...(period ? { billing_period: period } : {}),
              },
              csrfToken(),
              crypto.randomUUID(),
            )
            .then((draft) => ({ draft })),
        );
    work
      .then((value) => {
        if (active) setLoaded("draft" in value ? value : { record: value });
      })
      .catch((error) => {
        if (active) setLoaded({ error: salesError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, id, source, company, newKind, version, documentDate, customer, period, csrfToken, attempt]);
  const back = () => onNavigate("sales", salesPages[kind]);
  const saved = (detail: SalesDetail) =>
    onNavigate("sales", salesPages[detail.record.kind], detail.record.id, { replace: true });
  if (loaded?.error)
    return (
      <div role="alert" className="grid gap-3 rounded-lg border border-destructive p-4 text-sm">
        <p>{loaded.error}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </Button>
          <Button type="button" variant="outline" onClick={back}>
            Back
          </Button>
        </div>
      </div>
    );
  if ((id || source) && !loaded) return <p role="status">Loading the actual Sales document…</p>;
  if (creating || editing) {
    return (
      <PersistentSalesForm
        company={company}
        kind={loaded?.record?.record.kind ?? newKind}
        initial={loaded?.draft}
        existing={editing ? loaded?.record : undefined}
        onSaved={saved}
        onCancel={back}
        onDirtyChange={onDirtyChange}
      />
    );
  }
  if (loaded?.record) {
    const detail = loaded.record;
    const content = (
      <PersistentSalesRecord
        initial={detail}
        onNavigate={onNavigate}
        onBack={back}
        onEdit={() => onNavigate("sales", salesPages[detail.record.kind], `edit:${detail.record.id}`)}
        onDerive={(target, current, options) => {
          const query = new URLSearchParams({
            kind: target,
            source: current.record.id,
            version: String(current.record.version),
            date: options.date,
            ...(options.customer ? { customer: options.customer } : {}),
            ...(options.period ? { period: options.period } : {}),
          });
          onNavigate("sales", salesPages[target], `new?${query}`);
        }}
      />
    );
    if (["invoice", "credit", "delivery", "return"].includes(detail.record.kind))
      return (
        <>
          <PersistentSalesList company={company} kind={kind} onNavigate={onNavigate} selected={detail.record.id} />
          <Sheet
            open
            onOpenChange={(open) => {
              if (!open) back();
            }}
          >
            <SheetContent
              overlayClassName={salesLayer.sheetOverlay}
              className={`${salesLayer.sheet} w-full! overflow-y-auto p-4 sm:max-w-5xl!`}
            >
              <SheetHeader className="pr-8">
                <SheetTitle>{detail.record.code}</SheetTitle>
                <SheetDescription>Actual commercial source, posting status and audit history.</SheetDescription>
              </SheetHeader>
              {content}
            </SheetContent>
          </Sheet>
        </>
      );
    return content;
  }
  return <PersistentSalesList company={company} kind={listKind} onNavigate={onNavigate} onKindChange={setListKind} />;
}

function SalesFinancialFocus({
  company,
  id,
  receipt = false,
  onNavigate,
}: {
  company: string;
  id: string;
  receipt?: boolean;
  onNavigate: SalesNavigate;
}) {
  const { api } = useSession(),
    [loaded, setLoaded] = useState<{ record?: SalesDetail; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    api
      .getSalesDocument(id, company)
      .then((record) => {
        if (active) setLoaded({ record });
      })
      .catch((error) => {
        if (active) setLoaded({ error: salesError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, company, id]);
  if (!loaded) return <p role="status">Loading the customer accounting source…</p>;
  if (loaded.error) return <p role="alert">{loaded.error}</p>;
  const record = loaded.record!.record;
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {record.code} · {record.customer_name}
        </span>
        <Button type="button" variant="outline" onClick={() => onNavigate("sales", salesPages[record.kind], record.id)}>
          Back to {record.code}
        </Button>
      </div>
      <MultiCurrencyWorkspace
        operational
        initialTab={receipt ? "settlement" : "documents"}
        initialSide="receivable"
        salesDocumentId={record.id}
        initialPartyId={record.customer_id ?? undefined}
        initialCurrency={record.currency}
        initialReference={record.code}
        initialDimensions={{ project: record.project_id, location: record.location_id }}
      />
    </div>
  );
}
