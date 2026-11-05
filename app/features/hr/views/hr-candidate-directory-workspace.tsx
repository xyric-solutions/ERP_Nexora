"use client";
import { HrRecordDrawer } from "../components/hr-record-drawer";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrCandidateDirectory } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";

type Candidate = HrCandidateDirectory["items"][number];
type CandidateSource = Candidate["source"];
const sourceLabel: Record<CandidateSource, string> = {
  direct: "Direct",
  referral: "Referral",
  agency: "Agency",
  job_board: "Job board",
  other: "Other",
};

export function HrCandidateDirectoryWorkspace() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.employee.read");
  const canUpdate = permissions.includes("hr.employee.update");
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [records, setRecords] = useState<Candidate[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "">("active");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (company: string, nextSearch = search, nextStatus = status) => {
      if (!company) return;
      setLoading(true);
      try {
        const result = await client.candidates({
          companyId: company,
          search: nextSearch,
          status: nextStatus || undefined,
        });
        setRecords(result.items);
        setSelectedId((current) =>
          result.items.some((item) => item.id === current) ? current : (result.items[0]?.id ?? ""),
        );
      } catch {
        setMessage("Candidates could not be loaded from the authorized API. No prototype rows are shown.");
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [client, search, status],
  );

  useEffect(() => {
    if (sessionLoading || !canRead) {
      if (!sessionLoading) setLoading(false);
      return;
    }
    client
      .companies()
      .then((result) => {
        setCompanies(result.items);
        const first = result.items[0]?.id ?? "";
        setCompanyId(first);
        return load(first, "", "active");
      })
      .catch(() => {
        setMessage("Authorized companies could not be loaded.");
        setLoading(false);
      });
  }, [canRead, client, load, sessionLoading]);

  const selected = records.find((record) => record.id === selectedId);
  const updateStatus = async (next: "active" | "archived") => {
    if (!selected) return;
    setSaving(true);
    try {
      await client.changeCandidateStatus(
        selected.id,
        { company_id: companyId, status: next },
        csrfToken(),
        crypto.randomUUID(),
      );
      setMessage(`${selected.reference} is now ${next}.`);
      await load(companyId);
    } catch {
      setMessage("The candidate status could not be changed.");
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!session)
    return (
      <Alert>
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          Your session is not active.{" "}
          <Button size="sm" variant="outline" onClick={() => void refreshSession()}>
            Retry session
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Recruitment access required</AlertTitle>
        <AlertDescription>This screen requires HR employee read permission.</AlertDescription>
      </Alert>
    );
  return (
    <section className="grid min-w-0 gap-4" aria-label="Candidate Directory">
      <p className="m-0! text-sm text-muted-foreground">
        Find candidate profiles and maintain contact details and recruitment sources.
      </p>
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 border-border">
        <label className="grid min-w-0 basis-full sm:basis-48 flex-1 gap-1 text-sm">
          Company
          <select
            className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2"
            value={companyId}
            onChange={(event) => {
              const value = event.target.value;
              setCompanyId(value);
              void load(value);
            }}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 basis-full sm:basis-48 flex-1 gap-1 text-sm">
          Search
          <Input
            placeholder="Name, email or reference"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2"
            value={status}
            onChange={(event) => setStatus(event.target.value as "active" | "archived" | "")}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="">All records</option>
          </select>
        </label>
        <Button variant="outline" onClick={() => void load(companyId)}>
          Search
        </Button>
      </div>
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid min-w-0 gap-4 ">
          <div className="relative min-w-0 overflow-x-auto rounded-lg border bg-card border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Added</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className={`cursor-pointer border-t border-border hover:bg-muted/40 ${record.id === selectedId ? "bg-muted/30" : ""}`}
                    onClick={() => {
                      setSelectedId(record.id);
                      setDetailsOpen(true);
                    }}
                  >
                    <td className="px-4 py-3">
                      <Button
                        variant="link"
                        className="h-auto p-0 font-medium"
                        onClick={() => {
                          setSelectedId(record.id);
                          setDetailsOpen(true);
                        }}
                      >
                        {record.display_name}
                      </Button>
                      <div className="text-xs text-muted-foreground">{record.reference}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{record.email}</div>
                      {record.phone ? <div className="text-xs text-muted-foreground">{record.phone}</div> : null}
                    </td>
                    <td className="px-4 py-3">{sourceLabel[record.source]}</td>
                    <td className="px-4 py-3">
                      <span className={`nx-status nx-status-${record.status === "active" ? "active" : "inactive"}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{new Date(record.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {records.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>
                      No live candidate records match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <HrRecordDrawer
            title="Candidate details"
            open={detailsOpen}
            onClose={() => setDetailsOpen(false)}
            busy={saving}
            notice={message}
          >
            <aside className="rounded-lg border bg-card p-5 border-border">
              {selected ? (
                <div className="grid min-w-0 gap-4">
                  <div>
                    <span className="nx-eyebrow">{selected.reference}</span>
                    <h2 className="mt-1 text-xl font-semibold">{selected.display_name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.email}
                      {selected.phone ? ` · ${selected.phone}` : ""}
                    </p>
                  </div>
                  <dl className="grid gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Source</dt>
                      <dd className="font-medium">{sourceLabel[selected.source]}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="font-medium capitalize">{selected.status}</dd>
                    </div>
                  </dl>
                  {canUpdate ? (
                    <div>
                      {selected.status === "active" ? (
                        <Button variant="outline" disabled={saving} onClick={() => void updateStatus("archived")}>
                          Archive candidate
                        </Button>
                      ) : (
                        <Button disabled={saving} onClick={() => void updateStatus("active")}>
                          Reactivate candidate
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a candidate to view their live identity record.</p>
              )}
            </aside>
          </HrRecordDrawer>
        </div>
      )}
    </section>
  );
}
