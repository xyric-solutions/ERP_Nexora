# C0 Recovery Manifest

Captured: 2026-10-09  
Preservation root:
`E:\XS\Xyric Solutions LLP\prototype_ERP\.superpowers\preservation\C0-20261009T101500Z`

## Handling classification

The preservation root is ignored by the current `prototype_ERP\.gitignore`.
It contains source patches, an ignored local environment file, credential
hashes, personal/business data, and database backups. Do not commit, publish,
email, or place it in a shared artifact store without secret-management and
data-owner approval.

## Artifact map

| Artifact | Source represented | Verification | Recovery use |
| --- | --- | --- | --- |
| `git/nexora-erp-working-tree.patch` | 86 modified tracked files in `Nexora-ERP` | Reverse apply check passed | Apply to the matching reference HEAD only after review |
| `git/nexora-erp-index.patch` | Staging area | Zero bytes, matching zero staged files | Evidence only |
| `git/nexora-erp-untracked-files.tar` | 86 untracked reference files | Archive count equals manifest count | Extract at reference root without overwriting reviewed files |
| `git/nexora-erp-local-state.tar` | `.env.demo-production.local`, `var`, `tmp` | Archive listing readable | Restricted local-state recovery |
| `manifests/nexora-erp-*.txt/json` | Git/path/hash state | Counts and SHA-256 captured | Compare before any recovery |
| `manifests/prototype-erp-source-sha256.json` | 575 non-generated final/nested source files | SHA-256 per file | Detect drift or missing promotion inputs |
| `database/nexora-c0-globals.sql` | PostgreSQL roles/globals | Completion and copy hash verified | Restore globals with an approved PostgreSQL administrator |
| `database/nexora-c0-cluster.sql` | Full PostgreSQL logical cluster | Completion and copy hash verified | Full logical recovery in an isolated target |
| `database/nexora-c0-nexora-demo-v2.dump` | `nexora_demo_v2` schema/data | `pg_restore --list` passed | Preferred database restore artifact |
| `database/nexora-c0-nexora-demo-v2-schema.sql` | Database schema | Completion and copy hash verified | Schema inspection/recovery |
| `redis/nexora-c0-redis.rdb` | Logical Redis point in time | `redis-check-rdb` passed | Restore only to a stopped/isolated Redis target |
| `redis/nexora-c0-redis-data.tgz` | Redis AOF/RDB directory | Copy hash verified | Exact local data-directory recovery |
| `artifact-sha256.json` | Preservation artifact hashes | Generated after backup | Integrity check before use |

## Safe verification commands

Run from `prototype_ERP` and substitute the preservation path only after
confirming it is the intended C0 checkpoint:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '<artifact>'
tar.exe -tf '.superpowers\preservation\C0-20261009T101500Z\git\nexora-erp-untracked-files.tar'
docker exec nexora-demo-v2-postgres-demo-1 pg_restore --list /tmp/nexora-c0-nexora-demo-v2.dump
docker exec nexora-demo-v2-redis-demo-1 redis-check-rdb /tmp/nexora-c0-redis.rdb
```

These commands inspect artifacts. They do not restore or overwrite data.

## Recovery procedure constraints

1. Stop and identify the exact target repository or disposable database.
2. Verify the target HEAD/schema and every artifact SHA-256.
3. Restore into a disposable isolated target first.
4. Reconcile counts, migration ledger, tenant/company boundaries, and sampled
   records before considering an authoritative restore.
5. Never extract archives over unreviewed user changes.
6. Never replace a live PostgreSQL/Redis volume directly from these artifacts.
7. An authoritative restore, Docker-volume replacement, or source overwrite
   requires a separate explicit approval.

## C1 prerequisites

Before C1 begins:

- re-run repository status and source hashes and report any drift;
- confirm the preservation root and backups still exist;
- keep `Nexora-ERP` and both Docker volumes untouched;
- approve independent Git initialization at `prototype_ERP`;
- approve the explicit `.gitignore` merge;
- decide separately whether the parent repository should ignore the new nested
  repository. C1 must not edit the parent repository implicitly.

