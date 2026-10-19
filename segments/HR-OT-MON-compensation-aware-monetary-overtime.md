# HR-OT-MON — Compensation-Aware Monetary Overtime

- Status: `closed`
- Theme: Convert approved Overtime quantities into authoritative monetary Payroll earnings through company-controlled policies and HR-selected effective arrangements.
- Session cap: 5 items
- Active roots: `app/`, `contracts/`, `web/`, focused tests, migrations and evidence
- Source links: owner-approved HR-OT-MON contract and policy decision; `docs/superpowers/specs/2026-10-05-hr-ot-mon-design.md`; `plans/2026-10-05-hr-ot-mon.md`; live compensation/Overtime/Payroll/Finance schema, services, contracts and tests
- Handoff status target: COMPLETE only if every mandatory gate passes
- Pre-development doc gate: READY
- Documentation evidence path: `docs/evidence/HR-OT-MON-verification.txt`
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
- Routing rationale: compensation policy, effective dating, immutable Payroll evidence and Finance reconciliation form one correctness-sensitive transaction chain with shared files; one native orchestrator avoids write collisions and keeps historical adjudication centralized.
- Routing fallback: stop for owner review if the approved design cannot be implemented without a competing authority, inferred policy or destructive history change.
- Routing escalation condition: unresolved authority conflict, cross-tenant exposure, historical mutation, non-deterministic monetary calculation or inability to prove transactional reconciliation.
- Routing evidence path: this segment and `docs/evidence/HR-OT-MON-verification.txt`
- Routing deviation: exact runtime variant, ID, effort, mode and surface are unavailable under accepted finding X-002; no worker or delegation is planned.
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: active orchestrator
- Root synthesis evidence path: this segment
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: Phase 1 only; stop on any unresolved policy, security or historical-integrity decision and do not begin statutory, bank, Demo or deferred UX work.
- Verify command: focused HR-OT-MON tests, then `python scripts/verify.py unit integration contract security e2e migration`, PostgreSQL HR/Finance scripts, production Demo verification, frontend/a11y/API-drift/TypeScript/ESLint/build and historical fingerprint comparison.

## Authority audit

- Compensation: existing salary assignment, structure/item, pay-component and salary-segment authorities are extended, not replaced.
- Quantity: approved `hr_overtime_request` is authoritative; `hr_overtime_rule` remains operational/non-monetary.
- Monetary policy: new versioned company configuration defines permitted choices; it does not reinterpret operational-rule multipliers.
- Employee selection: new effective employee/category arrangement records the HR selection within released company choices.
- Payroll: locked input, result/item, lifecycle, Finance, payslip and report authorities remain unchanged except for the new earning/evidence integration.
- Conflict result: no competing monetary OT authority exists. The owner-approved company-policy/employee-arrangement hierarchy resolves the previously missing authority.

## Pre-development gate

- [x] Active docs, archived-doc rule and tie-breaker are identified; live code/config/contracts/tests win implementation ties and the approved design governs new behavior.
- [x] Approved design, implementation plan, live schema/services/contracts/UI/tests, prior Slice 1-5 evidence and open OT decision were reconciled.
- [x] Foundation/docs, backend/API, contract, auth/security, migration, PostgreSQL/RLS, UI/a11y and historical-integrity gates are selected.
- [x] Deterministic verify command and evidence path are recorded.
- [x] Runtime/model intake is complete; single-agent `codex-native` is selected because shared-write correctness outweighs parallelism.
- [x] No worker, saved workflow or Ultra route is selected; their packet/topology requirements are not applicable.
- [x] HR-PROD-03-D02 is resolved at the product-policy level by the owner-approved controlled company catalog plus employee arrangement hierarchy.
- [x] Statutory policy, bank export, Demo expansion and deferred UX remain explicit do-not-do-yet boundaries.
- [x] Gate result: READY

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-OT-MON-01 Historical baseline and PostgreSQL authority | HR migration 0018, migration/PostgreSQL tests, fingerprint evidence | done |
| HR-OT-MON-02 Compensation, policy and arrangement service/API | HR domain/repository/service/API/OpenAPI/tests | done |
| HR-OT-MON-03 Monetary resolution and Payroll/Finance integration | Payroll domain/service/repository/evidence/tests | done |
| HR-OT-MON-04 Existing UI integration | HR client/workspaces/frontend/a11y tests | done |
| HR-OT-MON-05 Full verification and closeout | evidence/ledgers/memory/handoff/git | done |

## Design constraints

- No type, basis, hours, divisor, multiplier, component, rounding or earning-component default may become business authority.
- Company options are immutable after release; HR arrangements select only released options and are immutable after use.
- Policy, arrangement and salary resolution use the OT work date; overlap or ambiguity fails closed.
- All money uses PostgreSQL `numeric` and Python `Decimal`; float conversion is prohibited.
- Existing non-monetary OT multipliers remain non-monetary.
- September 2026 Payroll run 1 and `JE-2026-09-00001` must remain unchanged.

## Completion gate

- [x] Required compensation types/bases and controlled contractual configuration are operational.
- [x] Policy and employee arrangement versioning/effective dating/maker-checker/overlap prevention pass.
- [x] Work-date salary and policy resolution, Decimal conversion and explicit rounding pass.
- [x] Immutable hashable evidence and fail-closed blockers pass.
- [x] Existing Payroll, Finance, payslip and report values reconcile and remain idempotent.
- [x] RBAC, privacy, tenant/company isolation, FORCE RLS, audit and maker-checker pass.
- [x] Forward/rollback/replay migration gates and historical invariants pass.
- [x] Backend, PostgreSQL HR/Finance, frontend, accessibility, API drift, TypeScript, ESLint and build pass.
- [x] Evidence/ledgers/memory/handoff are updated truthfully.
- [x] One clean phase commit is pushed/synchronized and the worktree is clean.
- [x] Phase 2 and unrelated work remain unstarted.

## Closeout

- Closed: 2026-10-05.
- Result: COMPLETE; no HR-OT-MON waiver remains.
- Evidence: `docs/evidence/HR-OT-MON-verification.txt`.
- Security review: existing permissions remain exact; company scope precedes service access; PostgreSQL tenant RLS/FORCE RLS, maker-checker, audit and immutable evidence protections passed.
- Runtime proof: Payroll calculation resolved two OT work dates across a salary revision, produced two immutable evidence rows and one reconciled earning through Finance, payslip and reports.
- Historical proof: September Payroll run 1, input/result hashes and `JE-2026-09-00001` retained their pre-migration fingerprints.
- Out-of-scope state: Pakistan statutory work, bank export, Demo expansion and deferred browser UX were not started.
