# Chart of Accounts stale local runtime

## 2026-11-03

- Report: browser still showed the six legacy Chart of Accounts menu entries.
- Source already exposes Categories, Sections, and Nominals; hidden aliases remain routable.
- The active port-3000 Next.js process started at 15:31, before the current build at 19:32.
- Restarted only the verified repository web process against the current production build.
- New web process: 42468. Logs: `tmp/coa-workspaces-web.stdout.log` and `tmp/coa-workspaces-web.stderr.log`.
- Verification: root HTTP 200; all 22 referenced static assets HTTP 200; the served JavaScript contains both `coa-categories` and `coa-sections`.
- API readiness remains HTTP 200 with every dependency check `ok`.
- Browser automation initialization failed before and after reset, so the existing browser tab could not be refreshed or inspected.

## Remaining runtime work

- API process 65420 started at 14:14 and predates the updated hierarchy implementation.
- Its launch environment is not inherited by the agent shell and this repository has no `.env` file. The runtime helper expects that missing file and also targets a different database port from the documented active API database.
- Kept the API running rather than replace its database, authentication, or encryption configuration with guessed values.
- The original API launch configuration must be restored before restarting it to activate automatic Section/Category allocation and the hierarchy aggregate response fields.
- Refresh the browser tab to load the updated three-item navigation from port 3000.
