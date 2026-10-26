"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateHrOfferRequest,
  HrOfferContext,
  HrOfferDetail,
  HrOfferDirectory,
  HrOfferActionRequest,
} from "@nexora/contracts";
import { CheckCircle2, Download, FileCheck2, FileText, Plus, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";

const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const label = (s: string) => s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const money = (value: string, currency: string) => {
  const [whole, fraction = ""] = value.split(".");
  return currency + " " + whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0");
};
const decimalUnits = (value: string): bigint | null => {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, "0"));
};
const fail = (err: unknown) =>
  err instanceof ApiError ? err.message : "The offer could not be loaded or saved. Please retry.";
const actions: Record<HrOfferActionRequest["action"], string> = {
  submit: "Submit for approval",
  approve: "Approve offer",
  reject_approval: "Reject approval",
  generate: "Generate offer letter",
  record_sent: "Record delivery",
  accept: "Record acceptance",
  decline: "Record decline",
  withdraw: "Withdraw offer",
  expire: "Close expired offer",
};
const states = [
  "draft",
  "submitted",
  "approved",
  "generated",
  "sent",
  "accepted",
  "declined",
  "rejected",
  "expired",
  "withdrawn",
];
type MasterOptions = Awaited<ReturnType<HrApiClient["masters"]>>["items"];
type EmployeeOptions = Awaited<ReturnType<HrApiClient["employees"]>>["items"];
type Terms = Omit<CreateHrOfferRequest, "company_id" | "application_id">;

function OfferEditor({
  context,
  detail,
  masters,
  employees,
  busy,
  save,
  close,
}: {
  context: HrOfferContext;
  detail?: HrOfferDetail;
  masters: MasterOptions;
  employees: EmployeeOptions;
  busy: boolean;
  save: (terms: Terms) => Promise<boolean>;
  close: () => void;
}) {
  const [terms, setTerms] = useState<Terms>({
    proposed_gross: detail?.proposed_gross ?? context.salary_minimum,
    joining_on: detail?.joining_on ?? "",
    valid_until: detail?.valid_until ?? "",
    probation_months: detail?.probation_months ?? 3,
    notice_days: detail?.notice_days ?? 30,
    cost_center_id: detail?.cost_center_id ?? "",
    work_location_id: detail?.work_location_id ?? "",
    employee_category_id: detail?.employee_category_id ?? "",
    reporting_manager_id: detail?.reporting_manager_id ?? null,
    note: detail?.note ?? "",
    range_exception_reason: detail?.range_exception_reason ?? "",
  });
  const field = <K extends keyof Terms>(key: K, value: Terms[K]) =>
    setTerms((current) => ({ ...current, [key]: value }));
  const outside =
    decimalUnits(terms.proposed_gross) !== null &&
    (decimalUnits(terms.proposed_gross)! < decimalUnits(context.salary_minimum)! ||
      decimalUnits(terms.proposed_gross)! > decimalUnits(context.salary_maximum)!);
  return (
    <form
      className="grid gap-4 rounded-2xl border border-primary/30 bg-card p-5 shadow-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save(terms)) close();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-lg font-semibold">{detail ? "Edit draft terms" : "Prepare offer"}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {context.candidate_name} · {context.application_reference}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close offer editor"
          disabled={busy}
          onClick={close}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="grid gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-2">
        <div>
          <span className="text-xs text-muted-foreground">Approved role</span>
          <p className="mt-1 font-medium">
            {context.designation} · {context.job_grade}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Approved monthly range</span>
          <p className="mt-1 font-medium">
            {money(context.salary_minimum, context.currency_code)} –{" "}
            {money(context.salary_maximum, context.currency_code)}
          </p>
        </div>
        <div>
          {context.branch} · {context.department}
        </div>
        <div>
          {context.employment_type} · {context.requisition_reference}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          Proposed monthly gross ({context.currency_code})
          <Input
            required
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,4})?"
            value={terms.proposed_gross}
            onChange={(e) => field("proposed_gross", e.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Joining date
          <Input
            required
            type="date"
            min={context.today}
            value={terms.joining_on}
            onChange={(e) => field("joining_on", e.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Offer valid through
          <Input
            required
            type="date"
            min={context.today}
            max={terms.joining_on || undefined}
            value={terms.valid_until}
            onChange={(e) => field("valid_until", e.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Probation (months)
          <Input
            required
            type="number"
            min={0}
            max={24}
            value={terms.probation_months}
            onChange={(e) => field("probation_months", Number(e.target.value))}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Notice (days)
          <Input
            required
            type="number"
            min={0}
            max={365}
            value={terms.notice_days}
            onChange={(e) => field("notice_days", Number(e.target.value))}
          />
        </label>
        {(
          [
            ["cost_center_id", "cost_center", "Cost centre"],
            ["work_location_id", "work_location", "Work location"],
            ["employee_category_id", "employee_category", "Employee category"],
          ] as const
        ).map(([key, type, title]) => (
          <label key={key} className="grid gap-1.5 text-sm">
            {title}
            <select required className={selectClass} value={terms[key]} onChange={(e) => field(key, e.target.value)}>
              <option value="">Select {title.toLowerCase()}</option>
              {masters
                .filter((item) => item.type === type)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
            </select>
          </label>
        ))}
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          Reporting manager (optional)
          <select
            className={selectClass}
            value={terms.reporting_manager_id ?? ""}
            onChange={(e) => field("reporting_manager_id", e.target.value || null)}
          >
            <option value="">To be assigned</option>
            {employees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name} · {item.employee_number}
              </option>
            ))}
          </select>
        </label>
      </div>
      {outside ? (
        <Alert>
          <AlertTitle>Compensation exception proposed</AlertTitle>
          <AlertDescription>
            This amount is outside the requisition range. The approver must explicitly authorize the exception with
            salary approval permission.
          </AlertDescription>
        </Alert>
      ) : null}
      <label className="grid gap-1.5 text-sm">
        Compensation exception reason {outside ? "(required)" : "(if applicable)"}
        <Textarea
          required={outside}
          maxLength={1000}
          value={terms.range_exception_reason}
          onChange={(e) => field("range_exception_reason", e.target.value)}
        />
      </label>
      <label className="grid gap-1.5 text-sm">
        Additional offer terms
        <Textarea maxLength={2000} value={terms.note} onChange={(e) => field("note", e.target.value)} />
      </label>
      <p className="text-xs text-muted-foreground">
        Terms become fixed on submission. Active master choices are limited to 100 per type; up to 100 employee matches
        are shown.
      </p>
      <div className="flex gap-2">
        <Button type="submit" className="text-primary-foreground!" disabled={busy}>
          {busy ? "Saving…" : "Save offer draft"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function OfferDecision({
  offer,
  allowed,
  busy,
  canException,
  run,
}: {
  offer: HrOfferDetail;
  allowed: HrOfferActionRequest["action"][];
  busy: boolean;
  canException: boolean;
  run: (input: HrOfferActionRequest) => Promise<boolean>;
}) {
  const [action, setAction] = useState<HrOfferActionRequest["action"] | "">(""),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [respondedOn, setRespondedOn] = useState(""),
    [exception, setException] = useState(false);
  const response = action === "accept" || action === "decline",
    requiresEvidence = response || action === "record_sent";
  if (!allowed.length) return null;
  return (
    <form
      className="grid gap-3 rounded-xl border border-primary/20 bg-card p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!action) return;
        await run({
          company_id: offer.company_id,
          expected_version: offer.version,
          action,
          reason,
          evidence_reference: evidence,
          approve_range_exception: action === "approve" && exception,
          ...(response ? { responded_on: respondedOn } : {}),
        });
      }}
    >
      <h4 className="m-0 font-semibold">Next action</h4>
      <label className="grid gap-1.5 text-sm">
        Offer action
        <select
          required
          className={selectClass}
          value={action}
          disabled={busy}
          onChange={(e) => {
            setAction(e.target.value as typeof action);
            setException(false);
            setEvidence("");
            setRespondedOn("");
          }}
        >
          <option value="">Choose an action</option>
          {allowed.map((value) => (
            <option key={value} value={value}>
              {actions[value]}
            </option>
          ))}
        </select>
      </label>
      {action === "record_sent" ? (
        <p className="text-sm text-muted-foreground">
          Record a delivery already made outside the ERP. This action does not send an email or message.
        </p>
      ) : null}
      {action === "approve" ? (
        <p className="text-sm text-muted-foreground">
          A different approver must review the submitted terms. Authorized super-admin self-approval overrides are
          recorded explicitly.
        </p>
      ) : null}
      {action === "approve" && offer.outside_range ? (
        <label className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <Checkbox
            checked={exception}
            disabled={!canException || busy}
            onCheckedChange={(value) => setException(!!value)}
          />
          <span>
            I explicitly approve the compensation exception.
            <span className="mt-1 block text-xs text-muted-foreground">
              {canException ? offer.range_exception_reason : "Salary approval permission is required."}
            </span>
          </span>
        </label>
      ) : null}
      {requiresEvidence ? (
        <label className="grid gap-1.5 text-sm">
          {response ? "Candidate response reference" : "Delivery reference"}
          <Input
            required
            maxLength={500}
            value={evidence}
            placeholder={
              response
                ? "Signed letter, response email or document reference"
                : "Delivery receipt or sent-message reference"
            }
            onChange={(e) => setEvidence(e.target.value)}
          />
        </label>
      ) : null}
      {response ? (
        <label className="grid gap-1.5 text-sm">
          Candidate response date
          <Input
            required
            type="date"
            max={offer.context.today}
            value={respondedOn}
            onChange={(e) => setRespondedOn(e.target.value)}
          />
        </label>
      ) : null}
      <label className="grid gap-1.5 text-sm">
        Decision reason
        <Textarea required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <Button
        type="submit"
        className="text-primary-foreground!"
        disabled={busy || !action || !reason.trim() || (action === "approve" && offer.outside_range && !exception)}
      >
        {busy ? "Saving…" : action ? actions[action] : "Choose an action"}
      </Button>
    </form>
  );
}

export function HrOfferManagementWorkspace() {
  const { api, session, loading: sessionLoading, csrfToken } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [],
    canRead = permissions.includes("hr.employee.read") && permissions.includes("hr.payroll.salary.read"),
    canCreate = permissions.includes("hr.employee.create"),
    canEdit = permissions.includes("hr.employee.update"),
    canSubmit = permissions.includes("hr.employee.submit"),
    canApprove = permissions.includes("hr.employee.approve"),
    canException = permissions.includes("hr.payroll.salary.approve");
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]),
    [companyId, setCompanyId] = useState("");
  const [directory, setDirectory] = useState<HrOfferDirectory>({ items: [], total: 0 }),
    [selectedId, setSelectedId] = useState(""),
    [detail, setDetail] = useState<HrOfferDetail | null>(null);
  const [search, setSearch] = useState(""),
    [stateFilter, setStateFilter] = useState(""),
    [filter, setFilter] = useState({ search: "", state: "", offset: 0 });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<"new" | "edit" | null>(null),
    [context, setContext] = useState<HrOfferContext | null>(null),
    [editorLoading, setEditorLoading] = useState(false);
  const [applications, setApplications] = useState<Awaited<ReturnType<HrApiClient["applications"]>>["items"]>([]),
    [applicationId, setApplicationId] = useState(""),
    [appSearch, setAppSearch] = useState(""),
    [appQuery, setAppQuery] = useState("");
  const [masters, setMasters] = useState<MasterOptions>([]),
    [employees, setEmployees] = useState<EmployeeOptions>([]);
  const listSeq = useRef(0),
    detailSeq = useRef(0);
  useEffect(() => {
    if (sessionLoading || !canRead) return;
    let cancel = false;
    client
      .companies()
      .then((r) => {
        if (!cancel) {
          setCompanies(r.items);
          setCompanyId(r.items[0]?.id ?? "");
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancel) {
          setError(fail(e));
          setLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, [client, sessionLoading, canRead, session?.tenant_id, session?.user.id]);
  const loadList = useCallback(async () => {
    if (!companyId || !canRead) return;
    const seq = ++listSeq.current;
    setLoading(true);
    try {
      const r = await client.offers({ companyId, ...filter });
      if (seq === listSeq.current) {
        setDirectory(r);
        setSelectedId((id) => (r.items.some((item) => item.id === id) ? id : (r.items[0]?.id ?? "")));
      }
    } catch (e) {
      if (seq === listSeq.current) {
        setError(fail(e));
        setDirectory({ items: [], total: 0 });
      }
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }, [client, companyId, canRead, filter]);
  useEffect(() => {
    void loadList();
    return () => {
      listSeq.current++;
    };
  }, [loadList]);
  const loadDetail = useCallback(async () => {
    if (!companyId || !selectedId) return;
    const seq = ++detailSeq.current;
    try {
      const r = await client.offer(companyId, selectedId);
      if (seq === detailSeq.current) setDetail(r);
    } catch (e) {
      if (seq === detailSeq.current) {
        setDetail(null);
        setError(fail(e));
      }
    }
  }, [client, companyId, selectedId]);
  useEffect(() => {
    setDetail(null);
    void loadDetail();
    return () => {
      detailSeq.current++;
    };
  }, [loadDetail]);
  useEffect(() => {
    if (!editor || !companyId) return;
    let cancelled = false;
    setEditorLoading(true);
    setMasters([]);
    setEmployees([]);
    Promise.all([
      client.masters({ companyId, type: "cost_center", limit: 100 }),
      client.masters({ companyId, type: "work_location", limit: 100 }),
      client.masters({ companyId, type: "employee_category", limit: 100 }),
      client.employees({ companyId, limit: 100 }),
    ])
      .then(([cc, wl, ec, people]) => {
        if (!cancelled) {
          setMasters([...cc.items, ...wl.items, ...ec.items]);
          setEmployees(people.items.filter((item) => ["active", "probation", "confirmed"].includes(item.status)));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(fail(e));
      })
      .finally(() => {
        if (!cancelled) setEditorLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, companyId, editor]);
  useEffect(() => {
    if (editor !== "new" || !companyId) return;
    let cancelled = false;
    client
      .applications({ companyId, stage: "selected", search: appQuery, limit: 100 })
      .then((r) => {
        if (!cancelled) {
          setApplications(r.items);
          setApplicationId((id) => (r.items.some((item) => item.id === id) ? id : (r.items[0]?.id ?? "")));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(fail(e));
      });
    return () => {
      cancelled = true;
    };
  }, [client, companyId, editor, appQuery]);
  useEffect(() => {
    if (editor !== "new" || !applicationId) return;
    let cancelled = false;
    setContext(null);
    client
      .offerContext(companyId, applicationId)
      .then((r) => {
        if (!cancelled) setContext(r);
      })
      .catch((e) => {
        if (!cancelled) setError(fail(e));
      });
    return () => {
      cancelled = true;
    };
  }, [client, companyId, applicationId, editor]);
  const save = async (terms: Terms) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r =
        editor === "edit" && detail
          ? await client.updateOffer(
              detail.id,
              { company_id: companyId, expected_version: detail.version, ...terms },
              csrfToken(),
              crypto.randomUUID(),
            )
          : await client.createOffer(
              { company_id: companyId, application_id: applicationId, ...terms },
              csrfToken(),
              crypto.randomUUID(),
            );
      setNotice(`${r.reference} saved as a draft.`);
      setSelectedId(r.id);
      setSearch("");
      setStateFilter("");
      setFilter({ search: "", state: "", offset: 0 });
      if (editor === "edit") await loadDetail();
      return true;
    } catch (e) {
      setError(fail(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const run = async (input: HrOfferActionRequest) => {
    if (!detail) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await client.offerAction(detail.id, input, csrfToken(), crypto.randomUUID());
      setNotice(`${actions[input.action]} recorded with its audit evidence.`);
      await Promise.all([loadList(), loadDetail()]);
      return true;
    } catch (e) {
      setError(fail(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const allowed: HrOfferActionRequest["action"][] = [];
  if (detail) {
    if (!detail.is_overdue) {
      if (detail.state === "draft" && canSubmit) allowed.push("submit");
      if (detail.state === "submitted" && canApprove) allowed.push("approve", "reject_approval");
      if (canEdit) {
        if (detail.state === "approved") allowed.push("generate");
        if (detail.state === "generated") allowed.push("record_sent");
        if (detail.state === "sent") allowed.push("accept", "decline");
      }
    }
    if (canEdit && ["draft", "submitted", "approved", "generated", "sent"].includes(detail.state)) {
      allowed.push("withdraw");
      if (detail.is_overdue) allowed.push("expire");
    }
  }
  const download = () => {
    if (!detail?.document_text) return;
    const url = URL.createObjectURL(new Blob([detail.document_text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${detail.reference}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!session || !canRead)
    return (
      <Alert>
        <AlertTitle>Offer access required</AlertTitle>
        <AlertDescription>
          Offer Management requires HR employee read and salary read permissions because compensation terms are
          sensitive.
        </AlertDescription>
      </Alert>
    );
  return (
    <section
      aria-label="Live offer management"
      className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_h4]:mb-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
        <div>
          <Badge variant="outline" className="border-primary/30 bg-card text-primary">
            Recruitment · approved terms
          </Badge>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">From selection to a considered offer</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Prepare consistent terms, secure approval and retain the candidate’s response with the offer history.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!companyId || busy}
            onClick={() => {
              setError("");
              void Promise.all([loadList(), loadDetail()]);
            }}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          {canCreate ? (
            <Button
              className="text-primary-foreground!"
              disabled={busy || !companyId}
              onClick={() => {
                setEditor("new");
                setContext(null);
                setError("");
              }}
            >
              <Plus className="size-4" />
              Prepare offer
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          {notice}
        </div>
      ) : null}
      <form
        className="grid items-end gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setFilter({ search, state: stateFilter, offset: 0 });
        }}
      >
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Company
          <select
            className={selectClass}
            disabled={busy}
            value={companyId}
            onChange={(e) => {
              listSeq.current++;
              detailSeq.current++;
              setCompanyId(e.target.value);
              setDirectory({ items: [], total: 0 });
              setSelectedId("");
              setDetail(null);
              setEditor(null);
              setApplicationId("");
              setContext(null);
              setError("");
              setNotice("");
              setFilter({ search: "", state: "", offset: 0 });
              setSearch("");
              setStateFilter("");
            }}
          >
            {companies.length ? (
              companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            ) : (
              <option value="">No authorized companies</option>
            )}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Search offers
          <Input
            maxLength={160}
            value={search}
            placeholder="Candidate, reference or role"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Offer status
          <select className={selectClass} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All statuses</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" disabled={busy || !companyId}>
          <Search className="size-4" />
          Apply filters
        </Button>
      </form>
      {editor === "new" ? (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="m-0 font-semibold">Choose a selected application</h3>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close offer preparation"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setAppQuery(appSearch);
            }}
          >
            <label className="grid flex-1 gap-1 text-sm">
              Find selected application
              <Input maxLength={160} value={appSearch} onChange={(e) => setAppSearch(e.target.value)} />
            </label>
            <Button type="submit" variant="outline">
              Find application
            </Button>
          </form>
          <label className="grid gap-1.5 text-sm">
            Selected application
            <select
              className={selectClass}
              value={applicationId}
              disabled={busy}
              onChange={(e) => setApplicationId(e.target.value)}
            >
              {applications.length ? (
                applications.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.candidate_name} · {app.reference}
                  </option>
                ))
              ) : (
                <option value="">No selected applications</option>
              )}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            Up to 100 selected matches. Refine the search to find another application.
          </p>
          {context?.blockers.length ? (
            <Alert>
              <AlertTitle>Offer prerequisites</AlertTitle>
              <AlertDescription>{context.blockers.join(" ")}</AlertDescription>
            </Alert>
          ) : null}
          {!applications.length ? (
            <p className="text-sm text-muted-foreground">
              Complete the selection decision in Interviews & Evaluations before preparing an offer.
            </p>
          ) : null}
        </div>
      ) : null}
      {editorLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : editor && ((editor === "new" && context && !context.blockers.length) || (editor === "edit" && detail)) ? (
        <OfferEditor
          key={`${editor}-${editor === "edit" ? detail?.id : applicationId}`}
          context={editor === "edit" ? detail!.context : context!}
          detail={editor === "edit" ? detail! : undefined}
          masters={masters}
          employees={employees}
          busy={busy}
          save={save}
          close={() => setEditor(null)}
        />
      ) : null}
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="m-0 text-lg font-semibold">Offer register</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {directory.total} matching offers · {directory.items.length} on this page
          </p>
        </div>
        <Badge variant="outline">
          <ShieldCheck className="size-3" />
          Approval before delivery
        </Badge>
      </div>
      {loading && !directory.items.length ? (
        <Skeleton className="h-72 w-full" />
      ) : !directory.items.length ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <FileText className="size-9 text-primary" />
          <h3 className="m-0 text-lg font-semibold">No offers to display</h3>
          <p className="max-w-lg text-sm leading-6 text-muted-foreground">
            Prepare an offer for a selected application, or adjust the company, search and status filters to review an
            existing offer.
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1 xl:max-h-[48rem]" aria-label="Offer register">
            {directory.items.map((item) => (
              <button
                type="button"
                key={item.id}
                disabled={busy}
                aria-pressed={item.id === selectedId}
                onClick={() => {
                  setSelectedId(item.id);
                  setEditor(null);
                  setError("");
                  setNotice("");
                }}
                className={`grid gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.id === selectedId ? "border-primary ring-1 ring-primary/20" : "border-border"}`}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{item.reference}</span>
                  <Badge variant={item.is_overdue ? "destructive" : "secondary"}>
                    {item.is_overdue ? "Overdue" : label(item.state)}
                  </Badge>
                </div>
                <strong className="font-semibold">{item.candidate_name}</strong>
                <span className="text-sm text-muted-foreground">{item.opening_title}</span>
                <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-xs">
                  <span>{money(item.proposed_gross, item.currency_code)}</span>
                  <span className="text-muted-foreground">Valid to {item.valid_until}</span>
                </div>
              </button>
            ))}
          </div>
          {detail ? (
            <div className="grid min-w-0 gap-4" aria-label="Offer details">
              <div className="grid gap-4 rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {detail.reference} · version {detail.version}
                    </span>
                    <h3 className="mt-2 text-xl font-semibold">{detail.candidate_name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {detail.context.designation} · {detail.context.job_grade}
                    </p>
                  </div>
                  {detail.state === "draft" && canEdit ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setContext(detail.context);
                        setEditor("edit");
                      }}
                    >
                      Edit draft terms
                    </Button>
                  ) : (
                    <Badge variant="secondary">{label(detail.state)}</Badge>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-primary/5 p-3">
                    <span className="text-xs text-muted-foreground">Monthly gross</span>
                    <strong className="mt-1 block text-lg text-primary">
                      {money(detail.proposed_gross, detail.currency_code)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">Joining date</span>
                    <strong className="mt-1 block">{detail.joining_on}</strong>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">Valid through</span>
                    <strong className="mt-1 block">{detail.valid_until}</strong>
                  </div>
                </div>
                <dl className="m-0 grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    ["Company", detail.context.company_name],
                    ["Department", `${detail.context.department} · ${detail.context.branch}`],
                    ["Employment", `${detail.context.employment_type} · ${detail.employee_category}`],
                    ["Work location", detail.work_location],
                    ["Cost centre", detail.cost_center],
                    ["Reporting manager", detail.reporting_manager ?? "To be assigned"],
                    ["Probation / notice", `${detail.probation_months} months / ${detail.notice_days} days`],
                    [
                      "Opening capacity",
                      `${detail.context.positions_reserved} reserved of ${detail.context.positions_authorized}`,
                    ],
                  ].map(([title, value]) => (
                    <div key={title}>
                      <dt className="text-xs text-muted-foreground">{title}</dt>
                      <dd className="m-0 mt-1 font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                {detail.note ? (
                  <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{detail.note}</p>
                ) : null}
                {detail.outside_range ? (
                  <div
                    role="status"
                    className="grid gap-1 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm"
                  >
                    <strong>
                      {detail.exception_approved_by
                        ? "Compensation exception approved"
                        : "Compensation exception requires approval"}
                    </strong>
                    <p className="m-0 text-muted-foreground">
                      {detail.range_exception_reason}
                      {detail.exception_approved_by
                        ? " · Approved by " +
                          (detail.history.find(
                            (event) => event.action === "approve" && event.actor_id === detail.exception_approved_by,
                          )?.actor_name ?? detail.exception_approved_by)
                        : ""}
                    </p>
                  </div>
                ) : null}
                {detail.is_overdue ? (
                  <Alert variant="destructive">
                    <AlertTitle>Offer validity has passed</AlertTitle>
                    <AlertDescription>
                      Expire or withdraw this record before preparing a replacement. Acceptance and delivery actions are
                      blocked.
                    </AlertDescription>
                  </Alert>
                ) : null}
                {detail.state === "accepted" ? (
                  <div className="flex gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                    <CheckCircle2 className="size-5 shrink-0 text-primary" />
                    <span>
                      Acceptance is recorded and the authorized position is reserved. This offer is ready for the
                      governed employee-draft handoff. <a className="font-semibold text-primary underline underline-offset-4" href="#/hr/create-employee-from-offer">Open employee handoff</a>
                    </span>
                  </div>
                ) : null}
              </div>
              <OfferDecision
                key={`${detail.id}-${detail.version}`}
                offer={detail}
                allowed={allowed}
                busy={busy}
                canException={canException}
                run={run}
              />
              {detail.document_text ? (
                <div className="grid gap-3 rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="m-0 flex items-center gap-2 font-semibold">
                      <FileCheck2 className="size-4 text-primary" />
                      Generated offer letter
                    </h4>
                    <Button variant="outline" onClick={download}>
                      <Download className="size-4" />
                      Download letter
                    </Button>
                  </div>
                  <pre className="m-0 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 font-sans text-sm leading-6">
                    {detail.document_text}
                  </pre>
                </div>
              ) : null}
              <div className="rounded-xl border border-border bg-card p-5">
                <h4 className="m-0 font-semibold">Offer evidence & history</h4>
                <ol className="m-0 mt-4 grid list-none gap-4 p-0">
                  {detail.history
                    .slice()
                    .reverse()
                    .map((item) => (
                      <li key={item.id} className="border-l-2 border-primary/25 pl-3">
                        <span className="text-sm font-semibold">
                          {item.action in actions ? actions[item.action as keyof typeof actions] : label(item.action)} ·{" "}
                          {label(item.to_state)}
                        </span>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {item.reason}
                        </p>
                        {item.evidence_reference ? (
                          <p className="mt-1 break-words text-sm">Reference: {item.evidence_reference}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.actor_name} · {new Date(item.occurred_at).toLocaleString()}
                        </p>
                      </li>
                    ))}
                </ol>
              </div>
            </div>
          ) : (
            <Skeleton className="h-96 w-full" />
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || loading || filter.offset === 0}
          onClick={() => setFilter((current) => ({ ...current, offset: Math.max(0, current.offset - 50) }))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || loading || filter.offset + 50 >= directory.total}
          onClick={() => setFilter((current) => ({ ...current, offset: current.offset + 50 }))}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
