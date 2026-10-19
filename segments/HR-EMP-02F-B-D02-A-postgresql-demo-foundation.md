# HR-EMP-02F-B-D02-A — PostgreSQL Demo Foundation

## Batch contract

- **Status:** CLOSED WITH WAIVERS
- **Baseline:** `1970447bb27dab4f649dc98360ca693e4a69279d`
- **Objective:** run the Demo account through the production PostgreSQL application composition with isolated local infrastructure and deterministic production-authority seed data.
- **In scope:** isolated PostgreSQL 18 and Redis; production migrations; least-privilege runtime role; production-composed Demo bootstrap/launcher; Platform, Security, Workflow, Finance, HR and HR-LOC verification; controlled restoration of the preserved Employee Workspace; browser review.
- **Out of scope:** D02-B parity for Procurement/Inventory/Operations, D02-C expansion, Payroll/Attendance/Leave implementation, statutory packs, legacy Demo removal, and unrelated module work.
- **Rollback:** stop/remove only the `nexora-demo-v2` Compose project and its dedicated volumes; the legacy Demo database/runtime and existing listeners remain untouched.

## Runtime profile

- Loop primitive: none; single bounded implementation batch.
- Execution surface: Codex native.
- Reasoning mode: standard, high effort.
- Delegation: single-agent, per workspace instruction.
- Verification: focused infrastructure/security tests plus `python scripts/verify.py unit integration contract security e2e migration`, PostgreSQL gates, frontend test/a11y/type/lint/build/API drift, and browser review.

## Hard gates

- Application role is non-owner, `NOSUPERUSER`, and `NOBYPASSRLS`.
- No writes to PostgreSQL `5432`, unrelated PostgreSQL `55432`, Redis `6379`, or the legacy Demo database.
- Existing migrations remain unchanged and replay cleanly.
- `create_production_application()` is the active candidate composition.
- No Demo-only business authority or statutory approval is introduced.
- Preserved `stash@{0}` remains unchanged.

## Fast P0 stabilization

- **Status:** P0 COMPLETE; owner-authorized stabilization only. D02-B was not started.
- **Items:** exact PostgreSQL/Redis candidate isolation; database-authoritative
  Demo user and RBAC verification.
- **Deferred P1:** Employee workspace Back/Forward behavior and nonessential
  documentation cleanup, to prioritize HR/Payroll practice.
- **Pre-development gate:** READY. Live code/tests win ties; scope is bounded,
  reversible, and covered by focused infrastructure, login, company, HR and
  security checks.
- **Runtime:** loop `none`; `codex-native`; Codex orchestrator; planned
  `gpt-5.6-sol` at API effort `medium`, reasoning mode `standard`, surface
  `medium`; delegation `single`; no worker or subagent.
- **Fallback / escalation:** stop on ambiguous endpoint authority, RBAC model
  conflict, or focused security regression; do not broaden into D02-B or P1.
- **Evidence:** `docs/evidence/HR-EMP-02F-B-D02-A-verification.txt`; one bounded
  session, focused checks only, then minimal closeout and commit.
- **Result:** startup now accepts only PostgreSQL `127.0.0.1:55434` and Redis
  `127.0.0.1:56379`; the verifier reads the exact Demo user set from PostgreSQL
  and validates every active company-scoped role and permission assignment.
- **Focused gates:** 9 stabilization unit, 13 security, 24 PostgreSQL Platform,
  and 36 PostgreSQL HR tests passed; candidate startup, PostgreSQL/Redis,
  bootstrap replay, login, company allow/deny, Employee Directory, Employment
  Context, and readiness after repository-shaped reads passed.
- **Routing actual:** single-agent Codex; exact runtime model/effort provenance
  remains unavailable under existing waiver X-002; no fallback or delegation.

## Delivered

- Dedicated `nexora-demo-v2` Compose project: PostgreSQL 18 on `55434` and
  Redis on `56379`, with dedicated named volumes and no dependency on the
  legacy `5432`/`55432`/`6379` listeners.
- Separate bootstrap, migration-owner, and runtime roles. The runtime role is
  non-owner, non-superuser, `NOBYPASSRLS`, and has only application DML access.
- Existing production migration chain applied in the authoritative order:
  Platform 1-5, Security 1, Workflow 1, Finance 1, HR 1-13 (21 registry rows).
- Deterministic production-authority seed and verifier for Platform, Security,
  Workflow, Finance, HR and the fail-closed EmploymentContextProvider.
- Candidate launcher uses `create_production_application()` with password
  sessions and Redis; the legacy static token is rejected.
- Preserved Employee Directory/Record shell restored by controlled patch; all
  six preserved frontend file hashes matched their preflight evidence before
  the two bounded integration corrections.
- Finance/Workflow rollback runners corrected so populated guards remain
  effective for a non-superuser schema owner under FORCE RLS; historical SQL
  migration files were not edited.

## Verification closeout

- Canonical backend: 704 passed.
- PostgreSQL: Platform 24, Security 3, Workflow 4, Finance 7, HR/HR-LOC 36,
  and non-bypass rollback-owner guard 1; all passed.
- Redis: 4 passed.
- Frontend: 197 behavior/component and 26 accessibility tests passed; API
  drift, TypeScript, ESLint, and 54-route production build passed.
- Clean apply, replay, populated refusal, empty reverse rollback, RLS, role
  attributes, runtime readiness, login, RBAC, tenant/company denial,
  `private, no-store`, deterministic context hash, and sensitive-value absence
  were verified against the isolated candidate.

## Waivers and remaining boundaries

- `D02-A-W01`: the in-app Browser runtime failed to initialize in the active
  tool environment (`Cannot redefine property: process`). The candidate is
  live at `http://localhost:3001`; HTTP/CORS, route, automated accessibility,
  and production-build gates pass, but no visual approval is claimed. Full
  browser review remains an explicit D02-D gate.
- HR-LOC correctly reports `jurisdiction_context_incomplete`; compensation
  evidence correctly reports `salary_authority_missing`; Payroll eligibility
  remains `not_assessed`. No statutory approval or pay calculation was seeded.
- Procurement/Inventory/Operations parity remains D02-B. Broader HR Demo
  integration remains D02-C. Legacy Demo remains rollback/reference.
