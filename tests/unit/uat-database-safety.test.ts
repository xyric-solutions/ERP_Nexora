import { describe, expect, it } from "vitest";

import { isExplicitlyNamedLocalUatDatabase } from "../../scripts/uat-database-safety.js";

describe("UAT database provisioning safety", () => {
  it.each([
    "postgresql://nexora@127.0.0.1:55433/nexora_postmerge_service",
    "postgresql://nexora@localhost:55433/nexora_uat",
    "postgresql://nexora@[::1]:55433/nexora_isolated",
  ])("allows an explicitly named local database: %s", (databaseUrl) => {
    expect(isExplicitlyNamedLocalUatDatabase(databaseUrl)).toBe(true);
  });

  it.each([
    "postgresql://nexora@database.example/nexora_postmerge_service",
    "postgresql://nexora@127.0.0.1:55433/nexora_production",
    "not-a-database-url",
  ])("rejects a remote, generic, or invalid database: %s", (databaseUrl) => {
    expect(isExplicitlyNamedLocalUatDatabase(databaseUrl)).toBe(false);
  });
});
