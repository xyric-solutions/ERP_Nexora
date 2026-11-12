# Bank Navigation Consolidation

## Goal

Keep the Bank sidebar focused on the primary `Bank` group. Remove the separate
`Transaction Entry`, `Bank Accounts`, and `Treasury & Instruments` groups from
navigation because their workflows are already represented by the consolidated
Bank experience.

## Scope

- Hide the three redundant groups from navigation.
- Preserve every existing page definition, route, component, permission check,
  API interaction, and direct-link behavior.
- Keep the primary `Bank` group and its seven visible pages unchanged.
- Do not change other modules.

## Considered Approaches

1. **Group-level navigation visibility (selected).** Add an optional visibility
   flag to navigation groups and have the shared shell omit hidden groups. This
   preserves route resolution and provides an explicit, reusable catalogue
   capability without embedding Bank-specific IDs in the renderer.
2. **Bank-specific renderer filter.** Filter the three IDs inside the sidebar
   component. This is smaller initially but couples the generic shell to one
   feature and is harder to maintain.
3. **Delete the groups and pages from the catalogue.** This removes the menu but
   also breaks direct links and internal navigation, so it is rejected.

## Design

Extend `PrototypeMenuGroup` with an optional `hiddenFromNavigation` property.
Update the group factory to accept the property, mark the three redundant Bank
groups as hidden, and filter hidden groups only at navigation rendering and
navigation-derived discovery surfaces. Route/page lookup continues to use the
complete catalogue.

## Verification

- Extend the shell navigation regression test to assert that the Bank sidebar
  exposes only the `Bank` group and its seven visible pages.
- Assert that a page from a hidden group remains present in the catalogue so
  direct routing is preserved.
- Run focused tests, targeted ESLint, TypeScript checks, theme audit,
  `git diff --check`, and the production web build.
- Restart only the web service on port 3000 after the successful build and
  verify the site and API readiness on ports 3000 and 4000.

## Risks

The main risk is applying the visibility filter to route resolution instead of
navigation only. Tests will explicitly protect direct-route catalogue access.
