# C2 Final-Root Baseline Verification

Date: 2026-10-09  
Status: automated baseline passed; manual Browser and configured full-stack gates remain blocked

## Scope and safety

All verification ran from the independent final root:

`E:\XS\Xyric Solutions LLP\prototype_ERP`

The retained nested `prototype` directory was not edited or deleted. The existing
Demo PostgreSQL database, Redis service, Docker volumes, and C0/C1 preservation
artifacts were not migrated, reset, or modified.

## Final-root corrections

Three baseline defects were corrected without changing production behavior:

1. Nine promoted `tsconfig.tsbuildinfo` files were removed. They were stale,
   reproducible compiler caches that referred to package outputs which did not
   exist at the promoted root and caused `TS6305` on the first type check.
2. `tests/rendered-html.test.mjs` no longer requires the repository directory to
   be literally named `prototype`. It verifies the final monorepo workspace
   contract instead.
3. The session and MFA integration fixtures now begin at the actual test-start
   time instead of the expired fixed date `2026-10-07`. The prior clock made the
   HTTP test client reject already-expired cookies. Production session code and
   timeout policy were not changed.

## Automated verification

| Gate                                | Result                   |
| ----------------------------------- | ------------------------ |
| Clean dependency restore (`npm ci`) | PASS; 711 packages added |
| Format                              | PASS                     |
| ESLint                              | PASS                     |
| TypeScript project build            | PASS                     |
| Next.js production build            | PASS                     |
| Unit                                | PASS; 53/53              |
| Contract                            | PASS; 6/6                |
| Security                            | PASS; 4/4                |
| Performance                         | PASS; 2/2                |
| PostgreSQL integration              | PASS; 30/30              |
| Legacy regression                   | PASS; 163/163            |
| Accessibility                       | PASS; 2/2                |
| Automated Chromium E2E              | PASS; 8/8                |
| OpenAPI drift                       | PASS                     |
| Production dependency audit         | PASS; 0 vulnerabilities  |

The E2E run covered all 67 HR desktop screens, seven representative mobile
screens, and recruitment, attendance, payroll, and separation keyboard journeys.

The full `npm test` aggregate gate passed after the focused corrections. The
isolated integration stack used PostgreSQL on port 55433, Redis on 56380, and
MinIO on 59000. Its database contained 25 public tables and all 5 final-root
migrations. The temporary containers and network were removed after testing.

## Dependency findings

The production-only audit reports zero vulnerabilities. The full audit reports
19 development/build-tool findings: 15 high and 4 moderate. They are in tooling
chains involving `braces`, `esbuild`, `image-size`, `sharp`, `undici`, `vite`,
and `ws`. npm's proposed fixes require breaking or out-of-range upgrades.

No forced audit fix was applied. These findings should be handled in a separate,
controlled dependency-upgrade phase after consolidation rather than mixed into
the root promotion.

## Existing source database verification

The existing source services remain healthy:

- PostgreSQL container: `nexora-demo-v2-postgres-demo-1`, port 55434;
- Redis container: `nexora-demo-v2-redis-demo-1`, port 56379;
- database: `nexora_demo_v2`;
- public tables: 139;
- `nexora_schema_migration` rows: 35.

The C2 migration command targeted only the isolated `nexora_test` database. No
command pointed the final-root migration runner at `nexora_demo_v2`.

## Manual Browser gate

The final-root web application started successfully at
`http://127.0.0.1:3000`. The approved in-app Browser workflow could not initialize:

`Cannot redefine property: process`

The installed Browser client exists at the expected bundled plugin path, but
runtime setup fails before it creates `agent.browsers`; therefore no genuine
backend discovery result or approved manual screenshot evidence can be produced
in this host session. The vendor runtime was not patched, and standalone
Playwright was not substituted for the required manual Browser evidence.

Resolution requires a compatible Browser plugin/runtime pair and a new/restarted
host session that can initialize the bundled Browser client. After restart,
setup must create `agent.browsers`, select a backend for the local URL, and return
that backend's documentation before manual verification continues.

## Configured full-stack gate

The final root intentionally has no `.env`. `compose.yaml` requires operator-set
PostgreSQL, session/authentication, MinIO, and object-store secrets, and the API
configuration currently still requires MFA configuration. Inventing values or
copying unknown credentials would violate the consolidation safety rules.

Consequently, the web application was started and tested, and API behavior was
verified through the isolated PostgreSQL integration suite, but the persistent
API/worker/web Compose stack was not started. A reviewed final-root environment
mapping is required before that gate can run. The active `/auth/mfa` route and
MFA configuration are also known to conflict with the approved password/session
architecture and must be removed in the planned authentication consolidation,
not silently during C2.

## Exact cleanup proposal

No cleanup was performed in C2. After approval, the following generated artifacts
inside the retained nested rollback tree can be removed without deleting source:

| Path                     |       Size |
| ------------------------ | ---------: |
| `prototype/node_modules` | 774.89 MiB |
| `prototype/.next`        |  <0.01 MiB |
| `prototype/.vinext`      |   0.32 MiB |
| `prototype/.wrangler`    |  <0.01 MiB |
| `prototype/dist`         |   7.35 MiB |
| `prototype/output`       |   0.25 MiB |
| `prototype/test-results` |  <0.01 MiB |
| `prototype/tmp`          |   0.01 MiB |
| `prototype/work`         |   8.33 MiB |

Total proposed generated-artifact recovery: 829,573,396 bytes (approximately
791.14 MiB).

## Approved cleanup result

After explicit approval, only the listed reproducible nested outputs were
removed from `prototype\`: `node_modules`, `.next`, `.vinext`, `.wrangler`,
`dist`, `output`, `test-results`, `tmp`, and `work`.

- Recovered size: 829,573,396 bytes (approximately 791.14 MiB).
- Every target path was resolved and verified to remain inside the nested
  prototype directory before removal.
- All listed paths were confirmed absent afterward.
- The nested prototype source, final-root source, C0 preservation artifacts,
  source PostgreSQL data, Docker data, and `Nexora-ERP` were not removed or
  modified.
- Removed items were generated/reproducible and were permanently deleted; they
  can be recreated from the retained source and lockfiles.

The nested `prototype` source tree itself remains the rollback copy and should
not be deleted until the Browser gate and configured full-stack gate pass and a
separate exact deletion approval is given. The active root `node_modules` must
be retained for development.

## C2 verdict

The promoted final root is buildable and passes every executable automated gate.
C2 is not fully accepted because the approved manual Browser workflow cannot
initialize and the configured persistent stack lacks reviewed environment
secrets. Consolidation should pause at this gate; C3 should not begin until the
user accepts the documented limitations or the two prerequisites are resolved.

The user subsequently accepted these documented limitations, approved the
exact generated-artifact cleanup above, and explicitly authorized the read-only
C3 mapping phase. That approval did not convert either limitation into a pass;
the Browser evidence and configured-stack gates remain required in the phase
where the affected production behavior is implemented.
