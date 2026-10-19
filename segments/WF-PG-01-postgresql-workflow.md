# WF-PG-01 - PostgreSQL Workflow Persistence

- Status: `closed with waivers`
- Theme: durable tenant-safe workflow, approval history, and cross-domain transactions
- Session cap: 4 items
- Reviewed date / evidence path: 2026-09-25 / `docs/evidence/WF-PG-01-verification.txt`
- Build gate this batch? yes
- Active root: `app/`
- Source links: `architecture.md` C3/C4/C10 and ADR-3/ADR-4/ADR-12; `traceability-matrix.md` S1.3/S1.5; `plans/2026-09-25-blocker-remediation.md`; live Workflow, Platform, Security, and HR code/tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `segments/WF-PG-01-postgresql-workflow.md`
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
- Routing rationale: forced RLS, append-only approval evidence, concurrency, and a Platform/Workflow/Security unit of work are security- and data-integrity-sensitive and tightly coupled.
- Routing fallback: remain on the current capable Codex route; stop rather than lower capability for tenant-isolation or migration decisions.
- Routing escalation condition: tenant leakage, lost approval evidence, partial setup activation, destructive rollback, or nondeterministic concurrent decisions.
- Routing evidence path: `docs/evidence/WF-PG-01-verification.txt`
- Routing deviation: X-002 only; no lower-capability fallback or subagent route was used
- Ultra workstream map/shared-write isolation: n/a
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/WF-PG-01-verification.txt`
- Worker task packet/output/saved workflow: n/a
- Usage guard: one bounded Workflow module; stop before Finance, identity mapping, Redis, provider, banking, statutory, or cloud work
- Verify command: `python scripts/verify_postgres_workflow.py` and `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate

- [x] Active docs and source hierarchy are identified; live code/config/contracts/tests win implementation ties.
- [x] Scope is bounded to the existing S1.3 Workflow engine, setup activation seam, and the HR-01 approval-matrix seam named by HR01-F02.
- [x] Traceability resolves to C3/C4/C10 and R1.1/R3.1/R4.1/R5.1/R6.1/R7.1/R8.1/R10.1/R12.1/R13.1.
- [x] Selected gates: migration forward/rollback, forced-RLS tenant isolation, repository parity, immutable ordered approval actions, concurrent decision safety, setup activation commit/rollback, HR submit/approve/reject atomicity, production composition, and full regression.
- [x] Deterministic commands and evidence path are recorded.
- [x] Runtime route is recorded; no worker or subagent is used.
- [x] Existing HR-03 and SEC-PG-01 dirty worktree is understood and preserved.
- [x] Waiver Q-003/Q-004/Q-006: managed identity, KMS/archive/retention, and cloud operations remain external decisions and do not block local PostgreSQL Workflow correctness. Owners: security/data/platform owners. Closure: selected provider controls pass deployment and recovery gates.
- [x] Gate result: **READY WITH WAIVERS** - external provider/operations decisions do not prevent the PostgreSQL Workflow and transaction foundation from being built and verified fail-closed.

## Item checklist

| Item | Locator | Status |
|------|---------|--------|
| WF-PG-01-01 normalized schema, constraints, forced RLS, immutable action history, safe rollback | `app/workflow/postgres/migrations/` | done |
| WF-PG-01-02 tenant-bound repository and concurrency-safe approval service | `app/workflow/postgres/` | done |
| WF-PG-01-03 shared setup and HR approval transaction composition | `app/platform/`, `app/hr/`, `app/production/` | done |
| WF-PG-01-04 focused PostgreSQL, security, and regression evidence | `tests/postgres/`, `scripts/`, `docs/evidence/` | done |

## Batch summary

- Ship-ready: PostgreSQL Workflow definitions, instances and append-only action history; forced RLS; concurrency-safe role-bound decisions; production setup activation; configured HR employee approval matrices; migration CLI/docs/CI.
- Resolved: S1.5-F03 and HR01-F02. WF-PG-01-F01 (same-day HR rejection history collision) was found during closeout and fixed with preservation-safe HR migration 4.
- External/open: Q-003/Q-004/Q-006 remain deployment/provider waivers. Finance, identity mapping, Redis/observability, statutory payroll and bank execution remain later slices.
- Decision: **READY FOR REVIEW**, not full ERP production readiness.

## Completion gate

- [x] Forward migration is atomic/idempotent and rollback refuses protected data.
- [x] Forced RLS prevents cross-tenant reads/writes under the application role.
- [x] Workflow definitions, instances, and append-only ordered actions round-trip without tenant leakage.
- [x] Concurrent decisions cannot both transition the same pending approval.
- [x] Setup activation commits or rolls back Platform, Workflow, and Security audit writes together.
- [x] Configured HR employee submit/approve/reject decisions and HR state change commit or roll back together.
- [x] Focused PostgreSQL and canonical regression commands pass: 632 backend, 12 Platform PG, 3 Security PG, 4 Workflow PG, 4 HR PG.
- [x] Findings, decisions, progress, evidence, and handoff are reconciled.
