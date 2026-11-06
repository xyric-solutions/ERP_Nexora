"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HrEmployeeWizard } from "./hr-employee-wizard";

/** Add Employee page: the step-by-step drawer opens only when the user asks for it. */
export function HrAddEmployeeWorkspace({
  onAction,
  onNavigate,
}: {
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState("");
  return (
    <section className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <UserPlus className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="m-0! text-sm text-muted-foreground">
            Add an employee with contacts, emergency contacts, documents and employment history in five steps.
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          + Add Employee
        </Button>
      </div>
      {created ? (
        <p
          role="status"
          className="m-0! flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted p-3 text-sm"
        >
          {created}
          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("hr", "employee-drafts")}>
            Open Employee Drafts
          </Button>
        </p>
      ) : null}
      {open ? (
        <HrEmployeeWizard
          target={{ kind: "create" }}
          onClose={() => setOpen(false)}
          onSaved={(message, employeeNumber) => {
            setCreated(message);
            setOpen(false);
            onAction("Employee draft created", employeeNumber);
          }}
        />
      ) : null}
    </section>
  );
}
