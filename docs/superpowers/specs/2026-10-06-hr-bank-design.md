# HR-BANK Governed Payroll Payment Design

Status: approved by owner on 2026-10-06

## Boundaries

- Payroll owns sealed results and payment amounts.
- Finance owns the posted journal and company bank master.
- Payment owns validation, batch lifecycle, approval, export, submission status and reconciliation.
- The encryption layer owns protected bank-data encryption/decryption.
- Export adapters own file formatting. The initial adapter is ISO 20022 `pain.001.001.09`; bank/Raast profiles remain separate adapters.

## Data authority

The existing `employee_bank_account` authority is extended with company, currency, effective dates, masked IBAN, blind index and envelope-encryption fields. The existing Finance `bank_account` remains the company bank authority. An effective-dated payment-export profile references it and stores only the encrypted payment credential needed by the adapter.

Existing Payroll payment tables are extended instead of replaced. A batch snapshots Payroll result IDs, result hashes, amounts, currency, employee bank authority and masked beneficiary data. Payment amounts are never editable.

Immutable export evidence stores profile/version, message type, generation time, count, total, currency, SHA-256 file hash, maker/checker evidence, encrypted XML payload and lifecycle/reconciliation state. It never stores plaintext IBAN columns.

## Encryption

`BankDataProtector` uses PyCA `AESGCM` with 256-bit keys. Each value uses a random 256-bit data key and 96-bit nonce. The data key is wrapped by the configured current key-encryption-key version using a separate nonce. Associated data binds ciphertext to tenant, entity and field. Old configured key versions remain decryptable after rotation. Authentication-tag failure, missing key or malformed envelope fails closed.

Production configuration supplies a JSON versioned keyring, a current key version and a separate blind-index key through secret injection. Test keys are defined only inside isolated tests.

## Lifecycle

1. Configure an approved effective export profile against an active Finance bank account.
2. Create a payment batch only from a posted Payroll period and sealed current-run results.
3. Validate employee bank authority, Pakistan IBAN, currency, result hash, Finance journal and profile.
4. Maker submits; a different authorized checker approves.
5. Export exactly once through the configured adapter and seal encrypted file evidence.
6. Record submitted, then paid/failed/rejected. Paid totals must reconcile to the Payroll batch and posted Finance journal.
7. Retries are idempotent; duplicate batch/export/payment obligations are rejected.

Legacy `confirmed` payment records remain readable and are never rewritten.

## Finance approval

Payroll preparation may create a Finance approval request through the existing Workflow authority. High-value posting supplies the approved instance to the existing Finance `PostingService`; thresholds are not lowered or bypassed. The proposal creator cannot self-post above the existing segregation-of-duties threshold.

The binding between a new Payroll journal proposal, its Finance draft and the existing Workflow approval instance is stored in the immutable, FORCE-RLS `hr_payroll_finance_approval_binding` authority. It is deliberately separate from `hr_payroll_journal_proposal`: the historical proposal table keeps its exact serialized structure, so adding the Phase B handoff cannot change sealed September evidence or its aggregate fingerprint. The binding stores opaque Finance/Workflow identifiers and validates those authorities at the service boundary rather than duplicating either engine.

## API and UI

Existing Payroll payment routes remain. Narrow routes add masked employee-bank configuration, export profiles, export metadata and authorized XML retrieval. Responses never include ciphertext, wrapped keys, nonces, blind indexes or full IBANs. The existing Payroll workspace gains configuration, validation, approval, export and reconciliation controls without visual redesign.

## Failure behavior

Missing keys, invalid/tampered ciphertext, invalid IBAN, unavailable bank authority, currency mismatch, unposted Payroll/Finance, unapproved profile/batch, duplicate obligations, invalid amount, incomplete fields and invalid transitions return stable fail-closed errors. No partial XML file is persisted or returned.

## Verification

Unit tests cover cryptography, rotation, tampering, IBAN and XML vectors. PostgreSQL tests cover constraints, RLS/FORCE RLS, lifecycle, immutability, audit, idempotency, reconciliation and historical invariants. API/UI tests cover permissions, masked responses, actions, download and blockers. Full Phase B regression includes backend, HR/Finance PostgreSQL, migration, security, frontend, accessibility, E2E, TypeScript, ESLint, API drift, build, portability and September fingerprints.
