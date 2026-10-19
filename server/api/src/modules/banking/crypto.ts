import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export interface BankingIdentifierEnvelope {
  ciphertext: Buffer;
  nonce: Buffer;
  keyVersion: string;
}

function normalizeIdentifier(value: string): string {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 4 || normalized.length > 128) throw new Error("Banking identifier length is invalid.");
  return normalized;
}

/** Dedicated envelope for account identifiers. Plaintext must never enter logs or audit payloads. */
export class BankingIdentifierCrypto {
  private readonly key: Buffer;

  constructor(
    encodedKey: string,
    private readonly keyVersion: string,
  ) {
    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) throw new Error("Banking encryption key must be a base64-encoded 32-byte value.");
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyVersion)) throw new Error("Banking encryption key version is invalid.");
    this.key = key;
  }

  encrypt(value: string): BankingIdentifierEnvelope {
    const normalized = normalizeIdentifier(value);
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, nonce);
    cipher.setAAD(Buffer.from(this.keyVersion, "utf8"));
    const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
    return {
      ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]),
      nonce,
      keyVersion: this.keyVersion,
    };
  }

  decrypt(envelope: BankingIdentifierEnvelope): string {
    if (envelope.nonce.length !== NONCE_BYTES || envelope.ciphertext.length <= AUTH_TAG_BYTES)
      throw new Error("Banking identifier envelope is invalid.");
    const content = envelope.ciphertext.subarray(0, -AUTH_TAG_BYTES);
    const authTag = envelope.ciphertext.subarray(-AUTH_TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, envelope.nonce);
    decipher.setAAD(Buffer.from(envelope.keyVersion, "utf8"));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8");
  }

  hash(value: string): string {
    return createHmac("sha256", this.key).update(normalizeIdentifier(value), "utf8").digest("hex");
  }

  mask(value: string): string {
    const normalized = normalizeIdentifier(value);
    return `•••• ${normalized.slice(-4)}`;
  }
}
