"use client";
import { useState } from "react";
import { assetUpdateSchema, assetPolicyStart, type FixedAsset, type AssetUpdate } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Section, PhysicalFields, Select } from "./asset-fields";
import { AssetCustomFields } from "./asset-custom-fields";
export function AssetDetailEditor({
  asset,
  busy,
  onSave,
  onCancel,
  onDirtyChange,
}: {
  asset: FixedAsset;
  busy: boolean;
  onSave: (input: AssetUpdate, key: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [details, setDetails] = useState(asset.details),
    [values, setValues] = useState(() => ({
      residual_value: asset.residual_value,
      useful_life_months: String(asset.useful_life_months),
      method: asset.method,
      annual_rate_percent: String(asset.annual_rate_percent),
      in_service_date: asset.in_service_date,
      depreciation_start: asset.depreciation_start,
    })),
    [reason, setReason] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [error, setError] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const change = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (uploadBusy) throw Error("Wait for the private document upload to finish.");
      const input = assetUpdateSchema.parse({
        company_id: asset.company_id,
        expected_version: asset.version,
        details,
        reason,
        ...(asset.status === "draft"
          ? {
              depreciation: {
                ...values,
                useful_life_months: Number(values.useful_life_months),
                annual_rate_percent: Number(values.annual_rate_percent),
              },
            }
          : {}),
      });
      await onSave(input, key);
      onDirtyChange?.(false);
    } catch (error) {
      setError(
        error instanceof Error && "issues" in error
          ? "Check the required fields and draft depreciation policy."
          : error instanceof Error
            ? error.message
            : "Asset update failed.",
      );
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4"
      onChangeCapture={() => {
        setKey(crypto.randomUUID());
        onDirtyChange?.(true);
      }}
    >
      <fieldset disabled={busy || uploadBusy} className="min-w-0 space-y-4">
        <Section title="Edit asset details">
          <PhysicalFields value={details} onChange={setDetails} />
          <AssetCustomFields
            company={asset.company_id}
            onUploadStateChange={setUploadBusy}
            assetId={asset.id}
            category={asset.category}
            value={details}
            onChange={setDetails}
          />
          <Field label="Serial number">
            <Input
              maxLength={128}
              value={details.serial_number}
              onChange={(e) => setDetails({ ...details, serial_number: e.target.value })}
            />
          </Field>
        </Section>
        {asset.status === "draft" && (
          <Section
            title="Draft depreciation policy"
            description="These terms can be corrected before submission. Acquisition cost and source evidence remain linked to the posted transaction."
          >
            <Field label="Residual value">
              <Input
                inputMode="decimal"
                required
                value={values.residual_value}
                onChange={(e) => change("residual_value", e.target.value)}
              />
            </Field>
            <Field label="Useful life (months)">
              <Input
                type="number"
                min={1}
                max={1200}
                required
                value={values.useful_life_months}
                onChange={(e) => change("useful_life_months", e.target.value)}
              />
            </Field>
            <Field label="Depreciation method">
              <Select
                required
                value={values.method}
                items={[
                  { id: "straight_line", name: "Straight line" },
                  { id: "reducing_balance", name: "Reducing balance" },
                  { id: "double_declining", name: "Double declining balance" },
                ]}
                onChange={(e) => change("method", e.target.value)}
              />
            </Field>
            <Field label="Annual reducing balance rate (%)">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.0001"
                required
                value={values.annual_rate_percent}
                onChange={(e) => change("annual_rate_percent", e.target.value)}
              />
            </Field>
            <Field label="Available for use">
              <Input
                type="date"
                min={asset.acquisition_date}
                required
                value={values.in_service_date}
                onChange={(e) =>
                  setValues((current) => ({
                    ...current,
                    in_service_date: e.target.value,
                    depreciation_start: assetPolicyStart(asset.category, e.target.value),
                  }))
                }
              />
            </Field>
            <Field label="Depreciation commencement">
              <Input
                type="date"
                min={values.in_service_date}
                required
                value={values.depreciation_start}
                readOnly={asset.category.allow_start_override === false}
                onChange={(e) => change("depreciation_start", e.target.value)}
              />
            </Field>
          </Section>
        )}
        <Field label="Edit reason">
          <Input required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit">Save asset details</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel edit
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
