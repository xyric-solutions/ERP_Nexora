"use client";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkTable } from "@/shared/ui/work-table";
import {
  decimal,
  decimalText,
  type BudgetDirectory,
  type BudgetOptions,
  type BudgetReport,
  type BudgetVersion,
} from "@nexora/contracts";
import { budgetCell, budgetDisplay, budgetHead, budgetPanel } from "./budget-controls";

export function BudgetStart({
  title,
  description,
  action,
  onAction,
  disabled = false,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="grid justify-items-start gap-3 border border-dashed border-border bg-muted/30 p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      <Button size="sm" variant="outline" onClick={onAction} disabled={disabled}>
        {action}
        <ArrowRight />
      </Button>
    </section>
  );
}

export function BudgetTotals({ report, scale, page }: { report: BudgetReport; scale: number; page: string }) {
  const amount = (key: keyof BudgetReport["totals"]) => report.totals[key];
  const variance = decimalText(
    decimal(amount("budget"), 8, true) + decimal(amount("transfers"), 8, true) - decimal(amount("actual"), 8, true),
    8,
  );
  const items =
    page === "budget-actual"
      ? [
          [
            "Budget including transfers",
            decimalText(decimal(amount("budget"), 8, true) + decimal(amount("transfers"), 8, true), 8),
          ],
          ["Posted actuals", amount("actual")],
          ["Expense budget variance", variance],
        ]
      : page === "budget-availability"
        ? [
            ["Available to spend", amount("available")],
            ["Open commitments", amount("commitment")],
            ["Posted actuals", amount("actual")],
          ]
        : [
            ["Budget allocation", amount("budget")],
            ["Posted actuals", amount("actual")],
            ["Open commitments", amount("commitment")],
            ["Available budget", amount("available")],
          ];
  return (
    <dl
      aria-label={
        page === "budget-actual"
          ? "Variance summary"
          : page === "budget-availability"
            ? "Availability summary"
            : "Planning overview"
      }
      className="flex flex-wrap divide-x divide-border border-y border-border py-3"
    >
      {items.map(([label, value]) => (
        <div key={label} className="min-w-40 flex-1 px-4 py-1 first:pl-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd
            className={`mt-1 text-xl font-semibold tabular-nums ${decimal(value!, 8, true) < 0n ? "text-destructive" : ""}`}
          >
            {budgetDisplay(value!, scale)}{" "}
            <span className="text-xs font-normal text-muted-foreground">{report.currency}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function BudgetDashboard({
  directory,
  options,
  onOpen,
  onNavigate,
}: {
  directory: BudgetDirectory;
  options: BudgetOptions;
  onOpen: (version: BudgetVersion) => void;
  onNavigate: (page: string) => void;
}) {
  const pending = directory.versions.filter((v) => v.state === "submitted");
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)]">
      <section className={budgetPanel}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">Planning cycle</h2>
          <span className="text-xs text-muted-foreground">{directory.plan_total} budget plans</span>
        </div>
        {!directory.plans.length ? (
          <BudgetStart
            title="Start the first planning cycle"
            description="Create a company budget plan, build its allocations, and send the version for independent review."
            action="Open budget entry"
            onAction={() => onNavigate("budget-entry")}
          />
        ) : (
          <ul className="divide-y divide-border">
            {directory.plans.map((plan) => (
              <li key={plan.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <strong className="block text-sm">{plan.name}</strong>
                  <span className="text-xs text-muted-foreground">
                    {plan.code} ·{" "}
                    {options.calendars.find((c) => c.id === plan.fiscal_calendar_id)?.name ?? plan.fiscal_calendar_id}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onNavigate("budget-entry")}>
                  Allocations
                  <ArrowRight />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>{options.calendars.length} fiscal years</span>
          <span>{options.account_total} posting accounts</span>
          <span>{directory.model_total} reusable models</span>
        </div>
      </section>
      <section className={budgetPanel}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">Decisions awaiting review</h2>
          <Button size="sm" variant="ghost" onClick={() => onNavigate("budget-approval")}>
            Review queue
            <ArrowRight />
          </Button>
        </div>
        {pending.length ? (
          <ul className="divide-y divide-border">
            {pending.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.plan_code} / v{v.number}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onOpen(v)}>
                  Review
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            No submitted versions in the current selection. Drafts stay editable until submitted.
          </p>
        )}
        <div className="grid gap-2 border-t border-border p-4">
          <Button variant="outline" className="justify-between" onClick={() => onNavigate("budget-actual")}>
            Investigate spending variances
            <ArrowRight />
          </Button>
          <Button variant="outline" className="justify-between" onClick={() => onNavigate("commitment-control")}>
            Review purchasing exposure
            <ArrowRight />
          </Button>
        </div>
      </section>
    </div>
  );
}

export function BudgetScenarios({
  versions,
  selected,
  busy,
  canCreate,
  onOpen,
  onCreate,
}: {
  versions: BudgetVersion[];
  selected: string;
  busy: boolean;
  canCreate: boolean;
  onOpen: (version: BudgetVersion) => void;
  onCreate: (scenario: "best" | "expected" | "worst") => void;
}) {
  const cases = [
    ["best", "Best case", "Upside assumptions"],
    ["expected", "Expected case", "Working planning assumptions"],
    ["worst", "Worst case", "Downside assumptions"],
  ] as const;
  return (
    <section aria-label="Scenario comparison board" className="grid gap-4 lg:grid-cols-3">
      {cases.map(([kind, title, description]) => {
        const records = versions.filter((v) => v.kind === "scenario" && (v.assumptions.case ?? "expected") === kind);
        return (
          <section key={kind} className="min-w-0 border-t-2 border-border">
            <div className="flex items-start justify-between gap-2 py-3">
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </div>
              <Button
                aria-label={`Create ${kind} case`}
                size="icon"
                variant="ghost"
                disabled={busy || !canCreate}
                onClick={() => onCreate(kind)}
              >
                <Plus />
              </Button>
            </div>
            <div className="grid gap-2">
              {records.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={busy}
                  aria-pressed={selected === v.id}
                  onClick={() => onOpen(v)}
                  className={`grid gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring ${selected === v.id ? "border-primary bg-muted" : "border-border bg-card"}`}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm">{v.name}</strong>
                    <Badge variant="secondary">{v.state}</Badge>
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {budgetDisplay(v.total)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">{v.currency}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {v.plan_code} / v{v.number} · {v.assumptions.method ?? "manual"} ·{" "}
                    {v.assumptions.growth_percent ?? "0"}% growth
                  </span>
                </button>
              ))}
            </div>
            {!records.length && (
              <div className="border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No {kind}-case version in this selection. Choose a source version to create one.
              </div>
            )}
          </section>
        );
      })}
    </section>
  );
}

export function BudgetForecasts({
  versions,
  busy,
  onOpen,
}: {
  versions: BudgetVersion[];
  busy: boolean;
  onOpen: (version: BudgetVersion) => void;
}) {
  return (
    <section className={`${budgetPanel} overflow-x-auto`}>
      <h2 className="border-b border-border px-4 py-3 font-semibold">Forecast register</h2>
      <WorkTable tableId="budget-forecasts" tools={false} paging={false} className="w-full">
        <thead>
          <tr>
            {["Forecast", "Method", "Actuals cutoff", "Horizon", "State", "Forecast total", ""].map((h) => (
              <th key={h} className={budgetHead}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {versions
            .filter((v) => v.kind === "forecast")
            .map((v) => (
              <tr key={v.id}>
                <td className={budgetCell}>
                  <strong>{v.name}</strong>
                  <small className="block text-muted-foreground">
                    {v.plan_code} / v{v.number}
                  </small>
                </td>
                <td className={budgetCell}>{v.assumptions.method ?? "manual"}</td>
                <td className={budgetCell}>{v.cutoff ?? "Future allocations only"}</td>
                <td className={budgetCell}>
                  {v.assumptions.horizon ? `${v.assumptions.horizon} periods` : "Source fiscal year"}
                </td>
                <td className={budgetCell}>
                  <Badge variant="secondary">{v.state}</Badge>
                </td>
                <td className={`${budgetCell} text-right tabular-nums`}>
                  {budgetDisplay(v.total)} {v.currency}
                </td>
                <td className={budgetCell}>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpen(v)}>
                    Review forecast
                  </Button>
                </td>
              </tr>
            ))}
          {!versions.some((v) => v.kind === "forecast") && (
            <tr>
              <td colSpan={7} className="p-6 text-sm text-muted-foreground">
                <strong className="block text-foreground">No forecast versions yet</strong>
                <p className="mt-2">
                  Select a source budget, choose an actuals cutoff, then create a manual, historical or rolling
                  forecast. Posted actuals and future estimates remain separate.
                </p>
              </td>
            </tr>
          )}
        </tbody>
      </WorkTable>
    </section>
  );
}

export function BudgetAvailability({
  report,
  busy,
  onDrill,
}: {
  report: BudgetReport;
  busy: boolean;
  onDrill: (account: string, period: string) => void;
}) {
  return (
    <section className={`${budgetPanel} overflow-x-auto`}>
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-semibold">Spending pool availability</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Remaining allocation = budget + transfers − posted actuals − open commitments.
        </p>
      </div>
      <WorkTable tableId="budget-spending-availability" tools={false} paging={false} className="w-full">
        <thead>
          <tr>
            {[
              "Account / fiscal period",
              "Available to spend",
              "Budget + transfers",
              "Posted actuals",
              "Open commitments",
              "Utilization",
              "Current policy exposure",
            ].map((h) => (
              <th key={h} className={budgetHead}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => {
            const exceeded = decimal(row.available, 8, true) < 0n;
            const policy = !report.complete
              ? "Incomplete evidence"
              : !report.policy?.enabled
                ? "Controls off"
                : !exceeded
                  ? "Within allocation"
                  : report.policy.mode === "block"
                    ? "Allocation exceeded"
                    : report.policy.mode === "approval"
                      ? "Exception required"
                      : "Warning policy";
            return (
              <tr key={row.id}>
                <td className={budgetCell}>
                  <strong>
                    {row.account_code} · {row.account_name}
                  </strong>
                  <small className="block text-muted-foreground">
                    {row.period_start.slice(0, 7)} · {Object.values(row.dimensions).join(" / ") || "Unrestricted pool"}
                  </small>
                </td>
                <td
                  className={`${budgetCell} text-right font-semibold tabular-nums ${exceeded ? "text-destructive" : ""}`}
                >
                  {budgetDisplay(row.available, report.decimal_places)}
                </td>
                <td className={`${budgetCell} text-right tabular-nums`}>
                  {budgetDisplay(
                    decimalText(decimal(row.budget, 8, true) + decimal(row.transfers, 8, true), 8),
                    report.decimal_places,
                  )}
                </td>
                <td className={`${budgetCell} text-right tabular-nums`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 py-0 text-primary underline-offset-2 hover:underline"
                    disabled={busy}
                    onClick={() => onDrill(row.account_id, row.period_id)}
                  >
                    {budgetDisplay(row.actual, report.decimal_places)}
                  </Button>
                </td>
                <td className={`${budgetCell} text-right tabular-nums`}>
                  {budgetDisplay(row.commitment, report.decimal_places)}
                </td>
                <td className={`${budgetCell} text-right tabular-nums`}>
                  {row.utilization_percent === null ? "No budget basis" : `${row.utilization_percent}%`}
                </td>
                <td className={budgetCell}>
                  <Badge variant={exceeded ? "destructive" : "secondary"}>{policy}</Badge>
                </td>
              </tr>
            );
          })}
          {!report.rows.length && (
            <tr>
              <td colSpan={7} className="p-6 text-sm text-muted-foreground">
                No spending pools match this selection. Choose an approved budget or create allocations before checking
                availability.
              </td>
            </tr>
          )}
        </tbody>
      </WorkTable>
    </section>
  );
}

export function BudgetReportCatalogue({ onNavigate }: { onNavigate: (page: string) => void }) {
  const reports = [
    [
      "budget-actual",
      "Budget variance report",
      "Allocated budget against posted GL, with favorable/unfavorable variance and commentary.",
    ],
    [
      "budget-availability",
      "Available funds report",
      "Spending pools after actuals, transfers and open purchase commitments.",
    ],
    [
      "forecasts",
      "Forecast & estimate at completion",
      "Actuals through cutoff, future forecast amounts and reforecast assumptions.",
    ],
    ["scenarios", "Scenario comparison", "Best, expected and worst cases, version totals and assumption history."],
    [
      "commitment-control",
      "Purchase commitment report",
      "Approved source reservations, recognition, residual obligations and closure.",
    ],
    [
      "budget-approval",
      "Transfers & approval history",
      "Version decisions, controlled transfers, exceptions and immutable evidence.",
    ],
  ];
  return (
    <section className={budgetPanel}>
      <h2 className="border-b border-border px-4 py-3 font-semibold">Planning report library</h2>
      <div className="divide-y divide-border">
        {reports.map(([page, title, description]) => (
          <Button
            key={page}
            variant="ghost"
            onClick={() => onNavigate(page!)}
            className="h-auto w-full justify-between gap-4 rounded-none bg-card px-4 py-4 text-left whitespace-normal text-card-foreground hover:bg-muted"
          >
            <span>
              <strong className="block text-sm">{title}</strong>
              <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
            </span>
            <ArrowRight className="size-4 shrink-0" />
          </Button>
        ))}
      </div>
    </section>
  );
}
