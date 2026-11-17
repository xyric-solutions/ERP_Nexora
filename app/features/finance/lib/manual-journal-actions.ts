import type { CreateJournalRequest, JournalDetail, JournalMutationResult } from "@nexora/contracts";
import type { FinanceJournalsClient } from "../api/finance-journals-client";

export const manualJournalActionVisibility = {
  saveDraft: true,
  approveAndClose: true,
  deleteDraft: true,
};
export type ManualJournalActionVisibility = typeof manualJournalActionVisibility;
export type ManualJournalIntent = "save" | "approve";
type Progress = Pick<JournalMutationResult, "id" | "version" | "state">;
export class ManualJournalActionError extends Error {}

/** Keeps successful lifecycle steps and uncertain request identities within one editor. */
export class ManualJournalActions {
  progress: Progress | null = null;
  review: JournalDetail | null = null;
  private savedPayload = "";
  private keys = new Map<string, string>();
  private running = false;
  private stale = false;

  private async request(identity: string, work: (key: string) => Promise<JournalMutationResult>) {
    const requestKey = this.keys.get(identity) ?? `web-finance-journal-${crypto.randomUUID()}`;
    this.keys.set(identity, requestKey);
    const result = await work(requestKey);
    this.progress = result;
    return result;
  }

  async run({
    client,
    csrfToken,
    initial,
    payload,
    intent,
    confirmed,
    reason,
  }: {
    client: Pick<FinanceJournalsClient, "create" | "update" | "submit" | "detail" | "decide">;
    csrfToken: () => string;
    initial: JournalDetail | null;
    payload: CreateJournalRequest;
    intent: ManualJournalIntent;
    confirmed: boolean;
    reason: string;
  }): Promise<Progress | null> {
    if (this.running) return null;
    if (this.stale)
      throw new ManualJournalActionError("The Journal changed. Close and reopen it for a new final review.");
    this.running = true;
    try {
      if (!this.progress && initial?.version)
        this.progress = { id: initial.id, version: initial.version, state: initial.state };
      const body = JSON.stringify(payload);
      if ((!this.progress || this.progress.state === "draft") && body !== this.savedPayload) {
        const previous = this.progress;
        const { company_id: companyId, ...fields } = payload;
        await this.request(JSON.stringify(["save", previous?.id, previous?.version, payload]), (key) =>
          previous
            ? client.update(previous.id, { ...fields, expected_version: previous.version }, csrfToken(), key)
            : client.create({ ...fields, company_id: companyId }, csrfToken(), key),
        );
        this.savedPayload = body;
      }
      if (!this.progress) throw new ManualJournalActionError("The saved Journal identity is unavailable.");
      if (intent === "save" || this.progress.state === "posted") return this.progress;
      if (this.progress.state === "draft") {
        const previous = this.progress;
        await this.request(JSON.stringify(["submit", previous.id, previous.version]), (key) =>
          client.submit(previous.id, { expected_version: previous.version }, csrfToken(), key),
        );
      }
      const submittedVersion = this.progress.version;
      const current = await client.detail(this.progress.id);
      this.review = current;
      if (!current.version) throw new ManualJournalActionError("The Journal version is unavailable.");
      const currentVersion = current.version;
      if (current.state !== "posted" && (current.state !== "submitted" || currentVersion !== submittedVersion)) {
        this.stale = true;
        throw new ManualJournalActionError("The Journal changed. Close and reopen it for a new final review.");
      }
      this.progress = { id: current.id, version: current.version, state: current.state };
      if (current.state === "posted") return this.progress;
      if (current.state !== "submitted")
        throw new ManualJournalActionError("Refresh the Journal to review its current state.");
      if (!current.capabilities.approve) return this.progress;
      if (!confirmed) throw new ManualJournalActionError("Confirm the final review before approving this Journal.");
      if (current.capabilities.super_admin_override_available && reason.trim().length < 3)
        throw new ManualJournalActionError("Enter a self-approval override reason of at least 3 characters.");
      await this.request(JSON.stringify(["post", current.id, current.version, reason.trim()]), (key) =>
        client.decide(
          current.id,
          {
            expected_version: currentVersion,
            action: "post",
            confirmed: true,
            ...(current.capabilities.super_admin_override_available ? { reason: reason.trim() } : {}),
          },
          csrfToken(),
          key,
        ),
      );
      return this.progress;
    } finally {
      this.running = false;
    }
  }
}
