# Bank Transfer missing company FX policy

## Status

Resolved on the named local UAT database on 2026-10-22.

## Symptoms

- Expected: Shoaib can create a same-company Bank Transfer using live local data.
- Actual: create is rejected with `TRANSFER_FX_POLICY_NOT_FOUND`.
- User-facing message: `Configure the company Transfer/FX policy before creating Transfers.`
- Scope: local `nexora_source_test`, tenant `nexora-r06-uat`, company
  `nexora-r06-uat-company` only.

## Evidence

1. Finance migration 0026 creates the governed `bank_transfer_fx_policy` table
   but deliberately inserts no company policy.
2. The implementation plan records policy selection as an environment rollout
   responsibility; it is not safe to invent a universal accounting policy.
3. The local database has a policy only for an isolated integration-test
   company, not for `nexora-r06-uat-company`.
4. Shoaib's local Transfer role has lifecycle permissions but is missing the
   company-scoped `finance.transfer_fx_policy.read` and
   `finance.transfer_fx_policy.manage` permissions.
5. The target company already has four active, postable, non-Bank nominals with
   no mandatory dimensions that are suitable for local UAT:
   - 420104 Other Income: FX gain
   - 720101 Other Expense: FX loss
   - 712101 Miscellaneous Expense: rounding
   - 710702 Bank Charges: bank charge

## Root cause

The Bank Transfer feature is correctly fail-closed. Access rollout granted the
Transfer lifecycle permissions, but local company provisioning did not create
the required company-specific Transfer/FX accounting policy or grant Shoaib
the two policy permissions. The create repository therefore rejects the request
before it can persist a financial transaction.

## Fix design

- Extend only Shoaib's dedicated local, company-scoped role with policy read and
  manage permissions; do not broaden the shared Super Administrator policy.
- Create the initial policy through `SourceFinanceCurrencyRepository.upsertPolicy`
  so normal server validation, tenant/company authorization, idempotency and
  immutable audit/event writes all run.
- Use a `0.01` rounding tolerance, matching the existing Transfer integration
  policy convention.
- Do not create or mutate a Bank Transfer.

## Verification plan

- Confirm all four referenced accounts remain active/postable/non-Bank.
- Confirm Shoaib has both live policy permissions for this company.
- Read the policy through the production repository.
- Confirm one policy event and its linked platform audit event exist.
- Confirm the Bank Transfer create precondition query now resolves the policy.

## Resolution

- Added `finance.transfer_fx_policy.read` and
  `finance.transfer_fx_policy.manage` to
  `policy-shoaib-bank-transfer-local`, scoped only to
  `nexora-r06-uat-company`.
- Created policy `transfer-fx-policy-15eb675d-856d-424b-829b-82fc3e291d5c`
  through `SourceFinanceCurrencyRepository.upsertPolicy` as Shoaib.
- The repository wrote audit event
  `currency-event-b3ee5fdc-0df2-4d53-97ce-1f8551662b4d` and the linked
  immutable policy event.
- Re-running the guarded setup reported `policy already exists` and preserved
  policy version 1.

## Verification result

- `bank_has_live_permission` is true for policy read, policy manage and Transfer
  create at the target company.
- Exactly one target-company policy exists at version 1.
- All four referenced nominals resolve to active, postable, non-Bank accounts.
- The policy event is linked to its platform audit event and records Shoaib as
  actor.
- The target company still has zero Bank Transfer rows; no financial transaction
  was created or changed.
- Focused unit tests passed: 2 files, 2 tests.
- Local API liveness and readiness both returned `status: ok`; database and
  Banking readiness checks are healthy.
