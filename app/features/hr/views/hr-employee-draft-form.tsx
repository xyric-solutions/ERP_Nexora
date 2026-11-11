"use client";
import { WorkForm, WorkFormLayout } from "@/shared/ui/work-form";

import { HrRecordDrawer } from "../components/hr-record-drawer";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type FormValues = {
  employeeNumber: string;
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  joinedOn: string;
  workEmail: string;
  phone: string;
};

const initialValues: FormValues = {
  employeeNumber: "AUTO",
  firstName: "",
  middleName: "",
  lastName: "",
  preferredName: "",
  joinedOn: new Date().toISOString().slice(0, 10),
  workEmail: "",
  phone: "",
};

export function HrEmployeeDraftForm({
  onAction,
  onClose,
}: {
  onAction: (action: string, subject?: string) => void;
  onClose: () => void;
}) {
  const { api, csrfToken, session } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [values, setValues] = useState<FormValues>(initialValues);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canCreate = session?.user.permissions.includes("hr.employee.create") ?? false;

  const reloadCompanies = () => {
    if (!canCreate) {
      setUnavailable(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    client
      .companies()
      .then((result) => {
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
        setUnavailable(false);
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reloadCompanies();
    // Authentication state is the only source of mutation permission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, client]);

  const update = (field: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!companyId) {
      setError("Choose an authorized company before creating a draft.");
      return;
    }
    setSaving(true);
    try {
      const result = await client.createEmployeeDraft(
        {
          company_id: companyId,
          employee_number: values.employeeNumber.trim().toUpperCase(),
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
          joined_on: values.joinedOn,
          ...(values.middleName.trim() ? { middle_name: values.middleName.trim() } : {}),
          ...(values.preferredName.trim() ? { preferred_name: values.preferredName.trim() } : {}),
          ...(values.workEmail.trim() ? { work_email: values.workEmail.trim() } : {}),
          ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setSuccess(
        `Draft ${result.employee_number} was created and remains inactive until it is submitted and approved.`,
      );
      setValues((current) => ({ ...initialValues, joinedOn: current.joinedOn }));
      onAction("Employee draft created", result.employee_number);
      onClose();
    } catch {
      setError("The employee draft could not be created. Check the required fields and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (unavailable) {
    return (
      <WorkFormLayout><Alert>
        <AlertTitle>Live employee draft creation is unavailable</AlertTitle>
        <AlertDescription>
          Your account does not currently have HR draft-create access, or the live API is unavailable. No mock employee
          form is shown.
        </AlertDescription>
      </Alert></WorkFormLayout>
    );
  }

  if (loading) {
    return (
      <WorkFormLayout><div className="grid gap-3 rounded-lg border border-border bg-card p-4" aria-live="polite">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div></WorkFormLayout>
    );
  }

  return (
    <WorkFormLayout><HrRecordDrawer
      title="Add Employee"
      open
      onClose={onClose}
      busy={saving}
      description="Create an employee draft for review and approval."
    >
      <WorkForm
        className="grid max-w-4xl gap-5 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6"
        onSubmit={submit}
      >
        <div>
          <p className="mt-1 text-sm text-muted-foreground">
            This creates a company-scoped draft only. Assignment, activation, payroll, identity binding, and sensitive
            information are separate governed workflows.
          </p>
        </div>

        {success ? (
          <Alert>
            <AlertTitle>Draft created</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Draft was not created</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {companies.length === 0 ? (
          <Alert>
            <AlertTitle>No authorized company</AlertTitle>
            <AlertDescription>
              There is no active company scope available for creating an employee draft.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
            Company
            <select
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              disabled={saving || companies.length === 0}
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
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Employee number (automatic)
            <Input required maxLength={32} value="Assigned on save · EMP-001…" readOnly />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Joining date
            <Input
              required
              type="date"
              value={values.joinedOn}
              onChange={(event) => update("joinedOn", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            First name
            <Input
              required
              maxLength={100}
              value={values.firstName}
              onChange={(event) => update("firstName", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Last name
            <Input
              required
              maxLength={100}
              value={values.lastName}
              onChange={(event) => update("lastName", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Middle name <span className="font-normal text-muted-foreground">(optional)</span>
            <Input
              maxLength={100}
              value={values.middleName}
              onChange={(event) => update("middleName", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Preferred name <span className="font-normal text-muted-foreground">(optional)</span>
            <Input
              maxLength={100}
              value={values.preferredName}
              onChange={(event) => update("preferredName", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Work email <span className="font-normal text-muted-foreground">(optional)</span>
            <Input
              type="email"
              maxLength={320}
              value={values.workEmail}
              onChange={(event) => update("workEmail", event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Phone <span className="font-normal text-muted-foreground">(optional)</span>
            <Input maxLength={40} value={values.phone} onChange={(event) => update("phone", event.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setValues(initialValues);
              setError("");
              setSuccess("");
            }}
          >
            Reset
          </Button>
          <Button type="submit" disabled={saving || companies.length === 0}>
            {saving ? "Creating draft…" : "Create draft"}
          </Button>
        </div>
      </WorkForm>
    </HrRecordDrawer></WorkFormLayout>
  );
}
