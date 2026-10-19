# HR-EMP-02C — Effective Assignments, Organization and Localization

- Status: `closed with waivers`
- Theme: effective operational placement of a legal employment relationship
- Session cap: assignment schema/service/API/focused UI, verification, evidence,
  commit, and synchronization only
- Planned evidence path: `docs/evidence/HR-EMP-02C-verification.txt`
- Build gate this batch? yes
- Active roots: HR PostgreSQL migration/service/API, existing HR UI, contract,
  tests, and Forgeflow records
- Source links: owner-approved HR-02/02C scope; live HR-EMP-02A/02B,
  organization, HR-LOC, Attendance, Payroll, Finance, Workflow and RBAC/RLS
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider / endpoint class: Codex / native
- Planned model family / variant / ID: gpt-5.6 / sol / `gpt-5.6-sol`
- Planned API reasoning effort / mode / surface: high / standard / high
- Planned delegation mode / maximum subagents: single / n/a
- Routing rationale: the slice crosses a risky effective-dated migration,
  compatibility projections, localization, security and multiple consumers.
- Routing fallback: leave 02C open and report the exact blocker if assignment,
  migration, security or compatibility proof cannot be completed.
- Routing escalation condition: any required redesign of Employee,
  relationship, HR-LOC, Attendance, Payroll, Finance or cross-border authority.
- Usage guard: stop on a material architecture conflict or repeated migration,
  RLS, history or consumer regression.
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`
- Worker task/output/saved workflow: n/a
- Closeout writes: segment, evidence, progress, findings/decisions/improvements,
  memory and handoff.

## Pre-development gate — READY WITH WAIVERS

- [x] HR-02 plan, 02A/02B implementation/evidence, assignment/master/
  organization schemas, HR-LOC resolver, Attendance/Payroll/Finance consumers,
  Workflow, RBAC/RLS/audit/idempotency and frontend inspected.
- [x] Live code/config/tests win implementation ties; historical Attendance &
  Leave documentation remains unchanged.
- [x] Existing `employee_assignment` can be extended; no competing assignment,
  work-location, Employee, relationship or jurisdiction authority is required.
- [x] Existing fixed branch/department trigger is incompatible with the already
  approved arbitrary organization hierarchy and will be forward-amended.
- [x] Existing profile creation produces a pre-employment assignment. It will
  remain explicit non-operational compatibility evidence; no legacy
  relationship will be guessed.
- [x] Deterministic migration, PostgreSQL, API, security, frontend,
  accessibility, build and regression gates exist.
- Waivers: X-002 runtime route metadata remains unavailable; manual browser
  walkthrough is supplementary to automated UI/a11y/build evidence.
- External gates preserved: Q-007, Q-010, Q-004 and cross-border employment.

## Item checklist

| Item | Locator | Status | Evidence / decision |
|---|---|---|---|
| HR-EMP-02C-01 — assignment/job/placement schema | HR migration 0012 | done | Live apply/replay/upgrade/rollback/RLS tests; extend, do not replace, existing assignment authority. |
| HR-EMP-02C-02 — effective segment service and validation | HR domain/repository/service | done | PostgreSQL boundary/history/manager/idempotency/audit tests; append segments, never rewrite history. |
| HR-EMP-02C-03 — existing API, RBAC, audit and HR-LOC context | API/OpenAPI/permissions | done | Integration/contract/security and HR-LOC PostgreSQL gates; reuse resolver and granular contextual permissions. |
| HR-EMP-02C-04 — focused assignment UI | existing HR workspace | done | 178 Web, 22 accessibility and production-build evidence; retain Nexora patterns. |
| HR-EMP-02C-05 — complete verification and closeout | tests/evidence/ledgers | done | `docs/evidence/HR-EMP-02C-verification.txt`; close with stated waivers and no 02D work. |

## Acceptance boundary

- New operational assignments require one matching legal employment
  relationship and preserve immutable prior segments.
- Job, designation and grade remain separate master-data references.
- Organization placement uses the existing arbitrary acyclic hierarchy and a
  normalized assignment-to-unit relation; branch/department columns remain
  deterministic compatibility projections.
- Manager validation is effective-dated, same-employer, self/cycle-safe.
- Work location is explicit and HR-LOC remains the only jurisdiction resolver.
- Cross-country placement fails closed; missing/unapproved localization is a
  readiness blocker and never a compliance claim.
- Existing Attendance/Payroll/Finance behavior is regression-tested without a
  full `EmploymentContextProvider` cutover.
- Stop without beginning HR-EMP-02D.

## Closeout

- HR migration 0012 extends the existing assignment authority with a required
  relationship/job boundary for operational segments and immutable normalized
  organization placement. No relationship was inferred for legacy rows.
- Routine placement changes append effective segments; legal-employer identity
  remains owned by `hr_employment_relationship` and cross-country resolution
  remains fail-closed in HR-LOC.
- Existing Attendance, Payroll and Finance consumers retain company/branch/
  department compatibility while the future `EmploymentContextProvider`
  cutover remains outside this slice.
- Canonical, PostgreSQL, API/contract, security, frontend, accessibility,
  build, dependency, Compose, portability and neutrality gates passed. Exact
  evidence is in `docs/evidence/HR-EMP-02C-verification.txt`.
- Waivers: X-002 runtime route metadata, no manual browser walkthrough, no
  guessed legacy relationship conversion, and the focused UI retains explicit
  organization identifiers pending the broader approved HR UI slice.
