"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { HrEmployeeDraftDetail } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type LoadState = "loading" | "ready" | "unavailable";

export function HrEmployeeDraftsWorkspace({
  onAction,
  fallback,
}: {
  onAction: (action: string, subject?: string) => void;
  fallback: ReactNode;
}) {
  const { api, csrfToken, session } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [drafts, setDrafts] = useState<Awaited<ReturnType<HrApiClient["employeeDrafts"]>>["items"]>([]);
  const [selected, setSelected] = useState<HrEmployeeDraftDetail | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [submitReason, setSubmitReason] = useState("");
  const [state, setState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("ready");
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canRead = session?.user.permissions.includes("hr.employee.read") ?? false;
  const canSubmit = session?.user.permissions.includes("hr.employee.submit") ?? false;

  const reload = () => {
    if (!canRead) {
      setState("unavailable");
      return;
    }
    setState("loading");
    setError("");
    client
      .companies()
      .then((result) => {
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
      })
      .catch(() => setState("unavailable"));
  };

  useEffect(() => {
    reload();
    // The authenticated client changes only after an intentional session change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, client]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    setState("loading");
    client
      .employeeDrafts({ companyId, search: appliedSearch || undefined, limit: 50 })
      .then((result) => {
        if (!active) return;
        setDrafts(result.items);
        setSelected((current) => (current && result.items.some((item) => item.id === current.id) ? current : null));
        setState("ready");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });
    return () => {
      active = false;
    };
  }, [appliedSearch, client, companyId, refreshKey]);

  const openDraft = (employeeId: string) => {
    setDetailState("loading");
    setError("");
    client
      .employeeDraft(employeeId)
      .then((detail) => {
        setSelected(detail);
        setSubmitReason("");
        setDetailState("ready");
      })
      .catch(() => {
        setSelected(null);
        setDetailState("unavailable");
      });
  };

  const submitDraft = async () => {
    if (!selected || !submitReason.trim()) {
      setError("A submission reason is required for approval evidence.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await client.submitEmployeeDraft(
        selected.id,
        { reason: submitReason.trim() },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice(`${result.employee_number} was submitted for HR approval and remains inactive.`);
      setSelected(null);
      setSubmitReason("");
      setRefreshKey((current) => current + 1);
      onAction("Employee draft submitted", result.employee_number);
    } catch {
      setError(
        "The draft could not be submitted. It may have changed or your session may no longer permit this action.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "unavailable") {
    return (
      <>
        <Alert>
          <AlertTitle>Live employee drafts are unavailable</AlertTitle>
          <AlertDescription>
            The existing prototype screen remains available until the API deployment and HR access are verified.
          </AlertDescription>
        </Alert>
        {fallback}
      </>
    );
  }

  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee drafts">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <label className="grid min-w-55 flex-1 gap-1.5 text-sm font-medium text-foreground">
          Company
          <select
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            disabled={state === "loading" || companies.length === 0}
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        <form
          className="flex min-w-65 flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
          }}
        >
          <label className="grid flex-1 gap-1.5 text-sm font-medium text-foreground">
            Search draft
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or employee number"
            />
          </label>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button type="button" variant="outline" onClick={reload}>
          Refresh
        </Button>
      </div>

      {notice ? (
        <Alert>
          <AlertTitle>Draft submitted</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Action unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {state === "loading" ? (
        <div className="grid gap-2 rounded-lg border border-border bg-card p-4" aria-live="polite">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]">
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full min-w-180 text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr className="border-b border-border/70 last:border-0" key={draft.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{draft.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {draft.employee_number}
                        {draft.work_email ? ` · ${draft.work_email}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{draft.joined_on}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(draft.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openDraft(draft.id)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
                {drafts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                      No employee drafts match this company and search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <aside className="rounded-lg border border-border bg-card p-4 shadow-sm">
            {detailState === "loading" ? (
              <div className="grid gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : null}
            {detailState === "unavailable" ? (
              <Alert variant="destructive">
                <AlertTitle>Draft unavailable</AlertTitle>
                <AlertDescription>The selected draft could not be loaded in your current scope.</AlertDescription>
              </Alert>
            ) : null}
            {!selected && detailState === "ready" ? (
              <p className="text-sm text-muted-foreground">
                Select a draft to review its permitted profile fields and submit it for approval.
              </p>
            ) : null}
            {selected ? (
              <div className="grid gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold text-foreground">{selected.display_name}</h2>
                    <Badge variant="secondary">Draft</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selected.employee_number} · Joined {selected.joined_on}
                  </p>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Work email</dt>
                    <dd className="font-medium text-foreground">{selected.work_email || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-medium text-foreground">{selected.phone || "Not provided"}</dd>
                  </div>
                </dl>
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Submission reason
                  <Textarea
                    disabled={!canSubmit || submitting}
                    value={submitReason}
                    onChange={(event) => setSubmitReason(event.target.value)}
                    maxLength={1000}
                    placeholder="Explain why this profile is ready for approval."
                  />
                </label>
                {canSubmit ? (
                  <Button type="button" disabled={submitting} onClick={submitDraft}>
                    {submitting ? "Submitting…" : "Submit for approval"}
                  </Button>
                ) : (
                  <Alert>
                    <AlertTitle>Submission permission required</AlertTitle>
                    <AlertDescription>
                      Your session can view this draft but cannot submit it for approval.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
