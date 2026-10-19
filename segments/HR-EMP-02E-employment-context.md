# HR-EMP-02E - Employment Context and Consumer Boundary

- Status: `closed_with_waivers`
- Theme: deterministic effective-dated employment context and governed consumer boundary
- Session cap: provider, read service/API, focused tests, regression evidence, closeout, commit and synchronization only
- Evidence path: `docs/evidence/HR-EMP-02E-verification.txt`
- Build gate this batch? yes
- Active roots: HR domain/PostgreSQL service, API contract, tests and Forgeflow records
- Source links: owner-approved HR-EMP-02E scope; live HR-EMP-02A-02D, HR-LOC, compensation, Attendance, Payroll, Workflow, RBAC/RLS/audit/idempotency
- Handoff status: CLOSED WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider / endpoint class: Codex / native
- Planned model family / variant / ID: gpt-5.6 / sol / `gpt-5.6-sol`
- Planned API reasoning effort / mode / surface: high / standard / high
- Planned delegation mode / maximum subagents: single / 0
- Actual route: GPT-5 family Codex; exact variant/ID/effort/surface unavailable (X-002)
- Actual delegation: single orchestrator; no subagents
- Routing rationale: this slice composes effective history, RLS, RBAC, HR-LOC and salary evidence across security-sensitive employee data.
- Routing fallback: stop and report if an authority conflict, unsafe historical reconstruction or cross-tenant ambiguity is found.
- Routing escalation condition: any need to redesign completed HR authorities, HR-LOC, Payroll, Attendance, Workflow or persistence.
- Routing evidence path: `docs/evidence/HR-EMP-02E-verification.txt`
- Routing deviation: exact runtime route metadata unavailable; X-002 retained
- Root synthesis owner: Codex
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate - READY WITH WAIVERS

- [x] Live code/config/tests selected as implementation source of truth.
- [x] HR-EMP-02A-02D, HR-LOC, compensation, Attendance, Payroll, Workflow, authorization, RLS, audit and idempotency inspected.
- [x] Existing authorities proved sufficient; no persistence or migration justified.
- [x] Backend/API, contract, auth/security, PostgreSQL and regression gates selected.
- [x] Single-orchestrator route and evidence path recorded.

## Item checklist

| Item | Locator | Status | Evidence / decision |
|---|---|---|---|
| HR-EMP-02E-01 - typed context contract | `app/hr/employment_context.py` | done | Deterministic day-granular contract, typed fail-closed errors and stable canonical hash. |
| HR-EMP-02E-02 - PostgreSQL provider/service | `app/hr/postgres/employment_context_provider.py`; `app/hr/service.py` | done | One tenant-scoped transaction, exact cardinality, lifecycle reconstruction, existing HR-LOC resolver and money-free compensation evidence. |
| HR-EMP-02E-03 - protected read API | `/api/v1/hr/employment_contexts`; OpenAPI/generated schema | done | Required company/employee/as-of, exact RBAC, company authorization, private/no-store and ETag. |
| HR-EMP-02E-04 - boundary and behavior tests | unit/integration/PostgreSQL/security tests | done | Current/history/future/termination/rehire/transfers/localization/ambiguity/isolation/determinism all pass. |
| HR-EMP-02E-05 - verification and closeout | evidence/ledgers/handoff | done | 695 canonical, 36 HR PostgreSQL, supporting DB and frontend regressions pass. |

## Acceptance boundary

- `as_of` is mandatory, day-granular and applied consistently inside one transaction.
- Zero or multiple authoritative matches fail closed; legacy compatibility assignments are never promoted.
- Legal employer remains relationship-owned; operational placement remains assignment-owned.
- Jurisdiction comes exclusively from the existing HR-LOC resolver and cross-country remains blocked.
- Payroll eligibility is `not_assessed`; only money-free readiness evidence is exposed.
- Existing Payroll and Attendance consumers remain compatible and are not migrated.
- No migration, frontend, statutory pack, cross-border model, Payroll calculation or Attendance redesign was introduced.

## Completion gate

- [x] All five items have implementation evidence and a final decision.
- [x] Focused behavior, PostgreSQL, API, RLS/RBAC and deterministic-history tests pass.
- [x] Full selected regression command passes: 695/695.
- [x] Country-neutrality and absence of salary/tax/pay values reviewed.
- [x] Diff contains only HR-EMP-02E-related changes.
- [x] Ledgers, progress, memory and handoff reconciled.
- [x] Closeout commit and `main`/`origin/main` synchronization are the final gate and are verified immediately after this record is committed.
- [x] HR-EMP-02F remains not started.

## Waivers and external gates

- Organization/master labels are current descriptive metadata; stable IDs and assignment placements carry historical authority.
- Salary evidence is not relationship-linked, so Payroll retains rehire-specific eligibility policy and the provider reports `not_assessed`.
- Existing consumers are intentionally not migrated in this slice.
- X-002 and Q-004/Q-007/Q-010 remain external; no real statutory pack or cross-border model exists.
