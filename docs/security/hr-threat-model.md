# HR and Payroll Threat Model

- Status: Wave 0 baseline
- Method: asset, trust-boundary, and abuse-case review

## Primary assets

Employee/candidate identity, CNIC, bank and tax data, documents, attendance,
leave, compensation, payroll calculations, bank files, accounting events,
credentials/MFA, approvals, and audit evidence.

## Trust boundaries

1. Browser to Next.js/Express over HTTPS.
2. Express/worker to PostgreSQL, Redis, and private object storage.
3. Attendance files/devices into the import boundary.
4. Bank export/download and confirmation import.
5. Payroll accounting events to Finance.
6. Migration sources into quarantine and staging.

## Priority abuse cases and controls

| Abuse case | Required control |
|---|---|
| Cross-company or insecure direct-object access | Central scope evaluator, non-guessable IDs, negative API tests, audited denials |
| Payroll maker approves or pays own batch | Configurable segregation of duties and distinct-actor checks |
| Salary/CNIC/bank data leaks through lists, logs, errors, exports, or caches | Field permissions, masking, redaction, no-store policy, export authorization and audit |
| Employee history is overwritten or deleted | Effective-dated rows, append-only events, database constraints, reversal/cancellation |
| Duplicate punch, payroll, payment, or Finance event after retry | Source/idempotency keys, uniqueness constraints, immutable snapshots, outbox/inbox |
| Formula or import content executes code | Restricted parser, schema validation, no dynamic evaluation, quarantine and malware scan |
| Stale approver acts after policy or record changes | Captured workflow version, optimistic concurrency, step authorization at action time |
| Attacker downloads a guessed object key | Private bucket, signed short-lived access, authorization before signing, checksum/audit |
| Privileged administrator suppresses evidence | Audit in same transaction, append-only permissions, integrity checks, external monitoring |
| Worker or database failure creates partial money state | PostgreSQL transaction, persisted job state, retry classification, reconciliation gates |

## Required security verification

Every production module must test unauthenticated, unauthorized, wrong-company,
wrong-branch, self/reporting-line, restricted-field, stale-update, duplicate
retry, document/export, and audit behavior. No critical or high finding may
remain unresolved at release.
