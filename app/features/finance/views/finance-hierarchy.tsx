"use client";
import { WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { useEffect, useRef, useState } from "react";
import type {
  FinanceHierarchyItem,
  CreateFinanceHierarchyRequest,
  ChangeFinanceHierarchyRequest,
} from "@nexora/contracts";
import { inActiveCompany } from "@/lib/session/active-company";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useActionFeedback } from "@/shared/ui/action-feedback";
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export function FinanceHierarchy() {
  const { session } = useSession();
  return <HierarchyWorkspace key={`${session?.tenant_id}:${session?.user.id}`} />;
}
function HierarchyWorkspace() {
  const { api, session, csrfToken } = useSession(),
    notify = useActionFeedback();
  const [companyReady, setCompanyReady] = useState(false),
    [company, setCompany] = useState(""),
    [rows, setRows] = useState<FinanceHierarchyItem[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<FinanceHierarchyItem | null>(null),
    [name, setName] = useState(""),
    [parent, setParent] = useState(""),
    [type, setType] = useState<FinanceHierarchyItem["type"]>("expense");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null),
    lock = useRef(false),
    request = useRef(0);
  const permissions = session?.user.permissions ?? [],
    canRead = permissions.includes("finance.nominal.read");
  const admin =
    !!session?.user.roles.includes("super_administrator") &&
    permissions.includes("platform.approval.override") &&
    !session.impersonation;
  function reset() {
    setSelected(null);
    setName("");
    setParent("");
    setType("expense");
    retry.current = null;
  }
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api
      .listFinanceNominalOptions("")
      .then((v) => {
        if (active) {
          // Only the company chosen at sign-in is managed here.
          const companies = inActiveCompany({ items: v.companies }).items;
          setCompanyReady(true);
          setCompany((c) => (companies.some((x) => x.id === c) ? c : (companies[0]?.id ?? "")));
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : "Company directory unavailable.");
      });
    return () => {
      active = false;
    };
  }, [api, canRead, refresh]);
  useEffect(() => {
    if (!canRead || !company) return;
    let active = true;
    const token = ++request.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      api
        .listFinanceHierarchy(`?company_id=${encodeURIComponent(company)}&limit=100`)
        .then((v) => {
          if (active && token === request.current) {
            setRows(v.items);
            setCursor(v.next_cursor);
          }
        })
        .catch((e) => {
          if (active) {
            setRows([]);
            setCursor(null);
            setError(e instanceof ApiError ? e.message : "Hierarchy directory unavailable.");
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, canRead, company, refresh]);
  async function more() {
    if (!cursor || busy || loading) return;
    const token = request.current;
    setLoading(true);
    try {
      const v = await api.listFinanceHierarchy(
        `?company_id=${encodeURIComponent(company)}&limit=100&cursor=${encodeURIComponent(cursor)}`,
      );
      if (token === request.current) {
        setRows((r) => [...r, ...v.items.filter((x) => !r.some((y) => y.id === x.id))]);
        setCursor(v.next_cursor);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "More masters could not be loaded.");
    } finally {
      if (token === request.current) setLoading(false);
    }
  }
  async function save(action?: "activate" | "deactivate") {
    const permission = selected
      ? action
        ? "finance.nominal.status"
        : "finance.nominal.update"
      : "finance.nominal.create";
    if (!admin || !permissions.includes(permission) || !company || lock.current) return;
    const category = rows.find((r) => r.id === parent);
    const input: CreateFinanceHierarchyRequest | ChangeFinanceHierarchyRequest = selected
      ? { expected_version: selected.version, ...(action ? { action } : { name: name.trim() }) }
      : {
          company_id: company,
          name: name.trim(),
          type: category?.type ?? type,
          ...(parent ? { parent_id: parent } : {}),
        };
    const fingerprint = JSON.stringify({ company, id: selected?.id, input });
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: `coa-header-${crypto.randomUUID()}` };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if ("company_id" in input) await api.createFinanceHierarchy(input, csrfToken(), retry.current.key);
      else await api.changeFinanceHierarchy(selected!.id, company, input, csrfToken(), retry.current.key);
      notify(
        `Chart of Accounts master ${action === "deactivate" ? "deactivated" : action === "activate" ? "activated" : selected ? "updated" : "created and activated"} successfully. No approval or posting was performed.`,
      );
      reset();
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Master change failed. Retry the same request or refresh after a conflict.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Permission required: finance.nominal.read.</AlertDescription>
      </Alert>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Categories &amp; Sections</CardTitle>
        <CardDescription>
          Super Admin master management · Direct audited changes · No approval or posting
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-end gap-3">
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => {
              reset();
              setRefresh((v) => v + 1);
            }}
          >
            Refresh masters
          </Button>
        </div>
        {companyReady && !company && (
          <Alert>
            <AlertDescription>
              The company chosen at sign-in is not available for Chart of Accounts masters.
            </AlertDescription>
          </Alert>
        )}
        {!admin && (
          <Alert>
            <AlertDescription>
              Read-only. Only a global Super Admin can create, edit, activate or deactivate Chart of Accounts master
              data.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading && <p role="status">Loading company masters…</p>}
        {!loading && !rows.length && !error && <p>No company categories or sections are available.</p>}
        <div className="overflow-x-auto">
          <WorkTable tableId="app/features/finance/views/finance-hierarchy:1" className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr>
                {["Code", "Name", "Kind", "Type", "Status", "Version"].map((h) => (
                  <th key={h} className="border-b p-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border-b p-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (busy) return;
                        setSelected(row);
                        setName(row.name);
                        setParent(row.parent_id ?? "");
                        setType(row.type);
                        retry.current = null;
                      }}
                    >
                      {row.code}
                    </Button>
                  </td>
                  <td className="border-b p-2">{row.name}</td>
                  <td className="border-b p-2">{row.parent_id ? "Section" : "Category"}</td>
                  <td className="border-b p-2">{row.type}</td>
                  <td className="border-b p-2">{row.status}</td>
                  <td className="border-b p-2">{row.version}</td>
                </tr>
              ))}
            </tbody>
          </WorkTable>
        </div>
        {cursor && (
          <Button variant="outline" disabled={loading || busy} onClick={() => void more()}>
            More masters
          </Button>
        )}
        {company && admin && (
          <WorkForm
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-col gap-3 rounded-md border border-border p-4"
          >
            <h2 className="font-semibold">{selected ? "Edit master" : "New category or section"}</h2>
            <fieldset disabled={busy || loading} className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="coa-header-name">Master name</Label>
                <Input
                  id="coa-header-name"
                  required
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="coa-header-parent">Category</Label>
                <select
                  id="coa-header-parent"
                  className={selectClass}
                  disabled={!!selected}
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                >
                  <option value="">New root category</option>
                  {rows
                    .filter((r) => !r.parent_id && r.status === "active")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} · {r.name}
                      </option>
                    ))}
                </select>
              </div>
              {!parent && (
                <div>
                  <Label htmlFor="coa-header-type">Accounting type</Label>
                  <select
                    id="coa-header-type"
                    disabled={!!selected}
                    className={selectClass}
                    value={type}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "asset" || v === "liability" || v === "equity" || v === "revenue" || v === "expense")
                        setType(v);
                    }}
                  >
                    {["asset", "liability", "equity", "revenue", "expense"].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(parent || selected) && (
                <div>
                  <Label htmlFor="coa-header-code">Section / category code</Label>
                  <Input
                    id="coa-header-code"
                    readOnly
                    value={selected?.code ?? "Generated from Category when you save"}
                  />
                </div>
              )}
            </fieldset>
            <p className="text-sm text-muted-foreground">
              Codes are allocated automatically and remain immutable with parents and accounting types after creation. A
              new ordinary Section receives its own nominal code sequence. Existing dependent headers cannot be
              deactivated.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={
                  busy ||
                  loading ||
                  !permissions.includes(selected ? "finance.nominal.update" : "finance.nominal.create")
                }
              >
                {selected ? "Save master changes" : "Create & Activate"}
              </Button>
              {selected && permissions.includes("finance.nominal.status") && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || loading}
                  onClick={() => void save(selected.status === "active" ? "deactivate" : "activate")}
                >
                  {selected.status === "active" ? "Deactivate master" : "Activate master"}
                </Button>
              )}
              <Button type="button" variant="outline" disabled={busy} onClick={reset}>
                Clear selection
              </Button>
            </div>
          </WorkForm>
        )}
      </CardContent>
    </Card>
  );
}
