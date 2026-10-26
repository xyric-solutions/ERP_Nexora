"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartCompanyPreview, FinanceNominalOptions } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FinanceNominalsClient } from "../api/finance-nominals-client";
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function message(error: unknown) {
  return error instanceof ApiError ? error.message : "The company preview could not be loaded. Please retry.";
}
export function FinanceChartCompanyPreview({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  const { api, session, csrfToken } = useSession(),
    client = useMemo(() => new FinanceNominalsClient(api), [api]);
  const permitted =
    !!session?.user.permissions.includes("finance.nominal.read") &&
    !!session.user.permissions.includes("finance.chart_template.read");
  const [companies, setCompanies] = useState<FinanceNominalOptions["companies"]>([]);
  const [currencies, setCurrencies] = useState<FinanceNominalOptions["currencies"]>([]);
  const [company, setCompany] = useState(""),
    [currency, setCurrency] = useState("");
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [result, setResult] = useState<ChartCompanyPreview | null>(null),
    [history, setHistory] = useState(["0"]);
  const [confirmed, setConfirmed] = useState(false),
    [success, setSuccess] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const notify = useActionFeedback();
  const canAdopt =
    !!session?.user.roles.includes("super_administrator") &&
    !!session.user.permissions.includes("platform.approval.override") &&
    !!session?.user.permissions.includes("finance.chart_template.adopt") &&
    !!session.user.permissions.includes("finance.nominal.create") &&
    !session.impersonation;
  useEffect(() => {
    if (!permitted) return;
    let active = true;
    client
      .options()
      .then((options) => {
        if (active) setCompanies(options.companies);
      })
      .catch((error) => {
        if (active) setError(message(error));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [client, permitted]);
  useEffect(() => {
    if (!permitted || !company) return;
    let active = true;
    client
      .options(company)
      .then((options) => {
        if (active) {
          setCurrencies(options.currencies);
          setCurrency(options.currencies.find((item) => item.is_base)?.code ?? "");
        }
      })
      .catch((error) => {
        if (active) setError(message(error));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [client, company, permitted]);
  async function preview(pages = ["0"]) {
    if (!company || !currency || busy) return;
    setBusy(true);
    setConfirmed(false);
    setError("");
    try {
      const cursor = pages[pages.length - 1]!;
      const response = await api.previewChartCompanyAdoption(
        templateId,
        `?${new URLSearchParams({ company_id: company, currency, limit: "50", ...(cursor !== "0" ? { cursor } : {}) })}`,
      );
      setResult(response);
      setHistory(pages);
    } catch (error) {
      setResult(null);
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function adopt() {
    if (!result || result.blocked || result.adoption_id || !confirmed || !canAdopt || busy) return;
    const payload = {
      company_id: company,
      currency,
      expected_template_version: result.template_version,
      preview_sha256: result.preview_sha256,
    };
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: `chart-adopt-${crypto.randomUUID()}` };
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const saved = await api.adoptCompanyChart(templateId, payload, csrfToken(), retry.current.key);
      const text = `Company Chart of Accounts saved: ${saved.created_nominals} nominal drafts created. Posting review and approval are required before use.`;
      setSuccess(text);
      notify(text);
      setResult((current) => (current ? { ...current, adoption_id: saved.adoption_id } : current));
      setConfirmed(false);
      try {
        const refreshed = await api.previewChartCompanyAdoption(
          templateId,
          `?${new URLSearchParams({ company_id: company, currency, limit: "50" })}`,
        );
        setResult(refreshed);
        setHistory(["0"]);
      } catch {
        // The write is already confirmed. A follow-up read failure must not be
        // presented as a failed save or permit an accidental duplicate import.
        setSuccess(`${text} Refresh the preview to load the latest counts.`);
      }
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent overlayClassName="z-[1300]" className="z-[1301] max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Company Chart of Accounts setup preview</DialogTitle>
          <DialogDescription>
            Preview the selected company, then explicitly create its nominal drafts. No automatic approval or financial
            posting.
          </DialogDescription>
        </DialogHeader>
        {!permitted ? (
          <Alert role="alert">
            <AlertDescription>Company Finance and central template read permissions are required.</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="adoption-company">Preview company</Label>
                <select
                  id="adoption-company"
                  className={selectClass}
                  value={company}
                  disabled={busy}
                  onChange={(event) => {
                    setCompany(event.target.value);
                    setCurrency("");
                    setCurrencies([]);
                    setResult(null);
                    setConfirmed(false);
                    setSuccess("");
                    setError("");
                    setBusy(!!event.target.value);
                  }}
                >
                  <option value="">Select an accessible company</option>
                  {companies.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="adoption-currency">Preview account currency</Label>
                <select
                  id="adoption-currency"
                  className={selectClass}
                  value={currency}
                  disabled={busy || !company}
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    setResult(null);
                    setConfirmed(false);
                    setSuccess("");
                    setError("");
                  }}
                >
                  <option value="">Select active currency</option>
                  {currencies.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button disabled={busy || !company || !currency} onClick={() => void preview()}>
              {busy ? "Loading preview…" : "Run company preview"}
            </Button>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert role="status">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
            {result && (
              <div className="flex flex-col gap-4" aria-busy={busy}>
                <p>
                  {result.company.name} · {result.currency}{" "}
                  <Badge variant="secondary">
                    {result.blocked ? "Configuration review required" : "No code conflicts found"}
                  </Badge>
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt>New categories</dt>
                    <dd>{result.totals.categories_to_create}</dd>
                  </div>
                  <div>
                    <dt>New sections</dt>
                    <dd>{result.totals.sections_to_create}</dd>
                  </div>
                  <div>
                    <dt>Nominal drafts</dt>
                    <dd>{result.totals.nominal_drafts_to_create}</dd>
                  </div>
                  <div>
                    <dt>Exact matches</dt>
                    <dd>{result.totals.exact_matches}</dd>
                  </div>
                  <div>
                    <dt>Conflicts</dt>
                    <dd>{result.totals.conflicts}</dd>
                  </div>
                  <div>
                    <dt>Bank references needing setup</dt>
                    <dd>{result.totals.bank_references}</dd>
                  </div>
                </dl>
                {result.blocking_issues.length > 0 && (
                  <Alert variant="destructive" role="alert">
                    <AlertTitle>Existing accounting setup must be preserved</AlertTitle>
                    <AlertDescription>
                      <ul className="flex list-disc flex-col gap-2 pl-4">
                        {result.blocking_issues.map((issue) => (
                          <li key={issue.code}>
                            {issue.code} · {issue.name}: {issue.message}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                <Alert role="note">
                  <AlertDescription>
                    Ordinary nominal drafts require posting-classification review and existing Finance approval before
                    use. Bank references do not automatically become company Bank accounts.
                  </AlertDescription>
                </Alert>
                {result.adoption_id ? (
                  <Alert role="status">
                    <AlertDescription>
                      This catalog has already been adopted for this company. Review its persisted nominal drafts in
                      Chart of Accounts; accounts will not be duplicated.
                    </AlertDescription>
                  </Alert>
                ) : (
                  canAdopt &&
                  !result.blocked && (
                    <fieldset disabled={busy} className="flex flex-col gap-3 rounded-md border border-border p-3">
                      <legend className="px-1 text-sm font-medium">Create company drafts</legend>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="confirm-chart-adoption"
                          checked={confirmed}
                          onCheckedChange={(checked) => setConfirmed(checked === true)}
                        />
                        <Label htmlFor="confirm-chart-adoption">
                          I confirm {result.company.name}, currency {result.currency}, and the previewed Excel
                          structure. Create inactive drafts only; do not approve or post.
                        </Label>
                      </div>
                      <Button disabled={!confirmed || busy} onClick={() => void adopt()}>
                        Create company drafts
                      </Button>
                    </fieldset>
                  )
                )}
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Company adoption preview definitions</caption>
                    <thead className="bg-muted">
                      <tr>
                        {["Code", "Definition", "Result", "Explanation"].map((label) => (
                          <th key={label} scope="col" className="p-2">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((item) => (
                        <tr key={item.key} className="border-t border-border">
                          <td className="p-2 font-mono">{item.code}</td>
                          <th scope="row" className="p-2 font-medium">
                            {item.name}
                          </th>
                          <td className="p-2">{item.status.replaceAll("_", " ")}</td>
                          <td className="min-w-60 p-2">{item.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || history.length === 1}
                    onClick={() => void preview(history.slice(0, -1))}
                  >
                    Previous preview page
                  </Button>
                  <span>Page {history.length}</span>
                  <Button
                    variant="outline"
                    disabled={busy || !result.next_cursor}
                    onClick={() => {
                      if (result.next_cursor) void preview([...history, result.next_cursor]);
                    }}
                  >
                    Next preview page
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
