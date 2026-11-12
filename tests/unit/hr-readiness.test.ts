import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { createHrFoundationReadiness } from "../../server/api/src/modules/hr/readiness.js";

describe("HR production readiness", () => {
  it("requires the current HR schema and automatic record-code counter", async () => {
    const query = vi.fn(async () => ({ rows: [{ available: false }] }));
    const check = createHrFoundationReadiness({ query } as never);

    await expect(check()).rejects.toThrow("current HR foundation migration");
    expect(query.mock.calls[0]?.[0]).toContain("hr_record_code_counter");
    expect(query.mock.calls[0]?.[0]).toContain("module_name='hr' and version>=133");
  });

  it("passes only when every required relation and migration is available", async () => {
    const query = vi.fn(async () => ({ rows: [{ available: true }] }));

    await expect(createHrFoundationReadiness({ query } as never)()).resolves.toBeUndefined();
  });

  it("wires the HR readiness check in production", () => {
    const serverPath = fileURLToPath(new URL("../../server/api/src/server.ts", import.meta.url));
    const source = readFileSync(serverPath, "utf8");

    expect(source).toContain("hr_foundation: createHrFoundationReadiness(pool)");
  });
});
