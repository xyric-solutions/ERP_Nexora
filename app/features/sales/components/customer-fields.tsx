"use client";

/**
 * Input controls for the customer form: searchable country and calling-code
 * selectors, an international phone field and a prototype attachment list.
 */

import { useId, useRef, useState, type ReactNode } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRIES, countryFlag, findCountry } from "@/shared/constants/countries";
import { SearchableSelect, type SearchableSelectOption } from "@/shared/ui/searchable-select";
import { cn } from "cn";
import { selectClass } from "./sales-ui";
import { stamp } from "../model/sales-format";
import type { CustomerAttachment } from "../model/sales-types";

const COUNTRY_OPTIONS: SearchableSelectOption[] = COUNTRIES.map((country) => ({
  value: country.code,
  label: `${countryFlag(country.code)} ${country.name}`,
}));

const DIAL_OPTIONS: SearchableSelectOption[] = COUNTRIES.map((country) => ({
  value: country.code,
  label: `${countryFlag(country.code)} ${country.name} (+${country.dial})`,
}));

/** Label + control + message for controls that a single <label> cannot wrap (selectors with popups, grouped inputs). */
export function GroupField({
  label,
  required,
  optional,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: (labelId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <span id={id} className="text-xs font-semibold text-muted-foreground">
        {label}
        {required ? (
          <b className="text-[var(--nx-danger)]" aria-hidden="true">
            {" "}
            *
          </b>
        ) : null}
        {optional ? <span className="font-normal"> (optional)</span> : null}
      </span>
      {children(id)}
      {error ? <small className="text-xs font-semibold text-[var(--nx-danger)]">{error}</small> : null}
      {hint && !error ? <small className="text-xs text-muted-foreground">{hint}</small> : null}
    </div>
  );
}

export function CountrySelect({
  label,
  value,
  onChange,
  error,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  error?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <GroupField label={label} error={error} hint={hint} className={className}>
      {() => (
        <SearchableSelect
          label={label}
          value={value}
          options={COUNTRY_OPTIONS}
          onValueChange={(code) => code && onChange(code)}
          placeholder="Select country"
          searchLabel={`Search ${label.toLowerCase()}`}
          searchPlaceholder="Search country…"
          invalid={Boolean(error)}
        />
      )}
    </GroupField>
  );
}

/** Calling-code selector (country, flag, +code) followed by the national number. */
export function InternationalPhoneField({
  label,
  country,
  number,
  onChange,
  error,
}: {
  label: string;
  country: string;
  number: string;
  onChange: (patch: { country?: string; number?: string }) => void;
  error?: string;
}) {
  const dial = findCountry(country)?.dial;
  return (
    <GroupField label={label} error={error} hint={dial ? `Saved as +${dial} followed by the number.` : undefined}>
      {(labelId) => (
        <div className="grid grid-cols-[minmax(7.5rem,9rem)_minmax(0,1fr)] gap-1.5">
          <SearchableSelect
            label={`${label} country calling code`}
            value={country}
            options={DIAL_OPTIONS}
            onValueChange={(code) => code && onChange({ country: code })}
            placeholder="Code"
            valueLabel={(option) => `${countryFlag(option.value)} +${findCountry(option.value)?.dial ?? ""}`}
            searchLabel="Search country or calling code"
            searchPlaceholder="Search country or code…"
            invalid={Boolean(error)}
          />
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            aria-labelledby={labelId}
            value={number}
            placeholder="42 3575 1100"
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange({ number: event.target.value })}
          />
        </div>
      )}
    </GroupField>
  );
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,.p7s,.cer,.pfx";

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Attachment picker for one or more categories. Prototype: files stay in this
 * browser session and are not uploaded to the files service.
 */
export function AttachmentList({
  title,
  categories,
  attachments,
  actor,
  onChange,
}: {
  title: string;
  categories: readonly string[];
  attachments: readonly CustomerAttachment[];
  actor: string;
  onChange: (next: CustomerAttachment[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState(categories[0]);
  const [error, setError] = useState("");
  const mine = attachments.filter((item) => categories.includes(item.category));

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    const accepted: CustomerAttachment[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(file.name);
        continue;
      }
      accepted.push({
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        category,
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file),
        addedAt: stamp(),
        addedBy: actor,
      });
    }
    setError(rejected.length ? `Not added (over 10 MB): ${rejected.join(", ")}` : "");
    onChange([...attachments, ...accepted]);
    if (input.current) input.current.value = "";
  };

  const remove = (item: CustomerAttachment) => {
    if (item.url.startsWith("blob:")) URL.revokeObjectURL(item.url);
    onChange(attachments.filter((candidate) => candidate.id !== item.id));
  };

  return (
    <div className="col-span-full grid gap-2 rounded border border-dashed border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <span className="text-xs font-semibold text-muted-foreground">
            {title} <span className="font-normal">(optional)</span>
          </span>
          <span className="text-xs text-muted-foreground">
            PDF, image, Word, Excel or certificate files up to 10 MB.
          </span>
        </div>
        {categories.length > 1 ? (
          <select
            className={cn(selectClass, "w-auto")}
            aria-label="Document type"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        ) : null}
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => add(event.target.files)}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>
          <Paperclip /> Attach file
        </Button>
      </div>
      {error ? (
        <small className="text-xs font-semibold text-[var(--nx-danger)]" role="alert">
          {error}
        </small>
      ) : null}
      {mine.length ? (
        <ul className="m-0 grid list-none gap-1 p-0">
          {mine.map((item) => (
            <li key={item.id} className="flex min-w-0 items-center gap-2 rounded bg-muted px-2.5 py-1.5 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate font-medium text-[var(--nx-brand)] underline-offset-2 hover:underline"
              >
                {item.name}
              </a>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {item.category} · {fileSize(item.size)}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${item.name}`}
                onClick={() => remove(item)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-muted-foreground">No files attached.</span>
      )}
    </div>
  );
}
