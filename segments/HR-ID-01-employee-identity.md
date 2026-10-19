# HR-ID-01 - Employee Identity Binding

- Status: `closed with waivers` (`READY FOR REVIEW`)
- Theme: trusted employee self-service identity and own-payslip authorization
- Build gate this batch? yes
- Active root: `app/`
- Source authority: live Security/HR code, migrations, contracts and tests; locked architecture/PRD for intent
- Handoff target: READY WITH WAIVERS
- Runtime/delegation: current Codex route, single accountable implementation
- Verify: `python scripts/verify_postgres_hr.py` and `python scripts/verify.py unit integration contract security e2e migration`

## Scope

Reuse PostgreSQL Security accounts, HR employees/assignments, company-scoped
RBAC, Platform audit, payroll snapshots and existing API patterns. Add an
effective-dated, tenant-safe binding managed by authorized HR administrators.
Expose own payslips only by resolving the authenticated actor server-side;
never accept an employee id for self-service access.

Managed SSO, statutory payroll, banking and general HR satellite records are
out of scope and remain separate blockers.

## Items

| Item | Locator | Status |
|---|---|---|
| HR-ID-01-01 schema, constraints, RLS and safe rollback | `app/hr/postgres/migrations/` | done |
| HR-ID-01-02 repository/service, RBAC and audit | `app/hr/` | done |
| HR-ID-01-03 management and own-payslip APIs/contracts | `app/api/`, `contracts/` | done |
| HR-ID-01-04 tenant/company/privacy/concurrency/regression evidence | `tests/`, `docs/evidence/` | done |

## Completion gate

- [x] A user and employee cannot have overlapping active bindings.
- [x] Binding references are tenant-safe and backed by real Security/HR rows.
- [x] Management is company-scoped, idempotent and audited.
- [x] Self-service derives employee identity from the authenticated actor.
- [x] Own-only, cross-employee, cross-company and cross-tenant denial tests pass.
- [x] Only released payroll states and privacy-minimized fields are returned.
- [x] Focused PostgreSQL and canonical regression gates pass.

## Closeout

- Closed: 2026-09-25.
- Result: **READY FOR REVIEW**; managed SSO, statutory payroll and banking remain separate.
- Evidence: `docs/evidence/HR-ID-01-verification.txt`.
- Focused result: 6 PostgreSQL HR tests passed, including binding concurrency, RLS, safe rollback, revoked replay, own-only APIs and privacy minimization.
- Regression result: 632 backend tests, 163 frontend tests, 18 accessibility tests and a 51-route production build passed.
- Q-008 and HR03-F02 are resolved.
- HR-ID-01-F01 was found and resolved: command authorization now precedes idempotent replay lookup, so revoked administrators cannot recover old command responses.
