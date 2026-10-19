# HR-PROD-04 - Payroll Completion

- Status: `closed with known limitations`
- Theme: Complete the existing Payroll lifecycle from calculation review through explicit payslip release and read-only operational reports without duplicating Payroll, Finance, approval, or employee-identity authorities.
- Session cap: 5 items
- Active roots: `app/`, `contracts/`, `web/`, focused tests
- Source links: owner-approved HR & Payroll Slice 4 request (2026-10-05); live Slice 1-3 services/evidence; existing Payroll period/result/proposal authorities; Finance `PostgresPayrollAccountingAdapter`; employee identity own-payslip service; RBAC/RLS/audit/idempotency
- Handoff status target: READY WITH KNOWN LIMITATIONS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/HR-PROD-04-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Endpoint class: native
- Planned model family: gpt-5.6
- Planned model variant: sol
- Planned model ID: gpt-5.6-sol
- Planned API reasoning effort: high
- Planned reasoning mode: standard
- Planned surface setting: high
- Planned delegation mode: single
- Planned max concurrent subagents: n/a
- Actual model family: GPT-5
- Actual model variant: not exposed by runtime
- Actual model ID: not exposed by runtime
- Actual API reasoning effort: not exposed by runtime
- Actual reasoning mode: not exposed by runtime
- Actual surface setting: not exposed by runtime
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: Payroll approval, immutable publication, employee privacy and atomic Finance posting are tightly coupled and security-sensitive; one native orchestrator avoids shared-write collisions.
- Routing fallback: stop for owner review if an authority conflict, statutory bypass, new payment execution capability, or non-transactional production posting would be required.
- Routing escalation condition: unresolved data-authority ambiguity, destructive historical migration, cross-tenant exposure, or failure to prove atomic posting.
- Routing evidence path: this segment and `docs/evidence/HR-PROD-04-verification.txt`
- Routing deviation: exact runtime variant, ID, effort, mode and surface are unavailable under accepted finding X-002; no worker or delegation is planned.
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: active orchestrator
- Root synthesis evidence path: this segment
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: Slice 4 only; stop before Slice 5, bank export, statutory packs, Leave accrual, Demo expansion, D02-B, unrelated modules or UI redesign.
- Verify command: focused unit/integration/contract/PostgreSQL/frontend tests; canonical backend, API drift, ESLint/TypeScript/build, security and PostgreSQL HR/Finance/RLS gates; production-Demo September Payroll and Finance invariants.

## Authority audit

- Payroll result authority: immutable `hr_payroll_result`, result items, salary-segment and statutory evidence from Slices 1-3.
- Lifecycle authority: existing `hr_payroll_period` state machine and `PostgresPayrollService.period_action`.
- Approval authority: existing period maker-checker fields plus platform audit; no second workflow is introduced.
- Finance authority: existing shared-transaction `PostgresPayrollAccountingAdapter` and Finance PostingService.
- Payslip authority: the immutable Payroll result remains the payslip content; a release record is only an employee-publication boundary.
- Employee privacy authority: existing effective `employee_user_binding` and own-scope `hr.payroll.payslip.read` policy.
- Report authority: projections over immutable current-run Payroll evidence and its linked Finance journal; no reporting store is introduced.
- Conflict result: no competing authority was found.

## Pre-development gate

- [x] Live code/config/tests win implementation ties; locked architecture remains intent authority.
- [x] Slices 1-3 evidence, Payroll lifecycle, employee payslip query, Finance adapter, API, UI, RBAC/RLS/audit/idempotency and migrations were inspected.
- [x] Backend/API, contract, migration/rollback, frontend/a11y, security/privacy, PostgreSQL RLS, maker-checker, atomic posting and historical-integrity gates are selected.
- [x] Production posting must use the existing shared PostgreSQL transaction boundary.
- [x] Posted payroll must not imply payslip release; employee access requires an explicit immutable release record.
- [x] Reports must derive from immutable Payroll/Finance evidence and remain read-only.
- [x] Existing HR-PROD-03-F01/F02, Q-007/Q-010 and D02-A-F02 remain unchanged.
- [x] Waiver: the current pay-component authority has no allowance classification; report exact earning lines and do not infer allowance semantics from names/codes.
- [x] Gate result: READY WITH WAIVERS

## Item checklist

| Item | Locator | Status |
|---|---|---|
| S4-01 Completion validation and lifecycle hardening | Payroll service/repository and focused tests | done |
| S4-02 Explicit immutable payslip release and own-payslip privacy | HR migration 0016, Payroll/Identity service and tests | done |
| S4-03 Read-only register, summary, deductions, history and Finance reconciliation | Existing Payroll/Finance projections and API contract | done |
| S4-04 Minimal permission/state-aware Payroll workspace | Existing Payroll UI/client/tests | done |
| S4-05 Verification and closeout | evidence/progress/ledgers/memory/handoff/git | done |

## Design constraints

- Preflight and locked time evidence remain mandatory before calculation and again before review/preparation consistency decisions.
- Every current-run result must map one-to-one to the eligible candidate population and one immutable payroll input.
- Approval remains maker-checker; approved/posted evidence is not edited.
- Preparation creates one balanced proposal; posting requires the shared Finance transaction adapter and remains idempotent by controlled source.
- Payslip release is explicit after posting, audited and replay-safe; employee queries join the release boundary and effective identity binding.
- Historical reports read stored result/input/salary/statutory evidence and linked Finance rows; they do not recalculate from current HR data.
- September posted Payroll/run 1 and `JE-2026-09-00001` must remain unchanged.

## Completion gate

- [x] Full calculate/review/approve/prepare/post/release/report flow passes without database intervention.
- [x] Failure tests cover blocked inputs, state gates, self-approval, duplicate posting/release, payslip privacy and Finance rollback.
- [x] Read-only reports reconcile Payroll proposal and posted Finance journal totals.
- [x] Explicit release is immutable, audited, tenant/company/employee scoped and required for self-service visibility.
- [x] No duplicate Payroll, Finance, approval, reporting or payslip authority exists.
- [x] Forward/rollback migration, FORCE RLS, RBAC, audit and idempotency gates pass.
- [x] Existing frontend, API drift, TypeScript, ESLint, accessibility and production build pass.
- [x] September Payroll/Finance invariants and Demo verification remain unchanged.
- [x] Closeout is committed, pushed/synchronized and the worktree is clean.

## Closeout

- Result: CLOSED WITH KNOWN LIMITATIONS.
- Evidence: `docs/evidence/HR-PROD-04-verification.txt`.
- Preserved limitation: the current pay-component authority does not identify allowance components. Reports return exact earning lines and explicitly mark allowance classification unavailable; they do not infer semantics.
- Preserved gates: partial/fractional Leave allocation, OT monetary policy, statutory packs and bank execution remain fail-closed under their existing owners.
- Stop guard: no Slice 5, D02-B, Demo expansion, bank export, statutory implementation or unrelated module work was started.
