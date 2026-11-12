import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { supplierProfileSchema, type SupplierProfile } from "@nexora/contracts";

const envelopeSchema = z.strictObject({
  format: z.literal("supplier-profile-v1"),
  key_version: z.string().min(1).max(64),
  nonce: z.string().base64(),
  ciphertext: z.string().base64(),
});

/** Bank details are encrypted in both business rows and immutable retry/audit results. */
export class SupplierProfileCrypto {
  private readonly key: Buffer;
  constructor(
    encodedKey: string,
    private readonly keyVersion: string,
  ) {
    this.key = Buffer.from(encodedKey, "base64");
    if (this.key.length !== 32 || !/^[A-Za-z0-9._-]{1,64}$/.test(keyVersion))
      throw new Error("Supplier profile encryption configuration is invalid.");
  }

  encrypt(profile: SupplierProfile, scope: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(`${this.keyVersion}:${scope}`, "utf8"));
    const content = Buffer.concat([
      cipher.update(JSON.stringify(profile), "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return {
      format: "supplier-profile-v1",
      key_version: this.keyVersion,
      nonce: nonce.toString("base64"),
      ciphertext: content.toString("base64"),
    };
  }

  decrypt(value: unknown, scope: string): SupplierProfile {
    const envelope = envelopeSchema.parse(value);
    if (envelope.key_version !== this.keyVersion) throw new Error("Supplier profile encryption key is unavailable.");
    const nonce = Buffer.from(envelope.nonce, "base64"),
      content = Buffer.from(envelope.ciphertext, "base64");
    if (nonce.length !== 12 || content.length <= 16)
      throw new Error("Supplier profile encryption envelope is invalid.");
    const decipher = createDecipheriv("aes-256-gcm", this.key, nonce);
    decipher.setAAD(Buffer.from(`${envelope.key_version}:${scope}`, "utf8"));
    decipher.setAuthTag(content.subarray(-16));
    return supplierProfileSchema.parse(
      JSON.parse(Buffer.concat([decipher.update(content.subarray(0, -16)), decipher.final()]).toString("utf8")),
    );
  }
}

export function isEncryptedSupplierProfile(value: unknown): boolean {
  return !!value && typeof value === "object" && "format" in value;
}
