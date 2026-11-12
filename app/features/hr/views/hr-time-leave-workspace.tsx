"use client";
import { WorkOffsetPagination, WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { HrDrawerActions } from "../components/hr-drawer-context";
import { useHrOperationsScope } from "../components/hr-operations-scope";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { HrApiClient } from "../api/hr-client";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import { HrDetailGroup, HrDetailSummary, HrDetailTile, HrStatusPill } from "../components/hr-detail-tile";
import { HrDeleteButton, HrEditButton } from "../components/hr-icon-buttons";
import { payCycleLabel, paymentRouteLabel } from "../model/employment-setup";
import {
  Field,
  State,
  Metric,
  History,
  useAttendanceRead,
  selectClass,
  panel,
  dayValue,
  localDate,
} from "../components/hr-workspace-controls";
import { attendanceLabel as label } from "../components/attendance-status";
import {
  createHrLeaveTypeRequestSchema,
  updateHrLeavePolicyRequestSchema,
  hrLeaveTypeStatusRequestSchema,
  hrLeaveBalancePostingRequestSchema,
  createHrLeaveRequestSchema,
  hrLeaveRequestActionRequestSchema,
  type HrCompanyDirectory,
  type HrLeaveType,
  type HrLeaveTypeDirectory,
  type HrLeavePolicyInput,
  type HrLeaveBalance,
  type HrLeaveAllocation,
  type HrLeaveRequestDetail,
  type HrLeaveRequestActionRequest,
  type HrAttendanceCompletionResult,
} from "@nexora/contracts";
import { SearchableSelect } from "@/shared/ui/searchable-select";
type Mode = "leave-types" | "leave-balances" | "leave-requests" | "leave-request" | "leave-approval";
type Navigate = (module: string, page: string, record?: string) => void;
type Save = (
  input: unknown,
  operation: (key: string) => Promise<HrAttendanceCompletionResult>,
) => Promise<HrAttendanceCompletionResult | undefined>;
type Shared = {
  saveError?: string;
  client: HrApiClient;
  company: string;
  date: string;
  revision: number;
  busy: boolean;
  save: Save;
  csrf: () => string;
  permissions: string[];
  onNavigate: Navigate;
  onEditing: (v: boolean) => void;
  initial?: Record<string, string>;
};
/** One toolbar row shared by every Leave page: search (applies as you type) and the page action. */
function LeaveToolbar({
  search,
  onSearch,
  placeholder,
  action,
  filter,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  action?: ReactNode;
  /** Optional dropdown placed between search and the action (e.g. request status). */
  filter?: ReactNode;
}) {
  const searchId = useId();
  return (
    <div
      className={`grid gap-3 rounded-lg border border-border bg-card p-3 md:items-end ${filter ? "md:grid-cols-[minmax(12rem,1fr)_11rem_auto]" : "md:grid-cols-[minmax(14rem,1fr)_auto]"}`}
    >
      <label className="grid content-start gap-1 text-sm font-medium" htmlFor={searchId}>
        Search
        <Input
          id={searchId}
          type="search"
          value={search}
          maxLength={100}
          placeholder={placeholder}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      {filter}
      {action}
    </div>
  );
}
/** Applies the typed search after a short pause and returns to the first page. */
function useAppliedSearch(search: string, apply: (value: string) => void) {
  useEffect(() => {
    const timer = setTimeout(() => apply(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search, apply]);
}
/** Leave request statuses as HR & Payroll names them. */
const leaveStatusLabels: Record<string, string> = {
  draft: "Draft",
  // Manager and HR stages are one "Pending" status on screen; the server still routes manager -> HR.
  pending: "Pending",
  pending_manager: "Pending",
  pending_hr: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};
const leaveStatusLabel = (status: string) => leaveStatusLabels[status] ?? label(status);
/** Leave Requests show only the requester's stage: Draft until submitted, then Submitted. */
const requesterStatus = (status: string) => (status === "draft" ? "draft" : "submitted");
const requesterStatusLabel = (status: string) => (status === "draft" ? "Draft" : "Submitted");
/** Leave Requests: the requester's view. "Submitted" = has passed the submit step. */
const requestFilterOptions = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
] as const;
/** Leave Approval: submitted requests by decision status (cancelled requests are not listed). */
const approvalFilterOptions = [
  { value: "all" as const, label: "All" },
  ...(["pending", "approved", "rejected"] as const).map((value) => ({
    value,
    label: leaveStatusLabels[value]!,
  })),
];
type LeaveListFilter = (typeof requestFilterOptions)[number]["value"] | (typeof approvalFilterOptions)[number]["value"];
type LeaveStatusFilter = NonNullable<Parameters<HrApiClient["listLeaveRequests"]>[0]["status"]>;
type LeaveAction = HrLeaveRequestActionRequest["action"];
/** Actions offered on each page; the server still decides which ones the user may take. */
const approvalActions: readonly LeaveAction[] = ["manager_approve", "manager_reject", "hr_approve", "hr_reject"];
const requesterActions: readonly LeaveAction[] = ["submit", "cancel"];
const actionLabel = (action: LeaveAction) =>
  action.endsWith("_approve")
    ? "Approve"
    : action.endsWith("_reject")
      ? "Reject"
      : action === "cancel_approved"
        ? "Cancel approved leave"
        : action === "cancel"
          ? "Cancel request"
          : "Submit";
const dateClass = "box-border! min-w-0! max-w-full!";
function Message({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      {error}
    </div>
  ) : null;
}
function Empty({ text }: { text: string }) {
  return <div className={panel + " py-8 text-center text-sm text-muted-foreground"}>{text}</div>;
}
/** Server offset pager for leave lists, presented with the shared ERP work pagination. */
function Pagination({
  total,
  offset,
  setOffset,
  loading,
  size,
  onSizeChange,
}: {
  total: number;
  offset: number;
  setOffset: (v: number) => void;
  loading: boolean;
  size: number;
  onSizeChange: (size: number) => void;
}) {
  return (
    <WorkOffsetPagination
      busy={loading}
      total={total}
      offset={offset}
      size={size}
      previousDisabled={!offset || loading}
      nextDisabled={offset + size >= total || loading}
      onSizeChange={(next) => {
        onSizeChange(next);
        setOffset(0);
      }}
      onPrevious={() => setOffset(Math.max(0, offset - size))}
      onNext={() => setOffset(offset + size)}
    />
  );
}
const newPolicy = (date: string): HrLeavePolicyInput => ({
  effective_from: date,
  annual_entitlement_days: "20",
  accrual_method: "annual_grant",
  carry_forward: false,
  maximum_carry_forward_days: "0",
  maximum_balance_days: "40",
  minimum_request_days: "0.5",
  maximum_request_days: "30",
  requires_hr_approval: true,
  applicable_cost_center_ids: [],
  applicable_employment_setup_ids: [],
  applicable_genders: [],
  document_required_after_days: null,
});
type CostCentreOption = HrLeaveTypeDirectory["cost_centres"][number];
function PolicyEditor({
  policy,
  setPolicy,
  costCentres,
  busy,
}: {
  policy: HrLeavePolicyInput;
  setPolicy: (p: HrLeavePolicyInput) => void;
  costCentres: CostCentreOption[];
  busy: boolean;
}) {
  const update = <K extends keyof HrLeavePolicyInput>(key: K, value: HrLeavePolicyInput[K]) =>
    setPolicy({ ...policy, [key]: value });
  return (
    <fieldset disabled={busy} className="m-0! min-w-0 border-0! p-0! grid min-w-0 gap-4">
      <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
        <Field title="Effective from">
          <Input
            type="date"
            className={dateClass}
            value={policy.effective_from}
            onChange={(e) => update("effective_from", e.target.value)}
            required
          />
        </Field>
        <Field title="Annual entitlement (days)">
          <Input
            inputMode="decimal"
            value={policy.annual_entitlement_days}
            onChange={(e) => update("annual_entitlement_days", e.target.value)}
            required
          />
        </Field>
        <Field title="Accrual method">
          <select
            className={selectClass}
            value={policy.accrual_method}
            onChange={(e) => update("accrual_method", e.target.value as HrLeavePolicyInput["accrual_method"])}
          >
            <option value="annual_grant">Annual grant</option>
            <option value="monthly_accrual">Monthly accrual</option>
            <option value="on_completion">On completion</option>
          </select>
        </Field>
        <Field title="Minimum request (days)">
          <Input
            inputMode="decimal"
            value={policy.minimum_request_days}
            onChange={(e) => update("minimum_request_days", e.target.value)}
            required
          />
        </Field>
        <Field title="Maximum request (days)">
          <Input
            inputMode="decimal"
            value={policy.maximum_request_days}
            onChange={(e) => update("maximum_request_days", e.target.value)}
            required
          />
        </Field>
        <Field title="Maximum balance (0 = no cap)">
          <Input
            inputMode="decimal"
            value={policy.maximum_balance_days}
            onChange={(e) => update("maximum_balance_days", e.target.value)}
            required
          />
        </Field>
        <Field title="Carry-forward limit (days)">
          <Input
            inputMode="decimal"
            disabled={!policy.carry_forward}
            value={policy.maximum_carry_forward_days}
            onChange={(e) => update("maximum_carry_forward_days", e.target.value)}
            required
          />
        </Field>
        <Field title="Document required above (days)">
          <Input
            inputMode="decimal"
            value={policy.document_required_after_days ?? ""}
            onChange={(e) => update("document_required_after_days", e.target.value || null)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <label htmlFor="leave-policy-hr" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="leave-policy-hr"
            checked={policy.requires_hr_approval}
            onCheckedChange={(v) => update("requires_hr_approval", v === true)}
          />
          Require HR approval after manager
        </label>
        <label htmlFor="leave-policy-carry" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="leave-policy-carry"
            checked={policy.carry_forward}
            onCheckedChange={(v) =>
              setPolicy({
                ...policy,
                carry_forward: v === true,
                maximum_carry_forward_days: v === true ? policy.maximum_carry_forward_days : "0",
              })
            }
          />
          Allow carry-forward
        </label>
      </div>
      <div>
        <p className="text-sm font-medium">Eligible cost centres</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {costCentres.map((c) => (
            <label htmlFor={"leave-cost-centre-" + c.id} key={c.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={"leave-cost-centre-" + c.id}
                checked={policy.applicable_cost_center_ids.includes(c.id)}
                onCheckedChange={(v) =>
                  update(
                    "applicable_cost_center_ids",
                    v === true
                      ? [...policy.applicable_cost_center_ids, c.id]
                      : policy.applicable_cost_center_ids.filter((x) => x !== c.id),
                  )
                }
              />
              <span>
                {c.name}
                <span className="block text-xs text-muted-foreground">
                  {c.code} · {paymentRouteLabel(c.payment_route)} / {payCycleLabel(c.pay_cycle)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
function LeaveTypes(props: Shared) {
  const [workPageSize, setWorkPageSize] = useState(25);
  const { client, company, date, revision, busy, save, csrf, permissions, onEditing } = props;
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [statusFilter, setStatusFilter] = useState<HrMasterStatus>("active"),
    [offset, setOffset] = useState(0),
    [editor, setEditor] = useState<HrLeaveType | "new" | null>(null),
    [policy, setPolicy] = useState<HrLeavePolicyInput>(newPolicy(date)),
    [code, setCode] = useState("AUTO"),
    [name, setName] = useState(""),
    [paid, setPaid] = useState(true),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [selectedId, setSelectedId] = useState("");
  const query = useAttendanceRead(JSON.stringify([company, date, revision, offset, applied, workPageSize]), () =>
    client.listLeaveTypes({ company_id: company, as_of: date, search: applied || undefined, limit: workPageSize, offset }),
  );
  const applySearch = useCallback((value: string) => {
    setApplied(value);
    setOffset(0);
  }, []);
  useAppliedSearch(search, applySearch);
  const types = (query.data?.items ?? []).filter((t) => statusFilter === "all" || t.status === statusFilter);
  useEffect(() => {
    onEditing(!!editor);
    return () => onEditing(false);
  }, [editor, onEditing]);
  function edit(type: HrLeaveType | "new") {
    setEditor(type);
    setError("");
    setReason("");
    if (type === "new") {
      setPolicy(newPolicy(date));
      setCode("AUTO");
      setName("");
      setPaid(true);
    } else {
      const p = type.policy;
      setPolicy(
        p
          ? {
              effective_from: new Date(
                Date.parse((p.effective_from > date ? p.effective_from : date) + "T00:00:00Z") + 86400000,
              )
                .toISOString()
                .slice(0, 10),
              annual_entitlement_days: p.annual_entitlement_days,
              accrual_method: p.accrual_method,
              carry_forward: p.carry_forward,
              maximum_carry_forward_days: p.maximum_carry_forward_days,
              maximum_balance_days: p.maximum_balance_days,
              minimum_request_days: p.minimum_request_days,
              maximum_request_days: p.maximum_request_days,
              requires_hr_approval: p.requires_hr_approval,
              applicable_cost_center_ids: p.applicable_cost_center_ids,
              // Employment setups are retired (HR149); eligibility is by cost centre.
              applicable_employment_setup_ids: [],
              applicable_genders: p.applicable_genders,
              document_required_after_days: p.document_required_after_days,
            }
          : newPolicy(date),
      );
      setName(type.name);
      setPaid(type.paid);
    }
  }
  async function submit() {
    setError("");
    if (!editor) return;
    if (editor === "new") {
      const parsed = createHrLeaveTypeRequestSchema.safeParse({
        company_id: company,
        code,
        name,
        paid,
        policy,
        reason,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Review the policy.");
        return;
      }
      if (await save(parsed.data, (k) => client.createLeaveType(parsed.data, csrf(), k))) setEditor(null);
    } else {
      const parsed = updateHrLeavePolicyRequestSchema.safeParse({
        company_id: company,
        expected_version: editor.version,
        policy,
        reason,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Review the policy.");
        return;
      }
      if (await save(parsed.data, (k) => client.updateLeavePolicy(editor.id, parsed.data, csrf(), k))) setEditor(null);
    }
  }
  /** One-click availability change; the API records actor, time and this fixed reason. */
  async function toggleStatus(t: HrLeaveType) {
    setError("");
    const deactivating = t.status === "active";
    const parsed = hrLeaveTypeStatusRequestSchema.safeParse({
      company_id: company,
      expected_version: t.version,
      status: deactivating ? "inactive" : "active",
      reason: deactivating ? "Deactivated from Leave Types." : "Reactivated from Leave Types.",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "The status could not be changed.");
      return;
    }
    await save(parsed.data, (k) => client.changeLeaveTypeStatus(t.id, parsed.data, csrf(), k));
  }
  const canManage = permissions.includes("hr.leave.type.manage");
  const current = query.data?.items.find((t) => t.id === selectedId) ?? null;
  return (
    <div className="grid min-w-0 gap-4">
      <LeaveToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search code or leave type"
        action={
          canManage ? (
            <Button className="text-primary-foreground!" disabled={busy || !!editor} onClick={() => edit("new")}>
              <Plus className="size-4" />
              New leave type
            </Button>
          ) : undefined
        }
      />
      <HrMasterStatusFilter value={statusFilter} onChange={setStatusFilter} />
      <Message error={error || query.error} />
      {editor && (
        <HrRecordDrawer
          title={editor === "new" ? "Add leave type" : `Edit ${editor.name}`}
          open={!!editor}
          onClose={() => setEditor(null)}
          busy={busy}
          error={error || props.saveError}
        >
          <WorkForm
            className="grid gap-5"
            aria-label="Leave policy editor"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {editor === "new" && (
              <fieldset
                disabled={busy}
                className="m-0! min-w-0 border-0! p-0! grid min-w-0 items-start gap-4 sm:grid-cols-2"
              >
                <div className="sm:col-span-2">
                  <Field title="Leave name">
                    <Input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} required />
                  </Field>
                </div>
                <Field title="Leave code (automatic)">
                  <Input value="Assigned on save · LT-001…" readOnly maxLength={32} required />
                </Field>
                <Field title="Pay treatment">
                  <select
                    className={selectClass}
                    value={paid ? "paid" : "unpaid"}
                    onChange={(e) => {
                      const next = e.target.value === "paid";
                      setPaid(next);
                      if (!next) setPolicy((p) => ({ ...p, annual_entitlement_days: "0", requires_hr_approval: true }));
                    }}
                  >
                    <option value="paid">Paid leave</option>
                    <option value="unpaid">Unpaid leave</option>
                  </select>
                </Field>
              </fieldset>
            )}
            <PolicyEditor
              policy={policy}
              setPolicy={setPolicy}
              costCentres={query.data?.cost_centres ?? []}
              busy={busy}
            />
            <Field title="Policy change reason">
              <Textarea
                value={reason}
                maxLength={1000}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <HrDrawerActions>
              <Button className="text-primary-foreground!" disabled={busy} type="submit">
                {busy ? "Saving…" : editor === "new" ? "Create leave type" : "Save changes"}
              </Button>
            </HrDrawerActions>
          </WorkForm>
        </HrRecordDrawer>
      )}
      {query.loading ? (
        <Skeleton className="h-40" />
      ) : !types.length ? (
        <Empty text="No leave types match this company, search and status." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <WorkTable paging={false} tableId="app/features/hr/views/hr-time-leave-workspace:1" className="w-full min-w-180 border-collapse text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-px whitespace-nowrap px-4 py-3">Leave code</th>
                <th className="px-4 py-3">Leave type</th>
                <th className="px-4 py-3">Pay</th>
                <th className="px-4 py-3">Entitlement</th>
                <th className="px-4 py-3">Approval</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${t.name} (${t.code})`}
                  aria-disabled={busy || !!editor}
                  className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedId === t.id ? "bg-primary/5" : ""}`}
                  onClick={() => {
                    if (!busy && !editor) setSelectedId(t.id);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !busy && !editor) {
                      e.preventDefault();
                      setSelectedId(t.id);
                    }
                  }}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{t.code}</td>
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.paid ? "Paid" : "Unpaid"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {t.policy
                      ? `${dayValue(t.policy.annual_entitlement_days)} days · ${label(t.policy.accrual_method)}`
                      : "No policy"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {t.policy ? (t.policy.requires_hr_approval ? "Manager + HR" : "Manager") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <HrStatusPill status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </WorkTable>
        </div>
      )}
      <Pagination
        total={query.data?.total ?? 0}
        offset={offset}
        setOffset={setOffset}
        loading={query.loading}
        size={workPageSize}
        onSizeChange={setWorkPageSize}
      />
      <HrRecordDrawer
        title={current?.name ?? "Leave type"}
        description={current ? `${current.code} · Leave type` : ""}
        open={Boolean(current) && !editor}
        onClose={() => setSelectedId("")}
        busy={busy}
        error={error || props.saveError}
        footer={
          current && canManage ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => void toggleStatus(current)}>
                {busy ? "Saving…" : current.status === "active" ? "Deactivate" : "Activate"}
              </Button>
              <HrEditButton label={`Edit ${current.name}`} disabled={busy} onClick={() => edit(current)} />
            </>
          ) : undefined
        }
      >
        {current ? (
          <div className="grid min-w-0 gap-4">
            <HrDetailSummary code={current.code} status={current.status}>
              {current.paid ? "Paid leave" : "Unpaid leave"}
            </HrDetailSummary>
            <HrDetailGroup title="Policy">
              {current.policy ? (
                <>
                  <HrDetailTile
                    label="Policy version"
                    value={`v${current.policy.version_number} from ${current.policy.effective_from}`}
                  />
                  <HrDetailTile
                    label="Annual entitlement"
                    value={`${dayValue(current.policy.annual_entitlement_days)} days · ${label(current.policy.accrual_method)}`}
                  />
                  <HrDetailTile
                    label="Request limit"
                    value={`${dayValue(current.policy.minimum_request_days)}–${dayValue(current.policy.maximum_request_days)} days`}
                  />
                  <HrDetailTile
                    label="Maximum balance"
                    value={
                      Number(current.policy.maximum_balance_days)
                        ? `${dayValue(current.policy.maximum_balance_days)} days`
                        : "No cap"
                    }
                  />
                  <HrDetailTile
                    label="Carry-forward"
                    value={
                      current.policy.carry_forward
                        ? `Up to ${dayValue(current.policy.maximum_carry_forward_days)} days`
                        : "Off"
                    }
                  />
                  <HrDetailTile
                    label="Approval route"
                    value={current.policy.requires_hr_approval ? "Manager + HR" : "Manager"}
                  />
                  <HrDetailTile
                    label="Document required"
                    value={
                      current.policy.document_required_after_days !== null
                        ? `Above ${dayValue(current.policy.document_required_after_days)} days`
                        : "Not required"
                    }
                  />
                </>
              ) : (
                <HrDetailTile label="Policy" value={undefined} />
              )}
            </HrDetailGroup>
          </div>
        ) : null}
      </HrRecordDrawer>
    </div>
  );
}
function LeaveBalances(props: Shared) {
  const [workPageSize, setWorkPageSize] = useState(25);
  const [ledgerPageSize, setLedgerPageSize] = useState(25);
  const { client, company, date, revision, busy, save, csrf, permissions, onEditing } = props;
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<HrLeaveBalance | null>(null),
    [posting, setPosting] = useState(false),
    [kind, setKind] = useState<"opening" | "accrual" | "carry_forward" | "adjustment" | "expiry">("adjustment"),
    [days, setDays] = useState(""),
    [effective, setEffective] = useState(date),
    [periodStart, setPeriodStart] = useState(""),
    [periodEnd, setPeriodEnd] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [ledgerOffset, setLedgerOffset] = useState(0);
  const query = useAttendanceRead(JSON.stringify([company, date, revision, offset, applied, workPageSize]), () =>
    client.listLeaveBalances({ company_id: company, as_of: date, search: applied || undefined, limit: workPageSize, offset }),
  );
  const applySearch = useCallback((value: string) => {
    setApplied(value);
    setOffset(0);
  }, []);
  useAppliedSearch(search, applySearch);
  const ledger = useAttendanceRead(
    selected
      ? JSON.stringify([company, selected.employee_id, selected.leave_type_id, effective, revision, ledgerOffset, ledgerPageSize])
      : null,
    () =>
      client.leaveLedger({
        company_id: company,
        employee_id: selected!.employee_id,
        leave_type_id: selected!.leave_type_id,
        as_of: effective,
        limit: ledgerPageSize,
        offset: ledgerOffset,
      }),
  );
  const [postingHash, setPostingHash] = useState("");
  useEffect(() => {
    onEditing(posting);
    return () => onEditing(false);
  }, [posting, onEditing]);
  async function post() {
    if (!selected) return;
    setError("");
    const parsed = hrLeaveBalancePostingRequestSchema.safeParse({
      company_id: company,
      employee_id: selected.employee_id,
      leave_type_id: selected.leave_type_id,
      effective_on: effective,
      kind,
      days,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      expected_balance_hash: postingHash,
      reason,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the posting.");
      return;
    }
    if (await save(parsed.data, (k) => client.postLeaveBalance(parsed.data, csrf(), k))) {
      setPosting(false);
      setDays("");
      setReason("");
    }
  }
  const canPost = permissions.includes("hr.leave.balance.adjust") && !!selected?.paid;
  const closeLedger = () => {
    if (busy) return;
    setPosting(false);
    setSelected(null);
  };
  const openLedger = (b: HrLeaveBalance) => {
    if (busy) return;
    setSelected(b);
    setEffective(date);
    setLedgerOffset(0);
    setPosting(false);
    setError("");
  };
  return (
    <div className="grid min-w-0 gap-4">
      <LeaveToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search employee or leave type"
      />
      <Message error={error || query.error} />
      {query.loading ? (
        <Skeleton className="h-40" />
      ) : !query.data?.items.length ? (
        <Empty text="No operational employee and leave type matches this date. Create leave types and check employee placements." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <WorkTable paging={false} tableId="app/features/hr/views/hr-time-leave-workspace:2" className="w-full min-w-180 border-collapse text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-px whitespace-nowrap px-4 py-3">Employee no.</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Leave type</th>
                <th className="px-4 py-3 text-right">Posted</th>
                <th className="px-4 py-3 text-right">Pending</th>
                <th className="px-4 py-3 text-right">Future</th>
                <th className="px-4 py-3 text-right">Spendable</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((b) => {
                const key = b.employee_id + b.leave_type_id;
                const active = selected?.employee_id === b.employee_id && selected?.leave_type_id === b.leave_type_id;
                return (
                  <tr
                    key={key}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${b.display_name} · ${b.leave_type} ledger`}
                    aria-disabled={busy}
                    className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? "bg-primary/5" : ""}`}
                    onClick={() => openLedger(b)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openLedger(b);
                      }
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{b.employee_number}</td>
                    <td className="px-4 py-3 font-medium">{b.display_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.leave_type} · {b.paid ? "Paid" : "Unpaid"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{b.paid ? dayValue(b.balance) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{dayValue(b.reserved)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {dayValue(b.future_used)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {b.paid ? dayValue(b.available) : "Unpaid"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </WorkTable>
        </div>
      )}
      <Pagination
        total={query.data?.total ?? 0}
        offset={offset}
        setOffset={setOffset}
        loading={query.loading}
        size={workPageSize}
        onSizeChange={setWorkPageSize}
      />
      <HrRecordDrawer
        title={
          posting ? "Adjust balance" : selected ? `${selected.display_name} · ${selected.leave_type}` : "Leave ledger"
        }
        description={selected ? `${selected.employee_number} · Leave ledger` : ""}
        open={Boolean(selected)}
        onClose={posting ? () => setPosting(false) : closeLedger}
        busy={busy}
        error={error || ledger.error || props.saveError}
        footer={
          selected && !posting && canPost ? (
            <HrEditButton
              label="Adjust balance"
              disabled={busy || !ledger.data}
              onClick={() => {
                setPostingHash(ledger.data!.balance.hash);
                setPosting(true);
                setDays("");
                setReason("");
              }}
            />
          ) : undefined
        }
      >
        {selected && posting ? (
          <WorkForm
            className="grid gap-4"
            aria-label="Post leave balance entry"
            onSubmit={(e) => {
              e.preventDefault();
              void post();
            }}
          >
            <fieldset
              disabled={busy}
              className="m-0! min-w-0 border-0! p-0! grid min-w-0 items-start gap-4 sm:grid-cols-2"
            >
              <Field title="Posting kind">
                <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                  <option value="opening">Opening balance</option>
                  <option value="accrual">Accrual</option>
                  <option value="carry_forward">Carry-forward</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="expiry">Expiry</option>
                </select>
              </Field>
              <Field title="Effective date">
                <Input
                  type="date"
                  className={dateClass}
                  max={localDate()}
                  value={effective}
                  onChange={(e) => setEffective(e.target.value)}
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <Field title="Days (negative for deductions)">
                  <Input inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} required />
                </Field>
              </div>
              <Field title="Source period start">
                <Input
                  type="date"
                  className={dateClass}
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  required={["accrual", "carry_forward", "expiry"].includes(kind)}
                />
              </Field>
              <Field title="Source period end">
                <Input
                  type="date"
                  className={dateClass}
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  required={["accrual", "carry_forward", "expiry"].includes(kind)}
                />
              </Field>
            </fieldset>
            <Field title="Balance posting reason">
              <Textarea
                value={reason}
                maxLength={1000}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {ledger.data?.balance.hash !== postingHash && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--nx-warning)]">
                Balance evidence changed.
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy || !ledger.data}
                  onClick={() => setPostingHash(ledger.data!.balance.hash)}
                >
                  Review refreshed balance
                </Button>
              </div>
            )}
            <HrDrawerActions>
              <Button className="text-primary-foreground!" disabled={busy || ledger.loading} type="submit">
                {busy ? "Posting…" : "Confirm posting"}
              </Button>
            </HrDrawerActions>
          </WorkForm>
        ) : selected ? (
          ledger.loading ? (
            <Skeleton className="h-28" />
          ) : ledger.data ? (
            <div className="grid min-w-0 gap-4">
              <HrDetailGroup title="Balance">
                <HrDetailTile label="Opening" value={`${dayValue(ledger.data.balance.opening)} days`} />
                <HrDetailTile
                  label="Accrued / carried"
                  value={`${dayValue(ledger.data.balance.accrued)} / ${dayValue(ledger.data.balance.carried)} days`}
                />
                <HrDetailTile
                  label="Adjusted / expired"
                  value={`${dayValue(ledger.data.balance.adjusted)} / ${dayValue(ledger.data.balance.expired)} days`}
                />
                <HrDetailTile
                  label="Allocated to settlement"
                  value={`${dayValue(ledger.data.balance.encashed)} days`}
                />
                <HrDetailTile
                  label="Spendable"
                  value={selected.paid ? `${dayValue(ledger.data.balance.available)} days` : "Unpaid"}
                />
              </HrDetailGroup>
              <HrDetailGroup title="Ledger entries">
                {ledger.data.items.map((t) => (
                  <HrDetailTile
                    key={t.id}
                    label={`${label(t.kind)} · ${t.effective_on}`}
                    value={`${dayValue(t.days)} days`}
                    hint={`${t.actor_name} · ${t.reason}`}
                  />
                ))}
                {!ledger.data.items.length && <HrDetailTile label="Entries" value={undefined} />}
              </HrDetailGroup>
              <Pagination
                total={ledger.data.total}
                offset={ledgerOffset}
                setOffset={setLedgerOffset}
                loading={ledger.loading}
                size={ledgerPageSize}
                onSizeChange={setLedgerPageSize}
              />
            </div>
          ) : null
        ) : null}
      </HrRecordDrawer>
    </div>
  );
}
function RequestEditor(props: Shared) {
  const { client, company, date, revision, busy, save, csrf, onNavigate, onEditing, initial } = props;
  const [from, setFrom] = useState(date),
    [to, setTo] = useState(date),
    [employee, setEmployee] = useState(initial?.employee_id ?? ""),
    [type, setType] = useState(initial?.leave_type_id ?? ""),
    [document, setDocument] = useState(""),
    [search, setSearch] = useState(""),
    [lookup, setLookup] = useState(""),
    [choices, setChoices] = useState<Record<string, "full" | "first_half" | "second_half" | "skip">>({}),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  // Typing in the Employee dropdown searches the server after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => setLookup(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const validRange = !!from && !!to && to >= from && Date.parse(to) - Date.parse(from) <= 61 * 86400000;
  const query = useAttendanceRead(
    validRange ? JSON.stringify([company, from, to, employee, type, document, lookup, revision]) : null,
    () =>
      client.leaveContext({
        company_id: company,
        from_date: from,
        to_date: to,
        employee_id: employee || undefined,
        leave_type_id: type || undefined,
        document_id: document || undefined,
        search: lookup || undefined,
      }),
  );
  const context = query.data,
    days: HrLeaveAllocation[] = (context?.days ?? [])
      .filter((d) => d.chargeable && (choices[d.on_date] ?? "full") !== "skip")
      .map((d) => ({ on_date: d.on_date, portion: (choices[d.on_date] ?? "full") as HrLeaveAllocation["portion"] })),
    total = days.reduce((n, d) => n + (d.portion === "full" ? 1 : 0.5), 0);
  useEffect(() => {
    onEditing(Boolean(employee || type || reason || Object.keys(choices).length || from !== date || to !== date));
    return () => onEditing(false);
  }, [onEditing, employee, type, reason, choices, from, to, date]);
  const canSubmit = props.permissions.includes("hr.leave.request.submit");
  const backToRequests = (requestId?: string) =>
    onNavigate(
      "hr",
      "leave-requests",
      JSON.stringify({ company_id: company, as_of: date, ...(requestId ? { request_id: requestId } : {}) }),
    );
  /** Saves the draft and, for "submit", sends it straight into Leave Approval. */
  async function submit(intent: "draft" | "submit") {
    setError("");
    const parsed = createHrLeaveRequestSchema.safeParse({
      company_id: company,
      employee_id: employee,
      leave_type_id: type,
      from_date: from,
      to_date: to,
      document_id: document || null,
      days,
      reason,
      expected_evidence_hash: context?.hash,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the request calendar.");
      return;
    }
    const r = await save(parsed.data, (k) => client.createLeaveRequest(parsed.data, csrf(), k));
    if (!r) return;
    if (intent === "draft") {
      backToRequests(r.id);
      return;
    }
    // Submit uses the saved request's own version and evidence hash.
    let submitted: HrAttendanceCompletionResult | undefined;
    try {
      const saved = await client.getLeaveRequest(company, r.id);
      if (saved.allowed_actions.includes("submit")) {
        const action = hrLeaveRequestActionRequestSchema.parse({
          company_id: company,
          action: "submit",
          expected_version: saved.version,
          expected_evidence_hash: saved.context?.hash,
          reason: parsed.data.reason,
        });
        submitted = await save(action, (k) => client.actOnLeaveRequest(r.id, action, csrf(), k));
      }
    } catch {
      submitted = undefined;
    }
    // If submission did not go through, reopen the saved draft so it can be submitted from there.
    backToRequests(submitted ? undefined : r.id);
  }
  return (
    <HrRecordDrawer title="Add Leave Request" open onClose={() => backToRequests()} busy={busy} error={props.saveError}>
      <section className={panel} aria-label="Leave request editor">
        <Message
          error={error || query.error || (!validRange ? "Choose an ordered date range of up to 62 calendar days." : "")}
        />
        <WorkForm
          className="grid min-w-0 gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(canSubmit ? "submit" : "draft");
          }}
        >
          <fieldset
            disabled={busy}
            className="m-0! min-w-0 border-0! p-0! grid min-w-0 items-start gap-4 sm:grid-cols-2"
          >
            <Field title="From date">
              <Input
                type="date"
                className={dateClass}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setChoices({});
                }}
                required
              />
            </Field>
            <Field title="To date">
              <Input
                type="date"
                className={dateClass}
                min={from}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setChoices({});
                }}
                required
              />
            </Field>
            <div className="grid min-w-0 content-start gap-2 text-sm font-medium">
              <label htmlFor="leave-employee">Employee</label>
              <SearchableSelect
                id="leave-employee"
                label="Employee"
                value={employee}
                placeholder="Select employee"
                searchPlaceholder="Search by name or employee number…"
                loading={query.loading && !context}
                required
                search={search}
                onSearchChange={setSearch}
                options={context?.employees.map((e) => ({ value: e.id, label: `${e.code} · ${e.name}` })) ?? []}
                onValueChange={(next) => {
                  setEmployee(next);
                  setDocument("");
                  setChoices({});
                }}
              />
            </div>
            <Field title="Leave type">
              <select
                className={selectClass}
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setChoices({});
                }}
                required
              >
                <option value="">Select leave type</option>
                {context?.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.paid ? "Paid" : "Unpaid"}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Verified supporting document">
              <select className={selectClass} value={document} onChange={(e) => setDocument(e.target.value)}>
                <option value="">No document selected</option>
                {context?.documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>
          {query.loading ? (
            <Skeleton className="h-32" />
          ) : (
            context &&
            employee && (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric title="Requested days" value={total} hint="Off days and holidays excluded" />
                  <Metric
                    title="Spendable balance"
                    value={
                      context.balance?.paid ? dayValue(context.balance.available) : type ? "Unpaid" : "Choose type"
                    }
                    hint="Pending requests reserve days"
                  />
                  <Metric
                    title="Reporting manager"
                    value={context.manager_name ?? "Unassigned"}
                    hint="Effective employee reporting route"
                  />
                  <Metric
                    title="Calendar"
                    value={context.days.filter((d) => d.chargeable).length}
                    hint="Configured working dates in range"
                  />
                </div>
                {context.blockers.length > 0 && (
                  <ul className="list-disc space-y-1 rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] p-4 pl-8 text-sm text-[var(--nx-warning)]">
                    {context.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                <div className="grid min-w-0 gap-2" aria-label="Leave allocation calendar">
                  {context.days.map((d) => (
                    <div
                      key={d.on_date}
                      className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center"
                    >
                      <div>
                        <strong className="text-sm">
                          {new Date(d.on_date + "T12:00:00Z").toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                          })}
                        </strong>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {d.shift_name ?? "No shift"} ·{" "}
                          {d.chargeable
                            ? `Policy ${d.policy ? `v${d.policy.version_number}` : "missing"}`
                            : label(d.status)}
                        </p>
                        {d.issues.map((i) => (
                          <p className="mt-1 text-xs text-[var(--nx-warning)]" key={i}>
                            {i}
                          </p>
                        ))}
                      </div>
                      {d.chargeable ? (
                        <select
                          aria-label={"Leave portion " + d.on_date}
                          className={selectClass}
                          disabled={busy}
                          value={choices[d.on_date] ?? "full"}
                          onChange={(e) =>
                            setChoices({ ...choices, [d.on_date]: e.target.value as (typeof choices)[string] })
                          }
                        >
                          <option value="full">Full day · 1 day</option>
                          <option value="first_half">First half · 0.5 day</option>
                          <option value="second_half">Second half · 0.5 day</option>
                          <option value="skip">Do not request</option>
                        </select>
                      ) : (
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-4" />
                          No leave deducted
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )
          )}
          <Field title="Leave request reason">
            <Textarea
              value={reason}
              maxLength={1000}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <HrDrawerActions>
            {canSubmit ? (
              <Button
                variant="outline"
                type="button"
                disabled={
                  busy || query.loading || !context || !employee || !type || !days.length || !!context.blockers.length
                }
                onClick={(e) => {
                  if (e.currentTarget.form?.reportValidity()) void submit("draft");
                }}
              >
                Save as draft
              </Button>
            ) : null}
            <Button
              className="text-primary-foreground!"
              disabled={
                busy || query.loading || !context || !employee || !type || !days.length || !!context.blockers.length
              }
              type="submit"
            >
              {busy ? "Saving…" : canSubmit ? "Submit" : "Save as draft"}
            </Button>
          </HrDrawerActions>
        </WorkForm>
      </section>
    </HrRecordDrawer>
  );
}
/**
 * Leave Requests (`approval` false): All / Draft / Submitted, with Add Leave Request.
 * Leave Approval (`approval` true): every submitted request by approval status, with
 * Approve / Reject in the drawer. Manager -> HR ordering and who may decide stay on the server.
 */
function LeaveRequests(props: Shared & { approval: boolean }) {
  const {
    client,
    company,
    date,
    revision,
    busy,
    save,
    csrf,
    permissions,
    onNavigate,
    onEditing,
    initial,
    approval,
  } = props;
  const [workPageSize, setWorkPageSize] = useState(25);
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [filter, setFilter] = useState<LeaveListFilter>("all"),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState(initial?.request_id ?? ""),
    [action, setAction] = useState<HrLeaveRequestActionRequest["action"] | "">(""),
    [reason, setReason] = useState(""),
    [override, setOverride] = useState(false),
    [version, setVersion] = useState(0),
    [hash, setHash] = useState<string | undefined>(),
    [error, setError] = useState("");
  const status = filter === "all" || filter === "submitted" ? undefined : (filter as LeaveStatusFilter);
  const list = useAttendanceRead(JSON.stringify([company, date, revision, offset, applied, filter, approval, workPageSize]), () =>
    client.listLeaveRequests({
      company_id: company,
      as_of: date,
      search: applied || undefined,
      status,
      queue_only: "false",
      submitted_only: approval || filter === "submitted" ? "true" : "false",
      exclude_cancelled: "true",
      limit: workPageSize,
      offset,
    }),
  );
  const applySearch = useCallback((value: string) => {
    setApplied(value);
    setOffset(0);
  }, []);
  useAppliedSearch(search, applySearch);
  const detail = useAttendanceRead<HrLeaveRequestDetail>(
    selected ? JSON.stringify([company, selected, revision]) : null,
    () => client.getLeaveRequest(company, selected),
  );
  useEffect(() => {
    onEditing(!!action);
    return () => onEditing(false);
  }, [action, onEditing]);
  async function decide() {
    if (!detail.data || !action) return;
    setError("");
    const parsed = hrLeaveRequestActionRequestSchema.safeParse({
      company_id: company,
      action,
      expected_version: version,
      expected_evidence_hash: hash,
      reason,
      override_self_approval: override,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the decision.");
      return;
    }
    if (await save(parsed.data, (k) => client.actOnLeaveRequest(detail.data!.id, parsed.data, csrf(), k))) {
      setAction("");
      setReason("");
      setOverride(false);
    }
  }
  const openRequest = (id: string) => {
    if (busy || action) return;
    setSelected(id);
    setAction("");
    setError("");
  };
  const startAction = (a: HrLeaveRequestActionRequest["action"]) => {
    if (!detail.data) return;
    setAction(a);
    setVersion(detail.data.version);
    setHash(detail.data.context?.hash);
    setReason("");
    setOverride(false);
  };
  const request = detail.data && detail.data.id === selected ? detail.data : null;
  const isDraft = request?.status === "draft";
  // Requesters submit or delete drafts; approvers approve or reject pending requests.
  const pageActions = (request?.allowed_actions ?? []).filter(
    (a) => (approval ? approvalActions : requesterActions).includes(a) && (a !== "cancel" || isDraft),
  );
  const isPending = request?.status === "pending_manager" || request?.status === "pending_hr";
  return (
    <div className="grid min-w-0 gap-4">
      <LeaveToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Employee, number or reference"
        action={
          !approval && permissions.includes("hr.leave.request.create") ? (
            <Button
              className="text-primary-foreground!"
              disabled={busy || !!action}
              onClick={() => onNavigate("hr", "leave-request", JSON.stringify({ company_id: company, as_of: date }))}
            >
              <Plus className="size-4" />
              Add leave request
            </Button>
          ) : undefined
        }
      />
      <HrMasterStatusFilter<LeaveListFilter>
        label={approval ? "Approval status" : "Request status"}
        value={filter}
        options={approval ? approvalFilterOptions : requestFilterOptions}
        onChange={(value) => {
          setFilter(value);
          setOffset(0);
        }}
      />
      <Message error={error || list.error} />
      {list.loading ? (
        <Skeleton className="h-40" />
      ) : !list.data?.items.length ? (
        <Empty
          text={
            approval
              ? "No submitted leave requests match this filter."
              : "No leave requests match this company and filter."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <WorkTable paging={false} tableId="app/features/hr/views/hr-time-leave-workspace:3" className="w-full min-w-180 border-collapse text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-px whitespace-nowrap px-4 py-3">Reference</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Leave type</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3 text-right">Days</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((r) => (
                <tr
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${r.reference} (${r.display_name})`}
                  aria-disabled={busy || !!action}
                  className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === r.id ? "bg-primary/5" : ""}`}
                  onClick={() => openRequest(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openRequest(r.id);
                    }
                  }}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{r.reference}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{r.display_name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{r.employee_number}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.leave_type} · {r.paid ? "Paid" : "Unpaid"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {r.from_date} – {r.to_date}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{dayValue(r.requested_days)}</td>
                  <td className="px-4 py-3">
                    {approval ? (
                      <State value={r.status} text={leaveStatusLabel(r.status)} />
                    ) : (
                      <State value={requesterStatus(r.status)} text={requesterStatusLabel(r.status)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </WorkTable>
        </div>
      )}
      <Pagination
        total={list.data?.total ?? 0}
        offset={offset}
        setOffset={setOffset}
        loading={list.loading}
        size={workPageSize}
        onSizeChange={setWorkPageSize}
      />
      <HrRecordDrawer
        title={
          action ? `${actionLabel(action)} · ${request?.reference ?? ""}` : (request?.reference ?? "Leave request")
        }
        description={request ? `${request.display_name} · ${request.leave_type}` : ""}
        open={Boolean(selected)}
        onClose={() => {
          if (action) setAction("");
          else if (!busy) setSelected("");
        }}
        busy={busy}
        error={error || detail.error || props.saveError}
        footer={
          request && !action ? (
            <>
              {pageActions
                .filter((a) => !(isDraft && a === "cancel"))
                .map((a) => (
                  <Button
                    key={a}
                    variant={a.includes("reject") || a.startsWith("cancel") ? "outline" : "default"}
                    className={a.includes("reject") || a.startsWith("cancel") ? "" : "text-primary-foreground!"}
                    disabled={busy}
                    onClick={() => startAction(a)}
                  >
                    {actionLabel(a)}
                  </Button>
                ))}
              {isDraft && pageActions.includes("cancel") ? (
                <HrDeleteButton label="Delete draft" disabled={busy} onClick={() => startAction("cancel")} />
              ) : null}
              {approval && isPending ? (
                <Button variant="outline" disabled={busy} onClick={() => setSelected("")}>
                  Keep pending
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        {selected && detail.loading && !request ? (
          <Skeleton className="h-40" />
        ) : request && action ? (
          <WorkForm
            className="grid gap-4"
            aria-label="Leave request decision"
            onSubmit={(e) => {
              e.preventDefault();
              void decide();
            }}
          >
            <Field title={isDraft && action === "cancel" ? "Reason for deleting this draft" : "Decision reason"}>
              <Textarea
                value={reason}
                maxLength={1000}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {action.includes("_") && request.self_decision_requires_override && (
              <label htmlFor="leave-approval-override" className="flex items-start gap-2 text-sm">
                <Checkbox
                  id="leave-approval-override"
                  checked={override}
                  onCheckedChange={(v) => setOverride(v === true)}
                />
                I acknowledge an audited super-administrator override (deciding for the routed manager or overriding
                approver separation).
              </label>
            )}
            <HrDrawerActions>
              <Button variant="outline" disabled={busy} onClick={() => setAction("")}>
                Back
              </Button>
              <Button
                className="text-primary-foreground!"
                type="submit"
                disabled={busy || (action.includes("_") && request.self_decision_requires_override && !override)}
              >
                {busy
                  ? "Saving…"
                  : isDraft && action === "cancel"
                    ? "Delete draft"
                    : `Confirm ${actionLabel(action).toLowerCase()}`}
              </Button>
            </HrDrawerActions>
          </WorkForm>
        ) : request ? (
          <div className="grid min-w-0 gap-4">
            <HrDetailSummary
              code={request.reference}
              status={approval ? request.status : requesterStatus(request.status)}
              statusLabel={approval ? leaveStatusLabel(request.status) : requesterStatusLabel(request.status)}
            >
              Version {request.version}
            </HrDetailSummary>
            <HrDetailGroup title="Request">
              <HrDetailTile label="Employee" value={request.display_name} hint={request.employee_number} />
              <HrDetailTile label="Leave type" value={`${request.leave_type} · ${request.paid ? "Paid" : "Unpaid"}`} />
              <HrDetailTile label="Dates" value={`${request.from_date} – ${request.to_date}`} />
              <HrDetailTile label="Requested days" value={dayValue(request.requested_days)} />
              <HrDetailTile
                label="Spendable balance"
                value={request.paid ? dayValue(request.context?.balance?.available ?? "0") : "Not capped"}
              />
              <HrDetailTile label="Reporting manager" value={request.context?.manager_name ?? undefined} />
              <HrDetailTile label="Reason" value={request.reason} />
            </HrDetailGroup>
            {request.context_unavailable && (
              <p className="text-sm text-[var(--nx-warning)]">{request.context_unavailable}</p>
            )}
            {request.context?.blockers.map((b) => (
              <p key={b} className="text-sm text-[var(--nx-warning)]">
                {b}
              </p>
            ))}
            {!request.workflow_managed && (
              <p className="text-sm text-muted-foreground">Legacy leave evidence is preserved as read-only history.</p>
            )}
            <HrDetailGroup title="Days">
              {request.days.map((d) => (
                <HrDetailTile
                  key={d.on_date}
                  label={d.on_date}
                  value={
                    <button
                      type="button"
                      className="inline-flex cursor-pointer appearance-none items-center gap-1 border-0 bg-transparent p-0 font-sans text-left text-[13.5px]! text-foreground underline-offset-4 hover:underline"
                      disabled={busy}
                      onClick={() =>
                        onNavigate(
                          "hr",
                          "daily-attendance",
                          JSON.stringify({ company_id: company, on_date: d.on_date, search: request.employee_number }),
                        )
                      }
                    >
                      {label(d.portion)} · {dayValue(d.days)} day <ArrowRight className="size-3" />
                    </button>
                  }
                />
              ))}
            </HrDetailGroup>
            <History items={request.history} />
          </div>
        ) : null}
      </HrRecordDrawer>
    </div>
  );
}
export function HrTimeLeaveWorkspace({
  mode,
  onNavigate,
  initialReference,
}: {
  mode: Mode;
  onNavigate: Navigate;
  initialReference?: string;
}) {
  const { api, session, csrfToken, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const initial = useMemo(() => {
    try {
      const parsed = JSON.parse(initialReference ?? "{}");
      return parsed && typeof parsed === "object"
        ? (Object.fromEntries(
            Object.entries(parsed).filter(
              ([k, v]) =>
                ["company_id", "as_of", "employee_id", "leave_type_id", "request_id"].includes(k) &&
                typeof v === "string" &&
                v.length <= 128,
            ),
          ) as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  }, [initialReference]);
  const [companyChoice] = useState(initial.company_id ?? ""),
    [date] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initial.as_of ?? "") ? initial.as_of : localDate()),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [, setEditing] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const permissions = session?.user.permissions ?? [],
    permission =
      mode === "leave-types"
        ? "hr.leave.type.read"
        : mode === "leave-balances"
          ? "hr.leave.balance.read"
          : "hr.leave.request.read",
    canRead = permissions.includes(permission);
  const companies = useAttendanceRead<HrCompanyDirectory>(canRead ? "time-leave-companies" : null, () =>
    client.companies(),
  );
  const company = companies.data?.items.some((c) => c.id === companyChoice)
    ? companyChoice
    : (companies.data?.items[0]?.id ?? "");
  useHrOperationsScope(company, date);
  const locked = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const save: Save = async (input, operation) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await operation(retry.current.key);
      retry.current = null;
      setNotice(`Saved · ${label(result.status)} · version ${result.version}`);
      setRevision((v) => v + 1);
      return result;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The change could not be saved. Refresh the evidence and retry.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  if (sessionLoading) return <Skeleton className="h-40" />;
  if (!canRead) return <Empty text="You do not have permission to view this Time & Leave screen." />;
  const shared: Shared = {
    saveError: error,
    client,
    company,
    date,
    revision,
    busy,
    save,
    csrf: csrfToken,
    permissions,
    onNavigate,
    onEditing: setEditing,
    initial,
  };
  return (
    <div
      className="grid min-w-0 gap-5 font-sans [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_select]:font-normal! [&_textarea]:font-normal! [&_input]:font-normal!"
      aria-label="Time and Leave workspace"
    >
      <Message error={error || companies.error} />
      {notice && (
        <div
          role="status"
          className="rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] p-3 text-sm text-[var(--nx-success-text)]"
        >
          {notice}
        </div>
      )}
      {companies.loading ? (
        <Skeleton className="h-36" />
      ) : !company ? (
        <Empty text="No authorized company is available." />
      ) : mode === "leave-types" ? (
        <LeaveTypes key={company + date} {...shared} />
      ) : mode === "leave-balances" ? (
        <LeaveBalances key={company + date} {...shared} />
      ) : mode === "leave-request" ? (
        permissions.includes("hr.leave.request.create") ? (
          <>
            {" "}
            <LeaveRequests key={company + date + "background"} {...shared} approval={false} />{" "}
            <RequestEditor key={company + date} {...shared} />{" "}
          </>
        ) : (
          <Empty text="Leave creation permission is required." />
        )
      ) : (
        <LeaveRequests key={company + date + mode} {...shared} approval={mode === "leave-approval"} />
      )}
    </div>
  );
}
