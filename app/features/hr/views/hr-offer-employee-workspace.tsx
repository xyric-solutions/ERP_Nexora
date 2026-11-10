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
import { HrMasterStatusFilter } from "../components/hr-master-status-filter";
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
import { decidedOfferFilterOptions, offerMoney, type DecidedOfferFilter } from "../model/hr-offer-display";

type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;
const fail = (error: unknown) =>
  error instanceof ApiError ? error.message : "The handoff could not be loaded or saved. Please retry.";
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
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

/**
 * Converts an Approved offer into an employee: name, email, phone and joining date come from the
 * candidate and offer; designation, department, job title and salary stay linked to the offer and
 * show in Employee Directory as a Draft until the governed hire completes.
 */
export function HrOfferEmployeeWorkspace({ onNavigate, initialOfferId }: { onNavigate: Navigate; initialOfferId?: string }) {
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
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [stateFilter, setStateFilter] = useState<DecidedOfferFilter>(initialOfferId ? "all" : "approved");
  const [offset, setOffset] = useState(0);
  const [offers, setOffers] = useState<HrOfferDirectory>({ items: [], total: 0 });
  const [selected, setSelected] = useState(initialOfferId ?? "");
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
      .offers({ companyId: company, stage: "decided", state: stateFilter === "all" ? undefined : stateFilter, search: applied || undefined, offset })
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
  // Approved offers convert; earlier accepted offers remain convertible.
  const selectedState = offers.items.find((o) => o.id === selected)?.state;
  const selectedAccepted = selectedState === "approved" || selectedState === "accepted";
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
  const save = async () => {
    if (!workspace || !csrfToken || mutation.current) return;
    // Nothing is typed again: the number is allocated on the server and the rest comes from the offer.
    const fields: Pick<CreateHrOfferEmployeeRequest, "employee_number" | "reason"> = {
      employee_number: "AUTO",
      reason: `Employee created from approved offer ${workspace.offer.reference}.`,
    };
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
        `Employee ${result.employee_number} created as a Draft and added to Employee Directory. Complete any remaining details with Edit Employee.`,
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
        "Initial assignment prepared from the approved offer. Request and approve the hire in Employee Assignments when the governing policy and job are ready.",
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
          Sign in with employee read and salary read permissions to review approved offer terms.
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
        className="grid min-w-0 items-end gap-4 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setApplied(search.trim());
          setOffset(0);
        }}
      >
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
      </form>
      <HrMasterStatusFilter<DecidedOfferFilter>
        label="Offer status"
        value={stateFilter}
        options={decidedOfferFilterOptions}
        onChange={(value) => {
          setStateFilter(value);
          setOffset(0);
          setError("");
        }}
      />
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
              <table className="w-full min-w-160 border-collapse text-left text-sm" aria-label="Offers">
                <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2">Candidate</th>
                    <th className="whitespace-nowrap px-3 py-2">Opening</th>
                    <th className="whitespace-nowrap px-3 py-2">Joining date</th>
                    <th className="whitespace-nowrap px-3 py-2">Monthly gross</th>
                    <th className="whitespace-nowrap px-3 py-2">Offer status</th>
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
                      <td className="px-3 py-1.5">
                        <span className="font-medium text-foreground">{o.candidate_name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{o.reference}</span>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{o.opening_title}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{o.joining_on}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {offerMoney(o.proposed_gross, o.currency_code)}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge
                          variant={o.state === "approved" ? "secondary" : "outline"}
                        >
                          {label(o.state)}
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
              employees are created from approved offers
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
        footer={
          data && !handoff && !data.blockers.length && canCreate ? (
            <Button className="text-primary-foreground!" disabled={busy || detailLoading} onClick={() => void save()}>
              <UserRoundPlus className="size-4" />
              {busy ? "Creating employee…" : "Create employee"}
            </Button>
          ) : handoff ? (
            <Button variant="outline" onClick={() => onNavigate("hr", "employee-directory")}>
              Open Employee Directory
              <ArrowRight className="size-4" />
            </Button>
          ) : undefined
        }
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
          {summary && !selectedAccepted ? (
            <>
              <HrDetailSummary
                code={summary.reference}
                status={summary.state}
              >
                {summary.opening_title}
              </HrDetailSummary>
              <HrDetailGroup title="Offer">
                <HrDetailTile label="Joining date" value={hrDisplayDate(summary.joining_on)} />
                <HrDetailTile label="Valid until" value={hrDisplayDate(summary.valid_until)} />
                <HrDetailTile label="Monthly gross" value={offerMoney(summary.proposed_gross, summary.currency_code)} />
              </HrDetailGroup>
              <div role="status" className="grid gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p>Employees can be created only from Approved offers. Continue this offer in Offer Management.</p>
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
              <HrDetailGroup title="Transferred to the employee">
                <HrDetailTile label="Name" value={`${data.candidate.first_name} ${data.candidate.last_name}`} />
                <HrDetailTile label="Email" value={data.candidate.email} />
                <HrDetailTile label="Phone" value={data.candidate.phone} />
                <HrDetailTile label="Job title" value={data.offer.context.opening_title} />
                <HrDetailTile
                  label="Salary"
                  value={offerMoney(data.offer.proposed_gross, data.offer.currency_code)}
                  hint="Monthly gross"
                />
              </HrDetailGroup>
              <HrDetailGroup title="Approved terms">
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
              </HrDetailGroup>
              <HrDetailSection title="Employment handoff progress">
                <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                  {[
                    ["1. Approved offer", "Approved terms retained on the employee", true],
                    [
                      "2. Employee profile",
                      handoff
                        ? `${handoff.employee_number} · ${label(handoff.profile_approval)}`
                        : "Create the employee from this offer",
                      !!handoff,
                    ],
                    [
                      "3. Initial assignment",
                      handoff?.assignment_id ? "Prepared from approved offer terms" : "Prepare after profile approval",
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
                ) : canCreate ? null : (
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
