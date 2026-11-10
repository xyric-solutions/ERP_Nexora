"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type {
  CreateHrOfferEmployeeRequest,
  HrOfferDirectory,
  HrOfferEmployeeWorkspace as Workspace,
} from "@nexora/contracts";
import { ArrowRight, CheckCircle2, FileCheck2, UserRoundPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { payCycleLabel, paymentRouteLabel } from "../model/employment-setup";
import { HrHireMakerPanel } from "../components/hr-hire-maker-panel";
import { HrMasterSheet } from "../components/hr-master-sheet";
import {
  HrDetailAudit,
  HrDetailFigures,
  HrDetailGroup,
  HrDetailNote,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  HrStatusPill,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { offerMoney, offerStates } from "../model/hr-offer-display";

type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;
const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const fail = (error: unknown) =>
  error instanceof ApiError ? error.message : "The handoff could not be loaded or saved. Please retry.";
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
function HandoffForm({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (fields: Pick<CreateHrOfferEmployeeRequest, "employee_number" | "work_email" | "reason">) => Promise<void>;
}) {
  const number = "AUTO";
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      aria-label="Prepare the employee draft"
      className="grid min-w-0 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ employee_number: number, work_email: email || undefined, reason });
      }}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="grid content-start gap-2 text-sm font-medium">
          Employee number (automatic)
          <Input
            required
            maxLength={32}
            placeholder="EMP-0001"
            value="Assigned on save · EMP-001…"
            readOnly
            disabled={busy}
          />
        </label>
        <label className="grid content-start gap-2 text-sm font-medium">
          Company work email
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
      <label className="grid content-start gap-2 text-sm font-medium">
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
  const [stateFilter, setStateFilter] = useState("");
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
      .offers({ companyId: company, state: stateFilter || undefined, search: applied || undefined, offset })
      .then((result) => {
        if (current) {
          setOffers(result);
          setSelected((value) => (result.items.some((o) => o.id === value) ? value : ""));
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
  }, [client, company, canRead, applied, stateFilter, offset, revision]);
  const selectedAccepted = offers.items.find((o) => o.id === selected)?.state === "accepted";
  useEffect(() => {
    if (!selected || !company || !selectedAccepted) {
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
  }, [client, company, selected, selectedAccepted, revision]);
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
      branch_id: o.context.branch_id ?? undefined,
      department_id: o.context.department_id,
      designation_id: o.context.designation_id,
      job_grade_id: o.context.job_grade_id,
      cost_center_id: o.cost_center_id,
      work_location_id: o.work_location_id,
      employment_setup_id: o.employment_setup_id,
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
  const summary = offers.items.find((o) => o.id === selected);
  const openOffer = (id: string) => {
    if (busy) return;
    setSelected(id);
    setWorkspace(null);
    setError("");
    setNotice("");
  };
  const openRow = (o: HrOfferDirectory["items"][number]) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Open ${o.candidate_name} (${o.reference})`,
    onClick: () => openOffer(o.id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openOffer(o.id);
      }
    },
  });
  return (
    <div className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0">
      {error && !selected && (
        <Alert variant="destructive">
          <AlertTitle>Action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && !selected && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"
        >
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          {notice}
        </div>
      )}
      <form
        aria-label="Find offers"
        className="grid min-w-0 items-end gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_12rem]"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setApplied(search.trim());
          setOffset(0);
        }}
      >
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
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
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
          Find an offer
          <Input
            type="search"
            value={search}
            disabled={busy}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={160}
            placeholder="Candidate, offer reference or opening, then Enter"
          />
        </label>
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
          Offer status
          <select
            className={selectClass}
            value={stateFilter}
            disabled={busy || !company}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setOffset(0);
              setError("");
            }}
          >
            <option value="">All statuses</option>
            {offerStates.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
      </form>
      {!company && !loading && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No authorized company is available. Ask your administrator to review company access.
        </div>
      )}
      {company && (
        <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {loading && !offers.items.length ? (
            <div className="grid gap-2 p-4" aria-live="polite">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-200 border-collapse text-left text-sm" aria-label="Offers">
                <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-4 py-3">Opening</th>
                    <th className="px-4 py-3">Joining date</th>
                    <th className="px-4 py-3">Monthly gross</th>
                    <th className="px-4 py-3">Offer status</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.items.map((o) => (
                    <tr
                      key={o.id}
                      aria-disabled={busy}
                      className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === o.id ? "bg-primary/5" : ""}`}
                      {...openRow(o)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{o.candidate_name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{o.reference}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{o.opening_title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.joining_on}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {offerMoney(o.proposed_gross, o.currency_code)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={o.is_overdue ? "destructive" : o.state === "accepted" ? "secondary" : "outline"}
                        >
                          {o.is_overdue ? "Overdue" : label(o.state)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {offers.items.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                        <div className="grid justify-items-center gap-3">
                          <p>No offers match this company, search and status.</p>
                          <Button type="button" variant="outline" size="sm" onClick={() => onNavigate("hr", "offers")}>
                            Open Offer Management
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
            <span className="text-xs text-muted-foreground">
              {offers.total ? `${offset + 1}–${Math.min(offset + 50, offers.total)}` : "0"} of {offers.total} offers ·
              employee creation opens on accepted offers
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0 || loading || busy}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + 50 >= offers.total || loading || busy}
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
      <HrMasterSheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setSelected("");
            setWorkspace(null);
          }
        }}
        eyebrow="Create Employee from Offer"
        title={data?.offer.candidate_name ?? summary?.candidate_name ?? "Offer"}
        description={
          data
            ? `${data.offer.reference} · ${data.offer.context.opening_title} · ${data.offer.context.company_name}`
            : summary
              ? `${summary.reference} · ${summary.opening_title}`
              : ""
        }
      >
        <div className="grid min-w-0 gap-5" aria-busy={detailLoading || busy}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Action needs attention</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
            >
              <CheckCircle2 className="size-5 shrink-0 text-primary" />
              {notice}
            </div>
          )}
          {summary && summary.state !== "accepted" ? (
            <>
              <HrDetailSummary
                code={summary.reference}
                status={summary.state}
                statusLabel={summary.is_overdue ? "Overdue" : undefined}
                statusTone={summary.is_overdue ? "danger" : undefined}
              >
                {summary.opening_title}
              </HrDetailSummary>
              <HrDetailGroup title="Offer">
                <HrDetailTile label="Joining date" value={hrDisplayDate(summary.joining_on)} />
                <HrDetailTile label="Valid until" value={hrDisplayDate(summary.valid_until)} />
                <HrDetailTile label="Monthly gross" value={offerMoney(summary.proposed_gross, summary.currency_code)} />
              </HrDetailGroup>
              <div role="status" className="grid gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p>
                  An employee can be created only after the offer is approved, delivered and its acceptance recorded.
                  Continue this offer in Offer Management.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => onNavigate("hr", "offers")}
                >
                  Open Offer Management
                  <ArrowRight className="size-4" />
                </Button>
              </div>
              <HrDetailAudit items={[{ label: "Created", value: hrDisplayDate(summary.created_at, true) }]} />
            </>
          ) : detailLoading && !data ? (
            <Skeleton className="h-80 w-full" />
          ) : data ? (
            <>
              <HrDetailSummary
                code={data.offer.reference}
                status={data.offer.state}
                extra={
                  handoff ? (
                    <HrStatusPill status={handoff.employee_status} />
                  ) : data.blockers.length ? (
                    <HrStatusPill status="needs_review" label="Needs review" />
                  ) : (
                    <HrStatusPill status="ready" label="Ready for profile" />
                  )
                }
              >
                Joins {hrDisplayDate(data.offer.joining_on)}
                {data.offer.responded_on ? ` · accepted ${hrDisplayDate(data.offer.responded_on)}` : ""}
              </HrDetailSummary>
              <HrDetailFigures
                items={[
                  {
                    label: "Agreed monthly gross",
                    value: offerMoney(data.offer.proposed_gross, data.offer.currency_code),
                  },
                  { label: "Probation (months)", value: data.offer.probation_months },
                  { label: "Notice (days)", value: data.offer.notice_days },
                ]}
              />
              <HrDetailGroup title="Candidate">
                <HrDetailTile label="Personal email" value={data.candidate.email} />
                <HrDetailTile label="Phone" value={data.candidate.phone} />
              </HrDetailGroup>
              <HrDetailGroup title="Accepted terms">
                <HrDetailTile
                  label="Designation"
                  value={data.offer.context.designation}
                  hint={data.offer.context.job_grade}
                />
                <HrDetailTile
                  label="Department"
                  value={data.offer.context.department}
                  hint={data.offer.context.branch ?? "Branch not set"}
                />
                <HrDetailTile label="Cost centre" value={data.offer.cost_center} />
                <HrDetailTile label="Work location" value={data.offer.work_location} />
                <HrDetailTile
                  label="Employment setup"
                  value={data.offer.employment_setup}
                  hint={`${paymentRouteLabel(data.offer.payment_route)} / ${payCycleLabel(data.offer.pay_cycle)}`}
                />
                <HrDetailTile label="Reporting manager" value={data.offer.reporting_manager ?? "No manager agreed"} />
              </HrDetailGroup>
              <HrDetailGroup title="Offer evidence">
                <HrDetailTile label="Application" value={data.offer.application_reference} mono />
                <HrDetailTile label="Requisition" value={data.offer.context.requisition_reference} mono />
                <HrDetailTile
                  label="Acceptance evidence"
                  value={data.offer.response_reference}
                  hint={data.offer.responded_on ? hrDisplayDate(data.offer.responded_on) : undefined}
                />
              </HrDetailGroup>
              <HrDetailSection title="Employment handoff progress">
                <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
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
                      handoff?.assignment_id ? "Prepared from accepted offer terms" : "Prepare after profile approval",
                      !!handoff?.assignment_id,
                    ],
                    [
                      "4. Governed hire",
                      handoff?.hire_state ? label(handoff.hire_state) : "Request hire and independent approval",
                      data.application_stage === "hired",
                    ],
                  ].map(([title, description, done]) => (
                    <li key={String(title)} className="flex gap-3 rounded-lg border border-border bg-muted/35 p-3">
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
                  <div className="grid gap-3">
                    <HrDetailNote meta={`Created ${hrDisplayDate(handoff.created_at, false)}`}>
                      {handoff.reason}
                    </HrDetailNote>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigate("hr", "employee-drafts")}
                      >
                        Employee Drafts
                        <ArrowRight className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigate("hr", "employee-approvals")}
                      >
                        Profile &amp; Hire Approvals
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
                            size="sm"
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
              </HrDetailSection>
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
                  <div role="status" className="grid gap-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    {data.blockers.map((text) => (
                      <p key={text}>{text}</p>
                    ))}
                  </div>
                ) : canCreate ? (
                  <HrDetailSection title="Create employee draft">
                    <HandoffForm key={`${company}:${selected}`} busy={busy || detailLoading} onSave={save} />
                  </HrDetailSection>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Employee creation permission is required to prepare this profile.
                  </p>
                ))}
              <HrDetailAudit items={[{ label: "Offer created", value: hrDisplayDate(data.offer.created_at, true) }]} />
            </>
          ) : null}
        </div>
      </HrMasterSheet>
    </div>
  );
}
