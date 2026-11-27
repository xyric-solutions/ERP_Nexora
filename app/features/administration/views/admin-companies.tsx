"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useAdministration } from "../api/use-administration";
import { AdminPage, AdminPanel, AdminTable, EmptyRow } from "../components/admin-page";
import { BusinessSetupSheet } from "../components/business-setup-sheet";

type Company = { id: string; code: string; name: string };

/** Companies share HR organisation identities. Accounting setup is persisted
 * through the Finance API and may be initialized only by a live Super Admin. */
export function AdminCompaniesView({ onOpenStructure }: { onOpenStructure: () => void }) {
  const { client, session } = useAdministration();
  const canSetup =
    !!session?.user.roles.includes("super_administrator") &&
    !!session.user.permissions.includes("finance.chart_template.admin");
  const [setupCompany, setSetupCompany] = useState<Company | null | undefined>(undefined);
  const [revision, setRevision] = useState(0);
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
  }, [client, revision]);

  return (
    <AdminPage
      title="Companies"
      description="Companies in your organisation. The same records are used by HR and Accounting."
      actions={
        <>
          <Button type="button" variant="outline" onClick={onOpenStructure}>
            Open structure
          </Button>
          {canSetup && (
            <Button type="button" onClick={() => setSetupCompany(null)}>
              Create company
            </Button>
          )}
        </>
      }
    >
      {setupCompany !== undefined && (
        <BusinessSetupSheet
          company={setupCompany}
          onClose={() => setSetupCompany(undefined)}
          onCompleted={() => setRevision((value) => value + 1)}
        />
      )}
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
                  {canSetup && <th scope="col">Accounting</th>}
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <EmptyRow colSpan={canSetup ? 3 : 2}>No companies are available to your account.</EmptyRow>
                ) : (
                  companies.map((company) => (
                    <tr key={company.id}>
                      <td className="font-mono text-xs whitespace-nowrap text-muted-foreground">{company.code}</td>
                      <td className="font-medium">{company.name}</td>
                      {canSetup && (
                        <td>
                          <Button type="button" size="sm" variant="outline" onClick={() => setSetupCompany(company)}>
                            Accounting setup
                          </Button>
                        </td>
                      )}
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
