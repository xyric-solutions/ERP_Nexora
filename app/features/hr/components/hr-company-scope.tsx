"use client";
import { useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { Field, panel, selectClass, useAttendanceRead } from "./hr-workspace-controls";
export function HrCompanyScope({
  children,
  disabled = false,
}: {
  children: (company: string) => ReactNode;
  disabled?: boolean;
}) {
  const { api } = useSession(),
    client = new HrApiClient(api);
  const [choice, setChoice] = useState(""),
    [revision, setRevision] = useState(0);
  const read = useAttendanceRead("hr-governed-companies:" + revision, () => client.companies());
  const company = read.data?.items.some((c) => c.id === choice) ? choice : (read.data?.items[0]?.id ?? "");
  return (
    <div className="min-w-0 space-y-4">
      <div className={panel}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field title="Company">
              <select
                className={selectClass}
                disabled={disabled || read.loading || !read.data?.items.length}
                value={company}
                onChange={(e) => setChoice(e.target.value)}
              >
                <option value="">
                  {read.loading ? "Loading companies…" : read.error ? "Companies unavailable" : "No authorized company"}
                </option>
                {read.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button type="button" variant="outline" disabled={disabled} onClick={() => setRevision((v) => v + 1)}>
            <RefreshCw className="size-4" />
            {read.error ? "Retry companies" : "Refresh companies"}
          </Button>
        </div>
      </div>
      {read.error && (
        <Alert variant="destructive">
          <AlertDescription>{read.error}</AlertDescription>
        </Alert>
      )}
      {!read.loading && !read.error && !company && (
        <Alert>
          <AlertDescription>
            No company is assigned to your account. Ask your administrator to review company access.
          </AlertDescription>
        </Alert>
      )}
      {company && <div key={company}>{children(company)}</div>}
    </div>
  );
}
