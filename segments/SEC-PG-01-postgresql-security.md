# SEC-PG-01 - PostgreSQL Security Persistence

- Status: `closed with waivers`
- Theme: production identity, authorization, and immutable audit persistence
- Session cap: 4 items
- Reviewed date / evidence path: 2026-09-25 / `docs/evidence/SEC-PG-01-verification.txt`
- Build gate this batch? yes
- Active root: `app/`
- Source links: `architecture.md` C2/C10 and ADR-2/ADR-8; `traceability-matrix.md` S1.2/S1.5; `plans/2026-09-25-blocker-remediation.md`; live S1.2/S1.5 code and tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `segments/SEC-PG-01-postgresql-security.md`
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
- Routing rationale: authentication, tenant isolation, RLS, credential storage, and immutable audit are security-sensitive and tightly coupled.
- Routing fallback: remain on the current capable Codex route; stop rather than lower capability for access-control or migration decisions.
- Routing escalation condition: tenant leakage, credential disclosure, authorization bypass, mutable audit evidence, destructive rollback, or nondeterministic concurrency.
- Routing evidence path: `docs/evidence/SEC-PG-01-verification.txt`
- Routing deviation: X-002 only; no lower-capability fallback or subagent route was used
- Ultra workstream map/shared-write isolation: n/a
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/SEC-PG-01-verification.txt`
- Worker task packet/output/saved workflow: n/a
- Usage guard: one bounded Security module; stop before Workflow/Finance edits; do not invent provider credentials or production secrets
- Verify command: `python scripts/verify_postgres_security.py` and `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate

- [x] Active docs and source hierarchy are identified; framework templates and memory examples are reference-only; live code/config/contracts/tests win implementation ties.
- [x] Scope is bounded to the existing S1.2 Security module and S1.5 production composition.
- [x] Traceability resolves to C2/C10 and R1.1/R10.1/R11.1/R12.1/R13.1; the existing Blueprint traceability row is reused.
- [x] Selected gates: migration forward/rollback, RLS tenant isolation, repository parity, password/session authentication, authorization allow/deny, audit immutability/concurrency, production composition, full regression.
- [x] Deterministic commands and evidence path are recorded.
- [x] Runtime route is recorded; no worker or subagent is used.
- [x] Existing HR-03 dirty worktree is understood and preserved.
- [x] Waiver Q-003: a managed OIDC/SAML provider, issuer/audience policy, and credentials still require an owner/provider decision. This slice may enable the already-approved first-party credential/session path but may not claim SSO completion. Owner: security/platform owner. Closure: provider selection plus managed-token lifecycle tests.
- [x] Waiver Q-004/Q-006: KMS, restricted archive/SIEM, retention, cloud HA/backup remain external deployment decisions. Owner: security/data/platform owners. Closure: selected controls pass deployment and recovery gates.
- [x] Gate result: **READY WITH WAIVERS** - external provider/operations decisions do not prevent the PostgreSQL Security foundation from being implemented and verified fail-closed.

## Item checklist

| Item | Locator | Status |
|------|---------|--------|
| SEC-PG-01-01 normalized schema, constraints, RLS, immutable audit, safe rollback | `app/security/postgres/migrations/` | done |
| SEC-PG-01-02 tenant-bound repository and pool-backed read boundary | `app/security/postgres/` | done |
| SEC-PG-01-03 production credential/session/RBAC composition | `app/production/`, `app/security/` | done |
| SEC-PG-01-04 focused security and regression evidence | `tests/postgres/`, `scripts/`, `docs/evidence/` | done |

## Batch summary

- Ship-ready: PostgreSQL Security schema/repositories, forced RLS, immutable concurrent audit, consistent-snapshot authorization/login, opt-in credential sessions, migration CLI, CI and deployment documentation.
- Must-fix in this bounded slice: none; the concurrent SoD assignment race found during review was fixed and directly tested.
- External/open: managed OIDC/SAML and provider operational controls remain Q-003/Q-004/Q-006; they are not replaced by the first-party credential path.
- Decision: **READY FOR REVIEW**, not full ERP production readiness.

## Completion gate

- [x] Forward migration is atomic/idempotent and rollback refuses protected data.
- [x] Forced RLS prevents cross-tenant reads/writes under the application role.
- [x] Password hashes and signing secrets never appear in responses, logs, reprs, or committed configuration.
- [x] Production login, signed session verification, permission allow/deny, locked/inactive account denial, and tenant mismatch pass against PostgreSQL.
- [x] Audit append and role assignment are transaction-safe under concurrency; audit update/delete are blocked.
- [x] Focused PostgreSQL and canonical regression commands pass: 629 backend, 12 Platform PG, 3 Security PG, 4 HR PG, 160 frontend, 17 a11y, 50-route build.
- [x] Findings, decisions, progress, evidence, and handoff are reconciled.
