// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  api: {
    getBankTransfer: vi.fn(),
    decideBankTransfer: vi.fn(),
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({
    api: harness.api,
    csrfToken: () => "csrf-token",
    loading: false,
    session: {
      tenant_id: "tenant-1",
      user: {
        id: "shoaib-1",
        email: "shoaib@example.test",
        roles: ["super_administrator"],
        permissions: ["banking.transfer.read", "banking.transfer.approve", "platform.approval.override"],
      },
    },
  }),
}));

import { BankingTransferDetail } from "../../app/features/banking/views/banking-transfer-detail.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
  for (let index = 0; index < 4; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe("BankingTransferDetail", () => {
  beforeEach(() => {
    harness.api.getBankTransfer.mockResolvedValue({
      id: "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
      company_id: "company-1",
      reference: "BT-2026-000001",
      state: "submitted",
      version: 2,
      posting_date: "2026-10-22",
      value_date: null,
      source_totals: [{ currency: "USD", amount: "250.00" }],
      base_currency: "USD",
      base_total: "250.00",
      line_count: 1,
      details_summary: "Reserve funding",
      created_at: "2026-10-22T09:00:00.000Z",
      project_id: null,
      project_name: null,
      location_id: null,
      location_name: null,
      approver_user_id: "shoaib-1",
      approver_name: "Shoaib",
      delegated_decision_id: null,
      delegated_self_approval_allowed: false,
      can_reassign_approver: false,
      approver_history: [],
      assigned_decision_allowed: true,
      lines: [],
      timeline: [],
      accounting_preview: { base_currency: "USD", lines: [], debit_total: "250.00", credit_total: "250.00" },
      created_by: "shoaib-1",
      submitted_by: "shoaib-1",
      approved_by: null,
      rejected_by: null,
      posted_by: null,
      reversed_by: null,
      submitted_at: "2026-10-22T09:05:00.000Z",
      approved_at: null,
      rejected_at: null,
      posted_at: null,
      reversed_at: null,
      accounting_event_id: null,
      journal_id: null,
      journal_entry_number: null,
      reversal_accounting_event_id: null,
      reversal_journal_id: null,
      reversal_journal_entry_number: null,
      self_decision_requires_override: true,
      super_admin_override_allowed: true,
    });
    harness.api.decideBankTransfer.mockResolvedValue({
      id: "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
      reference: "BT-2026-000001",
      state: "approved",
      version: 3,
      audit_event_id: "audit-3",
      replayed: false,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("shows the waiting status and closes after an explicit governed self-approval", async () => {
    const onBack = vi.fn();
    await act(async () =>
      root.render(
        <BankingTransferDetail
          transferId="bank-transfer-123e4567-e89b-42d3-a456-426614174000"
          onBack={onBack}
          onEdit={vi.fn()}
        />,
      ),
    );
    await settle();

    expect(container.textContent).toContain("Waiting for approval");
    const approve = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Approve & Close",
    );
    expect(approve).toBeDefined();
    await act(async () => approve?.click());
    await settle();

    expect(harness.api.decideBankTransfer).toHaveBeenCalledWith(
      "bank-transfer-123e4567-e89b-42d3-a456-426614174000",
      { action: "approve", expected_version: 2 },
      "csrf-token",
      expect.stringMatching(/^web-bank-transfer-approve-/),
    );
    expect(onBack).toHaveBeenCalledOnce();
  });
});
