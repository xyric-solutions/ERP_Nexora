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
