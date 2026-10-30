# Database-Connected Finance Journals Implementation Plan

Authority: `docs/superpowers/specs/2026-10-29-database-connected-manual-journals-design.md`

## Batch 1: Persistence and Security Boundary

1. Add Finance migration 0031 for manual-journal sources, lines, immutable events/deletion tombstones, recurring-template governance, recurring occurrences, permissions, indexes, constraints, triggers, and company/tenant RLS.
2. Preserve the existing immutable ledger tables and recurring-template table; use only additive changes and validated backfills.
3. Update migration-count and schema-invariant tests.
4. Verify a clean test database migration before repository code consumes the schema.

## Batch 2: Shared Contracts and OpenAPI

1. Add strict Zod contracts for register queries/results, options, drafts, lifecycle actions, final review/posting, reversal, recurring templates, and occurrences.
2. Add versioned OpenAPI paths and standard problem responses.
3. Export Finance Journal contracts from the package entry points.
4. Regenerate the browser API client without discarding current HR or Bank changes.
5. Run contract tests and generated-client consistency checks.

## Batch 3: API Repository and Posting Integration

1. Implement a Finance Journal repository/service using the established session context, live company permission checks, bounded cursors, optimistic versions, idempotency, and transaction patterns.
2. Implement create/update/delete/submit/reject/detail/options/register operations.
3. Implement final review and atomic confirm/post through the existing Finance posting service.
4. Implement governed self-approval and Super Administrator override evidence.
5. Implement manual-journal reversal through the existing Finance reversal service, limited to manual-owned sources.
6. Add `/api/v1/finance` routes with origin, CSRF, `If-Match`, and idempotency guards.
7. Add integration/security tests for isolation, lifecycle, validation, concurrency, rollback, permissions, and source ownership.

## Batch 4: Recurring Draft Generation

1. Implement monthly/quarterly template CRUD and occurrence history.
2. Add a bounded worker task that claims due templates safely and creates one manual draft per scheduled date.
3. Preserve occurrence evidence if a generated draft is deleted and never regenerate that occurrence automatically.
4. Add worker concurrency, retry, date progression, and duplicate-prevention tests.

## Batch 5: Live Finance Journal UI

1. Read the installed Next.js 16 client-component guidance before editing UI entry points.
2. Add feature API adapters and reusable journal line editor/review components.
3. Implement Journal Register, Manual Journal, Journal Detail, Journal Approval & Posting, Journal Reversal, and Recurring Journals.
4. Route all six Finance Journal page IDs to live components and retain the fixture profile only as inactive historical data.
5. Preserve accessibility, responsive states, unsaved-change protection, error references, and shared Tailwind/shadcn conventions.
6. Add focused jsdom tests for every screen and lifecycle action.

## Batch 6: End-to-End Safety and Handoff

1. Run migrations against isolated test databases before any persistent UAT migration.
2. Run Finance Journal integration/security/contract/unit suites plus Bank and HR/Payroll posting regressions.
3. Run generated-client checks, typecheck, lint, format check, UI theme audit, `git diff --check`, and production web build.
4. Perform browser verification at desktop and narrow widths for all six screens.
5. Apply the additive migration to the approved local UAT database only after verification; create no journal/posting data during migration.
6. Update `docs/architecture/remaining-ui-migration.md` with completed work, evidence, and safe resume point.
