"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateHrOfferEmployeeRequest,
  HrOfferDirectory,
  HrOfferEmployeeWorkspace as Workspace,
} from "@nexora/contracts";
import { ArrowRight, CheckCircle2, FileCheck2, RefreshCw, Search, ShieldCheck, UserRoundPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { HrHireMakerPanel } from "../components/hr-hire-maker-panel";

type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;
const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const fail = (error: unknown) =>
  error instanceof ApiError ? error.message : "The handoff could not be loaded or saved. Please retry.";
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
function Detail({ name, value }: { name: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-background/60 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{name}</dt>
      <dd className="m-0 mt-1 break-words text-sm font-semibold">{value || "Not recorded"}</dd>
    </div>
  );
}

function HandoffForm({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (fields: Pick<CreateHrOfferEmployeeRequest, "employee_number" | "work_email" | "reason">) => Promise<void>;
}) {
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      className="grid gap-4 rounded-xl border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ employee_number: number, work_email: email || undefined, reason });
      }}
    >
      <div>
        <h3 className="text-base font-semibold">Prepare the employee draft</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The candidate name, personal email, phone and agreed joining date carry forward automatically. Keep the
          employee number unique across the company group.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Employee number
          <Input
            required
            maxLength={32}
            pattern="[A-Z0-9][A-Z0-9._/\-]{0,31}"
            placeholder="EMP-0001"
            value={number}
            disabled={busy}
            onChange={(e) => setNumber(e.target.value.toUpperCase())}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Company work email (optional)
          <Input
            type="email"
            maxLength={320}
            placeholder="employee@company.com"
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        Handoff reason
        <Textarea
          required
          minLength={8}
          maxLength={1000}
          rows={3}
          placeholder="Confirm accepted terms and request employee profile preparation"
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        disabled={busy || !number || reason.trim().length < 8}
        className="justify-self-start text-primary-foreground!"
      >
        <UserRoundPlus className="size-4" />
        {busy ? "Creating draft…" : "Create employee draft"}
      </Button>
    </form>
  );
}

function OfferHirePreparation({
  client,
  csrfToken,
  workspace,
  onUpdated,
}: {
  client: HrApiClient;
  csrfToken: () => string;
  workspace: Workspace;
  onUpdated: () => void;
}) {
  const [assignments, setAssignments] = useState<Awaited<ReturnType<HrApiClient["employeeAssignments"]>>["items"]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const employeeId = workspace.handoff!.employee_id;
  useEffect(() => {
    let current = true;
    client
      .employeeAssignments(employeeId)
      .then((result) => {
        if (current) {
          setAssignments(result.items);
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (current) setError(fail(err));
      });
    return () => {
      current = false;
    };
  }, [client, employeeId]);
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Hire context unavailable</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!loaded) return <Skeleton className="h-32 w-full" />;
  return (
    <HrHireMakerPanel
      client={client}
      csrfToken={csrfToken}
      companyId={workspace.offer.company_id}
      employeeId={employeeId}
      assignments={assignments}
      canCreateAssignment={false}
      canRequestHire={true}
      onAssignmentCreated={onUpdated}
      onHireRequested={onUpdated}
    />
  );
}

export function HrOfferEmployeeWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, csrfToken, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.employee.read") && permissions.includes("hr.payroll.salary.read");
  const canCreate = permissions.includes("hr.employee.create");
  const canAssign = permissions.includes("hr.employee_assignment.create");
  const canHire =
    permissions.includes("hr.employee_assignment.read") &&
    permissions.includes("hr.employment_lifecycle.action") &&
    permissions.includes("hr.employment_relationship.create");
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [offset, setOffset] = useState(0);
  const [offers, setOffers] = useState<HrOfferDirectory>({ items: [], total: 0 });
  const [selected, setSelected] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const mutation = useRef(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    if (!canRead) return;
    let current = true;
    setLoading(true);
    client
      .companies()
      .then((result) => {
        if (current) {
          setCompanies(result.items);
          setCompany((value) => (result.items.some((c) => c.id === value) ? value : (result.items[0]?.id ?? "")));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (current) {
          setError(fail(err));
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [canRead, client, revision]);
  useEffect(() => {
    if (!company || !canRead) return;
    let current = true;
    setLoading(true);
    client
      .offers({ companyId: company, state: "accepted", search: applied || undefined, offset })
      .then((result) => {
        if (current) {
          setOffers(result);
          setSelected((value) => (result.items.some((o) => o.id === value) ? value : (result.items[0]?.id ?? "")));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (current) {
          setOffers({ items: [], total: 0 });
          setError(fail(err));
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, company, canRead, applied, offset, revision]);
  useEffect(() => {
    if (!selected || !company) {
      setWorkspace(null);
      return;
    }
    let current = true;
    setDetailLoading(true);
    client
      .offerEmployeeWorkspace(company, selected)
      .then((result) => {
        if (current) {
          setWorkspace(result);
          setDetailLoading(false);
        }
      })
      .catch((err) => {
        if (current) {
          setWorkspace(null);
          setError(fail(err));
          setDetailLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, company, selected, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const save = async (fields: Pick<CreateHrOfferEmployeeRequest, "employee_number" | "work_email" | "reason">) => {
    if (!workspace || !csrfToken || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const input = { ...fields, company_id: company, expected_version: workspace.offer.version };
    const fingerprint = JSON.stringify([selected, input]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await client.createOfferEmployee(selected, input, csrfToken(), retry.current.key);
      setNotice(
        `Employee ${result.employee_number} created as a draft. Submit the profile for approval before preparing its assignment.`,
      );
      retry.current = null;
      reload();
    } catch (err) {
      setError(fail(err));
      reload();
    } finally {
      setBusy(false);
      mutation.current = false;
    }
  };
  const createAssignment = async () => {
    if (!workspace?.handoff || !csrfToken || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const o = workspace.offer;
    const input = {
      company_id: company,
      branch_id: o.context.branch_id,
      department_id: o.context.department_id,
      designation_id: o.context.designation_id,
      job_grade_id: o.context.job_grade_id,
      cost_center_id: o.cost_center_id,
      work_location_id: o.work_location_id,
      employment_type_id: o.context.employment_type_id,
      employee_category_id: o.employee_category_id,
      reporting_manager_id: o.reporting_manager_id ?? undefined,
      effective_from: o.joining_on,
    };
    const fingerprint = JSON.stringify([workspace.handoff.employee_id, input]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await client.createProfileDraftAssignment(workspace.handoff.employee_id, input, csrfToken(), retry.current.key);
      setNotice(
        "Initial assignment prepared from the accepted offer. Request and approve the hire in Employee Assignments when the governing policy and job are ready.",
      );
      retry.current = null;
      reload();
    } catch (err) {
      setError(fail(err));
      reload();
    } finally {
      setBusy(false);
      mutation.current = false;
    }
  };
  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Recruitment handoff access required</AlertTitle>
        <AlertDescription>
          Sign in with employee read and salary read permissions to review accepted offer terms.
        </AlertDescription>
      </Alert>
    );
  const data = workspace?.offer.id === selected ? workspace : null;
  const handoff = data?.handoff;
  return (
    <div className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex min-w-0 gap-3">
          <ShieldCheck className="mt-1 size-6 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">From accepted offer to governed employment</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Preserve the approved offer, prepare the employee profile and complete independent approvals. Salary setup
              and payroll remain separate governed steps.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={loading || busy}
          onClick={() => {
            setError("");
            reload();
          }}
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </section>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"
        >
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          {notice}
        </div>
      )}
      <form
        className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setApplied(search.trim());
          setOffset(0);
        }}
      >
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Legal company
          <select
            className={selectClass}
            value={company}
            disabled={busy}
            onChange={(e) => {
              setCompany(e.target.value);
              setSelected("");
              setWorkspace(null);
              setOffers({ items: [], total: 0 });
              setOffset(0);
              setNotice("");
              setError("");
            }}
          >
            <option value="">Select an authorized company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Find an accepted offer
          <Input
            value={search}
            disabled={busy}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={160}
            placeholder="Candidate, offer reference or opening"
          />
        </label>
        <Button variant="outline" className="self-end" disabled={!company || busy} type="submit">
          <Search className="size-4" />
          Search
        </Button>
      </form>
      {!company && !loading && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No authorized company is available. Ask your administrator to review company access.
        </div>
      )}
      {company && (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(15rem,0.75fr)_minmax(0,2fr)]">
          <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border p-4">
              <h3 className="text-sm font-semibold">Accepted offers</h3>
              <Badge variant="secondary">{offers.total}</Badge>
            </div>
            {loading && !offers.items.length ? (
              <Skeleton className="m-4 h-40" />
            ) : offers.items.length ? (
              <div className="grid max-h-80 gap-2 overflow-y-auto p-3 xl:max-h-[48rem]">
                {offers.items.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    disabled={busy}
                    aria-pressed={selected === o.id}
                    className={`grid min-w-0 gap-2 rounded-lg border p-3 text-left text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 ${selected === o.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"}`}
                    onClick={() => {
                      setSelected(o.id);
                      setWorkspace(null);
                      setError("");
                      setNotice("");
                    }}
                  >
                    <span className="break-words text-sm font-semibold">{o.candidate_name}</span>
                    <span className="break-words text-xs text-muted-foreground">
                      {o.reference} · {o.opening_title}
                    </span>
                    <span className="text-xs text-muted-foreground">Joining {o.joining_on}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 p-5 text-sm text-muted-foreground">
                <p>
                  No accepted offers match this company and search. Complete offer approval, letter delivery and
                  recorded acceptance first.
                </p>
                <Button type="button" variant="outline" onClick={() => onNavigate("hr", "offers")}>
                  Open Offer Management
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0 || loading || busy}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {offers.total ? `${offset + 1}–${Math.min(offset + 50, offers.total)}` : "0"} of {offers.total}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + 50 >= offers.total || loading || busy}
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </Button>
            </div>
          </section>
          <div className="grid min-w-0 gap-5" aria-busy={detailLoading || busy}>
            {detailLoading && !data ? (
              <Skeleton className="h-96 w-full" />
            ) : data ? (
              <>
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-primary">
                        Accepted offer · {data.offer.reference}
                      </div>
                      <h2 className="mt-2 break-words text-xl font-semibold">{data.offer.candidate_name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {data.offer.context.opening_title} · {data.offer.context.company_name}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {handoff
                        ? label(handoff.employee_status)
                        : data.blockers.length
                          ? "Needs review"
                          : "Ready for profile"}
                    </Badge>
                  </div>
                  <dl className="m-0 grid gap-3 p-5 sm:grid-cols-2">
                    <Detail name="Candidate personal email" value={data.candidate.email} />
                    <Detail name="Phone" value={data.candidate.phone} />
                    <Detail
                      name="Designation / grade"
                      value={`${data.offer.context.designation} / ${data.offer.context.job_grade}`}
                    />
                    <Detail name="Joining date" value={data.offer.joining_on} />
                    <Detail
                      name="Branch / department"
                      value={`${data.offer.context.branch} / ${data.offer.context.department}`}
                    />
                    <Detail
                      name="Cost centre / work location"
                      value={`${data.offer.cost_center} / ${data.offer.work_location}`}
                    />
                    <Detail
                      name="Employment type / category"
                      value={`${data.offer.context.employment_type} / ${data.offer.employee_category}`}
                    />
                    <Detail name="Reporting manager" value={data.offer.reporting_manager ?? "No manager agreed"} />
                    <Detail
                      name="Agreed monthly gross (offer evidence)"
                      value={`${data.offer.currency_code} ${data.offer.proposed_gross}`}
                    />
                    <Detail
                      name="Probation / notice"
                      value={`${data.offer.probation_months} months / ${data.offer.notice_days} days`}
                    />
                    <Detail
                      name="Application / requisition"
                      value={`${data.offer.application_reference} / ${data.offer.context.requisition_reference}`}
                    />
                    <Detail
                      name="Acceptance evidence"
                      value={`${data.offer.responded_on} · ${data.offer.response_reference}`}
                    />
                  </dl>
                </section>
                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-base font-semibold">Employment handoff progress</h3>
                  <ol className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
                    {[
                      ["1. Accepted offer", "Approved terms and acceptance retained", true],
                      [
                        "2. Employee profile",
                        handoff
                          ? `${handoff.employee_number} · ${label(handoff.profile_approval)}`
                          : "Create and submit the profile draft",
                        !!handoff,
                      ],
                      [
                        "3. Initial assignment",
                        handoff?.assignment_id
                          ? "Prepared from accepted offer terms"
                          : "Prepare after profile approval",
                        !!handoff?.assignment_id,
                      ],
                      [
                        "4. Governed hire",
                        handoff?.hire_state ? label(handoff.hire_state) : "Request hire and independent approval",
                        data.application_stage === "hired",
                      ],
                    ].map(([title, description, done]) => (
                      <li key={String(title)} className="flex gap-3 rounded-lg bg-muted/50 p-3">
                        <FileCheck2
                          className={`mt-0.5 size-5 shrink-0 ${done ? "text-primary" : "text-muted-foreground"}`}
                        />
                        <div>
                          <div className="text-sm font-semibold">{title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {handoff && (
                    <div className="mt-4 grid gap-3">
                      <p className="text-sm text-muted-foreground">
                        Created {new Date(handoff.created_at).toLocaleDateString()} · {handoff.reason}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => onNavigate("hr", "employee-drafts")}>
                          Employee Drafts
                          <ArrowRight className="size-4" />
                        </Button>
                        <Button type="button" variant="outline" onClick={() => onNavigate("hr", "employee-approvals")}>
                          Profile &amp; Hire Approvals
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onNavigate("hr", "employee-assignments")}
                        >
                          Assignments &amp; Hire
                        </Button>
                        {canAssign &&
                          handoff.profile_approval === "approved" &&
                          !handoff.assignment_id &&
                          data.application_stage !== "hired" && (
                            <Button
                              type="button"
                              className="text-primary-foreground!"
                              disabled={busy || detailLoading}
                              onClick={() => void createAssignment()}
                            >
                              Prepare agreed assignment
                            </Button>
                          )}
                      </div>
                    </div>
                  )}
                </section>
                {handoff?.assignment_id &&
                  data.application_stage !== "hired" &&
                  handoff.hire_state !== "pending" &&
                  canHire && (
                    <OfferHirePreparation
                      key={handoff.assignment_id}
                      client={client}
                      csrfToken={csrfToken}
                      workspace={data}
                      onUpdated={reload}
                    />
                  )}
                {!handoff &&
                  (data.blockers.length ? (
                    <div role="status" className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                      {data.blockers.map((text) => (
                        <p key={text}>{text}</p>
                      ))}
                    </div>
                  ) : canCreate ? (
                    <HandoffForm key={`${company}:${selected}`} busy={busy || detailLoading} onSave={save} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Employee creation permission is required to prepare this profile.
                    </p>
                  ))}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                Choose an accepted offer to review the employment handoff.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
