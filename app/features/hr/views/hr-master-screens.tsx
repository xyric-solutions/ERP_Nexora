"use client";

/**
 * Core HR foundation screens: the organisation structure and the six HR
 * masters.
 *
 * Every master screen offers the same nine things, because a reviewer should
 * not have to learn a new screen per master: list, search, filter, add, edit,
 * view, status, history and audit trail. That is one component driven by a
 * master definition, not six copies.
 *
 * Two rules are visible rather than merely claimed:
 *   - A master that is referenced by any employee assignment - including a
 *     closed, historical one - cannot be deleted. The screen says how many
 *     records use it and offers Deactivate instead of Delete.
 *   - Only an active master can be chosen for a new assignment; an inactive
 *     one stays visible so historical records still read correctly.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  childrenOf,
  employeeAssignments,
  employees,
  employedStatuses,
  hrMasters,
  masterIsInUse,
  masterUsageCount,
  orgUnits,
  type MasterDefinition,
  type MasterRecord,
  type OrgUnit,
} from "../model/hr-core-data";
import type { ModuleColumn, ModuleRow } from "@prototype/shared/types/module-profile-types";
import { ModuleSearchableTable } from "@prototype/shared/ui/module-views";

type MasterView = { kind: "list" } | { kind: "record"; recordId: string; tab: RecordTab };
type RecordTab = "Details" | "History" | "Audit trail";

const recordTabs: readonly RecordTab[] = ["Details", "History", "Audit trail"];

function toRow(master: MasterDefinition, record: MasterRecord): ModuleRow {
  return {
    id: record.id,
    cells: {
      code: record.code,
      name: record.name,
      detail: record.detail,
      description: record.description,
      usage: String(masterUsageCount(master.id, record.id)),
      createdOn: record.createdOn,
      createdBy: record.createdBy,
    },
    status: record.status,
  };
}

function columnsFor(master: MasterDefinition): readonly ModuleColumn[] {
  return [
    { key: "code", label: "Code" },
    { key: "name", label: master.singular },
    { key: "detail", label: master.detailLabel },
    { key: "description", label: "Description" },
    { key: "usage", label: "In use by", numeric: true },
    { key: "createdOn", label: "Created" },
  ];
}

export function HrMasterScreen({
  master,
  onAction,
}: {
  master: MasterDefinition;
  onAction: (action: string, subject?: string) => void;
}) {
  const [view, setView] = useState<MasterView>({ kind: "list" });
  const record = view.kind === "record" ? master.records.find((item) => item.id === view.recordId) : undefined;

  if (view.kind === "record" && record) {
    const usage = masterUsageCount(master.id, record.id);
    const inUse = usage > 0;
    return (
      <section className="grid min-w-0 gap-3.5">
        <header className="flex flex-wrap items-start justify-between gap-4.5">
          <div>
            <span className="nx-eyebrow">{master.label} · {record.code}</span>
            <h2>{record.name}</h2>
            <p>{record.description}</p>
            <div className="nx-txn-detail__badges">
              <span className={`nx-status nx-status-${record.status.toLowerCase()}`}>{record.status}</span>
              <span className="nx-role-badge">{master.detailLabel}: {record.detail}</span>
              <span className="nx-role-badge">{usage} assignment{usage === 1 ? "" : "s"}</span>
            </div>
          </div>
          <div className="nx-txn-detail__actions">
            <Button variant="outline" type="button" onClick={() => setView({ kind: "list" })}>← {master.label}</Button>
            <Button variant="outline" type="button" onClick={() => onAction("Edit", record.name)}>Edit</Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => onAction(record.status === "Active" ? "Deactivate" : "Activate", record.name)}
            >
              {record.status === "Active" ? "Deactivate" : "Activate"}
            </Button>
            {/* Delete is offered only where it is actually allowed. A record
                referenced by history has no delete path at all - not a
                disabled button that pretends one exists. */}
            {inUse ? null : (
              <Button variant="destructive" type="button" onClick={() => onAction("Delete", record.name)}>Delete</Button>
            )}
          </div>
        </header>

        {inUse ? (
          <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
            This {master.singular.toLowerCase()} is used by {usage} employee assignment{usage === 1 ? "" : "s"}, including closed history.
            It can be deactivated so it is no longer offered on new assignments, but it cannot be deleted:
            deleting it would rewrite what those records said at the time.
          </p>
        ) : null}

        <div className="nx-tabs" role="tablist" aria-label={`${record.name} sections`}>
          {recordTabs.map((tab) => (
            <Button
              variant="outline"
              aria-selected={view.tab === tab}
              className={view.tab === tab ? "active" : ""}
              key={tab}
              role="tab"
              type="button"
              onClick={() => setView({ kind: "record", recordId: record.id, tab })}
            >
              {tab}
            </Button>
          ))}
        </div>

        {view.tab === "Details" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13.4375rem,1fr))] gap-2.5">
            {([
              ["Code", record.code],
              [master.singular, record.name],
              [master.detailLabel, record.detail],
              ["Description", record.description],
              ["Status", record.status],
              ["Used by", `${usage} employee assignment${usage === 1 ? "" : "s"}`],
              ["Created on", record.createdOn],
              ["Created by", record.createdBy],
            ] as const).map(([label, value]) => (
              <div className="rounded border border-border bg-card px-3 py-2.5" key={label}><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-0.5 block text-sm font-semibold text-foreground">{value}</strong></div>
            ))}
          </div>
        ) : null}

        {view.tab === "History" ? (
          <div className="nx-table-wrap">
            <table className="nx-data-table">
              <thead><tr><th>Effective</th><th>Change</th><th>From</th><th>To</th><th>By</th></tr></thead>
              <tbody>
                <tr><td>{record.createdOn}</td><td>Created</td><td>—</td><td>{record.name}</td><td>{record.createdBy}</td></tr>
                {record.status === "Inactive" ? (
                  <tr><td>02 Sep 2026</td><td>Status change</td><td>Active</td><td>Inactive</td><td>Sana Iqbal</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {view.tab === "Audit trail" ? (
          <div className="nx-table-wrap">
            <table className="nx-data-table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Field</th><th>Old value</th><th>New value</th></tr></thead>
              <tbody>
                <tr><td>{record.createdOn} 09:14</td><td>{record.createdBy}</td><td>Created</td><td>—</td><td>—</td><td>{record.code}</td></tr>
                {record.status === "Inactive" ? (
                  <tr><td>02 Sep 2026 16:02</td><td>Sana Iqbal</td><td>Updated</td><td>status</td><td>Active</td><td>Inactive</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    );
  }

  const rows = master.records.map((item) => toRow(master, item));
  const active = master.records.filter((item) => item.status === "Active").length;
  const used = master.records.filter((item) => masterIsInUse(master.id, item.id)).length;

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>{master.label}</span><strong>{master.records.length}</strong><small>Master records</small></article>
        <article><span>Active</span><strong>{active}</strong><small>Selectable on new assignments</small></article>
        <article><span>Inactive</span><strong>{master.records.length - active}</strong><small>Kept so history still reads</small></article>
        <article><span>Referenced</span><strong>{used}</strong><small>Cannot be deleted</small></article>
      </div>

      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">{master.description}</p>

      <ModuleSearchableTable
        columns={columnsFor(master)}
        rows={rows}
        linkKey="code"
        label={master.label}
        summary={`Showing ${rows.length} of ${rows.length} ${master.label.toLowerCase()}`}
        totalRecords={rows.length}
        onOpen={(row) => setView({ kind: "record", recordId: row.id, tab: "Details" })}
        onAction={onAction}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Organisation structure                                              */
/* ------------------------------------------------------------------ */

function headcountFor(unit: OrgUnit): number {
  const employedIds = new Set(
    employees.filter((person) => employedStatuses.includes(person.status)).map((person) => person.id),
  );
  return employeeAssignments.filter((row) => {
    if (!employedIds.has(row.employeeId)) return false;
    if (row.effectiveTo !== null) return false;
    return row.companyId === unit.id || row.branchId === unit.id || row.departmentId === unit.id;
  }).length;
}

export function HrOrgStructure({
  onAction,
}: {
  onAction: (action: string, subject?: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(orgUnits[0].id);
  const selected = orgUnits.find((unit) => unit.id === selectedId) ?? orgUnits[0];
  const children = childrenOf(selected.id);

  const renderUnit = (unit: OrgUnit, depth: number) => (
    <li key={unit.id}>
      <button
        aria-current={unit.id === selectedId ? "true" : undefined}
        className={`grid w-full grid-cols-[5.875rem_minmax(0,1fr)_auto] items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm hover:bg-muted ${unit.id === selectedId ? "bg-accent shadow-[inset_3px_0_0_var(--color-primary)]" : ""}`}
        style={{ paddingLeft: `${12 + depth * 18}px` }}
        type="button"
        onClick={() => setSelectedId(unit.id)}
      >
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{unit.type}</span>
        <span className="min-w-0 truncate font-semibold text-foreground">{unit.name}</span>
        <span className={`nx-status nx-status-${unit.status.toLowerCase()}`}>{unit.status}</span>
      </button>
      {childrenOf(unit.id).length > 0 ? (
        <ul>{childrenOf(unit.id).map((child) => renderUnit(child, depth + 1))}</ul>
      ) : null}
    </li>
  );

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article><span>Companies</span><strong>{orgUnits.filter((unit) => unit.type === "Company").length}</strong><small>Legal entities</small></article>
        <article><span>Branches</span><strong>{orgUnits.filter((unit) => unit.type === "Branch").length}</strong><small>Locations of a company</small></article>
        <article><span>Departments</span><strong>{orgUnits.filter((unit) => unit.type === "Department").length}</strong><small>Functions within a branch</small></article>
        <article><span>Inactive units</span><strong>{orgUnits.filter((unit) => unit.status === "Inactive").length}</strong><small>Closed, history retained</small></article>
      </div>

      <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
        Company, branch and department are one tree, not three lists. Finance and Operations read the same structure,
        so a cost by department means the same thing in HR as it does in the ledger. Cost centres are deliberately
        separate: a cost centre can span branches, so it is a finance dimension rather than a place in this chart.
      </p>

      <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(17.5rem,.85fr)_minmax(0,1.6fr)]">
        <nav className="rounded-lg border border-border bg-card py-2.5 shadow-sm" aria-label="Organisation structure">
          <ul className="m-0 list-none p-0">{childrenOf(null).map((unit) => renderUnit(unit, 0))}</ul>
        </nav>

        <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-3.5">
            <div>
              <span className="nx-eyebrow">{selected.type} · {selected.code}</span>
              <h2>{selected.name}</h2>
            </div>
            <div className="nx-txn-detail__actions">
              <Button variant="outline" type="button" onClick={() => onAction("Edit", selected.name)}>Edit</Button>
              <Button variant="outline" type="button" onClick={() => onAction(selected.status === "Active" ? "Deactivate" : "Activate", selected.name)}>
                {selected.status === "Active" ? "Deactivate" : "Activate"}
              </Button>
              <Button type="button" onClick={() => onAction("Add child unit", selected.name)}>+ Add {selected.type === "Company" ? "branch" : "department"}</Button>
            </div>
          </header>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(13.4375rem,1fr))] gap-2.5">
            <div className="rounded border border-border bg-muted p-2.5"><span className="block text-xs text-muted-foreground">Type</span><strong className="mt-0.5 block text-sm font-semibold">{selected.type}</strong></div>
            <div className="rounded border border-border bg-muted p-2.5"><span className="block text-xs text-muted-foreground">Code</span><strong className="mt-0.5 block text-sm font-semibold">{selected.code}</strong></div>
            <div className="rounded border border-border bg-muted p-2.5"><span className="block text-xs text-muted-foreground">Status</span><strong className="mt-0.5 block text-sm font-semibold">{selected.status}</strong></div>
            <div className="rounded border border-border bg-muted p-2.5"><span className="block text-xs text-muted-foreground">Head</span><strong className="mt-0.5 block text-sm font-semibold">{selected.head}</strong></div>
            <div className="rounded border border-border bg-muted p-2.5"><span className="block text-xs text-muted-foreground">Reports into</span><strong className="mt-0.5 block text-sm font-semibold">{orgUnits.find((unit) => unit.id === selected.parentId)?.name ?? "Top of the tree"}</strong></div>
            <div className="rounded border border-border bg-muted p-2.5"><span className="block text-xs text-muted-foreground">Created</span><strong className="mt-0.5 block text-sm font-semibold">{selected.createdOn}</strong></div>
            <div className="rounded border border-border bg-muted p-2.5"><span className="block text-xs text-muted-foreground">Direct children</span><strong className="mt-0.5 block text-sm font-semibold">{children.length}</strong></div>
            <div className="rounded border border-border bg-muted p-2.5"><span className="block text-xs text-muted-foreground">Employees here</span><strong className="mt-0.5 block text-sm font-semibold">{headcountFor(selected)}</strong></div>
          </div>

          {selected.status === "Inactive" ? (
            <p className="m-0 max-w-275 rounded border border-border border-l-3 border-l-primary bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground" role="note">
              This unit is closed. It cannot be chosen for a new assignment, and it is kept rather than deleted so the
              assignments that pointed at it still say what they said at the time.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function hrMasterForPage(pageId: string): MasterDefinition | undefined {
  return hrMasters.find((master) => master.pageId === pageId);
}
