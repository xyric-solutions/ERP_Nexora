import { readCredentialEmailEncryptionKey, type DatabasePool } from "@nexora/db";
import type { Logger } from "pino";
import { processSendEmailBatch } from "../jobs/send-email.js";
import { PostgresCredentialEmailOutbox } from "./outbox-store.js";
import { ResendEmailSender } from "./resend.js";
import { readSmtpConfig, SmtpEmailSender, type EmailSender } from "./smtp.js";

export function readCredentialEmailSender(environment: NodeJS.ProcessEnv = process.env): EmailSender | null {
  const provider = environment.CREDENTIAL_EMAIL_PROVIDER?.trim();
  if (!provider) return null;
  if (provider === "smtp") {
    const config = readSmtpConfig(environment);
    return config ? new SmtpEmailSender({ ...config, requireTls: environment.NODE_ENV === "production" }) : null;
  }
  if (provider === "resend") {
    const apiKey = environment.RESEND_API_KEY?.trim();
    const from = environment.RESEND_FROM?.trim();
    return apiKey && from ? new ResendEmailSender(apiKey, from) : null;
  }
  throw new Error("CREDENTIAL_EMAIL_PROVIDER must be resend or smtp");
}

export function startCredentialEmailDelivery(pool: DatabasePool, logger: Logger) {
  const sender = readCredentialEmailSender();
  const key = sender ? readCredentialEmailEncryptionKey() : null;
  if (!sender || !key) return null;

  const delivery = { store: new PostgresCredentialEmailOutbox(pool, key), sender };
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  function schedule(delay: number) {
    if (stopping) return;
    timer = setTimeout(() => {
      running = processSendEmailBatch({ now: new Date(), batchSize: 1 }, delivery)
        .then((result) => {
          if (result.claimed > 0) logger.info(result, "Credential email batch finished");
        })
        .catch(() => logger.warn("Credential email batch could not complete"))
        .finally(() => schedule(5_000));
    }, delay);
  }
  schedule(0);
  return async () => {
    stopping = true;
    clearTimeout(timer);
    await running;
  };
}
