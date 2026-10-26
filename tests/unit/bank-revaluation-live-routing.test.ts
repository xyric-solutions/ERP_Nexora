import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const prototypeContent = new URL("../../app/shell/prototype-content.tsx", import.meta.url);

describe("Bank Revaluation live routing", () => {
  it("routes Revaluation to a dedicated API-backed register/form instead of the generic prototype transaction form", () => {
    const source = readFileSync(prototypeContent, "utf8");

    expect(
      source.includes('revaluation: "bank-revaluation"'),
      "Revaluation must not remain in the generic prototype transaction map",
    ).toBe(false);
    expect(source).toMatch(/import \{ BankingRevaluationWorkspace/u);
    expect(source).toMatch(/context\.pageId === "revaluation"/u);
  });
});
