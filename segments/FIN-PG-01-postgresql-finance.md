# FIN-PG-01 - PostgreSQL Finance Persistence

- Status: `closed with waivers` (`READY FOR REVIEW`)
- Theme: production Finance system of record and controlled payroll posting
- Session cap: 4 items
- Build gate this batch? yes
- Active root: `app/`
- Source links: `architecture.md` C5/C6/C8/C10 and ADR-3/ADR-4/ADR-12; `segments/S2.1-accounting-event-ledger.md`; `segments/S2.2-finance-core-posting.md`; `segments/S2.3-finance-reporting.md`; `plans/2026-09-25-blocker-remediation.md`; live Finance, Platform, Workflow, Security, HR code/tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `segments/FIN-PG-01-postgresql-finance.md`
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
- Actual model family: GPT-5 family (system reported)
- Actual model variant/ID/API effort/mode/surface: n/a - runtime did not expose these fields (X-002)
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: financial integrity, tenant isolation, posting idempotency, reversal safety, and migration rollback require one accountable high-risk path.
- Routing fallback: remain on the current capable Codex route; stop rather than lower capability for ledger or tenant-isolation decisions.
- Routing escalation condition: tenant leakage, unbalanced posting, duplicate posting, partial payroll posting, destructive rollback, or nondeterministic entry numbering.
- Routing evidence path: `docs/evidence/FIN-PG-01-verification.txt`
- Routing deviation: X-002 only
- Usage guard: one bounded Finance persistence module; stop before HR identity, statutory payroll, bank execution, Redis, managed identity, KMS, SIEM, or cloud-provider work
- Verify command: `python scripts/verify_postgres_finance.py` and `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate

- [x] Live code/config/contracts/tests win implementation ties; locked architecture/PRD/vision govern intent.
- [x] Existing Finance domain services are the canonical accounting engine and will be reused rather than redesigned.
- [x] Scope is bounded to accounting events, ledger masters/journals, planning/consolidation/reporting persistence, production composition, and payroll's controlled posting hand-off.
- [x] Selected gates: forward/rollback migrations, forced-RLS isolation, exact numerics, composite tenant references, posting/reversal/idempotency/concurrency, atomic payroll hand-off, and full regression.
- [x] Runtime is single-agent because the shared schema/repositories/posting transaction are tightly coupled.
- [x] Existing HR-03, SEC-PG-01, and WF-PG-01 changes are preserved.
- [x] Waiver Q-003/Q-004/Q-006: managed identity, KMS/archive/retention, and cloud operations remain external owner/provider decisions.
- [x] Waiver HR03-F03/F04: statutory payroll and bank execution require legal/treasury choices and are outside this persistence slice.
- [x] Gate result: **READY WITH WAIVERS**.

## Item checklist

| Item | Locator | Status |
|------|---------|--------|
| FIN-PG-01-01 normalized schema, constraints, forced RLS, safe rollback | `app/finance/postgres/migrations/` | done |
| FIN-PG-01-02 tenant-bound event, ledger, planning, consolidation and reporting repositories | `app/finance/postgres/` | done |
| FIN-PG-01-03 production Finance composition and controlled payroll posting adapter | `app/production/`, `app/hr/`, `app/finance/` | done |
| FIN-PG-01-04 focused PostgreSQL, security, migration and regression evidence | `tests/postgres/`, `scripts/`, `docs/evidence/` | done |

## Completion gate

- [x] Atomic/idempotent forward migration and preservation-safe rollback.
- [x] Forced RLS prevents cross-tenant access under the application role.
- [x] Monetary data uses exact numeric storage and balanced journals are database constrained at posting time.
- [x] Concurrent posting cannot allocate duplicate entry numbers or post a journal twice.
- [x] Posted journals are immutable and corrections use reversals.
- [x] Payroll posting uses the same PostingService controls and is idempotent/atomic with payroll state and audit.
- [x] Reporting derives from posted ledger rows.
- [x] Focused PostgreSQL and canonical regression gates pass.

## Closeout

- Closed: 2026-09-25.
- Result: **READY FOR REVIEW**, not a claim that the whole Finance module or ERP is production ready.
- Evidence: `docs/evidence/FIN-PG-01-verification.txt`.
- Focused result: 7 PostgreSQL Finance tests passed.
- Regression result: 632 canonical backend tests, all PostgreSQL domain gates, 160 frontend tests, 17 accessibility tests and a 50-route production build passed.
- HR03-F01 is resolved: payroll accounting proposals post through the same controlled PostgreSQL posting engine and transaction as payroll state and audit.
- FIN-PG-01-F01 was found and resolved: controlled payroll/accounting-event journals can now be reversed through the controlled source path instead of being stranded by the manual control-account rule.
- Remaining boundaries: employee identity binding, Redis distributed controls, observability, managed identity, statutory payroll, bank execution and provider/cloud controls remain separate dependency-ordered or external slices.
- Bank reconciliation PostgreSQL persistence is not part of this bounded foundation and must be completed in its owning Finance module before full Finance production readiness.
