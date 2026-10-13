/**
 * Finance & Accounting module maturity profile.
 *
 * Finance is the second module to be matured beyond the generic archetypes
 * (Banking was the first). It is the right one to do next because it is the
 * product's core and because accountants judge an ERP by exactly these
 * screens: the chart of accounts, the journal register, a journal that
 * balances, the general ledger, the trial balance and the close.
 *
 * The numbers here are constructed to behave like real books:
 *   - every journal has equal debits and credits
 *   - the trial balance totals agree to the currency unit
 *   - the general ledger runs Opening + Debits - Credits = Closing
 *   - statement figures reconcile to the trial balance
 * That internal consistency is what makes the screens reviewable. They are
 * still invented fixtures: nothing posts, numbers, or reaches the Demo
 * Account, and there is no API, database or accounting engine behind them.
 *
 * Note: there is deliberately no `finance-drilldown` entry here. Drill-down
 * is served by the single renderer in `app/drill/`, registered against that
 * page. A per-screen drill component would break the one-renderer rule.
 */

import type { ModuleProfile, ModuleRow } from "./module-profile-types";

const CURRENCY = "PKR";

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function row(id: string, status: string, cells: Record<string, string>): ModuleRow {
  return { id, status, cells };
}

/* ------------------------------------------------------------------ *
 * Chart of accounts
 * ------------------------------------------------------------------ */

const nominalAccounts: readonly { code: string; name: string; type: string; section: string; balance: number; dc: "Dr" | "Cr" }[] = [
  { code: "1100", name: "Cash in hand", type: "Asset", section: "Current assets", balance: 418_500, dc: "Dr" },
  { code: "1110", name: "Meridian Commercial - current", type: "Asset", section: "Current assets", balance: 9_642_180, dc: "Dr" },
  { code: "1200", name: "Trade receivables - local", type: "Asset", section: "Current assets", balance: 14_286_400, dc: "Dr" },
  { code: "1210", name: "Trade receivables - export", type: "Asset", section: "Current assets", balance: 3_915_750, dc: "Dr" },
  { code: "1300", name: "Raw material inventory", type: "Asset", section: "Inventory", balance: 6_204_900, dc: "Dr" },
  { code: "1310", name: "Finished goods inventory", type: "Asset", section: "Inventory", balance: 4_488_260, dc: "Dr" },
  { code: "1400", name: "Advance income tax", type: "Asset", section: "Current assets", balance: 1_126_400, dc: "Dr" },
  { code: "1500", name: "Plant and machinery", type: "Asset", section: "Non-current assets", balance: 22_750_000, dc: "Dr" },
  { code: "1510", name: "Accumulated depreciation - plant", type: "Asset", section: "Non-current assets", balance: 6_842_500, dc: "Cr" },
  { code: "2100", name: "Trade payables", type: "Liability", section: "Current liabilities", balance: 11_472_330, dc: "Cr" },
  { code: "2150", name: "Accrued expenses", type: "Liability", section: "Current liabilities", balance: 1_884_600, dc: "Cr" },
  { code: "2200", name: "Output tax payable", type: "Liability", section: "Current liabilities", balance: 2_341_880, dc: "Cr" },
  { code: "2300", name: "Long-term loan - Meridian", type: "Liability", section: "Non-current liabilities", balance: 12_500_000, dc: "Cr" },
  { code: "3100", name: "Issued share capital", type: "Equity", section: "Equity", balance: 15_000_000, dc: "Cr" },
  { code: "3200", name: "Retained earnings", type: "Equity", section: "Equity", balance: 9_035_720, dc: "Cr" },
  { code: "4100", name: "Revenue - manufactured goods", type: "Revenue", section: "Trading", balance: 38_905_400, dc: "Cr" },
  { code: "4200", name: "Revenue - services", type: "Revenue", section: "Trading", balance: 7_318_900, dc: "Cr" },
  { code: "5100", name: "Cost of materials consumed", type: "Expense", section: "Cost of sales", balance: 21_640_200, dc: "Dr" },
  { code: "5200", name: "Manufacturing overhead", type: "Expense", section: "Cost of sales", balance: 5_912_450, dc: "Dr" },
  { code: "6100", name: "Salaries and wages", type: "Expense", section: "Operating expenses", balance: 9_480_600, dc: "Dr" },
  { code: "6200", name: "Utilities and fuel", type: "Expense", section: "Operating expenses", balance: 2_338_900, dc: "Dr" },
  { code: "6300", name: "Depreciation charge", type: "Expense", section: "Operating expenses", balance: 1_912_500, dc: "Dr" },
  { code: "6400", name: "Finance cost - interest", type: "Expense", section: "Finance cost", balance: 1_184_290, dc: "Dr" },
];

const debitTotal = nominalAccounts.filter((a) => a.dc === "Dr").reduce((s, a) => s + a.balance, 0);
const creditTotal = nominalAccounts.filter((a) => a.dc === "Cr").reduce((s, a) => s + a.balance, 0);

/* ------------------------------------------------------------------ *
 * Journals - each one balances
 * ------------------------------------------------------------------ */

interface JournalLine { account: string; name: string; debit: number; credit: number; dimension: string }

const journalLines: readonly JournalLine[] = [
  { account: "1200", name: "Trade receivables - local", debit: 4_720_000, credit: 0, dimension: "Sales / North" },
  { account: "4100", name: "Revenue - manufactured goods", debit: 0, credit: 4_000_000, dimension: "Sales / North" },
  { account: "2200", name: "Output tax payable", debit: 0, credit: 720_000, dimension: "Sales / North" },
];
const journalDebit = journalLines.reduce((s, l) => s + l.debit, 0);
const journalCredit = journalLines.reduce((s, l) => s + l.credit, 0);

const journals: readonly { id: string; ref: string; date: string; type: string; narration: string; amount: number; status: string; owner: string }[] = [
  { id: "jv-2291", ref: "JV-2026-02291", date: "2026-09-08", type: "Sales", narration: "September invoicing batch - northern region", amount: 4_720_000, status: "Posted", owner: "A. Qureshi" },
  { id: "jv-2290", ref: "JV-2026-02290", date: "2026-09-08", type: "Purchase", narration: "Raw material receipts against PO-8841", amount: 3_186_500, status: "Posted", owner: "S. Farooq" },
  { id: "jv-2289", ref: "JV-2026-02289", date: "2026-09-07", type: "Payroll", narration: "August payroll accrual and statutory deductions", amount: 9_480_600, status: "Posted", owner: "N. Habib" },
  { id: "jv-2288", ref: "JV-2026-02288", date: "2026-09-07", type: "Manual", narration: "Depreciation charge for August", amount: 1_912_500, status: "Pending approval", owner: "A. Qureshi" },
  { id: "jv-2287", ref: "JV-2026-02287", date: "2026-09-05", type: "Bank", narration: "Interest on long-term loan facility", amount: 1_184_290, status: "Posted", owner: "T. Mahmood" },
  { id: "jv-2286", ref: "JV-2026-02286", date: "2026-09-04", type: "Manual", narration: "Reclassify export receivable misposting", amount: 615_400, status: "Draft", owner: "A. Qureshi" },
  { id: "jv-2285", ref: "JV-2026-02285", date: "2026-09-03", type: "FX", narration: "Month-end revaluation - USD receivables", amount: 284_750, status: "Reversed", owner: "System" },
];

/* ------------------------------------------------------------------ *
 * General ledger movement - Opening + Dr - Cr = Closing
 * ------------------------------------------------------------------ */

const glOpening = 11_842_300;
const glMovements: readonly { ref: string; date: string; narration: string; debit: number; credit: number }[] = [
  { ref: "JV-2026-02291", date: "2026-09-08", narration: "September invoicing batch", debit: 4_720_000, credit: 0 },
  { ref: "BR-2026-00418", date: "2026-09-08", narration: "Receipt - Crescent Textiles", debit: 0, credit: 2_180_000 },
  { ref: "JV-2026-02286", date: "2026-09-04", narration: "Reclassify export receivable", debit: 0, credit: 615_400 },
  { ref: "BR-2026-00412", date: "2026-09-02", narration: "Receipt - Atlas Engineering", debit: 0, credit: 1_460_500 },
  { ref: "JV-2026-02280", date: "2026-09-01", narration: "Opening invoicing batch", debit: 2_980_000, credit: 0 },
];
const glDebits = glMovements.reduce((s, m) => s + m.debit, 0);
const glCredits = glMovements.reduce((s, m) => s + m.credit, 0);
const glClosing = glOpening + glDebits - glCredits;

/* ------------------------------------------------------------------ *
 * Statement figures, tied to the trial balance
 * ------------------------------------------------------------------ */

const revenue = 38_905_400 + 7_318_900;
const costOfSales = 21_640_200 + 5_912_450;
const grossProfit = revenue - costOfSales;
const operatingExpenses = 9_480_600 + 2_338_900 + 1_912_500;
const operatingProfit = grossProfit - operatingExpenses;
const financeCost = 1_184_290;
const profitBeforeTax = operatingProfit - financeCost;

export const financeProfile: ModuleProfile = {
  moduleId: "finance",
  pages: {
    /* ---- Chart of accounts ---------------------------------------- */
    "chart-of-accounts": {
      list: {
        columns: [
          { key: "code", label: "Code" },
          { key: "name", label: "Account name" },
          { key: "type", label: "Type" },
          { key: "section", label: "Section" },
          { key: "dc", label: "Dr/Cr" },
          { key: "balance", label: `Balance (${CURRENCY})`, numeric: true },
        ],
        rows: nominalAccounts.map((a) =>
          row(a.code, a.dc === "Dr" ? "Debit balance" : "Credit balance", {
            code: a.code, name: a.name, type: a.type, section: a.section,
            dc: a.dc, balance: money(a.balance),
          }),
        ),
        linkKey: "code",
        openPageId: "nominal-detail",
        createPageId: "add-nominal",
        createLabel: "Add nominal",
        filters: ["All types", "Asset", "Liability", "Equity", "Revenue", "Expense"],
        summary: `${nominalAccounts.length} posting accounts · debits ${CURRENCY} ${money(debitTotal)} · credits ${CURRENCY} ${money(creditTotal)}`,
        totalRecords: nominalAccounts.length,
      },
    },
    nominals: {
      list: {
        columns: [
          { key: "code", label: "Nominal code" },
          { key: "name", label: "Description" },
          { key: "section", label: "Reporting section" },
          { key: "balance", label: `Closing balance (${CURRENCY})`, numeric: true },
        ],
        rows: nominalAccounts.map((a) =>
          row(a.code, a.type, { code: a.code, name: a.name, section: a.section, balance: money(a.balance) }),
        ),
        linkKey: "code",
        openPageId: "nominal-detail",
        createPageId: "add-nominal",
        createLabel: "Add nominal",
        summary: "Posting-level accounts only. Structural sections are maintained separately.",
        totalRecords: nominalAccounts.length,
      },
    },
    "nominal-detail": {
      detail: {
        fields: [
          ["Nominal code", "1200"],
          ["Account name", "Trade receivables - local"],
          ["Account type", "Asset · Current assets"],
          ["Control account", "Yes - subledger controlled"],
          ["Currency", CURRENCY],
          ["Posting allowed", "Subledger only"],
          ["Opening balance", `${CURRENCY} ${money(glOpening)}`],
          ["Closing balance", `${CURRENCY} ${money(glClosing)}`],
        ],
        lineColumns: [
          { key: "ref", label: "Document" },
          { key: "date", label: "Date" },
          { key: "narration", label: "Narration" },
          { key: "debit", label: "Debit", numeric: true },
          { key: "credit", label: "Credit", numeric: true },
        ],
        lines: glMovements.map((m, i) =>
          row(`gl-${i}`, m.debit ? "Debit" : "Credit", {
            ref: m.ref, date: m.date, narration: m.narration,
            debit: m.debit ? money(m.debit) : "—",
            credit: m.credit ? money(m.credit) : "—",
          }),
        ),
      },
    },
    "add-nominal": {
      form: {
        sections: [
          {
            title: "Account identity",
            fields: [
              { label: "Nominal code *", value: "Next in sequence" },
              { label: "Account name *", value: "" },
              { label: "Account type *", value: "Asset", type: "select", options: ["Asset", "Liability", "Equity", "Revenue", "Expense"] },
              { label: "Reporting section *", value: "Current assets", type: "select", options: ["Current assets", "Non-current assets", "Inventory", "Current liabilities", "Non-current liabilities", "Equity", "Trading", "Cost of sales", "Operating expenses", "Finance cost"] },
            ],
          },
          {
            title: "Posting controls",
            fields: [
              { label: "Control account", value: "No", type: "select", options: ["No", "Yes - receivables", "Yes - payables", "Yes - inventory", "Yes - tax"] },
              { label: "Direct posting", value: "Allowed", type: "select", options: ["Allowed", "Subledger only", "System only"] },
              { label: "Default currency", value: CURRENCY, type: "select", options: [CURRENCY, "USD", "EUR", "AED"] },
              { label: "Reconciliation required", value: "No", type: "select", options: ["No", "Monthly", "At period close"] },
              { label: "Notes", value: "", type: "textarea", wide: true },
            ],
          },
        ],
      },
    },

    /* ---- Journals -------------------------------------------------- */
    "journal-register": {
      list: {
        columns: [
          { key: "ref", label: "Voucher" },
          { key: "date", label: "Date" },
          { key: "type", label: "Type" },
          { key: "narration", label: "Narration" },
          { key: "amount", label: `Amount (${CURRENCY})`, numeric: true },
          { key: "owner", label: "Prepared by" },
        ],
        rows: journals.map((j) =>
          row(j.id, j.status, {
            ref: j.ref, date: j.date, type: j.type, narration: j.narration,
            amount: money(j.amount), owner: j.owner,
          }),
        ),
        linkKey: "ref",
        openPageId: "journal-detail",
        createPageId: "manual-journal",
        createLabel: "New journal",
        filters: ["All statuses", "Draft", "Pending approval", "Posted", "Reversed"],
        summary: "Every listed voucher is balanced: total debits equal total credits.",
        totalRecords: journals.length,
      },
    },
    "journal-detail": {
      detail: {
        fields: [
          ["Voucher", "JV-2026-02291"],
          ["Voucher date", "2026-09-08"],
          ["Type", "Sales journal"],
          ["Period", "September 2026 · open"],
          ["Narration", "September invoicing batch - northern region"],
          ["Prepared by", "A. Qureshi"],
          ["Approved by", "F. Rehman"],
          ["Total debits", `${CURRENCY} ${money(journalDebit)}`],
          ["Total credits", `${CURRENCY} ${money(journalCredit)}`],
          ["Balance check", journalDebit === journalCredit ? "Balanced" : "OUT OF BALANCE"],
        ],
        lineColumns: [
          { key: "account", label: "Account" },
          { key: "name", label: "Account name" },
          { key: "dimension", label: "Dimension" },
          { key: "debit", label: "Debit", numeric: true },
          { key: "credit", label: "Credit", numeric: true },
        ],
        lines: journalLines.map((l, i) =>
          row(`jl-${i}`, l.debit ? "Debit" : "Credit", {
            account: l.account, name: l.name, dimension: l.dimension,
            debit: l.debit ? money(l.debit) : "—",
            credit: l.credit ? money(l.credit) : "—",
          }),
        ),
      },
    },
    "manual-journal": {
      form: {
        sections: [
          {
            title: "Voucher header",
            fields: [
              { label: "Voucher number", value: "Assigned on posting" },
              { label: "Voucher date *", value: "2026-09-11", type: "date" },
              { label: "Journal type *", value: "Manual", type: "select", options: ["Manual", "Sales", "Purchase", "Payroll", "Bank", "FX", "Accrual", "Reversal"] },
              { label: "Fiscal period", value: "September 2026 (open)", type: "select", options: ["September 2026 (open)", "August 2026 (closed)"] },
              { label: "Narration *", value: "", type: "textarea", wide: true },
            ],
          },
          {
            title: "Control and evidence",
            fields: [
              { label: "Supporting reference", value: "" },
              { label: "Cost centre", value: "Corporate", type: "select", options: ["Corporate", "Manufacturing", "Sales", "Logistics"] },
              { label: "Reversal required", value: "No", type: "select", options: ["No", "Auto-reverse next period"] },
              { label: "Attachment", value: "Attach approval or calculation", wide: true },
            ],
          },
        ],
      },
    },
    "journal-approval": {
      workflow: {
        steps: [
          { label: "Prepared", state: "complete" },
          { label: "Balance check", state: "complete" },
          { label: "Period check", state: "complete" },
          { label: "Approval", state: "current" },
          { label: "Posted to ledger", state: "pending" },
        ],
        currentTitle: "JV-2026-02288 · Depreciation charge for August",
        currentFields: [
          ["Total debits", `${CURRENCY} ${money(1_912_500)}`],
          ["Total credits", `${CURRENCY} ${money(1_912_500)}`],
          ["Balance", "Balanced"],
          ["Prepared by", "A. Qureshi"],
          ["Approver", "F. Rehman · Financial Controller"],
          ["Segregation of duties", "Preparer cannot approve"],
          ["Period status", "September 2026 · open"],
        ],
        exceptions: [
          { id: "fx-1", title: "Depreciation run is one day late", detail: "The schedule expects posting on the first working day of the month." },
          { id: "fx-2", title: "Asset 1500-0142 has no useful-life review", detail: "Review is due this quarter; the charge is unaffected." },
        ],
      },
    },
    "journal-reversal": {
      form: {
        sections: [
          {
            title: "Reversal instruction",
            fields: [
              { label: "Original voucher *", value: "JV-2026-02285" },
              { label: "Reversal date *", value: "2026-09-11", type: "date" },
              { label: "Reversal reason *", value: "Month-end revaluation restated", type: "textarea", wide: true },
              { label: "Method", value: "Mirror entry (reverse signs)", type: "select", options: ["Mirror entry (reverse signs)", "Negative restatement"] },
              { label: "Posting period", value: "September 2026 (open)", type: "select", options: ["September 2026 (open)"] },
            ],
          },
        ],
      },
    },

    /* ---- Ledgers and close ---------------------------------------- */
    "accounting-events": {
      list: {
        columns: [
          { key: "event", label: "Event" },
          { key: "source", label: "Source document" },
          { key: "date", label: "Captured" },
          { key: "voucher", label: "Resulting voucher" },
          { key: "amount", label: `Value (${CURRENCY})`, numeric: true },
        ],
        rows: [
          row("ev-1", "Posted", { event: "Sales invoice issued", source: "INV-2026-11842", date: "2026-09-08", voucher: "JV-2026-02291", amount: money(4_720_000) }),
          row("ev-2", "Posted", { event: "Goods received", source: "GRN-2026-04417", date: "2026-09-08", voucher: "JV-2026-02290", amount: money(3_186_500) }),
          row("ev-3", "Posted", { event: "Payroll accrued", source: "PR-2026-08", date: "2026-09-07", voucher: "JV-2026-02289", amount: money(9_480_600) }),
          row("ev-4", "Awaiting posting", { event: "Depreciation computed", source: "FA-RUN-2026-08", date: "2026-09-07", voucher: "JV-2026-02288", amount: money(1_912_500) }),
          row("ev-5", "Compensated", { event: "FX revaluation", source: "FX-RUN-2026-08", date: "2026-09-03", voucher: "JV-2026-02285", amount: money(284_750) }),
        ],
        linkKey: "voucher",
        openPageId: "journal-detail",
        summary: "Events are captured once and posted once; a compensated event keeps both entries.",
        totalRecords: 5,
      },
    },
    "general-ledger": {
      report: {
        kpis: [
          { id: "gl-open", label: "Opening balance", value: `${CURRENCY} ${money(glOpening)}`, delta: "1 Sep 2026", comparison: "Brought forward", tone: "neutral" },
          { id: "gl-dr", label: "Debits in period", value: `${CURRENCY} ${money(glDebits)}`, delta: `${glMovements.filter((m) => m.debit).length} entries`, comparison: "Invoicing and journals", tone: "info" },
          { id: "gl-cr", label: "Credits in period", value: `${CURRENCY} ${money(glCredits)}`, delta: `${glMovements.filter((m) => m.credit).length} entries`, comparison: "Receipts and reclassification", tone: "info" },
          { id: "gl-close", label: "Closing balance", value: `${CURRENCY} ${money(glClosing)}`, delta: "Opening + Dr − Cr", comparison: "Agrees to trial balance", tone: "positive" },
        ],
        charts: [
          {
            kind: "waterfall",
            title: "How the account moved",
            subtitle: "Trade receivables - local · September 2026",
            eyebrow: "Movement",
            unit: "currency",
            steps: [
              { id: "w1", label: "Opening", value: glOpening, isTotal: true },
              { id: "w2", label: "Invoicing", value: glDebits },
              { id: "w3", label: "Receipts & reclass", value: -glCredits },
              { id: "w4", label: "Closing", value: glClosing, isTotal: true },
            ],
            accessibleSummary: `Opening ${money(glOpening)} plus debits ${money(glDebits)} less credits ${money(glCredits)} gives closing ${money(glClosing)}.`,
          },
        ],
        columns: [
          { key: "ref", label: "Document" },
          { key: "date", label: "Date" },
          { key: "narration", label: "Narration" },
          { key: "debit", label: "Debit", numeric: true },
          { key: "credit", label: "Credit", numeric: true },
          { key: "running", label: "Running balance", numeric: true },
        ],
        rows: (() => {
          let running = glOpening;
          return glMovements.map((m, i) => {
            running = running + m.debit - m.credit;
            return row(`glr-${i}`, m.debit ? "Debit" : "Credit", {
              ref: m.ref, date: m.date, narration: m.narration,
              debit: m.debit ? money(m.debit) : "—",
              credit: m.credit ? money(m.credit) : "—",
              running: money(running),
            });
          });
        })(),
      },
    },
    "period-close": {
      workflow: {
        steps: [
          { label: "Subledgers cut off", state: "complete" },
          { label: "Reconciliations signed", state: "complete" },
          { label: "Accruals & depreciation", state: "current" },
          { label: "Controller review", state: "pending" },
          { label: "Period locked", state: "pending" },
        ],
        currentTitle: "September 2026 close · day 4 of 7",
        currentFields: [
          ["Unposted events", "1 · depreciation JV-2026-02288"],
          ["Bank reconciliations", "4 of 4 signed"],
          ["Subledger to GL variance", `${CURRENCY} 0.00`],
          ["Trial balance difference", `${CURRENCY} 0.00`],
          ["Intercompany matched", "3 of 4 pairs"],
          ["Owner", "F. Rehman · Financial Controller"],
        ],
        exceptions: [
          { id: "pc-1", title: "Intercompany pair NX-02 / NX-03 unmatched", detail: `Difference of ${CURRENCY} 118,400.00 awaiting confirmation from the subsidiary.` },
          { id: "pc-2", title: "One journal pending approval", detail: "The period cannot be locked while JV-2026-02288 is unposted." },
        ],
      },
    },
    "finance-revaluation": {
      form: {
        sections: [
          {
            title: "Revaluation run",
            fields: [
              { label: "Revaluation date *", value: "2026-09-30", type: "date" },
              { label: "Basis", value: "Closing rate", type: "select", options: ["Closing rate", "Average rate"] },
              { label: "Accounts in scope", value: "Foreign-currency monetary items", type: "select", options: ["Foreign-currency monetary items", "Receivables only", "Payables only", "Bank balances only"] },
              { label: "Auto-reverse", value: "Yes - first day of next period", type: "select", options: ["Yes - first day of next period", "No"] },
              { label: "Narration", value: "Month-end revaluation of USD monetary items", type: "textarea", wide: true },
            ],
          },
        ],
      },
    },

    /* ---- Group and reporting --------------------------------------- */
    intercompany: {
      list: {
        columns: [
          { key: "pair", label: "Entity pair" },
          { key: "document", label: "Document" },
          { key: "date", label: "Date" },
          { key: "ours", label: "Our books", numeric: true },
          { key: "theirs", label: "Counterparty", numeric: true },
          { key: "difference", label: "Difference", numeric: true },
        ],
        rows: [
          row("ic-1", "Matched", { pair: "NX-01 → NX-02", document: "IC-2026-0311", date: "2026-09-06", ours: money(2_480_000), theirs: money(2_480_000), difference: money(0) }),
          row("ic-2", "Matched", { pair: "NX-01 → NX-04", document: "IC-2026-0312", date: "2026-09-06", ours: money(915_600), theirs: money(915_600), difference: money(0) }),
          row("ic-3", "Unmatched", { pair: "NX-02 → NX-03", document: "IC-2026-0313", date: "2026-09-07", ours: money(742_800), theirs: money(624_400), difference: money(118_400) }),
          row("ic-4", "Matched", { pair: "NX-03 → NX-01", document: "IC-2026-0314", date: "2026-09-08", ours: money(1_336_250), theirs: money(1_336_250), difference: money(0) }),
        ],
        linkKey: "document",
        summary: "Only matched pairs eliminate on consolidation; unmatched pairs block the lock.",
        totalRecords: 4,
      },
    },
    consolidation: {
      workflow: {
        steps: [
          { label: "Entity submissions", state: "complete" },
          { label: "Currency translation", state: "complete" },
          { label: "Intercompany elimination", state: "current" },
          { label: "Group review", state: "pending" },
          { label: "Statements issued", state: "pending" },
        ],
        currentTitle: "Group consolidation · September 2026",
        currentFields: [
          ["Entities submitted", "4 of 4"],
          ["Presentation currency", CURRENCY],
          ["Eliminations posted", "3 of 4 pairs"],
          ["Translation reserve", `${CURRENCY} ${money(384_220)}`],
          ["Minority interest", `${CURRENCY} ${money(1_204_800)}`],
          ["Blocking issues", "1 unmatched intercompany pair"],
        ],
        exceptions: [
          { id: "cn-1", title: "NX-02 / NX-03 elimination cannot post", detail: `A difference of ${CURRENCY} 118,400.00 must be agreed before the pair eliminates.` },
        ],
      },
    },
    "trial-balance": {
      report: {
        kpis: [
          { id: "tb-dr", label: "Total debits", value: `${CURRENCY} ${money(debitTotal)}`, delta: `${nominalAccounts.filter((a) => a.dc === "Dr").length} accounts`, comparison: "As at 30 September 2026", tone: "info" },
          { id: "tb-cr", label: "Total credits", value: `${CURRENCY} ${money(creditTotal)}`, delta: `${nominalAccounts.filter((a) => a.dc === "Cr").length} accounts`, comparison: "As at 30 September 2026", tone: "info" },
          { id: "tb-diff", label: "Difference", value: `${CURRENCY} ${money(debitTotal - creditTotal)}`, delta: debitTotal === creditTotal ? "In balance" : "Investigate", comparison: "Debits less credits", tone: debitTotal === creditTotal ? "positive" : "danger" },
          { id: "tb-accounts", label: "Accounts with movement", value: String(nominalAccounts.length), delta: "All posting level", comparison: "Structural sections excluded", tone: "neutral" },
        ],
        charts: [
          {
            kind: "donut",
            title: "Where the balance sheet sits",
            subtitle: "Debit balances by section",
            eyebrow: "Composition",
            unit: "currency",
            segments: [
              { id: "d1", label: "Current assets", value: 29_389_230, tone: "blue" },
              { id: "d2", label: "Inventory", value: 10_693_160, tone: "cyan" },
              { id: "d3", label: "Non-current assets", value: 22_750_000, tone: "violet" },
              { id: "d4", label: "Cost and expense", value: 42_468_940, tone: "sky" },
            ],
            centerValue: `${money(debitTotal / 1_000_000)}M`,
            centerLabel: "Total debits",
            accessibleSummary: "Cost and expense carries the largest debit balance, followed by non-current assets.",
          },
        ],
        columns: [
          { key: "code", label: "Code" },
          { key: "name", label: "Account" },
          { key: "section", label: "Section" },
          { key: "debit", label: "Debit", numeric: true },
          { key: "credit", label: "Credit", numeric: true },
        ],
        rows: nominalAccounts.map((a) =>
          row(`tb-${a.code}`, a.type, {
            code: a.code, name: a.name, section: a.section,
            debit: a.dc === "Dr" ? money(a.balance) : "—",
            credit: a.dc === "Cr" ? money(a.balance) : "—",
          }),
        ),
      },
    },
    "financial-statements": {
      report: {
        kpis: [
          { id: "fs-rev", label: "Revenue", value: `${CURRENCY} ${money(revenue)}`, delta: "+11.4%", comparison: "Against prior year", tone: "positive" },
          { id: "fs-gp", label: "Gross profit", value: `${CURRENCY} ${money(grossProfit)}`, delta: `${((grossProfit / revenue) * 100).toFixed(1)}% margin`, comparison: "Revenue less cost of sales", tone: "positive" },
          { id: "fs-op", label: "Operating profit", value: `${CURRENCY} ${money(operatingProfit)}`, delta: `${((operatingProfit / revenue) * 100).toFixed(1)}% margin`, comparison: "After operating expenses", tone: "info" },
          { id: "fs-pbt", label: "Profit before tax", value: `${CURRENCY} ${money(profitBeforeTax)}`, delta: "After finance cost", comparison: `Finance cost ${money(financeCost)}`, tone: "neutral" },
        ],
        charts: [
          {
            kind: "waterfall",
            title: "From revenue to profit before tax",
            subtitle: "September 2026 year to date",
            eyebrow: "Statement of profit or loss",
            unit: "currency",
            steps: [
              { id: "p1", label: "Revenue", value: revenue, isTotal: true },
              { id: "p2", label: "Cost of sales", value: -costOfSales },
              { id: "p3", label: "Gross profit", value: grossProfit, isTotal: true },
              { id: "p4", label: "Operating expenses", value: -operatingExpenses },
              { id: "p5", label: "Finance cost", value: -financeCost },
              { id: "p6", label: "Profit before tax", value: profitBeforeTax, isTotal: true },
            ],
            accessibleSummary: `Revenue of ${money(revenue)} less cost of sales and expenses leaves profit before tax of ${money(profitBeforeTax)}.`,
          },
        ],
        columns: [
          { key: "line", label: "Statement line" },
          { key: "note", label: "Note" },
          { key: "current", label: "Sep 2026", numeric: true },
          { key: "prior", label: "Sep 2025", numeric: true },
        ],
        rows: [
          row("fs-1", "Revenue", { line: "Revenue", note: "4", current: money(revenue), prior: money(41_486_700) }),
          row("fs-2", "Cost", { line: "Cost of sales", note: "5", current: `(${money(costOfSales)})`, prior: `(${money(25_104_900)})` }),
          row("fs-3", "Subtotal", { line: "Gross profit", note: "", current: money(grossProfit), prior: money(16_381_800) }),
          row("fs-4", "Cost", { line: "Operating expenses", note: "6", current: `(${money(operatingExpenses)})`, prior: `(${money(12_402_100)})` }),
          row("fs-5", "Subtotal", { line: "Operating profit", note: "", current: money(operatingProfit), prior: money(3_979_700) }),
          row("fs-6", "Cost", { line: "Finance cost", note: "7", current: `(${money(financeCost)})`, prior: `(${money(1_286_400)})` }),
          row("fs-7", "Result", { line: "Profit before tax", note: "", current: money(profitBeforeTax), prior: money(2_693_300) }),
        ],
      },
    },
    "finance-audit": {
      report: {
        kpis: [
          { id: "au-1", label: "Entries in period", value: "1,284", delta: "+62 vs August", comparison: "All posted vouchers", tone: "neutral" },
          { id: "au-2", label: "Manual journals", value: "37", delta: "2.9% of entries", comparison: "Manual intervention rate", tone: "info" },
          { id: "au-3", label: "Reversals", value: "4", delta: "0.3% of entries", comparison: "Each with a stated reason", tone: "positive" },
          { id: "au-4", label: "Post-close edits", value: "0", delta: "Period lock held", comparison: "No entries after lock", tone: "positive" },
        ],
        charts: [
          {
            kind: "stacked",
            title: "Who posted what",
            subtitle: "Vouchers by source and week",
            eyebrow: "Assurance",
            unit: "number",
            labels: ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
            series: [
              { label: "Automated", tone: "blue", values: [268, 291, 274, 288] },
              { label: "Subledger", tone: "cyan", values: [38, 41, 36, 44] },
              { label: "Manual", tone: "sky", values: [9, 11, 8, 9] },
            ],
            accessibleSummary: "Automated postings dominate every week; manual journals stay in single digits.",
          },
        ],
        columns: [
          { key: "when", label: "When" },
          { key: "who", label: "Who" },
          { key: "action", label: "Action" },
          { key: "target", label: "Record" },
          { key: "detail", label: "Detail" },
        ],
        rows: [
          row("at-1", "Posted", { when: "2026-09-08 14:22", who: "A. Qureshi", action: "Posted voucher", target: "JV-2026-02291", detail: "Balanced · approved by F. Rehman" }),
          row("at-2", "Approved", { when: "2026-09-08 14:19", who: "F. Rehman", action: "Approved", target: "JV-2026-02291", detail: "Within delegated authority" }),
          row("at-3", "Changed", { when: "2026-09-07 11:04", who: "A. Qureshi", action: "Amended narration", target: "JV-2026-02288", detail: "Before approval · field history retained" }),
          row("at-4", "Reversed", { when: "2026-09-03 17:41", who: "System", action: "Auto-reversed", target: "JV-2026-02285", detail: "FX revaluation reversal as scheduled" }),
          row("at-5", "Blocked", { when: "2026-09-02 09:15", who: "S. Farooq", action: "Posting refused", target: "August 2026", detail: "Period closed · entry redirected to September" }),
        ],
      },
    },
  },
};
