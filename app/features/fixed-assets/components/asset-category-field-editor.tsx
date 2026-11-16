"use client";
import { assetFieldDefinitionSchema, type AssetFieldDefinition } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Select } from "./asset-fields";
export function AssetCategoryFieldEditor({
  fields,
  onChange,
}: {
  fields: AssetFieldDefinition[];
  onChange: (fields: AssetFieldDefinition[]) => void;
}) {
  const change = (index: number, patch: Partial<AssetFieldDefinition>) =>
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Additional category fields</h2>
      <p className="text-sm text-muted-foreground">
        These fields appear only for this category. Existing assets keep their approved field definitions.
      </p>
      {fields.map((field, index) => (
        <div key={field.key} className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Field label">
            <Input
              required
              maxLength={100}
              value={field.label}
              onChange={(event) => change(index, { label: event.target.value })}
            />
          </Field>
          <Field label="Field type">
            <Select
              required
              value={field.type}
              items={[
                { id: "text", name: "Text" },
                { id: "number", name: "Number" },
                { id: "date", name: "Date" },
                { id: "select", name: "Choice" },
                { id: "document", name: "Document reference" },
              ]}
              onChange={(event) =>
                change(index, { type: assetFieldDefinitionSchema.shape.type.parse(event.target.value) })
              }
            />
          </Field>
          <label htmlFor={`asset-field-required-${field.key}`} className="inline-flex items-center gap-2 text-sm">
            <Checkbox
              id={`asset-field-required-${field.key}`}
              checked={field.required}
              onCheckedChange={(value) => change(index, { required: value === true })}
            />
            Required
          </label>
          <Button type="button" variant="outline" onClick={() => onChange(fields.filter((_, i) => i !== index))}>
            Remove {field.label || "field"}
          </Button>
          {field.type === "select" && (
            <Field label="Choices (comma separated)">
              <Input
                value={(field.options ?? []).join(", ")}
                onChange={(event) =>
                  change(index, {
                    options: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={fields.length >= 40}
        onClick={() =>
          onChange([
            ...fields,
            { key: `field_${crypto.randomUUID().replaceAll("-", "_")}`, label: "", type: "text", required: false },
          ])
        }
      >
        Add field
      </Button>
    </section>
  );
}
