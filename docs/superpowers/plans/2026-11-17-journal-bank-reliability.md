# Journal and Bank reliability implementation

Approved scope: `../specs/2026-11-17-journal-bank-reliability-design.md`.
The writing-plans skill is unavailable in the installed skill directories; this
repository plan records the implementation and verification steps directly.

1. Project date-only Journal/recurring values as SQL text. Add Karachi and UTC
   regression coverage, including posting dates and month boundaries.
2. Add a read-only company/date eligibility contract and API using existing base
   currency and period authority. Preserve authoritative posting-time checks.
3. Integrate preview and submitted-state feedback into existing editor/detail/
   approval surfaces. Preserve review, permissions and safe lifecycle retries.
4. Verify posted Journal effects through real Bank directory/detail/summary,
   replay/reversal and scoped access on disposable data. Add API/UI coverage.
5. Generate contracts/client, run focused tests, typecheck/lint, production builds,
   theme audit and responsive/accessibility checks. Inspect the final diff.
6. Activate only this compatible Journal/API repair without migrations or owner
   financial writes. Verify live read-only data and unchanged period status.
   Update runbook/migration log; commit and push to `shoaib_nexora`.

No owner Journal posting, November reopening, role grants, historical rewrites or
unrelated pending Purchase/Assets migrations are part of this batch.

Completed on 17 November: all six steps, including both timezone regressions,
65 unit/7 contract/10 Chromium tests, both builds and 12 preview plus 12 live
read-only acceptance cases. The broader integration backlog remains in the audit.
