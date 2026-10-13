/**
 * Bank reconciliation register.
 *
 * `Bank > Reconciliation` is a register of reconciliation records, not a
 * workspace: the menu opens the list, a record is opened from it, and
 * `+ Add New` starts one. The things a reviewer would check are the things
 * that make the list trustworthy rather than decorative:
 *
 *   - a certified reconciliation cannot carry an unexplained difference;
 *   - an account cannot hold two live reconciliations at once, which is the
 *     same rule the database enforces with a partial unique index;
 *   - the statement code agrees with the method that produced it;
 *   - the column keys are the ones the shared list filters bind to, so the
 *     Bank, Cur. and Date Range filters actually filter;
 *   - a mixed-currency difference is translated before it is summed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const stamp = `${process.pid}-${Date.now()}`;

async function load(name) {
  const url = new URL(`../app/${name}`, import.meta.url);
  url.searchParams.set("test", stamp);
  return import(url.href);
}

test("the reconciliation register is a coherent set of records", async () => {
  const { reconciliationRegister, reconciliationDifference, liveStatuses } = await load("banking-reconciliation-data.ts");
  const { findBankAccount } = await load("banking-master-data.ts");

  assert.ok(reconciliationRegister.length >= 6, "the register needs enough records to be worth filtering");

  const ids = reconciliationRegister.map((record) => record.id);
  assert.deepEqual(ids, [...new Set(ids)], "reconciliation ids must be unique");

  for (const record of reconciliationRegister) {
    assert.match(record.id, /^REC-\d{4}-\d{4}$/, `${record.id} is not a reconciliation reference`);
    assert.ok(findBankAccount(record.accountId), `${record.id} points at unknown account ${record.accountId}`);
    assert.ok(["Draft", "In progress", "Submitted", "Approved"].includes(record.status), `${record.id} has status ${record.status}`);
    assert.ok(["Statement import", "Manual tick"].includes(record.method), `${record.id} has method ${record.method}`);
    assert.ok(record.openItems <= record.totalItems, `${record.id} reports more open items than it has`);
    assert.ok(record.openItems >= 0 && record.totalItems >= 0, `${record.id} has a negative item count`);
    assert.ok(record.preparedBy.length > 0, `${record.id} has no preparer`);

    // A statement code names the evidence, so it has to agree with the method
    // that produced it: an imported statement carries the bank's own code, a
    // manual tick carries a keyed reference or none at all.
    if (record.method === "Statement import") {
      assert.match(record.statementCode, /^STMT-/, `${record.id} imported a statement but has code ${record.statementCode}`);
    } else {
      assert.match(record.statementCode, /^(MAN-|Not imported$)/, `${record.id} was ticked manually but has code ${record.statementCode}`);
    }
  }

  // Certification means the statement and the ledger agree. A submitted or
  // approved record carrying a difference would be a reconciliation that
  // reconciles nothing.
  for (const record of reconciliationRegister.filter((item) => !liveStatuses.includes(item.status) || item.status === "Submitted")) {
    if (record.status === "Submitted" || record.status === "Approved") {
      assert.equal(reconciliationDifference(record), 0, `${record.id} is ${record.status} but still differs`);
      assert.equal(record.openItems, 0, `${record.id} is ${record.status} with ${record.openItems} items still open`);
    }
  }
});

test("an account can hold only one live reconciliation", async () => {
  const { reconciliationRegister, liveStatuses, liveReconciliationFor } = await load("banking-reconciliation-data.ts");

  const liveByAccount = new Map();
  for (const record of reconciliationRegister.filter((item) => liveStatuses.includes(item.status))) {
    const existing = liveByAccount.get(record.accountId);
    assert.equal(existing, undefined, `${record.accountId} holds two live reconciliations: ${existing?.id} and ${record.id}`);
    liveByAccount.set(record.accountId, record);
  }

  // The register helper is what the create panel uses to refuse a second one.
  for (const [accountId, record] of liveByAccount) {
    assert.equal(liveReconciliationFor(accountId, reconciliationRegister)?.id, record.id);
  }
  const settled = reconciliationRegister.find((record) => record.status === "Approved" && !liveByAccount.has(record.accountId));
  assert.ok(settled, "an account with no live reconciliation is needed to prove a new one is allowed");
  assert.equal(liveReconciliationFor(settled.accountId, reconciliationRegister), undefined);
});

test("register columns carry the keys the shared list filters bind to", async () => {
  const { registerColumns, toRow, reconciliationRegister } = await load("banking-reconciliation-data.ts");

  assert.deepEqual(
    registerColumns.map((column) => column.label),
    ["ID", "Date", "Bank", "Code", "Cur.", "Balance", "In Progress"],
  );
  assert.deepEqual(
    registerColumns.filter((column) => column.numeric).map((column) => column.key),
    ["balance"],
    "the balance is money and must align as money",
  );

  // ModuleSearchableTable resolves its Bank, Cur. and Date Range filters from
  // these exact keys. If they drift the filters silently stop filtering.
  const keys = registerColumns.map((column) => column.key);
  for (const key of ["bank", "currency", "date"]) {
    assert.ok(keys.includes(key), `missing filterable column key ${key}`);
  }

  for (const record of reconciliationRegister) {
    const row = toRow(record);
    assert.equal(row.id, record.id);
    assert.equal(row.status, record.status);
    for (const column of registerColumns) {
      const value = row.cells[column.key];
      assert.ok(value && value !== "—", `${record.id} has no ${column.label} value`);
    }
    assert.match(row.cells.progress, record.openItems > 0 ? /open$/ : /All items matched/);
  }
});

test("register arithmetic and labelling are computed, not typed", async () => {
  const { differenceInBaseCurrency, displayDate, periodLabelFor, nextReconciliationId, reconciliationRegister } =
    await load("banking-reconciliation-data.ts");
  const { exchangeRates } = await load("banking-master-data.ts");

  // BA-8814 is a EUR account: its difference has to be translated before it
  // joins a USD one, or the total is true in no currency at all.
  const eur = reconciliationRegister.find((record) => record.accountId === "BA-8814" && record.openItems > 0);
  const usd = reconciliationRegister.find((record) => record.accountId === "BA-4471" && record.openItems > 0);
  assert.ok(eur && usd, "the register needs a live EUR and a live USD record");
  const expected = Math.abs(eur.ledgerBalance - eur.statementBalance) * exchangeRates.EUR
    + Math.abs(usd.ledgerBalance - usd.statementBalance) * exchangeRates.USD;
  assert.equal(differenceInBaseCurrency([eur, usd]), expected);
  assert.notEqual(
    differenceInBaseCurrency([eur, usd]),
    Math.abs(eur.ledgerBalance - eur.statementBalance) + Math.abs(usd.ledgerBalance - usd.statementBalance),
    "a naive sum would have passed; the translation is the point",
  );

  assert.equal(displayDate("2026-09-30"), "30 Sep 2026");
  assert.equal(displayDate("2026-01-05"), "05 Jan 2026");
  assert.equal(periodLabelFor("2026-09-30"), "September 2026");

  // A created reconciliation must not reuse an existing reference.
  const existing = new Set(reconciliationRegister.map((record) => record.id));
  for (let created = 0; created < 5; created += 1) {
    assert.equal(existing.has(nextReconciliationId(created)), false, "new reconciliation id collides with the register");
  }
  assert.notEqual(nextReconciliationId(0), nextReconciliationId(1));
});

test("the Reconciliation menu opens the register, and Add New opens the worksheet", async () => {
  const [content, register, worksheet, workspace] = await Promise.all([
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-reconciliation-register.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-reconciliation-worksheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/banking-reconciliation.tsx", import.meta.url), "utf8"),
  ]);

  // The page lands on the register; the workspace is reached only by opening a
  // record, which is why the record id is required before it renders.
  assert.match(content, /function BankingReconciliationPage\(/);
  assert.match(content, /<BankingReconciliationRegister/);
  assert.match(content, /<BankingReconciliationWorksheet/);
  assert.match(content, /kind: "open"; recordId: string/);
  assert.match(content, /setView\(\{ kind: "new" \}\)/);
  assert.match(content, />\+ Add New<\/ActionButton>/);

  // Leaving the page has to unmount the view state, or Reconciliation reopens
  // on whichever record was last open.
  assert.match(content, /returning to Reconciliation always lands on the/);

  assert.match(register, /ModuleSearchableTable/);
  assert.match(register, /Live reconciliations/);
  assert.match(register, /Difference to explain/);

  // The worksheet is the reference screen: the four required inputs, the
  // arithmetic strip, the tick column and both save actions.
  for (const label of [
    "Bank account",
    "Statement date",
    "Statement balance",
    "Load transactions",
    "Opening balance",
    "Receipts",
    "Payments",
    "Difference",
    "Save and close",
    "Save and submit",
    "Add adjustment",
  ]) {
    assert.ok(worksheet.includes(label), `worksheet is missing ${label}`);
  }
  assert.match(worksheet, /already has a live reconciliation/);
  assert.match(worksheet, /Continue to statement import/);
  // Submitting is gated on the difference, in the handler and in the control.
  assert.match(worksheet, /canSubmitWorksheet\(totals\.difference\)/);
  assert.match(worksheet, /disabled=\{!loaded \|\| !nilDifference\}/);

  // The workspace shows the record it was opened with and can get back.
  assert.match(workspace, /← Reconciliations/);
  assert.match(workspace, /record\?\.statementBalance/);
  assert.match(workspace, /record\?\.ledgerBalance/);
});

test("a certified reconciliation is opened read-only, with derived numbers", async () => {
  const workspace = await readFile(new URL("../app/banking-reconciliation.tsx", import.meta.url), "utf8");

  // Submitted and approved records cannot offer to change themselves.
  assert.match(workspace, /const certified = record \? record\.status === "Submitted" \|\| record\.status === "Approved" : false;/);
  const guarded = workspace.slice(workspace.indexOf("{certified ? ("), workspace.indexOf("</header>"));
  assert.match(guarded, /Print reconciliation/);
  assert.match(guarded, /Request reopen/);
  assert.ok(
    guarded.indexOf("Submit for approval") > guarded.indexOf(") : ("),
    "Submit for approval must sit on the not-yet-certified branch",
  );

  // The progress strip has to count the record it was opened with, not the
  // numbers of the sample statement it ships with.
  assert.match(workspace, /record\.totalItems - record\.openItems/);
  assert.doesNotMatch(workspace, /"178 exact"/);
  assert.match(workspace, /certified \|\| index < 2 \|\| completed/);
});

test("the worksheet reconstructs the bank balance from what is ticked", async () => {
  const {
    worksheetLinesFor,
    worksheetOpeningBalance,
    worksheetTotals,
    impliedStatementBalance,
    isNilDifference,
    canSubmitWorksheet,
    adjustmentKinds,
  } = await load("banking-reconciliation-data.ts");
  const { statements } = await load("banking-statement-data.ts");

  // Payroll USD is the worked example: it ties to its account balance, so the
  // arithmetic can be checked against a figure that exists elsewhere.
  const account = "BA-4472";
  const lines = worksheetLinesFor(account, "2026-08-31");
  assert.equal(lines.length, statements[account].lines.length);

  const opening = worksheetOpeningBalance(account);
  const none = worksheetTotals(lines, new Set(), opening, 0);
  assert.equal(none.receipts, 0);
  assert.equal(none.payments, 0);
  assert.equal(none.balance, opening, "with nothing ticked the balance is the opening balance");

  const all = worksheetTotals(lines, new Set(lines.map((line) => line.id)), opening, 0);
  assert.equal(all.receipts, 500000);
  assert.equal(all.payments, 647640);
  assert.equal(all.balance, 92360, "opening + receipts - payments must rebuild the closing balance");
  assert.equal(all.untickedCount, 0);

  // Ticking everything against the implied statement figure reconciles.
  const implied = impliedStatementBalance(account, "2026-08-31");
  assert.equal(implied, 92360);
  const reconciled = worksheetTotals(lines, new Set(lines.map((line) => line.id)), opening, implied);
  assert.equal(reconciled.difference, 0);
  assert.equal(isNilDifference(reconciled.difference), true);
  assert.equal(canSubmitWorksheet(reconciled.difference), true);

  // Leave one payment unticked and the difference is exactly that payment.
  const partial = worksheetTotals(
    lines,
    new Set(lines.filter((line) => line.id !== "p5").map((line) => line.id)),
    opening,
    implied,
  );
  assert.equal(partial.difference, -87640);
  assert.equal(partial.untickedCount, 1);
  assert.equal(canSubmitWorksheet(partial.difference), false, "a reconciliation that differs cannot be submitted");

  // A bank charge lowers the bank balance; interest raises it. Getting these
  // backwards would move the difference the wrong way.
  assert.equal(adjustmentKinds.find((item) => item.kind === "Bank charge").direction, -1);
  assert.equal(adjustmentKinds.find((item) => item.kind === "Interest earned").direction, 1);
  const adjusted = worksheetTotals(
    lines,
    new Set(lines.filter((line) => line.id !== "p5").map((line) => line.id)),
    opening,
    implied,
    [{ id: "a1", kind: "Bank charge", amount: -87640, narrative: "Standing in for the unticked payment" }],
  );
  assert.equal(adjusted.difference, 0, "an adjustment of the missing amount clears the difference");

  // Money is compared to the cent, never with ===.
  assert.equal(isNilDifference(0.004), true);
  assert.equal(isNilDifference(0.01), false);
});

test("the worksheet never offers a movement dated after the statement", async () => {
  const { worksheetLinesFor } = await load("banking-reconciliation-data.ts");
  const { statements } = await load("banking-statement-data.ts");

  // BA-4471 carries September movements; an August reconciliation must not be
  // able to tick them as presented on an August statement.
  const august = worksheetLinesFor("BA-4471", "2026-08-31");
  const everything = statements["BA-4471"].lines;
  assert.ok(august.length < everything.length, "the fixture needs later movements for this to mean anything");
  for (const line of august) {
    assert.ok(line.date <= "2026-08-31", `${line.voucher} is dated ${line.date}`);
  }
  for (const line of everything.filter((item) => item.date > "2026-08-31")) {
    assert.equal(august.some((item) => item.id === line.id), false, `${line.voucher} leaked into the August worksheet`);
  }

  // An account with no statement fixture reconciles to an empty worksheet
  // rather than throwing.
  assert.deepEqual(worksheetLinesFor("BA-CASH", "2026-08-31"), []);
});

test("statement fixtures tie to the account they belong to", async () => {
  const { statements } = await load("banking-statement-data.ts");
  const { findBankAccount } = await load("banking-master-data.ts");

  const { chartOfAccounts, findAccount } = await load("banking-master-data.ts");
  assert.ok(chartOfAccounts.length > 0);

  for (const [accountId, statement] of Object.entries(statements)) {
    assert.ok(findBankAccount(accountId), `statement fixture for unknown account ${accountId}`);
    for (const line of statement.lines) {
      // The contra account of a bank movement has to be a real posting
      // account, and never equity: money moving through a bank account is
      // income, expense, a receivable, a payable or another bank account.
      const contra = findAccount(line.nominal);
      assert.ok(contra, `${line.voucher} posts to unknown account ${line.nominal}`);
      assert.equal(contra.isHeader ?? false, false, `${line.voucher} posts to header account ${line.nominal}`);
      assert.notEqual(contra.type, "equity", `${line.voucher} posts a bank movement to equity (${contra.name})`);
      assert.match(line.date, /^\d{4}-\d{2}-\d{2}$/, `${line.voucher} has a non-ISO date`);
      assert.ok(
        (line.debit > 0) !== (line.credit > 0),
        `${line.voucher} must be a receipt or a payment, never both or neither`,
      );
    }
    const dates = statement.lines.map((line) => line.date);
    assert.deepEqual([...dates].sort(), dates, `${accountId} statement lines are out of date order`);
  }

  // Payroll USD and Collections EUR are the two accounts whose sampled lines
  // are the complete period: their closing balance must equal the account.
  for (const accountId of ["BA-4472", "BA-8814"]) {
    const statement = statements[accountId];
    const closing = statement.lines.reduce(
      (total, line) => total + line.debit - line.credit,
      statement.openingBalance,
    );
    assert.equal(closing, findBankAccount(accountId).ledgerBalance, `${accountId} statement does not tie to its ledger balance`);
  }
});
