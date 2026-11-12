"use client";
import { WorkOffsetPagination, WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { HrDrawerActions } from "../components/hr-drawer-context";
import { readHrOperationsScope, useHrOperationsScope } from "../components/hr-operations-scope";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  createHrShiftAllocationRequestSchema,
  closeHrShiftAllocationRequestSchema,
  type CreateHrShiftAllocationRequest,
  type CloseHrShiftAllocationRequest,
  type HrShiftAllocationSummary,
  type HrShiftAllocationDetail,
  type HrShiftAllocationDirectory,
  type HrShiftAllocationContext,
  type HrShiftSummary,
} from "@nexora/contracts";
import { Plus, CheckCircle2, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import {
  HrDetailAudit,
  HrDetailGroup,
  HrDetailNote,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { SearchableSelect } from "@/shared/ui/searchable-select";
type Scope = CreateHrShiftAllocationRequest["scope"];
type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;
const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const label = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const todayValue = () => new Date().toISOString().slice(0, 10);
const shiftDay = (d: string, n: number) =>
  new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const fail = (e: unknown) =>
  e instanceof ApiError ? e.message : "The shift assignment could not be loaded or saved. Please retry.";
/** Department and branch scopes are presented as Project and Location (stored values are unchanged). */
const scopeLabel = (scope: string) => (scope === "department" ? "Project" : scope === "branch" ? "Location" : label(scope));

function TargetPicker({
  client,
  companyId,
  scope,
  onDate,
  value,
  disabled,
  revision,
  onChange,
}: {
  client: HrApiClient;
  companyId: string;
  scope: Scope;
  onDate: string;
  value: string;
  disabled: boolean;
  revision: number;
  onChange: (id: string) => void;
}) {
  const [data, setData] = useState<HrShiftAllocationContext | null>(null),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  // Typing in the target dropdown searches the server after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!onDate) return;
    let current = true;
    setLoading(true);
    setError("");
    setData(null);
    client
      .shiftAllocationContext({ companyId, scope, onDate, search: query || undefined })
      .then((result) => {
        if (current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (current) {
          setError(fail(e));
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, companyId, scope, onDate, query, revision]);
  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid content-start min-w-0 gap-2 text-sm font-medium">
        <label htmlFor={`hr-shift-target-${scope}`}>{scopeLabel(scope)}</label>
        <SearchableSelect
          id={`hr-shift-target-${scope}`}
          label={scopeLabel(scope)}
          value={value}
          placeholder={`Select an authorized ${scope}`}
          searchPlaceholder="Search by name or code…"
          disabled={disabled}
          loading={loading && !data}
          required
          search={search}
          onSearchChange={setSearch}
          options={data?.targets.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` })) ?? []}
          onValueChange={onChange}
        />
      </div>
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {data && !data.targets.length && !query && (
        <p className="text-xs text-muted-foreground">
          No matching {scope} is available on this date. Employee choices require approved operational employment.
        </p>
      )}
    </div>
  );
}

function AllocationEditor({
  client,
  today,
  companyId,
  busy,
  revision,
  onSave,
  onClose,
}: {
  client: HrApiClient;
  today: string;
  companyId: string;
  busy: boolean;
  revision: number;
  onSave: (input: CreateHrShiftAllocationRequest) => Promise<void>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("employee"),
    [target, setTarget] = useState(""),
    [from, setFrom] = useState(today),
    [to, setTo] = useState(""),
    [shiftId, setShiftId] = useState(""),
    [reason, setReason] = useState("");
  const [options, setOptions] = useState<HrShiftSummary[]>([]),
    [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [current, setCurrent] = useState<HrShiftAllocationSummary | null>(null),
    [currentLoading, setCurrentLoading] = useState(false),
    [replacement, setReplacement] = useState<{ id: string; version: number } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    client
      .shifts({ companyId, status: "active", limit: 100, offset })
      .then((result) => {
        if (active) {
          setOptions((values) =>
            offset
              ? Array.from(new Map([...values, ...result.items].map((item) => [item.id, item])).values())
              : result.items,
          );
          setTotal(result.total);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(fail(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [client, companyId, offset, revision]);
  useEffect(() => {
    if (!target || !from) {
      setCurrent(null);
      return;
    }
    let active = true;
    setCurrentLoading(true);
    client
      .shiftAllocations({ companyId, scope, scopeId: target, onDate: from, limit: 10 })
      .then((result) => {
        if (active) {
          setCurrent(result.items[0] ?? null);
          setCurrentLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(fail(e));
          setCurrentLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [client, companyId, scope, target, from, revision]);
  const eligible = options.filter((s) => s.configured && (scope === "employee" || s.work_location_id === null));
  const submit = () => {
    const result = createHrShiftAllocationRequestSchema.safeParse({
      company_id: companyId,
      scope,
      scope_id: target,
      shift_id: shiftId,
      effective_from: from,
      effective_to: to || null,
      reason,
      replace_assignment_id: replacement?.id ?? null,
      expected_replace_version: replacement?.version ?? null,
    });
    if (!result.success) {
      setError(
        result.error.issues
          .slice(0, 3)
          .map((i) => i.message)
          .join(" "),
      );
      return;
    }
    if (current && !replacement) {
      setError(
        "An assignment already covers the start date. Explicitly choose replacement, or use a different interval.",
      );
      return;
    }
    setError("");
    void onSave(result.data);
  };
  return (
    <WorkForm
      aria-label="Shift assignment editor"
      className="grid min-w-0 gap-5 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">New allocation</div>
          <h2 className="mt-1 text-lg font-semibold">Set an effective working arrangement</h2>
        </div>
        <Button
          type="button"
          aria-label="Close assignment editor"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Review the assignment</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <HrDetailSection title="Assigned to">
        <label className="grid content-start gap-2 text-sm font-medium">
          Allocation scope
          <select
            className={selectClass}
            value={scope}
            disabled={busy}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setTarget("");
              setShiftId("");
              setCurrent(null);
              setReplacement(null);
            }}
          >
            {["employee", "department", "branch"].map((s) => (
              <option value={s} key={s}>
                {scopeLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <TargetPicker
          client={client}
          companyId={companyId}
          scope={scope}
          onDate={from}
          value={target}
          disabled={busy}
          revision={revision}
          onChange={(id) => {
            setTarget(id);
            setReplacement(null);
            setCurrent(null);
          }}
        />
      </HrDetailSection>
      <HrDetailSection title="Schedule">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid content-start gap-2 text-sm font-medium">
            Effective from
            <Input
              required
              type="date"
              value={from}
              disabled={busy}
              onChange={(e) => {
                setFrom(e.target.value);
                setReplacement(null);
              }}
            />
          </label>
          <label className="grid content-start gap-2 text-sm font-medium">
            Effective to
            <Input type="date" min={from} value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </HrDetailSection>
      <HrDetailSection title="Shift">
        <label className="grid content-start gap-2 text-sm font-medium">
          Configured shift
          <select
            required
            className={selectClass}
            value={shiftId}
            disabled={busy || loading}
            onChange={(e) => setShiftId(e.target.value)}
          >
            <option value="">Select an active shift</option>
            {eligible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name} · {s.work_location ?? "Company-wide"}
              </option>
            ))}
          </select>
        </label>
        {options.length < total && (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={busy || loading}
            onClick={() => setOffset(options.length)}
          >
            Load more shifts
          </Button>
        )}
        {!eligible.length && !loading && (
          <p className="text-sm text-muted-foreground">
            No configured shift is available for this scope. Create one in Shifts &amp; Rules first.
          </p>
        )}
        {current && (
          <div className="grid gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
            <div className="text-sm">
              <strong>{current.reference}</strong> · {current.shift_code} currently covers this start date (
              {current.effective_from} → {current.effective_to ?? "open-ended"}).
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={replacement?.id === current.id}
                disabled={busy || currentLoading}
                onCheckedChange={(checked) =>
                  setReplacement(checked ? { id: current.id, version: current.version } : null)
                }
              />
              Replace this allocation from {from}. Preserve its previous interval and audit history.
            </label>
          </div>
        )}
      </HrDetailSection>
      <HrDetailSection title="Reason">
        <label className="grid content-start gap-2 text-sm font-medium">
          Allocation reason
          <Textarea
            maxLength={1000}
            rows={3}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain this employee arrangement or organisational default"
          />
        </label>
      </HrDetailSection>
      <HrDrawerActions>
        <Button
          type="submit"
          className="text-primary-foreground!"
          disabled={busy || loading || currentLoading || !target || !shiftId}
        >
          {busy ? "Saving…" : replacement ? "Replace assignment" : "Create assignment"}
        </Button>
      </HrDrawerActions>
    </WorkForm>
  );
}

function EndAllocation({
  detail,
  today,
  busy,
  onSave,
}: {
  detail: HrShiftAllocationDetail;
  today: string;
  busy: boolean;
  onSave: (id: string, input: CloseHrShiftAllocationRequest) => Promise<void>;
}) {
  const [action, setAction] = useState<"close" | "cancel">("close"),
    [end, setEnd] = useState(detail.effective_to ?? (detail.effective_from > today ? detail.effective_from : today)),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  if (["ended", "cancelled"].includes(detail.state)) return null;
  return (
    <WorkForm
      aria-label="End shift assignment"
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const result = closeHrShiftAllocationRequestSchema.safeParse({
          company_id: detail.company_id,
          expected_version: detail.version,
          action,
          effective_to: action === "close" ? end : null,
          reason,
        });
        if (!result.success) {
          setError(result.error.issues.map((i) => i.message).join(" "));
          return;
        }
        setError("");
        void onSave(detail.id, result.data);
      }}
    >
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid content-start gap-2 text-sm font-medium">
          End action
          <select
            className={selectClass}
            value={action}
            disabled={busy}
            onChange={(e) => setAction(e.target.value as typeof action)}
          >
            <option value="close">Close on a date</option>
            {detail.effective_from >= today && <option value="cancel">Cancel unstarted allocation</option>}
          </select>
        </label>
        {action === "close" && (
          <label className="grid content-start gap-2 text-sm font-medium">
            Last allocated day
            <Input
              required
              type="date"
              min={detail.effective_from > shiftDay(today, -1) ? detail.effective_from : shiftDay(today, -1)}
              value={end}
              disabled={busy}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        )}
      </div>
      <label className="grid content-start gap-2 text-sm font-medium">
        End reason
        <Textarea
          maxLength={1000}
          rows={2}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        className="justify-self-start"
        disabled={busy}
      >
        {busy ? "Saving…" : action === "cancel" ? "Cancel allocation" : "Close allocation"}
      </Button>
    </WorkForm>
  );
}

export function HrShiftAssignmentsWorkspace({
  initialReference,
}: {
  initialReference?: string;
  /** Kept for the shell's call signature; Shifts & Rules is reached from the side menu. */
  onNavigate: Navigate;
}) {
  const [workPageSize, setWorkPageSize] = useState(25);
  const initialScope = useMemo(() => readHrOperationsScope(initialReference), [initialReference]);
  const { api, session, csrfToken, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("hr.attendance.shift.read") ?? false,
    canManage = session?.user.permissions.includes("hr.attendance.shift.manage") ?? false;
  const [company, setCompany] = useState(initialScope.company_id ?? ""),
    [today, setToday] = useState(todayValue);
  const [items, setItems] = useState<HrShiftAllocationDirectory>({ items: [], total: 0 }),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<HrShiftAllocationDetail | null>(null);
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [scope, setScope] = useState(""),
    [state, setState] = useState<HrMasterStatus>("active"),
    [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0);
  const mutation = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useHrOperationsScope(company, today);
  useEffect(() => {
    if (!canRead) return;
    let current = true;
    setLoading(true);
    client
      .companies()
      .then((data) => {
        if (current) {
          setCompany((value) => (data.items.some((c) => c.id === value) ? value : (data.items[0]?.id ?? "")));
          setLoading(false);
        }
      })
      .catch((e) => {
        if (current) {
          setError(fail(e));
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, canRead, revision]);
  useEffect(() => {
    if (!company || !canRead) return;
    let current = true;
    setLoading(true);
    client
      .shiftAllocations({ limit: workPageSize,
        companyId: company,
        search: applied || undefined,
        scope: (scope as Scope) || undefined,
        offset,
      })
      .then((data) => {
        if (current) {
          setItems(data);
          setSelected((value) => (data.items.some((a) => a.id === value) ? value : ""));
          setLoading(false);
        }
      })
      .catch((e) => {
        if (current) {
          setError(fail(e));
          setLoading(false);
        }
      });
    client
      .shiftAllocationContext({ companyId: company, scope: "branch", onDate: todayValue() })
      .then((data) => {
        if (current) setToday(data.today);
      })
      .catch((e) => {
        if (current) setError(fail(e));
      });
    return () => {
      current = false;
    };
  }, [client, company, canRead, applied, scope, offset, revision, workPageSize]);
  useEffect(() => {
    if (!selected || !company) {
      setDetail(null);
      return;
    }
    let current = true;
    setDetailLoading(true);
    client
      .shiftAllocation(company, selected)
      .then((data) => {
        if (current) {
          setDetail(data);
          setDetailLoading(false);
        }
      })
      .catch((e) => {
        if (current) {
          setDetail(null);
          setError(fail(e));
          setDetailLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, company, selected, revision]);
  const reload = () => setRevision((value) => value + 1);
  const save = async (input: CreateHrShiftAllocationRequest | CloseHrShiftAllocationRequest, id?: string) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify([id, input]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = id
        ? await client.closeShiftAllocation(id, input as CloseHrShiftAllocationRequest, csrfToken(), retry.current.key)
        : await client.createShiftAllocation(input as CreateHrShiftAllocationRequest, csrfToken(), retry.current.key);
      setEditor(false);
      setSelected(result.id);
      setSearch(result.reference);
      setApplied(result.reference);
      setScope("");
      setState("all");
      setOffset(0);
      setNotice(
        `${result.reference} saved.`,
      );
      retry.current = null;
      reload();
    } catch (e) {
      setError(fail(e));
      reload();
    } finally {
      setBusy(false);
      mutation.current = false;
    }
  };
  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Shift assignment access required</AlertTitle>
        <AlertDescription>
          Sign in with attendance shift read permission to review company allocations.
        </AlertDescription>
      </Alert>
    );
  const current = detail?.id === selected && detail.company_id === company ? detail : null;
  const summary = items.items.find((a) => a.id === selected);
  // Active = in force or scheduled; Deactivated = ended or cancelled (filtered on the loaded page).
  const visible = items.items.filter((a) =>
    state === "all" ? true : state === "active" ? ["active", "scheduled"].includes(a.state) : ["ended", "cancelled"].includes(a.state),
  );
  const openAllocation = (id: string) => {
    if (busy || editor) return;
    setSelected(id);
    setDetail(null);
    setError("");
    setNotice("");
  };
  const closeAllocation = () => {
    if (busy) return;
    setSelected("");
    setDetail(null);
  };
  const openRow = (a: HrShiftAllocationSummary) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Open ${a.reference} (${a.scope_name})`,
    onClick: () => openAllocation(a.id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openAllocation(a.id);
      }
    },
  });
  return (
    <section
      aria-label="Live shift assignments"
      className="grid min-w-0 gap-4 font-sans text-foreground [&_label]:gap-1.5 [&_label]:leading-tight [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0"
    >
      {error && !selected && (
        <Alert variant="destructive">
          <AlertTitle>Assignment action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && !selected && (
        <div role="status" className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          {notice}
        </div>
      )}
      <WorkForm
        aria-label="Find shift assignments"
        className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(12rem,1fr)_10rem_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search.trim());
          setOffset(0);
          setError("");
        }}
      >
            <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
              Search assignments
              <Input
                type="search"
                value={search}
                maxLength={160}
                disabled={busy || editor}
                placeholder="Reference, employee, organisation or shift"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="grid content-start gap-2 text-sm font-medium">
              Scope
              <select
                className={selectClass}
                value={scope}
                disabled={busy || editor}
                onChange={(e) => {
                  setScope(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">All scopes</option>
                {["employee", "department", "branch"].map((s) => (
                  <option key={s} value={s}>
                    {scopeLabel(s)}
                  </option>
                ))}
              </select>
            </label>
        {canManage && (
          <Button
            type="button"
            className="text-primary-foreground!"
            disabled={busy || editor || !company}
            onClick={() => {
              setEditor(true);
              setError("");
              setNotice("");
            }}
          >
            <Plus className="size-4" />
            New assignment
          </Button>
        )}
      </WorkForm>
      {editor && (
        <HrRecordDrawer
          title="Add shift assignment"
          open={editor}
          onClose={() => setEditor(false)}
          busy={busy}
          error={error}
          notice={notice}
        >
          <AllocationEditor
            today={today}
            client={client}
            companyId={company}
            busy={busy}
            revision={revision}
            onSave={(input) => save(input)}
            onClose={() => setEditor(false)}
          />
        </HrRecordDrawer>
      )}
      {company ? (
        <>
          <HrMasterStatusFilter
            value={state}
            onChange={(next) => {
              setState(next);
              setOffset(0);
            }}
          />
            <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              {loading && !items.items.length ? (
                <div className="grid gap-2 p-4" aria-live="polite">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <WorkTable paging={false} tableId="app/features/hr/views/hr-shift-assignments-workspace:1" className="w-full min-w-180 border-collapse text-left text-sm">
                    <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-px whitespace-nowrap px-4 py-3">Reference</th>
                        <th className="px-4 py-3">Assigned to</th>
                        <th className="px-4 py-3">Scope</th>
                        <th className="px-4 py-3">Shift</th>
                        <th className="px-4 py-3">Effective</th>
                        <th className="px-4 py-3">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((a) => (
                        <tr
                          key={a.id}
                          aria-disabled={busy || editor}
                          className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === a.id ? "bg-primary/5" : ""}`}
                          {...openRow(a)}
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-foreground">{a.reference}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{a.scope_name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{scopeLabel(a.scope)}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">{a.shift_code}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {a.effective_from} → {a.effective_to ?? "open-ended"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={a.state === "active" ? "secondary" : "outline"}>{label(a.state)}</Badge>
                          </td>
                        </tr>
                      ))}
                      {visible.length === 0 && (
                        <tr>
                          <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                            No assignments match these filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </WorkTable>
                </div>
              )}
              <WorkOffsetPagination
                busy={!!(busy || loading || editor)}
                total={items.total}
                offset={offset}
                size={workPageSize}
                previousDisabled={!!(busy || loading || editor || !offset)}
                nextDisabled={!!(busy || loading || editor || offset + workPageSize >= items.total)}
                onSizeChange={(size) => {
                  setWorkPageSize(size);
                  setOffset(0);
                }}
                onPrevious={() => setOffset(Math.max(0, offset - workPageSize))}
                onNext={() => setOffset(offset + workPageSize)}
              />
            </div>
        </>
      ) : (
        !loading && (
          <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            No authorized company is available. Ask your administrator to review company access.
          </p>
        )
      )}
      <HrMasterSheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) closeAllocation();
        }}
        eyebrow="Shift Assignments"
        title={current?.scope_name ?? summary?.scope_name ?? "Shift assignment"}
        description={
          current
            ? `${current.reference} · version ${current.version} · ${scopeLabel(current.scope)} allocation · ${current.shift_code} / ${current.shift_name}`
            : summary
              ? `${summary.reference} · ${scopeLabel(summary.scope)} allocation`
              : ""
        }
      >
        <div className="grid min-w-0 gap-5" aria-busy={busy || detailLoading}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Assignment action needs attention</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <div role="status" className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-primary" />
              {notice}
            </div>
          )}
          {detailLoading && !current ? (
            <Skeleton className="h-80 w-full" />
          ) : current ? (
            <>
              <HrDetailSummary code={current.reference} status={current.state}>
                {scopeLabel(current.scope)} allocation · {hrDisplayDate(current.effective_from)} →{" "}
                {current.effective_to ? hrDisplayDate(current.effective_to) : "open-ended"}
              </HrDetailSummary>
              <HrDetailGroup title="Assignment">
                <HrDetailTile
                  label="Assigned to"
                  value={current.scope_name}
                  hint={`${current.scope_code} · ${scopeLabel(current.scope)}`}
                />
                <HrDetailTile label="Shift" value={current.shift_name} hint={current.shift_code} />
                <HrDetailTile label="Version" value={String(current.version)} />
              </HrDetailGroup>
              <HrDetailGroup title="Schedule">
                <HrDetailTile label="Effective from" value={hrDisplayDate(current.effective_from)} />
                <HrDetailTile
                  label="Effective to"
                  value={current.effective_to ? hrDisplayDate(current.effective_to) : "Open-ended"}
                />
                <HrDetailTile label="Shift timezone" value={current.time_zone ?? "Configuration required"} />
                <HrDetailTile label="Shift work location" value={current.work_location ?? "Company-wide"} />
              </HrDetailGroup>
              <HrDetailSection title="Recorded reason">
                <HrDetailNote>{current.note}</HrDetailNote>
              </HrDetailSection>
              {canManage && !["ended", "cancelled"].includes(current.state) && (
                <HrDetailSection title="End or cancel">
                  <EndAllocation
                    key={`${current.id}:${current.version}`}
                    detail={current}
                    today={today}
                    busy={busy || detailLoading || editor}
                    onSave={(id, input) => save(input, id)}
                  />
                </HrDetailSection>
              )}
              <HrDetailSection title="Allocation history">
                {current.history.length ? (
                  current.history.map((h) => (
                    <div key={h.id} className="rounded-lg border border-border bg-muted/35 p-3">
                      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          Version {h.version} · {label(h.action)} · {h.actor_name}
                        </span>
                        <time dateTime={h.occurred_at}>{hrDisplayDate(h.occurred_at, true)}</time>
                      </div>
                      <p className="mt-2 break-words text-sm">{h.reason}</p>
                      {h.related_reference && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          disabled={busy || editor}
                          onClick={() => {
                            setSearch(h.related_reference!);
                            setApplied(h.related_reference!);
                            setScope("");
                            setState("all");
                            setOffset(0);
                            setSelected("");
                            setDetail(null);
                          }}
                        >
                          Related: {h.related_reference}
                          <ArrowRight className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Legacy allocation: its original interval remains retained. New changes will record immutable events
                    here.
                  </p>
                )}
              </HrDetailSection>
              <HrDetailAudit items={[{ label: "Created", value: hrDisplayDate(current.created_at, true) }]} />
            </>
          ) : null}
        </div>
      </HrMasterSheet>
    </section>
  );
}
