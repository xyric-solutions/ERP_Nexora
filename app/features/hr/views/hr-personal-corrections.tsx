"use client";
import { useRef, useState } from "react";
import { RefreshCw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSession } from "@/lib/session/session-provider";
import {
  createHrPersonalCorrectionSchema,
  hrPersonalCorrectionActionSchema,
  type HrPersonalProfile,
  type HrPersonalCorrectionAction,
  type HrAttendanceCompletionResult,
  type HrPersonalCorrectionWorkspace,
} from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import { Field, State, panel, useAttendanceRead } from "../components/hr-workspace-controls";
import { HrCompanyScope } from "../components/hr-company-scope";
import { HrEmployeeApprovalsWorkspace } from "./hr-employee-approvals-workspace";
const fields: [keyof HrPersonalProfile, string][] = [
  ["first_name", "First name"],
  ["middle_name", "Middle name"],
  ["last_name", "Last name"],
  ["preferred_name", "Preferred name"],
  ["date_of_birth", "Date of birth"],
  ["personal_email", "Personal email"],
  ["phone", "Phone number"],
];
type RecordItem = HrPersonalCorrectionWorkspace["items"][number];
export function HrPersonalCorrections({
  company,
  mode = "mine",
  onBusy,
}: {
  company: string;
  mode?: "mine" | "review";
  onBusy?: (busy: boolean) => void;
}) {
  const { api, csrfToken } = useSession(),
    client = new HrApiClient(api);
  const [revision, setRevision] = useState(0),
    [offset, setOffset] = useState(0),
    [edit, setEdit] = useState<{ profile: HrPersonalProfile; hash: string } | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [decision, setDecision] = useState<{ record: RecordItem; action: HrPersonalCorrectionAction["action"] } | null>(
      null,
    ),
    [decisionReason, setDecisionReason] = useState(""),
    [reference, setReference] = useState("");
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null),
    q = { company_id: company, mode, state: "all" as const, limit: 10, offset };
  const read = useAttendanceRead(JSON.stringify([q, revision]), () => client.personalCorrections(q)),
    w = read.data;
  async function command(input: unknown, operation: (key: string) => Promise<HrAttendanceCompletionResult>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await operation(retry.current.key);
      retry.current = null;
      setEdit(null);
      setDecision(null);
      setReason("");
      setDecisionReason("");
      setReference("");
      setNotice(
        result.status === "submitted"
          ? "Your correction request is awaiting independent HR review. Your current profile remains unchanged."
          : result.status === "approved"
            ? "The correction was approved and applied to the employee profile and history."
            : result.status === "cancelled"
              ? "The correction request was cancelled."
              : "The correction request was rejected.",
      );
      setOffset(0);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The correction action could not be completed.");
    } finally {
      guard.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const input = createHrPersonalCorrectionSchema.safeParse({
      company_id: company,
      profile: edit.profile,
      expected_source_hash: edit.hash,
      reason,
    });
    if (!input.success) {
      setError(input.error.issues.map((i) => i.message).join(" "));
      return;
    }
    void command(input.data, (key) => client.createPersonalCorrection(input.data, csrfToken(), key));
  }
  function decide(e: React.FormEvent) {
    e.preventDefault();
    if (!decision) return;
    const input = hrPersonalCorrectionActionSchema.safeParse({
      company_id: company,
      action: decision.action,
      expected_version: decision.record.version,
      reason: decisionReason,
      review_reference: reference,
    });
    if (!input.success) {
      setError(input.error.issues.map((i) => i.message).join(" "));
      return;
    }
    void command(input.data, (key) => client.actOnPersonalCorrection(decision.record.id, input.data, csrfToken(), key));
  }
  return (
    <section
      className="min-w-0 space-y-4"
      data-personal-corrections={mode}
      aria-label={mode === "mine" ? "My personal data corrections" : "HR personal data correction review"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {mode === "mine" ? "Personal details & corrections" : "Personal data correction review"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {mode === "mine"
              ? "Review your recorded details and request a correction. HR verifies the supporting information before applying any change."
              : "Compare the submitted profile and proposal, verify supporting information and record an independent decision."}
          </p>
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          <RefreshCw className="size-4" />
          {read.error ? "Retry corrections" : "Refresh corrections"}
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
      {read.loading && <p role="status">Loading governed profile corrections…</p>}
      {mode === "mine" && w?.current && !edit && (
        <div className={panel}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map(([key, label]) => (
              <div key={key} className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 break-words text-sm font-medium [overflow-wrap:anywhere]">
                  {w.current![key] || "Not recorded"}
                </p>
              </div>
            ))}
          </div>
          <Button
            type="button"
            className="mt-4"
            disabled={busy || !w.can_request || w.items.some((r) => r.state === "submitted")}
            onClick={() => {
              setEdit({ profile: { ...w.current! }, hash: w.source_hash! });
              setReason("");
              setError("");
            }}
          >
            Request a personal data correction
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            One request can be pending for an employee at a time. Work email, login, employee number, assignments, bank
            and tax information use their separate governed workflows.
          </p>
        </div>
      )}
      {edit && (
        <form onSubmit={submit} className={panel + " space-y-4"} aria-label="Request personal data correction">
          <h3 className="font-semibold">Proposed personal details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(([key, label]) => (
              <Field key={key} title={label}>
                <Input
                  type={
                    key === "date_of_birth"
                      ? "date"
                      : key === "personal_email"
                        ? "email"
                        : key === "phone"
                          ? "tel"
                          : "text"
                  }
                  required={key === "first_name" || key === "last_name"}
                  maxLength={key === "phone" ? 40 : key === "personal_email" ? 320 : 100}
                  value={edit.profile[key] ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    setEdit((v) =>
                      v
                        ? {
                            ...v,
                            profile: {
                              ...v.profile,
                              [key]: key === "date_of_birth" ? e.target.value || null : e.target.value,
                            },
                          }
                        : v,
                    )
                  }
                />
              </Field>
            ))}
          </div>
          {w?.source_hash && edit.hash !== w.source_hash && (
            <Alert>
              <AlertTitle>Current details changed</AlertTitle>
              <AlertDescription>
                Review the recorded details again before sending this proposal. Close this form and start from the
                refreshed profile.
              </AlertDescription>
            </Alert>
          )}
          <Field title="Correction reason">
            <Textarea
              minLength={12}
              maxLength={1000}
              required
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe what is incorrect and the supporting information HR should verify."
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || reason.trim().length < 12 || edit.hash !== w?.source_hash}>
              Submit correction for HR review
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setEdit(null)}>
              Close correction form
            </Button>
          </div>
        </form>
      )}
      {w && !w.items.length && (
        <p className={panel + " text-sm text-muted-foreground"}>No correction requests in this company scope.</p>
      )}
      {w?.items.map((record) => (
        <article className={panel + " space-y-4"} key={record.id}>
          <div className="flex flex-wrap justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold break-words">{record.employee_name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {record.employee_number} · Requested {new Date(record.created_at).toLocaleString()}
              </p>
            </div>
            <State value={record.state} />
          </div>
          <p className="break-words text-sm">{record.reason}</p>
          <details className="rounded-lg border border-border p-3" open={record.state === "submitted"}>
            <summary className="cursor-pointer text-sm font-semibold">Review submitted changes</summary>
            <dl className="mt-3 grid gap-3">
              {fields
                .filter(([key]) => record.before[key] !== record.proposed[key])
                .map(([key, label]) => (
                  <div
                    key={key}
                    className="grid min-w-0 gap-2 border-t border-border pt-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <dt className="text-sm font-medium">{label}</dt>
                    <dd className="min-w-0 break-words text-sm [overflow-wrap:anywhere]">
                      <span className="block text-xs text-muted-foreground">Recorded at submission</span>
                      {record.before[key] || "Not recorded"}
                    </dd>
                    <dd className="min-w-0 break-words text-sm [overflow-wrap:anywhere]">
                      <span className="block text-xs text-muted-foreground">Proposed</span>
                      {record.proposed[key] || "Remove recorded value"}
                    </dd>
                  </div>
                ))}
            </dl>
          </details>
          {record.decision_reason && (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm">
              <p className="break-words">{record.decision_reason}</p>
              {record.review_reference && (
                <p className="mt-1 break-words text-muted-foreground">
                  Verified information reference: {record.review_reference}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {record.decided_by} · {record.decided_at ? new Date(record.decided_at).toLocaleString() : ""}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {record.allowed_actions.map((action) => (
              <Button
                key={action}
                type="button"
                variant={action === "approve" ? "default" : "outline"}
                disabled={busy}
                onClick={() => {
                  setDecision({ record, action });
                  setDecisionReason("");
                  setReference("");
                  setError("");
                }}
              >
                {action === "approve"
                  ? "Approve correction"
                  : action === "reject"
                    ? "Reject correction"
                    : "Cancel correction request"}
              </Button>
            ))}
          </div>
        </article>
      ))}
      {w && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {w.total ? offset + 1 : 0}–{Math.min(offset + w.limit, w.total)} of {w.total} correction requests
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || offset === 0}
              onClick={() => setOffset((v) => Math.max(0, v - 10))}
            >
              Previous corrections
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || offset + 10 >= w.total}
              onClick={() => setOffset((v) => v + 10)}
            >
              Next corrections
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={!!decision}
        onOpenChange={(open) => {
          if (!open && !busy) setDecision(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {decision?.action === "approve"
                ? "Approve personal data correction"
                : decision?.action === "reject"
                  ? "Reject personal data correction"
                  : "Cancel personal data correction"}
            </DialogTitle>
            <DialogDescription>
              {decision?.action === "approve"
                ? "Confirm the information was independently verified. Approval applies only the reviewed proposal and preserves profile history."
                : "Record why this submitted correction should not proceed."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={decide} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {decision?.action === "approve" && (
              <Field title="Verified supporting information reference">
                <Input
                  required
                  minLength={12}
                  maxLength={500}
                  value={reference}
                  disabled={busy}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Reference to the verified HR evidence or signed correction."
                />
              </Field>
            )}
            <Field title="Decision reason">
              <Textarea
                required
                minLength={12}
                maxLength={1000}
                value={decisionReason}
                disabled={busy}
                onChange={(e) => setDecisionReason(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              disabled={
                busy ||
                decisionReason.trim().length < 12 ||
                (decision?.action === "approve" && reference.trim().length < 12)
              }
            >
              Confirm correction decision
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function HrPeopleApprovalsWorkspace({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Tabs defaultValue="employee">
      <div className="max-w-full overflow-x-auto">
        <TabsList className="w-max">
          <TabsTrigger value="employee" disabled={busy}>
            Employee approvals
          </TabsTrigger>
          <TabsTrigger value="corrections" disabled={busy}>
            <UserRound className="mr-1 size-4" />
            Personal data corrections
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="employee">
        <HrEmployeeApprovalsWorkspace onAction={onAction} />
      </TabsContent>
      <TabsContent value="corrections">
        <div className="mt-4">
          <HrCompanyScope disabled={busy}>
            {(company) => <HrPersonalCorrections company={company} mode="review" onBusy={setBusy} />}
          </HrCompanyScope>
        </div>
      </TabsContent>
    </Tabs>
  );
}
