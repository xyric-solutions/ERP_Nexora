"use client";
import { WorkTable } from "@/shared/ui/work-table";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreateHrJobGradeRequest, HrJobGradeCurrency, HrJobGradeDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/shared/ui/amount-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import {
  HrDetailAudit,
  HrDetailGroup,
  HrDetailNote,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrApiClient } from "../api/hr-client";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { nextMasterCode } from "../model/hr-master-code";
import { HrMasterStatusBadge } from "../components/hr-master-status-badge";
import { HrMasterDeleteButton } from "../components/hr-master-delete-button";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import { preferredMasterCompany } from "../model/organisation-master-navigation";

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

const currencySetupHint = "Configure currencies for this company under Finance → Company currencies.";

/** New grades default to the company base currency, else the first configured currency. */
function defaultCurrency(currencies: readonly HrJobGradeCurrency[] | null): string {
  return currencies?.find((item) => item.is_base)?.currency_code ?? currencies?.[0]?.currency_code ?? "";
}

function currencyLabel(currency: HrJobGradeCurrency): string {
  return `${currency.currency_code} — ${currency.currency_name}${currency.is_base ? " (base)" : ""}`;
}

function editorFor(
  record: JobGrade | undefined,
  records: readonly JobGrade[],
  currencies: readonly HrJobGradeCurrency[] | null,
): Editor {
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
    currencyCode: record?.currency_code ?? defaultCurrency(currencies),
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
  if (!/^[A-Z]{3}$/.test(currencyCode)) return `Choose a currency. ${currencySetupHint}`;
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
  const [companyId, setCompanyId] = useState("");
  const [records, setRecords] = useState<JobGrade[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HrMasterStatus>("active");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [currencies, setCurrencies] = useState<HrJobGradeCurrency[] | null>(null);
  const [currencyError, setCurrencyError] = useState("");
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

  const loadCurrencies = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) return;
      setCurrencies(null);
      setCurrencyError("");
      try {
        const result = await client.jobGradeCurrencies(targetCompanyId);
        setCurrencies(result.items);
        // A new grade opened before the list arrived picks up the company default once it loads.
        setEditor((current) =>
          current && current.mode === "create" && !current.currencyCode
            ? { ...current, currencyCode: defaultCurrency(result.items) }
            : current,
        );
      } catch (error) {
        setCurrencies([]);
        setCurrencyError(
          error instanceof Error && error.message
            ? error.message
            : "Company currencies could not be loaded from the authorized API.",
        );
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
        const first = preferredMasterCompany(result.items);
        setCompanyId(first);
        if (!first) {
          setMessage("No authorized company is available. Ask your administrator to review company access.");
          setLoading(false);
          return;
        }
        void loadCurrencies(first);
        return loadRecords(first);
      })
      .catch(() => {
        setMessage("Authorized companies could not be loaded.");
        setLoading(false);
      });
  }, [canRead, client, loadCurrencies, loadRecords, sessionLoading]);

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
    const configured = currencies?.some((item) => item.currency_code === editor.currencyCode) ?? false;
    const keepsLegacyCurrency = editor.mode === "edit" && selected?.currency_code === editor.currencyCode;
    if (!configured && !keepsLegacyCurrency) {
      setMessage(
        currencies === null
          ? "Company currencies are still loading. Try again in a moment."
          : currencies.length === 0
            ? `No currencies are configured for this company. ${currencySetupHint}`
            : `Choose a currency configured for this company. ${currencySetupHint}`,
      );
      return;
    }
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
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "The job-grade change was rejected. Check the grade level, compensation band, and uniqueness.",
      );
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

  const deleteRecord = async (record: { id: string; code: string; name: string }) => {
    setSaving(true);
    try {
      await client.deleteJobGrade(record.id, { company_id: companyId }, csrfToken(), crypto.randomUUID());
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
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end">
        <label className="grid content-start gap-1 text-sm font-medium" htmlFor="job-grade-search">
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
              setEditor(editorFor(undefined, records, currencies));
              void loadCurrencies(companyId);
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
            <WorkTable tableId="app/features/hr/views/hr-job-grades-sheet-workspace:1" className="min-w-225 w-full text-sm">
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
                      <HrMasterStatusBadge status={record.status} />
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
            </WorkTable>
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
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : canUpdate && selected ? (
            <>
              <Button variant="outline" disabled={saving} onClick={() => void changeStatus()}>
                {selected.status === "active" ? "Deactivate" : "Activate"}
              </Button>
              <HrEditButton
                label="Edit Job Grade"
                onClick={() => {
                  setEditor(editorFor(selected, records, currencies));
                  void loadCurrencies(companyId);
                }}
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
            <HrDetailSection title="Grade">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="job-grade-code">
                  Auto-generated code
                  <Input id="job-grade-code" value={editor.code} disabled />
                </label>
                <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="job-grade-level">
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
                </label>
              </div>
              <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="job-grade-name">
                Name
                <Input
                  id="job-grade-name"
                  maxLength={160}
                  value={editor.name}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                />
              </label>
              <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="job-grade-description">
                Description
                <Textarea
                  id="job-grade-description"
                  className="min-h-24 resize-y"
                  maxLength={1000}
                  value={editor.description}
                  onChange={(event) => setEditor({ ...editor, description: event.target.value })}
                />
              </label>
            </HrDetailSection>
            <HrDetailSection title="Compensation band">
              <CurrencySelect
                currencies={currencies}
                error={currencyError}
                value={editor.currencyCode}
                onChange={(currencyCode) => setEditor({ ...editor, currencyCode })}
              />
              <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
                <legend className="sr-only">Compensation band</legend>
                <div className="grid gap-3 sm:grid-cols-3">
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
            </HrDetailSection>
          </div>
        ) : selected ? (
          <div className="grid min-w-0 gap-4">
            <HrDetailSummary code={selected.code} status={selected.status}>
              Level {selected.grade_level} · {selected.currency_code} compensation band
            </HrDetailSummary>
            <HrDetailGroup title="Details">
              <HrDetailTile label="Name" value={selected.name} />
              <HrDetailTile label="Grade level" value={String(selected.grade_level)} />
            </HrDetailGroup>
            <HrDetailGroup title="Compensation band">
              <HrDetailTile label="Currency" value={selected.currency_code} />
              <HrDetailTile label="Minimum" value={amount(selected.band_minimum, selected.currency_code)} />
              <HrDetailTile label="Midpoint" value={amount(selected.band_midpoint, selected.currency_code)} />
              <HrDetailTile label="Maximum" value={amount(selected.band_maximum, selected.currency_code)} />
            </HrDetailGroup>
            <HrDetailSection title="Description">
              {selected.description ? (
                <HrDetailNote>{selected.description}</HrDetailNote>
              ) : (
                <p className="m-0! text-sm text-muted-foreground">No description recorded.</p>
              )}
            </HrDetailSection>
            <RecordStamps record={selected} />
          </div>
        ) : null}
      </HrMasterSheet>
    </section>
  );
}

function CurrencySelect({
  currencies,
  error,
  value,
  onChange,
}: {
  currencies: readonly HrJobGradeCurrency[] | null;
  error: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const loadingCurrencies = currencies === null;
  const empty = !loadingCurrencies && currencies.length === 0;
  // An existing grade may hold a currency Finance no longer lists; keep it visible so the grade stays editable.
  const legacy = value && !currencies?.some((item) => item.currency_code === value) ? value : "";
  const blocked = empty && !legacy;
  return (
    <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="job-grade-currency">
      Currency
      <select
        id="job-grade-currency"
        className="h-10 min-w-0 rounded-md border border-input bg-background px-3 disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        disabled={loadingCurrencies || empty}
        aria-describedby={error || empty || legacy ? "job-grade-currency-help" : undefined}
        aria-invalid={blocked || undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {value ? null : (
          <option value="" disabled>
            {loadingCurrencies
              ? "Loading company currencies…"
              : empty
                ? "No company currencies configured"
                : "Choose a currency"}
          </option>
        )}
        {legacy ? <option value={legacy}>{`${legacy} (not configured)`}</option> : null}
        {currencies?.map((currency) => (
          <option key={currency.currency_code} value={currency.currency_code}>
            {currencyLabel(currency)}
          </option>
        ))}
      </select>
      {error || empty || legacy ? (
        <span
          id="job-grade-currency-help"
          className={`text-xs font-normal ${error || blocked ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ||
            (empty
              ? `No currencies are configured for this company. ${currencySetupHint}`
              : `${legacy} is no longer an active company currency. Keep it, or choose a configured currency.`)}
        </span>
      ) : null}
    </label>
  );
}

function Money({ label, value, set }: { label: string; value: string; set: (value: string) => void }) {
  const id = `job-grade-band-${label.toLowerCase()}`;
  return (
    <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor={id}>
      {label}
      <AmountInput id={id} decimals={4} value={value} onValueChange={(raw) => set(raw)} />
    </label>
  );
}
/** "Created by", "Created" and "Last updated" line, shown when the API provides them. */
function RecordStamps({
  record,
}: {
  record: { created_by_name?: string | null; created_at?: string; updated_at?: string };
}) {
  return (
    <HrDetailAudit
      items={[
        { label: "Created by", value: record.created_by_name },
        { label: "Created", value: hrDisplayDate(record.created_at, true) },
        { label: "Last updated", value: hrDisplayDate(record.updated_at, true) },
      ]}
    />
  );
}
