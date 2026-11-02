"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrMasterDirectory, HrMasterType } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { nextMasterCode } from "../model/hr-master-code";
import { HrMasterArchiveButton } from "../components/hr-master-archive-button";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import { preferredMasterCompany, rememberMasterCompany } from "../model/organisation-master-navigation";

type Record = HrMasterDirectory["items"][number];
type Editor = { mode: "create" | "edit"; code: string; name: string; description: string };

function editorFor(record: Record | undefined, type: HrMasterType, records: readonly Record[]): Editor {
  return {
    mode: record ? "edit" : "create",
    code:
      record?.code ??
      nextMasterCode(
        type,
        records.map((item) => item.code),
      ),
    name: record?.name ?? "",
    description: record?.description ?? "",
  };
}

export function HrMasterCatalogueSheetWorkspace({
  type,
  label,
  singular,
}: {
  type: HrMasterType;
  label: string;
  singular: string;
  guidance: string;
}) {
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [records, setRecords] = useState<Record[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HrMasterStatus>("active");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.master.read");
  const canCreate = permissions.includes("hr.master.create");
  const canUpdate = permissions.includes("hr.master.update");

  const loadRecords = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) return;
      setLoading(true);
      try {
        const result = await client.masters({ companyId: targetCompanyId, type, activeOnly: false });
        setRecords(result.items);
        setSelectedId((current) => (result.items.some((record) => record.id === current) ? current : ""));
        setMessage("");
      } catch {
        setMessage(`${label} could not be loaded from the authorized API. Refresh your session and try again.`);
      } finally {
        setLoading(false);
      }
    },
    [client, label, type],
  );

  useEffect(() => {
    if (sessionLoading || !canRead) {
      return;
    }
    client
      .companies()
      .then((result) => {
        setCompanies(result.items);
        const first = preferredMasterCompany(result.items);
        setCompanyId(first);
        return loadRecords(first);
      })
      .catch(() => {
        setMessage("Authorized companies could not be loaded. Refresh your session and sign in again if needed.");
        setLoading(false);
      });
  }, [canRead, client, loadRecords, sessionLoading]);

  const selected = records.find((record) => record.id === selectedId);
  const filtered = records
    .filter((record) => statusFilter === "all" || record.status === statusFilter)
    .filter((record) =>
      `${record.code} ${record.name} ${record.description}`.toLowerCase().includes(search.trim().toLowerCase()),
    );
  const closeSheet = () => {
    if (saving) return;
    setEditor(null);
    setSelectedId("");
  };

  const save = async () => {
    if (!editor || !companyId || !editor.name.trim()) {
      setMessage("Name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editor.mode === "create") {
        await client.createMaster(
          {
            company_id: companyId,
            type,
            code: "AUTO",
            name: editor.name.trim(),
            description: editor.description.trim(),
          },
          csrfToken(),
          crypto.randomUUID(),
        );
        setMessage(`${singular} created with an automatically allocated code.`);
      } else if (selected) {
        await client.updateMaster(
          selected.id,
          {
            company_id: companyId,
            code: selected.code,
            name: editor.name.trim(),
            description: editor.description.trim(),
          },
          csrfToken(),
          crypto.randomUUID(),
        );
        setMessage(`${singular} updated and recorded in the audit trail.`);
      }
      if (editor.mode === "create") setStatusFilter("active");
      setEditor(null);
      setSelectedId("");
      await loadRecords(companyId);
    } catch {
      setMessage(
        `The ${singular.toLowerCase()} change was rejected. Refresh and retry if the generated code is already in use.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const status = selected.status === "active" ? "inactive" : "active";
      await client.changeMasterStatus(selected.id, { company_id: companyId, status }, csrfToken(), crypto.randomUUID());
      setMessage(
        `${singular} ${status === "active" ? "activated" : "deactivated"}. Historical assignments remain readable.`,
      );
      setSelectedId("");
      await loadRecords(companyId);
    } catch {
      setMessage(`${singular} status could not be changed.`);
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-72 w-full" />;
  if (!session)
    return (
      <Alert>
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          Your browser session is not active. Sign in again, then reopen {label}.{" "}
          <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>
            Retry session
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>HR master access required</AlertTitle>
        <AlertDescription>This screen requires the HR master read permission.</AlertDescription>
      </Alert>
    );

  return (
    <section className="grid gap-3" aria-label={label}>
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(14rem,.8fr)_minmax(14rem,1fr)_auto] md:items-end">
        <label className="grid gap-1 text-sm font-medium" htmlFor={`master-${type}-company`}>
          Company
          <select
            id={`master-${type}-company`}
            className="h-10 min-w-0 rounded-md border border-input bg-background px-3"
            value={companyId}
            onChange={(event) => {
              setCompanyId(event.target.value);
              rememberMasterCompany(event.target.value);
              closeSheet();
              void loadRecords(event.target.value);
            }}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor={`master-${type}-search`}>
          Search
          <Input
            id={`master-${type}-search`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
          />
        </label>
        {canCreate ? (
          <Button
            className="w-full md:w-auto"
            onClick={() => {
              setSelectedId("");
              setEditor(editorFor(undefined, type, records));
            }}
          >
            + Add {singular}
          </Button>
        ) : null}
      </div>
      <HrMasterStatusFilter value={statusFilter} onChange={setStatusFilter} />
      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-180 w-full text-sm">
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">{singular}</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60"
                    key={record.id}
                    onClick={() => {
                      setEditor(null);
                      setSelectedId(record.id);
                    }}
                  >
                    <td className="px-4 py-3 font-semibold">{record.code}</td>
                    <td className="px-4 py-3 font-medium">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-left whitespace-normal"
                        onClick={() => {
                          setEditor(null);
                          setSelectedId(record.id);
                        }}
                      >
                        {record.name}
                      </Button>
                    </td>
                    <td className="max-w-md px-4 py-3 text-muted-foreground">{record.description || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`nx-status nx-status-${record.status}`}>{record.status}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={4}>
                      No {label.toLowerCase()} match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <HrMasterSheet
        message={message}
        open={Boolean(editor || selected)}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        eyebrow="Organisation & Masters"
        title={
          editor ? (editor.mode === "create" ? `Add ${singular}` : `Edit ${singular}`) : (selected?.name ?? singular)
        }
        description={
          editor
            ? "The reference code is generated automatically and remains stable after creation."
            : `${selected?.code ?? ""} · Company master record`
        }
        footer={
          editor ? (
            <>
              <Button variant="outline" disabled={saving} onClick={closeSheet}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : canUpdate && selected ? (
            <>
              {selected.status === "active" ? (
                <HrMasterArchiveButton name={selected.name} saving={saving} onArchive={changeStatus} />
              ) : null}
              <Button variant="outline" disabled={saving} onClick={() => void changeStatus()}>
                {selected.status === "active" ? "Deactivate" : "Activate"}
              </Button>
              <Button onClick={() => setEditor(editorFor(selected, type, records))}>Edit {singular}</Button>
            </>
          ) : undefined
        }
      >
        {editor ? (
          <div className="grid gap-5">
            <label className="grid gap-1.5 text-sm font-medium" htmlFor={`master-${type}-code`}>
              Auto-generated code
              <Input id={`master-${type}-code`} value={editor.code} disabled />
              <span className="text-xs font-normal text-muted-foreground">
                Assigned automatically to keep records consistent.
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor={`master-${type}-name`}>
              Name
              <Input
                id={`master-${type}-name`}
                maxLength={160}
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor={`master-${type}-description`}>
              Description
              <Textarea
                id={`master-${type}-description`}
                className="min-h-32 resize-y"
                maxLength={1000}
                value={editor.description}
                onChange={(event) => setEditor({ ...editor, description: event.target.value })}
              />
            </label>
          </div>
        ) : selected ? (
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Detail label="Code" value={selected.code} />
              <Detail label="Status" value={selected.status} status={selected.status} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="mt-2 leading-relaxed">{selected.description || "No description recorded."}</p>
            </div>
          </div>
        ) : null}
      </HrMasterSheet>
    </section>
  );
}

function Detail({ label, value, status }: { label: string; value: string; status?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {status ? (
        <span className={`mt-2 inline-flex nx-status nx-status-${status}`}>{value}</span>
      ) : (
        <p className="mt-1 font-semibold">{value}</p>
      )}
    </div>
  );
}
