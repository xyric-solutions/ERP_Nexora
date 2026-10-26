"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CurrencyCatalogItem,
  CurrencyRate,
  FinanceNominalSummary,
  TenantCurrency,
  TransferFxPolicy,
} from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { BankingApiClient } from "@/features/banking/api/banking-client";
import { FinanceCurrenciesClient } from "../api/finance-currencies-client";
import { FinanceNominalsClient } from "../api/finance-nominals-client";

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
function idempotency(action: string) {
  return `web-finance-currency-${action}-${crypto.randomUUID()}`;
}
function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`
    : "The Finance configuration request failed safely.";
}

export function FinanceCurrencies() {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const notify = useActionFeedback();
  const client = useMemo(() => new FinanceCurrenciesClient(api), [api]);
  const banking = useMemo(() => new BankingApiClient(api), [api]);
  const nominalsClient = useMemo(() => new FinanceNominalsClient(api), [api]);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const canRead = permissions.has("platform.currency.read") && permissions.has("platform.currency_rate.read");
  const canManageCurrency = permissions.has("platform.currency.manage") && !session?.impersonation;
  const canManageRate = permissions.has("platform.currency_rate.manage") && !session?.impersonation;
  const canReadPolicy = permissions.has("finance.transfer_fx_policy.read");
  const canManagePolicy =
    canReadPolicy && permissions.has("finance.transfer_fx_policy.manage") && !session?.impersonation;
  const [catalog, setCatalog] = useState<CurrencyCatalogItem[]>([]);
  const [currencies, setCurrencies] = useState<TenantCurrency[]>([]);
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState("");
  const [nominals, setNominals] = useState<FinanceNominalSummary[]>([]);
  const [policy, setPolicy] = useState<TransferFxPolicy | null>(null);
  const [sourceCurrency, setSourceCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [statusReason, setStatusReason] = useState("");
  const [correctingRate, setCorrectingRate] = useState<CurrencyRate | null>(null);
  const [correctedRate, setCorrectedRate] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [policyForm, setPolicyForm] = useState({
    gain: "",
    loss: "",
    rounding: "",
    charge: "",
    tolerance: "0.01",
    reason: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catalogResult, currencyResult, rateResult, companyResult] = await Promise.all([
        client.catalog({ limit: 100 }),
        client.currencies({ limit: 100 }),
        client.rates({ limit: 100 }),
        banking.companies(),
      ]);
      setCatalog(catalogResult.items);
      setCurrencies(currencyResult.items);
      setRates(rateResult.items);
      setCompanies(companyResult.items);
      setCompanyId((current) => current || companyResult.items[0]?.id || "");
      setSourceCurrency(
        (current) =>
          current || currencyResult.items.find((item) => !item.is_base && item.status === "active")?.code || "",
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [banking, client]);

  useEffect(() => {
    if (sessionLoading || !session || !canRead) return;
    const timer = window.setTimeout(() => void loadBase(), 0);
    return () => window.clearTimeout(timer);
  }, [sessionLoading, session, canRead, loadBase]);

  useEffect(() => {
    if (!companyId || !session) return;
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
      canReadPolicy ? client.policy(companyId) : Promise.resolve(null),
    ]).then(([nominalResult, policyResult]) => {
      if (!active) return;
      setNominals(
        nominalResult.status === "fulfilled" ? nominalResult.value.items.filter((item) => !item.is_header) : [],
      );
      if (nominalResult.status === "rejected") setError(errorMessage(nominalResult.reason));
      if (policyResult.status === "fulfilled" && policyResult.value) {
        const value = policyResult.value;
        setPolicy(value);
        setPolicyForm({
          gain: value.fx_gain_nominal_id,
          loss: value.fx_loss_nominal_id,
          rounding: value.rounding_nominal_id,
          charge: value.bank_charge_nominal_id,
          tolerance: value.rounding_tolerance,
          reason: "",
        });
      } else {
        setPolicy(null);
        setPolicyForm({ gain: "", loss: "", rounding: "", charge: "", tolerance: "0.01", reason: "" });
        if (
          policyResult.status === "rejected" &&
          !(policyResult.reason instanceof ApiError && policyResult.reason.status === 404)
        ) {
          setError(errorMessage(policyResult.reason));
        }
      }
    });
    return () => {
      active = false;
    };
  }, [canReadPolicy, client, companyId, nominalsClient, session]);

  async function mutate(action: string, operation: () => Promise<unknown>, success: string) {
    setBusy(action);
    setError("");
    try {
      await operation();
      notify(success);
      await loadBase();
      if (action.startsWith("currency-") || action.startsWith("rate-status-")) setStatusReason("");
      if (action.startsWith("correct-rate-")) {
        setCorrectingRate(null);
        setCorrectedRate("");
        setCorrectionReason("");
      }
      if (action === "save-policy" && companyId) {
        const value = await client.policy(companyId);
        setPolicy(value);
        setPolicyForm({
          gain: value.fx_gain_nominal_id,
          loss: value.fx_loss_nominal_id,
          rounding: value.rounding_nominal_id,
          charge: value.bank_charge_nominal_id,
          tolerance: value.rounding_tolerance,
          reason: "",
        });
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  if (sessionLoading)
    return <Notice title="Checking Finance access" detail="Confirming Currency Master permissions." />;
  if (!session) return <Notice title="Sign in required" detail="An authenticated Nexora session is required." />;
  if (!canRead) return <Notice title="Permission required" detail="Currency and rate read permissions are required." />;

  const base = currencies.find((item) => item.is_base);
  return (
    <div className="space-y-5" aria-busy={loading || Boolean(busy)}>
      <header className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Finance &amp; Accounting</p>
        <h1 className="mt-1 text-2xl font-semibold">Currencies &amp; Transfer FX</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Adopt from the governed 20-currency catalog, maintain effective-dated rates, and connect Transfer differences
          and charges to Chart of Accounts nominals.
        </p>
      </header>
      {error ? <Notice title="Configuration could not be completed" detail={error} destructive /> : null}
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Major currency catalog</h2>
          <p className="text-sm text-muted-foreground">
            Currencies are available globally but become usable only after explicit tenant adoption.
          </p>
          {canManageCurrency || canManageRate ? (
            <label htmlFor="currency-status-reason" className="mt-3 grid max-w-xl gap-1 text-sm font-medium">
              Status change reason *
              <Input
                id="currency-status-reason"
                value={statusReason}
                maxLength={500}
                placeholder="Explain why this status is changing"
                onChange={(event) => setStatusReason(event.target.value)}
              />
            </label>
          ) : null}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {catalog.map((item) => (
            <div key={item.code} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <strong>{item.code}</strong>
                <Badge variant={item.adopted ? "default" : "outline"}>
                  {item.adopted ? item.adopted_status : "available"}
                </Badge>
              </div>
              <p className="mt-1 text-sm">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.decimal_places} decimal places{item.is_base ? " · Base" : ""}
              </p>
              {!item.adopted && canManageCurrency ? (
                <Button
                  className="mt-3 w-full"
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void mutate(
                      `adopt-${item.code}`,
                      () => client.adopt({ code: item.code }, csrfToken(), idempotency(`adopt-${item.code}`)),
                      `${item.code} adopted.`,
                    )
                  }
                >
                  Adopt
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Tenant currencies</h2>
          <p className="text-sm text-muted-foreground">
            Base currency: {base?.code ?? "Not configured"}. Active Bank Accounts and rates prevent unsafe deactivation.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                {["Code", "Name", "Decimals", "Base", "Status", "Action"].map((item) => (
                  <th key={item} className="px-4 py-3">
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currencies.map((item) => (
                <tr key={item.code} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold">{item.code}</td>
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3">{item.decimal_places}</td>
                  <td className="px-4 py-3">{item.is_base ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={item.status === "active" ? "default" : "outline"}>{item.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {canManageCurrency && !item.is_base ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(busy) || statusReason.trim().length < 3}
                        onClick={() =>
                          void mutate(
                            `currency-${item.code}`,
                            () =>
                              client.changeCurrency(
                                item.code,
                                {
                                  expected_version: item.version,
                                  status: item.status === "active" ? "inactive" : "active",
                                  reason: statusReason.trim(),
                                },
                                csrfToken(),
                                idempotency(`currency-${item.code}`),
                              ),
                            `${item.code} status updated.`,
                          )
                        }
                      >
                        {item.status === "active" ? "Deactivate" : "Activate"}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Effective-dated rates</h2>
          <p className="text-sm text-muted-foreground">
            Rates express one source currency in {base?.code ?? "the tenant base currency"}. Corrections preserve
            revision history.
          </p>
        </div>
        {canManageRate ? (
          <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            <label className="grid gap-1 text-sm font-medium">
              Source currency
              <select
                className="h-10 rounded-md border border-input bg-background px-3"
                value={sourceCurrency}
                onChange={(event) => setSourceCurrency(event.target.value)}
              >
                <option value="">Select currency</option>
                {currencies
                  .filter((item) => item.status === "active" && !item.is_base)
                  .map((item) => (
                    <option key={item.code}>{item.code}</option>
                  ))}
              </select>
            </label>
            <label htmlFor="currency-rate-value" className="grid gap-1 text-sm font-medium">
              Rate *
              <Input
                id="currency-rate-value"
                inputMode="decimal"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
              />
            </label>
            <label htmlFor="currency-rate-effective-date" className="grid gap-1 text-sm font-medium">
              Effective date *
              <Input
                id="currency-rate-effective-date"
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </label>
            <Button
              disabled={Boolean(busy) || !sourceCurrency || !rate}
              onClick={() =>
                void mutate(
                  "create-rate",
                  () =>
                    client.createRate(
                      { source_currency: sourceCurrency, rate, effective_date: effectiveDate },
                      csrfToken(),
                      idempotency("create-rate"),
                    ),
                  `${sourceCurrency} rate created.`,
                )
              }
            >
              Add rate
            </Button>
          </div>
        ) : null}
        {correctingRate ? (
          <div className="border-b border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold">
                  Correct {correctingRate.source_currency}/{correctingRate.target_currency} rate
                </h3>
                <p className="text-sm text-muted-foreground">
                  The current revision remains immutable and will be superseded by a new active revision for the same
                  effective date.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCorrectingRate(null);
                  setCorrectedRate("");
                  setCorrectionReason("");
                }}
              >
                Cancel
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
              <label htmlFor="corrected-currency-rate" className="grid gap-1 text-sm font-medium">
                Corrected rate *
                <Input
                  id="corrected-currency-rate"
                  inputMode="decimal"
                  value={correctedRate}
                  onChange={(event) => setCorrectedRate(event.target.value)}
                />
              </label>
              <label htmlFor="currency-rate-correction-reason" className="grid gap-1 text-sm font-medium">
                Correction reason *
                <Input
                  id="currency-rate-correction-reason"
                  value={correctionReason}
                  maxLength={500}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                />
              </label>
              <Button
                type="button"
                disabled={Boolean(busy) || !correctedRate || correctionReason.trim().length < 3}
                onClick={() =>
                  void mutate(
                    `correct-rate-${correctingRate.id}`,
                    () =>
                      client.correctRate(
                        correctingRate.id,
                        {
                          expected_version: correctingRate.version,
                          rate: correctedRate,
                          reason: correctionReason.trim(),
                        },
                        csrfToken(),
                        idempotency(`correct-rate-${correctingRate.id}`),
                      ),
                    "Rate correction created as a new revision.",
                  )
                }
              >
                Save correction
              </Button>
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                {["Pair", "Rate", "Effective date", "Status", "Revision", "Action"].map((item) => (
                  <th key={item} className="px-4 py-3">
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rates.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold">
                    {item.source_currency}/{item.target_currency}
                  </td>
                  <td className="px-4 py-3">{item.rate}</td>
                  <td className="px-4 py-3">{item.effective_date}</td>
                  <td className="px-4 py-3">
                    <Badge variant={item.status === "active" ? "default" : "outline"}>{item.status}</Badge>
                  </td>
                  <td className="px-4 py-3">v{item.version}</td>
                  <td className="px-4 py-3">
                    {canManageRate && item.status !== "superseded" ? (
                      <div className="flex flex-wrap gap-2">
                        {item.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(busy)}
                            onClick={() => {
                              setCorrectingRate(item);
                              setCorrectedRate(item.rate);
                              setCorrectionReason("");
                            }}
                          >
                            Correct
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(busy) || statusReason.trim().length < 3}
                          onClick={() =>
                            void mutate(
                              `rate-status-${item.id}`,
                              () =>
                                client.changeRate(
                                  item.id,
                                  {
                                    expected_version: item.version,
                                    status: item.status === "active" ? "inactive" : "active",
                                    reason: statusReason.trim(),
                                  },
                                  csrfToken(),
                                  idempotency(`rate-status-${item.id}`),
                                ),
                              "Rate status updated.",
                            )
                          }
                        >
                          {item.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {canReadPolicy ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Bank Transfer FX policy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose active, posting-capable Chart of Accounts nominals for differences, rounding and bank charges.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Company
              <select
                className="h-10 rounded-md border border-input bg-background px-3"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.code} · {company.name}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["gain", "FX gain nominal"],
                ["loss", "FX loss nominal"],
                ["rounding", "Rounding nominal"],
                ["charge", "Bank charge nominal"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="grid gap-1 text-sm font-medium">
                {label} *
                <select
                  className="h-10 rounded-md border border-input bg-background px-3"
                  value={policyForm[key]}
                  onChange={(event) => setPolicyForm((current) => ({ ...current, [key]: event.target.value }))}
                >
                  <option value="">Select nominal</option>
                  {nominals.map((nominal) => (
                    <option key={nominal.id} value={nominal.id}>
                      {nominal.code} · {nominal.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label htmlFor="transfer-rounding-tolerance" className="grid gap-1 text-sm font-medium">
              Rounding tolerance *
              <Input
                id="transfer-rounding-tolerance"
                inputMode="decimal"
                value={policyForm.tolerance}
                onChange={(event) => setPolicyForm((current) => ({ ...current, tolerance: event.target.value }))}
              />
            </label>
            <label htmlFor="transfer-policy-reason" className="grid gap-1 text-sm font-medium">
              Reason *
              <Input
                id="transfer-policy-reason"
                value={policyForm.reason}
                maxLength={500}
                onChange={(event) => setPolicyForm((current) => ({ ...current, reason: event.target.value }))}
              />
            </label>
          </div>
          {canManagePolicy ? (
            <Button
              className="mt-4"
              disabled={
                Boolean(busy) ||
                !companyId ||
                !policyForm.gain ||
                !policyForm.loss ||
                !policyForm.rounding ||
                !policyForm.charge ||
                policyForm.reason.trim().length < 3
              }
              onClick={() =>
                void mutate(
                  "save-policy",
                  () =>
                    client.savePolicy(
                      {
                        company_id: companyId,
                        ...(policy ? { expected_version: policy.version } : {}),
                        fx_gain_nominal_id: policyForm.gain,
                        fx_loss_nominal_id: policyForm.loss,
                        rounding_nominal_id: policyForm.rounding,
                        bank_charge_nominal_id: policyForm.charge,
                        rounding_tolerance: policyForm.tolerance,
                        reason: policyForm.reason.trim(),
                      },
                      csrfToken(),
                      idempotency("save-policy"),
                    ),
                  "Bank Transfer FX policy saved.",
                )
              }
            >
              {policy ? "Update policy" : "Create policy"}
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Notice({ title, detail, destructive = false }: { title: string; detail: string; destructive?: boolean }) {
  return (
    <Alert variant={destructive ? "destructive" : "default"}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
