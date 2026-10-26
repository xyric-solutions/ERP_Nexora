"use client";
import { useId, useRef, useState } from "react";
import { Download, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSession } from "@/lib/session/session-provider";
import {
  hrReportGovernanceActionSchema,
  type HrReportGovernanceAction,
  type HrReportGovernanceWorkspace,
} from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import { Field, State, panel, selectClass, useAttendanceRead, localDate } from "../components/hr-workspace-controls";
import { HrCompanyScope } from "../components/hr-company-scope";
type Navigate = (module: string, page: string, reference?: string) => void;
export const hrGovernancePages = ["hr-compliance-configuration", "hr-export-centre", "hr-report-audit-log"] as const;
type Page = (typeof hrGovernancePages)[number];
function ReportGovernanceBody({
  company,
  section,
  onBusy,
  onNavigate,
}: {
  company: string;
  section: "policies" | "exports" | "audit";
  onBusy: (busy: boolean) => void;
  onNavigate: Navigate;
}) {
  const { api, csrfToken } = useSession(),
    client = new HrApiClient(api),
    ids = useId();
  const [revision, setRevision] = useState(0),
    [offset, setOffset] = useState(0),
    [policyForm, setPolicyForm] = useState(false),
    [maxRows, setMaxRows] = useState("1000"),
    [hours, setHours] = useState("24"),
    [selected, setSelected] = useState<Array<"employee_directory" | "payroll_results">>(["employee_directory"]),
    [policyReason, setPolicyReason] = useState(""),
    [report, setReport] = useState(""),
    [from, setFrom] = useState(localDate().slice(0, 7) + "-01"),
    [to, setTo] = useState(localDate()),
    [purpose, setPurpose] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dialog, setDialog] = useState<{
      action: "approve_policy" | "reject_policy" | "download";
      id: string;
      version?: number;
    } | null>(null),
    [decisionReason, setDecisionReason] = useState("");
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null),
    q = { company_id: company, section, limit: 10, offset },
    read = useAttendanceRead(JSON.stringify([q, revision]), () => client.reportGovernance(q)),
    w = read.data;
  async function command(input: unknown) {
    const parsed = hrReportGovernanceActionSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    const fingerprint = JSON.stringify(parsed.data);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await client.actOnReportGovernance(parsed.data, csrfToken(), retry.current.key);
      retry.current = null;
      if (result.download) {
        const url = URL.createObjectURL(new Blob([result.download.csv], { type: result.download.content_type })),
          a = document.createElement("a");
        a.href = url;
        a.download = result.download.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice(
        result.status === "submitted"
          ? "The disclosure policy is awaiting a different authorized reviewer."
          : result.status === "approved"
            ? "The disclosure policy is approved. New exports use this policy."
            : result.status === "rejected"
              ? "The policy was rejected."
              : "download" in result
                ? "The authorized CSV download has started. The disclosure was audited."
                : "The export receipt is ready. Download will recheck current permissions and the reviewed source.",
      );
      setDialog(null);
      setPolicyForm(false);
      setPolicyReason("");
      setPurpose("");
      setDecisionReason("");
      setOffset(0);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The governed report action failed.");
    } finally {
      guard.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  function policy(e: React.FormEvent) {
    e.preventDefault();
    void command({
      action: "create_policy",
      company_id: company,
      terms: { max_rows: Number(maxRows), expires_after_hours: Number(hours), reports: selected },
      reason: policyReason,
    });
  }
  function createExport(e: React.FormEvent) {
    e.preventDefault();
    void command({
      action: "create_export",
      company_id: company,
      report,
      from_date: from,
      to_date: to,
      reason: purpose,
    });
  }
  function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    const input: HrReportGovernanceAction =
      dialog.action === "download"
        ? { company_id: company, action: "download", id: dialog.id, reason: decisionReason }
        : {
            company_id: company,
            action: dialog.action,
            id: dialog.id,
            expected_version: dialog.version!,
            reason: decisionReason,
          };
    void command(input);
  }
  function policyCard(p: HrReportGovernanceWorkspace["policies"][number]) {
    return (
      <article className={panel + " space-y-3"} key={p.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="font-semibold">Disclosure policy · version {p.version}</h3>
          <div className="flex flex-wrap gap-2">
            <State value={p.state} />
            {w?.active_policy?.id === p.id && <Badge variant="outline">Current policy</Badge>}
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Maximum rows</p>
            <p className="font-semibold">{p.terms.max_rows}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Authorization window</p>
            <p className="font-semibold">{p.terms.expires_after_hours} hours</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Permitted reports</p>
            <p className="break-words">
              {p.terms.reports.map((id) => w?.catalogue.find((r) => r.id === id)?.title ?? id).join(", ")}
            </p>
          </div>
        </div>
        <p className="break-words text-sm">{p.reason}</p>
        <p className="text-xs text-muted-foreground">
          Requested by {p.created_by} · {new Date(p.created_at).toLocaleString()}
        </p>
        {p.decision_reason && (
          <p className="rounded-lg border border-border bg-muted p-3 text-sm">{p.decision_reason}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {p.allowed_actions.map((action) => (
            <Button
              type="button"
              key={action}
              variant={action === "approve_policy" ? "default" : "outline"}
              disabled={busy}
              onClick={() => {
                setDialog({ action, id: p.id, version: p.version });
                setDecisionReason("");
                setError("");
              }}
            >
              {action === "approve_policy" ? "Approve disclosure policy" : "Reject disclosure policy"}
            </Button>
          ))}
        </div>
      </article>
    );
  }
  return (
    <section className="min-w-0 space-y-4" data-report-governance={section}>
      <div className="flex flex-wrap justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {section === "audit"
            ? "Immutable records of disclosure-policy decisions, export creation and authorized downloads. Access denials also remain in the API request/security logs."
            : section === "policies"
              ? "Set permitted reports, row limits and authorization expiry. A different authorized officer must approve the policy."
              : "Create a reviewed export receipt, then download after current permission, expiry and source checks. Only your own receipts can be downloaded."}
        </p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          <RefreshCw className="size-4" />
          {read.error ? "Retry reporting" : "Refresh reporting"}
        </Button>
      </div>
      {(error || read.error) && (
        <Alert variant="destructive">
          <AlertDescription>{error || read.error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {read.loading && <p role="status">Loading governed reporting…</p>}
      {section !== "audit" && w && !w.active_policy && (
        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>Approved disclosure policy required</AlertTitle>
          <AlertDescription>
            Exports stay blocked until a disclosure policy is independently approved.
            {section === "exports" && (
              <Button
                type="button"
                variant="link"
                className="h-auto whitespace-normal px-0 text-left"
                onClick={() => onNavigate("hr", "hr-compliance-configuration")}
              >
                Open Compliance Configuration
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {section === "policies" && w && (
        <>
          <div className={panel}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-semibold">Export disclosure controls</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Approved rules govern CSV disclosure. Statutory tax and contribution rules stay in the existing
                  Payroll configuration.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => onNavigate("hr", "statutory-deductions")}>
                Open Statutory Deductions
              </Button>
            </div>
            {w.can_manage_policy && !policyForm && (
              <Button
                type="button"
                className="mt-4"
                disabled={busy || w.policies.some((p) => p.state === "submitted")}
                onClick={() => setPolicyForm(true)}
              >
                Propose disclosure policy
              </Button>
            )}
          </div>
          {policyForm && (
            <form aria-label="Propose report disclosure policy" className={panel + " space-y-4"} onSubmit={policy}>
              <h3 className="font-semibold">New disclosure policy</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field title="Maximum rows per export">
                  <Input
                    type="number"
                    min={1}
                    max={5000}
                    required
                    value={maxRows}
                    disabled={busy}
                    onChange={(e) => setMaxRows(e.target.value)}
                  />
                </Field>
                <Field title="Export authorization hours">
                  <Input
                    type="number"
                    min={1}
                    max={168}
                    required
                    value={hours}
                    disabled={busy}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </Field>
              </div>
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-medium">Permitted reports</legend>
                {w.catalogue.map((r) => (
                  <div key={r.id} className="flex items-start gap-3">
                    <Checkbox
                      id={ids + r.id}
                      checked={selected.includes(r.id)}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        setSelected((v) =>
                          checked === true ? [...new Set([...v, r.id])] : v.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <label htmlFor={ids + r.id} className="text-sm">
                      <span className="font-medium">{r.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{r.description}</span>
                    </label>
                  </div>
                ))}
              </fieldset>
              <Field title="Disclosure policy reason">
                <Textarea
                  required
                  minLength={12}
                  maxLength={1000}
                  value={policyReason}
                  disabled={busy}
                  onChange={(e) => setPolicyReason(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !selected.length || policyReason.trim().length < 12}>
                  Submit disclosure policy
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setPolicyForm(false)}>
                  Close policy form
                </Button>
              </div>
            </form>
          )}
          {w.policies.map(policyCard)}
          {!w.policies.length && (
            <p className={panel + " text-sm text-muted-foreground"}>
              No disclosure policies have been recorded for this company.
            </p>
          )}
        </>
      )}
      {section === "exports" && w && (
        <>
          <div className={panel + " space-y-3"}>
            <h2 className="font-semibold">Reviewed CSV exports</h2>
            <p className="text-sm text-muted-foreground">
              No CSV files or report rows are stored on the server. A receipt retains its source hash and authorization
              window. Source changes require a fresh receipt. Formula-like cells are exported as text.
            </p>
            {w.active_policy && (
              <p className="text-xs text-muted-foreground">
                Current policy: at most {w.active_policy.terms.max_rows} rows ·{" "}
                {w.active_policy.terms.expires_after_hours} hours · up to 20 receipts per hour.
              </p>
            )}
            <form aria-label="Create governed report export" onSubmit={createExport} className="space-y-4">
              <Field title="Report">
                <select
                  className={selectClass}
                  required
                  value={report}
                  disabled={busy || !w.active_policy}
                  onChange={(e) => setReport(e.target.value)}
                >
                  <option value="">Select a permitted report</option>
                  {w.catalogue.map((r) => (
                    <option key={r.id} value={r.id} disabled={!r.can_export}>
                      {r.title}
                      {!r.can_export ? " · authorization required" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field title="Report from date">
                  <Input type="date" required value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field title="Report to date">
                  <Input type="date" required value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} />
                </Field>
              </div>
              <Field title="Export purpose">
                <Textarea
                  minLength={12}
                  maxLength={1000}
                  required
                  value={purpose}
                  disabled={busy}
                  onChange={(e) => setPurpose(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={busy || !w.active_policy || !report || purpose.trim().length < 12}>
                Create reviewed export
              </Button>
            </form>
          </div>
          {w.exports.map((r) => (
            <article className={panel + " space-y-3"} key={r.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <h3 className="font-semibold">{w.catalogue.find((c) => c.id === r.report)?.title ?? r.report}</h3>
                <Badge variant="outline">{r.expired ? "Expired authorization" : "Reviewed receipt"}</Badge>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Reporting window</dt>
                  <dd>
                    {r.from_date} to {r.to_date}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reviewed rows</dt>
                  <dd className="font-semibold">{r.row_count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Expires</dt>
                  <dd>{new Date(r.expires_at).toLocaleString()}</dd>
                </div>
              </dl>
              <p className="break-words text-sm text-muted-foreground">{r.reason}</p>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !r.can_download}
                onClick={() => {
                  setDialog({ action: "download", id: r.id });
                  setDecisionReason("");
                  setError("");
                }}
              >
                <Download className="size-4" />
                Download reviewed CSV
              </Button>
              {!r.can_download && !r.expired && (
                <p className="text-xs text-muted-foreground">
                  Current policy and report-specific permissions are required.
                </p>
              )}
            </article>
          ))}
          {!w.exports.length && (
            <p className={panel + " text-sm text-muted-foreground"}>
              No export receipts have been created by your account in this company.
            </p>
          )}
        </>
      )}
      {section === "audit" && w && (
        <div className="space-y-3">
          {w.events.map((e) => (
            <article className={panel} key={e.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <h2 className="font-semibold capitalize">{e.kind.replaceAll(".", " ")}</h2>
                <span className="text-xs text-muted-foreground">{new Date(e.occurred_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 break-words text-sm">{e.reason}</p>
              <dl className="mt-3 grid min-w-0 gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt>Actor</dt>
                  <dd className="break-all">{e.actor_id}</dd>
                </div>
                <div>
                  <dt>Record</dt>
                  <dd className="break-all">{e.record_id}</dd>
                </div>
              </dl>
            </article>
          ))}
          {!w.events.length && (
            <p className={panel + " text-sm text-muted-foreground"}>
              No reporting disclosures or policy decisions have been recorded for this company.
            </p>
          )}
        </div>
      )}
      {w && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {w.total ? offset + 1 : 0}–{Math.min(offset + w.limit, w.total)} of {w.total} records
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || offset === 0}
              onClick={() => setOffset((v) => Math.max(0, v - 10))}
            >
              Previous report records
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || offset + 10 >= w.total}
              onClick={() => setOffset((v) => v + 10)}
            >
              Next report records
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.action === "download"
                ? "Authorize CSV download"
                : dialog?.action === "approve_policy"
                  ? "Approve disclosure policy"
                  : "Reject disclosure policy"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.action === "download"
                ? "Current access, policy, expiry and the reviewed source are checked again before any report data is returned."
                : "A policy author cannot review their own proposal. Confirm the permitted reports, row limit and authorization period."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirm} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field title={dialog?.action === "download" ? "Download purpose" : "Policy review reason"}>
              <Textarea
                required
                minLength={12}
                maxLength={1000}
                disabled={busy}
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy || decisionReason.trim().length < 12}>
              {dialog?.action === "download" ? "Confirm authorized download" : "Confirm policy decision"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function HrReportGovernanceWorkspace({ page, onNavigate }: { page: Page; onNavigate: Navigate }) {
  const [busy, setBusy] = useState(false),
    section = page === "hr-compliance-configuration" ? "policies" : page === "hr-export-centre" ? "exports" : "audit",
    title =
      section === "policies"
        ? "Compliance Configuration"
        : section === "exports"
          ? "Secure Export Centre"
          : "Report Audit Log";
  return (
    <div className="min-w-0 space-y-5 text-foreground" data-hr-report-page={page}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary">
            <FileText className="size-4" />
            HR & Payroll
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Company-scoped reporting, disclosure controls and immutable audit history.
          </p>
        </div>
        <Badge variant="outline">API connected</Badge>
      </header>
      <HrCompanyScope disabled={busy}>
        {(company) => (
          <ReportGovernanceBody company={company} section={section} onBusy={setBusy} onNavigate={onNavigate} />
        )}
      </HrCompanyScope>
    </div>
  );
}
