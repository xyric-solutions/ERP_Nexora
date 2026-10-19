# HR-EMP-02A — Schema Preflight and Employment Relationship Foundation

- Status: `closed with waivers`
- Theme: additive employment authority with legacy-safe compatibility
- Session cap: schema, migration, security tests, and evidence only
- Planned evidence path: `docs/evidence/HR-EMP-02A-verification.txt`
- Build gate this batch? yes
- Active roots: Platform/HR PostgreSQL migrations, organization domain/contract,
  focused tests, and Forgeflow records
- Source links: approved HR-02 plan/amendments; live HR-01, HR-LOC-01 and HR-03
  implementation; current tests and contracts
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Planned model family / variant / ID: gpt-5.6 / sol / `gpt-5.6-sol`
- Planned API reasoning effort / mode / surface: high / standard / high
- Planned delegation mode / maximum subagents: single / n/a
- Routing rationale: schema evolution crosses HR, Platform, localization and
  existing consumer compatibility boundaries.
- Routing fallback: leave 02A open and report the exact blocker if migration or
  consumer compatibility cannot be proved.
- Routing escalation condition: any requirement to redesign current assignment,
  Attendance, Payroll, HR-LOC or Finance architecture.
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate

- [x] Existing employee, assignment, master, organization, legal-profile,
  localization and compensation schemas inspected.
- [x] Attendance, Payroll, identity and localization consumers inspected.
- [x] Existing foreign keys, exclusion constraints, indexes and forced RLS
  boundaries reconciled.
- [x] `hr_salary_assignment` confirmed as the existing HR-03 compensation
  authority; no duplicate is created.
- [x] Additive empty relationship table selected; no legacy relationship is
  inferred or backfilled.
- [x] No material architectural conflict found.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-EMP-02A-01 — schema/consumer preflight | approved plan and live schema | done |
| HR-EMP-02A-02 — generic organization types and cycle guard | Platform migrations/domain/contract | done |
| HR-EMP-02A-03 — employment relationship authority | HR migration 0010 | done |
| HR-EMP-02A-04 — migration/security/regression proof | tests and evidence | done |

## Acceptance boundary

- Preserve Employee identity separately from legal employment.
- Keep existing assignment and localization authorities unchanged.
- Permit no guessed legacy relationship and no country logic.
- Retain backward-compatible employee/assignment fields and consumers.
- Refuse unsafe rollback when new organization or employment evidence exists.
- Stop without beginning HR-EMP-02B.

## Completion gate

- [x] Production Platform migration 0005 and local/demo migration 0018 add only
  `business_unit`, `division`, and concurrency-safe acyclic hierarchy enforcement.
- [x] Production HR migration 0010 adds the empty, effective-dated employment
  relationship authority with typed legal-employer scope, exclusion protection,
  forced RLS and preservation-safe rollback.
- [x] Existing employees and assignments upgrade without inferred relationships;
  all compatibility columns and current consumers are unchanged.
- [x] Clean apply/replay/rollback, populated rollback refusal, constraints,
  indexes, RLS, tenant isolation and regressions pass.
- [x] No lifecycle/API/action/assignment redesign, compensation, Attendance,
  Payroll, statutory, country, custom-field or cross-border feature was added.
- [x] Exact verification is recorded in
  `docs/evidence/HR-EMP-02A-verification.txt`.
- [x] HR-EMP-02B remains not started pending explicit owner approval.
