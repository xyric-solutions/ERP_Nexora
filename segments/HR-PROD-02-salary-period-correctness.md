# HR-PROD-02 — Salary period correctness

- Status: `closed with known limitations`
- Theme: Resolve the existing salary-assignment authority across the full payroll/employment interval, calculate each unambiguous effective segment under the established paid-days/calendar-days convention, and retain immutable segment evidence.
- Session cap: 5 items
- Active roots: `app/`, `contracts/`, `web/`, focused tests
- Source links: owner-approved HR & Payroll Slice 2 request (2026-10-05); live Payroll, Compensation, Employment Context, Slice 1 preflight, locked Attendance input, RBAC/RLS, API contract, and Payroll UI authorities
- Handoff status target: READY
- Pre-development doc gate: READY
- Documentation evidence path: `docs/evidence/HR-PROD-02-verification.txt`
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
- Routing rationale: effective-dated payroll calculation and immutable evidence are correctness-sensitive and tightly coupled; single native ownership avoids shared-write collision.
- Routing fallback: stop for owner review if the authoritative proration convention, PostgreSQL authority, or deterministic verification becomes unavailable.
- Routing escalation condition: a new salary authority, a policy for allocating aggregate unpaid days across different salary rates, or a historical Payroll/Finance mutation would be required.
- Routing evidence path: this segment and `docs/evidence/HR-PROD-02-verification.txt`
- Routing deviation: exact runtime variant, ID, effort, mode, and surface are unavailable under accepted finding X-002; no fallback or delegation is planned.
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: active orchestrator
- Root synthesis evidence path: this segment
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: Slice 2 only; stop before Attendance/OT integration, Leave accrual, payslip release/reports, statutory packs, Demo expansion, D02-B, or visual redesign.
- Verify command: focused unit/integration/contract/PostgreSQL/migration/frontend tests; canonical API drift, TypeScript/ESLint/build, security and PostgreSQL HR/RLS gates; production-Demo September Payroll and Finance invariants.

## Pre-development gate

- [x] Live code/config/tests win implementation ties; locked architecture remains intent authority.
- [x] The single salary authority is `hr_salary_assignment`; no duplicate salary table/service/API will be introduced.
- [x] The established convention is component-level `amount × paid_days ÷ calendar_days` using locked `hr_payroll_input` evidence.
- [x] Full-attendance salary segments can use inclusive effective calendar days without inventing a rule.
- [x] Aggregate unpaid days cannot be assigned to a particular salary rate from current locked input; multiple-rate periods with that ambiguity must fail closed.
- [x] A preservation-safe migration is required because one payroll result currently has one required salary-assignment FK and cannot truthfully retain multiple salary authorities.
- [x] Backend, migration, API/result projection, frontend, auth/security, PostgreSQL/RLS, idempotency, and historical-integrity gates are selected.
- [x] Existing Localization Q-007/Q-010 and browser D02-A-F02 findings remain unchanged.
- [x] Gate result: READY

## Item checklist

| Item | Locator | Status |
|---|---|---|
| S2-01 Effective salary interval resolution and preflight | Payroll domain/service/repository | done |
| S2-02 Segmented calculation and immutable evidence | Payroll service/repository + HR migration 0014 | done |
| S2-03 Existing result API/UI projection | existing Payroll result contract/workspace | done |
| S2-04 Focused correctness/security/migration regressions | unit/PostgreSQL/integration/frontend tests | done |
| S2-05 Verification and closeout | evidence/progress/ledgers/memory/handoff/git | done |

## Design constraints

- Salary segments are inclusive intersections of the payroll period, the Slice 1 candidate employment interval, and approved/effective/superseded `hr_salary_assignment` rows.
- Gaps, overlaps, invalid structures/currency, and salary evidence wholly outside employment fail clearly; no latest-row fallback is allowed.
- Every component sourced from multiple salary assignments must be proratable. A non-prorated salary component across different rates is policy-ambiguous and fails closed.
- With multiple salary segments, locked paid days must equal the inclusive covered employment days. Otherwise the aggregate locked input cannot locate unpaid fractions by rate and calculation fails closed.
- Adjustments and loan instalments remain once-per-period existing authorities and are not duplicated per salary segment.
- Result-segment rows are immutable calculation evidence linked to the existing salary authority, not a new salary authority.
- Slice 1 preflight remains mandatory and calculation re-evaluates all interval rules in the same transaction.
- September posted Payroll/run 1 and Finance journal `JE-2026-09-00001` must remain byte-for-byte business-state unchanged.

## Completion gate

- [x] Period-start/end boundaries, first/last-day revisions, multiple revisions, joiners/leavers, future revisions, gaps, overlaps, and outside-employment evidence are deterministic.
- [x] Calculation aggregates valid salary portions and never applies the period-end salary to the whole period.
- [x] Immutable result evidence identifies every salary assignment, interval, rate basis, and calculated portion.
- [x] Slice 1 population/preflight, RBAC, RLS, company/tenant isolation, audit, and idempotency remain intact.
- [x] Forward/clean rollback/populated rollback migration evidence passes.
- [x] Existing API/frontend/build gates pass without workspace redesign.
- [x] September Payroll and Finance invariants are unchanged.
- [x] Closeout is committed, pushed/synchronized, and the worktree is clean.

## Closeout

- Closed: 2026-10-05.
- Salary authority: existing `hr_salary_assignment` rows only.
- Proration authority: existing component-level `amount x paid_days / calendar_days` convention.
- Known limitation: a multiple-rate period with aggregate unpaid days cannot identify which rate owns those days from the current locked input. It fails closed with `SALARY_PERIOD_INPUT_AMBIGUOUS`; no allocation policy was invented.
- Evidence: `docs/evidence/HR-PROD-02-verification.txt`.
- Hard stop honored: Slice 3 and all excluded work remain unstarted.
