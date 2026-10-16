"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SecuritySessionPolicyValues } from "@nexora/contracts";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ApiError } from "../../lib/api/generated";
import { useSession } from "../../lib/session/session-provider";

type Row = Record<string, unknown>;
const defaults: SecuritySessionPolicyValues = {
  password_minimum_length: 12,
  password_require_uppercase: true,
  password_require_lowercase: true,
  password_require_number: true,
  password_require_symbol: true,
  session_idle_minutes: 30,
  session_absolute_hours: 8,
  concurrent_session_limit: 3,
  login_maximum_failures: 5,
  login_window_minutes: 15,
  login_block_minutes: 15,
  delegation_maximum_days: 30,
  impersonation_maximum_minutes: 30,
};
const numeric = [
  ["password_minimum_length", "Minimum password length"],
  ["session_idle_minutes", "Idle timeout (minutes)"],
  ["session_absolute_hours", "Absolute timeout (hours)"],
  ["concurrent_session_limit", "Concurrent sessions"],
  ["login_maximum_failures", "Login failures before block"],
  ["login_window_minutes", "Failure window (minutes)"],
  ["login_block_minutes", "Block duration (minutes)"],
  ["delegation_maximum_days", "Delegation maximum (days)"],
  ["impersonation_maximum_minutes", "Impersonation maximum (minutes)"],
] as const;

export default function SessionPolicyPanel({ permissions }: { permissions: ReadonlySet<string> }) {
  const { api, csrfToken, session } = useSession();
  const fullAdmin = permissions.has("security.authorization.administer");
  const canRead = fullAdmin || permissions.has("security.session_policy.read");
  const [rows, setRows] = useState<Row[]>([]);
  const [values, setValues] = useState(defaults);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const page = await api.listSecuritySessionPolicies();
      setRows(page.items);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Security policies are unavailable.");
    } finally {
      setLoading(false);
    }
  }, [api, canRead]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!summary.trim() || busy) return;
    setBusy(true);
    try {
      await api.createSecuritySessionPolicy(
        { values, change_summary: summary.trim() },
        csrfToken(),
        `web-session-policy-create-${crypto.randomUUID()}`,
      );
      setShowCreate(false);
      setSummary("");
      await load();
      setMessage("Policy draft created. Submit it for independent approval.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Policy creation was rejected.");
    } finally {
      setBusy(false);
    }
  }
  async function transition(row: Row, action: "submit" | "approve" | "reject" | "activate") {
    setBusy(true);
    try {
      const identity = { policy_id: String(row.policy_id), expected_version: Number(row.row_version) };
      if (action === "reject")
        await api.actOnSecuritySessionPolicy(
          { ...identity, action: "reject", reason: "Policy rejected during independent review" },
          csrfToken(),
          `web-session-policy-${action}-${crypto.randomUUID()}`,
        );
      else
        await api.actOnSecuritySessionPolicy(
          { ...identity, action },
          csrfToken(),
          `web-session-policy-${action}-${crypto.randomUUID()}`,
        );
      await load();
      setMessage(`Policy ${action} recorded and audited.`);
      if (action === "activate")
        setMessage("Policy activated. Your session was revoked so the new controls apply; sign in again.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Policy transition was rejected.");
    } finally {
      setBusy(false);
    }
  }
  if (!canRead)
    return (
      <p className="p-9 text-center text-sm text-muted-foreground">
        You do not have permission to view security policies.
      </p>
    );
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Versioned tenant controls use independent approval and PostgreSQL-authoritative activation.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={loading || busy} onClick={() => void load()}>
            Refresh
          </Button>
          {fullAdmin || permissions.has("security.session_policy.create") ? (
            <Button disabled={busy} onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Close" : "Create draft"}
            </Button>
          ) : null}
        </div>
      </div>
      {message ? (
        <Alert className="m-5" role="status">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {showCreate ? (
        <form onSubmit={create} className="grid gap-4 border-b border-border p-5 sm:grid-cols-2">
          {numeric.map(([key, label]) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type="number"
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Password composition</legend>
            {(
              [
                "password_require_uppercase",
                "password_require_lowercase",
                "password_require_number",
                "password_require_symbol",
              ] as const
            ).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values[key]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))}
                />
                {key.replace("password_require_", "Require ")}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="policy-summary">Change summary</Label>
            <Input
              id="policy-summary"
              maxLength={512}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <Button className="sm:col-span-2" disabled={busy} type="submit">
            Create governed draft
          </Button>
        </form>
      ) : null}
      <div className="grid gap-3 p-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading policy history…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tenant policy is active. Safe platform defaults remain enforced.
          </p>
        ) : (
          rows.map((row) => {
            const state = String(row.lifecycle_state);
            const mine = String(row.created_by) === session?.user.id;
            return (
              <article key={String(row.policy_id)} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong>Version {String(row.policy_version)}</strong>{" "}
                    <Badge variant={state === "active" ? "default" : "secondary"}>{state}</Badge>
                    <p className="mt-1 text-sm text-muted-foreground">{String(row.change_summary)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {state === "draft" && (fullAdmin || permissions.has("security.session_policy.submit")) ? (
                      <Button
                        size="sm"
                        disabled={busy || (!fullAdmin && !mine)}
                        onClick={() => void transition(row, "submit")}
                      >
                        Submit
                      </Button>
                    ) : null}
                    {state === "submitted" && (fullAdmin || permissions.has("security.session_policy.approve")) ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busy || (!fullAdmin && mine)}
                          onClick={() => void transition(row, "approve")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || (!fullAdmin && mine)}
                          onClick={() => void transition(row, "reject")}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {state === "approved" && (fullAdmin || permissions.has("security.session_policy.activate")) ? (
                      <Button
                        size="sm"
                        disabled={busy || (!fullAdmin && mine)}
                        onClick={() => void transition(row, "activate")}
                      >
                        Activate
                      </Button>
                    ) : null}
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Password</dt>
                    <dd>{String(row.password_minimum_length)}+ characters</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Session</dt>
                    <dd>
                      {String(row.session_idle_minutes)}m idle / {String(row.session_absolute_hours)}h absolute /{" "}
                      {String(row.concurrent_session_limit)} concurrent
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Login block</dt>
                    <dd>
                      {String(row.login_maximum_failures)} failures / {String(row.login_block_minutes)}m
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
