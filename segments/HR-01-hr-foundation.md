# HR-01 — HR Foundation

- Status: `ready for review`
- Theme: production employee and organization foundation
- Phase: Phase 8 HR productionization amendment
- Session cap: one bounded HR-01 module; HR-02 and later modules prohibited
- Reviewed date / evidence path: 2026-09-25 / `docs/evidence/HR-01-verification.txt`
- Build gate this batch? yes — database, API, security, frontend and regression
- Active roots: `app/`, `contracts/`, `tests/`, `web/`
- Source links: direct owner instruction; HR-01 plan; live S1.5 code; locked S3.2 intent; HR core design; prototype HR core
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `plans/2026-09-25-hr-01-foundation.md`
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
- Actual model family: GPT-5 (system-reported family)
- Actual model variant/ID/effort/mode/surface: n/a — not exposed by runtime (X-002)
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: HR contains sensitive personal data, effective-dated history, tenant/company isolation and difficult-to-reverse schema decisions.
- Routing fallback: remain on the current capable route; stop on unresolved privacy/schema authority rather than reducing rigor.
- Routing escalation condition: cross-tenant/company leak, destructive migration, unmasked private data, audit gap or nondeterministic gate.
- Routing evidence path: `docs/evidence/HR-01-verification.txt`
- Routing deviation: X-002 only
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/HR-01-verification.txt`
- Worker task packet/output/saved workflow: n/a
- Usage guard: one HR-01 module only; no subagents; stop before HR-02
- Verify command: focused HR gates plus canonical backend/PostgreSQL/frontend gates from the HR-01 plan

## Pre-development gate

- [x] Live code/config/contracts/tests are the implementation tie-breaker; prototype is UX reference only.
- [x] Locked S3.2 skeleton intent is superseded in depth only by the owner's direct HR-01 instruction; Sales/Projects remain untouched.
- [x] Exact affected files, database/API/RBAC/audit design, non-goals and deterministic gates are recorded in the HR-01 plan.
- [x] D1 resolved as dedicated employee aggregate without a duplicate Party table; D2 resolved by reusing `organization_unit`.
- [x] Auth/RBAC/privacy gate selected: protected-by-default, company contextual authorization, server/persistence isolation, masked private data, atomic audit.
- [x] Product verification gate selected: unit, PostgreSQL, API, security, contract, frontend, accessibility, build and full regression.
- [x] No worker/subagent is used because delegation was not requested.
- [x] Waiver HR01-W01: owner authorizes HR-01 sequencing while Platform remains partial. Owner: product owner. Blocked claim: production promotion. Next action: close Q-003/Q-004/Q-006 and S1.5-F05. Closure: external identity/deployment gates pass.
- [x] Gate result: **READY WITH WAIVERS**.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-01-01 PostgreSQL schema/migration | `app/hr/postgres/`, PostgreSQL tests | done |
| HR-01-02 domain/service/audit | `app/hr/models.py`, `service.py` | done |
| HR-01-03 API/RBAC/contract | API application, OpenAPI, generated client | done |
| HR-01-04 live frontend | `/hr`, HR feature workspace | done |
| HR-01-05 verification/security closeout | tests, evidence, ledgers, handoff | done with blockers |

## Do not do yet

- HR-02, Attendance, Leave, Payroll, salary, recruitment or accounting posting.
- No demo/seed HR data in production migrations or frontend constants.
- No parallel company/branch/department, Party, workflow or audit chain.
- No production-ready claim while the recorded Platform deployment blockers remain.

## Completion gate

- [x] Every implemented item is evidenced; satellite tables are schema-only and recorded as a remaining review item.
- [x] Forward/idempotent/clean rollback and populated rollback guard pass.
- [x] Allowed, denied, cross-tenant, cross-company, branch-manipulation, overlap, manager-cycle and concurrent-numbering tests pass.
- [x] Sensitive data is masked/hashed and never logged or returned by general endpoints.
- [x] Contract/generated client, frontend behavior/a11y/build and full regressions pass.
- [x] Final security/data/scalability/maintainability review found no new critical defect; inherited major production blockers remain.
- [x] Evidence, progress, findings, improvements, traceability and handoff are current.
- [x] HR-01 is `READY FOR REVIEW`, not `PRODUCTION READY`; HR-02 remains untouched.

## Review limitations

- Production identity and PostgreSQL-backed role-policy persistence remain blocked by Q-003/S1.5-F05, so secure defaults reject real production users.
- The existing generic Workflow/approval engine remains legacy embedded database-only in the production composition. HR-01 therefore has a controlled submit/independent-approve lifecycle and immutable evidence, but not a configurable PostgreSQL approval matrix.
- Contact, bank, tax, emergency-contact, dependant and document-metadata tables are production constrained and tenant isolated, but dedicated write/read UI and API surfaces are not included in this bounded employee-register slice.
