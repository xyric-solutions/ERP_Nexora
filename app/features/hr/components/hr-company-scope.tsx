"use client";
import { useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { useAttendanceRead } from "./hr-workspace-controls";
export function HrCompanyScope({
  children,
  disabled = false,
}: {
  children: (company: string) => ReactNode;
  disabled?: boolean;
}) {
  const { api } = useSession(),
    client = new HrApiClient(api);
  const [revision, setRevision] = useState(0);
  // The company chosen at sign-in (the list holds only that company).
  const read = useAttendanceRead("hr-governed-companies:" + revision, () => client.companies());
  const company = read.data?.items[0]?.id ?? "";
  return (
    <div className="min-w-0 space-y-4">
      {read.error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            {read.error}
            <Button type="button" variant="outline" disabled={disabled} onClick={() => setRevision((v) => v + 1)}>
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </AlertDescription>
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
