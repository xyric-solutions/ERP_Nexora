# HR-BANK - Governed Payroll Payment and ISO Export

- Status: `closed`
- Theme: Secure PostgreSQL-backed salary payment from sealed Payroll through governed ISO export and reconciliation.
- Session cap: 7 items
- Active roots: `app/`, `contracts/`, `web/`, focused tests, migrations and evidence
- Source links: owner Phase B contract and approved architecture; `docs/research/2026-10-06-payroll-payment-security-and-export.md`; `docs/superpowers/specs/2026-10-06-hr-bank-design.md`; live code/schema/tests
- Handoff status target: READY
- Pre-development doc gate: READY
- Documentation evidence path: `docs/evidence/HR-BANK-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Planned model family: GPT-6.1
- Planned model variant: sol
- Planned model ID: gpt-6.1-sol
- Planned API reasoning effort: high
- Planned reasoning mode: standard
- Planned surface setting: high
- Planned delegation mode: single
- Planned max concurrent subagents: n/a
- Actual model family: GPT-6.1
- Actual model variant: sol
- Actual model ID: gpt-6.1-sol
- Actual API reasoning effort: high
- Actual reasoning mode: standard
- Actual surface setting: high
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: cryptography, sensitive data, database lifecycle, Workflow and Finance posting form one high-risk consistency boundary.
- Routing fallback: stop for unavailable vetted crypto, unsafe key handling, ambiguous payment authority or historical mutation.
- Routing escalation condition: cryptographic verification failure, cross-tenant exposure, destructive migration or unreconciled payment/Finance totals.
- Routing evidence path: this segment and `docs/evidence/HR-BANK-verification.txt`
- Routing deviation: none
- Ultra workstream map: n/a
- Shared-write isolation: n/a; single orchestrator
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/HR-BANK-verification.txt`
- Endpoint class: native
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: Phase B only; stop before HR-DEMO
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate

- [x] Live code/schema/tests are the implementation authority; approved owner design and official NIST/ISO/SBP sources govern security/format decisions.
- [x] Existing employee-bank, Payroll payment, Finance posting, Workflow, RBAC, RLS, audit and idempotency authorities identified.
- [x] Owner approved AES-256-GCM envelope encryption and ISO 20022 `pain.001.001.09` base adapter.
- [x] Security, privacy, PostgreSQL, migration, API, frontend, accessibility, reconciliation and historical gates selected.
- [x] No worker/subagent route is selected.
- [x] Gate result: READY.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-BANK-01 Encryption, IBAN and adapter domain | `app/hr/payment*.py` | complete |
| HR-BANK-02 PostgreSQL authority/migrations | HR migration 0020 | complete |
| HR-BANK-03 Payment service, Workflow and Finance integration | service/repository/runtime | complete |
| HR-BANK-04 Secured typed API | application/OpenAPI/client | complete |
| HR-BANK-05 Existing Payroll workspace integration | HR Payroll workspace | complete |
| HR-BANK-06 Verification and historical invariants | tests/evidence | complete |
| HR-BANK-07 Commit and synchronization | git | pending final commit/push |

## Completion gate

- [x] AES-256-GCM envelope encryption, rotation and fail-closed tests pass.
- [x] Pakistan IBAN validation and base ISO adapter pass.
- [x] Effective employee/company bank authority, payment lifecycle, immutable evidence and FORCE RLS pass.
- [x] Maker-checker, Finance approval, audit, privacy, idempotency and reconciliation pass.
- [x] API/UI/build/accessibility gates pass.
- [x] September Payroll, `JE-2026-09-00001`, Payroll/OT/statutory hashes remain unchanged.
- [x] Ledgers, progress, evidence, memory and next handoff are updated.
- [x] One clean HR/Payroll completion commit is pushed and synchronized.

## Closeout

- Separate immutable `hr_payroll_finance_approval_binding` preserves the exact
  historical journal-proposal serialization while binding new Payroll journals
  to the existing Finance/Workflow approval authority.
- HR migration 0020 adds encrypted effective employee bank authority,
  maker-checker export profiles, governed payment batches and immutable export
  evidence. Migration 0021 adds only the Finance approval binding.
- Application-layer AES-256-GCM envelope encryption uses deployment-provided,
  versioned key-encryption keys; PostgreSQL stores ciphertext, masks and blind
  indexes, never plaintext account identifiers.
- The initial adapter is provider-neutral ISO 20022 `pain.001.001.09`; no claim
  is made that it is directly submittable to every bank or Raast profile.
- Verification evidence: `docs/evidence/HR-BANK-verification.txt`.
