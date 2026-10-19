# HR-PROD-01 — Payroll eligibility and preflight

- Status: `closed`
- Theme: Classify every authoritative payroll-period candidate exactly once as `ELIGIBLE` or `BLOCKED`, expose the read model securely, and prevent calculation from silently omitting blocked candidates.
- Session cap: 4 items
- Active roots: `app/`, `contracts/`, `web/`, focused tests
- Source links: owner-approved HR & Payroll Slice 1 request (2026-10-05); live Employment Context, Payroll, Attendance locked-input, Localization, RBAC, RLS, API-contract, and Payroll-page authorities
- Handoff status target: READY
- Pre-development doc gate: READY
- Documentation evidence path: `docs/evidence/HR-PROD-01-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Endpoint class: native
- Planned model family: gpt-5.6
- Planned model variant: sol
- Planned model ID: gpt-5.6-sol
- Planned API reasoning effort: medium
- Planned reasoning mode: standard
- Planned surface setting: medium
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
- Routing rationale: this is a bounded but security- and payroll-correctness-sensitive cross-module change; the frontier native route is appropriate and single ownership avoids shared-write collision.
- Routing fallback: stop for owner review if the native route, PostgreSQL authority, or deterministic verification becomes unavailable.
- Routing escalation condition: an unexpected schema migration, partial-run policy decision, or conflict between Employment Context and Payroll authorities.
- Routing evidence path: this segment and `docs/evidence/HR-PROD-01-verification.txt`
- Routing deviation: Exact runtime variant, ID, effort, mode, and surface were unavailable under accepted finding X-002; no fallback or delegation occurred.
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: active orchestrator
- Root synthesis evidence path: this segment
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: Slice 1 only; stop before salary period correctness, proration, OT multipliers, leave accrual, payslip release/reports, statutory packs, Demo expansion, D02-B, or unrelated modules.
- Verify command: focused unit/integration/contract/PostgreSQL/frontend tests; API drift; TypeScript/ESLint/build; security and PostgreSQL HR/RLS gates; production-Demo verification and immutable September/Finance before/after check.

## Pre-development gate

- [x] Active docs, archived docs, and tie-breaker identified: live code/config/tests win; locked architecture remains intent authority.
- [x] Source links resolve to the owner-approved slice and live implementation paths.
- [x] This is not a new Blueprint segment; no `BUILD_READY` marker is required.
- [x] Backend/API, contract, frontend/UI, auth/security, PostgreSQL/RLS, and data-integrity gates selected.
- [x] Deterministic commands and evidence path recorded.
- [x] Runtime/model intake is complete; delegation is single and no worker is used.
- [x] Existing Localization Q-007/Q-010 and browser D02-A-F02 findings remain unchanged.
- [x] No destructive action, credential change, persistent preflight authority, or schema migration is planned.
- [x] Gate result: READY

## Item checklist

| Item | Locator | Status |
|---|---|---|
| S1-01 Authoritative computed preflight | Payroll service/repository + Employment Context transaction boundary | done |
| S1-02 Calculation gate | existing Payroll calculate command boundary | done |
| S1-03 Secured API and minimal UI | API route/OpenAPI/generated client/existing Payroll page | done |
| S1-04 Focused verification and closeout | backend/PostgreSQL/API/frontend/security/build/Demo evidence | done |

## Design constraints

- Candidate scope comes from non-draft legal-employment relationships whose effective ranges overlap the selected period and legal employer; it does not use legacy `employee.status`.
- Sequential relationships for the same employee in one period collapse deterministically to one candidate evaluated on the latest in-scope date.
- Employment Context remains the component authority; Payroll does not reconstruct assignment, organization, work-location, jurisdiction, or salary facts.
- Locked attendance/payroll input remains the time-input authority. Preflight reports missing/ambiguous inputs instead of silently filtering them.
- Localization is required only through the existing localization control/provider. Optional country-neutral periods do not fabricate jurisdiction and do not become blocked merely because localization is not required yet.
- The result is a computed read projection. Calculation re-evaluates it transactionally; no new table or migration is introduced.
- Any blocked candidate prevents calculation. No partial-run semantics are introduced.

## Completion gate

- [x] Candidate count equals eligible plus blocked count and every employee ID is unique.
- [x] Joiners, leavers, temporarily inactive state, missing/ambiguous context, salary, time-input, and required localization paths are deterministic.
- [x] The read API requires authenticated company context and `hr.payroll.period.read`; company denial occurs before service access.
- [x] The existing Payroll page shows period/counts/candidates/blockers without redesign or hidden candidates.
- [x] Calculation fails with an explicit preflight error before changing period/results when any candidate is blocked.
- [x] Company/tenant isolation, forced RLS, and existing maker-checker/audit/idempotency behavior remain intact.
- [x] September Demo Payroll and its Finance journal are unchanged.
- [x] Focused and required gates pass; evidence, progress, ledgers, memory, and handoff are current.
- [x] Closeout is committed and pushed/synchronized with a clean worktree.
