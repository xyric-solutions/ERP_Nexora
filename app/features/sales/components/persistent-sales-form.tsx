"use client";
import { useEffect, useRef, useState, useId } from "react";
import {
  salesDocumentInputSchema,
  billPaymentTerms,
  billPaymentTermSchema,
  financialPaymentSchedule,
  salesAmounts,
  type SalesDocumentInput,
  type SalesDetail,
  type SalesKind,
  type SalesLineInput,
  type ProductUnits,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { WorkForm } from "@/shared/ui/work-form";
import { WorkTable } from "@/shared/ui/work-table";
import { Card, Field, PageHead, ReadField, EntryTabs, EntryActionBar, selectClass, TotalsSummary } from "./sales-ui";
import { useDiscardGuard, useIsDirty } from "./discard-guard";
import { PersistentSalesLookup, type SalesChoice } from "./persistent-sales-lookup";
import { editSales, salesToday, salesLabels, salesError, salesMoney } from "../model/persistent-sales";

type Line = {
  key: string;
  input: SalesLineInput;
  charge: boolean;
  productLabel: string;
  unitLabel: string;
  taxLabel: string;
};
const emptyLine = (charge = false): Line => ({
  key: crypto.randomUUID(),
  charge,
  productLabel: "",
  unitLabel: "",
  taxLabel: "",
  input: {
    product_id: null,
    source_line_id: null,
    template_line_id: null,
    description: "",
    quantity: "1",
    unit_price: "",
    discount_amount: "0",
    tax_definition_id: null,
    dimensions: {},
  },
});
function blank(company: string, kind: SalesKind): SalesDocumentInput {
  return {
    company_id: company,
    kind,
    customer_id: null,
    source_id: null,
    template_id: null,
    billing_period: null,
    document_date: salesToday(),
    due_date: null,
    valid_until: null,
    currency: "",
    project_id: "",
    location_id: "",
    warehouse_id: null,
    approver_id: null,
    payment_term: null,
    reference: "",
    notes: "",
    no_tax_reason: "",
    discount_amount: "0",
    recurrence: null,
    lines: [],
  };
}
export function PersistentSalesForm({
  company,
  kind,
  initial,
  existing,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  company: string;
  kind: SalesKind;
  initial?: SalesDocumentInput;
  existing?: SalesDetail;
  onSaved: (detail: SalesDetail) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, csrfToken, session } = useSession();
  const enabledId = useId();
  const [draft, setDraft] = useState(() => initial ?? (existing ? editSales(existing.record) : blank(company, kind)));
  const [lines, setLines] = useState<Line[]>(() =>
    draft.lines.length
      ? draft.lines.map((input, index) => ({
          key: crypto.randomUUID(),
          input,
          charge: !input.product_id,
          productLabel: existing?.record.lines[index]?.product_name ?? input.description,
          unitLabel: existing?.record.lines[index]?.unit ?? "",
          taxLabel: existing?.record.lines[index]?.tax_snapshot?.name ?? "",
        }))
      : [emptyLine()],
  );
  const [labels, setLabels] = useState<Record<string, string>>(() => ({
    customer: existing?.record.customer_name ?? "",
    project: existing?.record.project_name ?? "",
    location: existing?.record.location_name ?? "",
    warehouse: existing?.record.warehouse_name ?? "",
    approver: existing?.record.approver_name ?? "",
  }));
  const [precision, setPrecision] = useState<number | undefined>(existing?.record.decimal_places);
  const [frequency, setFrequency] = useState<string>(draft.recurrence?.frequency ?? ""),
    [start, setStart] = useState(draft.recurrence?.start_date ?? draft.document_date),
    [end, setEnd] = useState(draft.recurrence?.end_date ?? "");
  const [enabled, setEnabled] = useState(draft.recurrence?.enabled ?? false),
    [customers, setCustomers] = useState(draft.recurrence?.customer_ids ?? []),
    [customerNames, setCustomerNames] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        (existing?.record.recurring_customers ?? []).map((customer) => [
          customer.id,
          `${customer.code} · ${customer.name}`,
        ]),
      ),
    );
  const [tab, setTab] = useState<"lines" | "other">("lines"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    retry = useRef<{ body: string; key: string } | null>(null);
  const dirty = useIsDirty({ draft, lines, frequency, start, end, enabled, customers });
  const { guard, dialog } = useDiscardGuard(dirty);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  const update = (patch: Partial<SalesDocumentInput>) => setDraft((current) => ({ ...current, ...patch }));
  const named = (field: string, choice: SalesChoice | null) =>
    setLabels((current) => ({ ...current, [field]: choice ? `${choice.code} · ${choice.name}` : "" }));
  const updateLine = (key: string, change: (line: Line) => Line) =>
    setLines((current) => current.map((line) => (line.key === key ? change(line) : line)));
  const sourceLocked = !!draft.source_id;
  let due = draft.due_date ?? "";
  if (draft.payment_term && draft.document_date) {
    try {
      due = financialPaymentSchedule(draft.document_date, draft.payment_term, "0", 0).at(-1)!.due_date;
    } catch {
      due = "";
    }
  }
  let net: string | undefined;
  try {
    if (precision !== undefined)
      net = salesAmounts(
        lines.map((line) => line.input),
        precision,
        draft.discount_amount,
      ).net;
  } catch {
    /* Incomplete editable values are validated on Save. */
  }
  async function save() {
    if (lock.current) return;
    setError("");
    if (draft.approver_id && draft.approver_id === (existing?.record.maker_id ?? session?.user.id)) {
      setError(
        "You cannot select the creator as an independent reviewer. Choose Creator approval (no reviewer) in the Approver field, or select another eligible reviewer.",
      );
      return;
    }
    if (lines.some((line) => !line.charge && !line.input.product_id)) {
      setError("Choose the actual product/service for every item line, or add an explicit other charge.");
      return;
    }
    const parsed = salesDocumentInputSchema.safeParse({
      ...draft,
      lines: lines.map((line) => line.input),
      ...(kind === "recurring"
        ? { recurrence: { enabled, frequency, start_date: start, end_date: end || null, customer_ids: customers } }
        : {}),
      ...(existing ? { expected_version: existing.record.version } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" "));
      return;
    }
    lock.current = true;
    setBusy(true);
    const body = JSON.stringify({ id: existing?.record.id, input: parsed.data });
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    try {
      const result = existing
        ? await api.updateSalesDocument(
            existing.record.id,
            { ...parsed.data, expected_version: existing.record.version },
            csrfToken(),
            retry.current.key,
          )
        : await api.createSalesDocument(parsed.data, csrfToken(), retry.current.key);
      onDirtyChange?.(false);
      window.dispatchEvent(new Event("nexora:sales-changed"));
      onSaved(result);
    } catch (caught) {
      setError(salesError(caught));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <WorkForm
      className="grid gap-3"
      aria-label={`${salesLabels[kind].single} form`}
      aria-busy={busy}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <PageHead
        eyebrow="Sales · Entry"
        title={`${existing ? "Edit" : "New"} ${salesLabels[kind].single.toLowerCase()}`}
      />
      <fieldset disabled={busy} className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <EntryActionBar
          saveLabel={busy ? "Saving…" : "Save"}
          lifecycle={["Draft", "Commercial confirmation", "Accounting review", "Posted"]}
          error={error}
          submit
          onDiscard={() => guard(onCancel)}
        />
        <Card title="Document details" className="rounded-xl">
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
            <ReadField label="Document code">{existing?.record.code ?? "Assigned on save"}</ReadField>
            <Field label="Document date" required>
              <Input
                aria-label="Document date"
                type="date"
                value={draft.document_date}
                onChange={(event) => update({ document_date: event.target.value })}
              />
            </Field>
            {kind !== "recurring" ? (
              <PersistentSalesLookup
                company={company}
                kind="customer"
                label="Customer"
                value={draft.customer_id ?? ""}
                selectedLabel={labels.customer}
                required
                disabled={sourceLocked}
                onChange={(choice) => {
                  named("customer", choice);
                  if (!sourceLocked && choice?.currency && choice.currency !== draft.currency) {
                    setPrecision(undefined);
                    setLines((current) =>
                      current.map((line) => ({ ...line, input: { ...line.input, unit_price: "" } })),
                    );
                  }
                  update({
                    customer_id: choice?.id ?? null,
                    ...(!sourceLocked && choice?.currency ? { currency: choice.currency } : {}),
                    payment_term: choice?.financial_configuration?.payment_term ?? null,
                    due_date: null,
                  });
                }}
              />
            ) : (
              <ReadField label="Billing customers">Select the actual customers below.</ReadField>
            )}
            <PersistentSalesLookup
              company={company}
              kind="currency"
              label="Currency"
              value={draft.currency}
              selectedLabel={draft.currency}
              required
              disabled={sourceLocked}
              onChange={(choice) => {
                update({ currency: choice?.id ?? "" });
                setPrecision(choice?.decimal_places ?? undefined);
                setLines((current) => current.map((line) => ({ ...line, input: { ...line.input, unit_price: "" } })));
              }}
            />
            <PersistentSalesLookup
              company={company}
              kind="project"
              label="Project"
              value={draft.project_id}
              selectedLabel={labels.project}
              required
              onChange={(choice) => {
                named("project", choice);
                update({ project_id: choice?.id ?? "" });
              }}
            />
            <PersistentSalesLookup
              company={company}
              kind="location"
              label="Location"
              value={draft.location_id}
              selectedLabel={labels.location}
              required
              onChange={(choice) => {
                named("location", choice);
                update({ location_id: choice?.id ?? "" });
              }}
            />
            <PersistentSalesLookup
              company={company}
              kind="warehouse"
              label="Warehouse"
              value={draft.warehouse_id ?? ""}
              selectedLabel={labels.warehouse}
              required={kind === "delivery" || kind === "return"}
              onChange={(choice) => {
                named("warehouse", choice);
                update({ warehouse_id: choice?.id ?? null });
              }}
            />
            <Field label="Reference">
              <Input
                aria-label="Reference"
                value={draft.reference}
                maxLength={160}
                onChange={(event) => update({ reference: event.target.value })}
              />
            </Field>
            {kind === "quotation" ? (
              <Field label="Valid until">
                <Input
                  aria-label="Valid until"
                  type="date"
                  value={draft.valid_until ?? ""}
                  onChange={(event) => update({ valid_until: event.target.value || null })}
                />
              </Field>
            ) : null}
            {kind === "invoice" ? (
              <>
                <Field label="Payment terms">
                  <select
                    aria-label="Payment terms"
                    className={selectClass}
                    value={draft.payment_term ?? ""}
                    onChange={(event) =>
                      update({
                        payment_term: event.target.value ? billPaymentTermSchema.parse(event.target.value) : null,
                      })
                    }
                  >
                    <option value="">Manual due date</option>
                    {billPaymentTerms.map((term) => (
                      <option key={term.value} value={term.value}>
                        {term.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Due date">
                  <Input
                    aria-label="Due date"
                    type="date"
                    readOnly={!!draft.payment_term}
                    value={due}
                    onChange={(event) => update({ due_date: event.target.value || null })}
                  />
                </Field>
              </>
            ) : null}
            {["quotation", "recurring"].includes(kind) ? (
              <PersistentSalesLookup
                company={company}
                kind="approver"
                label="Approver (optional)"
                value={draft.approver_id ?? ""}
                selectedLabel={labels.approver}
                onChange={(choice) => {
                  named("approver", choice);
                  update({ approver_id: choice?.id ?? null });
                }}
              />
            ) : null}
          </div>
        </Card>
        {kind === "recurring" ? (
          <Card title="Recurring billing" className="rounded-xl">
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
              <Field label="Frequency" required>
                <select
                  aria-label="Frequency"
                  className={selectClass}
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value)}
                >
                  <option value="">Choose frequency</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Annually</option>
                </select>
              </Field>
              <Field label="Start date" required>
                <Input
                  aria-label="Start date"
                  type="date"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </Field>
              <Field label="End date">
                <Input aria-label="End date" type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
              </Field>
              <label htmlFor={enabledId} className="flex items-center gap-2 text-sm">
                <Checkbox id={enabledId} checked={enabled} onCheckedChange={(value) => setEnabled(value === true)} />
                Enable this template
              </label>
              <PersistentSalesLookup
                company={company}
                kind="customer"
                label="Add billing customer"
                value=""
                onChange={(choice) => {
                  if (choice) {
                    setCustomers((current) => (current.includes(choice.id) ? current : [...current, choice.id]));
                    setCustomerNames((current) => ({ ...current, [choice.id]: `${choice.code} · ${choice.name}` }));
                  }
                }}
              />
              <div className="grid gap-2 sm:col-span-2">
                {customers.map((customer) => (
                  <div
                    key={customer}
                    className="flex items-center justify-between gap-2 rounded border border-border p-2 text-sm"
                  >
                    <span>{customerNames[customer] ?? customer}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCustomers((current) => current.filter((id) => id !== customer))}
                    >
                      Remove customer
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : null}
        <Card className="rounded-xl">
          <EntryTabs
            tabs={[
              ["lines", "Product / Service"],
              ["other", "Other details"],
            ]}
            active={tab}
            onChange={setTab}
            label="Sales document details"
          />
          {tab === "lines" ? (
            <div className="grid min-w-0 gap-3 p-3">
              <section
                aria-label="Sales lines"
                className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <h2 className="m-0 text-sm font-semibold">Products and services</h2>
                  {!["return", "credit", "delivery"].includes(kind) ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setLines((current) => [...current, emptyLine()])}
                      >
                        Add line
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setLines((current) => [...current, emptyLine(true)])}
                      >
                        Add other charge
                      </Button>
                    </div>
                  ) : null}
                </div>
                <WorkTable
                  tableId="sales-entry-lines"
                  aria-label="Products and services"
                  tools={false}
                  keyboardScroll
                  className="w-full min-w-[1080px] table-fixed border-collapse text-sm"
                >
                  <colgroup>
                    <col className="w-[20%]" />
                    <col className="w-[19%]" />
                    <col className="w-[9%]" />
                    <col className="w-[11%]" />
                    <col className="w-[10%]" />
                    <col className="w-[9%]" />
                    <col className="w-[14%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <thead className="bg-muted text-left">
                    <tr>
                      {[
                        "Product code · name",
                        "Description *",
                        "Quantity *",
                        "Unit *",
                        "Unit price *",
                        "Discount",
                        "Tax",
                        "Actions",
                      ].map((label) => (
                        <th key={label} scope="col" className="px-2 py-2 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <SalesEntryLine
                        key={line.key}
                        company={company}
                        line={line}
                        index={index}
                        currency={draft.currency}
                        warehouse={draft.warehouse_id ?? undefined}
                        date={draft.document_date}
                        locked={!!line.input.source_line_id}
                        update={(change) => updateLine(line.key, change)}
                        remove={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                        canRemove={lines.length > 1}
                      />
                    ))}
                  </tbody>
                </WorkTable>
              </section>
              <div className="grid gap-4 rounded-lg border border-border bg-muted/40 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]">
                <Field label="Document discount">
                  <Input
                    aria-label="Document discount"
                    inputMode="decimal"
                    value={draft.discount_amount}
                    onChange={(event) => update({ discount_amount: event.target.value })}
                  />
                </Field>
                <TotalsSummary
                  rows={[
                    [
                      "Net amount",
                      net && precision !== undefined
                        ? salesMoney(net, draft.currency, precision)
                        : "Calculated on save",
                    ],
                    ["Governed tax", "Calculated on save"],
                  ]}
                  total={["Total", "Calculated on save"]}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Untaxed treatment reason">
                <Textarea
                  aria-label="Untaxed treatment reason"
                  value={draft.no_tax_reason}
                  maxLength={500}
                  onChange={(event) => update({ no_tax_reason: event.target.value })}
                />
              </Field>
              <Field label="Notes">
                <Textarea
                  aria-label="Notes"
                  value={draft.notes}
                  maxLength={4000}
                  onChange={(event) => update({ notes: event.target.value })}
                />
              </Field>
            </div>
          )}
        </Card>
      </fieldset>
      {dialog}
    </WorkForm>
  );
}

function SalesEntryLine({
  company,
  line,
  index,
  currency,
  warehouse,
  date,
  locked,
  update,
  remove,
  canRemove,
}: {
  company: string;
  line: Line;
  index: number;
  currency: string;
  warehouse?: string;
  date: string;
  locked: boolean;
  update: (change: (line: Line) => Line) => void;
  remove: () => void;
  canRemove: boolean;
}) {
  const { api } = useSession(),
    [units, setUnits] = useState<{ product: string; value: ProductUnits | null; error: string } | null>(null),
    [unitRetry, setUnitRetry] = useState(0);
  const product = line.input.product_id;
  useEffect(() => {
    if (!product) return;
    let active = true;
    api
      .getSalesProductUnits(product, company)
      .then((value) => {
        if (active) setUnits({ product, value, error: "" });
      })
      .catch((error) => {
        if (active) setUnits({ product, value: null, error: salesError(error) });
      });
    return () => {
      active = false;
    };
  }, [api, company, product, unitRetry]);
  const available = units?.product === product ? units : null;
  const patch = (change: Partial<SalesLineInput>) =>
    update((current) => ({ ...current, input: { ...current.input, ...change } }));
  return (
    <tr aria-label={`Sales line ${index + 1}`} className="border-t border-border align-top [&>td]:p-2">
      <td>
        {!line.charge ? (
          <PersistentSalesLookup
            company={company}
            kind="product"
            label={`Product / Service ${index + 1}`}
            tableCell
            value={product ?? ""}
            selectedLabel={line.productLabel}
            required
            disabled={locked}
            warehouse={warehouse}
            onChange={(choice) =>
              update((current) => ({
                ...current,
                productLabel: choice ? `${choice.code} · ${choice.name}` : "",
                unitLabel: choice?.unit ?? "",
                input: {
                  ...current.input,
                  product_id: choice?.id ?? null,
                  description: choice?.name ?? "",
                  unit_id: choice?.unit_id ?? undefined,
                  unit_price: choice?.currency === currency ? (choice?.price ?? "") : "",
                },
              }))
            }
          />
        ) : (
          <span className="block py-2 text-sm font-medium">Other charge</span>
        )}
      </td>
      <td>
        <Input
          aria-label={`Description ${index + 1}`}
          value={line.input.description}
          maxLength={500}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </td>
      <td>
        <Input
          aria-label={`Quantity ${index + 1}`}
          inputMode="decimal"
          value={line.input.quantity}
          onChange={(event) => patch({ quantity: event.target.value })}
        />
      </td>
      <td>
        {line.charge ? (
          <PersistentSalesLookup
            company={company}
            kind="unit"
            label={`Unit ${index + 1}`}
            tableCell
            value={line.input.unit_id ?? ""}
            selectedLabel={line.unitLabel}
            required
            disabled={locked}
            onChange={(choice) => {
              patch({ unit_id: choice?.id });
              update((current) => ({ ...current, unitLabel: choice?.name ?? "" }));
            }}
          />
        ) : (
          <SearchableSelect
            label={`Unit ${index + 1}`}
            placeholder={
              !product
                ? "Choose product first"
                : available?.error
                  ? "Units unavailable"
                  : !available
                    ? "Loading units..."
                    : "Choose unit"
            }
            className="w-full"
            disabled={locked || !product || !available?.value}
            loading={!!product && !available}
            value={line.input.unit_id ?? available?.value?.base.id ?? ""}
            options={
              available?.value?.items.map(({ unit }) => ({ value: unit.id, label: `${unit.name} (${unit.symbol})` })) ??
              []
            }
            onValueChange={(id) => {
              const choice = available?.value?.items.find(({ unit }) => unit.id === id);
              if (choice)
                update((current) => ({
                  ...current,
                  unitLabel: choice.unit.name,
                  input: { ...current.input, unit_id: choice.unit.id },
                }));
            }}
          />
        )}
        {available?.error ? (
          <p role="alert" className="m-0 text-xs text-destructive">
            {available.error}{" "}
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => {
                setUnits(null);
                setUnitRetry((value) => value + 1);
              }}
            >
              Retry units
            </Button>
          </p>
        ) : null}
      </td>
      <td>
        <Input
          aria-label={`Unit price ${index + 1}`}
          inputMode="decimal"
          value={line.input.unit_price}
          onChange={(event) => patch({ unit_price: event.target.value })}
        />
      </td>
      <td>
        <Input
          aria-label={`Line discount ${index + 1}`}
          inputMode="decimal"
          value={line.input.discount_amount}
          onChange={(event) => patch({ discount_amount: event.target.value })}
        />
      </td>
      <td>
        <PersistentSalesLookup
          company={company}
          kind="tax"
          label={`Tax ${index + 1}`}
          tableCell
          value={line.input.tax_definition_id ?? ""}
          selectedLabel={line.taxLabel}
          currency={currency || undefined}
          date={date || undefined}
          disabled={locked}
          onChange={(choice) => {
            patch({ tax_definition_id: choice?.id ?? null });
            update((current) => ({ ...current, taxLabel: choice?.name ?? "" }));
          }}
        />
      </td>
      <td>
        {canRemove ? (
          <Button type="button" variant="outline" size="sm" onClick={remove} aria-label={`Remove line ${index + 1}`}>
            Remove
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
