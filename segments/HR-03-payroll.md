# HR-03 — Payroll

- Status: `closed with waivers`
- Phase: Phase 8 productionization
- Active root: `app/`, `contracts/`, `tests/`, `web/`
- Sources: live HR-01/HR-02, `docs/business/hr-payroll-design.md`, `prd.md`, prototype payroll tests/UI
- Research: `docs/research/2026-09-25-hr-03-payroll-foundations.md`
- Pre-development gate: READY WITH RECORDED WAIVERS
- Loop primitive: `none`
- Runtime profile: `codex-native`; GPT-5 family; exact variant unavailable (X-002)
- Delegation: single; no subagents authorized
- Verification: `python scripts/verify.py unit integration contract security migration e2e`
- Evidence: `docs/evidence/HR-03-verification.txt`

## Pre-development gate

- [x] Owner explicitly approved HR-03 on 2026-09-25.
- [x] Live code, HR design, prototype behavior, tests, navigation, and integration dependencies reconciled.
- [x] Affected files and dependencies recorded before application implementation.
- [x] Scope excludes Attendance/Leave changes, HR-04, and jurisdiction-specific tax constants.
- [x] Finance PostgreSQL adapter and user-to-employee identity gaps are explicit fail-closed blockers.

Result: **READY WITH WAIVERS**. Owner approval supersedes the prior handoff prohibition on HR-03 only.

## Items

| ID | Item | Status | Acceptance |
|---|---|---|---|
| HR03-01 | Research/domain rules | completed | jurisdiction-neutral Decimal engine, safe formulas, lifecycle and journal invariants tested |
| HR03-02 | PostgreSQL migration | completed | normalized schema, constraints/indexes/RLS, immutable snapshots, guarded rollback |
| HR03-03 | Service/accounting/payment | completed | locked inputs, effective salary, rerun history, SoD, balanced proposal, fail-closed post, referenced payment |
| HR03-04 | API/RBAC/audit | completed | protected company-scoped routes, field permissions, idempotency, audit, no-store salary reads |
| HR03-05 | Frontend | completed | live setup/salary/run/validation/payment workspace using existing components |
| HR03-06 | Verification/closeout | completed | 626 backend, 4 HR PostgreSQL, 12 Platform PostgreSQL, 160 frontend and 17 accessibility tests pass; lint/drift/build clean |

## Recorded blockers

- HR03-F01: production PostgreSQL Finance posting adapter is absent. `post` returns a safe unavailable error; a
  prepared balanced journal never masquerades as posted.
- HR03-F02: no trustworthy user-account-to-employee binding exists. Self-service payslips are not exposed.
- HR03-F03: jurisdiction tax/social-insurance packs are not approved. Rates remain configurable formulas only.
- HR03-F04: employee bank data is masked metadata only; Nexora records external payment confirmation references
  but does not generate or simulate bank instructions.
- Inherited Q-003/S1.5-F05, HR01-F02, and production operations blockers remain open.

## Closeout

- Module status: **READY FOR REVIEW; NOT PRODUCTION READY**.
- Evidence: `docs/evidence/HR-03-verification.txt`.
- The generic calculation and control platform is complete for review; it does not claim country tax compliance,
  production journal posting, bank execution, or employee-own payslips.
