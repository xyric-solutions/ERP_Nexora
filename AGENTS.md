# Nexora ERP — Agent Working Agreement

This repository is a working ERP prototype undergoing a careful Tailwind and
shadcn/ui migration. Follow these rules for every task unless the user gives a
more specific instruction.

## Primary outcomes

1. Preserve the current feature-first structure and all working behavior.
2. Build new or migrated UI with Tailwind utilities and the shared shadcn/ui
   primitives in `app/components/ui`.
3. Centralize genuinely reusable UI, types, constants, fixtures and helpers.
4. Retire legacy feature CSS only when no active selector depends on it.
5. Keep the application buildable after every meaningful migration batch.

## ERP workspace boundary

- Before any Nexora task, resolve this repository root from this AGENTS.md file.
- Keep Nexora source, documentation, temporary scripts, browser evidence and local
  runtime helpers inside this repository. Never use a sibling project as staging.
- Use tmp/recovered-hr-work only for the preserved historical recovery archive;
  its installer scripts are consumed history, not modules to execute or copy over
  the active app/server/packages sources. New temporary work belongs under tmp/.
- If the active workspace is a sibling repository, target this ERP repository
  explicitly using the available authorization mechanism; do not create ERP files
  in the sibling workspace.

## Repository ownership

- The repository root is the Next.js application; `app/` is its App Router
  boundary.
- `server/api` owns the independent API service; do not move it into a Next
  route without an explicit backend migration.
- `server/worker` owns asynchronous job processing and its worker runtime.
- `app/shell` owns the ERP shell, navigation and workspace composition.
- `app/features/<feature>` owns feature-specific models, components, views and
  temporary feature styles.
- `app/shared` owns cross-feature types, fixtures, constants, theme tokens and
  reusable presentation helpers.
- `app/components/ui` owns shared shadcn/ui primitives. Prefer an
  existing primitive before adding another button, input, dialog, checkbox,
  textarea, badge, table or similar common control.

Do not move files merely to make paths look shorter. Keep the current module
boundaries unless a requested refactor needs a clearly shared abstraction.

## Backend, API and data safety rules

- Treat `server/api` as the single reusable backend boundary for the web ERP
  and any future mobile application. Keep public endpoints versioned under
  `/api/v1` and evolve contracts compatibly.
- Do not connect browser code, Next.js pages, mobile clients or feature views
  directly to PostgreSQL, Redis or MinIO. They must use the API. Do not create
  a duplicate Next.js `app/api` implementation of existing API behavior unless
  the user explicitly requests a backend architecture migration.
- Keep the dependency direction: client -> API route -> authentication and
  authorization -> feature service -> repository -> database or infrastructure.
  Business rules, permissions, posting rules and audit writes belong on the
  server, never solely in UI code.
- Reuse `packages/contracts` for request/response schemas and OpenAPI output.
  Update the contract, generated client and API implementation together when
  an endpoint changes; avoid hand-written, drifting copies of API types.
- Scope every business-data query and mutation to the authenticated tenant,
  company and permitted role. Authenticate and authorize on the server even
  when the interface already hides an action.
- Validate every API request on the server. Return the standard problem/error
  format, apply pagination and bounded filtering to list endpoints, and avoid
  exposing internal errors, stack traces, credentials or infrastructure URLs.
- Use database migrations in `packages/db` for schema changes. Do not change
  a shared database manually or rely on a UI fixture as a persistent data
  source. Make migrations additive and reversible where practical; preserve
  tenant isolation, foreign keys, indexes and audit requirements.
- Treat banking, payroll, stock, accounting and other posting workflows as
  high-risk. Use explicit lifecycle states (for example draft, submitted,
  approved, posted), server-side approval/permission checks, immutable audit
  history, transaction boundaries and idempotency keys before enabling live
  posting. Do not silently turn a mock action into a real financial action.
- Use Redis only for appropriate transient concerns such as sessions,
  throttling, selections, queues and caching; PostgreSQL remains the source of
  truth for ERP business records. Use `server/worker` for asynchronous work,
  with durable job state where required.
- The browser web session is cookie-based. If mobile support is added, keep
  the same API/domain contracts but design a dedicated short-lived access-token
  and refresh-token flow with secure device storage; never reuse database
  credentials or embed long-lived secrets in a mobile app.
- Migrate mock screens through a feature-level data adapter: schema/migration
  -> repository -> service -> documented API -> API tests -> generated client
  -> screen. Keep a deliberate mock fallback only while that feature is being
  transitioned, and remove it only after end-to-end verification.
- Before reporting a feature as live, verify migrations, authorization,
  validation, audit behavior, API integration tests, frontend integration and
  a production build. Clearly label unfinished interfaces as mock/prototype.

## Tailwind and CSS migration rules

- Use Tailwind classes for all new UI and for presentation work on an existing
  screen.
- Prefer semantic, readable JSX and small reusable components over enormous
  duplicated class strings. If a Tailwind presentation pattern is used by two
  or more independent features, place an appropriately scoped shared component
  in `app/shared/ui` or use an existing shadcn primitive.
- Keep `app/globals.css` as the permitted Tailwind entry point. It may
  contain Tailwind setup, shared token mapping and minimal global behavior that
  cannot belong to a component.
- Keep design tokens and print support only where needed. Do not add a new
  feature stylesheet for a new screen.
- Do not remove or overwrite a legacy CSS file because part of a screen has
  been converted. First verify all selectors it owns are unused in active TS/
  TSX source.
- Use `rg` to verify selectors before removing a stylesheet or its import. Be
  mindful of parent selectors: a class may be safe to retain only if the parent
  selector can no longer match.
- Retain data attributes needed by `app/shared/styles/print.css` when migrating
  printable layouts.

## Global font, theme and colour consistency

- On every page or component task, inspect its own styles and the shared controls,
  dialogs, tables, charts and stylesheets it uses for font/theme/colour overrides.
- Use app/shared/styles/typography.css for font tokens, app/shared/styles/theme-colors.css
  for semantic colours and app/globals.css for Tailwind mappings. Keep font loading
  in app/layout.tsx. Existing serif/display aliases resolve to the global sans font;
  code and identifiers may use the global mono token.
- Use semantic Tailwind utilities or --nx-* tokens. Do not introduce page-specific
  font families, a second theme palette, fixed Tailwind palette utilities or literal
  colours for ordinary UI states. Add a reusable semantic role centrally when needed.
- Preserve deliberate brand artwork, chart encodings and monochrome print output;
  document any necessary exception instead of replacing it blindly.
- When changing a screen, resolve its affected overrides without breaking existing
  behavior. Check light/dark, hover/focus/disabled/error/empty states and desktop,
  tablet and mobile widths. Never mark the screen complete from appearance alone.
- Run node scripts/audit-ui-theme.mjs --write after UI changes, review its findings,
  and run node scripts/audit-ui-theme.mjs --check before handoff. Record remaining
  exceptions and browser evidence in docs/architecture/remaining-ui-migration.md.
- The audit percentage uses feature view source files. Do not call it a percentage
  of all menu screens; shared renderers and dependencies require route-level checks.

## Centralization rules

- Centralize only real common behavior. Do not create a shared component for a
  one-screen layout solely to reduce file count.
- Keep feature calculations, permissions, mock workflows, models and fixtures
  within their feature unless they are used by another feature.
- Reuse shared constants/configuration rather than repeating labels, route
  configuration, token values or common options.
- Do not duplicate types or fixture data while changing presentation code.
- Keep user-facing behavior unchanged: links, routes, handlers, keyboard
  behavior, selection state, form validation, mock calculations, access checks
  and no-posting safeguards must continue to work.

## Safe workflow for UI work

1. Read the relevant feature view, component, stylesheet and any local
   `AGENTS.md` instructions before editing.
2. Search for existing shared primitives and patterns before creating one.
3. Work in one feature or one coherent surface at a time.
4. Preserve public props, route behavior, action callbacks and data contracts.
5. Replace legacy presentation classes with Tailwind in focused batches.
6. Before deleting a stylesheet, run a selector search similar to:

   ```powershell
   rg -n "selector-name|other-selector" app --glob "*.tsx" --glob "*.ts" --glob "*.css"
   ```

7. Remove the import from `app/layout.tsx` only after that verification.
8. Run both checks after each completed batch:

   ```powershell
   git diff --check
   npm.cmd run build:web
   ```

9. Update `docs/architecture/remaining-ui-migration.md` with completed work,
   remaining work and the safe resume point.

## Quality bar

- Maintain responsive behavior for desktop and narrow screens.
- Preserve visible focus, disabled, error, empty, success and destructive
  states.
- Preserve accessible labels, button types, table semantics, keyboard actions
  and `aria-*` behavior.
- Use `Button`, `Input`, `Textarea`, `Checkbox`, `RadioGroup`, `Badge`,
  `Dialog` and other shadcn primitives where appropriate.
- Native selects are acceptable where they preserve a dense ERP workflow; style
  them with Tailwind rather than reintroducing page-scoped CSS.

## Do not do these things

- Do not delete CSS, files, feature folders or imports without selector and
  usage verification.
- Do not replace working business logic with static UI during a styling task.
- Do not move feature code into unrelated directories without a clear ownership
  reason.
- Do not expose or modify `.env` values unless the user explicitly requests it.
- Do not use destructive Git commands such as `reset --hard` or discard user
  changes.

## Required handoff

When reporting a completed batch, state:

- Which views/components/styles were changed or retired.
- What behavior was intentionally preserved.
- The exact verification performed and whether it passed.
- What remains, if the migration is not fully complete.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
