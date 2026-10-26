"use client";
import { HrPersonalLearning } from "./hr-learning-workspace";
import { HrCompanyScope as CompanyScope } from "../components/hr-company-scope";
import { HrPersonalCorrections } from "./hr-personal-corrections";
import { HrPersonalLeaveApplications } from "./hr-personal-leave-applications";
import { useState, type ReactNode } from "react";
import { ArrowRight, Download, RefreshCw, ShieldCheck, Wallet, FileText, UserRound, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import {
  Field,
  State,
  Metric,
  panel,
  selectClass,
  useAttendanceRead,
  localDate,
} from "../components/hr-workspace-controls";
import { payslipHtml } from "../components/payslip-print";
import { HrPayrollWorkspace } from "./hr-payroll-workspace";
import { HrPayrollLocalizationSetup } from "./hr-payroll-localization-setup";
import { HrSettlementBenefits } from "./hr-settlement-benefits";
import { HrDashboardWorkspace } from "./hr-dashboard-workspace";
import { HrFinancePayrollDashboardWorkspace } from "./hr-finance-payroll-dashboard-workspace";
import type { HrPayslipDetail } from "@nexora/contracts";

type Navigate = (module: string, page: string, reference?: string) => void;
export const benefitsPages = [
  "loans-benefits",
  "statutory-deductions",
  "employee-self-service",
  "hr-report-centre",
] as const;
type Page = (typeof benefitsPages)[number];
function Notice({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <Alert variant={error ? "destructive" : "default"}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
function BenefitRules({ company }: { company: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <HrSettlementBenefits company={company} record={null} busy={busy} onBusy={setBusy} onCalculated={() => undefined} />
  );
}

function EmployeeSelfService({ onNavigate }: { onNavigate: Navigate }) {
  const { api } = useSession(),
    client = new HrApiClient(api);
  const [company, setCompany] = useState(""),
    [month, setMonth] = useState(localDate().slice(0, 7)),
    [revision, setRevision] = useState(0),
    [offset, setOffset] = useState(0),
    [tab, setTab] = useState("payslips");
  const [profileBusy, setProfileBusy] = useState(false);
  const [leaveOpened, setLeaveOpened] = useState(""),
    [leaveNotice, setLeaveNotice] = useState("");
  const [opened, setOpened] = useState(""),
    [exportError, setExportError] = useState("");
  const q = { ...(company ? { company_id: company } : {}), month: month + "-01", limit: 25, offset };
  const read = useAttendanceRead(month ? JSON.stringify([q, revision]) : null, () => client.selfService(q)),
    w = read.data;
  const detail = useAttendanceRead(
    w?.company_id && opened ? JSON.stringify([w.company_id, opened, revision]) : null,
    () => client.selfServicePayslip(w!.company_id!, opened),
  );
  const member = w?.memberships.find((m) => m.company_id === w.company_id);
  const total = w
    ? tab === "payslips"
      ? w.payslip_total
      : tab === "requests"
        ? w.request_total
        : tab === "loans"
          ? w.loan_total
          : 0
    : 0;
  function reset() {
    setLeaveOpened("");
    setLeaveNotice("");
    setOpened("");
    setOffset(0);
    setExportError("");
  }
  function download(d: HrPayslipDetail) {
    try {
      const font = getComputedStyle(document.body).fontFamily,
        url = URL.createObjectURL(new Blob([payslipHtml(d, font)], { type: "text/html;charset=utf-8" })),
        a = document.createElement("a");
      a.href = url;
      a.download = (
        "payslip-" +
        d.document.employee.number +
        "-" +
        d.document.period.month.slice(0, 7) +
        ".html"
      ).replace(/[^a-zA-Z0-9._-]/g, "-");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Download failed.");
    }
  }
  return (
    <div className="min-w-0 space-y-5" data-self-service>
      <Notice>
        Your personal workspace uses your linked employee account. Only published payslips are available. Apply for
        leave in Leave requests. Request changes to your personal details in Personal details; HR verifies and approves
        them.
      </Notice>
      <div className={panel}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_auto]">
          <Field title="My company">
            <select
              className={selectClass}
              value={w?.company_id ?? company}
              disabled={profileBusy || read.loading || !w?.memberships.length}
              onChange={(e) => {
                setCompany(e.target.value);
                reset();
              }}
            >
              <option value="">
                {read.loading
                  ? "Loading employee account…"
                  : read.error
                    ? "Company unavailable"
                    : "Employee link required"}
              </option>
              {w?.memberships.map((m) => (
                <option key={m.company_id} value={m.company_id}>
                  {m.company_name}
                </option>
              ))}
            </select>
          </Field>
          <Field title="Month">
            <Input
              type="month"
              disabled={profileBusy}
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                reset();
              }}
            />
          </Field>
          <Button
            type="button"
            disabled={profileBusy}
            className="self-end"
            variant="outline"
            onClick={() => setRevision((v) => v + 1)}
          >
            <RefreshCw className="size-4" />
            {read.error ? "Retry" : "Refresh"}
          </Button>
        </div>
      </div>
      {read.loading && <p role="status">Loading your personal records…</p>}
      {read.error && <Notice error>{read.error}</Notice>}
      {!month && <Notice>Select a month to load your records.</Notice>}
      {w?.status === "link_required" && (
        <Alert>
          <UserRound className="size-4" />
          <AlertTitle>Link your employee account</AlertTitle>
          <AlertDescription>
            Ask Security or HR to link your sign-in to your employee record and grant access to your company.
            Administrator permissions do not select another employee for you.
          </AlertDescription>
        </Alert>
      )}
      {member && (
        <>
          <div className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold break-words">{member.employee_name}</h2>
                <p className="text-sm text-muted-foreground">
                  {member.employee_number} · {member.company_name}
                </p>
              </div>
              <Badge variant="outline">
                <ShieldCheck className="mr-1 size-3" />
                Personal records
              </Badge>
            </div>
          </div>
          {w?.memberships_truncated && (
            <Notice>Only the first 100 linked companies are listed. Ask Security to review your company access.</Notice>
          )}
          <Tabs
            value={tab}
            onValueChange={(v) => {
              if (profileBusy) return;
              setTab(v);
              reset();
            }}
          >
            <div className="max-w-full overflow-x-auto">
              <TabsList className="w-max">
                <TabsTrigger disabled={profileBusy} value="payslips">
                  Payslips ({w?.payslip_total})
                </TabsTrigger>
                <TabsTrigger disabled={profileBusy} value="learning">
                  My learning
                </TabsTrigger>
                <TabsTrigger disabled={profileBusy} value="profile">
                  Personal details
                </TabsTrigger>
                <TabsTrigger disabled={profileBusy} value="balances">
                  Leave balances
                </TabsTrigger>
                <TabsTrigger disabled={profileBusy} value="requests">
                  Leave requests ({w?.request_total})
                </TabsTrigger>
                <TabsTrigger disabled={profileBusy} value="loans">
                  Loans ({w?.loan_total})
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="payslips">
              <div className="mt-4 grid gap-3">
                {w?.payslips.map((p) => (
                  <article className={panel} key={p.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold">{p.month.slice(0, 7)} payslip</h3>
                        <p className="text-sm text-muted-foreground">
                          Released {new Date(p.released_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setOpened(p.id);
                          setExportError("");
                        }}
                      >
                        Open payslip
                        <ArrowRight className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <Metric title="Gross" value={p.currency + " " + p.gross} hint="Published earnings" />
                      <Metric
                        title="Deductions"
                        value={p.currency + " " + p.deductions}
                        hint="Published employee deductions"
                      />
                      <Metric
                        title="Net"
                        value={p.currency + " " + p.net}
                        hint="Payroll net; payment confirmed separately"
                      />
                    </div>
                  </article>
                ))}
                {!w?.payslips.length && <Notice>No published payslips for this month.</Notice>}
              </div>
            </TabsContent>
            <TabsContent value="learning">
              <HrPersonalLearning company={w!.company_id!} onBusy={setProfileBusy} />
            </TabsContent>
            <TabsContent value="profile">
              <HrPersonalCorrections company={w!.company_id!} onBusy={setProfileBusy} />
            </TabsContent>
            <TabsContent value="balances">
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {w?.balances.map((b) => (
                  <article className={panel} key={b.leave_type_id}>
                    <h3 className="font-semibold">{b.leave_type}</h3>
                    <p className="text-xs text-muted-foreground">Current balance as of {b.as_of}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      {[
                        ["Available", b.available],
                        ["Posted balance", b.balance],
                        ["Pending requests", b.reserved],
                        ["Future approved usage", b.future_used],
                        ["Encashed", b.encashed],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-semibold tabular-nums">{value} days</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
                {!w?.balances.length && <Notice>No leave balances are configured for your account.</Notice>}
                {w?.balances_truncated && (
                  <Notice>The first 50 leave types are shown. Contact HR for a complete balance review.</Notice>
                )}
              </div>
            </TabsContent>
            <TabsContent value="requests">
              {leaveNotice && <Notice>{leaveNotice}</Notice>}
              <HrPersonalLeaveApplications
                company={w!.company_id!}
                canApply={w!.can_apply_leave}
                items={w!.requests}
                opened={leaveOpened}
                onOpen={setLeaveOpened}
                onSaved={(result, from) => {
                  setLeaveOpened(result.id);
                  setLeaveNotice(
                    result.status === "draft"
                      ? "Leave draft saved. Review and submit it for independent approval."
                      : result.status === "cancelled"
                        ? "Your leave request was cancelled. Pending reservations have been released."
                        : "Leave submitted to your reporting manager.",
                  );
                  if (from) setMonth(from.slice(0, 7));
                  setOffset(0);
                  setRevision((v) => v + 1);
                }}
              />
            </TabsContent>
            <TabsContent value="loans">
              <div className="mt-4 grid gap-3">
                {w?.loans.map((l) => (
                  <article className={panel} key={l.id}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="font-semibold break-words">{l.reference}</h3>
                      <State value={l.state} />
                    </div>
                    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                      {[
                        ["Principal", l.principal],
                        ["Approved Payroll recoveries", l.recovered],
                        ["Scheduled repayment balance", l.outstanding],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-semibold tabular-nums break-words">
                            {l.currency} {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
                {!w?.loans.length && (
                  <Notice>No approved loans are available. Draft applications remain with HR for review.</Notice>
                )}
              </div>
            </TabsContent>
          </Tabs>
          {tab !== "balances" && tab !== "profile" && tab !== "learning" && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                {total ? `${Math.min(offset + 1, total)}–${Math.min(offset + 25, total)} of ${total}` : "0 records"}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={offset === 0 || read.loading}
                  onClick={() => {
                    setOffset((v) => Math.max(0, v - 25));
                    setOpened("");
                  }}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={offset + 25 >= total || read.loading}
                  onClick={() => {
                    setOffset((v) => v + 25);
                    setOpened("");
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {detail.loading && <p role="status">Opening your published payslip…</p>}
      {detail.error && <Notice error>{detail.error}</Notice>}
      {exportError && <Notice error>{exportError}</Notice>}
      {detail.data && (
        <section className={panel}>
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Published pay breakdown</h2>
              <p className="text-sm text-muted-foreground">
                {detail.data.document.period.month.slice(0, 7)} · {detail.data.document.result.currency}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => download(detail.data!)}>
                <Download className="size-4" />
                Download payslip
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpened("")}>
                Close
              </Button>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {detail.data.document.lines.map((l, i) => (
              <li className="flex flex-wrap justify-between gap-3 py-3 text-sm" key={i}>
                <span className="min-w-0 break-words">
                  {l.name} <span className="text-muted-foreground">({l.kind.replaceAll("_", " ")})</span>
                </span>
                <strong className="tabular-nums">{l.amount}</strong>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Published payslips remain unchanged. Any independently posted settlement correction is recorded separately
            by Payroll. This document does not confirm a bank transfer.
          </p>
        </section>
      )}
      <Button type="button" variant="outline" onClick={() => onNavigate("hr", "performance-reviews")}>
        Open my Performance workspace
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function ReportCentre({ onNavigate }: { onNavigate: Navigate }) {
  const { session } = useSession(),
    permissions = session?.user.permissions ?? [];
  const [report, setReport] = useState("workforce");
  const reports = [
    {
      id: "workforce",
      title: "Workforce overview",
      description: "Effective headcount, approval queues, recent joiners and master-data gaps.",
      permission: "hr.employee.read",
      page: "hr-dashboard",
    },
    {
      id: "payroll",
      title: "Finance & Payroll overview",
      description: "Salary coverage, finalized run totals, Finance accrual and governed payment status.",
      permission: "hr.payroll.report.read",
      page: "finance-payroll-dashboard",
    },
  ];
  return (
    <div className="min-w-0 space-y-5">
      <Notice>
        Reports use the same company-scoped data as their operational workspaces. Detailed review opens the owning
        screen. Secure Export Centre provides independently governed directory and finalized Payroll CSV downloads.
        Additional report types remain in the reporting backlog.
      </Notice>
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((r) => (
          <button
            type="button"
            key={r.id}
            aria-pressed={report === r.id}
            className={
              panel +
              " text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (report === r.id ? "border-primary ring-1 ring-primary" : "")
            }
            onClick={() => setReport(r.id)}
          >
            <FileText className="mb-3 size-5 text-primary" />
            <h2 className="font-semibold">{r.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>
          </button>
        ))}
      </div>
      <div key={report}>
        {report === "workforce" ? (
          <HrDashboardWorkspace onNavigate={onNavigate} />
        ) : (
          <HrFinancePayrollDashboardWorkspace onNavigate={onNavigate} />
        )}
      </div>
      <section className={panel}>
        <h2 className="font-semibold">Detailed operational reports</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["Loan balances & schedules", "employee-loans", "hr.payroll.loan.read"],
            ["Secure CSV exports", "hr-export-centre", "hr.report_export.read"],
            ["Disclosure policy", "hr-compliance-configuration", "hr.report_export.read"],
            ["Report audit history", "hr-report-audit-log", "hr.report_audit.read"],
            ["Payroll results & statutory calculation evidence", "payroll-runs", "hr.payroll.result.read"],
            ["Published payslip register", "payslips", "hr.payroll.payslip.read"],
            ["Final statements & supplemental corrections", "final-settlements", "hr.employment_history.read"],
            ["Leave balances & reservations", "leave-balances", "hr.leave.balance.read"],
            ["Monthly attendance", "monthly-attendance", "hr.attendance.read"],
          ]
            .filter(([, , permission]) => permissions.includes(permission))
            .map(([title, page]) => (
              <Button
                key={page}
                type="button"
                variant="outline"
                className="h-auto justify-between whitespace-normal py-3 text-left"
                onClick={() => onNavigate("hr", page)}
              >
                {title}
                <ArrowRight className="ml-2 size-4 shrink-0" />
              </Button>
            ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Each report rechecks current company and record permissions on the API.
        </p>
      </section>
    </div>
  );
}

export function HrBenefitsWorkspace({ page, onNavigate }: { page: Page; onNavigate: Navigate }) {
  const [tab, setTab] = useState("loans");
  const titles: Record<Page, string> = {
    "loans-benefits": "Loans, Benefits & Gratuity",
    "statutory-deductions": "Statutory Deductions",
    "employee-self-service": "Employee Self-service",
    "hr-report-centre": "HR & Payroll Report Centre",
  };
  const Icon =
    page === "employee-self-service"
      ? UserRound
      : page === "statutory-deductions"
        ? Landmark
        : page === "hr-report-centre"
          ? FileText
          : Wallet;
  return (
    <div className="min-w-0 space-y-6 text-foreground" data-benefits-workspace={page}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-sm text-primary">
            <Icon className="size-4" />
            HR & Payroll
          </div>
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{titles[page]}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {page === "employee-self-service"
              ? "Your employee records, published pay and leave information."
              : "Connected company workflows with shared records and independent approvals."}
          </p>
        </div>
        <Badge variant="outline">{page === "employee-self-service" ? "Personal workspace" : "API connected"}</Badge>
      </header>
      {page === "loans-benefits" && (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="max-w-full overflow-x-auto">
            <TabsList className="w-max">
              <TabsTrigger value="loans">Loans & advances</TabsTrigger>
              <TabsTrigger value="benefits">Benefits & gratuity rules</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="loans">
            <div className="mt-4 space-y-4">
              <Notice>
                Approved loan schedules feed Payroll recovery. Funding remains subject to the separately owned Banking
                workflow.
              </Notice>
              <HrPayrollWorkspace page="employee-loans" onNavigate={onNavigate} />
            </div>
          </TabsContent>
          <TabsContent value="benefits">
            <div className="mt-4 space-y-4">
              <Notice>
                Maintain the same governed company and country-specific benefit rules used by Final Settlements.
                Calculate an employee award from their actual approved exit and salary evidence.
              </Notice>
              <CompanyScope>{(company) => <BenefitRules company={company} />}</CompanyScope>
              <Button type="button" variant="outline" onClick={() => onNavigate("hr", "final-settlements")}>
                Open Final Settlements
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}
      {page === "statutory-deductions" && (
        <>
          <Notice>
            Configure legal employer, work jurisdictions, employee declarations, contribution bases and published rule
            packs here. Payroll uses effective approved configuration and retains the exact calculation evidence with
            each run.
          </Notice>
          <CompanyScope>
            {(company) => <HrPayrollLocalizationSetup company={company} onDate={localDate()} />}
          </CompanyScope>
          <Button type="button" variant="outline" onClick={() => onNavigate("hr", "payroll-runs")}>
            Review Payroll calculations
            <ArrowRight className="size-4" />
          </Button>
        </>
      )}
      {page === "employee-self-service" && <EmployeeSelfService onNavigate={onNavigate} />}
      {page === "hr-report-centre" && <ReportCentre onNavigate={onNavigate} />}
    </div>
  );
}
