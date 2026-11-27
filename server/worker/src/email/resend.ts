import type { EmailMessage, EmailSender } from "./smtp.js";

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly request = fetch,
  ) {}

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const response = await this.request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { name?: unknown } | null;
      const transient =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 409 && body?.name === "concurrent_idempotent_requests");
      throw Object.assign(new Error("Credential email provider did not accept the message"), { transient });
    }
    const body = (await response.json()) as { id?: unknown } | null;
    if (typeof body?.id !== "string" || !body.id) throw new Error("Credential email provider did not return a receipt");
    return { messageId: body.id };
  }
}
