"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SessionCompany } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";

export function WorkspaceCompanySelect({
  beforeSwitch,
  onSwitched,
}: {
  beforeSwitch: () => boolean;
  onSwitched: () => void;
}) {
  const { activeCompany, listCompanies, selectCompany } = useSession();
  const id = useId();
  const [companies, setCompanies] = useState<SessionCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    listCompanies()
      .then((result) => {
        if (active) {
          setCompanies(result.items);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("Companies could not be loaded. Retry to switch company.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listCompanies, revision]);
  async function switchCompany(companyId: string) {
    if (lock.current || companyId === activeCompany?.id || !companies.some((item) => item.id === companyId)) return;
    if (!beforeSwitch()) return;
    lock.current = true;
    setSwitching(true);
    setError("");
    try {
      await selectCompany(companyId);
      onSwitched();
    } catch {
      setError("Company could not be changed. Your current company and form are preserved. Try again.");
    } finally {
      lock.current = false;
      setSwitching(false);
    }
  }
  if (!activeCompany) return null;
  return (
    <div className="relative w-36 shrink-0 xl:w-56">
      <label className="sr-only" htmlFor={id}>
        Company
      </label>
      <select
        id={id}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-busy={loading || switching}
        title={activeCompany.name}
        className="h-9 w-full min-w-0 truncate rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        value={activeCompany.id}
        disabled={loading || switching || companies.length < 2}
        onChange={(event) => void switchCompany(event.target.value)}
      >
        {!companies.some((item) => item.id === activeCompany.id) ? (
          <option value={activeCompany.id}>
            {activeCompany.code} · {activeCompany.name}
          </option>
        ) : null}
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.code} · {company.name}
          </option>
        ))}
      </select>
      {error ? (
        <div
          id={`${id}-error`}
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
        >
          <p>{error}</p>
          {!companies.length ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                setLoading(true);
                setRevision((value) => value + 1);
              }}
            >
              Retry companies
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
