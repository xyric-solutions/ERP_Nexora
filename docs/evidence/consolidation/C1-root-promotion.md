# C1 Independent Root and Controlled Promotion

Date: 2026-10-09  
Status: completed; awaiting approval for C2 baseline verification

## Outcome

`E:\XS\Xyric Solutions LLP\prototype_ERP` is now the independent Nexora Git
and project root. The TypeScript monorepo was promoted from the nested
`prototype` directory into the final root without deleting or modifying the
nested rollback source.

## Promotion result

| Item | Result |
| --- | --- |
| Independent Git root | `E:/XS/Xyric Solutions LLP/prototype_ERP` |
| Branch | `main` |
| Commits created | 0 |
| Promotion source files | 371 |
| Files copied byte-for-byte | 370 |
| File-level collisions | 1 |
| Missing promoted files | 0 |
| Promoted hash mismatches | 0 |

The only collision was `.gitignore`. It was merged explicitly rather than
overwritten. The final ignore rules protect:

- `.superpowers` preservation artifacts;
- the temporary nested `prototype` rollback copy;
- dependencies and package-manager caches;
- Next.js/Vite/Vinext/TypeScript build output;
- test, coverage, Playwright, work, output, and temporary artifacts;
- local environment files, certificates, and logs;
- Python environments and caches, which are not part of the final runtime.

`.env.example` remains trackable. No `.env`, `.env.local`, or
`.env.demo-production.local` exists at the final root.

## Final root contents

The active source layout is now directly under the final root:

- `app` — approved prototype interface source;
- `apps/web` — Next.js production host;
- `apps/api` — Node.js/Express API;
- `apps/worker` — BullMQ worker;
- `packages/*` — authentication, contracts, database, domain, observability,
  and test packages;
- `tests` — automated verification suites;
- `docs` and `segments` — plans, evidence, and product documentation;
- root package, TypeScript, Docker Compose, OpenAPI, lint, formatting, database,
  and test configuration.

Workspace discovery from the final root reports package
`nexora-hr-payroll`, npm 11.13.0, and workspaces `apps/*` and `packages/*`.

## Rollback preservation

The original nested application remains at:

`E:\XS\Xyric Solutions LLP\prototype_ERP\prototype`

It is ignored by the new independent repository and was not moved, changed, or
deleted. The path must remain until C2 proves that the promoted root installs,
builds, tests, and runs correctly and the user separately approves cleanup.

The C0 source/database/Redis preservation checkpoint also remains intact and
ignored. The C1 copy map is stored at:

`.superpowers/preservation/C1-20261009T154500PKT/promotion-map.json`

## Git host compatibility

The sandbox account created `.git`, while the project directory is owned by the
interactive Windows account. Windows denied the attempted `.git` ownership
change, and no ACL was changed. Git's supported exact-path mitigation was used:

`safe.directory = E:/XS/Xyric Solutions LLP/prototype_ERP`

The trust entry is limited to this repository. Host Git now resolves the root
and `main` branch correctly. No remote, staging operation, or commit was added.

## Source and data safety

- `Nexora-ERP` was not modified.
- The existing `nexora_demo_v2` PostgreSQL database was not changed.
- PostgreSQL and Redis volumes were not moved or deleted.
- No migrations or application tests ran in C1.
- No cache, duplicate source, or rollback artifact was deleted.
- The parent repository was not edited or reconfigured.

## C2 gate

C2 may start only after approval. It must install from the promoted root's
lockfile, run all baseline static/build/test gates, start the target services,
and compare the rendered application with the approved UI. Only after that
evidence passes may an exact reproducible-cache deletion list be proposed.

