import { randomUUID } from "node:crypto";

export type BankRevaluationReversalWorkerConfig = {
  actorId: string;
  workerId: string;
  everyMs: number;
  tenantLimit: number;
  claimLimit: number;
  claimLeaseMs: number;
  retryBaseMs: number;
  retryMaximumMs: number;
};

export function readBankRevaluationReversalConfig(
  environment: NodeJS.ProcessEnv = process.env,
): BankRevaluationReversalWorkerConfig {
  const actorId = required(environment, "BANK_REVALUATION_REVERSAL_ACTOR_ID");
  const configuredWorkerId = environment.BANK_REVALUATION_REVERSAL_WORKER_ID?.trim();
  const workerId = configuredWorkerId || `fxr-${process.pid}-${randomUUID()}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(actorId))
    throw new Error("BANK_REVALUATION_REVERSAL_ACTOR_ID is invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(workerId))
    throw new Error("BANK_REVALUATION_REVERSAL_WORKER_ID is invalid");
  const retryBaseMs = boundedInteger(environment.BANK_REVALUATION_REVERSAL_RETRY_BASE_MS, 30_000, 1_000, 3_600_000);
  const retryMaximumMs = boundedInteger(
    environment.BANK_REVALUATION_REVERSAL_RETRY_MAXIMUM_MS,
    3_600_000,
    1_000,
    86_400_000,
  );
  if (retryMaximumMs < retryBaseMs)
    throw new Error("BANK_REVALUATION_REVERSAL_RETRY_MAXIMUM_MS must not be below its base");
  return {
    actorId,
    workerId,
    everyMs: boundedInteger(environment.BANK_REVALUATION_REVERSAL_EVERY_MS, 60_000, 30_000, 86_400_000),
    tenantLimit: boundedInteger(environment.BANK_REVALUATION_REVERSAL_TENANT_LIMIT, 1_000, 1, 1_000),
    claimLimit: boundedInteger(environment.BANK_REVALUATION_REVERSAL_CLAIM_LIMIT, 50, 1, 100),
    claimLeaseMs: boundedInteger(environment.BANK_REVALUATION_REVERSAL_CLAIM_LEASE_MS, 300_000, 30_000, 3_600_000),
    retryBaseMs,
    retryMaximumMs,
  };
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`Bank Revaluation reversal setting must be an integer between ${minimum} and ${maximum}.`);
  return parsed;
}
