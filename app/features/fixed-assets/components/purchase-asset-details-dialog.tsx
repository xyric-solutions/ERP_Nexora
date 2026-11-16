"use client";
import { useState } from "react";
import {
  assetUnitInputSchema,
  purchaseAssetRegistrationSchema,
  decimal,
  decimalText,
  divideRounded,
  validateAssetCustomFields,
  assetPolicyStart,
  type AssetCategory,
  type AssetOptions,
  type AssetUnitInput,
  type PurchaseLine,
  type PurchaseAssetRegistration,
} from "@nexora/contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Section, PhysicalFields, AssignmentFields, Select, moneyLabel } from "./asset-fields";
import { AssetCustomFields } from "./asset-custom-fields";

export function PurchaseAssetDetailsDialog({
  line,
  category,
  options,
  currency,
  date,
  onSave,
  onClose,
  company,
}: {
  line: PurchaseLine;
  category: AssetCategory;
  options: AssetOptions;
  currency: string;
  date: string;
  onSave: (value: PurchaseAssetRegistration) => void;
  onClose: () => void;
  company: string;
}) {
  const generate = (): AssetUnitInput[] =>
    Array.from({ length: Math.max(1, Math.min(100, Number(line.quantity) || 1)) }, (_, index) =>
      assetUnitInputSchema.parse({
        ...line.asset_registration?.units[index],
        unit_id: line.asset_registration?.units[index]?.unit_id ?? crypto.randomUUID(),
        details: line.asset_registration?.units[index]?.details ?? {
          name: line.description.trim().length >= 2 ? line.description : "New asset",
          condition: "new",
          uom: line.uom,
        },
        cost: line.unit_price,
        residual_value: decimalText(
          divideRounded(decimal(line.unit_price, 2) * BigInt(Math.round(category.residual_percent * 10000)), 1000000n),
          2,
        ),
        useful_life_months: category.useful_life_months,
        method: category.method,
        annual_rate_percent: category.annual_rate_percent,
        in_service_date: date,
        depreciation_start: assetPolicyStart(category, date),
        assignment: line.asset_registration?.units[index]?.assignment ?? {},
      }),
    );
  const [units, setUnits] = useState(() => line.asset_registration?.units ?? generate()),
    [selected, setSelected] = useState(0),
    [uploadBusy, setUploadBusy] = useState(false),
    [error, setError] = useState("");
  const [overrideReason, setOverrideReason] = useState(line.asset_registration?.reason ?? "");
  const unit = units[selected]!;
  const update = (patch: Partial<AssetUnitInput>) =>
    setUnits((current) => current.map((value, index) => (index === selected ? { ...value, ...patch } : value)));
  const total = units.reduce((sum, value) => {
    try {
      if (uploadBusy) throw Error("Wait for the private document upload to finish.");
      return sum + decimal(value.cost, 2);
    } catch {
      return sum;
    }
  }, 0n);
  function save(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setError("");
    try {
      const value = purchaseAssetRegistrationSchema.parse({
        ...(overrideReason.trim() ? { reason: overrideReason.trim() } : {}),
        category_version: category.version,
        company_policy_version: category.company_policy_version,
        units,
      });
      if (
        decimal(line.quantity, 4) !== BigInt(units.length) * 10000n ||
        total !== decimal(line.unit_price, 2) * BigInt(units.length)
      )
        throw Error("Unit count and costs must equal the bill line quantity and net amount.");
      for (const item of units) {
        const invalid = validateAssetCustomFields(category.field_definitions ?? [], item.details.custom_fields);
        if (invalid) throw Error(invalid);
      }
      onSave(value);
    } catch (failure) {
      setError(
        failure instanceof Error && "issues" in failure
          ? "Complete required asset fields and depreciation terms."
          : failure instanceof Error
            ? failure.message
            : "Check asset details.",
      );
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !uploadBusy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add Asset Details</DialogTitle>
          <DialogDescription>
            Save individual assets with this bill. Asset IDs and codes are allocated when Accounting posts the invoice;
            approval and activation remain separate.
          </DialogDescription>
        </DialogHeader>
        <form className="flex min-w-0 flex-col gap-4" onSubmit={save}>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Individual asset">
              <Select
                value={String(selected)}
                disabled={uploadBusy}
                items={units.map((value, index) => ({
                  id: String(index),
                  name: `${index + 1}. ${value.details.name}`,
                }))}
                onChange={(event) => setSelected(Number(event.target.value))}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={uploadBusy}
              onClick={() => {
                setUnits(generate());
                setSelected(0);
              }}
            >
              Generate / reallocate from quantity
            </Button>
            <p className="text-sm text-muted-foreground">
              {units.length} units · {moneyLabel(decimalText(total, 2))} {currency}
            </p>
          </div>
          <Section title={`General information · unit ${selected + 1}`}>
            <PhysicalFields value={unit.details} onChange={(details) => update({ details })} />
            <Field label="Serial number">
              <Input
                value={unit.details.serial_number}
                maxLength={128}
                onChange={(event) => update({ details: { ...unit.details, serial_number: event.target.value } })}
              />
            </Field>
            <AssetCustomFields
              company={company}
              onUploadStateChange={setUploadBusy}
              category={category}
              value={unit.details}
              onChange={(details) => update({ details })}
            />
          </Section>
          <Section
            title="Cost and depreciation"
            description={`Source: ${line.description} · ${category.name} · ${currency}. Invoice/purchase references are retained on the bill.`}
          >
            <Field label={`Acquisition cost (${currency})`}>
              <Input
                required
                inputMode="decimal"
                value={unit.cost}
                onChange={(event) => update({ cost: event.target.value })}
              />
            </Field>
            <Field label={`Residual value (${currency})`}>
              <Input
                required
                inputMode="decimal"
                value={unit.residual_value}
                onChange={(event) => update({ residual_value: event.target.value })}
              />
            </Field>
            <Field label="Useful life (months)">
              <Input
                type="number"
                min={1}
                max={1200}
                required
                value={unit.useful_life_months}
                disabled={category.allow_policy_override === false}
                onChange={(event) => update({ useful_life_months: Number(event.target.value) })}
              />
            </Field>
            <Field label="Depreciation method">
              <Select
                required
                value={unit.method}
                disabled={category.allow_policy_override === false}
                items={[
                  { id: "straight_line", name: "Straight line" },
                  { id: "reducing_balance", name: "Declining balance" },
                  { id: "double_declining", name: "Double declining balance" },
                ]}
                onChange={(event) => update({ method: assetUnitInputSchema.shape.method.parse(event.target.value) })}
              />
            </Field>
            <Field label="Annual declining rate (%)">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.0001"
                disabled={unit.method !== "reducing_balance" || category.allow_policy_override === false}
                value={unit.annual_rate_percent}
                onChange={(event) => update({ annual_rate_percent: Number(event.target.value) })}
              />
            </Field>
            <Field label="Available for use">
              <Input
                type="date"
                min={date}
                required
                value={unit.in_service_date}
                onChange={(event) =>
                  update({
                    in_service_date: event.target.value,
                    depreciation_start: assetPolicyStart(category, event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Depreciation start">
              <Input
                type="date"
                min={unit.in_service_date}
                required
                value={unit.depreciation_start}
                readOnly={category.allow_start_override === false}
                onChange={(event) => update({ depreciation_start: event.target.value })}
              />
            </Field>
          </Section>
          <Section title="Responsibility and location">
            <AssignmentFields
              value={unit.assignment}
              options={options}
              onChange={(assignment) => update({ assignment })}
            />
          </Section>
          <Field
            label="Depreciation override reason"
            hint="Required when commencement differs from the category's approved default."
          >
            <Input
              maxLength={400}
              minLength={3}
              required={units.some(
                (item) => item.depreciation_start !== assetPolicyStart(category, item.in_service_date),
              )}
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={uploadBusy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploadBusy}>
              Save Asset Details
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
