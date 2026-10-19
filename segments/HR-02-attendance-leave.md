# HR-02 — Attendance, Shifts, and Leave

- Status: `closed with waivers`
- Phase: Phase 8 productionization
- Active root: `app/`, `contracts/`, `tests/`, `web/`
- Source links: `prd.md`, `architecture.md`, `docs/business/hr-payroll-design.md`, approved HR prototype
- Pre-development gate: READY WITH RECORDED WAIVERS
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Planned model family / variant / ID: gpt-5.6 / sol / gpt-5.6-sol
- Planned API reasoning effort / mode / surface: high / standard / high
- Planned delegation mode: single (subagents not authorized)
- Actual runtime route: GPT-5 family; exact variant/effort unavailable (X-002)
- Verify command: `python scripts/verify.py unit integration contract security migration e2e`
- Evidence path: `docs/evidence/HR-02-verification.txt`

## Pre-development gate

- [x] Owner explicitly approved HR-02 on 2026-09-25.
- [x] Live HR-01 implementation and tests were reconciled against the prototype.
- [x] Scope excludes Payroll/HR-03 and reuses existing Platform/HR foundations.
- [x] Exact affected areas, deterministic gates, runtime route, and no-worker execution are recorded.
- [x] Existing platform/workflow blockers remain production-readiness blockers, not hidden assumptions.

Gate result: **READY WITH WAIVERS**. The owner approval supersedes the prior handoff prohibition on
starting HR-02; it does not waive Q-003, HR01-F02, or other production promotion blockers.

## Items

| ID | Item | Status | Acceptance |
|---|---|---|---|
| HR02-01 | PostgreSQL schema/migration | completed | migration 0002, normalized constraints/indexes, forced RLS, append-only evidence, guarded rollback; 3 HR PostgreSQL tests pass |
| HR02-02 | Domain/repository/service | completed | deterministic derivation, controlled lifecycle, leave ledger controls, company safety, and immutable lock/snapshot are verified |
| HR02-03 | API/RBAC/audit | completed | 26 protected operations on 17 paths use contextual permissions, idempotency, SoD, safe errors, and tenant hash-chain audit |
| HR02-04 | Frontend | completed | live `/hr/attendance` and `/hr/leave` workspaces cover operations/configuration with responsive, tested accessible states |
| HR02-05 | Verification/closeout | completed | all focused/regression/security/dependency/build gates pass; evidence is recorded below |

## Completion gate

HR-02 may reach READY FOR REVIEW only when all five items have evidence and no change-caused critical
failure remains. It may not reach PRODUCTION READY while inherited identity/workflow/operations blockers remain.

## Closeout

- Module status: **READY FOR REVIEW; NOT PRODUCTION READY**.
- Evidence: `docs/evidence/HR-02-verification.txt`.
- Backend: 615 tests pass across unit, integration, contract, security, migration, and e2e.
- PostgreSQL: 3 HR and 12 Platform tests pass against disposable PostgreSQL databases.
- Frontend: TypeScript and lint pass; 53 files / 157 tests and 13 files / 16 accessibility tests pass; API drift and the 49-route production build pass.
- Security/data review: raw punches, leave transactions, and payroll inputs are immutable; company/date relationships are database-enforced; forced RLS and server authorization deny cross-tenant/company access; approval SoD and locked-period mutation denial are verified.
- Routing: the planned capable route was retained, no workers/subagents were used, and X-002 remains the recorded provenance waiver because exact runtime variant/effort fields are unavailable.
- Waivers/blockers: Q-003/S1.5-F05, HR01-F02, Q-004/Q-006, and S1.5-F03/F06/F07 remain production-promotion blockers. HR02-F01 records the employee-document/gender master-data dependency for restricted leave policies.
