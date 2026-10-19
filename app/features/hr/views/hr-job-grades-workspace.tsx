"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreateHrJobGradeRequest, HrJobGradeDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";

type JobGrade = HrJobGradeDirectory["items"][number];
type Editor = {
  mode: "create" | "edit";
  code: string;
  name: string;
  description: string;
  gradeLevel: string;
  currencyCode: string;
  bandMinimum: string;
  bandMidpoint: string;
  bandMaximum: string;
};

function editorFor(record?: JobGrade): Editor {
  return {
    mode: record ? "edit" : "create",
    code: record?.code ?? "",
    name: record?.name ?? "",
    description: record?.description ?? "",
    gradeLevel: record ? String(record.grade_level) : "",
    currencyCode: record?.currency_code ?? "PKR",
    bandMinimum: record?.band_minimum ?? "",
    bandMidpoint: record?.band_midpoint ?? "",
    bandMaximum: record?.band_maximum ?? "",
  };
}

function amount(value: string | null, currencyCode: string): string {
  if (value === null) return "Not configured";
  return `${currencyCode} ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 4 }).format(Number(value))}`;
}

function toPayload(companyId: string, editor: Editor): CreateHrJobGradeRequest | string {
  const gradeLevel = Number(editor.gradeLevel);
  if (!editor.code.trim() || !editor.name.trim()) return "Code and name are required.";
  if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 999) return "Grade level must be a whole number from 1 to 999.";
  const currencyCode = editor.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) return "Currency must be a three-letter ISO code such as PKR or USD.";
  const fields = [editor.bandMinimum.trim(), editor.bandMidpoint.trim(), editor.bandMaximum.trim()];
  const populated = fields.filter(Boolean).length;
  if (populated !== 0 && populated !== 3) return "Enter minimum, midpoint, and maximum together, or leave all three blank.";
  if (populated === 3) {
    if (fields.some((value) => !/^\d{1,16}(\.\d{1,4})?$/.test(value))) return "Band amounts must be positive numbers with up to four decimal places.";
    if (!(Number(fields[0]) <= Number(fields[1]) && Number(fields[1]) <= Number(fields[2]))) return "Compensation band values must be ordered from minimum to maximum.";
  }
  return {
    company_id: companyId,
    code: editor.code.trim().toUpperCase(),
    name: editor.name.trim(),
    description: editor.description.trim(),
    grade_level: gradeLevel,
    currency_code: currencyCode,
    band_minimum: fields[0] || null,
    band_midpoint: fields[1] || null,
    band_maximum: fields[2] || null,
  };
}

export function HrJobGradesWorkspace() {
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [records, setRecords] = useState<JobGrade[]>([]);
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
      const result = await client.jobGrades(targetCompanyId);
      setRecords(result.items);
      setSelectedId((current) => result.items.some((record) => record.id === current) ? current : result.items[0]?.id ?? "");
      setMessage("");
    } catch {
      setMessage("Job grades could not be loaded from the authorized API. Refresh your session and try again.");
    } finally {
      setLoading(false);
    }
  }, [client]);

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
    `${record.code} ${record.name} ${record.description} ${record.grade_level}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const save = async () => {
    if (!editor || !companyId) return;
    const payload = toPayload(companyId, editor);
    if (typeof payload === "string") {
      setMessage(payload);
      return;
    }
    setSaving(true);
    try {
      if (editor.mode === "create") {
        const result = await client.createJobGrade(payload, csrfToken(), crypto.randomUUID());
        setSelectedId(result.id);
        setMessage("Job grade created and recorded in the audit trail.");
      } else if (selected) {
        await client.updateJobGrade(selected.id, payload, csrfToken(), crypto.randomUUID());
        setMessage("Job grade updated and recorded in the audit trail.");
      }
      setEditor(null);
      await loadRecords(companyId);
    } catch {
      setMessage("The job-grade change was rejected. Check permissions and ensure the code, name, and grade level are unique for this company.");
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
      setMessage(`Job grade ${status === "active" ? "activated" : "deactivated"}. Existing employee assignments remain readable.`);
      await loadRecords(companyId);
    } catch {
      setMessage("Job-grade status could not be changed.");
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-72 w-full" />;
  if (!session) return <Alert><AlertTitle>Sign in required</AlertTitle><AlertDescription>Your browser session is not active. Sign in again, then reopen Job Grades. <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>Retry session</Button></AlertDescription></Alert>;
  if (!canRead) return <Alert><AlertTitle>HR master access required</AlertTitle><AlertDescription>This screen requires the HR master read permission.</AlertDescription></Alert>;

  return (
    <section className="grid gap-4" aria-label="Job Grades">
      <Alert>
        <AlertTitle>Job grade governance</AlertTitle>
        <AlertDescription>Grade level controls the company order. The optional compensation band is planning data; it does not change an employee salary or create a payroll posting.</AlertDescription>
      </Alert>
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid min-w-72 gap-1 text-sm font-medium">Company
          <select className="h-9 rounded-md border border-input bg-background px-2" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setEditor(null); void loadRecords(event.target.value); }}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        <Input className="max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job grades" />
        {canCreate ? <Button onClick={() => { setEditor(editorFor()); setSelectedId(""); }}>+ Add Job Grade</Button> : null}
      </div>
      {loading ? <Skeleton className="h-72 w-full" /> : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(38rem,1.5fr)_minmax(21rem,.8fr)]">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/60"><tr><th className="px-4 py-3 text-left">Level</th><th className="px-4 py-3 text-left">Code</th><th className="px-4 py-3 text-left">Job grade</th><th className="px-4 py-3 text-left">Compensation band</th><th className="px-4 py-3 text-left">Status</th></tr></thead>
              <tbody>
                {filtered.map((record) => <tr className={`cursor-pointer border-b last:border-0 ${selectedId === record.id ? "bg-accent" : ""}`} key={record.id} onClick={() => { setSelectedId(record.id); setEditor(null); }}><td className="px-4 py-3 font-semibold">{record.grade_level}</td><td className="px-4 py-3">{record.code}</td><td className="px-4 py-3">{record.name}</td><td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{record.band_minimum === null ? "Not configured" : `${amount(record.band_minimum, record.currency_code)} – ${amount(record.band_maximum, record.currency_code)}`}</td><td className="px-4 py-3"><span className={`nx-status nx-status-${record.status}`}>{record.status}</span></td></tr>)}
                {filtered.length === 0 ? <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>No job grades are configured for this company.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {editor ? (
            <aside className="grid gap-3 rounded-lg border bg-card p-4">
              <h2 className="font-semibold">{editor.mode === "create" ? "Add Job Grade" : "Edit Job Grade"}</h2>
              <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">Code<Input maxLength={32} value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value })} /></label><label className="grid gap-1 text-sm">Grade level<Input inputMode="numeric" value={editor.gradeLevel} onChange={(event) => setEditor({ ...editor, gradeLevel: event.target.value })} /></label></div>
              <label className="grid gap-1 text-sm">Name<Input maxLength={160} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
              <label className="grid gap-1 text-sm">Description<textarea className="min-h-20 rounded-md border border-input bg-background p-2" maxLength={1000} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>
              <label className="grid gap-1 text-sm">Currency<Input maxLength={3} value={editor.currencyCode} onChange={(event) => setEditor({ ...editor, currencyCode: event.target.value.toUpperCase() })} /></label>
              <fieldset className="grid gap-2 rounded-md border p-3"><legend className="px-1 text-sm font-medium">Optional compensation band</legend><label className="grid gap-1 text-sm">Minimum<Input inputMode="decimal" value={editor.bandMinimum} onChange={(event) => setEditor({ ...editor, bandMinimum: event.target.value })} /></label><label className="grid gap-1 text-sm">Midpoint<Input inputMode="decimal" value={editor.bandMidpoint} onChange={(event) => setEditor({ ...editor, bandMidpoint: event.target.value })} /></label><label className="grid gap-1 text-sm">Maximum<Input inputMode="decimal" value={editor.bandMaximum} onChange={(event) => setEditor({ ...editor, bandMaximum: event.target.value })} /></label></fieldset>
              <div className="flex gap-2"><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save"}</Button><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button></div>
            </aside>
          ) : selected ? (
            <aside className="grid gap-3 rounded-lg border bg-card p-4">
              <div><span className="nx-eyebrow">Level {selected.grade_level} · {selected.code}</span><h2 className="mt-1 text-xl font-semibold">{selected.name}</h2></div>
              <p className="text-sm text-muted-foreground">{selected.description || "No description recorded."}</p>
              <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Currency</dt><dd className="font-medium">{selected.currency_code}</dd></div><div><dt className="text-muted-foreground">Status</dt><dd><span className={`nx-status nx-status-${selected.status}`}>{selected.status}</span></dd></div><div><dt className="text-muted-foreground">Minimum</dt><dd className="font-medium">{amount(selected.band_minimum, selected.currency_code)}</dd></div><div><dt className="text-muted-foreground">Midpoint</dt><dd className="font-medium">{amount(selected.band_midpoint, selected.currency_code)}</dd></div><div><dt className="text-muted-foreground">Maximum</dt><dd className="font-medium">{amount(selected.band_maximum, selected.currency_code)}</dd></div></dl>
              {canUpdate ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditor(editorFor(selected))}>Edit</Button><Button variant="outline" disabled={saving} onClick={() => void changeStatus()}>{selected.status === "active" ? "Deactivate" : "Activate"}</Button></div> : null}
            </aside>
          ) : <aside className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Select a record or add a new job grade.</aside>}
        </div>
      )}
    </section>
  );
}
