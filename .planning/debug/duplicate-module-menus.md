# Duplicate module menus

## Symptoms

- **Expected:** Every expanded module group renders each permitted navigation page once.
- **Actual:** Normal page links render twice in sequence in every expanded module group.
- **Errors:** No runtime error was reported.
- **Reproduction:** Open `http://127.0.0.1:3000`, expand a module and one of its groups. For example, Bank > Bank shows Account Balances through Revaluation twice.

## Investigation

### Hypotheses

1. The shared navigation catalogue contains duplicated groups or pages.
2. Module-specific menu composition appends the same pages twice.
3. The shared sidebar renderer iterates over the same page collection twice.

### Evidence

- `app/shell/config/prototype-data.ts` declares the Bank group once and each Bank page once.
- `app/shell/prototype-shell.tsx` renders `group.pages.map(...)` and then immediately renders `group.pages.filter((page) => !page.hiddenFromNavigation).map(...)` inside the same list.
- The first pass includes every page; the second pass includes every visible page. This exactly predicts the screenshot: ordinary pages appear twice, while pages marked `hiddenFromNavigation` appear only in the first pass.
- The duplicated loops are in the shared module/group renderer, which explains why the regression affects every module rather than Bank alone.

## Root cause

An obsolete unfiltered `group.pages.map(...)` render pass remained beside the intended filtered render pass in the shared sidebar. React accepts both arrays, so the UI duplicates entries without throwing an error.

## Fix plan

1. Add a shell-level regression test proving the active group contains one link per visible catalogue page.
2. Remove only the obsolete unfiltered render pass.
3. Preserve the filtered pass, active-page mapping, click handlers, status labels, nesting and expansion state.
4. Run the focused test, lint/type/build checks, theme audit and a runtime verification after restarting the web server if the build replaces `.next`.

## Verification

- Focused regression test failed before the fix with 14 rendered Bank links versus 7 expected, then passed after the fix.
- Adjacent navigation suite passed: 4 files, 6 tests.
- Targeted ESLint passed for the shared shell and regression test.
- Repository TypeScript project checks passed.
- UI theme audit write/check passed with 0 feature-view font exceptions and 0 feature-view colour exceptions.
- `git diff --check` passed.
- Next.js 16.3.8 production web build passed.
- The rebuilt web server was restarted on `127.0.0.1:3000`; root returned HTTP 200 and all 22 referenced static assets returned HTTP 200.
- API readiness on port 4000 remained HTTP 200.
- Windows browser automation exited during initialization and again after the required reset/retry, so no new authenticated screenshot was captured. The jsdom shell regression test directly validates the rendered navigation DOM.

## Resolution

Resolved. The shared sidebar now uses only the visibility-filtered page render pass, so every permitted child appears once and hidden route aliases remain absent from navigation.
