"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssetCategory,
  AssetDashboard,
  AssetDetail,
  AssetOptions,
  AssetSources,
  AssetWorkspace,
  AssetEvent,
  AssetEventInput,
  AssetDepreciationRun,
} from "@nexora/contracts";
import { AssetDepreciationReview, AssetEventReview } from "../components/asset-transaction-reviews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSession } from "@/lib/session/session-provider";
import { WorkTable } from "../components/asset-table";
import { AssetRegistrationForm } from "../components/asset-registration-form";
import { AssetCategoryForm } from "../components/asset-category-form";
import { AssetCompanyPolicyForm, AssetNominalClassificationForm } from "../components/asset-company-policy-form";
import { AssetAttachments } from "../components/asset-attachments";
import { AssetDetailEditor } from "../components/asset-detail-editor";
import { AssetGroupReport, assetGroupReports } from "../components/asset-group-report";
import { AssetLifecycleForm, lifecycleLabels } from "../components/asset-lifecycle-form";
import { Field, Select, Section, moneyLabel, today } from "../components/asset-fields";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AssetPurchaseInformation,
  AssetPhysicalInformation,
  AssetValuationPanel,
  AssetJournalPanel,
  AssetLifecycleHistory,
  AssetAccrualSchedulePanel,
} from "../components/asset-detail-panels";

type Props = {
  page: string;
  recordRef?: string;
  purchaseContext?: boolean;
  purchaseBillId?: string;
  onNavigate: (module: string, page: string, reference?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
};
const lifecyclePages: Record<string, AssetEventInput["type"]> = {
  "asset-transfer": "transfer",
  "asset-return": "return",
  "asset-refund": "refund",
  "asset-maintenance": "maintenance",
  "asset-verification": "verification",
  "asset-revaluation": "impairment",
  "asset-disposal": "disposal",
};
const lifecyclePermissions: Record<AssetEventInput["type"], string> = {
  transfer: "transfer",
  return: "return",
  refund: "return",
  maintenance: "maintain",
  verification: "maintain",
  impairment: "impair",
  disposal: "dispose",
};
const reportNames = [
  "Fixed Assets Register",
  "Acquisitions",
  "Categories",
  "Locations",
  "Custodians",
  "Departments",
  "Projects",
  "Depreciation Schedule",
  "Accumulated Depreciation",
  "Net Book Value",
  "Transfers",
  "Vendor Returns",
  "Vendor Refunds",
  "Vendor Refund Outstanding",
  "Maintenance",
  "Physical Verification",
  "Verification Exceptions",
  "Impairment",
  "Disposals",
] as const;
const reportEvents: Record<string, AssetEventInput["type"]> = {
  Transfers: "transfer",
  "Vendor Returns": "return",
  "Vendor Refunds": "refund",
  Maintenance: "maintenance",
  "Physical Verification": "verification",
  "Verification Exceptions": "verification",
  Impairment: "impairment",
  Disposals: "disposal",
};
const explain = (error: unknown) =>
  error instanceof Error ? error.message : "The asset request failed. Refresh before retrying.";
function exportCsv(name: string, rows: readonly (readonly unknown[])[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
export function FixedAssetsWorkspace(props: Props) {
  const { activeCompany, session, loading } = useSession();
  if (loading) return <p role="status">Loading Fixed Assets permissions…</p>;
  if (!activeCompany)
    return (
      <Alert>
        <AlertDescription>Select a company to open Fixed Assets.</AlertDescription>
      </Alert>
    );
  if (!session?.user.permissions.includes("assets.asset.read"))
    return (
      <Alert>
        <AlertDescription>Your account needs Fixed Assets read permission for this company.</AlertDescription>
      </Alert>
    );
  return (
    <CompanyAssets
      key={`${activeCompany.id}:${props.page}:${props.recordRef ?? ""}:${props.purchaseBillId ?? ""}`}
      {...props}
      company={activeCompany.id}
    />
  );
}
function CompanyAssets({
  company,
  page,
  recordRef,
  purchaseContext,
  purchaseBillId,
  onNavigate,
  onDirtyChange,
}: Props & { company: string }) {
  const { api, session, csrfToken } = useSession(),
    permissions = new Set(session?.user.permissions ?? []),
    canReport = !!session?.user.permissions.includes("assets.asset.report"),
    can = (action: string) => permissions.has(`assets.asset.${action}`) && !session?.impersonation;
  const [options, setOptions] = useState<AssetOptions | null>(null),
    [workspace, setWorkspace] = useState<AssetWorkspace | null>(null),
    [dashboard, setDashboard] = useState<AssetDashboard | null>(null),
    [sources, setSources] = useState<AssetSources>({ items: [], next_offset: null }),
    [loadedDetail, setDetail] = useState<AssetDetail | null>(null),
    [selected, setSelected] = useState(page === "add-asset" || page === "asset-acquisition" ? "" : (recordRef ?? "")),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [categoryFilter, setCategoryFilter] = useState(""),
    [supplierFilter, setSupplierFilter] = useState(""),
    [offset, setOffset] = useState(0),
    [limit, setLimit] = useState(25),
    [categoryEdit, setCategoryEdit] = useState<AssetCategory | undefined>(),
    [categoryOpen, setCategoryOpen] = useState(false),
    [transferOpen, setTransferOpen] = useState(page === "asset-transfer" && !!recordRef),
    [period, setPeriod] = useState(""),
    [depreciationSelection, setDepreciationSelection] = useState<string[]>([]),
    [eventFrom, setEventFrom] = useState(""),
    [eventTo, setEventTo] = useState(""),
    [reason, setReason] = useState(""),
    [reversalDate, setReversalDate] = useState(today()),
    [reviewEvent, setReviewEvent] = useState<AssetEvent | null>(null),
    [reviewRun, setReviewRun] = useState<AssetDepreciationRun | null>(null),
    [editing, setEditing] = useState(false),
    [report, setReport] = useState<string>("Fixed Assets Register"),
    [assignmentFilter, setAssignmentFilter] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [sort, setSort] = useState("code");
  const selectedDetail = loadedDetail?.asset.id === selected ? loadedDetail : null;
  const purchaseSourceMismatch =
    !!purchaseBillId && !!selectedDetail && selectedDetail.source.purchase_document_id !== purchaseBillId;
  const detail = purchaseSourceMismatch ? null : selectedDetail;
  const token = useRef(0),
    type = lifecyclePages[page],
    isReport = ["asset-reports", "asset-lease-reports", "asset-register-report", "asset-depreciation-report"].includes(
      page,
    ),
    registration = ["add-asset", "asset-acquisition"].includes(page);
  const eventType = type ?? (isReport ? reportEvents[report] : undefined),
    query = useCallback(
      (at = offset) =>
        "?" +
        new URLSearchParams({
          company_id: company,
          search,
          limit: String(limit),
          offset: String(at),
          sort,
          ...(status ? { status } : {}),
          ...(categoryFilter ? { category_id: categoryFilter } : {}),
          ...(eventType ? { event_type: eventType } : {}),
          ...(report === "Verification Exceptions" ? { verification_exceptions: "true" } : {}),
          ...(supplierFilter ? { supplier_id: supplierFilter } : {}),
          ...(eventFrom ? { event_from: eventFrom } : {}),
          ...(eventTo ? { event_to: eventTo } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(assignmentFilter && ["Locations", "Custodians", "Departments", "Projects"].includes(report)
            ? {
                [{
                  Locations: "location_id",
                  Custodians: "custodian_id",
                  Departments: "department_id",
                  Projects: "project_id",
                }[report]!]: assignmentFilter,
              }
            : {}),
        }),
      [
        company,
        supplierFilter,
        search,
        offset,
        limit,
        status,
        sort,
        categoryFilter,
        eventType,
        eventFrom,
        eventTo,
        from,
        to,
        report,
        assignmentFilter,
      ],
    );
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++token.current;
      setLoading(true);
      try {
        const [nextOptions, nextWorkspace, nextDashboard, nextSources] = await Promise.all([
          api.getFixedAssetOptions(company),
          api.getFixedAssetWorkspace(query()),
          isReport && canReport ? api.getFixedAssetReports(query()) : api.getFixedAssetDashboard(query()),
          api.getFixedAssetSources(
            "?" +
              new URLSearchParams({
                company_id: company,
                limit: "100",
                ...(registration && recordRef ? { source_id: recordRef } : {}),
              }),
          ),
        ]);
        if (current !== token.current || signal?.aborted) return;
        setOptions(nextOptions);
        setWorkspace(nextWorkspace);
        setDashboard(nextDashboard);
        setSources(nextSources);
        setError("");
      } catch (error) {
        if (current === token.current && !signal?.aborted) {
          setError(explain(error));
          setWorkspace(null);
          setDashboard(null);
        }
      } finally {
        if (current === token.current && !signal?.aborted) setLoading(false);
      }
    },
    [api, company, query, isReport, canReport, registration, recordRef],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api
      .getFixedAsset(selected, company)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((error) => {
        if (!cancelled) setError(explain(error));
      });
    return () => {
      cancelled = true;
    };
  }, [api, company, selected]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  async function perform<T>(work: () => Promise<T>, success: string) {
    if (busy) throw new Error("An asset request is already in progress.");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await work();
      setMessage(success);
      await load();
      if (selected) {
        const next = await api.getFixedAsset(selected, company);
        setDetail(next);
      }
      return result;
    } catch (error) {
      setError(explain(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }
  function fire(work: () => Promise<unknown>, success: string) {
    void perform(work, success).catch(() => {
      /* The failure is presented in the workspace alert. */
    });
  }
  const goto = (target: string, id?: string) => onNavigate("assets", target, id),
    dp = options?.decimal_places ?? 2,
    rows = workspace?.assets.items ?? [],
    asset = detail?.asset,
    assetChoices = asset && !rows.some((row) => row.id === asset.id) ? [asset, ...rows] : rows;
  async function moreSources() {
    if (sources.next_offset === null) return;
    setBusy(true);
    try {
      const next = await api.getFixedAssetSources(
        "?" + new URLSearchParams({ company_id: company, offset: String(sources.next_offset), limit: "100" }),
      );
      setSources((current) => ({ items: [...current.items, ...next.items], next_offset: next.next_offset }));
    } catch (error) {
      setError(explain(error));
    } finally {
      setBusy(false);
    }
  }
  function assetAction(action: "submit" | "approve" | "reject" | "activate") {
    if (!asset) return;
    fire(
      () =>
        api.actOnFixedAsset(
          asset.id,
          { company_id: company, expected_version: asset.version, action, reason },
          csrfToken(),
          `asset:${asset.id}:${asset.version}:${action}`,
        ),
      "Asset lifecycle updated.",
    );
  }
  function eventAction(event: AssetEvent, action: "submit" | "approve" | "reject" | "post") {
    fire(async () => {
      const next = await api.actOnFixedAssetEvent(
        event.id,
        { company_id: company, expected_version: event.version, action, reason },
        csrfToken(),
        `asset-event:${event.id}:${event.version}:${action}`,
      );
      setReviewEvent(next);
    }, "Asset event updated.");
  }
  function runAction(run: AssetDepreciationRun, action: "submit" | "approve" | "reject" | "post" | "reverse") {
    fire(async () => {
      const next = await api.actOnFixedAssetDepreciation(
        run.id,
        {
          company_id: company,
          expected_version: run.version,
          action,
          reason,
          ...(action === "reverse" ? { reversal_date: reversalDate } : {}),
        },
        csrfToken(),
        `asset-run:${run.id}:${run.version}:${action}`,
      );
      setReviewRun(next);
    }, "Depreciation workflow updated.");
  }
  const actionReason = (
    <Field label="Action reason / approval remarks">
      <Input
        value={reason}
        minLength={3}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain the approval or posting decision"
      />
    </Field>
  );
  function registerTable() {
    return (
      <WorkTable
        tableId="fixed-asset-register"
        label="Fixed Assets Register"
        tools={false}
        pagination={{
          offset,
          limit,
          total: workspace?.assets.total ?? 0,
          busy: loading,
          onOffsetChange: setOffset,
          onLimitChange: (next) => {
            setLimit(next);
            setOffset(0);
          },
        }}
      >
        <thead>
          <tr>
            {[
              "Asset",
              "Category",
              "Asset ID",
              "Purchase Bill",
              "Vendor",
              "Acquisition date",
              "Cost",
              "Method / annual rate",
              "Useful life",
              "Accumulated depreciation",
              "Net book value",
              "Custodian / location",
              "Department",
              "Condition",
              "Status",
              "Actions",
            ].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.code}</strong>
                <div>{row.details.name}</div>
                <div className="text-xs text-muted-foreground">{row.details.serial_number || "No serial recorded"}</div>
              </td>
              <td>{row.category_name}</td>
              <td className="max-w-44 break-all font-mono text-xs">{row.id}</td>
              <td>{row.purchase_reference ?? "Direct acquisition"}</td>
              <td>
                {row.supplier_name ??
                  options?.suppliers.find((value) => value.id === row.supplier_id)?.name ??
                  "Not recorded"}
              </td>
              <td>{row.acquisition_date}</td>
              <td>{moneyLabel(row.cost, dp)}</td>
              <td>
                {row.method.replaceAll("_", " ")}
                <div className="text-xs text-muted-foreground">
                  {row.method === "straight_line"
                    ? "Cost ÷ useful life"
                    : row.method === "double_declining"
                      ? `${Math.min(100, 2400 / row.useful_life_months).toFixed(4)}%`
                      : `${row.annual_rate_percent}%`}
                </div>
              </td>
              <td>{row.useful_life_months} months</td>
              <td>{moneyLabel(row.accumulated_depreciation, dp)}</td>
              <td>{moneyLabel(row.net_book_value, dp)}</td>
              <td>
                {options?.employees.find((item) => item.id === row.assignment.custodian_id)?.name ?? "Unassigned"}
                <div className="text-xs text-muted-foreground">
                  {options?.locations.find((item) => item.id === row.assignment.location_id)?.name ?? "No location"}
                </div>
              </td>
              <td>
                {options?.departments.find((value) => value.id === row.assignment.department_id)?.name ?? "Unassigned"}
              </td>
              <td>{row.details.condition}</td>
              <td>
                <Badge variant="outline">{row.status.replaceAll("_", " ")}</Badge>
              </td>
              <td>
                <Button size="sm" variant="outline" onClick={() => goto("asset-detail", row.id)}>
                  Open {row.code}
                </Button>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={16}>
                {loading
                  ? "Loading assets…"
                  : "No assets match these filters. Register an asset from a posted acquisition to begin."}
              </td>
            </tr>
          )}
        </tbody>
      </WorkTable>
    );
  }
  function eventsTable() {
    return (
      <>
        <WorkTable
          tableId={`asset-events-${eventType ?? "all"}`}
          label={eventType === "transfer" ? "Asset transfers" : "Asset lifecycle transactions"}
          tools={false}
          paging={false}
        >
          <thead>
            <tr>
              {["Reference", "Asset", "Type", "Date", "Amount", "Status", "Result", "Actions"].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workspace?.events.map((event) => (
              <tr key={event.id}>
                <td>{event.code}</td>
                <td>
                  <Button variant="link" onClick={() => goto("asset-detail", event.asset_id)}>
                    {event.asset_code}
                  </Button>
                </td>
                <td>{lifecycleLabels[event.type]}</td>
                <td>{event.date}</td>
                <td>{moneyLabel(event.preview.amount, dp)}</td>
                <td>{event.state}</td>
                <td>
                  {event.input.type === "verification"
                    ? event.input.result.replaceAll("_", " ")
                    : event.input.type === "maintenance"
                      ? event.input.maintenance_status.replaceAll("_", " ")
                      : "—"}
                </td>
                <td>
                  <Button size="sm" variant="outline" onClick={() => setReviewEvent(event)}>
                    Review {event.code}
                  </Button>
                </td>
              </tr>
            ))}
            {!workspace?.events.length && (
              <tr>
                <td colSpan={8}>No lifecycle transactions on this page.</td>
              </tr>
            )}
          </tbody>
        </WorkTable>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={busy || offset === 0}
            onClick={() => setOffset((current) => Math.max(0, current - limit))}
          >
            Previous events
          </Button>
          <span className="text-sm text-muted-foreground">Page {Math.floor(offset / limit) + 1}</span>
          <Button
            variant="outline"
            disabled={busy || (workspace?.events.length ?? 0) < limit}
            onClick={() => setOffset((current) => current + limit)}
          >
            Next events
          </Button>
        </div>
      </>
    );
  }
  const title =
    page === "assets-dashboard"
      ? "Fixed Assets"
      : page === "asset-classes"
        ? "Asset Classes and Policies"
        : page === "asset-policies"
          ? "Asset Policies"
          : registration
            ? "Register acquired assets"
            : purchaseContext
              ? page === "asset-refund"
                ? "Vendor Refunds"
                : "Purchase Return"
              : page === "asset-transfer"
                ? "Transfer and Assignment"
                : type
                  ? lifecycleLabels[type]
                  : page === "depreciation-run"
                    ? "Depreciation"
                    : page === "capitalisation"
                      ? "Asset approval & activation"
                      : isReport
                        ? "Fixed Asset reports"
                        : page === "asset-detail"
                          ? "Asset details"
                          : "Asset Register";
  if (page.startsWith("lease-"))
    return (
      <Alert>
        <AlertDescription>
          Lease accounting remains a separate prototype workflow. The connected Fixed Assets module manages owned
          assets.
        </AlertDescription>
      </Alert>
    );
  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Base currency: {options?.base_currency}
          </p>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Posted acquisition evidence, asset responsibility, and governed lifecycle accounting.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {page === "asset-classes" && can("categories") && (
            <Button
              disabled={busy || loading || categoryOpen}
              onClick={() => {
                setCategoryEdit(undefined);
                setCategoryOpen(true);
              }}
            >
              Add New Asset Class and Policy
            </Button>
          )}
          {page === "assets" && can("create") && <Button onClick={() => goto("add-asset")}>Add New Asset</Button>}
          {page === "asset-transfer" && can("transfer") && (
            <Button
              disabled={busy || loading || transferOpen}
              onClick={() => {
                setSelected("");
                setTransferOpen(true);
              }}
            >
              Asset Transfer
            </Button>
          )}
        </div>
      </header>
      {purchaseBillId && (
        <p className="text-sm text-muted-foreground">
          Choose an asset acquired from this Purchase Bill. Its original acquisition is checked before saving a return
          draft. Use Find asset to locate its code or serial number.
        </p>
      )}
      {purchaseSourceMismatch && (
        <Alert variant="destructive">
          <AlertDescription>
            The selected asset was not acquired from this Purchase Bill. Select an asset from the original bill.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <p role="status" className="text-sm text-[var(--nx-success-text)]">
          {message}
        </p>
      )}
      {session?.impersonation && (
        <Alert>
          <AlertDescription>Fixed Assets is read-only during impersonation.</AlertDescription>
        </Alert>
      )}
      {loading && !workspace && <p role="status">Loading company asset records…</p>}
      {page === "assets-dashboard" && dashboard && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Assets", String(dashboard.total)],
              ["In service", String(dashboard.active)],
              ["Acquisition cost", moneyLabel(dashboard.cost, dp)],
              ["Net book value", moneyLabel(dashboard.net_book_value, dp)],
              ["Accumulated depreciation", moneyLabel(dashboard.accumulated_depreciation, dp)],
              ["Vendor credit / refund outstanding", moneyLabel(dashboard.refund_outstanding, dp)],
              ["Verification due", String(dashboard.verification_due)],
              ["Warranty expiring in 30 days", String(dashboard.warranty_expiring)],
              ["Maintenance due", String(dashboard.maintenance)],
              ["Assets due for depreciation", String(dashboard.depreciation_due)],
              ["Returned to vendor", String(dashboard.returned)],
              ["Disposed", String(dashboard.disposed)],
              ["Impairment", moneyLabel(dashboard.impairment, dp)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <Section
            title="Asset distribution"
            description="Current group page. Open Asset Reports for all groups, filters and drill-downs."
          >
            <div className="col-span-full grid gap-4 md:grid-cols-2">
              {["category", "department", "location", "project", "acquisition_month"].map((dimension) => (
                <div key={dimension} className="min-w-0 space-y-2">
                  <h3 className="text-sm font-medium capitalize">{dimension.replace("_", " ")}</h3>
                  {dashboard.groups
                    .filter((group) => group.dimension === dimension)
                    .map((group) => (
                      <div key={group.id}>
                        <div className="flex justify-between gap-2 text-sm">
                          <span className="truncate">
                            {group.label} · {group.count}
                          </span>
                          <span>{moneyLabel(group.cost, dp)}</span>
                        </div>
                        <progress
                          className="h-2 w-full accent-primary"
                          aria-label={`${group.label} acquisition cost`}
                          value={Number(group.cost)}
                          max={Math.max(1, Number(dashboard.cost))}
                        />
                      </div>
                    ))}
                  {!dashboard.groups.some((group) => group.dimension === dimension) && (
                    <p className="text-sm text-muted-foreground">No registered assets.</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
      {options &&
        registration &&
        (can("create") ? (
          <AssetRegistrationForm
            sourceReference={recordRef}
            company={company}
            options={options}
            sources={sources.items}
            busy={busy}
            onDirtyChange={onDirtyChange}
            hasMoreSources={sources.next_offset !== null}
            onMoreSources={() => void moreSources()}
            onSave={async (input, key) => {
              const result = await perform(
                () => api.createFixedAssets(input, csrfToken(), key),
                "Asset drafts registered against their original acquisition.",
              );
              onDirtyChange?.(false);
              goto("asset-detail", result.items[0]?.id);
            }}
          />
        ) : (
          <p>You need asset creation permission.</p>
        ))}
      {options && page === "asset-classes" && (
        <>
          {categoryOpen && (
            <AssetCategoryForm
              key={categoryEdit?.id ?? "new"}
              company={company}
              options={options}
              category={categoryEdit}
              busy={busy}
              onDirtyChange={onDirtyChange}
              onCancel={() => {
                setCategoryOpen(false);
                onDirtyChange?.(false);
              }}
              onSave={async (id, input, key) => {
                await perform(() => api.saveFixedAssetCategory(id, input, csrfToken(), key), "Category policy saved.");
                setCategoryOpen(false);
                onDirtyChange?.(false);
              }}
            />
          )}
          <WorkTable tableId="asset-categories" label="Asset categories">
            <thead>
              <tr>
                {["Code", "Asset class", "Default life", "Method", "Status", "Actions"].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {options.categories.map((row) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.useful_life_months} months</td>
                  <td>{row.method.replace("_", " ")}</td>
                  <td>{row.active ? "Active" : "Inactive"}</td>
                  <td>
                    {can("categories") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCategoryEdit(row);
                          setCategoryOpen(true);
                        }}
                      >
                        Edit {row.code}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!options.categories.length && (
                <tr>
                  <td colSpan={6}>
                    Configure an asset category and its existing COA accounts before registering acquisitions.
                  </td>
                </tr>
              )}
            </tbody>
          </WorkTable>
        </>
      )}
      {options &&
        page === "asset-policies" &&
        (can("categories") ? (
          <>
            {options.preparation_result && (
              <p role="status" className="text-sm text-muted-foreground">
                Last scheduled preparation: {options.preparation_result.status.replaceAll("_", " ")} ·{" "}
                {options.preparation_result.updated_at}
                {options.preparation_result.error_code
                  ? ` · ${options.preparation_result.error_code.replaceAll("_", " ")}. Review policy authority and due accounting periods, then allow the next hourly retry.`
                  : ""}
              </p>
            )}
            <AssetCompanyPolicyForm
              key={options.company_policy?.version ?? 0}
              company={company}
              policy={options.company_policy ?? null}
              busy={busy}
              onDirtyChange={onDirtyChange}
              onSave={async (value, key) => {
                await perform(
                  () => api.saveFixedAssetCompanyPolicy(value, csrfToken(), key),
                  "Company Asset Policy saved.",
                );
              }}
            />
            {session?.user.permissions.includes("finance.nominal.update") && (
              <AssetNominalClassificationForm
                options={options}
                busy={busy}
                onSave={async (id, version, active, reason) => {
                  await perform(
                    () =>
                      api.classifyFixedAssetNominal(
                        id,
                        { company_id: company, expected_version: version, active, reason },
                        csrfToken(),
                        crypto.randomUUID(),
                      ),
                    "Fixed Asset nominal classification updated.",
                  );
                }}
              />
            )}
          </>
        ) : (
          <p>Asset policy administration permission is required.</p>
        ))}
      {options &&
        !registration &&
        page !== "asset-classes" &&
        page !== "asset-policies" &&
        page !== "assets-dashboard" && (
          <section aria-label="Asset filters" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Find asset">
              <Input
                value={search}
                placeholder="Code, name or serial number"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            <Field label="Category">
              <Select
                value={categoryFilter}
                items={options.categories}
                placeholder="All categories"
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            <Field label="Status">
              <Select
                items={["draft", "submitted", "approved", "active", "fully_depreciated", "returned", "disposed"].map(
                  (id) => ({ id, name: id.replaceAll("_", " ") }),
                )}
                value={status}
                placeholder="All statuses"
                onChange={(e) => {
                  setStatus(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            <Field label="Supplier">
              <Select
                value={supplierFilter}
                placeholder="All suppliers"
                items={options.suppliers}
                onChange={(e) => {
                  setSupplierFilter(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            <Field label="Sort register">
              <Select
                value={sort}
                items={[
                  { id: "code", name: "Asset code" },
                  { id: "cost", name: "Acquisition cost" },
                  { id: "acquired", name: "Newest acquisition" },
                ]}
                onChange={(e) => {
                  setSort(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            {eventType && (
              <>
                <Field label="Event date from">
                  <Input
                    type="date"
                    value={eventFrom}
                    onChange={(e) => {
                      setEventFrom(e.target.value);
                      setOffset(0);
                    }}
                  />
                </Field>
                <Field label="Event date to">
                  <Input
                    type="date"
                    value={eventTo}
                    onChange={(e) => {
                      setEventTo(e.target.value);
                      setOffset(0);
                    }}
                  />
                </Field>
              </>
            )}
          </section>
        )}
      {options && type && (
        <>
          {can(lifecyclePermissions[type]) && (type !== "transfer" || transferOpen) ? (
            <>
              <AssetLifecycleForm
                key={`${type}:${detail?.asset.id ?? ""}`}
                company={company}
                type={type}
                options={options}
                assets={assetChoices}
                detail={detail}
                sources={sources.items}
                busy={busy}
                onSelect={setSelected}
                onDirtyChange={onDirtyChange}
                onSave={async (input, key) => {
                  if (purchaseBillId && detail?.source.purchase_document_id !== purchaseBillId)
                    throw new Error("Select an asset acquired from the original Purchase Bill.");
                  const result = await perform(
                    () => api.createFixedAssetEvent(input, csrfToken(), key),
                    "Lifecycle draft prepared. Review it before submission.",
                  );
                  setReviewEvent(result);
                  if (type === "transfer") setTransferOpen(false);
                  onDirtyChange?.(false);
                }}
              />
              {type === "transfer" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    onDirtyChange?.(false);
                    setTransferOpen(false);
                    setSelected("");
                    goto("asset-transfer");
                  }}
                >
                  Cancel transfer
                </Button>
              )}
            </>
          ) : !can(lifecyclePermissions[type]) ? (
            <p>Your account can review this workflow but cannot prepare transactions.</p>
          ) : null}
          {eventsTable()}
        </>
      )}
      {page === "depreciation-run" && options && (
        <>
          <Section
            title="Prepare monthly depreciation"
            description="Preview assets and skipped reasons before approval. Runs are limited to 400 assets; use selected asset batches for larger registers."
          >
            <Field label="Accounting period">
              <Select
                items={options.periods.map((row) => ({ ...row, name: `${row.name} · ${row.status}` }))}
                required
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </Field>
            {actionReason}
            <Button
              disabled={busy || !period || reason.trim().length < 3 || !can("depreciate")}
              onClick={() =>
                fire(async () => {
                  const run = await api.previewFixedAssetDepreciation(
                    {
                      company_id: company,
                      period_id: period,
                      reason,
                      ...(depreciationSelection.length ? { asset_ids: depreciationSelection } : {}),
                    },
                    csrfToken(),
                    crypto.randomUUID(),
                  );
                  setReviewRun(run);
                }, "Depreciation preview prepared.")
              }
            >
              Generate preview
            </Button>
            <div className="col-span-full space-y-2">
              <p className="text-sm text-muted-foreground">
                Selected assets: {depreciationSelection.length} / 400. An empty selection previews the complete company
                register when it contains at most 400 assets.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDepreciationSelection([])}
                disabled={!depreciationSelection.length}
              >
                Clear selection
              </Button>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {workspace?.assets.items.map((row) => (
                  <label key={row.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <Checkbox
                      checked={depreciationSelection.includes(row.id)}
                      disabled={!depreciationSelection.includes(row.id) && depreciationSelection.length >= 400}
                      onCheckedChange={(checked) =>
                        setDepreciationSelection((current) =>
                          checked ? [...current, row.id] : current.filter((id) => id !== row.id),
                        )
                      }
                    />
                    <span>
                      {row.code} — {row.details.name}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || busy}
                  onClick={() => setOffset((current) => Math.max(0, current - limit))}
                >
                  Previous assets
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !workspace?.assets.next_offset}
                  onClick={() => setOffset(workspace?.assets.next_offset ?? offset)}
                >
                  Next assets
                </Button>
              </div>
            </div>
          </Section>
          <WorkTable tableId="asset-depreciation-runs" label="Depreciation runs" tools={false} paging={false}>
            <thead>
              <tr>
                {["Run", "Period", "Total", "State", "Actions"].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workspace?.runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.code}</td>
                  <td>
                    {run.start} – {run.end}
                  </td>
                  <td>{moneyLabel(run.total, dp)}</td>
                  <td>{run.state}</td>
                  <td>
                    <Button size="sm" variant="outline" onClick={() => setReviewRun(run)}>
                      Review {run.code}
                    </Button>
                  </td>
                </tr>
              ))}
              {!workspace?.runs.length && (
                <tr>
                  <td colSpan={5}>No depreciation runs on this page.</td>
                </tr>
              )}
            </tbody>
          </WorkTable>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy || offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - limit))}
            >
              Previous runs
            </Button>
            <Button
              variant="outline"
              disabled={busy || (workspace?.runs.length ?? 0) < limit}
              onClick={() => setOffset((current) => current + limit)}
            >
              Next runs
            </Button>
          </div>
        </>
      )}
      {reviewRun && (
        <AssetDepreciationReview
          run={reviewRun}
          options={options}
          dp={dp}
          busy={busy}
          actorId={session?.user.id ?? ""}
          reason={reason}
          actionReason={actionReason}
          can={can}
          onClose={() => setReviewRun(null)}
          reversalDate={reversalDate}
          setReversalDate={setReversalDate}
          runAction={runAction}
        />
      )}
      {reviewEvent && (
        <AssetEventReview
          event={reviewEvent}
          options={options}
          dp={dp}
          busy={busy}
          actorId={session?.user.id ?? ""}
          reason={reason}
          actionReason={actionReason}
          can={can}
          onClose={() => setReviewEvent(null)}
          eventAction={eventAction}
        />
      )}
      {page === "asset-detail" && (
        <>
          {!selected && registerTable()}
          {selected && !detail && !error && <p role="status">Loading asset details…</p>}
          {asset && options && (
            <Tabs key={asset.id} defaultValue="general">
              <div className="max-w-full overflow-x-auto">
                <TabsList aria-label="Asset details">
                  {(
                    [
                      ["general", "General Information"],
                      ["purchase", "Purchase Information"],
                      ["depreciation", "Depreciation Details"],
                      ["accounting", "Accounting Transactions"],
                      ["maintenance", "Maintenance History"],
                      ["transfers", "Transfers and Assignments"],
                      ["documents", "Documents and Attachments"],
                      ["audit", "Audit History"],
                    ] as const
                  ).map(([value, label]) => (
                    <TabsTrigger key={value} value={value}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <TabsContent value="general" keepMounted className="flex flex-col gap-4 [&[hidden]]:hidden">
                <Section
                  title={`${asset.code} · ${asset.details.name}`}
                  description={`${asset.status.replaceAll("_", " ")} · ${asset.category_name}`}
                >
                  {[
                    ["Acquisition", `${detail.source.reference} · ${detail.source.date}`],
                    ["Acquisition cost", moneyLabel(asset.cost, dp)],
                    ["Accumulated depreciation", moneyLabel(asset.accumulated_depreciation, dp)],
                    ["Impairment", moneyLabel(asset.impairment, dp)],
                    ["Net book value", moneyLabel(asset.net_book_value, dp)],
                    ["Residual value", moneyLabel(asset.residual_value, dp)],
                    ["Useful life", `${asset.useful_life_months} months`],
                    [
                      "Remaining useful life",
                      detail.schedule.rows.some((row) => !row.posted)
                        ? detail.schedule.rows.filter((row) => !row.posted).length +
                          " scheduled monthly intervals through " +
                          detail.schedule.rows.at(-1)!.end
                        : "No remaining scheduled depreciation",
                    ],
                    ["Depreciation method", asset.method.replace("_", " ")],
                    ["Available for use", asset.in_service_date],
                    ["Depreciation commencement", asset.depreciation_start],
                    ["Serial number", asset.details.serial_number || "Not recorded"],
                    [
                      "Supplier",
                      options.suppliers.find((row) => row.id === asset.supplier_id)?.name ??
                        detail.source.supplier_name ??
                        "Original supplier",
                    ],
                    [
                      "Custodian",
                      options.employees.find((row) => row.id === asset.assignment.custodian_id)?.name ?? "Unassigned",
                    ],
                    [
                      "Department",
                      options.departments.find((row) => row.id === asset.assignment.department_id)?.name ??
                        "Unassigned",
                    ],
                    [
                      "Location",
                      options.locations.find((row) => row.id === asset.assignment.location_id)?.name ?? "Unassigned",
                    ],
                    [
                      "Project",
                      options.projects.find((row) => row.id === asset.assignment.project_id)?.name ?? "Unassigned",
                    ],
                    ["Created by", asset.created_by],
                    ["Approved by", asset.approved_by ?? "Awaiting approval"],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 break-words text-sm font-medium">{value}</p>
                    </div>
                  ))}
                  <div className="col-span-full flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        onNavigate(
                          detail.source.source_type === "bank_payment" ? "banking" : "purchases",
                          detail.source.source_type === "bank_payment" ? "transaction-detail" : "add-purchase-bill",
                          detail.source.source_type === "bank_payment"
                            ? detail.source.source_id
                            : (detail.source.purchase_document_id ?? undefined),
                        )
                      }
                    >
                      Open original acquisition
                    </Button>
                    {can("edit") && ["draft", "active", "fully_depreciated"].includes(asset.status) && (
                      <Button variant="outline" onClick={() => setEditing(true)}>
                        Edit physical details
                      </Button>
                    )}
                    {["active", "fully_depreciated"].includes(asset.status) &&
                      Object.entries(lifecyclePages)
                        .filter(([, kind]) => kind !== "refund" && kind !== "return")
                        .map(([target, kind]) => (
                          <Button key={target} variant="outline" onClick={() => goto(target, asset.id)}>
                            {kind === "transfer" ? "Asset Transfer" : lifecycleLabels[kind]}
                          </Button>
                        ))}
                  </div>
                  {["draft", "submitted", "approved"].includes(asset.status) && (
                    <>
                      {actionReason}
                      <div className="col-span-full flex gap-2">
                        {asset.status === "draft" && can("create") && (
                          <Button disabled={busy || reason.trim().length < 3} onClick={() => assetAction("submit")}>
                            Submit asset
                          </Button>
                        )}
                        {asset.status === "submitted" && can("approve") && asset.created_by !== session?.user.id && (
                          <>
                            <Button disabled={busy || reason.trim().length < 3} onClick={() => assetAction("approve")}>
                              Approve asset
                            </Button>
                            <Button
                              variant="outline"
                              disabled={busy || reason.trim().length < 3}
                              onClick={() => assetAction("reject")}
                            >
                              Return to draft
                            </Button>
                          </>
                        )}
                        {asset.status === "approved" && can("approve") && asset.created_by !== session?.user.id && (
                          <Button disabled={busy || reason.trim().length < 3} onClick={() => assetAction("activate")}>
                            Activate available asset
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </Section>
                {editing && (
                  <AssetDetailEditor
                    asset={asset}
                    busy={busy}
                    onDirtyChange={onDirtyChange}
                    onCancel={() => {
                      setEditing(false);
                      onDirtyChange?.(false);
                    }}
                    onSave={async (input, key) => {
                      await perform(
                        () => api.updateFixedAsset(asset.id, input, csrfToken(), key),
                        "Asset details updated.",
                      );
                      setEditing(false);
                    }}
                  />
                )}
                <AssetPhysicalInformation detail={detail} />
              </TabsContent>
              <TabsContent value="purchase" keepMounted>
                <AssetPurchaseInformation detail={detail} />
              </TabsContent>
              <TabsContent value="depreciation" keepMounted className="flex flex-col gap-4 [&[hidden]]:hidden">
                <AssetValuationPanel key={`${asset.id}:${asset.version}`} detail={detail} />
                <AssetAccrualSchedulePanel key={`${asset.id}:${asset.version}`} detail={detail} options={options} />
                <Section title="Depreciation schedule">
                  <div className="col-span-full min-w-0">
                    <WorkTable
                      tableId="asset-annual-depreciation"
                      label="Annual depreciation"
                      aria-label="Annual depreciation"
                      tools={false}
                      paging={false}
                    >
                      <thead>
                        <tr>
                          <th>Year</th>
                          <th>Scheduled depreciation</th>
                          <th>Posted depreciation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.schedule.annual.map((row) => (
                          <tr key={row.year}>
                            <td>{row.year}</td>
                            <td>{moneyLabel(row.depreciation, dp)}</td>
                            <td>{moneyLabel(row.posted, dp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </WorkTable>
                    <Button
                      variant="outline"
                      onClick={() =>
                        exportCsv(`${asset.code}-depreciation.csv`, [
                          ["Start", "End", "Amount", "Accumulated depreciation", "Net book value", "Posted"],
                          ...detail.schedule.rows.map((row) => [
                            row.start,
                            row.end,
                            row.amount,
                            row.accumulated_depreciation,
                            row.net_book_value,
                            row.posted,
                          ]),
                        ])
                      }
                    >
                      Export full schedule
                    </Button>
                    <WorkTable tableId="asset-schedule" label="Depreciation schedule">
                      <thead>
                        <tr>
                          {["Period", "Depreciation", "Accumulated depreciation", "Net book value", "Status"].map(
                            (label) => (
                              <th key={label}>{label}</th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.schedule.rows.map((row) => (
                          <tr key={row.start}>
                            <td>
                              {row.start} – {row.end}
                            </td>
                            <td>{moneyLabel(row.amount, dp)}</td>
                            <td>{moneyLabel(row.accumulated_depreciation, dp)}</td>
                            <td>{moneyLabel(row.net_book_value, dp)}</td>
                            <td>{row.posted ? "Posted" : "Projected"}</td>
                          </tr>
                        ))}
                        {!detail.schedule.rows.length && (
                          <tr>
                            <td colSpan={5}>No remaining depreciation schedule.</td>
                          </tr>
                        )}
                      </tbody>
                    </WorkTable>
                  </div>
                </Section>
              </TabsContent>
              <TabsContent value="accounting" keepMounted className="flex flex-col gap-4 [&[hidden]]:hidden">
                <AssetJournalPanel key={`${asset.id}:${asset.version}`} detail={detail} />
                {asset.status === "returned" && (
                  <Section title="Vendor credit and refund balance">
                    <div>
                      <p className="text-xs text-muted-foreground">Outstanding net asset credit</p>
                      <p className="mt-1 text-xl font-semibold">
                        {moneyLabel(detail.refund_outstanding, dp)} {asset.base_currency}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Supplier invoice credits follow their Accounting offset and refund balances. Direct acquisition
                        refunds follow linked posted Bank Receipts.
                      </p>
                    </div>
                  </Section>
                )}
              </TabsContent>
              <TabsContent value="maintenance" keepMounted>
                <AssetLifecycleHistory detail={detail} options={options} type="maintenance" onOpen={setReviewEvent} />
              </TabsContent>
              <TabsContent value="transfers" keepMounted>
                <AssetLifecycleHistory detail={detail} options={options} type="transfer" onOpen={setReviewEvent} />
              </TabsContent>
              <TabsContent value="documents" keepMounted>
                <AssetAttachments
                  detail={detail}
                  onUploaded={async () => {
                    setDetail(await api.getFixedAsset(asset.id, company));
                  }}
                />
              </TabsContent>
              <TabsContent value="audit" keepMounted className="flex flex-col gap-4 [&[hidden]]:hidden">
                <Section title="Asset history">
                  <div className="col-span-full">
                    <p className="mb-2 text-sm text-muted-foreground">
                      Newest evidence first. Page {Math.floor(detail.history_offset / 100) + 1}.
                    </p>
                    <div className="mb-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || detail.history_offset === 0}
                        onClick={() =>
                          fire(
                            async () =>
                              setDetail(
                                await api.getFixedAsset(asset.id, company, Math.max(0, detail.history_offset - 100)),
                              ),
                            "History page loaded.",
                          )
                        }
                      >
                        Newer evidence
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || detail.history_next_offset === null}
                        onClick={() =>
                          fire(
                            async () =>
                              setDetail(await api.getFixedAsset(asset.id, company, detail.history_next_offset ?? 0)),
                            "History page loaded.",
                          )
                        }
                      >
                        Older evidence
                      </Button>
                    </div>
                    <WorkTable tableId="asset-history" label="Immutable asset history">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Action</th>
                          <th>Actor</th>
                          <th>Reason</th>
                          <th>Evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.history.map((event) => (
                          <tr key={event.id}>
                            <td>{new Date(event.at).toLocaleString()}</td>
                            <td>{event.action.replaceAll("_", " ")}</td>
                            <td>{event.actor_id}</td>
                            <td>{event.reason}</td>
                            <td>
                              <details>
                                <summary className="cursor-pointer">Before / after</summary>
                                <pre className="max-w-md overflow-auto whitespace-pre-wrap break-all text-xs">
                                  {JSON.stringify({ before: event.before, after: event.after }, null, 2)}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </WorkTable>
                  </div>
                </Section>
                <Section title="Lifecycle transactions">
                  <p className="col-span-full text-sm text-muted-foreground">
                    Latest 1,000 transactions. The complete before/after evidence is available in the paginated asset
                    history.
                  </p>
                  <div className="col-span-full flex flex-wrap gap-2">
                    {detail.events.map((event) => (
                      <Button key={event.id} variant="outline" onClick={() => setReviewEvent(event)}>
                        {event.code} · {lifecycleLabels[event.type]} · {event.state}
                      </Button>
                    ))}
                    {!detail.events.length && (
                      <p className="text-sm text-muted-foreground">No lifecycle transactions recorded.</p>
                    )}
                  </div>
                </Section>
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
      {isReport && options && (
        <>
          <Section title="Report selection">
            <Field label="Report">
              <Select
                value={report}
                items={reportNames.map((name) => ({ id: name, name }))}
                onChange={(e) => {
                  setReport(e.target.value);
                  setAssignmentFilter("");
                  setOffset(0);
                }}
              />
            </Field>
            <Field label="Acquisition from">
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            <Field label="Acquisition to">
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setOffset(0);
                }}
              />
            </Field>
            {["Locations", "Custodians", "Departments", "Projects"].includes(report) && (
              <Field label={report}>
                <Select
                  placeholder="All"
                  value={assignmentFilter}
                  items={
                    options[
                      {
                        Locations: "locations",
                        Custodians: "employees",
                        Departments: "departments",
                        Projects: "projects",
                      }[report] as "locations" | "employees" | "departments" | "projects"
                    ]
                  }
                  onChange={(e) => {
                    setAssignmentFilter(e.target.value);
                    setOffset(0);
                  }}
                />
              </Field>
            )}
            <Button
              variant="outline"
              disabled={!permissions.has("assets.asset.report")}
              onClick={() => {
                if (report === "Vendor Refund Outstanding")
                  exportCsv("asset-refunds-outstanding-page.csv", [
                    ["Asset", "Name", "Supplier", "Return", "Date", "Return amount", "Outstanding"],
                    ...(dashboard?.refunds ?? []).map((row) => [
                      row.asset_code,
                      row.asset_name,
                      row.supplier_name,
                      row.return_code,
                      row.date,
                      row.amount,
                      row.outstanding,
                    ]),
                  ]);
                else if (reportEvents[report])
                  exportCsv("asset-events-page.csv", [
                    ["Reference", "Asset", "Type", "Date", "Amount", "State"],
                    ...(workspace?.events ?? []).map((row) => [
                      row.code,
                      row.asset_code,
                      row.type,
                      row.date,
                      row.preview.amount,
                      row.state,
                    ]),
                  ]);
                else if (assetGroupReports[report] && dashboard)
                  exportCsv("asset-groups-page.csv", [
                    ["Group", "Assets", "Cost", "Depreciation", "Impairment", "Net book value"],
                    ...dashboard.groups
                      .filter((row) => row.dimension === assetGroupReports[report])
                      .map((row) => [
                        row.label,
                        row.count,
                        row.cost,
                        row.accumulated_depreciation,
                        row.impairment,
                        row.net_book_value,
                      ]),
                  ]);
                else
                  exportCsv("asset-register-page.csv", [
                    [
                      "Code",
                      "Name",
                      "Category",
                      "Date",
                      "Cost",
                      "Accumulated depreciation",
                      "Impairment",
                      "Net book value",
                      "Status",
                    ],
                    ...rows.map((row) => [
                      row.code,
                      row.details.name,
                      row.category_name,
                      row.acquisition_date,
                      row.cost,
                      row.accumulated_depreciation,
                      row.impairment,
                      row.net_book_value,
                      row.status,
                    ]),
                  ]);
              }}
            >
              Export current report page
            </Button>
          </Section>
          {!permissions.has("assets.asset.report") ? (
            <Alert>
              <AlertDescription>
                Asset report permission is required to export or view financial reconciliation.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {report === "Depreciation Schedule" ? (
                <p className="text-sm text-muted-foreground">
                  Open an asset below for its complete posted and projected schedule, with a full schedule export.
                </p>
              ) : null}
              {report === "Vendor Refund Outstanding" && dashboard ? (
                <>
                  <WorkTable
                    tableId="asset-refunds-outstanding"
                    label="Vendor refund outstanding"
                    aria-label="Vendor refund outstanding"
                    tools={false}
                    paging={false}
                  >
                    <thead>
                      <tr>
                        {["Asset", "Supplier", "Return", "Date", "Return amount", "Outstanding", "Actions"].map(
                          (label) => (
                            <th key={label}>{label}</th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.refunds.map((row) => (
                        <tr key={row.return_code}>
                          <td>
                            {row.asset_code} · {row.asset_name}
                          </td>
                          <td>{row.supplier_name}</td>
                          <td>{row.return_code}</td>
                          <td>{row.date}</td>
                          <td>{moneyLabel(row.amount, dp)}</td>
                          <td>{moneyLabel(row.outstanding, dp)}</td>
                          <td>
                            <Button variant="outline" size="sm" onClick={() => goto("asset-register", row.asset_id)}>
                              Open asset
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!dashboard.refunds.length && (
                        <tr>
                          <td colSpan={7}>No outstanding refunds on this page.</td>
                        </tr>
                      )}
                    </tbody>
                  </WorkTable>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={busy || offset === 0}
                      onClick={() => setOffset((current) => Math.max(0, current - limit))}
                    >
                      Previous refunds
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || dashboard.refunds_next_offset === null}
                      onClick={() => setOffset(dashboard.refunds_next_offset ?? offset)}
                    >
                      Next refunds
                    </Button>
                  </div>
                </>
              ) : reportEvents[report] ? (
                eventsTable()
              ) : assetGroupReports[report] && dashboard ? (
                <>
                  <AssetGroupReport
                    dashboard={dashboard}
                    report={report}
                    dp={dp}
                    busy={busy}
                    offset={offset}
                    limit={limit}
                    onOffset={setOffset}
                    onDrill={(id) => {
                      if (assetGroupReports[report] === "category") setCategoryFilter(id);
                      else setAssignmentFilter(id);
                      setOffset(0);
                    }}
                  />
                  {(categoryFilter || assignmentFilter) && registerTable()}
                </>
              ) : (
                registerTable()
              )}
              {dashboard && (
                <Section
                  title="Report totals and company GL reconciliation"
                  description="Register totals follow the filters. Reconciliation covers the complete company register; differences expose unregistered acquisitions or other account activity."
                >
                  <div>
                    <p className="text-xs text-muted-foreground">Filtered cost / depreciation / NBV</p>
                    <p className="text-sm">
                      {moneyLabel(dashboard.cost, dp)} / {moneyLabel(dashboard.accumulated_depreciation, dp)} /{" "}
                      {moneyLabel(dashboard.net_book_value, dp)} {options.base_currency}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor credit / refund outstanding</p>
                    <p className="text-sm">{moneyLabel(dashboard.refund_outstanding, dp)}</p>
                  </div>
                  <div className="col-span-full">
                    <WorkTable
                      tableId="asset-gl-reconciliation"
                      label="Asset to GL reconciliation"
                      tools={false}
                      paging={false}
                    >
                      <thead>
                        <tr>
                          <th>Control account</th>
                          <th>Register</th>
                          <th>General Ledger</th>
                          <th>Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.reconciliation.map((row) => (
                          <tr key={`${row.role}:${row.account_id}`}>
                            <td>{row.account_name}</td>
                            <td>{moneyLabel(row.register_balance, dp)}</td>
                            <td>{moneyLabel(row.gl_balance, dp)}</td>
                            <td>{moneyLabel(row.difference, dp)}</td>
                          </tr>
                        ))}
                        {!dashboard.reconciliation.length && (
                          <tr>
                            <td colSpan={4}>No registered accounting balances.</td>
                          </tr>
                        )}
                      </tbody>
                    </WorkTable>
                  </div>
                </Section>
              )}
            </>
          )}
        </>
      )}
      {!registration &&
        !type &&
        !isReport &&
        !["assets-dashboard", "asset-classes", "asset-policies", "asset-detail", "depreciation-run"].includes(page) &&
        registerTable()}
    </div>
  );
}
