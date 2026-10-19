# HR-STAT-PK — Pakistan Statutory Payroll

- Status: `closed`
- Theme: Versioned Pakistan TY2027 salary withholding and controlled EOBI through the existing localization and Payroll authorities.
- Session cap: 6 items
- Active roots: `app/`, `contracts/`, `web/`, localization pack artifacts, focused tests, migrations and evidence
- Source links: owner final-completion contract; `docs/research/2026-10-05-pakistan-statutory-payroll-preflight.md`; `docs/superpowers/specs/2026-10-05-hr-stat-pk-design.md`; live code/schema/tests
- Pre-development doc gate: READY
- Documentation evidence path: `docs/evidence/HR-STAT-PK-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Planned model family: GPT-5
- Planned model variant: runtime-selected
- Planned model ID: not exposed
- Planned API reasoning effort: high
- Planned reasoning mode: standard
- Planned surface setting: high
- Planned delegation mode: single
- Planned max concurrent subagents: n/a
- Routing rationale: legal rules, database authority, immutable evidence and Payroll/Finance reconciliation share one correctness-sensitive boundary.
- Routing fallback: stop for an unresolved legal source, competing authority, tenant exposure or historical mutation.
- Routing escalation condition: source conflict, unverifiable statutory vector, destructive migration or unbalanced Finance output.
- Shared-write isolation: n/a; single orchestrator.
- Root synthesis owner: active Codex orchestrator.
- Usage guard: Phase A only until its commit and acceptance gate pass.

## Pre-development gate

- [x] Live code/schema/tests are the implementation authority; enacted law/FBR publications are the legal authority.
- [x] Existing localization publisher, resolver, executor, activation, Payroll, Finance, payslip and report authorities were reconciled.
- [x] Pakistan TY2027 section 149 rates and tax-year mechanics were verified against the amended Ordinance and FBR rate card.
- [x] EOBI rates/applicability were verified; the applicable minimum-wage base remains an explicit approved company fact.
- [x] Subnational schemes and special salary cases remain explicit fail-closed boundaries rather than guessed rules.
- [x] Migration, RLS, RBAC, maker-checker, audit, Decimal, vector, reconciliation and historical gates are selected.
- [x] Gate result: READY.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-STAT-PK-01 Historical baseline and PostgreSQL authority | Platform 0006 / HR 0019 / fingerprint evidence | done |
| HR-STAT-PK-02 Production pack and deterministic executor | Pakistan bundle, manifest/executor/import tests | done |
| HR-STAT-PK-03 Secured setup/input API | service/repository/API/OpenAPI/RBAC tests | done |
| HR-STAT-PK-04 Existing Payroll/Finance/payslip/report integration | calculation and PostgreSQL end-to-end tests | done |
| HR-STAT-PK-05 Existing-workspace UI | localization/payroll UI and a11y tests | done |
| HR-STAT-PK-06 Full verification and closeout | evidence/ledgers/memory/handoff/git | done |

## Completion gate

- [x] Production Pakistan reference and pack release are provenance-hashed and effective-dated.
- [x] Section 149 average-rate/YTD calculation and TY2027 vectors pass.
- [x] Taxable/exempt components and documented credits/adjustments are evidenced.
- [x] Applicable EOBI employee/employer contributions use an approved explicit base.
- [x] Missing or conflicting authority fails closed.
- [x] Existing Payroll/Finance/payslip/reports reconcile for controlled posted runs.
- [x] RBAC, privacy, maker-checker, audit, RLS/FORCE RLS and idempotency pass.
- [x] Forward/rollback/replay migration and historical invariants pass.
- [x] Backend, PostgreSQL, frontend, accessibility, API drift, TypeScript, ESLint and build pass.
- [x] One clean Phase A commit is pushed and synchronized.

## Closeout

- Result: statutory pack implementation and all Phase A acceptance gates are complete.
- Verification: `docs/evidence/HR-STAT-PK-verification.txt`.
- No worker or subagent was used; the Codex root orchestrator inspected, implemented and verified the complete phase.
- Known cross-phase integration finding: Finance's pre-existing approval threshold still requires a governed journal-approval handoff for high-value Payroll journals. The current controlled low-value end-to-end path reconciles; HR-BANK must close this technical prerequisite before payment export can claim production readiness.
