# Manual Journal compact layout and actions

Status: approved by the owner on 17 November 2026.

## Scope

Update the existing New/Edit Manual Journal drawer and its shared line editor.
Preserve the Finance register, recurring workflow, API contracts, financial
precision, posting rules, permission checks, audit history and live credentials.

### Follow-up repair

The owner reported Approve & Close appearing inactive with final review unchecked
and empty descriptions. Keep the action clickable when its permission and request
state permit it; clicking validates fields, dimensions, review and override reasons
together and focuses the visible error summary. Explicit confirmation remains
mandatory before any save/submit/post sequence; a click never implies consent.

Finance must retain the existing July–June company calendar and propose its next
year from the stored end date. The first-year proposal uses the saved organisation
setup month; absent both sources, leave the proposal empty rather than inventing
January. Prefer the calendar covering today when no valid saved selection exists.
Do not overwrite typed proposals after a delayed lookup. Calendar dates and period
statuses remain governed by existing server APIs. Reopening a Soft Closed period
requires a separate explicit owner choice; no journal is posted for verification.

## Layout

Remove the Required Dimensions column, mobile heading and empty placeholders.
Show an account's required dimension inputs compactly beneath its nominal
selector only when that account requires them. Preserve existing dimension values,
accessible labels, account-change resets and frontend/server validation. Removing
all dimension entry would make valid journals impossible for those accounts.

Use a five-column desktop table: Nominal Account, Description, Debit, Credit,
Action. Keep responsive line cards at narrow widths. Tighten the drawer title and
description margins, date/reference grouping, row padding, section gaps and totals.
Use semantic Tailwind tokens and existing shared controls. Keep line Add/Remove
controls because they edit transaction content; preserve the minimum two lines.

## Form actions

The form footer contains only Save Draft and Approve & Close as permitted primary
actions. Remove the duplicate Cancel button; the existing top-right close control,
Escape and unsaved-change guard remain. Keep draft deletion available in the
record detail context, retaining its reason, confirmation and server capability.

Save Draft uses the existing create/update API and preserves the current saved
record navigation. Approve & Close validates current input, saves it and submits
the latest saved version through the existing APIs. It must never submit stale
persisted lines when the editor has unsaved changes.

Approved approval behavior:

- An authorized self-approver or permitted Super Administrator completes the
  existing explicit final-review confirmation. Require the existing override
  reason when applicable. Then call the existing approval decision API and close
  to the refreshed register only after successful posting.
- A user who cannot approve their own journal submits it to the existing approval
  queue and closes with explicit Awaiting approval feedback. Never report it as
  approved or weaken server authorization. Make this outcome clear before action.
- Do not add a separate approved state: the current server approval posts the
  Journal. Existing independent review and approval screens remain available.

The owner selected queue submission for preparers who cannot approve themselves,
keeping the two-action entry workflow usable for both roles.

## Configuration and failure handling

Centralize action visibility in a small typed Finance-owned configuration that
can hide optional actions; combine it with existing permissions/capabilities.
Configuration affects rendering only and never grants authority or disables
validation. Do not add a database-backed button administration screen.

Guard concurrent clicks and retain operation identifiers/idempotency keys across
retryable requests. Carry the returned record ID and version through every
successful step. If submission or approval fails after saving, retain the saved
record identity and actual server state so retry cannot create a duplicate.
Keep the drawer open on failure, display safe API feedback and prevent editing a
submitted record. Preserve unsaved-state handling and refresh on completion.

## Verification and local activation

Add focused tests for the five-column layout, conditional dimensions, the two
primary actions, configuration hiding, required fields/balance, unsaved edits,
permissions, final review, override reason, successful closure, partial failures,
duplicate clicks and retries. Retain recurring editor and deletion regressions.
Run Journal unit/contract tests and the existing disposable database hardening
suite where relevant; never post synthetic records to the business database.

Update the existing Journal browser tests for current active-company session
fixtures and check desktop/tablet/mobile light/dark layouts, keyboard access and
Axe. Run typecheck, changed-file lint, theme audit write/check, diff check and
production web builds. Record evidence and remaining exceptions in the migration
checklist. Apply only compatible frontend changes to the active local release;
preserve the Purchase currency API repair, schema and pending extension boundaries.
