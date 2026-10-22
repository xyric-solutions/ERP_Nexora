"use client";
import { useRef, useState } from "react";
import { Plus, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useSession } from "@/lib/session/session-provider";
import {
  createHrSelfLeaveRequestSchema,
  type HrSelfLeaveAction,
  type HrAttendanceCompletionResult,
  type HrLeaveAllocation,
  type HrSelfServiceWorkspace,
} from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import {
  Field,
  State,
  panel,
  selectClass,
  useAttendanceRead,
  localDate,
  History,
} from "../components/hr-workspace-controls";

type Props = {
  canApply: boolean;
  company: string;
  items: HrSelfServiceWorkspace["requests"];
  opened: string;
  onOpen: (id: string) => void;
  onSaved: (result: HrAttendanceCompletionResult, from?: string) => void;
};
type Portion = HrLeaveAllocation["portion"] | "none";
export function HrPersonalLeaveApplications({ company, items, opened, onOpen, onSaved, canApply }: Props) {
  const { api, csrfToken } = useSession(),
    client = new HrApiClient(api);
  const [create, setCreate] = useState(false),
    [from, setFrom] = useState(localDate()),
    [to, setTo] = useState(localDate()),
    [type, setType] = useState(""),
    [reason, setReason] = useState(""),
    [actionReason, setActionReason] = useState(""),
    [portions, setPortions] = useState<Record<string, Portion>>({}),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const validRange = !!from && !!to && to >= from && Date.parse(to) - Date.parse(from) <= 61 * 86400000;
  const q = { company_id: company, from_date: from, to_date: to, ...(type ? { leave_type_id: type } : {}) };
  const context = useAttendanceRead(create && validRange ? JSON.stringify([q, revision]) : null, () =>
    client.selfLeaveContext(q),
  );
  const detail = useAttendanceRead(opened ? JSON.stringify([company, opened, revision]) : null, () =>
    client.selfLeaveRequest(company, opened),
  );
  const c = context.data,
    d = detail.data;
  const portion = (date: string, eligible: boolean): Portion => portions[date] ?? (eligible ? "full" : "none");
  const days: HrLeaveAllocation[] = (c?.days ?? []).flatMap((day) => {
    const selected = portion(day.on_date, day.chargeable && !!day.policy && !day.issues.length);
    return selected === "none" ? [] : [{ on_date: day.on_date, portion: selected }];
  });
  const units = days.reduce((n, day) => n + (day.portion === "full" ? 10000 : 5000), 0);
  const needsDocument = days.some((day) => {
    const policy = c?.days.find((v) => v.on_date === day.on_date)?.policy;
    return (
      policy?.document_required_after_days !== null &&
      policy?.document_required_after_days !== undefined &&
      units > Number(policy.document_required_after_days) * 10000
    );
  });
  async function command(
    input: unknown,
    operation: (key: string) => Promise<HrAttendanceCompletionResult>,
    date?: string,
  ) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await operation(retry.current.key);
      retry.current = null;
      setCreate(false);
      setReason("");
      setActionReason("");
      setPortions({});
      onOpen(result.id);
      onSaved(result, date);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The personal leave action could not be completed.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!c) return;
    const input = createHrSelfLeaveRequestSchema.safeParse({
      ...q,
      leave_type_id: type,
      days,
      reason,
      expected_evidence_hash: c.hash,
    });
    if (!input.success) {
      setError(input.error.issues.map((i) => i.message).join(" "));
      return;
    }
    void command(input.data, (key) => client.createSelfLeaveRequest(input.data, csrfToken(), key), from);
  }
  function act(action: HrSelfLeaveAction["action"]) {
    if (!d) return;
    const input: HrSelfLeaveAction = {
      company_id: company,
      action,
      expected_version: d.version,
      expected_evidence_hash: d.context?.hash,
      reason: actionReason,
    };
    void command(input, (key) => client.actOnSelfLeaveRequest(d.id, input, csrfToken(), key));
  }
  return (
    <div className="mt-4 min-w-0 space-y-4" data-personal-leave>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">My leave applications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drafts do not reserve leave. Submission reserves the selected days until the independent approval workflow
            decides them.
          </p>
        </div>
        <Button
          type="button"
          disabled={busy || !canApply || create}
          onClick={() => {
            setCreate(true);
            onOpen("");
            setError("");
          }}
        >
          <Plus className="size-4" />
          New leave request
        </Button>
      </div>
      {!canApply && (
        <Alert>
          <AlertDescription>
            Personal applications require active approved employment and your own employee session. Existing requests
            remain available for review.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {create && (
        <form aria-label="Apply for personal leave" onSubmit={save} className={panel + " space-y-4"}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Review and save a leave draft</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your employee record is selected securely from your sign-in. Review the calendar before saving.
              </p>
            </div>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setCreate(false)}>
              Close application
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field title="From date">
              <Input
                type="date"
                required
                value={from}
                disabled={busy}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPortions({});
                }}
              />
            </Field>
            <Field title="To date">
              <Input
                type="date"
                required
                value={to}
                disabled={busy}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPortions({});
                }}
              />
            </Field>
            <Field title="Leave type">
              <select
                className={selectClass}
                required
                value={type}
                disabled={busy || context.loading}
                onChange={(e) => {
                  setType(e.target.value);
                  setPortions({});
                }}
              >
                <option value="">Select leave type</option>
                {c?.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="self-end">
              <Button
                type="button"
                variant="outline"
                disabled={busy || context.loading || !validRange}
                onClick={() => setRevision((v) => v + 1)}
              >
                <RefreshCw className="size-4" />
                Refresh calendar & balance
              </Button>
            </div>
          </div>
          {!validRange && (
            <Alert variant="destructive">
              <AlertDescription>Select an ordered date range of at most 62 calendar days.</AlertDescription>
            </Alert>
          )}
          {context.loading && <p role="status">Checking your shifts, policy, reporting manager and balance…</p>}
          {context.error && (
            <Alert variant="destructive">
              <AlertDescription>{context.error}</AlertDescription>
            </Alert>
          )}
          {c && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Reporting manager</p>
                  <p className="mt-1 break-words text-sm font-semibold">{c.manager_name ?? "Not configured"}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Available days</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    {c.balance?.available ?? "Choose a leave type"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Selected days</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{units / 10000}</p>
                </div>
              </div>
              {!!c.blockers.length && (
                <Alert variant="destructive">
                  <AlertTitle>Review required before saving</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {c.blockers.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {type && (
                <div className="grid gap-3 md:grid-cols-2">
                  {c.days.map((day) => {
                    const eligible = day.chargeable && !!day.policy && !day.issues.length;
                    return (
                      <div className="min-w-0 rounded-lg border border-border p-3" key={day.on_date}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm">{day.on_date}</strong>
                          <State value={day.status} />
                        </div>
                        <p className="mb-3 text-xs text-muted-foreground">
                          {day.shift_name ?? "No effective shift"}
                          {day.issues.length ? " · " + day.issues.join(" ") : ""}
                        </p>
                        <Field title={"Leave portion on " + day.on_date}>
                          <select
                            className={selectClass}
                            value={portion(day.on_date, eligible)}
                            disabled={busy || !eligible}
                            onChange={(e) => setPortions((v) => ({ ...v, [day.on_date]: e.target.value as Portion }))}
                          >
                            <option value="none">Do not request</option>
                            <option value="full">Full day</option>
                            <option value="first_half">First half</option>
                            <option value="second_half">Second half</option>
                          </select>
                        </Field>
                      </div>
                    );
                  })}
                </div>
              )}
              {needsDocument && (
                <Alert>
                  <AlertTitle>Verified document required</AlertTitle>
                  <AlertDescription>
                    This policy requires a supporting document for the selected days. Ask HR to verify the document and
                    prepare the request through the employee document workflow.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
          <Field title="Reason for leave">
            <Textarea
              required
              minLength={12}
              maxLength={1000}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain your leave request for your manager and HR."
            />
          </Field>
          <Button
            type="submit"
            disabled={
              busy ||
              context.loading ||
              !c ||
              !type ||
              !days.length ||
              !!c.blockers.length ||
              needsDocument ||
              reason.trim().length < 12
            }
          >
            {busy ? "Saving…" : "Save leave draft"}
          </Button>
        </form>
      )}
      {!create &&
        items.map((r) => (
          <article className={panel} key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold break-words">
                  {r.reference} · {r.leave_type}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {r.from_date} to {r.to_date} · {r.days} days
                </p>
              </div>
              <State value={r.status} />
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => {
                onOpen(r.id);
                setActionReason("");
                setError("");
              }}
            >
              Open leave request
              <ArrowRight className="size-4" />
            </Button>
          </article>
        ))}
      {!create && !items.length && (
        <p className={panel + " text-sm text-muted-foreground"}>No leave requests overlap this month.</p>
      )}
      {detail.loading && <p role="status">Loading your leave request…</p>}
      {detail.error && (
        <Alert variant="destructive">
          <AlertDescription>{detail.error}</AlertDescription>
        </Alert>
      )}
      {!create && d && (
        <section aria-label="My leave request detail" className={panel + " space-y-4"}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold break-words">{d.reference}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {d.leave_type} · {d.from_date} to {d.to_date}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <State value={d.status} />
              <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpen("")}>
                Close request
              </Button>
            </div>
          </div>
          <p className="break-words text-sm">{d.reason}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.days.map((day) => (
              <div className="rounded-lg border border-border p-3 text-sm" key={day.on_date}>
                {day.on_date} · {day.portion.replaceAll("_", " ")} · {day.days} days
              </div>
            ))}
          </div>
          {d.context_unavailable && (
            <Alert>
              <AlertDescription>{d.context_unavailable}</AlertDescription>
            </Alert>
          )}
          {!!d.context?.blockers.length && (
            <Alert>
              <AlertDescription>{d.context.blockers.join(" ")}</AlertDescription>
            </Alert>
          )}
          {!!d.allowed_actions.length && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <Field title="Leave action reason">
                <Textarea
                  minLength={12}
                  maxLength={1000}
                  value={actionReason}
                  disabled={busy}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Explain your submission or cancellation."
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {d.allowed_actions.includes("submit") && (
                  <Button
                    type="button"
                    disabled={busy || actionReason.trim().length < 12 || !d.context}
                    onClick={() => act("submit")}
                  >
                    Submit for approval
                  </Button>
                )}
                {d.allowed_actions.includes("cancel") && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || actionReason.trim().length < 12}
                    onClick={() => act("cancel")}
                  >
                    Cancel request
                  </Button>
                )}
              </div>
            </div>
          )}
          {d.status === "approved" && (
            <p className="text-sm text-muted-foreground">
              Approved leave has already posted its exact daily usage. Contact HR for an independently approved
              cancellation.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Draft terms remain unchanged after saving. To revise dates or portions, cancel the draft and create a
            replacement. Manager and HR decisions use the same Time & Leave workflow.
          </p>
          <History items={d.history} />
        </section>
      )}
    </div>
  );
}
