"use client";

import { useEffect, useMemo, useState } from "react";
import type { HrMasterDirectory } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";

export function HrJobsWorkspace() {
  const { api, csrfToken, session, loading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState(""); const [jobs, setJobs] = useState<HrMasterDirectory["items"]>([]);
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  const canRead = session?.user.permissions.includes("hr.master.read") ?? false; const canCreate = session?.user.permissions.includes("hr.master.create") ?? false;
  const refresh = () => companyId && client.masters({ companyId, type: "job" }).then((value) => setJobs(value.items)).catch(() => setMessage("Jobs could not be loaded from the authorized API."));
  useEffect(() => { if (!loading && canRead) client.companies().then((value) => { setCompanies(value.items); setCompanyId(value.items[0]?.id ?? ""); }).catch(() => setMessage("Companies could not be loaded.")); }, [canRead, client, loading]);
  useEffect(() => { if (companyId) refresh(); }, [companyId]);
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!canRead) return <Alert><AlertTitle>Job catalog access required</AlertTitle><AlertDescription>This screen requires the HR master read permission.</AlertDescription></Alert>;
  const create = async () => { if (!companyId || !code.trim() || !name.trim()) { setMessage("Choose a company and enter a job code and name."); return; } setSaving(true); try { await client.createJob({ company_id: companyId, code: code.trim().toUpperCase(), name: name.trim() }, csrfToken(), crypto.randomUUID()); setCode(""); setName(""); setMessage("Job created as an active company-scoped catalog record."); refresh(); } catch { setMessage("Job creation failed. Check company access, code uniqueness, and HR master create permission."); } finally { setSaving(false); } };
  return <section className="grid gap-4" aria-label="Job catalog"><Alert><AlertTitle>Job catalog</AlertTitle><AlertDescription>Jobs are reusable master records. Creating one does not hire, assign, or activate any employee.</AlertDescription></Alert>{message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}<label className="grid max-w-xl gap-1 text-sm font-medium">Company<select className="h-9 rounded-md border border-input bg-background px-2" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="grid gap-4 lg:grid-cols-[1fr_20rem]"><div className="rounded-lg border bg-card"><table className="w-full text-sm"><thead className="border-b bg-muted/60"><tr><th className="px-4 py-3 text-left">Code</th><th className="px-4 py-3 text-left">Job</th><th className="px-4 py-3 text-left">Status</th></tr></thead><tbody>{jobs.map((job) => <tr className="border-b last:border-0" key={job.id}><td className="px-4 py-3">{job.code}</td><td className="px-4 py-3">{job.name}</td><td className="px-4 py-3">{job.status}</td></tr>)}{jobs.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No jobs are configured.</td></tr>}</tbody></table></div>{canCreate && <aside className="grid content-start gap-3 rounded-lg border bg-card p-4"><h2 className="font-semibold">Create job</h2><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="JOB-CODE" maxLength={32}/><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Job name" maxLength={160}/><Button type="button" onClick={() => void create()} disabled={saving}>{saving ? "Creating..." : "Create job"}</Button></aside>}</div></section>;
}
