"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import {
  hrPolicyUpgradeActionSchema,
  type HrPolicyUpgradeAction,
  type HrPolicyUpgradeWorkspace,
} from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import { Field, panel, selectClass, State, useAttendanceRead, localDate } from "../components/hr-workspace-controls";
type RecordItem = HrPolicyUpgradeWorkspace["items"][number];
export function HrEmploymentPolicyUpgrades({
  companyId,
  policyRevision,
}: {
  companyId: string;
  policyRevision: number;
}) {
  const { api, session, csrfToken } = useSession(),
    client = new HrApiClient(api),
    canRead =
      session?.user.permissions.includes("hr.employment_history.read") &&
      session?.user.permissions.includes("hr.employment_lifecycle_policy.read");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [relationship, setRelationship] = useState(""),
    [target, setTarget] = useState(""),
    [date, setDate] = useState(localDate),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [requesting, setRequesting] = useState(false),
    [decision, setDecision] = useState<{ record: RecordItem; action: "approve" | "reject" | "cancel" } | null>(null),
    [opened, setOpened] = useState("");
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null),
    query = { company_id: companyId, search: filter, limit: 25, offset },
    result = useAttendanceRead(canRead && companyId ? JSON.stringify([query, revision, policyRevision]) : null, () =>
      client.policyUpgradeWorkspace(query),
    ),
    w = result.data,
    r = w?.items.find((i) => i.id === opened),
    selected = w?.relationships.find((i) => i.id === relationship),
    targetPolicy = w?.policies.find((i) => i.id === target);
  async function command(input: HrPolicyUpgradeAction) {
    if (guard.current) return;
    const parsed = hrPolicyUpgradeActionSchema.safeParse(input);
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
      const record = await client.actOnPolicyUpgrade(input, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice("Employment policy upgrade " + record.status);
      setDecision(null);
      setRequesting(false);
      setReason("");
      setOpened(record.id);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The policy upgrade could not be completed.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (!canRead)
    return (
      <section className={panel + " text-sm"}>
        Employment history and Lifecycle Policy read permissions are required to review employee policy upgrades.
      </section>
    );
  return (
    <section className={panel + " min-w-0 space-y-4"} aria-label="Employment policy upgrades" data-policy-upgrades>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Upgrade existing employees’ policies</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Apply a newer approved policy to an employee’s subsequent confirmation and exit actions. Independent
            approval retains the employee’s state, original Hire policy and earlier employment history.
          </p>
        </div>
        {w?.can_request && (
          <Button
            className="text-primary-foreground!"
            disabled={busy || requesting || !!decision}
            onClick={() => {
              setRequesting(true);
              setReason("");
              setError("");
            }}
          >
            Request policy upgrade
          </Button>
        )}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter(search);
          setOffset(0);
          setOpened("");
        }}
      >
        <div className="min-w-0 flex-1 basis-48">
          <Field title="Search policy upgrades and employees">
            <Input
              value={search}
              maxLength={120}
              disabled={busy || requesting || !!decision}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Employee, relationship, policy or status"
            />
          </Field>
        </div>
        <Button type="submit" variant="outline" disabled={busy || requesting || !!decision}>
          Search upgrades
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || requesting || !!decision}
          onClick={() => setRevision((v) => v + 1)}
        >
          Refresh upgrades
        </Button>
      </form>
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
      {result.loading && <p role="status">Loading authorized policy upgrades…</p>}
      {w?.truncated && (
        <p role="status" className="text-sm text-muted-foreground">
          Selectors show up to 200 matches and the latest 200 approved policies. Search by employee or relationship to
          narrow the employment options.
        </p>
      )}
      {requesting && w && (
        <form
          className="space-y-4 rounded-lg border border-border p-4"
          aria-label="Employment policy upgrade request"
          onSubmit={(e) => {
            e.preventDefault();
            command({
              action: "request",
              company_id: companyId,
              relationship_id: relationship,
              target_policy_id: target,
              effective_on: date,
              reason,
            });
          }}
        >
          <h3 className="font-semibold">Prepare upgrade for independent review</h3>
          <Field title="Employee employment relationship">
            <select
              className={selectClass}
              value={relationship}
              required
              disabled={busy}
              onChange={(e) => {
                setRelationship(e.target.value);
                setTarget("");
              }}
            >
              <option value="">Choose active approved employment</option>
              {w.relationships.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          {selected && (
            <p className="break-words text-sm">
              Current policy: <strong>{selected.effective_policy}</strong> · retained state:{" "}
              <strong>{selected.current_state}</strong>
            </p>
          )}
          <Field title="Replacement approved policy">
            <select
              className={selectClass}
              value={target}
              required
              disabled={busy || !relationship}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose a different approved policy</option>
              {w.policies
                .filter((p) => p.id !== selected?.effective_policy_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
            </select>
          </Field>
          <p className="text-sm text-muted-foreground">
            Create and independently approve the replacement policy above. It can remain Approved; the upgrade
            authorizes it for this employment relationship. Matching employment state codes and governed exit
            transitions are required.
          </p>
          <Field title="Upgrade effective date">
            <Input
              type="date"
              required
              value={date}
              max={localDate()}
              min={targetPolicy?.effective_from}
              disabled={busy}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field title="Policy upgrade reason">
            <Textarea
              value={reason}
              required
              minLength={10}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="text-primary-foreground!" disabled={busy}>
              Submit upgrade request
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRequesting(false)}>
              Cancel preparation
            </Button>
          </div>
        </form>
      )}
      {w && (
        <>
          <div className="relative max-w-full overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <caption className="sr-only">Employment policy upgrades and independent decisions</caption>
              <thead className="border-b text-muted-foreground">
                <tr>
                  {["Employee", "Policy change", "Effective", "State", "Actions"].map((t) => (
                    <th key={t} scope="col" className="px-3 py-3 font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {w.items.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="max-w-56 break-words px-3 py-4 font-medium">{i.employee_name}</td>
                    <td className="max-w-64 break-words px-3 py-4">
                      {i.source_policy} → {i.target_policy}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {i.from_state} → {i.target_state}
                      </p>
                    </td>
                    <td className="px-3 py-4">{i.effective_on}</td>
                    <td className="px-3 py-4">
                      <State value={i.state} />
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpened(i.id)}>
                          Review upgrade
                        </Button>
                        {i.allowed_actions.map((action) => (
                          <Button
                            key={action}
                            size="sm"
                            variant="outline"
                            disabled={busy || requesting || !!decision}
                            onClick={() => {
                              setDecision({ record: i, action: action as "approve" | "reject" | "cancel" });
                              setReason("");
                              setError("");
                            }}
                          >
                            {action === "approve"
                              ? "Approve upgrade"
                              : action === "reject"
                                ? "Reject upgrade"
                                : "Cancel request"}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!w.items.length && (
            <p className="text-sm text-muted-foreground">
              No matching upgrades. Existing employment continues under its current approved policy.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {w.total ? offset + 1 : 0}–{Math.min(offset + 25, w.total)} of {w.total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0 || busy || requesting || !!decision}
                onClick={() => setOffset((v) => Math.max(0, v - 25))}
              >
                Previous upgrades
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + 25 >= w.total || busy || requesting || !!decision}
                onClick={() => setOffset((v) => v + 25)}
              >
                Next upgrades
              </Button>
            </div>
          </div>
        </>
      )}
      {decision && (
        <form
          className="space-y-4 rounded-lg border border-border p-4"
          aria-label="Policy upgrade decision"
          onSubmit={(e) => {
            e.preventDefault();
            command({
              action: decision.action,
              company_id: companyId,
              id: decision.record.id,
              expected_version: decision.record.version,
              reason,
            });
          }}
        >
          <h3 className="font-semibold">
            {decision.action === "approve"
              ? "Approve policy upgrade"
              : decision.action === "reject"
                ? "Reject policy upgrade"
                : "Cancel pending request"}
          </h3>
          <p className="break-words text-sm">
            {decision.record.employee_name}: {decision.record.source_policy} → {decision.record.target_policy},
            effective {decision.record.effective_on}.
          </p>
          <p className="text-sm text-muted-foreground">
            Review the original request, retained state and affected cases below. The server rechecks the current
            employment and policy evidence before approval.
          </p>
          <Field title="Upgrade decision reason">
            <Textarea
              value={reason}
              required
              minLength={10}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="text-primary-foreground!" disabled={busy}>
              Confirm upgrade decision
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
              Close decision
            </Button>
          </div>
          <UpgradeDetail record={decision.record} />
        </form>
      )}
      {r && !decision && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Policy upgrade evidence</h3>
            <Button size="sm" variant="outline" onClick={() => setOpened("")}>
              Close upgrade detail
            </Button>
          </div>
          <UpgradeDetail record={r} />
        </div>
      )}
    </section>
  );
}
function UpgradeDetail({ record: r }: { record: RecordItem }) {
  const affected = Array.isArray(r.snapshot.affected_cases) ? r.snapshot.affected_cases : [],
    source =
      r.snapshot.source_event && typeof r.snapshot.source_event === "object"
        ? (r.snapshot.source_event as Record<string, unknown>)
        : {};
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ["Employee", r.employee_name],
          ["Effective policy", r.source_policy + " → " + r.target_policy],
          ["Retained employment state", r.from_state + " → " + r.target_state],
          ["Effective date", r.effective_on],
          ["Requested by", r.requested_by],
          ["Decision by", r.decided_by ?? "Pending"],
          ["Request reason", r.reason],
          ["Decision reason", r.decision_reason || "Pending"],
          ["Latest employment event", String(source.event_type ?? "") + " · " + String(source.effective_on ?? "")],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="whitespace-pre-wrap break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="font-medium">Open cases reviewed: {affected.length}</p>
      {affected.map((row, index) => {
        const item = row as Record<string, unknown>;
        return (
          <p key={index} className="break-words text-muted-foreground">
            {String(item.kind)} · {String(item.state)} · version {String(item.version)}
          </p>
        );
      })}
      <p className="break-all text-xs text-muted-foreground">
        Upgrade {r.id} · version {r.version} · {new Date(r.created_at).toLocaleString()}
      </p>
    </div>
  );
}
