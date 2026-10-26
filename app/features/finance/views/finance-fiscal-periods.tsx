"use client";
import { useEffect, useRef, useState } from "react";
import {
  monthlyFiscalPeriods,
  type FiscalCalendar,
  type FiscalCalendarDetail,
  type ChangeFiscalPeriods,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useActionFeedback } from "@/shared/ui/action-feedback";
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:outline-ring";
const labels = { open: "Open", soft_close: "Soft Closed", closed: "Locked" } as const;
// URL context is a UI selection, never an authorization or business-data source.
// Every restored ID must still be present in the live company-scoped directory.
function savedScope(key: "fiscal_company" | "fiscal_calendar") {
  if (typeof window === "undefined") return "";
  const value = new URLSearchParams(window.location.search).get(key) ?? "";
  return value.length <= 128 ? value : "";
}
function rememberScope(company: string, calendar = "") {
  const url = new URL(window.location.href);
  url.searchParams.set("fiscal_company", company);
  if (calendar) url.searchParams.set("fiscal_calendar", calendar);
  else url.searchParams.delete("fiscal_calendar");
  window.history.replaceState(window.history.state, "", url);
}
const message = (e: unknown) =>
  e instanceof ApiError
    ? `${e.message}${e.correlationId ? ` Reference: ${e.correlationId}` : ""}`
    : "Calendar request failed. Retry or refresh; no success is assumed.";
export function FinanceFiscalPeriods({ closeWorkbench = false }: { closeWorkbench?: boolean }) {
  const { api, session } = useSession();
  const [companies, setCompanies] = useState<Array<{ id: string; code: string; name: string }>>([]),
    [company, setCompany] = useState(() => savedScope("fiscal_company")),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [ready, setReady] = useState(false),
    [mutating, setMutating] = useState(false);
  const canRead = !!session?.user.permissions.includes("platform.fiscal_calendar.read");
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api
      .listFiscalCalendarCompanies()
      .then((v) => {
        if (active) {
          setCompanies(v.items);
          setCompany((c) => (v.items.some((x) => x.id === c) ? c : (v.items[0]?.id ?? "")));
          setReady(true);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [api, canRead, attempt]);
  if (!session)
    return (
      <Alert>
        <AlertDescription>Sign in to manage fiscal periods.</AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Permission required: platform.fiscal_calendar.read.</AlertDescription>
      </Alert>
    );
  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Finance fiscal calendar workspace">
      <header>
        <p className="text-sm text-muted-foreground">Finance · Company controls</p>
        <h2 className="font-serif text-2xl">Fiscal years &amp; periods</h2>
        <p className="text-sm text-muted-foreground">
          Independent company calendars. Only Open periods allow operational submission and posting.
        </p>
      </header>
      {closeWorkbench && (
        <Alert>
          <AlertDescription>
            These period controls are live. Automated reconciliation, depreciation and broader year-end close checklists
            are not implemented here; no mock readiness is used.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button variant="link" onClick={() => setAttempt((v) => v + 1)}>
              Retry companies
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex max-w-xl flex-col gap-2">
        <Label htmlFor="fiscal-company">Company</Label>
        <select
          id="fiscal-company"
          className={selectClass}
          value={company}
          onChange={(e) => {
            rememberScope(e.target.value);
            setCompany(e.target.value);
          }}
          disabled={!ready || mutating}
        >
          <option value="">{ready ? "No authorized companies" : "Loading companies…"}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </div>
      {company && (
        <CompanyPeriods
          key={`${session.tenant_id}:${session.user.id}:${company}`}
          company={company}
          onMutating={setMutating}
        />
      )}
    </section>
  );
}
function CompanyPeriods({ company, onMutating }: { company: string; onMutating: (busy: boolean) => void }) {
  const { api, session, csrfToken } = useSession(),
    notify = useActionFeedback();
  const [calendars, setCalendars] = useState<FiscalCalendar[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [calendarId, setCalendarId] = useState(() => savedScope("fiscal_calendar")),
    [detail, setDetail] = useState<FiscalCalendarDetail | null>(null),
    [selected, setSelected] = useState<string[]>([]);
  const [start, setStart] = useState(`${new Date().getUTCFullYear()}-01-01`),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState<"create" | "generate" | ChangeFiscalPeriods["status"] | null>(null),
    [reason, setReason] = useState(""),
    [confirmLocked, setConfirmLocked] = useState(false);
  const request = useRef(0),
    lock = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const permissions = session?.user.permissions ?? [],
    readonly = !!session?.impersonation;
  const admin =
    !!session?.user.roles.includes("super_administrator") &&
    permissions.includes("platform.approval.override") &&
    !readonly;
  const canCreate = admin && permissions.includes("platform.fiscal_calendar.create"),
    canReadPeriods = permissions.includes("platform.accounting_period.read"),
    canOpen = permissions.includes("finance.period.reopen") && !readonly,
    canClose = permissions.includes("finance.period.close") && !readonly;
  let preview: ReturnType<typeof monthlyFiscalPeriods> = [];
  try {
    preview = monthlyFiscalPeriods(start);
  } catch {
    /* Invalid preview is shown and create remains disabled. */
  }
  useEffect(() => {
    let active = true;
    api
      .listFiscalCalendars(`?${new URLSearchParams({ company_id: company, limit: "100" })}`)
      .then((v) => {
        if (active) {
          setCalendars(v.items);
          setCursor(v.next_cursor);
          setCalendarId((id) => (v.items.some((c) => c.id === id) ? id : (v.items[0]?.id ?? "")));
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(message(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, company, refresh]);
  useEffect(() => {
    if (!calendarId || !canReadPeriods) return;
    let active = true;
    const token = ++request.current;
    const timer = setTimeout(() => {
      setLoading(true);
      setDetail(null);
      setSelected([]);
      api
        .getFiscalCalendar(calendarId, company)
        .then((v) => {
          if (active && token === request.current) {
            setDetail(v);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(message(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, company, calendarId, canReadPeriods, refresh]);
  const chosen = detail?.periods.filter((p) => selected.includes(p.id)) ?? [],
    hasLocked = chosen.some((p) => p.status === "closed");
  function begin(next: NonNullable<typeof action>) {
    setReason("");
    setConfirmLocked(false);
    setAction(next);
    setError("");
    retry.current = null;
  }
  async function perform() {
    if (!action || lock.current) return;
    const kind = action;
    const payload =
      kind === "create"
        ? { company_id: company, period_start: start }
        : kind === "generate"
          ? { company_id: company, expected_version: detail!.calendar.version }
          : {
              company_id: company,
              periods: chosen.map((p) => ({ id: p.id, expected_version: p.version })),
              status: kind,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
              confirm_locked_reopen: confirmLocked,
            };
    const fingerprint = JSON.stringify({ kind, calendarId, payload });
    const key = retry.current?.fingerprint === fingerprint ? retry.current.key : `fiscal-${crypto.randomUUID()}`;
    retry.current = { fingerprint, key };
    lock.current = true;
    onMutating(true);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result =
        kind === "create"
          ? await api.createFiscalCalendar({ company_id: company, period_start: start }, csrfToken(), key)
          : kind === "generate"
            ? await api.generateFiscalPeriods(
                calendarId,
                { company_id: company, expected_version: detail!.calendar.version },
                csrfToken(),
                key,
              )
            : await api.changeFiscalPeriods(
                calendarId,
                {
                  company_id: company,
                  periods: chosen.map((p) => ({ id: p.id, expected_version: p.version })),
                  status: kind,
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                  confirm_locked_reopen: confirmLocked,
                },
                csrfToken(),
                key,
              );
      retry.current = null;
      setDetail(result);
      setCalendarId(result.calendar.id);
      rememberScope(company, result.calendar.id);
      setSelected([]);
      setAction(null);
      setRefresh((v) => v + 1);
      const text =
        kind === "create" || kind === "generate"
          ? "Fiscal year periods saved as Soft Closed. Opening requires a separate action."
          : `Selected periods changed to ${labels[kind]}. No transaction was approved or posted.`;
      setSuccess(text);
      notify(text);
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      onMutating(false);
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const v = await api.listFiscalCalendars(
        `?${new URLSearchParams({ company_id: company, after: cursor, limit: "100" })}`,
      );
      setCalendars((rows) => [...rows, ...v.items.filter((c) => !rows.some((r) => r.id === c.id))]);
      setCursor(v.next_cursor);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const validAction =
    action === "create"
      ? preview.length === 12
      : action === "generate"
        ? !!detail && detail.periods.length === 0
        : chosen.length > 0 && (action === "soft_close" || reason.trim().length >= 3) && (!hasLocked || confirmLocked);
  return (
    <>
      {error && !action && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {error}
            <Button variant="link" onClick={() => setRefresh((v) => v + 1)}>
              Refresh calendars
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert role="status">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>New company fiscal year</CardTitle>
            <CardDescription>
              Choose the first day of any month. January–December, July–June and other monthly starts are supported.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex max-w-xl flex-col gap-2">
            <Label htmlFor="fiscal-start">Fiscal year start</Label>
            <Input
              id="fiscal-start"
              type="date"
              value={start}
              disabled={busy}
              onChange={(e) => setStart(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {preview.length
                ? `${start} → ${preview[11]!.period_end} · 12 monthly periods`
                : "Choose a first-of-month date within 1900–2999."}
            </p>
          </CardContent>
          <CardFooter>
            <Button disabled={busy || !preview.length} onClick={() => begin("create")}>
              Preview new fiscal year
            </Button>
          </CardFooter>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Company fiscal years</CardTitle>
          <CardDescription>
            Stored fiscal-year labels and document numbering are preserved. No overlapping years or period-date
            rewrites.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Label htmlFor="fiscal-year">Fiscal year</Label>
          <select
            id="fiscal-year"
            className={selectClass}
            value={calendarId}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value === calendarId) return;
              rememberScope(company, e.target.value);
              setDetail(null);
              setCalendarId(e.target.value);
              setSelected([]);
              setSuccess("");
            }}
          >
            <option value="">{loading ? "Loading fiscal years…" : "No fiscal years configured"}</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.period_start} – {c.period_end} · {c.status}
              </option>
            ))}
          </select>
          {cursor && (
            <Button variant="outline" disabled={busy} onClick={() => void more()}>
              Load more fiscal years
            </Button>
          )}
          {!canReadPeriods && (
            <Alert>
              <AlertDescription>Period detail requires platform.accounting_period.read.</AlertDescription>
            </Alert>
          )}
          {loading && <p role="status">Loading persisted calendar data…</p>}
          {detail && (
            <>
              <p className="text-sm text-muted-foreground">
                Soft Closed and Locked block operational posting. Adjustment-only posting is not implemented. No posted
                financial record is changed by these controls.
              </p>
              {!detail.periods.length && (
                <Alert>
                  <AlertDescription>
                    No monthly periods exist.{" "}
                    {canCreate && detail.calendar.status === "active" && (
                      <Button variant="outline" disabled={busy} onClick={() => begin("generate")}>
                        Generate monthly periods
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <caption className="sr-only">Persisted monthly Finance periods</caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <Checkbox
                          aria-label="Select all periods"
                          checked={!!detail.periods.length && selected.length === detail.periods.length}
                          disabled={busy || detail.calendar.status !== "active"}
                          onCheckedChange={(checked) => setSelected(checked ? detail.periods.map((p) => p.id) : [])}
                        />
                      </th>
                      <th scope="col">Period</th>
                      <th scope="col">Start</th>
                      <th scope="col">End</th>
                      <th scope="col">Status</th>
                      <th scope="col">Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.periods.map((p) => (
                      <tr key={p.id} className="border-t border-border [&>td]:py-3">
                        <td>
                          <Checkbox
                            aria-label={`Select period ${p.period_number}`}
                            checked={selected.includes(p.id)}
                            disabled={busy || detail.calendar.status !== "active"}
                            onCheckedChange={(checked) =>
                              setSelected((ids) =>
                                checked ? [...ids.filter((id) => id !== p.id), p.id] : ids.filter((id) => id !== p.id),
                              )
                            }
                          />
                        </td>
                        <td>{p.period_number}</td>
                        <td>{p.period_start}</td>
                        <td>{p.period_end}</td>
                        <td>
                          <Badge variant={p.status === "open" ? "default" : "secondary"}>{labels[p.status]}</Badge>
                        </td>
                        <td>{p.version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                {canOpen && (
                  <Button
                    disabled={
                      busy || !chosen.length || chosen.some((p) => p.status === "open") || (hasLocked && !admin)
                    }
                    onClick={() => begin("open")}
                  >
                    Open selected periods
                  </Button>
                )}
                {canClose && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy || !chosen.length || chosen.some((p) => p.status !== "open")}
                      onClick={() => begin("soft_close")}
                    >
                      Soft close selected
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy || !chosen.length || chosen.some((p) => p.status !== "soft_close")}
                      onClick={() => begin("closed")}
                    >
                      Lock selected periods
                    </Button>
                  </>
                )}
              </div>
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer font-medium">Immutable calendar history</summary>
                <ol className="mt-3 flex flex-col gap-2" aria-label="Fiscal calendar history">
                  {detail.history.map((e) => (
                    <li key={e.id} className="border-t border-border pt-2">
                      {e.action} · {e.after_status} · {e.actor_id} · {e.occurred_at}
                      {e.reason && <p>{e.reason}</p>}
                    </li>
                  ))}
                </ol>
                {detail.history_has_more && (
                  <p>Showing the most recent 100 events; older immutable evidence is retained.</p>
                )}
              </details>
            </>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>
              {action === "create"
                ? "Confirm new fiscal year"
                : action === "generate"
                  ? "Confirm monthly generation"
                  : `Confirm ${action ? labels[action] : "period change"}`}
            </DialogTitle>
            <DialogDescription>
              {action === "create" || action === "generate"
                ? "All generated periods start Soft Closed. No transactions are approved or posted."
                : "This changes date-based financial controls for the selected company only. The decision is permanently audited."}
            </DialogDescription>
          </DialogHeader>
          {action === "create" || action === "generate" ? (
            <ol className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {(action === "create"
                ? preview
                : detail
                  ? (() => {
                      try {
                        return monthlyFiscalPeriods(detail.calendar.period_start);
                      } catch {
                        return [];
                      }
                    })()
                  : []
              ).map((p) => (
                <li key={p.period_number}>
                  {p.period_number}. {p.period_start} – {p.period_end}
                </li>
              ))}
            </ol>
          ) : (
            <>
              <p>
                {chosen.length} period(s): {chosen.map((p) => `${p.period_start} – ${p.period_end}`).join(", ")}
              </p>
              <Label htmlFor="period-change-reason">
                Reason {action === "soft_close" ? "(optional)" : "(required)"}
              </Label>
              <Textarea
                id="period-change-reason"
                value={reason}
                maxLength={500}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
              {hasLocked && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="locked-period-confirm"
                    checked={confirmLocked}
                    onCheckedChange={(v) => setConfirmLocked(!!v)}
                    disabled={busy}
                  />
                  <Label htmlFor="locked-period-confirm">I confirm Super Admin reopening of locked periods.</Label>
                </div>
              )}
            </>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button disabled={busy || !validAction} onClick={() => void perform()}>
              {busy ? "Saving…" : "Confirm calendar action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
