"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import type { HrEmployeeDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { HrEmployeeRecordWorkspace } from "./hr-employee-record-workspace";
import { HrEmployeeWizard } from "./hr-employee-wizard";

type LoadState = "loading" | "ready" | "unavailable";
type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;

function employeeStatusVariant(status: HrEmployeeDirectory["items"][number]["status"]) {
  return ["terminated", "resigned", "inactive"].includes(status) ? "outline" : "secondary";
}

/** Live employee directory; a row opens the employee overview in the side drawer. */
export function HrEmployeeDirectory({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [employees, setEmployees] = useState<HrEmployeeDirectory["items"]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [companyState, setCompanyState] = useState<LoadState>("loading");
  const [directoryState, setDirectoryState] = useState<LoadState>("loading");
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [recordVersion, setRecordVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const selected = employees.find((employee) => employee.id === selectedId);
  const canEdit = [
    "hr.employee_contact.manage",
    "hr.employee_emergency_contact.manage",
    "hr.employee_document.manage",
    "hr.employee.update",
  ].some((permission) => session?.user.permissions.includes(permission));
  const openRow = (employee: HrEmployeeDirectory["items"][number]) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Open ${employee.display_name} (${employee.employee_number})`,
    onClick: () => setSelectedId(employee.id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelectedId(employee.id);
      }
    },
  });

  const reloadCompanies = () => {
    if (!session?.user.permissions.includes("hr.employee.read")) {
      setCompanyState("unavailable");
      return;
    }
    setCompanyState("loading");
    client
      .companies()
      .then((result) => {
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
        setCompanyState("ready");
      })
      .catch(() => setCompanyState("unavailable"));
  };

  useEffect(() => {
    reloadCompanies();
    // The client/session change only after a deliberate authentication change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, session?.user.permissions]);

  useEffect(() => {
    if (companyState !== "ready" || !companyId) return;
    let active = true;
    setDirectoryState("loading");
    client
      .employees({ companyId, search: appliedQuery || undefined, limit: 50 })
      .then((result) => {
        if (!active) return;
        setEmployees(result.items);
        setDirectoryState("ready");
      })
      .catch(() => {
        if (active) setDirectoryState("unavailable");
      });
    return () => {
      active = false;
    };
  }, [appliedQuery, client, companyId, companyState]);

  if (companyState === "unavailable") {
    return (
      <>
        <Alert>
          <AlertTitle>Live HR directory is unavailable</AlertTitle>
          <AlertDescription>
            Your current session could not load an authorized company scope. Refresh the session or check HR access.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee directory">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="grid min-w-0 basis-full gap-1.5 sm:min-w-55 sm:flex-1 sm:basis-0">
          <label className="text-sm font-medium text-foreground" htmlFor="hr-directory-company">
            Company
          </label>
          <select
            id="hr-directory-company"
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={companyState !== "ready" || companies.length === 0}
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </div>
        <form
          className="flex min-w-0 flex-1 flex-wrap items-end gap-2 sm:min-w-65"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedQuery(query.trim());
          }}
        >
          <label
            className="grid min-w-0 basis-full gap-1.5 text-sm font-medium text-foreground sm:flex-1 sm:basis-0"
            htmlFor="hr-directory-search"
          >
            Search employee
            <Input
              id="hr-directory-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or employee number"
            />
          </label>
          <Button type="submit" variant="outline">
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setQuery("");
              setAppliedQuery("");
            }}
          >
            Clear
          </Button>
        </form>
        <Button type="button" onClick={reloadCompanies} variant="outline">
          Refresh
        </Button>
      </div>

      {notice ? (
        <p role="status" className="m-0! rounded-lg border border-border bg-muted p-3 text-sm">
          {notice}
        </p>
      ) : null}
      {companyState === "loading" || directoryState === "loading" ? (
        <div className="grid gap-2 rounded-lg border border-border bg-card p-4" aria-live="polite">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {companyState === "ready" && companies.length === 0 ? (
        <Alert>
          <AlertTitle>No HR company access</AlertTitle>
          <AlertDescription>Your account has no active company scope for the employee directory.</AlertDescription>
        </Alert>
      ) : null}

      {directoryState === "unavailable" ? (
        <Alert>
          <AlertTitle>Employee records could not be loaded</AlertTitle>
          <AlertDescription>
            The live directory is temporarily unavailable. No cached or unauthorized employee data is shown.
          </AlertDescription>
        </Alert>
      ) : null}

      {directoryState === "ready" ? (
        <div className="relative overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full min-w-160 border-collapse text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Designation</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-12 px-2 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr
                  className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  key={employee.id}
                  {...openRow(employee)}
                >
                  <td className="max-w-64 px-3 py-2">
                    <p className="m-0! truncate font-medium text-foreground">{employee.display_name}</p>
                    <p className="m-0! truncate text-xs text-muted-foreground">
                      {employee.employee_number}
                      {employee.work_email ? ` · ${employee.work_email}` : ""}
                    </p>
                  </td>
                  <td className="max-w-48 truncate px-3 py-2 text-muted-foreground">{employee.designation}</td>
                  <td className="max-w-48 px-3 py-2 text-muted-foreground">
                    <span className="block truncate text-foreground">{employee.department}</span>
                    {employee.branch ? <span className="block truncate text-xs">{employee.branch}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{employee.joined_on}</td>
                  <td className="px-3 py-2">
                    <Badge variant={employeeStatusVariant(employee.status)}>
                      {employee.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-2 py-1 text-right">
                    {canEdit ? (
                      <HrEditButton
                        label={`Edit ${employee.display_name}`}
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingId(employee.id);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
              {employees.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                    No employees match this company and search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Live, permission-scoped HR directory · showing up to 50 records
          </p>
        </div>
      ) : null}
      <HrMasterSheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId("");
        }}
        eyebrow="Employee Directory"
        title={selected?.display_name ?? "Employee"}
        description={selected ? `${selected.employee_number} · ${selected.designation} · ${selected.department}` : ""}
        footer={
          selected && canEdit ? (
            <Button type="button" variant="outline" onClick={() => setEditingId(selected.id)}>
              Edit employee
            </Button>
          ) : undefined
        }
      >
        {selected ? (
          <HrEmployeeRecordWorkspace
            key={`${selected.id}-${recordVersion}`}
            employeeId={selected.id}
            onNavigate={onNavigate}
            presentation="drawer"
          />
        ) : null}
      </HrMasterSheet>
      {editingId ? (
        <HrEmployeeWizard
          target={{ kind: "employee", employeeId: editingId }}
          onClose={() => setEditingId("")}
          onSaved={(message) => {
            setNotice(message);
            setEditingId("");
            setRecordVersion((current) => current + 1);
          }}
        />
      ) : null}
    </section>
  );
}
