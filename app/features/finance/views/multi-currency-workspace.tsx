"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  decimal,
  decimalText,
  divideRounded,
  type TaxDefinition,
  type SubledgerInput,
  type SubledgerOperation,
  type SubledgerPolicyInput,
  type SubledgerReport,
  type SubledgerWorkspace,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { WorkTable, workSelectClass } from "@/shared/ui/work-table";

type Tab = "balances" | "documents" | "settlement" | "revaluation" | "reports" | "setup";
type Side = "receivable" | "payable";
const titles: Record<Tab, string> = {
  balances: "Currency balances",
  documents: "Invoices & credits",
  settlement: "Receipts & payments",
  revaluation: "Outstanding balance valuation",
  reports: "Statements & financial reports",
  setup: "Accounting setup",
};
const policyRoles = [
  "receivable",
  "payable",
  "revenue",
  "expense",
  "realized_gain",
  "realized_loss",
  "unrealized_gain",
  "unrealized_loss",
] as const;
function today() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function queryString(value: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(value).forEach(([key, item]) => {
    if (item !== undefined && item !== "") params.set(key, String(item));
  });
  return `?${params}`;
}
function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}
function Money({ currency, value }: { currency: string; value: string }) {
  const [integer = "0", fraction] = value.split(".");
  const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (
    <span className="whitespace-nowrap font-mono text-xs tabular-nums">
      {currency} {formatted}
      {fraction !== undefined ? `.${fraction}` : ""}
    </span>
  );
}

type WorkspaceProps = {
  embedded?: boolean;
  initialTab?: Tab;
  initialSide?: Side;
  initialReport?: SubledgerReport["report"];
  sourceDocumentId?: string;
};

export function MultiCurrencyWorkspace(props: WorkspaceProps) {
  const { activeCompany } = useSession();
  return (
    <CompanyCurrencyWorkspace
      key={`${activeCompany?.id}:${props.initialSide}:${props.initialTab}:${props.initialReport}:${props.sourceDocumentId}`}
      {...props}
    />
  );
}

function CompanyCurrencyWorkspace({
  embedded = false,
  initialTab = "balances",
  initialSide = "receivable",
  initialReport = "statement",
  sourceDocumentId,
}: WorkspaceProps) {
  const { api, activeCompany, session, csrfToken } = useSession();
  const [tab, setTab] = useState<Tab>(initialTab),
    [side, setSide] = useState<Side>(initialSide);
  const [asOf, setAsOf] = useState(today),
    [partyId, setPartyId] = useState(""),
    [currency, setCurrency] = useState("");
  const [loaded, setLoaded] = useState<{ scope: string; value: SubledgerWorkspace } | null>(null),
    [report, setReport] = useState<SubledgerReport | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [offset, setOffset] = useState(0),
    [reportKind, setReportKind] = useState(initialReport),
    [presentation, setPresentation] = useState(""),
    [reportFrom, setReportFrom] = useState("");
  const [operationDate, setOperationDate] = useState(today),
    [dueDate, setDueDate] = useState(today),
    [reference, setReference] = useState(""),
    [reason, setReason] = useState("");
  const [kind, setKind] = useState<"invoice" | "credit_note" | "advance">("invoice"),
    [documentAmount, setDocumentAmount] = useState(""),
    [taxAmount, setTaxAmount] = useState("0"),
    [taxAccount, setTaxAccount] = useState("");
  const [settlementTax, setSettlementTax] = useState(""),
    [taxDefinition, setTaxDefinition] = useState(""),
    [taxDefinitions, setTaxDefinitions] = useState<TaxDefinition[]>([]),
    [taxSearch, setTaxSearch] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!activeCompany || !session?.user.permissions.includes("finance.tax.read")) return;
    const timer = setTimeout(
      () =>
        api
          .getTaxes(
            queryString({
              company_id: activeCompany!.id,
              status: "active",
              module: side === "receivable" ? "sales" : "purchases",
              search: taxSearch,
              limit: 100,
            }),
          )
          .then((value) => {
            if (!cancelled) setTaxDefinitions(value.items);
          })
          .catch(() => {
            if (!cancelled) setTaxDefinitions([]);
          }),
      150,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, activeCompany, session, side, taxSearch]);
  function companyTaxContext() {
    return !!activeCompany && !!session?.user.permissions.includes("finance.tax.read");
  }
  const [bankId, setBankId] = useState(""),
    [paymentCurrency, setPaymentCurrency] = useState(""),
    [paymentAmount, setPaymentAmount] = useState("");
  const [bankFee, setBankFee] = useState("0"),
    [dealRate, setDealRate] = useState(""),
    [dealReference, setDealReference] = useState(""),
    [monetary, setMonetary] = useState(true),
    [allocations, setAllocations] = useState<Record<string, string>>({});
  const [partyName, setPartyName] = useState(""),
    [advanceAccount, setAdvanceAccount] = useState(""),
    [sourceSupplier, setSourceSupplier] = useState(""),
    [sourceBill, setSourceBill] = useState("");
  const [sourceGovernedTax, setSourceGovernedTax] = useState(false);
  const [policyValues, setPolicyValues] = useState<Record<string, string>>({});
  const permissions = new Set(session?.user.permissions ?? []);
  const canRead = permissions.has("finance.subledger.read"),
    canManage = permissions.has("finance.subledger.manage"),
    canApprove = permissions.has("finance.subledger.approve"),
    canPost = permissions.has("finance.subledger.post"),
    canReport = permissions.has("finance.subledger.report");
  const company = activeCompany?.id;
  const preparedSource = useRef("");
  const currentScope = useRef("");
  const scopeKey = queryString({
    company_id: company,
    as_of: asOf,
    side,
    party_id: partyId,
    currency,
    offset,
    limit: 50,
  });
  const currentReportScope = useRef("");
  const reportScopeKey = JSON.stringify([company, asOf, side, partyId, currency, reportKind, presentation, reportFrom]);
  const data = loaded?.scope === scopeKey ? loaded.value : null;
  useLayoutEffect(() => {
    currentScope.current = scopeKey;
    currentReportScope.current = reportScopeKey;
  }, [scopeKey, reportScopeKey]);
  const explain = (caught: unknown) =>
    caught instanceof ApiError
      ? `${caught.message}${caught.correlationId ? ` Reference ${caught.correlationId}` : ""}`
      : caught instanceof Error
        ? caught.message
        : "The financial request failed. Refresh before retrying.";

  const load = useCallback(async () => {
    if (!company || !canRead) return;
    const scope = queryString({
      company_id: company,
      as_of: asOf,
      side,
      party_id: partyId,
      currency,
      offset,
      limit: 50,
    });
    const result = await api.getSubledgerWorkspace(scope);
    if (currentScope.current !== scope) return;
    setLoaded({ scope, value: result });
    setPolicyValues(
      Object.fromEntries(
        policyRoles.map((role) => [`${role}_account_id`, result.policy?.[`${role}_account_id`] ?? ""]),
      ),
    );
  }, [api, company, canRead, asOf, side, partyId, currency, offset]);
  useEffect(() => {
    let cancelled = false;
    if (!company || !canRead) return;
    api
      .getSubledgerWorkspace(
        queryString({ company_id: company, as_of: asOf, side, party_id: partyId, currency, offset, limit: 50 }),
      )
      .then((result) => {
        if (!cancelled) {
          setError("");
          setLoaded({
            scope: queryString({
              company_id: company,
              as_of: asOf,
              side,
              party_id: partyId,
              currency,
              offset,
              limit: 50,
            }),
            value: result,
          });
          setPolicyValues(
            Object.fromEntries(
              policyRoles.map((role) => [`${role}_account_id`, result.policy?.[`${role}_account_id`] ?? ""]),
            ),
          );
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(explain(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [api, company, canRead, asOf, side, partyId, currency, offset]);
  useEffect(() => {
    if (!company || !sourceDocumentId || !canManage || preparedSource.current === `${company}:${sourceDocumentId}`)
      return;
    let cancelled = false;
    void (async () => {
      const [bill, current] = await Promise.all([
        api.getPurchaseDocument(sourceDocumentId, company),
        api.getSubledgerWorkspace(queryString({ company_id: company, as_of: today(), limit: 50 })),
      ]);
      if (bill.kind !== "bill" || bill.state !== "approved" || !bill.supplier_id || !bill.supplier_name)
        throw new Error("Select an approved bill with an active supplier.");
      const existing = current.parties.find((party) => party.source_supplier_id === bill.supplier_id);
      const party =
        existing ??
        (await api.createSubledgerParty(
          {
            company_id: company,
            kind: "supplier",
            name: bill.supplier_name,
            default_currency: bill.currency,
            source_supplier_id: bill.supplier_id,
          },
          csrfToken(),
          `adopt-supplier:${company}:${bill.supplier_id}`,
        ));
      const scale = current.currencies.find((item) => item.code === bill.currency)?.decimal_places;
      if (scale === undefined) throw new Error("Activate the bill's currency for this company first.");
      // Purchase totals round each line's net to its two-decimal source precision.
      const netAtStorageScale =
        bill.lines.reduce(
          (sum, line) => sum + divideRounded(decimal(line.quantity, 4) * decimal(line.unit_price, 2), 10000n),
          0n,
        ) * 1000000n;
      const grossAtStorageScale = decimal(bill.total_amount, 8);
      const currencyUnit = 10n ** BigInt(8 - scale);
      if (grossAtStorageScale % currencyUnit !== 0n || netAtStorageScale % currencyUnit !== 0n)
        throw new Error(
          "The source bill exceeds the currency's supported precision. Correct the source bill before posting.",
        );
      const gross = grossAtStorageScale / currencyUnit;
      const net = netAtStorageScale / currencyUnit;
      if (cancelled) return;
      preparedSource.current = `${company}:${sourceDocumentId}`;
      setSide("payable");
      setTab("documents");
      setPartyId(party.id);
      setCurrency(bill.currency);
      const governedBill = bill.lines.some((line) => line.tax_definition_id);
      setSourceGovernedTax(governedBill);
      setDocumentAmount(decimalText(governedBill ? net : gross, scale));
      setTaxAmount(decimalText(gross > net ? gross - net : 0n, scale));
      setOperationDate(bill.bill_date ?? bill.document_date);
      setDueDate(bill.due_date ?? bill.document_date);
      setSourceBill(bill.id);
      setReference(bill.reference || bill.code);
      setReason(`Recognize approved supplier bill ${bill.code}`);
      setMessage(
        "Approved bill loaded. Select any required tax account, then save for independent financial approval.",
      );
    })().catch((caught) => {
      if (!cancelled) {
        preparedSource.current = "";
        setError(explain(caught));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, company, sourceDocumentId, canManage, csrfToken]);

  async function perform(work: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await load();
      setMessage(success);
      setAllocations({});
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }
  async function runReport(nextOffset = offset) {
    if (!company || busy) return;
    const scope = currentReportScope.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.getSubledgerReport(
        queryString({
          company_id: company,
          as_of: asOf,
          from: reportFrom,
          ...(["statement", "fx"].includes(reportKind) ? { side, party_id: partyId, currency } : {}),
          report: reportKind,
          presentation_currency: presentation,
          offset: nextOffset,
          limit: 50,
        }),
      );
      if (scope !== currentReportScope.current) return;
      setReport(result);
      setOffset(nextOffset);
      setMessage("Report refreshed from posted records.");
    } catch (caught) {
      if (scope === currentReportScope.current) setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }
  async function create(type: "recognition" | "settlement" | "offset" | "revaluation") {
    if (!company) return;
    const common = { company_id: company, date: operationDate, reason, reference };
    const alloc = Object.entries(allocations)
      .filter(([, value]) => value && !/^0(?:\.0*)?$/.test(value))
      .map(([item_id, amount]) => ({ item_id, amount }));
    let input: SubledgerInput;
    if (type === "recognition")
      input = {
        ...common,
        type,
        side,
        party_id: partyId,
        kind,
        currency,
        amount: documentAmount,
        due_date: dueDate,
        monetary,
        ...(kind !== "advance"
          ? sourceGovernedTax
            ? {}
            : taxDefinition
              ? { tax_definition_id: taxDefinition }
              : { tax_amount: taxAmount, ...(taxAccount ? { tax_account_id: taxAccount } : {}) }
          : {}),
        ...(!monetary && kind === "advance" ? { counter_account_id: advanceAccount } : {}),
        ...(kind === "advance" ? { bank_account_id: bankId } : {}),
        ...(sourceBill ? { source_document_id: sourceBill } : {}),
      };
    else if (type === "settlement")
      input = {
        ...common,
        type,
        side,
        party_id: partyId,
        bank_account_id: bankId,
        payment_currency: paymentCurrency,
        payment_amount: paymentAmount,
        ...(settlementTax ? { tax_definition_id: settlementTax } : {}),
        bank_fee: bankFee,
        ...(dealRate ? { conversion_rate: dealRate, conversion_reference: dealReference } : {}),
        allocations: alloc,
      };
    else if (type === "offset") input = { ...common, type, side, party_id: partyId, allocations: alloc };
    else input = { ...common, type, side, currency, ...(partyId ? { party_id: partyId } : {}) };
    await perform(
      () => api.createSubledgerOperation(input, csrfToken(), crypto.randomUUID()),
      "Draft saved. Review the calculated posting, then submit for independent approval.",
    );
  }
  const currencyOptions = (
    <>
      <option value="">Choose currency</option>
      {data?.currencies.map((item) => (
        <option key={item.code} value={item.code}>
          {item.code} · {item.decimal_places} decimal places
        </option>
      ))}
    </>
  );
  const partyOptions = (
    <>
      <option value="">All / choose {side === "receivable" ? "customer" : "supplier"}</option>
      {data?.parties
        .filter((party) => party.kind === (side === "receivable" ? "customer" : "supplier"))
        .map((party) => (
          <option key={party.id} value={party.id}>
            {party.code} · {party.name}
          </option>
        ))}
    </>
  );
  const bankOptions = (
    <>
      <option value="">Choose bank account</option>
      {data?.banks.map((bank) => (
        <option key={bank.id} value={bank.id}>
          {bank.name} · {bank.currency}
        </option>
      ))}
    </>
  );
  const commonFields = (
    <>
      <Field label="Posting date">
        <Input type="date" value={operationDate} onChange={(event) => setOperationDate(event.target.value)} required />
      </Field>
      <Field label="Reference">
        <Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={160} />
      </Field>
      <Field label="Reason">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          minLength={3}
          maxLength={500}
        />
      </Field>
    </>
  );
  if (!company)
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-muted-foreground">
        Choose a company at sign-in to open its currency accounts.
      </div>
    );
  if (!canRead)
    return (
      <div role="alert" className="rounded-lg border border-border bg-card p-5">
        Company currency accounting requires the subledger read permission. Ask your administrator to assign the
        appropriate company-scoped role.
      </div>
    );
  return (
    <section className="grid min-w-0 gap-4 text-foreground" aria-label="Multi-currency accounting">
      <header
        className={
          embedded ? "flex justify-end" : "flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"
        }
      >
        {!embedded && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Finance · {activeCompany?.name}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Multi-currency accounting</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Original currency balances, posted carrying values and auditable exchange movements.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Badge variant="outline">{data?.base_currency ?? "—"} functional currency</Badge>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void perform(load, "Balances refreshed.")}
          >
            Refresh
          </Button>
        </div>
      </header>
      <nav className="flex flex-wrap gap-1" aria-label="Currency accounting sections">
        {(Object.keys(titles) as Tab[]).map((key) => (
          <Button
            type="button"
            key={key}
            variant={tab === key ? "default" : "outline"}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setOffset(0);
              setReport(null);
            }}
          >
            {titles[key]}
          </Button>
        ))}
      </nav>
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ledger">
          <select
            className={workSelectClass}
            value={side}
            onChange={(event) => {
              setSide(event.target.value === "payable" ? "payable" : "receivable");
              setPartyId("");
              setCurrency("");
              setAllocations({});
              setBankId("");
              setOffset(0);
              setReport(null);
            }}
          >
            <option value="receivable">Customer receivables</option>
            <option value="payable">Supplier payables</option>
          </select>
        </Field>
        <Field label="Customer / supplier">
          <select
            className={workSelectClass}
            value={partyId}
            onChange={(event) => {
              setPartyId(event.target.value);
              setAllocations({});
              setOffset(0);
              setReport(null);
            }}
          >
            {partyOptions}
          </select>
        </Field>
        <Field label="Original currency">
          <select
            className={workSelectClass}
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value);
              setOffset(0);
              setReport(null);
            }}
          >
            {currencyOptions}
          </select>
        </Field>
        <Field label="Balances as of">
          <Input
            type="date"
            value={asOf}
            onChange={(event) => {
              setAsOf(event.target.value);
              setOffset(0);
              setReport(null);
            }}
          />
        </Field>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">
          {message}
        </div>
      )}
      {!data && !error && (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          Loading company currency balances…
        </p>
      )}
      {data && (
        <>
          {tab === "balances" && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Posted open-item carrying value</p>
                  <p className="mt-2 text-lg font-semibold">
                    <Money currency={data.base_currency} value={data.carrying_total} />
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Currency balances</p>
                  <p className="mt-2 text-lg font-semibold">{data.total_balances}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Recognized unrealized movement</p>
                  <p className="mt-2 text-lg font-semibold">
                    <Money currency={data.base_currency} value={data.unrealized_total} />
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <WorkTable tableId="multi-currency-balances">
                  <caption className="p-3 text-left font-semibold">
                    Balances and ageing in each original currency
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Party",
                        "Currency",
                        "Outstanding",
                        `Carrying ${data.base_currency}`,
                        "Current",
                        "1–30 days",
                        "31–60 days",
                        "61–90 days",
                        "Over 90 days",
                      ].map((label) => (
                        <th key={label} className="whitespace-nowrap p-3 text-left text-xs">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.balances.map((row) => (
                      <tr key={`${row.party_id}-${row.currency}`} className="border-t border-border">
                        <td className="p-3">{row.party_name}</td>
                        <td className="p-3 font-mono">{row.currency}</td>
                        <td className="p-3">
                          <Money currency={row.currency} value={row.outstanding} />
                        </td>
                        <td className="p-3">
                          <Money currency={row.base_currency} value={row.carrying} />
                        </td>
                        {[row.current, row.days_1_30, row.days_31_60, row.days_61_90, row.days_over_90].map(
                          (value, i) => (
                            <td key={`ageing-${i}`} className="p-3">
                              <Money currency={row.currency} value={value} />
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </WorkTable>
                {!data.balances.length && (
                  <p className="p-5 text-sm text-muted-foreground">
                    No posted balances match these filters. Add a party, configure the accounts, and post an
                    independently approved invoice.
                  </p>
                )}
              </div>
            </>
          )}
          {tab === "documents" && (
            <form
              className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                void create("recognition");
              }}
            >
              <h2 className="col-span-full text-base font-semibold">
                Recognize an invoice, credit or classified advance
              </h2>
              <Field label="Document kind">
                <select
                  className={workSelectClass}
                  value={kind}
                  onChange={(event) =>
                    setKind(
                      event.target.value === "advance"
                        ? "advance"
                        : event.target.value === "credit_note"
                          ? "credit_note"
                          : "invoice",
                    )
                  }
                >
                  <option value="invoice">{side === "receivable" ? "Customer invoice" : "Supplier bill"}</option>
                  <option value="credit_note">Credit note / refund obligation</option>
                  <option value="advance">On-account receipt / prepayment</option>
                </select>
              </Field>
              <Field
                label={taxDefinition || sourceGovernedTax ? "Taxable amount before tax" : "Amount in original currency"}
              >
                <Input
                  inputMode="decimal"
                  value={documentAmount}
                  onChange={(event) => setDocumentAmount(event.target.value)}
                  required
                />
              </Field>
              <Field label="Due date">
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
              </Field>
              {kind !== "advance" && (
                <>
                  {companyTaxContext() && !sourceGovernedTax && (
                    <>
                      <Field label="Search governed taxes">
                        <Input
                          value={taxSearch}
                          onChange={(e) => setTaxSearch(e.target.value)}
                          placeholder="Search tax name or code"
                        />
                      </Field>
                      <Field label="Tax definition">
                        <select
                          className={workSelectClass}
                          value={taxDefinition}
                          onChange={(e) => {
                            setTaxDefinition(e.target.value);
                            if (sourceBill && e.target.value && !taxDefinition) {
                              const scale = data?.currencies.find((c) => c.code === currency)?.decimal_places ?? 2;
                              setDocumentAmount(
                                decimalText(decimal(documentAmount, scale) - decimal(taxAmount, scale), scale),
                              );
                            } else if (sourceBill && taxDefinition && !e.target.value) {
                              const scale = data?.currencies.find((c) => c.code === currency)?.decimal_places ?? 2;
                              setDocumentAmount(
                                decimalText(decimal(documentAmount, scale) + decimal(taxAmount, scale), scale),
                              );
                            }
                          }}
                        >
                          <option value="">Manual tax (legacy)</option>
                          {taxDefinitions
                            .filter((t) => t.trigger === "recognition")
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.code} / {t.name} / {t.rate}%
                              </option>
                            ))}
                        </select>
                      </Field>
                      {taxDefinition && (
                        <p className="text-sm text-muted-foreground md:col-span-2">
                          Enter the taxable amount before tax. The server calculates the tax, nominal posting and
                          resulting document balance.
                        </p>
                      )}
                    </>
                  )}
                  {!taxDefinition && !sourceGovernedTax && (
                    <>
                      <Field label="Tax included in the total">
                        <Input
                          inputMode="decimal"
                          value={taxAmount}
                          onChange={(event) => setTaxAmount(event.target.value)}
                        />
                      </Field>
                      {!/^0(?:\.0*)?$/.test(taxAmount) && (
                        <Field label="Tax control account">
                          <select
                            className={workSelectClass}
                            value={taxAccount}
                            onChange={(event) => setTaxAccount(event.target.value)}
                            required
                          >
                            <option value="">Choose tax control</option>
                            {data.accounts
                              .filter((account) => account.type === (side === "receivable" ? "liability" : "asset"))
                              .map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.code} · {account.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                      )}
                    </>
                  )}
                </>
              )}
              {commonFields}
              {side === "payable" && (
                <Field label="Approved procurement bill ID (optional)">
                  <Input value={sourceBill} onChange={(event) => setSourceBill(event.target.value)} />
                </Field>
              )}
              {kind === "advance" && (
                <>
                  <Field label="Bank account">
                    <select
                      className={workSelectClass}
                      value={bankId}
                      onChange={(event) => setBankId(event.target.value)}
                      required
                    >
                      {bankOptions}
                    </select>
                  </Field>
                  <label htmlFor="advance-monetary" className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id="advance-monetary"
                      checked={monetary}
                      onCheckedChange={(checked) => setMonetary(checked === true)}
                    />
                    Refundable monetary deposit (eligible for FX valuation)
                  </label>
                  {!monetary && (
                    <Field label="Nonmonetary advance control account">
                      <select
                        className={workSelectClass}
                        value={advanceAccount}
                        onChange={(event) => setAdvanceAccount(event.target.value)}
                        required
                      >
                        <option value="">Choose deferred-income / prepayment account</option>
                        {data.accounts
                          .filter((account) => account.type === (side === "receivable" ? "liability" : "asset"))
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} · {account.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                </>
              )}
              <p className="col-span-full text-sm text-muted-foreground">
                Select the party and original currency above. Exchange rates come from the company’s governed rates for
                the posting date. Saving creates a draft; approval and posting are separate.
              </p>
              <Button type="submit" disabled={busy || !canManage || !partyId || !currency || !data.policy}>
                Save financial draft
              </Button>
            </form>
          )}
          {tab === "settlement" && (
            <>
              <form
                className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void create("settlement");
                }}
              >
                <h2 className="col-span-full text-base font-semibold">Allocate a receipt or payment</h2>
                {commonFields}
                <Field label="Payment currency">
                  <select
                    className={workSelectClass}
                    value={paymentCurrency}
                    onChange={(event) => setPaymentCurrency(event.target.value)}
                    required
                  >
                    {currencyOptions}
                  </select>
                </Field>
                <Field label="Bank account">
                  <select
                    className={workSelectClass}
                    value={bankId}
                    onChange={(event) => setBankId(event.target.value)}
                    required
                  >
                    {bankOptions}
                  </select>
                </Field>
                <Field label="Payment amount before bank fee">
                  <Input
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    required
                  />
                </Field>
                {side === "payable" && companyTaxContext() && (
                  <Field label="Supplier withholding definition">
                    <select
                      className={workSelectClass}
                      value={settlementTax}
                      onChange={(e) => setSettlementTax(e.target.value)}
                    >
                      <option value="">No governed withholding</option>
                      {taxDefinitions
                        .filter((t) => t.trigger === "settlement")
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code} / {t.name} / {t.rate}%
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <Field label="Bank fee in payment currency">
                  <Input
                    inputMode="decimal"
                    value={bankFee}
                    onChange={(event) => setBankFee(event.target.value)}
                    required
                  />
                </Field>
                {paymentCurrency && paymentCurrency !== currency && (
                  <>
                    <Field label="Bank deal rate (optional, payment units per invoice unit)">
                      <Input
                        inputMode="decimal"
                        value={dealRate}
                        onChange={(event) => setDealRate(event.target.value)}
                      />
                    </Field>
                    {dealRate && (
                      <Field label="Bank conversion evidence reference">
                        <Input
                          value={dealReference}
                          onChange={(event) => setDealReference(event.target.value)}
                          required
                          minLength={3}
                        />
                      </Field>
                    )}
                  </>
                )}
                <p className="col-span-full text-sm text-muted-foreground">
                  Enter amounts cleared in each invoice’s own currency below. The payment must agree with those
                  allocations at the company’s effective cross-currency rates. FX and bank fees are posted separately.
                </p>
                <div className="col-span-full flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy || !canManage || !partyId}>
                    Save settlement draft
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !canManage || !partyId}
                    onClick={() => void create("offset")}
                  >
                    Save credit offset draft
                  </Button>
                </div>
              </form>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <WorkTable tableId="multi-currency-allocation" paging={false}>
                  <caption className="p-3 text-left font-semibold">
                    Open items · amounts cleared in original currency
                  </caption>
                  <thead>
                    <tr>
                      {["Document", "Party", "Currency", "Outstanding", "Carrying", "Allocate"].map((label) => (
                        <th key={label} className="p-3 text-left">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items
                      .filter((item) => !/^0(?:\.0*)?$/.test(item.outstanding))
                      .map((item) => (
                        <tr key={item.id} className="border-t border-border">
                          <td className="p-3 font-mono">{item.code}</td>
                          <td className="p-3">{item.party_name}</td>
                          <td className="p-3">{item.currency}</td>
                          <td className="p-3">
                            <Money currency={item.currency} value={item.outstanding} />
                          </td>
                          <td className="p-3">
                            <Money currency={item.base_currency} value={item.carrying} />
                          </td>
                          <td className="min-w-36 p-3">
                            <Input
                              aria-label={`Allocate ${item.code}`}
                              inputMode="decimal"
                              disabled={!partyId || busy}
                              value={allocations[item.id] ?? ""}
                              onChange={(event) =>
                                setAllocations((previous) => ({ ...previous, [item.id]: event.target.value }))
                              }
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </WorkTable>
              </div>
            </>
          )}
          {tab === "revaluation" && (
            <form
              className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                void create("revaluation");
              }}
            >
              <h2 className="col-span-full text-base font-semibold">Revalue outstanding monetary balances</h2>
              {commonFields}
              <p className="col-span-full text-sm text-muted-foreground">
                Uses the selected foreign currency and optional party filter. Only remaining monetary balances
                participate. The draft records the closing rates and carrying values; changed evidence requires fresh
                approval. Posted adjustments remain in carrying value until settlement, another valuation or a governed
                reversal.
              </p>
              <Button type="submit" disabled={busy || !canManage || !currency || currency === data.base_currency}>
                Calculate valuation draft
              </Button>
            </form>
          )}
          {tab === "reports" && (
            <>
              <form
                className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runReport(0);
                }}
              >
                <Field label="Report">
                  <select
                    className={workSelectClass}
                    value={reportKind}
                    onChange={(event) => {
                      setReportKind(event.target.value);
                      setOffset(0);
                      setReport(null);
                    }}
                  >
                    <option value="statement">Party statement</option>
                    <option value="fx">Currency movements</option>
                    <option value="trial_balance">Trial balance</option>
                    <option value="general_ledger">General ledger</option>
                    <option value="profit_loss">Profit and loss</option>
                    <option value="balance_sheet">Balance sheet</option>
                  </select>
                </Field>
                {!["statement", "fx"].includes(reportKind) && (
                  <p className="text-sm text-muted-foreground md:col-span-3">
                    This company report includes all parties and original currencies. Party and currency filters apply
                    to statements and currency movements.
                  </p>
                )}
                <Field label="Presentation currency">
                  <select
                    className={workSelectClass}
                    value={presentation}
                    onChange={(event) => {
                      setPresentation(event.target.value);
                      setReport(null);
                    }}
                  >
                    <option value="">Functional currency · {data.base_currency}</option>
                    {data.currencies.map((item) => (
                      <option key={item.code}>{item.code}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Report from (optional)">
                  <Input
                    type="date"
                    value={reportFrom}
                    onChange={(event) => {
                      setReportFrom(event.target.value);
                      setReport(null);
                    }}
                  />
                </Field>
                <Button type="submit" className="self-end" disabled={busy || !canReport}>
                  Run posted report
                </Button>
              </form>
              {report && (
                <div className="grid gap-3 rounded-lg border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">{report.translation_method}</p>
                  <div className="flex flex-wrap gap-4">
                    <span>
                      Debit <Money currency={report.base_currency} value={report.debit} />
                    </span>
                    <span>
                      Credit <Money currency={report.base_currency} value={report.credit} />
                    </span>
                    <span>
                      Presented total{" "}
                      <Money currency={report.presentation_currency} value={report.presentation_balance} />
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <WorkTable tableId="multi-currency-report" paging={false}>
                      <thead>
                        <tr>
                          {[
                            "Date",
                            "Code",
                            "Account / party",
                            "Original movement",
                            "Functional balance",
                            "Presented balance",
                          ].map((label) => (
                            <th key={label} className="p-3 text-left">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.map((row) => (
                          <tr key={row.id} className="border-t border-border">
                            <td className="whitespace-nowrap p-3">{row.date ?? "—"}</td>
                            <td className="p-3 font-mono">{row.code}</td>
                            <td className="p-3">{row.name}</td>
                            <td className="p-3">
                              <Money currency={row.currency} value={row.original} />
                            </td>
                            <td className="p-3">
                              <Money currency={report.base_currency} value={row.balance} />
                            </td>
                            <td className="p-3">
                              <Money currency={report.presentation_currency} value={row.presentation_balance} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </WorkTable>
                  </div>
                  {report.reconciliation.map((row) => (
                    <p
                      key={row.account_id}
                      className={
                        /^0(?:\.0*)?$/.test(row.difference)
                          ? "text-sm text-muted-foreground"
                          : "text-sm text-destructive"
                      }
                    >
                      Control reconciliation · <Money currency={report.base_currency} value={row.ledger_balance} /> GL /{" "}
                      <Money currency={report.base_currency} value={row.subledger_balance} /> subledger · difference{" "}
                      <Money currency={report.base_currency} value={row.difference} />
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "setup" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <form
                className="grid content-start gap-3 rounded-lg border border-border bg-card p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (company)
                    void perform(
                      () =>
                        api.createSubledgerParty(
                          {
                            company_id: company,
                            name: partyName,
                            kind: side === "receivable" ? "customer" : "supplier",
                            default_currency: currency,
                            ...(sourceSupplier ? { source_supplier_id: sourceSupplier } : {}),
                          },
                          csrfToken(),
                          crypto.randomUUID(),
                        ),
                      "Persistent party created with an automatically reserved code.",
                    );
                }}
              >
                <h2 className="font-semibold">Add a financial {side === "receivable" ? "customer" : "supplier"}</h2>
                <Field label="Name">
                  <Input
                    value={partyName}
                    onChange={(event) => setPartyName(event.target.value)}
                    required
                    maxLength={200}
                  />
                </Field>
                <p className="text-sm text-muted-foreground">
                  The original currency above becomes the default for new documents. This party can transact in every
                  active company currency.
                </p>
                {side === "payable" && (
                  <Field label="Existing supplier ID (optional)">
                    <Input value={sourceSupplier} onChange={(event) => setSourceSupplier(event.target.value)} />
                  </Field>
                )}
                <Button type="submit" disabled={busy || !canManage || !currency}>
                  Create financial party
                </Button>
              </form>
              <form
                className="grid gap-3 rounded-lg border border-border bg-card p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!company) return;
                  const input: SubledgerPolicyInput = {
                    company_id: company,
                    expected_version: data.policy?.version ?? 0,
                    receivable_account_id: policyValues.receivable_account_id ?? "",
                    payable_account_id: policyValues.payable_account_id ?? "",
                    revenue_account_id: policyValues.revenue_account_id ?? "",
                    expense_account_id: policyValues.expense_account_id ?? "",
                    realized_gain_account_id: policyValues.realized_gain_account_id ?? "",
                    realized_loss_account_id: policyValues.realized_loss_account_id ?? "",
                    unrealized_gain_account_id: policyValues.unrealized_gain_account_id ?? "",
                    unrealized_loss_account_id: policyValues.unrealized_loss_account_id ?? "",
                  };
                  void perform(
                    () => api.configureSubledgerPolicy(input, csrfToken(), crypto.randomUUID()),
                    "Versioned accounting policy saved.",
                  );
                }}
              >
                <h2 className="font-semibold">Control and exchange accounts · version {data.policy?.version ?? 0}</h2>
                {policyRoles.map((role) => (
                  <Field key={role} label={role.replaceAll("_", " ")}>
                    <select
                      className={workSelectClass}
                      value={policyValues[`${role}_account_id`] ?? ""}
                      onChange={(event) =>
                        setPolicyValues((previous) => ({ ...previous, [`${role}_account_id`]: event.target.value }))
                      }
                      required
                    >
                      <option value="">Choose posting account</option>
                      {data.accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
                <Button type="submit" disabled={busy || !canManage}>
                  Save accounting policy
                </Button>
              </form>
            </div>
          )}
          {!["reports", "setup"].includes(tab) && (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <WorkTable tableId="multi-currency-operations" paging={false}>
                <caption className="p-3 text-left font-semibold">Financial drafts and posting history</caption>
                <thead>
                  <tr>
                    {["Code", "Date", "Type", "State", "Maker / approver", "Journal", "Actions"].map((label) => (
                      <th key={label} className="p-3 text-left">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.operations.map((operation) => (
                    <OperationRow
                      key={operation.id}
                      operation={operation}
                      busy={busy}
                      canManage={canManage}
                      canApprove={canApprove}
                      canPost={canPost}
                      actor={session?.user.id ?? ""}
                      act={(action) =>
                        void perform(
                          () =>
                            api.actOnSubledgerOperation(
                              operation.id,
                              {
                                company_id: company,
                                expected_version: operation.version,
                                action,
                                reason: reason || "Reviewed financial operation",
                              },
                              csrfToken(),
                              crypto.randomUUID(),
                            ),
                          `Operation ${action} completed.`,
                        )
                      }
                      reverse={() =>
                        void perform(
                          () =>
                            api.createSubledgerOperation(
                              {
                                company_id: company,
                                type: "reversal",
                                operation_id: operation.id,
                                date: operationDate,
                                reference,
                                reason,
                              },
                              csrfToken(),
                              crypto.randomUUID(),
                            ),
                          "Compensating reversal draft prepared; independent approval is required.",
                        )
                      }
                    />
                  ))}
                </tbody>
              </WorkTable>
              {!data.operations.length && (
                <p className="p-4 text-sm text-muted-foreground">
                  No financial operations have been created for this reporting date.
                </p>
              )}
            </div>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Page {Math.floor(offset / 50) + 1} · {tab === "reports" && report ? report.total_rows : data.total_items}{" "}
              items / {data.total_operations} operations · totals cover the full filter
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || offset === 0}
                onClick={() => {
                  if (tab === "reports") void runReport(Math.max(0, offset - 50));
                  else setOffset(Math.max(0, offset - 50));
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  busy ||
                  offset + 50 >=
                    (tab === "reports"
                      ? (report?.total_rows ?? 0)
                      : Math.max(data.total_items, data.total_operations, data.total_balances))
                }
                onClick={() => {
                  if (tab === "reports") void runReport(offset + 50);
                  else setOffset(offset + 50);
                }}
              >
                Next
              </Button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

function OperationRow({
  operation,
  busy,
  canManage,
  canApprove,
  canPost,
  actor,
  act,
  reverse,
}: {
  operation: SubledgerOperation;
  busy: boolean;
  canManage: boolean;
  canApprove: boolean;
  canPost: boolean;
  actor: string;
  act: (action: "submit" | "approve" | "reject" | "post") => void;
  reverse: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="border-t border-border">
        <td className="p-3">
          <Button
            type="button"
            variant="link"
            className="font-mono"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {operation.code}
          </Button>
        </td>
        <td className="whitespace-nowrap p-3">{operation.date}</td>
        <td className="p-3">{operation.type}</td>
        <td className="p-3">
          <Badge variant="outline">{operation.state}</Badge>
        </td>
        <td className="p-3 text-xs">
          {operation.maker_id}
          <br />
          {operation.approver_id ?? "Awaiting independent review"}
        </td>
        <td className="p-3 text-xs">{operation.journal_id ?? "Unposted"}</td>
        <td className="p-3">
          <div className="flex flex-wrap gap-1">
            {["draft", "rejected"].includes(operation.state) && canManage && actor === operation.maker_id && (
              <Button type="button" size="sm" disabled={busy} onClick={() => act("submit")}>
                Submit
              </Button>
            )}
            {["submitted", "approved"].includes(operation.state) && canApprove && actor !== operation.maker_id && (
              <>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => act("reject")}>
                  Reject
                </Button>
                {operation.state === "submitted" && (
                  <Button type="button" size="sm" disabled={busy} onClick={() => act("approve")}>
                    Approve
                  </Button>
                )}
              </>
            )}
            {operation.state === "approved" && canPost && (
              <Button type="button" size="sm" disabled={busy} onClick={() => act("post")}>
                Post
              </Button>
            )}
            {operation.state === "posted" && operation.type !== "reversal" && canManage && (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={reverse}>
                Prepare reversal
              </Button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-muted p-4">
            <p className="mb-2 text-sm font-medium">
              {operation.input.reason} · {operation.input.reference || "No external reference"}
            </p>
            {operation.preview && (
              <>
                <div className="mb-3 flex flex-wrap gap-4 text-sm">
                  <span>
                    Realized FX{" "}
                    <Money currency={operation.preview.base_currency} value={operation.preview.realized_gain} />
                  </span>
                  <span>
                    Unrealized FX{" "}
                    <Money currency={operation.preview.base_currency} value={operation.preview.unrealized_gain} />
                  </span>
                  <span>Accounting policy version {operation.preview.policy_version}</span>
                  {operation.preview.taxes.map((tax, index) => (
                    <span key={`${tax.definition_id}:${index}`}>
                      {tax.code} / revision {tax.revision} / {tax.rate}% on{" "}
                      <Money currency={tax.currency} value={tax.basis} /> ={" "}
                      <Money currency={tax.currency} value={tax.amount} /> / {tax.treatment}
                    </span>
                  ))}
                  <span>
                    Conversion rounding{" "}
                    <Money currency={operation.preview.base_currency} value={operation.preview.rounding} />
                  </span>
                  {operation.input.type === "settlement" && operation.input.conversion_rate && (
                    <span>
                      Bank deal {operation.input.conversion_rate} {operation.input.payment_currency} per invoice unit ·{" "}
                      {operation.input.conversion_reference}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <caption className="mb-2 text-left font-semibold">Posting lines and exchange-rate evidence</caption>
                    <thead>
                      <tr>
                        <th className="p-2">Description</th>
                        <th className="p-2">Debit</th>
                        <th className="p-2">Credit</th>
                        <th className="p-2">Functional units per original unit</th>
                        <th className="p-2">Rate date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operation.preview.lines.map((line, index) => (
                        <tr key={index} className="border-t border-border">
                          <td className="p-2">{line.description}</td>
                          <td className="p-2">
                            <Money currency={line.currency} value={line.debit} />
                          </td>
                          <td className="p-2">
                            <Money currency={line.currency} value={line.credit} />
                          </td>
                          <td className="p-2 font-mono">{line.exchangeRateValue}</td>
                          <td className="p-2">{line.exchangeRateDate ?? "Functional currency"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
