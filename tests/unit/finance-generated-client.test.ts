import { afterEach, describe, expect, it, vi } from "vitest";

import { NexoraApiClient } from "../../app/lib/api/generated.js";

afterEach(() => vi.unstubAllGlobals());

describe("generated Finance Nominal client", () => {
  function mockFetch() {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("uses versioned Finance reads with encoded persisted nominal IDs", async () => {
    const fetchMock = mockFetch();
    const api = new NexoraApiClient("http://127.0.0.1:4000");
    await api.listFinanceNominalOptions("");
    await api.listFinanceNominals("?company_id=company-a&limit=25");
    await api.getFinanceNominal("nominal/id with space");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://127.0.0.1:4000/api/v1/finance/nominals/options",
      "http://127.0.0.1:4000/api/v1/finance/nominals?company_id=company-a&limit=25",
      "http://127.0.0.1:4000/api/v1/finance/nominals/nominal%2Fid%20with%20space",
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === "include")).toBe(true);
  });

  it("uses POST for draft creation with CSRF and idempotency headers", async () => {
    const fetchMock = mockFetch();
    const api = new NexoraApiClient("http://127.0.0.1:4000");
    const payload = { company_id: "a", category_id: "b", section_id: "c", name: "Operating", currency: "USD" };
    await api.createFinanceNominal(payload, "csrf", "create-key");
    expect(fetchMock.mock.calls[0]).toEqual([
      new URL("http://127.0.0.1:4000/api/v1/finance/nominals"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify(payload),
        headers: expect.objectContaining({ "x-csrf-token": "csrf", "idempotency-key": "create-key" }),
      }),
    ]);
  });

  it("uses PATCH for edits and includes version safeguards on every existing-record mutation", async () => {
    const fetchMock = mockFetch();
    const api = new NexoraApiClient("http://127.0.0.1:4000");
    await api.updateFinanceNominal("nominal/a", { expected_version: 1, description: null }, "csrf", "edit");
    await api.submitFinanceNominal("nominal/a", { expected_version: 2, reason: "Ready" }, "csrf", "submit");
    await api.decideFinanceNominal(
      "nominal/a",
      { expected_version: 3, action: "approve", reason: "Verified" },
      "csrf",
      "decision",
    );
    await api.changeFinanceNominalStatus(
      "nominal/a",
      { expected_version: 4, action: "deactivate", reason: "Unused" },
      "csrf",
      "status",
    );
    expect(fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), method: init?.method }))).toEqual([
      { url: "http://127.0.0.1:4000/api/v1/finance/nominals/nominal%2Fa", method: "PATCH" },
      { url: "http://127.0.0.1:4000/api/v1/finance/nominals/nominal%2Fa/submit", method: "POST" },
      { url: "http://127.0.0.1:4000/api/v1/finance/nominals/nominal%2Fa/decision", method: "POST" },
      { url: "http://127.0.0.1:4000/api/v1/finance/nominals/nominal%2Fa/status", method: "POST" },
    ]);
    fetchMock.mock.calls.forEach(([, init], index) => {
      expect(init?.headers).toMatchObject({
        "x-csrf-token": "csrf",
        "if-match": `"${index + 1}"`,
        "idempotency-key": ["edit", "submit", "decision", "status"][index],
      });
    });
  });
});
