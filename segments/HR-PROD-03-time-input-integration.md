# HR-PROD-03 - Attendance, Leave and Overtime to Payroll

- Status: `closed with waivers`
- Theme: Extend the existing immutable `hr_payroll_input` boundary with deterministic day-level Attendance/Leave/approved-OT evidence, validate it in Slice 1 preflight, and allocate time fractions safely across Slice 2 salary segments.
- Session cap: 5 items
- Active roots: `app/`, `contracts/`, `web/`, focused tests
- Source links: owner-approved HR & Payroll Slice 3 request (2026-10-05); live HR-02 Attendance/Leave/Overtime services, repositories, migration 0002, EmploymentContextProvider, Slice 1 preflight, Slice 2 salary segmentation, RBAC/RLS/audit/idempotency, API contract, and existing Payroll workspace
- Handoff status target: READY WITH KNOWN LIMITATIONS
- Pre-development doc gate: READY
- Documentation evidence path: `docs/evidence/HR-PROD-03-verification.txt`
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
- Routing rationale: the lock transaction, preflight, salary segmentation and protected evidence schema are correctness-sensitive and tightly coupled; single native ownership avoids shared-write collision.
- Routing fallback: stop for owner review if existing authorities conflict, a time-allocation policy must be invented, or deterministic PostgreSQL verification is unavailable.
- Routing escalation condition: a duplicate authority, a new OT monetary policy, partial-day leave allocation policy, or historical Payroll/Finance mutation would be required.
- Routing evidence path: this segment and `docs/evidence/HR-PROD-03-verification.txt`
- Routing deviation: exact runtime variant, ID, effort, mode and surface are unavailable under accepted finding X-002; no fallback or delegation is planned.
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: active orchestrator
- Root synthesis evidence path: this segment
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: Slice 3 only; stop before Slice 4, Leave accrual/carry-forward, new policies, OT monetary rules, payslip release/reports, bank export, Demo expansion, D02-B or UI redesign.
- Verify command: focused unit/integration/contract/PostgreSQL/migration/frontend tests; canonical backend, API drift, ESLint/TypeScript/build, security and PostgreSQL HR/RLS gates; production-Demo September Payroll and Finance invariants.

## Authority audit

- Attendance authority: `PostgresAttendanceService._derive_range` over effective assignment, shift/rotation, holiday, immutable punches, approved correction, approved leave and approved overtime.
- Leave authority: existing `hr_leave_request` plus `hr_leave_type`; only `status='approved'` participates and paid/unpaid comes from the approved type.
- Overtime authority: existing `hr_overtime_request`; only approved minutes participate, bounded by the existing active `hr_overtime_rule`. The configured multiplier is source evidence, not authorization to invent monetary conversion.
- Lock authority: existing `hr_attendance_period` transition to `locked` atomically inserts immutable, tenant/company/employee/period-scoped `hr_payroll_input` rows.
- Candidate authority: effective `hr_employment_relationship` population already established by Slice 1; lock generation must align to it rather than legacy employee status.
- Conflict result: no competing Attendance, Leave, Overtime or payroll-input authority exists.

## Pre-development gate

- [x] Live code/config/tests win implementation ties; locked architecture remains intent authority.
- [x] HR-02, Employment Context, Slice 1 and Slice 2 evidence and live implementations were inspected.
- [x] The existing `hr_payroll_input` is extended as evidence only; no second source of truth is introduced.
- [x] Existing calendar-day proration remains authoritative; day evidence allocates its paid fractions to salary segments without a new policy.
- [x] Approved overtime quantity and the existing rule identifier/multiplier are snapshotted; no OT money conversion is added.
- [x] Fractional/multi-day leave without authoritative per-day allocation must fail closed rather than be guessed.
- [x] Existing legacy locked summaries remain readable for historical compatibility; new locks produce versioned day evidence.
- [x] Backend, migration, API/UI, auth/security, PostgreSQL/RLS, idempotency and historical-integrity gates are selected.
- [x] Existing Q-007/Q-010 and D02-A-F02 findings remain unchanged.
- [x] Gate result: READY

## Item checklist

| Item | Locator | Status |
|---|---|---|
| S3-01 Versioned locked time-evidence projection and migration | Attendance domain/service/repository + HR migration 0015 | done |
| S3-02 Candidate-aligned lock, preflight validation and salary-segment allocation | Attendance and Payroll services | done |
| S3-03 Secured typed input API and minimal Payroll workspace projection | API/OpenAPI/client/existing Payroll UI + existing RBAC | done |
| S3-04 Focused correctness/security/migration regressions | unit/PostgreSQL/integration/frontend tests | done |
| S3-05 Verification and closeout | evidence/progress/ledgers/memory/handoff/git | done |

## Item evidence and decisions

| Item | Evidence | Decision |
|---|---|---|
| S3-01 | HR migration 0015; deterministic evidence unit tests; clean/populated rollback and PostgreSQL HR gates | Extend immutable `hr_payroll_input`; do not create an HR authority. |
| S3-02 | Attendance/Payroll service tests; v2 hash/preflight tests; salary-revision, joiner/leaver and no-omission regressions | Allocate existing daily paid fractions by inclusive salary segment; legacy aggregate ambiguity remains fail-closed. |
| S3-03 | Typed OpenAPI/client; protected API integration test; Payroll workspace test | Reuse `hr.attendance.payroll_input.read` and authenticated company context. |
| S3-04 | `docs/evidence/HR-PROD-03-verification.txt` | Accept only deterministic full-day leave allocation; approved OT stays quantity/basis evidence without invented money. |
| S3-05 | Progress/findings/decisions/improvements/handoff reconciled; production Demo invariant checked | Close with HR-PROD-03-F01/F02 limitations; stop before Slice 4. |

## Design constraints

- New evidence is a versioned immutable snapshot of existing authorities, never a mutable HR authority.
- Each day snapshot names status, paid fraction, shift, punch/correction/leave/approved-OT evidence, and the applicable OT rule basis without exposing salary or money.
- Source hash covers the employee, attendance period, summary and ordered daily evidence.
- New inputs must reconcile calendar/paid/unpaid/leave/OT/correction totals and the stored hash before eligibility can pass.
- Day evidence allocates paid fractions and time variables to each inclusive salary segment; legacy summaries retain Slice 2's fail-closed ambiguity behavior.
- Pending Attendance/Leave/OT requests still block lock. Rejected/cancelled/unapproved OT never contributes approved minutes.
- Payroll calculation continues to consume only locked snapshots; later mutable source changes cannot rewrite a locked input or result.
- September posted Payroll/run 1 and Finance journal `JE-2026-09-00001` must remain unchanged.

## Completion gate

- [x] Normal, paid-leave, unpaid-leave, approved/unapproved OT and approved-correction inputs are deterministic and traceable.
- [x] New locks use the Slice 1 period-aware candidate population exactly once.
- [x] Preflight rejects unlocked, missing, ambiguous, malformed or hash-inconsistent inputs without silent omission.
- [x] Slice 2 salary segments consume day-allocated paid fractions correctly for revision, joiner and leaver cases.
- [x] Immutable evidence, audit, idempotency, RBAC, FORCE RLS and company/tenant isolation pass.
- [x] Forward/clean rollback/populated rollback migration evidence passes.
- [x] Existing API/frontend/build gates pass without workspace redesign.
- [x] September Payroll and Finance invariants are unchanged.
- [x] Closeout is committed, pushed/synchronized and the worktree is clean.

## Closeout

- Outcome: Attendance, approved Leave and approved Overtime now cross the existing immutable lock boundary as versioned, money-free daily evidence and are mandatory in Payroll preflight/calculation.
- Waivers: HR-PROD-03-F01 and HR-PROD-03-F02 remain fail-closed; neither weakens completed full-day/quantity integration.
- Verification: `docs/evidence/HR-PROD-03-verification.txt`.
- Next slice: none active; wait for explicit Slice 4 approval.
