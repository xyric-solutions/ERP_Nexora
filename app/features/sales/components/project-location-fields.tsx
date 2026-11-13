"use client";

/**
 * Required Project and Location fields for every Sales transaction form.
 *
 * Options are the signed-in company's active Project and Location masters
 * from the Master Data API (`/api/v1/master_data/{projects|locations}`), the
 * same records Banking and HR use. Each list is loaded once per company and
 * shared by every Sales form; the chosen record's code and name are kept on
 * the Sales record so it can be shown without another request.
 */

import { useEffect, useState } from "react";
import type { ReferenceMasterKind } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "cn";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { Field, ReadField, salesLayer } from "./sales-ui";
import { referenceLabel } from "../model/sales-workflow";
import type { SalesContextFields, SalesReference } from "../model/sales-types";

type Api = ReturnType<typeof useSession>["api"];

interface OptionsState {
  items: SalesReference[];
  loading: boolean;
  error: string;
}

const PAGE = 100;
/** Most masters a form loads; companies with more should search the Master Data screen. */
const MAX_PAGES = 10;
const cache = new Map<string, Promise<SalesReference[]>>();

async function loadAll(api: Api, kind: ReferenceMasterKind, company: string): Promise<SalesReference[]> {
  const items: SalesReference[] = [];
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ company_id: company, status: "active", limit: String(PAGE), ...(cursor ? { cursor } : {}) });
    const result = await api.listReferenceMasters(kind, `?${query}`);
    items.push(...result.items.map((item) => ({ id: item.id, code: item.code, name: item.name })));
    if (!result.next_cursor) break;
    cursor = result.next_cursor;
  }
  return items;
}

function message(kind: ReferenceMasterKind, caught: unknown) {
  const noun = kind === "projects" ? "projects" : "locations";
  if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403))
    return `You do not have access to ${noun}. Ask an administrator for Master Data read access.`;
  return `The ${noun} could not be loaded.`;
}

/** Active Project or Location masters of the signed-in company. */
export function useReferenceOptions(kind: ReferenceMasterKind) {
  const { api, session } = useSession();
  const company = session?.active_company?.id ?? "";
  const key = `${session?.tenant_id ?? ""}:${company}:${kind}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<OptionsState & { key: string }>({ key: "", items: [], loading: true, error: "" });

  useEffect(() => {
    if (!company) return;
    let active = true;
    let request = cache.get(key);
    if (!request) {
      request = loadAll(api, kind, company);
      cache.set(key, request);
      // A failed load is retried on the next attempt instead of being cached.
      request.catch(() => cache.delete(key));
    }
    request
      .then((items) => active && setState({ key, items, loading: false, error: "" }))
      .catch((caught) => active && setState({ key, items: [], loading: false, error: message(kind, caught) }));
    return () => {
      active = false;
    };
  }, [api, company, key, kind, attempt]);

  const current = state.key === key ? state : { items: [], loading: Boolean(company), error: "" };
  return {
    ...current,
    error: company ? current.error : "Choose a company at sign-in to load projects and locations.",
    retry: () => {
      cache.delete(key);
      setState({ key, items: [], loading: true, error: "" });
      setAttempt((value) => value + 1);
    },
  };
}

function ReferenceSelect({
  kind,
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  kind: ReferenceMasterKind;
  label: string;
  value: SalesReference | undefined;
  error?: string;
  disabled?: boolean;
  onChange: (value: SalesReference | undefined) => void;
}) {
  const options = useReferenceOptions(kind);
  // A record may keep a master that has since been made inactive; show it rather than an empty field.
  const kept = value && !options.items.some((item) => item.id === value.id) ? [value] : [];
  const list = [...kept, ...options.items];
  return (
    <Field label={label} required error={error || options.error || undefined}>
      <SearchableSelect
        label={label}
        required
        value={value?.id ?? ""}
        invalid={Boolean(error || options.error)}
        disabled={disabled || Boolean(options.error)}
        loading={options.loading}
        options={list.map((item) => ({ value: item.id, label: referenceLabel(item) }))}
        placeholder={options.loading ? "Loading…" : list.length ? `Select ${label.toLowerCase()}` : `No active ${label.toLowerCase()}s`}
        searchLabel={`Search ${label.toLowerCase()}s`}
        searchPlaceholder="Search by code or name…"
        onValueChange={(id) => onChange(list.find((item) => item.id === id))}
      />
      {options.error ? (
        <Button type="button" size="sm" variant="link" className="h-auto justify-start p-0" onClick={options.retry}>
          Retry {label.toLowerCase()}s
        </Button>
      ) : null}
    </Field>
  );
}

/**
 * Project and Location selects, both required. Place inside a form grid;
 * the two fields take one grid cell each.
 */
export function ProjectLocationFields({
  value,
  errors,
  onChange,
  disabled,
}: {
  value: SalesContextFields;
  errors?: Partial<Record<"project" | "location", string>>;
  onChange: (patch: SalesContextFields) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <ReferenceSelect kind="projects" label="Project" value={value.project} error={errors?.project} disabled={disabled} onChange={(project) => onChange({ project })} />
      <ReferenceSelect kind="locations" label="Location" value={value.location} error={errors?.location} disabled={disabled} onChange={(location) => onChange({ location })} />
    </>
  );
}

/** Read-only Project and Location, for record panels. */
export function ProjectLocationRead({ value }: { value: SalesContextFields }) {
  return (
    <>
      <ReadField label="Project">{referenceLabel(value.project) || "Not set"}</ReadField>
      <ReadField label="Location">{referenceLabel(value.location) || "Not set"}</ReadField>
    </>
  );
}

/**
 * Asks for the Project and Location before a one-click action creates a
 * transaction from a record saved before both were required (for example,
 * Confirm Order on an older approved quotation).
 */
export function ProjectLocationDialog({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (value: Required<SalesContextFields>) => void;
}) {
  const [value, setValue] = useState<SalesContextFields>({});
  const [errors, setErrors] = useState<Partial<Record<"project" | "location", string>>>({});
  const confirm = () => {
    const found = {
      ...(value.project ? {} : { project: "Select a project." }),
      ...(value.location ? {} : { location: "Select a location." }),
    };
    setErrors(found);
    if (value.project && value.location) onConfirm({ project: value.project, location: value.location });
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent overlayClassName={salesLayer.dialogOverlay} className={cn("sm:max-w-lg", salesLayer.dialog)}>
        <DialogHeader>
          <DialogTitle className="m-0">{title}</DialogTitle>
          <DialogDescription className="m-0">{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <ProjectLocationFields
            value={value}
            errors={errors}
            onChange={(patch) => {
              setValue((current) => ({ ...current, ...patch }));
              setErrors((current) => ({ ...current, ...Object.fromEntries(Object.keys(patch).map((key) => [key, undefined])) }));
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={confirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Project" and "Location" rows for a record's KeyValues details. */
export function contextRows(value: SalesContextFields | undefined): [string, string][] {
  return [
    ["Project", referenceLabel(value?.project) || "Not set"],
    ["Location", referenceLabel(value?.location) || "Not set"],
  ];
}
