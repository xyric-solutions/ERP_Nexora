# ADR 0001: Use a TypeScript Modular Monolith

- Status: accepted
- Date: 2026-10-06

## Context

The HR and Payroll system serves one customer, multiple companies, and up to
5,000 employees. Employee, attendance, leave, payroll, payment, audit, and
workflow changes frequently require one database transaction. The operating
team should not carry distributed-system complexity without a demonstrated
need.

## Decision

Use one Node.js and Express.js backend deployed as a modular monolith. Each
domain owns its routes, application services, domain rules, repositories, jobs,
events, and tests. Modules may communicate only through exported application
interfaces or domain events. They may not write another module's tables.

PostgreSQL provides transactional integrity. Redis/BullMQ handles long-running
or retryable work, and an outbox/inbox pattern protects external integrations.

## Consequences

- Cross-domain financial operations remain atomic and testable.
- One API and worker release train is sufficient for release one.
- Import-boundary tests are mandatory to prevent the monolith becoming tangled.
- A module may be extracted later only when production scaling or ownership
  evidence justifies the operational cost.
