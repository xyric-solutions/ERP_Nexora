# Debug session: Bank Payment and Receipt nominal dropdowns empty

## Status

Resolved and verified against the running local Nexora environment.

## Symptoms

- Expected: authenticated users can choose permitted governed nominal accounts in Bank Payment and Bank Receipt entry forms.
- Actual: nominal account selectors contain no options in both forms.
- Reported errors: none.
- Timeline: observed after the post-merge isolated database was created and only the Cash & Bank hierarchy needed by New Bank was provisioned.

## Safety constraints

- Do not create or post a financial transaction.
- Do not bypass server authorization or hardcode UI options.
- Do not delete or reset any data.
- Confirm the cause before provisioning the minimum controlled UAT fixture.

## Evidence

- The payment form calls the governed `listBankPaymentNominalAccounts` API for the selected company; the receipt form follows the corresponding receipt endpoint.
- `readBankNominalDirectory` selects only non-header accounts that are active, manually postable, non-system, not reconciliation accounts, and not active Bank control accounts. Draft/pending/rejected governed general nominals are excluded.
- The earlier Bank Nominal provisioner creates only the Current Assets and Cash & Bank header hierarchy unless its separate general setup is explicitly enabled; headers are intentionally excluded from payment/receipt selectors.
- The authenticated Payment and Receipt nominal endpoints both returned `items=[]`, `eligible_count=0`, and `protected_count=3`; neither request failed.
- A read-only database classification using the same server rules found exactly two headers and three protected ordinary accounts, with zero eligible accounts.
- Both Payment and Receipt repositories delegate to the same `readBankNominalDirectory` implementation. There is no payment-vs-receipt account-type filter, so one eligible ordinary account would be enough to populate both selectors.

## Root cause

The local post-merge UAT database contains the Bank header hierarchy and protected control accounts, but no active ordinary account that satisfies the server-owned nominal eligibility policy. The frontend selectors and both authenticated API endpoints are behaving correctly; this is missing controlled UAT master data, not a UI filtering or authorization defect.

## Safe repair

The Bank Nominal provisioner was run with `NEXORA_GENERAL_NOMINAL_UAT_SETUP=true`. This created the controlled general nominal Category/Section policies but deliberately did not create a fiscal period or enable posting. One expense nominal named `Bank Payments and Receipts` was then created through the authenticated Finance Nominal API in the generated UAT expense section.

The current direct Chart of Accounts lifecycle activates a newly created general nominal immediately. The create call returned the nominal in `active` state at version 2. A subsequent submit attempt correctly returned `COA_APPROVAL_RETIRED`, and a status-activation attempt correctly returned a state conflict because the nominal was already active. Readback confirmed the active record. No authorization or lifecycle rule was bypassed.

The broader Bank Payment and Bank Receipt transaction provisioners were not run. Review showed that they reserve different identifiers for the single company calendar/current-period authority, so running both sequentially for this company/year would cause the second provisioner to stop on a fixture conflict. They were unnecessary because both dropdowns use the same governed nominal directory.

## Verification

- The authenticated Payment nominal endpoint returns one eligible item.
- The authenticated Receipt nominal endpoint returns the same eligible item.
- Browser verification shows `UAT-EXPENSE-000001 - Bank Payments and Receipts` in both the Add Bank Payment and Add Bank Receipt nominal selectors.
- A final read-only database classification found one eligible account, twelve headers, and three protected accounts.
- Final database counts remain: zero Bank Payments, zero Bank Receipts, zero accounting events, and zero journal entries.
- No financial transaction was created, submitted, approved, posted, or reversed.
