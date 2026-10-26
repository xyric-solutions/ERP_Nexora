import { describe, expect, it, vi } from "vitest";

import {
  BankRevaluationReversalJobError,
  processBankRevaluationReversals,
  type BankRevaluationReversalClaim,
  type BankRevaluationReversalOptions,
  type BankRevaluationReversalRepository,
} from "../../server/worker/src/jobs/bank-revaluation-reversal.js";
import { readBankRevaluationReversalConfig } from "../../server/worker/src/revaluation-config.js";

const now = new Date("2026-10-26T12:00:00.000Z");
const options: BankRevaluationReversalOptions = {
  now,
  actorId: "revaluation.worker",
  workerId: "worker-1",
  tenantLimit: 100,
  claimLimit: 25,
  claimLeaseMs: 60_000,
  retryBaseMs: 30_000,
  retryMaximumMs: 300_000,
};

function claim(overrides: Partial<BankRevaluationReversalClaim> = {}): BankRevaluationReversalClaim {
  return {
    tenantId: "tenant-1",
    companyId: "company-1",
    scheduleId: "schedule-1",
    revaluationId: "revaluation-1",
    scheduledDate: "2026-10-01",
    attemptCount: 1,
    workerId: options.workerId,
    ...overrides,
  };
}

function repository(claims: BankRevaluationReversalClaim[] = [claim()]): BankRevaluationReversalRepository {
  return {
    listActiveTenants: vi.fn(async () => ({ tenantIds: ["tenant-1"], truncated: false })),
    claimDue: vi.fn(async () => claims),
    reverse: vi.fn(async () => undefined),
    recordFailure: vi.fn(async () => undefined),
  };
}

describe("Bank Revaluation automatic reversal worker", () => {
  it("processes bounded tenant claims and records successful reversals", async () => {
    const repo = repository([claim(), claim({ scheduleId: "schedule-2", revaluationId: "revaluation-2" })]);
    await expect(processBankRevaluationReversals(options, repo)).resolves.toEqual({
      tenantsScanned: 1,
      claimed: 2,
      reversed: 2,
      pending: 0,
      failed: 0,
      tenantScanTruncated: false,
    });
    expect(repo.claimDue).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorId: options.actorId,
      workerId: options.workerId,
      now,
      limit: options.claimLimit,
      leaseMs: options.claimLeaseMs,
    });
  });

  it("keeps a closed-period reversal pending with bounded exponential backoff and safe evidence", async () => {
    const due = claim({ attemptCount: 3 });
    const repo = repository([due]);
    repo.reverse = vi.fn(async () => {
      throw new BankRevaluationReversalJobError(
        "REVALUATION_REVERSAL_PERIOD_NOT_OPEN",
        true,
        "internal diagnostic text",
      );
    });
    await expect(processBankRevaluationReversals(options, repo)).resolves.toMatchObject({
      claimed: 1,
      reversed: 0,
      pending: 1,
      failed: 0,
    });
    expect(repo.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        claim: due,
        errorCode: "REVALUATION_REVERSAL_PERIOD_NOT_OPEN",
        keepPending: true,
        nextAttemptAt: new Date("2026-10-26T12:02:00.000Z"),
      }),
    );
  });

  it("retries an unexpected infrastructure failure using an opaque code without leaking internals", async () => {
    const repo = repository();
    repo.reverse = vi.fn(async () => {
      throw new Error("postgresql://secret:password@internal.example.invalid/private");
    });
    await processBankRevaluationReversals(options, repo);
    expect(repo.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "REVALUATION_REVERSAL_FAILED", keepPending: true }),
    );
  });

  it("rejects unbounded job configuration before scanning tenants", async () => {
    const repo = repository();
    await expect(processBankRevaluationReversals({ ...options, claimLimit: 101 }, repo)).rejects.toThrow("claim limit");
    expect(repo.listActiveTenants).not.toHaveBeenCalled();
  });

  it("requires an explicitly configured actor and validates production bounds", () => {
    expect(() => readBankRevaluationReversalConfig({})).toThrow("BANK_REVALUATION_REVERSAL_ACTOR_ID is required");
    expect(() =>
      readBankRevaluationReversalConfig({
        BANK_REVALUATION_REVERSAL_ACTOR_ID: "worker.actor",
        BANK_REVALUATION_REVERSAL_CLAIM_LIMIT: "101",
      }),
    ).toThrow("between 1 and 100");
  });
});
