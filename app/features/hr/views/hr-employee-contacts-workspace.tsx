"use client";

import { useEffect, useMemo, useState } from "react";

import type { HrEmployeeContactDirectory, HrEmployeeDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type LoadState = "loading" | "ready" | "error";

export function HrEmployeeContactsWorkspace({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [employees, setEmployees] = useState<HrEmployeeDirectory["items"]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [contacts, setContacts] = useState<HrEmployeeContactDirectory["items"]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [contactState, setContactState] = useState<LoadState>("ready");
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [usage, setUsage] = useState<"work" | "personal" | "other">("work");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [primary, setPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canReadContacts = session?.user.permissions.includes("hr.employee_contact.read") ?? false;
  const canManageContacts = session?.user.permissions.includes("hr.employee_contact.manage") ?? false;
  const canReadEmployees = session?.user.permissions.includes("hr.employee.read") ?? false;

  useEffect(() => {
    if (sessionLoading || !canReadContacts || !canReadEmployees) return;
    let active = true;
    setState("loading");
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
  }, [canReadContacts, canReadEmployees, client, sessionLoading]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    setState("loading");
    setEmployeeId("");
    setContacts([]);
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
  }, [client, companyId, refreshKey]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    setContactState("loading");
    setError("");
    client
      .employeeContacts(employeeId)
      .then((result) => {
        if (!active) return;
        setContacts(result.items);
        setContactState("ready");
      })
      .catch(() => {
        if (active) setContactState("error");
      });
    return () => {
      active = false;
    };
  }, [client, employeeId, refreshKey]);

  const save = async () => {
    if (!employeeId || !value.trim()) {
      setError("Choose an employee and enter a contact value.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await client.createEmployeeContact(
        employeeId,
        {
          channel,
          contact_usage: usage,
          contact_value: value.trim(),
          label: label.trim() || undefined,
          is_primary: primary,
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice("Contact record added to the employee’s append-only contact history.");
      setValue("");
      setLabel("");
      setPrimary(false);
      setRefreshKey((current) => current + 1);
      onAction("Employee contact added", employees.find((employee) => employee.id === employeeId)?.employee_number);
    } catch {
      setError(
        "The contact could not be saved. It may conflict with an existing primary contact or your access may have changed.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canReadContacts || !canReadEmployees)
    return (
      <Alert>
        <AlertTitle>Contact access required</AlertTitle>
        <AlertDescription>
          This screen requires both employee-directory and employee-contact read permissions.
        </AlertDescription>
      </Alert>
    );

  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee contacts">
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
      {notice && (
        <Alert>
          <AlertTitle>Contact saved</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Contact action unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {state === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Live HR data unavailable</AlertTitle>
          <AlertDescription>
            No mock contact data is shown because employee contact records are permission-restricted.
          </AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-20 w-full" />}
      {employeeId && contactState === "loading" && <Skeleton className="h-32 w-full" />}
      {employeeId && contactState === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Contacts unavailable</AlertTitle>
          <AlertDescription>The selected employee is no longer available in your company scope.</AlertDescription>
        </Alert>
      )}
      {employeeId && contactState === "ready" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,.72fr)]">
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full min-w-150 text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Effective</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr className="border-b border-border/70 last:border-0" key={contact.id}>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{contact.channel}</Badge>
                      <span className="ml-2 text-muted-foreground">{contact.contact_usage}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p>{contact.contact_value}</p>
                      {contact.label && <p className="text-xs text-muted-foreground">{contact.label}</p>}
                      {contact.is_primary && (
                        <Badge className="mt-1" variant="outline">
                          Primary
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{contact.effective_from}</td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={3}>
                      No active email or phone contacts are recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <aside className="rounded-lg border border-border bg-card p-4 shadow-sm">
            {canManageContacts ? (
              <div className="grid gap-3">
                <h2 className="font-semibold">Add contact</h2>
                <label className="grid gap-1.5 text-sm font-medium">
                  Channel
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
                    value={channel}
                    onChange={(event) => setChannel(event.target.value as "email" | "phone")}
                  >
                    {<option value="email">Email</option>}
                    {<option value="phone">Phone</option>}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Usage
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
                    value={usage}
                    onChange={(event) => setUsage(event.target.value as "work" | "personal" | "other")}
                  >
                    <option value="work">Work</option>
                    <option value="personal">Personal</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Value
                  <Input
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    type={channel === "email" ? "email" : "tel"}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Label (optional)
                  <Input value={label} onChange={(event) => setLabel(event.target.value)} />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={primary} onCheckedChange={setPrimary} />
                  Primary for this channel and usage
                </label>
                <Button type="button" disabled={saving} onClick={save}>
                  {saving ? "Saving..." : "Add contact"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Contact values are append-only. Replacing a primary contact requires the future governed
                  contact-change workflow.
                </p>
              </div>
            ) : (
              <Alert>
                <AlertTitle>Manage permission required</AlertTitle>
                <AlertDescription>You can read contacts but cannot add one.</AlertDescription>
              </Alert>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
