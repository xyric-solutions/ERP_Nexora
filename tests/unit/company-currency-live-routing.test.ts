import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const prototypeContent = new URL("../../app/shell/prototype-content.tsx", import.meta.url);

describe("Company currency live routing", () => {
  it("routes Finance and Company Setup currency pages to the API-backed workspace", () => {
    const source = readFileSync(prototypeContent, "utf8");

    expect(source).toContain('from "@/features/finance/views/company-currencies-workspace"');
    expect(source).toContain('context.moduleId === "finance" && context.pageId === "currencies-fx"');
    expect(source).toContain('context.moduleId === "configuration" && context.pageId === "company-fiscal-currency"');
  });
});
