"use client";

import { useEffect, useMemo, useState } from "react";

import type { HrEmployeeDirectory, HrEmployeeDocumentDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type LoadState = "loading" | "ready" | "error";

function documentVariant(status: HrEmployeeDocumentDirectory["items"][number]["verification_status"]) {
  return status === "verified"
    ? "secondary"
    : status === "rejected" || status === "expired"
      ? "destructive"
      : "outline";
}

export function HrEmployeeDocumentsWorkspace() {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [employees, setEmployees] = useState<HrEmployeeDirectory["items"]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [documents, setDocuments] = useState<HrEmployeeDocumentDirectory["items"]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [documentState, setDocumentState] = useState<LoadState>("ready");
  const canRead = session?.user.permissions.includes("hr.employee_document.read") ?? false;
  const canReadEmployees = session?.user.permissions.includes("hr.employee.read") ?? false;

  useEffect(() => {
    if (sessionLoading || !canRead || !canReadEmployees) return;
    let active = true;
    client
      .companies()
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        setCompanyId((current) =>
          result.items.some((item) => item.id === current) ? current : (result.items[0]?.id ?? ""),
        );
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [canRead, canReadEmployees, client, sessionLoading]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    setState("loading");
    setEmployeeId("");
    setDocuments([]);
    client
      .employees({ companyId, limit: 100 })
      .then((result) => {
        if (!active) return;
        setEmployees(result.items);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    setDocumentState("loading");
    client
      .employeeDocuments(employeeId)
      .then((result) => {
        if (!active) return;
        setDocuments(result.items);
        setDocumentState("ready");
      })
      .catch(() => {
        if (active) setDocumentState("error");
      });
    return () => {
      active = false;
    };
  }, [client, employeeId]);

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canRead || !canReadEmployees)
    return (
      <Alert>
        <AlertTitle>Document access required</AlertTitle>
        <AlertDescription>This screen requires employee-directory and document read permissions.</AlertDescription>
      </Alert>
    );
  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee documents">
      <Alert>
        <AlertTitle>Restricted document register</AlertTitle>
        <AlertDescription>
          Only document metadata is available in this phase. File upload, verification and download remain disabled
          until the object-storage signing workflow is connected.
        </AlertDescription>
      </Alert>
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 shadow-sm md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Company
          <select
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            disabled={state === "loading"}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Employee
          <select
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            disabled={state !== "ready"}
          >
            <option value="">Select an employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_number} — {employee.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Live HR data unavailable</AlertTitle>
          <AlertDescription>No mock document data is shown because document metadata is restricted.</AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-20 w-full" />}
      {employeeId && documentState === "loading" && <Skeleton className="h-32 w-full" />}
      {employeeId && documentState === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Document register unavailable</AlertTitle>
          <AlertDescription>The selected employee is no longer available in your company scope.</AlertDescription>
        </Alert>
      )}
      {employeeId && documentState === "ready" && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full min-w-190 text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Validity</th>
                <th className="px-4 py-3">Verification</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr className="border-b border-border/70 last:border-0" key={document.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{document.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {document.document_type}
                      {document.restricted ? " · Restricted" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{document.reference || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {document.issued_on || "—"} to {document.expires_on || "No expiry"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={documentVariant(document.verification_status)}>
                      {document.verification_status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                    No document metadata is recorded for this employee.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
