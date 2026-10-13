import { pbkdf2Sync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertPasswordNotReused,
  encodePbkdf2Sha256Credential,
  hashPassword,
  passwordHashNeedsUpgrade,
  PasswordPolicyError,
  validatePassword,
  verifyCompatiblePassword,
  verifyPassword,
} from "../../packages/auth/src/index.js";

describe("password security", () => {
  it("uses Argon2id with the reviewed parameters and a unique salt", async () => {
    const password = "correct horse battery staple";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(second).not.toBe(first);
    await expect(verifyPassword(first, password)).resolves.toBe(true);
    await expect(verifyPassword(first, "incorrect password")).resolves.toBe(false);
    expect(passwordHashNeedsUpgrade(first)).toBe(false);
  });

  it("rejects weak, oversized, identifier-derived, and null-containing passwords", () => {
    expect(() => validatePassword("1234567")).toThrow(PasswordPolicyError);
    expect(() => validatePassword("Admin.12")).not.toThrow();
    expect(() => validatePassword("person@example.com-secure", "person@example.com")).toThrow(PasswordPolicyError);
    expect(() => validatePassword(`valid-password\0value`)).toThrow(PasswordPolicyError);
    expect(() => validatePassword("x".repeat(129))).toThrow(PasswordPolicyError);
  });

  it("rejects reuse among the configured password-history window", async () => {
    const previous = await hashPassword("prior password phrase");
    await expect(assertPasswordNotReused("prior password phrase", [previous])).rejects.toMatchObject({
      violations: ["PASSWORD_REUSED"],
    });
    await expect(assertPasswordNotReused("a different password phrase", [previous])).resolves.toBeUndefined();
  });

  it("verifies the preserved PBKDF2-SHA256 format and marks it for upgrade", async () => {
    const password = "legacy credential phrase";
    const salt = Buffer.from("0123456789abcdef", "utf8");
    const encoded = encodePbkdf2Sha256Credential(310_000, salt, pbkdf2Sync(password, salt, 310_000, 32, "sha256"));

    await expect(verifyCompatiblePassword(encoded, password)).resolves.toBe(true);
    await expect(verifyCompatiblePassword(encoded, "wrong credential phrase")).resolves.toBe(false);
    expect(passwordHashNeedsUpgrade(encoded)).toBe(true);
  });
});
