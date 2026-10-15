"use client";

import { useEffect, useMemo, useState } from "react";

import type { HrEmployeeDirectory, HrEmployeeEmergencyContactDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type LoadState = "loading" | "ready" | "error";

export function HrEmployeeEmergencyContactsWorkspace({
  onAction,
}: {
  onAction: (action: string, subject?: string) => void;
}) {
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [employees, setEmployees] = useState<HrEmployeeDirectory["items"]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [contacts, setContacts] = useState<HrEmployeeEmergencyContactDirectory["items"]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [contactState, setContactState] = useState<LoadState>("ready");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [priority, setPriority] = useState("1");
  const [primary, setPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canRead = session?.user.permissions.includes("hr.employee_emergency_contact.read") ?? false;
  const canManage = session?.user.permissions.includes("hr.employee_emergency_contact.manage") ?? false;
  const canReadEmployees = session?.user.permissions.includes("hr.employee.read") ?? false;

  useEffect(() => {
    if (sessionLoading || !canRead || !canReadEmployees) return;
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
  }, [canRead, canReadEmployees, client, sessionLoading]);

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
      .employeeEmergencyContacts(employeeId)
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
    const parsedPriority = Number(priority);
    if (
      !employeeId ||
      !name.trim() ||
      !relationship.trim() ||
      !phone.trim() ||
      !Number.isInteger(parsedPriority) ||
      parsedPriority < 1 ||
      parsedPriority > 99
    ) {
      setError("Choose an employee and enter name, relationship, phone, and a priority from 1 to 99.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await client.createEmployeeEmergencyContact(
        employeeId,
        {
          name: name.trim(),
          relationship: relationship.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          priority: parsedPriority,
          is_primary: primary,
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice("Emergency contact added to the employee’s append-only contact history.");
      setName("");
      setRelationship("");
      setPhone("");
      setEmail("");
      setPriority("1");
      setPrimary(false);
      setRefreshKey((current) => current + 1);
      onAction("Emergency contact added", employees.find((employee) => employee.id === employeeId)?.employee_number);
    } catch {
      setError("The emergency contact could not be saved. An active priority or primary contact may already exist.");
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canRead || !canReadEmployees)
    return (
      <Alert>
        <AlertTitle>Emergency-contact access required</AlertTitle>
        <AlertDescription>
          This screen requires employee-directory and emergency-contact read permissions.
        </AlertDescription>
      </Alert>
    );

  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee emergency contacts">
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
          <AlertTitle>Emergency contact saved</AlertTitle>
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
            No mock emergency contact data is shown because these records are permission-restricted.
          </AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-20 w-full" />}
      {employeeId && contactState === "loading" && <Skeleton className="h-32 w-full" />}
      {employeeId && contactState === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Emergency contacts unavailable</AlertTitle>
          <AlertDescription>The selected employee is no longer available in your company scope.</AlertDescription>
        </Alert>
      )}
      {employeeId && contactState === "ready" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,.72fr)]">
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full min-w-170 text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Reach</th>
                  <th className="px-4 py-3">Priority</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr className="border-b border-border/70 last:border-0" key={contact.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">{contact.relationship}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{contact.phone}</p>
                      {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={contact.is_primary ? "default" : "secondary"}>
                        {contact.is_primary ? "Primary" : `Priority ${contact.priority}`}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={3}>
                      No active emergency contacts are recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <aside className="rounded-lg border border-border bg-card p-4 shadow-sm">
            {canManage ? (
              <div className="grid gap-3">
                <h2 className="font-semibold">Add emergency contact</h2>
                <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Relationship
                  <Input value={relationship} onChange={(event) => setRelationship(event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Phone
                  <Input value={phone} type="tel" onChange={(event) => setPhone(event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Email (optional)
                  <Input value={email} type="email" onChange={(event) => setEmail(event.target.value)} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Priority
                  <Input
                    value={priority}
                    type="number"
                    min={1}
                    max={99}
                    onChange={(event) => setPriority(event.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={primary} onCheckedChange={setPrimary} /> Primary emergency contact
                </label>
                <Button type="button" disabled={saving} onClick={save}>
                  {saving ? "Saving..." : "Add emergency contact"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Records are append-only. Replacement and closure remain a separate governed workflow.
                </p>
              </div>
            ) : (
              <Alert>
                <AlertTitle>Manage permission required</AlertTitle>
                <AlertDescription>You can read these contacts but cannot add one.</AlertDescription>
              </Alert>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
