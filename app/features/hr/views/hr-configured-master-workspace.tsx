"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrMasterDirectory, HrMasterType } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";

type Record = HrMasterDirectory["items"][number];
type ConfigurationKey = NonNullable<Record["configuration_key"]>;
type Option = { value: string; label: string };
type Editor = { mode: "create" | "edit"; code: string; name: string; description: string; configurationValue: string };

export type HrConfiguredMasterDefinition = {
  type: Extract<HrMasterType, "cost_center" | "work_location" | "employment_type" | "employee_category">;
  label: string;
  singular: string;
  guidance: string;
  configurationKey: ConfigurationKey;
  configurationLabel: string;
  configurationHelp: string;
  configurationPlaceholder?: string;
  options?: readonly Option[];
};

function editorFor(record: Record | undefined, definition: HrConfiguredMasterDefinition): Editor {
  return {
    mode: record ? "edit" : "create",
    code: record?.code ?? "",
    name: record?.name ?? "",
    description: record?.description ?? "",
    configurationValue: record?.configuration_value ?? definition.options?.[0]?.value ?? "",
  };
}

function displayConfiguration(record: Record, definition: HrConfiguredMasterDefinition): string {
  if (!record.configuration_value) return "Not configured";
  return definition.options?.find((option) => option.value === record.configuration_value)?.label ?? record.configuration_value;
}

export function HrConfiguredMasterWorkspace({ definition }: { definition: HrConfiguredMasterDefinition }) {
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [records, setRecords] = useState<Record[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.master.read");
  const canCreate = permissions.includes("hr.master.create");
  const canUpdate = permissions.includes("hr.master.update");

  const loadRecords = useCallback(async (targetCompanyId: string) => {
    if (!targetCompanyId) return;
    setLoading(true);
    try {
      const result = await client.masters({ companyId: targetCompanyId, type: definition.type, activeOnly: false });
      setRecords(result.items);
      setSelectedId((current) => result.items.some((record) => record.id === current) ? current : result.items[0]?.id ?? "");
      setMessage("");
    } catch {
      setMessage(`${definition.label} could not be loaded from the authorized API. Refresh your session and try again.`);
    } finally {
      setLoading(false);
    }
  }, [client, definition.label, definition.type]);

  useEffect(() => {
    if (sessionLoading || !canRead) {
      if (!sessionLoading) setLoading(false);
      return;
    }
    client.companies().then((result) => {
      setCompanies(result.items);
      const first = result.items[0]?.id ?? "";
      setCompanyId(first);
      return loadRecords(first);
    }).catch(() => {
      setMessage("Authorized companies could not be loaded. Refresh your session and sign in again if needed.");
      setLoading(false);
    });
  }, [canRead, client, loadRecords, sessionLoading]);

  const selected = records.find((record) => record.id === selectedId);
  const filtered = records.filter((record) =>
    `${record.code} ${record.name} ${record.description} ${displayConfiguration(record, definition)}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const activeCount = records.filter((record) => record.status === "active").length;

  const save = async () => {
    if (!editor || !companyId || !editor.code.trim() || !editor.name.trim()) {
      setMessage("Code and name are required.");
      return;
    }
    if (!editor.configurationValue.trim()) {
      setMessage(`${definition.configurationLabel} is required.`);
      return;
    }
    const shared = {
      company_id: companyId,
      code: editor.code.trim().toUpperCase(),
      name: editor.name.trim(),
      description: editor.description.trim(),
      configuration_key: definition.configurationKey,
      configuration_value: editor.configurationValue.trim(),
    };
    setSaving(true);
    try {
      if (editor.mode === "create") {
        const result = await client.createMaster({ ...shared, type: definition.type }, csrfToken(), crypto.randomUUID());
        setSelectedId(result.id);
        setMessage(`${definition.singular} created and recorded in the audit trail.`);
      } else if (selected) {
        await client.updateMaster(selected.id, shared, csrfToken(), crypto.randomUUID());
        setMessage(`${definition.singular} updated and recorded in the audit trail.`);
      }
      setEditor(null);
      await loadRecords(companyId);
    } catch {
      setMessage(`The ${definition.singular.toLowerCase()} change was rejected. Check permissions, uniqueness, and ${definition.configurationLabel.toLowerCase()}.`);
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
      setMessage(`${definition.singular} ${status === "active" ? "activated" : "deactivated"}. Historical assignments remain readable.`);
      await loadRecords(companyId);
    } catch {
      setMessage(`${definition.singular} status could not be changed.`);
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-72 w-full" />;
  if (!session) return <Alert><AlertTitle>Sign in required</AlertTitle><AlertDescription>Your browser session is not active. Sign in again, then reopen {definition.label}. <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>Retry session</Button></AlertDescription></Alert>;
  if (!canRead) return <Alert><AlertTitle>HR master access required</AlertTitle><AlertDescription>This screen requires the HR master read permission.</AlertDescription></Alert>;

  return <section className="grid gap-4" aria-label={definition.label}>
    <Alert><AlertTitle>{definition.label} governance</AlertTitle><AlertDescription>{definition.guidance}</AlertDescription></Alert>
    {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}

    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryCard label="Total records" value={records.length} />
      <SummaryCard label="Active" value={activeCount} tone="text-emerald-600" />
      <SummaryCard label="Inactive history" value={records.length - activeCount} />
    </div>

    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <label className="grid min-w-72 flex-1 gap-1 text-sm font-medium">Company<select className="h-9 rounded-md border border-input bg-background px-2" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setEditor(null); void loadRecords(event.target.value); }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <Input className="min-w-64 flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${definition.label.toLowerCase()}`} />
      {canCreate ? <Button onClick={() => { setEditor(editorFor(undefined, definition)); setSelectedId(""); }}>+ Add {definition.singular}</Button> : null}
    </div>

    {loading ? <Skeleton className="h-72 w-full" /> : <div className="grid items-start gap-4 xl:grid-cols-[minmax(38rem,1.45fr)_minmax(21rem,.75fr)]">
      <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead className="border-b bg-muted/60"><tr><th className="px-4 py-3 text-left">Code</th><th className="px-4 py-3 text-left">{definition.singular}</th><th className="px-4 py-3 text-left">{definition.configurationLabel}</th><th className="px-4 py-3 text-left">Description</th><th className="px-4 py-3 text-left">Status</th></tr></thead><tbody>{filtered.map((record) => <tr className={`cursor-pointer border-b last:border-0 ${selectedId === record.id ? "bg-accent" : ""}`} key={record.id} onClick={() => { setSelectedId(record.id); setEditor(null); }}><td className="px-4 py-3 font-semibold">{record.code}</td><td className="px-4 py-3 font-medium">{record.name}</td><td className="px-4 py-3">{displayConfiguration(record, definition)}</td><td className="max-w-md px-4 py-3 text-muted-foreground">{record.description || "—"}</td><td className="px-4 py-3"><span className={`nx-status nx-status-${record.status}`}>{record.status}</span></td></tr>)}{filtered.length === 0 ? <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>No {definition.label.toLowerCase()} are configured for this company.</td></tr> : null}</tbody></table></div>
      {editor ? <EditorPanel definition={definition} editor={editor} setEditor={setEditor} selected={selected} saving={saving} save={save} /> : selected ? <DetailPanel definition={definition} selected={selected} canUpdate={canUpdate} saving={saving} edit={() => setEditor(editorFor(selected, definition))} changeStatus={changeStatus} /> : <aside className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">Select a record or add a new {definition.singular.toLowerCase()}.</aside>}
    </div>}
  </section>;
}

function SummaryCard({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-lg border bg-card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><strong className={`mt-1 block text-2xl ${tone}`}>{value}</strong></div>;
}

function EditorPanel({ definition, editor, setEditor, selected, saving, save }: { definition: HrConfiguredMasterDefinition; editor: Editor; setEditor: (editor: Editor | null) => void; selected: Record | undefined; saving: boolean; save: () => Promise<void> }) {
  return <aside className="grid gap-4 rounded-lg border bg-card p-5"><div><p className="nx-eyebrow">Master-data maintenance</p><h2 className="mt-1 text-xl font-semibold">{editor.mode === "create" ? `Add ${definition.singular}` : `Edit ${definition.singular}`}</h2></div><div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">Code<Input maxLength={32} value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value })} /></label><label className="grid gap-1 text-sm">Status<Input value={editor.mode === "create" ? "Active on creation" : selected?.status ?? ""} disabled /></label></div><label className="grid gap-1 text-sm">Name<Input maxLength={160} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label><label className="grid gap-1 text-sm">{definition.configurationLabel}{definition.options ? <select className="h-9 rounded-md border border-input bg-background px-2" value={editor.configurationValue} onChange={(event) => setEditor({ ...editor, configurationValue: event.target.value })}>{definition.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <Input maxLength={128} placeholder={definition.configurationPlaceholder} value={editor.configurationValue} onChange={(event) => setEditor({ ...editor, configurationValue: event.target.value.toUpperCase() })} />}<small className="text-muted-foreground">{definition.configurationHelp}</small></label><label className="grid gap-1 text-sm">Description<Textarea className="min-h-24" maxLength={1000} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label><div className="flex gap-2"><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save changes"}</Button><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button></div></aside>;
}

function DetailPanel({ definition, selected, canUpdate, saving, edit, changeStatus }: { definition: HrConfiguredMasterDefinition; selected: Record; canUpdate: boolean; saving: boolean; edit: () => void; changeStatus: () => Promise<void> }) {
  return <aside className="grid gap-4 rounded-lg border bg-card p-5"><div><span className="nx-eyebrow">{selected.code}</span><h2 className="mt-1 text-xl font-semibold">{selected.name}</h2></div><p className="text-sm text-muted-foreground">{selected.description || "No description recorded."}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Status</dt><dd className="mt-1"><span className={`nx-status nx-status-${selected.status}`}>{selected.status}</span></dd></div><div><dt className="text-muted-foreground">{definition.configurationLabel}</dt><dd className="mt-1 font-medium">{displayConfiguration(selected, definition)}</dd></div></dl>{!selected.configuration_value ? <Alert><AlertTitle>Configuration required</AlertTitle><AlertDescription>Edit this existing record to add its {definition.configurationLabel.toLowerCase()} before using it for new setup.</AlertDescription></Alert> : null}{canUpdate ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={edit}>Edit</Button><Button variant="outline" disabled={saving} onClick={() => void changeStatus()}>{selected.status === "active" ? "Deactivate" : "Activate"}</Button></div> : null}</aside>;
}
