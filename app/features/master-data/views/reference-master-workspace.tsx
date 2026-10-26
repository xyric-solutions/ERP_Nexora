"use client";

import { useEffect, useRef, useState } from "react";
import type { ReferenceMaster, ReferenceMasterDirectory, ReferenceMasterKind } from "@nexora/contracts";
import { createReferenceMasterRequestSchema } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useActionFeedback } from "@/shared/ui/action-feedback";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function message(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "The request could not be completed. Retry without changing the request.";
}
function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <Alert variant={error ? "destructive" : "default"} role={error ? "alert" : "status"}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
interface Props {
  kind: ReferenceMasterKind;
  onDirtyChange?: (dirty: boolean) => void;
}
export function ReferenceMasterWorkspace(props: Props) {
  const { session } = useSession();
  return (
    <Directory
      key={`${session?.tenant_id}:${session?.user.id}:${session?.user.permissions.join(",")}:${props.kind}`}
      {...props}
    />
  );
}
function Directory({ kind, onDirtyChange }: Props) {
  const { api, session, loading: sessionLoading } = useSession();
  const permission = kind === "projects" ? "master_data.project" : "master_data.location";
  const title = kind === "projects" ? "Projects" : "Locations / Cities";
  const canRead = !!session?.user.permissions.includes(`${permission}.read`);
  const canManage = !!session?.user.permissions.includes(`${permission}.manage`) && !session.impersonation;
  const [companies, setCompanies] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState<string[]>([""]);
  const [page, setPage] = useState<ReferenceMasterDirectory>({ items: [], next_cursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReferenceMaster | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const request = useRef(0);
  const cursor = history.at(-1) ?? "";
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api
      .listReferenceMasterCompanies(kind)
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        setCompany((current) =>
          result.items.some((item) => item.id === current) ? current : (result.items[0]?.id ?? ""),
        );
        if (!result.items.length) setLoading(false);
      })
      .catch((caught) => {
        if (active) {
          setError(message(caught));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, canRead, kind, refresh]);
  useEffect(() => {
    if (!canRead || !company) return;
    let active = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        company_id: company,
        limit: "50",
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(cursor ? { cursor } : {}),
      });
      api
        .listReferenceMasters(kind, `?${query}`)
        .then((result) => {
          if (active) setPage(result);
        })
        .catch((caught) => {
          if (active) setError(message(caught));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, canRead, company, kind, search, status, cursor, refresh]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  function reset() {
    setPage({ items: [], next_cursor: null });
    setHistory([""]);
    setError("");
    setLoading(!!company);
  }
  function close() {
    request.current += 1;
    setSelection(null);
    setDetail(null);
    setDetailLoading(false);
    setError("");
    onDirtyChange?.(false);
  }
  async function open(id: string) {
    const version = ++request.current;
    setError("");
    setSelection(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const result = await api.getReferenceMaster(kind, id, company);
      if (version === request.current) setDetail(result);
    } catch (caught) {
      if (version === request.current) setError(message(caught));
    } finally {
      if (version === request.current) setDetailLoading(false);
    }
  }
  if (sessionLoading) return <Notice>Loading your session…</Notice>;
  if (!canRead) return <Notice error>You do not have permission to read {title.toLowerCase()}.</Notice>;
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                Company reporting master data · shared with Banking, separate from HR statutory locations
              </CardDescription>
            </div>
            <Button
              disabled={!canManage || !company || selection !== null}
              onClick={() => {
                setSelection("new");
                setDetail(null);
              }}
            >
              Add {kind === "projects" ? "Project" : "Location"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1">
              Company
              <select
                aria-label="Reference company"
                className={selectClass}
                value={company}
                disabled={selection !== null}
                onChange={(event) => {
                  reset();
                  setCompany(event.target.value);
                  if (!event.target.value) setLoading(false);
                }}
              >
                <option value="">Select company</option>
                {companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1" htmlFor="reference-search">
              Search
              <Input
                id="reference-search"
                aria-label="Search references"
                value={search}
                maxLength={160}
                onChange={(event) => {
                  reset();
                  setSearch(event.target.value);
                }}
              />
            </label>
            <label className="grid gap-1">
              Status
              <select
                aria-label="Reference status"
                className={selectClass}
                value={status}
                onChange={(event) => {
                  reset();
                  setStatus(event.target.value);
                }}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <Button
              variant="outline"
              className="self-end"
              disabled={loading}
              onClick={() => {
                reset();
                setRefresh((value) => value + 1);
              }}
            >
              Refresh
            </Button>
          </div>
          {error && <Notice error>{error}</Notice>}
          {loading ? (
            <Notice>Loading {title.toLowerCase()}…</Notice>
          ) : !page.items.length ? (
            <Notice>{company ? "No records match this selection." : "No authorized company is available."}</Notice>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-3">Code</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Version</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-3 font-mono">{item.code}</td>
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{item.status}</Badge>
                      </td>
                      <td className="p-3">{item.version}</td>
                      <td className="p-3">
                        <Button variant="link" disabled={selection !== null} onClick={() => void open(item.id)}>
                          View {item.code}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Page {history.length} · {page.items.length} records · PostgreSQL persisted
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={loading || history.length === 1}
              onClick={() => {
                setPage({ items: [], next_cursor: null });
                setLoading(true);
                setError("");
                setHistory((value) => value.slice(0, -1));
              }}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={loading || !page.next_cursor}
              onClick={() => {
                const next = page.next_cursor;
                if (next) {
                  setPage({ items: [], next_cursor: null });
                  setLoading(true);
                  setError("");
                  setHistory((value) => [...value, next]);
                }
              }}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      </Card>
      {selection !== null &&
        (detailLoading ? (
          <Notice>Loading persisted reference…</Notice>
        ) : selection === "new" || detail ? (
          <ReferenceEditor
            key={`${selection}:${detail?.version ?? 0}`}
            kind={kind}
            company={company}
            record={detail}
            canManage={canManage}
            onClose={close}
            onDirtyChange={onDirtyChange}
            onSaved={() => {
              close();
              reset();
              setRefresh((value) => value + 1);
            }}
          />
        ) : (
          <Button variant="outline" onClick={close}>
            Close detail
          </Button>
        ))}
    </div>
  );
}
function ReferenceEditor({
  kind,
  company,
  record,
  canManage,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  kind: ReferenceMasterKind;
  company: string;
  record: ReferenceMaster | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, csrfToken } = useSession(),
    notify = useActionFeedback();
  const [editing, setEditing] = useState(!record),
    [code, setCode] = useState(record?.code ?? ""),
    [name, setName] = useState(record?.name ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmStatus, setConfirmStatus] = useState(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const locked = useRef(false);
  const dirty = code !== (record?.code ?? "") || name !== (record?.name ?? "");
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  async function save(statusOnly = false) {
    if (!canManage || locked.current) return;
    if (!statusOnly && !createReferenceMasterRequestSchema.safeParse({ company_id: company, code, name }).success) {
      setError("Enter a valid code and name. Codes use letters, numbers, dots, underscores or hyphens.");
      return;
    }
    const payload =
      statusOnly && record
        ? {
            company_id: company,
            expected_version: record.version,
            status: record.status === "active" ? ("inactive" as const) : ("active" as const),
          }
        : record
          ? { company_id: company, expected_version: record.version, name: name.trim() }
          : { company_id: company, code: code.trim(), name: name.trim() };
    const fingerprint = JSON.stringify({ kind, id: record?.id, statusOnly, payload });
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: `reference-${crypto.randomUUID()}` };
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      if (statusOnly && record)
        await api.changeReferenceMasterStatus(
          kind,
          record.id,
          {
            company_id: company,
            expected_version: record.version,
            status: record.status === "active" ? "inactive" : "active",
          },
          csrfToken(),
          retry.current.key,
        );
      else if (record)
        await api.updateReferenceMaster(
          kind,
          record.id,
          { company_id: company, expected_version: record.version, name: name.trim() },
          csrfToken(),
          retry.current.key,
        );
      else
        await api.createReferenceMaster(
          kind,
          { company_id: company, code: code.trim(), name: name.trim() },
          csrfToken(),
          retry.current.key,
        );
      notify(
        `${kind === "projects" ? "Project" : "Location"} ${statusOnly ? "status updated" : record ? "updated" : "created"} successfully.`,
      );
      onSaved();
    } catch (caught) {
      setError(message(caught));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <Card aria-label="Reference detail">
      <CardHeader>
        <CardTitle>
          {record
            ? editing
              ? "Edit reference"
              : "Reference details"
            : kind === "projects"
              ? "New Project"
              : "New Location / City"}
        </CardTitle>
        <CardDescription>
          Codes and company identities are permanent. Changes retain immutable audit history.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Notice error>{error}</Notice>}
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Reference fields</legend>
          <div className="flex flex-col gap-1">
            <Label htmlFor="reference-code">Code</Label>
            <Input
              id="reference-code"
              value={code}
              maxLength={64}
              readOnly={!!record || !editing}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="reference-name">Name</Label>
            <Input
              id="reference-name"
              value={name}
              maxLength={200}
              readOnly={!editing}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </fieldset>
        {record && (
          <p className="text-sm text-muted-foreground">
            {record.status} · Version {record.version} · Updated {record.updated_at}
          </p>
        )}
        {confirmStatus && (
          <Notice>
            Confirm {record?.status === "active" ? "deactivation" : "reactivation"}. Historical references are retained;
            inactive records cannot be selected for new transactions.
          </Notice>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          {editing ? "Cancel" : "Close details"}
        </Button>
        {canManage &&
          (editing ? (
            <Button disabled={busy || !name.trim() || !code.trim()} onClick={() => void save()}>
              Save reference
            </Button>
          ) : (
            <>
              <Button disabled={busy || confirmStatus} onClick={() => setEditing(true)}>
                Edit reference
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => (confirmStatus ? void save(true) : setConfirmStatus(true))}
              >
                {confirmStatus ? "Confirm status change" : record?.status === "active" ? "Deactivate" : "Reactivate"}
              </Button>
            </>
          ))}
      </CardFooter>
    </Card>
  );
}
