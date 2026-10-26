"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  HrEmployeeDirectory,
  HrEmployeeLifecycleEventDirectory,
  HrEmployeeProfileVersionDirectory,
  HrEmployeeStatusHistoryDirectory,
} from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type LoadState = "loading" | "ready" | "error";
type LifecycleEvent = HrEmployeeLifecycleEventDirectory["items"][number];
type ProfileVersion = HrEmployeeProfileVersionDirectory["items"][number];

function readable(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function HrEmployeeHistoryWorkspace() {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [employees, setEmployees] = useState<HrEmployeeDirectory["items"]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const selectedEmployeeRef = useRef(employeeId);

  const [directoryState, setDirectoryState] = useState<LoadState>("loading");
  const [statusItems, setStatusItems] = useState<HrEmployeeStatusHistoryDirectory["items"]>([]);
  const [statusState, setStatusState] = useState<LoadState>("ready");
  const [lifecycleItems, setLifecycleItems] = useState<LifecycleEvent[]>([]);
  const [lifecycleState, setLifecycleState] = useState<LoadState>("ready");
  const [lifecycleCursor, setLifecycleCursor] = useState<string | null>(null);
  const [lifecycleLoadingOlder, setLifecycleLoadingOlder] = useState(false);
  const [lifecycleOlderError, setLifecycleOlderError] = useState(false);
  const [profileItems, setProfileItems] = useState<ProfileVersion[]>([]);
  const [profileState, setProfileState] = useState<LoadState>("ready");
  const [profileCursor, setProfileCursor] = useState<string | null>(null);
  const [profileLoadingOlder, setProfileLoadingOlder] = useState(false);
  const [profileOlderError, setProfileOlderError] = useState(false);

  const canReadHistory = session?.user.permissions.includes("hr.employment_history.read") ?? false;
  const canReadEmployees = session?.user.permissions.includes("hr.employee.read") ?? false;

  useEffect(() => {
    selectedEmployeeRef.current = employeeId;
  }, [employeeId]);

  useEffect(() => {
    if (sessionLoading || !canReadHistory || !canReadEmployees) return;
    let active = true;
    client
      .companies()
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        const initialCompanyId = result.items[0]?.id ?? "";
        setCompanyId(initialCompanyId);
        setDirectoryState(initialCompanyId ? "loading" : "ready");
      })
      .catch(() => {
        if (active) setDirectoryState("error");
      });
    return () => {
      active = false;
    };
  }, [canReadEmployees, canReadHistory, client, sessionLoading]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    client
      .employees({ companyId, limit: 100 })
      .then((result) => {
        if (!active) return;
        setEmployees(result.items);
        setDirectoryState("ready");
      })
      .catch(() => {
        if (active) setDirectoryState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    client
      .employeeStatusHistory(employeeId)
      .then((result) => {
        if (!active) return;
        setStatusItems(result.items);
        setStatusState("ready");
      })
      .catch(() => {
        if (active) setStatusState("error");
      });
    return () => {
      active = false;
    };
  }, [client, employeeId]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    client
      .employeeLifecycleEvents(employeeId)
      .then((result) => {
        if (!active) return;
        setLifecycleItems(result.items);
        setLifecycleCursor(result.next_cursor);
        setLifecycleState("ready");
      })
      .catch(() => {
        if (active) setLifecycleState("error");
      });
    return () => {
      active = false;
    };
  }, [client, employeeId]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    client
      .employeeProfileHistory(employeeId)
      .then((result) => {
        if (!active) return;
        setProfileItems(result.items);
        setProfileCursor(result.next_cursor);
        setProfileState("ready");
      })
      .catch(() => {
        if (active) setProfileState("error");
      });
    return () => {
      active = false;
    };
  }, [client, employeeId]);

  function chooseCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setDirectoryState(nextCompanyId ? "loading" : "ready");
    setEmployees([]);
    chooseEmployee("");
  }

  function chooseEmployee(nextEmployeeId: string) {
    setEmployeeId(nextEmployeeId);
    const nextState: LoadState = nextEmployeeId ? "loading" : "ready";
    setStatusItems([]);
    setStatusState(nextState);
    setLifecycleItems([]);
    setLifecycleState(nextState);
    setLifecycleCursor(null);
    setLifecycleLoadingOlder(false);
    setLifecycleOlderError(false);
    setProfileItems([]);
    setProfileState(nextState);
    setProfileCursor(null);
    setProfileLoadingOlder(false);
    setProfileOlderError(false);
  }

  async function loadOlderLifecycle() {
    if (!lifecycleCursor || lifecycleLoadingOlder) return;
    const requestedEmployee = employeeId;
    setLifecycleLoadingOlder(true);
    setLifecycleOlderError(false);
    try {
      const result = await client.employeeLifecycleEvents(requestedEmployee, { cursor: lifecycleCursor });
      if (selectedEmployeeRef.current !== requestedEmployee) return;
      setLifecycleItems((current) => [
        ...current,
        ...result.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setLifecycleCursor(result.next_cursor);
    } catch {
      if (selectedEmployeeRef.current === requestedEmployee) setLifecycleOlderError(true);
    } finally {
      if (selectedEmployeeRef.current === requestedEmployee) setLifecycleLoadingOlder(false);
    }
  }

  async function loadOlderProfiles() {
    if (!profileCursor || profileLoadingOlder) return;
    const requestedEmployee = employeeId;
    setProfileLoadingOlder(true);
    setProfileOlderError(false);
    try {
      const result = await client.employeeProfileHistory(requestedEmployee, { cursor: profileCursor });
      if (selectedEmployeeRef.current !== requestedEmployee) return;
      setProfileItems((current) => [
        ...current,
        ...result.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setProfileCursor(result.next_cursor);
    } catch {
      if (selectedEmployeeRef.current === requestedEmployee) setProfileOlderError(true);
    } finally {
      if (selectedEmployeeRef.current === requestedEmployee) setProfileLoadingOlder(false);
    }
  }

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canReadHistory || !canReadEmployees)
    return (
      <Alert>
        <AlertTitle>Employment history access required</AlertTitle>
        <AlertDescription>
          This screen requires employee-directory and employment-history read permissions.
        </AlertDescription>
      </Alert>
    );

  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee history">
      <Alert>
        <AlertTitle>Immutable employee history</AlertTitle>
        <AlertDescription>
          Status, lifecycle and profile evidence is read-only. Changes must continue through their governed workflows.
        </AlertDescription>
      </Alert>
      <div className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-3 shadow-sm md:grid-cols-2">
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Company
          <select
            className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-2.5 text-sm"
            value={companyId}
            onChange={(event) => chooseCompany(event.target.value)}
            disabled={directoryState === "loading"}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Employee
          <select
            className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-2.5 text-sm"
            value={employeeId}
            onChange={(event) => chooseEmployee(event.target.value)}
            disabled={directoryState !== "ready"}
          >
            <option value="">Select an employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_number} - {employee.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {directoryState === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Live HR data unavailable</AlertTitle>
          <AlertDescription>No mock employee history is shown.</AlertDescription>
        </Alert>
      )}
      {directoryState === "loading" && <Skeleton className="h-20 w-full" />}
      {employeeId && (
        <Tabs defaultValue="status" className="min-w-0 gap-4">
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="status">Status Changes</TabsTrigger>
            <TabsTrigger value="lifecycle">Lifecycle Events</TabsTrigger>
            <TabsTrigger value="profile">Profile Versions</TabsTrigger>
          </TabsList>

          <TabsContent value="status">
            {statusState === "loading" && <Skeleton className="h-32 w-full" />}
            {statusState === "error" && (
              <Alert variant="destructive">
                <AlertTitle>Status history unavailable</AlertTitle>
                <AlertDescription>The selected employee is unavailable in your current company scope.</AlertDescription>
              </Alert>
            )}
            {statusState === "ready" && (
              <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Effective date</th>
                      <th className="px-4 py-3">Status change</th>
                      <th className="px-4 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusItems.map((entry) => (
                      <tr className="border-b border-border/70 last:border-0" key={entry.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{entry.effective_on}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {entry.from_status && <Badge variant="outline">{readable(entry.from_status)}</Badge>}
                            <span className="text-muted-foreground">-&gt;</span>
                            <Badge variant="secondary">{readable(entry.to_status)}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{entry.reason}</td>
                      </tr>
                    ))}
                    {statusItems.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-muted-foreground" colSpan={3}>
                          No status history is available for this employee.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="lifecycle" className="grid gap-3">
            {lifecycleState === "loading" && <Skeleton className="h-40 w-full" />}
            {lifecycleState === "error" && (
              <Alert variant="destructive">
                <AlertTitle>Lifecycle events unavailable</AlertTitle>
                <AlertDescription>Status and profile evidence remain independently available.</AlertDescription>
              </Alert>
            )}
            {lifecycleState === "ready" && (
              <>
                <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
                  <table className="w-full min-w-[1080px] text-left text-sm">
                    <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Effective</th>
                        <th className="px-4 py-3">Event</th>
                        <th className="px-4 py-3">State transition</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lifecycleItems.map((entry) => (
                        <tr className="border-b border-border/70 align-top last:border-0" key={entry.id}>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{entry.effective_on}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary">{readable(entry.event_type)}</Badge>
                            <div className="mt-1 text-xs text-muted-foreground">Sequence {entry.sequence}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{entry.previous_state?.label ?? "Initial"}</Badge>
                              <span className="text-muted-foreground">-&gt;</span>
                              <Badge variant="secondary">{entry.resulting_state.label}</Badge>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {readable(entry.resulting_state.canonical_class)}
                            </div>
                          </td>
                          <td className="max-w-sm px-4 py-3 text-muted-foreground">{entry.reason}</td>
                          <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                            <div className="break-all">{entry.source_reference}</div>
                            <div className="mt-1">Recorded {new Date(entry.recorded_at).toLocaleString()}</div>
                            <div>Approved {new Date(entry.approved_at).toLocaleString()}</div>
                          </td>
                        </tr>
                      ))}
                      {lifecycleItems.length === 0 && (
                        <tr>
                          <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                            No lifecycle events are available for this employee.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {lifecycleOlderError && (
                  <Alert variant="destructive">
                    <AlertTitle>Older lifecycle events could not be loaded</AlertTitle>
                    <AlertDescription>Existing results were preserved. You can retry safely.</AlertDescription>
                  </Alert>
                )}
                {lifecycleCursor && (
                  <Button type="button" variant="outline" onClick={loadOlderLifecycle} disabled={lifecycleLoadingOlder}>
                    {lifecycleLoadingOlder ? "Loading..." : "Load older lifecycle events"}
                  </Button>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="profile" className="grid gap-3">
            <Alert>
              <AlertTitle>Non-sensitive profile evidence</AlertTitle>
              <AlertDescription>
                Baseline captures show an observed snapshot and do not reconstruct earlier unrecorded edits. Private
                contact and identity values are excluded.
              </AlertDescription>
            </Alert>
            {profileState === "loading" && <Skeleton className="h-40 w-full" />}
            {profileState === "error" && (
              <Alert variant="destructive">
                <AlertTitle>Profile versions unavailable</AlertTitle>
                <AlertDescription>Status and lifecycle evidence remain independently available.</AlertDescription>
              </Alert>
            )}
            {profileState === "ready" && (
              <>
                <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
                  <table className="w-full min-w-[1040px] text-left text-sm">
                    <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Revision</th>
                        <th className="px-4 py-3">Effective range</th>
                        <th className="px-4 py-3">Name snapshot</th>
                        <th className="px-4 py-3">Work email</th>
                        <th className="px-4 py-3">Capture</th>
                        <th className="px-4 py-3">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profileItems.map((entry) => (
                        <tr className="border-b border-border/70 align-top last:border-0" key={entry.id}>
                          <td className="px-4 py-3 font-medium">{entry.revision}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {entry.effective_from} to {entry.effective_to ?? "Current"}
                          </td>
                          <td className="px-4 py-3">
                            {[entry.first_name, entry.middle_name, entry.last_name].filter(Boolean).join(" ")}
                            {entry.preferred_name && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Preferred: {entry.preferred_name}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{entry.work_email || "Not recorded"}</td>
                          <td className="px-4 py-3">
                            <Badge variant={entry.capture_origin === "migration_baseline" ? "outline" : "secondary"}>
                              {entry.capture_origin === "migration_baseline" ? "Baseline capture" : "Recorded change"}
                            </Badge>
                          </td>
                          <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                            <div className="break-all">{entry.source_reference}</div>
                            <div className="mt-1">{new Date(entry.recorded_at).toLocaleString()}</div>
                          </td>
                        </tr>
                      ))}
                      {profileItems.length === 0 && (
                        <tr>
                          <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                            No profile versions are available for this employee.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {profileOlderError && (
                  <Alert variant="destructive">
                    <AlertTitle>Older profile versions could not be loaded</AlertTitle>
                    <AlertDescription>Existing results were preserved. You can retry safely.</AlertDescription>
                  </Alert>
                )}
                {profileCursor && (
                  <Button type="button" variant="outline" onClick={loadOlderProfiles} disabled={profileLoadingOlder}>
                    {profileLoadingOlder ? "Loading..." : "Load older profile versions"}
                  </Button>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
