# Bank Reconciliation Manual Workflow Addendum

**Date:** 2026-10-23  
**Status:** Approved for implementation  
**Extends:** `2026-10-22-bank-reconciliation-statement-import-design.md`

## Objective

Complete the production-backed reconciliation experience for manual ticking and
enhance imported statements with optional running/ending-balance evidence. The
existing BR-01 through BR-12 architecture, maker-checker lifecycle, tenant and
company isolation, audit trail, and statement-import controls remain
authoritative.

## Approved decisions

- The screen follows the supplied Reconciliation Balance reference while using
  the existing Tailwind and shadcn/ui system.
- Manual and statement-import reconciliation remain two methods of the same
  governed aggregate.
- A manual reconciliation captures eligible posted Bank nominal movements and
  persists explicit tick/untick evidence. It does not manufacture statement
  rows or post accounting entries.
- The opening statement balance is server-derived from the latest approved
  reconciliation closing balance. If none exists, it is the governed Bank
  nominal's ledger balance immediately before the selected period; a genuinely
  new account therefore starts at zero.
- `reconciliation_date` is distinct from the statement ending date.
- Manual calculated balance is opening balance plus selected receipts less
  selected payments. Difference is statement ending balance less that
  calculated balance, rounded once to the Bank Account currency precision.
- Available and selected receipt/payment totals are both shown.
- Statement mappings may optionally identify a running-balance column. The
  latest valid included row can supply the imported statement ending balance
  and ending date.
- PDF import remains unsupported until a reliable, bounded extractor is
  designed and approved.
- Reconcile submits for independent approval. Shoaib may use only the existing
  audited Super Administrator override in the approved local test environment.
- Approved reconciliations remain immutable. Corrections use a new governed
  record; existing evidence is never rewritten.

## Implementation sequence

1. Extend contracts and fixed-point calculation tests.
2. Add an additive Finance migration for reconciliation dates, manual selection
   evidence, and optional imported running balances.
3. Implement repository/service authority and historical opening-balance
   resolution.
4. Expose authenticated, versioned setup and manual-selection routes.
5. Extend the generated/browser client.
6. Implement the reference-aligned manual form and searchable checkbox table.
7. Surface imported ending-balance evidence in the existing import workflow.
8. Run focused unit, integration, security, contract, accessibility, static,
   and production-build verification.

No persistent database is migrated and no commit is created without separate
operator authorization.
