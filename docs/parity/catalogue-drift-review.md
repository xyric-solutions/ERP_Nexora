# Prototype Catalogue Drift Review

- Decision date: 2026-10-06
- Status: approved
- Source of truth: `app/prototype-data.ts`
- Generated manifest: `docs/parity/prototype-manifest.json`

## Decision

Freeze the live catalogue at **35 modules, 146 groups, and 792 pages**. The
change from the prior asserted baseline of 35 modules, 141 groups, and 749 pages
is intentional and belongs to the approved HR Phase 5 reporting scope.

## Reconciliation

The retained patch at `tmp/phase5-navigation.patch` explains the complete
difference:

| Change | Group delta | Page delta |
|---|---:|---:|
| Add Finance / Payroll Dashboard to HR People | 0 | +1 |
| Add HR Reporting, Compliance & Audit group | +1 | +3 |
| Replace six legacy HR reports with 45 governed reports | +4 | +39 |
| Rename HR & Payroll Reports to HR & Payroll Report Centre | 0 | 0 |
| Total | **+5** | **+43** |

The 45 governed reports are divided into HR, Attendance, Leave, Payroll, and
Payroll Accounting groups. Their definitions, permissions, source composition,
and reporting tests exist in `app/hr-reporting-data.ts` and
`tests/hr-reporting-phase5.test.mjs`.

## Approval basis

The owner approved full HR and Payroll scope, including reporting, statutory
configuration, payroll accounting handoff, and secure exports, during the
2026-10-06 design review. Removing these entries would contradict that scope
and the approved production design.

Future catalogue changes must update the generated manifest and parity register
in the same review. A count change by itself is not approval; the semantic diff
must be documented.
