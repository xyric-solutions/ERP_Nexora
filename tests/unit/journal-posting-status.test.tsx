// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalPostingEligibility } from "@nexora/contracts";
import {
  JournalPostingStatus,
  useJournalPostingEligibility,
} from "../../app/features/finance/components/journal-posting-status";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const open: JournalPostingEligibility = {
  company_id: "company",
  journal_date: "2026-11-17",
  eligible: true,
  blocker: null,
  period: null,
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("Journal posting status", () => {
  it("makes submitted cash effects explicit and hides unposted guidance after posting", () => {
    act(() => root.render(<JournalPostingStatus state="submitted" eligibility={open} />));
    expect(container.textContent).toContain("Awaiting approval");
    expect(container.textContent).toContain("has not changed ledger or Bank balances");
    act(() => root.render(<JournalPostingStatus state="posted" />));
    expect(container.textContent).toBe("");
  });

  it("shows the server's period blocker", () => {
    act(() =>
      root.render(
        <JournalPostingStatus
          state="draft"
          eligibility={{ ...open, eligible: false, blocker: { code: "closed", message: "November is Soft Closed." } }}
        />,
      ),
    );
    expect(container.textContent).toContain("November is Soft Closed.");
  });

  it("ignores a late response for a different company or date", async () => {
    let finishOld: (value: JournalPostingEligibility) => void = () => {
      throw new Error("Not initialized");
    };
    const client = {
      postingEligibility: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<JournalPostingEligibility>((resolve) => {
              finishOld = resolve;
            }),
        )
        .mockResolvedValue({
          ...open,
          company_id: "other",
          journal_date: "2026-12-01",
          eligible: false,
          blocker: { code: "closed", message: "December is Locked." },
        }),
    };
    function Probe({ company, date }: { company: string; date: string }) {
      const result = useJournalPostingEligibility(client, company, date, true);
      return <JournalPostingStatus state="draft" {...result} />;
    }
    act(() => root.render(<Probe company="company" date="2026-11-17" />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(151);
    });
    act(() => root.render(<Probe company="other" date="2026-12-01" />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(151);
    });
    await act(async () => finishOld(open));
    expect(container.textContent).toContain("December is Locked.");
    expect(container.textContent).not.toContain("Checking");
  });

  it("does not present a failed read as posting eligibility", async () => {
    const client = { postingEligibility: vi.fn().mockRejectedValue(new Error("Unavailable")) };
    function Probe() {
      return (
        <JournalPostingStatus state="draft" {...useJournalPostingEligibility(client, "company", "2026-11-17", true)} />
      );
    }
    act(() => root.render(<Probe />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(151);
    });
    expect(container.textContent).toContain("posting period could not be checked");
    expect(container.textContent).not.toContain("Checking");
  });
});
