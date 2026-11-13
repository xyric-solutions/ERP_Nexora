# Nexora ERP Master Menu & Responsive Sidebar

## 2026-11-12 Accounting navigation and company setup

Removed **Ledgers & Close** and **Group & Reporting**, including their children,
from Accounting. The remaining visible groups are Chart of Accounts, Taxes,
Reporting Master Data and Journals. General Ledger, Trial Balance and financial
statement bookmarks resolve to the existing Reports pages. Intercompany and
Consolidation bookmarks open the Report Catalogue because dedicated equivalents
are not currently available there; this change does not implement new reports.

Fiscal setup is now **Configuration > Core Setup > Company Setup**, opening
**Fiscal year & periods** by default. Start date is editable; end date is derived
from the existing twelve-month calendar rule. Company currencies remain available
inside Company Setup. Old fiscal-period and period-close links open this setup
page; FX Revaluation opens the consolidated currency workspace's valuation view.
This relocates existing company configuration; a new account-registration wizard
is outside this navigation change. Period permissions, server validation, audit
history and financial posting rules are preserved.

## 2026-11-12 Single currency workspace

Accounting now has one **Reporting Master Data > Currencies & Transfer FX**
entry at `/#/finance/currencies-fx`. The opening view preserves the existing
company currency/rate forms and Bank Transfer FX policy. **Balances & transactions**
opens the existing customer/supplier accounting workflows inside the same page,
including invoices, settlement, valuation, reports and account setup. Its view
address is `/#/finance/currencies-fx/accounting`. The separate **Multi-currency
Accounting** sidebar entry is removed. Its old bookmark remains a compatible alias
that opens the accounting view of this page; changing views uses the canonical
address. General Ledger, Trial Balance, customer/supplier and report entry points
remain unchanged. No financial calculations or posting controls were replaced.

## 2026-11-12 Accounting and unified Taxes update

The active Next.js shell is defined in `app/shell/config/prototype-data.ts` and
`app/shell/prototype-shell.tsx`. Visible Finance is now **Accounting**; stable
`finance` route and permission identifiers remain compatible. **Taxes** is one
Accounting submenu leaf at `/#/finance/taxes` and opens the persistent Unified
Tax Management Console. All former standalone Tax pages normalize to this console.
Costing and its dedicated report group are removed; retired costing bookmarks
show an unavailable page. Dashboard and AI launchers no longer target Costing.
Unrelated cost-centre, inventory and manufacturing calculations remain intact.
The sections below retain the earlier historical navigation contract.


- Version: 1.2
- Date: 2026-08-27
- Status: implemented; Demo acceptance required
- Scope: navigation architecture, responsive sidebar and shell header only
- Executable source: `web/src/components/shell/nav-config.ts`

## Implementation boundary

This contract standardizes the Nexora navigation shell without changing any
business transaction, Finance service, posting rule, report calculation,
database schema, API contract, authentication flow or backend authorization.
Existing routes are reused. An unavailable action has no route and cannot be
activated from the sidebar.

## Centralized item contract

Every materialized main-menu, sub-menu and action/page item contains:

- stable `id`;
- business `label`;
- canonical `route` (`null` when unavailable);
- icon metadata;
- `parentId` and `moduleId`;
- exact permission metadata and `any`/`all` mode;
- maturity `status`;
- deterministic `order`;
- service/trading/manufacturing applicability; and
- recursively materialized children.

`href` is emitted only as a compatibility alias for existing Next.js
navigation consumers. `route` is the source of truth.

## Status contract

| Status | Meaning | Navigation behavior |
|---|---|---|
| Implemented | Evidence-backed route and current functionality exist | Enabled after RBAC filtering |
| Partial | A real bounded surface exists but the complete business capability does not | Enabled after RBAC filtering and labelled Partial |
| Coming Soon | Roadmap module/group is announced but not operational | Visible, expandable where applicable, never navigable |
| Not Yet Implemented | The named action/page has no current implementation | Visible and disabled, with no route |

## Master main-menu order

| # | Module | Current status |
|---:|---|---|
| 1 | Dashboard | Partial |
| 2 | Banking | Partial |
| 3 | Sales | Coming Soon |
| 4 | Revenue | Coming Soon |
| 5 | Customers | Coming Soon |
| 6 | Purchases | Partial |
| 7 | Suppliers | Partial |
| 8 | Inventory | Partial |
| 9 | Costing | Coming Soon |
| 10 | Chart of Accounts | Implemented |
| 11 | Finance & Accounting | Implemented |
| 12 | Taxation | Partial |
| 13 | Operations | Coming Soon |
| 14 | Production | Coming Soon |
| 15 | Quality | Coming Soon |
| 16 | CRM | Coming Soon |
| 17 | Projects & Professional Services | Coming Soon |
| 18 | Resource Management | Coming Soon |
| 19 | Helpdesk & Support | Coming Soon |
| 20 | HR & Payroll | Coming Soon |
| 21 | Fixed Assets | Coming Soon |
| 22 | Expenses | Coming Soon |
| 23 | Documents | Coming Soon |
| 24 | Budget & Planning | Partial |
| 25 | Reports & Analytics | Partial |
| 26 | Portals | Coming Soon |
| 27 | Administration | Partial |
| 28 | Configuration | Partial |
| 29 | Workflow & Approvals | Partial |
| 30 | Notifications | Partial |
| 31 | Integrations | Coming Soon |
| 32 | AI Assistant | Coming Soon |
| 33 | Audit & Compliance | Partial |
| 34 | Data Migration | Coming Soon |
| 35 | Mobile | Coming Soon |

## Finance navigation truth

Chart of Accounts is a protected top-level menu with exactly two current
children: Nominals and Section Management. Finance & Accounting remains a
separate top-level menu. Its enabled routes cover the Finance Dashboard,
Journal Entries, Journal Register, General Ledger, Trial Balance, Profit &
Loss, Balance Sheet, Cash Flow, Budgets, Budget vs Actual, Financial Periods,
Period Closing/Reopening, Reversals, Recurring Journals,
Intercompany/Consolidation surfaces, Multi-Currency/Exchange Rate surfaces,
Accounting Events and Audit Trail.

The navigation does not implement or alter debit/credit entry, balance
validation, approval, posting, reversal, General Ledger or report behavior.
Those remain owned by the existing Finance backend.

## Company-type behavior

One master menu is filtered and prioritized through
`navigationForCompanyType()`:

- service prioritizes CRM, Sales, Customers, Revenue, Projects, Resources,
  Support and Expenses before Chart of Accounts and common Finance/Banking/HR/Reports;
- trading prioritizes Sales, Purchases, Inventory, Customers, Suppliers,
  Banking, Finance, Taxation and Reports; and
- manufacturing adds Production, Quality and Costing to the trading priority.

Manufacturing-only modules are excluded for a configured service company.
When company-type data is unavailable, the full product map remains visible
with honest statuses; the UI does not guess a company type. A deployment may
set `NEXT_PUBLIC_NEXORA_COMPANY_TYPE` to `service`, `trading` or
`manufacturing` until authoritative tenant configuration is exposed.

## Responsive sidebar

- Expanded desktop: compact scrollable hierarchy, active-route highlighting,
  status labels, keyboard buttons and recursive expansion.
- Main-menu labels use a shrinkable, single-line text region while status and
  chevron controls remain fixed-width in the same flex row. Status badges are
  not absolutely positioned, so long labels cannot overlap them.
- Desktop width is owned by the shared sidebar provider and uses
  `clamp(16rem, 19vw, 18rem)`. The reserved layout gap and fixed panel inherit
  the same value, so the panel cannot overlap the working screen.
- Collapsed desktop: icon rail with accessible module tooltip and a right-side,
  scrollable nested flyout; submenus remain usable. The sidebar edge and the
  header trigger both collapse or restore the desktop sidebar.
- Mobile/tablet: off-canvas Sheet with portrait/landscape scrolling,
  expandable hierarchy and close-after-navigation behavior.
- The shell workspace is a shrinkable `min-width: 0` flex column. Content that
  is wider than the available screen scrolls inside the workspace instead of
  extending beneath the fixed sidebar.
- Expansion state remains in the shared shell while client-side navigation
  preserves the layout; the active route automatically reopens its ancestors.

## ERP header

The header now exposes Nexora ERP, current company context, Notifications,
theme and the real User menu. Global Search, Help, Security self-service and
Switch Company are visibly disabled because no supporting backend capability
exists. Profile, Preferences, Notifications and Logout continue to use their
real existing behavior.

## Permission and route rules

- Frontend visibility consumes the exact backend-issued permission list.
- Parent visibility is derived recursively from permitted descendants.
- Backend authorization remains the security boundary.
- Implemented/Partial leaves must resolve to an existing route.
- Coming Soon/Not Yet Implemented entries must have `route: null`.
- Supplier Register and Setup Drafts remain available at their existing routes.
