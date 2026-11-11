"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  HrEmployeeAssignmentDirectory,
  HrEmployeeDirectory,
  HrEmployeePromotionRequestReview,
  HrEmployeeTransferRequestReview,
  HrMasterDirectory,
  HrOrganizationUnitDirectory,
} from "@nexora/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";

import { HrApiClient } from "../api/hr-client";
import { approvalOverrideReviewState } from "../approval-override-ui";
import { HrClickableRow } from "../components/hr-clickable-row";
import {
  HrDetailGroup,
  HrDetailNote,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  HrStatusPill,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrPagination, HrSearchField, matchesSearch, useHrPage } from "../components/hr-list-controls";
import { HrMasterStatusFilter } from "../components/hr-master-status-filter";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { hrCell } from "../components/hr-table";
import { isWithinUnit } from "../model/organization-hierarchy";

type Kind = "transfer" | "promotion";
type Status = "all" | "pending" | "approved" | "rejected";
type Request = HrEmployeeTransferRequestReview | HrEmployeePromotionRequestReview;
type Assignment = HrEmployeeAssignmentDirectory["items"][number];

const statusOptions: readonly { value: Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const labels = {
  transfer: { singular: "Transfer", lower: "transfer", plural: "transfers" },
  promotion: { singular: "Promotion", lower: "promotion", plural: "promotions" },
} as const;

const selectClass =
  "h-9 w-full min-w-0 truncate rounded-md border border-input bg-background px-2.5 text-sm text-foreground";
const labelClass = "grid min-w-0 content-start gap-1.5 text-sm font-medium text-foreground";

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const placement = (branch: string, department: string) =>
  [branch, department].filter(Boolean).join(" · ") || "Not assigned";

function isTransfer(request: Request): request is HrEmployeeTransferRequestReview {
  return "proposed_branch" in request;
}

/** The change a request proposes, as "from → to" for the list. */
function changeSummary(request: Request): { from: string; to: string } {
  return isTransfer(request)
    ? {
        from: placement(request.source_branch, request.source_department),
        to: placement(request.proposed_branch, request.proposed_department),
      }
    : { from: request.source_designation, to: request.proposed_designation };
}

/** Employee Changes: Transfers and Promotions keep separate records and approvals. */
export function HrEmployeeChangesWorkspace({ kind }: { kind: Kind }) {
  const { api, csrfToken, session, activeCompany, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const text = labels[kind];
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.employee_assignment.change");
  const canRequest = permissions.includes(
    kind === "transfer" ? "hr.employee_assignment.transfer" : "hr.employee_assignment.change",
  );
  const canApprove = permissions.includes("hr.employee_assignment.change");
  const canUseApprovalOverride =
    session?.user.roles.includes("super_administrator") === true &&
    permissions.includes("platform.approval.override") &&
    session.impersonation === undefined;
  const userId = session?.user.id;
  const companyId = activeCompany?.id ?? "";

  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Request[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshKey, setRefreshKey] = useState(0);
  const [openedId, setOpenedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!companyId || !canRead) return;
    let active = true;
    const load =
      kind === "transfer"
        ? client.transferRequests({ companyId, status, limit: 100 })
        : client.promotionRequests({ companyId, status, limit: 100 });
    load
      .then((result) => {
        if (!active) return;
        setItems(
          [...result.items].sort((a, b) => b.requested_at.localeCompare(a.requested_at) || b.id.localeCompare(a.id)),
        );
        setState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, `${text.singular} requests could not be loaded.`));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [canRead, client, companyId, kind, status, refreshKey, text.singular]);

  const visible = items.filter((item) => {
    const change = changeSummary(item);
    return matchesSearch(search, [item.employee_name, item.employee_number, change.from, change.to, item.status]);
  });
  const listPage = useHrPage(visible, `${status}:${search.trim()}`);
  const opened = items.find((item) => item.id === openedId) ?? null;
  const override = approvalOverrideReviewState(opened, opened?.requested_by === userId, canUseApprovalOverride);

  const reload = () => {
    setState("loading");
    setRefreshKey((value) => value + 1);
  };

  const decide = async (decision: "approved" | "rejected") => {
    if (!opened || busy) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Enter the decision reason.");
      return;
    }
    const fingerprint = `${opened.id}:${decision}:${trimmed}`;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const input = { decision, reason: trimmed };
      if (kind === "transfer")
        await client.decideTransferRequest(opened.employee_id, opened.id, input, csrfToken(), retry.current.key);
      else await client.decidePromotionRequest(opened.employee_id, opened.id, input, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice(`${text.singular} for ${opened.employee_name} ${decision}.`);
      setReason("");
      reload();
    } catch (cause) {
      setError(message(cause, `The ${text.lower} decision could not be saved.`));
    } finally {
      setBusy(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Employee assignment change permission is required.</AlertDescription>
      </Alert>
    );

  return (
    <section className="grid min-w-0 gap-3" aria-label={text.singular === "Transfer" ? "Transfers" : "Promotions"}>
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end">
        <HrSearchField
          id={`hr-${kind}-search`}
          value={search}
          onChange={setSearch}
          placeholder="Search employee name or number"
        />
        {canRequest ? (
          <Button
            type="button"
            className="w-full md:w-auto"
            disabled={!companyId}
            onClick={() => {
              setError("");
              setNotice("");
              setCreating(true);
            }}
          >
            + New {text.lower}
          </Button>
        ) : null}
      </div>
      <HrMasterStatusFilter<Status>
        label={`${text.singular} status`}
        value={status}
        options={statusOptions}
        onChange={(value) => {
          setStatus(value);
          setState("loading");
        }}
      />
      {notice && !opened && !creating ? (
        <p role="status" className="m-0! text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {!companyId ? (
        <Alert>
          <AlertDescription>Choose a company at sign-in to see these requests.</AlertDescription>
        </Alert>
      ) : null}
      {state === "error" ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {error || `${text.singular} requests could not be loaded.`}
            <Button type="button" variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state === "loading" && companyId ? <Skeleton className="h-32 w-full" /> : null}
      {state === "ready" ? (
        <>
          <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{text.singular} requests</caption>
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  <th scope="col" className={`${hrCell} font-semibold`}>
                    Employee
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold max-sm:hidden`}>
                    {kind === "transfer" ? "Placement" : "Designation"}
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold max-md:hidden`}>
                    Effective
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold`}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {listPage.pageRows.map((item) => {
                  const change = changeSummary(item);
                  return (
                    <HrClickableRow
                      key={item.id}
                      onOpen={() => {
                        setError("");
                        setNotice("");
                        setReason("");
                        setOpenedId(item.id);
                      }}
                    >
                      <td className={hrCell}>
                        <span className="block font-medium wrap-anywhere">{item.employee_name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{item.employee_number}</span>
                      </td>
                      <td className={`${hrCell} text-muted-foreground max-sm:hidden`}>
                        <span className="wrap-anywhere">
                          {change.from} → <span className="text-foreground">{change.to}</span>
                        </span>
                      </td>
                      <td className={`${hrCell} text-muted-foreground max-md:hidden`}>
                        {hrDisplayDate(item.effective_on)}
                      </td>
                      <td className={hrCell}>
                        <HrStatusPill status={item.status} />
                      </td>
                    </HrClickableRow>
                  );
                })}
                {!visible.length ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      {search.trim() ? "No requests match this search." : `No ${text.plural} yet.`}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <HrPagination
            label={`${text.singular} pages`}
            page={listPage.page}
            pageCount={listPage.pageCount}
            total={listPage.total}
            onPageChange={listPage.setPage}
          />
        </>
      ) : null}

      <HrRecordDrawer
        title={opened?.employee_name ?? text.singular}
        description={`${text.singular} request details`}
        open={!!opened}
        busy={busy}
        error={opened ? error : undefined}
        notice={opened ? notice : undefined}
        onClose={() => setOpenedId("")}
      >
        {opened ? (
          <div className="grid min-w-0 gap-4">
            <HrDetailSummary code={opened.employee_number} status={opened.status}>
              {text.singular} · effective {hrDisplayDate(opened.effective_on)}
            </HrDetailSummary>
            <HrDetailGroup title="Employee">
              <HrDetailTile label="Name" value={opened.employee_name} />
              <HrDetailTile label="Employee number" value={opened.employee_number} mono />
            </HrDetailGroup>
            {isTransfer(opened) ? (
              <HrDetailGroup title="Transfer">
                <HrDetailTile
                  label="Current placement"
                  value={placement(opened.source_branch, opened.source_department)}
                />
                <HrDetailTile
                  label="New placement"
                  value={placement(opened.proposed_branch, opened.proposed_department)}
                />
                <HrDetailTile label="Job" value={opened.proposed_job} />
                <HrDetailTile label="Designation" value={opened.proposed_designation} />
                <HrDetailTile label="Job grade" value={opened.proposed_job_grade} />
                <HrDetailTile label="Work location" value={opened.proposed_work_location} />
                <HrDetailTile label="Effective date" value={hrDisplayDate(opened.effective_on)} />
              </HrDetailGroup>
            ) : (
              <HrDetailGroup title="Promotion">
                <HrDetailTile
                  label="Designation"
                  value={`${opened.source_designation} → ${opened.proposed_designation}`}
                />
                <HrDetailTile label="Job" value={`${opened.source_job} → ${opened.proposed_job}`} />
                <HrDetailTile label="Job grade" value={`${opened.source_job_grade} → ${opened.proposed_job_grade}`} />
                <HrDetailTile label="Effective date" value={hrDisplayDate(opened.effective_on)} />
              </HrDetailGroup>
            )}
            <HrDetailGroup title="Approval">
              <HrDetailTile label="Status" value={<HrStatusPill status={opened.status} />} />
              <HrDetailTile label="Requested" value={hrDisplayDate(opened.requested_at, true)} />
              <HrDetailTile
                label="Decided"
                value={opened.decided_at ? hrDisplayDate(opened.decided_at, true) : "Awaiting approval"}
              />
            </HrDetailGroup>
            <HrDetailSection title="Reason">
              <HrDetailNote>{opened.reason}</HrDetailNote>
            </HrDetailSection>
            {opened.decision_reason ? (
              <HrDetailSection title="Decision">
                <HrDetailNote>{opened.decision_reason}</HrDetailNote>
              </HrDetailSection>
            ) : null}
            {opened.status === "pending" && canApprove ? (
              override.independentApproverRequired ? (
                <Alert>
                  <AlertDescription>
                    You submitted this {text.lower}, so a different approver must decide it.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {override.overrideAllowed ? <SuperAdminOverrideWarning /> : null}
                  <label htmlFor={`${kind}-decision-reason`} className={labelClass}>
                    Decision reason
                    <Textarea
                      id={`${kind}-decision-reason`}
                      rows={2}
                      value={reason}
                      maxLength={1000}
                      disabled={busy}
                      onChange={(event) => {
                        setReason(event.target.value);
                        retry.current = null;
                      }}
                    />
                  </label>
                  <HrDrawerActions>
                    <Button type="button" variant="destructive" disabled={busy} onClick={() => void decide("rejected")}>
                      Reject
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => void decide("approved")}>
                      {busy ? "Saving…" : "Approve"}
                    </Button>
                  </HrDrawerActions>
                </>
              )
            ) : null}
          </div>
        ) : null}
      </HrRecordDrawer>

      <HrRecordDrawer
        title={`New ${text.lower}`}
        description={`Request an employee ${text.lower}`}
        open={creating}
        busy={busy}
        onClose={() => setCreating(false)}
      >
        {creating ? (
          <NewChangeForm
            kind={kind}
            client={client}
            csrfToken={csrfToken}
            companyId={companyId}
            busy={busy}
            onBusy={setBusy}
            onCreated={(employeeName) => {
              setCreating(false);
              setNotice(`${text.singular} for ${employeeName} submitted for approval.`);
              setStatus("pending");
              reload();
            }}
          />
        ) : null}
      </HrRecordDrawer>
    </section>
  );
}

function NewChangeForm({
  kind,
  client,
  csrfToken,
  companyId,
  busy,
  onBusy,
  onCreated,
}: {
  kind: Kind;
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onCreated: (employeeName: string) => void;
}) {
  const [employees, setEmployees] = useState<HrEmployeeDirectory["items"]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [source, setSource] = useState<Assignment | null>(null);
  const [sourceState, setSourceState] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");
  const [placements, setPlacements] = useState<HrOrganizationUnitDirectory["items"]>([]);
  const [masters, setMasters] = useState<HrMasterDirectory["items"]>([]);
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [jobId, setJobId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [jobGradeId, setJobGradeId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const effectiveOn = today();

  // Employees for the picker, searched on the server as the user types.
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      client
        .employees({ companyId, search: employeeSearch.trim() || undefined, limit: 100 })
        .then((result) => {
          if (active) setEmployees(result.items);
        })
        .catch((cause) => {
          if (active) setError(message(cause, "Employees could not be loaded."));
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [client, companyId, employeeSearch]);

  // Options for the proposed change.
  useEffect(() => {
    let active = true;
    const load =
      kind === "transfer"
        ? client.organizationUnits({ companyId, limit: 200 }).then((result) => {
            if (active) setPlacements(result.items);
          })
        : Promise.all([
            client.masters({ companyId, type: "job", activeOnly: true, limit: 100 }),
            client.masters({ companyId, type: "designation", activeOnly: true, limit: 100 }),
            client.masters({ companyId, type: "job_grade", activeOnly: true, limit: 100 }),
          ]).then((results) => {
            if (active) setMasters(results.flatMap((result) => result.items));
          });
    load.catch((cause) => {
      if (active) setError(message(cause, "The change options could not be loaded."));
    });
    return () => {
      active = false;
    };
  }, [client, companyId, kind]);

  const chooseEmployee = (id: string) => {
    setEmployeeId(id);
    setSource(null);
    setError("");
    retry.current = null;
    if (!id) {
      setSourceState("idle");
      return;
    }
    setSourceState("loading");
    client
      .employeeAssignments(id)
      .then((result) => {
        const current =
          result.items.find(
            (item) => item.assignment_status === "active" && item.effective_from <= today() && !item.effective_to,
          ) ?? null;
        setSource(current);
        setSourceState(current ? "ready" : "missing");
        setBranchId(current?.branch_id ?? "");
        setDepartmentId(current?.department_id ?? "");
        setJobId(current?.job_id ?? "");
        setDesignationId(current?.designation_id ?? "");
        setJobGradeId(current?.job_grade_id ?? "");
      })
      .catch((cause) => {
        setError(message(cause, "The employee's assignment could not be loaded."));
        setSourceState("error");
      });
  };

  const branches = placements.filter((item) => item.type === "branch");
  const departments = placements.filter(
    (item) => item.type === "department" && (!branchId || isWithinUnit(placements, item.id, branchId)),
  );
  const byType = (type: HrMasterDirectory["items"][number]["type"]) => masters.filter((item) => item.type === type);
  const unitName = (id: string | null) => (id ? (placements.find((item) => item.id === id)?.name ?? "") : "");
  const changed = source
    ? kind === "transfer"
      ? branchId !== (source.branch_id ?? "") || departmentId !== (source.department_id ?? "")
      : jobId !== source.job_id || designationId !== source.designation_id || jobGradeId !== source.job_grade_id
    : false;
  const employee = employees.find((item) => item.id === employeeId);

  const submit = async () => {
    if (!source || busy) return;
    const trimmed = reason.trim();
    if (!changed) {
      setError(
        kind === "transfer" ? "Choose a different project or department." : "Change the job, designation or grade.",
      );
      return;
    }
    if (!trimmed) {
      setError("Enter the reason.");
      return;
    }
    if (kind === "transfer" && (!branchId || !departmentId)) {
      setError("Choose the new project and department.");
      return;
    }
    if (!source.job_id) {
      setError("The employee's active assignment has no job.");
      return;
    }
    const input =
      kind === "transfer"
        ? {
            company_id: companyId,
            source_assignment_id: source.id,
            branch_id: branchId,
            department_id: departmentId,
            job_id: source.job_id,
            designation_id: source.designation_id,
            job_grade_id: source.job_grade_id,
            cost_center_id: source.cost_center_id,
            work_location_id: source.work_location_id,
            ...(source.employment_setup_id ? { employment_setup_id: source.employment_setup_id } : {}),
            ...(source.reporting_manager_id ? { reporting_manager_id: source.reporting_manager_id } : {}),
            effective_on: effectiveOn,
            reason: trimmed,
          }
        : {
            company_id: companyId,
            source_assignment_id: source.id,
            job_id: jobId,
            designation_id: designationId,
            job_grade_id: jobGradeId,
            effective_on: effectiveOn,
            reason: trimmed,
          };
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    onBusy(true);
    setError("");
    try {
      if (kind === "transfer")
        await client.createTransferRequest(
          employeeId,
          input as Parameters<HrApiClient["createTransferRequest"]>[1],
          csrfToken(),
          retry.current.key,
        );
      else
        await client.createPromotionRequest(
          employeeId,
          input as Parameters<HrApiClient["createPromotionRequest"]>[1],
          csrfToken(),
          retry.current.key,
        );
      retry.current = null;
      onCreated(employee?.display_name ?? "the employee");
    } catch (cause) {
      setError(message(cause, `The ${kind} request could not be submitted.`));
    } finally {
      onBusy(false);
    }
  };

  return (
    <form
      className="grid min-w-0 gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className={labelClass}>
        <span id={`${kind}-employee-label`}>Employee</span>
        <SearchableSelect
          label="Employee"
          value={employeeId}
          required
          disabled={busy}
          placeholder="Choose employee"
          searchPlaceholder="Search employee name or number…"
          search={employeeSearch}
          onSearchChange={setEmployeeSearch}
          options={employees.map((item) => ({
            value: item.id,
            label: `${item.employee_number} · ${item.display_name}`,
          }))}
          onValueChange={chooseEmployee}
        />
      </div>
      {sourceState === "loading" ? <Skeleton className="h-24 w-full" /> : null}
      {sourceState === "missing" ? (
        <Alert>
          <AlertDescription>This employee has no active assignment to change.</AlertDescription>
        </Alert>
      ) : null}
      {source ? (
        <>
          <HrDetailGroup title="Current assignment">
            {kind === "transfer" ? (
              <>
                <HrDetailTile label="Project" value={unitName(source.branch_id)} />
                <HrDetailTile label="Department" value={unitName(source.department_id)} />
              </>
            ) : null}
            <HrDetailTile label="Designation" value={source.designation} />
            <HrDetailTile label="Job" value={source.job} />
            <HrDetailTile label="Job grade" value={source.job_grade} />
          </HrDetailGroup>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {kind === "transfer" ? (
              <>
                <label htmlFor="transfer-new-project" className={labelClass}>
                  New project
                  <select
                    id="transfer-new-project"
                    className={selectClass}
                    value={branchId}
                    disabled={busy}
                    onChange={(event) => {
                      setBranchId(event.target.value);
                      setDepartmentId("");
                      retry.current = null;
                    }}
                  >
                    <option value="">Select project</option>
                    {branches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="transfer-new-department" className={labelClass}>
                  New department
                  <select
                    id="transfer-new-department"
                    className={selectClass}
                    value={departmentId}
                    disabled={busy || !branchId}
                    onChange={(event) => {
                      setDepartmentId(event.target.value);
                      retry.current = null;
                    }}
                  >
                    <option value="">Select department</option>
                    {departments.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.code})
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <MasterField
                  label="New designation"
                  value={designationId}
                  items={byType("designation")}
                  disabled={busy}
                  onChange={setDesignationId}
                />
                <MasterField label="New job" value={jobId} items={byType("job")} disabled={busy} onChange={setJobId} />
                <MasterField
                  label="New job grade"
                  value={jobGradeId}
                  items={byType("job_grade")}
                  disabled={busy}
                  onChange={setJobGradeId}
                />
              </>
            )}
            <label htmlFor={`${kind}-effective-on`} className={labelClass}>
              Effective date
              <Input id={`${kind}-effective-on`} type="date" value={effectiveOn} readOnly disabled />
            </label>
          </div>
          <label htmlFor={`${kind}-reason`} className={labelClass}>
            Reason
            <Textarea
              id={`${kind}-reason`}
              rows={3}
              value={reason}
              maxLength={1000}
              disabled={busy}
              onChange={(event) => {
                setReason(event.target.value);
                retry.current = null;
              }}
            />
          </label>
          <HrDrawerActions>
            <Button type="submit" disabled={busy || !changed}>
              {busy ? "Submitting…" : "Submit for approval"}
            </Button>
          </HrDrawerActions>
        </>
      ) : null}
    </form>
  );
}

function MasterField({
  label,
  value,
  items,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  items: HrMasterDirectory["items"];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `promotion-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <label htmlFor={id} className={labelClass}>
      {label}
      <select
        id={id}
        className={selectClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select {label.replace("New ", "").toLowerCase()}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} ({item.code})
          </option>
        ))}
      </select>
    </label>
  );
}
