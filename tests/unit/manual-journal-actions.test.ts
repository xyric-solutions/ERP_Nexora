import { describe, expect, it, vi } from "vitest";
import type { CreateJournalRequest, JournalDetail, JournalMutationResult } from "@nexora/contracts";
import { ManualJournalActions } from "../../app/features/finance/lib/manual-journal-actions";

const payload: CreateJournalRequest = {
  company_id: "company",
  journal_date: "2026-11-17",
  reference_number: "REF",
  lines: [
    { account_id: "expense", description: "Expense", debit: "10.00", credit: "0", dimensions: {} },
    { account_id: "cash", description: "Cash", debit: "0", credit: "10.00", dimensions: {} },
  ],
};
const mutation = (state: JournalMutationResult["state"], version: number): JournalMutationResult => ({
  id: "journal",
  state,
  version,
  audit_event_id: "event",
  ledger_journal_id: null,
  entry_number: null,
  replayed: false,
});
const detail = (approve = true, override = false): JournalDetail => ({
  id: "journal",
  company_id: "company",
  display_number: "MJ-001",
  journal_date: payload.journal_date,
  reference_number: "REF",
  source: "manual",
  source_label: "Manual Journal",
  state: "submitted",
  currency: "USD",
  total: "10.00",
  version: 2,
  maker_user_id: "maker",
  submitted_at: null,
  can_open_owner_workflow: true,
  base_decimal_places: 2,
  approval_note: null,
  rejection_reason: null,
  posted_entry_number: null,
  lines: [],
  events: [],
  capabilities: {
    update: false,
    delete_draft: false,
    submit: false,
    approve,
    reject: false,
    reverse: false,
    self_approval_required: true,
    super_admin_override_available: override,
  },
});
function setup() {
  const client = {
    create: vi.fn(async () => mutation("draft", 1)),
    update: vi.fn(async () => mutation("draft", 2)),
    submit: vi.fn(async () => mutation("submitted", 2)),
    detail: vi.fn(async () => detail()),
    decide: vi.fn(async () => mutation("posted", 3)),
  };
  const actions = new ManualJournalActions();
  const input = {
    client,
    csrfToken: () => "csrf",
    initial: null,
    payload,
    intent: "approve" as const,
    confirmed: true,
    reason: "",
  };
  return { client, actions, input };
}
describe("Manual Journal action progression", () => {
  it("saves a draft without submission or posting", async () => {
    const { client, actions, input } = setup();
    expect(await actions.run({ ...input, intent: "save" })).toMatchObject({ state: "draft", version: 1 });
    expect(client.submit).not.toHaveBeenCalled();
    expect(client.decide).not.toHaveBeenCalled();
  });
  it("saves current edits and carries each returned version through approval", async () => {
    const { client, actions, input } = setup();
    const initial = { ...detail(), state: "draft" as const, version: 4 };
    client.update.mockResolvedValue(mutation("draft", 5));
    client.submit.mockResolvedValue(mutation("submitted", 6));
    client.detail.mockResolvedValue({ ...detail(), version: 6 });
    await actions.run({ ...input, initial, payload: { ...payload, reference_number: "Edited" } });
    expect(client.create).not.toHaveBeenCalled();
    expect(client.update).toHaveBeenCalledWith(
      "journal",
      expect.objectContaining({ expected_version: 4, reference_number: "Edited" }),
      "csrf",
      expect.any(String),
    );
    expect(client.submit).toHaveBeenCalledWith("journal", { expected_version: 5 }, "csrf", expect.any(String));
    expect(client.decide).toHaveBeenCalledWith(
      "journal",
      { expected_version: 6, action: "post", confirmed: true },
      "csrf",
      expect.any(String),
    );
  });
  it("leaves a preparer's submission awaiting approval when the server denies self-approval", async () => {
    const { client, actions, input } = setup();
    client.detail.mockResolvedValue(detail(false));
    expect(await actions.run({ ...input, confirmed: false })).toMatchObject({ state: "submitted" });
    expect(client.decide).not.toHaveBeenCalled();
  });
  it("requires explicit final review before posting", async () => {
    const { client, actions, input } = setup();
    await expect(actions.run({ ...input, confirmed: false })).rejects.toThrow("Confirm the final review");
    expect(client.decide).not.toHaveBeenCalled();
  });
  it("requires and transmits the authorized administrator override reason", async () => {
    const { client, actions, input } = setup();
    client.detail.mockResolvedValue(detail(true, true));
    await expect(actions.run(input)).rejects.toThrow("override reason");
    expect(client.decide).not.toHaveBeenCalled();
    await actions.run({ ...input, reason: " Reviewed override " });
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(client.decide).toHaveBeenCalledWith(
      "journal",
      expect.objectContaining({ reason: "Reviewed override" }),
      "csrf",
      expect.any(String),
    );
  });
  it("reuses the create request identity after an uncertain response", async () => {
    const { client, actions, input } = setup();
    client.create.mockRejectedValueOnce(new Error("Response lost"));
    await expect(actions.run(input)).rejects.toThrow();
    await actions.run(input);
    expect(client.create.mock.calls[0]).toEqual(client.create.mock.calls[1]);
    expect(client.submit).toHaveBeenCalledTimes(1);
  });
  it("resumes failed submission without saving a second draft", async () => {
    const { client, actions, input } = setup();
    client.submit.mockRejectedValueOnce(new Error("Response lost"));
    await expect(actions.run(input)).rejects.toThrow();
    await actions.run(input);
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.update).not.toHaveBeenCalled();
    expect(client.submit.mock.calls[0]).toEqual(client.submit.mock.calls[1]);
  });
  it("reuses a failed approval identity and never resubmits", async () => {
    const { client, actions, input } = setup();
    client.decide.mockRejectedValueOnce(new Error("Response lost"));
    await expect(actions.run(input)).rejects.toThrow();
    await actions.run(input);
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(client.decide.mock.calls[0]).toEqual(client.decide.mock.calls[1]);
  });
  it("recognizes a posted journal when approval succeeded but its response was lost", async () => {
    const { client, actions, input } = setup();
    client.decide.mockRejectedValueOnce(new Error("Response lost"));
    await expect(actions.run(input)).rejects.toThrow();
    client.detail.mockResolvedValue({ ...detail(), state: "posted", version: 3 });
    expect(await actions.run(input)).toMatchObject({ state: "posted" });
    expect(client.decide).toHaveBeenCalledTimes(1);
  });
  it("resumes a failed detail read at the submitted journal", async () => {
    const { client, actions, input } = setup();
    client.detail.mockRejectedValueOnce(new Error("Read failed"));
    await expect(actions.run(input)).rejects.toThrow();
    await actions.run(input);
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.submit).toHaveBeenCalledTimes(1);
  });
  it("ignores simultaneous activation while a request is running", async () => {
    const { client, actions, input } = setup();
    let finish: (result: JournalMutationResult) => void = () => {
      throw new Error("Not initialized");
    };
    client.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = actions.run(input);
    expect(await actions.run(input)).toBeNull();
    finish(mutation("draft", 1));
    await first;
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.decide).toHaveBeenCalledTimes(1);
  });
  it("does not approve a newer revision that has not received final review", async () => {
    const { client, actions, input } = setup();
    client.detail.mockResolvedValue({ ...detail(), version: 4 });
    await expect(actions.run(input)).rejects.toThrow("new final review");
    await expect(actions.run(input)).rejects.toThrow("new final review");
    expect(client.decide).not.toHaveBeenCalled();
  });
});
