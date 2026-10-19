# Nexora - Component Library

- Status: `active`
- Last updated: 2026-08-06
- Source: Stage 4 Enterprise UI/UX Design request, logged as `accepted-improvements.md` I-019
- Tokens: `docs/design-system.md`

Every component below is a **shadcn/ui primitive** (Radix UI + Tailwind,
already the ADR-18 choice) unless marked "added library" — this is a
composition/usage spec, not new component code. Adding any library beyond
what's listed here needs a Reason/Impact/Risk entry in `accepted-improvements.md`,
per `docs/development-standards.md`'s dependency rule.

| Component | Base | Variants | States | Accessibility | Nexora usage notes |
|---|---|---|---|---|---|
| Button | shadcn `Button` | primary, secondary, ghost, destructive, link | default, hover, active, disabled, loading | Focus ring visible; `disabled` uses `aria-disabled`, not just visual dimming | One primary per view (design-system.md §10) |
| Input | shadcn `Input` | text, number (tabular-nums), password, search | default, focus, error, disabled | Associated `<label>`, `aria-describedby` for error text | Number inputs for financial figures always show currency/unit affix |
| Dropdown / Select | shadcn `Select` / `DropdownMenu` | single-select, multi-select, searchable-combobox | default, open, disabled | Full keyboard nav (arrow keys, type-ahead), `aria-expanded` | Combobox variant for any list >15 items (tax jurisdictions, chart-of-accounts picker) |
| Checkbox | shadcn `Checkbox` | default, indeterminate | checked, unchecked, indeterminate, disabled | `aria-checked` including `mixed` for indeterminate | Bulk-select-all in data grids uses indeterminate state |
| Radio buttons | shadcn `RadioGroup` | inline, stacked | selected, disabled | Grouped under one `<fieldset>`/`<legend>` | Used for mutually-exclusive setup choices (e.g. S1.3 policy type) |
| Date picker | shadcn `Calendar` + `Popover` | single date, date range, fiscal-period picker | default, disabled dates (e.g. closed periods), error | Full keyboard nav, announces selected date to screen reader | Fiscal-period picker disables dates outside the tenant's active `FiscalCalendar` (S1.3) |
| Table (simple) | shadcn `Table` | default, striped | sortable-header, loading (skeleton), empty | `<th scope="col">`, sort state announced | For short, non-paginated lists (e.g. settings screens) |
| Data grid | **Added library: TanStack Table**, styled with shadcn `Table` primitives | comfortable/compact density, sticky header, sticky first column | loading, empty, error, cursor-paginated (matches `{items, next_cursor}` contract) | Virtualized rows keep DOM size bounded for large ERP datasets; row-level `aria-rowindex` | The one grid component for every module's list view (design-system.md §13 do/don't) |
| Cards | shadcn `Card` | default, interactive (clickable), stat-card | default, hover (interactive only), loading (skeleton) | Interactive cards are real `<button>`/`<a>`, not `div onClick` | Stat-card variant is the base of Dashboard Widgets below |
| Dialogs | shadcn `Dialog` | default, confirm (destructive), form-dialog | open, closing, loading (submit) | Focus trapped inside, `Esc` closes (unless a destructive confirm requires explicit button), focus returns to trigger on close | Confirm variant used for every controlled action per design-system.md §9 |
| Drawers | shadcn `Sheet` | side (right, default), bottom (mobile) | open, closing | Same focus-trap rules as Dialog | Record detail-on-the-side pattern for master-detail layouts (mobile: full-page instead) |
| Tabs | shadcn `Tabs` | line, pill | active, inactive, disabled | `role="tablist"`, arrow-key navigation | Module settings, record detail sub-sections |
| Accordion | shadcn `Accordion` | single-open, multi-open | expanded, collapsed | `aria-expanded`, `aria-controls` | Advanced/rare form fields (progressive disclosure, design-system.md §9) |
| Charts | **Added library: Recharts** | line, bar, area, donut/pie (sparingly — bar preferred for comparison) | loading (skeleton), empty, error | Data also available in an adjacent table/summary for screen-reader users (charts are supplementary, never the only data source) | Series colors pull from the module accent palette (design-system.md §1), never from arbitrary chart-library defaults |
| Dashboard widgets | Composite: `Card` (stat-card variant) + optional Chart | KPI stat, trend stat, mini-chart card, list-preview card | loading, empty, stale (shows freshness timestamp per UX standard) | Same as Card + Chart | Every widget shows a freshness timestamp — ties to the "real-time truth" design principle (design-system.md §0) |
| Timeline | Custom composite (no direct shadcn/Radix primitive) | vertical (default), compact | loading, empty | `aria-live="polite"` on new entries | Renders `AuditEvent`/`ApprovalInstance` history directly — actor, action, before/after, correlation id |
| Kanban | **Added library: dnd-kit** | default (drag-drop columns) | dragging, drop-target-valid, drop-target-invalid | Keyboard-operable drag (dnd-kit's keyboard sensor), not mouse-only | Sales pipeline (S3.2), procurement approval stages |
| Breadcrumbs | shadcn `Breadcrumb` | default | — | `aria-label="breadcrumb"`, current page marked `aria-current="page"` | Mirrors the module → record navigation hierarchy |
| Notifications (in-app) | Custom composite over shadcn `Popover` + `Badge` | list, unread-count badge | unread, read, empty | `aria-live="polite"` for new arrivals | Sourced from S4.1's notification delivery model |
| Toasts | shadcn `Sonner` | success, error, warning, info | entering, visible, exiting | `role="status"` (non-error) / `role="alert"` (error), auto-dismiss pausable on hover/focus | Error toasts always render the canonical error shape (design-system.md §9) |
| Badges | shadcn `Badge` | default, success, warning, destructive, outline | — | Never color-only — always paired with text/icon | Status badges (posted, pending, rejected, waived) map directly to segment/finding status vocabulary already used in the docs |
| Avatars | shadcn `Avatar` | image, initials-fallback | default, with-status-dot (online/away) | `alt` text always the user's name | — |
| Command palette | **Added library: cmdk** (shadcn's own reference implementation) | global (⌘K), scoped (within a module) | open, searching, no-results | Full keyboard operability by definition; results are `role="listbox"`/`role="option"` | Primary way to jump modules, run commands, and search records without leaving the keyboard |
| AI Assistant panel | Custom composite: persistent right-side `Sheet`-like panel | collapsed (icon rail), expanded | idle, suggesting, awaiting-approval, applied, rejected | Each suggestion card is a focusable region with explicit Approve/Reject buttons (never a swipe-only or implicit-dismiss gesture) | Renders `AiSuggestion` (S4.2): type, confidence, source references, and the required human decision — this panel is the UI enforcement point for "AI never auto-applies high-impact actions" |

## Library additions summary

Three libraries beyond ADR-18's original list are introduced here, each
justified against a component with no shadcn/Radix equivalent: **TanStack
Table** (data grid virtualization/sorting/pagination), **Recharts** (charts),
**dnd-kit** (Kanban drag-and-drop). **cmdk** is shadcn's own documented
reference implementation for command palettes, not a third-party addition.
None of these are built yet — they apply when S1.4 (shell/shared components)
and the modules that use Data Grid/Charts/Kanban are actually built.
