"use client";
import { useState } from "react";
import {
  assetCompanyPolicyInputSchema,
  type AssetCompanyPolicy,
  type AssetCompanyPolicyInput,
  type AssetOptions,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Section, Select } from "./asset-fields";
export function AssetCompanyPolicyForm({
  company,
  policy,
  busy,
  onSave,
  onDirtyChange,
}: {
  company: string;
  policy: AssetCompanyPolicy | null;
  busy: boolean;
  onSave: (value: AssetCompanyPolicyInput, key: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [value, setValue] = useState<AssetCompanyPolicyInput>(() =>
      assetCompanyPolicyInputSchema.parse({
        company_id: company,
        expected_version: policy?.version ?? 0,
        method: policy?.method ?? "straight_line",
        useful_life_months: policy?.useful_life_months ?? 60,
        annual_rate_percent: policy?.annual_rate_percent ?? 20,
        residual_percent: policy?.residual_percent ?? 0,
        summary_frequency: policy?.summary_frequency ?? "monthly",
        start_rule: policy?.start_rule ?? "available_for_use",
        allow_start_override: policy?.allow_start_override ?? true,
        allow_category_overrides: policy?.allow_category_overrides ?? true,
        auto_prepare_monthly: policy?.auto_prepare_monthly ?? false,
      }),
    ),
    [error, setError] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <form
      className="flex flex-col gap-4"
      onChangeCapture={() => {
        setKey(crypto.randomUUID());
        onDirtyChange?.(true);
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          await onSave(assetCompanyPolicyInputSchema.parse(value), key);
          onDirtyChange?.(false);
        } catch (failure) {
          setError(
            failure instanceof Error && "issues" in failure
              ? "Check the required policy settings."
              : failure instanceof Error
                ? failure.message
                : "Policy save failed.",
          );
        }
      }}
    >
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        <Section
          title="Company Asset Policy"
          description="New registrations inherit these settings when configured. Existing approved assets retain their policy snapshots. Daily accrual is reported separately from posted GL balances."
        >
          <Field label="Default method">
            <Select
              required
              value={value.method}
              items={[
                { id: "straight_line", name: "Straight line" },
                { id: "reducing_balance", name: "Declining balance" },
                { id: "double_declining", name: "Double declining balance" },
              ]}
              onChange={(event) =>
                setValue({ ...value, method: assetCompanyPolicyInputSchema.shape.method.parse(event.target.value) })
              }
            />
          </Field>
          {(
            [
              ["useful_life_months", "Useful life (months)", 1, 1200],
              ["annual_rate_percent", "Annual declining rate (%)", 0.0001, 100],
              ["residual_percent", "Residual value (%)", 0, 100],
            ] as const
          ).map(([field, label, min, max]) => (
            <Field key={field} label={label}>
              <Input
                required
                type="number"
                min={min}
                max={max}
                step={field === "useful_life_months" ? 1 : "0.0001"}
                value={value[field]}
                onChange={(event) => setValue({ ...value, [field]: Number(event.target.value) })}
              />
            </Field>
          ))}
          <Field label="Calculation summaries">
            <Select
              required
              value={value.summary_frequency}
              items={[
                { id: "daily", name: "Daily" },
                { id: "monthly", name: "Monthly" },
                { id: "quarterly", name: "Quarterly" },
                { id: "annual", name: "Annual" },
              ]}
              onChange={(event) =>
                setValue({
                  ...value,
                  summary_frequency: assetCompanyPolicyInputSchema.shape.summary_frequency.parse(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Default commencement">
            <Select
              required
              value={value.start_rule}
              items={[
                { id: "available_for_use", name: "Available-for-use date" },
                { id: "next_month", name: "First day of following month" },
              ]}
              onChange={(event) =>
                setValue({
                  ...value,
                  start_rule: assetCompanyPolicyInputSchema.shape.start_rule.parse(event.target.value),
                })
              }
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Actual/Actual uses 365/366 calendar-year days. Journals are prepared monthly and require independent
            approval before explicit posting.
          </p>
          {(
            [
              ["allow_start_override", "Allow authorized commencement overrides"],
              ["allow_category_overrides", "Allow category-specific policies"],
              ["auto_prepare_monthly", "Automatically prepare monthly draft runs"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="inline-flex items-center gap-2 text-sm">
              <Checkbox
                checked={value[field]}
                onCheckedChange={(checked) => setValue({ ...value, [field]: checked === true })}
              />
              {label}
            </label>
          ))}
        </Section>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="self-start">
          {busy ? "Saving…" : "Save Asset Policy"}
        </Button>
      </fieldset>
    </form>
  );
}
export function AssetNominalClassificationForm({
  options,
  busy,
  onSave,
}: {
  options: AssetOptions;
  busy: boolean;
  onSave: (id: string, version: number, active: boolean, reason: string) => Promise<void>;
}) {
  const [account, setAccount] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const selected = options.accounts.find((value) => value.id === account);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        if (!selected) return;
        try {
          await onSave(selected.id, selected.classification_version ?? 0, !selected.fixed_asset, reason);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Classification failed.");
        }
      }}
    >
      <Section
        title="Chart of Accounts · Fixed Asset classification"
        description="Classify any eligible asset nominal. Bank, AP/AR and tax controls cannot be used as fixed asset acquisition accounts."
      >
        <Field label="Asset nominal">
          <Select
            required
            value={account}
            items={options.accounts.filter((value) => value.type === "asset")}
            onChange={(event) => setAccount(event.target.value)}
          />
        </Field>
        <Field label="Classification reason">
          <Input
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <p className="text-sm text-muted-foreground">
            {selected?.fixed_asset ? "Classified as Fixed Asset" : "No active Fixed Asset classification"}
          </p>
          <Button type="submit" variant="outline" disabled={busy || !selected}>
            {selected?.fixed_asset ? "Remove classification" : "Classify as Fixed Asset"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </Section>
    </form>
  );
}
