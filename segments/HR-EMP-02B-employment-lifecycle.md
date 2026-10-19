# HR-EMP-02B — Employment Relationships and Lifecycle

- Status: `closed with waivers`
- Theme: controlled, effective-dated legal-employment lifecycle
- Session cap: relationship lifecycle, policy, events, focused APIs/UI, tests,
  evidence, commit, and synchronization only
- Planned evidence path: `docs/evidence/HR-EMP-02B-verification.txt`
- Build gate this batch? yes
- Active roots: HR PostgreSQL migration/service/API, focused HR UI, contracts,
  tests, and Forgeflow records
- Source links: owner-approved HR-02/02B scope; live HR-EMP-02A, Workflow,
  Attendance, Payroll, HR-LOC, HR-03, RBAC/RLS, audit, and frontend
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Planned model family / variant / ID: gpt-5.6 / sol / `gpt-5.6-sol`
- Planned API reasoning effort / mode / surface: high / standard / high
- Planned delegation mode / maximum subagents: single / n/a
- Routing rationale: lifecycle authority crosses schema, effective dating,
  Workflow maker-checker, protected APIs, and compatibility boundaries.
- Routing fallback: leave 02B open and report the exact blocker if lifecycle,
  security, migration, or compatibility proof cannot be completed.
- Routing escalation condition: any required redesign of assignment,
  Attendance, Payroll, HR-LOC, HR-03, Finance, or cross-border architecture.
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate

- [x] HR-02 plan, 02A schema/evidence, live relationship table, legacy employee
  status, effective assignment, Workflow, Attendance/Payroll locks, HR-LOC,
  HR-03, RBAC/RLS/audit/idempotency, contracts, and frontend inspected.
- [x] Relationship lifecycle can be added without migrating current consumers.
- [x] Existing PostgreSQL Workflow can provide configured maker-checker without
  a second approval system.
- [x] Locked Attendance and calculated Payroll evidence can be detected using
  existing authoritative period/result tables.
- [x] No material architectural conflict found.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-EMP-02B-01 — lifecycle policy and event schema | HR migration 0011 | done |
| HR-EMP-02B-02 — relationship/lifecycle service and Workflow | HR service/repository | done |
| HR-EMP-02B-03 — contextual API/RBAC and contract | API/OpenAPI/permissions | done |
| HR-EMP-02B-04 — focused lifecycle UI | existing HR workspace | done |
| HR-EMP-02B-05 — verification and closeout | tests/evidence/ledgers | done |

## Acceptance boundary

- Employee identity, legal employment, and lifecycle remain separate.
- Append-only effective-dated events are the lifecycle authority;
  `employee.status` remains an unchanged compatibility projection.
- Rehire creates a new relationship and never reopens a prior relationship.
- Invalid, ambiguous, overlapping, cross-company, and protected-period changes
  fail closed.
- Existing Workflow, RLS, contextual RBAC, audit, and idempotency are reused.
- Existing Attendance, Payroll, HR-LOC, HR-03, Finance, assignment, and legacy
  employee-status behavior is preserved.
- Stop without beginning HR-EMP-02C.

## Closeout

- Relationship lifecycle authority is implemented through normalized policy,
  state, transition, request, and append-only event evidence.
- Rehire creates a new relationship; termination preserves Employee identity,
  assignments, Payroll, Attendance, and HR-LOC evidence.
- Existing consumers and `employee.status` semantics are unchanged pending a
  separately approved `EmploymentContextProvider` cutover.
- Canonical backend, PostgreSQL, frontend, accessibility, build, migration,
  dependency, Compose, portability, and neutrality gates passed. Exact results
  are recorded in `docs/evidence/HR-EMP-02B-verification.txt`.
- Waivers: browser visual walkthrough and actual runtime route metadata were not
  available; HR-EMP-02C through 02G and external localization/cross-border gates
  remain unstarted.
