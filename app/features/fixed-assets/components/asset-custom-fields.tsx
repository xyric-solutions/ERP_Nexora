"use client";
import type { AssetCategory, FixedAsset } from "@nexora/contracts";
import { Input } from "@/components/ui/input";
import { Field, Select } from "./asset-fields";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session/session-provider";

export function AssetCustomFields({
  category,
  value,
  onChange,
  company,
  assetId,
  onUploadStateChange,
}: {
  category: AssetCategory;
  value: FixedAsset["details"];
  onChange: (value: FixedAsset["details"]) => void;
  company: string;
  assetId?: string;
  onUploadStateChange?: (busy: boolean) => void;
}) {
  const { api, csrfToken } = useSession(),
    [uploading, setUploading] = useState<string | null>(null),
    [error, setError] = useState("");
  const currentValue = useRef(value);
  useEffect(() => {
    currentValue.current = value;
  }, [value]);
  return (
    <>
      {(category.field_definitions ?? []).map((field) => {
        const current = value.custom_fields?.[field.key];
        const change = (text: string) => {
          const latest = currentValue.current,
            fields = { ...latest.custom_fields };
          if (text === "") delete fields[field.key];
          else fields[field.key] = field.type === "number" ? Number(text) : text;
          onChange({ ...latest, custom_fields: fields });
        };
        return (
          <Field
            key={field.key}
            label={field.label}
            hint={
              field.type === "document"
                ? `Private PDF, PNG or JPEG, up to 10 MB. ${uploading === field.key ? "Uploading private document…" : current ? "Document uploaded; save the form to retain it." : "Saved with the asset after registration."}`
                : undefined
            }
          >
            {field.type === "document" ? (
              <Input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                aria-label={`Upload ${field.label}`}
                disabled={uploading !== null}
                required={field.required && !current}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setUploading(field.key);
                  onUploadStateChange?.(true);
                  setError("");
                  try {
                    const payload = { company_id: company, title: field.label };
                    const document = assetId
                      ? await api.uploadFixedAssetAttachment(assetId, payload, file, csrfToken(), crypto.randomUUID())
                      : await api.stageFixedAssetDocument(payload, file, csrfToken(), crypto.randomUUID());
                    change(`${assetId ? "attachment" : "staged"}:${document.id}`);
                  } catch (failure) {
                    setError(failure instanceof Error ? failure.message : "Document upload failed.");
                  } finally {
                    setUploading(null);
                    onUploadStateChange?.(false);
                    event.target.value = "";
                  }
                }}
              />
            ) : field.type === "select" ? (
              <Select
                value={String(current ?? "")}
                required={field.required}
                items={(field.options ?? []).map((option) => ({ id: option, name: option }))}
                onChange={(event) => change(event.target.value)}
              />
            ) : (
              <Input
                type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                step={field.type === "number" ? "any" : undefined}
                required={field.required}
                maxLength={2000}
                value={current ?? ""}
                onChange={(event) => change(event.target.value)}
              />
            )}
          </Field>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
