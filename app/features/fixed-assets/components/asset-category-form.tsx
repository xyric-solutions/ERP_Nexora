"use client";
import { useState } from "react";
import {
  assetCategoryInputSchema,
  type AssetCategory,
  type AssetCategoryInput,
  type AssetOptions,
  type AssetFieldDefinition,
  assetCategoryTemplates,
  assetFieldTemplates,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Section, Select } from "./asset-fields";
import { Checkbox } from "@/components/ui/checkbox";
import { AssetCategoryFieldEditor } from "./asset-category-field-editor";

export function AssetCategoryForm({
  company,
  options,
  category,
  busy,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  company: string;
  options: AssetOptions;
  category?: AssetCategory;
  busy: boolean;
  onSave: (id: string | null, input: AssetCategoryInput, key: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(Object.entries(category ?? {}).map(([k, v]) => [k, String(v)])),
    ),
    [error, setError] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState<AssetFieldDefinition[]>(category?.field_definitions ?? []);
  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const input = assetCategoryInputSchema.parse({
        company_id: company,
        expected_version: category?.version ?? 0,
        name: values.name,
        active: values.active !== "false",
        ...Object.fromEntries(
          ["asset", "accumulated", "expense", "gain", "loss", "impairment"].map((role) => [
            `${role}_account_id`,
            values[`${role}_account_id`],
          ]),
        ),
        useful_life_months: Number(values.useful_life_months),
        method: values.method,
        annual_rate_percent: Number(values.annual_rate_percent),
        residual_percent: Number(values.residual_percent),
        convention: values.convention,
        calculation_basis: values.calculation_basis ?? (category ? "legacy_monthly" : "actual_actual"),
        field_template: values.field_template ?? "general",
        field_definitions: fields,
        inherit_company_policy: values.inherit_company_policy === "true",
        capitalization_threshold: values.capitalization_threshold,
        numbering_prefix: values.numbering_prefix || "FA",
      });
      await onSave(category?.id ?? null, input, key);
    } catch (error) {
      setError(
        error instanceof Error && "issues" in error
          ? "Complete each policy and map six distinct accounts of the correct type."
          : error instanceof Error
            ? error.message
            : "Category save failed.",
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
        {!category && (
          <Field label="Start from an editable category template">
            <Select
              value=""
              placeholder="Choose an optional template"
              items={assetCategoryTemplates.map((template, index) => ({
                id: String(index),
                name: `${template.name} · ${template.annual_rate_percent}% declining rate`,
              }))}
              onChange={(event) => {
                const template = assetCategoryTemplates[Number(event.target.value)];
                if (!template) return;
                setValues((current) => ({
                  ...current,
                  name: template.name,
                  annual_rate_percent: String(template.annual_rate_percent),
                  useful_life_months: String(template.useful_life_months),
                  residual_percent: "0",
                  field_template: template.key,
                  method: options.company_policy?.method ?? "straight_line",
                  calculation_basis: "actual_actual",
                  convention: "actual_days",
                  capitalization_threshold: "0",
                }));
                setFields(assetFieldTemplates[template.key]?.map((field) => ({ ...field })) ?? []);
              }}
            />
          </Field>
        )}
        <Section title={category ? `Edit ${category.code}` : "Add asset category"}>
          <Field label="Asset numbering prefix">
            <Input
              required
              pattern="[A-Z][A-Z0-9]{1,9}"
              value={values.numbering_prefix ?? "FA"}
              onChange={(event) => set("numbering_prefix", event.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Category name">
            <Input
              value={values.name ?? ""}
              minLength={2}
              maxLength={200}
              required
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              items={[
                { id: "true", name: "Active" },
                { id: "false", name: "Inactive" },
              ]}
              required
              value={values.active ?? "true"}
              onChange={(e) => set("active", e.target.value)}
            />
          </Field>
          {(
            [
              ["asset", "Fixed asset account", "asset"],
              ["accumulated", "Accumulated depreciation account", "asset"],
              ["expense", "Depreciation expense account", "expense"],
              ["gain", "Disposal gain account", "revenue"],
              ["loss", "Disposal loss account", "expense"],
              ["impairment", "Impairment expense account", "expense"],
            ] as const
          ).map(([role, label, type]) => (
            <Field key={role} label={label}>
              <Select
                required
                items={options.accounts.filter((a) => a.type === type)}
                value={values[`${role}_account_id`] ?? ""}
                onChange={(e) => set(`${role}_account_id`, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Default useful life (months)">
            <Input
              type="number"
              min={1}
              max={1200}
              required
              value={values.useful_life_months ?? ""}
              onChange={(e) => set("useful_life_months", e.target.value)}
            />
          </Field>
          <Field label="Default depreciation method">
            <Select
              required
              items={[
                { id: "straight_line", name: "Straight line" },
                { id: "reducing_balance", name: "Reducing balance" },
                { id: "double_declining", name: "Double declining balance" },
              ]}
              value={values.method ?? ""}
              onChange={(e) => set("method", e.target.value)}
            />
          </Field>
          <Field label="Annual reducing balance rate (%)">
            <Input
              type="number"
              step="0.0001"
              min={0}
              max={100}
              required
              value={values.annual_rate_percent ?? ""}
              onChange={(e) => set("annual_rate_percent", e.target.value)}
            />
          </Field>
          <Field label="Default residual value (%)">
            <Input
              type="number"
              step="0.0001"
              min={0}
              max={100}
              required
              value={values.residual_percent ?? ""}
              onChange={(e) => set("residual_percent", e.target.value)}
            />
          </Field>
          <Field label="Depreciation convention">
            <Select
              required
              items={[
                { id: "full_month", name: "Full month" },
                { id: "actual_days", name: "Prorate first month by actual days" },
              ]}
              value={values.convention ?? ""}
              onChange={(e) => set("convention", e.target.value)}
            />
          </Field>
          <Field label="Calculation basis">
            <Select
              required
              value={values.calculation_basis ?? (category ? "legacy_monthly" : "actual_actual")}
              items={[
                { id: "actual_actual", name: "Daily accrual · Actual/Actual 365/366" },
                { id: "legacy_monthly", name: "Existing monthly convention" },
              ]}
              onChange={(event) => set("calculation_basis", event.target.value)}
            />
          </Field>
          <Field label="Category-specific form">
            <Select
              value={values.field_template ?? "general"}
              items={Object.keys(assetFieldTemplates).map((value) => ({ id: value, name: value.replaceAll("_", " ") }))}
              onChange={(event) => {
                if (fields.length && !window.confirm("Replace the additional fields with this category template?"))
                  return;
                set("field_template", event.target.value);
                setFields(assetFieldTemplates[event.target.value]?.map((field) => ({ ...field })) ?? []);
              }}
            />
          </Field>
          <label htmlFor="asset-inherit-company" className="inline-flex items-center gap-2 text-sm">
            <Checkbox
              id="asset-inherit-company"
              checked={values.inherit_company_policy === "true"}
              disabled={!options.company_policy}
              onCheckedChange={(value) => set("inherit_company_policy", value === true ? "true" : "false")}
            />
            Inherit the company Asset Policy
          </label>
          <Field label={`Capitalization threshold (${options.base_currency})`}>
            <Input
              inputMode="decimal"
              required
              value={values.capitalization_threshold ?? ""}
              onChange={(e) => set("capitalization_threshold", e.target.value)}
            />
          </Field>
        </Section>
        <AssetCategoryFieldEditor
          fields={fields}
          onChange={(next) => {
            setFields(next);
            setKey(crypto.randomUUID());
            onDirtyChange?.(true);
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit">{busy ? "Saving…" : "Save category"}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
