# Unified Journals Workspace Design

## Goal

Replace the six Journal navigation entries with one **Journals** workspace while preserving the current Journal APIs, permissions, lifecycle rules, validation, audit evidence, and recurring-template safeguards.

## Navigation and compatibility

- The Finance > Journals menu exposes one page: `journal-register`, labelled **Journals**.
- The workspace contains two tabs: **Transactions** (default) and **Recurring**.
- Existing internal/deep links to `manual-journal`, `journal-detail`, `journal-approval`, `journal-reversal`, and `recurring-journals` remain accepted by the workspace and are normalized to the corresponding tab and drawer state. They are removed only from the left menu, avoiding broken bookmarks or callers during this consolidation.
- Closing a drawer returns to the register state without discarding unrelated register filters.

## Transactions experience

- The Transactions tab retains the existing server-backed register filters, cursor pagination, source/state badges, company selector, and display-decimal preference.
- **New Journal** opens the existing Manual Journal form in an accessible right-side `Sheet`. The drawer is wide enough for the line editor on desktop and becomes full-width on narrow screens.
- Selecting **View** opens the selected Journal in the same right-side drawer. It shows metadata, read-only lines, totals, lifecycle evidence, and only those actions allowed by the server-provided capabilities.
- A draft's **Edit** action switches the drawer content to the existing Manual Journal form. Saving, submitting, or deleting refreshes the register and moves the drawer to the correct safe state.
- A submitted Journal's review controls appear inside its detail drawer. Approval/posting keeps the existing final confirmation, self-approval guidance, override-reason requirements, rejection reason, approval note, idempotency key, version check, and server authorization.
- A posted Manual Journal's **Reverse** action expands a reversal panel inside its detail drawer. It keeps the current date constraint, mandatory reason and confirmation, immutable compensating-entry language, version check, and server capability check. Bank and Payroll reversals remain owned by their source modules.
- The former standalone approval queue is represented by an **Awaiting approval** register view/filter. Opening an item uses the same detail drawer and review controls, eliminating duplicate detail rendering.

## Recurring experience

- The Recurring tab keeps recurring templates distinct from Journal transactions.
- It retains template filtering, cursor pagination, generation history, failure visibility, activation/inactivation confirmation, and draft-only generation messaging.
- Creating or editing a recurring template uses a right-side drawer, reusing the current line validation and continuing to exclude Bank nominals.
- **History** opens generation occurrences in the same right-side drawer pattern. Only one drawer mode is active at a time, and recurring history never appears as a Journal transaction.

## Component structure

- `FinanceJournalWorkspace` owns the selected tab, drawer mode, selected record, shared company/options state, and refresh signals.
- `JournalRegister` remains responsible for filters, pagination, and transaction rows, and reports row/action selections upward.
- Existing Manual Journal, detail, approval, reversal, and recurring logic is reused as focused drawer content rather than rewritten.
- Shared shadcn/ui `Tabs` and `Sheet` primitives are used. No new dependency or feature stylesheet is introduced.
- The implementation may split the current large view into local Journal components if needed for clear state boundaries, but it will not change API contracts or backend architecture.

## State, errors, and accessibility

- Unsaved Manual Journal or recurring-template edits continue to report dirty state through `onDirtyChange`; drawer close must respect the existing shell unsaved-change guard or provide an equivalent confirmation path.
- API failures continue to use the existing safe error message and correlation reference. A failed action leaves the drawer open with entered data intact.
- Mutations disable their controls while pending, refresh affected lists after success, and show the existing action feedback.
- Drawers have accessible titles and descriptions, keyboard focus containment, Escape/close behavior, visible focus, and responsive overflow. Tables retain semantic markup and horizontal scrolling where required.
- Permission checks remain capability- and permission-driven; hiding a control is never treated as server authorization.

## Verification

- Update unit tests to cover the single-menu configuration, Transactions/Recurring tabs, new Manual Journal drawer, detail drawer, inline approval/posting, inline reversal, permission/capability visibility, deep-link normalization, dirty-state handling, and recurring-template behavior.
- Preserve existing precision, required-dimension, Bank nominal, approval override, reversal, filtering, pagination, and recurring occurrence assertions.
- Run the focused Journal unit tests, UI theme audit write/check steps, `git diff --check`, and `npm.cmd run build:web`.
- Review desktop and narrow layouts, including open drawers, loading/error/empty states, focus behavior, and dark/light semantic colours.

## Non-goals

- No API, contract, database, posting-rule, authorization, or worker behavior changes.
- No conversion of mock actions into new live financial actions.
- No removal of audit evidence or source-module ownership rules.
- No unrelated Finance navigation or visual refactor.
