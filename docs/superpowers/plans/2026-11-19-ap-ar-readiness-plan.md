# AP/AR readiness implementation checkpoints

Approved design: `../specs/2026-11-19-ap-ar-readiness-design.md`.
Baseline: `030c23d`. Preserve unrelated environment/lockfile edits and the
matched Phase 1 live runtime. Use isolated PostgreSQL for implementation tests.

- [x] Correct independent tax fixture identities and bank company-currency setup;
      rerun tax integration and standalone reconciliation browser tests.
- [x] Add an additive Finance migration for append-only party configuration,
      immutable due schedules and scoped grants/guards; no business backfill.
- [x] Extend existing contracts, independent API, repository and generated client
      for versioned terms/credit setup, readiness and dimensions.
- [x] Enforce exact functional-currency credit exposure at lifecycle boundaries,
      using current configuration and serialized posting; retain valid receipts
      and historical reversals.
- [x] Correct installment aging with immutable new-posting schedules and oldest
      due allocation; preserve legacy records and existing report APIs.
- [x] Extend existing setup/document UI; verify current routes and semantic theme.
- [x] Add contract, PostgreSQL and frontend regressions for permissions, stale
      configuration, concurrency, credit, terms, dimensions and AP note direction.
- [x] Complete independently authenticated AR/AP posting-to-reconciliation browser
      journeys with scoped database and financial-report assertions.
- [x] Rehearse migration against restored real records; compare history/balances
      and rerun migrations idempotently. Keep live values unchanged until approved.
- [x] Run required builds/types/API drift/regression/theme checks, review diff,
      document actual results and outstanding business acceptance blockers.

Verified results: 1,630 unit, 266 financial integration, 63 security, 27 contract
and 7 authenticated browser tests passed. Production build/type/drift/theme,
changed-test compilation, targeted lint/format and diff checks passed. Finance 43
was rehearsed against a restored fresh business backup and applied with all 363
original table fingerprints and posted balances preserved. Matched API/web build
`nXe0dnHNr_y0YWqWMezFO` passed live read-only runtime verification.

Owner business acceptance remains open: approved account mappings, master/term/
credit/tax configuration, opening-balance review and existing-bill/payment cutover
must precede owner-authorized live posting. These were not invented or backfilled.
See `../../architecture/ap-ar-readiness-phase2.md` for evidence and limitations.
