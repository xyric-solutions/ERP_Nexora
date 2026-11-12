"use client";
import { WorkTable } from "@/shared/ui/work-table";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrMasterDirectory, HrMasterType } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import {
  HrDetailAudit,
  HrDetailGroup,
  HrDetailNote,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrApiClient } from "../api/hr-client";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { nextMasterCode } from "../model/hr-master-code";
import { HrMasterStatusBadge } from "../components/hr-master-status-badge";
import { HrMasterDeleteButton } from "../components/hr-master-delete-button";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import { preferredMasterCompany } from "../model/organisation-master-navigation";
import { organizationUnitTypeLabels } from "../model/organization-hierarchy";

type Record = HrMasterDirectory["items"][number];
type Unit = Awaited<ReturnType<HrApiClient["organizationUnits"]>>["items"][number];
type Editor = { mode: "create" | "edit"; code: string; name: string; description: string; departmentId: string };

/** "Development · Lahore office": the department and the unit it reports into. */
function departmentPath(units: readonly Unit[], departmentId: string | null | undefined): string | null {
  const department = units.find((unit) => unit.id === departmentId);
  if (!department) return null;
  const parent = units.find((unit) => unit.id === department.parent_id);
  return parent ? `${department.name} · ${organizationUnitTypeLabels[parent.type]} ${parent.name}` : department.name;
}

function editorFor(record: Record | undefined, type: HrMasterType, records: readonly Record[]): Editor {
  return {
    departmentId: record?.owning_org_unit_id ?? "",
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
  nameLabel = "Name",
  namePlaceholder,
  withDepartment = false,
}: {
  type: HrMasterType;
  label: string;
  singular: string;
  guidance: string;
  /** Label of the name field and column, such as Position or Job title. */
  nameLabel?: string;
  namePlaceholder?: string;
  /** Jobs belong to a department, chosen when the job is created. */
  withDepartment?: boolean;
}) {
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companyId, setCompanyId] = useState("");
  const [records, setRecords] = useState<Record[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HrMasterStatus>("active");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.master.read");
  const canCreate = permissions.includes("hr.master.create");
  const canUpdate = permissions.includes("hr.master.update");

  const loadRecords = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) return;
      setLoading(true);
      try {
        const [result, unitResult] = await Promise.all([
          client.masters({ companyId: targetCompanyId, type, activeOnly: false }),
          withDepartment
            ? client.organizationUnits({ companyId: targetCompanyId, limit: 200 })
            : Promise.resolve({ items: [] as Unit[] }),
        ]);
        setRecords(result.items);
        setUnits(unitResult.items);
        setSelectedId((current) => (result.items.some((record) => record.id === current) ? current : ""));
        setMessage("");
      } catch {
        setMessage(`${label} could not be loaded from the authorized API. Refresh your session and try again.`);
      } finally {
        setLoading(false);
      }
    },
    [client, label, type, withDepartment],
  );

  useEffect(() => {
    if (sessionLoading || !canRead) {
      return;
    }
    client
      .companies()
      .then((result) => {
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
  const departments = units.filter((unit) => unit.type === "department" && unit.status === "active");
  const departmentLabel = (record: Record) =>
    departmentPath(units, record.owning_org_unit_id) ?? record.owning_org_unit ?? "Not linked";
  const filtered = records
    .filter((record) => statusFilter === "all" || record.status === statusFilter)
    .filter((record) =>
      `${record.code} ${record.name} ${record.description} ${withDepartment ? departmentLabel(record) : ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
  const closeSheet = () => {
    if (saving) return;
    setEditor(null);
    setSelectedId("");
  };

  const save = async () => {
    if (!editor || !companyId || !editor.name.trim()) {
      setMessage(`${nameLabel} is required.`);
      return;
    }
    if (withDepartment && !editor.departmentId) {
      setMessage(`Choose the department this ${singular.toLowerCase()} belongs to.`);
      return;
    }
    const department = withDepartment ? { owning_org_unit_id: editor.departmentId } : {};
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
            ...department,
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
            ...department,
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

  const deleteRecord = async (record: { id: string; code: string; name: string }) => {
    setSaving(true);
    try {
      await client.deleteMaster(record.id, { company_id: companyId }, csrfToken(), crypto.randomUUID());
      setMessage(`${record.code} ${record.name} was permanently deleted. Its code will not be reused.`);
      setSelectedId("");
      await loadRecords(companyId);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${record.name} could not be deleted.`);
      return false;
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
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end">
        <label className="grid content-start gap-1 text-sm font-medium" htmlFor={`master-${type}-search`}>
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
            <WorkTable tableId="app/features/hr/views/hr-master-catalogue-sheet-workspace:1" className="min-w-180 w-full text-sm">
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">{nameLabel === "Name" ? singular : nameLabel}</th>
                  {withDepartment ? <th className="px-4 py-3 text-left">Department</th> : null}
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
                    {withDepartment ? (
                      <td className={`px-4 py-3 ${record.owning_org_unit_id ? "" : "text-muted-foreground"}`}>
                        {departmentLabel(record)}
                      </td>
                    ) : null}
                    <td className="max-w-md px-4 py-3 text-muted-foreground">{record.description || "—"}</td>
                    <td className="px-4 py-3">
                      <HrMasterStatusBadge status={record.status} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={withDepartment ? 5 : 4}>
                      No {label.toLowerCase()} match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </WorkTable>
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
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : canUpdate && selected ? (
            <>
              <Button variant="outline" disabled={saving} onClick={() => void changeStatus()}>
                {selected.status === "active" ? "Deactivate" : "Activate"}
              </Button>
              <HrEditButton label={`Edit ${singular}`} onClick={() => setEditor(editorFor(selected, type, records))} />
              <HrMasterDeleteButton
                name={selected.name}
                code={selected.code}
                saving={saving}
                onDelete={() => deleteRecord(selected)}
              />
            </>
          ) : undefined
        }
      >
        {editor ? (
          <div className="grid gap-5">
            <HrDetailSection title="Details">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor={`master-${type}-code`}>
                  Auto-generated code
                  <Input id={`master-${type}-code`} value={editor.code} disabled />
                </label>
                <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor={`master-${type}-name`}>
                  {nameLabel}
                  <Input
                    id={`master-${type}-name`}
                    maxLength={160}
                    placeholder={namePlaceholder}
                    value={editor.name}
                    onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                  />
                </label>
              </div>
            </HrDetailSection>
            {withDepartment ? (
              <HrDetailSection title="Assignment">
                <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor={`master-${type}-department`}>
                  Department
                  <select
                    id={`master-${type}-department`}
                    className="h-10 rounded-md border border-input bg-background px-3"
                    value={editor.departmentId}
                    onChange={(event) => setEditor({ ...editor, departmentId: event.target.value })}
                  >
                    <option value="">{departments.length ? "Select a department" : "No active departments"}</option>
                    {/* A job's current department stays visible even if it was deactivated later. */}
                    {editor.departmentId && !departments.some((unit) => unit.id === editor.departmentId) ? (
                      <option value={editor.departmentId}>
                        {departmentPath(units, editor.departmentId) ??
                          selected?.owning_org_unit ??
                          "Current department"}
                      </option>
                    ) : null}
                    {departments.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {departmentPath(units, unit.id)}
                      </option>
                    ))}
                  </select>
                  {departments.length ? null : (
                    <span className="text-xs font-normal text-muted-foreground">
                      Add a department in Organisation Structure first.
                    </span>
                  )}
                </label>
              </HrDetailSection>
            ) : null}
            <HrDetailSection title="Description">
              <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor={`master-${type}-description`}>
                Description
                <Textarea
                  id={`master-${type}-description`}
                  className="min-h-32 resize-y"
                  maxLength={1000}
                  value={editor.description}
                  onChange={(event) => setEditor({ ...editor, description: event.target.value })}
                />
              </label>
            </HrDetailSection>
          </div>
        ) : selected ? (
          <div className="grid min-w-0 gap-4">
            <HrDetailSummary code={selected.code} status={selected.status}>
              {singular}
              {withDepartment ? ` · ${departmentLabel(selected)}` : " · Company master record"}
            </HrDetailSummary>
            <HrDetailGroup title="Details">
              <HrDetailTile label={nameLabel === "Name" ? singular : nameLabel} value={selected.name} />
              {withDepartment ? <HrDetailTile label="Department" value={departmentLabel(selected)} /> : null}
            </HrDetailGroup>
            <HrDetailSection title="Description">
              {selected.description ? (
                <HrDetailNote>{selected.description}</HrDetailNote>
              ) : (
                <p className="m-0! text-sm text-muted-foreground">No description recorded.</p>
              )}
            </HrDetailSection>
            <RecordStamps record={selected} />
          </div>
        ) : null}
      </HrMasterSheet>
    </section>
  );
}

/** "Created by", "Created" and "Last updated" line, shown when the API provides them. */
function RecordStamps({
  record,
}: {
  record: { created_by_name?: string | null; created_at?: string; updated_at?: string };
}) {
  return (
    <HrDetailAudit
      items={[
        { label: "Created by", value: record.created_by_name },
        { label: "Created", value: hrDisplayDate(record.created_at, true) },
        { label: "Last updated", value: hrDisplayDate(record.updated_at, true) },
      ]}
    />
  );
}
