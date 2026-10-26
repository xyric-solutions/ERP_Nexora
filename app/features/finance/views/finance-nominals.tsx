"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FinanceNominalDetail,
  FinanceNominalDirectoryQuery,
  FinanceNominalOptions,
  FinanceNominalSummary,
} from "@nexora/contracts";
import { createFinanceNominalRequestSchema } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { BankAccountDetailWorkspace } from "@/features/banking/views/banking-account-governance";
import { FinanceNominalsClient } from "../api/finance-nominals-client";
import { FinancePostingReview } from "./finance-posting-review";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const emptyOptions: FinanceNominalOptions = {
  companies: [],
  selected_company_id: null,
  categories: [],
  sections: [],
  currencies: [],
  setup: { cash_and_bank_configured: false, code_policy_configured: false },
};
function message(error: unknown) {
  return error instanceof ApiError
    ? `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`
    : "The request could not be completed. Please retry.";
}
function Notice({ text }: { text: string }) {
  return (
    <Alert role="status">
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

interface FinanceNominalsProps {
  approvals?: boolean;
  title?: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onCentralTemplate?: () => void;
}

export function FinanceNominals(props: FinanceNominalsProps) {
  const { session } = useSession();
  return (
    <CompanyNominalDirectory
      key={`${session?.tenant_id ?? "no-tenant"}:${session?.user.id ?? "no-user"}:${session?.user.permissions.join(",") ?? ""}`}
      {...props}
    />
  );
}

function CompanyNominalDirectory({
  approvals = false,
  title = "Nominal accounts",
  onOpen,
  onCreate,
  onCentralTemplate,
}: FinanceNominalsProps) {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new FinanceNominalsClient(api), [api]);
  const [options, setOptions] = useState(emptyOptions),
    [company, setCompany] = useState(""),
    [rows, setRows] = useState<FinanceNominalSummary[]>([]);
  const [search, setSearch] = useState(""),
    [state, setState] = useState(""),
    [sort, setSort] = useState<FinanceNominalDirectoryQuery["sort_by"]>("code");
  const [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const canRead = !!session?.user.permissions.includes("finance.nominal.read");
  const requestVersion = useRef(0);
  function resetDirectory(willLoad = Boolean(company)) {
    requestVersion.current += 1;
    setRows([]);
    setCursor(null);
    setError("");
    setLoading(willLoad);
  }
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    client
      .options()
      .then((result) => {
        if (active) {
          setOptions(result);
          setCompany((current) =>
            result.companies.some((item) => item.id === current) ? current : result.companies[0]?.id || "",
          );
          if (!result.companies.length) setLoading(false);
        }
      })
      .catch((error) => {
        if (active) {
          setError(message(error));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [canRead, client, refresh]);
  const fetchRows = useCallback(
    async (next?: string) => {
      const version = ++requestVersion.current;
      setLoading(true);
      setError("");
      try {
        const result = await client.list({
          company_id: company,
          search,
          sort_by: sort,
          sort_direction: "asc",
          limit: 50,
          ...(approvals ? { nominal_kind: "bank" as const } : {}),
          ...(approvals
            ? { state: "pending_approval" as const }
            : state
              ? { state: state as NonNullable<FinanceNominalDirectoryQuery["state"]> }
              : {}),
          ...(next ? { cursor: next } : {}),
        });
        if (version !== requestVersion.current) return;
        setRows(result.items);
        setCursor(result.next_cursor);
      } catch (error) {
        if (version !== requestVersion.current) return;
        setRows([]);
        setCursor(null);
        setError(message(error));
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [client, company, search, sort, state, approvals],
  );
  useEffect(() => {
    if (!company || !canRead) return;
    const timer = setTimeout(() => {
      void fetchRows();
    }, 250);
    return () => {
      clearTimeout(timer);
      requestVersion.current += 1;
    };
  }, [company, canRead, fetchRows, refresh]);
  if (sessionLoading) return <Notice text="Loading your workspace…" />;
  if (!canRead) return <Notice text="You do not have permission to read Nominal accounts." />;
  const groups = new Map<string, FinanceNominalSummary[]>();
  for (const row of rows) {
    const key = `${row.category?.name ?? "Other accounts"} / ${row.section?.name ?? "Unsectioned"}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{approvals ? "Pending Bank Nominal approvals" : title}</CardTitle>
            <CardDescription>Chart of Accounts · Company master data · Currency Master</CardDescription>
          </div>
          {!approvals && onCentralTemplate && (
            <Button variant="outline" onClick={onCentralTemplate}>
              Central Master Data
            </Button>
          )}
          {!approvals && (
            <Button
              onClick={onCreate}
              disabled={
                !session?.user.roles.includes("super_administrator") ||
                !session.user.permissions.includes("platform.approval.override") ||
                !!session.impersonation ||
                !session.user.permissions.includes("finance.nominal.create")
              }
            >
              Add Nominal
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label>
            Company
            <select
              aria-label="Nominal company"
              className={selectClass}
              value={company}
              onChange={(event) => {
                resetDirectory(Boolean(event.target.value));
                setCompany(event.target.value);
              }}
            >
              <option value="">Select company</option>
              {options.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="nominal-search">
            Search
            <Input
              id="nominal-search"
              aria-label="Search nominals"
              value={search}
              onChange={(event) => {
                resetDirectory();
                setSearch(event.target.value);
              }}
              placeholder="Name or code"
            />
          </label>
          {!approvals && (
            <label>
              Status
              <select
                aria-label="Nominal status"
                className={selectClass}
                value={state}
                onChange={(event) => {
                  resetDirectory();
                  setState(event.target.value);
                }}
              >
                <option value="">All states</option>
                {["draft", "pending_approval", "active", "rejected", "inactive", "closed"].map((item) => (
                  <option key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Sort
            <select
              aria-label="Nominal sort"
              className={selectClass}
              value={sort}
              onChange={(event) => {
                resetDirectory();
                setSort(event.target.value as FinanceNominalDirectoryQuery["sort_by"]);
              }}
            >
              {["code", "name", "currency", "state"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            className="self-end"
            disabled={loading}
            onClick={() => {
              resetDirectory();
              setRefresh((value) => value + 1);
            }}
          >
            Refresh
          </Button>
        </div>
        {error && <Notice text={error} />}
        {loading ? (
          <Notice text="Loading Nominals…" />
        ) : !rows.length ? (
          <Notice text={company ? "No records match this selection." : "No authorized company is available."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-3">Code</th>
                  <th className="p-3">Nominal</th>
                  <th className="p-3">Currency</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Banking</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(groups, ([group, items]) => (
                  <Fragment key={group}>
                    <tr className="bg-muted">
                      <th className="p-3" colSpan={5}>
                        {group}
                      </th>
                    </tr>
                    {items.map((row) => (
                      <tr key={row.id} className="border-b">
                        <td className="p-3">
                          <Button variant="link" onClick={() => onOpen(row.id)}>
                            {row.code}
                          </Button>
                        </td>
                        <td className="p-3">{row.name}</td>
                        <td className="p-3">{row.currency ?? "—"}</td>
                        <td className="p-3">
                          <Badge variant="secondary">{(row.state ?? row.account_status).replaceAll("_", " ")}</Badge>
                        </td>
                        <td className="p-3">
                          {row.banking_available
                            ? "Available"
                            : row.bank_account_id
                              ? "Not active"
                              : "Not a Bank account"}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <Button variant="outline" disabled={loading} onClick={() => void fetchRows(cursor)}>
            Next page
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function FinanceNominalForm({
  nominalId,
  bankOnly = false,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  nominalId?: string;
  bankOnly?: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const notify = useActionFeedback();
  const client = useMemo(() => new FinanceNominalsClient(api), [api]);
  const [options, setOptions] = useState(emptyOptions),
    [company, setCompany] = useState(""),
    [section, setSection] = useState(""),
    [name, setName] = useState(""),
    [currency, setCurrency] = useState(""),
    [description, setDescription] = useState("");
  const [bankDefinition, setBankDefinition] = useState("");
  const [saved, setSaved] = useState<{ id: string; code: string; version: number } | null>(null);
  const reason = "Nominal submitted for approval by the authorized user.";
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(""),
    [dirty, setDirty] = useState(false);
  const [detailLoading, setDetailLoading] = useState(!!nominalId),
    [editable, setEditable] = useState(!nominalId);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null),
    submitRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const permissions = session?.user.permissions ?? [];
  const selected = options.sections.find((item) => item.id === section);
  const isBank = bankOnly || selected?.section_role === "cash_and_bank";
  const canWrite =
    !!session?.user.roles.includes("super_administrator") &&
    permissions.includes("platform.approval.override") &&
    !session.impersonation &&
    permissions.includes(nominalId ? "finance.nominal.update" : "finance.nominal.create") &&
    (!isBank || permissions.includes(nominalId ? "banking.bank_account.update" : "banking.bank_account.create"));
  useEffect(() => {
    let active = true;
    client
      .options()
      .then((result) => {
        if (active) {
          setOptions(result);
          setCompany((current) => current || result.companies[0]?.id || "");
          setLoading(false);
        }
      })
      .catch((error) => {
        if (active) {
          setNotice(message(error));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [client]);
  useEffect(() => {
    if (!nominalId) return;
    let active = true;
    api
      .getFinanceNominal(nominalId)
      .then((detail) => {
        if (!active) return;
        setEditable(detail.capabilities.update);
        if (bankOnly && !detail.bank_account_id) {
          setEditable(false);
          setNotice("This is an ordinary nominal. Edit it from Chart of Accounts, not Bank Account Setup.");
          return;
        }
        if (!detail.capabilities.update) {
          setNotice("Only an authorized Super Admin can edit this master.");
          return;
        }
        setCompany(detail.company_id);
        setName(detail.name);
        setCurrency(detail.currency ?? "");
        setDescription(detail.description ?? "");
        setSection(detail.section?.id ?? "");
        setSaved({ id: detail.id, code: detail.code, version: detail.version! });
      })
      .catch((error) => {
        if (active) setNotice(message(error));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, nominalId, bankOnly]);
  useEffect(() => {
    if (!company) return;
    let active = true;
    client
      .options(company)
      .then((result) => {
        if (active) {
          setOptions(result);
          setSection((current) =>
            result.sections.some((item) => item.id === current)
              ? current
              : (result.sections.find(
                  (item) => item.creation_enabled && item.section_role === (bankOnly ? "cash_and_bank" : "general"),
                )?.id ??
                result.sections.find((item) => item.section_role === "cash_and_bank")?.id ??
                ""),
          );
          setCurrency((current) => current || result.currencies[0]?.code || "");
        }
      })
      .catch((error) => {
        if (active) setNotice(message(error));
      });
    return () => {
      active = false;
    };
  }, [client, company, bankOnly]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      onDirtyChange?.(false);
    };
  }, [dirty, onDirtyChange]);
  async function save(submit: boolean) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const parsed = createFinanceNominalRequestSchema.safeParse({
        nominal_kind: isBank ? "bank" : "general",
        company_id: company,
        category_id: selected?.category_id,
        section_id: section,
        name,
        currency,
        description,
        ...(!saved && isBank && bankDefinition
          ? {
              chart_template_id: options.bank_definitions?.find((item) => item.node_key === bankDefinition)
                ?.template_id,
              chart_node_key: bankDefinition,
            }
          : {}),
      });
      if (!parsed.success) {
        setNotice(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" "));
        document.getElementById("nominal-name")?.focus();
        return;
      }
      let current = saved;
      if (!current || dirty) {
        const creating = !current;
        const payload = parsed.data;
        const fingerprint = JSON.stringify({ saved: current?.id, payload, version: current?.version });
        if (retry.current?.fingerprint !== fingerprint)
          retry.current = { fingerprint, key: `nominal-save-${crypto.randomUUID()}` };
        current = current
          ? await api.updateFinanceNominal(
              current.id,
              {
                expected_version: current.version,
                name: payload.name,
                currency: payload.currency,
                description: payload.description ?? null,
              },
              csrfToken(),
              retry.current.key,
            )
          : await api.createFinanceNominal(payload, csrfToken(), retry.current.key);
        setSaved(current);
        setDirty(false);
        onDirtyChange?.(false);
        notify(
          isBank
            ? creating
              ? "New bank account created successfully."
              : "Bank account updated successfully."
            : creating
              ? "New nominal account created successfully."
              : "Nominal account updated successfully.",
        );
      }
      if (submit) {
        const fingerprint = JSON.stringify({ id: current.id, version: current.version, reason });
        if (submitRetry.current?.fingerprint !== fingerprint)
          submitRetry.current = { fingerprint, key: `nominal-submit-${crypto.randomUUID()}` };
        await api.submitFinanceNominal(
          current.id,
          { expected_version: current.version, reason },
          csrfToken(),
          submitRetry.current.key,
        );
        notify(
          isBank
            ? "Bank account submitted for approval successfully."
            : "Nominal account submitted for approval successfully.",
        );
      }
      onSaved(current.id);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(false);
    }
  }
  if (sessionLoading || loading || detailLoading) return <Notice text="Loading Nominal master data…" />;
  if (!canWrite)
    return (
      <Notice text="You do not have the required Finance permissions (and Banking permissions for Bank accounts)." />
    );
  if (!editable) return <Notice text={notice || "This nominal cannot be edited."} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {saved ? "Edit" : "New"} {isBank ? "Bank Nominal" : "Nominal Account"}
        </CardTitle>
        <CardDescription>Company Chart of Accounts · Category → Section → Nominal</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {notice && <Notice text={notice} />}
        {!selected?.creation_enabled && !saved && (
          <Notice text="Section setup is required. Configure the company headers and an available nominal code policy before creating accounts." />
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
          className="grid gap-5 md:grid-cols-2"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="nominal-company">Company</Label>
            <select
              id="nominal-company"
              className={selectClass}
              disabled={!!saved || busy}
              value={company}
              onChange={(event) => {
                if (dirty && !window.confirm("Discard unsaved Nominal changes?")) return;
                setCompany(event.target.value);
                setBankDefinition("");
                setSection("");
                setCurrency("");
                setDirty(true);
              }}
            >
              <option value="">Select company</option>
              {options.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nominal-code">Nominal code</Label>
            <Input
              id="nominal-code"
              readOnly
              value={
                saved?.code ??
                options.bank_definitions?.find((item) => item.node_key === bankDefinition)?.code ??
                "Generated when you save"
              }
            />
          </div>
          {!saved && isBank && !!options.bank_definitions?.length && (
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="nominal-bank-definition">Approved Excel Bank definition</Label>
              <select
                id="nominal-bank-definition"
                className={selectClass}
                disabled={busy}
                value={bankDefinition}
                onChange={(event) => {
                  const definition = options.bank_definitions?.find((item) => item.node_key === event.target.value);
                  setBankDefinition(event.target.value);
                  setName(definition?.name ?? "");
                  if (definition) setSection(definition.section_id);
                  setCurrency("");
                  setDirty(true);
                }}
              >
                <option value="">Create a new Bank nominal with the next generated code</option>
                {options.bank_definitions.map((item) => (
                  <option key={item.node_key} value={item.node_key} disabled={item.configured}>
                    {item.code} · {item.name}
                    {item.configured ? " (already configured)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                Selecting a definition preserves its Excel name and reserved code. Select the actual account currency
                explicitly; no currency is inferred from the name.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="nominal-category">Category</Label>
            <select
              id="nominal-category"
              className={selectClass}
              disabled={!!saved || busy || bankOnly}
              value={selected?.category_id ?? ""}
              onChange={(event) => {
                setSection(
                  options.sections.find((item) => item.category_id === event.target.value && item.creation_enabled)
                    ?.id ??
                    options.sections.find((item) => item.category_id === event.target.value)?.id ??
                    "",
                );
                setDirty(true);
              }}
            >
              <option value="">Select Category</option>
              {options.categories
                .filter(
                  (item) =>
                    !bankOnly ||
                    options.sections.some(
                      (section) => section.category_id === item.id && section.section_role === "cash_and_bank",
                    ),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nominal-section">Section</Label>
            <select
              id="nominal-section"
              className={selectClass}
              disabled={!!saved || busy}
              value={section}
              onChange={(event) => {
                setSection(event.target.value);
                setBankDefinition("");
                setDirty(true);
              }}
            >
              <option value="">Select Section</option>
              {options.sections
                .filter((item) => !bankOnly || item.section_role === "cash_and_bank")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nominal-name">Nominal account name *</Label>
            <Input
              id="nominal-name"
              readOnly={!saved && !!bankDefinition}
              required
              maxLength={160}
              disabled={busy}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setDirty(true);
              }}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nominal-currency">Currency *</Label>
            <select
              id="nominal-currency"
              className={selectClass}
              required
              disabled={busy}
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value);
                setDirty(true);
              }}
            >
              <option value="">Select currency</option>
              {options.currencies.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="nominal-description">Description</Label>
            <Textarea
              id="nominal-description"
              maxLength={2000}
              disabled={busy}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setDirty(true);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Button type="submit" disabled={busy || (!saved && !selected?.creation_enabled)}>
              {nominalId ? "Save changes" : "Save & Activate"}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function FinanceNominalDetail({
  nominalId,
  onBack,
  onEdit,
}: {
  nominalId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
}) {
  const { api, csrfToken } = useSession();
  const notify = useActionFeedback();
  const [detail, setDetail] = useState<FinanceNominalDetail | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  const [action, setAction] = useState<"submit" | "approve" | "reject" | "activate" | "deactivate" | null>(null),
    [reason, setReason] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    api
      .getFinanceNominal(nominalId)
      .then((result) => {
        if (active) {
          setDetail(result);
          setError("");
        }
      })
      .catch((error) => {
        if (active) {
          setDetail(null);
          setError(message(error));
        }
      });
    return () => {
      active = false;
    };
  }, [api, nominalId, refresh]);
  async function confirm() {
    if (!action || !detail?.version || busy) return;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify({ action, reason, id: detail.id, version: detail.version });
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: `nominal-${action}-${crypto.randomUUID()}` };
    try {
      const payload = {
        expected_version: detail.version,
        reason:
          action === "reject"
            ? reason
            : action === "submit"
              ? "Nominal submitted for approval by the authorized user."
              : "Nominal status change confirmed by the authorized user.",
      };
      if (action === "submit") await api.submitFinanceNominal(detail.id, payload, csrfToken(), retry.current.key);
      else if (action === "deactivate" || action === "activate")
        await api.changeFinanceNominalStatus(detail.id, { ...payload, action }, csrfToken(), retry.current.key);
      else
        await api.decideFinanceNominal(
          detail.id,
          action === "approve" ? { expected_version: detail.version, action } : { ...payload, action },
          csrfToken(),
          retry.current.key,
        );
      const messages = {
        submit: "Bank account submitted for approval successfully.",
        approve: "Bank account approved successfully.",
        reject: "Bank account rejected successfully.",
        deactivate: "Bank account deactivated successfully.",
        activate: "Bank account activated successfully. No approval or posting was performed.",
      };
      notify(detail.bank_account_id ? messages[action] : messages[action].replace("Bank account", "Nominal account"));
      setAction(null);
      setReason("");
      setRefresh((value) => value + 1);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{detail ? `${detail.code} · ${detail.name}` : "Nominal detail"}</CardTitle>
            <CardDescription>Persisted Finance and Banking master data</CardDescription>
          </div>
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error && <Notice text={error} />}
        <Button variant="outline" onClick={() => setRefresh((value) => value + 1)} disabled={busy}>
          Refresh
        </Button>
        {!detail && !error && <Notice text="Loading Nominal…" />}
        {detail && (
          <>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Category", detail.category?.name ?? "—"],
                ["Section", detail.section?.name ?? "—"],
                ["Currency", detail.currency ?? "—"],
                ["Status", (detail.state ?? detail.account_status).replaceAll("_", " ")],
                ["Description", detail.description || "—"],
                [
                  "Banking",
                  detail.bank_account_id
                    ? detail.banking_available
                      ? "Available"
                      : "Not active"
                    : "Not a Bank account",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {detail.capabilities.decide &&
              detail.self_decision_requires_override &&
              detail.state === "pending_approval" && (
                <Notice
                  text={
                    detail.super_admin_override_allowed
                      ? "Your super-admin approval will be recorded in the audit history."
                      : "An independent checker must decide this request."
                  }
                />
              )}
            <FinancePostingReview
              key={`${detail.id}:${detail.version}`}
              detail={detail}
              onUpdated={() => setRefresh((value) => value + 1)}
            />
            <div className="flex flex-wrap gap-3">
              {detail.capabilities.activate && <Button onClick={() => setAction("activate")}>Activate now</Button>}
              {detail.capabilities.update && (
                <Button variant="outline" onClick={() => onEdit(detail.id)}>
                  Edit nominal
                </Button>
              )}
              {detail.capabilities.submit && <Button onClick={() => setAction("submit")}>Submit for approval</Button>}
              {detail.capabilities.decide && (
                <>
                  <Button onClick={() => setAction("approve")}>Approve</Button>
                  <Button variant="destructive" onClick={() => setAction("reject")}>
                    Reject
                  </Button>
                </>
              )}
              {detail.capabilities.deactivate && (
                <Button variant="destructive" onClick={() => setAction("deactivate")}>
                  Deactivate
                </Button>
              )}
            </div>
            <h3 className="font-semibold">History</h3>
            {!detail.events.length ? (
              <p className="text-muted-foreground">No Nominal lifecycle events are available for this legacy record.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {detail.events.map((event) => (
                  <li key={event.id} className="border-l-2 pl-4">
                    <p className="font-medium">
                      {event.event_type} · {event.actor_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(event.occurred_at).toLocaleString()} {event.reason && `· ${event.reason}`}
                    </p>
                    {event.approval_override_event_id && (
                      <Badge variant="secondary">Governed approval override recorded</Badge>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        <Dialog
          open={!!action}
          onOpenChange={(open) => {
            if (!open && !busy) setAction(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action
                  ? `${action.charAt(0).toUpperCase()}${action.slice(1)} ${detail?.bank_account_id ? "bank account" : "nominal account"}`
                  : "Account"}
              </DialogTitle>
              <DialogDescription>
                {action === "approve"
                  ? detail?.bank_account_id
                    ? "Activate this account for Banking. Approval does not post a financial transaction."
                    : "Activate this reviewed nominal for Finance. Approval does not post a financial transaction."
                  : "Confirm this change to the company account master."}
              </DialogDescription>
            </DialogHeader>
            {detail?.super_admin_override_allowed && (action === "approve" || action === "reject") && (
              <SuperAdminOverrideWarning reasonRequired={action === "reject"} />
            )}
            {action === "reject" && (
              <>
                <Label htmlFor="nominal-action-reason">Rejection reason</Label>
                <Textarea
                  id="nominal-action-reason"
                  minLength={3}
                  maxLength={500}
                  required
                  value={reason}
                  disabled={busy}
                  onChange={(event) => setReason(event.target.value)}
                />
              </>
            )}
            {error && <Notice text={error} />}
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy || (action === "reject" && reason.trim().length < 3)}
                onClick={() => void confirm()}
              >
                {busy ? "Saving…" : action === "approve" ? "Approve & Close" : `Confirm ${action}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function BankNominalDetailBridge({
  accountId,
  onBack,
  onEdit,
}: {
  accountId: string | null;
  onBack: () => void;
  onEdit: (id: string) => void;
}) {
  const { api } = useSession();
  const [nominal, setNominal] = useState<string | null>(null),
    [legacy, setLegacy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!accountId || accountId.startsWith("nominal-")) return;
    let active = true;
    api
      .getBankAccount(accountId)
      .then((account) => {
        if (active) {
          if (account.identity_mode === "nominal_only") setNominal(account.ledger_account_id);
          else setLegacy(true);
        }
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [api, accountId]);
  if (accountId?.startsWith("nominal-"))
    return <FinanceNominalDetail nominalId={accountId} onBack={onBack} onEdit={onEdit} />;
  if (nominal) return <FinanceNominalDetail nominalId={nominal} onBack={onBack} onEdit={onEdit} />;
  if (legacy) return <BankAccountDetailWorkspace accountId={accountId ?? ""} onBack={onBack} />;
  return (
    <Notice text={error || (!accountId ? "Select a Bank Account from Account Balances." : "Loading Bank Account…")} />
  );
}
