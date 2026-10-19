# Wave 0 Prototype Baseline Evidence

- Date: 2026-10-07 PKT
- Scope: approved HR/Payroll prototype baseline only
- Status: complete; automated, visual, and keyboard baseline accepted

## Frozen catalogue

The generated manifest records **35 modules, 146 groups, and 792 pages**. The
HR parity register records **67 unique HR screens** across 11 groups:

| Group                         | Screens | Dedicated mock renderer | Generic fallback |
| ----------------------------- | ------: | ----------------------: | ---------------: |
| Organisation & Masters        |       7 |                       7 |                0 |
| People                        |       6 |                       2 |                4 |
| Recruitment                   |       7 |                       7 |                0 |
| Attendance & Shifts           |       8 |                       8 |                0 |
| Time & Leave                  |       6 |                       2 |                4 |
| Payroll                       |      10 |                       9 |                1 |
| Performance                   |       4 |                       4 |                0 |
| Learning                      |       4 |                       4 |                0 |
| Employee Lifecycle            |       8 |                       8 |                0 |
| Benefits & Self Service       |       4 |                       1 |                3 |
| Reporting, Compliance & Audit |       3 |                       3 |                0 |
| **Total**                     |  **67** |                  **55** |           **12** |

`docs/parity/catalogue-drift-review.md` records the owner-approved reconciliation
from the old 35/141/749 assertions to this live catalogue. The 12 generic
fallbacks are explicit conversion gaps, not missing parity rows.

## Automated verification

Run from `prototype/`:

| Command                       | Result                                                   |
| ----------------------------- | -------------------------------------------------------- |
| `npm.cmd run catalogue:check` | PASS; generated manifest and HR parity CSV match source. |
| `npm.cmd run lint`            | PASS; zero ESLint errors.                                |
| `npm.cmd test`                | PASS; build completed and 163/163 tests passed.          |

The full test gate includes:

- server-rendered shell and frozen catalogue assertions;
- axe WCAG A/AA checks applicable in jsdom and explicit landmark/control-name checks;
- HR organization, recruitment, attendance, leave, payroll, lifecycle,
  reporting, authorization, export, compliance, and accounting-handoff rules;
- renderer wiring before the generic fallback; and
- mock-runtime isolation and keyboard-reachability source checks.

The build reports one non-blocking warning: a client chunk exceeds 500 kB after
minification. Code splitting is deferred to the Next.js conversion wave and
must be measured there; the warning is not suppressed.

## Live HTTP check

The existing local prototype at `http://127.0.0.1:3100/` returned HTTP 200 and
the Nexora shell. This proves service reachability only; it is not visual or
interactive acceptance.

## Browser evidence status

W0-05 is complete. The Playwright baseline at `tests/e2e/baseline/` contains:

- 67 desktop screenshots at 1440 x 900, one for every HR parity row;
- 7 representative mobile screenshots at 390 x 844; and
- 4 keyboard-only journey screenshots for recruitment, attendance, payroll,
  and separation.

`npx playwright test tests/e2e/baseline.spec.ts` passed 6/6 tests in comparison
mode after generation. The journey tests use only keyboard input, prove that
focus enters global search, and verify every selected destination route.
Representative desktop, mobile, and journey images were manually inspected;
no rendering error, clipping, or error overlay was found.

The managed in-app browser remains unavailable in this environment because its
runtime fails during initialization with `Cannot redefine property: process`.
The installed Playwright Chromium runtime provided equivalent local browser
capture and repeatable pixel comparison, so this tooling fault no longer blocks
the baseline.

## Security and architecture baseline

The accepted modular-monolith and in-place Next.js conversion decisions are in
`docs/adr/`. The HR threat model and restricted/confidential data handling
rules are in `docs/security/`. They prohibit browser/database coupling,
cross-company access, executable formulas/imports, unaudited exports, and
partial payroll/payment state.
