# Purchase / Bank integration implementation

Approved design: [source and reporting design](../specs/2026-11-18-purchase-bank-reporting-integration-design.md).

1. Extend the existing AP operation contract with a source-owned Purchase payment
   group. Keep one operation, approval snapshot and atomic journal for the whole
   instruction. Reuse settlement/recognition previews and the existing deferred
   control-account reconciliation invariant. Add immutable source uniqueness and
   support multiple advance items within that same operation.
2. Add authorized preparation/status endpoints, source validation and explicit
   accounting mappings. Show preparation and Finance review from Purchase details;
   retain independent approval and do not post historical instructions.
3. Correct reservations against posted AP events, expose source-owned Bank outgoing
   movements, and implement persistent adapters for all 17 specified report routes.
   Keep existing live statement, ageing and financial reports.
4. Test source lifecycle, atomicity, exact cash/AP effects, reversals, permissions,
   concurrency, dated reports and exports in disposable databases. Run contracts,
   types, lint, theme and production builds.
5. Back up the local business database inside ignored tmp/backups; verify a restore
   and the exact additive migration chain before guarded API/web activation. Check
   owner records, periods and setup blockers without posting or granting roles.

The brainstorming design gate is satisfied by the owner's approval. Its referenced
writing-plans skill is absent from the installed skill directories; this plan
records the implementation sequence using the repository's existing conventions.

## Completed verification and release boundary

Steps 1–4 are complete. Exact source-owned posting, failure rollback/retry,
withholding, discounts, advances, fees, FX, reversal, company/role/version gates,
dated reports and source references are covered by the final five-suite
integration run (81 passed). Focused units (5), contracts (23), Bank database
security tests (11), typecheck, generated API check, touched-file ESLint, theme
write/check and production build passed. Browser verification passed 29 checks
across all 17 routes with no business writes or page errors, including twelve
responsive/theme/Axe cases plus CSV, print and focus refresh.

Commands run:

- `npm.cmd run test:integration -- tests/integration/purchase-bank-integration.test.ts tests/integration/multi-currency-subledger.test.ts tests/integration/procurement-workflow.test.ts tests/integration/tax-management.test.ts tests/integration/banking-reconciliation-authority.test.ts`
- `npm.cmd run test:unit -- tests/unit/connected-report-export.test.ts`
- `npm.cmd run test:contract`
- `npm.cmd run test:security -- tests/security/bank-reconciliation-database-security.test.ts tests/security/bank-payment-database-security.test.ts` (local disposable bootstrap database configured)
- `npm.cmd run typecheck`; `npm.cmd run api:check`
- `node node_modules/eslint/bin/eslint.js <changed TypeScript files excluding generated client>`
- `node scripts/audit-ui-theme.mjs --write`; `node scripts/audit-ui-theme.mjs --check`
- `$env:NEXT_DIST_DIR='tmp/purchase-bank-release-build'; npm.cmd run build:web`
- `node tmp/purchase-bank-integration/verify-browser.mjs` (concealed sign-in; restored database)
- `git diff --check`

Step 5 backup/restore rehearsal is complete. The archive SHA and exact migration
hashes are recorded locally in `backup-verification.json`. The restored rehearsal
applied Finance40, Procurement6–7 and FixedAssets3–7 while preserving 325 existing
table fingerprints. Live database/services are unchanged. A renewed boundary
concern prompted a required choice between source-only push and local activation;
activation is held until that response. Do not post historical payments or grant
Finance roles as part of release verification.

Automatic approval review rejected the optional automatic Finance supplier-party
creation proposal before execution. No such code was applied. Explicit real
supplier linking remains required, as specified in the approved design.
