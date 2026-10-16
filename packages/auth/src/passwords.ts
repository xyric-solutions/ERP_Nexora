import { pbkdf2 as pbkdf2Callback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { argon2id, hash, needsRehash, verify } from "argon2";

const pbkdf2 = promisify(pbkdf2Callback);
const pbkdf2Prefix = "$pbkdf2-sha256$";

export const passwordHashParameters = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export const passwordPolicy = {
  minimumLength: 8,
  maximumLength: 128,
  maximumBytes: 512,
  historyDepth: 5,
} as const;

export type PasswordPolicyViolation =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_TOO_LARGE"
  | "PASSWORD_CONTAINS_NULL"
  | "PASSWORD_CONTAINS_IDENTIFIER"
  | "PASSWORD_REUSED"
  | "PASSWORD_MISSING_UPPERCASE"
  | "PASSWORD_MISSING_LOWERCASE"
  | "PASSWORD_MISSING_NUMBER"
  | "PASSWORD_MISSING_SYMBOL";

export class PasswordPolicyError extends Error {
  readonly code = "PASSWORD_POLICY_REJECTED";

  constructor(readonly violations: readonly PasswordPolicyViolation[]) {
    super("Password does not meet the security policy.");
  }
}

export function validatePassword(
  password: string,
  loginIdentifier?: string,
  configured?: {
    minimumLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSymbol: boolean;
  },
): void {
  const violations: PasswordPolicyViolation[] = [];
  const length = [...password].length;
  if (length < (configured?.minimumLength ?? passwordPolicy.minimumLength)) violations.push("PASSWORD_TOO_SHORT");
  if (length > passwordPolicy.maximumLength) violations.push("PASSWORD_TOO_LONG");
  if (Buffer.byteLength(password, "utf8") > passwordPolicy.maximumBytes) violations.push("PASSWORD_TOO_LARGE");
  if (password.includes("\0")) violations.push("PASSWORD_CONTAINS_NULL");
  if (configured?.requireUppercase && !/[A-Z]/.test(password)) violations.push("PASSWORD_MISSING_UPPERCASE");
  if (configured?.requireLowercase && !/[a-z]/.test(password)) violations.push("PASSWORD_MISSING_LOWERCASE");
  if (configured?.requireNumber && !/[0-9]/.test(password)) violations.push("PASSWORD_MISSING_NUMBER");
  if (configured?.requireSymbol && !/[^A-Za-z0-9]/.test(password)) violations.push("PASSWORD_MISSING_SYMBOL");
  const identifier = loginIdentifier?.trim().toLocaleLowerCase("en-US");
  if (identifier && identifier.length >= 3 && password.toLocaleLowerCase("en-US").includes(identifier)) {
    violations.push("PASSWORD_CONTAINS_IDENTIFIER");
  }
  if (violations.length > 0) throw new PasswordPolicyError(violations);
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, passwordHashParameters);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (!passwordHash.startsWith("$argon2id$")) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function encodePbkdf2Sha256Credential(iterations: number, salt: Buffer, passwordHash: Buffer): string {
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) throw new Error("Invalid PBKDF2 iteration count");
  if (salt.length < 16 || passwordHash.length !== 32) throw new Error("Invalid PBKDF2 credential material");
  return `${pbkdf2Prefix}${iterations}$${salt.toString("base64url")}$${passwordHash.toString("base64url")}`;
}

export async function verifyCompatiblePassword(passwordHash: string, password: string): Promise<boolean> {
  if (passwordHash.startsWith("$argon2id$")) return verifyPassword(passwordHash, password);
  if (!passwordHash.startsWith(pbkdf2Prefix) || Buffer.byteLength(password, "utf8") > 4_096) return false;
  const parts = passwordHash.split("$");
  if (parts.length !== 5) return false;
  const iterations = Number(parts[2]);
  if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 10_000_000) return false;
  try {
    const salt = Buffer.from(parts[3] ?? "", "base64url");
    const expected = Buffer.from(parts[4] ?? "", "base64url");
    if (salt.length < 16 || expected.length !== 32) return false;
    const candidate = await pbkdf2(password, salt, iterations, expected.length, "sha256");
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function passwordHashNeedsUpgrade(passwordHash: string): boolean {
  if (!passwordHash.startsWith("$argon2id$")) return true;
  try {
    return needsRehash(passwordHash, passwordHashParameters);
  } catch {
    return true;
  }
}

export async function assertPasswordNotReused(password: string, recentHashes: readonly string[]): Promise<void> {
  for (const previousHash of recentHashes.slice(0, passwordPolicy.historyDepth)) {
    if (await verifyPassword(previousHash, password)) {
      throw new PasswordPolicyError(["PASSWORD_REUSED"]);
    }
  }
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export const argon2PasswordHasher: PasswordHasher = {
  hash: hashPassword,
  verify: verifyPassword,
};
