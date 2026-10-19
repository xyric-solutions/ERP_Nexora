import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { hrMasters } from "../app/features/hr/model/hr-core-data.ts";
import { phase5ReportIds } from "../app/features/hr/model/hr-reporting-data.ts";
import { prototypeModules } from "../app/shell/config/prototype-data.ts";

const parityDirectoryUrl = new URL("../docs/parity/", import.meta.url);
const manifestUrl = new URL("prototype-manifest.json", parityDirectoryUrl);
const hrParityUrl = new URL("hr-screen-parity.csv", parityDirectoryUrl);

const reportingPageIds = new Set([
  "hr-dashboard",
  "finance-payroll-dashboard",
  "hr-report-centre",
  "hr-compliance-configuration",
  "hr-report-audit-log",
  "hr-export-centre",
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
        pages: group.pages.map((page) => ({ ...page })),
      })),
    })),
  };
}

function productionModuleFor(groupId, pageId) {
  if (groupId === "organisation") return "M03 Organisation";
  if (groupId === "people") return ["hr-dashboard", "finance-payroll-dashboard"].includes(pageId) ? "M17 Reporting & Compliance" : "M04 Employee Core";
  if (groupId === "recruitment") return pageId === "manpower-requisitions" ? "M05 Manpower Planning" : "M06 Recruitment";
  if (groupId === "attendance-shifts") return "M11 Time & Attendance";
  if (groupId === "time-leave") return pageId === "attendance" ? "M11 Time & Attendance" : "M12 Leave";
  if (groupId === "payroll") return ["payroll-journal", "payment-batch"].includes(pageId) ? "M15 Payments & Finance" : "M13 Payroll & Statutory";
  if (["performance", "learning"].includes(groupId)) return "M08 Manage & Develop";
  if (groupId === "employee-lifecycle") {
    if (["onboarding", "probation-reviews"].includes(pageId)) return "M07 Hire, Onboard & Probation";
    if (pageId === "employee-movements") return "M09 Move & Reward";
    return "M10 Separation & Settlement";
  }
  if (groupId === "benefits-self-service") {
    if (pageId === "employee-self-service") return "M16 Self-service";
    if (pageId === "hr-report-centre") return "M17 Reporting & Compliance";
    return "M14 Benefits & Loans";
  }
  if (groupId === "hr-compliance") return pageId === "hr-report-audit-log" ? "M02 Workflow & Audit" : "M17 Reporting & Compliance";
  throw new Error(`No production module mapping for ${groupId}/${pageId}`);
}

export async function buildHrParityRows() {
  const hrModule = prototypeModules.find((module) => module.id === "hr");
  if (!hrModule) throw new Error("The prototype catalogue does not define the HR module");
  const sets = await rendererPageSets();
  return hrModule.groups.flatMap((group) => group.pages.map((page) => {
    let renderer = "ListView (generic fallback)";
    if (page.id === "org-structure") renderer = "HrOrganizationStructureWorkspace";
    else if (page.id === "hr-dashboard") renderer = "HrDashboardWorkspace";
    else if (page.id === "finance-payroll-dashboard") renderer = "HrFinancePayrollDashboardWorkspace";
    else if (page.id === "employees") renderer = "HrEmployeeDirectory";
    else if (page.id === "employee-record") renderer = "HrEmployeeRecordWorkspace";
    else if (page.id === "positions-org") renderer = "HrPositionsOrganizationWorkspace";
    else if (page.id === "manpower-requisitions") renderer = "HrManpowerRequisitionsWorkspace";
    else if (page.id === "job-openings") renderer = "HrJobOpeningsWorkspace";
    else if (page.id === "add-employee") renderer = "HrEmployeeDraftForm";
    else if (page.id === "employee-drafts") renderer = "HrEmployeeDraftsWorkspace";
    else if (page.id === "employee-approvals") renderer = "HrEmployeeApprovalsWorkspace";
    else if (page.id === "employee-contacts") renderer = "HrEmployeeContactsWorkspace";
    else if (page.id === "employee-emergency-contacts") renderer = "HrEmployeeEmergencyContactsWorkspace";
    else if (page.id === "employee-documents") renderer = "HrEmployeeDocumentsWorkspace";
    else if (page.id === "employee-assignments") renderer = "HrEmployeeAssignmentsWorkspace";
    else if (page.id === "employee-status-history") renderer = "HrEmployeeHistoryWorkspace";
    else if (page.id === "designations") renderer = "HrMasterCatalogueWorkspace";
    else if (page.id === "job-grades") renderer = "HrJobGradesWorkspace";
    else if (page.id === "jobs") renderer = "HrJobsWorkspace";
    else if (["cost-centres", "work-locations", "employment-types", "employee-categories"].includes(page.id)) renderer = "HrConfiguredMasterWorkspace";
    else if (sets.masters.has(page.id)) renderer = "HrMasterScreen";
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
      audit_status: page.status === "live" ? "LIVE_API_AUDITED" : renderer.includes("generic fallback") ? "GENERIC_FALLBACK" : "DEDICATED_MOCK",
      production_module: productionModuleFor(group.id, page.id),
    };
  }));
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
    "audit_status",
    "production_module",
  ];
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")}\n`;
}

async function expectedOutputs() {
  const [manifest, hrRows] = await Promise.all([Promise.resolve(buildManifest()), buildHrParityRows()]);
  return {
    manifest: serializeManifest(manifest),
    hrParity: serializeHrParity(hrRows),
  };
}

async function checkOutputs(outputs) {
  const [manifest, hrParity] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    readFile(hrParityUrl, "utf8"),
  ]);
  const mismatches = [];
  if (manifest !== outputs.manifest) mismatches.push(fileURLToPath(manifestUrl));
  if (hrParity !== outputs.hrParity) mismatches.push(fileURLToPath(hrParityUrl));
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
  ]);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
