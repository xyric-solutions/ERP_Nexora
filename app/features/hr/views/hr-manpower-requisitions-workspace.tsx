"use client";
import { WorkTable } from "@/shared/ui/work-table";

import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrRecordDrawer } from "../components/hr-record-drawer";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hrRequisitionStateMoves } from "@nexora/contracts";
import type {
  CreateHrManpowerRequisitionRequest,
  HrHiringBasis,
  HrManpowerRequisitionDirectory,
  HrWorkArrangement,
} from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import {
  HrDetailAudit,
  HrDetailFigures,
  HrDetailGroup,
  HrDetailNote,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterStatusFilter } from "../components/hr-master-status-filter";
import { costCentreOptionLabel, payCycleLabel, paymentRouteLabel } from "../model/employment-setup";
import { hiringBasisLabel, hiringBasisOptions, isHiringBasis } from "../model/hiring-basis";
import { isWorkArrangement, jobTypeOptions, workArrangementLabel } from "../model/work-arrangement";

/** All = every requisition (drafts and submitted ones stay reachable); Approved and Rejected narrow the list. */
type RequisitionFilter = "all" | "approved" | "rejected";
const requisitionFilterOptions: readonly { value: RequisitionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

type Requisition = HrManpowerRequisitionDirectory["items"][number];
type Editor = {
  /** Set when editing an existing requisition. */
  id?: string;
  state?: Requisition["state"];
  /** Status chosen in Edit; moves follow hrRequisitionStateMoves. */
  nextState?: Requisition["state"];
  jobTitle: string;
  workArrangement: HrWorkArrangement | "";
  designationId: string;
  gradeId: string;
  costCenterId: string;
  projectId: string;
  hiringBasis: HrHiringBasis | "";
  departmentId: string;
  workLocationId: string;
  positions: string;
  minimum: string;
  maximum: string;
  currency: string;
  targetStart: string;
  reason: string;
  skills: string;
};
const blankEditor = (): Editor => ({
  jobTitle: "",
  workArrangement: "",
  designationId: "",
  gradeId: "",
  costCenterId: "",
  projectId: "",
  hiringBasis: "",
  departmentId: "",
  workLocationId: "",
  positions: "1",
  minimum: "",
  maximum: "",
  currency: "",
  targetStart: "",
  reason: "",
  skills: "",
});
const stateLabel = (value: Requisition["state"]) => value.replaceAll("_", " ");
type WorkLocation = Awaited<ReturnType<HrApiClient["requisitionWorkLocations"]>>["items"][number];
/** "Lahore · Head Office" when the location's address names a city. */
const workLocationLabel = (item: Pick<WorkLocation, "name" | "city">) =>
  item.city ? `${item.city} · ${item.name}` : item.name;
const requisitionLocation = (record: Requisition) =>
  record.work_location
    ? workLocationLabel({ name: record.work_location, city: record.work_location_city })
    : "Not recorded";
const selectClass = "h-9 min-w-0 w-full rounded-md border border-input bg-background px-2";

export function HrManpowerRequisitionsWorkspace() {
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.employee.read"),
    canCreate = permissions.includes("hr.employee.create"),
    canSubmit = permissions.includes("hr.employee.submit"),
    canApprove = permissions.includes("hr.employee.approve");
  const [companyId, setCompanyId] = useState(""),
    [records, setRecords] = useState<Requisition[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [query, setQuery] = useState(""),
    [state, setState] = useState<RequisitionFilter>("all"),
    [editor, setEditor] = useState<Editor | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [masters, setMasters] = useState<Awaited<ReturnType<HrApiClient["masters"]>>["items"]>([]),
    [grades, setGrades] = useState<Awaited<ReturnType<HrApiClient["jobGrades"]>>["items"]>([]),
    [units, setUnits] = useState<Awaited<ReturnType<HrApiClient["organizationUnits"]>>["items"]>([]),
    [projects, setProjects] = useState<Awaited<ReturnType<HrApiClient["requisitionProjects"]>>["items"]>([]),
    [workLocations, setWorkLocations] = useState<WorkLocation[]>([]),
    [currencies, setCurrencies] = useState<Awaited<ReturnType<HrApiClient["jobGradeCurrencies"]>>["items"]>([]);
  const load = useCallback(
    async (company: string, filter: RequisitionFilter = state) => {
      if (!company) return;
      setLoading(true);
      try {
        const [items, masterItems, gradeItems, unitItems, projectItems, currencyItems, locationItems] =
          await Promise.all([
            client.manpowerRequisitions({ companyId: company, search: query, state: filter === "all" ? undefined : filter }),
            client.masters({ companyId: company, activeOnly: true }),
            client.jobGrades(company),
            client.organizationUnits({ companyId: company }),
            client.requisitionProjects(company),
            // Currencies only fill the picker; the grade currency is still offered if they fail.
            client.jobGradeCurrencies(company).catch(() => ({ items: [] })),
            client.requisitionWorkLocations(company),
          ]);
        setRecords(items.items);
        setMasters(masterItems.items);
        setGrades(gradeItems.items.filter((grade) => grade.status === "active"));
        setUnits(unitItems.items.filter((unit) => unit.status === "active"));
        setProjects(projectItems.items);
        setCurrencies(currencyItems.items);
        setWorkLocations(locationItems.items);
        setSelectedId((current) =>
          items.items.some((item) => item.id === current) ? current : (items.items[0]?.id ?? ""),
        );
      } catch {
        setMessage(
          "Manpower requisitions could not be loaded from the authorized API. No prototype records are shown.",
        );
      } finally {
        setLoading(false);
      }
    },
    [client, query, state],
  );
  useEffect(() => {
    if (sessionLoading || !canRead) {
      if (!sessionLoading) setLoading(false);
      return;
    }
    client
      .companies()
      .then((result) => {
        const first = result.items[0]?.id ?? "";
        setCompanyId(first);
        return load(first);
      })
      .catch(() => {
        setMessage("Authorized companies could not be loaded. Refresh your session and try again.");
        setLoading(false);
      });
  }, [canRead, client, load, sessionLoading]);
  const selected = records.find((record) => record.id === selectedId),
    designations = masters.filter((item) => item.type === "designation"),
    costCentres = masters.filter((item) => item.type === "cost_center"),
    departments = units.filter((item) => item.type === "department");
  // Grade level is the visible grade; the name is added only when two grades share a level.
  const gradeLabel = (grade: (typeof grades)[number]) =>
    grades.filter((item) => item.grade_level === grade.grade_level).length > 1
      ? `Grade ${grade.grade_level} · ${grade.name}`
      : `Grade ${grade.grade_level}`;
  const missingSetup = [
    grades.length ? "" : "an active job grade with a salary band",
    projects.length ? "" : "an active Finance project",
  ].filter(Boolean);
  const editorGrade = editor ? grades.find((item) => item.id === editor.gradeId) : undefined;
  const currencyOptions = [
    ...currencies.map((item) => ({ code: item.currency_code, label: `${item.currency_code} · ${item.currency_name}` })),
    ...(editorGrade && !currencies.some((item) => item.currency_code === editorGrade.currency_code)
      ? [{ code: editorGrade.currency_code, label: editorGrade.currency_code }]
      : []),
  ];
  const editorFor = (record: Requisition): Editor => ({
    id: record.id,
    state: record.state,
    nextState: record.state,
    jobTitle: record.job_title,
    workArrangement: record.work_arrangement ?? "",
    designationId: record.designation_id ?? "",
    gradeId: record.job_grade_id ?? "",
    costCenterId: record.cost_center_id ?? "",
    projectId: record.project_id ?? "",
    hiringBasis: record.hiring_basis ?? "",
    departmentId: record.department_id ?? "",
    workLocationId: record.work_location_id ?? "",
    positions: String(record.positions_requested),
    minimum: record.salary_minimum,
    maximum: record.salary_maximum,
    currency: record.currency_code,
    targetStart: record.target_start_date,
    reason: record.reason,
    skills: record.required_skills.join(", "),
  });
  const editingFields = !editor?.id || editor.state === "draft";
  const statusOptions = (state: Requisition["state"]) => [
    state,
    ...(hrRequisitionStateMoves[state] as readonly Requisition["state"][]),
  ];
  const remove = async (record: Requisition) => {
    setSaving(true);
    try {
      await client.deleteManpowerRequisition(record.id, companyId, csrfToken(), crypto.randomUUID());
      setMessage(`${record.reference} was deleted.`);
      setDetailsOpen(false);
      setSelectedId("");
      await load(companyId);
      return true;
    } catch (cause) {
      setMessage(cause instanceof Error && cause.message ? cause.message : "The requisition could not be deleted.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  /** Status-only save for requisitions past draft. */
  const saveState = async () => {
    if (!editor?.id || !editor.nextState || editor.nextState === editor.state) {
      setEditor(null);
      return;
    }
    setSaving(true);
    try {
      await client.changeManpowerRequisitionState(
        editor.id,
        { company_id: companyId, state: editor.nextState as "draft" | "submitted" | "cancelled", reason: "" },
        csrfToken(),
        crypto.randomUUID(),
      );
      setMessage(`The requisition is now ${stateLabel(editor.nextState)}.`);
      setSelectedId(editor.id);
      setEditor(null);
      await load(companyId);
    } catch (cause) {
      setMessage(cause instanceof Error && cause.message ? cause.message : "The status could not be changed.");
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (!editor || !companyId) return;
    if (!editingFields) return saveState();
    const positions = Number(editor.positions);
    if (
      !editor.jobTitle.trim() ||
      !editor.workArrangement ||
      !editor.designationId ||
      !editor.gradeId ||
      !editor.costCenterId ||
      !editor.projectId ||
      !editor.hiringBasis ||
      !editor.departmentId ||
      !editor.currency ||
      !editor.targetStart
    ) {
      setMessage("Complete every required field before saving the requisition.");
      return;
    }
    if (!Number.isInteger(positions) || positions < 1) {
      setMessage("Headcount must be a whole number of at least one.");
      return;
    }
    if (
      !/^\d+(\.\d{1,4})?$/.test(editor.minimum) ||
      !/^\d+(\.\d{1,4})?$/.test(editor.maximum) ||
      Number(editor.minimum) > Number(editor.maximum)
    ) {
      setMessage("Enter a valid salary range with the maximum at least the minimum.");
      return;
    }
    const grade = grades.find((item) => item.id === editor.gradeId);
    if (grade && grade.currency_code !== editor.currency) {
      setMessage(
        `Use ${grade.currency_code} for this requisition: the selected job grade's salary band is set in ${grade.currency_code}.`,
      );
      return;
    }
    const payload: CreateHrManpowerRequisitionRequest = {
      company_id: companyId,
      job_title: editor.jobTitle.trim(),
      designation_id: editor.designationId,
      job_grade_id: editor.gradeId,
      cost_center_id: editor.costCenterId,
      project_id: editor.projectId,
      hiring_basis: editor.hiringBasis,
      work_arrangement: editor.workArrangement,
      department_id: editor.departmentId,
      ...(editor.workLocationId ? { work_location_id: editor.workLocationId } : {}),
      positions_requested: positions,
      position_type: "new_position",
      salary_minimum: editor.minimum,
      salary_maximum: editor.maximum,
      currency_code: editor.currency.toUpperCase(),
      target_start_date: editor.targetStart,
      reason: editor.reason.trim(),
      required_skills: editor.skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
    };
    setSaving(true);
    try {
      if (editor.id) {
        await client.updateManpowerRequisition(editor.id, payload, csrfToken(), crypto.randomUUID());
        if (editor.nextState && editor.nextState !== editor.state)
          await client.changeManpowerRequisitionState(
            editor.id,
            { company_id: companyId, state: editor.nextState as "draft" | "submitted" | "cancelled", reason: "" },
            csrfToken(),
            crypto.randomUUID(),
          );
        setSelectedId(editor.id);
        setMessage("The requisition was saved.");
      } else {
        const result = await client.createManpowerRequisition(payload, csrfToken(), crypto.randomUUID());
        setSelectedId(result.id);
        setMessage(`${result.reference} was saved as a draft and recorded in the audit trail.`);
      }
      setEditor(null);
      await load(companyId);
    } catch {
      setMessage(
        "The requisition was rejected. Check the selected active masters and ensure the salary range is within the configured job-grade band.",
      );
    } finally {
      setSaving(false);
    }
  };
  const transition = async (action: "submit" | "approved" | "rejected") => {
    if (!selected) return;
    const reason =
      action === "submit"
        ? "Submitted for HR approval."
        : action === "approved"
          ? "Approved for recruitment."
          : "Rejected after review.";
    setSaving(true);
    try {
      if (action === "submit")
        await client.submitManpowerRequisition(selected.id, { reason }, csrfToken(), crypto.randomUUID());
      else
        await client.decideManpowerRequisition(
          selected.id,
          { decision: action, reason },
          csrfToken(),
          crypto.randomUUID(),
        );
      setMessage(
        `${selected.reference} was ${action === "approved" ? "approved" : action === "rejected" ? "rejected" : "submitted"}.`,
      );
      await load(companyId);
    } catch {
      setMessage(
        "The workflow action was rejected. A requester cannot approve their own requisition unless a valid approval override is recorded.",
      );
    } finally {
      setSaving(false);
    }
  };
  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!session)
    return (
      <Alert>
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          Your session is not active.{" "}
          <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>
            Retry session
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Recruitment access required</AlertTitle>
        <AlertDescription>This screen requires HR employee read permission.</AlertDescription>
      </Alert>
    );
  return (
    <section className="grid min-w-0 gap-4" aria-label="Manpower Requisitions">
      <p className="m-0! text-sm text-muted-foreground">
        Prepare staffing requests for approval before opening a role.
      </p>
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 border-border">
        <label className="grid content-start min-w-0 basis-full sm:basis-48 flex-[1.3] gap-1 text-sm font-medium">
          Search
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Reference, role or department"
          />
        </label>
        <Button variant="outline" onClick={() => void load(companyId)}>
          Search
        </Button>
        {canCreate ? (
          <Button
            onClick={() => {
              setEditor(blankEditor());
              setSelectedId("");
            }}
          >
            + New requisition
          </Button>
        ) : null}
      </div>
      <HrMasterStatusFilter<RequisitionFilter>
        label="Requisition state"
        value={state}
        options={requisitionFilterOptions}
        onChange={(value) => {
          setState(value);
          void load(companyId, value);
        }}
      />
      {loading ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <div className="grid min-w-0 items-start gap-4 ">
          <div className="relative min-w-0 overflow-x-auto rounded-lg border bg-card border-border">
            <WorkTable tableId="app/features/hr/views/hr-manpower-requisitions-workspace:1" className="w-full min-w-210 text-sm">
              <thead className="border-b bg-muted/60 border-border">
                <tr>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Organisation</th>
                  <th className="px-4 py-3 text-left">Headcount</th>
                  <th className="px-4 py-3 text-left">Target</th>
                  <th className="px-4 py-3 text-left">State</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    className={`cursor-pointer border-b border-border last:border-0 ${selectedId === record.id ? "bg-accent" : ""}`}
                    key={record.id}
                    onClick={() => {
                      setSelectedId(record.id);
                      setDetailsOpen(true);
                      setEditor(null);
                    }}
                  >
                    <td className="px-4 py-3">
                      <Button
                        variant="link"
                        className="h-auto p-0 font-semibold"
                        onClick={() => {
                          setSelectedId(record.id);
                          setDetailsOpen(true);
                          setEditor(null);
                        }}
                      >
                        {record.reference}
                      </Button>
                    </td>
                    <td className="px-4 py-3">
                      <strong className="block">{record.job_title}</strong>
                      <span className="text-xs text-muted-foreground">
                        {record.designation} · {record.job_grade}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {record.department}
                      <span className="block text-xs text-muted-foreground">
                        {record.work_location ? `${requisitionLocation(record)} · ` : ""}
                        {hiringBasisLabel(record.hiring_basis)}
                        {record.work_arrangement ? ` · ${workArrangementLabel(record.work_arrangement)}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">{record.positions_requested}</td>
                    <td className="px-4 py-3">{record.target_start_date}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`nx-status nx-status-${record.state === "approved" ? "active" : record.state === "rejected" ? "inactive" : "draft"}`}
                      >
                        {stateLabel(record.state)}
                      </span>
                    </td>
                  </tr>
                ))}
                {records.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                      No live manpower requisitions match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </WorkTable>
          </div>
          {editor ? (
            <HrRecordDrawer
              title={editor.id ? editor.jobTitle || "Edit requisition" : "Add requisition"}
              open={!!editor}
              onClose={() => setEditor(null)}
              busy={saving}
              notice={message}
            >
              <aside className="grid gap-5 rounded-lg border bg-card p-4 border-border">
                {editor.id && editor.state ? (
                  <HrDetailSection title="Status">
                    <label className="grid content-start gap-1 text-sm">
                      Status
                      <select
                        className={selectClass}
                        value={editor.nextState}
                        onChange={(event) =>
                          setEditor({ ...editor, nextState: event.target.value as Requisition["state"] })
                        }
                      >
                        {statusOptions(editor.state).map((state) => (
                          <option key={state} value={state}>
                            {stateLabel(state)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </HrDetailSection>
                ) : null}
                {missingSetup.length && editingFields ? (
                  <p
                    role="status"
                    className="m-0! truncate rounded-md border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] px-3 py-1.5 text-xs text-[var(--nx-warning)]"
                    title={`Setup required: ${missingSetup.join(" and ")}`}
                  >
                    Setup required: {missingSetup.join(" and ")}
                  </p>
                ) : null}
                <fieldset
                  disabled={!editingFields}
                  className="m-0! grid min-w-0 gap-5 border-0 p-0 disabled:opacity-60"
                >
                  <HrDetailSection title="Role">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid content-start gap-1 text-sm sm:col-span-2">
                        Job title
                        <Input
                          value={editor.jobTitle}
                          placeholder="For example Community Handler – Marketing"
                          onChange={(event) => setEditor({ ...editor, jobTitle: event.target.value })}
                        />
                      </label>
                      <label className="grid content-start gap-1 text-sm">
                        Designation
                        <select
                          className={selectClass}
                          value={editor.designationId}
                          onChange={(event) => setEditor({ ...editor, designationId: event.target.value })}
                        >
                          <option value="">Select</option>
                          {designations.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid content-start gap-1 text-sm">
                        Job grade
                        <select
                          className={selectClass}
                          value={editor.gradeId}
                          onChange={(event) => {
                            const grade = grades.find((item) => item.id === event.target.value);
                            setEditor({
                              ...editor,
                              gradeId: event.target.value,
                              currency: grade?.currency_code ?? editor.currency,
                              minimum: grade?.band_minimum ?? editor.minimum,
                              maximum: grade?.band_maximum ?? editor.maximum,
                            });
                          }}
                        >
                          <option value="">Select</option>
                          {grades.map((item) => (
                            <option key={item.id} value={item.id}>
                              {gradeLabel(item)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid content-start gap-1 text-sm">
                        Cost centre
                        <select
                          className={selectClass}
                          value={editor.costCenterId}
                          onChange={(event) => setEditor({ ...editor, costCenterId: event.target.value })}
                        >
                          <option value="">Select</option>
                          {costCentres.map((item) => (
                            <option key={item.id} value={item.id}>
                              {costCentreOptionLabel(item)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid content-start gap-1 text-sm">
                        Hiring basis
                        <select
                          className={selectClass}
                          value={editor.hiringBasis}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              hiringBasis: isHiringBasis(event.target.value) ? event.target.value : "",
                            })
                          }
                        >
                          <option value="">Select</option>
                          {hiringBasisOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid content-start gap-1 text-sm">
                        Headcount
                        <Input
                          inputMode="numeric"
                          value={editor.positions}
                          onChange={(event) => setEditor({ ...editor, positions: event.target.value })}
                        />
                      </label>
                      <label className="grid content-start gap-1 text-sm">
                        Target start
                        <Input
                          type="date"
                          value={editor.targetStart}
                          onChange={(event) => setEditor({ ...editor, targetStart: event.target.value })}
                        />
                      </label>
                    </div>
                  </HrDetailSection>
                  <HrDetailSection title="Where the role works">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid content-start gap-1 text-sm">
                        Department
                        <select
                          className={selectClass}
                          value={editor.departmentId}
                          onChange={(event) => setEditor({ ...editor, departmentId: event.target.value })}
                        >
                          <option value="">Select</option>
                          {departments.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid content-start gap-1 text-sm">
                        Project
                        <select
                          className={selectClass}
                          value={editor.projectId}
                          onChange={(event) => setEditor({ ...editor, projectId: event.target.value })}
                        >
                          <option value="">{projects.length ? "Select" : "No active projects"}</option>
                          {projects.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.code} · {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid content-start gap-1 text-sm">
                        Location
                        <select
                          className={selectClass}
                          value={editor.workLocationId}
                          onChange={(event) => setEditor({ ...editor, workLocationId: event.target.value })}
                        >
                          <option value="">{workLocations.length ? "Select" : "No active work locations yet"}</option>
                          {workLocations.map((item) => (
                            <option key={item.id} value={item.id}>
                              {workLocationLabel(item)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid content-start gap-1 text-sm">
                        Job type
                        <select
                          className={selectClass}
                          value={editor.workArrangement}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              workArrangement: isWorkArrangement(event.target.value) ? event.target.value : "",
                            })
                          }
                        >
                          <option value="">Select</option>
                          {jobTypeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </HrDetailSection>
                  <HrDetailSection title="Salary range">
                    <label className="grid content-start gap-1 text-sm">
                      Currency
                      <select
                        className={selectClass}
                        value={editor.currency}
                        onChange={(event) => setEditor({ ...editor, currency: event.target.value })}
                      >
                        <option value="">{currencyOptions.length ? "Select" : "No company currencies"}</option>
                        {currencyOptions.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid content-start min-w-0 gap-1 text-sm">
                        Minimum salary
                        <Input
                          inputMode="decimal"
                          value={editor.minimum}
                          onChange={(event) => setEditor({ ...editor, minimum: event.target.value })}
                        />
                      </label>
                      <label className="grid content-start min-w-0 gap-1 text-sm">
                        Maximum salary
                        <Input
                          inputMode="decimal"
                          value={editor.maximum}
                          onChange={(event) => setEditor({ ...editor, maximum: event.target.value })}
                        />
                      </label>
                    </div>
                  </HrDetailSection>
                  <HrDetailSection title="Requirements">
                    <label className="grid content-start gap-1 text-sm">
                      Required skills (comma separated)
                      <Input
                        value={editor.skills}
                        onChange={(event) => setEditor({ ...editor, skills: event.target.value })}
                      />
                    </label>
                    <label className="grid content-start gap-1 text-sm">
                      Business reason
                      <textarea
                        className="min-h-24 rounded-md border border-input bg-background p-2"
                        value={editor.reason}
                        onChange={(event) => setEditor({ ...editor, reason: event.target.value })}
                      />
                    </label>
                  </HrDetailSection>
                </fieldset>
                <HrDrawerActions>
                  <Button
                    disabled={saving || (editingFields && (grades.length === 0 || projects.length === 0))}
                    onClick={() => void save()}
                  >
                    {saving ? "Saving..." : editor.id ? "Save changes" : "Save draft"}
                  </Button>
                </HrDrawerActions>
              </aside>
            </HrRecordDrawer>
          ) : selected ? (
            <HrRecordDrawer
              title={selected.job_title}
              open={detailsOpen && !editor}
              onClose={() => setDetailsOpen(false)}
              busy={saving}
              notice={message}
            >
              <aside className="grid min-w-0 gap-4 rounded-lg border bg-card p-5 border-border">
                <HrDetailSummary code={selected.reference} status={selected.state}>
                  {selected.department}
                  {selected.target_start_date ? ` · target start ${hrDisplayDate(selected.target_start_date)}` : ""}
                </HrDetailSummary>
                <HrDetailFigures
                  items={[
                    { label: "Headcount", value: selected.positions_requested },
                    { label: `Minimum (${selected.currency_code})`, value: selected.salary_minimum },
                    { label: `Maximum (${selected.currency_code})`, value: selected.salary_maximum },
                  ]}
                />
                <HrDetailGroup title="Role">
                  <HrDetailTile label="Job title" value={selected.job_title} />
                  <HrDetailTile label="Designation" value={selected.designation} />
                  <HrDetailTile label="Job grade" value={selected.job_grade} />
                  <HrDetailTile
                    label="Cost centre"
                    value={selected.cost_center ?? selected.employment_setup ?? undefined}
                    hint={`${paymentRouteLabel(selected.payment_route)} / ${payCycleLabel(selected.pay_cycle)}`}
                  />
                  <HrDetailTile
                    label="Hiring basis"
                    value={selected.hiring_basis ? hiringBasisLabel(selected.hiring_basis) : undefined}
                  />
                  <HrDetailTile
                    label="Job type"
                    value={selected.work_arrangement ? workArrangementLabel(selected.work_arrangement) : undefined}
                  />
                </HrDetailGroup>
                <HrDetailGroup title="Where the role works">
                  <HrDetailTile label="Department" value={selected.department} />
                  <HrDetailTile label="Project" value={selected.project ?? selected.branch} />
                  <HrDetailTile
                    label="Location"
                    value={selected.work_location ? requisitionLocation(selected) : undefined}
                  />
                </HrDetailGroup>
                <HrDetailGroup title="Requirements">
                  <HrDetailTile label="Target start" value={hrDisplayDate(selected.target_start_date)} />
                  <HrDetailTile
                    label="Required skills"
                    value={
                      selected.required_skills.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {selected.required_skills.map((skill) => (
                            <span
                              key={skill}
                              className="rounded-[5px] border border-border bg-muted px-2 text-xs font-normal"
                            >
                              {skill}
                            </span>
                          ))}
                        </span>
                      ) : undefined
                    }
                  />
                  <HrDetailTile label="Business reason" value={selected.reason} />
                </HrDetailGroup>
                {selected.decision_reason ? (
                  <HrDetailSection title="Decision">
                    <HrDetailNote meta={selected.decided_at ? hrDisplayDate(selected.decided_at, true) : undefined}>
                      {selected.decision_reason}
                    </HrDetailNote>
                  </HrDetailSection>
                ) : null}
                <HrDetailAudit
                  items={[
                    { label: "Created", value: hrDisplayDate(selected.created_at, true) },
                    { label: "Submitted", value: hrDisplayDate(selected.submitted_at, true) },
                    { label: "Decided", value: hrDisplayDate(selected.decided_at, true) },
                  ]}
                />
                <HrDrawerActions>
                  {canCreate ? (
                    <HrConfirmDeleteButton
                      label={`Delete ${selected.reference}`}
                      title={`Delete ${selected.reference}?`}
                      description="Draft, rejected and cancelled requisitions without job openings can be deleted. The deletion is kept in the audit trail."
                      variant="outline"
                      disabled={saving || !["draft", "rejected", "cancelled"].includes(selected.state)}
                      onConfirm={() => remove(selected)}
                    />
                  ) : null}
                  {canCreate || canSubmit || canApprove ? (
                    <HrEditButton
                      label={`Edit ${selected.reference}`}
                      disabled={saving}
                      onClick={() => {
                        setDetailsOpen(false);
                        setEditor(editorFor(selected));
                      }}
                    />
                  ) : null}
                  {selected.state === "draft" && canSubmit ? (
                    <Button disabled={saving} onClick={() => void transition("submit")}>
                      Submit for approval
                    </Button>
                  ) : null}
                  {selected.state === "submitted" && canApprove ? (
                    <>
                      <Button disabled={saving} onClick={() => void transition("approved")}>
                        Approve
                      </Button>
                      <Button disabled={saving} variant="outline" onClick={() => void transition("rejected")}>
                        Reject
                      </Button>
                    </>
                  ) : null}
                </HrDrawerActions>
              </aside>
            </HrRecordDrawer>
          ) : (
            <aside className="rounded-lg border bg-card p-5 text-sm text-muted-foreground border-border">
              Select a requisition or create a new draft.
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
