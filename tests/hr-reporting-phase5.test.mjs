/** HR Phase 5 — governed reporting, compliance, scope and integration. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const stamp = `${process.pid}-${Date.now()}`;
async function load(name) {
  const url = new URL(`../app/${name}`, import.meta.url);
  url.searchParams.set("test", stamp);
  return import(url.href);
}

test("Phase 5 exposes the complete 45-report catalogue once", async () => {
  const reporting = await load("hr-reporting-data.ts");
  assert.equal(reporting.hrReportDefinitions.length, 45);
  assert.equal(new Set(reporting.phase5ReportIds).size, 45);
  assert.deepEqual(
    Object.fromEntries(["HR", "Attendance", "Leave", "Payroll", "Payroll accounting"].map((domain) => [domain, reporting.hrReportDefinitions.filter((row) => row.domain === domain).length])),
    { HR: 11, Attendance: 9, Leave: 6, Payroll: 13, "Payroll accounting": 6 },
  );
  for (const definition of reporting.hrReportDefinitions) {
    assert.ok(definition.source.length > 5);
    assert.ok(definition.dimensions.length > 0);
    assert.ok(definition.metrics.length > 0);
    assert.ok(definition.drillTarget.moduleId);
    assert.ok(definition.drillTarget.pageId);
  }
});

test("reports compose existing HR sources instead of duplicating transactional engines", async () => {
  const source = await readFile(new URL("../app/hr-reporting-data.ts", import.meta.url), "utf8");
  for (const dependency of ["hr-core-data", "hr-attendance-data", "hr-payroll-data"]) {
    assert.ok(source.includes(`from "./${dependency}.ts"`));
  }
  assert.match(source, /closedRuns\.at\(-1\)/, "payroll reporting must read the finalized snapshot");
  assert.match(source, /buildPayrollJournal/, "accounting reporting must reuse the payroll journal builder");
  assert.doesNotMatch(source, /function calculateEmployee|function processDay/, "Phase 5 must not recreate Phase 2/3 calculations");
});

test("company, branch and department scope cannot exceed actor authorization", async () => {
  const reporting = await load("hr-reporting-data.ts");
  const viewer = reporting.reportActorForRole("Read-only Viewer");
  assert.deepEqual(reporting.validateReportScope(viewer, reporting.defaultReportFilters), []);
  assert.match(
    reporting.validateReportScope(viewer, { ...reporting.defaultReportFilters, branchId: "ORG-BR-002" }).join(" "),
    /outside the user's authorized scope/i,
  );
  assert.match(
    reporting.validateReportScope(viewer, { ...reporting.defaultReportFilters, companyId: "ORG-CO-999" }).join(" "),
    /company/i,
  );
  assert.match(
    reporting.validateReportScope(viewer, { ...reporting.defaultReportFilters, fromDate: "2026-09-30", toDate: "2026-09-01" }).join(" "),
    /from date/i,
  );
});

test("sensitive views and exports require distinct permissions and remain auditable", async () => {
  const reporting = await load("hr-reporting-data.ts");
  const employee = reporting.reportDefinition("employee-list-report");
  const payroll = reporting.reportDefinition("payroll-register-report");
  const accounting = reporting.reportDefinition("payroll-general-ledger-report");
  assert.ok(employee && payroll && accounting);

  const viewer = reporting.reportActorForRole("Read-only Viewer");
  assert.equal(reporting.canViewReport(viewer, employee), true);
  assert.equal(reporting.canViewReport(viewer, payroll), false);
  assert.equal(reporting.canExportReport(viewer, employee, "CSV"), false);

  const hr = reporting.reportActorForRole("HR Manager");
  assert.equal(reporting.canViewReport(hr, payroll), true);
  assert.equal(reporting.canViewReport(hr, accounting), false);
  assert.equal(reporting.canExportReport(hr, payroll, "Excel"), true);

  const cfo = reporting.reportActorForRole("Chief Financial Officer");
  assert.equal(reporting.canViewReport(cfo, accounting), true);
  const event = reporting.buildReportAuditEvent(cfo, accounting, reporting.defaultReportFilters, "Exported PDF");
  assert.equal(event.outcome, "Allowed");
  assert.equal(event.actorName, "Chief Financial Officer");
  assert.equal(event.reportName, "General Ledger");
  assert.equal(event.action, "Exported PDF");
  assert.deepEqual(event.filters, reporting.defaultReportFilters);
  assert.ok(event.occurredAt);
});

test("compliance remains versioned, effective-dated and outside core payroll constants", async () => {
  const reporting = await load("hr-reporting-data.ts");
  assert.deepEqual(new Set(reporting.complianceConfigurations.map((row) => row.kind)), new Set(["Tax", "Contribution", "Payroll rule", "Eligibility"]));
  for (const config of reporting.complianceConfigurations) {
    assert.equal(config.companyId, "ORG-CO-001");
    assert.ok(config.effectiveFrom);
    assert.ok(config.employeeEligibility);
    assert.ok(config.version >= 1);
    assert.ok(Object.keys(config.parameters).length > 0);
  }
  const tax = reporting.effectiveCompliance("Tax", "ORG-CO-001", "2026-09-01");
  assert.equal(tax?.status, "Approved");
  assert.equal(reporting.effectiveCompliance("Tax", "ORG-CO-999", "2026-09-01"), undefined);
});

test("closed payroll reports reconcile to the existing balanced journal", async () => {
  const reporting = await load("hr-reporting-data.ts");
  const payroll = reporting.buildReportSnapshot("payroll-register-report");
  const ledger = reporting.buildReportSnapshot("payroll-general-ledger-report");
  const finance = reporting.financePayrollDashboardSnapshot();
  assert.equal(payroll?.sourceState, "2026-08 closed payroll");
  assert.equal(ledger?.sourceState, "2026-08 closed payroll");
  assert.ok(payroll && payroll.rows.length > 0);
  assert.ok(ledger && ledger.rows.length > 0);
  assert.equal(finance.journal?.balanced, true);
  assert.equal(finance.journal?.totalDebit, finance.journal?.totalCredit);
  assert.ok(finance.payrollByDepartment.length > 0);
});

test("Phase 5 navigation and screens are explicitly wired before generic reports", async () => {
  const [reporting, navigation, content, workspace, layout] = await Promise.all([
    load("hr-reporting-data.ts"),
    readFile(new URL("../app/prototype-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hr-reporting-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  for (const pageId of reporting.phase5ReportIds) assert.match(navigation, new RegExp(`p\\(\\"${pageId}\\"`));
  for (const pageId of ["hr-dashboard", "finance-payroll-dashboard", "hr-report-centre", "hr-compliance-configuration", "hr-report-audit-log", "hr-export-centre"]) {
    assert.match(navigation, new RegExp(`p\\(\\"${pageId}\\"`));
  }
  assert.match(content, /isHrReportingPage/);
  assert.ok(content.indexOf("isHrReportingPage(context.pageId)") < content.indexOf("isReportsWorkspacePage(context.pageId)"));
  assert.match(workspace, /PDF/);
  assert.match(workspace, /Excel/);
  assert.match(workspace, /CSV/);
  assert.match(workspace, /Summary → detail → source transaction/);
  assert.match(layout, /hr-reporting\.css/);
});
