import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { supplierProfileSchema } from "../../packages/contracts/src/index.js";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";

describe("Supplier bank profile encryption", () => {
  const key = randomBytes(32).toString("base64"),
    crypto = new SupplierProfileCrypto(key, "test-v1");
  const profile = supplierProfileSchema.parse({
    bank_accounts: [
      {
        id: "one",
        bank_name: "Synthetic bank",
        account_title: "Synthetic supplier",
        account_number: "123456789",
        is_default: true,
      },
    ],
  });
  it("encrypts identifiers with fresh nonces and round-trips the complete profile", () => {
    const first = crypto.encrypt(profile, "tenant:company:supplier"),
      second = crypto.encrypt(profile, "tenant:company:supplier");
    expect(first).not.toEqual(second);
    expect(JSON.stringify(first)).not.toContain("123456789");
    expect(crypto.decrypt(first, "tenant:company:supplier")).toEqual(profile);
  });
  it("rejects cross-tenant/company/record swaps, tampering and incorrect keys", () => {
    const encrypted = crypto.encrypt(profile, "tenant:company:supplier");
    expect(() => crypto.decrypt(encrypted, "other:company:supplier")).toThrow();
    expect(() => crypto.decrypt(encrypted, "tenant:other:supplier")).toThrow();
    expect(() => crypto.decrypt(encrypted, "tenant:company:other")).toThrow();
    const content = Buffer.from(encrypted.ciphertext, "base64");
    content[0] = content[0]! ^ 1;
    expect(() =>
      crypto.decrypt({ ...encrypted, ciphertext: content.toString("base64") }, "tenant:company:supplier"),
    ).toThrow();
    expect(() =>
      new SupplierProfileCrypto(randomBytes(32).toString("base64"), "test-v1").decrypt(
        encrypted,
        "tenant:company:supplier",
      ),
    ).toThrow();
    expect(() => crypto.decrypt({ ...encrypted, key_version: "other" }, "tenant:company:supplier")).toThrow();
  });
});
