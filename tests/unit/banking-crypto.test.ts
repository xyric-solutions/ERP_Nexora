import { describe, expect, it } from "vitest";

import { BankingIdentifierCrypto } from "../../server/api/src/modules/banking/crypto.js";

const key = Buffer.alloc(32, 7).toString("base64");

describe("BankingIdentifierCrypto", () => {
  it("round-trips an identifier without exposing plaintext in the envelope", () => {
    const crypto = new BankingIdentifierCrypto(key, "banking-kek-v1");
    const envelope = crypto.encrypt("PK36 SCBL 0000 0011 2345 6702");

    expect(envelope.keyVersion).toBe("banking-kek-v1");
    expect(envelope.nonce).toHaveLength(12);
    expect(envelope.ciphertext.toString("utf8")).not.toContain("PK36");
    expect(crypto.decrypt(envelope)).toBe("PK36SCBL0000001123456702");
  });

  it("produces stable keyed hashes and safe masks from normalized identifiers", () => {
    const crypto = new BankingIdentifierCrypto(key, "banking-kek-v1");

    expect(crypto.hash("0012-3456-7890")).toBe(crypto.hash("0012 3456 7890"));
    expect(crypto.mask("0012-3456-7890")).toBe("•••• 7890");
    expect(crypto.mask("1234")).toBe("•••• 1234");
  });

  it("rejects invalid key material and tampered ciphertext", () => {
    expect(() => new BankingIdentifierCrypto("not-base64", "banking-kek-v1")).toThrow(/32-byte/i);

    const crypto = new BankingIdentifierCrypto(key, "banking-kek-v1");
    const envelope = crypto.encrypt("001234567890");
    envelope.ciphertext[0] ^= 1;
    expect(() => crypto.decrypt(envelope)).toThrow();
  });
});
