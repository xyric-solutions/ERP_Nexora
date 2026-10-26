import { afterEach, describe, it, expect, vi } from "vitest";
import { NexoraApiClient } from "../../app/lib/api/generated.js";
afterEach(() => vi.unstubAllGlobals());
describe("Shared expired-session recovery", () => {
  it("notifies the session boundary when a protected company request returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: "INVALID_SESSION", detail: "Session expired" }), { status: 401 }),
        ),
    );
    const expired = vi.fn(),
      api = new NexoraApiClient("http://127.0.0.1:4000", 20000, expired);
    await expect(api.listHrCompanies()).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
  });
  it("does not clear the current session on permission or infrastructure failures", async () => {
    for (const status of [403, 500]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "API_REQUEST_FAILED" }), { status })),
      );
      const expired = vi.fn(),
        api = new NexoraApiClient("http://127.0.0.1:4000", 20000, expired);
      await expect(api.listHrCompanies()).rejects.toMatchObject({ status });
      expect(expired).not.toHaveBeenCalled();
    }
  });
  it("keeps invalid login credentials as a login error instead of a session-expiry event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "INVALID_CREDENTIALS" }), { status: 401 })),
    );
    const expired = vi.fn(),
      api = new NexoraApiClient("http://127.0.0.1:4000", 20000, expired);
    await expect(
      api.loginWithPassword({ identifier: "fixture", password: "wrong", remember_me: false } as Parameters<
        typeof api.loginWithPassword
      >[0]),
    ).rejects.toMatchObject({ status: 401 });
    expect(expired).not.toHaveBeenCalled();
  });
  it("ignores an old request's 401 after a newer successful login", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => pending)
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: "authenticated" }), { status: 200 })),
    );
    const expired = vi.fn(),
      api = new NexoraApiClient("http://127.0.0.1:4000", 20000, expired),
      old = api.listHrCompanies();
    await api.loginWithPassword({ identifier: "fixture", password: "fixture" } as Parameters<
      typeof api.loginWithPassword
    >[0]);
    finish(new Response(JSON.stringify({ code: "INVALID_SESSION" }), { status: 401 }));
    await expect(old).rejects.toMatchObject({ status: 401 });
    expect(expired).not.toHaveBeenCalled();
  });
});
