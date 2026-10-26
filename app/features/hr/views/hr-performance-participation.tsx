"use client";
import { useRef, useState } from "react";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, panel, selectClass, useAttendanceRead } from "../components/hr-workspace-controls";
import { HrApiClient } from "../api/hr-client";
import {
  hrPerformanceParticipationActionSchema,
  type HrPerformanceParticipationAction,
  type HrPerformanceParticipation,
  type HrPerformanceWorkspace,
} from "@nexora/contracts";
type Item = HrPerformanceParticipation["items"][number];
function ContributionForm({
  item,
  busy,
  onCancel,
  onSubmit,
}: {
  item: Item;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (summary: string, ratings: { goal_id: string; rating: number; evidence: string }[], reason: string) => void;
}) {
  const [summary, setSummary] = useState(""),
    [reason, setReason] = useState(""),
    [ratings, setRatings] = useState<Record<string, { rating: number; evidence: string }>>({});
  return (
    <form
      className={panel + " space-y-4"}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          summary,
          item.goals.map((g) => ({
            goal_id: g.id,
            rating: ratings[g.id]?.rating ?? 3,
            evidence: ratings[g.id]?.evidence ?? "",
          })),
          reason,
        );
      }}
      aria-label="Employee contribution form"
    >
      <h3 className="text-lg font-semibold">
        {item.kind === "self" ? "Self appraisal" : "Peer feedback"} · {item.employee_name}
      </h3>
      <p className="text-sm text-muted-foreground">
        Your submitted evidence becomes immutable. It supports the manager assessment and does not replace the manager’s
        rating.
      </p>
      <Field title="Assessment summary">
        <Textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          required
          minLength={10}
          maxLength={4000}
          disabled={busy}
        />
      </Field>
      {item.goals.map((g) => (
        <fieldset key={g.id} className="min-w-0 space-y-3 rounded-lg border border-border p-3">
          <legend className="max-w-full break-words px-1 text-sm font-medium">
            {g.title} · {g.weight_bps / 100}%
          </legend>
          <Field title={"Rating for " + g.title}>
            <select
              className={selectClass}
              disabled={busy}
              value={ratings[g.id]?.rating ?? 3}
              onChange={(e) =>
                setRatings((v) => ({
                  ...v,
                  [g.id]: { rating: Number(e.target.value), evidence: v[g.id]?.evidence ?? "" },
                }))
              }
            >
              {[1, 2, 3, 4, 5].map((v) => (
                <option key={v} value={v}>
                  {v} / 5
                </option>
              ))}
            </select>
          </Field>
          <Field title={"Evidence for " + g.title}>
            <Textarea
              value={ratings[g.id]?.evidence ?? ""}
              required
              minLength={5}
              maxLength={1000}
              disabled={busy}
              onChange={(e) =>
                setRatings((v) => ({ ...v, [g.id]: { rating: v[g.id]?.rating ?? 3, evidence: e.target.value } }))
              }
            />
          </Field>
        </fieldset>
      ))}
      <Field title="Submission reason">
        <Textarea
          required
          minLength={5}
          maxLength={500}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} className="text-primary-foreground!">
          Submit assessment
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
export function PerformanceParticipation({
  workspace: w,
  personalOnly = false,
}: {
  workspace: Pick<HrPerformanceWorkspace, "company_id" | "cycle_id" | "employees">;
  personalOnly?: boolean;
}) {
  const { api, csrfToken } = useSession(),
    client = new HrApiClient(api);
  const [mode, setMode] = useState<"mine" | "staff">(personalOnly ? "mine" : "staff"),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState<Item | null>(null),
    [employee, setEmployee] = useState(""),
    [contributor, setContributor] = useState(""),
    [kind, setKind] = useState<"self" | "peer">("self"),
    [reason, setReason] = useState(""),
    [decision, setDecision] = useState<{ action: "withdraw" | "acknowledge"; id: string; version: number } | null>(
      null,
    );
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const result = useAttendanceRead<HrPerformanceParticipation>(
      w.cycle_id ? `${w.company_id}:${w.cycle_id}:${mode}:${revision}` : null,
      () => client.performanceParticipation({ company_id: w.company_id, cycle_id: w.cycle_id!, mode }),
    ),
    data = result.data;
  async function act(input: HrPerformanceParticipationAction) {
    if (guard.current) return;
    const parsed = hrPerformanceParticipationActionSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const r = await client.actOnPerformanceParticipation(input, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice("Contribution " + r.status);
      setEditing(null);
      setDecision(null);
      setReason("");
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The contribution could not be saved.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (!w.cycle_id) return null;
  const common = { company_id: w.company_id, cycle_id: w.cycle_id };
  return (
    <section className={panel + " space-y-4"} aria-label="Employee appraisals and peer feedback">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Employee appraisals & peer feedback</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite contributors before submitting the manager review. Employees submit using their own linked account.
          </p>
        </div>
        <div className={personalOnly ? "hidden" : "flex flex-wrap gap-2"}>
          <Button
            variant={mode === "staff" ? "default" : "outline"}
            className={mode === "staff" ? "text-primary-foreground!" : ""}
            disabled={busy || !!editing || !!decision}
            onClick={() => setMode("staff")}
          >
            Team evidence
          </Button>
          <Button
            variant={mode === "mine" ? "default" : "outline"}
            className={mode === "mine" ? "text-primary-foreground!" : ""}
            disabled={busy || !!editing || !!decision}
            onClick={() => setMode("mine")}
          >
            My contributions
          </Button>
        </div>
      </div>
      {(error || result.error) && (
        <p role="alert" className="break-words text-sm text-destructive">
          {error || result.error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {result.loading && <p role="status">Loading contribution evidence…</p>}
      {data?.can_invite && (
        <form
          className="space-y-3 rounded-lg border border-border p-3"
          aria-label="Invite Performance contributor"
          onSubmit={(e) => {
            e.preventDefault();
            act({
              ...common,
              action: "invite",
              employee_id: employee,
              contributor_employee_id: kind === "self" ? employee : contributor,
              kind,
              reason,
            });
          }}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <Field title="Assessed employee">
              <select
                className={selectClass}
                value={employee}
                disabled={busy}
                required
                onChange={(e) => setEmployee(e.target.value)}
              >
                <option value="">Choose employee</option>
                {w.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Contribution type">
              <select
                className={selectClass}
                value={kind}
                disabled={busy}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="self">Employee self appraisal</option>
                <option value="peer">Peer feedback</option>
              </select>
            </Field>
            {kind === "peer" && (
              <Field title="Invited peer">
                <select
                  className={selectClass}
                  value={contributor}
                  required
                  disabled={busy}
                  onChange={(e) => setContributor(e.target.value)}
                >
                  <option value="">Choose peer</option>
                  {w.employees
                    .filter((e) => e.id !== employee)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
          <Field title="Invitation reason">
            <Textarea
              value={reason}
              required
              minLength={5}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy} className="text-primary-foreground!">
            Invite contributor
          </Button>
        </form>
      )}
      {!result.loading && !data?.items.length && (
        <p className="text-sm text-muted-foreground">
          No contributions in this view. Self appraisals and peer feedback appear after invitation.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {data?.items.map((i) => (
          <article key={i.id} className="min-w-0 space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <h4 className="break-words font-medium">
                {i.employee_name} · {i.kind === "self" ? "Self appraisal" : "Peer feedback"}
              </h4>
              <span className="text-sm text-muted-foreground">{i.state}</span>
            </div>
            <p className="break-words text-sm text-muted-foreground">
              Contributor: {i.contributor_name} · version {i.version}
            </p>
            {i.summary && <p className="whitespace-pre-wrap break-words text-sm">{i.summary}</p>}
            {i.ratings.map((r) => (
              <p key={r.goal_id} className="break-words text-sm">
                <strong>
                  {i.goals.find((g) => g.id === r.goal_id)?.title ?? r.goal_id}: {r.rating}/5
                </strong>{" "}
                · {r.evidence}
              </p>
            ))}
            {i.state === "invited" && !i.can_submit && (
              <p className="text-xs text-muted-foreground">
                The invited employee can submit after all goal weights are approved and total 100%.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {i.can_submit && (
                <Button variant="outline" disabled={busy || !!editing || !!decision} onClick={() => setEditing(i)}>
                  Write assessment
                </Button>
              )}
              {i.can_withdraw && (
                <Button
                  variant="outline"
                  disabled={busy || !!editing || !!decision}
                  onClick={() => {
                    setDecision({ action: "withdraw", id: i.id, version: i.version });
                    setReason("");
                  }}
                >
                  Withdraw invitation
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <ContributionForm
          key={editing.id}
          item={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={(summary, ratings, why) =>
            act({
              ...common,
              action: "submit",
              id: editing.id,
              expected_version: editing.version,
              goals_hash: editing.goals_hash,
              summary,
              ratings,
              reason: why,
            })
          }
        />
      )}
      {!!data?.reviews.length && (
        <div className="space-y-3">
          <h4 className="font-semibold">Published reviews & acknowledgement</h4>
          {data.reviews.map((r) => (
            <article key={r.id} className="space-y-2 rounded-lg border border-border p-3">
              <p className="break-words font-medium">
                {r.employee_name} · {r.score}/5 · {r.band}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{r.summary}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Strengths</dt>
                  <dd className="whitespace-pre-wrap break-words">{r.strengths}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Development needs</dt>
                  <dd className="whitespace-pre-wrap break-words">{r.development}</dd>
                </div>
              </dl>
              {r.ratings.map((rating, index) => (
                <p key={index} className="break-words text-sm">
                  <strong>
                    {rating.title}: {rating.rating}/5
                  </strong>{" "}
                  · {rating.evidence}
                </p>
              ))}
              <p className="text-sm text-muted-foreground">
                {r.acknowledged_at
                  ? "Acknowledged " + new Date(r.acknowledged_at).toLocaleString()
                  : "Employee acknowledgement pending"}
              </p>
              {r.acknowledgement && <p className="whitespace-pre-wrap break-words text-sm">{r.acknowledgement}</p>}
              {r.can_acknowledge && (
                <Button
                  variant="outline"
                  disabled={busy || !!editing || !!decision}
                  onClick={() => {
                    setDecision({ action: "acknowledge", id: r.id, version: r.version });
                    setReason("");
                  }}
                >
                  Acknowledge review
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      {decision && (
        <form
          className="space-y-3 rounded-lg border border-border p-3"
          aria-label="Contribution decision"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              decision.action === "withdraw"
                ? { ...common, action: "withdraw", id: decision.id, expected_version: decision.version, reason }
                : {
                    ...common,
                    action: "acknowledge",
                    review_id: decision.id,
                    expected_version: decision.version,
                    reason,
                  },
            );
          }}
        >
          <p className="text-sm">
            {decision.action === "acknowledge"
              ? "Acknowledgement records receipt of the published assessment, including any disagreement in your comment. It does not alter the rating."
              : "Withdraw this outstanding invitation with a recorded reason."}
          </p>
          <Field title="Comment / reason">
            <Textarea
              required
              minLength={5}
              maxLength={500}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="text-primary-foreground!" disabled={busy}>
              Confirm {decision.action}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {data?.truncated && (
        <p role="status" className="text-sm">
          The first 200 contributions and reviews are shown. Contact HR for a governed export of larger cycles.
        </p>
      )}
    </section>
  );
}

export function PersonalPerformanceInbox() {
  const { api } = useSession(),
    client = new HrApiClient(api),
    [selected, setSelected] = useState("");
  const result = useAttendanceRead("personal-performance-inbox", () => client.performanceInbox()),
    rows = result.data?.items ?? [],
    choice = rows.find((r) => r.cycle_id === selected) ?? rows[0];
  return (
    <div className="min-w-0 space-y-4">
      <section className={panel + " space-y-3"}>
        <h2 className="text-xl font-semibold">My Performance reviews</h2>
        <p className="text-sm text-muted-foreground">
          Your own appraisals, assigned peer feedback and published review acknowledgements.
        </p>
        {result.error && (
          <p role="alert" className="text-destructive">
            {result.error}
          </p>
        )}
        {result.loading && <p role="status">Loading your invitations…</p>}
        {!result.loading && !rows.length && (
          <p className="text-sm">
            No appraisal invitations or published reviews are assigned to your employee account.
          </p>
        )}
        {!!rows.length && (
          <Field title="Company and review cycle">
            <select
              className={selectClass}
              value={choice?.cycle_id ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {rows.map((r) => (
                <option key={r.cycle_id} value={r.cycle_id}>
                  {r.company_name} · {r.cycle_title} · {r.state}
                </option>
              ))}
            </select>
          </Field>
        )}
        {result.data?.truncated && <p className="text-sm">The first 100 assigned cycles are shown.</p>}
      </section>
      {choice && (
        <PerformanceParticipation
          key={choice.cycle_id}
          personalOnly
          workspace={{ company_id: choice.company_id, cycle_id: choice.cycle_id, employees: [] }}
        />
      )}
    </div>
  );
}
