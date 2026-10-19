# DB-PG-ALL — PostgreSQL-only repository migration

- Status: `closed with waivers`
- Theme: Remove the local/reference legacy embedded database stack and make every Nexora runtime, test, migration, and active instruction PostgreSQL-based.
- Session cap: 5 items
- Reviewed date / evidence path: `docs/evidence/DB-PG-ALL-verification.txt`
- Build gate this batch? yes — database foundation change
- Active root: `app/`, with repository-wide configuration, tests, scripts, containers, and documentation in scope
- Source links: user request dated 2026-09-28; `AGENTS.md`; `FOUNDING-BRIEF.md`; `architecture.md`; `verification-matrix.md`; live code/config/tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/DB-PG-ALL-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Endpoint class: native
- Planned model family: gpt-5.6
- Planned model variant: sol
- Planned model ID: `gpt-5.6-sol`
- Planned API reasoning effort: `high`
- Planned reasoning mode: `standard`
- Planned surface setting: `high`
- Planned delegation mode: `single`
- Planned max concurrent subagents: n/a
- Actual model family: n/a — runtime does not expose an exact model identity
- Actual model variant: n/a
- Actual model ID: n/a
- Actual API reasoning effort: n/a
- Actual reasoning mode: n/a
- Actual surface setting: n/a
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: cross-cutting persistence and migration correctness require one accountable implementation and merge path; the safe route was not known until the full database surface was inventoried.
- Routing fallback: stop for review if the active runtime cannot safely reason about schema compatibility, tenant isolation, or rollback behavior.
- Routing escalation condition: destructive schema behavior, tenant-isolation regression, or inability to reproduce a failing PostgreSQL gate.
- Routing evidence path: `docs/evidence/DB-PG-ALL-verification.txt`
- Routing deviation: exact runtime model/settings are unavailable; work remains single-agent.
- Ultra workstream map: n/a
- Shared-write isolation: n/a — single-agent implementation
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/DB-PG-ALL-verification.txt`
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: stop before any production database mutation or credentialed external operation; disposable local PostgreSQL only
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`; module PostgreSQL verifiers; Python compile; Compose validation; frontend drift/lint/build; repository audit; portability check

## Pre-development gate

- [x] Active docs, archived docs, and tie-breaker source identified. Live code/config/tests win implementation ties; locked product/architecture docs retain intent authority; dated evidence remains historical.
- [x] Source links resolve to active docs or live paths.
- [x] This owner-requested corrective batch is not Blueprint-backed; no `BUILD_READY` marker is required.
- [x] Verification gates selected: backend/API, contract, auth/security, DB migration, dependency/configuration, containers, and docs/framework consistency.
- [x] Deterministic verify command and evidence path recorded.
- [x] Loop/runtime/model/delegation intake recorded.
- [x] No worker or saved workflow is used.
- [x] Existing dirty worktree reviewed; prior PostgreSQL/HR/Workflow/Security/Finance/OPS changes must be preserved.
- [x] Waivers: managed infrastructure/HA/backup/provider evidence remains external and is not required to prove the repository-local migration; exact runtime model metadata is unavailable.
- [x] Gate result: READY WITH WAIVERS

## Batch summary

- Ship-ready: yes for the repository-local database migration; full ERP production readiness remains separately gated
- Must-fix: none remaining in this batch
- Redesign / rework candidates: none outside the database boundary
- Open questions for the user: none

## Item checklist

| Item | Locator | Status |
|------|---------|--------|
| DB-PG-ALL-01 Runtime and configuration | `app/`, `scripts/`, env/container files | done |
| DB-PG-ALL-02 Repositories and migrations | `app/*/repository.py`, `app/*/migrations*` | done |
| DB-PG-ALL-03 Tests and verification harness | `tests/`, `scripts/verify*.py` | done |
| DB-PG-ALL-04 Documentation and ledgers | repository-wide markdown/text sources | done |
| DB-PG-ALL-05 Full audit and closeout | repository-wide search and gates | done |

## Acceptance and closeout

- Local development, Demo, tests, and production use PostgreSQL connections.
- PostgreSQL migrations cover every currently implemented data model, including operations and bank reconciliation.
- Retired embedded-database packages, imports, adapters, SQL syntax, file paths, and active instructions are removed.
- Historical evidence may retain a database name only when explicitly labeled historical and required for provenance.
- The repository-wide case-insensitive audit and PostgreSQL connection/migration gates pass.
- Existing functionality and tenant/security controls remain covered by deterministic tests.
- `_progress.md`, findings/decisions/improvements where applicable, and `plans/next-session-handoff.md` reflect the verified result.

## Closeout evidence

- Result: all acceptance criteria met; closed with only pre-existing external
  production-control and runtime-metadata waivers.
- Canonical backend: 638 tests pass (`261 unit`, `252 integration`, `5
  contract`, `13 security`, `5 e2e`, `102 migration`); 4 integration tests are
  intentionally skipped by their existing conditions.
- Live PostgreSQL module verification: Platform 12, Security 3, Workflow 4,
  Finance 7, HR 6 pass.
- Frontend drift, lint, TypeScript and production build pass; 51 routes built.
- Compose config, Python compile, dependency check, diff check, portability
  check, and repository-wide retired-database audit pass.
- Evidence: `docs/evidence/DB-PG-ALL-verification.txt`.
