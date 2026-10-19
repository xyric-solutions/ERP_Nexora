# C0 Repository Inventory

Captured: 2026-10-09  
Scope: read-only repository and source-layout inventory before consolidation

## Repository ownership

| Item | Finding |
| --- | --- |
| Intended final root | `E:\XS\Xyric Solutions LLP\prototype_ERP` |
| Current Git root for intended final root | `E:\XS\Xyric Solutions LLP` |
| Parent branch / HEAD | `master` / `c03d26e33c843e5c7e201087107c9e0928aeca37` |
| Parent remote | None reported by `git remote -v` |
| `prototype_ERP\.git` | Absent |
| Nested `prototype\.git` | Absent |
| Reference repository | `E:\XS\Xyric Solutions LLP\Nexora-ERP` |
| Reference branch / HEAD | `main` / `91db05fb68d624f289d9bff8c22eaddf94b44abc` |
| Reference remote | `origin` → `https://github.com/xyric-solutions/Nexora_ERP.git` |
| Submodules | None reported in either repository |

`prototype_ERP` is not currently an independent repository. The parent
repository sees its content as untracked because there is no `.git` directory
inside `prototype_ERP` and the parent repository does not track this tree.

The parent working tree reported 1,564 status entries when untracked files were
expanded. This count covers the wider `E:\XS\Xyric Solutions LLP` repository,
not only Nexora, so it must not be cleaned or rewritten as part of consolidation.

## Reference repository working state

| State | Count |
| --- | ---: |
| Tracked files | 1,240 |
| Modified tracked files | 86 |
| Staged files | 0 |
| Untracked files | 86 |
| Ignored entries reported by expanded status | 79,349 |

The ignored count is dominated by reproducible environments and build output,
including `web` dependencies/output, the Python virtual environment, prototype
dependencies, caches, bytecode, and temporary files. Important ignored local
state was handled separately instead of treating all ignored files as disposable.

Preserved reference artifacts:

- binary working-tree patch: 869,364 bytes;
- empty index patch proving no staged delta at capture time;
- 86-entry untracked archive and per-file SHA-256 manifest;
- local-state archive containing `.env.demo-production.local`, `var`, and `tmp`;
- tracked, untracked, status, source, and artifact checksum manifests.

`git apply --check --reverse` against the current reference working tree exited
zero, proving that the captured binary patch represents the current tracked
changes. The untracked archive contains the same 86 files as its manifest.

## TypeScript source layout

The intended TypeScript monorepo is currently nested at:

`E:\XS\Xyric Solutions LLP\prototype_ERP\prototype`

| Measurement | Result |
| --- | ---: |
| Entire `prototype_ERP` files | 42,637 |
| Entire `prototype_ERP` size | approximately 1,056 MB |
| Promotion source files after generated-output exclusions | 371 |
| Root-owned source/evidence files outside the nested app | 204 |
| Combined C0 source/hash manifest | 575 files |

The nested tree contains the approved UI plus `apps/web`, `apps/api`,
`apps/worker`, shared packages, migrations, tests, contracts, Docker Compose,
and the npm lockfile. Reproducible or generated directories include
`node_modules`, `.next`, `.vinext`, `.wrangler`, `dist`, `output`, `test-results`,
`tmp`, and `work`.

The largest nested item is `node_modules` at approximately 774.89 MB and 39,859
files. No cache or generated output was deleted during C0.

## Promotion collision scan

The 371-file promotion source produced one existing target-file collision:

| Target | Result |
| --- | --- |
| `.gitignore` | Different content; requires an explicit merge in C1 |

No other file-level collision was found. The root and nested trees both contain
`docs` directories, but their current file paths do not collide. C1 must still
copy path-by-path and recheck drift immediately before promotion.

The only reparse points found are npm workspace junctions under
`prototype\node_modules\@nexora`. They are generated dependency links and must
not be copied as source.

## Git safety findings

- Do not clean, reset, move, or rewrite the parent repository.
- Do not modify `Nexora-ERP`; it remains the read-only behavior reference.
- C1 requires explicit approval to initialize `prototype_ERP` as an independent
  repository and to merge the two `.gitignore` files.
- If parent-repository noise must be suppressed, a parent ignore change requires
  separate approval because the parent contains unrelated user data.
- Git emitted a host warning because the sandbox cannot read
  `C:\Users\LENOVO\.config\git\ignore`. Repository-local status and manifests
  were still produced; the inaccessible global ignore file was not changed.

## Preservation location

Sensitive/binary preservation artifacts are stored under the existing ignored
directory:

`E:\XS\Xyric Solutions LLP\prototype_ERP\.superpowers\preservation\C0-20261009T101500Z`

No secret values are included in this report.
