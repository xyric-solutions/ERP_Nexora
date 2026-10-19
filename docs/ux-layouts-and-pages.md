# Nexora - UX Layouts and Page Patterns

- Status: `active`
- Last updated: 2026-08-06
- Source: Stage 4 Enterprise UI/UX Design request, logged as `accepted-improvements.md` I-019
- Foundations: `docs/design-system.md`, `docs/component-library.md`

Every page below is traced to the segment that owns its backend, so this
document can't drift into implying functionality that isn't built or spec'd.
"Status" columns mirror the segment's own status field — not a separate,
possibly-inconsistent tracking system.

## 1. Layouts

| Layout | Structure | Desktop | Tablet/Mobile |
|---|---|---|---|
| Dashboard | Top nav + persistent sidebar + KPI widget row + drill-down panels | Full grid of widgets | Single-column stack, widgets collapse to summary cards |
| Workspace (record list) | Sidebar + filter bar + data grid + optional detail drawer | List + drawer side-by-side | List only; tapping a row navigates to a full detail page |
| Sidebar | Module icons (wayfinding accent per `docs/design-system.md` §1) + labels, collapsible to icon-only | Persistent, expanded by default | Drawer, hidden by default |
| Top navigation | Tenant switcher, global search / command palette trigger, notifications, AI assistant toggle, avatar menu | Full bar | Search collapses to icon; command palette (⌘K equivalent) still reachable via keyboard on tablet |
| Settings | Nested left nav (categories) + right content panel | Two-column | Single column, category list → detail |
| Module navigation | Breadcrumb (module → record) + tab bar for record sub-sections | Full breadcrumb + tabs | Breadcrumb truncates to current + parent; tabs become a dropdown |
| Forms | Single-column, sectioned with accordion for advanced fields, sticky save bar | Max-width 720px, centered | Full-width, save bar pinned to bottom |
| Master-detail | List (left, ~35% width) + detail (right, ~65%) | Side-by-side | List only; detail is a full page (Drawer pattern doesn't fit small screens) |
| Reports | Filter panel (left, collapsible) + result canvas (table/chart toggle) | Side-by-side | Filter panel becomes a modal sheet triggered by a filter button |
| Analytics | KPI stat row + chart grid + drill-down table below | Full grid | Stacked, one chart per row |

## 2. ERP pages

| Page | Purpose | Key components | Owning segment | Status |
|---|---|---|---|---|
| Login | Auth entry, OIDC/SAML redirect, MFA step | Input, Button, error toast | S1.2 (identity) + S1.4 (shell) | S1.2 built (reference baseline); production identity provider is Q-003, open |
| Dashboard | Executive/role-scoped KPI overview | Dashboard widgets, Charts, freshness timestamp | S2.3 (finance dashboards) + S1.4 (shell) | Not started |
| Finance | Chart of accounts, journals, periods, reversals | Data grid, Master-detail, Dialogs (confirm posting/reversal) | S2.2 | Not started |
| Inventory | Item master, stock ledger, cycle counts | Data grid, Timeline (stock movement history) | S3.1 | Not started |
| Procurement | Requisition → PO → receipt → match | Kanban (approval stages), Master-detail, Data grid | S3.1 | Not started |
| Sales | Lead-to-order flow | Kanban (pipeline), Master-detail | S3.2 (skeleton depth — see note below) | Not started |
| CRM | Customer/contact records, activity | Data grid, Timeline | S3.2 (folded into Sales, no dedicated segment — flagged as a gap in the Stage 3 review) | Not started |
| HR | Employee records, payroll-input skeleton | Data grid, Master-detail, Accordion (advanced fields) | S3.2 (skeleton depth) | Not started |
| Manufacturing | Work order, BOM, material/quality/costing | Data grid, Timeline (quality disposition history) | S3.3 (framework-level, lighter spec than S3.1/S3.2) | Not started |
| Projects | Project cost/billing skeleton | Data grid, Dashboard widgets (budget vs. actual) | S3.2 (skeleton depth) | Not started |
| **Assets** | Fixed-asset register | — | **No owning segment** | **Deferred.** Flagged during the Stage 2 architecture review; you confirmed "intentional — leave as-is for v1" (2026-08-06). No page spec is written here beyond this placeholder — writing a full UX spec for an explicitly out-of-scope module would misrepresent it as planned work. |
| Reports | Report definitions, scheduled exports, drill-down | Reports layout, Data grid, Charts | S2.3 | Not started |
| Settings | Tenant/company/branch/fiscal/currency/policy config | Settings layout, Forms (draft-preserving) | S1.3 | In progress (0/3 items started) |
| Administration | User/role/policy management, access review | Data grid, Dialogs (role assignment confirm) | S1.2 | Built (reference baseline) |
| AI Assistant | Persistent suggestion panel across all modules | AI Assistant panel (component library) | S4.2 | Vendor decided (Claude API), not started; governance-shell only per the Stage 2 review |

## 3. Depth caveat (carried forward from the Stage 3 segment review)

Finance, Procurement, and Inventory (S2.2, S3.1) have "core"-depth segment
specs — the page guidance above can be trusted as close to final shape. Sales,
HR, and Projects (S3.2) are explicitly "skeleton" depth, and Manufacturing
(S3.3) is explicitly "framework" depth — their page layouts above use the
same components but should be expected to gain more screens/fields as those
segments mature, not to ship exactly as sketched here.
