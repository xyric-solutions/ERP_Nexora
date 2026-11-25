"use client";
import { useState } from "react";
import {
  assetEventInputSchema,
  assetAssignmentSchema,
  type AssetDetail,
  type AssetOptions,
  type AssetSources,
  type FixedAsset,
  type AssetEventInput,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Section, Select, AssignmentFields, today, moneyLabel } from "./asset-fields";

export const lifecycleLabels: Record<AssetEventInput["type"], string> = {
  transfer: "Transfer",
  maintenance: "Maintenance",
  verification: "Physical verification",
  impairment: "Impairment",
  disposal: "Disposal",
  return: "Vendor return",
  refund: "Vendor refund",
};
export function AssetLifecycleForm({
  company,
  type,
  options,
  assets,
  detail,
  sources,
  busy,
  onSelect,
  onSave,
  onDirtyChange,
}: {
  company: string;
  type: AssetEventInput["type"];
  options: AssetOptions;
  assets: FixedAsset[];
  detail: AssetDetail | null;
  sources: AssetSources["items"];
  busy: boolean;
  onSelect: (id: string) => void;
  onSave: (input: AssetEventInput, key: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const asset = detail?.asset,
    dp = options.decimal_places;
  const [date, setDate] = useState(today()),
    [reason, setReason] = useState(""),
    [assignment, setAssignment] = useState(() => asset?.assignment ?? assetAssignmentSchema.parse({})),
    [values, setValues] = useState<Record<string, string>>({
      condition: asset?.details.condition ?? "good",
      treatment: "expense",
      maintenance_status: "completed",
      kind: "sale",
      result: "verified",
    }),
    [evidence, setEvidence] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [error, setError] = useState("");
  const set = (name: string, value: string) =>
    setValues((current) => ({
      ...current,
      [name]: value,
      ...(name === "credit_note_item_id" && value ? { refund_receivable_account_id: "" } : {}),
      ...(name === "refund_receivable_account_id" && value ? { credit_note_item_id: "" } : {}),
    }));
  const text = (name: string, label: string, attributes: { type?: string; required?: boolean; min?: string } = {}) => (
    <Field label={label}>
      <Input
        required={attributes.required ?? true}
        type={attributes.type ?? "text"}
        min={attributes.min}
        value={values[name] ?? ""}
        onChange={(event) => set(name, event.target.value)}
      />
    </Field>
  );
  const select = (
    name: string,
    label: string,
    items: readonly { id: string; code?: string; name: string }[],
    required = true,
  ) => (
    <Field label={label}>
      <Select
        required={required}
        value={values[name] ?? ""}
        items={items}
        onChange={(e) => set(name, e.target.value)}
      />
    </Field>
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!asset) return;
    try {
      let fields: Record<string, unknown> = {};
      if (type === "transfer") fields = { assignment };
      if (type === "verification")
        fields = { actual_assignment: assignment, condition: values.condition, result: values.result };
      if (type === "maintenance")
        fields = {
          maintenance_type: values.maintenance_type,
          maintenance_status: values.maintenance_status,
          description: values.description ?? "",
          cost: values.cost,
          treatment: values.treatment,
          ...(values.supplier_id ? { supplier_id: values.supplier_id } : {}),
          ...(values.next_date ? { next_date: values.next_date } : {}),
          ...(values.source_line_id ? { source_line_id: values.source_line_id } : {}),
        };
      if (type === "impairment") fields = { recoverable_amount: values.recoverable_amount };
      if (type === "disposal")
        fields = {
          kind: values.kind,
          proceeds: values.kind === "scrap" ? "0" : values.proceeds,
          ...(values.proceeds_account_id ? { proceeds_account_id: values.proceeds_account_id } : {}),
          counterparty: values.counterparty ?? "",
        };
      if (type === "return")
        fields = {
          amount: values.amount,
          condition: values.condition,
          credit_note_reference: values.credit_note_reference,
          ...(values.credit_note_item_id ? { credit_note_item_id: values.credit_note_item_id } : {}),
          ...(values.refund_receivable_account_id
            ? { refund_receivable_account_id: values.refund_receivable_account_id }
            : {}),
          ...(values.expected_refund_date ? { expected_refund_date: values.expected_refund_date } : {}),
        };
      if (type === "refund")
        fields = {
          return_event_id: values.return_event_id,
          receipt_line_id: values.receipt_line_id,
          amount: values.amount,
        };
      await onSave(
        assetEventInputSchema.parse({
          company_id: company,
          asset_id: asset.id,
          expected_version: asset.version,
          date,
          reason,
          type,
          evidence: evidence
            .split("\n")
            .filter(Boolean)
            .map((reference) => ({ reference, description: "" })),
          ...fields,
        }),
        key,
      );
    } catch (error) {
      setError(
        error instanceof Error && "issues" in error
          ? "Complete the required fields and check the amounts."
          : error instanceof Error
            ? error.message
            : "Lifecycle event could not be saved.",
      );
    }
  }
  return (
    <form
      onSubmit={submit}
      onChangeCapture={() => {
        setKey(crypto.randomUUID());
        onDirtyChange?.(true);
      }}
      className="space-y-4"
    >
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <Section title={`Prepare ${lifecycleLabels[type].toLowerCase()}`}>
          <Field label="Asset">
            <Select
              required
              value={asset?.id ?? ""}
              items={assets
                .filter((row) =>
                  type === "refund"
                    ? row.status === "returned"
                    : type === "return"
                      ? !["returned", "disposed"].includes(row.status)
                      : ["active", "fully_depreciated"].includes(row.status),
                )
                .map((row) => ({ id: row.id, code: row.code, name: row.details.name }))}
              onChange={(e) => onSelect(e.target.value)}
            />
          </Field>
          <Field label="Effective date">
            <Input
              type="date"
              required
              min={asset?.last_financial_date}
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {asset && (
            <>
              <Field label="Acquisition cost">
                <Input readOnly value={`${moneyLabel(asset.cost, dp)} ${asset.base_currency}`} />
              </Field>
              <Field label="Accumulated depreciation">
                <Input readOnly value={moneyLabel(asset.accumulated_depreciation, dp)} />
              </Field>
              <Field label="Carrying amount">
                <Input readOnly value={moneyLabel(asset.net_book_value, dp)} />
              </Field>
              <Field label="Original acquisition">
                <Input readOnly value={`${detail?.source.reference} · ${detail?.source.entry_number}`} />
              </Field>
            </>
          )}
        </Section>
        {asset && (
          <Section title="Transaction details">
            {type === "transfer" && (
              <>
                <Field label="Current location">
                  <Input
                    readOnly
                    value={
                      options.locations.find((row) => row.id === asset.assignment.location_id)?.name ?? "Unassigned"
                    }
                  />
                </Field>
                <Field label="Current project">
                  <Input
                    readOnly
                    value={options.projects.find((row) => row.id === asset.assignment.project_id)?.name ?? "Unassigned"}
                  />
                </Field>
                <p className="col-span-full text-sm text-muted-foreground">
                  Choose the destination location or project below. The current assignment changes only after the
                  transfer is approved and posted.
                </p>
              </>
            )}
            {(type === "transfer" || type === "verification") && (
              <AssignmentFields options={options} value={assignment} onChange={setAssignment} />
            )}
            {type === "transfer" && (
              <p className="col-span-full text-sm text-muted-foreground">
                Current assignment is retained in the asset history. An internal transfer creates no accounting journal.
              </p>
            )}
            {(type === "verification" || type === "return") &&
              select(
                "condition",
                "Physical condition",
                ["new", "good", "fair", "damaged", "missing"].map((id) => ({ id, name: id })),
              )}
            {type === "verification" &&
              select(
                "result",
                "Verification result",
                ["verified", "misplaced", "missing", "damaged", "incorrect_assignment"].map((id) => ({
                  id,
                  name: id.replaceAll("_", " "),
                })),
              )}
            {type === "maintenance" && (
              <>
                {text("maintenance_type", "Maintenance type")}
                {select("maintenance_status", "Maintenance status", [
                  { id: "planned", name: "Planned" },
                  { id: "in_progress", name: "In progress" },
                  { id: "completed", name: "Completed" },
                ])}
                {text("description", "Maintenance description")}
                {text("cost", `Maintenance cost (${options.base_currency})`)}
                {select("supplier_id", "Maintenance supplier", options.suppliers, false)}
                {text("next_date", "Next maintenance date", { type: "date", required: false, min: date })}
                {select("treatment", "Accounting treatment", [
                  { id: "expense", name: "Ordinary maintenance expense" },
                  { id: "capital_improvement", name: "Capital improvement (already posted)" },
                ])}
                {values.treatment === "capital_improvement" &&
                  select(
                    "source_line_id",
                    "Posted improvement source",
                    sources
                      .filter((row) => row.account_id === asset.category.asset_account_id)
                      .map((row) => ({
                        id: row.line_id,
                        code: row.reference,
                        name: `${row.account_name} · ${moneyLabel(row.available, dp)}`,
                      })),
                  )}
                <p className="col-span-full text-sm text-muted-foreground">
                  Ordinary maintenance records the service history. Its vendor invoice follows the existing
                  Purchase/Accounting workflow. Capital improvements must link an existing posted acquisition debit.
                </p>
              </>
            )}
            {type === "impairment" && text("recoverable_amount", `Recoverable amount (${options.base_currency})`)}
            {type === "disposal" && (
              <>
                {select("kind", "Disposal method", [
                  { id: "sale", name: "Sale" },
                  { id: "scrap", name: "Scrap / permanent removal" },
                ])}
                {values.kind === "sale" && (
                  <>
                    {text("proceeds", `Net sale proceeds (${options.base_currency})`)}
                    {select(
                      "proceeds_account_id",
                      "Disposal receivable account",
                      options.accounts.filter((row) => row.type === "asset"),
                    )}
                    {text("counterparty", "Buyer")}
                  </>
                )}
                <p className="col-span-full text-sm text-muted-foreground">
                  The server calculates gain or loss and removes cost and accumulated depreciation. Bank collection
                  follows the existing Bank Receipt workflow.
                </p>
              </>
            )}
            {type === "return" && (
              <>
                {text("amount", `Net vendor credit (${options.base_currency})`)}
                {text("credit_note_reference", "Vendor credit note reference")}
                {detail?.source.source_type === "purchase_invoice" || detail?.source.currency !== asset.base_currency
                  ? select("credit_note_item_id", "Posted supplier credit note", options.credit_notes)
                  : select(
                      "refund_receivable_account_id",
                      "Vendor refund receivable account",
                      options.accounts.filter((row) => row.type === "asset"),
                      !values.credit_note_item_id,
                    )}
                {text("expected_refund_date", "Expected refund date", { type: "date", required: false, min: date })}
                {detail?.source.source_type === "bank_payment" &&
                  detail.source.currency === asset.base_currency &&
                  select(
                    "credit_note_item_id",
                    "Posted supplier credit note (required when original tax applies)",
                    options.credit_notes,
                    false,
                  )}
                <Field label="Return quantity">
                  <Input readOnly value="1 individually registered asset" />
                </Field>
                <p className="col-span-full text-sm text-muted-foreground">
                  Invoice returns use the original supplier’s posted Accounting credit note, including tax. Unpaid
                  invoice credits can be offset in Accounting; paid credits can be refunded there. Direct Bank Payment
                  returns recognize a separate refund receivable and retain the original payment.
                </p>
              </>
            )}
            {type === "refund" && (
              <>
                {select(
                  "return_event_id",
                  "Posted vendor return",
                  (detail?.events ?? [])
                    .filter((event) => event.type === "return" && event.state === "posted")
                    .map((event) => ({
                      id: event.id,
                      code: event.code,
                      name: `${event.date} · ${moneyLabel(event.preview.amount, dp)}`,
                    })),
                )}
                {select("receipt_line_id", "Posted bank receipt / supplier refund", options.refund_receipts)}
                {text("amount", `Refund allocation (${options.base_currency})`)}
                <p className="col-span-full text-sm text-muted-foreground">
                  Link the actual posted receipt. This allocation creates no additional Bank or GL transaction.
                </p>
              </>
            )}
          </Section>
        )}
        <Section title="Approval evidence">
          <Field label="Reason / remarks">
            <Textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Field label="Supporting document references">
            <Textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="One document reference per line"
            />
          </Field>
        </Section>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !asset}>
          {busy ? "Saving…" : "Save and preview draft"}
        </Button>
      </fieldset>
    </form>
  );
}
