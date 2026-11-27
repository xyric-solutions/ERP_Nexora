import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type CredentialEmailTemplate = "account_created" | "password_reset";

export interface CredentialEmailPayload {
  recipient: string;
  displayName: string;
  organisationName: string;
  temporaryPassword: string;
  loginUrl: string;
}

export function readCredentialEmailEncryptionKey(environment: NodeJS.ProcessEnv = process.env): Buffer | null {
  const encoded = environment.CREDENTIAL_EMAIL_ENCRYPTION_KEY?.trim();
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("CREDENTIAL_EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

function associatedData(tenantId: string, messageId: string): Buffer {
  return Buffer.from(JSON.stringify(["nexora.credential-email.v1", tenantId, messageId]));
}

function encryptPayload(key: Buffer, tenantId: string, id: string, payload: CredentialEmailPayload): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(associatedData(tenantId, id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}

export function decryptCredentialEmail(
  key: Buffer,
  tenantId: string,
  id: string,
  value: Buffer,
): CredentialEmailPayload {
  const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
  decipher.setAAD(associatedData(tenantId, id));
  decipher.setAuthTag(value.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8"));
}

export interface CredentialEmailConfig {
  key: Buffer;
  loginUrl: string;
}

export function readCredentialEmailConfig(environment: NodeJS.ProcessEnv = process.env): CredentialEmailConfig | null {
  if (environment.CREDENTIAL_EMAIL_ENABLED !== "true") return null;
  const key = readCredentialEmailEncryptionKey(environment);
  if (!key) return null;
  const origin = new URL(environment.CREDENTIAL_EMAIL_ORIGIN ?? "");
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && environment.NODE_ENV !== "production")) {
    throw new Error("CREDENTIAL_EMAIL_ORIGIN must use HTTPS in production");
  }
  if (origin.username || origin.password) throw new Error("Invalid CREDENTIAL_EMAIL_ORIGIN");
  return { key, loginUrl: new URL("/login", origin).toString() };
}

export async function enqueueCredentialEmail(
  client: PoolClient,
  config: CredentialEmailConfig,
  input: { tenantId: string; userId: string; template: CredentialEmailTemplate; temporaryPassword: string },
): Promise<void> {
  const {
    rows: [user],
  } = await client.query<{
    email: string;
    display_name: string;
    organisation_name: string;
    password_version: string;
  }>(
    `select account.email, coalesce(account.display_name, account.email) as display_name,
            tenant.name as organisation_name, credential.password_version
       from security_user_account account
       join tenant on tenant.id = account.tenant_id and tenant.status = 'active'
       join security_password_credential credential on credential.tenant_id = account.tenant_id
            and credential.user_id = account.id
      where account.tenant_id = $1 and account.id = $2 and account.status = 'active'
        and credential.must_change_password and credential.credential_status = 'reset_required'`,
    [input.tenantId, input.userId],
  );
  if (!user) throw new Error("No active temporary credential is available for delivery");
  const id = randomUUID();
  const payload = encryptPayload(config.key, input.tenantId, id, {
    recipient: user.email,
    displayName: user.display_name,
    organisationName: user.organisation_name,
    temporaryPassword: input.temporaryPassword,
    loginUrl: config.loginUrl,
  });
  await client.query(
    `insert into credential_email_outbox (id, tenant_id, user_id, credential_version, template, payload)
     values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
    [id, input.tenantId, input.userId, user.password_version, input.template, payload],
  );
}
