"use client";
import { useState, type ComponentProps, type ReactNode } from "react";
import type { FixedAsset, AssetOptions } from "@nexora/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/shared/ui/labeled-field";
import { workSelectClass } from "@/shared/ui/work-table";

export { LabeledField as Field };
export const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export function moneyLabel(value: string, places = 2) {
  const negative = value.startsWith("-"),
    [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  return `${negative ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${places ? "." + fraction.padEnd(places, "0").slice(0, places) : ""}`;
}
export function Section({
  title,
  children,
  description,
}: {
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <section className="min-w-0 space-y-4 rounded-lg border bg-card p-4">
      <header>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
export function Select({
  items,
  placeholder = "Select…",
  ...props
}: ComponentProps<"select"> & { items: readonly { id: string; code?: string; name: string }[]; placeholder?: string }) {
  return (
    <select className={workSelectClass} {...props}>
      <option value="">{placeholder}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.code ? `${item.code} · ` : ""}
          {item.name}
        </option>
      ))}
    </select>
  );
}
export function AssignmentFields({
  value,
  onChange,
  options,
}: {
  value: FixedAsset["assignment"];
  onChange: (value: FixedAsset["assignment"]) => void;
  options: AssetOptions;
}) {
  return (
    <>
      {(
        [
          ["custodian_id", "Custodian", "employees"],
          ["department_id", "Department", "departments"],
          ["branch_id", "Branch", "branches"],
          ["location_id", "Location", "locations"],
          ["project_id", "Project", "projects"],
        ] as const
      ).map(([field, label, source]) => (
        <LabeledField key={field} label={label}>
          <Select
            value={value[field] ?? ""}
            items={options[source]}
            placeholder="Unassigned"
            onChange={(event) => onChange({ ...value, [field]: event.target.value || null })}
          />
        </LabeledField>
      ))}
    </>
  );
}
export function PhysicalFields({
  value,
  onChange,
}: {
  value: FixedAsset["details"];
  onChange: (value: FixedAsset["details"]) => void;
}) {
  const set = (field: keyof FixedAsset["details"], text: string | null) => onChange({ ...value, [field]: text });
  return (
    <>
      <LabeledField label="Asset name">
        <Input
          required
          maxLength={200}
          minLength={2}
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </LabeledField>
      {(
        [
          ["brand", "Brand"],
          ["model", "Model"],
          ["barcode", "Barcode / QR reference"],
          ["warranty_provider", "Warranty provider"],
          ["maintenance_provider", "Maintenance provider"],
        ] as const
      ).map(([field, label]) => (
        <LabeledField key={field} label={label}>
          <Input value={value[field]} maxLength={500} onChange={(e) => set(field, e.target.value)} />
        </LabeledField>
      ))}
      <LabeledField label="Physical condition">
        <select
          className={workSelectClass}
          value={value.condition}
          onChange={(e) => onChange({ ...value, condition: e.target.value as FixedAsset["details"]["condition"] })}
        >
          {["new", "good", "fair", "damaged", "missing"].map((value) => (
            <option key={value} value={value}>
              {value.replace("_", " ")}
            </option>
          ))}
        </select>
      </LabeledField>
      {(
        [
          ["warranty_start", "Warranty start"],
          ["warranty_end", "Warranty end"],
          ["verification_due", "Verification due"],
        ] as const
      ).map(([field, label]) => (
        <LabeledField key={field} label={label}>
          <Input type="date" value={value[field] ?? ""} onChange={(e) => set(field, e.target.value || null)} />
        </LabeledField>
      ))}
      <LabeledField className="sm:col-span-2" label="Description">
        <Textarea value={value.description} maxLength={500} onChange={(e) => set("description", e.target.value)} />
      </LabeledField>
      <LabeledField
        label="Supporting document references"
        hint="One invoice, image or supporting-document reference per line. References are stored in the audit history."
      >
        <EvidenceInput value={value.evidence} onChange={(evidence) => onChange({ ...value, evidence })} />
      </LabeledField>
    </>
  );
}
function EvidenceInput({
  value,
  onChange,
  id,
}: {
  value: FixedAsset["details"]["evidence"];
  onChange: (value: FixedAsset["details"]["evidence"]) => void;
  id?: string;
}) {
  const [text, setText] = useState(() => value.map((item) => item.reference).join("\n"));
  return (
    <Textarea
      id={id}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split("\n")
            .filter(Boolean)
            .map((reference) => ({ reference, description: "" })),
        );
      }}
    />
  );
}
