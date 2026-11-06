"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrMasterDirectory, HrMasterType } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { HrDetailList, HrDetailTile } from "../components/hr-detail-tile";
import { HrApiClient } from "../api/hr-client";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { nextMasterCode } from "../model/hr-master-code";
import { HrMasterStatusBadge } from "../components/hr-master-status-badge";
import { HrMasterDeleteButton } from "../components/hr-master-delete-button";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import { isPayCycle, isPaymentRoute } from "../model/employment-setup";
import { preferredMasterCompany, rememberMasterCompany } from "../model/organisation-master-navigation";

type Record = HrMasterDirectory["items"][number];
type Option = { value: string; label: string };
type ConfigurationKey = "default_nominal" | "working_pattern";
type FieldKey = ConfigurationKey | "payment_route" | "pay_cycle";
type FieldValues = Partial<globalThis.Record<FieldKey, string>>;
type Editor = {
  mode: "create" | "edit";
  code: string;
  name: string;
  description: string;
  values: FieldValues;
};

/** One configured value on a master record; each field becomes a form control, table column and detail tile. */
export type HrConfiguredMasterField = {
  key: FieldKey;
  label: string;
  /** Not shown; kept so older field definitions stay valid. */
  help?: string;
  placeholder?: string;
  options?: readonly Option[];
  /** Options read from live records instead of a fixed list. */
  optionsSource?: "cost_centre_nominals";
  /** An optional field may be left unset. */
  optional?: boolean;
};

export type HrConfiguredMasterSheetDefinition = {
  type: Extract<HrMasterType, "cost_center" | "work_location" | "employment_setup">;
  label: string;
  singular: string;
  guidance: string;
  /** Header of the name column; defaults to the singular label. */
  nameLabel?: string;
  fields: readonly HrConfiguredMasterField[];
  /** Offer "Add" in the record drawer's footer as well as in the toolbar. */
  addFromDrawer?: boolean;
};

function recordValue(record: Record, key: FieldKey): string | null {
  if (key === "payment_route") return record.payment_route;
  if (key === "pay_cycle") return record.pay_cycle;
  return record.configuration_key === key ? record.configuration_value : null;
}

function editorFor(
  record: Record | undefined,
  definition: HrConfiguredMasterSheetDefinition,
  records: readonly Record[],
): Editor {
  const initialValue = (field: HrConfiguredMasterField) =>
    (record ? recordValue(record, field.key) : null) ?? (field.optional ? "" : (field.options?.[0]?.value ?? ""));
  return {
    mode: record ? "edit" : "create",
    code:
      record?.code ??
      nextMasterCode(
        definition.type,
        records.filter((item) => item.type === definition.type).map((item) => item.code),
      ),
    name: record?.name ?? "",
    description: record?.description ?? "",
    values: Object.fromEntries(definition.fields.map((field) => [field.key, initialValue(field)])),
  };
}

function fieldLabel(record: Record, field: HrConfiguredMasterField, liveOptions: readonly Option[] = []): string {
  const value = recordValue(record, field.key);
  if (!value) return "Not configured";
  return [...(field.options ?? []), ...liveOptions].find((option) => option.value === value)?.label ?? value;
}

/** Request terms: configuration key/value, or the employment-setup payment route and pay cycle. */
function termsFor(definition: HrConfiguredMasterSheetDefinition, values: FieldValues) {
  const terms: {
    configuration_key?: ConfigurationKey | null;
    configuration_value?: string | null;
    payment_route?: NonNullable<Record["payment_route"]>;
    pay_cycle?: NonNullable<Record["pay_cycle"]>;
  } = {};
  for (const field of definition.fields) {
    const value = (values[field.key] ?? "").trim();
    if (field.key === "payment_route") {
      if (isPaymentRoute(value)) terms.payment_route = value;
    } else if (field.key === "pay_cycle") {
      if (isPayCycle(value)) terms.pay_cycle = value;
    } else if (value) {
      terms.configuration_key = field.key;
      terms.configuration_value = value;
    } else if (field.optional) {
      terms.configuration_key = null;
      terms.configuration_value = null;
    }
  }
  return terms;
}

export function HrConfiguredMasterSheetWorkspace({ definition }: { definition: HrConfiguredMasterSheetDefinition }) {
  const sectionLabel = definition.label;
  const sectionSingular = definition.singular;
  const sectionKey = definition.type;
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [records, setRecords] = useState<Record[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HrMasterStatus>("active");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  // Loaded nominals are keyed by company, so switching company shows "Loading" until its own list arrives.
  const [nominals, setNominals] = useState<{ companyId: string; options: Option[] }>({ companyId: "", options: [] });
  const usesNominals = definition.fields.some((field) => field.optionsSource === "cost_centre_nominals");
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.master.read");
  const canCreate = permissions.includes("hr.master.create");
  const canUpdate = permissions.includes("hr.master.update");

  const loadRecords = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) return;
      setLoading(true);
      try {
        const { items } = await client.masters({
          companyId: targetCompanyId,
          type: definition.type,
          activeOnly: false,
        });
        setRecords(items);
        setSelectedId((current) => (items.some((record) => record.id === current) ? current : ""));
        setMessage("");
      } catch {
        setMessage(`${sectionLabel} could not be loaded from the authorized API. Refresh your session and try again.`);
      } finally {
        setLoading(false);
      }
    },
    [client, definition.type, sectionLabel],
  );

  useEffect(() => {
    if (sessionLoading || !canRead) {
      return;
    }
    client
      .companies()
      .then((result) => {
        setCompanies(result.items);
        const first = preferredMasterCompany(result.items);
        setCompanyId(first);
        return loadRecords(first);
      })
      .catch(() => {
        setMessage("Authorized companies could not be loaded. Refresh your session and sign in again if needed.");
        setLoading(false);
      });
  }, [canRead, client, loadRecords, sessionLoading]);

  // Finance owns the nominals; HR only reads the active ones of the selected company.
  useEffect(() => {
    if (!usesNominals || !companyId || !canRead) return;
    let cancelled = false;
    client
      .costCentreNominals(companyId)
      .then(({ items }) => {
        if (!cancelled)
          setNominals({
            companyId,
            options: items.map((item) => ({
              value: item.code,
              label: `${item.code} · ${item.name}${item.section ? ` (${item.section})` : ""}`,
            })),
          });
      })
      .catch(() => {
        if (!cancelled) setNominals({ companyId, options: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, client, companyId, usesNominals]);
  const nominalsLoaded = nominals.companyId === companyId;
  const liveOptions = (field: HrConfiguredMasterField): readonly Option[] =>
    field.optionsSource === "cost_centre_nominals" && nominalsLoaded ? nominals.options : [];
  const label = (record: Record, field: HrConfiguredMasterField) => fieldLabel(record, field, liveOptions(field));

  const selected = records.find((record) => record.id === selectedId);
  const filtered = records
    .filter((record) => statusFilter === "all" || record.status === statusFilter)
    .filter((record) =>
      `${record.code} ${record.name} ${record.description} ${definition.fields.map((field) => label(record, field)).join(" ")}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
  const activeCount = records.filter((record) => record.status === "active").length;
  const closeSheet = () => {
    if (saving) return;
    setEditor(null);
    setSelectedId("");
  };

  const save = async () => {
    const missing = definition.fields.some((field) => !field.optional && !(editor?.values[field.key] ?? "").trim());
    if (!editor || !companyId || !editor.name.trim() || missing) {
      const required = ["Name", ...definition.fields.filter((field) => !field.optional).map((field) => field.label.toLowerCase())];
      setMessage(
        required.length === 1
          ? "Name is required."
          : `${required.slice(0, -1).join(", ")} and ${required.at(-1)} are required.`,
      );
      return;
    }
    const shared = {
      company_id: companyId,
      code: editor.code,
      name: editor.name.trim(),
      description: editor.description.trim(),
      ...termsFor(definition, editor.values),
    };
    setSaving(true);
    try {
      if (editor.mode === "create") {
        await client.createMaster({ ...shared, code: "AUTO", type: definition.type }, csrfToken(), crypto.randomUUID());
        setMessage(`${definition.singular} created with an automatically allocated code.`);
      } else if (selected) {
        await client.updateMaster(selected.id, { ...shared, code: selected.code }, csrfToken(), crypto.randomUUID());
        setMessage(`${definition.singular} updated and recorded in the audit trail.`);
      }
      if (editor.mode === "create") setStatusFilter("active");
      setEditor(null);
      setSelectedId("");
      await loadRecords(companyId);
    } catch {
      setMessage(`The ${definition.singular.toLowerCase()} change was rejected. Check configuration and retry.`);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const status = selected.status === "active" ? "inactive" : "active";
      await client.changeMasterStatus(selected.id, { company_id: companyId, status }, csrfToken(), crypto.randomUUID());
      setMessage(
        `${definition.singular} ${status === "active" ? "activated" : "deactivated"}. Historical assignments remain readable.`,
      );
      setSelectedId("");
      await loadRecords(companyId);
    } catch {
      setMessage(`${definition.singular} status could not be changed.`);
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (record: { id: string; code: string; name: string }) => {
    setSaving(true);
    try {
      await client.deleteMaster(record.id, { company_id: companyId }, csrfToken(), crypto.randomUUID());
      setMessage(`${record.code} ${record.name} was permanently deleted. Its code will not be reused.`);
      setSelectedId("");
      await loadRecords(companyId);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${record.name} could not be deleted.`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-72 w-full" />;
  if (!session)
    return (
      <Alert>
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          Your browser session is not active. Sign in again, then reopen {sectionLabel}.{" "}
          <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>
            Retry session
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>HR master access required</AlertTitle>
        <AlertDescription>This screen requires the HR master read permission.</AlertDescription>
      </Alert>
    );

  return (
    <section className="grid gap-3" aria-label={sectionLabel}>
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <Summary label="Total records" value={records.length} />
        <Summary label="Active" value={activeCount} accent />
        <Summary label="Deactivated" value={records.length - activeCount} />
      </div>
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(14rem,.8fr)_minmax(14rem,1fr)_auto] md:items-end">
        <label className="grid gap-1 text-sm font-medium" htmlFor={`configured-${sectionKey}-company`}>
          Company
          <select
            id={`configured-${sectionKey}-company`}
            className="h-10 min-w-0 rounded-md border border-input bg-background px-3"
            value={companyId}
            onChange={(event) => {
              setCompanyId(event.target.value);
              rememberMasterCompany(event.target.value);
              closeSheet();
              void loadRecords(event.target.value);
            }}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor={`configured-${sectionKey}-search`}>
          Search
          <Input
            id={`configured-${sectionKey}-search`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${sectionLabel.toLowerCase()}`}
          />
        </label>
        {canCreate ? (
          <Button
            className="w-full md:w-auto"
            onClick={() => {
              setSelectedId("");
              setEditor(editorFor(undefined, definition, records));
            }}
          >
            + Add {sectionSingular}
          </Button>
        ) : null}
      </div>
      <HrMasterStatusFilter value={statusFilter} onChange={setStatusFilter} />
      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-225 w-full text-sm">
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">{definition.nameLabel ?? sectionSingular}</th>
                  {definition.fields.map((field) => (
                    <th key={field.key} className="px-4 py-3 text-left">
                      {field.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60"
                    key={record.id}
                    onClick={() => {
                      setEditor(null);
                      setSelectedId(record.id);
                    }}
                  >
                    <td className="px-4 py-3 font-semibold">{record.code}</td>
                    <td className="px-4 py-3 font-medium">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-left whitespace-normal"
                        onClick={() => {
                          setEditor(null);
                          setSelectedId(record.id);
                        }}
                      >
                        {record.name}
                      </Button>
                    </td>
                    {definition.fields.map((field) => (
                      <td key={field.key} className="px-4 py-3">
                        {label(record, field)}
                      </td>
                    ))}
                    <td className="max-w-md px-4 py-3 text-muted-foreground">{record.description || "—"}</td>
                    <td className="px-4 py-3">
                      <HrMasterStatusBadge status={record.status} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={4 + definition.fields.length}>
                      No {sectionLabel.toLowerCase()} records match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <HrMasterSheet
        message={message}
        open={Boolean(editor || selected)}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        eyebrow="Organisation & Masters"
        title={
          editor
            ? editor.mode === "create"
              ? `Add ${sectionSingular}`
              : `Edit ${sectionSingular}`
            : (selected?.name ?? sectionSingular)
        }
        description={
          editor
            ? "The reference code is generated automatically and remains stable after creation."
            : `${selected?.code ?? ""} · Company master record`
        }
        footer={
          editor ? (
            <>
              <Button variant="outline" disabled={saving} onClick={closeSheet}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : canUpdate && selected ? (
            <>
              <Button variant="outline" disabled={saving} onClick={() => void changeStatus()}>
                {selected.status === "active" ? "Deactivate" : "Activate"}
              </Button>
              {definition.addFromDrawer && canCreate ? (
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setSelectedId("");
                    setEditor(editorFor(undefined, definition, records));
                  }}
                >
                  + Add {sectionSingular}
                </Button>
              ) : null}
              <HrEditButton
                label={`Edit ${sectionSingular}`}
                onClick={() => setEditor(editorFor(selected, definition, records))}
              />
              <HrMasterDeleteButton
                  name={selected.name}
                  code={selected.code}
                  saving={saving}
                  onDelete={() => deleteRecord(selected)}
                />
            </>
          ) : undefined
        }
      >
        {editor ? (
          <div className="grid gap-5">
            <label className="grid gap-1.5 text-sm font-medium" htmlFor={`configured-${sectionKey}-code`}>
              Auto-generated code
              <Input id={`configured-${sectionKey}-code`} value={editor.code} disabled />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor={`configured-${sectionKey}-name`}>
              Name
              <Input
                id={`configured-${sectionKey}-name`}
                maxLength={160}
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </label>
            {definition.fields.map((field) => {
              const isConfiguration = field.key === "default_nominal" || field.key === "working_pattern";
              const id = `configured-${sectionKey}-${isConfiguration ? "configuration" : field.key}`;
              const value = editor.values[field.key] ?? "";
              const setValue = (next: string) =>
                setEditor({ ...editor, values: { ...editor.values, [field.key]: next } });
              return (
                <label key={field.key} className="grid gap-1.5 text-sm font-medium" htmlFor={id}>
                  {field.label}
                  {field.optionsSource ? (
                    <LiveOptionSelect
                      id={id}
                      value={value}
                      options={liveOptions(field)}
                      loaded={nominalsLoaded}
                      onChange={setValue}
                    />
                  ) : field.options ? (
                    <select
                      id={id}
                      required
                      className="h-10 rounded-md border border-input bg-background px-3"
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                    >
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={id}
                      maxLength={128}
                      placeholder={field.placeholder}
                      value={value}
                      onChange={(event) => setValue(event.target.value.toUpperCase())}
                    />
                  )}
                </label>
              );
            })}
            <label className="grid gap-1.5 text-sm font-medium" htmlFor={`configured-${sectionKey}-description`}>
              Description
              <Textarea
                id={`configured-${sectionKey}-description`}
                className="min-h-32 resize-y"
                maxLength={1000}
                value={editor.description}
                onChange={(event) => setEditor({ ...editor, description: event.target.value })}
              />
            </label>
          </div>
        ) : selected ? (
          <HrDetailList>
            <Detail label="Name" value={selected.name} />
            <Detail label="Code" value={selected.code} />
            <Detail label="Status" value={selected.status} status />
            {definition.fields.map((field) => (
              <Detail key={field.key} label={field.label} value={label(selected, field)} />
            ))}
            <Detail label="Description" value={selected.description || "No description recorded."} />
            <RecordStamps record={selected} />
          </HrDetailList>
        ) : null}
      </HrMasterSheet>
    </section>
  );
}

/** Optional dropdown of live records; keeps a saved value visible even if it is no longer offered. */
function LiveOptionSelect({
  id,
  value,
  options,
  loaded,
  onChange,
}: {
  id: string;
  value: string;
  options: readonly Option[];
  loaded: boolean;
  onChange: (value: string) => void;
}) {
  const offered =
    value && !options.some((option) => option.value === value) ? [{ value, label: value }, ...options] : options;
  return (
    <select
      id={id}
      className="h-10 rounded-md border border-input bg-background px-3 disabled:opacity-50"
      value={value}
      disabled={!loaded}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{!loaded ? "Loading nominals…" : options.length ? "Not set" : "No Finance nominals yet"}</option>
      {offered.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Summary({ label, value }: { label: string; value: number; accent?: boolean }) {
  return (
    <span>
      {label}: <strong className="font-semibold text-foreground">{value}</strong>
    </span>
  );
}
function Detail({ label, value, status = false }: { label: string; value: string; status?: boolean }) {
  return (
    <HrDetailTile label={label} value={status ? <HrMasterStatusBadge status={value} className="inline-flex" /> : value} />
  );
}
/** "Created by", "Created" and "Last updated" rows, shown when the API provides them. */
function RecordStamps({ record }: { record: { created_by_name?: string | null; created_at?: string; updated_at?: string } }) {
  const when = (value?: string) => (value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
  return (
    <>
      {record.created_by_name ? <Detail label="Created by" value={record.created_by_name} /> : null}
      {record.created_at ? <Detail label="Created" value={when(record.created_at)} /> : null}
      {record.updated_at ? <Detail label="Last updated" value={when(record.updated_at)} /> : null}
    </>
  );
}