import { afterEach, describe, expect, it, vi } from "vitest";

import { apiBaseUrl } from "../../app/shared/config/runtime.js";

const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiBaseUrl === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
});

describe("web runtime configuration", () => {
  it("keeps an explicitly configured API base URL authoritative", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.nexora.example";
    vi.stubGlobal("window", { location: { protocol: "http:", hostname: "127.0.0.1" } });

    expect(apiBaseUrl()).toBe("https://api.nexora.example");
  });

  it.each(["127.0.0.1", "localhost"])("uses the browser host for local API requests from %s", (hostname) => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    vi.stubGlobal("window", { location: { protocol: "http:", hostname } });

    expect(apiBaseUrl()).toBe(`http://${hostname}:4000`);
  });

  it("preserves the browser protocol when deriving the API origin", () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    vi.stubGlobal("window", { location: { protocol: "https:", hostname: "erp.nexora.example" } });

    expect(apiBaseUrl()).toBe("https://erp.nexora.example:4000");
  });

  it("uses the server-side fallback when no browser or explicit value is available", () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    vi.stubGlobal("window", undefined);

    expect(apiBaseUrl()).toBe("http://localhost:4000");
  });
});
