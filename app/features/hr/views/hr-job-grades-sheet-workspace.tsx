"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreateHrJobGradeRequest, HrJobGradeDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { nextMasterCode } from "../model/hr-master-code";
import { HrMasterArchiveButton } from "../components/hr-master-archive-button";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import { preferredMasterCompany, rememberMasterCompany } from "../model/organisation-master-navigation";

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

function editorFor(record: JobGrade | undefined, records: readonly JobGrade[]): Editor {
  return {
    mode: record ? "edit" : "create",
    code:
      record?.code ??
      nextMasterCode(
        "job_grade",
        records.map((item) => item.code),
      ),
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
  return value === null
    ? "Not configured"
    : `${currencyCode} ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 4 }).format(Number(value))}`;
}

function toPayload(companyId: string, editor: Editor): CreateHrJobGradeRequest | string {
  const gradeLevel = Number(editor.gradeLevel);
  if (!editor.name.trim()) return "Name is required.";
  if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 999)
    return "Grade level must be a whole number from 1 to 999.";
  const currencyCode = editor.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) return "Currency must be a three-letter ISO code such as PKR or USD.";
  const fields = [editor.bandMinimum.trim(), editor.bandMidpoint.trim(), editor.bandMaximum.trim()];
  const populated = fields.filter(Boolean).length;
  if (populated !== 0 && populated !== 3)
    return "Enter minimum, midpoint, and maximum together, or leave all three blank.";
  if (
    populated === 3 &&
    (fields.some((value) => !/^\d{1,16}(\.\d{1,4})?$/.test(value)) ||
      !(Number(fields[0]) <= Number(fields[1]) && Number(fields[1]) <= Number(fields[2])))
  )
    return "Compensation values must be positive and ordered from minimum to maximum.";
  return {
    company_id: companyId,
    code: editor.code,
    name: editor.name.trim(),
    description: editor.description.trim(),
    grade_level: gradeLevel,
    currency_code: currencyCode,
    band_minimum: fields[0] || null,
    band_midpoint: fields[1] || null,
    band_maximum: fields[2] || null,
  };
}

export function HrJobGradesSheetWorkspace() {
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [records, setRecords] = useState<JobGrade[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HrMasterStatus>("active");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.master.read"),
    canCreate = permissions.includes("hr.master.create"),
    canUpdate = permissions.includes("hr.master.update");

  const loadRecords = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) return;
      setLoading(true);
      try {
        const result = await client.jobGrades(targetCompanyId);
        setRecords(result.items);
        setSelectedId((current) => (result.items.some((record) => record.id === current) ? current : ""));
      } catch {
        setMessage("Job grades could not be loaded from the authorized API. Refresh your session and try again.");
      } finally {
        setLoading(false);
      }
    },
    [client],
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
        setMessage("Authorized companies could not be loaded.");
        setLoading(false);
      });
  }, [canRead, client, loadRecords, sessionLoading]);

  const selected = records.find((record) => record.id === selectedId);
  const filtered = records
    .filter((record) => statusFilter === "all" || record.status === statusFilter)
    .filter((record) =>
      `${record.code} ${record.name} ${record.description} ${record.grade_level}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
  const closeSheet = () => {
    if (!saving) {
      setEditor(null);
      setSelectedId("");
    }
  };
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
        await client.createJobGrade({ ...payload, code: "AUTO" }, csrfToken(), crypto.randomUUID());
        setMessage("Job grade created with an automatically allocated code.");
      } else if (selected) {
        await client.updateJobGrade(selected.id, { ...payload, code: selected.code }, csrfToken(), crypto.randomUUID());
        setMessage("Job grade updated and recorded in the audit trail.");
      }
      if (editor.mode === "create") setStatusFilter("active");
      setEditor(null);
      setSelectedId("");
      await loadRecords(companyId);
    } catch {
      setMessage("The job-grade change was rejected. Check the grade level, compensation band, and uniqueness.");
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
      setMessage(`Job grade ${status === "active" ? "activated" : "deactivated"}.`);
      setSelectedId("");
      await loadRecords(companyId);
    } catch {
      setMessage("Job-grade status could not be changed.");
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
          Your browser session is not active. Sign in again, then reopen Job Grades.{" "}
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
    <section className="grid gap-3" aria-label="Job Grades">
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(14rem,.8fr)_minmax(14rem,1fr)_auto] md:items-end">
        <label className="grid gap-1 text-sm font-medium" htmlFor="job-grade-company">
          Company
          <select
            id="job-grade-company"
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
        <label className="grid gap-1 text-sm font-medium" htmlFor="job-grade-search">
          Search
          <Input
            id="job-grade-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search job grades"
          />
        </label>
        {canCreate ? (
          <Button
            className="w-full md:w-auto"
            onClick={() => {
              setSelectedId("");
              setEditor(editorFor(undefined, records));
            }}
          >
            + Add Job Grade
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
                  <th className="px-4 py-3 text-left">Level</th>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Job grade</th>
                  <th className="px-4 py-3 text-left">Compensation band</th>
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
                    <td className="px-4 py-3 font-semibold">{record.grade_level}</td>
                    <td className="px-4 py-3">{record.code}</td>
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
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {record.band_minimum === null
                        ? "Not configured"
                        : `${amount(record.band_minimum, record.currency_code)} – ${amount(record.band_maximum, record.currency_code)}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`nx-status nx-status-${record.status}`}>{record.status}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>
                      No job grades match these filters.
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
          editor ? (editor.mode === "create" ? "Add Job Grade" : "Edit Job Grade") : (selected?.name ?? "Job Grade")
        }
        description={
          editor
            ? "The grade code is generated automatically. Enter a numeric level from 1 to 999."
            : `Level ${selected?.grade_level ?? ""} · ${selected?.code ?? ""}`
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
              <HrEditButton label="Edit Job Grade" onClick={() => setEditor(editorFor(selected, records))} />
              {selected.status === "active" ? (
                <HrMasterArchiveButton name={selected.name} saving={saving} onArchive={changeStatus} />
              ) : null}
            </>
          ) : undefined
        }
      >
        {editor ? (
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium" htmlFor="job-grade-code">
                Auto-generated code
                <Input id="job-grade-code" value={editor.code} disabled />
              </label>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor="job-grade-level">
                Grade level
                <Input
                  id="job-grade-level"
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  inputMode="numeric"
                  value={editor.gradeLevel}
                  onChange={(event) => setEditor({ ...editor, gradeLevel: event.target.value })}
                />
                <span className="text-xs font-normal text-muted-foreground">Whole number from 1 to 999.</span>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="job-grade-name">
              Name
              <Input
                id="job-grade-name"
                maxLength={160}
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="job-grade-description">
              Description
              <Textarea
                id="job-grade-description"
                className="min-h-24 resize-y"
                maxLength={1000}
                value={editor.description}
                onChange={(event) => setEditor({ ...editor, description: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="job-grade-currency">
              Currency
              <Input
                id="job-grade-currency"
                maxLength={3}
                value={editor.currencyCode}
                onChange={(event) => setEditor({ ...editor, currencyCode: event.target.value.toUpperCase() })}
              />
            </label>
            <fieldset className="grid gap-4 rounded-lg border border-border p-4">
              <legend className="px-1 text-sm font-semibold">Optional compensation band</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Money
                  label="Minimum"
                  value={editor.bandMinimum}
                  set={(value) => setEditor({ ...editor, bandMinimum: value })}
                />
                <Money
                  label="Midpoint"
                  value={editor.bandMidpoint}
                  set={(value) => setEditor({ ...editor, bandMidpoint: value })}
                />
                <Money
                  label="Maximum"
                  value={editor.bandMaximum}
                  set={(value) => setEditor({ ...editor, bandMaximum: value })}
                />
              </div>
            </fieldset>
          </div>
        ) : selected ? (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Detail label="Code" value={selected.code} />
              <Detail label="Status" value={selected.status} status />
              <Detail label="Currency" value={selected.currency_code} />
              <Detail label="Minimum" value={amount(selected.band_minimum, selected.currency_code)} />
              <Detail label="Midpoint" value={amount(selected.band_midpoint, selected.currency_code)} />
              <Detail label="Maximum" value={amount(selected.band_maximum, selected.currency_code)} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="mt-2 leading-relaxed">{selected.description || "No description recorded."}</p>
            </div>
          </div>
        ) : null}
      </HrMasterSheet>
    </section>
  );
}

function Money({ label, value, set }: { label: string; value: string; set: (value: string) => void }) {
  const id = `job-grade-band-${label.toLowerCase()}`;
  return (
    <label className="grid gap-1.5 text-sm font-medium" htmlFor={id}>
      {label}
      <Input id={id} inputMode="decimal" value={value} onChange={(event) => set(event.target.value)} />
    </label>
  );
}
function Detail({ label, value, status = false }: { label: string; value: string; status?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {status ? (
        <span className={`mt-2 inline-flex nx-status nx-status-${value}`}>{value}</span>
      ) : (
        <p className="mt-1 font-semibold">{value}</p>
      )}
    </div>
  );
}
