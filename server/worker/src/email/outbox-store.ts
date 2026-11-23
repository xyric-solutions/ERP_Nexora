import { randomUUID } from "node:crypto";
import { decryptCredentialEmail, type CredentialEmailTemplate, type DatabasePool } from "@nexora/db";
import type { EmailOutboxRecord, EmailOutboxStore } from "../jobs/send-email.js";

interface ClaimedEmail {
  id: string;
  tenant_id: string;
  user_id: string;
  credential_version: string;
  template: CredentialEmailTemplate;
  payload: Buffer;
  attempts: number;
}

export class PostgresCredentialEmailOutbox implements EmailOutboxStore {
  private readonly token = randomUUID();

  constructor(
    private readonly pool: DatabasePool,
    private readonly encryptionKey: Buffer,
  ) {}

  async claimDue(limit: number): Promise<EmailOutboxRecord[]> {
    const { rows } = await this.pool.query<ClaimedEmail>("select * from claim_credential_email($1,$2)", [
      this.token,
      Math.min(limit, 10),
    ]);
    const records: EmailOutboxRecord[] = [];
    for (const row of rows) {
      let payload;
      try {
        payload = decryptCredentialEmail(this.encryptionKey, row.tenant_id, row.id, row.payload);
      } catch {
        await this.finish(row.id, "failed", null, "EMAIL_PAYLOAD_INVALID");
        continue;
      }
      if (!(await this.isCurrent(row, payload.recipient))) {
        await this.finish(row.id, "failed", null, "EMAIL_CREDENTIAL_SUPERSEDED");
        continue;
      }
      const { recipient, ...variables } = payload;
      records.push({
        id: row.id,
        tenantId: row.tenant_id,
        template: row.template,
        recipient,
        variables,
        attempts: row.attempts,
      });
    }
    return records;
  }

  async markSent(id: string): Promise<void> {
    await this.finish(id, "sent", null, "EMAIL_ACCEPTED");
  }

  async markRetry(id: string, _attempts: number, nextAttemptAt: Date, errorCode: string): Promise<void> {
    await this.finish(id, "pending", nextAttemptAt, errorCode);
  }

  async markFailed(id: string, _attempts: number, _failedAt: Date, errorCode: string): Promise<void> {
    await this.finish(id, "failed", null, errorCode);
  }

  private async isCurrent(row: ClaimedEmail, recipient: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin read only");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [row.tenant_id]);
      const result = await client.query(
        `select 1 from security_user_account account
          join tenant on tenant.id = account.tenant_id and tenant.status = 'active'
          join security_password_credential credential on credential.tenant_id = account.tenant_id
               and credential.user_id = account.id
          where account.tenant_id = $1 and account.id = $2 and account.email = $3 and account.status = 'active'
            and credential.password_version = $4 and credential.must_change_password
            and credential.credential_status = 'reset_required'`,
        [row.tenant_id, row.user_id, recipient, row.credential_version],
      );
      await client.query("commit");
      return result.rowCount === 1;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async finish(id: string, outcome: "sent" | "failed" | "pending", retryAt: Date | null, code: string) {
    const {
      rows: [result],
    } = await this.pool.query<{ finished: boolean }>("select finish_credential_email($1,$2,$3,$4,$5) as finished", [
      id,
      this.token,
      outcome,
      retryAt,
      code,
    ]);
    if (!result?.finished) throw new Error("Credential email lease is unavailable");
  }
}
