# Bank same-currency FX investigation

## Status

Root cause confirmed. The Banking payment/receipt resolver is behaving correctly; the persistent local UAT company is configured with USD, not PKR, as its company base currency.

## Symptoms

- Expected by the operator: a PKR bank transaction from a PKR bank account uses the implicit identity rate and does not require an exchange-rate record.
- Actual: create fails with `No active company exchange rate applies on or before the transaction date.`
- Reference observed: `0bf8c200-8576-459e-86da-a9e210973fb3`.

## Evidence

1. Both Bank Payment and Bank Receipt derive `transaction_currency` from the selected bank account and call `resolveCompanyCurrencyAuthority`.
2. `resolveCompanyCurrencyAuthority` already returns:
   - `rateId: null`
   - `rateValue: 1.000000000000000000`
   - no `currency_rate` lookup or advisory rate lock
   when the bank/transaction currency equals the authenticated company's base currency.
3. Cross-currency transactions still require an active company rate effective on or before the posting date.
4. The persistent local UAT data currently contains:
   - primary company base currency: `USD`
   - active bank account currency: `PKR`
   - active company currencies: `PKR`, `USD`
   Therefore the attempted transaction is `PKR -> USD` for ledger purposes, even though the bank account and transaction currency are both PKR.
5. The USD profile came from `tests/integration/source-security-fixture.ts`, which intentionally seeds the controlled integration fixture with USD as the company base and PKR as a foreign currency.
6. Safety check on the local UAT tenant found zero Bank Payments, zero Bank Receipts, zero posted/reversed journals, and zero accounting events. The company profile is not locked.

## Conclusion

Changing Banking to skip FX whenever the bank and transaction currencies match would be incorrect: those values always match in these workflows, and the ledger must still translate a foreign bank currency into the company base currency. Such a change would weaken the approved company-currency and posting invariants.

The correct operational fix is to configure/correct this company's base currency to PKR before its first posted journal. The current public API can create an initial company profile but cannot revise a pre-posting profile. The database design explicitly allows a profile change before the first posted journal, but the companion `company_currency.is_base` flag is immutable and there is no governed correction workflow yet. A safe correction therefore requires a dedicated audited pre-posting base-currency correction capability; it must not be implemented as an ad-hoc SQL mutation or a fabricated PKR/USD rate.

## Regression coverage

`tests/unit/company-currency-authority.test.ts` now explicitly proves that a source currency equal to the company base returns the implicit unit rate without querying or locking the rate table. Existing coverage continues to prove that a foreign source currency requires a same-company active dated rate.

## Safe next action

Implement a narrowly scoped, authenticated and audited company base-currency correction workflow that:

1. is allowed only before any posted/reversed company journal or other financial effect exists;
2. atomically changes the company profile and exactly one company-currency base flag;
3. advances versions and records audit/event evidence;
4. preserves all foreign-rate validation;
5. is used by the UAT provisioning path to set the primary company to PKR without changing integration-test defaults.
