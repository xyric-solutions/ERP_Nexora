"use client";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrJobOpeningDirectory } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
type Opening = HrJobOpeningDirectory["items"][number];
export function HrJobOpeningsWorkspace() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    permissions = session?.user.permissions ?? [],
    canRead = permissions.includes("hr.employee.read"),
    canCreate = permissions.includes("hr.employee.create"),
    canUpdate = permissions.includes("hr.employee.update");
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]),
    [companyId, setCompanyId] = useState(""),
    [items, setItems] = useState<Opening[]>([]),
    [approved, setApproved] = useState<Awaited<ReturnType<HrApiClient["manpowerRequisitions"]>>["items"]>([]),
    [selectedId, setSelectedId] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [editor, setEditor] = useState(false),
    [title, setTitle] = useState(""),
    [requisitionId, setRequisitionId] = useState(""),
    [headcount, setHeadcount] = useState("1"),
    [channels, setChannels] = useState("Company website"),
    [closingOn, setClosingOn] = useState("");
  const load = useCallback(
    async (company: string) => {
      if (!company) return;
      setLoading(true);
      try {
        const [openings, requisitions] = await Promise.all([
          client.jobOpenings({ companyId: company }),
          client.manpowerRequisitions({ companyId: company, state: "approved" }),
        ]);
        setItems(openings.items);
        setApproved(requisitions.items);
        setSelectedId((current) =>
          openings.items.some((item) => item.id === current) ? current : (openings.items[0]?.id ?? ""),
        );
      } catch {
        setMessage("Job openings could not be loaded from the authorized API. No prototype rows are shown.");
      } finally {
        setLoading(false);
      }
    },
    [client],
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
        return load(first);
      })
      .catch(() => {
        setMessage("Authorized companies could not be loaded.");
        setLoading(false);
      });
  }, [canRead, client, load, sessionLoading]);
  const selected = items.find((item) => item.id === selectedId);
  const save = async () => {
    if (saving) return;
    const count = Number(headcount);
    if (!requisitionId || !title.trim() || !Number.isInteger(count) || count < 1) {
      setMessage("Select an approved requisition and provide a title and valid headcount.");
      return;
    }
    setSaving(true);
    try {
      const result = await client.createJobOpening(
        {
          company_id: companyId,
          requisition_id: requisitionId,
          title: title.trim(),
          positions_requested: count,
          channels: channels
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          ...(closingOn ? { closing_on: closingOn } : {}),
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setMessage(`${result.reference} was created as an open job opening.`);
      setEditor(false);
      setSelectedId(result.id);
      await load(companyId);
    } catch {
      setMessage("The opening was rejected. An approved requisition with enough unused headcount is required.");
    } finally {
      setSaving(false);
    }
  };
  const change = async (state: "open" | "on_hold" | "closed" | "cancelled") => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await client.changeJobOpeningState(
        selected.id,
        {
          company_id: companyId,
          state,
          reason:
            state === "on_hold"
              ? "Placed on hold for review."
              : state === "closed"
                ? "Recruitment closed."
                : state === "cancelled"
                  ? "Opening cancelled."
                  : "Reopened for recruitment.",
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setMessage(`${selected.reference} is now ${state.replaceAll("_", " ")}.`);
      await load(companyId);
    } catch {
      setMessage("The opening state could not be changed.");
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
    <section className="grid min-w-0 gap-4" aria-label="Job Openings">
      <p className="m-0! text-sm text-muted-foreground">
        Open vacancies against approved requisitions and track available headcount.
      </p>
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 border-border">
        <label className="grid min-w-0 basis-full sm:basis-48 flex-1 gap-1 text-sm font-medium">
          Company
          <select
            className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2"
            value={companyId}
            onChange={(event) => {
              setCompanyId(event.target.value);
              void load(event.target.value);
            }}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={() => void load(companyId)}>
          Refresh
        </Button>
        {canCreate ? (
          <Button
            onClick={() => {
              setEditor(true);
              setRequisitionId(approved[0]?.id ?? "");
            }}
          >
            + Create opening
          </Button>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <div className="grid min-w-0 items-start gap-4 ">
          <div className="relative min-w-0 overflow-x-auto rounded-lg border bg-card border-border">
            <table className="w-full min-w-190 text-sm">
              <thead className="border-b bg-muted/60 border-border">
                <tr>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Opening</th>
                  <th className="px-4 py-3 text-left">Requisition</th>
                  <th className="px-4 py-3 text-left">Headcount</th>
                  <th className="px-4 py-3 text-left">Closing</th>
                  <th className="px-4 py-3 text-left">State</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    className={`cursor-pointer border-b border-border ${item.id === selectedId ? "bg-accent" : ""}`}
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setDetailsOpen(true);
                      setEditor(false);
                    }}
                  >
                    <td className="px-4 py-3">
                      <Button
                        variant="link"
                        className="h-auto p-0 font-semibold"
                        onClick={() => {
                          setSelectedId(item.id);
                          setDetailsOpen(true);
                          setEditor(false);
                        }}
                      >
                        {item.reference}
                      </Button>
                    </td>
                    <td className="px-4 py-3">
                      <strong>{item.title}</strong>
                      <span className="block text-xs text-muted-foreground">{item.channels.join(", ")}</span>
                    </td>
                    <td className="px-4 py-3">{item.requisition_reference}</td>
                    <td className="px-4 py-3">
                      {item.remaining_positions} of {item.positions_requested}
                    </td>
                    <td className="px-4 py-3">{item.closing_on ?? "Not set"}</td>
                    <td className="px-4 py-3">
                      <span className="nx-status nx-status-draft">{item.state.replaceAll("_", " ")}</span>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                      No live job openings are recorded for this company.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {editor ? (
            <HrRecordDrawer
              title="Create job opening"
              open={editor}
              onClose={() => setEditor(false)}
              busy={saving}
              notice={message}
            >
              <aside className="grid gap-3 rounded-lg border bg-card p-4 border-border">
                {approved.length === 0 ? (
                  <Alert>
                    <AlertTitle>Approved requisition required</AlertTitle>
                    <AlertDescription>
                      Submit and independently approve a manpower requisition before creating an opening.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <label className="grid gap-1 text-sm">
                  Approved requisition
                  <select
                    className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2"
                    value={requisitionId}
                    onChange={(event) => setRequisitionId(event.target.value)}
                  >
                    <option value="">Select</option>
                    {approved.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.reference} · {item.job_title} ({item.positions_requested})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Opening title
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  Headcount
                  <Input inputMode="numeric" value={headcount} onChange={(event) => setHeadcount(event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  Channels (comma separated)
                  <Input value={channels} onChange={(event) => setChannels(event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  Closing date
                  <Input type="date" value={closingOn} onChange={(event) => setClosingOn(event.target.value)} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={saving || !approved.length} onClick={() => void save()}>
                    Create opening
                  </Button>
                  <Button variant="outline" onClick={() => setEditor(false)}>
                    Cancel
                  </Button>
                </div>
              </aside>
            </HrRecordDrawer>
          ) : selected ? (
            <HrRecordDrawer
              title="Job opening details"
              open={detailsOpen && !editor}
              onClose={() => setDetailsOpen(false)}
              busy={saving}
              notice={message}
            >
              <aside className="grid min-w-0 gap-4 rounded-lg border bg-card p-5 border-border">
                <div>
                  <span className="nx-eyebrow">{selected.reference}</span>
                  <h2 className="mt-1 text-xl font-semibold">{selected.title}</h2>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Requisition</dt>
                    <dd className="font-medium">{selected.requisition_reference}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Positions</dt>
                    <dd className="font-medium">{selected.remaining_positions} remaining</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Channels</dt>
                    <dd className="font-medium">{selected.channels.join(", ")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Closing</dt>
                    <dd className="font-medium">{selected.closing_on ?? "Not set"}</dd>
                  </div>
                </dl>
                {selected.state_reason ? (
                  <p className="text-sm text-muted-foreground">{selected.state_reason}</p>
                ) : null}
                {canUpdate ? (
                  <div className="flex flex-wrap gap-2">
                    {selected.state !== "on_hold" && selected.state !== "cancelled" ? (
                      <Button variant="outline" onClick={() => void change("on_hold")}>
                        Put on hold
                      </Button>
                    ) : null}
                    {selected.state === "on_hold" ? <Button onClick={() => void change("open")}>Reopen</Button> : null}
                    {selected.state !== "closed" && selected.state !== "cancelled" ? (
                      <Button variant="outline" onClick={() => void change("closed")}>
                        Close
                      </Button>
                    ) : null}
                    {selected.state !== "cancelled" ? (
                      <Button variant="outline" onClick={() => void change("cancelled")}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </aside>
            </HrRecordDrawer>
          ) : (
            <aside className="rounded-lg border bg-card p-5 text-sm text-muted-foreground border-border">
              Create an opening when an approved requisition is available.
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
