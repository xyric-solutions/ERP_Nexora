"use client";
import { useEffect, useRef, useState } from "react";
import type {
  BankSelfApprovalDirectory,
  BankSelfApprovalGrant,
  BankSelfApprovalOptions,
  ChangeBankSelfApprovalRequest,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function message(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Bank approval administration is unavailable. Retry the same request safely.";
}
export default function BankSelfApprovalPanel() {
  const { session } = useSession();
  return <Panel key={`${session?.tenant_id}:${session?.user.id}:${session?.user.permissions.join(",")}`} />;
}
function Panel() {
  const { api, session, csrfToken } = useSession(),
    notify = useActionFeedback();
  const permissions = session?.user.permissions ?? [];
  const global =
    !!session?.user.roles.includes("super_administrator") &&
    permissions.includes("platform.approval.override") &&
    !session?.impersonation;
  const canRead = global && permissions.includes("security.bank_self_approval.read"),
    canManage = canRead && permissions.includes("security.bank_self_approval.manage");
  const [company, setCompany] = useState(""),
    [kind, setKind] = useState<"payment" | "receipt">("payment");
  const [options, setOptions] = useState<BankSelfApprovalOptions>({ companies: [], users: [], next_cursor: null });
  const [page, setPage] = useState<BankSelfApprovalDirectory>({ items: [], next_cursor: null });
  const [history, setHistory] = useState(false),
    [cursor, setCursor] = useState(""),
    [userCursor, setUserCursor] = useState(""),
    [search, setSearch] = useState("");
  const [user, setUser] = useState(""),
    [selected, setSelected] = useState<BankSelfApprovalGrant | null>(null),
    [selectedReady, setSelectedReady] = useState(false),
    [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true),
    [optionsLoading, setOptionsLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api
      .listBankSelfApprovalOptions("")
      .then((result) => {
        if (!active) return;
        setOptions(result);
        setCompany((current) =>
          result.companies.some((item) => item.id === current) ? current : (result.companies[0]?.id ?? ""),
        );
        if (!result.companies.length) {
          setLoading(false);
          setOptionsLoading(false);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(message(caught));
          setLoading(false);
          setOptionsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, canRead, refresh]);
  useEffect(() => {
    if (!canRead || !company) return;
    let active = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        company_id: company,
        transaction_kind: kind,
        limit: "50",
        ...(search ? { search } : {}),
        ...(userCursor ? { cursor: userCursor } : {}),
      });
      api
        .listBankSelfApprovalOptions(`?${query}`)
        .then((result) => {
          if (active)
            setOptions((current) => ({
              ...result,
              users: userCursor
                ? [
                    ...current.users,
                    ...result.users.filter((item) => !current.users.some((prior) => prior.id === item.id)),
                  ]
                : result.users,
            }));
        })
        .catch((caught) => {
          if (active) setError(message(caught));
        })
        .finally(() => {
          if (active) setOptionsLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, canRead, company, kind, search, userCursor, refresh]);
  useEffect(() => {
    if (!canRead || !company) return;
    let active = true;
    const query = new URLSearchParams({
      company_id: company,
      transaction_kind: kind,
      history: String(history),
      limit: "50",
      ...(cursor ? { cursor } : {}),
    });
    api
      .listBankSelfApprovalGrants(`?${query}`)
      .then((result) => {
        if (active) setPage(result);
      })
      .catch((caught) => {
        if (active) {
          setError(message(caught));
          setPage({ items: [], next_cursor: null });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, canRead, company, kind, history, cursor, refresh]);
  useEffect(() => {
    if (!company || !user || !canManage) return;
    let active = true;
    const query = new URLSearchParams({
      company_id: company,
      transaction_kind: kind,
      user_id: user,
      history: "false",
      limit: "1",
    });
    api
      .listBankSelfApprovalGrants(`?${query}`)
      .then((result) => {
        if (active) {
          setSelected(result.items[0] ?? null);
          setSelectedReady(true);
        }
      })
      .catch((caught) => {
        if (active) setError(message(caught));
      });
    return () => {
      active = false;
    };
  }, [api, company, kind, user, canManage, refresh]);
  function reset() {
    setPage({ items: [], next_cursor: null });
    setCursor("");
    setUserCursor("");
    setSearch("");
    setUser("");
    setSelected(null);
    setSelectedReady(false);
    setReason("");
    setError("");
    setLoading(true);
    setOptionsLoading(true);
    setOptions((current) => ({ ...current, users: [], next_cursor: null }));
  }
  async function change(target: string, version: number, state: "active" | "revoked") {
    if (!canManage || busy || reason.trim().length < 3) return;
    const input: ChangeBankSelfApprovalRequest = {
      company_id: company,
      transaction_kind: kind,
      user_id: target,
      expected_version: version,
      state,
      reason: reason.trim(),
    };
    const fingerprint = JSON.stringify(input),
      key = retry.current?.fingerprint === fingerprint ? retry.current.key : `bank-grant-${crypto.randomUUID()}`;
    retry.current = { fingerprint, key };
    setBusy(true);
    setError("");
    try {
      await api.changeBankSelfApprovalGrant(input, csrfToken(), key);
      retry.current = null;
      reset();
      setRefresh((value) => value + 1);
      notify(
        state === "active"
          ? "Bank self-approval grant issued successfully."
          : "Bank self-approval grant revoked successfully.",
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  if (!canRead)
    return (
      <Alert role="alert">
        <AlertDescription>
          Active global administrator authority and explicit security.bank_self_approval.read permission are required.
          Impersonation cannot administer Bank grants.
        </AlertDescription>
      </Alert>
    );
  return (
    <Card className="m-5 min-w-0">
      <CardHeader>
        <CardTitle>Bank self-approval grants</CardTitle>
        <CardDescription>
          Company and transaction-kind scoped exceptions. They never grant normal approval, posting or master-data
          authority. Each change creates immutable grant and audit history.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <fieldset disabled={busy} className="grid gap-3 md:grid-cols-3">
          <Label className="grid gap-1" htmlFor="bank-grant-company">
            Company
            <select
              id="bank-grant-company"
              aria-label="Company"
              className={selectClass}
              value={company}
              onChange={(e) => {
                if (e.target.value === company) return;
                reset();
                setCompany(e.target.value);
              }}
            >
              <option value="">Select authorized company</option>
              {options.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </Label>
          <Label className="grid gap-1" htmlFor="bank-grant-kind">
            Transaction kind
            <select
              id="bank-grant-kind"
              aria-label="Transaction kind"
              className={selectClass}
              value={kind}
              onChange={(e) => {
                if (e.target.value === kind) return;
                reset();
                setKind(e.target.value === "receipt" ? "receipt" : "payment");
              }}
            >
              <option value="payment">Bank Payments</option>
              <option value="receipt">Bank Receipts</option>
            </select>
          </Label>
          <Label className="grid gap-1" htmlFor="bank-grant-history">
            History
            <select
              id="bank-grant-history"
              aria-label="History"
              className={selectClass}
              value={String(history)}
              onChange={(e) => {
                if ((e.target.value === "true") === history) return;
                setHistory(e.target.value === "true");
                setCursor("");
                setPage({ items: [], next_cursor: null });
                setLoading(true);
                setError("");
              }}
            >
              <option value="false">Latest grant versions</option>
              <option value="true">Immutable version history</option>
            </select>
          </Label>
        </fieldset>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {canManage && company && (
          <fieldset disabled={busy} className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-2">
            <legend className="px-2 text-sm font-medium">Issue or revoke explicit authority</legend>
            <Label className="grid gap-1" htmlFor="bank-grant-search">
              Find eligible user
              <Input
                id="bank-grant-search"
                value={search}
                maxLength={160}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setUserCursor("");
                  setOptionsLoading(true);
                  setOptions((current) => ({ ...current, users: [], next_cursor: null }));
                }}
              />
            </Label>
            <Label className="grid gap-1" htmlFor="bank-grant-user">
              User
              <select
                id="bank-grant-user"
                aria-label="User"
                className={selectClass}
                value={user}
                disabled={optionsLoading || busy}
                onChange={(e) => {
                  if (e.target.value === user) return;
                  setUser(e.target.value);
                  setSelected(null);
                  setSelectedReady(false);
                }}
              >
                <option value="">
                  {optionsLoading ? "Loading eligible users…" : "Select a user with normal approval authority"}
                </option>
                {user && !options.users.some((item) => item.id === user) && <option value={user}>{user}</option>}
                {options.users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.id}
                  </option>
                ))}
              </select>
            </Label>
            {options.next_cursor && (
              <Button
                variant="outline"
                disabled={optionsLoading}
                onClick={() => {
                  setUserCursor(options.next_cursor!);
                  setOptionsLoading(true);
                }}
              >
                Load more eligible users
              </Button>
            )}
            <Label className="grid gap-1 md:col-span-2" htmlFor="bank-grant-reason">
              Administration reason
              <Input
                id="bank-grant-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </Label>
            <Button
              disabled={!user || !selectedReady || reason.trim().length < 3 || selected?.state === "active"}
              onClick={() => void change(user, selected?.version ?? 0, "active")}
            >
              Issue self-approval grant
            </Button>
            <p className="text-sm text-muted-foreground">
              Revocation affects future decisions, not historical approvals. Separate Bank posting controls still apply.
            </p>
          </fieldset>
        )}
        {loading ? (
          <p role="status">Loading persisted Bank grants…</p>
        ) : !company ? (
          <p role="status">No authorized company is available.</p>
        ) : !page.items.length ? (
          <p role="status">No grants match this selection.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">User</th>
                  <th className="p-2">State / Version</th>
                  <th className="p-2">Immutable audit</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="p-2">
                      {row.user_name}
                      <span className="block text-xs text-muted-foreground">{row.user_id}</span>
                    </td>
                    <td className="p-2">
                      <Badge variant="secondary">{row.state}</Badge>
                      <span className="block">Version {row.version}</span>
                    </td>
                    <td className="p-2">
                      <p>{row.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.actor_id} · {row.created_at}
                      </p>
                      <code className="break-all text-xs">{row.audit_event_id}</code>
                    </td>
                    <td className="p-2">
                      {canManage && !history && row.state === "active" ? (
                        <Button
                          variant="destructive"
                          disabled={busy || reason.trim().length < 3}
                          onClick={() => void change(row.user_id, row.version, "revoked")}
                        >
                          Revoke {row.user_id}
                        </Button>
                      ) : (
                        "Read-only history"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            reset();
            setRefresh((value) => value + 1);
          }}
        >
          Refresh grants
        </Button>
        {cursor && (
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => {
              setCursor("");
              setPage({ items: [], next_cursor: null });
              setLoading(true);
            }}
          >
            First page
          </Button>
        )}
        {page.next_cursor && (
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => {
              setCursor(page.next_cursor!);
              setPage({ items: [], next_cursor: null });
              setLoading(true);
            }}
          >
            Next grants
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
