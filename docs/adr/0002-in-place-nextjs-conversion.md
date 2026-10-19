# ADR 0002: Convert the Prototype In Place to Next.js

- Status: accepted
- Date: 2026-10-06

## Context

The current Vinext application contains the approved navigation, terminology,
screen intent, and deep HR/Payroll mock behavior. Building a second frontend
would create two competing UX authorities. Connecting the current mock runtime
directly to production services would also mix fixture calculations with
authoritative business behavior.

## Decision

Convert the project inside the existing `prototype/` directory to an npm
workspace with a standard Next.js web application, Express API, worker, and
shared packages. Migrate screens incrementally. Preserve the frozen Wave 0
visual and behavior baseline while replacing fixture imports with typed API
queries and commands one production module at a time.

The current mock-only isolation tests remain active until Wave 1 introduces the
new runtime boundary. They are then replaced deliberately with tests that
forbid database access from the browser and forbid domain/financial logic in
Next.js components.

## Consequences

- Approved layouts and journeys remain the review baseline.
- Each converted screen has an explicit parity record and feature flag.
- Mock functions remain characterization evidence until production tests cover
  the same rules.
- A wholesale UI rewrite or parallel application is not permitted.
