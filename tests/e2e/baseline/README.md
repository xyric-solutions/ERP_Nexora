# Wave 0 HR Visual Baseline Capture

This directory contains the browser evidence captured from the frozen
prototype before Wave 2 feature development. The authoritative screen list is
`docs/parity/hr-screen-parity.csv`; it contains all 67 HR screens exactly once.

## Captured evidence

1. `desktop/` contains all 67 parity-register screens at 1440 x 900, named
   `<group-id>--<page-id>.png`.
2. `mobile/` contains these seven representative screens at 390 x 844:
   `employees`, `recruitment-pipeline`, `monthly-attendance`, `leave-requests`,
   `payroll-runs`, `offboarding`, and `hr-report-centre`.
3. `journey--*.png` contains the final screen from each keyboard-only journey.
4. `tests/e2e/baseline.spec.ts` regenerates the evidence only when explicitly
   invoked with `--update-snapshots`; a normal run compares against it.

## Critical journeys

| Journey     | Start                   | Required path                                                                                                | Expected evidence                                                                                     |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Recruitment | `manpower-requisitions` | approved requisition -> opening -> candidate pipeline -> interview -> offer                                  | Approved headcount remains visible; interview evidence is independent; out-of-range offer is blocked. |
| Attendance  | `shifts`                | shifts -> daily attendance -> attendance corrections -> monthly attendance -> period close -> payroll inputs | Raw punches remain visible; exceptions precede lock; payroll receives only locked days/hours.         |
| Payroll     | `payroll-inputs`        | inputs -> payroll run -> review -> journal -> payment batch -> payslip                                       | Approval/status gates remain visible; journal balances; payment reference precedes paid status.       |
| Separation  | `resignations`          | resignation -> exit clearance -> final settlement -> offboarding                                             | Clearance blocks settlement; settlement is auditable; access removal is represented.                  |

## Verification

On 2026-10-07 PKT, Chromium captured 67 desktop images, 7 mobile images, and 4
keyboard-journey images. A second comparison-only run completed with 6/6 tests
passing. Representative desktop, mobile, and journey images were also manually
inspected for rendering errors, clipping, and error overlays.
