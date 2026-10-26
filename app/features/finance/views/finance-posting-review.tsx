"use client";
import { useRef, useState } from "react";
import type { FinanceNominalDetail, ClassifyChartNominalRequest } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function FinancePostingReview({ detail, onUpdated }: { detail: FinanceNominalDetail; onUpdated: () => void }) {
  const { api, session, csrfToken } = useSession(),
    notify = useActionFeedback();
  const [classification, setClassification] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  if (!detail.posting_classification) return null;
  const canReview =
    !!session?.user.roles.includes("super_administrator") &&
    session.user.permissions.includes("platform.approval.override") &&
    detail.state === "draft" &&
    !session?.impersonation &&
    session?.user.permissions.includes("finance.chart_template.classify") &&
    session.user.permissions.includes("finance.nominal.update");
  async function save() {
    if (
      !canReview ||
      !confirmed ||
      busy ||
      !detail.version ||
      (classification !== "ordinary" && classification !== "module_controlled")
    )
      return;
    const payload: ClassifyChartNominalRequest = {
      expected_version: detail.version,
      classification,
      reason:
        classification === "ordinary"
          ? "Explicitly reviewed as an ordinary manual-posting nominal."
          : "Explicitly retained as module-controlled; manual submission and posting remain blocked.",
    };
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: `chart-review-${crypto.randomUUID()}` };
    setBusy(true);
    setError("");
    try {
      await api.classifyChartNominal(detail.id, payload, csrfToken(), retry.current.key);
      notify("Nominal posting review saved successfully. No approval or transaction was posted.");
      setConfirmed(false);
      setClassification("");
      onUpdated();
    } catch (error) {
      setError(
        error instanceof ApiError ? error.message : "Posting review could not be saved. Retry the same selection.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="flex flex-col gap-3" aria-label="Nominal posting review">
      <Alert role="note">
        <AlertTitle>Posting review: {detail.posting_classification.replaceAll("_", " ")}</AlertTitle>
        <AlertDescription>
          Excel supplies account names and codes, not posting ownership. Only a Super Admin may classify and directly
          activate an ordinary nominal. No separate approver is required. Debtor, creditor, stock, tax and other
          module-controlled accounts must not be enabled as ordinary offsets without ownership review.
        </AlertDescription>
      </Alert>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {canReview && (
        <fieldset disabled={busy} className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Review posting eligibility</legend>
          <Label htmlFor="nominal-posting-classification">Posting classification</Label>
          <select
            id="nominal-posting-classification"
            value={classification}
            onChange={(event) => {
              setClassification(event.target.value);
              setConfirmed(false);
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Choose after reviewing this account</option>
            <option value="ordinary">Ordinary nominal — manual posting eligible after approval</option>
            <option value="module_controlled">Module-controlled — keep manual posting blocked</option>
          </select>
          <div className="flex items-start gap-3">
            <Checkbox
              id="confirm-posting-classification"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label htmlFor="confirm-posting-classification">
              I have reviewed this account&apos;s posting ownership. Save the classification, then use Activate now. No
              separate approval is required.
            </Label>
          </div>
          <Button disabled={busy || !confirmed || !classification} onClick={() => void save()}>
            Save posting review
          </Button>
        </fieldset>
      )}
    </section>
  );
}
