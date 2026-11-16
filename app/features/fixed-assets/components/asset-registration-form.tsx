"use client";
import { useState } from "react";
import {
  assetCreateSchema,
  assetPolicyStart,
  assetAssignmentSchema,
  decimal,
  decimalText,
  divideRounded,
  type AssetCreate,
  type AssetOptions,
  type AssetSources,
  type FixedAsset,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Section, Select, PhysicalFields, AssignmentFields, today, moneyLabel } from "./asset-fields";
import { AssetCustomFields } from "./asset-custom-fields";

export function AssetRegistrationForm({
  company,
  options,
  sources,
  busy,
  onSave,
  onDirtyChange,
  onMoreSources,
  hasMoreSources,
  sourceReference,
}: {
  company: string;
  options: AssetOptions;
  sources: AssetSources["items"];
  busy: boolean;
  onSave: (input: AssetCreate, key: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onMoreSources: () => void;
  hasMoreSources: boolean;
  sourceReference?: string;
}) {
  const initialSource = sources.find(
      (source) => source.source_id === sourceReference || source.purchase_document_id === sourceReference,
    ),
    initialCategory = options.categories.find(
      (category) => category.active && category.asset_account_id === initialSource?.account_id,
    ),
    initialCost = initialSource
      ? decimalText(
          decimal(initialSource.available, 8) / 10n ** BigInt(8 - options.decimal_places),
          options.decimal_places,
        )
      : "";
  const [sourceId, setSourceId] = useState(initialSource?.line_id ?? ""),
    [categoryId, setCategoryId] = useState(initialCategory?.id ?? ""),
    [supplier, setSupplier] = useState(initialSource?.supplier_id ?? ""),
    [quantity, setQuantity] = useState(1),
    [costs, setCosts] = useState<string[]>([initialCost]),
    [serials, setSerials] = useState<string[]>([""]),
    [details, setDetails] = useState<FixedAsset["details"]>(() => ({
      name: "",
      description: "",
      brand: "",
      model: "",
      serial_number: "",
      barcode: "",
      condition: "new",
      warranty_provider: "",
      warranty_start: null,
      warranty_end: null,
      verification_due: null,
      maintenance_provider: "",
      evidence: [],
    })),
    [assignment, setAssignment] = useState(() => assetAssignmentSchema.parse({})),
    [life, setLife] = useState(initialCategory ? String(initialCategory.useful_life_months) : ""),
    [method, setMethod] = useState<FixedAsset["method"]>(initialCategory?.method ?? "straight_line"),
    [rate, setRate] = useState(initialCategory ? String(initialCategory.annual_rate_percent) : ""),
    [residuals, setResiduals] = useState<string[]>([
      initialCost && initialCategory
        ? decimalText(
            divideRounded(
              decimal(initialCost, 8) * BigInt(Math.round(initialCategory.residual_percent * 10000)),
              1000000n * 10n ** BigInt(8 - options.decimal_places),
            ),
            options.decimal_places,
          )
        : "0",
    ]),
    [inService, setInService] = useState(today()),
    [start, setStart] = useState(assetPolicyStart(initialCategory ?? {}, today())),
    [reason, setReason] = useState(""),
    [validation, setValidation] = useState(""),
    [uploadBusy, setUploadBusy] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID());
  const source = sources.find((row) => row.line_id === sourceId),
    category = options.categories.find((row) => row.id === categoryId),
    dp = options.decimal_places;
  function allocate(count: number, sourceValue = source) {
    if (!sourceValue) return;
    const unit = 10n ** BigInt(8 - dp),
      available = decimal(sourceValue.available, 8) / unit,
      base = available / BigInt(count),
      remainder = available % BigInt(count);
    const values = Array.from({ length: count }, (_, i) => base + (BigInt(i) < remainder ? 1n : 0n));
    setCosts(values.map((value) => decimalText(value, dp)));
    setResiduals(
      values.map((value) =>
        decimalText(divideRounded(value * BigInt(Math.round((category?.residual_percent ?? 0) * 10000)), 1000000n), dp),
      ),
    );
    setSerials(Array.from({ length: count }, (_, i) => serials[i] ?? ""));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setValidation("");
    try {
      if (uploadBusy) throw Error("Wait for the private document upload to finish.");
      const input = assetCreateSchema.parse({
        company_id: company,
        category_id: categoryId,
        source_line_id: sourceId,
        ...(source?.supplier_id ? {} : { supplier_id: supplier }),
        reason,
        units: Array.from({ length: quantity }, (_, i) => ({
          details: { ...details, serial_number: serials[i] ?? "" },
          cost: costs[i] ?? "",
          residual_value: residuals[i] ?? "0",
          useful_life_months: Number(life),
          method,
          annual_rate_percent: Number(rate),
          in_service_date: inService,
          depreciation_start: start,
          assignment,
        })),
      });
      await onSave(input, key);
      onDirtyChange?.(false);
    } catch (error) {
      setValidation(
        error instanceof Error && "issues" in error
          ? "Complete the required fields and check amounts and useful life."
          : error instanceof Error
            ? error.message
            : "Asset registration failed.",
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
      <fieldset disabled={busy || uploadBusy} className="min-w-0 space-y-4">
        <Section
          title="Acquisition source"
          description="Register the asset against an existing posted acquisition. Registration creates no acquisition journal."
        >
          <Field label="Posted Purchase invoice or Bank Payment">
            <select
              className="h-9 min-w-0 rounded-md border border-input bg-card px-2 text-sm"
              required
              value={sourceId}
              onChange={(event) => {
                const next = sources.find((row) => row.line_id === event.target.value);
                setSourceId(event.target.value);
                setCategoryId("");
                setSupplier(next?.supplier_id ?? "");
                allocate(quantity, next);
              }}
            >
              <option value="">Select posted financial evidence…</option>
              {sources
                .filter((row) => decimal(row.available, 8) > 0n)
                .map((row) => (
                  <option key={row.line_id} value={row.line_id}>
                    {row.reference} · {row.account_name} · available {moneyLabel(row.available, dp)} {row.base_currency}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Asset category">
            <Select
              required
              value={categoryId}
              items={options.categories.filter(
                (row) => row.active && (!source || row.asset_account_id === source.account_id),
              )}
              onChange={(event) => {
                const next = options.categories.find((row) => row.id === event.target.value);
                setCategoryId(event.target.value);
                if (next) {
                  setStart(assetPolicyStart(next, inService));
                  setLife(String(next.useful_life_months));
                  setMethod(next.method);
                  setRate(String(next.annual_rate_percent));
                  setResiduals(
                    costs.map((cost) => {
                      try {
                        return decimalText(
                          divideRounded(
                            decimal(cost, 8) * BigInt(Math.round(next.residual_percent * 10000)),
                            1000000n * 10n ** BigInt(8 - dp),
                          ),
                          dp,
                        );
                      } catch {
                        return "0";
                      }
                    }),
                  );
                }
              }}
            />
          </Field>
          <Field label="Supplier">
            <Select
              required
              disabled={!!source?.supplier_id}
              items={options.suppliers}
              value={source?.supplier_id ?? supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </Field>
          {source && (
            <>
              <Field label="Original posting">
                <Input readOnly value={`${source.entry_number} · ${source.date}`} />
              </Field>
              <Field label="Acquisition currency / original rate">
                <Input readOnly value={`${source.currency} · ${source.exchange_rate}`} />
              </Field>
              <Field label="Available capitalized amount">
                <Input readOnly value={`${moneyLabel(source.available, dp)} ${source.base_currency}`} />
              </Field>
            </>
          )}
          {hasMoreSources && (
            <Button type="button" variant="outline" onClick={onMoreSources}>
              Load more posted sources
            </Button>
          )}
        </Section>
        <Section title="Physical details">
          <PhysicalFields value={details} onChange={setDetails} />
          {category && (
            <AssetCustomFields
              company={company}
              onUploadStateChange={setUploadBusy}
              category={category}
              value={details}
              onChange={setDetails}
            />
          )}
        </Section>
        <Section
          title="Individual assets"
          description="Each unit receives its own permanent asset code and assignment history."
        >
          <Field label="Number of units">
            <Input
              type="number"
              min={1}
              max={100}
              required
              value={quantity}
              onChange={(event) => {
                const count = Math.max(1, Math.min(100, Number(event.target.value) || 1));
                setQuantity(count);
                allocate(count);
              }}
            />
          </Field>
          <Field label="Asset code">
            <Input readOnly value={"Generated on save · " + (category?.numbering_prefix ?? "FA") + "-001"} />
          </Field>
          <div className="col-span-full grid gap-3">
            {Array.from({ length: quantity }, (_, index) => (
              <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
                <Field label={`Unit ${index + 1} serial number`}>
                  <Input
                    value={serials[index] ?? ""}
                    maxLength={128}
                    onChange={(e) =>
                      setSerials((current) =>
                        Array.from({ length: quantity }, (_, i) => (i === index ? e.target.value : (current[i] ?? ""))),
                      )
                    }
                  />
                </Field>
                <Field label={`Unit ${index + 1} acquisition cost (${options.base_currency})`}>
                  <Input
                    inputMode="decimal"
                    required
                    value={costs[index] ?? ""}
                    onChange={(e) =>
                      setCosts((current) =>
                        Array.from({ length: quantity }, (_, i) => (i === index ? e.target.value : (current[i] ?? ""))),
                      )
                    }
                  />
                </Field>
                <Field label={`Unit ${index + 1} residual value`}>
                  <Input
                    inputMode="decimal"
                    required
                    value={residuals[index] ?? "0"}
                    onChange={(e) =>
                      setResiduals((current) =>
                        Array.from({ length: quantity }, (_, i) =>
                          i === index ? e.target.value : (current[i] ?? "0"),
                        ),
                      )
                    }
                  />
                </Field>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Depreciation policy">
          <Field label="Method">
            <Select
              required
              items={[
                { id: "straight_line", name: "Straight line" },
                { id: "reducing_balance", name: "Reducing balance" },
                { id: "double_declining", name: "Double declining balance" },
              ]}
              value={method}
              onChange={(e) => setMethod(e.target.value as FixedAsset["method"])}
            />
          </Field>
          <Field label="Useful life (months)">
            <Input type="number" min={1} max={1200} required value={life} onChange={(e) => setLife(e.target.value)} />
          </Field>
          <Field label="Reducing balance annual rate (%)">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.0001"
              required
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Field label="Available for use">
            <Input
              type="date"
              min={source?.date}
              required
              value={inService}
              onChange={(e) => {
                setInService(e.target.value);
                setStart(assetPolicyStart(category ?? {}, e.target.value));
              }}
            />
          </Field>
          <Field label="Depreciation commencement">
            <Input
              type="date"
              min={inService}
              required
              readOnly={category?.allow_start_override === false}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          {category && (
            <p className="text-sm text-muted-foreground">
              Convention: {category.convention.replace("_", " ")}. Monthly journals use the category’s expense and
              accumulated-depreciation accounts.
            </p>
          )}
        </Section>
        <Section title="Initial assignment">
          <AssignmentFields value={assignment} onChange={setAssignment} options={options} />
        </Section>
        <Field label="Registration reason">
          <Input minLength={3} maxLength={500} required value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {validation && (
          <p role="alert" className="text-sm text-destructive">
            {validation}
          </p>
        )}
        <Button type="submit" disabled={busy || !sourceId || !categoryId}>
          {busy ? "Saving…" : "Save asset drafts"}
        </Button>
      </fieldset>
    </form>
  );
}
