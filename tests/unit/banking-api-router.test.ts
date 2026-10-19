import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import type { BankingRepository } from "../../server/api/src/modules/banking/router.js";
import { BankingApiError } from "../../server/api/src/modules/banking/source-repository.js";

const session = {
  sessionId: "session-banking-1",
  tenantId: "tenant-banking",
  userId: "user-banking",
  csrfToken: "b".repeat(43),
  idleExpiresAt: new Date("2026-10-20T13:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-10-20T20:00:00.000Z"),
};

function appForBanking(repository: Partial<BankingRepository>) {
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: session.tenantId,
      organizationName: "Nexora Banking",
      userId: session.userId,
      email: "banking@example.test",
      displayName: "Banking User",
      roles: ["banking_manager"],
      permissions: [
        "banking.bank_account.read",
        "banking.bank_account.create",
        "banking.bank_account.update",
        "banking.bank_account.submit",
        "banking.bank_account.approve",
        "banking.bank_account.status",
      ],
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, csrfToken: string) =>
      csrfToken === session.csrfToken ? { status: "ok" as const, session } : { status: "invalid_csrf" as const },
    ),
  } as unknown as TenantSessionApiService;
  return createApp({
    config: { allowedOrigins: new Set(["https://banking.example.test"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: authentication,
    sessionService: sessions,
    bankingRepository: repository as BankingRepository,
  });
}

describe("Banking API foundation", () => {
  it("keeps the account directory behind an authenticated session and parses bounded filters", async () => {
    const repository = {
      listAccounts: vi.fn(async () => ({ items: [], next_cursor: null })),
    };
    const blocked = await request(appForBanking(repository)).get(
      "/api/v1/banking/accounts?company_id=company-a&limit=25",
    );
    expect(blocked.status).toBe(401);
    expect(repository.listAccounts).not.toHaveBeenCalled();

    const accepted = await request(appForBanking(repository))
      .get(
        "/api/v1/banking/accounts?company_id=company-a&search=Operating&currency=USD&state=active&sort_by=bank_name&sort_direction=desc&limit=25",
      )
      .set("cookie", "nexora_session=token-banking");
    expect(accepted.status).toBe(200);
    expect(repository.listAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: session.tenantId,
        actor: expect.objectContaining({ userId: session.userId }),
      }),
      {
        company_id: "company-a",
        search: "Operating",
        currency: "USD",
        state: "active",
        sort_by: "bank_name",
        sort_direction: "desc",
        limit: 25,
      },
    );
  });

  it("rejects invalid directory bounds before reaching persistence", async () => {
    const repository = { listAccounts: vi.fn() };
    const response = await request(appForBanking(repository))
      .get("/api/v1/banking/accounts?company_id=company-a&limit=101")
      .set("cookie", "nexora_session=token-banking");
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REQUEST");
    expect(repository.listAccounts).not.toHaveBeenCalled();
  });

  it("protects account creation with origin, CSRF, idempotency, and strict contract parsing", async () => {
    const repository = {
      createAccount: vi.fn(async () => ({
        id: "bank-account-1",
        reference: "BA-2026-0001",
        state: "draft" as const,
        version: 1,
        audit_event_id: "audit-1",
        replayed: false,
      })),
    };
    const payload = {
      company_id: "company-a",
      account_name: "Operating USD",
      account_type: "current",
      bank_name: "First Meridian Bank",
      account_number: "001234567890",
      currency: "USD",
      ledger_account_id: "ledger-bank-usd",
    };
    const untrusted = await request(appForBanking(repository))
      .post("/api/v1/banking/accounts")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://untrusted.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "bank-create-1")
      .send(payload);
    expect(untrusted.status).toBe(403);
    expect(untrusted.body.code).toBe("ORIGIN_VALIDATION_FAILED");

    const accepted = await request(appForBanking(repository))
      .post("/api/v1/banking/accounts")
      .set("cookie", "nexora_session=token-banking")
      .set("origin", "https://banking.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "bank-create-1")
      .send(payload);
    expect(accepted.status).toBe(201);
    expect(repository.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      expect.objectContaining({ ...payload, opening_balance: "0", overdraft_limit: "0" }),
      "bank-create-1",
      expect.any(String),
    );
  });

  it("maps safe Banking domain errors to the standard problem response", async () => {
    const repository = {
      getAccount: vi.fn(async () => {
        throw new BankingApiError(404, "BANK_ACCOUNT_NOT_FOUND", "The bank account is unavailable.");
      }),
    };
    const response = await request(appForBanking(repository))
      .get("/api/v1/banking/accounts/bank-account-1")
      .set("cookie", "nexora_session=token-banking");
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ status: 404, code: "BANK_ACCOUNT_NOT_FOUND" });
  });
});
