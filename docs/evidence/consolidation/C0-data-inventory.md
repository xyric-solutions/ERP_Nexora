# C0 Data Inventory and Backup Evidence

Captured: 2026-10-09  
Database: `nexora_demo_v2` on PostgreSQL 18.6

## Database baseline

| Measurement | Result |
| --- | ---: |
| Database size | 24 MB |
| Public base tables | 139 |
| Migration ledger rows | 35 |
| Tenants | 2 |
| Company legal profiles | 1 |
| Security users | 15 |
| Tenant roles | 39 |
| User-role assignments | 24 |
| Employees | 5 |
| Security audit events | 215 |

The database contains production-like platform, finance, workflow, security,
HR, attendance, leave, overtime, salary, payroll, payslip, payment, audit, and
localization tables. The complete table-estimate inventory is preserved as
`manifests/postgres-table-estimates.txt`.

## Migration state

The `nexora_schema_migration` ledger contains:

| Module | Applied versions |
| --- | --- |
| Finance | 1 |
| Platform | 1–6 |
| Workflow | 1 |
| Security | 1–5 |
| HR | 1–22 |

Security versions include dynamic authorization, authorization normalization,
governed authorization administration, and password/session assurance. HR
version 22 is organization-head assignment. The complete ordered ledger is
preserved as `manifests/postgres-migration-ledger.txt`.

## PostgreSQL backups

All files are under
`.superpowers/preservation/C0-20261009T101500Z/database` and must be treated as
sensitive because role and application data may include credential hashes or
personal data.

| Artifact | Purpose | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `nexora-c0-globals.sql` | Roles and cluster globals | 1,600 | `A8A3FEF04E0BFBD1CBADC96C7072DEB6F97B0B588E28159697E09609ED73B2B6` |
| `nexora-c0-cluster.sql` | Full logical cluster backup | 1,982,313 | `9752A51D808AA4A2BD1277D959D1F2A195CAA81F890D5AAC7DEF21D4F8A37E92` |
| `nexora-c0-nexora-demo-v2.dump` | Custom-format schema/data backup | 1,209,051 | `1E0B6594C1AAA358B2C46BBB2E32EF0B9F89BEB5523D3C19951B10E06999C856` |
| `nexora-c0-nexora-demo-v2-schema.sql` | Schema-only backup | 748,435 | `52AD8A3900924AFDC2D3013C6D36FBC0340983900C16EB37C1945A5B8EB5D16F` |
| `nexora-c0-restore-list.txt` | Custom dump table of contents | 167,294 | `B1D6CEDAE60B9A8DBBBFF1AD9F07E30B2ABAF39E29294370A3CC1CE07DFCEC01` |

Verification performed:

- `pg_dumpall` completed for globals and the cluster;
- `pg_dump` completed for schema-only and custom-format data;
- `pg_restore --list` read the custom archive and reported 1,650 TOC entries;
- completion markers exist in the SQL dumps;
- every copied database artifact SHA-256 matches its in-container source;
- PostgreSQL remained healthy and accepting connections afterward.

No restore was applied to the live database. A destructive or authoritative
restore requires a separately approved recovery operation.

## Redis backups

Artifacts are under
`.superpowers/preservation/C0-20261009T101500Z/redis`.

| Artifact | Purpose | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `nexora-c0-redis.rdb` | Point-in-time logical RDB | 173 | `EAD4271CEA3FBFA30F2684129BF76F71C87B3FEF14E8BAF091A68E8F1874DBDB` |
| `nexora-c0-redis-data.tgz` | Current Redis data-directory archive | 32,419 | `C0EB1709B102A306A5F3B07268A0EDC54E4F16F264C68ADC3374F66BC6639800` |

`redis-check-rdb` verified the checksum and reported zero keys. Both copied
artifact hashes match their in-container sources.

## Object storage

No MinIO container or named volume exists in the active Docker engine. No object
storage backup could therefore be produced. Before C2 uses MinIO, its bucket,
retention, credentials, and backup expectations must be verified.

## Data safety conclusion

- Existing PostgreSQL and Redis volumes remain in place and were not altered,
  reset, pruned, or deleted.
- Logical PostgreSQL role/schema/data backups are present and readable.
- Redis state is preserved and validated.
- No data migration or authorization change was executed.
- The C0 artifacts are sufficient to proceed to a controlled C1 root promotion,
  subject to explicit approval and continued retention of the original volumes
  and `Nexora-ERP` repository.
