"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrOrganizationUnitDirectory } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";

type Unit = HrOrganizationUnitDirectory["items"][number];
type UnitType = Unit["type"];
type Editor = { mode: "create" | "edit"; parentId: string; type: UnitType; code: string; name: string };

const typeLabels: Record<UnitType, string> = {
  business_unit: "Business unit",
  division: "Division",
  branch: "Branch",
  department: "Department",
  warehouse: "Warehouse",
};

function initialChildType(parentType: UnitType | "company"): UnitType {
  if (parentType === "branch") return "department";
  if (parentType === "business_unit") return "division";
  return "branch";
}

function canReportTo(childType: UnitType, parentType: UnitType | "company"): boolean {
  const allowed: Record<UnitType, readonly (UnitType | "company")[]> = {
    business_unit: ["company"],
    division: ["company", "business_unit"],
    branch: ["company", "business_unit", "division"],
    department: ["company", "business_unit", "division", "branch"],
    warehouse: ["company", "business_unit", "division", "branch"],
  };
  return allowed[childType].includes(parentType);
}

export function HrOrganizationStructureWorkspace() {
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.organization.read");
  const canWrite = permissions.includes("hr.organization.update");

  const refresh = useCallback(async (targetCompanyId = companyId) => {
    if (!targetCompanyId) return;
    setLoading(true);
    try {
      const result = await client.organizationUnits({ companyId: targetCompanyId, includeInactive: true });
      setUnits(result.items);
      setSelectedId((current) => current && (current === targetCompanyId || result.items.some((unit) => unit.id === current)) ? current : targetCompanyId);
    } catch {
      setMessage("The organization structure could not be loaded from the authorized API.");
    } finally {
      setLoading(false);
    }
  }, [client, companyId]);

  useEffect(() => {
    if (sessionLoading || !canRead) return;
    client.companies().then((result) => {
      setCompanies(result.items);
      const first = result.items[0]?.id ?? "";
      setCompanyId(first);
      setSelectedId(first);
      return refresh(first);
    }).catch(() => { setMessage("Authorized companies could not be loaded."); setLoading(false); });
  }, [canRead, client, refresh, sessionLoading]);

  const company = companies.find((item) => item.id === companyId);
  const selected = units.find((item) => item.id === selectedId);
  const childrenOf = (parentId: string) => units.filter((item) => item.parent_id === parentId);
  const directChildren = selectedId ? childrenOf(selectedId) : [];

  const openCreate = () => {
    const parentType = selected?.type ?? "company";
    setEditor({ mode: "create", parentId: selectedId || companyId, type: initialChildType(parentType), code: "", name: "" });
    setMessage("");
  };
  const openEdit = () => selected && setEditor({ mode: "edit", parentId: selected.parent_id, type: selected.type, code: selected.code, name: selected.name });

  const save = async () => {
    if (!editor || !companyId || !editor.parentId || !editor.code.trim() || !editor.name.trim()) {
      setMessage("Parent, code, and name are required.");
      return;
    }
    setSaving(true);
    try {
      if (editor.mode === "create") {
        const result = await client.createOrganizationUnit({ company_id: companyId, parent_id: editor.parentId, type: editor.type, code: editor.code.trim().toUpperCase(), name: editor.name.trim() }, csrfToken(), crypto.randomUUID());
        setSelectedId(result.id);
        setMessage("Organization unit created and recorded in the audit trail.");
      } else if (selected) {
        await client.updateOrganizationUnit(selected.id, { company_id: companyId, parent_id: editor.parentId, code: editor.code.trim().toUpperCase(), name: editor.name.trim() }, csrfToken(), crypto.randomUUID());
        setMessage("Organization unit updated and recorded in the audit trail.");
      }
      setEditor(null);
      await refresh();
    } catch {
      setMessage("The change was rejected. Check code uniqueness, parent status, company access, and hierarchy rules.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async () => {
    if (!selected) return;
    const status = selected.status === "active" ? "inactive" : "active";
    setSaving(true);
    try {
      await client.changeOrganizationUnitStatus(selected.id, { company_id: companyId, status }, csrfToken(), crypto.randomUUID());
      setMessage(status === "active" ? "Organization unit activated." : "Organization unit deactivated. Historical references were retained.");
      await refresh();
    } catch {
      setMessage("Status could not be changed. Active children and current employee assignments must be moved first.");
    } finally {
      setSaving(false);
    }
  };

  const renderUnit = (unit: Unit, depth: number) => (
    <li key={unit.id}>
      <button aria-current={selectedId === unit.id ? "true" : undefined} className={`grid w-full grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm hover:bg-muted ${selectedId === unit.id ? "bg-accent shadow-[inset_3px_0_0_var(--color-primary)]" : ""}`} style={{ paddingLeft: `${12 + depth * 18}px` }} type="button" onClick={() => { setSelectedId(unit.id); setEditor(null); }}>
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{typeLabels[unit.type]}</span>
        <span className="min-w-0 truncate font-semibold text-foreground">{unit.name}</span>
        <span className={`nx-status nx-status-${unit.status}`}>{unit.status}</span>
      </button>
      {childrenOf(unit.id).length ? <ul className="m-0 list-none p-0">{childrenOf(unit.id).map((child) => renderUnit(child, depth + 1))}</ul> : null}
    </li>
  );

  if (sessionLoading) return <Skeleton className="h-72 w-full" />;
  if (!session) return <Alert><AlertTitle>Sign in required</AlertTitle><AlertDescription>Your browser session is not active. Sign in again, then reopen Organisation Structure. <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>Retry session</Button></AlertDescription></Alert>;
  if (!canRead) return <Alert><AlertTitle>Organization access required</AlertTitle><AlertDescription>This screen requires the HR organization read permission.</AlertDescription></Alert>;

  return <section className="grid gap-4" aria-label="Organization structure">
    <Alert><AlertTitle>Shared organization authority</AlertTitle><AlertDescription>HR, Finance, and Operations use this same hierarchy. Deactivation preserves historical employee and accounting references.</AlertDescription></Alert>
    {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
    <label className="grid max-w-xl gap-1 text-sm font-medium">Company<select className="h-9 rounded-md border border-input bg-background px-2" value={companyId} onChange={(event) => { const id = event.target.value; setCompanyId(id); setSelectedId(id); setEditor(null); void refresh(id); }}>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {loading ? <Skeleton className="h-72 w-full" /> : !company ? <Alert><AlertTitle>No authorized company</AlertTitle><AlertDescription>Company access must be granted before the organization tree can be maintained.</AlertDescription></Alert> : <div className="grid items-start gap-4 xl:grid-cols-[minmax(19rem,.9fr)_minmax(0,1.5fr)]">
      <nav className="rounded-lg border border-border bg-card py-2 shadow-sm" aria-label="Organization tree">
        <button aria-current={selectedId === company.id ? "true" : undefined} className={`grid w-full grid-cols-[6.5rem_minmax(0,1fr)] gap-2 px-3 py-2 text-left text-sm ${selectedId === company.id ? "bg-accent shadow-[inset_3px_0_0_var(--color-primary)]" : ""}`} type="button" onClick={() => { setSelectedId(company.id); setEditor(null); }}><span className="text-xs font-bold uppercase text-muted-foreground">Company</span><span className="truncate font-semibold">{company.name}</span></button>
        <ul className="m-0 list-none p-0">{childrenOf(company.id).map((unit) => renderUnit(unit, 1))}</ul>
        {units.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">No child units are configured.</p> : null}
      </nav>
      <div className="grid gap-4">
        <article className="grid gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-3"><div><span className="nx-eyebrow">{selected ? typeLabels[selected.type] : "Company"} · {selected?.code ?? company.code}</span><h2>{selected?.name ?? company.name}</h2></div><div className="flex flex-wrap gap-2">{canWrite && selected ? <><Button variant="outline" onClick={openEdit}>Edit</Button><Button variant="outline" disabled={saving} onClick={() => void changeStatus()}>{selected.status === "active" ? "Deactivate" : "Activate"}</Button></> : null}{canWrite && (!selected || selected.status === "active") ? <Button onClick={openCreate}>+ Add child unit</Button> : null}</div></header>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2.5">
            <Info label="Status" value={selected?.status ?? "active"}/><Info label="Reports into" value={selected ? (units.find((unit) => unit.id === selected.parent_id)?.name ?? company.name) : "Top of the tree"}/><Info label="Direct children" value={String(directChildren.length)}/><Info label="Employees here" value={String(selected?.employee_count ?? 0)}/><Info label="Head" value={selected?.head_name ?? "Not assigned"}/><Info label="Created" value={selected ? new Date(selected.created_at).toLocaleDateString() : "Platform record"}/>
          </div>
        </article>
        {editor ? <aside className="grid gap-3 rounded-lg border border-border bg-card p-4"><h3 className="font-semibold">{editor.mode === "create" ? "Add organization unit" : "Edit organization unit"}</h3>{editor.mode === "create" ? <label className="grid gap-1 text-sm">Type<select className="h-9 rounded-md border border-input bg-background px-2" value={editor.type} onChange={(event) => { const type = event.target.value as UnitType; setEditor({ ...editor, type, parentId: canReportTo(type, "company") ? company.id : "" }); }}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}<label className="grid gap-1 text-sm">Parent<select className="h-9 rounded-md border border-input bg-background px-2" value={editor.parentId} onChange={(event) => setEditor({ ...editor, parentId: event.target.value })}>{canReportTo(editor.type, "company") ? <option value={company.id}>{company.name}</option> : null}{units.filter((unit) => unit.id !== selected?.id && unit.status === "active" && canReportTo(editor.type, unit.type)).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label className="grid gap-1 text-sm">Code<Input maxLength={64} value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value })}/></label><label className="grid gap-1 text-sm">Name<Input maxLength={200} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })}/></label><div className="flex gap-2"><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save"}</Button><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button></div></aside> : null}
      </div>
    </div>}
  </section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-border bg-muted p-2.5"><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-0.5 block text-sm font-semibold capitalize">{value}</strong></div>;
}
