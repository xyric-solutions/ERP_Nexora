# Approved BOM, planning, categories and actual production cost implementation

Design: [approved specification](../specs/2026-11-20-bom-planning-product-categories-design.md).
Approval received 20 November 2026 after proposal `8e5aa14`. Preserve unrelated
`.env.example` and lockfile edits. No business postings or automatic recategorization.
The referenced writing-plans skill is absent from both installed skill roots;
use the repository's existing checked implementation-plan convention.

- [x] Categories: additive scoped master/audit/permissions migration; bounded
      API; ID-backed product selection/filtering; Products/Configuration tabs;
      legacy text preservation; real PostgreSQL and contract tests.
- [x] BOM: canonical unit/warehouse snapshots, name, non-stock/expense estimates;
      screenshot section structure; bounded lookups; exact server preview.
- [x] Planning: auto-load BOM, proportional requirements/shortage, persist recipe
      version in existing plan/line tables, explicit stale refresh.
- [x] Orders: exact-once conversion copies snapshot and lines; direct template
      selection; frozen approval; batch issue prefill/variance safeguards; legacy path.
- [x] Actual charges: extend reviewed Stock/WIP lifecycle with posted expense-line
      allocations; enforce caps/authority/audit/replay/compensation in PostgreSQL;
      include exact actual charges in partial/final completion; source reversal guards.
- [x] Generate contracts/client/OpenAPI; run affected PostgreSQL, unit, contract,
      authorization and authenticated browser regressions, types/lint/build/theme.
- [x] Backup/rehearse schema upgrade with original-column/balance preservation;
      replay; pin/activate matched local services; verify served assets and readiness.
- [x] Document changed files, migrations, exact results, release references and
      remaining owner configuration/acceptance decisions. Stop after this scope.

Release completed: application `6cfa123`, build `1pTm3wjsHV4z3QQU1nPcV`.
Evidence and outstanding owner decisions: `docs/architecture/bom-template-integration.md`.
