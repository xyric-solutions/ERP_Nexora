# Payroll Payment Security and Export Research

Date: 2026-10-06

## Decision

Phase B uses application-level AES-256-GCM envelope encryption, versioned keys supplied by deployment secret management, Pakistan IBAN validation, and an isolated ISO 20022 `pain.001.001.09` export adapter. PostgreSQL remains authoritative for encrypted records, lifecycle state, hashes, audit references, and immutable export evidence. Plaintext account identifiers and keys are never persisted.

## Sources

- NIST SP 800-38D (November 2007, revision work announced 2024-2026) defines GCM as authenticated encryption. Nexora uses a fresh 96-bit nonce for each AES-GCM operation and treats authentication failure as a hard error: <https://csrc.nist.gov/pubs/sp/800/38/d/final>.
- PyCA `cryptography` 50.0.2 (released 2026-09-30) is the vetted Python library used for the `AESGCM` primitive. It supports the repository's Python 3.11+ runtime and prevents a custom cryptographic implementation: <https://pypi.org/project/cryptography/>.
- The ISO 20022 Registration Authority publishes the Payments Initiation message definitions and schemas. `pain.001.001.09` is retained as the owner-approved initial provider-neutral profile; bank-specific conformance remains a separate adapter concern: <https://www.iso20022.org/iso-20022-message-definitions>.
- State Bank of Pakistan's IBAN implementation guidelines require Pakistan IBANs to use `PK`, two check digits, a four-letter bank identifier and a 16-character account portion, with ISO 13616 checksum validation: <https://www.sbp.org.pk/psd/2012/IBAN-Guidelines-CL02-2012.pdf>.
- SBP's 2015 implementation notice confirms the fixed 24-character Pakistan IBAN field: <https://www.sbp.org.pk/circulars/psd-circular-letter-no-01-of-2015>.

## Application to Nexora

1. Every protected value gets a random data-encryption key. AES-256-GCM encrypts the value with record-bound associated data. A versioned key-encryption key wraps the data key with separate nonce/AAD.
2. A separately configured HMAC key produces a blind index for controlled duplicate detection; it never replaces IBAN validation.
3. Key configuration is injected, redacted from representations, and optional for unrelated application startup. Bank writes, validation, export, and file retrieval fail closed when a required key version is absent.
4. The ISO adapter consumes immutable Payroll-derived payment amounts and validated bank authorities. Payroll does not know XML or bank profiles.
5. Base ISO export is not described as directly submittable to a bank or Raast unless a later configured adapter proves that exact profile.

## Limitations

- The base ISO profile is an interchange adapter, not a claim of bank acceptance.
- Deployment secret-manager selection remains operational; the application contract accepts externally injected versioned keys and does not create or store them.
- Bank submission APIs are not part of Phase B. Submission status is governed evidence recorded after an authorized external submission.
