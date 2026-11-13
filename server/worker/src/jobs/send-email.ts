import type { EmailSender } from "../email/smtp.js";
import { renderAccountCreatedEmail, renderPasswordResetEmail, type RenderedEmail } from "../email/templates.js";

export const SEND_EMAIL_JOB = "send-email";

export type EmailTemplateKind = "account_created" | "password_reset";

/**
 * One queued email (plan Phase 4 `email_outbox`). The temporary password is held only until the row is sent or
 * permanently failed; the store must clear it at that point.
 */
export interface EmailOutboxRecord {
  id: string;
  tenantId: string;
  template: EmailTemplateKind;
  recipient: string;
  variables: {
    displayName: string;
    organisationName: string;
    temporaryPassword: string;
    loginUrl: string;
  };
  /** Attempts already made before this one. */
  attempts: number;
}

/**
 * Persistence for the outbox. Not bound to a table yet: plan Phase 2 creates `email_outbox`. A Postgres
 * implementation should claim rows with `for update skip locked` so several workers never send the same row.
 */
export interface EmailOutboxStore {
  /** Claims up to `limit` rows that are pending and due (`next_attempt_at <= now`). */
  claimDue(limit: number, now: Date): Promise<readonly EmailOutboxRecord[]>;
  markSent(id: string, sentAt: Date, providerMessageId: string): Promise<void>;
  /** Schedules another attempt at `nextAttemptAt`. */
  markRetry(id: string, attempts: number, nextAttemptAt: Date, errorCode: string): Promise<void>;
  /** Gives up: the row stays visible as failed for the Super Admin. */
  markFailed(id: string, attempts: number, failedAt: Date, errorCode: string): Promise<void>;
}

export interface SendEmailOptions {
  now: Date;
  batchSize?: number;
  maxAttempts?: number;
  /** Delay before retry `n` (1-based). Defaults to exponential backoff: 1, 2, 4, 8 … minutes, capped at 1 hour. */
  backoffMs?: (attempt: number) => number;
}

export interface SendEmailResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}

export function defaultEmailBackoffMs(attempt: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));
}

export function renderOutboxEmail(record: EmailOutboxRecord): RenderedEmail {
  const input = { ...record.variables, email: record.recipient };
  return record.template === "account_created" ? renderAccountCreatedEmail(input) : renderPasswordResetEmail(input);
}

/** Safe error code for the outbox row; never the raw message (it could echo addresses or server text). */
function errorCodeOf(error: unknown): { code: string; transient: boolean } {
  const transient = (error as { transient?: unknown }).transient;
  if (typeof transient === "boolean") return { code: transient ? "SMTP_TRANSIENT" : "SMTP_REJECTED", transient };
  if (error instanceof Error && /EMAIL_LOGIN_URL_INVALID|not a valid email address/.test(error.message)) {
    return { code: "EMAIL_INVALID", transient: false };
  }
  return { code: "EMAIL_SEND_FAILED", transient: true };
}

/** Sends one batch of due outbox rows: sent rows are marked sent, transient failures retried with backoff. */
export async function processSendEmailBatch(
  options: SendEmailOptions,
  dependencies: { store: EmailOutboxStore; sender: EmailSender },
): Promise<SendEmailResult> {
  const batchSize = options.batchSize ?? 20;
  const maxAttempts = options.maxAttempts ?? 5;
  const backoff = options.backoffMs ?? defaultEmailBackoffMs;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error("Invalid email batch size");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 50) throw new Error("Invalid max attempts");

  const records = await dependencies.store.claimDue(batchSize, options.now);
  const result: SendEmailResult = { claimed: records.length, sent: 0, retried: 0, failed: 0 };
  for (const record of records) {
    const attempts = record.attempts + 1;
    try {
      const rendered = renderOutboxEmail(record);
      const delivered = await dependencies.sender.send({
        to: record.recipient,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      await dependencies.store.markSent(record.id, options.now, delivered.messageId);
      result.sent += 1;
    } catch (error) {
      const { code, transient } = errorCodeOf(error);
      if (transient && attempts < maxAttempts) {
        await dependencies.store.markRetry(
          record.id,
          attempts,
          new Date(options.now.getTime() + backoff(attempts)),
          code,
        );
        result.retried += 1;
      } else {
        await dependencies.store.markFailed(record.id, attempts, options.now, code);
        result.failed += 1;
      }
    }
  }
  return result;
}
