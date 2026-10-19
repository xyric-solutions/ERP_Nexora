# Nexora - Finance Core Posting Design (S2.2)

- Status: `active` (design), build `not started`
- Last updated: 2026-08-06
- Source: Stage 6 Finance Core Platform request, logged as `accepted-improvements.md` I-020
- Segment: `segments/S2.2-finance-core-posting.md`
- Architecture: `architecture.md` C5, ADR-5

Design depth behind S2.2's compact segment spec. Two things Stage 6's module
list conflated with S2.2 actually belong elsewhere and aren't repeated here:
**Fiscal Calendar setup** and **Currency catalog/identifiers** are `S1.3`
scope (`architecture.md` owns `FiscalCalendar`/`CurrencyRate` under C3, not
C5) — S2.2 consumes them, it doesn't define them. Grounded in IFRS/GAAP
where the two agree (double-entry, period matching, accrual basis); every
point where they diverge is routed through the jurisdiction-pack pattern
already established for tax (I-009), not hardcoded to one standard.

## Business analysis

S2.2 is the only place any journal entry gets created in the entire system.
Every business module (once built) posts through `AccountingEvent` (S2.1);
S2.2 turns validated events into balanced double-entry journal lines against
a tenant's chart of accounts, under period, tax, and approval controls, and
never allows a posted entry to be destructively edited — only reversed.

## Functional requirements by module

### Financial Period Management (posting-side; period *definition* is S1.3)

| ID | Requirement |
|---|---|
| FR-PM-1 | A period has states `open`, `soft-close` (adjustments only, no new operational postings), `closed` (no postings, reopen requires an explicit authorized action). |
| FR-PM-2 | Posting to a `closed` period is rejected with `FINANCE_PERIOD_CLOSED_POST_BLOCKED` (already the example error code named in `architecture.md`'s binding standards). |
| FR-PM-3 | Period close requires trial balance = 0 for that period as a precondition (business rule below). |

### Exchange Rate application (rate *storage* is S1.3; *translation* is S2.2)

| ID | Requirement |
|---|---|
| FR-FX-1 | Every non-base-currency journal line stores both transaction-currency amount and base-currency-equivalent amount, using the rate effective at posting date. |
| FR-FX-2 | Posted transactions preserve the applied rate permanently — a later rate correction never retroactively changes a posted entry (matches architecture.md's `CurrencyRate` note verbatim). |
| FR-FX-3 | Period-end revaluation of open foreign-currency balances produces realized/unrealized FX gain/loss entries as a distinct, clearly-tagged journal source type — never blended into the original transaction. |

### Organization Financial Settings (finance-specific; general org/branch setup is S1.3)

| ID | Requirement |
|---|---|
| FR-OFS-1 | Per company: base currency (immutable after first posting), default AR/AP/rounding-difference control accounts, rounding policy (round-half-up, 2 decimal places unless a jurisdiction pack specifies otherwise). |
| FR-OFS-2 | Control accounts must reference active, non-header (postable) accounts in the chart of accounts. |

### Chart of Accounts, Account Groups, Dimensions & Cost Centers

| ID | Requirement |
|---|---|
| FR-COA-1 | Accounts form a hierarchy (header/group accounts vs. postable leaf accounts); only leaf accounts accept postings. |
| FR-COA-2 | Account type (`asset, liability, equity, revenue, expense`) is immutable after first posting — changing it would silently corrupt every historical financial statement. |
| FR-COA-3 | Dimensions (cost center, profit center, department, project, fund) are optional per account but, once required by an account's posting rule, every line against that account must supply them — enforced at posting time, not just UI-time. |

### Journals, Journal Templates, Journal Posting Engine

| ID | Requirement |
|---|---|
| FR-JE-1 | Every journal entry is balanced: sum(debits) = sum(credits) in base currency, per entry — this is the one invariant the whole engine exists to protect. |
| FR-JE-2 | Posting rejects: unbalanced entries, inactive/header accounts, closed periods, invalid/expired tax rules, missing required approval (already S2.2's locked acceptance criteria, restated here with the "why"). |
| FR-JE-3 | Journal templates define a reusable line-item pattern (e.g. standard payroll journal) with placeholder amounts filled at posting time — templates cannot bypass FR-JE-1/FR-JE-2. |
| FR-JE-4 | Automatic sequential numbering per company/period/document-type, gapless for posted entries (a rejected draft does not consume a number; a reversed entry's original number is never reused). |
| FR-JE-5 | Reversals create a new, balanced compensating entry referencing the original; the original is never mutated (already locked, restated). |

### Ledger Engine / General Ledger (posting-side write model; the query/report view is S2.3)

| ID | Requirement |
|---|---|
| FR-GL-1 | Every posted journal line writes exactly one GL ledger row per account/dimension combination — the ledger is a derived, append-only write model from `JournalLine`, never edited independently of its source journal. |
| FR-GL-2 | Opening balances are posted as a distinct, dated journal source type at fiscal-year start, not backfilled into ordinary transaction history. |
| FR-GL-3 | Closing entries (revenue/expense to retained earnings at fiscal year-end) are a distinct, system-generated journal source type, reversible only by the same reversal mechanism as any other posted entry. |

### Budget Management (entry/approval; Budget-vs-Actual reporting is S2.3 — `architecture.md` C5 explicitly owns "budgets")

| ID | Requirement |
|---|---|
| FR-BUD-1 | Budgets are versioned per fiscal year/period/account/dimension combination, with an approval workflow reusing S1.3's workflow engine (not a second approval mechanism). |
| FR-BUD-2 | An approved budget is immutable; a revision creates a new versioned budget, preserving the prior version for variance history. |
| FR-BUD-3 | Budget entries never post to the GL — they're a comparison baseline, not a transaction. |

### Recurring Journals

| ID | Requirement |
|---|---|
| FR-REC-1 | A recurring journal template runs on a defined schedule (monthly/quarterly), generating a draft journal each cycle that still passes through FR-JE-1/FR-JE-2 — recurrence never bypasses posting controls. |
| FR-REC-2 | Each generated instance is traceable back to its recurring template and cycle number. |

### Intercompany Accounting

| ID | Requirement |
|---|---|
| FR-IC-1 | An intercompany transaction posts a mirrored pair of entries (due-to/due-from) across two companies within the same tenant, atomically — one succeeds only if both do. |
| FR-IC-2 | Intercompany balances between any two companies must net to zero before consolidation (validated at consolidation time, S2.3/S3.2). |

### Consolidation structures (structure/rules here; consolidated statement output is S2.3)

| ID | Requirement |
|---|---|
| FR-CON-1 | A consolidation group defines parent/subsidiary company relationships and ownership percentage, versioned (ownership changes over time must not corrupt historical consolidated statements). |
| FR-CON-2 | Elimination rules (intercompany balances, intercompany profit) are defined per consolidation group and applied at report-generation time — never as a permanent adjustment to subsidiary-level books. |

## Non-functional requirements

Reuses the already-locked NFRs verbatim: trial balance variance = 0; p95
critical transaction (posting, approval) under 2 seconds at pilot load
(`segments/S2.2-finance-core-posting.md`). Added for this depth pass:
consolidation report generation p95 under 10 seconds for a 20-subsidiary
group at pilot data volume (heavier than a single-entity trial balance, so
given its own target rather than inheriting the 2-second one).

## Security model / permissions

Every write here reuses S1.2's exact-permission model — no new mechanism.
Representative permissions: `finance.journal.create`, `finance.journal.post`,
`finance.journal.reverse`, `finance.period.close`, `finance.period.reopen`,
`finance.budget.approve`, `finance.consolidation.configure`. Static SoD: the
same actor cannot both create and approve a journal above a configured
threshold (reuses S1.2's static/dynamic SoD evaluator, not a new one).

## Error handling

Canonical shape reused. Representative codes: `FINANCE_JOURNAL_UNBALANCED`,
`FINANCE_PERIOD_CLOSED_POST_BLOCKED`, `FINANCE_ACCOUNT_INACTIVE_POST_BLOCKED`,
`FINANCE_TAX_RULE_INVALID`, `FINANCE_APPROVAL_REQUIRED`,
`FINANCE_INTERCOMPANY_MISMATCH`.

## Testing strategy

Reuses `verification-matrix.md`'s levels (S2.2's locked verify command:
unit, integration, e2e, security, migration). Accounting-specific test
cases: unbalanced-entry rejection, closed-period rejection, reversal
balance-preservation, recurring-journal-bypasses-nothing, intercompany
atomic pair (one leg failing rolls back both), consolidation elimination
nets intercompany balances to zero.
