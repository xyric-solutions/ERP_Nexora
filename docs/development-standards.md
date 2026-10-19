# Nexora - Development Standards

- Status: `active`
- Last updated: 2026-08-06
- Source: CTO architecture request 2026-08-06, logged as `accepted-improvements.md` I-015
- Applies to: `app/`, future frontend client code, and all segment batches from S1.3 onward

This document fills a gap identified during the 2026-08-06 architecture review: no
git workflow, branching, commit, PR, or code-review standard existed anywhere in
the project before this file. It does not restate `_shared-canon.md`,
`hard-gates.md`, or `docs/api-binding-standards.md` — see those for API/behavior
conventions. This file covers process only.

## Git workflow

- Trunk-based development against `main`. No long-lived feature branches that
  outlive a single segment batch.
- One branch per segment batch or finding, named `<type>/<segment-or-finding-id>-<short-slug>`,
  for example `feat/s1.3-tenant-setup` or `fix/s1.2-f01-admin-authz`.
- Branch types: `feat/`, `fix/`, `docs/`, `chore/`, `security/`.
- Rebase onto `main` before opening a pull request; do not merge `main` into a
  feature branch as a substitute for rebasing.

## Commit conventions

Conventional Commits, scoped to the segment or finding ID where applicable:

```
<type>(<scope>): <summary>

<body, optional>
```

- `type`: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `security`.
- `scope`: the segment ID (`s1.3`), component ID (`c5`), or finding ID
  (`s1.2-f01`) the commit belongs to.
- Summary is imperative mood, under 72 characters, no trailing period.
- Reference the closure condition from `findings-ledger.md` or
  `deferred-decisions.md` in the body when a commit resolves one.

## Pull request standards

Every PR description must state:

1. Which segment batch or finding/decision ID it advances.
2. Which verify command was run and its result (matching the segment's
   `Verify command` field, e.g. `test:unit && test:integration && ...`).
3. Any hard gate from `hard-gates.md` that is newly satisfied, and a link to
   the corresponding row in `docs/evidence/hard-gates-status.md` once closed.
4. Any waiver or deferred decision the PR depends on or introduces.

PRs that touch `app/security/` or any authentication/authorization/tenant-scope
code require a completed SEC-01 review pass (`.claude/skills/SEC-01-auth-rbac-privacy-review`)
attached before merge, per the existing project convention already applied at
S1.1/S1.2 closeout. PRs that change behavior require a QA-01 review pass
(`.claude/skills/QA-01-product-verification`) attached before merge.

## Code review process

- At least one reviewer who did not author the change approves before merge.
- Reviewers check: the stated verify command was actually run (not assumed),
  the hard gates the PR claims are genuinely evidenced, and no locked document
  was silently rewritten without a Reason/Impact/Risk/Recommendation entry in
  `accepted-improvements.md` or `deferred-decisions.md`.
- CI (GitHub Actions, `architecture.md` ADR-16) must be green before merge;
  a red check is never overridden by reviewer approval alone.

## Coding standards

- Match the existing style already established in `app/`: dataclass-based
  models with explicit validation (see `app/security/models.py`), repository
  pattern for persistence (see `app/security/repository.py`), no framework
  magic beyond what's declared in an ADR.
- No new third-party dependency without recording it against the relevant ADR
  in `architecture.md` (currently: FastAPI per ADR-11, plus the data/infra
  choices in ADR-12 through ADR-15). `pyproject.toml` stays the single source
  of truth for the dependency list.
- Frontend code (once a client segment starts) follows the stack in ADR-18
  (Next.js, React, TypeScript, Tailwind, shadcn/ui, React Query, React Hook
  Form) with strict TypeScript (`strict: true`), no implicit `any`.

## What this document does not cover

Behavior/API conventions (`_shared-canon.md`, `docs/api-binding-standards.md`),
verification levels (`verification-matrix.md`), and hard-fail conditions
(`hard-gates.md`) remain the authoritative sources for those topics — this file
is git/PR/review process only, and should not be extended to duplicate them.
