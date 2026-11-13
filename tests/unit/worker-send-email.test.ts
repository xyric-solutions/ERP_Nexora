import { createServer, type AddressInfo, type Server } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildMimeMessage,
  readSmtpConfig,
  SmtpEmailSender,
  SmtpError,
  type EmailMessage,
  type EmailSender,
} from "../../server/worker/src/email/smtp.js";
import { renderAccountCreatedEmail, renderPasswordResetEmail } from "../../server/worker/src/email/templates.js";
import {
  defaultEmailBackoffMs,
  processSendEmailBatch,
  type EmailOutboxRecord,
  type EmailOutboxStore,
} from "../../server/worker/src/jobs/send-email.js";

const variables = {
  displayName: "Amina <script>",
  organisationName: "Acme Trading",
  temporaryPassword: "Tmp-Pass-1234!",
  loginUrl: "https://erp.example.test/login",
};

type OutboxRow = EmailOutboxRecord & {
  status: "pending" | "sent" | "failed";
  nextAttemptAt: Date;
  errorCode: string | null;
  providerMessageId: string | null;
};

/** In-memory outbox store, the reference behaviour for the future Postgres implementation. */
class InMemoryEmailOutboxStore implements EmailOutboxStore {
  readonly rows = new Map<string, OutboxRow>();

  add(record: EmailOutboxRecord, nextAttemptAt = new Date(0)): void {
    this.rows.set(record.id, {
      ...record,
      status: "pending",
      nextAttemptAt,
      errorCode: null,
      providerMessageId: null,
    });
  }

  async claimDue(limit: number, now: Date): Promise<readonly EmailOutboxRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.status === "pending" && row.nextAttemptAt <= now)
      .slice(0, limit)
      .map((row) => ({ ...row, variables: { ...row.variables } }));
  }

  async markSent(id: string, _sentAt: Date, providerMessageId: string): Promise<void> {
    const row = this.rows.get(id)!;
    Object.assign(row, { status: "sent", attempts: row.attempts + 1, providerMessageId });
    row.variables.temporaryPassword = "";
  }

  async markRetry(id: string, attempts: number, nextAttemptAt: Date, errorCode: string): Promise<void> {
    Object.assign(this.rows.get(id)!, { attempts, nextAttemptAt, errorCode });
  }

  async markFailed(id: string, attempts: number, _failedAt: Date, errorCode: string): Promise<void> {
    const row = this.rows.get(id)!;
    Object.assign(row, { status: "failed", attempts, errorCode });
    row.variables.temporaryPassword = "";
  }
}

function record(id: string, overrides: Partial<EmailOutboxRecord> = {}): EmailOutboxRecord {
  return {
    id,
    tenantId: "tenant-a",
    template: "account_created",
    recipient: "amina@example.test",
    variables: { ...variables },
    attempts: 0,
    ...overrides,
  };
}

function scriptedSender(outcomes: Array<"ok" | Error>): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      const outcome = outcomes.shift() ?? "ok";
      if (outcome instanceof Error) throw outcome;
      sent.push(message);
      return { messageId: `<m${sent.length}@example.test>` };
    },
  };
}

describe("credential email templates", () => {
  it("renders the account email with login URL, email, temporary password and must-change notice", () => {
    const email = renderAccountCreatedEmail({ ...variables, email: "amina@example.test" });
    expect(email.subject).toBe("Your Nexora account");
    expect(email.text).toContain("https://erp.example.test/login");
    expect(email.text).toContain("amina@example.test");
    expect(email.text).toContain("Tmp-Pass-1234!");
    expect(email.text).toMatch(/must change this temporary password/i);
    expect(email.html).toContain("Amina &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
  });

  it("renders the password reset email and rejects unsafe login URLs", () => {
    const email = renderPasswordResetEmail({ ...variables, email: "amina@example.test" });
    expect(email.subject).toMatch(/password was reset/);
    expect(email.text).toContain("Tmp-Pass-1234!");
    expect(() =>
      renderPasswordResetEmail({ ...variables, loginUrl: "javascript:alert(1)", email: "amina@example.test" }),
    ).toThrow("EMAIL_LOGIN_URL_INVALID");
  });
});

describe("SMTP configuration and MIME", () => {
  it("is disabled without SMTP_HOST and refuses partial configuration", () => {
    expect(readSmtpConfig({})).toBeNull();
    expect(readSmtpConfig({ SMTP_HOST: "localhost", SMTP_PORT: "1025", SMTP_FROM: "erp@example.test" })).toEqual({
      host: "localhost",
      port: 1025,
      secure: false,
      user: null,
      password: null,
      from: "erp@example.test",
      timeoutMs: 15_000,
    });
    expect(readSmtpConfig({ SMTP_HOST: "smtp.example.test", SMTP_PORT: "465", SMTP_FROM: "a@b.test" })?.secure).toBe(
      true,
    );
    expect(() => readSmtpConfig({ SMTP_HOST: "localhost" })).toThrow("SMTP_FROM");
    expect(() => readSmtpConfig({ SMTP_HOST: "localhost", SMTP_FROM: "a@b.test", SMTP_USER: "u" })).toThrow();
    expect(() => readSmtpConfig({ SMTP_HOST: "localhost", SMTP_FROM: "a@b.test", SMTP_PORT: "99999" })).toThrow();
  });

  it("builds a multipart message and blocks header injection through the recipient", () => {
    const mime = buildMimeMessage(
      { to: "amina@example.test", subject: "Héllo\r\nBcc: x@evil.test", text: "plain", html: "<p>html</p>" },
      "erp@example.test",
      "<id@example.test>",
    );
    expect(mime).toContain("Content-Type: multipart/alternative");
    expect(mime).toMatch(/^Subject: =\?UTF-8\?B\?/m);
    expect(mime).not.toMatch(/^Bcc:/m);
    expect(() =>
      buildMimeMessage({ to: "a@b.test\r\nBcc: x@evil.test", subject: "s", text: "t" }, "erp@example.test", "<i@x>"),
    ).toThrow("not a valid email address");
  });
});

describe("send-email processor", () => {
  const now = new Date("2026-11-12T10:00:00.000Z");

  it("sends due rows and marks them sent", async () => {
    const store = new InMemoryEmailOutboxStore();
    store.add(record("a"));
    store.add(record("b", { template: "password_reset" }));
    store.add(record("later"), new Date(now.getTime() + 60_000));
    const sender = scriptedSender([]);
    await expect(processSendEmailBatch({ now }, { store, sender })).resolves.toEqual({
      claimed: 2,
      sent: 2,
      retried: 0,
      failed: 0,
    });
    expect(store.rows.get("a")).toMatchObject({ status: "sent", providerMessageId: "<m1@example.test>" });
    expect(store.rows.get("a")!.variables.temporaryPassword).toBe("");
    expect(store.rows.get("later")!.status).toBe("pending");
    expect(sender.sent[1]!.subject).toMatch(/password was reset/);
  });

  it("retries transient failures with exponential backoff, then marks the row failed", async () => {
    const store = new InMemoryEmailOutboxStore();
    store.add(record("a"));
    const sender = scriptedSender([
      new SmtpError("busy", true),
      new SmtpError("busy", true),
      new SmtpError("busy", true),
    ]);
    let clock = now;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await processSendEmailBatch({ now: clock, maxAttempts: 3 }, { store, sender });
      const row = store.rows.get("a")!;
      if (attempt < 3) {
        expect(result.retried).toBe(1);
        expect(row).toMatchObject({ status: "pending", attempts: attempt, errorCode: "SMTP_TRANSIENT" });
        expect(row.nextAttemptAt.getTime() - clock.getTime()).toBe(defaultEmailBackoffMs(attempt));
        expect((await processSendEmailBatch({ now: clock, maxAttempts: 3 }, { store, sender })).claimed).toBe(0);
        clock = row.nextAttemptAt;
      } else {
        expect(result.failed).toBe(1);
        expect(row).toMatchObject({ status: "failed", attempts: 3, errorCode: "SMTP_TRANSIENT" });
      }
    }
    expect(defaultEmailBackoffMs(1)).toBe(60_000);
    expect(defaultEmailBackoffMs(2)).toBe(120_000);
    expect(defaultEmailBackoffMs(20)).toBe(3_600_000);
  });

  it("fails permanent rejections immediately without retrying", async () => {
    const store = new InMemoryEmailOutboxStore();
    store.add(record("a"));
    store.add(record("bad-url", { variables: { ...variables, loginUrl: "ftp://x" } }));
    const result = await processSendEmailBatch(
      { now },
      { store, sender: scriptedSender([new SmtpError("no such user", false)]) },
    );
    expect(result).toEqual({ claimed: 2, sent: 0, retried: 0, failed: 2 });
    expect(store.rows.get("a")).toMatchObject({ status: "failed", errorCode: "SMTP_REJECTED" });
    expect(store.rows.get("bad-url")).toMatchObject({ status: "failed", errorCode: "EMAIL_INVALID" });
  });
});

describe("SMTP sender against a local test server", () => {
  let server: Server | null = null;
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = null;
  });

  async function fakeSmtp(rejectRecipient = false): Promise<{ port: number; transcript: string[] }> {
    const transcript: string[] = [];
    server = createServer((socket) => {
      let data = false;
      let buffer = "";
      socket.write("220 fake ESMTP\r\n");
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let index: number;
        while ((index = buffer.indexOf("\r\n")) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          transcript.push(line);
          if (data) {
            if (line === ".") {
              data = false;
              socket.write("250 queued\r\n");
            }
            continue;
          }
          if (line.startsWith("EHLO")) socket.write("250-fake\r\n250 SIZE 1000000\r\n");
          else if (line.startsWith("MAIL FROM")) socket.write("250 ok\r\n");
          else if (line.startsWith("RCPT TO")) socket.write(rejectRecipient ? "550 no such user\r\n" : "250 ok\r\n");
          else if (line === "DATA") {
            data = true;
            socket.write("354 go ahead\r\n");
          } else if (line === "QUIT") socket.end("221 bye\r\n");
          else socket.write("502 unknown\r\n");
        }
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    return { port: (server!.address() as AddressInfo).port, transcript };
  }

  const config = (port: number) => ({
    host: "127.0.0.1",
    port,
    secure: false,
    user: null,
    password: null,
    from: "erp@example.test",
    timeoutMs: 5_000,
  });

  it("delivers a message through EHLO, MAIL, RCPT and DATA", async () => {
    const { port, transcript } = await fakeSmtp();
    const result = await new SmtpEmailSender(config(port)).send({
      to: "amina@example.test",
      subject: "Your Nexora account",
      text: "hello",
      html: "<p>hello</p>",
    });
    expect(result.messageId).toMatch(/^<.+@example\.test>$/);
    expect(transcript).toContain("MAIL FROM:<erp@example.test>");
    expect(transcript).toContain("RCPT TO:<amina@example.test>");
    expect(transcript).toContain("Subject: Your Nexora account");
    expect(transcript).toContain(".");
  });

  it("reports a 5xx rejection as a permanent SMTP error", async () => {
    const { port } = await fakeSmtp(true);
    await expect(
      new SmtpEmailSender(config(port)).send({ to: "nobody@example.test", subject: "s", text: "t" }),
    ).rejects.toMatchObject({ transient: false });
  });
});
