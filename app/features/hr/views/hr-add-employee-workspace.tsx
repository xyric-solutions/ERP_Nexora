"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HrEmployeeDraftForm } from "./hr-employee-draft-form";

/** Add Employee page: the draft drawer opens only when the user asks for it. */
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
            Create a company-scoped employee draft. It stays inactive until it is submitted and approved.
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
          Draft {created} was created.
          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("hr", "employee-drafts")}>
            Open Employee Drafts
          </Button>
        </p>
      ) : null}
      {open ? (
        <HrEmployeeDraftForm
          onAction={(action, subject) => {
            if (action === "Employee draft created" && subject) setCreated(subject);
            onAction(action, subject);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}
