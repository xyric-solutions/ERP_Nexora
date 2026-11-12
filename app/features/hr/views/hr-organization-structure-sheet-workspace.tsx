"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrOrganizationUnitDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import {
  HrDetailAudit,
  HrDetailFigures,
  HrDetailGroup,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrApiClient } from "../api/hr-client";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { nextGeneratedCode, organizationUnitPrefixes } from "../model/hr-master-code";
import { HrMasterStatusBadge } from "../components/hr-master-status-badge";
import { HrMasterDeleteButton } from "../components/hr-master-delete-button";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import { HrPagination, HrSearchField, matchesSearch, useHrPage } from "../components/hr-list-controls";
import { preferredMasterCompany } from "../model/organisation-master-navigation";
import {
  canReportTo,
  defaultChildType,
  organizationUnitTypeLabels as typeLabels,
  selectableOrganizationUnitTypes,
  type OrganizationUnitType as UnitType,
} from "../model/organization-hierarchy";

type Unit = HrOrganizationUnitDirectory["items"][number];
/**
 * A Location reports into the company, a Project into a Location and a
 * Department into a Project. `parentId` is derived from the Location/Project
 * picks; on edit it starts as the unit's current parent so a rename never
 * re-parents a unit placed under the earlier hierarchy.
 */
type Editor = {
  mode: "create" | "edit";
  parentId: string;
  locationId: string;
  projectId: string;
  type: UnitType;
  code: string;
  name: string;
};
const selectClass =
  "h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-50";

export function HrOrganizationStructureSheetWorkspace() {
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [statusFilter, setStatusFilter] = useState<HrMasterStatus>("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const permissions = session?.user.permissions ?? [],
    canRead = permissions.includes("hr.organization.read"),
    canWrite = permissions.includes("hr.organization.update");

  const refresh = useCallback(
    async (targetCompanyId = companyId) => {
      if (!targetCompanyId) return;
      setLoading(true);
      try {
        const result = await client.organizationUnits({ companyId: targetCompanyId, includeInactive: true });
        setUnits(result.items);
        setSelectedId((current) =>
          current === targetCompanyId || result.items.some((unit) => unit.id === current) ? current : "",
        );
      } catch {
        setMessage("The organization structure could not be loaded from the authorized API.");
      } finally {
        setLoading(false);
      }
    },
    [client, companyId],
  );
  useEffect(() => {
    if (sessionLoading || !canRead) return;
    client
      .companies()
      .then((result) => {
        setCompanies(result.items);
        const first = preferredMasterCompany(result.items);
        setCompanyId(first);
        return refresh(first);
      })
      .catch(() => {
        setMessage("Authorized companies could not be loaded.");
        setLoading(false);
      });
  }, [canRead, client, refresh, sessionLoading]);

  const company = companies.find((item) => item.id === companyId),
    selected = units.find((item) => item.id === selectedId);
  const childrenOf = (parentId: string) => units.filter((item) => item.parent_id === parentId);
  const visibleIds = new Set(
    units
      .filter(
        (unit) =>
          (statusFilter === "all" || unit.status === statusFilter) &&
          matchesSearch(search, [unit.name, unit.code, typeLabels[unit.type]]),
      )
      .map((unit) => unit.id),
  );
  for (const id of [...visibleIds]) {
    let parent = units.find((unit) => unit.id === id)?.parent_id;
    const visited = new Set<string>();
    while (parent && parent !== companyId && !visited.has(parent)) {
      visited.add(parent);
      visibleIds.add(parent);
      parent = units.find((unit) => unit.id === parent)?.parent_id;
    }
  }
  const visibleChildrenOf = (parentId: string) => childrenOf(parentId).filter((unit) => visibleIds.has(unit.id));
  /** Top-level branches (with everything beneath them) are paged 15 at a time. */
  const topLevelPage = useHrPage(visibleChildrenOf(companyId), `${companyId}:${statusFilter}:${search.trim()}`);
  const generatedCode = (type: UnitType) =>
    nextGeneratedCode(
      organizationUnitPrefixes[type],
      units.map((unit) => unit.code),
    );
  /** Nearest ancestor of `type`, including the unit itself. */
  const ancestorOfType = (unitId: string, type: UnitType) => {
    const visited = new Set<string>();
    let current = units.find((unit) => unit.id === unitId);
    while (current && !visited.has(current.id)) {
      if (current.type === type) return current.id;
      visited.add(current.id);
      const parentId: string = current.parent_id;
      current = units.find((unit) => unit.id === parentId);
    }
    return "";
  };
  /** Parent implied by the Location/Project picks for the levels this form manages. */
  const derivedParent = (type: UnitType, locationId: string, projectId: string) =>
    type === "division" ? companyId : type === "branch" ? locationId : type === "department" ? projectId : "";
  const activeOfType = (type: UnitType) =>
    units.filter((unit) => unit.type === type && unit.status === "active" && unit.id !== selected?.id);
  const closeSheet = () => {
    if (!saving) {
      setEditor(null);
      setSelectedId("");
    }
  };
  const openCreate = (
    parentId = selectedId || companyId,
    parentType: UnitType | "company" = selected?.type ?? "company",
  ) => {
    const type = defaultChildType(parentType);
    const locationId = parentType === "company" ? "" : ancestorOfType(parentId, "division");
    const projectId = parentType === "company" ? "" : ancestorOfType(parentId, "branch");
    setEditor({
      mode: "create",
      parentId: derivedParent(type, locationId, projectId),
      locationId,
      projectId,
      type,
      code: generatedCode(type),
      name: "",
    });
    setMessage("");
  };
  const openEdit = () =>
    selected &&
    setEditor({
      mode: "edit",
      parentId: selected.parent_id,
      locationId: ancestorOfType(selected.parent_id, "division"),
      projectId: ancestorOfType(selected.parent_id, "branch"),
      type: selected.type,
      code: selected.code,
      name: selected.name,
    });
  const save = async () => {
    if (!editor || !companyId) return;
    const missing = [
      !editor.parentId && editor.type === "branch" ? "location" : "",
      !editor.parentId && editor.type === "department" ? (editor.locationId ? "project" : "location and project") : "",
      !editor.parentId && !["branch", "department"].includes(editor.type) ? "parent" : "",
      !editor.name.trim() ? "name" : "",
    ].filter(Boolean);
    if (missing.length) {
      setMessage(`Choose or enter the ${missing.join(" and ")}.`);
      return;
    }
    setSaving(true);
    try {
      if (editor.mode === "create") {
        await client.createOrganizationUnit(
          {
            company_id: companyId,
            parent_id: editor.parentId,
            type: editor.type,
            code: "AUTO",
            name: editor.name.trim(),
          },
          csrfToken(),
          crypto.randomUUID(),
        );
        setMessage(`${typeLabels[editor.type]} created with an automatically allocated code.`);
      } else if (selected) {
        await client.updateOrganizationUnit(
          selected.id,
          { company_id: companyId, parent_id: editor.parentId, code: selected.code, name: editor.name.trim() },
          csrfToken(),
          crypto.randomUUID(),
        );
        setMessage("Organization unit updated and recorded in the audit trail.");
      }
      if (editor.mode === "create") setStatusFilter("active");
      setEditor(null);
      setSelectedId("");
      await refresh();
    } catch {
      setMessage(
        "The change was rejected. Check parent status, company access, hierarchy rules, and retry if the generated code is already used.",
      );
    } finally {
      setSaving(false);
    }
  };
  const changeStatus = async () => {
    if (!selected) return;
    const status = selected.status === "active" ? "inactive" : "active";
    setSaving(true);
    try {
      await client.changeOrganizationUnitStatus(
        selected.id,
        { company_id: companyId, status },
        csrfToken(),
        crypto.randomUUID(),
      );
      setMessage(
        status === "active"
          ? "Organization unit activated."
          : "Organization unit deactivated. Historical references were retained.",
      );
      setSelectedId("");
      await refresh();
    } catch {
      setMessage("Status could not be changed. Active children and employee assignments must be moved first.");
    } finally {
      setSaving(false);
    }
  };
  const deleteUnit = async (unit: Unit) => {
    setSaving(true);
    try {
      await client.deleteOrganizationUnit(unit.id, { company_id: companyId }, csrfToken(), crypto.randomUUID());
      setMessage(`${unit.code} ${unit.name} was permanently deleted. Its code will not be reused.`);
      setSelectedId("");
      await refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${unit.name} could not be deleted.`);
      return false;
    } finally {
      setSaving(false);
    }
  };
  const renderUnit = (unit: Unit, depth: number) => (
    <li key={unit.id}>
      <div className="flex items-center transition-colors hover:bg-muted">
        <button
          className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-0 bg-transparent px-3 py-3 text-left text-sm sm:grid-cols-[minmax(6rem,.45fr)_minmax(10rem,1fr)_auto]"
          style={{ paddingLeft: `${12 + depth * 18}px` }}
          type="button"
          onClick={() => {
            setEditor(null);
            setSelectedId(unit.id);
          }}
        >
          <span className="col-span-2 text-xs font-bold uppercase tracking-wide text-muted-foreground sm:col-span-1">
            {typeLabels[unit.type]}
          </span>
          <span className="min-w-0 truncate font-semibold">
            {unit.name}
            <small className="ml-2 font-normal text-muted-foreground">{unit.code}</small>
          </span>
          <HrMasterStatusBadge status={unit.status} />
        </button>
      </div>
      {visibleChildrenOf(unit.id).length ? (
        <ul className="m-0 list-none border-l border-dashed border-border p-0">
          {visibleChildrenOf(unit.id).map((child) => renderUnit(child, depth + 1))}
        </ul>
      ) : null}
    </li>
  );

  if (sessionLoading) return <Skeleton className="h-72 w-full" />;
  if (!session)
    return (
      <Alert>
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          Your browser session is not active. Sign in again, then reopen Organisation Structure.{" "}
          <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>
            Retry session
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Organization access required</AlertTitle>
        <AlertDescription>This screen requires the HR organization read permission.</AlertDescription>
      </Alert>
    );

  return (
    <section className="grid gap-3" aria-label="Organization structure">
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end">
        <HrSearchField
          id="hr-organization-structure-search"
          value={search}
          onChange={setSearch}
          placeholder="Search location, project or department by name or code"
        />
        {canWrite && company ? (
          <Button className="w-full md:w-auto" onClick={() => openCreate(company.id, "company")}>
            + Add organization unit
          </Button>
        ) : null}
      </div>
      <HrMasterStatusFilter value={statusFilter} onChange={setStatusFilter} />
      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : !company ? (
        <Alert>
          <AlertTitle>No authorized company</AlertTitle>
          <AlertDescription>
            Company access must be granted before the organization tree can be maintained.
          </AlertDescription>
        </Alert>
      ) : (
        <nav
          className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
          aria-label="Organization tree"
        >
          <button
            className="grid w-full grid-cols-1 gap-2 border-b border-border bg-muted/40 px-3 py-3 text-left text-sm hover:bg-muted sm:grid-cols-[minmax(6rem,.45fr)_minmax(10rem,1fr)]"
            type="button"
            onClick={() => {
              setEditor(null);
              setSelectedId(company.id);
            }}
          >
            <span className="text-xs font-bold uppercase text-muted-foreground">Company</span>
            <span className="truncate font-semibold">
              {company.name}
              <small className="ml-2 font-normal text-muted-foreground">{company.code}</small>
            </span>
          </button>
          <ul className="m-0 list-none p-0">{topLevelPage.pageRows.map((unit) => renderUnit(unit, 1))}</ul>
          {visibleIds.size === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {search.trim() ? "No organization units match this search." : "No organization units match these filters."}
            </p>
          ) : null}
        </nav>
      )}
      {!loading && company ? (
        <HrPagination
          label="Organization structure pages"
          page={topLevelPage.page}
          pageCount={topLevelPage.pageCount}
          total={topLevelPage.total}
          onPageChange={topLevelPage.setPage}
        />
      ) : null}
      <HrMasterSheet
        message={message}
        open={Boolean(editor || selectedId)}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
        eyebrow="Organisation Structure"
        title={
          editor
            ? editor.mode === "create"
              ? "Add organization unit"
              : "Edit organization unit"
            : (selected?.name ?? company?.name ?? "Organization")
        }
        description={
          editor
            ? "The unit code is generated automatically from its type."
            : `${selected ? typeLabels[selected.type] : "Company"} · ${selected?.code ?? company?.code ?? ""}`
        }
        footer={
          editor ? (
            <>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : canWrite && selected ? (
            <>
              <Button variant="outline" disabled={saving} onClick={() => void changeStatus()}>
                {selected.status === "active" ? "Deactivate" : "Activate"}
              </Button>
              <HrEditButton label="Edit unit" onClick={openEdit} />
              <HrMasterDeleteButton
                name={selected.name}
                code={selected.code}
                saving={saving}
                onDelete={() => deleteUnit(selected)}
              />
            </>
          ) : canWrite && selectedId === companyId && company ? (
            <Button onClick={() => openCreate(company.id, "company")}>Add child unit</Button>
          ) : undefined
        }
      >
        {editor ? (
          <div className="grid gap-5">
            <HrDetailSection title="Unit">
              <div className="grid gap-3 sm:grid-cols-2">
                {editor.mode === "create" ? (
                  <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="organization-unit-type">
                    Unit type
                    <select
                      id="organization-unit-type"
                      className={selectClass}
                      value={editor.type}
                      onChange={(event) => {
                        const type = event.target.value as UnitType;
                        // Location and Project picks carry over between types.
                        setEditor({
                          ...editor,
                          type,
                          code: generatedCode(type),
                          parentId: derivedParent(type, editor.locationId, editor.projectId),
                        });
                      }}
                    >
                      {selectableOrganizationUnitTypes.map((value) => (
                        <option key={value} value={value}>
                          {typeLabels[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="organization-code">
                  Auto-generated code
                  <Input id="organization-code" value={editor.code} disabled />
                </label>
              </div>
              <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="organization-name">
                Name
                <Input
                  id="organization-name"
                  maxLength={200}
                  value={editor.name}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                />
              </label>
            </HrDetailSection>
            {editor.type === "branch" || editor.type === "department" ? (
              <HrDetailSection title="Hierarchy">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="organization-location">
                    Location
                    <select
                      id="organization-location"
                      className={selectClass}
                      value={editor.locationId}
                      onChange={(event) => {
                        const locationId = event.target.value;
                        const projectId =
                          units.find((unit) => unit.id === editor.projectId)?.parent_id === locationId
                            ? editor.projectId
                            : "";
                        setEditor({
                          ...editor,
                          locationId,
                          projectId,
                          parentId: derivedParent(editor.type, locationId, projectId),
                        });
                      }}
                    >
                      <option value="" disabled>
                        Select a location
                      </option>
                      {activeOfType("division").map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name} · {unit.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  {editor.type === "department" ? (
                    <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="organization-project">
                      Project
                      <select
                        id="organization-project"
                        className={selectClass}
                        value={editor.projectId}
                        disabled={!editor.locationId}
                        onChange={(event) => {
                          const projectId = event.target.value;
                          setEditor({ ...editor, projectId, parentId: projectId });
                        }}
                      >
                        <option value="" disabled>
                          {editor.locationId ? "Select a project" : "Choose a location first"}
                        </option>
                        {activeOfType("branch")
                          .filter((unit) => unit.parent_id === editor.locationId)
                          .map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.name} · {unit.code}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </HrDetailSection>
            ) : editor.type !== "division" ? (
              <HrDetailSection title="Hierarchy">
                <label className="grid content-start gap-1.5 text-sm font-medium" htmlFor="organization-parent">
                  Reports into
                  <select
                    id="organization-parent"
                    className={selectClass}
                    value={editor.parentId}
                    onChange={(event) => setEditor({ ...editor, parentId: event.target.value })}
                  >
                    {canReportTo(editor.type, "company") && company ? (
                      <option value={company.id}>{company.name}</option>
                    ) : null}
                    {units
                      .filter(
                        (unit) =>
                          unit.id !== selected?.id && unit.status === "active" && canReportTo(editor.type, unit.type),
                      )
                      .map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {typeLabels[unit.type]} · {unit.name}
                        </option>
                      ))}
                  </select>
                </label>
              </HrDetailSection>
            ) : null}
          </div>
        ) : (
          <div className="grid min-w-0 gap-4">
            <HrDetailSummary code={selected?.code ?? company?.code} status={selected?.status ?? "active"}>
              {selected ? typeLabels[selected.type] : "Company"}
            </HrDetailSummary>
            <HrDetailFigures
              items={[
                { label: "Direct children", value: childrenOf(selectedId).length },
                { label: "Employees here", value: selected?.employee_count ?? 0 },
              ]}
            />
            <HrDetailGroup title="Details">
              <HrDetailTile label="Name" value={selected?.name ?? company?.name ?? "—"} />
              <HrDetailTile label="Type" value={selected ? typeLabels[selected.type] : "Company"} />
            </HrDetailGroup>
            <HrDetailGroup title="Hierarchy">
              <HrDetailTile
                label="Reports into"
                value={
                  selected
                    ? (units.find((unit) => unit.id === selected.parent_id)?.name ?? company?.name ?? "—")
                    : "Top of the tree"
                }
              />
              <HrDetailTile label="Head" value={selected?.head_name ?? "Not assigned"} />
            </HrDetailGroup>
            {selected ? (
              <RecordStamps record={selected} />
            ) : (
              <HrDetailAudit items={[{ label: "Created", value: "Platform record" }]} />
            )}
          </div>
        )}
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
