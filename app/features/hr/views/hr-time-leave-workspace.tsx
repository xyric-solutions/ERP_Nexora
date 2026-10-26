"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Layers3,
  Wallet,
  ClipboardList,
  Plus,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { HrApiClient } from "../api/hr-client";
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
  type HrLeavePolicyInput,
  type HrLeaveBalance,
  type HrLeaveAllocation,
  type HrLeaveRequestDetail,
  type HrLeaveRequestActionRequest,
  type HrAttendanceCompletionResult,
} from "@nexora/contracts";
type Mode = "leave-types" | "leave-balances" | "leave-requests" | "leave-request" | "leave-approval";
type Navigate = (module: string, page: string, record?: string) => void;
type Save = (
  input: unknown,
  operation: (key: string) => Promise<HrAttendanceCompletionResult>,
) => Promise<HrAttendanceCompletionResult | undefined>;
type Shared = {
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
function Pagination({
  total,
  offset,
  setOffset,
  loading,
}: {
  total: number;
  offset: number;
  setOffset: (v: number) => void;
  loading: boolean;
}) {
  return total > 25 ? (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span>
        {offset + 1}–{Math.min(offset + 25, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={!offset || loading} onClick={() => setOffset(Math.max(0, offset - 25))}>
          Previous
        </Button>
        <Button variant="outline" disabled={offset + 25 >= total || loading} onClick={() => setOffset(offset + 25)}>
          Next
        </Button>
      </div>
    </div>
  ) : null;
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
  applicable_category_ids: [],
  applicable_genders: [],
  document_required_after_days: null,
});
function PolicyEditor({
  policy,
  setPolicy,
  categories,
  busy,
}: {
  policy: HrLeavePolicyInput;
  setPolicy: (p: HrLeavePolicyInput) => void;
  categories: { id: string; name: string }[];
  busy: boolean;
}) {
  const update = <K extends keyof HrLeavePolicyInput>(key: K, value: HrLeavePolicyInput[K]) =>
    setPolicy({ ...policy, [key]: value });
  return (
    <fieldset disabled={busy} className="m-0! min-w-0 border-0! p-0! grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <Field title="Document required above (days, optional)">
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
        <p className="text-sm font-medium">Employee categories</p>
        <p className="mt-1 text-xs text-muted-foreground">Leave every category unchecked to apply to all categories.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <label htmlFor={"leave-category-" + c.id} key={c.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={"leave-category-" + c.id}
                checked={policy.applicable_category_ids.includes(c.id)}
                onCheckedChange={(v) =>
                  update(
                    "applicable_category_ids",
                    v === true
                      ? [...policy.applicable_category_ids, c.id]
                      : policy.applicable_category_ids.filter((x) => x !== c.id),
                  )
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      </div>
      <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
        Entitlement, accrual, carry-forward and expiry are authorized ledger postings from Leave Balances. Saving a
        policy does not silently credit balances. A later version preserves all existing request dates.
      </p>
    </fieldset>
  );
}
function LeaveTypes(props: Shared) {
  const { client, company, date, revision, busy, save, csrf, permissions, onEditing } = props;
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [offset, setOffset] = useState(0),
    [editor, setEditor] = useState<HrLeaveType | "new" | null>(null),
    [policy, setPolicy] = useState<HrLeavePolicyInput>(newPolicy(date)),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [paid, setPaid] = useState(true),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [statusTarget, setStatusTarget] = useState<HrLeaveType | null>(null),
    [statusReason, setStatusReason] = useState("");
  const query = useAttendanceRead(JSON.stringify([company, date, revision, offset, applied]), () =>
    client.listLeaveTypes({ company_id: company, as_of: date, search: applied || undefined, limit: 25, offset }),
  );
  useEffect(() => {
    onEditing(!!editor || !!statusTarget);
    return () => onEditing(false);
  }, [editor, statusTarget, onEditing]);
  function edit(type: HrLeaveType | "new") {
    setEditor(type);
    setStatusTarget(null);
    setError("");
    setReason("");
    if (type === "new") {
      setPolicy(newPolicy(date));
      setCode("");
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
              applicable_category_ids: p.applicable_category_ids,
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
  async function status() {
    if (!statusTarget) return;
    const parsed = hrLeaveTypeStatusRequestSchema.safeParse({
      company_id: company,
      expected_version: statusTarget.version,
      status: statusTarget.status === "active" ? "inactive" : "active",
      reason: statusReason,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the reason.");
      return;
    }
    if (await save(parsed.data, (k) => client.changeLeaveTypeStatus(statusTarget.id, parsed.data, csrf(), k)))
      setStatusTarget(null);
  }
  return (
    <div className="grid min-w-0 gap-4">
      <Message error={error || query.error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Company leave types and effective policy versions. Paid status and type codes stay stable for historical
          requests.
        </p>
        {permissions.includes("hr.leave.type.manage") && (
          <Button
            className="text-primary-foreground!"
            disabled={busy || !!editor || !!statusTarget}
            onClick={() => edit("new")}
          >
            <Plus className="size-4" />
            New leave type
          </Button>
        )}
      </div>
      {editor && (
        <section className={panel} aria-label="Leave policy editor">
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="text-base font-semibold">
              {editor === "new" ? "Create leave type" : `New policy version · ${editor.name}`}
            </h2>
            <Button variant="ghost" disabled={busy} onClick={() => setEditor(null)}>
              Close editor
            </Button>
          </div>
          <form
            className="mt-4 grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {editor === "new" && (
              <fieldset disabled={busy} className="m-0! min-w-0 border-0! p-0! grid min-w-0 gap-4 sm:grid-cols-3">
                <Field title="Leave code">
                  <Input value={code} maxLength={32} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
                </Field>
                <Field title="Leave name">
                  <Input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} required />
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
            <PolicyEditor policy={policy} setPolicy={setPolicy} categories={query.data?.categories ?? []} busy={busy} />
            <Field title="Policy change reason">
              <Textarea
                value={reason}
                minLength={12}
                maxLength={1000}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </Field>
            <div>
              <Button className="text-primary-foreground!" disabled={busy} type="submit">
                {busy ? "Saving…" : editor === "new" ? "Create leave type" : "Save policy version"}
              </Button>
            </div>
          </form>
        </section>
      )}
      {statusTarget && (
        <form
          className={panel + " grid gap-4"}
          onSubmit={(e) => {
            e.preventDefault();
            void status();
          }}
        >
          <h2 className="text-base font-semibold">
            {statusTarget.status === "active" ? "Deactivate" : "Activate"} {statusTarget.name}
          </h2>
          <Field title="Status change reason">
            <Textarea
              value={statusReason}
              minLength={12}
              maxLength={1000}
              disabled={busy}
              onChange={(e) => setStatusReason(e.target.value)}
              required
            />
          </Field>
          <div className="flex gap-2">
            <Button className="text-primary-foreground!" disabled={busy} type="submit">
              Confirm status
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search);
          setOffset(0);
        }}
      >
        <Input
          aria-label="Search leave types"
          placeholder="Search code or leave type"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="outline" type="submit">
          Search
        </Button>
      </form>
      {query.loading ? (
        <Skeleton className="h-40" />
      ) : !query.data?.items.length ? (
        <Empty text="No leave types match this company and search." />
      ) : (
        <div className="grid min-w-0 gap-3">
          {query.data.items.map((t) => (
            <article className={panel} key={t.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{t.name}</h2>
                    <State value={t.status} />
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">{t.paid ? "Paid" : "Unpaid"}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.code} · Record version {t.version}
                    {t.policy
                      ? ` · Policy v${t.policy.version_number} from ${t.policy.effective_from}`
                      : " · No policy covers this date"}
                  </p>
                </div>
                {permissions.includes("hr.leave.type.manage") && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={busy || !!editor || !!statusTarget} onClick={() => edit(t)}>
                      New policy version
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy || !!editor || !!statusTarget}
                      onClick={() => {
                        setStatusTarget(t);
                        setStatusReason("");
                      }}
                    >
                      {t.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                )}
              </div>
              {t.policy && (
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    title="Annual entitlement"
                    value={dayValue(t.policy.annual_entitlement_days)}
                    hint={label(t.policy.accrual_method)}
                  />
                  <Metric
                    title="Request limit"
                    value={`${dayValue(t.policy.minimum_request_days)}–${dayValue(t.policy.maximum_request_days)}`}
                    hint="Days per request"
                  />
                  <Metric
                    title="Carry-forward"
                    value={t.policy.carry_forward ? dayValue(t.policy.maximum_carry_forward_days) : "Off"}
                    hint="Authorized carry posting limit"
                  />
                  <Metric
                    title="Approval route"
                    value={t.policy.requires_hr_approval ? "Manager + HR" : "Manager"}
                    hint={
                      t.policy.document_required_after_days !== null
                        ? `Document above ${dayValue(t.policy.document_required_after_days)} days`
                        : "No mandatory document threshold"
                    }
                  />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <Pagination total={query.data?.total ?? 0} offset={offset} setOffset={setOffset} loading={query.loading} />
    </div>
  );
}
function LeaveBalances(props: Shared) {
  const { client, company, date, revision, busy, save, csrf, permissions, onEditing, onNavigate } = props;
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
  const query = useAttendanceRead(JSON.stringify([company, date, revision, offset, applied]), () =>
    client.listLeaveBalances({ company_id: company, as_of: date, search: applied || undefined, limit: 25, offset }),
  );
  const ledger = useAttendanceRead(
    selected
      ? JSON.stringify([company, selected.employee_id, selected.leave_type_id, effective, revision, ledgerOffset])
      : null,
    () =>
      client.leaveLedger({
        company_id: company,
        employee_id: selected!.employee_id,
        leave_type_id: selected!.leave_type_id,
        as_of: effective,
        limit: 25,
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
  return (
    <div className="grid min-w-0 gap-4">
      <Message error={error || query.error || ledger.error} />
      <div className={panel}>
        <h2 className="text-base font-semibold">Leave balance control</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Posted balance reconciles to the immutable ledger. Pending reservations and approved future leave are shown
          separately, so spendable days stay clear. Post authorized opening, accrual, carry-forward, expiry or
          adjustments with evidence and a reason.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search);
          setOffset(0);
        }}
      >
        <Input
          aria-label="Search leave balances"
          placeholder="Search employee or leave type"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="outline" type="submit">
          Search
        </Button>
      </form>
      {query.loading ? (
        <Skeleton className="h-40" />
      ) : !query.data?.items.length ? (
        <Empty text="No operational employee and leave type matches this date. Create leave types and check employee placements." />
      ) : (
        <div className="grid min-w-0 gap-3">
          {query.data.items.map((b) => (
            <article key={b.employee_id + b.leave_type_id} className={panel}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block break-words text-sm">{b.display_name}</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {b.employee_number} · {b.leave_type} · {b.paid ? "Paid" : "Unpaid"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={busy || posting}
                  onClick={() => {
                    setSelected(b);
                    setEffective(date);
                    setLedgerOffset(0);
                  }}
                >
                  Open ledger
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                  title="Posted balance"
                  value={b.paid ? dayValue(b.balance) : "Not capped"}
                  hint={`Leave used ${dayValue(b.used)} · allocated to settlement ${dayValue(b.encashed)} days`}
                />
                <Metric title="Pending requests" value={dayValue(b.reserved)} hint="Reserved until final decision" />
                <Metric
                  title="Approved future leave"
                  value={dayValue(b.future_used)}
                  hint="Committed after the selected date"
                />
                <Metric
                  title="Spendable days"
                  value={b.paid ? dayValue(b.available) : "Unpaid"}
                  hint={b.paid ? "Posted less pending and future usage" : "Policy request limits still apply"}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      <Pagination total={query.data?.total ?? 0} offset={offset} setOffset={setOffset} loading={query.loading} />
      {selected && (
        <section className={panel} aria-label="Leave balance ledger">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                {selected.display_name} · {selected.leave_type}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{selected.employee_number} · Immutable ledger</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {permissions.includes("hr.leave.balance.adjust") && selected.paid && (
                <Button
                  className="text-primary-foreground!"
                  disabled={busy || posting || !ledger.data}
                  onClick={() => {
                    setPostingHash(ledger.data!.balance.hash);
                    setPosting(true);
                    setDays("");
                    setReason("");
                  }}
                >
                  Post balance entry
                </Button>
              )}
              <Button variant="ghost" disabled={busy || posting} onClick={() => setSelected(null)}>
                Close ledger
              </Button>
            </div>
          </div>
          {posting && (
            <form
              className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void post();
              }}
            >
              <fieldset disabled={busy} className="m-0! min-w-0 border-0! p-0! grid min-w-0 gap-4 sm:grid-cols-2">
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
                <Field title="Days (negative for deductions)">
                  <Input inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} required />
                </Field>
                <Field title="Completed source period start">
                  <Input
                    type="date"
                    className={dateClass}
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required={["accrual", "carry_forward", "expiry"].includes(kind)}
                  />
                </Field>
                <Field title="Completed source period end">
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
                  minLength={12}
                  maxLength={1000}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                Opening balances can be posted once. Repeated policy postings for the same source period are rejected.
                Corrections use a separate audited adjustment; history remains intact.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button className="text-primary-foreground!" disabled={busy || ledger.loading} type="submit">
                  Confirm posting
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setPosting(false)}>
                  Cancel posting
                </Button>
              </div>
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
            </form>
          )}
          {ledger.loading ? (
            <Skeleton className="mt-4 h-28" />
          ) : (
            ledger.data && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    title="Opening"
                    value={dayValue(ledger.data.balance.opening)}
                    hint="Authorized starting balance"
                  />
                  <Metric
                    title="Accrual / carried"
                    value={`${dayValue(ledger.data.balance.accrued)} / ${dayValue(ledger.data.balance.carried)}`}
                    hint="Policy ledger postings"
                  />
                  <Metric
                    title="Adjust / expired"
                    value={`${dayValue(ledger.data.balance.adjusted)} / ${dayValue(ledger.data.balance.expired)}`}
                    hint="Audited corrections and expiry"
                  />
                  <Metric
                    title="Allocated to settlement"
                    value={dayValue(ledger.data.balance.encashed)}
                    hint="Approved encashment days; payment is separate"
                  />
                  <Metric
                    title="Spendable"
                    value={selected.paid ? dayValue(ledger.data.balance.available) : "Unpaid"}
                    hint="Pending and future leave reserved"
                  />
                </div>
                <div className="mt-4 grid min-w-0 gap-2">
                  {ledger.data.items.map((t) => (
                    <article key={t.id} className="min-w-0 rounded-lg border border-border bg-background p-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>
                          {label(t.kind)} · {dayValue(t.days)} days
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          {t.effective_on} · {t.actor_name}
                        </span>
                      </div>
                      <p className="mt-2 break-words text-muted-foreground">{t.reason}</p>
                      <p className="mt-2 break-all text-xs text-muted-foreground">
                        {t.source_type} · {t.source_id}
                      </p>
                    </article>
                  ))}
                  {!ledger.data.items.length && (
                    <p className="text-sm text-muted-foreground">No ledger entries recorded.</p>
                  )}
                </div>
                <Pagination
                  total={ledger.data.total}
                  offset={ledgerOffset}
                  setOffset={setLedgerOffset}
                  loading={ledger.loading}
                />
                <Button
                  className="mt-4"
                  variant="outline"
                  disabled={busy || posting}
                  onClick={() =>
                    onNavigate(
                      "hr",
                      "leave-request",
                      JSON.stringify({
                        company_id: company,
                        employee_id: selected.employee_id,
                        leave_type_id: selected.leave_type_id,
                        as_of: date,
                      }),
                    )
                  }
                >
                  Create leave request <ArrowRight className="size-4" />
                </Button>
              </>
            )
          )}
        </section>
      )}
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
  async function submit() {
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
    if (r) onNavigate("hr", "leave-requests", JSON.stringify({ company_id: company, as_of: date, request_id: r.id }));
  }
  return (
    <section className={panel} aria-label="Leave request editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Plan a leave request</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose an employee and policy, review the working-day calendar, then save a draft for submission.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onNavigate("hr", "leave-requests", JSON.stringify({ company_id: company, as_of: date }))}
        >
          Back to requests
        </Button>
      </div>
      <Message
        error={error || query.error || (!validRange ? "Choose an ordered date range of up to 62 calendar days." : "")}
      />
      <form
        className="mt-5 grid min-w-0 gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset
          disabled={busy}
          className="m-0! min-w-0 border-0! p-0! grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3"
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
          <div className="grid min-w-0 gap-2 text-sm font-medium">
            <label htmlFor="leave-find-employee">Find employee</label>
            <div className="flex min-w-0 gap-2">
              <Input
                id="leave-find-employee"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or employee number"
              />
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEmployee("");
                  setLookup(search);
                }}
              >
                Find
              </Button>
            </div>
          </div>
          <Field title="Employee">
            <select
              className={selectClass}
              value={employee}
              onChange={(e) => {
                setEmployee(e.target.value);
                setDocument("");
                setChoices({});
              }}
              required
            >
              <option value="">Select employee</option>
              {context?.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} · {e.name}
                </option>
              ))}
            </select>
          </Field>
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
        {context?.employees_capped && (
          <p className="text-xs text-muted-foreground">
            The first 100 matching employees are shown. Refine the employee search.
          </p>
        )}
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
                  value={context.balance?.paid ? dayValue(context.balance.available) : type ? "Unpaid" : "Choose type"}
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
              <p className="text-xs text-muted-foreground">
                Half-day boundaries use the midpoint of the scheduled shift, including overnight dates. Scheduled unpaid
                break minutes are prorated for the working half. Recorded work must stay outside the leave half.
              </p>
            </>
          )
        )}
        <Field title="Leave request reason">
          <Textarea
            value={reason}
            minLength={12}
            maxLength={1000}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            className="text-primary-foreground!"
            disabled={
              busy || query.loading || !context || !employee || !type || !days.length || !!context.blockers.length
            }
            type="submit"
          >
            Save leave draft
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onNavigate("hr", "leave-types", JSON.stringify({ company_id: company, as_of: date }))}
          >
            View leave policies
          </Button>
        </div>
      </form>
    </section>
  );
}
function LeaveRequests(props: Shared & { queue: boolean }) {
  const { client, company, date, revision, busy, save, csrf, permissions, onNavigate, onEditing, initial, queue } =
    props;
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState(initial?.request_id ?? ""),
    [action, setAction] = useState<HrLeaveRequestActionRequest["action"] | "">(""),
    [reason, setReason] = useState(""),
    [override, setOverride] = useState(false),
    [version, setVersion] = useState(0),
    [hash, setHash] = useState<string | undefined>(),
    [error, setError] = useState("");
  const list = useAttendanceRead(JSON.stringify([company, date, revision, offset, applied, status, queue]), () =>
    client.listLeaveRequests({
      company_id: company,
      as_of: date,
      search: applied || undefined,
      status: (status || undefined) as Parameters<HrApiClient["listLeaveRequests"]>[0]["status"],
      queue_only: queue ? "true" : "false",
      limit: 25,
      offset,
    }),
  );
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
  return (
    <div className="grid min-w-0 gap-4">
      <Message error={error || list.error || detail.error} />
      <div className="flex flex-wrap justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {queue
            ? "Requests routed to your manager account and requests awaiting HR. Action availability follows your permissions and separation of duties."
            : "Employee leave requests with their exact daily allocations, supporting evidence, approval route and balance impact."}
        </p>
        {permissions.includes("hr.leave.request.create") && (
          <Button
            className="text-primary-foreground!"
            disabled={busy || !!action}
            onClick={() => onNavigate("hr", "leave-request", JSON.stringify({ company_id: company, as_of: date }))}
          >
            <Plus className="size-4" />
            Add leave request
          </Button>
        )}
      </div>
      <form
        className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search);
          setOffset(0);
        }}
      >
        <Input
          aria-label="Search leave requests"
          placeholder="Employee name, number or reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter leave status"
          className={selectClass}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All statuses</option>
          {["draft", "pending_manager", "pending_hr", "approved", "rejected", "cancelled"].map((s) => (
            <option value={s} key={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <Button variant="outline" type="submit">
          Search
        </Button>
      </form>
      {list.loading ? (
        <Skeleton className="h-40" />
      ) : !list.data?.items.length ? (
        <Empty
          text={
            queue ? "No leave requests are waiting in this queue." : "No leave requests match this company and filter."
          }
        />
      ) : (
        <div className="grid min-w-0 gap-3">
          {list.data.items.map((r) => (
            <article key={r.id} className={panel}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block break-words text-sm">{r.display_name}</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.employee_number} · {r.reference} · {r.leave_type}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm tabular-nums">{dayValue(r.requested_days)} days</span>
                  <State value={r.status} />
                  <Button
                    variant="outline"
                    disabled={busy || !!action}
                    onClick={() => {
                      setSelected(r.id);
                      setAction("");
                      setError("");
                    }}
                  >
                    Review request
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {r.from_date} – {r.to_date} · {r.paid ? "Paid" : "Unpaid"} ·{" "}
                {r.requires_hr_approval ? "Manager then HR" : "Manager approval"}
              </p>
            </article>
          ))}
        </div>
      )}
      <Pagination total={list.data?.total ?? 0} offset={offset} setOffset={setOffset} loading={list.loading} />
      {selected && detail.loading ? (
        <Skeleton className="h-40" />
      ) : (
        detail.data && (
          <section className={panel} aria-label="Leave request review">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{detail.data.reference}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {detail.data.display_name} · {detail.data.leave_type} · Version {detail.data.version}
                </p>
              </div>
              <State value={detail.data.status} />
            </div>
            <p className="mt-3 break-words text-sm">{detail.data.reason}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                title="Requested days"
                value={dayValue(detail.data.requested_days)}
                hint={`${detail.data.from_date} – ${detail.data.to_date}`}
              />
              <Metric
                title="Pay treatment"
                value={detail.data.paid ? "Paid" : "Unpaid"}
                hint="Frozen leave type identity"
              />
              <Metric
                title="Spendable balance"
                value={detail.data.paid ? dayValue(detail.data.context?.balance?.available ?? "0") : "Not capped"}
                hint="This pending request excluded"
              />
              <Metric
                title="Reporting manager"
                value={detail.data.context?.manager_name ?? "Unavailable"}
                hint="Captured submission route checked"
              />
            </div>
            {detail.data.context_unavailable && (
              <p className="mt-3 text-sm text-[var(--nx-warning)]">{detail.data.context_unavailable}</p>
            )}
            {detail.data.context?.blockers.map((b) => (
              <p key={b} className="mt-2 text-sm text-[var(--nx-warning)]">
                {b}
              </p>
            ))}
            {!detail.data.workflow_managed && (
              <p className="mt-3 text-sm text-muted-foreground">
                Legacy leave evidence is preserved as read-only history.
              </p>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {detail.data.days.map((d) => (
                <div
                  key={d.on_date}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3 text-sm"
                >
                  <div>
                    <strong>{d.on_date}</strong>
                    <span className="ml-2 text-muted-foreground">
                      {label(d.portion)} · {dayValue(d.days)} day
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || !!action}
                    onClick={() =>
                      onNavigate(
                        "hr",
                        "attendance",
                        JSON.stringify({
                          company_id: company,
                          on_date: d.on_date,
                          search: detail.data!.employee_number,
                        }),
                      )
                    }
                  >
                    Attendance <ArrowRight className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.data.allowed_actions.map((a) => (
                <Button
                  key={a}
                  variant={a.includes("reject") || a === "cancel" ? "outline" : "default"}
                  className={a.includes("reject") || a === "cancel" ? "" : "text-primary-foreground!"}
                  disabled={busy || !!action}
                  onClick={() => {
                    setAction(a);
                    setVersion(detail.data!.version);
                    setHash(detail.data!.context?.hash);
                    setReason("");
                    setOverride(false);
                  }}
                >
                  {label(a)}
                </Button>
              ))}
            </div>
            {action && (
              <form
                className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void decide();
                }}
              >
                <h3 className="text-sm font-semibold">Confirm {label(action).toLowerCase()}</h3>
                <Field title="Leave decision reason">
                  <Textarea
                    value={reason}
                    minLength={12}
                    maxLength={1000}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  />
                </Field>
                {action.includes("_") && detail.data.self_decision_requires_override && (
                  <label htmlFor="leave-approval-override" className="flex items-start gap-2 text-sm">
                    <Checkbox
                      id="leave-approval-override"
                      checked={override}
                      onCheckedChange={(v) => setOverride(v === true)}
                    />
                    I explicitly acknowledge an audited super-administrator override of actor separation.
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="text-primary-foreground!"
                    type="submit"
                    disabled={
                      busy || (action.includes("_") && detail.data.self_decision_requires_override && !override)
                    }
                  >
                    Confirm leave decision
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => setAction("")}>
                    Back
                  </Button>
                </div>
              </form>
            )}
            <div className="mt-4">
              <History items={detail.data.history} />
            </div>
          </section>
        )
      )}
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
  const [companyChoice, setCompany] = useState(initial.company_id ?? ""),
    [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initial.as_of ?? "") ? initial.as_of : localDate()),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
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
      <nav aria-label="Time and Leave navigation" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {(
          [
            ["leave-types", "Leave types", Layers3, "hr.leave.type.read"],
            ["leave-balances", "Balances", Wallet, "hr.leave.balance.read"],
            ["attendance", "Attendance", CalendarDays, "hr.attendance.read"],
            ["leave-requests", "Requests", ClipboardList, "hr.leave.request.read"],
            ["leave-request", "New request", Plus, "hr.leave.request.create"],
            ["leave-approval", "Approvals", ShieldCheck, "hr.leave.request.read"],
          ] as const
        ).map(([id, title, Icon, p]) => (
          <Button
            key={id}
            variant="outline"
            className={
              "h-auto min-w-0 justify-start gap-2 whitespace-normal px-3 py-3 " +
              (mode === id ? "border-primary bg-primary/10 text-primary!" : "")
            }
            disabled={busy || editing || !permissions.includes(p)}
            onClick={() => onNavigate("hr", id, JSON.stringify({ company_id: company, as_of: date }))}
          >
            <Icon className="size-4 shrink-0" />
            {title}
          </Button>
        ))}
      </nav>
      <div className={panel + " grid gap-4 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end"}>
        <Field title="Company">
          <select
            className={selectClass}
            value={company}
            disabled={busy || editing || companies.loading}
            onChange={(e) => {
              setCompany(e.target.value);
              setNotice("");
              setError("");
            }}
          >
            <option value="">{companies.loading ? "Loading authorized companies…" : "Select company"}</option>
            {companies.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </Field>
        <Field title="As of date">
          <Input
            type="date"
            className={dateClass}
            value={date}
            disabled={busy || editing}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
              setNotice("");
            }}
          />
        </Field>
        <Button variant="outline" disabled={busy || !company} onClick={() => setRevision((v) => v + 1)}>
          <RefreshCw className={"size-4 " + (busy ? "animate-spin" : "")} />
          Refresh
        </Button>
      </div>
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
          <RequestEditor key={company + date} {...shared} />
        ) : (
          <Empty text="Leave creation permission is required." />
        )
      ) : (
        <LeaveRequests key={company + date + mode} {...shared} queue={mode === "leave-approval"} />
      )}
    </div>
  );
}
