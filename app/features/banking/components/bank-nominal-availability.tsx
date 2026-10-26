"use client";

import type { BankPaymentNominalAccountDirectory } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function BankNominalAvailability({
  availability,
  search,
  empty,
  canReview,
  onReview,
  onRefresh,
}: {
  availability: BankPaymentNominalAccountDirectory["availability"] | null;
  search: string;
  empty: boolean;
  canReview: boolean;
  onReview?: () => void;
  onRefresh: () => void;
}) {
  const noEligible = availability ? availability.eligible_count === 0 : empty && !search.trim();
  const noMatches = !!search.trim() && (availability ? availability.matching_count === 0 : empty);
  if (!noEligible && !noMatches && !availability?.has_more) return null;
  return (
    <Alert role="status" aria-label="Nominal account availability">
      <AlertTitle>
        {noEligible
          ? "No eligible nominal accounts"
          : noMatches
            ? "No matching nominal accounts"
            : "More nominal accounts available"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        {noEligible ? (
          <>
            <p>
              The company Chart of Accounts is connected. Bank lines require active, classified ordinary nominals.
              Headers, Bank settlement accounts and protected control accounts cannot be selected.
            </p>
            {availability ? (
              <p>
                {availability.pending_approval_count} awaiting Super Admin review/activation;{" "}
                {availability.inactive_count} inactive; {availability.protected_count} protected accounts. These are
                company totals, not search results.
              </p>
            ) : null}
            <p>
              A Super Admin must review posting ownership and directly activate the account in Chart of Accounts, then
              refresh here. Nothing is activated automatically. Contact your Finance administrator if you cannot review
              accounts.
            </p>
          </>
        ) : noMatches ? (
          <p>No eligible account matches this search. Search by account code or name, or clear the search.</p>
        ) : (
          <p>
            The selector shows a bounded result set. Search by account code or name to find another eligible account.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
            Refresh nominal accounts
          </Button>
          {noEligible && canReview && onReview ? (
            <Button type="button" variant="outline" size="sm" onClick={onReview}>
              Review Chart of Accounts
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
