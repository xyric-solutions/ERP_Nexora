"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ApiError } from "../../lib/api/generated";
import { useSession } from "../../lib/session/session-provider";

type Row = Record<string, unknown>;

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "The impersonation operation was rejected.";
}

export default function ImpersonationPanel({ permissions }: { permissions: ReadonlySet<string> }) {
  const { api, csrfToken, session, refresh } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(15);

  const actorId = session?.impersonation?.real_user.id ?? session?.user.id ?? "";
  const fullAdmin = permissions.has("security.authorization.administer");
  const can = useCallback((permission: string) => fullAdmin || permissions.has(permission), [fullAdmin, permissions]);

  const load = useCallback(async () => {
    if (!can("security.impersonation.read") || session?.impersonation) return;
    setLoading(true);
    setMessage("");
    try {
      const [requests, userPage] = await Promise.all([
        api.listSecurityImpersonations("?limit=100"),
        api.listSecurityUsers("?status=active&archived=false&limit=100"),
      ]);
      setRows(requests.items);
      const eligible = userPage.items.filter((user) => user.id !== actorId);
      setUsers(eligible);
      setTargetUserId((current) => current || String(eligible[0]?.id ?? ""));
    } catch (error) {
      setRows([]);
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [actorId, api, can, session?.impersonation]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!targetUserId || !purpose.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.createSecurityImpersonation(
        { target_user_id: targetUserId, purpose: purpose.trim(), duration_minutes: durationMinutes },
        csrfToken(),
        `web-impersonation-create-${crypto.randomUUID()}`,
      );
      setShowCreate(false);
      setPurpose("");
      await load();
      setMessage("Impersonation draft created. Normal use requires independent approval.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function transition(
    row: Row,
    action: "submit" | "approve" | "reject" | "activate" | "emergency_activate",
  ) {
    setBusy(true);
    setMessage("");
    try {
      const requestId = String(row.request_id);
      const expectedVersion = Number(row.row_version);
      const payload =
        action === "reject"
          ? { action, request_id: requestId, expected_version: expectedVersion, reason: "Impersonation request rejected" }
          : { action, request_id: requestId, expected_version: expectedVersion };
      await api.actOnSecurityImpersonation(
        payload,
        csrfToken(),
        `web-impersonation-${action}-${crypto.randomUUID()}`,
      );
      if (action === "activate" || action === "emergency_activate") {
        await refresh();
      } else {
        await load();
        setMessage(`Impersonation ${action} recorded and audited.`);
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!can("security.impersonation.read")) {
    return (
      <section className="border-t border-border p-5">
        <p className="text-sm text-muted-foreground">You do not have permission to view impersonation requests.</p>
      </section>
    );
  }

  return (
    <section className="border-t border-border" aria-labelledby="impersonation-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 id="impersonation-heading" className="font-semibold">Impersonation</h3>
          <p className="text-sm text-muted-foreground">Short-lived support access with real/effective identity evidence and read-only operational scope.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={loading || busy} onClick={() => void load()}>Refresh</Button>
          {can("security.impersonation.create") ? (
            <Button type="button" disabled={busy} onClick={() => setShowCreate((value) => !value)}>{showCreate ? "Close" : "Request impersonation"}</Button>
          ) : null}
        </div>
      </div>
      {message ? <Alert className="m-5" role="status"><AlertDescription>{message}</AlertDescription></Alert> : null}
      {showCreate ? (
        <form className="grid gap-4 border-b border-border bg-muted/40 p-5 md:grid-cols-2" onSubmit={create}>
          <Label className="grid gap-2 text-sm">
            Target user
            <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} required>
              <option value="">Select an active user</option>
              {users.map((user) => <option key={String(user.id)} value={String(user.id)}>{String(user.display_name)} · {String(user.email)}</option>)}
            </select>
          </Label>
          <Label className="grid gap-2 text-sm">
            Duration
            <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
              {[5, 10, 15, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
          </Label>
          <Label className="grid gap-2 text-sm md:col-span-2">Purpose<Input value={purpose} onChange={(event) => setPurpose(event.target.value)} required maxLength={512} /></Label>
          <div className="md:col-span-2"><Button type="submit" disabled={busy}>Create draft</Button></div>
        </form>
      ) : null}
      {loading ? <p className="p-9 text-center text-sm text-muted-foreground">Loading governed impersonation…</p> : rows.length === 0 ? <p className="p-9 text-center text-sm text-muted-foreground">No impersonation requests are available.</p> : (
        <div className="grid gap-3 p-5">
          {rows.map((row) => {
            const state = String(row.effective_state);
            const owns = row.actor_id === actorId;
            return (
              <article key={String(row.request_id)} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-medium">{String(row.actor_id)} → {String(row.target_user_id)}</p><p className="mt-1 text-sm text-muted-foreground">{String(row.purpose)} · {String(row.duration_minutes)} minutes</p></div>
                  <div className="flex gap-2"><Badge variant="outline">{state}</Badge>{row.emergency_activation ? <Badge variant="destructive">Emergency</Badge> : null}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {state === "draft" && owns && can("security.impersonation.submit") ? <Button type="button" size="sm" disabled={busy} onClick={() => void transition(row, "submit")}>Submit</Button> : null}
                  {state === "submitted" && !owns && can("security.impersonation.approve") ? <><Button type="button" size="sm" disabled={busy} onClick={() => void transition(row, "approve")}>Approve</Button><Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void transition(row, "reject")}>Reject</Button></> : null}
                  {state === "approved" && owns && can("security.impersonation.activate") ? <Button type="button" size="sm" disabled={busy} onClick={() => void transition(row, "activate")}>Start session</Button> : null}
                  {(state === "draft" || state === "submitted") && owns && can("security.impersonation.emergency_activate") ? <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void transition(row, "emergency_activate")}>Emergency start</Button> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
