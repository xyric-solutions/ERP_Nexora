"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CompanyCurrency,
  CompanyCurrencyProfile,
  CompanyCurrencyRate,
  CountryCurrencyMapping,
} from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { BankingApiClient } from "@/features/banking/api/banking-client";
import { FinanceCurrenciesClient } from "../api/finance-currencies-client";
import { FinanceTransferFxPolicy } from "./finance-transfer-fx-policy";

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function idempotency(action: string) {
  return `web-company-currency-${action}-${crypto.randomUUID()}`;
}

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`
    : "The company currency request failed safely.";
}

type FormMode = "base" | "activate" | "rate" | null;

export function FinanceCurrencies() {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const notify = useActionFeedback();
  const client = useMemo(() => new FinanceCurrenciesClient(api), [api]);
  const banking = useMemo(() => new BankingApiClient(api), [api]);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const canRead =
    permissions.has("finance.company_currency_profile.read") &&
    permissions.has("finance.company_currency.read") &&
    permissions.has("finance.company_currency_rate.read");
  const canManageProfile = permissions.has("finance.company_currency_profile.manage") && !session?.impersonation;
  const canManageCurrency = permissions.has("finance.company_currency.manage") && !session?.impersonation;
  const canManageRate = permissions.has("finance.company_currency_rate.manage") && !session?.impersonation;

  const [companies, setCompanies] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState("");
  const [profile, setProfile] = useState<CompanyCurrencyProfile | null>(null);
  const [currencies, setCurrencies] = useState<CompanyCurrency[]>([]);
  const [rates, setRates] = useState<CompanyCurrencyRate[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [detailCurrency, setDetailCurrency] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [correctingRate, setCorrectingRate] = useState<CompanyCurrencyRate | null>(null);
  const [correctedRate, setCorrectedRate] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [countries, setCountries] = useState<CountryCurrencyMapping[]>([]);
  const [selectedCountryMappings, setSelectedCountryMappings] = useState<CountryCurrencyMapping[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [rate, setRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());

  const loadCompany = useCallback(
    async (selectedCompany: string, cursor?: string) => {
      if (!selectedCompany) return;
      setLoading(true);
      setError("");
      try {
        const [profileResult, currencyResult, rateResult] = await Promise.all([
          client.profile(selectedCompany).catch((caught: unknown) => {
            if (caught instanceof ApiError && caught.status === 404) return null;
            throw caught;
          }),
          client.companyCurrencies({
            company_id: selectedCompany,
            ...(search.trim() ? { search: search.trim() } : {}),
            ...(status ? { status } : {}),
            limit: 25,
            ...(cursor ? { cursor } : {}),
          }),
          client.companyRates({ company_id: selectedCompany, limit: 100 }),
        ]);
        setProfile(profileResult);
        setCurrencies(cursor ? (current) => [...current, ...currencyResult.items] : currencyResult.items);
        setNextCursor(currencyResult.next_cursor);
        setRates(rateResult.items);
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        setLoading(false);
      }
    },
    [client, search, status],
  );

  useEffect(() => {
    if (sessionLoading || !session || !canRead) return;
    let active = true;
    banking
      .companies()
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
      })
      .catch((caught) => active && setError(errorMessage(caught)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [banking, canRead, session, sessionLoading]);

  useEffect(() => {
    if (!companyId || !canRead) return;
    const timer = window.setTimeout(() => void loadCompany(companyId), 200);
    return () => window.clearTimeout(timer);
  }, [canRead, companyId, loadCompany]);

  useEffect(() => {
    if (!formMode || (!canManageProfile && !canManageCurrency && !canManageRate)) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setCountriesLoading(true);
      client
        .countries({ ...(countrySearch.trim() ? { search: countrySearch.trim() } : {}), limit: 50 })
        .then((result) => active && setCountries(result.items))
        .catch((caught) => active && setError(errorMessage(caught)))
        .finally(() => active && setCountriesLoading(false));
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canManageCurrency, canManageProfile, canManageRate, client, countrySearch, formMode]);

  const countryOptions = useMemo(() => {
    const seen = new Set<string>();
    const activeSelection = selectedCountryMappings.some((item) => item.country_code === countryCode)
      ? selectedCountryMappings
      : [];
    return [...activeSelection, ...countries].flatMap((item) => {
      if (seen.has(item.country_code)) return [];
      seen.add(item.country_code);
      return [{ value: item.country_code, label: `${item.country_name} (${item.country_code})` }];
    });
  }, [countries, countryCode, selectedCountryMappings]);
  const mappedCurrencies = useMemo(() => {
    const retained = selectedCountryMappings.filter((item) => item.country_code === countryCode);
    return retained.length > 0 ? retained : countries.filter((item) => item.country_code === countryCode);
  }, [countries, countryCode, selectedCountryMappings]);

  function resetForm(mode: FormMode, sourceCurrency = "") {
    setFormMode(mode);
    setCountrySearch("");
    setSelectedCountryMappings([]);
    setCountryCode("");
    setCurrencyCode(sourceCurrency);
    setRate("");
    setEffectiveDate(today());
  }

  function chooseCountry(value: string) {
    setCountryCode(value);
    const currentMappings = countries.filter((item) => item.country_code === value);
    const mappings =
      currentMappings.length > 0
        ? currentMappings
        : selectedCountryMappings.filter((item) => item.country_code === value);
    setSelectedCountryMappings(mappings);
    const preferred = mappings.find((item) => item.is_primary) ?? mappings[0];
    setCurrencyCode(preferred?.currency_code ?? "");
  }

  async function mutate(action: string, operation: () => Promise<unknown>, success: string) {
    setBusy(action);
    setError("");
    try {
      await operation();
      notify(success);
      setFormMode(null);
      setStatusReason("");
      setCorrectingRate(null);
      await loadCompany(companyId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function saveForm() {
    if (!companyId || !countryCode || !currencyCode || !formMode) return;
    if (formMode === "base") {
      await mutate(
        "configure-profile",
        () =>
          client.configureProfile(
            companyId,
            { company_id: companyId, base_country_code: countryCode, base_currency: currencyCode },
            csrfToken(),
            idempotency("configure-profile"),
          ),
        `${currencyCode} configured as the company base currency.`,
      );
    } else if (formMode === "activate" && rate) {
      await mutate(
        "activate-currency",
        () =>
          client.activateCompanyCurrency(
            {
              company_id: companyId,
              country_code: countryCode,
              currency_code: currencyCode,
              rate,
              effective_date: effectiveDate,
            },
            csrfToken(),
            idempotency("activate-currency"),
          ),
        `${currencyCode} activated for this company.`,
      );
    } else if (formMode === "rate" && rate) {
      await mutate(
        "create-rate",
        () =>
          client.createCompanyRate(
            { company_id: companyId, source_currency: currencyCode, rate, effective_date: effectiveDate },
            csrfToken(),
            idempotency("create-rate"),
          ),
        `${currencyCode} rate added.`,
      );
    }
  }

  if (sessionLoading)
    return <Notice title="Checking Finance access" detail="Confirming company currency permissions." />;
  if (!session) return <Notice title="Sign in required" detail="An authenticated Nexora session is required." />;
  if (!canRead)
    return (
      <Notice
        title="Permission required"
        detail="Company currency profile, currency and rate read permissions are required."
      />
    );

  const detailRates = rates.filter((item) => item.source_currency === detailCurrency);
  return (
    <div className="space-y-5" aria-busy={loading || Boolean(busy)}>
      <header className="border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-primary">Home / Finance / Currencies</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Company currencies</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Maintain one reporting base currency and the foreign currencies used by this company’s bank accounts.
            </p>
          </div>
          {profile && canManageCurrency ? <Button onClick={() => resetForm("activate")}>＋ Add New</Button> : null}
        </div>
      </header>

      {error ? <Notice title="Currency request could not be completed" detail={error} destructive /> : null}

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,22rem)_1fr] lg:items-end">
          <div className="grid gap-2">
            <Label htmlFor="company-currency-company">Company *</Label>
            <select
              id="company-currency-company"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setDetailCurrency("");
              }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} · {company.name}
                </option>
              ))}
            </select>
          </div>
          {profile ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
              <span className="text-sm text-muted-foreground">Financial reporting base</span>
              <strong>
                {profile.base_currency} · {profile.base_currency_name}
              </strong>
              <Badge variant="outline">{profile.locked ? "Locked after posting" : "Configured"}</Badge>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <strong>Base currency required</strong>
                <p className="text-sm text-muted-foreground">
                  Choose the currency used for this company’s financial reports before posting.
                </p>
              </div>
              {canManageProfile ? <Button onClick={() => resetForm("base")}>Configure base currency</Button> : null}
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[minmax(12rem,20rem)_12rem_auto] md:items-end">
          <div className="grid gap-2">
            <Label htmlFor="company-currency-search">Search</Label>
            <Input
              id="company-currency-search"
              value={search}
              placeholder="Country or currency code"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company-currency-status">Status</Label>
            <select
              id="company-currency-status"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setStatus("");
            }}
          >
            Clear
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-sky-500 text-left text-white">
              <tr>
                {[
                  "Base Cur. Code",
                  "Base Country",
                  "FX Code",
                  "FX Country",
                  "Exchange Rate",
                  "Effective Date",
                  "Status",
                  "Action",
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currencies.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 font-semibold">{profile?.base_currency ?? "—"}</td>
                  <td className="px-4 py-3">{profile?.base_country_name ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold">{item.currency_code}</td>
                  <td className="px-4 py-3">{item.selected_country_name}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.is_base ? "1" : (item.latest_rate ?? "Rate required")}
                  </td>
                  <td className="px-4 py-3">{item.latest_rate_effective_date ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={item.status === "active" ? "default" : "outline"}>{item.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDetailCurrency(item.currency_code)}>
                        View
                      </Button>
                      {!item.is_base && canManageRate ? (
                        <Button size="sm" variant="outline" onClick={() => resetForm("rate", item.currency_code)}>
                          Add rate
                        </Button>
                      ) : null}
                      {!item.is_base && canManageCurrency ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(busy) || statusReason.trim().length < 3}
                          onClick={() =>
                            void mutate(
                              `currency-${item.currency_code}`,
                              () =>
                                client.changeCompanyCurrency(
                                  companyId,
                                  item.currency_code,
                                  {
                                    expected_version: item.version,
                                    status: item.status === "active" ? "inactive" : "active",
                                    reason: statusReason.trim(),
                                  },
                                  csrfToken(),
                                  idempotency(`currency-${item.currency_code}`),
                                ),
                              `${item.currency_code} status updated.`,
                            )
                          }
                        >
                          {item.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && currencies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No company currencies match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">{currencies.length} currency record(s) loaded</span>
          {nextCursor ? (
            <Button variant="outline" onClick={() => void loadCompany(companyId, nextCursor)}>
              Load more
            </Button>
          ) : null}
        </div>
      </section>

      {(canManageCurrency || canManageRate) && profile ? (
        <div className="grid max-w-2xl gap-2">
          <Label htmlFor="company-currency-status-reason">Reason for status changes *</Label>
          <Input
            id="company-currency-status-reason"
            value={statusReason}
            maxLength={500}
            placeholder="Required before activating or deactivating a currency"
            onChange={(event) => setStatusReason(event.target.value)}
          />
        </div>
      ) : null}

      {detailCurrency ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="font-semibold">{detailCurrency} rate history</h2>
              <p className="text-sm text-muted-foreground">
                Immutable revisions expressed as 1 {detailCurrency} = X {profile?.base_currency}.
              </p>
            </div>
            <Button variant="ghost" onClick={() => setDetailCurrency("")}>
              Close
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {["Rate", "Effective date", "Status", "Revision", "Action"].map((heading) => (
                    <th key={heading} className="px-4 py-3">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailRates.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-3 tabular-nums">
                      1 {item.source_currency} = {item.rate} {item.target_currency}
                    </td>
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
                                  client.changeCompanyRate(
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
                            {item.status === "active" ? "Deactivate rate" : "Activate rate"}
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
      ) : null}

      {correctingRate ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">
                Correct {correctingRate.source_currency}/{correctingRate.target_currency} rate
              </h2>
              <p className="text-sm text-muted-foreground">The original revision remains immutable.</p>
            </div>
            <Button variant="ghost" onClick={() => setCorrectingRate(null)}>
              Cancel
            </Button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="corrected-currency-rate">Corrected rate *</Label>
              <Input
                id="corrected-currency-rate"
                inputMode="decimal"
                value={correctedRate}
                onChange={(event) => setCorrectedRate(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency-rate-correction-reason">Correction reason *</Label>
              <Input
                id="currency-rate-correction-reason"
                maxLength={500}
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
              />
            </div>
            <Button
              disabled={Boolean(busy) || !correctedRate || correctionReason.trim().length < 3}
              onClick={() =>
                void mutate(
                  `correct-rate-${correctingRate.id}`,
                  () =>
                    client.correctCompanyRate(
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
        </section>
      ) : null}

      <FinanceTransferFxPolicy companies={companies} companyId={companyId} onCompanyChange={setCompanyId} />

      <Dialog open={formMode !== null} onOpenChange={(open) => !open && setFormMode(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {formMode === "base"
                ? "Configure company base currency"
                : formMode === "rate"
                  ? `Add ${currencyCode} rate`
                  : "Add New Currency"}
            </DialogTitle>
            <DialogDescription>
              {formMode === "base"
                ? "This currency is used for all company financial reports and becomes locked after posting."
                : `Rates use the direction 1 FX = X ${profile?.base_currency ?? "BASE"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            {formMode !== "rate" ? (
              <div className="grid gap-2">
                <Label>Country *</Label>
                <SearchableSelect
                  label="Country"
                  value={countryCode}
                  options={countryOptions}
                  placeholder="Select country"
                  search={countrySearch}
                  onSearchChange={setCountrySearch}
                  onValueChange={chooseCountry}
                  loading={countriesLoading}
                  required
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="company-currency-code">Currency *</Label>
              <select
                id="company-currency-code"
                className="h-10 rounded-md border border-input bg-background px-3"
                value={currencyCode}
                disabled={formMode === "rate" || !countryCode}
                onChange={(event) => setCurrencyCode(event.target.value)}
              >
                {!currencyCode ? <option value="">Select country first</option> : null}
                {mappedCurrencies.map((item) => (
                  <option key={`${item.country_code}:${item.currency_code}`} value={item.currency_code}>
                    {item.currency_name} ({item.currency_code}){item.is_primary ? " · Primary" : ""}
                  </option>
                ))}
                {formMode === "rate" && currencyCode ? <option value={currencyCode}>{currencyCode}</option> : null}
              </select>
              {mappedCurrencies.length > 1 ? (
                <p className="text-xs text-muted-foreground">
                  This country has multiple valid currency mappings; confirm the required one.
                </p>
              ) : null}
            </div>
            {formMode !== "base" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="company-currency-rate">Exchange rate *</Label>
                  <div className="flex h-10 items-center rounded-md border border-input bg-background px-3">
                    <span className="whitespace-nowrap text-sm">1 {currencyCode || "FX"} =</span>
                    <input
                      id="company-currency-rate"
                      className="min-w-0 flex-1 bg-transparent px-2 text-right outline-none"
                      inputMode="decimal"
                      value={rate}
                      onChange={(event) => setRate(event.target.value)}
                    />
                    <span className="text-sm">{profile?.base_currency}</span>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="company-currency-effective-date">Effective date *</Label>
                  <Input
                    id="company-currency-effective-date"
                    type="date"
                    value={effectiveDate}
                    onChange={(event) => setEffectiveDate(event.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              disabled={Boolean(busy) || !companyId || !countryCode || !currencyCode || (formMode !== "base" && !rate)}
              onClick={() => void saveForm()}
            >
              {busy ? "Saving…" : "Save and Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
