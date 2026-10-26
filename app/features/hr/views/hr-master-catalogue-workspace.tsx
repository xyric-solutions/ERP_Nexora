"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrMasterDirectory, HrMasterType } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";

type Record = HrMasterDirectory["items"][number];
type Editor = { mode: "create" | "edit"; code: string; name: string; description: string };

export function HrMasterCatalogueWorkspace({ type, label, singular, guidance }: { type: HrMasterType; label: string; singular: string; guidance: string }) {
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
      const result = await client.masters({ companyId: targetCompanyId, type, activeOnly: false });
      setRecords(result.items);
      setSelectedId((current) => result.items.some((record) => record.id === current) ? current : result.items[0]?.id ?? "");
      setMessage("");
    } catch {
      setMessage(`${label} could not be loaded from the authorized API. Refresh your session and try again.`);
    } finally {
      setLoading(false);
    }
  }, [client, label, type]);

  useEffect(() => {
    if (sessionLoading || !canRead) { if (!sessionLoading) setLoading(false); return; }
    client.companies().then((result) => {
      setCompanies(result.items);
      const first = result.items[0]?.id ?? "";
      setCompanyId(first);
      return loadRecords(first);
    }).catch(() => { setMessage("Authorized companies could not be loaded. Refresh your session and sign in again if needed."); setLoading(false); });
  }, [canRead, client, loadRecords, sessionLoading]);

  const selected = records.find((record) => record.id === selectedId);
  const filtered = records.filter((record) => `${record.code} ${record.name} ${record.description}`.toLowerCase().includes(search.trim().toLowerCase()));
  const reload = () => loadRecords(companyId);
  const save = async () => {
    if (!editor || !companyId || !editor.code.trim() || !editor.name.trim()) { setMessage("Code and name are required."); return; }
    setSaving(true);
    try {
      if (editor.mode === "create") {
        const result = await client.createMaster({ company_id: companyId, type, code: editor.code.trim().toUpperCase(), name: editor.name.trim(), description: editor.description.trim() }, csrfToken(), crypto.randomUUID());
        setSelectedId(result.id);
        setMessage(`${singular} created and recorded in the audit trail.`);
      } else if (selected) {
        await client.updateMaster(selected.id, { company_id: companyId, code: editor.code.trim().toUpperCase(), name: editor.name.trim(), description: editor.description.trim() }, csrfToken(), crypto.randomUUID());
        setMessage(`${singular} updated and recorded in the audit trail.`);
      }
      setEditor(null);
      await reload();
    } catch {
      setMessage(`The ${singular.toLowerCase()} change was rejected. Check permissions and ensure the code and name are unique.`);
    } finally { setSaving(false); }
  };
  const changeStatus = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const status = selected.status === "active" ? "inactive" : "active";
      await client.changeMasterStatus(selected.id, { company_id: companyId, status }, csrfToken(), crypto.randomUUID());
      setMessage(`${singular} ${status === "active" ? "activated" : "deactivated"}. Historical assignments remain readable.`);
      await reload();
    } catch { setMessage(`${singular} status could not be changed.`); }
    finally { setSaving(false); }
  };

  if (sessionLoading) return <Skeleton className="h-72 w-full" />;
  if (!session) return <Alert><AlertTitle>Sign in required</AlertTitle><AlertDescription>Your browser session is not active. Sign in again, then reopen {label}. <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>Retry session</Button></AlertDescription></Alert>;
  if (!canRead) return <Alert><AlertTitle>HR master access required</AlertTitle><AlertDescription>This screen requires the HR master read permission.</AlertDescription></Alert>;

  return <section className="grid gap-4" aria-label={label}>
    <Alert><AlertTitle>{label}</AlertTitle><AlertDescription>{guidance}</AlertDescription></Alert>
    {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
    <div className="flex flex-wrap items-end justify-between gap-3"><label className="grid min-w-72 gap-1 text-sm font-medium">Company<select className="h-9 rounded-md border border-input bg-background px-2" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setEditor(null); void loadRecords(event.target.value); }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><Input className="max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}`}/>{canCreate ? <Button onClick={() => { setEditor({ mode: "create", code: "", name: "", description: "" }); setSelectedId(""); }}>+ Add {singular}</Button> : null}</div>
    {loading ? <Skeleton className="h-72 w-full" /> : <div className="grid items-start gap-4 xl:grid-cols-[minmax(30rem,1.4fr)_minmax(19rem,.8fr)]">
      <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead className="border-b bg-muted/60"><tr><th className="px-4 py-3 text-left">Code</th><th className="px-4 py-3 text-left">{singular}</th><th className="px-4 py-3 text-left">Description</th><th className="px-4 py-3 text-left">Status</th></tr></thead><tbody>{filtered.map((record) => <tr className={`cursor-pointer border-b last:border-0 ${selectedId === record.id ? "bg-accent" : ""}`} key={record.id} onClick={() => { setSelectedId(record.id); setEditor(null); }}><td className="px-4 py-3 font-semibold">{record.code}</td><td className="px-4 py-3">{record.name}</td><td className="max-w-md px-4 py-3 text-muted-foreground">{record.description || "—"}</td><td className="px-4 py-3"><span className={`nx-status nx-status-${record.status}`}>{record.status}</span></td></tr>)}{filtered.length === 0 ? <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>No {label.toLowerCase()} are configured for this company.</td></tr> : null}</tbody></table></div>
      {editor ? <aside className="grid gap-3 rounded-lg border bg-card p-4"><h2 className="font-semibold">{editor.mode === "create" ? `Add ${singular}` : `Edit ${singular}`}</h2><label className="grid gap-1 text-sm">Code<Input maxLength={32} value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value })}/></label><label className="grid gap-1 text-sm">Name<Input maxLength={160} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })}/></label><label className="grid gap-1 text-sm">Description<textarea className="min-h-24 rounded-md border border-input bg-background p-2" maxLength={1000} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })}/></label><div className="flex gap-2"><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save"}</Button><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button></div></aside> : selected ? <aside className="grid gap-3 rounded-lg border bg-card p-4"><span className="nx-eyebrow">{selected.code}</span><h2>{selected.name}</h2><p className="text-sm text-muted-foreground">{selected.description || "No description recorded."}</p><span className={`nx-status nx-status-${selected.status}`}>{selected.status}</span>{canUpdate ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditor({ mode: "edit", code: selected.code, name: selected.name, description: selected.description })}>Edit</Button><Button variant="outline" disabled={saving} onClick={() => void changeStatus()}>{selected.status === "active" ? "Deactivate" : "Activate"}</Button></div> : null}</aside> : <aside className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Select a record or add a new {singular.toLowerCase()}.</aside>}
    </div>}
  </section>;
}
