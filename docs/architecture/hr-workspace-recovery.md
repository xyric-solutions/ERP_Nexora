# HR workspace recovery - 22 October 2026

Nexora work belongs in this ERP repository. 46 confirmed ERP-only staging/evidence folders and 15 ERP runtime/log files (2824 files, 96222546 bytes) were moved from the sibling Prompt Intel folder into [tmp/recovered-hr-work](../../tmp/recovered-hr-work/README.md). Every original file passed SHA-256 verification after relocation. Old folder references in 22 archived helpers and two architecture documents were repaired and recorded.

## Active modules and preserved history

The live modules were already installed in this repository. The move preserves their current implementation; older staging copies are retained as history rather than copied over newer source.

| Ownership | Canonical location |
| --- | --- |
| HR screens and shared controls | [app/features/hr](../../app/features/hr/) |
| HR API and business rules | [server/api/src/modules/hr](../../server/api/src/modules/hr/) |
| API schemas and generated client | [packages/contracts/src/hr](../../packages/contracts/src/hr/) and [generated client](../../app/lib/api/generated.ts) |
| HR database migrations | [packages/db/source-migrations/hr](../../packages/db/source-migrations/hr/) |
| API/integration and unit verification | [tests/integration](../../tests/integration/) and [tests/unit](../../tests/unit/) |
| HR delivery status | [HR backend delivery plan](hr-backend-delivery-plan.md) |
| Recovered installers, screenshots and browser evidence | [recovery index](../../tmp/recovered-hr-work/README.md) |

The local archive includes an original inventory, checksums, completed-move list, reference-repair log and module map. It is excluded from version control, container builds, formatting and lint input because historical scripts can include private local configuration. It is not imported by the application. Consumed installer scripts and old migration preflights must not be executed. Applied migrations, business data, normal environment files and the other developer's Banking/Finance source were preserved.

Some historical ERP artifacts were tracked by the Prompt Intel repository. Their removal now appears as source-repository deletions; no Git staging or commits were performed. The ERP's own source remains at its existing canonical paths.

## Start the local services

Open terminals in this ERP repository and run:

```powershell
cd "D:\Xyric Work\ERP_Nexora"
npm.cmd run local:api
```

```powershell
cd "D:\Xyric Work\ERP_Nexora"
npm.cmd run local:web
```

The [repository-owned launcher](../../scripts/run-local.mjs) resolves the ERP root from its own file location, loads the existing ERP .env and preserves the previous local Docker mappings: PostgreSQL 55435, Redis 56380, object storage 59000, API 4000 and web 3000. API/worker use compiled output; run npm.cmd run typecheck after server source edits. These local commands assume the existing development containers are running. Standard dev:api/dev:web and deployment commands retain their behavior. No database migration or seed runs implicitly. The normal launcher does not depend on the recovered archive.

Check its resolved root without starting a second service:

```powershell
node scripts/run-local.mjs api --check
```

## Verification

Final recovery verification is recorded in [verification.json](../../tmp/recovered-hr-work/verification.json), including source preservation and reference checks. This relocation does not change HR screen completion status or enable unfinished Banking integration.
