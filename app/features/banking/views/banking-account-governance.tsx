"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BankAccountDetail,
  BankAccountSummary,
  BankingCompanyDirectory,
  BankingLedgerAccountDirectory,
  CreateBankAccountRequest,
} from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { BankingApiClient } from "../api/banking-client";

function failure(error: unknown): string {
  if (error instanceof ApiError)
    return `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`;
  return "The Banking API request could not be completed.";
}

function keyFor(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function BankAccountSetup({ onCreated }: { onCreated?: (accountId: string) => void }) {
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const canCreate = permissions.has("banking.bank_account.create");
  const canSubmit = permissions.has("banking.bank_account.submit");
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [ledgers, setLedgers] = useState<BankingLedgerAccountDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [ledgerAccountId, setLedgerAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<CreateBankAccountRequest["account_type"]>("current");
  const [bankName, setBankName] = useState("");
  const [branch, setBranch] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [swiftBic, setSwiftBic] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [overdraftLimit, setOverdraftLimit] = useState("0");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [submissionReason, setSubmissionReason] = useState(
    "Bank account master data verified and ready for independent approval.",
  );
  const [submitImmediately, setSubmitImmediately] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (sessionLoading || !canCreate) return;
    let active = true;
    const timer = window.setTimeout(() => {
      client
        .companies()
        .then((result) => {
          if (!active) return;
          setCompanies(result.items);
          setCompanyId(result.items[0]?.id ?? "");
        })
        .catch((error) => {
          if (active) setNotice({ tone: "error", text: failure(error) });
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canCreate, client, sessionLoading]);

  useEffect(() => {
    if (!companyId || !canCreate) return;
    let active = true;
    client
      .ledgerAccounts({ companyId })
      .then((result) => {
        if (!active) return;
        setLedgers(result.items);
        setLedgerAccountId((current) =>
          result.items.some((item) => item.id === current) ? current : (result.items[0]?.id ?? ""),
        );
      })
      .catch((error) => {
        if (active) setNotice({ tone: "error", text: failure(error) });
      });
    return () => {
      active = false;
    };
  }, [canCreate, client, companyId]);

  async function save() {
    setNotice(null);
    if (!companyId || !ledgerAccountId || !accountName.trim() || !bankName.trim() || !accountNumber.trim()) {
      setNotice({
        tone: "error",
        text: "Company, account name, bank, account number and mapped nominal account are required.",
      });
      return;
    }
    if (!/^0(?:\.0{1,8})?$/.test(openingBalance.trim())) {
      setNotice({
        tone: "error",
        text: "Opening balance must be zero. Historical balances require the future governed Finance posting workflow.",
      });
      return;
    }
    const payload: CreateBankAccountRequest = {
      company_id: companyId,
      account_name: accountName.trim(),
      account_type: accountType,
      bank_name: bankName.trim(),
      branch: branch.trim(),
      account_number: accountNumber.trim(),
      ...(iban.trim() ? { iban: iban.trim().toUpperCase() } : {}),
      ...(swiftBic.trim() ? { swift_bic: swiftBic.trim().toUpperCase() } : {}),
      currency: currency.trim().toUpperCase(),
      ledger_account_id: ledgerAccountId,
      overdraft_limit: overdraftLimit.trim(),
      opening_balance: openingBalance.trim(),
    };
    const shouldSubmit = submitImmediately && canSubmit;
    const fingerprint = JSON.stringify({ payload, shouldSubmit, submissionReason });
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: keyFor("web-bank-account-create") };
    setSaving(true);
    try {
      const created = await client.create(payload, csrfToken(), retry.current.key);
      let finalState = created.state;
      if (shouldSubmit) {
        const submitted = await client.submit(
          created.id,
          { expected_version: created.version, reason: submissionReason.trim() },
          csrfToken(),
          keyFor("web-bank-account-submit"),
        );
        finalState = submitted.state;
      }
      setAccountNumber("");
      setIban("");
      retry.current = null;
      setNotice({
        tone: "success",
        text: `Bank account ${created.reference} persisted as ${finalState.replaceAll("_", " ")}. Sensitive values were cleared from this form.`,
      });
      onCreated?.(created.id);
    } catch (error) {
      setNotice({ tone: "error", text: failure(error) });
    } finally {
      setSaving(false);
    }
  }

  if (!sessionLoading && !session)
    return <GovernanceState title="Sign in required" detail="A valid Nexora session is required." />;
  if (!sessionLoading && !canCreate)
    return (
      <GovernanceState title="Permission required" detail="Your account does not have banking.bank_account.create." />
    );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <CardTitle>Bank account setup</CardTitle>
          <CardDescription>
            Create a company-scoped draft linked to an eligible Chart of Accounts record.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Company">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={loading || saving}
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} · {company.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account type">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={saving}
              value={accountType}
              onChange={(event) => setAccountType(event.target.value as typeof accountType)}
            >
              {["current", "deposit", "escrow", "cash"].map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account name">
            <Input
              disabled={saving}
              maxLength={160}
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
            />
          </Field>
          <Field label="Bank">
            <Input
              disabled={saving}
              maxLength={200}
              value={bankName}
              onChange={(event) => setBankName(event.target.value)}
            />
          </Field>
          <Field label="Branch">
            <Input
              disabled={saving}
              maxLength={200}
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            />
          </Field>
          <Field label="Currency">
            <Input
              disabled={saving}
              maxLength={3}
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Account number">
            <Input
              autoComplete="off"
              disabled={saving}
              maxLength={64}
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
            />
          </Field>
          <Field label="IBAN (optional)">
            <Input
              autoComplete="off"
              disabled={saving}
              maxLength={64}
              value={iban}
              onChange={(event) => setIban(event.target.value.toUpperCase())}
            />
          </Field>
          <Field label="SWIFT / BIC (optional)">
            <Input
              disabled={saving}
              maxLength={11}
              value={swiftBic}
              onChange={(event) => setSwiftBic(event.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Mapped nominal account">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={saving || ledgers.length === 0}
              value={ledgerAccountId}
              onChange={(event) => setLedgerAccountId(event.target.value)}
            >
              <option value="">Select an eligible bank-control account</option>
              {ledgers.map((ledger) => (
                <option key={ledger.id} value={ledger.id}>
                  {ledger.code} · {ledger.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Opening balance">
            <Input
              disabled={saving}
              inputMode="decimal"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
            />
            <small className="text-muted-foreground">
              Must remain zero until governed opening-balance posting is available.
            </small>
          </Field>
          <Field label="Overdraft limit">
            <Input
              disabled={saving}
              inputMode="decimal"
              value={overdraftLimit}
              onChange={(event) => setOverdraftLimit(event.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Submission reason">
              <Textarea
                disabled={saving || !submitImmediately || !canSubmit}
                maxLength={500}
                value={submissionReason}
                onChange={(event) => setSubmissionReason(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3 text-sm sm:col-span-2">
            <Checkbox
              id="bank-account-submit"
              checked={submitImmediately && canSubmit}
              disabled={saving || !canSubmit}
              onCheckedChange={(checked) => setSubmitImmediately(checked === true)}
            />
            <Label htmlFor="bank-account-submit">Submit for independent approval after saving</Label>
          </div>
          {notice ? (
            <Alert className="sm:col-span-2" variant={notice.tone === "error" ? "destructive" : "default"}>
              <AlertTitle>{notice.tone === "error" ? "Account not saved" : "Account saved"}</AlertTitle>
              <AlertDescription>{notice.text}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end sm:col-span-2">
            <Button type="button" disabled={saving || loading} onClick={() => void save()}>
              {saving ? "Saving…" : submitImmediately && canSubmit ? "Save and submit" : "Save draft"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Control boundary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Account and IBAN values are encrypted before PostgreSQL persistence. Only masked values return to the
            browser.
          </p>
          <p>Every account starts as a draft. The maker cannot approve their own record, including administrators.</p>
          <p>Eligible nominal accounts must be active, postable asset accounts marked for reconciliation.</p>
          <p>No opening journal is created by this form.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function BankAccountApprovals() {
  const notify = useActionFeedback();
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("banking.bank_account.read") ?? false;
  const canApprove = session?.user.permissions.includes("banking.bank_account.approve") ?? false;
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [rows, setRows] = useState<BankAccountSummary[]>([]);
  const [selected, setSelected] = useState<BankAccountDetail | null>(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (sessionLoading || !canRead) return;
    let active = true;
    const timer = window.setTimeout(() => {
      client
        .companies()
        .then((result) => {
          if (!active) return;
          setCompanies(result.items);
          setCompanyId(result.items[0]?.id ?? "");
        })
        .catch((caught) => {
          if (active) setError(failure(caught));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canRead, client, sessionLoading]);

  const refresh = useCallback(async () => {
    if (!companyId || !canRead) return;
    setLoading(true);
    try {
      const result = await client.accounts({
        company_id: companyId,
        state: "pending_approval",
        sort_by: "account_name",
        sort_direction: "asc",
        limit: 100,
      });
      setRows(result.items.filter((row) => row.identity_mode !== "nominal_only"));
      setSelected((current) => (current && !result.items.some((row) => row.id === current.id) ? null : current));
      setError("");
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setLoading(false);
    }
  }, [canRead, client, companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function open(accountId: string) {
    setRejecting(false);
    setReason("");
    setBusy(true);
    try {
      setSelected(await client.account(accountId));
      setError("");
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "approve" | "reject") {
    if (!selected || (action === "reject" && reason.trim().length < 3)) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await client.decide(
        selected.id,
        { action, expected_version: selected.version, ...(action === "reject" ? { reason: reason.trim() } : {}) },
        csrfToken(),
        keyFor(`web-bank-account-${action}`),
      );
      setNotice(`${result.reference} ${action === "approve" ? "activated" : "returned to the maker"}.`);
      notify(action === "approve" ? "Bank account approved successfully." : "Bank account rejected successfully.");
      setSelected(null);
      await refresh();
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!sessionLoading && !session)
    return <GovernanceState title="Sign in required" detail="A valid Nexora session is required." />;
  if (!sessionLoading && (!canRead || !canApprove))
    return (
      <GovernanceState
        title="Permission required"
        detail="This queue requires banking.bank_account.read and banking.bank_account.approve."
      />
    );

  const selfApproval = selected
    ? (selected.self_decision_requires_override ??
      (selected.created_by === session?.user.id || selected.submitted_by === session?.user.id))
    : false;
  const superAdminOverride = selfApproval && selected?.super_admin_override_allowed === true;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardHeader>
          <CardTitle>Pending bank accounts</CardTitle>
          <CardDescription>
            Independent checker queue. Only PostgreSQL-backed pending records are shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <select
              className="h-10 min-w-64 rounded-md border border-input bg-background px-3 text-sm"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} · {company.name}
                </option>
              ))}
            </select>
            <Button variant="outline" disabled={loading} type="button" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Request failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {notice ? (
            <Alert>
              <AlertTitle>Decision recorded</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}
          {!loading && rows.length === 0 ? (
            <GovernanceState title="Queue clear" detail="No bank account is awaiting approval for this company." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="p-3">Reference</th>
                    <th className="p-3">Account</th>
                    <th className="p-3">Bank</th>
                    <th className="p-3">Currency</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/70">
                      <td className="p-3">{row.reference}</td>
                      <td className="p-3">
                        <strong>{row.account_name}</strong>
                        <small className="block text-muted-foreground">{row.account_number_masked}</small>
                      </td>
                      <td className="p-3">{row.bank_name}</td>
                      <td className="p-3">{row.currency}</td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          type="button"
                          onClick={() => void open(row.id)}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Checker review</CardTitle>
          <CardDescription>
            {selected ? `${selected.reference} · version ${selected.version}` : "Select a pending account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selected ? (
            <>
              <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Account</dt>
                <dd>{selected.account_name}</dd>
                <dt className="text-muted-foreground">Bank / branch</dt>
                <dd>
                  {selected.bank_name} · {selected.branch || "Not recorded"}
                </dd>
                <dt className="text-muted-foreground">Account number</dt>
                <dd>{selected.account_number_masked}</dd>
                <dt className="text-muted-foreground">IBAN</dt>
                <dd>{selected.iban_masked ?? "Not recorded"}</dd>
                <dt className="text-muted-foreground">SWIFT / BIC</dt>
                <dd>{selected.swift_bic || "Not recorded"}</dd>
                <dt className="text-muted-foreground">Nominal</dt>
                <dd>
                  {selected.ledger_account_code} · {selected.ledger_account_name}
                </dd>
                <dt className="text-muted-foreground">Currency</dt>
                <dd>{selected.currency}</dd>
                <dt className="text-muted-foreground">Opening balance</dt>
                <dd>0.00 (no journal created)</dd>
              </dl>
              {rejecting && (
                <Field label="Rejection reason">
                  <Textarea
                    maxLength={500}
                    disabled={busy}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              )}
              {superAdminOverride ? <SuperAdminOverrideWarning reasonRequired={rejecting} /> : null}
              {selfApproval && !superAdminOverride ? (
                <Alert variant="destructive">
                  <AlertTitle>Independent checker required</AlertTitle>
                  <AlertDescription>You created or submitted this record and cannot decide it.</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex gap-3">
                <Button
                  type="button"
                  disabled={busy || (selfApproval && !superAdminOverride)}
                  onClick={() => void decide("approve")}
                >
                  Approve &amp; Close
                </Button>
                <Button
                  variant="destructive"
                  type="button"
                  disabled={busy || (selfApproval && !superAdminOverride) || (rejecting && reason.trim().length < 3)}
                  onClick={() => (rejecting ? void decide("reject") : setRejecting(true))}
                >
                  {rejecting ? "Confirm rejection" : "Reject"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Masked banking identifiers, ledger mapping and maker evidence will appear here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function BankAccountDetailWorkspace({ accountId, onBack }: { accountId: string; onBack: () => void }) {
  const notify = useActionFeedback();
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("banking.bank_account.read") ?? false;
  const canChangeStatus = session?.user.permissions.includes("banking.bank_account.status") ?? false;
  const [account, setAccount] = useState<BankAccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadAccount = useCallback(async () => {
    if (!accountId || !canRead) return;
    setLoading(true);
    try {
      setAccount(await client.account(accountId));
      setError("");
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setLoading(false);
    }
  }, [accountId, canRead, client]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAccount(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAccount]);

  async function changeStatus(action: "deactivate" | "close") {
    if (!account) return;
    setBusy(true);
    try {
      await client.changeStatus(
        account.id,
        {
          action,
          expected_version: account.version,
          reason: `Bank account ${action} confirmed by the authorized user.`,
        },
        csrfToken(),
        keyFor(`web-bank-account-${action}`),
      );
      notify(action === "close" ? "Bank account closed successfully." : "Bank account deactivated successfully.");
      await loadAccount();
    } catch (caught) {
      setError(failure(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!sessionLoading && !session)
    return <GovernanceState title="Sign in required" detail="A valid Nexora session is required." />;
  if (!sessionLoading && !canRead)
    return (
      <GovernanceState title="Permission required" detail="Your account does not have banking.bank_account.read." />
    );
  if (!accountId)
    return <GovernanceState title="Select a bank account" detail="Open a persisted record from Account Balances." />;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{account?.account_name ?? (loading ? "Loading bank account…" : "Bank account")}</CardTitle>
          <CardDescription>
            {account ? `${account.reference} · ${account.state.replaceAll("_", " ")}` : "Governed bank account detail"}
          </CardDescription>
        </div>
        <Button variant="outline" type="button" onClick={onBack}>
          Back to balances
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {account ? (
          <>
            <dl className="grid gap-4 rounded-lg border border-border bg-muted/20 p-5 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Bank", `${account.bank_name}${account.branch ? ` · ${account.branch}` : ""}`],
                ["Account number", account.account_number_masked],
                ["IBAN", account.iban_masked ?? "Not recorded"],
                ["SWIFT / BIC", account.swift_bic || "Not recorded"],
                ["Currency", account.currency],
                ["Nominal account", `${account.ledger_account_code} · ${account.ledger_account_name}`],
                ["Ledger balance", `${account.currency} ${account.ledger_balance}`],
                [
                  "Available balance",
                  account.available_balance === null
                    ? "Unavailable"
                    : `${account.currency} ${account.available_balance}`,
                ],
                [
                  "Unreconciled",
                  account.unreconciled_count === null ? "Unavailable" : `${account.unreconciled_count} items`,
                ],
                ["Last movement", account.last_movement_on ?? "No posted movement"],
                ["Created", new Date(account.created_at).toLocaleString()],
                ["Version", String(account.version)],
              ].map(([term, value]) => (
                <div key={term}>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{term}</dt>
                  <dd className="mt-1 text-sm text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <Alert>
              <AlertTitle>Statement and reconciliation are not yet live</AlertTitle>
              <AlertDescription>
                No prototype statement rows are substituted for this persisted account. Those screens remain a later
                Banking slice.
              </AlertDescription>
            </Alert>
            {canChangeStatus && (account.state === "active" || account.state === "inactive") ? (
              <div className="max-w-xl space-y-3">
                <Button
                  variant="destructive"
                  disabled={busy}
                  type="button"
                  onClick={() => void changeStatus(account.state === "active" ? "deactivate" : "close")}
                >
                  {account.state === "active" ? "Deactivate account" : "Close account"}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="block space-y-1.5">
      <span className="block">{label}</span>
      {children}
    </Label>
  );
}

function GovernanceState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center">
      <strong className="text-lg text-foreground">{title}</strong>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
