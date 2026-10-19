# S1.1 Runtime Selection Findings

- Date: 2026-07-28
- Decision: Python 3.11, dependency-free ASGI 3 application shell
- Status: FINAL for S1.1; later batches may add a production ASGI server or
  framework without changing the public contract.

## Evidence

| Source | Date / version | Credibility | Relevant finding |
|--------|----------------|-------------|------------------|
| [ASGI 3.0 specification](https://asgi.readthedocs.io/en/latest/specs/main.html) | 2019-03-20, current ASGI base specification | Primary specification | An ASGI application is a standard async interface over `scope`, `receive`, and `send`, preserving server/framework choice. |
| [ASGI HTTP message specification](https://asgi.readthedocs.io/en/latest/specs/www.html) | HTTP sub-spec 2.5, 2024-06-05 | Primary specification | Defines the request and response events used by the shell and its integration tests. |
| [OpenAPI 3.1.1 specification](https://spec.openapis.org/oas/v3.1.1.html) | 2024-10-24 | Primary specification | A language-neutral API description provides paths and schemas that consumers and contract tests can inspect. |
| [Python 3.11 unittest documentation](https://docs.python.org/3.11/library/unittest.html#test-discovery) | Python 3.11 | Official runtime documentation | The standard library supports deterministic test discovery and isolated async tests without adding an unavailable package-manager dependency. |
| [IETF Idempotency-Key draft 07](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/07/) | 2025-10-15; expired 2026-04-18 | Primary working-group draft, non-normative | Supports the already-locked use of request keys for retry-safe POST/PATCH operations and treating reuse with a different payload as a conflict. |

## Application to Nexora

Python 3.11 is the only runnable application environment discovered locally.
Node.js, .NET, Go, Java, Docker, and a browser runtime are absent. A direct ASGI
implementation lets S1.1 produce executable route, context, error, pagination,
ETag, idempotency, correlation, and rate-limit behavior now without inventing a
dependency that cannot be installed or tested.

The public surface remains framework-neutral. `contracts/openapi-v1.json` and
the locked binding standards are the compatibility boundary, so a later move to
an ASGI framework must pass the same contract tests.

## Limitations

- The shell is exercised in-process at the ASGI boundary; no production ASGI
  server is installed on this machine.
- The IETF Idempotency-Key document is expired work in progress, not a standard.
  Nexora's locked architecture remains the authority for the convention.
- Deployment, durable idempotency storage, external identity verification, WAF,
  and distributed rate limiting belong to later segments.
