"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  RefreshCw,
  Download,
  ShieldCheck,
  ArrowRightLeft,
  GitBranch,
  Upload,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { WorkTable } from "@/shared/ui/work-table";
import { BudgetEntry } from "../components/budget-entry";
import { getBudgetPage } from "../model/budget-pages";
import {
  BudgetDashboard,
  BudgetScenarios,
  BudgetForecasts,
  BudgetAvailability,
  BudgetReportCatalogue,
  BudgetStart,
  BudgetTotals,
} from "../components/budget-overviews";
import {
  BudgetDialog,
  NewBudgetDialog,
  GenerateBudgetDialog,
  BudgetPolicyDialog,
  BudgetTransferDialog,
  BudgetModelDialog,
  BudgetExceptionDialog,
} from "../components/budget-dialogs";
import {
  BudgetField,
  BudgetSelect,
  BudgetDimensionsFields,
  BudgetPager,
  budgetPanel,
  budgetCell,
  budgetHead,
  budgetDisplay,
  downloadBudgetFile,
} from "../components/budget-controls";
import {
  decimal,
  decimalText,
  budgetDimensionKey,
  type BudgetOptions,
  type BudgetDirectory,
  type BudgetDetail,
  type BudgetReport,
  type BudgetDrill,
  type BudgetDimensions,
  type BudgetImport,
  type BudgetModel,
  type BudgetSourceControl,
  type BudgetSourceDirectory,
  type BudgetVersionInput,
  type BudgetRequestInput,
  type BudgetVersion,
  type BudgetRequest,
} from "@nexora/contracts";

type Navigate = (module: string, page: string, record?: string) => void;
export function BudgetWorkspace(props: { page: string; recordRef?: string; onNavigate: Navigate }) {
  const { activeCompany } = useSession();
  return <CompanyBudgetWorkspace key={activeCompany?.id ?? "none"} {...props} />;
}
function CompanyBudgetWorkspace({
  page,
  recordRef,
  onNavigate,
}: {
  page: string;
  recordRef?: string;
  onNavigate: Navigate;
}) {
  const { api, activeCompany, session, csrfToken } = useSession(),
    company = activeCompany?.id ?? "";
  const profile = getBudgetPage(page),
    versionSearch = ["budget-entry", "budget-approval", "scenarios", "forecasts", "budget-models"].includes(page);
  const [options, setOptions] = useState<BudgetOptions | null>(null),
    [directory, setDirectory] = useState<BudgetDirectory | null>(null),
    [detail, setDetail] = useState<BudgetDetail | null>(null),
    [report, setReport] = useState<BudgetReport | null>(null);
  const [versionChoices, setVersionChoices] = useState<BudgetVersion[]>([]),
    [approvalState, setApprovalState] = useState(""),
    [scenarioCase, setScenarioCase] = useState<"best" | "expected" | "worst">("expected");
  const [calendar, setCalendar] = useState(""),
    [selected, setSelected] = useState(recordRef ?? ""),
    [search, setSearch] = useState(""),
    [accountSearch, setAccountSearch] = useState(""),
    [accountPage, setAccountPage] = useState(0),
    [accountFilter, setAccountFilter] = useState(""),
    [period, setPeriod] = useState(""),
    [dimensions, setDimensions] = useState<BudgetDimensions>({}),
    [asOf, setAsOf] = useState(new Date().toLocaleDateString("en-CA"));
  const [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<
      "plan" | "revision" | "scenario" | "forecast" | "policy" | "transfer" | "model" | "exception" | null
    >(null),
    [editingModel, setEditingModel] = useState<BudgetModel | null>(null),
    [source, setSource] = useState<BudgetSourceControl | null>(null),
    [sourceCode, setSourceCode] = useState(""),
    [sourceChoice, setSourceChoice] = useState(""),
    [sourceDirectory, setSourceDirectory] = useState<BudgetSourceDirectory | null>(null);
  const [newVersion, setNewVersion] = useState(false),
    [drill, setDrill] = useState<BudgetDrill | null>(null),
    [drillQuery, setDrillQuery] = useState(""),
    [drillOffset, setDrillOffset] = useState(0),
    [comment, setComment] = useState<{ account: string; period: string } | null>(null),
    [commentText, setCommentText] = useState("");
  const [importPreview, setImportPreview] = useState<BudgetImport | null>(null),
    [importFile, setImportFile] = useState<File | null>(null),
    [reason, setReason] = useState(""),
    [approver, setApprover] = useState(""),
    [comparison, setComparison] = useState<BudgetDetail | null>(null);
  const retry = useRef({ fingerprint: "", key: "" });
  const [previousRecord, setPreviousRecord] = useState(recordRef);
  const [previousPage, setPreviousPage] = useState(page);
  if (previousPage !== page) {
    setPreviousPage(page);
    setOffset(0);
    setComparison(null);
    setDialog(null);
    setNewVersion(false);
    setError("");
  }
  // Route changes select the new record before effects fetch it; no stale-record render.
  if (previousRecord !== recordRef) {
    setPreviousRecord(recordRef);
    if (recordRef) {
      setSelected(recordRef);
      setNewVersion(false);
      setOffset(0);
    }
  }
  const canRead = !!session?.user.permissions.includes("budget.plan.read"),
    can = (permission: string) => options?.permissions.includes(permission) ?? false;
  const q = useCallback(
    (extra: Record<string, string | number | undefined> = {}) => {
      const params = new URLSearchParams({ company_id: company, limit: "50", offset: String(offset) });
      for (const [key, value] of Object.entries({
        fiscal_calendar_id: page === "budget-models" ? undefined : calendar || undefined,
        version_id: selected || undefined,
        search: versionSearch ? search || undefined : undefined,
        state: page === "budget-approval" ? approvalState || undefined : undefined,
        period_id: profile.period ? period || undefined : undefined,
        account_id: profile.analysis ? accountFilter || undefined : undefined,
        as_of: profile.analysis ? asOf : undefined,
        ...(profile.analysis ? dimensions : {}),
        ...extra,
      }))
        if (value !== undefined && value !== "") params.set(key, String(value));
      return `?${params}`;
    },
    [
      company,
      offset,
      calendar,
      selected,
      search,
      period,
      asOf,
      dimensions,
      accountFilter,
      page,
      profile.period,
      profile.analysis,
      versionSearch,
      approvalState,
    ],
  );
  useEffect(() => {
    let cancelled = false;
    if (!company || !canRead) return;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      Promise.all([
        api.getBudgetOptions(
          `?company_id=${encodeURIComponent(company)}&limit=100&offset=${accountPage}&search=${encodeURIComponent(accountSearch)}`,
        ),
        api.getBudgetWorkspace(
          q({ kind: page === "scenarios" ? "scenario" : page === "forecasts" ? "forecast" : undefined }),
        ),
        selected ? api.getBudgetVersion(selected, `?company_id=${encodeURIComponent(company)}`) : Promise.resolve(null),
        session?.user.permissions.includes("budget.report.read") ? api.getBudgetReport(q()) : Promise.resolve(null),
        ["scenarios", "forecasts"].includes(page)
          ? api.getBudgetWorkspace(q({ search: "", offset: 0, limit: 100 }))
          : Promise.resolve(null),
      ])
        .then(([lookups, data, version, analysis, choices]) => {
          if (cancelled) return;
          setOptions(lookups);
          setDirectory(data);
          setDetail(version);
          setReport(analysis);
          setVersionChoices(choices?.versions ?? data.versions);
          if (!calendar) {
            const date = asOf,
              year = lookups.calendars.find((c) => c.start <= date && c.end >= date) ?? lookups.calendars[0];
            if (year) setCalendar(year.id);
          }
        })
        .catch((caught) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : "Budget data could not be loaded.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    api,
    company,
    canRead,
    q,
    selected,
    refresh,
    accountSearch,
    accountPage,
    calendar,
    asOf,
    session?.user.permissions,
    page,
  ]);
  async function run<T>(
    label: string,
    payload: unknown,
    work: (key: string) => Promise<T>,
    after?: (result: T) => void,
  ) {
    const fingerprint = JSON.stringify({ label, payload });
    if (retry.current.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await work(retry.current.key);
      after?.(result);
      retry.current = { fingerprint: "", key: "" };
      setMessage(label);
      setRefresh((v) => v + 1);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Budget operation failed.");
      throw caught;
    } finally {
      setBusy(false);
    }
  }
  const attempt = (work: Promise<unknown>) => {
    void work.catch(() => {});
  };
  const choose = (id: string) => {
    setSelected(id);
    setNewVersion(false);
    setOffset(0);
    setImportPreview(null);
    setComparison(null);
  };
  const openVersion = (version: BudgetVersion) => {
    choose(version.id);
    onNavigate("budget", "budget-entry", version.id);
  };
  const close = () => {
    if (!busy) setDialog(null);
  };
  const selectedPolicy =
    directory?.policies.find((p) => p.fiscal_calendar_id === (detail?.record.fiscal_calendar_id ?? calendar)) ?? null;
  const openGenerate = (
    kind: "revision" | "scenario" | "forecast",
    scenario: "best" | "expected" | "worst" = "expected",
  ) => {
    if (!detail) {
      setError("Select a source budget version first.");
      return;
    }
    setDialog(kind);
    setScenarioCase(scenario);
  };
  async function saveVersion(input: BudgetVersionInput, id?: string, version?: number) {
    await run(
      "Budget version saved",
      { input, id, version },
      (key) =>
        id && version
          ? api.updateBudgetVersion(id, { ...input, expected_version: version }, csrfToken(), key)
          : api.createBudgetVersion(input, csrfToken(), key),
      (result) => {
        setDetail(result);
        setSelected(result.record.id);
        setNewVersion(false);
        onNavigate("budget", "budget-entry", result.record.id);
      },
    );
  }
  function actVersion(action: "submit" | "approve" | "reject") {
    if (!detail) return;
    const input = {
      company_id: company,
      expected_version: detail.record.version,
      action,
      reason,
      ...(action === "submit" ? { approver_id: approver } : {}),
    };
    attempt(
      run(
        `Budget ${action === "submit" ? "submitted" : action === "approve" ? "approved" : "rejected"}`,
        input,
        (key) => api.actBudgetVersion(detail.record.id, input, csrfToken(), key),
        (result) => {
          setDetail(result);
          setReason("");
        },
      ),
    );
  }
  function request(input: BudgetRequestInput) {
    attempt(
      run(
        "Budget request submitted",
        input,
        (key) => api.createBudgetRequest(input, csrfToken(), key),
        () => setDialog(null),
      ),
    );
  }
  function decideRequest(record: BudgetRequest, action: "approve" | "reject") {
    const input = { company_id: company, expected_version: record.version, action, reason };
    attempt(
      run(
        `Request ${action === "approve" ? "approved" : "rejected"}`,
        { id: record.id, ...input },
        (key) => api.actBudgetRequest(record.id, input, csrfToken(), key),
        () => setReason(""),
      ),
    );
  }
  function exportFile(format: "xlsx" | "csv", allocations = false) {
    attempt(
      run(
        "Budget export ready",
        { format, allocations, query: q() },
        () => api.exportBudget(q({ format, allocations: String(allocations), offset: 0 })),
        (blob) => downloadBudgetFile(blob, `budget-${allocations ? "allocations" : "analysis"}.${format}`),
      ),
    );
  }
  async function openDrill(account: string, periodId: string) {
    const query = q({ account_id: account, period_id: periodId, offset: 0 });
    setDrillQuery(query);
    setDrillOffset(0);
    await run("Posted GL detail loaded", query, () => api.getBudgetDrill(query), setDrill);
  }
  const pagedTotal =
    page === "budget-models"
      ? (directory?.model_total ?? 0)
      : page === "commitment-control"
        ? (report?.commitment_total ?? 0)
        : ["budget-actual", "budget-availability", "planning-reports"].includes(page)
          ? (report?.total ?? 0)
          : (directory?.total ?? 0);
  if (!canRead)
    return (
      <section className={`${budgetPanel} p-6`}>
        <h1 className="text-xl font-semibold">Budget access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your administrator must grant company-scoped Budget access.
        </p>
      </section>
    );
  return (
    <div className="grid min-w-0 gap-4" aria-busy={busy || loading} data-budget-page={page}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{profile.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{profile.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeCompany?.name} · {options?.currency ?? "Company currency"} ·{" "}
            {selectedPolicy?.enabled
              ? `${selectedPolicy.mode} controls configured`
              : "Controls unconfigured or disabled"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => setRefresh((v) => v + 1)}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          {profile.analysis && can("budget.data.export") && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => exportFile("xlsx")}>
              <Download />
              Export XLSX
            </Button>
          )}
          {["planning-dashboard", "budget-entry"].includes(page) && can("budget.plan.create") && (
            <Button size="sm" onClick={() => setDialog("plan")} disabled={busy}>
              <Plus />
              New budget
            </Button>
          )}
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {message && (
        <p role="status" className="rounded-lg border border-border bg-accent p-3 text-sm">
          {message}
        </p>
      )}
      {!options || !directory ? (
        <div className={`${budgetPanel} p-8 text-sm text-muted-foreground`}>
          {loading ? "Loading company budgets…" : "No Budget data loaded. Refresh to retry."}
        </div>
      ) : (
        <>
          <section
            aria-label="Planning filters"
            className={`${budgetPanel} grid items-end gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4`}
          >
            {page !== "budget-models" && (
              <BudgetSelect
                label="Fiscal year"
                value={calendar}
                options={options.calendars}
                onChange={(value) => {
                  setCalendar(value);
                  choose("");
                  setPeriod("");
                }}
              />
            )}
            <BudgetSelect
              label={
                page === "scenarios" || page === "forecasts"
                  ? "Source / selected version"
                  : page === "budget-models"
                    ? "Apply model to draft"
                    : "Budget version"
              }
              value={selected}
              empty="Active control baseline"
              options={(detail && !versionChoices.some((v) => v.id === detail.record.id)
                ? [detail.record, ...versionChoices]
                : versionChoices
              ).map((v) => ({
                id: v.id,
                name: `${v.plan_code} · v${v.number} ${v.name} (${v.state})`,
              }))}
              onChange={choose}
            />
            {profile.period && (
              <BudgetSelect
                label="Fiscal period"
                value={period}
                options={options.periods
                  .filter((p) => p.fiscal_calendar_id === calendar)
                  .map((p) => ({ id: p.id, name: `P${p.number} · ${p.start.slice(0, 7)}` }))}
                onChange={(value) => {
                  setPeriod(value);
                  setOffset(0);
                }}
              />
            )}
            {profile.analysis && (
              <BudgetField label="Actuals / commitments as of">
                <Input
                  type="date"
                  value={asOf}
                  onChange={(e) => {
                    setAsOf(e.target.value);
                    setOffset(0);
                  }}
                />
              </BudgetField>
            )}
            {versionSearch && (
              <BudgetField
                label={page === "scenarios" ? "Find scenario" : page === "forecasts" ? "Find forecast" : "Find version"}
              >
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(0);
                  }}
                  placeholder="Name or budget code"
                />
              </BudgetField>
            )}
            {page === "budget-approval" && (
              <BudgetSelect
                label="Approval state"
                value={approvalState}
                onChange={(value) => {
                  setApprovalState(value);
                  setOffset(0);
                }}
                options={["draft", "submitted", "approved", "rejected"].map((state) => ({
                  id: state,
                  name: state.charAt(0).toUpperCase() + state.slice(1),
                }))}
                empty="All states"
              />
            )}
            {(profile.analysis || ["budget-entry", "budget-models"].includes(page)) && (
              <details className="sm:col-span-2 xl:col-span-4">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  {profile.analysis ? "Dimension filters & account lookup" : "Find allocation accounts"}
                </summary>
                <div className="mt-3 space-y-3">
                  {profile.analysis && (
                    <>
                      <BudgetDimensionsFields
                        options={options}
                        value={dimensions}
                        onChange={(value) => {
                          setDimensions(value);
                          setOffset(0);
                        }}
                      />
                      <BudgetSelect
                        label="Report account"
                        value={accountFilter}
                        options={options.accounts}
                        empty="All posting accounts"
                        onChange={(value) => {
                          setAccountFilter(value);
                          setOffset(0);
                        }}
                      />
                    </>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <BudgetField label="Find chart-of-accounts nominal">
                      <Input
                        value={accountSearch}
                        onChange={(e) => {
                          setAccountSearch(e.target.value);
                          setAccountPage(0);
                        }}
                        placeholder="Search account code or name"
                      />
                    </BudgetField>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={accountPage === 0}
                      onClick={() => setAccountPage((v) => Math.max(0, v - 100))}
                    >
                      Previous accounts
                    </Button>
                    <span className="pb-2 text-xs text-muted-foreground">
                      {options.accounts.length} of {options.account_total} matches
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={accountPage + 100 >= options.account_total}
                      onClick={() => setAccountPage((v) => v + 100)}
                    >
                      More accounts
                    </Button>
                  </div>
                </div>
              </details>
            )}
          </section>
          {report && profile.totals && (directory.plan_total > 0 || report.rows.length > 0) && (
            <BudgetTotals report={report} scale={options.decimal_places} page={page} />
          )}
          {profile.analysis &&
            report?.issues.map((issue) => (
              <p key={issue} className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
                {issue}
              </p>
            ))}
          {page === "planning-dashboard" && (
            <BudgetDashboard
              directory={directory}
              options={options}
              onOpen={(version) => onNavigate("budget", "budget-approval", version.id)}
              onNavigate={(target) => onNavigate("budget", target, selected || undefined)}
            />
          )}
          {page === "budget-entry" && (
            <>
              <div className="flex flex-wrap gap-2">
                {can("budget.plan.create") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      choose("");
                      setNewVersion(true);
                    }}
                  >
                    New version
                  </Button>
                )}
                {detail && can("budget.plan.create") && (
                  <Button variant="outline" size="sm" onClick={() => openGenerate("revision")}>
                    <GitBranch />
                    Create revision
                  </Button>
                )}
                {detail?.record.state === "approved" && can("budget.transfer.create") && (
                  <Button variant="outline" size="sm" onClick={() => setDialog("transfer")}>
                    <ArrowRightLeft />
                    Transfer budget
                  </Button>
                )}
                {detail?.record.state === "approved" && can("budget.policy.configure") && (
                  <Button variant="outline" size="sm" onClick={() => setDialog("policy")}>
                    <ShieldCheck />
                    Activate / configure controls
                  </Button>
                )}
              </div>
              {detail || newVersion || (!directory.versions.length && directory.plans.length > 0) ? (
                <BudgetEntry
                  key={detail ? `${detail.record.id}:${detail.record.version}` : "new"}
                  options={options}
                  directory={directory}
                  detail={newVersion ? null : detail}
                  company={company}
                  busy={busy}
                  canEdit={can(detail ? "budget.plan.update" : "budget.plan.create")}
                  onSave={saveVersion}
                />
              ) : directory.plans.length ? (
                <BudgetVersions
                  directory={directory}
                  busy={busy}
                  onOpen={openVersion}
                  title="Allocation workbooks"
                  empty="No allocation workbooks match this selection. Create a new version for an existing plan."
                />
              ) : (
                <BudgetStart
                  title="Build the first allocation workbook"
                  description="Create a budget plan to select its fiscal year. Then add account lines and allocate monthly, quarterly or annual amounts."
                  action="Create budget plan"
                  onAction={() => setDialog("plan")}
                  disabled={!can("budget.plan.create")}
                />
              )}
            </>
          )}
          {["scenarios", "forecasts"].includes(page) && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy || !detail || !can("budget.forecast.create")}
                  onClick={() => openGenerate(page === "scenarios" ? "scenario" : "forecast")}
                >
                  <Plus />
                  {page === "scenarios" ? "New scenario" : "Forecast / reforecast"}
                </Button>
                {detail && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate("budget", "budget-entry", detail.record.id)}
                  >
                    Edit manual allocations
                  </Button>
                )}
                <BudgetSelect
                  label="Compare with version"
                  value={comparison?.record.id ?? ""}
                  options={versionChoices
                    .filter((v) => v.id !== selected)
                    .map((v) => ({ id: v.id, name: `${v.plan_code} v${v.number} · ${v.name}` }))}
                  empty="Select comparison"
                  onChange={(id) => {
                    if (!id) {
                      setComparison(null);
                      return;
                    }
                    attempt(
                      run(
                        "Comparison loaded",
                        id,
                        () => api.getBudgetVersion(id, `?company_id=${encodeURIComponent(company)}`),
                        setComparison,
                      ),
                    );
                  }}
                />
              </div>
              {page === "scenarios" && (
                <BudgetScenarios
                  versions={directory.versions}
                  selected={selected}
                  busy={busy}
                  canCreate={!!detail && can("budget.forecast.create")}
                  onOpen={(version) => choose(version.id)}
                  onCreate={(scenario) => openGenerate("scenario", scenario)}
                />
              )}
              {detail && (
                <section className={`${budgetPanel} p-4`}>
                  <h2 className="font-semibold">
                    {detail.record.kind === (page === "scenarios" ? "scenario" : "forecast")
                      ? "Selected " + (page === "scenarios" ? "scenario" : "forecast")
                      : "Source budget"}{" "}
                    · {detail.record.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.record.kind} · {detail.record.assumptions.case ?? "expected"} case ·{" "}
                    {detail.record.assumptions.method ?? "manual"} · Growth{" "}
                    {detail.record.assumptions.growth_percent ?? "0"}%
                    {detail.record.cutoff ? ` · Actuals cutoff ${detail.record.cutoff}` : ""}
                  </p>
                  <p className="mt-2 text-sm">
                    Version total:{" "}
                    <strong>
                      {budgetDisplay(detail.record.total, options.decimal_places)} {options.currency}
                    </strong>
                  </p>
                  {detail.record.kind === "forecast" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Estimates at completion use actual periods through the recorded cutoff and forecast allocations
                      after it. Commitments remain a separate exposure measure.
                    </p>
                  )}
                  {detail.forecast_summary && (
                    <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
                      {(
                        [
                          ["Actual through cutoff", detail.forecast_summary.actual],
                          ["Remaining forecast", detail.forecast_summary.remaining],
                          ["Estimate at completion", detail.forecast_summary.eac],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label}>
                          <span className="text-xs text-muted-foreground">{label}</span>
                          <strong className="block tabular-nums">
                            {budgetDisplay(value, options.decimal_places)} {options.currency}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {detail && comparison && (
                <BudgetComparison left={detail} right={comparison} scale={options.decimal_places} />
              )}
              {page === "forecasts" && (
                <BudgetForecasts versions={directory.versions} busy={busy} onOpen={(version) => choose(version.id)} />
              )}
            </>
          )}
          {page === "budget-models" && (
            <>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!can("budget.model.manage") || busy}
                  onClick={() => {
                    setEditingModel(null);
                    setDialog("model");
                  }}
                >
                  New model
                </Button>
              </div>
              <section className={`${budgetPanel} overflow-x-auto`}>
                <h2 className="border-b border-border px-4 py-3 font-semibold">Reusable allocation models</h2>
                <WorkTable tableId="budget-models" paging={false} tools={false} className="w-full">
                  <thead>
                    <tr>
                      {["Model", "Name", "Accounts", "Status", "Actions"].map((h) => (
                        <th key={h} className={budgetHead}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {directory.models.map((model) => (
                      <tr key={model.id}>
                        <td className={budgetCell}>{model.code}</td>
                        <td className={budgetCell}>{model.name}</td>
                        <td className={budgetCell}>{model.lines.length}</td>
                        <td className={budgetCell}>{model.active ? "Active" : "Archived"}</td>
                        <td className={`${budgetCell} flex gap-2`}>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!can("budget.model.manage")}
                            onClick={() => {
                              setEditingModel(model);
                              setDialog("model");
                            }}
                          >
                            Edit / archive
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              busy ||
                              !model.active ||
                              !detail ||
                              !["draft", "rejected"].includes(detail.record.state) ||
                              !can("budget.plan.update")
                            }
                            onClick={() => {
                              if (!detail) return;
                              const input = {
                                company_id: company,
                                model_id: model.id,
                                version_id: detail.record.id,
                                expected_version: detail.record.version,
                                reason,
                              };
                              attempt(
                                run(
                                  "Model applied to draft",
                                  input,
                                  (key) => api.applyBudgetModel(input, csrfToken(), key),
                                  setDetail,
                                ),
                              );
                            }}
                          >
                            Apply to selected draft
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!directory.models.length && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No budget models. Create a model to reuse account allocations.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </WorkTable>
              </section>
              <BudgetField label="Model application reason">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              </BudgetField>
            </>
          )}
          {page === "budget-import" && (
            <section className={`${budgetPanel} grid gap-4 p-4`}>
              <div>
                <h2 className="font-semibold">Validate, preview, commit</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Imports replace the selected draft’s allocations atomically. Use account and dimension codes from this
                  company. Excel formulas are rejected.
                </p>
              </div>
              <ol aria-label="Import progress" className="grid gap-3 border-y border-border py-3 sm:grid-cols-3">
                <li className="text-sm">
                  <strong>Upload allocations</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {importFile?.name ?? "Choose an XLSX or CSV file"}
                  </p>
                </li>
                <li className="text-sm">
                  <strong>Validate preview</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {importPreview
                      ? `${importPreview.lines.length} account lines · ${importPreview.errors.length} row errors`
                      : "Review every row before replacement"}
                  </p>
                </li>
                <li className="text-sm">
                  <strong>Commit to draft</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {importPreview?.state === "committed"
                      ? "Allocations committed"
                      : detail
                        ? `${detail.record.plan_code} / v${detail.record.number} · ${detail.record.state}`
                        : "Select a working draft"}
                  </p>
                </li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!can("budget.data.export") || busy}
                  onClick={() =>
                    attempt(
                      run(
                        "Template downloaded",
                        company,
                        () => api.downloadBudgetTemplate(company),
                        (blob) => downloadBudgetFile(blob, "budget-template.xlsx"),
                      ),
                    )
                  }
                >
                  <FileSpreadsheet />
                  Download XLSX template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!detail || !can("budget.data.export") || busy}
                  onClick={() => exportFile("xlsx", true)}
                >
                  Export selected allocations
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!detail || !can("budget.data.export") || busy}
                  onClick={() => exportFile("csv", true)}
                >
                  Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!detail}
                  onClick={() => onNavigate("budget", "budget-entry", detail?.record.id)}
                >
                  Open allocation spreading
                </Button>
              </div>
              <BudgetField label="Budget allocation file">
                <Input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] ?? null);
                    setImportPreview(null);
                  }}
                />
              </BudgetField>
              <Button
                className="justify-self-start"
                size="sm"
                disabled={busy || !importFile || !detail || !can("budget.data.create")}
                onClick={() => {
                  if (!importFile || !detail) return;
                  attempt(
                    run(
                      "Import preview validated",
                      {
                        id: detail.record.id,
                        file: importFile.name,
                        size: importFile.size,
                        modified: importFile.lastModified,
                        version: detail.record.version,
                      },
                      (key) =>
                        api.previewBudgetImport(
                          company,
                          detail.record.id,
                          detail.record.version,
                          importFile,
                          csrfToken(),
                          key,
                        ),
                      setImportPreview,
                    ),
                  );
                }}
              >
                <Upload />
                Validate file
              </Button>
              {importPreview && (
                <>
                  <div role="status" className="rounded-lg bg-muted p-3 text-sm">
                    {importPreview.lines.length} account lines · {importPreview.errors.length} errors · target revision{" "}
                    {importPreview.target_version}
                  </div>
                  {importPreview.errors.map((issue, index) => (
                    <p key={index} className="text-sm text-destructive">
                      Row {issue.row}: {issue.message}
                    </p>
                  ))}
                  {importPreview.lines.slice(0, 20).map((line, index) => (
                    <p key={index} className="text-xs text-muted-foreground">
                      {options.accounts.find((a) => a.id === line.account_id)?.code ?? line.account_id} ·{" "}
                      {line.allocations.length} fiscal allocations
                    </p>
                  ))}
                  <BudgetField label="Import reason">
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                  </BudgetField>
                  <Button
                    className="justify-self-start"
                    disabled={busy || !!importPreview.errors.length || importPreview.state === "committed"}
                    onClick={() => {
                      const input = { company_id: company, expected_version: importPreview.version, reason };
                      attempt(
                        run(
                          "Imported allocations committed",
                          { id: importPreview.id, ...input },
                          (key) => api.commitBudgetImport(importPreview.id, input, csrfToken(), key),
                          (result) => {
                            setDetail(result);
                            setImportPreview(null);
                          },
                        ),
                      );
                    }}
                  >
                    Confirm replacement and commit
                  </Button>
                </>
              )}
            </section>
          )}
          {page === "budget-approval" && (
            <>
              <BudgetVersions
                directory={directory}
                busy={busy}
                onOpen={(v) => choose(v.id)}
                title="Version approval queue"
                empty="No versions await review in this selection. Submit an allocation workbook to start its approval history."
              />
              <section className={`${budgetPanel} grid gap-3 p-4`}>
                <h2 className="font-semibold">Selected version decision</h2>
                {detail ? (
                  <>
                    <p className="text-sm">
                      {detail.record.plan_code} / v{detail.record.number} · {detail.record.name}{" "}
                      <Badge variant="secondary">{detail.record.state}</Badge>
                    </p>
                    <BudgetField label="Decision / submission reason">
                      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                    </BudgetField>
                    {["draft", "rejected"].includes(detail.record.state) ? (
                      <>
                        <BudgetSelect
                          label="Independent approver"
                          value={approver}
                          options={options.approvers.filter((a) => a.id !== session?.user.id)}
                          empty="Select reviewer"
                          onChange={setApprover}
                        />
                        <Button
                          className="justify-self-start"
                          disabled={busy || !can("budget.plan.submit")}
                          onClick={() => actVersion("submit")}
                        >
                          Submit for approval
                        </Button>
                      </>
                    ) : detail.record.state === "submitted" ? (
                      <div className="flex gap-2">
                        <Button disabled={busy || !can("budget.plan.approve")} onClick={() => actVersion("approve")}>
                          Approve version
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={busy || !can("budget.plan.approve")}
                          onClick={() => actVersion("reject")}
                        >
                          Reject version
                        </Button>
                      </div>
                    ) : (
                      <Button
                        className="justify-self-start"
                        size="sm"
                        variant="outline"
                        disabled={!can("budget.plan.create")}
                        onClick={() => openGenerate("revision")}
                      >
                        Create controlled revision
                      </Button>
                    )}
                    <BudgetHistory detail={detail} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a budget version to review its allocations and approval history.
                  </p>
                )}
              </section>
              <section className={`${budgetPanel} overflow-x-auto`}>
                <h2 className="p-4 font-semibold">Transfers, exceptions & commitment closure</h2>
                <WorkTable tableId="budget-requests" tools={false} paging={false} className="w-full">
                  <thead>
                    <tr>
                      {["Request", "Type", "Reason", "State", "Decision"].map((h) => (
                        <th className={budgetHead} key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {directory.requests.map((r) => (
                      <tr key={r.id}>
                        <td className={budgetCell}>{r.code}</td>
                        <td className={budgetCell}>{r.kind}</td>
                        <td className={budgetCell}>{r.reason}</td>
                        <td className={budgetCell}>{r.state}</td>
                        <td className={budgetCell}>
                          {r.state === "submitted" &&
                            can(
                              r.kind === "transfer"
                                ? "budget.transfer.approve"
                                : r.kind === "exception"
                                  ? "budget.exception.approve"
                                  : "budget.commitment.close",
                            ) && (
                              <div className="flex gap-2">
                                <Button size="sm" disabled={busy} onClick={() => decideRequest(r, "approve")}>
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={busy}
                                  onClick={() => decideRequest(r, "reject")}
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                        </td>
                      </tr>
                    ))}
                    {!directory.requests.length && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground">
                          No Budget requests.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </WorkTable>
                <BudgetPager offset={offset} total={directory.request_total} busy={loading} onChange={setOffset} />
              </section>
            </>
          )}
          {page === "commitment-control" && (
            <>
              <h2 className="text-base font-semibold">Purchase reservation ledger</h2>
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !can("budget.policy.configure")}
                  onClick={() =>
                    attempt(
                      run("Purchase commitments reconciled", { company, reason }, (key) =>
                        api.reconcileBudgetPurchases(company, reason, csrfToken(), key),
                      ),
                    )
                  }
                >
                  Reconcile existing approved purchases
                </Button>
                <BudgetField label="Find purchase source">
                  <Input
                    value={sourceCode}
                    onChange={(e) => setSourceCode(e.target.value)}
                    placeholder="Order code or supplier invoice reference"
                  />
                </BudgetField>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    attempt(
                      run(
                        "Purchase sources loaded",
                        sourceCode,
                        () => api.getBudgetSources(q({ search: sourceCode, offset: 0 })),
                        setSourceDirectory,
                      ),
                    )
                  }
                >
                  Find sources
                </Button>
                {sourceDirectory && (
                  <BudgetSelect
                    label="Purchase source"
                    value={sourceChoice}
                    empty="Select order or bill"
                    options={sourceDirectory.items.map((s) => ({
                      id: s.id,
                      name: `${s.code} · ${s.kind} · ${s.state} · ${s.currency} ${s.amount}`,
                    }))}
                    onChange={setSourceChoice}
                  />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!sourceChoice || busy}
                  onClick={() =>
                    attempt(
                      run(
                        "Purchase controls loaded",
                        sourceChoice,
                        () => api.getBudgetSourceControl(sourceChoice, `?company_id=${encodeURIComponent(company)}`),
                        (result) => {
                          setSource(result);
                          setDialog("exception");
                        },
                      ),
                    )
                  }
                >
                  Request exception
                </Button>
              </div>
              <BudgetField label="Reconciliation / closure reason">
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </BudgetField>
              {report && (
                <section className={`${budgetPanel} overflow-x-auto`}>
                  <WorkTable tableId="budget-commitments" tools={false} paging={false} className="w-full">
                    <thead>
                      <tr>
                        {["Purchase source", "Account", "Approved", "Consumed", "Open commitment", "Actions"].map(
                          (h) => (
                            <th key={h} className={budgetHead}>
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {report.commitments.map((c) => (
                        <tr key={c.id}>
                          <td className={budgetCell}>
                            <button
                              className="text-primary underline-offset-2 hover:underline"
                              onClick={() => onNavigate("purchases", "purchase-orders", c.source_document_id)}
                            >
                              {c.source_code}
                            </button>
                            <small className="block text-muted-foreground">
                              {c.commitment_date} · {c.currency} @ {c.rate}
                            </small>
                          </td>
                          <td className={budgetCell}>
                            {c.account_code} · {c.account_name}
                          </td>
                          <td className={`${budgetCell} tabular-nums`}>
                            {budgetDisplay(c.reserved, options.decimal_places)}
                          </td>
                          <td className={`${budgetCell} tabular-nums`}>
                            {budgetDisplay(c.consumed, options.decimal_places)}
                          </td>
                          <td className={`${budgetCell} tabular-nums`}>
                            {budgetDisplay(c.remaining, options.decimal_places)}
                          </td>
                          <td className={budgetCell}>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || !can("budget.plan.submit") || decimal(c.remaining, 8, true) <= 0n}
                              onClick={() =>
                                request({
                                  company_id: company,
                                  request: {
                                    kind: "closure",
                                    commitment_id: c.id,
                                    effective_date: new Date().toLocaleDateString("en-CA"),
                                  },
                                  reason,
                                })
                              }
                            >
                              Request closure
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!report.commitments.length && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted-foreground">
                            No approved purchase commitments in this scope.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </WorkTable>
                </section>
              )}
            </>
          )}
          {page === "budget-availability" && report && (
            <BudgetAvailability
              report={report}
              busy={busy}
              onDrill={(account, periodId) => attempt(openDrill(account, periodId))}
            />
          )}
          {page === "budget-actual" &&
            (report ? (
              <>
                <h2 className="text-base font-semibold">Account variance analysis</h2>
                <BudgetAnalysis
                  report={report}
                  scale={options.decimal_places}
                  busy={busy}
                  onDrill={(account, periodId) => attempt(openDrill(account, periodId))}
                  onComment={(account, periodId) => {
                    setComment({ account, period: periodId });
                    setCommentText("");
                  }}
                  canComment={can("budget.plan.update") && !!selected}
                />
                {detail && <BudgetHistory detail={detail} />}
              </>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Company Budget report permission is required.</p>
            ))}
          {page === "planning-reports" && (
            <>
              <BudgetReportCatalogue onNavigate={(target) => onNavigate("budget", target, selected || undefined)} />
              <section className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <div>
                  <h2 className="font-semibold">Export the current analysis</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Exports use the selected company, budget version, period and dimensions.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportFile("csv")}
                    disabled={!can("budget.data.export") || busy}
                  >
                    Export filtered CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer />
                    Print report
                  </Button>
                </div>
              </section>
            </>
          )}
          {!["budget-entry", "budget-import", "budget-approval", "planning-dashboard", "planning-reports"].includes(
            page,
          ) && <BudgetPager offset={offset} total={pagedTotal} busy={loading} onChange={setOffset} />}
        </>
      )}
      {options && dialog === "plan" && (
        <NewBudgetDialog
          options={options}
          company={company}
          busy={busy}
          onClose={close}
          onSave={(input) =>
            attempt(
              run(
                "Budget plan created",
                input,
                (key) => api.createBudgetPlan(input, csrfToken(), key),
                (plan) => {
                  setDirectory((current) => (current ? { ...current, plans: [plan, ...current.plans] } : current));
                  setDialog(null);
                  choose("");
                  setNewVersion(true);
                  onNavigate("budget", "budget-entry");
                },
              ),
            )
          }
        />
      )}
      {detail && ["revision", "scenario", "forecast"].includes(dialog ?? "") && (
        <GenerateBudgetDialog
          detail={detail}
          kind={dialog as "revision" | "scenario" | "forecast"}
          initialCase={scenarioCase}
          company={company}
          busy={busy}
          onClose={close}
          onSave={(input) =>
            attempt(
              run(
                "Budget draft generated",
                input,
                (key) => api.generateBudgetVersion(input, csrfToken(), key),
                (result) => {
                  setDialog(null);
                  setDetail(result);
                  setSelected(result.record.id);
                  onNavigate("budget", "budget-entry", result.record.id);
                },
              ),
            )
          }
        />
      )}
      {detail && dialog === "policy" && (
        <BudgetPolicyDialog
          detail={detail}
          policy={selectedPolicy}
          company={company}
          busy={busy}
          onClose={close}
          onSave={(input) =>
            attempt(
              run(
                "Budget control policy saved",
                input,
                (key) => api.saveBudgetPolicy(input, csrfToken(), key),
                () => setDialog(null),
              ),
            )
          }
        />
      )}
      {detail && options && dialog === "transfer" && (
        <BudgetTransferDialog
          detail={detail}
          options={options}
          company={company}
          busy={busy}
          onClose={close}
          onSave={request}
        />
      )}
      {options && dialog === "model" && (
        <BudgetModelDialog
          options={options}
          model={editingModel}
          company={company}
          busy={busy}
          onClose={close}
          onSave={(input, id) =>
            attempt(
              run(
                "Budget model saved",
                { id, input },
                (key) =>
                  id
                    ? api.updateBudgetModel(id, input, csrfToken(), key)
                    : api.createBudgetModel(input, csrfToken(), key),
                () => setDialog(null),
              ),
            )
          }
        />
      )}
      {source && dialog === "exception" && (
        <BudgetExceptionDialog source={source} company={company} busy={busy} onClose={close} onSave={request} />
      )}
      {drill && (
        <BudgetDialog
          title="Posted GL movements"
          description="Posted journals and dated reversals underlying this account and fiscal period."
          onClose={() => setDrill(null)}
        >
          <div className="overflow-x-auto">
            <WorkTable tableId="budget-gl-drill" tools={false} paging={false} className="w-full">
              <thead>
                <tr>
                  {["Date", "Journal", "Debit", "Credit"].map((h) => (
                    <th key={h} className={budgetHead}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drill.rows.map((r) => (
                  <tr key={r.id}>
                    <td className={budgetCell}>{r.date}</td>
                    <td className={budgetCell}>
                      <button
                        className="text-primary hover:underline"
                        onClick={() => onNavigate("finance", "journal-detail", r.journal_id)}
                      >
                        {r.entry_number}
                      </button>
                    </td>
                    <td className={budgetCell}>{budgetDisplay(r.debit, options?.decimal_places)}</td>
                    <td className={budgetCell}>{budgetDisplay(r.credit, options?.decimal_places)}</td>
                  </tr>
                ))}
              </tbody>
            </WorkTable>
          </div>
          <BudgetPager
            offset={drillOffset}
            total={drill.total}
            onChange={(value) => {
              setDrillOffset(value);
              const params = new URLSearchParams(drillQuery);
              params.set("offset", String(value));
              attempt(run("Posted GL detail loaded", value, () => api.getBudgetDrill(`?${params}`), setDrill));
            }}
          />
        </BudgetDialog>
      )}
      {comment && (
        <BudgetDialog
          title="Variance commentary"
          description="Saved with the selected version, account, period and your identity."
          onClose={() => setComment(null)}
        >
          <BudgetField label="Comment">
            <Textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} />
          </BudgetField>
          <Button
            disabled={busy || commentText.trim().length < 3}
            onClick={() => {
              const input = {
                company_id: company,
                version_id: selected,
                account_id: comment.account,
                period_id: comment.period,
                comment: commentText,
              };
              attempt(
                run(
                  "Variance comment saved",
                  input,
                  (key) => api.createBudgetComment(input, csrfToken(), key),
                  () => setComment(null),
                ),
              );
            }}
          >
            Save commentary
          </Button>
        </BudgetDialog>
      )}
    </div>
  );
}
function BudgetVersions({
  directory,
  busy,
  onOpen,
  title,
  empty,
}: {
  directory: BudgetDirectory;
  busy: boolean;
  onOpen: (version: BudgetVersion) => void;
  title: string;
  empty: string;
}) {
  return (
    <section className={`${budgetPanel} overflow-x-auto`}>
      <h2 className="border-b border-border px-4 py-3 font-semibold">{title}</h2>
      <WorkTable tableId="budget-version-directory" tools={false} paging={false} className="w-full">
        <thead>
          <tr>
            {["Budget", "Version", "Purpose", "State", "Total", "Action"].map((h) => (
              <th key={h} className={budgetHead}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {directory.versions.map((v) => (
            <tr key={v.id}>
              <td className={budgetCell}>
                <strong>{v.plan_code}</strong>
                <small className="block text-muted-foreground">{v.plan_name}</small>
              </td>
              <td className={budgetCell}>
                v{v.number} · {v.name}
              </td>
              <td className={budgetCell}>{v.kind}</td>
              <td className={budgetCell}>
                <Badge variant="secondary">{v.state}</Badge>
              </td>
              <td className={`${budgetCell} text-right tabular-nums`}>
                {budgetDisplay(v.total)} {v.currency}
              </td>
              <td className={budgetCell}>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpen(v)}>
                  Open version
                </Button>
              </td>
            </tr>
          ))}
          {!directory.versions.length && (
            <tr>
              <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </WorkTable>
    </section>
  );
}
function BudgetAnalysis({
  report,
  scale,
  busy,
  onDrill,
  onComment,
  canComment,
}: {
  report: BudgetReport;
  scale: number;
  busy: boolean;
  onDrill: (account: string, period: string) => void;
  onComment: (account: string, period: string) => void;
  canComment: boolean;
}) {
  return (
    <section className={`${budgetPanel} overflow-x-auto`}>
      <WorkTable tableId="budget-variance-analysis" tools={false} paging={false} className="w-full">
        <caption className="sr-only">Posted actuals and account-sensitive budget variance · {report.currency}</caption>
        <thead>
          <tr>
            {[
              "Account / fiscal period",
              "Budget + transfers",
              "Posted actual",
              "Variance",
              "Variance %",
              "Comment",
            ].map((h) => (
              <th key={h} className={`${budgetHead} whitespace-nowrap`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => {
            return (
              <tr key={r.id}>
                <td className={budgetCell}>
                  <strong className="whitespace-nowrap">
                    {r.account_code} · {r.account_name}
                  </strong>
                  <small className="block text-muted-foreground">
                    {r.period_start.slice(0, 7)} ·{" "}
                    {Object.entries(r.dimensions)
                      .map(([key, v]) => `${key}: ${v}`)
                      .join(" / ") || "Unrestricted pool"}
                  </small>
                  {r.unbudgeted && <Badge variant="secondary">Unbudgeted</Badge>}
                </td>
                <td className={`${budgetCell} text-right tabular-nums`}>
                  {budgetDisplay(decimalText(decimal(r.budget, 8, true) + decimal(r.transfers, 8, true), 8), scale)}
                </td>
                <td className={`${budgetCell} text-right tabular-nums`}>
                  <button
                    className="text-primary underline-offset-2 hover:underline"
                    disabled={busy}
                    onClick={() => onDrill(r.account_id, r.period_id)}
                  >
                    {budgetDisplay(r.actual, scale)}
                  </button>
                </td>
                <td className={`${budgetCell} text-right tabular-nums`}>
                  <span className={r.favorable ? "" : "text-destructive"}>{budgetDisplay(r.variance, scale)}</span>
                  <small className="block text-muted-foreground">{r.favorable ? "Favorable" : "Unfavorable"}</small>
                </td>
                <td className={`${budgetCell} text-right tabular-nums`}>
                  {r.variance_percent === null ? "No budget basis" : `${r.variance_percent}%`}
                </td>
                <td className={budgetCell}>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || !canComment}
                    onClick={() => onComment(r.account_id, r.period_id)}
                  >
                    Comment
                  </Button>
                </td>
              </tr>
            );
          })}
          {!report.rows.length && (
            <tr>
              <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                No budget allocations, posted actuals or commitments match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </WorkTable>
    </section>
  );
}
function BudgetHistory({ detail }: { detail: BudgetDetail }) {
  return (
    <details className={`${budgetPanel} p-3`}>
      <summary className="cursor-pointer text-sm font-semibold">
        Approval, change history & commentary (
        {detail.approvals.length + detail.history.length + detail.comments.length})
      </summary>
      <div className="mt-3 grid gap-2">
        {detail.comments.map((c) => (
          <p key={c.id} className="border-l-2 border-primary pl-3 text-xs">
            <strong>Variance commentary</strong> · {c.actor_id} · {c.occurred_at}
            <span className="block text-muted-foreground">{c.comment}</span>
          </p>
        ))}
        {detail.approvals.map((a, i) => (
          <p key={`approval-${i}`} className="border-l-2 border-primary pl-3 text-xs">
            <strong>{a.action}</strong> · {a.actor_id} · {a.acted_at}
            <span className="block text-muted-foreground">{a.comments}</span>
          </p>
        ))}
        {detail.history.map((a) => (
          <p key={a.id} className="border-l-2 border-border pl-3 text-xs">
            <strong>
              Revision {a.record_version} · {a.action}
            </strong>{" "}
            · {a.actor_id}
            <span className="block text-muted-foreground">
              {a.reason} · {a.occurred_at}
            </span>
          </p>
        ))}
      </div>
    </details>
  );
}
function BudgetComparison({ left, right, scale }: { left: BudgetDetail; right: BudgetDetail; scale: number }) {
  const rows = new Map<string, { account: string; left: bigint; right: bigint }>();
  for (const [side, detail] of [
    ["left", left],
    ["right", right],
  ] as const)
    for (const line of detail.lines) {
      const key = `${line.account_id}:${budgetDimensionKey(line.dimensions)}`;
      const row = rows.get(key) ?? { account: `${line.account_code} ${line.account_name}`, left: 0n, right: 0n };
      row[side] += line.allocations.reduce((sum, a) => sum + decimal(a.amount, 8), 0n);
      rows.set(key, row);
    }
  return (
    <section className={`${budgetPanel} overflow-x-auto`}>
      <WorkTable tableId="budget-version-comparison" tools={false} paging={false} className="w-full">
        <thead>
          <tr>
            {["Account / pool", left.record.name, right.record.name, "Difference"].map((h, i) => (
              <th key={i} className={budgetHead}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows.entries()].map(([id, r]) => (
            <tr key={id}>
              <td className={budgetCell}>{r.account}</td>
              <td className={`${budgetCell} text-right`}>{budgetDisplay(decimalText(r.left, 8), scale)}</td>
              <td className={`${budgetCell} text-right`}>{budgetDisplay(decimalText(r.right, 8), scale)}</td>
              <td className={`${budgetCell} text-right`}>{budgetDisplay(decimalText(r.left - r.right, 8), scale)}</td>
            </tr>
          ))}
        </tbody>
      </WorkTable>
    </section>
  );
}
