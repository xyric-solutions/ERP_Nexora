# Chart of Accounts Workspaces

## Goal

Replace the mixed Chart of Accounts navigation with three company-scoped workspaces:
`Categories`, `Sections`, and `Nominals`. Each menu item must open its work page
first. Creation and editing happen on separate form routes reached from the work
page.

The approved hierarchy is flat and three levels deep:

1. A **Category** is a bold group heading such as `Capital & Reserves`,
   `Non-Current Liabilities`, `Current Liabilities`, `Tangible Assets`, or
   `Direct Expenses`.
2. A **Section** is a coded child of one Category, such as `Capital`,
   `General Reserves`, or `Accumulated Reserves`.
3. A **Nominal** is a posting account beneath one Section.

Categories are not nested. Users may create additional Categories beyond the
standard ERP catalogue.

## Scope

- Expose only `Categories`, `Sections`, and `Nominals` in the visible Chart of
  Accounts sidebar group.
- Keep detail and form pages routable but hidden from the sidebar.
- Preserve the existing company-scoped Finance API, tenant isolation,
  authorization, audit events, idempotency, immutable codes and parents, and
  no-posting behavior of master-data maintenance.
- Reuse the existing Category, Section, and Nominal records. Do not migrate,
  renumber, reparent, or replace existing accounts.
- Keep Central Master Data available by direct/internal navigation where it is
  still required, but remove it from this company Chart of Accounts menu.
- Do not copy the reference application's styling. Use the current Nexora
  Tailwind, semantic colour tokens, shadcn/ui primitives, and responsive
  conventions.

## Considered Approaches

1. **Three focused workspaces with separate forms (selected).** Split the
   existing combined hierarchy maintenance screen into focused directories and
   forms while reusing its API and business rules. This matches the requested
   work-page-first flow and keeps responsibilities clear.
2. **One tabbed hierarchy workbench.** Categories, Sections, and Nominals would
   be tabs on a single route. This reduces routing but does not provide the
   requested distinct menu destinations and makes form cancellation ambiguous.
3. **Keep the combined screen and add deep links.** This is the smallest code
   change, but Categories and Sections remain mixed with an embedded form and
   therefore does not satisfy the requested workflow.

## Navigation and Routes

The visible `Chart of Accounts` group contains, in order:

1. `Categories`
2. `Sections`
3. `Nominals`

The following implementation pages remain hidden from sidebar navigation:

- Category create/edit form
- Section create/edit form
- Nominal create/edit form
- Nominal detail
- Central Master Data

Selecting a visible menu item always opens its directory. The directory's
primary action opens the matching form. Saving a Category or Section returns to
its directory with the affected group visible. Saving a Nominal preserves the
existing transition to Nominal detail. Cancelling always returns to the
originating directory. Existing direct links continue to resolve.

## Categories Workspace

The Categories work page is the primary hierarchy view.

- Each Category renders as a visually strong, semantically labelled group row.
- The collapsed row shows the Category name, status, Section total, and Nominal
  total.
- Categories are collapsed initially. Expanding a Category reveals its Sections.
- Each Section row shows its immutable code, name, status, and Nominal total.
- Expanding a Section reveals its Nominals with code, name, currency, and state.
- Child Nominals are loaded lazily and paginated so a large Chart of Accounts
  does not create an unbounded response.
- Counts are calculated by the server for the selected company and are not
  inferred from a paginated client page.
- Search filters Category names, Section names/codes, and expanded Nominal
  names/codes without changing the underlying hierarchy.
- Additional user-created Categories appear alongside existing Categories; no
  category names are hard-coded.
- `Add Category` opens the Category form. Row actions open edit/status controls
  only when the current actor has the existing governed authority.

## Sections Workspace

The Sections work page lists Sections grouped beneath bold Category headings.

- Each Category heading shows its Section count.
- Section rows show code, name, accounting type, status, version, and Nominal
  count.
- Search and status filters operate within the selected company.
- `Add Section` opens a separate form with the selected company and optional
  originating Category carried forward.
- Selecting a Section opens its edit form. Codes, parent Category, and
  accounting type remain immutable after creation.

## Nominals Workspace

The existing Nominal directory remains the authoritative Nominals work page.

- Nominals remain grouped by Category and Section.
- Existing search, status, sorting, detail, approval, and posting-review behavior
  is preserved.
- `Add Nominal` opens the existing Nominal form.
- Category and Section filters use active company hierarchy records and do not
  permit a Nominal to bypass its Section.
- Saving, editing, submission, approval, activation, and deactivation continue
  through the existing Finance API and permissions.

## Forms

### Category form

- Company is required and company-scoped.
- Name and accounting type are required.
- The Category code remains server-generated and immutable.
- Creation is an audited master-data change and performs no posting.

### Section form

- Company, active Category, name, and four-digit Section code are required.
- Accounting type is inherited from the selected Category.
- Creation establishes the existing Section nominal-code policy atomically.
- Parent Category and code remain immutable after creation.

### Nominal form

- Reuse the existing governed form and validation.
- Company, Category, Section, name, and currency remain required.
- Automatic code allocation, Bank restrictions, lifecycle state, and audit
  behavior remain unchanged.

## Data and API Design

The existing Category and Section mutation contracts remain the source of truth.
The read model will expose server-calculated hierarchy totals for the work pages
while preserving bounded responses:

- Category summaries include direct Section totals and descendant Nominal totals.
- Section summaries include their Nominal totals.
- Expanded Nominals use the existing company/category/section filtered Nominal
  directory with cursor pagination.
- Every read and mutation remains tenant- and company-scoped and uses existing
  Finance permissions.

The generated contracts, OpenAPI description, generated client, API repository,
and UI consumers must change together if the summary response requires a new or
extended endpoint. Browser code must not query PostgreSQL directly.

## States and Accessibility

- Preserve explicit loading, empty, permission-denied, API-error, retry, and
  disabled states.
- Category and Section expansion controls are keyboard-operable buttons with
  `aria-expanded` and an accessible relationship to their child region.
- Use semantic table markup for directories and visible focus treatment for all
  actions.
- On narrow screens, summary metadata wraps without hiding the Category or
  Section name; expanded tables remain horizontally scrollable where required.
- Light and dark themes use semantic tokens only.

## Verification

- Navigation tests assert that the Chart of Accounts sidebar exposes exactly the
  three requested work pages while hidden form/detail routes still resolve.
- Component tests cover initial collapsed state, exact server totals, expansion,
  lazy Nominal loading, pagination, search, empty/error states, and additional
  user-created Categories.
- Form tests cover work-page-first navigation, correct cancel destinations,
  permission gating, Category creation, Section creation, and preserved Nominal
  creation.
- API and integration tests cover tenant/company isolation, aggregate totals,
  Category-to-Section validation, immutable hierarchy fields, audit evidence,
  idempotency, and no posting side effects.
- Run targeted tests, ESLint, full type checking, UI theme audit,
  `git diff --check`, and `npm.cmd run build:web` before handoff.

## Risks

- Client-derived totals would be incorrect when a directory is paginated. Totals
  must be calculated in the server read model.
- Treating a Category as a nested Category would conflict with the approved
  three-level model. The UI and contracts must retain Category → Section →
  Nominal semantics.
- Splitting the existing combined component can accidentally change authorization
  or mutation behavior. The new pages must reuse existing governed operations
  rather than duplicate them.
- Hidden routes must remain in the catalogue so saved links, detail navigation,
  and edit flows continue to work.
