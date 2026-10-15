# Nexora Web MVP structure

This project is being migrated safely from a flat prototype folder to a feature-first structure. Routes remain thin; business fixtures and behaviour stay close to the feature that owns them.

## Target layout

```text
apps/web/app/                 Next.js routes only
apps/web/src/
  shared/config/              Next.js runtime configuration and environment access
  features/                   Next.js-only features, such as authenticated security
  lib/                        HTTP and session services
app/
  shared/
    theme/                    theme configuration and provider
    styles/                   global reset, tokens, typography and controls
    config/                   application-wide UI configuration
    constants/                stable application-wide constants
    fixtures/                 deterministic fixtures used by several features
    types/                    reusable TypeScript contracts
    ui/                       reusable UI components
  shell/
    config/                   ERP navigation catalogue and mature-module registry
    styles/                   shell-only CSS
    prototype-shell.tsx       shared ERP chrome and navigation orchestration
    prototype-content.tsx     feature composition boundary
  features/
    <feature>/
      model/                  types, fixtures, calculations and selectors
      views/                  page-level React views
      components/             reusable UI local to the feature
      presenters/             view-state and interaction orchestration
      styles/                 CSS that belongs only to the feature
  layout.tsx                  global CSS order, font setup and providers
```

## Ownership rules

- A route in `apps/web/app` authenticates and composes a feature; it does not hold feature data or page UI.
- `shared` contains only code reused across independent features. Do not put feature-specific files there.
- A feature exposes its own model, views, components and styles. Cross-feature imports must use its public surface, not reach into unrelated files.
- Global CSS is imported only by `app/layout.tsx`, in its declared order. Theme colours, typography and geometry remain separate files.
- New files must not be added directly under `app/` unless they are a root layout, page, or shell concern.
- Move one feature at a time, run the type check and production build, then continue. Do not mix visual redesign with structural migration.

## Completed reference migration

The migration is complete for Dashboard, Banking, HR, AI, Commerce/Documents, Reports, Manufacturing, Master Data, Finance, Fleet and Drill. Each owns its fixtures in `model`, page-level screens in `views`, reusable feature UI in `components`, and feature CSS in `styles` where applicable.

## Migration order

1. Shared foundation: theme, global styles, configuration and constants.
2. Dashboard: the reference implementation for subsequent features.
3. Banking, HR, reports, manufacturing, documents and AI workspaces: one vertical feature at a time. (Completed.)
4. Extract a presenter only where a view has substantial interaction state; simple presentational views do not need artificial layers.
