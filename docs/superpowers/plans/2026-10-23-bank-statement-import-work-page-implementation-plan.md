# Bank Statement Import Work Page and Form Implementation Plan

- Status: implemented; verification complete
- Date: 2026-10-23
- Design: `../specs/2026-10-23-bank-statement-import-work-page-design.md`
- Deployment target: localhost only

## Dependency order

1. Add failure-first contract and repository tests for database-derived statement
   date bounds.
2. Extend the summary contract, PostgreSQL directory query, OpenAPI, and generated
   client without changing existing lifecycle semantics.
3. Add failure-first register tests, then implement a focused API-backed register
   with bounded filters and pagination.
4. Add failure-first shell routing tests, then route base/new/detail import pages.
5. Add failure-first form presentation tests, then align the upload/review form
   with the approved reference while preserving mapping and audit controls.
6. Run focused and full unit/contract checks, disposable integration tests when
   permitted, type-check, lint, Prettier, API synchronization, builds, readiness,
   and `git diff --check`.

## Safeguards

- Preserve every existing and uncommitted change.
- Do not add deletion, fixture fallback, direct database access, ledger posting,
  PDF support, migration, deployment, or a commit.
- Keep authentication, company isolation, permissions, CSRF, idempotency,
  optimistic versions, immutable evidence, and upload bounds unchanged.
- Use the existing generated client, API error format, Tailwind utilities, and
  shared shadcn primitives.
