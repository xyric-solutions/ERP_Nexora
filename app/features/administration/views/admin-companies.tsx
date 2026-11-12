"use client";

import { useEffect, useState } from "react";

import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useAdministration } from "../api/use-administration";
import { AdminPage, AdminPanel, AdminTable, EmptyRow } from "../components/admin-page";

type Company = { id: string; code: string; name: string };

/**
 * Live, read-only: companies come from the HR company directory (the shared
 * organisation units, plan D8). Creating and editing companies needs the
 * `/api/v1/admin/companies` endpoints, which are not enabled yet.
 */
export function AdminCompaniesView({ onOpenStructure }: { onOpenStructure: () => void }) {
  const { client } = useAdministration();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    client
      .companies()
      .then((items) => {
        if (active) setCompanies(items);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [client]);

  return (
    <AdminPage
      title="Companies"
      description="Companies in your organisation. The same records are used by HR and Accounting."
      actions={
        <Button type="button" variant="outline" onClick={onOpenStructure}>
          Open structure
        </Button>
      }
    >
      <p className="m-0 flex items-start gap-2 rounded-[var(--nx-radius-md)] border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Read only for now. Adding and editing companies arrives with the Administration API; locations, projects and
          departments can already be maintained under Structure.
        </span>
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Companies could not be loaded. Check your connection and try again.</AlertDescription>
        </Alert>
      ) : (
        <AdminPanel
          title={companies ? `${companies.length} ${companies.length === 1 ? "company" : "companies"}` : "Companies"}
        >
          {companies === null ? (
            <div className="grid gap-2 p-4" aria-busy="true">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <AdminTable tableId="administration-companies" label="Companies">
              <thead>
                <tr>
                  <th scope="col" className="w-32">
                    Code
                  </th>
                  <th scope="col">Company</th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <EmptyRow colSpan={2}>No companies are available to your account.</EmptyRow>
                ) : (
                  companies.map((company) => (
                    <tr key={company.id}>
                      <td className="font-mono text-xs whitespace-nowrap text-muted-foreground">{company.code}</td>
                      <td className="font-medium">{company.name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </AdminTable>
          )}
        </AdminPanel>
      )}
    </AdminPage>
  );
}
