# W2-04 Dynamic Authorization Evidence

- Date: 2026-10-07
- Scope: W2-04 only
- Result: implementation complete; application gates pass
- Deferred boundary: W2-05 Express policy middleware and UI capability projection were not started

## Delivered controls

W2-04 establishes a deny-by-default, framework-independent policy layer with:

- dynamic roles with no role-name or seeded-role-ID authorization branch;
- exact `module.resource.action` permissions with no wildcard matching;
- enterprise, company, branch, and organization-unit scope grants;
- field allow-lists, source-state bounds, and permission-owned assurance metadata;
- effective-dated assignments and assignment/transaction segregation of duty;
- one repeatable-read PostgreSQL policy snapshot per decision;
- dynamic bootstrap policy records, with the bootstrap flag retained only as identity metadata;
- a database-enforced last-effective-administrator invariant;
- globally serialized policy mutation checks using advisory lock `4894133722`;
- optimistic versions, durable command idempotency, and append-only policy evidence;
- strict reusable Zod/OpenAPI schemas without publishing unimplemented HTTP paths.

The Node.js implementation uses Express-compatible service boundaries, but W2-04 intentionally mounts no new routes. PostgreSQL is the policy source of truth.

## Migration and catalogue inventory

Migration `packages/db/migrations/0005_authorization_policy.sql` is additive and forward-only. It creates 12 policy tables:

1. `security_scope`
2. `security_permission`
3. `security_permission_state`
4. `security_permission_field`
5. `security_role`
6. `security_role_permission`
7. `security_field_grant`
8. `security_role_assignment`
9. `security_assignment_scope`
10. `security_sod_policy`
11. `security_policy_event`
12. `security_policy_command`

The migration seeds one enterprise root and 23 exact security permissions. It backfills an existing bootstrap identity and fresh bootstrap creates equivalent dynamic role, permission, field, assignment, scope, and evidence rows atomically.

Rollback is safe only before policy data is used: drop the new objects in reverse dependency order. After policy administration starts, corrections must be forward migrations so assignments and evidence are preserved.

## Decision matrices

| Dimension | Verified outcomes |
| --- | --- |
| Exact actions | `read`, `create`, `edit`, `delete`, and `archive` are evaluated independently; unknown and wildcard keys deny. Governed security records intentionally expose archive instead of hard delete. |
| Workflow states | Draft/returned edit and submit paths allow; invalid source states deny. Submitted return/approve/reject paths allow. Draft approval and submitted re-submit deny. |
| Fields | Complete allow-lists permit; empty, partial, unrelated, or missing field coverage denies. |
| Scope | Exact and authorized descendant targets permit. Sibling, cross-company, archived, and unrelated valid IDs deny. Permission and scope cannot be composed across assignments. |
| Assurance | MFA is read from exact permission metadata. Permission-name prefixes do not imply assurance. |
| Assignment lifecycle | Future, expired, revoked, inactive-role, and inactive-user assignments do not confer access. |
| SoD | Assignment role pairs are dynamic and scope-aware. Maker/checker actor relations deny self-approval and missing trusted relation data fails closed. |
| Failure mode | Missing/inconsistent policy or repository failure produces a safe denial with no target, field value, credential, or policy snapshot leakage. |

## Database adversarial results

Fresh PostgreSQL 18 verification covered:

- normalized enterprise/company scope-name collision rejection;
- archived scope exclusion;
- dynamic bootstrap access independent of bootstrap flag and role display name;
- last-administrator mutation rollback;
- two concurrent final-administrator revocations leaving one effective administrator;
- concurrent incompatible role assignments allowing one transaction and rejecting the other;
- repeatable-read policy snapshot loading;
- in-transaction administration reauthorization;
- one durable result and one evidence event for an idempotent command;
- command-ID reuse with a different fingerprint returning conflict.

## Verification record

| Command | Result |
| --- | --- |
| `npm run format:check` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; Next.js production build completed |
| `npm run test:unit` | PASS; 8 files, 53 tests |
| Auth PostgreSQL integration selection | PASS; 5 files, 26 tests on a fresh isolated PostgreSQL 18 cluster |
| `npm run test:contract` | PASS; 2 files, 6 tests |
| `npm run test:security` | PASS; 1 file, 4 tests |
| `npm run test:performance` | PASS; 1 file, 2 tests |
| `npm run api:check` | PASS; committed OpenAPI/client artifacts match generation |
| `npm run test:e2e` | PASS; 8 tests, including all 67 desktop HR screens, seven mobile screens, and four keyboard journeys |
| `npm audit --omit=dev --audit-level=high` | PASS; 0 vulnerabilities |
| `npm test` | PASS; build/static gates plus 163 legacy tests |

The integration selection was:

```text
tests/integration/postgres-migrations.test.ts
tests/integration/authentication.test.ts
tests/integration/sessions.test.ts
tests/integration/mfa.test.ts
tests/integration/authorization-policy.test.ts
```

## Infrastructure exceptions

Docker Desktop was unavailable because the `dockerDesktopLinuxEngine` pipe did not exist. PostgreSQL verification therefore used a disposable local PostgreSQL 18 cluster on loopback; it was stopped and deleted after the run.

The complete integration command was started but external Redis/MinIO-dependent suites could not finish while Docker was unavailable, so it was interrupted and is not reported as passing. The five database/auth suites affected by W2-04 passed independently.

The pinned Gitleaks container (`v8.29.1` with the CI digest) and container rebuild/scan could not run for the same Docker outage; no local Gitleaks executable was installed. CI remains the authoritative follow-up for those infrastructure-backed gates.

## W2-05 handoff

W2-05 should consume `PolicyService`, `PostgresPolicySnapshotRepository`, the security contracts, and trusted server-derived scope/actor context. It must add centralized Express middleware and capability projection without duplicating evaluator rules or trusting client-provided company, assurance, actor relation, or scope ancestry.
