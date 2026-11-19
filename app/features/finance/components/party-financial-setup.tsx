"use client";

import { useId, useState } from "react";
import { billPaymentTerms, type SubledgerParty, type SubledgerPartyConfigurationInput } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { workSelectClass } from "@/shared/ui/work-table";

export function PartyFinancialSetup({
  company,
  parties,
  baseCurrency,
  disabled,
  onSave,
}: {
  company: string;
  parties: SubledgerParty[];
  baseCurrency: string;
  disabled: boolean;
  onSave: (id: string, input: SubledgerPartyConfigurationInput) => void;
}) {
  const id = useId();
  const [partyId, setPartyId] = useState("");
  const [term, setTerm] = useState<SubledgerPartyConfigurationInput["payment_term"]>("immediate");
  const [limit, setLimit] = useState("");
  const [reason, setReason] = useState("");
  const party = parties.find((p) => p.id === partyId);
  return (
    <form
      className="grid content-start gap-3 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (party)
          onSave(party.id, {
            company_id: company,
            expected_version: party.financial_configuration?.version ?? 0,
            payment_term: term,
            credit_limit: party.kind === "customer" ? limit : null,
            reason,
          });
      }}
    >
      <h2 className="font-semibold">Financial terms &amp; credit</h2>
      <label className="grid gap-1 text-sm" htmlFor={`${id}-party`}>
        Financial customer / supplier
        <select
          id={`${id}-party`}
          className={workSelectClass}
          value={partyId}
          disabled={disabled}
          required
          onChange={(event) => {
            const selected = parties.find((p) => p.id === event.target.value);
            setPartyId(event.target.value);
            setTerm(selected?.financial_configuration ? selected.financial_configuration.payment_term : "immediate");
            setLimit(selected?.financial_configuration?.credit_limit ?? "");
            setReason("");
          }}
        >
          <option value="">Choose an existing financial account</option>
          {parties
            .filter((p) => p.status !== "inactive" && p.risk_status !== "blocked")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
        </select>
      </label>
      {party && (
        <>
          <p className="text-sm text-muted-foreground">
            {party.financial_configuration
              ? `Reviewed financial settings · version ${party.financial_configuration.version}`
              : "Financial settings require review."}{" "}
            Control accounts follow the company accounting policy.
          </p>
          {party.kind === "supplier" && party.supplier_credit_days !== undefined && (
            <p className="text-sm text-muted-foreground">
              Supplier profile credit days: {party.supplier_credit_days ?? "not configured"}. Review these when choosing
              financial terms below.
            </p>
          )}
          <label className="grid gap-1 text-sm" htmlFor={`${id}-term`}>
            Default payment terms
            <select
              id={`${id}-term`}
              className={workSelectClass}
              value={term ?? ""}
              disabled={disabled}
              onChange={(event) => {
                if (!event.target.value) {
                  setTerm(null);
                  return;
                }
                const selected = billPaymentTerms.find((t) => t.value === event.target.value);
                if (selected) setTerm(selected.value);
              }}
            >
              <option value="">Reviewed manual due dates</option>
              {billPaymentTerms.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {party.kind === "customer" && (
            <label className="grid gap-1 text-sm" htmlFor={`${id}-limit`}>
              Customer credit limit ({baseCurrency})
              <Input
                id={`${id}-limit`}
                inputMode="decimal"
                value={limit}
                disabled={disabled}
                required
                onChange={(e) => setLimit(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">
                Zero allows no additional credit. All invoice currencies count toward this functional-currency limit.
              </span>
            </label>
          )}
          <label className="grid gap-1 text-sm" htmlFor={`${id}-reason`}>
            Financial setup reason
            <Input
              id={`${id}-reason`}
              value={reason}
              minLength={3}
              maxLength={500}
              disabled={disabled}
              required
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={disabled || (party.kind === "customer" && !limit)}>
            Save financial terms
          </Button>
        </>
      )}
    </form>
  );
}
