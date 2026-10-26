# Shared PostgreSQL nominal master and Bank integration

Status: design approved; core shared-master implementation and synthetic acceptance verified.
Business catalog activation remains pending explicit import-manifest review.

## Goal

One Finance-owned Chart of Accounts backed by PostgreSQL supplies the Chart of
Accounts overview, Nominal directory, nominal detail/forms and Bank Payment/
Receipt account selectors. Do not introduce a second account ledger or copy
nominals into Banking. Preserve existing approved Bank nominal behavior.

## Verified starting point

- Finance Nominals reads the real account table through the independent API.
- The Chart of Accounts overview still renders finance-profile.ts fixtures.
- Nominal creation, lifecycle and event validation currently require a Bank
  capability. Non-bank accounts are read-only in that workflow.
- Payment/Receipt directories already query account with tenant/company access,
  active/postable leaf-account checks and reconciliation/control exclusions.
- Local company nexora-r06-uat-company contains 20 leaf nominals, 14 active,
  with zero currently eligible Bank offset accounts.
- Duplicate-name audit found five legacy synthetic accounts called Bank
  Operating Test. They have five DIFFERENT identifier hashes and 20 Bank
  history events. There are no direct Payment/Receipt references in this
  candidate set, but these facts do not prove that the accounts are duplicates
  or safe to delete. Other foreign-key and accounting references still need
  inspection before any approved consolidation.

## Chosen approach and alternatives

Extend the existing Finance master and public versioned contracts. Derive the
account type from the validated Category/Section hierarchy. Give ordinary
non-bank nominals a Finance-owned governance extension, not a fake bank_account.
Reuse existing Finance permission keys, scoped-role checks, audit chain,
idempotency infrastructure and super-admin override writer.

Rejected alternatives:

1. Populate the dropdown from frontend fixtures: would create invalid IDs and
   conceal the missing persistence.
2. Remove eligibility predicates: would expose headers, inactive accounts and
   subledger/reconciliation controls to unsupported direct posting.
3. Create Bank capabilities for all nominals: would misclassify expenses,
   revenue, liabilities and equity as Bank accounts.

## Data model and migration

Use a new additive Finance migration after the existing migration ledger.
Do not edit historical migrations or change existing account IDs/codes.

- account remains the sole nominal identity and posting authority.
- Extend section code allocation to support ordinary sections across asset,
  liability, equity, revenue and expense types. Preserve the single Cash &
  Bank policy and its existing allocator behavior.
- Introduce a non-bank governance extension referencing the same tenant,
  company and account, with draft/pending_approval/active/rejected/inactive
  lifecycle, optimistic version, actor/timestamps and Currency Master linkage.
- Non-bank lifecycle evidence is immutable and independent of Bank capability
  evidence. Existing Bank event triggers must keep working unchanged.
- Enforce same-company hierarchy, type consistency, active currency,
  versioned legal transitions, active-state/account-status consistency,
  actor/resource-bound override evidence and tenant RLS in PostgreSQL.
- Enforce uniqueness for generated codes and normalized names within the
  relevant company/section for newly governed accounts. Prevent concurrent
  creation races. Do not impose an unsafe global name uniqueness rule on
  legacy data or assume equal names in different sections mean duplication.
- Ordinary manual-posting nominals are distinct from system/subledger control
  accounts. Do not convert control accounts into manual-posting accounts.

## API and authorization

Evolve packages/contracts, generated client/OpenAPI and the existing
/api/v1/finance/nominals API together.

- Retain compatibility for existing Bank nominal requests.
- Support explicit ordinary-nominal creation and server-derived account type.
- Ordinary Finance mutations require the matching Finance permission and
  permitted company scope; they must not require unrelated Banking grants.
- Bank-capable nominals retain BOTH Finance and Banking permissions.
- Preserve cookie/CSRF controls, bounded list/search, standard problems,
  impersonation restrictions, expected versions and idempotency.
- Keep independent maker/checker decisions. Super-admin self-approval requires
  existing override authority and permanent evidence. No new delegated
  self-approval permission is implied by this work.
- Approval requires no user reason; rejection requires one. Reuse the explicit
  automatic approval-evidence convention without attributing it to the user.
- No nominal-master operation creates a journal, opening balance or posting.

## UI and integration

Route the Chart of Accounts overview and Nominals to the same real directory
and detail views. Preserve existing navigation and terminology. Remove fixture
dependencies only from these migrated surfaces; do not silently present other
Finance mock reports as connected.

The shared form supports ordinary categories/sections as well as Cash & Bank.
Banking entry points remain constrained to Cash & Bank. Show generated code,
name, description and the active Currency Master options. Expose required
setup errors rather than inventing hierarchy or code policies in the browser.

The Bank selectors consume this same persisted account authority through the
API, supporting bounded search beyond the current first-100-account snapshot.
Preserve selected persisted values and fail closed when directory loading is
denied. Approved eligible accounts appear; headers/inactive/system/control and
Bank accounts remain unavailable as ordinary offset lines. Bank-to-bank
movements belong to the Transfer workflow.

## Existing prototype catalog and opening balances

Do not copy fixture balances, journals, sample Bank identities or tax settings
into a real company. If the existing prototype nominal catalog is wanted as
initial company master data, first produce a reviewed import manifest comparing
codes, names, types, sections and existing persisted IDs. Apply an explicitly
approved catalog through controlled, audited setup; do not guess code ranges,
category mappings or approval decisions.

## Duplicate handling

Audit within tenant/company scope using codes, normalized names, hierarchy,
currency, control flags, Bank identity and all references. Same-name matches
are candidates, not proof of duplication.

- Prevent new duplicates transactionally.
- Never delete posted history, immutable events or referenced identities.
- For confirmed referenced duplicates, retain historical IDs and use an
  audited deactivation/consolidation decision with a named survivor. Do not
  rewrite historic journal account references in this phase.
- Physical deletion is limited to proven redundant, unreferenced records
  whose lifecycle permits it, after an exact-target report and backup.
- The five Bank Operating Test accounts are NOT approved deletion targets:
  their identifiers differ and their audit history must be retained.
- Report candidate IDs and recommended action for user review when intent
  cannot be established from repository/database evidence.

## Dependency-ordered delivery and acceptance

1. Schema/constraints: additive migration and isolated upgrade tests; existing
   Bank schema/security tests must pass.
2. Shared Finance service/contracts: ordinary create/edit/submit/approve/reject/
   deactivate, audit, idempotency and explicit legacy read-only behavior.
3. Shared UI: database-backed Chart of Accounts and ordinary form/detail;
   preserve the Bank-only entry points and success/error states.
4. Bank selectors: server-backed bounded search and approved-account
   eligibility; test more than 100 accounts and company-switch races.
5. Controlled local setup: reviewed real-company catalog/hierarchy plan and
   duplicate action report. No fixture balances imported.
6. Acceptance: isolated PostgreSQL lifecycle and tenant/company authorization
   tests, negative control-account tests, concurrency/duplicate tests, browser
   create-approve-select-refresh workflow using synthetic records, typecheck,
   API generation consistency, focused lint and production build.

Do not claim completion until a newly approved ordinary nominal survives
reload, appears in the correct company's Bank selector, and participates in a
verified persisted transaction under the existing Finance posting rules.
Fiscal-period setup remains a separate prerequisite for posting acceptance.
