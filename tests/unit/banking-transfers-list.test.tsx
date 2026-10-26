// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  api: {
    listBankingCompanies: vi.fn(),
    listBankTransfers: vi.fn(),
  },
  session: {
    tenant_id: "tenant-1",
    user: {
      id: "reader-1",
      email: "reader@example.test",
      roles: ["transfer_reader"],
      permissions: ["banking.transfer.read", "banking.transfer.create"],
    },
  },
}));

vi.mock("@/lib/session/session-provider", () => ({
  useSession: () => ({ api: harness.api, session: harness.session, loading: false }),
}));

import { BankingTransfers } from "../../app/features/banking/views/banking-transfers.js";

let container: HTMLDivElement;
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function row(id: string, reference: string, state: "draft" | "submitted" = "draft") {
  return {
    id,
    reference,
    posting_date: "2026-10-22",
    source_bank_summary: "Operating USD",
    destination_bank_summary: "Reserve USD",
    source_totals: [{ currency: "USD", amount: "100.00" }],
    base_currency: "USD",
    base_total: "100.00",
    line_count: 1,
    state,
  };
}

async function settle() {
  for (let index = 0; index < 4; index += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe("BankingTransfers", () => {
  beforeEach(() => {
    harness.api.listBankingCompanies.mockResolvedValue({
      items: [{ id: "company-1", code: "C01", name: "Nexora" }],
    });
    harness.api.listBankTransfers
      .mockResolvedValueOnce({ items: [row("transfer-1", "TRF-001")], next_cursor: "cursor-2" })
      .mockResolvedValueOnce({ items: [row("transfer-2", "TRF-002")], next_cursor: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it("appends the next bounded page without replacing the current results", async () => {
    await act(async () => root.render(<BankingTransfers onCreate={vi.fn()} onOpen={vi.fn()} />));
    await settle();
    expect(container.textContent).toContain("TRF-001");
    const loadMore = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Load more",
    );
    expect(loadMore).toBeDefined();
    await act(async () => loadMore?.click());
    await settle();
    expect(container.textContent).toContain("TRF-001");
    expect(container.textContent).toContain("TRF-002");
    expect(harness.api.listBankTransfers).toHaveBeenLastCalledWith(expect.stringContaining("cursor=cursor-2"));
    expect(container.textContent).not.toContain("Load more");
  });

  it("shows submitted Transfers as waiting for approval", async () => {
    harness.api.listBankTransfers.mockReset().mockResolvedValue({
      items: [row("transfer-1", "TRF-001", "submitted")],
      next_cursor: null,
    });
    await act(async () => root.render(<BankingTransfers onCreate={vi.fn()} onOpen={vi.fn()} />));
    await settle();
    expect(container.textContent).toContain("Waiting for approval");
    expect(container.textContent).not.toContain(">submitted<");
  });
});
