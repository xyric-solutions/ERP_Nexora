"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BankPaymentDetail,
  BankPaymentMethod,
  BankPaymentNominalAccountDirectory,
  BankPaymentOptions,
  CreateBankPaymentRequest,
  UpdateBankPaymentRequest,
} from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { BankingApiClient } from "../api/banking-client";

type NominalAccount = BankPaymentNominalAccountDirectory["items"][number];
type BankAccountOption = BankPaymentOptions["bank_accounts"][number];

interface EditableLine {
  id: string;
  documentDate: string;
  externalReference: string;
  documentReference: string;
  paymentMethod: BankPaymentMethod | "";
  nominalAccountId: string;
  narration: string;
  amount: string;
  dimensions: Record<string, string>;
}

interface RetryAttempt {
  fingerprint: string;
  key: string;
}

interface ValidationResult {
  issues: string[];
  lineIssues: Record<string, Record<string, string>>;
}

interface FailureState {
  kind: "conflict" | "denied" | "not-found" | "error";
  message: string;
}

export interface BankingPaymentEntryProps {
  paymentId?: string;
  onBack?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNavigate?: (
    pageId: "bank-payments" | "add-bank-payment" | "transaction-detail",
    paymentId?: string,
    options?: { replace?: boolean },
  ) => void;
}

const paymentMethods: ReadonlyArray<{ value: BankPaymentMethod; label: string }> = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
  { value: "standing_order", label: "Standing order" },
  { value: "card", label: "Card" },
];

const amountPattern = /^(0|[1-9]\d{0,29})(?:\.(\d{1,8}))?$/;
const fixedScale = 100_000_000n;

function today(): string {
  const value = new Date();
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

function newLine(documentDate = today()): EditableLine {
  return {
    id: crypto.randomUUID(),
    documentDate,
    externalReference: "",
    documentReference: "",
    paymentMethod: "",
    nominalAccountId: "",
    narration: "",
    amount: "",
    dimensions: {},
  };
}

function decimalUnits(value: string): bigint | null {
  const match = amountPattern.exec(value.trim());
  if (!match) return null;
  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(8, "0"));
  return whole * fixedScale + fraction;
}

function displayAmount(units: bigint): string {
  const whole = units / fixedScale;
  const fraction = (units % fixedScale).toString().padStart(8, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole.toLocaleString("en-US")}.${fraction}`;
}

function failure(error: unknown): FailureState {
  if (error instanceof ApiError) {
    const suffix = error.correlationId ? ` Reference: ${error.correlationId}` : "";
    if (error.status === 409) return { kind: "conflict", message: `${error.message}${suffix}` };
    if (error.status === 401 || error.status === 403) return { kind: "denied", message: `${error.message}${suffix}` };
    return { kind: "error", message: `${error.message}${suffix}` };
  }
  return { kind: "error", message: "The Bank Payment request could not be completed. Try again safely." };
}

function routeFailure(error: unknown): FailureState {
  const suffix = error instanceof ApiError && error.correlationId ? ` Reference: ${error.correlationId}` : "";
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return {
      kind: "denied",
      message: `The API denied access to this Bank Payment or one of its company-scoped directories.${suffix}`,
    };
  }
  if (error instanceof ApiError && error.status === 404) {
    return {
      kind: "not-found",
      message: `This Bank Payment was not found within your permitted company scope.${suffix}`,
    };
  }
  return {
    kind: "error",
    message: `The persisted Bank Payment and its server-owned options could not be loaded safely.${suffix}`,
  };
}

function keyFor(attempt: RetryAttempt | null, action: string, payload: unknown): RetryAttempt {
  const fingerprint = JSON.stringify(payload);
  if (attempt?.fingerprint === fingerprint) return attempt;
  return { fingerprint, key: `web-bank-payment-${action}-${crypto.randomUUID()}` };
}

function validate(
  companyId: string,
  bankAccountId: string,
  postingDate: string,
  valueDate: string,
  lines: EditableLine[],
  nominalAccounts: NominalAccount[],
): ValidationResult {
  const issues: string[] = [];
  const lineIssues: ValidationResult["lineIssues"] = {};
  if (!companyId) issues.push("Company is required.");
  if (!bankAccountId) issues.push("Select an eligible Bank Account.");
  if (!validIsoDate(postingDate)) issues.push("Posting date must be a valid date.");
  if (valueDate && !validIsoDate(valueDate)) issues.push("Value date must be a valid date.");
  if (lines.length === 0) issues.push("Enter at least one payment line.");

  lines.forEach((line, index) => {
    const current: Record<string, string> = {};
    if (!validIsoDate(line.documentDate)) current.documentDate = "Document date must be valid.";
    if (!line.externalReference.trim()) current.externalReference = "External reference is required.";
    if (!line.paymentMethod) current.paymentMethod = "Payment method is required.";
    if (!line.nominalAccountId) current.nominalAccountId = "Nominal account is required.";
    if (line.narration.trim().length < 3) current.narration = "Narration must contain at least 3 characters.";
    const amount = decimalUnits(line.amount);
    if (amount === null || amount <= 0n) current.amount = "Amount must be a positive decimal with at most 8 places.";
    const nominal = nominalAccounts.find((account) => account.id === line.nominalAccountId);
    for (const dimension of nominal?.required_dimensions ?? []) {
      if (!line.dimensions[dimension]?.trim()) current[`dimension:${dimension}`] = `${dimension} is required.`;
    }
    if (Object.keys(current).length > 0) {
      lineIssues[line.id] = current;
      issues.push(`Line ${index + 1} has ${Object.keys(current).length} issue(s).`);
    }
  });
  return { issues, lineIssues };
}

function editableFromDetail(detail: BankPaymentDetail): EditableLine[] {
  return detail.lines.map((line) => ({
    id: line.id,
    documentDate: line.document_date,
    externalReference: line.external_reference,
    documentReference: line.document_reference ?? "",
    paymentMethod: line.payment_method,
    nominalAccountId: line.nominal_account_id,
    narration: line.narration,
    amount: line.amount,
    dimensions: { ...line.dimensions },
  }));
}

function directoryFallbacks(detail: BankPaymentDetail): {
  bank: BankAccountOption;
  nominal: NominalAccount[];
} {
  const bankLine = detail.accounting_preview.lines.find((line) => line.is_bank_control);
  const nominal = detail.lines.map((line) => {
    const preview = detail.accounting_preview.lines.find(
      (candidate) => !candidate.is_bank_control && candidate.line_order === line.line_order,
    );
    return {
      id: line.nominal_account_id,
      code: preview?.account_code ?? line.nominal_account_id,
      name: preview?.account_name ?? "Persisted nominal account",
      account_type: "persisted",
      required_dimensions: Object.keys(line.dimensions),
    };
  });
  return {
    bank: {
      id: detail.bank_account_id,
      reference: detail.bank_account_id,
      account_name: detail.bank_account_name,
      bank_name: detail.bank_name,
      account_number_masked: detail.account_number_masked,
      currency: detail.currency,
      ledger_account_code: bankLine?.account_code ?? "Unavailable",
      ledger_account_name: bankLine?.account_name ?? "Persisted Bank Account control",
    },
    nominal: [...new Map(nominal.map((account) => [account.id, account])).values()],
  };
}

export function BankingPaymentEntry({ paymentId, onBack, onDirtyChange, onNavigate }: BankingPaymentEntryProps) {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("banking.payment.read");
  const canCreate = permissions.includes("banking.payment.create");
  const canUpdate = permissions.includes("banking.payment.update");
  const canSubmit = permissions.includes("banking.payment.submit");
  const readOnlySession = Boolean(session?.impersonation);

  const [companies, setCompanies] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [nominalAccounts, setNominalAccounts] = useState<NominalAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [postingDate, setPostingDate] = useState(today);
  const [valueDate, setValueDate] = useState("");
  const [lines, setLines] = useState<EditableLine[]>(() => [newLine()]);
  const [persistedId, setPersistedId] = useState("");
  const [loadedPaymentId, setLoadedPaymentId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [state, setState] = useState<BankPaymentDetail["state"]>("draft");
  const [loading, setLoading] = useState(true);
  const [pageReady, setPageReady] = useState(false);
  const [directoriesLoading, setDirectoriesLoading] = useState(false);
  const [directoriesCompanyId, setDirectoriesCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [initialFailure, setInitialFailure] = useState<FailureState | null>(null);
  const [requestFailure, setRequestFailure] = useState<FailureState | null>(null);
  const [directoryFailure, setDirectoryFailure] = useState<FailureState | null>(null);
  const [success, setSuccess] = useState("");
  const createRetry = useRef<RetryAttempt | null>(null);
  const updateRetry = useRef<RetryAttempt | null>(null);
  const submitRetry = useRef<RetryAttempt | null>(null);
  const persistedIdRef = useRef("");
  const loadedPaymentIdRef = useRef<string | null>(null);
  const pageRequest = useRef(0);

  const invalidateRetries = useCallback(() => {
    createRetry.current = null;
    updateRetry.current = null;
    submitRetry.current = null;
  }, []);

  const resetPayment = useCallback(() => {
    persistedIdRef.current = "";
    loadedPaymentIdRef.current = null;
    setPersistedId("");
    setLoadedPaymentId(null);
    setReference("");
    setVersion(null);
    setState("draft");
    setBankAccountId("");
    setPostingDate(today());
    setValueDate("");
    setLines([newLine()]);
    setBankAccounts([]);
    setNominalAccounts([]);
    setDirectoriesCompanyId("");
    setDirty(false);
    setShowValidation(false);
    invalidateRetries();
  }, [invalidateRetries]);

  const edit = useCallback(
    (change: () => void) => {
      change();
      setDirty(true);
      setSuccess("");
      setRequestFailure(null);
      invalidateRetries();
    },
    [invalidateRetries],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const loadPage = useCallback(async () => {
    if (!session || !canRead) {
      setLoading(false);
      return;
    }
    if (paymentId && persistedIdRef.current === paymentId && loadedPaymentIdRef.current === paymentId) {
      setInitialFailure(null);
      setPageReady(true);
      setLoading(false);
      return;
    }
    const request = ++pageRequest.current;
    setLoading(true);
    setPageReady(false);
    setInitialFailure(null);
    try {
      const [companyDirectory, detail] = await Promise.all([
        client.companies(),
        paymentId ? client.payment(paymentId) : Promise.resolve(null),
      ]);
      if (request !== pageRequest.current) return;
      setCompanies(companyDirectory.items);
      if (detail) {
        const fallback = directoryFallbacks(detail);
        const [options, nominalDirectory] = await Promise.all([
          client.paymentOptions({ company_id: detail.company_id }),
          client.paymentNominalAccounts({ company_id: detail.company_id, limit: 100 }),
        ]);
        if (request !== pageRequest.current) return;
        if (!companyDirectory.items.some((company) => company.id === detail.company_id)) {
          throw new Error("The persisted company is outside the loaded company directory");
        }
        const banks = options.bank_accounts.some((account) => account.id === fallback.bank.id)
          ? options.bank_accounts
          : [fallback.bank, ...options.bank_accounts];
        const nominals = [
          ...fallback.nominal.filter(
            (account) => !nominalDirectory.items.some((directoryAccount) => directoryAccount.id === account.id),
          ),
          ...nominalDirectory.items,
        ];
        persistedIdRef.current = detail.id;
        loadedPaymentIdRef.current = detail.id;
        setPersistedId(detail.id);
        setLoadedPaymentId(detail.id);
        setReference(detail.reference);
        setVersion(detail.version);
        setState(detail.state);
        setCompanyId(detail.company_id);
        setBankAccountId(detail.bank_account_id);
        setPostingDate(detail.posting_date);
        setValueDate(detail.value_date ?? "");
        setLines(editableFromDetail(detail));
        setBankAccounts(banks);
        setNominalAccounts(nominals);
        setDirectoriesCompanyId(detail.company_id);
      } else {
        resetPayment();
        setCompanyId(companyDirectory.items[0]?.id || "");
      }
      setDirty(false);
      setShowValidation(false);
      invalidateRetries();
      setPageReady(true);
    } catch (caught) {
      if (request !== pageRequest.current) return;
      resetPayment();
      setCompanies([]);
      setCompanyId("");
      setInitialFailure(routeFailure(caught));
      setPageReady(false);
    } finally {
      if (request === pageRequest.current) setLoading(false);
    }
  }, [canRead, client, invalidateRetries, paymentId, resetPayment, session]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPage(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  useEffect(() => {
    if (!session || !canRead || !companyId || directoriesCompanyId === companyId) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setDirectoriesLoading(true);
      setDirectoryFailure(null);
      Promise.all([
        client.paymentOptions({ company_id: companyId }),
        client.paymentNominalAccounts({ company_id: companyId, limit: 100 }),
      ])
        .then(([options, nominalDirectory]) => {
          if (!active) return;
          setBankAccounts((current) => {
            const persisted = current.find((account) => !options.bank_accounts.some((item) => item.id === account.id));
            return persisted ? [persisted, ...options.bank_accounts] : options.bank_accounts;
          });
          setNominalAccounts((current) => {
            const persisted = current.filter(
              (account) => !nominalDirectory.items.some((item) => item.id === account.id),
            );
            return [...persisted, ...nominalDirectory.items];
          });
          setBankAccountId((current) => current || options.bank_accounts[0]?.id || "");
          setDirectoriesCompanyId(companyId);
        })
        .catch((caught) => {
          if (!active) return;
          setBankAccounts([]);
          setNominalAccounts([]);
          setDirectoryFailure(failure(caught));
        })
        .finally(() => {
          if (active) setDirectoriesLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canRead, client, companyId, directoriesCompanyId, session]);

  const selectedBank = bankAccounts.find((account) => account.id === bankAccountId);
  const nominalById = useMemo(
    () => new Map(nominalAccounts.map((account) => [account.id, account])),
    [nominalAccounts],
  );
  const validation = useMemo(
    () => validate(companyId, bankAccountId, postingDate, valueDate, lines, nominalAccounts),
    [bankAccountId, companyId, lines, nominalAccounts, postingDate, valueDate],
  );
  const totalUnits = useMemo(
    () => lines.reduce((total, line) => total + (decimalUnits(line.amount) ?? 0n), 0n),
    [lines],
  );
  const editable = state === "draft" && !readOnlySession;

  const payloadLines = useCallback(
    () =>
      lines.map((line, index) => ({
        line_order: index + 1,
        document_date: line.documentDate,
        external_reference: line.externalReference.trim(),
        document_reference: line.documentReference.trim() || null,
        payment_method: line.paymentMethod as BankPaymentMethod,
        nominal_account_id: line.nominalAccountId,
        narration: line.narration.trim(),
        amount: line.amount.trim(),
        dimensions: Object.fromEntries(
          Object.entries(line.dimensions)
            .map(([key, value]) => [key, value.trim()])
            .filter(([, value]) => value.length > 0),
        ),
      })),
    [lines],
  );

  const persistDraft = useCallback(async () => {
    const id = persistedId;
    if (id) {
      if (version === null) throw new Error("Persisted draft version is unavailable");
      const payload: UpdateBankPaymentRequest = {
        expected_version: version,
        bank_account_id: bankAccountId,
        posting_date: postingDate,
        value_date: valueDate || null,
        lines: payloadLines(),
      };
      const attempt = keyFor(updateRetry.current, "update", payload);
      updateRetry.current = attempt;
      const result = await client.updatePayment(id, payload, csrfToken(), attempt.key);
      updateRetry.current = null;
      setReference(result.reference);
      setVersion(result.version);
      setState(result.state);
      setDirty(false);
      return result;
    }
    const payload: CreateBankPaymentRequest = {
      company_id: companyId,
      bank_account_id: bankAccountId,
      posting_date: postingDate,
      value_date: valueDate || null,
      lines: payloadLines(),
    };
    const attempt = keyFor(createRetry.current, "create", payload);
    createRetry.current = attempt;
    const result = await client.createPayment(payload, csrfToken(), attempt.key);
    createRetry.current = null;
    persistedIdRef.current = result.id;
    loadedPaymentIdRef.current = result.id;
    setPersistedId(result.id);
    setLoadedPaymentId(result.id);
    setReference(result.reference);
    setVersion(result.version);
    setState(result.state);
    setDirty(false);
    setPageReady(true);
    onDirtyChange?.(false);
    onNavigate?.("add-bank-payment", result.id, { replace: true });
    return result;
  }, [
    bankAccountId,
    client,
    companyId,
    csrfToken,
    onNavigate,
    onDirtyChange,
    payloadLines,
    persistedId,
    postingDate,
    valueDate,
    version,
  ]);

  async function save() {
    setShowValidation(true);
    setRequestFailure(null);
    setSuccess("");
    if (validation.issues.length > 0) return;
    setBusy(true);
    try {
      const result = await persistDraft();
      setShowValidation(false);
      setSuccess(`Draft ${result.reference} saved in PostgreSQL.`);
    } catch (caught) {
      setRequestFailure(failure(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setShowValidation(true);
    setRequestFailure(null);
    setSuccess("");
    if (validation.issues.length > 0) return;
    setBusy(true);
    try {
      const saved = dirty || !persistedId ? await persistDraft() : null;
      const id = saved?.id ?? persistedId;
      const expectedVersion = saved?.version ?? version;
      if (!id || expectedVersion === null) throw new Error("Persisted draft identity is unavailable");
      const payload = { expected_version: expectedVersion };
      const attempt = keyFor(submitRetry.current, "submit", payload);
      submitRetry.current = attempt;
      const result = await client.submitPayment(id, payload, csrfToken(), attempt.key);
      submitRetry.current = null;
      setVersion(result.version);
      setState(result.state);
      setDirty(false);
      setShowValidation(false);
      setSuccess(`${result.reference} submitted for independent approval.`);
      onDirtyChange?.(false);
      onNavigate?.("transaction-detail", result.id);
    } catch (caught) {
      setRequestFailure(failure(caught));
    } finally {
      setBusy(false);
    }
  }

  function updateLine(lineId: string, patch: Partial<EditableLine>) {
    edit(() => setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))));
  }

  function leave(action: () => void) {
    if (dirty && !window.confirm("You have unsaved Bank Payment changes. Leave without saving them?")) return;
    action();
  }

  if (sessionLoading) return <EntryState title="Loading session" detail="Confirming your Banking permissions." />;
  if (!session) return <EntryState title="Sign in required" detail="A valid Nexora session is required." />;
  if (!canRead)
    return <EntryState title="Permission required" detail="Your account does not have banking.payment.read." />;
  if (!paymentId && !canCreate)
    return <EntryState title="Permission required" detail="Your account does not have banking.payment.create." />;
  if (loading)
    return <EntryState title="Loading Bank Payment" detail="Reading the persisted draft and company access." />;
  if (initialFailure)
    return (
      <EntryState
        title={
          initialFailure.kind === "denied"
            ? "Permission required"
            : initialFailure.kind === "not-found"
              ? "Bank Payment not found"
              : "Bank Payment unavailable"
        }
        detail={initialFailure.message}
        retry={() => void loadPage()}
      />
    );
  if (!pageReady || (paymentId !== undefined && loadedPaymentId !== paymentId))
    return (
      <EntryState
        title="Bank Payment unavailable"
        detail="The persisted draft did not finish loading with its server-owned company and accounting options."
        retry={() => void loadPage()}
      />
    );

  return (
    <div className="grid min-w-0 gap-3.5" aria-busy={busy}>
      <nav className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <button
          className="text-primary hover:underline"
          type="button"
          onClick={() =>
            leave(() => {
              if (onBack) onBack();
              else onNavigate?.("bank-payments");
            })
          }
        >
          Bank Payments
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">Add Bank Payment</span>
      </nav>

      <header className="flex items-start justify-between gap-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3.5 shadow-[inset_4px_0_0_var(--color-primary)] max-sm:flex-col">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Money out · Batch entry</p>
          <h1 className="mt-1 text-xl font-semibold">Add Bank Payment</h1>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            Enter one or more debit lines against a single Bank Account, review the accounting preview, then submit the
            persisted draft for independent approval.
          </p>
        </div>
        <Badge variant="outline" className="capitalize">
          {state.replaceAll("_", " ")}
        </Badge>
      </header>

      {success ? (
        <Alert role="status">
          <AlertTitle>Saved successfully</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
      {requestFailure ? (
        <Alert variant="destructive">
          <AlertTitle>
            {requestFailure.kind === "conflict"
              ? "Draft changed elsewhere"
              : requestFailure.kind === "denied"
                ? "Permission denied"
                : "Request failed"}
          </AlertTitle>
          <AlertDescription>
            {requestFailure.message}
            {requestFailure.kind === "conflict" ? " Reload the draft before trying again." : ""}
          </AlertDescription>
          {requestFailure.kind === "conflict" ? (
            <Button
              className="mt-2 w-fit"
              variant="outline"
              size="sm"
              type="button"
              onClick={() => leave(() => void loadPage())}
            >
              Reload persisted draft
            </Button>
          ) : null}
        </Alert>
      ) : null}
      {directoryFailure ? (
        <Alert variant="destructive">
          <AlertTitle>Payment options unavailable</AlertTitle>
          <AlertDescription>{directoryFailure.message}</AlertDescription>
        </Alert>
      ) : null}
      {!directoryFailure && companies.length === 0 ? (
        <Alert>
          <AlertTitle>No accessible companies</AlertTitle>
          <AlertDescription>No company is currently available for Bank Payment entry.</AlertDescription>
        </Alert>
      ) : null}
      {!directoryFailure && companyId && !directoriesLoading && bankAccounts.length === 0 ? (
        <Alert>
          <AlertTitle>No eligible Bank Accounts</AlertTitle>
          <AlertDescription>This company has no active governed Bank Account available for payments.</AlertDescription>
        </Alert>
      ) : null}
      {!directoryFailure && companyId && !directoriesLoading && nominalAccounts.length === 0 ? (
        <Alert>
          <AlertTitle>No eligible nominal accounts</AlertTitle>
          <AlertDescription>
            This company has no active postable nominal account available for payment lines.
          </AlertDescription>
        </Alert>
      ) : null}
      {showValidation && validation.issues.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>{validation.issues.length} validation issue(s)</AlertTitle>
          <AlertDescription>{validation.issues.join(" ")}</AlertDescription>
        </Alert>
      ) : null}
      {readOnlySession ? (
        <Alert>
          <AlertTitle>Read-only impersonation session</AlertTitle>
          <AlertDescription>Saving and submission are disabled while impersonating another user.</AlertDescription>
        </Alert>
      ) : null}
      {state !== "draft" ? (
        <Alert>
          <AlertTitle>This payment is no longer editable</AlertTitle>
          <AlertDescription>
            Open the Bank Transaction Detail workspace to review its {state.replaceAll("_", " ")} lifecycle state.
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        className="grid grid-cols-4 gap-3 rounded-lg border border-border bg-muted/40 p-3.5 shadow-xs max-lg:grid-cols-2 max-sm:grid-cols-1"
        aria-label="Payment controls"
      >
        <Field label="Payment reference" helper="Generated by the server after first save">
          <Input readOnly value={reference || "Generated when saved"} aria-label="Payment reference" />
        </Field>
        <Field label="Company" helper="Authenticated company scope">
          <select
            aria-label="Company"
            className={selectClass}
            value={companyId}
            disabled={busy || Boolean(persistedId)}
            onChange={(event) =>
              edit(() => {
                setCompanyId(event.target.value);
                setDirectoriesCompanyId("");
                setBankAccountId("");
                setBankAccounts([]);
                setNominalAccounts([]);
                setLines((current) => current.map((line) => ({ ...line, nominalAccountId: "", dimensions: {} })));
              })
            }
          >
            <option value="">Select company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.code} · {company.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Posting date" helper="Controls the financial period">
          <Input
            aria-label="Posting date"
            type="date"
            value={postingDate}
            disabled={!editable || busy}
            aria-invalid={showValidation && !postingDate}
            onChange={(event) => edit(() => setPostingDate(event.target.value))}
          />
        </Field>
        <Field label="Value date" helper="Optional bank value date">
          <Input
            aria-label="Value date"
            type="date"
            value={valueDate}
            disabled={!editable || busy}
            onChange={(event) => edit(() => setValueDate(event.target.value))}
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field
            label="Pay through"
            helper={
              selectedBank
                ? `${selectedBank.currency} · ${selectedBank.ledger_account_code} ${selectedBank.ledger_account_name}`
                : "Only active governed Bank Accounts are eligible"
            }
          >
            <select
              aria-label="Pay through"
              className={selectClass}
              value={bankAccountId}
              disabled={!editable || busy || directoriesLoading}
              aria-invalid={showValidation && !bankAccountId}
              onChange={(event) => edit(() => setBankAccountId(event.target.value))}
            >
              <option value="">{directoriesLoading ? "Loading eligible accounts…" : "Select Bank Account"}</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} · {account.bank_name} · {account.account_number_masked} · {account.currency}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label="Supporting document"
          helper="Secure document upload, scanning and retention are not implemented yet"
        >
          <Input aria-label="Supporting document" disabled value="Attachment unavailable" />
        </Field>
      </section>

      <section
        className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs"
        aria-labelledby="payment-lines-heading"
      >
        <header className="border-b border-border bg-muted/30 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Payment lines</p>
          <h2 id="payment-lines-heading" className="mt-1 text-sm font-bold">
            Debit allocation
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each positive line debits its selected nominal account. Required dimensions come from that account.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full border-collapse text-xs">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                {["Date", "External reference", "Document", "Method", "Nominal account", "Narration", "Amount", ""].map(
                  (heading) => (
                    <th key={heading} className="px-2 py-2 text-left font-semibold last:w-10">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const lineError = validation.lineIssues[line.id] ?? {};
                const nominal = nominalById.get(line.nominalAccountId);
                return (
                  <tr key={line.id} className="align-top [&>td]:border-b [&>td]:border-border [&>td]:p-2">
                    <td>
                      <Input
                        aria-label={`Line ${index + 1} document date`}
                        type="date"
                        value={line.documentDate}
                        disabled={!editable || busy}
                        aria-invalid={showValidation && Boolean(lineError.documentDate)}
                        onChange={(event) => updateLine(line.id, { documentDate: event.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        aria-label={`Line ${index + 1} external reference`}
                        maxLength={128}
                        value={line.externalReference}
                        disabled={!editable || busy}
                        aria-invalid={showValidation && Boolean(lineError.externalReference)}
                        onChange={(event) => updateLine(line.id, { externalReference: event.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        aria-label={`Line ${index + 1} document reference`}
                        maxLength={128}
                        value={line.documentReference}
                        disabled={!editable || busy}
                        onChange={(event) => updateLine(line.id, { documentReference: event.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Line ${index + 1} payment method`}
                        className={selectClass}
                        value={line.paymentMethod}
                        disabled={!editable || busy}
                        aria-invalid={showValidation && Boolean(lineError.paymentMethod)}
                        onChange={(event) =>
                          updateLine(line.id, { paymentMethod: event.target.value as BankPaymentMethod })
                        }
                      >
                        <option value="">Select</option>
                        {paymentMethods.map((method) => (
                          <option key={method.value} value={method.value}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-56">
                      <select
                        aria-label={`Line ${index + 1} nominal account`}
                        className={selectClass}
                        value={line.nominalAccountId}
                        disabled={!editable || busy || directoriesLoading}
                        aria-invalid={showValidation && Boolean(lineError.nominalAccountId)}
                        onChange={(event) =>
                          updateLine(line.id, { nominalAccountId: event.target.value, dimensions: {} })
                        }
                      >
                        <option value="">Select account</option>
                        {nominalAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} · {account.name}
                          </option>
                        ))}
                      </select>
                      {nominal?.required_dimensions.map((dimension) => (
                        <Input
                          key={dimension}
                          className="mt-2"
                          aria-label={`Line ${index + 1} ${dimension}`}
                          placeholder={dimension}
                          maxLength={128}
                          value={line.dimensions[dimension] ?? ""}
                          disabled={!editable || busy}
                          aria-invalid={showValidation && Boolean(lineError[`dimension:${dimension}`])}
                          onChange={(event) =>
                            updateLine(line.id, { dimensions: { ...line.dimensions, [dimension]: event.target.value } })
                          }
                        />
                      ))}
                    </td>
                    <td className="min-w-64">
                      <Textarea
                        aria-label={`Line ${index + 1} narration`}
                        maxLength={500}
                        value={line.narration}
                        disabled={!editable || busy}
                        aria-invalid={showValidation && Boolean(lineError.narration)}
                        onChange={(event) => updateLine(line.id, { narration: event.target.value })}
                      />
                    </td>
                    <td className="min-w-32">
                      <Input
                        aria-label={`Line ${index + 1} amount`}
                        inputMode="decimal"
                        value={line.amount}
                        disabled={!editable || busy}
                        aria-invalid={showValidation && Boolean(lineError.amount)}
                        placeholder="0.00"
                        onChange={(event) => updateLine(line.id, { amount: event.target.value })}
                      />
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove line ${index + 1}`}
                        disabled={!editable || busy || lines.length === 1}
                        type="button"
                        onClick={() => edit(() => setLines((current) => current.filter((item) => item.id !== line.id)))}
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left" colSpan={6}>
                  Total
                </th>
                <td className="px-3 py-2 text-right font-semibold">
                  {selectedBank?.currency ?? "—"} {displayAmount(totalUnits)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={!editable || busy || lines.length >= 200}
          onClick={() =>
            edit(() => setLines((current) => [...current, newLine(current.at(-1)?.documentDate || postingDate)]))
          }
        >
          + Add More
        </Button>
        <span className="text-xs text-muted-foreground">
          {lines.length} {lines.length === 1 ? "line" : "lines"} · {selectedBank?.currency ?? "currency pending"}{" "}
          {displayAmount(totalUnits)}
        </span>
      </div>

      <section
        className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs"
        aria-labelledby="journal-preview-heading"
      >
        <header className="border-b border-primary/30 bg-primary/10 px-4 py-3 shadow-[inset_4px_0_0_var(--color-primary)]">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Accounting effect · Preview only</p>
          <h2 id="journal-preview-heading" className="mt-1 text-sm font-bold">
            Journal this payment would post after approval
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Nominal accounts are debited; the server-projected Bank Account ledger is credited. Saving or submitting
            does not post this journal.
          </p>
        </header>
        <table className="w-full border-collapse text-xs">
          <thead className="bg-primary text-primary-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-right">Debit</th>
              <th className="px-3 py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const nominal = nominalById.get(line.nominalAccountId);
              const units = decimalUnits(line.amount);
              if (!nominal || units === null || units <= 0n) return null;
              return (
                <tr key={line.id} className="border-b border-border">
                  <td className="px-3 py-2">
                    <strong>{nominal.code}</strong>
                    <span className="block text-muted-foreground">
                      {nominal.name} · line {index + 1}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {selectedBank?.currency ?? ""} {displayAmount(units)}
                  </td>
                  <td className="px-3 py-2 text-right">—</td>
                </tr>
              );
            })}
            {totalUnits > 0n && selectedBank ? (
              <tr className="border-b border-border">
                <td className="px-3 py-2">
                  <strong>{selectedBank.ledger_account_code}</strong>
                  <span className="block text-muted-foreground">
                    {selectedBank.ledger_account_name} · Bank Account control
                  </span>
                </td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right">
                  {selectedBank.currency} {displayAmount(totalUnits)}
                </td>
              </tr>
            ) : null}
            {totalUnits <= 0n ? (
              <tr>
                <td className="px-3 py-5 text-center text-muted-foreground" colSpan={3}>
                  Enter a positive line amount to preview the journal.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot className="bg-muted/50 font-semibold">
            <tr>
              <th className="px-3 py-2 text-left">Preview totals</th>
              <td className="px-3 py-2 text-right">
                {selectedBank?.currency ?? "—"} {displayAmount(totalUnits)}
              </td>
              <td className="px-3 py-2 text-right">
                {selectedBank?.currency ?? "—"} {displayAmount(totalUnits)}
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
          Preview only — Finance revalidates accounts, currency, rate, period and balance during explicit posting.
        </p>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5">
        <Button
          variant="ghost"
          type="button"
          disabled={busy}
          onClick={() =>
            leave(() => {
              if (onBack) onBack();
              else onNavigate?.("bank-payments");
            })
          }
        >
          Cancel
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            type="button"
            disabled={!editable || busy || (persistedId ? !canUpdate : !canCreate)}
            onClick={() => void save()}
          >
            {busy ? "Working…" : "Save Draft"}
          </Button>
          <Button
            type="button"
            disabled={!editable || busy || !canSubmit || (persistedId ? !canUpdate && dirty : !canCreate)}
            onClick={() => void submit()}
          >
            {busy ? "Working…" : "Submit for Approval"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

const selectClass =
  "min-h-10 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

function Field({ label, helper, children }: { label: string; helper: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-xs font-bold">{label}</span>
      {children}
      <small className="text-xs leading-snug text-muted-foreground">{helper}</small>
    </label>
  );
}

function EntryState({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center">
      <strong className="text-lg text-foreground">{title}</strong>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      {retry ? (
        <Button className="mt-4" variant="outline" type="button" onClick={retry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
