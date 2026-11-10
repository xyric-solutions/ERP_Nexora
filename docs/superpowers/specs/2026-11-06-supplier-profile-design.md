# Purchase supplier directory and detailed profile

Approved by the user on 2026-11-06 after review of the proposed tabbed form and
three supplied reference images.

Expose Suppliers as the eighth Purchase submenu. Keep the existing company-scoped
directory and extend its editor into a dedicated form with Overview, Contacts &
Addresses, Tax Details, Payment Terms, Bank Accounts and Internal Notes tabs.
Preserve server-assigned SUP codes, existing supplier fields, permissions, CSRF,
optimistic concurrency, idempotency, immutable audit history and purchase links.

Store the additional bounded, validated profile in an additive JSONB column on
procurement_supplier. Encrypt profiles containing bank accounts with the existing
banking key, including audit/retry results; bind encryption to tenant/company/record.
Contracts, OpenAPI and generated client stay synchronized.
Omitted profiles on older API updates preserve saved details. Existing rows need
no destructive backfill. Banking fields record instructions only and neither
verify beneficiary accounts nor execute payments or accounting postings.

The form supports company/individual identity, legal/trading names, registration,
category, primary contact, billing/delivery addresses, tax registration/status,
withholding reference, agreed credit days, currency, payment method/reference,
internal notes and up to ten bank accounts with exactly one default when present.
Validate bank identity, account number or IBAN, duplicate accounts and SWIFT/IBAN
format; report errors beside fields and open the affected tab on save.

Use existing shared primitives, typography and semantic theme tokens. Stack
fields on phones, provide keyboard-accessible tabs, protect unsaved changes, and
disable all editing during saves or without create permission.

Verify contract edge cases, UI save/edit/error behavior, PostgreSQL persistence,
legacy-update compatibility, concurrency/audit/isolation, migration upgrades,
existing purchase workflow, responsive light/dark rendering and production build.
