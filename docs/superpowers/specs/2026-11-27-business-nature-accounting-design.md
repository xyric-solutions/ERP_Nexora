# Business nature accounting initialization

## Read-only audit

- The checked-out `main` API mounts PostgreSQL Finance, Banking, Procurement,
  Sales and HR repositories. It does not supply an Administration repository.
- `app/login/organisation-setup-form.tsx` saves setup only to browser storage.
  `app/register/page.tsx` validates without creating an organisation. Neither
  path initializes company accounting records.
- Legal organisation type is distinct from business nature. The current legal
  form enum cannot express IT/software.
- Existing account hierarchy is Category -> Section -> Nominal, as shown in the
  supplied screenshot. Account parent foreign keys are company scoped. Preserve
  that established structure rather than reversing historical relationships.
- Existing central chart import/publish/adoption is deliberately manual. Its
  company adoption creates inactive nominal drafts and leaves bank references
  unresolved. No reliable business-nature initializer currently exists.
- AP/AR already use `finance_subledger_policy`, immutable open items, approved
  posting, settlement and GL integrity constraints. Reuse these, without
  inventing one nominal for each party or bypassing maker/checker controls.
- Bank capability already shares `account` identity with Finance and has unique
  nominal linkage. Reuse this authority, its numbering and reconciliation paths.
- API database selection is `DATABASE_URL`; migrations are optional at startup
  (`DATABASE_AUTO_MIGRATE`, default false). Docker startup does not run seeds.
  This does not establish that Railway deleted records.
- Public web deployment responds HTTP 200. Railway CLI authentication is expired
  (`invalid_grant`); no project is linked. Production database contents,
  migrations, service variables and release identity remain unverified.
- Initial working tree contained an existing `.env.example` edit. Preserve it.

## Decision and alternatives

Extend existing chart templates and accounting repositories. A second chart
system would split accounting authority; destructive reseeding would threaten
historical identities and balances. Neither is appropriate.

Store business nature and template selection per company. Persist baseline
definitions using the existing tenant template tables and adopt them atomically
with setup. Additional natures/revisions must be selectable through database
configuration. Repeated setup must not recreate defaults or alter existing
posted data. Conflicting existing codes/parents/control mappings fail closed for
explicit review rather than being renamed, merged or overwritten.

All writes require live global Super Admin and company access, CSRF, origin
validation, idempotency and immutable audit evidence. Defaults create no journals
or balances. Existing posting permissions, credit review, fiscal periods and
bank approvals continue to govern financial transactions.

## Implementation sequence

1. Add additive business-nature/template metadata and company setup persistence
   with company-scoped foreign keys, uniqueness, RLS and immutable mappings.
2. Implement baseline template provisioning and transactional company
   initialization through the existing chart and control policies.
3. Expose documented, validated setup/company API contracts and regenerate the
   shared client. Connect setup and company UI to persistent API records.
4. Verify supplier/customer control inheritance and bank eligibility against
   the shared authority; repair missing links in their actual creation paths.
5. Add PostgreSQL integration coverage for natures, repeats, isolation,
   conflicts, manual nominals, party controls, postings, settlements and banks.
6. Run relevant regression, contract, security, type, lint, theme and build
   checks. Record exact results and unresolved limits in the technical report.
7. Once authenticated Railway context is available, take read-only production
   snapshots, apply the verified additive release, and verify preservation,
   migration identity, persistence after restart and deployed workflows.

## Preservation and acceptance

Never blindly reseed companies, change historical codes, rewrite account
parents or posted journals, or infer financial party identities from names.
Test data belongs only in disposable PostgreSQL databases. Railway verification
requires the actual authenticated project, database and service context; local
test success cannot be reported as production success.
