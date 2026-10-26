# Bank Statement Parser Dependency Review

BR-03 adds three narrow runtime dependencies to `@nexora/api`:

| Package     | Pinned version | License | Purpose and containment                                                                                                                                            |
| ----------- | -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `csv-parse` | `7.0.3`        | MIT     | Streaming CSV tokenization. The application still owns byte, record, row, column, cell, encoding and deadline limits.                                              |
| `yauzl`     | `3.4.0`        | MIT     | Lazy ZIP entry access for XLSX. Entries are preflighted for traversal, encryption, duplicates, count, size, expansion and compression ratio before XML processing. |
| `saxes`     | `6.0.0`        | ISC     | Event-driven XML parsing. DTD/entity declarations and external relationships are rejected before workbook data is accepted.                                        |

`@types/yauzl` `2.10.3` is development-only. `exceljs` was not selected because
BR-03 needs a constrained one-sheet reader rather than a broad workbook
implementation and dependency tree.

The dependency install initially reported no vulnerabilities. The final
`npm audit --omit=dev` run on 2026-10-23 reported one critical advisory against
the repository's existing Next.js 16.3.8 dependency; none of the parser
packages above were named. The suggested Next.js upgrade is outside BR-03 and
was not applied. Spreadsheet formulas are never evaluated; only cached values
are read as inert text.

## Runtime limits and retention

- Statement files are limited to 25 MiB, 1,000 data rows, 64 columns and 4,000
  characters per cell. CSV records and XLSX archive expansion have additional
  independent bounds.
- The worker checks the private bucket during readiness. Its cleanup schedule,
  grace interval, page size and per-run object limit are configured by the
  `BANK_STATEMENT_CLEANUP_*` environment variables in `.env.example`.
- Cleanup deletes only old objects with no database reference, under a
  transaction-scoped advisory lock. Any referenced import, including rejected
  or finalized audit evidence, is retained. Stale database intents with a
  missing object are detected but are not silently mutated without an audited
  application actor.
