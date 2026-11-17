"use client";

import { useEffect, useState } from "react";
import type { JournalPostingEligibility, JournalDetail } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FinanceJournalsClient } from "../api/finance-journals-client";

export function useJournalPostingEligibility(
  client: Pick<FinanceJournalsClient, "postingEligibility">,
  companyId: string,
  date: string,
  enabled: boolean,
) {
  const key = `${companyId}:${date}`;
  const [result, setResult] = useState<{
    key: string;
    value?: JournalPostingEligibility;
    failed?: boolean;
  } | null>(null);
  useEffect(() => {
    if (!enabled || !companyId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let active = true;
    const timer = setTimeout(() => {
      client.postingEligibility({ company_id: companyId, journal_date: date }).then(
        (value) => active && setResult({ key, value }),
        () => active && setResult({ key, failed: true }),
      );
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, companyId, date, enabled, key]);
  const current = result?.key === key ? result : null;
  return {
    eligibility: current?.value,
    failed: !!current?.failed,
    loading: enabled && !!companyId && /^\d{4}-\d{2}-\d{2}$/.test(date) && !current,
    refresh: async () => {
      const value = await client.postingEligibility({ company_id: companyId, journal_date: date });
      setResult({ key, value });
      return value;
    },
  };
}

export function JournalPostingStatus({
  state,
  eligibility,
  loading = false,
  failed = false,
}: {
  state: JournalDetail["state"];
  eligibility?: JournalPostingEligibility;
  loading?: boolean;
  failed?: boolean;
}) {
  if (state === "posted" || state === "reversed") return null;
  return (
    <Alert role="status" aria-live="polite" variant={eligibility?.blocker ? "destructive" : "default"}>
      <AlertTitle>{state === "submitted" ? "Awaiting approval — not posted" : "Draft — not posted"}</AlertTitle>
      <AlertDescription className="text-foreground!">
        <p className="m-0">This Journal has not changed ledger or Bank balances.</p>
        {eligibility?.blocker ? <p className="m-0">{eligibility.blocker.message}</p> : null}
        {loading ? <p className="m-0">Checking the posting period…</p> : null}
        {failed ? (
          <p className="m-0">
            The posting period could not be checked. You can save a draft; approval will check it again.
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
