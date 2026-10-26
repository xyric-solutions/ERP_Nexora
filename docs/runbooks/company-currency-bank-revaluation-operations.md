# Company Multi-Currency and Bank Revaluation operations

This runbook covers the localhost/UAT cutover delivered by FXR-01 through
FXR-12. It does not authorize a Railway or production deployment, a
shared-database migration, exchange-rate loading, Bank Account creation,
revaluation posting or synthetic financial data.

## Controlled local cutover

1. Record the exact target database host, port, database name and database
   user. Back up the database and obtain operator approval for that identity.
   The target must resolve to `localhost`, `127.0.0.1` or `::1` and use an
   explicitly isolated name containing `uat`, `test`, `isolated`, `provision`
   or `revaluation`.
2. Confirm the target tenant and company IDs. The tenant must be active and
   have region `uat-isolated`; the company must be active.
3. Set `DATABASE_URL` to the approved target and run the documented source
   migration workflow:

   ```powershell
   $env:DATABASE_URL = "<approved-local-isolated-database-url>"
   npm.cmd run db:migrate:source
   ```

4. Verify the target records Platform 11, Security 19 and Finance 30 in
   `nexora_schema_migration`. Do not manually mark migrations as applied.
5. Confirm Shoaib already has active access to the target company and the
   existing tenant-scoped `platform.approval.override` authority. FXR-12 does
   not create, replace or broaden that Super Administrator authority.
6. Select two different active tenant-wide Security administrators: one maker
   and one checker. Neither may be Shoaib.
7. Set the following variables in the current PowerShell session and run the
   governed provisioning command:

   ```powershell
   $env:NEXORA_ENVIRONMENT = "uat"
   $env:NEXORA_UAT_CONFIRM = "<tenant-id>"
   $env:NEXORA_BANK_REVALUATION_TENANT_ID = "<tenant-id>"
   $env:NEXORA_BANK_REVALUATION_COMPANY_ID = "<company-id>"
   $env:NEXORA_BANK_REVALUATION_MAKER_USER_ID = "<security-maker-user-id>"
   $env:NEXORA_BANK_REVALUATION_CHECKER_USER_ID = "<security-checker-user-id>"
   $env:NEXORA_BANK_REVALUATION_SHOAIB_USER_ID = "<shoaib-user-id>"
   $env:DATABASE_URL = "<approved-local-isolated-database-url>"
   npm.cmd run uat:provision-bank-revaluation
   ```

The script uses the existing governed role and assignment workflows. It
creates one company-scoped overlay containing only the 15 company-currency,
rate, Revaluation policy and Revaluation lifecycle permissions. A second run
verifies and reuses the active overlay without creating another role,
assignment, assignment version or audit event. It fails closed on role drift,
missing migration heads, a non-local database, a non-isolated tenant, an
ineligible or non-independent Security actor, missing company access or
missing approval-override authority.

The command snapshots company rates, Bank Accounts, Bank Revaluations,
journals and tenant accounting events before and after provisioning. It fails
if any count changes. It never creates exchange rates, accounts, Revaluations,
journals or other financial facts.

## Company currency and rate controls

- A company has exactly one base currency. Financial reports and Revaluation
  journals use that base currency.
- A Bank Account has exactly one active company currency. Do not change its
  currency after financial activity exists.
- Rate direction is `1 foreign currency = X company base currency`. Rates are
  company-owned, effective-dated and revisioned; never overwrite historical
  rate evidence or infer reciprocal/triangulated rates.
- Country selection determines the governed currency mapping. An alternate
  mapping must be selected explicitly where the country has more than one
  supported currency.
- Create or correct currencies and rates only through authenticated APIs and
  the generated client. Never edit normalized company-currency, rate or event
  tables directly.

## Revaluation policy and lifecycle

Before creating a Revaluation, configure the company policy with active,
posting-capable unrealized gain and unrealized loss nominals. The policy,
closing rate, account balances and calculation fingerprint are snapshotted by
the server.

The supported lifecycle is:

```text
draft -> submitted -> approved -> posted -> reversed
                   \-> rejected -> draft
```

- Preview and Apply are read-only calculations. Save persists a draft only.
- Submit recalculates and rejects changed source evidence.
- A draft must store an approver selected from the live company-scoped eligible
  approver directory before submission. Eligibility is rechecked at submit and
  decision time.
- Approval does not post. A separate post permission and action are required.
- Maker/checker separation is mandatory. Shoaib's same-actor approval is
  allowed only when the existing audited Super Administrator override writer
  succeeds and records immutable evidence.
- Posting creates exactly one balanced `bank_fx_revaluation` journal and one
  durable reversal schedule. Replays must return the same result.
- Never delete or directly update posted Revaluations, journal links,
  schedules, approval evidence or immutable event rows.

## Automatic reversal worker

The worker requires an explicit active actor with company-scoped
`banking.revaluation.reverse` permission for every company it processes:

| Variable                                     |   Default | Allowed range          |
| -------------------------------------------- | --------: | ---------------------- |
| `BANK_REVALUATION_REVERSAL_ACTOR_ID`         |  required | valid governed user ID |
| `BANK_REVALUATION_REVERSAL_WORKER_ID`        | generated | valid worker ID        |
| `BANK_REVALUATION_REVERSAL_EVERY_MS`         |    60,000 | 30,000-86,400,000      |
| `BANK_REVALUATION_REVERSAL_TENANT_LIMIT`     |     1,000 | 1-1,000                |
| `BANK_REVALUATION_REVERSAL_CLAIM_LIMIT`      |        50 | 1-100                  |
| `BANK_REVALUATION_REVERSAL_CLAIM_LEASE_MS`   |   300,000 | 30,000-3,600,000       |
| `BANK_REVALUATION_REVERSAL_RETRY_BASE_MS`    |    30,000 | 1,000-3,600,000        |
| `BANK_REVALUATION_REVERSAL_RETRY_MAXIMUM_MS` | 3,600,000 | 1,000-86,400,000       |

The worker reverses on the scheduled first day of the next open period. A
closed or missing period remains pending with bounded retry. Claims use leases
and database locking; never clear a claim, force a state transition or insert
a replacement journal manually.

## Monitoring and audit

- API Banking readiness must report Platform 11, Security 19, Finance 30 and
  all mandatory FXR relations as available.
- Worker readiness must verify the reversal actor and live reverse permission
  for every active company in scope.
- Monitor submitted and approved Revaluations that remain stale, posted rows
  with pending/failed reversals, repeated retry codes and closed-period errors.
- Reconcile each posted header to exactly one original journal and each
  reversed header to exactly one compensating journal.
- Investigations use immutable company-currency, policy, Revaluation,
  approval-override, accounting and Security audit events. Error responses are
  intentionally opaque; correlate by the recorded reference ID.

## Safe rollback and resume

If provisioning stops, rerun the same command with the same database, tenant,
company and actors. It resumes the governed draft, approval, activation or
assignment request. Do not delete pending Security requests or edit normalized
grants manually. An active overlay whose scope or permissions differ from this
release requires a governed Security review.

Database migrations are additive and are not rolled back by deleting applied
rows. If a cutover validation fails, stop API and worker use of the feature,
preserve all evidence, restore only through the approved database recovery
procedure, and investigate before resuming. Never compensate by editing
posted journals or Revaluation history.
