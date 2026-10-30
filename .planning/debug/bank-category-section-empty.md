# Debug Session: Bank Category and Section Empty

## Status

Resolved and verified against the running local Nexora environment.

## Symptoms

- Expected: Bank Account Setup shows the governed Chart of Accounts Category and Cash & Bank Section for the selected company.
- Actual: Category and Section selects contain no choices.
- Reproduction: Sign in to the local Nexora runtime, open Bank Account Setup, and start a new bank nominal.
- Timeline: Observed after the HR/banking merge and migration to a fresh isolated local service database.

## Evidence

- The form loads governed master data from `GET /api/v1/finance/nominals/options?company_id=nexora-r06-uat-company`.
- The authenticated response succeeds but contains zero categories, zero sections, no Cash & Bank section, and no bank definitions.
- `FinanceNominalForm` renders Category and Section directly from that response; no frontend filtering or request failure is removing populated values.
- The repository contains `scripts/provision-bank-nominals-uat.ts`, guarded to an explicitly named local isolated UAT/test database and the expected UAT tenant.
- That script creates only the missing Current Assets header, Cash & Bank section, code policy, and company-scoped permissions inside a serializable transaction. It explicitly creates no bank account, balance, journal, or posting.
- The verified runtime database is the repository's local `nexora_postmerge_service` database. The provisioner initially rejected it without changing data because the name did not match its isolated-database allowlist.

## Root Cause

The fresh isolated service database has the authenticated company and Currency Master data, but its governed banking nominal hierarchy was not provisioned after the merge/migration. The UI and API path are working as designed and correctly return an empty governed directory.

## Safe Repair

Extend the local-database name guard narrowly to recognize the repository's `postmerge` convention, while retaining all other safeguards: localhost-only connection, explicit UAT environment, exact tenant confirmation, and the persisted `uat-isolated` tenant region. Then run the existing idempotent `uat:provision-bank-nominals` workflow against the same database used by the API. Do not hardcode UI options or bypass authorization.

## Verification Plan

1. Confirm the provisioner completes without creating accounts, balances, or journals.
2. Re-query the authenticated nominal-options endpoint and verify Category/Section and Cash & Bank policy counts are non-zero.
3. Refresh Bank Account Setup and verify the visible Category and Section choices.
4. Run the focused provisioning/API tests and repository diff checks if source changes are required.

## Resolution

- Added a tested database-name safety helper so the guarded provisioner recognizes the repository's local `postmerge` database convention while continuing to reject remote, generic, and invalid targets.
- Ran the existing UAT Bank Nominal provisioner against the current `127.0.0.1:55433` post-merge service database. It completed successfully and reported that no account, balance, or journal was created.
- The authenticated options API now returns one Category (`Current Assets`) and one Cash & Bank Section (`Cash & Bank`); the section has `creation_enabled` set.
- Chromium verification on `/#/banking/add-bank-account` shows Category options `Select Category`, `Current Assets` and Section options `Select Section`, `Cash & Bank`, with the governed identifiers selected.
- No browser request returned HTTP 400 or higher during verification.
- Focused safety tests passed: 6/6.
- Repository typecheck, focused ESLint, and `git diff --check` passed.
