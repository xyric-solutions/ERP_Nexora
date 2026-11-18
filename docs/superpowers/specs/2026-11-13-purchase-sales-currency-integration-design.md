# Purchase and Sales bank currency integration

Approved by the user on 13 November 2026. Accounting remains the sole currency
and exchange-rate authority. This extends the existing integration; it introduces
no currency master, rate service, financial execution workflow or dependency.

## Backend and contracts

Resolve the active, authorized company bank before calculating payment values.
Use its currency as the transaction currency, reject conflicting client currency,
and reuse `resolveCompanyCurrencyAuthority` for the transaction date. Preserve
strict canonical response schemas and backwards compatibility with existing
requests and historical records. Never accept caller-supplied FX evidence.

Purchase payments remain instructions. Store a server-calculated FX snapshot
with rate identity/date, base currency and gross/WHT/net base amounts in existing
payment-details JSON and immutable audit evidence. Validate it at submission and
approval; changed financial evidence requires editing and resubmission. Historical
instructions without this snapshot remain readable. Preserve existing
same-currency procurement allocations; cross-currency financial settlement uses
the existing Accounting subledger.

Sales receipts and supplier financial settlements continue using the shared
Accounting subledger, decimal arithmetic, governed rates, independent approval,
idempotency and transactional GL posting. Currency follows the selected bank for
settlements and bank-funded advances. Posted history is never recalculated.

## Interface and navigation

Remove visible standalone Currency Accounts and Supplier Currency Accounts menu
entries while retaining compatible deep links and accounting preparation actions.
Operational Purchase/Sales views expose bank selection and read-only derived
currency, rather than currency or rate configuration. Accounting retains its
existing configuration and advanced bank-deal functionality.

Documents without an initial bank retain their existing document-currency logic.
Explicit sample workflows remain non-posting; no sample bank name is treated as
an authenticated live bank identity. Shared forms use semantic Tailwind tokens
and existing controls, with loading, missing-bank, missing-rate and stale-state
errors visible to the user.

## Implementation and verification plan

1. Add compatible snapshot contracts, bank normalization and regression coverage.
2. Integrate the central FX authority into Purchase instruction snapshots and
   lifecycle validation; preserve no-posting behavior.
3. Simplify the shared settlement/advance forms and scope configuration to
   Accounting. Preserve historical links and non-bank document behavior.
4. Update generated contracts/client, navigation catalogue and existing docs.
5. Verify PKR/AED/USD selection, missing/inactive rates and banks, conflicting
   currency input, tenant/company isolation, exact conversion/rounding,
   idempotency, approval evidence, GL balance and historical compatibility.
6. Run focused unit/contract/integration tests, API/catalogue checks, theme audit,
   TypeScript checks, production build and available browser verification.

Baseline: 64 focused unit tests and 6 currency/subledger contract tests passed.
No shared database migrations, environment edits or financial posting are part
of implementation verification; integration fixtures use disposable databases.

## 17 November 2026: Purchase currency-fetch repair

The owner requested currency fetching across Purchases. All document kinds and
supplier currency controls already consume the shared Procurement options API;
the company currency query is secured by `company_currency_scope_access`, which
requires both authenticated tenant and user transaction settings. The Purchase
repository supplied only the tenant setting, so restricted runtime connections
received an empty currency list despite valid company access.

Reuse that existing integration and set the authenticated user's identity with
transaction-local `set_config` beside the tenant setting. This follows Inventory's
existing pattern. Do not introduce frontend lists, direct Accounting permission
requirements or another currency endpoint. New documents retain base-first active
currency options; source-linked documents and saved history retain their currency;
payments retain the bank's currency. Returns retain their existing accounting
currency rules. Existing company and permission checks remain in force.

Verify options with a restricted role, denial for another company/user/tenant,
and cleared settings after commit and rollback on reused connections. Run the
Purchase integration and frontend unit suites. Patch and compile only the same
context repair in the active compatible API source; preserve its schema version,
frontend build, credentials and existing financial workflows. No migration or
business-data mutation is required for local activation or browser acceptance.
