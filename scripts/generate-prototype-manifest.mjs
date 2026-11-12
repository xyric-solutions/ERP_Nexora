import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { hrMasters } from "../app/features/hr/model/hr-core-data.ts";
import { phase5ReportIds } from "../app/features/hr/model/hr-reporting-data.ts";
import { prototypeModules } from "../app/shell/config/prototype-data.ts";

const parityDirectoryUrl = new URL("../docs/parity/", import.meta.url);
const manifestUrl = new URL("prototype-manifest.json", parityDirectoryUrl);
const hrParityUrl = new URL("hr-screen-parity.csv", parityDirectoryUrl);
const hrApiCoverageUrl = new URL("hr-api-coverage.md", parityDirectoryUrl);

const hrNavigationPages = new Set([
  "organisation-masters",
  "people-workspace",
  "recruitment-workspace",
  "attendance-workspace",
  "time-leave-workspace",
  "payroll-workspace",
  "employee-lifecycle-workspace",
]);

const reportingPageIds = new Set([
  "hr-dashboard",
  "finance-payroll-dashboard",
  ...phase5ReportIds,
]);

async function extractStringArray(relativePath, exportName) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const match = source.match(new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\] as const;`));
  if (!match) throw new Error(`Could not find ${exportName} in ${relativePath}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

async function rendererPageSets() {
  const [attendance, lifecycle, payroll] = await Promise.all([
    extractStringArray("../app/features/hr/views/hr-attendance-screens.tsx", "HR_ATTENDANCE_PAGES"),
    extractStringArray("../app/features/hr/views/hr-lifecycle-screens.tsx", "HR_LIFECYCLE_PAGES"),
    extractStringArray("../app/features/hr/views/hr-payroll-screens.tsx", "HR_PAYROLL_PAGES"),
  ]);
  return {
    attendance: new Set(attendance),
    lifecycle: new Set(lifecycle),
    payroll: new Set(payroll),
    masters: new Set(hrMasters.map((master) => master.pageId)),
  };
}

export function buildManifest() {
  const groupCount = prototypeModules.reduce((total, module) => total + module.groups.length, 0);
  const pageCount = prototypeModules.reduce(
    (total, module) => total + module.groups.reduce((groupTotal, group) => groupTotal + group.pages.length, 0),
    0,
  );
  return {
    schemaVersion: 1,
    source: "app/prototype-data.ts",
    counts: {
      modules: prototypeModules.length,
      groups: groupCount,
      pages: pageCount,
    },
    modules: prototypeModules.map((module) => ({
      id: module.id,
      code: module.code,
      label: module.label,
      category: module.category,
      modes: [...module.modes],
      groups: module.groups.map((group) => ({
        id: group.id,
        label: group.label,
        ...(group.hiddenFromNavigation ? { hiddenFromNavigation: true } : {}),
        pages: group.pages.map((page) => ({
          id: page.id,
          label: page.label,
          archetype: page.archetype,
          status: page.status,
          ...(page.hiddenFromNavigation ? { hiddenFromNavigation: true } : {}),
        })),
      })),
    })),
  };
}

function productionModuleFor(groupId, pageId) {
  if (groupId === "organisation") return "M03 Organisation";
  if (groupId === "people")
    return ["hr-dashboard", "finance-payroll-dashboard"].includes(pageId)
      ? "M17 Reporting & Compliance"
      : "M04 Employee Core";
  if (groupId === "recruitment")
    return pageId === "manpower-requisitions" ? "M05 Manpower Planning" : "M06 Recruitment";
  if (groupId === "attendance-leave")
    return [
      "time-leave-workspace",
      "leave-types",
      "leave-balances",
      "leave-requests",
      "leave-request",
      "leave-approval",
    ].includes(pageId)
      ? "M12 Leave"
      : "M11 Time & Attendance";
  if (groupId === "payroll")
    return ["payroll-journal", "payment-batch"].includes(pageId) ? "M15 Payments & Finance" : "M13 Payroll & Statutory";
  if (groupId === "employee-lifecycle") {
    if (["onboarding", "probation-reviews"].includes(pageId)) return "M07 Hire, Onboard & Probation";
    if (["employee-movements", "employee-promotions"].includes(pageId)) return "M09 Move & Reward";
    if (pageId === "loans-benefits" || pageId === "advance-requests") return "M14 Benefits & Loans";
    return "M10 Separation & Settlement";
  }
  throw new Error(`No production module mapping for ${groupId}/${pageId}`);
}

export async function buildHrParityRows() {
  const hrModule = prototypeModules.find((module) => module.id === "hr");
  if (!hrModule) throw new Error("The prototype catalogue does not define the HR module");
  const sets = await rendererPageSets();
  return hrModule.groups.flatMap((group) =>
    group.pages.map((page) => {
      let renderer = "ListView (generic fallback)";
      if (
        [
          "attendance-workspace",
          "time-leave-workspace",
          "payroll-workspace",
          "employee-lifecycle-workspace",
        ].includes(page.id)
      )
        renderer = "HrOperationsWorkspace";
      else if (page.id === "recruitment-workspace") renderer = "HrRecruitmentWorkspace";
      else if (page.id === "people-workspace") renderer = "HrPeopleWorkspace";
      else if (page.id === "organisation-masters") renderer = "HrOrganisationMastersWorkspace";
      else if (page.id === "org-structure") renderer = "HrOrganizationStructureSheetWorkspace";
      else if (page.id === "hr-dashboard") renderer = "HrDashboardWorkspace";
      else if (page.id === "finance-payroll-dashboard") renderer = "HrFinancePayrollDashboardWorkspace";
      else if (page.id === "employees") renderer = "HrEmployeeDirectory";
      else if (page.id === "employee-record") renderer = "HrEmployeeRecordWorkspace";
      else if (page.id === "positions-org") renderer = "HrPositionsOrganizationWorkspace";
      else if (page.id === "manpower-requisitions") renderer = "HrManpowerRequisitionsWorkspace";
      else if (page.id === "job-openings") renderer = "HrJobOpeningsWorkspace";
      else if (page.id === "create-employee-from-offer") renderer = "HrOfferEmployeeWorkspace";
      // attendance-payroll-inputs is a former address that now opens Attendance Period Close.
      else if (["overtime", "attendance-period", "attendance-payroll-inputs"].includes(page.id))
        renderer = "HrAttendanceCompletionWorkspace";
      else if (["leave-types", "leave-balances", "leave-requests", "leave-request", "leave-approval"].includes(page.id))
        renderer = "HrTimeLeaveWorkspace";
      else if (["payroll-runs", "payroll-validation"].includes(page.id)) renderer = "HrPayrollRunsWorkspace";
      else if (page.id === "payslips") renderer = "HrPayslipsWorkspace";
      else if (page.id === "payroll-journal") renderer = "HrPayrollJournalWorkspace";
      else if (page.id === "payment-batch") renderer = "HrPayrollPaymentWorkspace";
      else if (
        [
          "payroll-setup",
          "salary-structures",
          "salary-revisions",
          "payroll-inputs",
          "employee-loans",
          "payroll-runs",
          "payroll-validation",
          "payroll-journal",
          "payment-batch",
          "payslips",
        ].includes(page.id)
      )
        renderer = "HrPayrollWorkspace";
      else if (page.id === "attendance") renderer = "HrDailyAttendanceWorkspace";
      else if (page.id === "attendance-corrections") renderer = "HrAttendanceCorrectionsWorkspace";
      else if (page.id === "monthly-attendance") renderer = "HrMonthlyAttendanceWorkspace";
      else if (page.id === "attendance-check-in") renderer = "HrAttendanceCheckInWorkspace";
      else if (page.id === "my-attendance") renderer = "HrMyAttendanceWorkspace";
      else if (page.id === "daily-attendance") renderer = "HrDailyAttendanceWorkspace";
      else if (page.id === "shift-assignments") renderer = "HrShiftAssignmentsWorkspace";
      else if (page.id === "shifts") renderer = "HrShiftsWorkspace";
      else if (page.id === "offers") renderer = "HrOfferManagementWorkspace";
      else if (page.id === "interviews") renderer = "HrInterviewsWorkspace";
      else if (page.id === "recruitment-pipeline") renderer = "HrRecruitmentPipelineWorkspace";
      else if (page.id === "candidates") renderer = "HrCandidateDirectoryWorkspace";
      else if (page.id === "add-employee") renderer = "HrEmployeeDraftForm";
      else if (page.id === "employee-drafts") renderer = "HrEmployeeDraftsWorkspace";
      else if (page.id === "employee-approvals") renderer = "HrEmployeeApprovalsWorkspace";
      else if (page.id === "employee-contacts") renderer = "HrEmployeeContactsWorkspace";
      else if (page.id === "employee-emergency-contacts") renderer = "HrEmployeeEmergencyContactsWorkspace";
      else if (page.id === "employee-documents") renderer = "HrEmployeeDocumentsWorkspace";
      else if (page.id === "employee-assignments") renderer = "HrEmployeeAssignmentsWorkspace";
      else if (page.id === "employee-status-history") renderer = "HrEmployeeHistoryWorkspace";
      else if (page.id === "lifecycle-policies") renderer = "HrLifecyclePoliciesWorkspace";
      else if (["loans-benefits", "advance-requests"].includes(page.id)) renderer = "HrLoanBenefitsWorkspace";
      else if (page.id === "designations") renderer = "HrMasterCatalogueSheetWorkspace";
      else if (page.id === "job-grades") renderer = "HrJobGradesSheetWorkspace";
      else if (page.id === "jobs") renderer = "HrMasterCatalogueSheetWorkspace";
      else if (
        ["cost-centres", "work-locations", "employment-setup", "employment-types", "employee-categories"].includes(
          page.id,
        )
      )
        renderer = "HrConfiguredMasterSheetWorkspace";
      else if (sets.masters.has(page.id)) renderer = "HrMasterScreen";
      else if (
        [
          "onboarding",
          "probation-reviews",
          "resignations",
          "terminations",
          "clearance",
        ].includes(page.id)
      )
        renderer = "HrLifecycleCasesWorkspace";
      else if (["employee-movements", "employee-promotions"].includes(page.id)) renderer = "HrEmployeeChangesWorkspace";
      else if (sets.lifecycle.has(page.id)) renderer = "HrLifecycleScreen";
      else if (sets.payroll.has(page.id)) renderer = "HrPayrollScreen";
      else if (sets.attendance.has(page.id)) renderer = "HrAttendanceScreen";
      else if (reportingPageIds.has(page.id)) renderer = "HrReportingWorkspace";
      return {
        module_id: hrModule.id,
        group_id: group.id,
        group_label: group.label,
        page_id: page.id,
        page_label: page.label,
        archetype: page.archetype,
        catalogue_status: page.status,
        current_renderer: renderer,
        api_integration: hrNavigationPages.has(page.id)
          ? "NAVIGATION_ONLY"
          : [
                "ListView (generic fallback)",
                "HrLifecycleScreen",
                "HrPayrollScreen",
                "HrAttendanceScreen",
                "HrMasterScreen",
              ].includes(renderer)
            ? "MOCK_OR_UNLINKED"
            : page.status === "read-only"
              ? "API_READ_ONLY"
              : "API_CONNECTED_SOURCE",
        audit_status: hrNavigationPages.has(page.id)
          ? "NAVIGATION_ONLY"
          : page.status === "in-progress"
            ? "CONNECTED_API_IN_PROGRESS"
            : page.status === "live"
              ? "API_SOURCE_LINK_VERIFIED"
              : page.status === "read-only"
                ? "READ_ONLY_API_SOURCE_LINK_VERIFIED"
                : renderer.includes("generic fallback")
                  ? "GENERIC_FALLBACK"
                  : "DEDICATED_MOCK",
        production_module: productionModuleFor(group.id, page.id),
      };
    }),
  );
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeHrParity(rows) {
  const headers = [
    "module_id",
    "group_id",
    "group_label",
    "page_id",
    "page_label",
    "archetype",
    "catalogue_status",
    "current_renderer",
    "api_integration",
    "audit_status",
    "production_module",
  ];
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")}\n`;
}

export function serializeHrApiCoverage(rows) {
  const count = (status) => rows.filter((row) => row.api_integration === status).length;
  const missing = rows.filter((row) => row.api_integration === "MOCK_OR_UNLINKED");
  return [
    "# HR page API coverage",
    "",
    "Generated from the active route renderer map. Regenerate with `npm run catalogue:generate`.",
    "",
    `Of ${rows.length} HR catalogue routes: ${count("API_CONNECTED_SOURCE")} connect to API-backed views, ${count("API_READ_ONLY")} use read-only API views, ${count("NAVIGATION_ONLY")} are navigation hubs, and ${missing.length} are mock or unlinked views.`,
    "",
    missing.length
      ? `Pages left to connect: ${missing.map((r) => r.page_id).join(", ")}.`
      : "Pages left to connect to an API: none in the current HR catalogue. Navigation hubs link to their connected child pages and do not need their own mutation API.",
    "",
    "Source evidence: `app/shell/prototype-content.tsx` selects the renderers below; their HR reads and mutations use `app/features/hr/api/hr-client.ts`, the generated API client and `server/api/src/modules/hr/router.ts` plus the HR feature routers. API_CONNECTED_SOURCE describes implemented wiring, not production certification or a fresh end-to-end test of every workflow. Payment Batch supports governed salary obligations and actual posted Bank Payment confirmation at exact carrying-value parity. FX allocation, external transfer transmission and corrections after confirmed settlement remain separate workflows. Unused legacy mock components and the organisation demo are not active catalogue pages.",
    "",
    "| Section | Page | Route | Active renderer | API integration |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.group_label} | ${r.page_label} | \`/#/hr/${r.page_id}\` | \`${r.current_renderer}\` | ${r.api_integration} |`,
    ),
    "",
  ].join("\n");
}

async function expectedOutputs() {
  const [manifest, hrRows] = await Promise.all([Promise.resolve(buildManifest()), buildHrParityRows()]);
  return {
    manifest: serializeManifest(manifest),
    hrParity: serializeHrParity(hrRows),
    hrApiCoverage: serializeHrApiCoverage(hrRows),
  };
}

async function checkOutputs(outputs) {
  const [manifest, hrParity, hrApiCoverage] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    readFile(hrParityUrl, "utf8"),
    readFile(hrApiCoverageUrl, "utf8"),
  ]);
  const mismatches = [];
  if (manifest !== outputs.manifest) mismatches.push(fileURLToPath(manifestUrl));
  if (hrParity !== outputs.hrParity) mismatches.push(fileURLToPath(hrParityUrl));
  if (hrApiCoverage !== outputs.hrApiCoverage) mismatches.push(fileURLToPath(hrApiCoverageUrl));
  if (mismatches.length) throw new Error(`Generated catalogue artifacts are stale: ${mismatches.join(", ")}`);
}

async function main() {
  const outputs = await expectedOutputs();
  if (process.argv.includes("--check")) {
    await checkOutputs(outputs);
    return;
  }
  await mkdir(parityDirectoryUrl, { recursive: true });
  await Promise.all([
    writeFile(manifestUrl, outputs.manifest, "utf8"),
    writeFile(hrParityUrl, outputs.hrParity, "utf8"),
    writeFile(hrApiCoverageUrl, outputs.hrApiCoverage, "utf8"),
  ]);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
