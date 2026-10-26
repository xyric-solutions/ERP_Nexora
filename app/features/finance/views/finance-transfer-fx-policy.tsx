"use client";

import { useEffect, useMemo, useState } from "react";
import type { FinanceNominalSummary, TransferFxPolicy } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { FinanceCurrenciesClient } from "../api/finance-currencies-client";
import { FinanceNominalsClient } from "../api/finance-nominals-client";

function key() {
  return `web-transfer-fx-policy-${crypto.randomUUID()}`;
}

export function FinanceTransferFxPolicy({
  companies,
  companyId,
  onCompanyChange,
}: {
  companies: ReadonlyArray<{ id: string; code: string; name: string }>;
  companyId: string;
  onCompanyChange: (companyId: string) => void;
}) {
  const { api, session, csrfToken } = useSession();
  const notify = useActionFeedback();
  const currencies = useMemo(() => new FinanceCurrenciesClient(api), [api]);
  const nominalsClient = useMemo(() => new FinanceNominalsClient(api), [api]);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const canRead = permissions.has("finance.transfer_fx_policy.read");
  const canManage = canRead && permissions.has("finance.transfer_fx_policy.manage") && !session?.impersonation;
  const [nominals, setNominals] = useState<FinanceNominalSummary[]>([]);
  const [policy, setPolicy] = useState<TransferFxPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    gain: "",
    loss: "",
    rounding: "",
    charge: "",
    tolerance: "0.01",
    reason: "",
  });

  useEffect(() => {
    if (!canRead || !companyId) return;
    let active = true;
    Promise.allSettled([
      nominalsClient.list({
        company_id: companyId,
        account_status: "active",
        state: "active",
        nominal_kind: "general",
        sort_by: "code",
        sort_direction: "asc",
        limit: 100,
      }),
      currencies.policy(companyId),
    ]).then(([nominalResult, policyResult]) => {
      if (!active) return;
      setError("");
      setNominals(
        nominalResult.status === "fulfilled" ? nominalResult.value.items.filter((item) => !item.is_header) : [],
      );
      if (nominalResult.status === "rejected") setError("The Chart of Accounts directory could not be loaded.");
      if (policyResult.status === "fulfilled") {
        const value = policyResult.value;
        setPolicy(value);
        setForm({
          gain: value.fx_gain_nominal_id,
          loss: value.fx_loss_nominal_id,
          rounding: value.rounding_nominal_id,
          charge: value.bank_charge_nominal_id,
          tolerance: value.rounding_tolerance,
          reason: "",
        });
      } else {
        setPolicy(null);
        setForm({ gain: "", loss: "", rounding: "", charge: "", tolerance: "0.01", reason: "" });
        if (!(policyResult.reason instanceof ApiError && policyResult.reason.status === 404))
          setError("The Bank Transfer FX policy could not be loaded.");
      }
    });
    return () => {
      active = false;
    };
  }, [canRead, companyId, currencies, nominalsClient]);

  if (!canRead) return null;

  async function save() {
    if (!companyId || busy) return;
    setBusy(true);
    setError("");
    try {
      await currencies.savePolicy(
        {
          company_id: companyId,
          ...(policy ? { expected_version: policy.version } : {}),
          fx_gain_nominal_id: form.gain,
          fx_loss_nominal_id: form.loss,
          rounding_nominal_id: form.rounding,
          bank_charge_nominal_id: form.charge,
          rounding_tolerance: form.tolerance,
          reason: form.reason.trim(),
        },
        csrfToken(),
        key(),
      );
      notify("Bank Transfer FX policy saved.");
      const value = await currencies.policy(companyId);
      setPolicy(value);
      setForm((current) => ({ ...current, reason: "" }));
    } catch {
      setError("The Bank Transfer FX policy could not be saved safely.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-lg border border-border bg-card">
      <summary className="cursor-pointer px-4 py-3 font-semibold">Bank Transfer FX policy</summary>
      <div className="border-t border-border p-4">
        <p className="text-sm text-muted-foreground">
          Map exchange differences, rounding and bank charges to active Chart of Accounts nominals.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="transfer-policy-company">Company</Label>
            <select
              id="transfer-policy-company"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={companyId}
              onChange={(event) => onCompanyChange(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} · {company.name}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ["gain", "FX gain nominal"],
              ["loss", "FX loss nominal"],
              ["rounding", "Rounding nominal"],
              ["charge", "Bank charge nominal"],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="grid gap-2">
              <Label htmlFor={`transfer-policy-${field}`}>{label} *</Label>
              <select
                id={`transfer-policy-${field}`}
                className="h-10 rounded-md border border-input bg-background px-3"
                value={form[field]}
                onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
              >
                <option value="">Select nominal</option>
                {nominals.map((nominal) => (
                  <option key={nominal.id} value={nominal.id}>
                    {nominal.code} · {nominal.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="grid gap-2">
            <Label htmlFor="transfer-policy-tolerance">Rounding tolerance *</Label>
            <Input
              id="transfer-policy-tolerance"
              inputMode="decimal"
              value={form.tolerance}
              onChange={(event) => setForm((current) => ({ ...current, tolerance: event.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="transfer-policy-reason">Reason *</Label>
            <Input
              id="transfer-policy-reason"
              maxLength={500}
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
            />
          </div>
        </div>
        {canManage ? (
          <Button
            className="mt-4"
            disabled={
              busy || !form.gain || !form.loss || !form.rounding || !form.charge || form.reason.trim().length < 3
            }
            onClick={() => void save()}
          >
            {busy ? "Saving…" : policy ? "Update policy" : "Create policy"}
          </Button>
        ) : null}
      </div>
    </details>
  );
}
