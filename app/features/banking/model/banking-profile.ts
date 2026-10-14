/**
 * Banking & Treasury module fixtures for the isolated Nexora UI/UX prototype.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import type { ModuleProfile, ModuleRow } from "@prototype/shared/types/module-profile-types";

const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"] as const;

function rows(entries: readonly (readonly [string, Record<string, string>, string])[]): ModuleRow[] {
  return entries.map(([id, cells, status]) => ({ id, cells, status }));
}

export const bankingProfile: ModuleProfile = {
  moduleId: "banking",
  pages: {
    /* ---------------------------------------------------------------- */
    "overview": {
      dashboard: {
        kpis: [
          { id: "bk-cash", label: "Cash & equivalents", value: "$1.46M", delta: "-$384K", comparison: "vs opening balance", tone: "warning", trend: [1840, 1792, 1710, 1655, 1523, 1456] },
          { id: "bk-available", label: "Available liquidity", value: "$2.21M", delta: "+$140K", comparison: "incl. undrawn facility", tone: "positive", trend: [2010, 2065, 2098, 2120, 2185, 2210] },
          { id: "bk-inflow", label: "Collections this month", value: "$2.96M", delta: "+8.4%", comparison: "vs prior month", tone: "positive", trend: [2410, 2530, 2620, 2705, 2730, 2960] },
          { id: "bk-unrecon", label: "Unreconciled items", value: "34", delta: "+9", comparison: "vs last close", tone: "danger", trend: [18, 21, 19, 25, 25, 34] },
          { id: "bk-fx", label: "FX exposure", value: "$318K", delta: "-2.1%", comparison: "unhedged position", tone: "neutral", trend: [352, 344, 338, 330, 325, 318] },
          { id: "bk-buffer", label: "Days cash on hand", value: "42 days", delta: "-6 days", comparison: "policy min. 45", tone: "warning", trend: [56, 54, 51, 48, 45, 42] },
        ],
        charts: [
          {
            kind: "combo",
            eyebrow: "Liquidity",
            title: "Cash in and out",
            subtitle: "Collections against outgoing payments for the last six periods.",
            unit: "currency",
            labels: [...months],
            barLabel: "Payments out",
            barValues: [2180000, 2340000, 2260000, 2410000, 2520000, 3344000],
            lineLabel: "Collections in",
            lineValues: [2410000, 2530000, 2620000, 2705000, 2730000, 2960000],
            accessibleSummary:
              "Collections rise steadily from $2.41M in March to $2.96M in August, but outgoing payments overtake them in August at $3.34M, producing the month's net cash outflow.",
            note: "August is the first period where payments exceed collections; the gap is $384K.",
          },
          {
            kind: "waterfall",
            eyebrow: "Movement",
            title: "Cash movement bridge",
            subtitle: "Opening to closing cash for the current period.",
            unit: "currency",
            steps: [
              { id: "bk-wf-open", label: "Opening cash", value: 1840000 },
              { id: "bk-wf-collect", label: "Collections", value: 2960000 },
              { id: "bk-wf-supplier", label: "Supplier payments", value: -2180000 },
              { id: "bk-wf-payroll", label: "Payroll", value: -890000 },
              { id: "bk-wf-tax", label: "Tax & duty", value: -274000 },
              { id: "bk-wf-close", label: "Closing cash", value: 1456000, isTotal: true },
            ],
            accessibleSummary:
              "Opening cash of $1.84M receives $2.96M of collections then reduces through supplier payments, payroll and tax to a closing balance of $1.46M.",
            note: "Closing cash sits $34K below the policy buffer; collection timing is the fastest available lever.",
          },
          {
            kind: "gauges",
            eyebrow: "Policy",
            title: "Treasury policy compliance",
            subtitle: "Each treasury control expressed as attainment against its policy threshold.",
            gauges: [
              { id: "bk-g-buffer", label: "Cash buffer", valueLabel: "42 days", percent: 93, hint: "93% of 45-day policy", tone: "sky" },
              { id: "bk-g-recon", label: "Reconciled", valueLabel: "88.4%", percent: 93, hint: "93% of 95% target", tone: "sky" },
              { id: "bk-g-idle", label: "Idle cash placed", valueLabel: "76.2%", percent: 95, hint: "95% of 80% target", tone: "teal" },
              { id: "bk-g-hedge", label: "FX hedged", valueLabel: "61.0%", percent: 81, hint: "81% of 75% target", tone: "teal" },
            ],
          },
          {
            kind: "heatmap",
            eyebrow: "Density",
            title: "Account balance density",
            subtitle: "Closing balance in thousands by bank account and week.",
            unit: "number",
            tone: "blue",
            rows: ["Operating USD", "Payroll USD", "Collections EUR", "Reserve USD"],
            columns: ["W1", "W2", "W3", "W4"],
            cells: [
              { row: "Operating USD", column: "W1", value: 820 }, { row: "Operating USD", column: "W2", value: 764 }, { row: "Operating USD", column: "W3", value: 690 }, { row: "Operating USD", column: "W4", value: 612 },
              { row: "Payroll USD", column: "W1", value: 240 }, { row: "Payroll USD", column: "W2", value: 218 }, { row: "Payroll USD", column: "W3", value: 196 }, { row: "Payroll USD", column: "W4", value: 92 },
              { row: "Collections EUR", column: "W1", value: 412 }, { row: "Collections EUR", column: "W2", value: 448 }, { row: "Collections EUR", column: "W3", value: 476 }, { row: "Collections EUR", column: "W4", value: 508 },
              { row: "Reserve USD", column: "W1", value: 248 }, { row: "Reserve USD", column: "W2", value: 248 }, { row: "Reserve USD", column: "W3", value: 244 }, { row: "Reserve USD", column: "W4", value: 244 },
            ],
            accessibleSummary:
              "The operating account draws down steadily from $820K to $612K across the month while collections in euro build from $412K to $508K; the reserve account stays flat.",
          },
          {
            kind: "donut",
            eyebrow: "Composition",
            title: "Cash by currency",
            subtitle: "Share of total cash held in each settlement currency.",
            unit: "percent",
            segments: [
              { id: "bk-cur-usd", label: "USD", value: 58, tone: "blue" },
              { id: "bk-cur-eur", label: "EUR", value: 24, tone: "cyan" },
              { id: "bk-cur-gbp", label: "GBP", value: 12, tone: "teal" },
              { id: "bk-cur-pkr", label: "PKR", value: 6, tone: "violet" },
            ],
            centerValue: "$1.46M",
            centerLabel: "Total cash",
            accessibleSummary:
              "USD holds 58 percent of total cash, euro 24 percent, sterling 12 percent and rupee 6 percent.",
          },
        ],
        attentionTitle: "Treasury exceptions",
        attention: [
          { id: "bk-att-buffer", title: "Week-six liquidity below policy buffer", detail: "The 13-week forecast dips $34K under the minimum cash policy.", status: "Urgent", tone: "danger" },
          { id: "bk-att-recon", title: "34 unreconciled statement lines", detail: "Operating USD account has 21 items older than five days.", status: "Review", tone: "warning" },
          { id: "bk-att-cheque", title: "6 post-dated cheques mature this week", detail: "Total value $184K presenting between 04 and 08 Sep.", status: "Scheduled", tone: "info" },
          { id: "bk-att-guarantee", title: "Bank guarantee expiring", detail: "BG-2026-0042 for Atlas Metals expires in 14 days.", status: "Action", tone: "warning" },
        ],
      },
    },

    /* ---------------------------------------------------------------- */
    "bank-accounts": {
      list: {
        columns: [
          { key: "account", label: "Account name" },
          { key: "number", label: "Account number" },
          { key: "bank", label: "Bank / branch" },
          { key: "type", label: "Type" },
          { key: "currency", label: "Currency" },
          { key: "gl", label: "GL account" },
          { key: "signatories", label: "Signatories", numeric: true },
        ],
        openPageId: "bank-account-detail",
        linkKey: "account",
        createPageId: "add-bank-account",
        createLabel: "Add bank account",
        filters: ["Type: All", "Currency: All", "Active only"],
        totalRecords: 9,
        rows: rows([
          ["bk-ba-1", { account: "Operating USD", number: "•••• 4471", bank: "First Meridian — Downtown", type: "Current", currency: "USD", gl: "10-01-00200", signatories: "3" }, "Active"],
          ["bk-ba-2", { account: "Payroll USD", number: "•••• 4472", bank: "First Meridian — Downtown", type: "Current", currency: "USD", gl: "10-01-00210", signatories: "2" }, "Active"],
          ["bk-ba-3", { account: "Collections EUR", number: "•••• 8814", bank: "Continental Trust — Frankfurt", type: "Current", currency: "EUR", gl: "10-01-00220", signatories: "3" }, "Active"],
          ["bk-ba-4", { account: "Reserve USD", number: "•••• 4480", bank: "First Meridian — Downtown", type: "Deposit", currency: "USD", gl: "10-01-00230", signatories: "4" }, "Restricted"],
          ["bk-ba-5", { account: "Sterling Trade", number: "•••• 2260", bank: "Northgate — London", type: "Current", currency: "GBP", gl: "10-01-00240", signatories: "2" }, "Active"],
          ["bk-ba-6", { account: "Local Ops PKR", number: "•••• 9902", bank: "Indus Commercial — Karachi", type: "Current", currency: "PKR", gl: "10-01-00250", signatories: "2" }, "Active"],
          ["bk-ba-7", { account: "Escrow — Atlas Project", number: "•••• 7731", bank: "Continental Trust — Frankfurt", type: "Escrow", currency: "USD", gl: "10-01-00260", signatories: "4" }, "Restricted"],
          ["bk-ba-8", { account: "Petty Cash — Head Office", number: "n/a", bank: "Cash on hand", type: "Cash", currency: "USD", gl: "10-01-00100", signatories: "1" }, "Active"],
          ["bk-ba-9", { account: "Legacy USD", number: "•••• 4410", bank: "First Meridian — Downtown", type: "Current", currency: "USD", gl: "10-01-00190", signatories: "0" }, "Closed"],
        ]),
      },
    },

    "bank-payments": {
      list: {
        columns: [
          { key: "voucher", label: "V. No." },
          { key: "date", label: "Date" },
          { key: "bank", label: "Bank" },
          { key: "nominal", label: "Nominal Account" },
          { key: "ref", label: "Ref. No." },
          { key: "details", label: "Details" },
          { key: "cur", label: "Cur." },
          { key: "amount", label: "Amount", numeric: true },
        ],
        openPageId: "transaction-detail",
        linkKey: "voucher",
        openOnlyFromLink: true,
        createPageId: "add-bank-payment",
        createLabel: "Add payment",
        filters: ["Bank: All", "Nominals: All", "All Dates", "Clear"],
        summary: "Showing 1-10 of 248 payment lines",
        totalRecords: 248,
        rows: rows([
          ["bk-pay-1", { voucher: "32", date: "10/08/2026", bank: "Cash on hand", nominal: "Travel Expenses", ref: "133", details: "Cash paid to Omar Manzoor for regular use", cur: "PKR", amount: "10,000.00" }, "Approved"],
          ["bk-pay-2", { voucher: "32", date: "10/08/2026", bank: "Cash on hand", nominal: "Internet charges", ref: "134", details: "Internet reimbursement - Salman Sadiq", cur: "PKR", amount: "1,000.00" }, "Approved"],
          ["bk-pay-3", { voucher: "32", date: "10/08/2026", bank: "Cash on hand", nominal: "Payroll payable", ref: "130", details: "Abdullah Awaisi - July 26", cur: "PKR", amount: "99,745.00" }, "Approved"],
          ["bk-pay-4", { voucher: "31", date: "03/08/2026", bank: "Meezan Bank", nominal: "Payroll payable", ref: "MBL 03", details: "Salary July 26", cur: "PKR", amount: "1,397,261.00" }, "Posted"],
          ["bk-pay-5", { voucher: "31", date: "29/07/2026", bank: "Meezan Bank", nominal: "Bank Charges", ref: "MBL 01", details: "Transfer*FED ON PMT CHGS*FED on PCM CHGS", cur: "PKR", amount: "300.00" }, "Posted"],
          ["bk-pay-6", { voucher: "31", date: "29/07/2026", bank: "Meezan Bank", nominal: "Bank Charges", ref: "MBL 02", details: "Transfer*SOFT TOKN CHGS*PCM PMT CHGS", cur: "PKR", amount: "2,000.00" }, "Posted"],
          ["bk-pay-7", { voucher: "30", date: "23/07/2026", bank: "Cash on hand", nominal: "Other Creditors", ref: "-", details: "Paid to AWF, Furqan bhai, for regular use", cur: "PKR", amount: "240,000.00" }, "Posted"],
          ["bk-pay-8", { voucher: "29", date: "16/07/2026", bank: "Meezan Bank", nominal: "Bank Charges", ref: "0.25 % 01 % Deduct against Remitance", details: "Internal Transfer*2156090194JS", cur: "PKR", amount: "8,317.64" }, "Posted"],
          ["bk-pay-9", { voucher: "29", date: "14/07/2026", bank: "Meezan Bank", nominal: "Bank Charges", ref: "01 % Deduct against Remitance", details: "Inward Telex Payment*2156090194JS*0005*GLOBAL TRANS BANKING", cur: "PKR", amount: "33,270.62" }, "Posted"],
          ["bk-pay-10", { voucher: "19", date: "04/07/2026", bank: "Cash on hand", nominal: "Vehicle Fuel", ref: "119", details: "42.85 Ltr @ 350 in 6296 Vehicle", cur: "PKR", amount: "15,000.00" }, "Posted"],
        ]),
      },
    },
    "bank-receipts": {
      list: {
        columns: [
          { key: "voucher", label: "V. No." },
          { key: "date", label: "Date" },
          { key: "bank", label: "Bank" },
          { key: "nominal", label: "Nominal Account" },
          { key: "ref", label: "Ref. No." },
          { key: "details", label: "Details" },
          { key: "cur", label: "Cur." },
          { key: "amount", label: "Amount", numeric: true },
        ],
        openPageId: "transaction-detail",
        linkKey: "voucher",
        createPageId: "add-bank-receipt",
        createLabel: "Add receipt",
        filters: ["Bank: All", "Nominals: All", "All Dates", "Clear"],
        summary: "Showing 1-9 of 156 receipt lines",
        totalRecords: 156,
        rows: rows([
          ["bk-rec-1", { voucher: "48", date: "31/08/2026", bank: "Meezan Bank", nominal: "Trade Debtors", ref: "INV-2214", details: "Meridian Health Group - full settlement", cur: "PKR", amount: "6,948,400.00" }, "Posted"],
          ["bk-rec-2", { voucher: "48", date: "31/08/2026", bank: "Meezan Bank", nominal: "Trade Debtors", ref: "INV-2209", details: "Crescent Retail - part settlement", cur: "PKR", amount: "3,354,000.00" }, "Part allocated"],
          ["bk-rec-3", { voucher: "47", date: "30/08/2026", bank: "Cash on hand", nominal: "Trade Debtors", ref: "CHQ-8841", details: "Atlas Industrial - cheque received", cur: "PKR", amount: "2,411,200.00" }, "Unallocated"],
          ["bk-rec-4", { voucher: "47", date: "29/08/2026", bank: "Meezan Bank", nominal: "Trade Debtors", ref: "INV-2198", details: "Northwind Logistics - invoice settlement", cur: "PKR", amount: "1,513,400.00" }, "Posted"],
          ["bk-rec-5", { voucher: "46", date: "28/08/2026", bank: "Meezan Bank", nominal: "Consultancy Income", ref: "INV-2191", details: "Pioneer Systems - advisory retainer", cur: "PKR", amount: "1,086,600.00" }, "Posted"],
          ["bk-rec-6", { voucher: "46", date: "27/08/2026", bank: "Meezan Bank", nominal: "Trade Debtors", ref: "INV-2186", details: "Delta Manufacturing - milestone 2", cur: "PKR", amount: "3,974,900.00" }, "Posted"],
          ["bk-rec-7", { voucher: "45", date: "26/08/2026", bank: "Cash on hand", nominal: "Suspense Account", ref: "-", details: "Unidentified deposit - pending allocation", cur: "PKR", amount: "348,600.00" }, "Unallocated"],
          ["bk-rec-8", { voucher: "45", date: "25/08/2026", bank: "Meezan Bank", nominal: "Other Income", ref: "MBL-INT", details: "Profit on deposit account - August", cur: "PKR", amount: "142,800.00" }, "Posted"],
          ["bk-rec-9", { voucher: "44", date: "20/08/2026", bank: "Meezan Bank", nominal: "Trade Debtors", ref: "INV-2178", details: "Summit Partners - retainer renewal", cur: "PKR", amount: "2,702,150.00" }, "Posted"],
        ]),
      },
    },
    "transfers": {
      list: {
        columns: [
          { key: "reference", label: "Transfer ref." },
          { key: "date", label: "Date" },
          { key: "from", label: "From account" },
          { key: "to", label: "To account" },
          { key: "rate", label: "FX rate", numeric: true },
          { key: "amount", label: "Amount", numeric: true },
          { key: "requested", label: "Requested by" },
        ],
        openPageId: "transaction-detail",
        linkKey: "reference",
        createPageId: "add-transfer",
        createLabel: "Add transfer",
        filters: ["Status: All", "Internal only", "This quarter"],
        totalRecords: 18,
        rows: rows([
          ["bk-trf-1", { reference: "TRF-2026-0088", date: "31 Aug 2026", from: "Collections EUR", to: "Operating USD", rate: "1.0840", amount: "€180,000", requested: "Mariam Ali" }, "Posted"],
          ["bk-trf-2", { reference: "TRF-2026-0087", date: "30 Aug 2026", from: "Operating USD", to: "Payroll USD", rate: "—", amount: "$500,000", requested: "Omar Siddiqui" }, "Posted"],
          ["bk-trf-3", { reference: "TRF-2026-0086", date: "28 Aug 2026", from: "Reserve USD", to: "Operating USD", rate: "—", amount: "$150,000", requested: "Omar Siddiqui" }, "Pending approval"],
          ["bk-trf-4", { reference: "TRF-2026-0085", date: "24 Aug 2026", from: "Sterling Trade", to: "Operating USD", rate: "1.2710", amount: "£60,000", requested: "Bilal Khan" }, "Posted"],
          ["bk-trf-5", { reference: "TRF-2026-0084", date: "20 Aug 2026", from: "Operating USD", to: "Local Ops PKR", rate: "278.40", amount: "$40,000", requested: "Bilal Khan" }, "Posted"],
          ["bk-trf-6", { reference: "TRF-2026-0083", date: "14 Aug 2026", from: "Operating USD", to: "Escrow — Atlas", rate: "—", amount: "$186,000", requested: "Mariam Ali" }, "Posted"],
        ]),
      },
    },

    "cheques": {
      list: {
        columns: [
          { key: "number", label: "Cheque no." },
          { key: "issued", label: "Issue date" },
          { key: "payee", label: "Payee" },
          { key: "account", label: "Drawn on" },
          { key: "amount", label: "Amount", numeric: true },
          { key: "presented", label: "Presented" },
        ],
        openPageId: "transaction-detail",
        linkKey: "number",
        createPageId: "issue-cheque",
        createLabel: "Issue cheque",
        filters: ["Status: All", "Outstanding only", "This quarter"],
        totalRecords: 26,
        rows: rows([
          ["bk-chq-1", { number: "CHQ-104882", issued: "28 Aug 2026", payee: "Northgate Facilities", account: "Operating USD", amount: "$24,600", presented: "—" }, "Outstanding"],
          ["bk-chq-2", { number: "CHQ-104881", issued: "26 Aug 2026", payee: "Orbit Services", account: "Operating USD", amount: "$18,240", presented: "29 Aug 2026" }, "Cleared"],
          ["bk-chq-3", { number: "CHQ-104880", issued: "22 Aug 2026", payee: "Civic Utilities", account: "Operating USD", amount: "$6,480", presented: "25 Aug 2026" }, "Cleared"],
          ["bk-chq-4", { number: "CHQ-104879", issued: "18 Aug 2026", payee: "Atlas Metals Ltd.", account: "Operating USD", amount: "$92,000", presented: "—" }, "Stale"],
          ["bk-chq-5", { number: "CHQ-104878", issued: "12 Aug 2026", payee: "Voided — printer error", account: "Operating USD", amount: "$0", presented: "—" }, "Void"],
          ["bk-chq-6", { number: "CHQ-104877", issued: "08 Aug 2026", payee: "Summit Legal", account: "Operating USD", amount: "$14,750", presented: "13 Aug 2026" }, "Cleared"],
        ]),
      },
    },

    /* ---------------------------------------------------------------- */
    "cash-forecast": {
      report: {
        kpis: [
          { id: "bk-fc-open", label: "Opening position", value: "$1.46M", delta: "31 Aug 2026", comparison: "actual", tone: "neutral" },
          { id: "bk-fc-low", label: "Lowest projected week", value: "$966K", delta: "Week 6", comparison: "$34K under buffer", tone: "danger" },
          { id: "bk-fc-close", label: "13-week closing", value: "$1.88M", delta: "+$420K", comparison: "vs opening", tone: "positive" },
          { id: "bk-fc-confidence", label: "Forecast confidence", value: "82%", delta: "+4 pts", comparison: "vs last run", tone: "positive" },
        ],
        charts: [
          {
            kind: "combo",
            eyebrow: "Forecast",
            title: "13-week cash forecast",
            subtitle: "Projected closing balance against the minimum cash policy buffer.",
            unit: "currency",
            labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12", "W13"],
            barLabel: "Policy buffer",
            barValues: [1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000],
            lineLabel: "Projected closing balance",
            lineValues: [1456000, 1382000, 1298000, 1174000, 1052000, 966000, 1088000, 1216000, 1342000, 1468000, 1604000, 1742000, 1880000],
            accessibleSummary:
              "The projected closing balance falls for six consecutive weeks to a low of $966K in week six, dipping below the $1.0M policy buffer, then recovers to $1.88M by week thirteen.",
            note: "Only week six breaches the buffer, and by $34K; pulling two receipts forward closes the gap.",
          },
          {
            kind: "stacked",
            eyebrow: "Drivers",
            title: "Forecast inflow composition",
            subtitle: "Expected inflow by source across the first six forecast weeks.",
            unit: "currency",
            labels: ["W1", "W2", "W3", "W4", "W5", "W6"],
            series: [
              { label: "Customer collections", tone: "blue", values: [412000, 386000, 448000, 402000, 468000, 512000] },
              { label: "Project milestones", tone: "cyan", values: [180000, 96000, 210000, 142000, 168000, 224000] },
              { label: "Other income", tone: "teal", values: [42000, 38000, 46000, 40000, 44000, 48000] },
            ],
            accessibleSummary:
              "Customer collections supply the majority of weekly inflow, ranging from $386K to $512K, with project milestones adding a further $96K to $224K.",
          },
        ],
        columns: [
          { key: "week", label: "Week" },
          { key: "opening", label: "Opening", numeric: true },
          { key: "inflow", label: "Inflow", numeric: true },
          { key: "outflow", label: "Outflow", numeric: true },
          { key: "closing", label: "Closing", numeric: true },
          { key: "buffer", label: "vs buffer", numeric: true },
        ],
        rows: rows([
          ["bk-fcw-1", { week: "W1 · 01 Sep", opening: "$1,456,000", inflow: "$634,000", outflow: "$708,000", closing: "$1,382,000", buffer: "+$382,000" }, "On track"],
          ["bk-fcw-2", { week: "W2 · 08 Sep", opening: "$1,382,000", inflow: "$520,000", outflow: "$604,000", closing: "$1,298,000", buffer: "+$298,000" }, "On track"],
          ["bk-fcw-3", { week: "W3 · 15 Sep", opening: "$1,298,000", inflow: "$704,000", outflow: "$828,000", closing: "$1,174,000", buffer: "+$174,000" }, "On track"],
          ["bk-fcw-4", { week: "W4 · 22 Sep", opening: "$1,174,000", inflow: "$584,000", outflow: "$706,000", closing: "$1,052,000", buffer: "+$52,000" }, "Watch"],
          ["bk-fcw-5", { week: "W5 · 29 Sep", opening: "$1,052,000", inflow: "$680,000", outflow: "$766,000", closing: "$966,000", buffer: "-$34,000" }, "Breach"],
          ["bk-fcw-6", { week: "W6 · 06 Oct", opening: "$966,000", inflow: "$784,000", outflow: "$662,000", closing: "$1,088,000", buffer: "+$88,000" }, "Recovering"],
        ]),
      },
    },

    "treasury-reports": {
      report: {
        kpis: [
          { id: "bk-tr-vol", label: "Payment volume", value: "$3.34M", delta: "+12.6%", comparison: "vs prior month", tone: "neutral" },
          { id: "bk-tr-cost", label: "Bank charges", value: "$8,420", delta: "+$640", comparison: "vs prior month", tone: "warning" },
          { id: "bk-tr-interest", label: "Interest earned", value: "$14,280", delta: "+$2,140", comparison: "vs prior month", tone: "positive" },
          { id: "bk-tr-fx", label: "FX gain / loss", value: "-$6,180", delta: "unrealised", comparison: "revaluation impact", tone: "danger" },
        ],
        charts: [
          {
            kind: "stacked",
            eyebrow: "Treasury cost",
            title: "Bank charges by category",
            subtitle: "Charges applied across accounts for the last six periods.",
            unit: "currency",
            labels: [...months],
            series: [
              { label: "Transaction fees", tone: "blue", values: [3200, 3480, 3320, 3610, 3840, 4120] },
              { label: "FX margin", tone: "sky", values: [1840, 1920, 2010, 2180, 2260, 2480] },
              { label: "Facility fees", tone: "cyan", values: [1600, 1600, 1600, 1600, 1800, 1820] },
            ],
            accessibleSummary:
              "Total bank charges rise from $6.64K in March to $8.42K in August, with transaction fees and FX margin driving most of the increase.",
            note: "FX margin has grown 35% over six months and is the fastest-rising charge category.",
          },
          {
            kind: "scatter",
            eyebrow: "Efficiency",
            title: "Payment cost against volume",
            subtitle: "Cost per payment method; bubble size shows transaction count.",
            xLabel: "Value processed",
            yLabel: "Cost per item",
            xUnit: "currency",
            yUnit: "number",
            points: [
              { id: "bk-sc-wire", label: "Wire", x: 1620000, y: 28, size: 84, tone: "plum" },
              { id: "bk-sc-ach", label: "ACH", x: 742000, y: 3, size: 210, tone: "teal" },
              { id: "bk-sc-sepa", label: "SEPA", x: 486000, y: 5, size: 128, tone: "cyan" },
              { id: "bk-sc-batch", label: "Payroll batch", x: 486000, y: 2, size: 62, tone: "blue" },
              { id: "bk-sc-cheque", label: "Cheque", x: 96000, y: 12, size: 26, tone: "sky" },
            ],
            accessibleSummary:
              "Wires carry the highest cost per item at $28 while processing the largest value, whereas ACH moves $742K at only $3 per item.",
          },
        ],
        columns: [
          { key: "account", label: "Account" },
          { key: "opening", label: "Opening", numeric: true },
          { key: "in", label: "Receipts", numeric: true },
          { key: "out", label: "Payments", numeric: true },
          { key: "charges", label: "Charges", numeric: true },
          { key: "closing", label: "Closing", numeric: true },
        ],
        rows: rows([
          ["bk-trr-1", { account: "Operating USD — 4471", opening: "$820,400", in: "$1,864,200", out: "$2,072,120", charges: "$4,820", closing: "$612,480" }, "Reconciled"],
          ["bk-trr-2", { account: "Payroll USD — 4472", opening: "$240,000", in: "$500,000", out: "$647,640", charges: "$0", closing: "$92,360" }, "Reconciled"],
          ["bk-trr-3", { account: "Collections EUR — 8814", opening: "€412,000", in: "€596,400", out: "€538,000", charges: "€2,180", closing: "€468,220" }, "In progress"],
          ["bk-trr-4", { account: "Reserve USD — 4480", opening: "$248,000", in: "$0", out: "$4,000", charges: "$0", closing: "$244,000" }, "Reconciled"],
          ["bk-trr-5", { account: "Sterling Trade — 2260", opening: "£112,400", in: "£98,900", out: "£81,240", charges: "£1,420", closing: "£128,640" }, "In progress"],
        ]),
      },
    },

    /* ---------------------------------------------------------------- */
    "bank-reconciliation": {
      workflow: {
        steps: [
          { label: "Import statement", state: "complete" },
          { label: "Auto-match", state: "complete" },
          { label: "Review exceptions", state: "current" },
          { label: "Post adjustments", state: "pending" },
          { label: "Approve", state: "pending" },
          { label: "Close period", state: "pending" },
        ],
        currentTitle: "Review unmatched statement lines",
        currentFields: [
          ["Account", "Operating USD — 4471"],
          ["Statement", "STMT-2026-08-4471"],
          ["Statement balance", "$598,140"],
          ["Ledger balance", "$612,480"],
          ["Difference", "$14,340"],
          ["Unmatched items", "34"],
        ],
        exceptions: [
          { id: "bk-rex-1", title: "Unidentified deposit $12,480", detail: "Cash deposit on 26 Aug has no matching receipt record." },
          { id: "bk-rex-2", title: "Stale cheque CHQ-104879", detail: "$92,000 issued 18 Aug is still unpresented after 14 days." },
          { id: "bk-rex-3", title: "Bank charge not in ledger", detail: "$1,860 facility fee posted by the bank on 30 Aug." },
        ],
      },
    },

    "statement-matching": {
      workflow: {
        steps: [
          { label: "Load statement", state: "complete" },
          { label: "Rule matching", state: "complete" },
          { label: "Fuzzy matching", state: "current" },
          { label: "Manual match", state: "pending" },
          { label: "Confirm", state: "pending" },
        ],
        currentTitle: "Confirm suggested matches",
        currentFields: [
          ["Statement lines", "212"],
          ["Auto-matched", "178 (84%)"],
          ["Suggested", "22"],
          ["Unmatched", "12"],
          ["Confidence threshold", "85%"],
          ["Reviewer", "Mariam Ali"],
        ],
        exceptions: [
          { id: "bk-smx-1", title: "22 suggestions await confirmation", detail: "Matched on amount and near-date but reference differs." },
          { id: "bk-smx-2", title: "12 lines cannot be matched", detail: "No candidate ledger entry within tolerance." },
        ],
      },
    },

    /* ---------------------------------------------------------------- */
    "add-bank-payment": {
      form: {
        sections: [
          {
            title: "Payment details",
            fields: [
              { label: "Payment reference", value: "PAY-2026-0419" },
              { label: "Value date", value: "2026-09-03", type: "date" },
              { label: "From account", value: "Operating USD — 4471", type: "select", options: ["Operating USD — 4471", "Payroll USD — 4472", "Collections EUR — 8814", "Sterling Trade — 2260"] },
              { label: "Payment method", value: "Wire", type: "select", options: ["Wire", "ACH", "SEPA", "Faster Payment", "Cheque"] },
            ],
          },
          {
            title: "Beneficiary",
            fields: [
              { label: "Beneficiary", value: "Atlas Metals Ltd.", type: "select", options: ["Atlas Metals Ltd.", "Vertex Components", "Lumen Packaging", "Orbit Services", "Nova Chemicals"] },
              { label: "Bank account", value: "•••• 8842 — Continental Trust" },
              { label: "Currency", value: "USD", type: "select", options: ["USD", "EUR", "GBP", "PKR"] },
              { label: "Amount", value: "184,260.00" },
            ],
          },
          {
            title: "Allocation and controls",
            fields: [
              { label: "Against document", value: "BILL-2026-0899" },
              { label: "Cost centre", value: "Operations", type: "select", options: ["Operations", "Technology", "Corporate", "Facilities"] },
              { label: "Approval route", value: "Finance review → Final approval", type: "select", options: ["Finance review → Final approval", "Single approver", "Dual signature"] },
              { label: "Payment note", value: "Settlement of August enclosure supply against agreed terms.", type: "textarea", wide: true },
            ],
          },
        ],
      },
    },

    "add-bank-receipt": {
      form: {
        sections: [
          {
            title: "Receipt details",
            fields: [
              { label: "Receipt reference", value: "RCP-2026-0913" },
              { label: "Value date", value: "2026-09-01", type: "date" },
              { label: "Into account", value: "Operating USD — 4471", type: "select", options: ["Operating USD — 4471", "Collections EUR — 8814", "Sterling Trade — 2260"] },
              { label: "Method", value: "Wire", type: "select", options: ["Wire", "ACH", "SEPA", "Cheque", "Cash"] },
            ],
          },
          {
            title: "Payer",
            fields: [
              { label: "Received from", value: "Meridian Health Group", type: "select", options: ["Meridian Health Group", "Crescent Retail", "Atlas Industrial", "Northwind Logistics"] },
              { label: "Currency", value: "USD", type: "select", options: ["USD", "EUR", "GBP", "PKR"] },
              { label: "Amount", value: "248,600.00" },
              { label: "Bank reference", value: "FT26244009812" },
            ],
          },
          {
            title: "Allocation",
            fields: [
              { label: "Allocate to", value: "INV-2026-2214", type: "select", options: ["INV-2026-2214", "INV-2026-2208", "Leave unallocated"] },
              { label: "Allocated amount", value: "248,600.00" },
              { label: "Write-off tolerance", value: "0.00" },
              { label: "Remittance note", value: "Full settlement of August invoice; remittance advice attached.", type: "textarea", wide: true },
            ],
          },
        ],
      },
    },

    "import-statement": {
      form: {
        sections: [
          {
            title: "Statement source",
            fields: [
              { label: "Bank account", value: "Operating USD — 4471", type: "select", options: ["Operating USD — 4471", "Payroll USD — 4472", "Collections EUR — 8814"] },
              { label: "File format", value: "MT940", type: "select", options: ["MT940", "CAMT.053", "CSV", "OFX"] },
              { label: "Statement date", value: "2026-08-31", type: "date" },
              { label: "Statement number", value: "STMT-2026-08-4471" },
            ],
          },
          {
            title: "Import controls",
            fields: [
              { label: "Duplicate check", value: "Reference and amount", type: "select", options: ["Reference and amount", "Reference only", "Disabled"] },
              { label: "Auto-match rules", value: "Apply standard rule set", type: "select", options: ["Apply standard rule set", "Apply strict rule set", "Do not auto-match"] },
              { label: "Opening balance", value: "820,400.00" },
              { label: "Closing balance", value: "598,140.00" },
            ],
          },
        ],
      },
    },
  },
};
