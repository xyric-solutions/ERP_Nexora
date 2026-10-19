# HR-PROD-05 - Leave Production Completeness

- Status: `closed with known limitations`
- Theme: Complete the existing Leave authority from effective policy through accrual, rollover, immutable ledger evidence, approved daily allocation and locked Payroll consumption.
- Session cap: 5 items
- Active roots: `app/`, `contracts/`, `web/`, focused tests
- Source links: owner-approved HR & Payroll Slice 5 request (2026-10-05); live Leave services/schema; HR-PROD-03 locked payroll-input evidence; existing employment context, approval, RBAC/RLS/audit/idempotency authorities
- Handoff status target: READY WITH KNOWN LIMITATIONS
- Pre-development doc gate: READY
- Documentation evidence path: `docs/evidence/HR-PROD-05-verification.txt`
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
- Routing rationale: Leave entitlement, approval, immutable ledger evidence and Payroll input locking are one correctness-sensitive transaction chain; one native orchestrator avoids shared-write collisions.
- Routing fallback: stop for owner review if a competing Leave authority, destructive historical rewrite, invented policy rule, or Payroll authority duplication would be required.
- Routing escalation condition: unresolved policy authority ambiguity, cross-tenant exposure, historical mutation, or inability to preserve immutable Payroll input evidence.
- Routing evidence path: this segment and `docs/evidence/HR-PROD-05-verification.txt`
- Routing deviation: exact runtime variant, ID, effort, mode and surface are unavailable under accepted finding X-002; no worker or delegation is planned.
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: active orchestrator
- Root synthesis evidence path: this segment
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: Slice 5 only; stop before overtime monetary calculation, statutory packs, bank/payment work, Demo expansion, D02-B, unrelated modules or UI redesign.
- Verify command: focused Leave/Payroll unit, API, contract, migration, PostgreSQL/RLS and frontend tests; canonical backend, API drift, ESLint/TypeScript/build and production-Demo September Payroll/Finance invariants.

## Authority audit

- Leave-type/policy identity: existing `hr_leave_type`.
- Request/approval authority: existing `hr_leave_request` and `PostgresAttendanceService.request_action` maker-checker workflow.
- Balance authority: existing immutable `hr_leave_transaction` ledger; no mutable balance store is introduced.
- Payroll authority: existing Attendance-period lock and immutable `hr_payroll_input` evidence from HR-PROD-03.
- Employment authority: existing effective employment relationship and assignment context.
- Conflict result: no competing Leave authority was found. This slice extends the existing authority with effective policy versions and request-day evidence.

## Pre-development gate

- [x] Live code/config/tests win implementation ties; the approved Slice 5 request supplies the completion requirements.
- [x] Existing Leave schema, repositories, services, UI, API, tests, Slice 3 Payroll input boundary, employment context and security controls were inspected.
- [x] Backend/API, contract, forward/rollback migration, frontend/a11y, security/privacy, PostgreSQL RLS, maker-checker, idempotency and historical-integrity gates are selected.
- [x] Automated accrual requires an explicit effective policy schedule; legacy or ambiguous policy data fails closed rather than receiving inferred rules.
- [x] Daily Leave allocation is evidence under the existing request authority, not a second Leave engine.
- [x] Existing immutable ledger remains the sole balance authority.
- [x] Gate result: READY

## Item checklist

| Item | Locator | Status |
|---|---|---|
| S5-01 Effective policy versions and deterministic accrual/rollover rules | HR migration, models/repository/service/tests | done |
| S5-02 Reconstructable ledger, opening/carry-forward/expiry and idempotency | Existing ledger extension and tests | done |
| S5-03 Authoritative daily request allocation and Payroll integration | Leave request/Attendance lock/Payroll regression tests | done |
| S5-04 Secured API and minimal Leave workspace visibility/actions | API contract, web client/workspace/tests | done |
| S5-05 Verification and closeout | evidence/progress/ledgers/memory/handoff/git | done |

## Design constraints

- Policy resolution is company-, leave-type-, employee-context- and date-scoped; overlapping effective versions fail closed.
- Accrual schedule, timing and partial-period treatment must be explicit policy data; no employee-name, department, currency, country or UI inference is allowed.
- Each automated ledger event has a stable source key and evidence; replay returns the same result and never duplicates entitlement.
- Rollover closes the prior cycle, expires the non-carried balance and adds only the policy-permitted carry-forward amount, preventing double counting.
- Approved requests consume balance once through per-date ledger evidence; rejected/cancelled requests consume nothing.
- Locked Payroll inputs retain the exact approved daily allocation and cannot be changed by later Leave mutations.
- September posted Payroll/run 1 and `JE-2026-09-00001` must remain unchanged.

## Completion gate

- [x] Effective policy resolution, accrual, rollover, expiry and reconstructable ledger pass focused tests.
- [x] Request maker-checker, daily allocation, partial/cross-period Leave and Payroll evidence pass.
- [x] RBAC, tenant/company/FORCE RLS, privacy, audit and idempotency pass.
- [x] Slices 1-4 and September Payroll/Finance invariants remain unchanged.
- [x] API contract/drift, frontend tests, TypeScript, ESLint and production build pass.
- [x] Forward/rollback migration evidence exists.
- [x] Closeout is committed, pushed/synchronized and the worktree is clean.

## Closeout

- Result: CLOSED WITH KNOWN LIMITATIONS.
- Evidence: `docs/evidence/HR-PROD-05-verification.txt`.
- Resolved waiver: HR-PROD-03-F01 is closed by immutable effective-policy-bound daily allocations consumed by Attendance and locked Payroll evidence.
- Preserved limitation: `on_completion` accrual remains fail-closed because no completion-event authority exists; monthly and annual schedules are operational only when explicitly configured.
- Preserved limitation: HR02-F01 gender-restricted policy operation remains fail-closed pending the approved sensitive-demographic authority.
- Stop guard: no OT monetary policy, statutory pack, bank/payment work, Demo expansion, D02-B, unrelated module or UI redesign was started.
