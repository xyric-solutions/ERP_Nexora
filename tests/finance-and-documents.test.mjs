/**
 * Finance maturity and document integrity.
 *
 * The Finance module is the prototype's second matured module. An accountant
 * reviewing it will check the same things every time: do the journals
 * balance, does the trial balance agree, does the ledger arithmetic hold, and
 * does the statement tie back. If any of those are wrong the screens are
 * worthless no matter how they look - so they are asserted here.
 */
import assert from "node:assert/strict";
import test from "node:test";

const stamp = `${process.pid}-${Date.now()}`;

async function load(name) {
  const url = new URL(`../app/${name}`, import.meta.url);
  url.searchParams.set("test", stamp);
  return import(url.href);
}

/** Parse a formatted money string back to a number. */
function value(text) {
  if (text === "—" || text === undefined) return 0;
  const negative = /^\(.*\)$/.test(text);
  const n = Number(String(text).replace(/[^0-9.]/g, ""));
  return negative ? -n : n;
}

test("the Finance profile is registered and covers the accounting core", async () => {
  const { moduleProfiles, MATURED_MODULE_IDS, isMaturedModule } = await load("module-profiles.ts");
  assert.ok(MATURED_MODULE_IDS.includes("finance"), "finance must be a matured module");
  assert.ok(isMaturedModule("finance"));
  assert.ok(MATURED_MODULE_IDS.includes("banking"), "banking must stay matured");

  const finance = moduleProfiles.find((profile) => profile.moduleId === "finance");
  assert.ok(finance, "the finance profile must be registered");

  // The screens an accountant judges the module by.
  for (const pageId of [
    "chart-of-accounts", "nominals", "nominal-detail", "add-nominal",
    "journal-register", "journal-detail", "manual-journal", "journal-approval",
    "general-ledger", "trial-balance", "financial-statements",
    "period-close", "consolidation", "intercompany",
    "accounting-events", "finance-audit",
    // `finance-drilldown` is deliberately absent: drill-down is served by the
    // single renderer in app/drill/, registered against that page. A
    // per-screen drill profile would break the one-renderer rule.
  ]) {
    assert.ok(finance.pages[pageId], `finance must mature the ${pageId} screen`);
  }
});

test("every Finance profile page id exists in the screen catalogue", async () => {
  const { moduleProfiles } = await load("module-profiles.ts");
  const { prototypeModules } = await load("prototype-data.ts");
  const finance = moduleProfiles.find((profile) => profile.moduleId === "finance");
  const catalogue = new Set(
    prototypeModules
      .find((module) => module.id === "finance")
      .groups.flatMap((group) => group.pages.map((page) => page.id)),
  );
  const orphans = Object.keys(finance.pages).filter((pageId) => !catalogue.has(pageId));
  assert.deepEqual(orphans, [], "a profile page with no catalogue entry can never be reached");
});

test("the journal balances: debits equal credits", async () => {
  const { moduleProfiles } = await load("module-profiles.ts");
  const finance = moduleProfiles.find((profile) => profile.moduleId === "finance");
  const detail = finance.pages["journal-detail"].detail;

  const debits = detail.lines.reduce((sum, line) => sum + value(line.cells.debit), 0);
  const credits = detail.lines.reduce((sum, line) => sum + value(line.cells.credit), 0);
  assert.ok(debits > 0, "the journal must have postings");
  assert.equal(debits, credits, "an unbalanced journal cannot exist");

  const fields = new Map(detail.fields);
  assert.equal(fields.get("Balance check"), "Balanced", "the screen must state that it balances");
  assert.equal(
    value(fields.get("Total debits")),
    value(fields.get("Total credits")),
    "the stated totals must agree with each other",
  );
  assert.equal(value(fields.get("Total debits")), debits, "the stated total must agree with the lines");
});

test("the trial balance agrees", async () => {
  const { moduleProfiles } = await load("module-profiles.ts");
  const finance = moduleProfiles.find((profile) => profile.moduleId === "finance");
  const report = finance.pages["trial-balance"].report;

  const debits = report.rows.reduce((sum, row) => sum + value(row.cells.debit), 0);
  const credits = report.rows.reduce((sum, row) => sum + value(row.cells.credit), 0);
  assert.ok(debits > 0 && credits > 0, "the trial balance must carry balances");
  assert.equal(debits, credits, `trial balance out by ${debits - credits}`);

  const kpis = new Map(report.kpis.map((kpi) => [kpi.id, kpi]));
  assert.equal(value(kpis.get("tb-dr").value), debits, "the debit KPI must agree with the rows");
  assert.equal(value(kpis.get("tb-cr").value), credits, "the credit KPI must agree with the rows");
  assert.equal(value(kpis.get("tb-diff").value), 0, "the stated difference must be nil");
  assert.equal(kpis.get("tb-diff").tone, "positive", "an agreeing trial balance should read as healthy");

  // Every account sits on exactly one side.
  for (const row of report.rows) {
    const hasDebit = value(row.cells.debit) > 0;
    const hasCredit = value(row.cells.credit) > 0;
    assert.ok(hasDebit !== hasCredit, `account ${row.cells.code} must be debit or credit, not both or neither`);
  }
});

test("the general ledger arithmetic holds: opening + debits - credits = closing", async () => {
  const { moduleProfiles } = await load("module-profiles.ts");
  const finance = moduleProfiles.find((profile) => profile.moduleId === "finance");
  const report = finance.pages["general-ledger"].report;
  const kpis = new Map(report.kpis.map((kpi) => [kpi.id, value(kpi.value)]));

  assert.equal(
    kpis.get("gl-open") + kpis.get("gl-dr") - kpis.get("gl-cr"),
    kpis.get("gl-close"),
    "the closing balance must follow from the movement",
  );

  // The running balance column must actually run.
  let running = kpis.get("gl-open");
  for (const row of report.rows) {
    running += value(row.cells.debit) - value(row.cells.credit);
    assert.equal(value(row.cells.running), running, `running balance breaks at ${row.cells.ref}`);
  }
  assert.equal(running, kpis.get("gl-close"), "the last running balance must equal the closing balance");

  // The movement bridge must tell the same story as the numbers.
  const bridge = report.charts.find((chart) => chart.kind === "waterfall");
  assert.ok(bridge, "the ledger needs a movement bridge");
  const first = bridge.steps[0];
  const last = bridge.steps[bridge.steps.length - 1];
  assert.equal(first.value, kpis.get("gl-open"), "the bridge must open at the opening balance");
  assert.equal(last.value, kpis.get("gl-close"), "the bridge must close at the closing balance");
  assert.ok(last.isTotal, "the closing step is a total");
});

test("the statement ties to its own subtotals", async () => {
  const { moduleProfiles } = await load("module-profiles.ts");
  const finance = moduleProfiles.find((profile) => profile.moduleId === "finance");
  const report = finance.pages["financial-statements"].report;
  const line = (label) => report.rows.find((row) => row.cells.line === label).cells;

  const revenue = value(line("Revenue").current);
  const cost = value(line("Cost of sales").current);
  const gross = value(line("Gross profit").current);
  const opex = value(line("Operating expenses").current);
  const operating = value(line("Operating profit").current);
  const finance_ = value(line("Finance cost").current);
  const pbt = value(line("Profit before tax").current);

  // Costs are presented in brackets, so `value` already returns them negative;
  // they are therefore added here rather than subtracted.
  assert.ok(cost < 0 && opex < 0 && finance_ < 0, "costs must be presented as negative");
  assert.equal(gross, revenue + cost, "gross profit must be revenue less cost of sales");
  assert.equal(operating, gross + opex, "operating profit must be gross profit less operating expenses");
  assert.equal(pbt, operating + finance_, "profit before tax must be operating profit less finance cost");

  // Costs are shown in brackets, as a statement does.
  for (const label of ["Cost of sales", "Operating expenses", "Finance cost"]) {
    assert.match(line(label).current, /^\(.*\)$/, `${label} must be presented in brackets`);
  }
});

test("numeric columns are declared numeric so they align", async () => {
  const { moduleProfiles } = await load("module-profiles.ts");
  const finance = moduleProfiles.find((profile) => profile.moduleId === "finance");
  const moneyish = /amount|balance|debit|credit|value|total|current|prior|ours|theirs|difference|running/i;

  for (const [pageId, page] of Object.entries(finance.pages)) {
    const columnSets = [
      page.list?.columns,
      page.report?.columns,
      page.detail?.lineColumns,
    ].filter(Boolean);
    for (const columns of columnSets) {
      for (const column of columns) {
        if (moneyish.test(column.key)) {
          assert.ok(column.numeric, `${pageId}: column "${column.key}" holds figures and must be numeric`);
        }
      }
    }
  }
});

test("amount in words is correct, which is a legal requirement on a document", async () => {
  const { amountInWords } = await load("document-data.ts");
  const cases = [
    [0, "PKR Zero only"],
    [1, "PKR One only"],
    [15, "PKR Fifteen only"],
    [42, "PKR Forty-Two only"],
    [100, "PKR One Hundred only"],
    [118, "PKR One Hundred Eighteen only"],
    [1000, "PKR One Thousand only"],
    [4720, "PKR Four Thousand Seven Hundred Twenty only"],
    [1_000_000, "PKR One Million only"],
    [4_720_000, "PKR Four Million Seven Hundred Twenty Thousand only"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(amountInWords(input, "PKR"), expected, `amountInWords(${input})`);
  }
  // Fractional currency must be spelled out, not dropped.
  assert.match(amountInWords(1234.56, "PKR"), /and Fifty-Six Cents only$/);
  assert.match(amountInWords(99.01, "USD"), /^USD Ninety-Nine and One Cents only$/);
});

test("document fixtures and kinds are complete", async () => {
  const { KIND_META, documentLinesFrom, money } = await load("document-data.ts");

  for (const kind of ["invoice", "purchase-order", "statement", "journal-voucher"]) {
    const meta = KIND_META[kind];
    assert.ok(meta, `${kind} needs document metadata`);
    for (const field of ["title", "partyLabel", "numberLabel"]) {
      assert.ok(meta[field]?.length > 0, `${kind}.${field} must be set`);
    }
    assert.equal(typeof meta.showTax, "boolean");
  }
  // A statement of account and a journal voucher do not carry a tax column.
  assert.equal(KIND_META.statement.showTax, false);
  assert.equal(KIND_META["journal-voucher"].showTax, false);
  assert.equal(KIND_META.invoice.showTax, true);

  const rows = [
    { id: "r1", reference: "SKU-001", amount: "PKR 1,200.00" },
    { id: "r2", reference: "SKU-002", amount: "PKR 3,400.00" },
  ];
  const lines = documentLinesFrom(rows, 2);
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.ok(line.quantity > 0, "a document line needs a quantity");
    assert.ok(line.rate > 0, "a document line needs a rate");
    assert.ok(line.description.length > 0, "a document line needs a description");
    assert.ok(line.uom.length > 0, "a document line needs a unit of measure");
  }
  // quantity x rate must reconstruct the source amount.
  assert.equal(Math.round(lines[0].quantity * lines[0].rate), 1200);
  assert.equal(Math.round(lines[1].quantity * lines[1].rate), 3400);
  assert.equal(money(1200, "PKR"), "PKR 1,200.00");
});

test("drill-down is served by the one renderer, not by a per-screen profile", async () => {
  const { moduleProfiles } = await load("module-profiles.ts");
  const finance = moduleProfiles.find((profile) => profile.moduleId === "finance");
  assert.ok(
    !finance.pages["finance-drilldown"],
    "a per-screen drill profile would break the one-renderer rule",
  );

  const { getDrillEntry } = await load("drill/registry.ts");
  const entry = getDrillEntry("finance", "finance-drilldown");
  assert.ok(entry, "the drill registry must serve the finance drill-down page");
  assert.equal(entry.viewId, "finance-gl");
  assert.equal(entry.chainId, "statement");
});
