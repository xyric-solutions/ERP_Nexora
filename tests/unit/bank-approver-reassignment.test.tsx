// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BankTransferDetail } from "@nexora/contracts";

const harness = vi.hoisted(() => ({
  reassign: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: { reassignBankTransferApprover: harness.reassign },
    csrfToken: () => "csrf-token",
    session: { user: { id: "admin-1" } },
  }),
}));
vi.mock("@/shared/ui/action-feedback", () => ({ useActionFeedback: () => harness.notify }));
vi.mock("@/features/banking/components/bank-workflow-controls", () => ({
  WorkflowSelect: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange("approver-2")}>
      Choose reassigned approver
    </button>
  ),
}));

import { BankApproverReassignment } from "../../app/features/banking/components/bank-approver-reassignment.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("BankApproverReassignment", () => {
  beforeEach(() => {
    harness.reassign.mockResolvedValue({});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("routes a versioned Transfer reassignment through the generated API", async () => {
    const updated = vi.fn(async () => undefined);
    await act(async () =>
      root.render(
        <BankApproverReassignment
          transaction="transfers"
          record={
            {
              id: "transfer-1",
              company_id: "company-1",
              version: 4,
              approver_user_id: "approver-1",
              approver_name: "First Approver",
              approver_history: [],
              can_reassign_approver: true,
            } as BankTransferDetail
          }
          disabled={false}
          onBusyChange={vi.fn()}
          onUpdated={updated}
        />,
      ),
    );
    const click = async (label: string) => {
      const button = [...container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      await act(async () => button?.click());
    };
    await click("Reassign approver");
    await click("Choose reassigned approver");
    await click("Confirm reassignment");
    expect(harness.reassign).toHaveBeenCalledWith(
      "transfer-1",
      { approver_user_id: "approver-2", expected_version: 4 },
      "csrf-token",
      expect.stringMatching(/^bank-reassign-/),
    );
    expect(updated).toHaveBeenCalled();
    expect(harness.notify).toHaveBeenCalledWith(expect.stringContaining("has not been approved or posted"));
  });
});
