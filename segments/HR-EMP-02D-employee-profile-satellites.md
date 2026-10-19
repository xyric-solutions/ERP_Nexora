# HR-EMP-02D — Employee Profile and Governed Satellites

- Status: `closed with waivers`
- Theme: governed employee identity profile, private data and satellite records
- Session cap: 02D schema/service/API/focused UI, verification, evidence, commit and synchronization only
- Planned evidence path: `docs/evidence/HR-EMP-02D-verification.txt`
- Build gate this batch? yes
- Active roots: HR PostgreSQL migration/service/API, existing HR UI, contract, tests and Forgeflow records
- Source links: owner-approved HR-02/02D scope; live HR-EMP-02A–02C, HR-01, HR-LOC, Attendance, Payroll, Workflow and RBAC/RLS
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider / endpoint class: Codex / native
- Planned model family / variant / ID: gpt-5.6 / sol / `gpt-5.6-sol`
- Planned API reasoning effort / mode / surface: high / standard / high
- Planned delegation mode / maximum subagents: single / n/a
- Routing rationale: the slice crosses PII, effective history, a forward PostgreSQL migration, field permissions, API/UI and consumer compatibility.
- Routing fallback: leave 02D open and report the exact blocker if privacy, migration, security or compatibility proof cannot be completed.
- Routing escalation condition: any required redesign of Employee, employment, HR-LOC, Attendance, Payroll, Finance, Workflow or the Q-004 boundary.
- Usage guard: stop on a material architecture conflict or repeated migration, RLS, privacy, history or consumer regression.
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`
- Worker task/output/saved workflow: n/a
- Closeout writes: segment, evidence, progress, findings/decisions/improvements, memory and handoff.

## Pre-development gate — READY WITH WAIVERS

- [x] HR-02 plan, 02A–02C implementation/evidence, Employee and satellite schemas, Workflow, RBAC/RLS/audit/idempotency, HR APIs/UI, HR-LOC and consumers inspected.
- [x] Live code/config/tests win implementation ties; historical Attendance & Leave documentation remains unchanged.
- [x] Existing Employee and satellite authorities can be governed and extended; no competing Employee, employment, contact, document or jurisdiction authority is required.
- [x] Current raw `national_id` ingestion conflicts with the explicit Q-004 fail-closed requirement and will be removed without storing replacement secrets.
- [x] Deterministic migration, PostgreSQL, API, security, frontend, accessibility, build and regression gates exist.
- Waivers: X-002 runtime route metadata remains unavailable; manual browser walkthrough is supplementary to automated UI/a11y/build evidence.
- External gates preserved: Q-004 vault/KMS, secure document binary storage, Q-007, Q-010 and cross-border employment.

## Item checklist

| Item | Locator | Status | Evidence / decision |
|---|---|---|---|
| HR-EMP-02D-01 — profile/satellite schema | HR migration 0013 | IMPLEMENTED | Extends existing tables; typed append-only history; no JSON custom fields. Applied/rolled back/replayed against disposable PostgreSQL. |
| HR-EMP-02D-02 — services, privacy and history | HR domain/repository/service | IMPLEMENTED | Idempotent, atomic audit, as-of reconstruction and Q-004 fail-closed behavior; 4 real defects found and fixed against disposable PostgreSQL (see `docs/evidence/HR-EMP-02D-verification.txt`). |
| HR-EMP-02D-03 — protected APIs and RBAC | API/OpenAPI/permissions | IMPLEMENTED | Company-context authorization and dedicated satellite/private permissions; `contracts/openapi-v1.json` and generated client updated; RBAC verified by integration tests. |
| HR-EMP-02D-04 — focused profile UI | existing HR workspace | IMPLEMENTED | New Profile tab reusing Nexora components; permission, empty/error/loading and accessibility states verified. |
| HR-EMP-02D-05 — complete verification and closeout | tests/evidence/ledgers | IMPLEMENTED | Canonical, PostgreSQL, UI, security and country-neutrality gates all pass; see `docs/evidence/HR-EMP-02D-verification.txt`. |

## Acceptance boundary

- Employee remains the canonical identity and does not imply legal employment.
- Profile and satellite history is reconstructable from explicit effective evidence; legacy history is not guessed.
- Raw statutory, tax and bank identifiers are unavailable until Q-004 closes.
- Document operations are metadata-only; binary storage/download remains unavailable.
- Every endpoint is tenant/company scoped, permission-separated, audited and idempotent where mutating.
- Attendance, Payroll, HR-LOC, compensation and assignments retain their existing authorities and behavior.
- Stop without beginning HR-EMP-02E.

## Closeout

- Status: CLOSED WITH WAIVERS. Full results in `docs/evidence/HR-EMP-02D-verification.txt`.
- All five checklist items are IMPLEMENTED. Governance decision: satellite
  mutations remain direct RBAC-gated, audited, idempotent commands (no
  maker-checker), consistent with the existing precedent for ordinary
  employee profile edits; only employment status/lifecycle transitions route
  through Workflow in this codebase.
- Four pre-existing/newly-reachable defects were found by real disposable
  PostgreSQL tests (not review alone) and fixed: an `UnboundLocalError` in
  `employee_action`'s update paths, a silently-bypassable contact-projection
  guard trigger, an incorrect history-closing boundary that broke as-of
  reconstruction, and an exclusion-constraint violation after a same-day
  profile-version correction. See `findings-ledger.md` HR-EMP-02D-F01..F04.
- Waived: X-002 runtime route metadata; manual browser walkthrough (automated
  component/a11y/build evidence substitutes); `demo.hr`'s missing base HR-02
  permissions (pre-existing gap from 02A-02C, not touched by this slice).
- Blocked by external gate: Q-004 (sensitive identifier vault/KMS — raw
  writes stay unavailable, only masked reads exist), secure document binary
  storage, Q-007/Q-010 (unaffected by this slice).
- HR-EMP-02E through HR-EMP-02G are NOT STARTED. No EmploymentContextProvider
  cutover, Payroll/Attendance redesign, or statutory rule work was performed.
