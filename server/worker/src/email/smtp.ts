import { randomUUID } from "node:crypto";
import { connect as connectTcp, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Delivers one message or throws. Kept as an interface so the processor can be tested without a server. */
export interface EmailSender {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS from the first byte (port 465). Otherwise STARTTLS is used when the server offers it. */
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
  timeoutMs: number;
}

const addressPattern = /^[^\s<>@",;:\\]+@[^\s<>@",;:\\]+\.[^\s<>@",;:\\]+$|^[^\s<>@",;:\\]+@localhost$/i;

function assertAddress(value: string, name: string): string {
  const address = value.trim();
  if (address.length > 320 || !addressPattern.test(address)) throw new Error(`${name} is not a valid email address`);
  return address;
}

/**
 * Reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`. Returns null when SMTP_HOST is unset
 * (email delivery disabled; the API then shows the one-time password instead). A partial configuration throws.
 */
export function readSmtpConfig(environment: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = environment.SMTP_HOST?.trim();
  if (!host) return null;
  const port = environment.SMTP_PORT?.trim() ? Number(environment.SMTP_PORT) : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("SMTP_PORT must be a valid port");
  const user = environment.SMTP_USER?.trim() || null;
  const password = environment.SMTP_PASSWORD ?? null;
  if ((user === null) !== (password === null || password === "")) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together");
  }
  const from = environment.SMTP_FROM?.trim();
  if (!from) throw new Error("SMTP_FROM is required when SMTP_HOST is set");
  return {
    host,
    port,
    secure: port === 465,
    user,
    password: user ? password : null,
    from: assertAddress(from, "SMTP_FROM"),
    timeoutMs: 15_000,
  };
}

interface SmtpReply {
  code: number;
  lines: string[];
}

export class SmtpError extends Error {
  constructor(
    message: string,
    /** 4xx (and network failures) are worth retrying; 5xx are permanent. */
    readonly transient: boolean,
  ) {
    super(message);
  }
}

/** One SMTP conversation over a socket; parses (multi-line) replies in order. */
class SmtpConnection {
  private buffer = "";
  private replies: SmtpReply[] = [];
  private waiting: Array<{ resolve: (reply: SmtpReply) => void; reject: (error: Error) => void }> = [];
  private pendingLines: string[] = [];
  private failure: Error | null = null;

  constructor(
    private socket: Socket | TLSSocket,
    private readonly timeoutMs: number,
  ) {
    this.attach(socket);
  }

  private attach(socket: Socket | TLSSocket): void {
    socket.setEncoding("utf8");
    socket.setTimeout(this.timeoutMs, () => this.fail(new SmtpError("SMTP connection timed out", true)));
    socket.on("data", (chunk: string) => this.receive(chunk));
    socket.on("error", (error) => this.fail(new SmtpError(`SMTP connection failed: ${error.message}`, true)));
    socket.on("close", () => this.fail(new SmtpError("SMTP connection closed", true)));
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      const match = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!match) continue;
      this.pendingLines.push(match[3] ?? "");
      if (match[2] === " ") {
        const reply = { code: Number(match[1]), lines: this.pendingLines };
        this.pendingLines = [];
        const waiter = this.waiting.shift();
        if (waiter) waiter.resolve(reply);
        else this.replies.push(reply);
      }
    }
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiting.splice(0)) waiter.reject(error);
  }

  read(): Promise<SmtpReply> {
    const ready = this.replies.shift();
    if (ready) return Promise.resolve(ready);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
  }

  async command(line: string, expected: readonly number[]): Promise<SmtpReply> {
    this.socket.write(`${line}\r\n`);
    return this.expect(expected, line.split(" ")[0] ?? line);
  }

  async expect(expected: readonly number[], label: string): Promise<SmtpReply> {
    const reply = await this.read();
    if (!expected.includes(reply.code)) {
      throw new SmtpError(`SMTP ${label} rejected with ${reply.code}`, reply.code < 500);
    }
    return reply;
  }

  writeRaw(data: string): void {
    this.socket.write(data);
  }

  async upgradeToTls(host: string): Promise<void> {
    const plain = this.socket;
    plain.removeAllListeners("data");
    plain.removeAllListeners("close");
    plain.removeAllListeners("error");
    plain.setTimeout(0);
    const secure = await new Promise<TLSSocket>((resolve, reject) => {
      const upgraded = connectTls({ socket: plain, servername: host }, () => resolve(upgraded));
      upgraded.once("error", reject);
    });
    this.socket = secure;
    this.buffer = "";
    this.attach(secure);
  }

  close(): void {
    this.socket.removeAllListeners("close");
    this.socket.end();
    this.socket.destroy();
  }
}

function base64Lines(value: string): string {
  return (
    Buffer.from(value, "utf8")
      .toString("base64")
      .match(/.{1,76}/g) ?? []
  ).join("\r\n");
}

function encodeHeader(value: string): string {
  const single = value.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(single) ? single : `=?UTF-8?B?${Buffer.from(single, "utf8").toString("base64")}?=`;
}

/** Builds the RFC 5322 message (multipart/alternative when HTML is present). Bodies are base64, so no dot-stuffing. */
export function buildMimeMessage(message: EmailMessage, from: string, messageId: string, date = new Date()): string {
  const headers = [
    `From: ${from}`,
    `To: ${assertAddress(message.to, "recipient")}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
  ];
  if (!message.html) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(message.text),
      "",
    ].join("\r\n");
  }
  const boundary = `nexora-${randomUUID()}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Minimal SMTP client on node:net/node:tls (no third-party dependency): EHLO, STARTTLS when offered, AUTH PLAIN
 * when credentials are configured (never over an unencrypted connection to a non-loopback host), one message
 * per connection.
 */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly config: SmtpConfig,
    private readonly heloName = "nexora-worker",
  ) {}

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const domain = this.config.from.split("@")[1] ?? "localhost";
    const messageId = `<${randomUUID()}@${domain}>`;
    const mime = buildMimeMessage(message, this.config.from, messageId);
    const connection = await this.open();
    try {
      await connection.expect([220], "greeting");
      let hello = await connection.command(`EHLO ${this.heloName}`, [250]);
      let encrypted = this.config.secure;
      if (!encrypted && hello.lines.some((line) => /^STARTTLS\b/i.test(line))) {
        await connection.command("STARTTLS", [220]);
        await connection.upgradeToTls(this.config.host);
        encrypted = true;
        hello = await connection.command(`EHLO ${this.heloName}`, [250]);
      }
      if (this.config.user && this.config.password !== null) {
        if (!encrypted && !isLoopback(this.config.host)) {
          throw new SmtpError("Refusing to send SMTP credentials over an unencrypted connection", false);
        }
        const token = Buffer.from(`\0${this.config.user}\0${this.config.password}`, "utf8").toString("base64");
        await connection.command(`AUTH PLAIN ${token}`, [235]);
      }
      await connection.command(`MAIL FROM:<${this.config.from}>`, [250]);
      await connection.command(`RCPT TO:<${assertAddress(message.to, "recipient")}>`, [250, 251]);
      await connection.command("DATA", [354]);
      connection.writeRaw(`${mime}\r\n.\r\n`);
      await connection.expect([250], "message");
      await connection.command("QUIT", [221]).catch(() => undefined);
      return { messageId };
    } finally {
      connection.close();
    }
  }

  private open(): Promise<SmtpConnection> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => reject(new SmtpError(`SMTP connection failed: ${error.message}`, true));
      const socket = this.config.secure
        ? connectTls({ host: this.config.host, port: this.config.port, servername: this.config.host }, () => {
            socket.off("error", onError);
            resolve(new SmtpConnection(socket, this.config.timeoutMs));
          })
        : connectTcp({ host: this.config.host, port: this.config.port }, () => {
            socket.off("error", onError);
            resolve(new SmtpConnection(socket, this.config.timeoutMs));
          });
      socket.once("error", onError);
      socket.setTimeout(this.config.timeoutMs, () => {
        socket.destroy();
        reject(new SmtpError("SMTP connection timed out", true));
      });
    });
  }
}
