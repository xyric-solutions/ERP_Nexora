import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const bankingModuleRoot = fileURLToPath(
  new URL("../../server/api/src/modules/banking/reconciliations/", import.meta.url),
);

function repositorySource(path: string): string {
  return readFileSync(`${repositoryRoot}/${path}`, "utf8");
}

describe("Bank Reconciliation service boundary", () => {
  it("has server-owned reconciliation and deterministic matching authorities", () => {
    expect(existsSync(`${bankingModuleRoot}/service.ts`), "reconciliation service is not implemented").toBe(true);
    expect(existsSync(`${bankingModuleRoot}/matching.ts`), "deterministic matching authority is not implemented").toBe(
      true,
    );
  });

  it("does not retain fixture fallbacks on the live statement and reconciliation routes", () => {
    const liveSources = [
      repositorySource("app/features/banking/views/banking-statement.tsx"),
      repositorySource("app/features/banking/views/banking-reconciliation-register.tsx"),
      repositorySource("app/features/banking/views/banking-reconciliation.tsx"),
      repositorySource("app/features/banking/views/banking-reconciliation-worksheet.tsx"),
    ].join("\n");

    expect(
      liveSources.includes("banking-statement-data"),
      "live statement routes still import statement fixtures",
    ).toBe(false);
    expect(
      liveSources.includes("banking-reconciliation-data"),
      "live reconciliation routes still import reconciliation fixtures",
    ).toBe(false);
  });
});
