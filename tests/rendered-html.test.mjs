import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("../app/", import.meta.url));
const approvedManifest = JSON.parse(
  await readFile(new URL("../docs/parity/prototype-manifest.json", import.meta.url), "utf8"),
);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function collectApplicationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectApplicationFiles(path);
      return [path];
    }),
  );
  return nested.flat();
}

test("server-renders the branded Nexora ERP web application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>[^<]*Nexora ERP[^<]*Enterprise Operations[^<]*<\/title>/i);
  assert.match(html, /Nexora ERP/i);
  assert.match(html, /UI\/UX prototype/i);
  assert.match(html, /Mock-only review/i);
  assert.match(html, new RegExp(`${approvedManifest.counts.modules} modules`, "i"));
  assert.match(html, new RegExp(`${approvedManifest.counts.pages}(?:<!-- -->)? mock screens`, "i"));
  assert.match(html, /No APIs/i);
  assert.match(html, /No Demo Account data/i);
  const expectedCharts = [
    "trend-comparison",
    "contribution-bridge",
    "stage-funnel",
    "distribution-snapshot",
    "driver-benchmark",
    "composition-treemap",
    "composition-trend",
    "capability-radar",
    "target-gauges",
    "density-heatmap",
    "relationship-scatter",
    "direct-indirect-cost",
    "project-income-cost",
    "location-income-cost",
    "department-income-cost",
    "product-unit-cost",
    "price-variance-products",
  ];
  assert.equal((html.match(/data-dashboard-chart=/g) ?? []).length, expectedCharts.length);
  for (const chart of expectedCharts) {
    assert.match(html, new RegExp(`data-dashboard-chart="${chart}"`), `missing dashboard chart ${chart}`);
  }
  // Every chart must ship a screen-reader equivalent, never a picture alone.
  assert.ok((html.match(/<table class="nx-sr-only">/g) ?? []).length >= 8, "charts must expose accessible data tables");
  assert.equal((html.match(/data-management-insight=/g) ?? []).length, 3);
  assert.match(html, /Management insights/i);

  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
  assert.doesNotMatch(html, /react-loading-skeleton|sites-skeleton-/i);
  assert.doesNotMatch(
    html,
    /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i,
  );
});

test("catalogue matches the approved module, group and screen manifest", async () => {
  const [source, inventory, shell] = await Promise.all([
    readFile(new URL("../app/prototype-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../PROTOTYPE-INVENTORY.md", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-shell.tsx", import.meta.url), "utf8"),
  ]);
  const moduleMatches = [...source.matchAll(/^ {4}id: "([^"]+)", code: "([^"]+)", label: "([^"]+)"/gm)];
  const groupMatches = [...source.matchAll(/\bg\("([^"]+)",\s*"([^"]+)"/g)];
  const pageMatches = [...source.matchAll(/\bp\("([^"]+)",\s*"([^"]+)"(?:,\s*"([^"]+)")?(?:,\s*"([^"]+)")?\)/g)];

  const expectedModuleIds = [
    "dashboard", "banking", "sales", "revenue", "customers", "purchases", "suppliers", "inventory", "costing",
    "finance", "tax", "operations", "fleet", "manufacturing", "quality", "crm", "projects", "resources", "support", "hr",
    "assets", "expenses", "documents", "budget", "reports", "portals", "administration", "configuration", "approvals",
    "notifications", "integrations", "ai", "audit", "migration", "mobile",
  ];

  assert.deepEqual(moduleMatches.map((match) => match[1]), expectedModuleIds);
  assert.equal(moduleMatches.length, approvedManifest.counts.modules);
  assert.equal(new Set(moduleMatches.map((match) => match[1])).size, approvedManifest.counts.modules, "module ids must be unique");
  assert.equal(new Set(moduleMatches.map((match) => match[2])).size, approvedManifest.counts.modules, "module codes must be unique");
  assert.equal(groupMatches.length, approvedManifest.counts.groups);
  assert.equal(pageMatches.length, approvedManifest.counts.pages);

  for (const [, , code, label] of moduleMatches) {
    assert.ok(inventory.includes(`${code} — ${label}`), `inventory is missing module ${code} — ${label}`);
  }
  for (const [, , label] of groupMatches) {
    assert.ok(inventory.includes(`**${label}:**`), `inventory is missing menu group ${label}`);
  }
  for (const [, , label] of pageMatches) {
    assert.ok(inventory.includes(label), `inventory is missing screen ${label}`);
  }

  for (let index = 0; index < moduleMatches.length; index += 1) {
    const start = moduleMatches[index].index;
    const end = moduleMatches[index + 1]?.index ?? source.indexOf("] as const", start);
    const block = source.slice(start, end > start ? end : undefined);
    const pageIds = [...block.matchAll(/\bp\("([^"]+)"/g)].map((match) => match[1]);
    assert.ok(pageIds.length > 0, `${moduleMatches[index][1]} must expose at least one screen`);
    assert.equal(new Set(pageIds).size, pageIds.length, `${moduleMatches[index][1]} contains a duplicate page id`);
  }

  const comingSoonIds = pageMatches.filter((match) => match[4] === "coming-soon").map((match) => match[1]);
  assert.deepEqual(comingSoonIds, ["cutover-plan", "parallel-rollback", "offline-queue"]);

  const financeStart = moduleMatches.find((match) => match[1] === "finance")?.index ?? -1;
  const taxStart = moduleMatches.find((match) => match[1] === "tax")?.index ?? -1;
  const financeBlock = source.slice(financeStart, taxStart);
  const chartOverview = financeBlock.indexOf('p("chart-of-accounts", "Chart of Accounts Overview")');
  const nominals = financeBlock.indexOf('p("nominals", "Nominals")');
  const sections = financeBlock.indexOf('p("section-management", "Section Management")');
  assert.ok(chartOverview >= 0 && nominals > chartOverview && sections > nominals, "Finance must expose Chart of Accounts → Nominals → Section Management in order");

  const reportsStart = moduleMatches.find((match) => match[1] === "reports")?.index ?? -1;
  const portalsStart = moduleMatches.find((match) => match[1] === "portals")?.index ?? -1;
  const reportsBlock = source.slice(reportsStart, portalsStart);
  const reportGroupIds = [...reportsBlock.matchAll(/\bg\("([^"]+)",\s*"([^"]+)"/g)].map((match) => match[1]);
  const approvedReportModule = approvedManifest.modules.find((module) => module.id === "reports");
  assert.ok(approvedReportModule, "approved manifest must include Reports & Analytics");
  assert.equal(reportGroupIds.length, approvedReportModule.groups.length, "Reports groups must match the approved manifest");
  for (const required of ["sales-reports", "customer-reports", "purchase-reports", "supplier-reports", "inventory-reports", "finance-reports", "manufacturing-reports", "hr-reports", "audit-reports"]) {
    assert.ok(reportGroupIds.includes(required), "Reports is missing " + required);
  }
  for (const requiredPage of ["sales-invoice-detail-report", "customer-statement-report", "customer-outstanding-report", "customer-advance-report", "three-way-match-report"]) {
    assert.ok(reportsBlock.includes(`p("${requiredPage}"`), "Reports is missing " + requiredPage);
  }
  assert.match(shell, /if \(expandedModule === module\.id\)\s*{\s*setExpandedModule\(null\);\s*return;/, "clicking an expanded main menu must collapse it");
  assert.doesNotMatch(shell, /setExpandedModule\(nextExpanded \?\? module\.id\)/, "main-menu collapse must not immediately reopen itself");
  assert.match(shell, /module\.id === "reports"[\s\S]*navigate\("reports", "report-catalogue"\)/, "Reports main menu must open the report workspace directly");
  assert.match(shell, /const hasInlineMenu = module\.id !== "reports"/, "Reports must not expand its complete page tree in the sidebar");
});

test("role dashboard catalogue defines nineteen distinct, complete role experiences", async () => {
  const dashboardDataUrl = new URL("../app/role-dashboard-data.ts", import.meta.url);
  dashboardDataUrl.searchParams.set("test", String(process.pid) + "-" + String(Date.now()));
  const dashboardVisualDataUrl = new URL("../app/role-dashboard-visual-data.ts", import.meta.url);
  dashboardVisualDataUrl.searchParams.set("test", String(process.pid) + "-" + String(Date.now()));
  const {
    ROLE_DASHBOARD_PAGE_IDS,
    ROLE_DASHBOARD_ROLE_IDS,
    roleDashboardDefinitions,
    roleIdToDashboardPageId,
  } = await import(dashboardDataUrl.href);
  const { roleDashboardVisuals } = await import(dashboardVisualDataUrl.href);

  assert.equal(ROLE_DASHBOARD_PAGE_IDS.length, 19);
  assert.equal(ROLE_DASHBOARD_ROLE_IDS.length, 19);
  assert.equal(new Set(ROLE_DASHBOARD_PAGE_IDS).size, 19);
  assert.equal(new Set(ROLE_DASHBOARD_ROLE_IDS).size, 19);
  assert.equal(Object.keys(roleDashboardDefinitions).length, 19);
  assert.equal(Object.keys(roleIdToDashboardPageId).length, 19);
  assert.equal(Object.keys(roleDashboardVisuals).length, 19);

  const signatures = [];
  const distributionTitles = [];
  const driverTitles = [];
  for (const roleId of ROLE_DASHBOARD_ROLE_IDS) {
    const pageId = roleIdToDashboardPageId[roleId];
    const dashboard = roleDashboardDefinitions[pageId];
    assert.ok(dashboard, "missing dashboard for " + roleId);
    assert.equal(dashboard.roleId, roleId);
    assert.equal(dashboard.pageId, pageId);
    assert.equal(dashboard.kpis.length, 6);
    assert.equal(new Set(dashboard.kpis.map((item) => item.id)).size, 6);
    assert.equal(dashboard.chart.months.length, 12);
    assert.equal(dashboard.chart.primary.values.length, 12);
    assert.equal(dashboard.chart.comparison.values.length, 12);
    assert.ok(dashboard.chart.accessibleSummary.length > 40);
    assert.equal(dashboard.priorities.length, 4);
    assert.equal(dashboard.exceptions.length, 4);
    assert.equal(dashboard.quickActions.length, 4);
    assert.equal(dashboard.scorecard.length, 4);
    signatures.push(dashboard.kpis.map((item) => item.label).join("|"));

    const visuals = roleDashboardVisuals[pageId];
    assert.ok(visuals, "missing visual data for " + pageId);
    assert.equal(visuals.distribution.segments.length, 4);
    assert.equal(new Set(visuals.distribution.segments.map((segment) => segment.id)).size, 4);
    assert.equal(visuals.distribution.segments.reduce((sum, segment) => sum + segment.value, 0), 100);
    assert.ok(visuals.distribution.accessibleSummary.length > 40);
    assert.equal(visuals.drivers.bars.length, 5);
    assert.equal(new Set(visuals.drivers.bars.map((bar) => bar.id)).size, 5);
    assert.ok(visuals.drivers.accessibleSummary.length > 40);
    assert.equal(visuals.insights.length, 3);
    assert.equal(new Set(visuals.insights.map((insight) => insight.id)).size, 3);
    // Insight tone is a status channel ("good" = opportunity), not a series
    // colour; the card also renders an icon and a label for it.
    assert.ok(visuals.insights.some((insight) => insight.tone === "good"), "each role needs a positive opportunity");
    assert.ok(
      visuals.insights.every((insight) => ["good", "warn", "info"].includes(insight.tone)),
      "insight tones must stay on the status channel",
    );
    assert.ok(visuals.insights.some((insight) => insight.tone === "warn"), "each role needs a visible watch item");
    for (const bar of visuals.drivers.bars) {
      assert.ok(bar.max > 0);
      assert.ok(bar.value >= 0 && bar.value <= bar.max);
      assert.ok(bar.benchmark >= 0 && bar.benchmark <= bar.max);
    }
    distributionTitles.push(visuals.distribution.title);
    driverTitles.push(visuals.drivers.title);
  }
  assert.equal(new Set(signatures).size, 19, "every role needs a distinct KPI signature");
  assert.equal(new Set(distributionTitles).size, 19, "every role needs a distinct distribution chart");
  assert.equal(new Set(driverTitles).size, 19, "every role needs a distinct driver chart");
});

test("every selectable role resolves to a complete dashboard fixture", async () => {
  const stamp = String(process.pid) + "-r-" + String(Date.now());
  const dashboardDataUrl = new URL("../app/role-dashboard-data.ts", import.meta.url);
  dashboardDataUrl.searchParams.set("test", stamp);
  const dashboardVisualDataUrl = new URL("../app/role-dashboard-visual-data.ts", import.meta.url);
  dashboardVisualDataUrl.searchParams.set("test", stamp);
  const analyticsUrl = new URL("../app/role-dashboard-analytics-data.ts", import.meta.url);
  analyticsUrl.searchParams.set("test", stamp);
  const mockDataUrl = new URL("../app/mock-data.ts", import.meta.url);
  mockDataUrl.searchParams.set("test", stamp);

  const { roleDashboardDefinitions, roleIdToDashboardPageId } = await import(dashboardDataUrl.href);
  const { roleDashboardVisuals } = await import(dashboardVisualDataUrl.href);
  const { roleDashboardAnalytics } = await import(analyticsUrl.href);
  const { roleOptions } = await import(mockDataUrl.href);

  assert.ok(roleOptions.length >= 19, "the role selector must cover every dashboard role");
  assert.equal(new Set(roleOptions.map((role) => role.id)).size, roleOptions.length, "role ids must be unique");

  for (const role of roleOptions) {
    const pageId = role.dashboardPageId;
    assert.ok(roleDashboardDefinitions[pageId], `role ${role.id} points at unknown dashboard ${pageId}`);
    assert.ok(roleDashboardVisuals[pageId], `role ${role.id} is missing visuals for ${pageId}`);
    assert.ok(roleDashboardAnalytics[pageId], `role ${role.id} is missing analytics for ${pageId}`);
    assert.equal(roleDashboardDefinitions[pageId].kpis.length, 6, `role ${role.id} needs six KPI slots`);
    assert.ok(role.label.length > 0 && role.shortLabel.length > 0, `role ${role.id} needs display labels`);
  }

  // Every role with its own dashboard must own it exclusively; only read-only
  // Viewer deliberately reuses the executive dashboard for visibility scoping.
  const borrowed = roleOptions.filter((role) => roleIdToDashboardPageId[role.id] !== role.dashboardPageId);
  assert.deepEqual(borrowed.map((role) => role.id), ["viewer"], "only the read-only Viewer may reuse another role dashboard");
});

test("every role ships complete, distinct advanced analytics fixtures", async () => {
  const dashboardDataUrl = new URL("../app/role-dashboard-data.ts", import.meta.url);
  dashboardDataUrl.searchParams.set("test", String(process.pid) + "-a-" + String(Date.now()));
  const analyticsUrl = new URL("../app/role-dashboard-analytics-data.ts", import.meta.url);
  analyticsUrl.searchParams.set("test", String(process.pid) + "-a-" + String(Date.now()));
  const { ROLE_DASHBOARD_PAGE_IDS } = await import(dashboardDataUrl.href);
  const { roleDashboardAnalytics } = await import(analyticsUrl.href);

  assert.equal(Object.keys(roleDashboardAnalytics).length, 19);

  const bridgeTitles = [];
  const funnelTitles = [];
  for (const pageId of ROLE_DASHBOARD_PAGE_IDS) {
    const analytics = roleDashboardAnalytics[pageId];
    assert.ok(analytics, "missing analytics fixtures for " + pageId);

    // Bridge: at least one increase, one decrease, and a closing total.
    assert.ok(analytics.bridge.steps.length >= 4, pageId + " bridge needs a readable number of steps");
    assert.ok(analytics.bridge.steps.some((step) => step.value > 0), pageId + " bridge needs an increase");
    assert.ok(analytics.bridge.steps.some((step) => step.value < 0), pageId + " bridge needs a decrease");
    assert.ok(analytics.bridge.steps.some((step) => step.isTotal === true), pageId + " bridge needs a total");
    assert.ok(analytics.bridge.accessibleSummary.length > 40);
    assert.ok(analytics.bridge.note.length > 20);

    // Funnel: monotonically narrowing so the shape is never misleading.
    assert.ok(analytics.funnel.stages.length >= 4);
    for (let index = 1; index < analytics.funnel.stages.length; index += 1) {
      assert.ok(
        analytics.funnel.stages[index].value <= analytics.funnel.stages[index - 1].value,
        pageId + " funnel must narrow at every stage",
      );
    }
    assert.ok(analytics.funnel.accessibleSummary.length > 40);

    // Heatmap: fully populated grid.
    assert.ok(analytics.heatmap.rows.length >= 3);
    assert.ok(analytics.heatmap.columns.length >= 3);
    assert.equal(
      analytics.heatmap.cells.length,
      analytics.heatmap.rows.length * analytics.heatmap.columns.length,
      pageId + " heatmap must cover every row and column",
    );
    assert.ok(analytics.heatmap.accessibleSummary.length > 40);

    // Scatter: positive, plottable magnitudes.
    assert.ok(analytics.scatter.points.length >= 4);
    for (const point of analytics.scatter.points) {
      assert.ok(point.x > 0 && point.y > 0 && point.size > 0, pageId + " scatter points must be plottable");
    }
    assert.ok(analytics.scatter.accessibleSummary.length > 40);

    bridgeTitles.push(analytics.bridge.title);
    funnelTitles.push(analytics.funnel.title);
  }
  assert.equal(new Set(bridgeTitles).size, 19, "every role needs a distinct bridge");
  assert.equal(new Set(funnelTitles).size, 19, "every role needs a distinct funnel");
});

test("matured module profiles are complete and match the screen catalogue", async () => {
  // Each matured module ships one fixture file that must also be registered.
  const maturedModules = [
    { moduleId: "banking", file: "module-banking-data.ts", exportName: "bankingProfile" },
    { moduleId: "fleet", file: "module-fleet-data.ts", exportName: "fleetProfile" },
  ];

  const catalogueUrl = new URL("../app/prototype-data.ts", import.meta.url);
  catalogueUrl.searchParams.set("test", String(process.pid) + "-m-" + String(Date.now()));
  const { prototypeModules } = await import(catalogueUrl.href);
  const registrySource = await readFile(new URL("../app/module-profiles.ts", import.meta.url), "utf8");

  const moduleProfiles = [];
  for (const entry of maturedModules) {
    const fixtureUrl = new URL("../app/" + entry.file, import.meta.url);
    fixtureUrl.searchParams.set("test", String(process.pid) + "-m-" + String(Date.now()));
    const fixture = await import(fixtureUrl.href);
    const profile = fixture[entry.exportName];
    assert.ok(profile, entry.file + " must export " + entry.exportName);
    assert.equal(profile.moduleId, entry.moduleId);
    // A fixture nobody registers would silently never render.
    assert.match(registrySource, new RegExp(entry.exportName), "module-profiles.ts must register " + entry.exportName);
    moduleProfiles.push(profile);
  }

  assert.ok(moduleProfiles.length > 0, "at least one module must be matured");

  for (const profile of moduleProfiles) {
    const catalogueModule = prototypeModules.find((item) => item.id === profile.moduleId);
    assert.ok(catalogueModule, "matured profile references unknown module " + profile.moduleId);
    const pageIds = new Set(catalogueModule.groups.flatMap((group) => group.pages.map((page) => page.id)));

    for (const [pageId, page] of Object.entries(profile.pages)) {
      // A fixture for a page that does not exist is dead weight.
      assert.ok(pageIds.has(pageId), profile.moduleId + " profile targets unknown page " + pageId);

      if (page.dashboard) {
        assert.ok(page.dashboard.kpis.length >= 4, pageId + " dashboard needs at least four KPIs");
        assert.ok(page.dashboard.charts.length >= 3, pageId + " dashboard needs at least three charts");
        assert.equal(
          new Set(page.dashboard.kpis.map((kpi) => kpi.id)).size,
          page.dashboard.kpis.length,
          pageId + " has duplicate KPI ids",
        );
      }

      for (const table of [page.list, page.report].filter(Boolean)) {
        assert.ok(table.columns.length >= 3, pageId + " table needs meaningful columns");
        assert.ok(table.rows.length >= 3, pageId + " table needs sample rows");
        const columnKeys = table.columns.map((column) => column.key);
        for (const row of table.rows) {
          for (const key of columnKeys) {
            assert.ok(
              typeof row.cells[key] === "string" && row.cells[key].length > 0,
              pageId + " row " + row.id + " is missing a value for column " + key,
            );
          }
          assert.ok(row.status.length > 0, pageId + " row " + row.id + " needs a status");
        }
        assert.equal(new Set(table.rows.map((row) => row.id)).size, table.rows.length, pageId + " has duplicate row ids");
      }

      if (page.list?.createPageId) {
        assert.ok(
          pageIds.has(page.list.createPageId),
          pageId + " create action targets unknown page " + page.list.createPageId,
        );
        assert.ok(page.list.createLabel?.length > 3, pageId + " create action needs a contextual label");
      }

      if (page.list?.createPageId) {
        assert.ok(
          pageIds.has(page.list.createPageId),
          pageId + " create action targets unknown page " + page.list.createPageId,
        );
        assert.ok(page.list.createLabel?.length > 3, pageId + " create action needs a contextual label");
      }

      if (page.workflow) {
        assert.ok(page.workflow.steps.length >= 3, pageId + " workflow needs at least three steps");
        assert.equal(
          page.workflow.steps.filter((step) => step.state === "current").length,
          1,
          pageId + " workflow needs exactly one current step",
        );
        assert.ok(page.workflow.currentFields.length >= 3, pageId + " workflow needs current-step detail");
      }

      if (page.form) {
        assert.ok(page.form.sections.length >= 2, pageId + " form needs grouped sections");
        for (const section of page.form.sections) {
          assert.ok(section.fields.length >= 2, pageId + " form section " + section.title + " needs fields");
          for (const field of section.fields) {
            if (field.type === "select") {
              assert.ok((field.options ?? []).includes(field.value), pageId + " select " + field.label + " must include its value in options");
            }
          }
        }
      }
    }
  }
});

test("Banking ships connected entry, detail, statement and reconciliation workspaces", async () => {
  const [content, batch, detail, statement, reconciliation, bankingStyles, gridStyles, sharedFormStyles] = await Promise.all([
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-batch-entry.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-transaction-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-statement.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-reconciliation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking.css", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-grid.css", import.meta.url), "utf8"),
    readFile(new URL("../app/form-workspace.css", import.meta.url), "utf8"),
  ]);

  for (const route of [
    "add-bank-payment",
    "add-bank-receipt",
    "add-transfer",
    "bank-statement",
    "bank-reconciliation",
    "statement-matching",
    "transaction-detail",
  ]) {
    assert.match(content, new RegExp(route), "missing connected Banking route " + route);
  }

  assert.match(batch, /Batch reference/);
  assert.match(batch, /Pay through/);
  assert.doesNotMatch(batch, /Paid to/);
  assert.match(batch, /Approval route/);
  assert.match(batch, /Supporting document/);
  assert.match(batch, /Accounting effect/);
  assert.match(batch, /nx-batch__line-heading/);
  assert.match(batch, /Payment details/);
  assert.match(batch, /Receipt details/);
  assert.match(bankingStyles, /box-shadow: inset 4px 0 0 var\(--nx-brand\)/);
  assert.match(bankingStyles, /nx-txn-journal thead th \{ background: var\(--nx-brand-strong\); color: #fff/);
  assert.match(gridStyles, /nx-batch-grid thead th[\s\S]*?background: var\(--nx-brand-strong\)/);
  assert.doesNotMatch(sharedFormStyles, /^\.nx-workspace-form--banking \{/m);
  assert.match(detail, /buildSelectedTransaction/);
  assert.match(detail, /General ledger impact/);
  assert.match(statement, /Opening balance/);
  assert.match(statement, /Unreconciled only/);
  assert.match(content, />\+ Add New<\/ActionButton>/);
  assert.match(statement, /onOpenAccount\(account\.id\)/);
  assert.match(statement, /AdvancedListFilters/);
  assert.match(reconciliation, /Suggested ledger matches/);
  assert.match(reconciliation, /Run auto-match/);
  assert.match(reconciliation, /Submit for approval/);
  assert.match(reconciliation, /Prototype boundary/);
});

test("shared filters and Ctrl+K support date presets, business facets and transaction drill-down", async () => {
  const [shell, views, content, banking, statement] = await Promise.all([
    readFile(new URL("../app/prototype-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/module-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/module-banking-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-statement.tsx", import.meta.url), "utf8"),
  ]);

  for (const label of ["Created by", "Created on", "Last week", "Last month", "This quarter", "Last quarter", "This half year", "Last 6 months", "Custom range"]) {
    assert.match(views, new RegExp(label), "missing advanced filter option " + label);
  }
  assert.match(content, /AdvancedListFilters/);
  assert.match(shell, /savedBankingTransactions/);
  assert.match(shell, /Search pages and transactions/);
  assert.match(shell, /recordRef/);
  assert.match(shell, /PAY-2026-0418/);
  for (const label of ["Bank", "Currency", "Nominal", "Status"]) {
    // eslint-disable-next-line no-useless-escape
    assert.match(views, new RegExp(`label=\"${label}\"`), `missing working ${label} filter`);
  }
  assert.match(views, /bankMatch && currencyMatch && nominalMatch && statusMatch/);
  assert.match(content, /partyLabel/);
  assert.match(content, /currencyMatch && partyMatch && statusMatch/);
  assert.match(statement, /bankMatch && currencyMatch && nominalMatch && statusMatch/);
  assert.match(banking, /"bank-payments"[\s\S]*?linkKey: "voucher",[\s\S]*?openOnlyFromLink: true,/);
});

test("Purchase and Sales maturity layer covers entry, list, detail, workflow and approval depth", async () => {
  const [workspace, content, styles, workbenchStyles, layout] = await Promise.all([
    readFile(new URL("../app/commercial-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/commerce.css", import.meta.url), "utf8"),
    readFile(new URL("../app/document-workbench.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  for (const page of ["purchase-requisitions", "rfqs", "supplier-quotations", "purchase-orders", "goods-receipts", "purchase-bills", "payment-request", "quotations", "sales-orders", "pick-pack-delivery", "invoices", "customer-receipts"]) {
    assert.ok(workspace.includes(`"${page}"`), "missing commercial maturity route " + page);
  }
  for (const capability of ["Saved view", "More filters", "Copy source lines", "Previous price", "Document health", "Credit & margin", "Budget & commitment", "Accounting preview", "Fulfilment & matching", "Segregation of duties", "Continue workflow"]) {
    assert.ok(workspace.includes(capability), "missing commercial capability " + capability);
  }
  assert.match(content, /isCommercialMaturityPage/);
  assert.match(content, /<CommercialWorkspace/);
  assert.match(styles, /nx-commerce-entry/);
  assert.match(styles, /nx-commerce-decision/);
  assert.match(styles, /@media\(max-width:760px\)/);
  for (const capability of ["Document lifecycle", "Products & services", "Expense allocation", "Journal preview", "Other information", "Send message", "Schedule activity", "All changes saved"]) {
    assert.match(workspace, new RegExp(capability), "missing document-workbench capability " + capability);
  }
  for (const rule of ["nx-document-commandbar", "nx-document-header-grid", "nx-document-line-grid", "nx-document-chatter", "@media (max-width: 680px)"]) {
    assert.ok(workbenchStyles.includes(rule), "missing document-workbench style " + rule);
  }
  assert.match(workbenchStyles, /\.nx-workspace-form--commerce\.nx-document-workbench \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(workbenchStyles, /\.nx-document-rail \{[\s\S]*grid-template-columns: minmax\(320px, 1\.35fr\) repeat\(3, minmax\(220px, 1fr\)\);/);
  assert.match(workbenchStyles, /\.nx-document-workbench \.nx-table-wrap \{[\s\S]*overflow-x: auto;/);
  assert.match(layout, /document-workbench\.css/);
});

test("premium list intelligence opens every transaction and ships deep working filters", async () => {
  const [content, views, commerce, statement, drawer, styles] = await Promise.all([
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/module-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/commercial-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-statement.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/record-preview-drawer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-extra.css", import.meta.url), "utf8"),
  ]);

  for (const capability of ["Document number", "Reference contains", "Minimum amount", "Maximum amount"]) {
    assert.match(views, new RegExp(capability), "missing deep filter " + capability);
  }
  for (const source of [content, views, commerce, statement]) {
    assert.match(source, /nx-interactive-row/, "a transaction table is missing whole-row opening");
    assert.match(source, /onKeyDown/, "a transaction table is missing keyboard opening");
  }
  for (const capability of ["Saved view", "Save current view", "nx-filter-chips", "RecordPreviewDrawer"]) {
    assert.match(content + commerce, new RegExp(capability), "missing premium list capability " + capability);
  }
  for (const label of ["Overview", "Financial", "Related", "Activity", "Open full record", "Audit trail"]) {
    assert.match(drawer, new RegExp(label), "missing quick-view capability " + label);
  }
  for (const label of ["Transaction search", "Transaction type", "Nominal account", "Minimum amount", "Maximum amount"]) {
    assert.match(statement, new RegExp(label), "missing Bank Activity filter " + label);
  }
  assert.match(styles, /nx-record-drawer-layer/);
  assert.match(styles, /nx-interactive-row:focus-visible/);
  assert.match(styles, /@media \(max-width: 700px\)/);
});

test("Nexora differentiation layer connects role work, explainability, guided AI and transaction controls", async () => {
  const [shell, intelligence, drawer, dashboard, styles, workspace, workspaceStyles, content] = await Promise.all([
    readFile(new URL("../app/prototype-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nexora-intelligence.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/record-preview-drawer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/role-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nexora-intelligence.css", import.meta.url), "utf8"),
    readFile(new URL("../app/nexora-ai-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nexora-ai-workspace.css", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
  ]);

  for (const capability of ["My Work", "Nexora AI", "NexoraIntelligenceLayer", "Explain number"]) {
    assert.match(shell, new RegExp(capability, "i"), "missing shell intelligence capability " + capability);
  }
  assert.match(styles, /\.nx-intelligence-trigger--ai \{[^}]*color: var\(--nx-sidebar-text\)[^}]*background: var\(--nx-sidebar\)/);
  for (const capability of ["Your business day, already prioritised", "Decision queue", "Intelligent quick entry", "Evidence used", "No autonomous posting", "Driver bridge", "Evidence chain"]) {
    assert.match(intelligence, new RegExp(capability), "missing intelligence experience " + capability);
  }
  for (const roleLens of ["executive", "finance", "sales", "purchasing", "production", "people"]) {
    assert.match(intelligence, new RegExp(roleLens + ":"), "missing role lens " + roleLens);
  }
  for (const capability of ["Transaction Control Graph", "Impact Preview Before Posting", "Pakistan compliance lens", "FBR-ready control design", "Segregation of duties"]) {
    assert.match(drawer, new RegExp(capability), "missing transaction intelligence " + capability);
  }
  assert.match(dashboard, /openDrill/);
  assert.match(styles, /nx-intelligence-panel--assistant/);
  assert.match(styles, /nx-control-graph/);
  assert.match(styles, /@media\(max-width:700px\)/);
  for (const capability of ["Ask. Explain. Simulate. Act", "AI suggestion review", "Document intelligence", "Scenario intelligence lab", "Approval and execution handoff", "Specialist agent catalogue", "AI control centre", "Source, confidence and lineage", "Evaluation and human feedback", "AI activity, decisions and usage"]) {
    assert.match(workspace, new RegExp(capability), "missing advanced AI workspace capability " + capability);
  }
  for (const agent of ["CEO Intelligence", "CFO Close", "AR Collections", "AP Payments", "Manufacturing", "Tax Compliance", "Fleet Cost"]) {
    assert.match(workspace, new RegExp(agent), "missing specialist agent " + agent);
  }
  for (const pageId of ["ai-assistant", "suggestion-review", "extraction-review", "explanations", "human-handoff", "ai-automations", "ai-policy", "source-confidence", "ai-feedback", "ai-audit"]) {
    assert.match(workspace, new RegExp(pageId), "missing AI route " + pageId);
  }
  assert.match(content, /isNexoraAiWorkspacePage/);
  assert.match(content, /<NexoraAiWorkspace/);
  assert.match(workspaceStyles, /\.nx-aiw-command/);
  assert.match(workspaceStyles, /@media\(max-width:580px\)/);
});

test("every role dashboard visual continues through a governed source-transaction journey", async () => {
  const [dashboard, charts, journey, renderer, transaction] = await Promise.all([
    readFile(new URL("../app/role-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/role-dashboard-charts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/drill/dashboard-journey.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/drill/drill-renderer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/drill/source-transaction.tsx", import.meta.url), "utf8"),
  ]);

  const chartPanels = dashboard.match(/<ChartPanel[\s\S]*?<\/ChartPanel>/g) ?? [];
  assert.ok(chartPanels.length >= 9, "the analytical dashboard must keep its full chart portfolio");
  for (const panel of chartPanels) {
    assert.match(panel, /onDrill=/, "every dashboard chart must open the universal drill journey");
  }

  for (const target of ["finance-gl", "sales-revenue", "procurement-spend", "inventory-movement"]) {
    assert.match(journey, new RegExp(target), "missing governed dashboard drill domain " + target);
  }
  assert.match(journey, /Dashboard → analysis → detail → document → transaction/);
  assert.match(charts, /data-drillable/);
  assert.match(charts, /nx-role-panel__drill-action/);
  assert.match(charts, /onPointerUp/);
  assert.match(renderer, /selectedTransaction/);
  assert.match(transaction, /Source transaction reached/);
  assert.match(renderer, /nx-drill__transaction-link/);
  assert.match(renderer, /setSelectedTransaction\(row\)/);
});

test("Customer, Supplier and Product creation use mature governed master-data forms", async () => {
  const [form, content, styles] = await Promise.all([
    readFile(new URL("../app/master-data-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/master-data.css", import.meta.url), "utf8"),
  ]);
  for (const route of ["add-customer", "add-supplier", "add-item"]) {
    assert.ok(form.includes(`"${route}"`), "missing mature master-data route " + route);
  }
  for (const capability of ["Auto-generated", "Tax & compliance", "Credit & terms", "Bank details", "Opening quantity", "Low stock level", "Gross margin", "Stock asset account", "Preferred supplier", "FBR product code", "Run validation", "Save & close"]) {
    assert.ok(form.includes(capability), "missing master-data capability " + capability);
  }
  assert.match(content, /isMatureMasterDataForm/);
  assert.match(content, /<MasterDataForm/);
  assert.match(styles, /nx-master-sticky/);
  assert.match(styles, /@media\(max-width:820px\)/);
});

test("all form families use the shared full-screen Nexora workspace", async () => {
  const [content, banking, batch, commerce, master, governance, layout, styles, workbenchStyles, governanceStyles, masterStyles, sidebarStyles, blueprints] = await Promise.all([
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-transaction-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-batch-entry.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/commercial-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/master-data-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/enterprise-transaction-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/form-workspace.css", import.meta.url), "utf8"),
    readFile(new URL("../app/document-workbench.css", import.meta.url), "utf8"),
    readFile(new URL("../app/enterprise-transaction-control.css", import.meta.url), "utf8"),
    readFile(new URL("../app/master-data.css", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-extra.css", import.meta.url), "utf8"),
    readFile(new URL("../app/module-form-blueprints.ts", import.meta.url), "utf8"),
  ]);

  for (const marker of ["nx-workspace-form--standard", "nx-workspace-form--profile", "nx-form-context-strip", "nx-form-inspector", "nx-form-action-dock", "Record health", "Live business context"]) {
    assert.match(content, new RegExp(marker), "missing shared form capability " + marker);
  }
  assert.match(banking, /nx-workspace-form--banking/);
  assert.match(batch, /nx-workspace-form--batch/);
  assert.match(commerce, /nx-workspace-form--commerce/);
  assert.match(master, /nx-workspace-form--master/);
  assert.match(layout, /form-workspace\.css/);
  for (const rule of [".nx-content:has(.nx-workspace-form)", "grid-template-columns: repeat(12", "nx-form-total-band", "position: sticky", "@media (max-width: 639px)"]) {
    assert.ok(styles.includes(rule), "missing responsive full-screen form rule " + rule);
  }
  for (const capability of ["moduleFormFamilies", "contextMetrics", "Credit control", "Three-way match", "Traceability", "Double entry", "Material readiness", "Billing eligibility", "Capitalisation policy", "Security review"]) {
    assert.match(blueprints, new RegExp(capability), "missing module-aware form capability " + capability);
  }
  const moduleIds = [...blueprints.matchAll(/^\s{2}([a-z]+): "(?:command|treasury|commercial|procurement|stock|finance|operations|services|people|assets|governance|platform)",$/gm)].map((match) => match[1]);
  assert.equal(moduleIds.length, 35, "every Nexora module must have a form family");
  assert.equal(new Set(moduleIds).size, 35, "module-aware form mappings must be unique");
  for (const marker of ["nx-form-navigator", "nx-form-context-metrics", "nx-form-entry-table", "Validate &amp; submit", "Live business context"]) {
    assert.match(content + styles, new RegExp(marker), "missing mature form interaction " + marker);
  }
  assert.match(styles, /\.nx-workspace-form \.nx-section-title[\s\S]*background: var\(--nx-brand-soft\)/);
  assert.match(styles, /\.nx-form-entry-table th[\s\S]*background: var\(--nx-brand-strong\)/);
  assert.match(workbenchStyles, /\.nx-document-workbench \.nx-commerce-edit-table th/);
  for (const capability of ["Transaction control centre", "Submit for approval", "Request changes", "Post transaction", "Reverse", "Policy route", "Balanced control total", "Immutable visual history"]) {
    assert.match(governance, new RegExp(capability), "missing enterprise governance capability " + capability);
  }
  assert.equal((content.match(/<EnterpriseTransactionControl/g) ?? []).length, 5, "shared governance must cover generic forms, matured forms, generic details, matured details and Banking entry");
  assert.match(commerce, /<EnterpriseTransactionControl/, "Purchase and Sales entry workbenches must expose the governed lifecycle");
  assert.match(governance, /companyMode === "manufacturing"/);
  assert.match(governance, /companyMode === "trading"/);
  assert.match(governanceStyles, /\.nx-governance__lifecycle/);
  assert.match(governanceStyles, /@media \(max-width: 680px\)/);
  assert.match(layout, /enterprise-transaction-control\.css/);
  assert.match(masterStyles, /\.nx-master-section>header\{[^}]*background:var\(--nx-brand-soft\)[^}]*box-shadow:inset 4px 0 0 var\(--nx-brand\)/);
  assert.match(sidebarStyles, /color-mix\(in srgb, var\(--nx-sidebar-accent\) 18%, var\(--nx-sidebar-surface\)\)/);
});

test("all form fields and primary actions enforce readable text contrast", async () => {
  const [layout, contrast] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/form-contrast.css", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /manufacturing-workspace\.css[\s\S]*form-contrast\.css[\s\S]*print\.css/);
  assert.match(contrast, /::placeholder\s*\{[^}]*color: var\(--nx-text-muted\)[^}]*opacity: 1/);
  assert.match(contrast, /button:is\([^)]*\.nx-button-primary[^)]*\.nx-batch__btn--approve[^)]*\)\s*\{[^}]*color: var\(--nx-text-inverse\)[^}]*background: var\(--nx-primary\)/);
  assert.match(contrast, /:disabled,[\s\S]*\[readonly\]\s*\{[^}]*-webkit-text-fill-color: var\(--nx-text-muted\)[^}]*opacity: 1/);
  assert.doesNotMatch(contrast, /!important/);
});

test("application source stays inside the isolated, static mock prototype boundary", async () => {
  const files = (await collectApplicationFiles(appDirectory)).filter((path) => [".ts", ".tsx", ".js", ".jsx"].includes(extname(path)));
  const contents = await Promise.all(files.map(async (path) => ({ path, source: await readFile(path, "utf8") })));
  const applicationSource = contents.map(({ path, source }) => `\n/* ${path} */\n${source}`).join("\n");
  const [page, shell, mockData] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mock-data.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from "\.\/prototype-shell"/);
  assert.match(shell, /from "\.\/mock-data"/);
  assert.match(shell, /from "\.\/prototype-data"/);
  assert.match(mockData, /export const companyModeOptions/);
  assert.match(mockData, /export const companies/);
  assert.match(mockData, /export const roleOptions/);

  assert.doesNotMatch(applicationSource, /\bfetch\s*\(/, "prototype app must not make network requests");
  assert.doesNotMatch(applicationSource, /\b(?:XMLHttpRequest|WebSocket|EventSource)\b/);
  assert.doesNotMatch(applicationSource, /\b(?:axios|drizzle|prisma|sequelize|typeorm)\b/i, "prototype app must not import a data layer");
  assert.doesNotMatch(applicationSource, /["'`]\/api(?:\/|["'`])/i, "prototype app must not call API routes");
  assert.doesNotMatch(applicationSource, /https?:\/\/(?:localhost|127\.0\.0\.1)|(?:localhost|127\.0\.0\.1):(?:3000|8000)/i);
  assert.doesNotMatch(applicationSource, /\b(?:process\.env|import\.meta\.env)\b/);
  assert.doesNotMatch(applicationSource, /["']use server["']/);
  // Relative imports must resolve INSIDE app/. A blanket "../" ban was wrong:
  // app/drill/views/finance.ts legitimately imports "../types.ts", which stays
  // inside the prototype. What matters is whether a specifier escapes app/.
  const escaping = [];
  for (const { path, source } of contents) {
    const dir = dirname(path);
    for (const match of source.matchAll(/(?:from\s+|import\s*\()["'](\.[^"']*)["']/g)) {
      const target = resolve(dir, match[1]);
      if (!target.startsWith(appDirectory)) escaping.push(`${path} -> ${match[1]}`);
    }
  }
  assert.deepEqual(escaping, [], "prototype app must not import parent-project code");
});

test("core review interactions and visual states remain represented", async () => {
  const [shell, content, styles, intelligenceStyles] = await Promise.all([
    readFile(new URL("../app/prototype-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-extra.css", import.meta.url), "utf8"),
    readFile(new URL("../app/nexora-intelligence.css", import.meta.url), "utf8"),
  ]);

  for (const marker of ["Ctrl K", "Company menus", "Role menus", "State: Loading", "State: Empty", "State: Error", "Confirm mock action"]) {
    assert.match(shell, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing shell interaction: ${marker}`);
  }
  for (const action of ["Refresh", "Export", "View", "Print", "Edit", "Submit", "Cancel", "Save draft", "Delete", "Post", "Reverse", "Reject", "Approve", "Run report"]) {
    assert.match(content, new RegExp(`onAction\\(\\"${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `missing prototype action: ${action}`);
  }
  for (const state of ["loading", "empty", "error", "coming-soon", "not-implemented"]) {
    assert.match(content, new RegExp(state), `missing visual state: ${state}`);
  }
  assert.match(shell, /nx-sidebar-reopen/);
  assert.match(shell, /aria-label="Expand sidebar menu"/);
  assert.match(styles, /\.nx-shell\[data-sidebar="collapsed"\] \.nx-sidebar-reopen\s*\{\s*display: grid/);
  assert.match(styles, /\.nx-sidebar__brand\s*\{[^}]*background: transparent/);
  assert.match(styles, /\.nx-sidebar__identity strong\s*\{[^}]*color: var\(--nx-sidebar-text\)/);
  assert.match(styles, /\.nx-topbar__brand\s*\{[^}]*color: var\(--nx-sidebar-text\)[^}]*background: var\(--nx-sidebar\)/);
  assert.match(intelligenceStyles, /\.nx-intelligence-trigger--ai > span\s*\{[^}]*color: var\(--nx-sidebar-text\)/);
  assert.match(intelligenceStyles, /\.nx-intelligence-trigger--ai\s*\{[^}]*background: var\(--nx-sidebar\)/);

  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.private, true);
  // `npm test` must build first and then run every suite in tests/, not just
  // this file: the design-system, accessibility and finance gates live
  // alongside it and were previously not discovered.
  assert.match(packageJson.scripts.test, /npm run build/);
  assert.match(packageJson.scripts.test, /node --test .*tests\/\*\*\/\*\.test\.mjs/);
  assert.deepEqual(packageJson.workspaces, ["apps/*", "packages/*"]);
});

test("all 35 modules are visible by default for every prototype reviewer", async () => {
  const shell = await readFile(new URL("../app/prototype-shell.tsx", import.meta.url), "utf8");

  assert.match(shell, /const \[roleScoped, setRoleScoped\] = useState\(false\)/);
  assert.match(shell, /const \[modeScoped, setModeScoped\] = useState\(false\)/);
  assert.match(shell, /nexora-prototype-preferences-v2/);
  assert.match(shell, /Role menus: \{roleScoped \? "Scoped" : "All"\}/);
  assert.match(shell, /Company menus: \{modeScoped \? "Scoped" : "All"\}/);
});

test("Fleet fuel and maintenance forms separate quantity, rate and amount", async () => {
  const fleet = await readFile(new URL("../app/module-fleet-data.ts", import.meta.url), "utf8");

  assert.doesNotMatch(fleet, /Rate \/ amount/);
  for (const label of ["Current odometer reading (total km)", "Fuel quantity", "Rate per litre", "Fuel amount (auto-calculated)", "Labour rate per hour", "Labour amount", "Parts amount", "Estimated total amount"]) {
    assert.ok(fleet.includes(label), "missing separate Fleet field: " + label);
  }
});

test("Manufacturing BOM and MO workbenches govern lifecycle and variance", async () => {
  const [workspace, styles, content, layout] = await Promise.all([
    readFile(new URL("../app/manufacturing-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/manufacturing-workspace.css", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  for (const marker of ["Bill of Materials", "Allowed variance %", "Manufacturing Orders", "Submit for approval", "Approve MO", "BOM variance exception", "Cost Controller", "Production Variance Register", "Operations & routing", "Quality plan", "Engineering change", "Product variant", "Production plan and responsibility", "Material warehouse", "Work orders", "Costs & yield", "Document activity", "View complete audit trail", "Approve exception & MO"]) {
    assert.match(workspace, new RegExp(marker), "missing manufacturing maturity capability " + marker);
  }
  assert.match(workspace, /utilisation > 1 \? "breach"/);
  assert.match(workspace, /line\.bomQty \* line\.tolerance \/ 100/);
  assert.match(content, /isManufacturingMaturityPage/);
  assert.match(layout, /manufacturing-workspace\.css/);
  assert.match(styles, /\.nx-mfg-variance-table tbody tr\.is-breach/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});

test("CEO and CFO dashboards cover enterprise income, cost and operating intelligence", async () => {
  const [dashboard, executive, styles] = await Promise.all([
    readFile(new URL("../app/role-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/executive-dashboard-intelligence.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/executive-dashboard-intelligence.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /ExecutiveDashboardIntelligence/);
  for (const roleId of ["chief-executive", "chief-financial-officer"]) {
    assert.match(executive, new RegExp(roleId), "missing executive dashboard access for " + roleId);
  }
  for (const capability of [
    "Total income", "Major income", "Total expenses", "Major expense",
    "Direct and indirect expense trend", "Project-wise income and cost",
    "Location-wise income and cost", "Department-wise income and cost",
    "Per-product cost composition", "Product price variance", "Top customers",
    "Top suppliers", "High-price products", "Slow-moving products",
    "Employee performance and fleet cost exceptions", "Highest fuel consumption",
    "Highest repair and maintenance cost",
  ]) {
    assert.match(executive, new RegExp(capability, "i"), "missing executive analytical capability " + capability);
  }
  assert.match(styles, /@media \(max-width: 639px\)/);
});

test("every operating role receives its own deep analytical dashboard pack", async () => {
  const [dashboard, packs, styles] = await Promise.all([
    readFile(new URL("../app/role-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/role-deep-dive-intelligence.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/role-deep-dive-intelligence.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /RoleDeepDiveIntelligence/);
  const roleIds = [
    "finance-manager", "accountant", "sales-manager", "sales-executive",
    "purchase-manager", "procurement-officer", "inventory-manager", "warehouse-user",
    "production-manager", "project-manager", "hr-manager", "administrator",
    "crm-manager", "ar-manager", "ap-manager", "tax-manager", "auditor",
  ];
  for (const roleId of roleIds) {
    assert.match(packs, new RegExp(`^[ ]{2}["']?${roleId}["']?:`, "m"), "missing role intelligence pack " + roleId);
  }
  assert.equal(roleIds.length, 17);
  for (const category of [
    "close quality", "posting throughput", "pipeline conversion", "supplier quality",
    "cycle time", "stock value", "picking", "capacity", "utilisation", "turnover",
    "integration health", "retention risk", "DSO", "matching quality", "filing readiness",
    "control coverage",
  ]) {
    assert.match(packs, new RegExp(category, "i"), "missing role analytical category " + category);
  }
  for (const capability of ["Role intelligence", "Role performance", "Work composition", "Decision queue", "Top contributors, bottlenecks and exceptions"]) {
    assert.match(packs, new RegExp(capability, "i"), "missing role dashboard capability " + capability);
  }
  assert.match(styles, /@media \(max-width: 639px\)/);
});

test("dashboards and reports share complete date intelligence and balance-forward controls", async () => {
  const [controls, styles, dashboard, reports] = await Promise.all([
    readFile(new URL("../app/reporting-period-controls.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reporting-period-controls.css", import.meta.url), "utf8"),
    readFile(new URL("../app/role-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reports-workspace.tsx", import.meta.url), "utf8"),
  ]);

  for (const preset of [
    "Today",
    "This week",
    "Last week",
    "This month",
    "Last month",
    "This quarter",
    "Last quarter",
    "Year to date",
    "This year",
    "Last year",
    "Custom range",
  ]) {
    assert.match(controls, new RegExp(preset, "i"), "missing reporting-period preset " + preset);
  }
  for (const viewBy of ["Day", "Week", "Month", "Quarter", "Year"]) {
    assert.match(controls, new RegExp(`>\\s*${viewBy}\\s*<`, "i"), "missing reporting granularity " + viewBy);
  }
  assert.match(controls, /Include balance brought forward/);
  assert.match(controls, /type="date"/);
  assert.match(dashboard, /<ReportingPeriodControls/);
  // The dashboard axis used to come from `reportingAxisLabels`, a fixed pool
  // of labels ("FY22".."FY26"), which disagreed with the comparison table's
  // real years. It now resolves from dates, so the check is that the axis is
  // period-driven rather than that a particular helper is called. The reports
  // workspace still uses the helper and is asserted below.
  assert.match(dashboard, /resolvedPeriods\.map/, "the dashboard axis must come from resolved periods");
  assert.match(dashboard, /anchorForPreset\(/, "the Period preset must resolve to a real anchor date");
  assert.match(reports, /<ReportingPeriodControls/);
  assert.match(reports, /chartLabels/);
  assert.match(reports, /reportingAxisLabels/);
  assert.match(reports, /Opening balance included/);
  assert.match(styles, /@media \(max-width: 639px\)/);
});
